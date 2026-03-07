import { Router, static as expressStatic } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { getStorageProvider, isHostedMode } from '../storage/index.js';
import type { GatewayManager } from '../discord/gatewayManager.js';
import type { WsServer } from '../ws/server.js';
import { processDiscordMessage } from '../utils/messageProcessor.js';
import { processTelegramMessage } from '../telegram/messageProcessor.js';
import type { FrontendMessage, SoundType, ChannelRef } from '../discord/types.js';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import type { TelegramClientManager } from '../telegram/clientManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = join(__dirname, '../../data/sounds');
if (!existsSync(SOUNDS_DIR)) mkdirSync(SOUNDS_DIR, { recursive: true });

function safeError(err: any, fallback: string): string {
  if (!isHostedMode()) return err?.message ?? fallback;
  console.error(`[API] ${fallback}:`, err?.message ?? err);
  return fallback;
}

const soundFileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
  cb(null, allowed.includes(extname(file.originalname).toLowerCase()));
};

const upload = multer({
  storage: multer.diskStorage({
    destination: SOUNDS_DIR,
    filename: (_req, file, cb) => {
      const soundType = _req.params.soundType as string;
      cb(null, `${soundType}${extname(file.originalname)}`);
    },
  }),
  fileFilter: soundFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

const channelSoundUpload = multer({
  storage: multer.diskStorage({
    destination: SOUNDS_DIR,
    filename: (_req, file, cb) => {
      const channelId = _req.params.channelId as string;
      cb(null, `ch_${channelId}${extname(file.originalname)}`);
    },
  }),
  fileFilter: soundFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

function getUserId(req: any): string {
  return req.userId ?? 'local';
}

export function createRouter(wsServer: WsServer): Router {
  const router = Router();
  const storage = getStorageProvider();

  async function requireGateway(req: any, res: any): Promise<GatewayManager | null> {
    const { getUserGateway, connectGateway } = await import('../index.js');
    const userId = getUserId(req);
    let gw = getUserGateway(userId);

    if (!gw) {
      const tokens = await storage.getTokens(userId);
      if (tokens.length > 0) {
        gw = connectGateway(tokens, wsServer, userId);
      }
    }

    if (!gw) {
      res.status(503).json({ error: 'Discord not connected. Please configure your token first.' });
      return null;
    }
    return gw;
  }

  // Pending Telegram auth sessions (phone -> client, kept alive until verify completes)
  const pendingTelegramAuth = new Map<string, { client: TelegramClient; phoneCodeHash: string; phone: string }>();

  async function requireTelegramManager(req: any, res: any): Promise<TelegramClientManager | null> {
    const { getUserTelegram, connectTelegram } = await import('../index.js');
    const userId = getUserId(req);
    let tg = getUserTelegram(userId);

    if (!tg) {
      const config = await storage.getConfig(userId);
      if (config.telegramSessions?.length && config.telegramApiId && config.telegramApiHash) {
        tg = await connectTelegram(
          parseInt(config.telegramApiId),
          config.telegramApiHash,
          config.telegramSessions,
          wsServer,
          userId,
        );
      }
    }

    if (!tg) {
      res.status(503).json({ error: 'Telegram not connected. Please configure Telegram first.' });
      return null;
    }
    return tg;
  }

  // --- Auth / Token Management ---

  router.get('/auth/status', async (req, res) => {
    const userId = getUserId(req);
    const tokens = await storage.getTokens(userId);
    const { getUserGateway, getUserTelegram } = await import('../index.js');
    const gw = getUserGateway(userId);
    const config = await storage.getConfig(userId);
    const tg = getUserTelegram(userId);
    res.json({
      configured: tokens.length > 0,
      connected: gw !== null,
      telegramConfigured: (config.telegramSessions?.length ?? 0) > 0,
      telegramConnected: tg !== null && tg.isConnected(),
    });
  });

  router.get('/auth/profile', async (req, res) => {
    if (!isHostedMode()) {
      return res.json({ email: null, provider: 'local', createdAt: null });
    }

    const userId = getUserId(req);
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return res.status(500).json({ error: 'Server misconfigured' });

    try {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await sb.auth.admin.getUserById(userId);
      if (error || !data.user) return res.status(404).json({ error: 'User not found' });

      const user = data.user;
      const provider = user.app_metadata?.provider ?? 'email';
      const discordMeta = user.user_metadata ?? {};

      res.json({
        id: user.id,
        email: user.email ?? null,
        provider,
        discordUsername: provider === 'discord' ? (discordMeta.full_name ?? discordMeta.name ?? null) : null,
        discordAvatar: provider === 'discord' ? (discordMeta.avatar_url ?? null) : null,
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to fetch profile') });
    }
  });

  router.post('/auth/token', async (req, res) => {
    const userId = getUserId(req);
    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'A valid Discord token is required.' });
    }

    const tokens = token.includes(',')
      ? token.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [token.trim()];

    try {
      await storage.setTokens(userId, tokens);
      const { connectGateway } = await import('../index.js');
      connectGateway(tokens, wsServer, userId);
      res.json({ success: true, tokenCount: tokens.length });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to save token or connect') });
    }
  });

  router.post('/auth/disconnect', async (req, res) => {
    const userId = getUserId(req);
    await storage.setTokens(userId, []);
    const { disconnectGateway } = await import('../index.js');
    disconnectGateway(userId);
    res.json({ success: true });
  });

  router.get('/auth/tokens', async (req, res) => {
    const userId = getUserId(req);
    const tokens = await storage.getTokens(userId);
    const masked = tokens.map((t, index) => {
      const len = t.length;
      const visible = Math.min(4, Math.floor(len / 4));
      const maskedToken = len <= 8
        ? '*'.repeat(len)
        : t.slice(0, visible) + '*'.repeat(Math.max(4, len - visible * 2)) + t.slice(-visible);
      return { index, masked: maskedToken };
    });
    res.json({ tokens: masked, count: tokens.length });
  });

  router.post('/auth/tokens/add', async (req, res) => {
    const userId = getUserId(req);
    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'A valid Discord token is required.' });
    }
    const existing = await storage.getTokens(userId);
    const trimmed = token.trim();
    if (existing.includes(trimmed)) {
      return res.status(409).json({ error: 'This token is already configured.' });
    }
    const updated = [...existing, trimmed];
    await storage.setTokens(userId, updated);

    try {
      const { connectGateway } = await import('../index.js');
      connectGateway(updated, wsServer, userId);
      res.json({ success: true, tokenCount: updated.length });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to connect') });
    }
  });

  router.delete('/auth/tokens/:index', async (req, res) => {
    const userId = getUserId(req);
    const index = parseInt(req.params.index, 10);
    const existing = await storage.getTokens(userId);
    if (isNaN(index) || index < 0 || index >= existing.length) {
      return res.status(400).json({ error: 'Invalid token index.' });
    }
    const updated = existing.filter((_, i) => i !== index);
    await storage.setTokens(userId, updated);

    try {
      if (updated.length > 0) {
        const { connectGateway } = await import('../index.js');
        connectGateway(updated, wsServer, userId);
      } else {
        const { disconnectGateway } = await import('../index.js');
        disconnectGateway(userId);
      }
      res.json({ success: true, tokenCount: updated.length });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to reconnect') });
    }
  });

  // --- Telegram Auth ---

  router.post('/auth/telegram/start', async (req, res) => {
    const userId = getUserId(req);
    const { apiId, apiHash, phoneNumber } = req.body;

    if (!apiId || !apiHash || !phoneNumber) {
      return res.status(400).json({ error: 'apiId, apiHash, and phoneNumber are required.' });
    }

    try {
      const numericApiId = parseInt(apiId, 10);
      if (isNaN(numericApiId)) {
        return res.status(400).json({ error: 'apiId must be a number.' });
      }

      const session = new StringSession('');
      const client = new TelegramClient(session, numericApiId, apiHash, {
        connectionRetries: 5,
      });

      await client.connect();

      const result = await client.sendCode(
        { apiId: numericApiId, apiHash },
        phoneNumber,
      );

      pendingTelegramAuth.set(userId, {
        client,
        phoneCodeHash: result.phoneCodeHash,
        phone: phoneNumber,
      });

      // Auto-cleanup after 5 minutes if not completed
      setTimeout(() => {
        const p = pendingTelegramAuth.get(userId);
        if (p && p.phone === phoneNumber) {
          p.client.disconnect().catch(() => {});
          pendingTelegramAuth.delete(userId);
        }
      }, 5 * 60 * 1000);

      await storage.updateConfig(userId, {
        telegramApiId: String(numericApiId),
        telegramApiHash: apiHash,
      });

      res.json({ success: true, phoneCodeHash: result.phoneCodeHash });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to start Telegram auth') });
    }
  });

  router.post('/auth/telegram/verify', async (req, res) => {
    const userId = getUserId(req);
    const { phoneCode, password } = req.body;

    const pending = pendingTelegramAuth.get(userId);
    if (!pending) {
      return res.status(400).json({ error: 'No pending Telegram auth. Call /auth/telegram/start first.' });
    }

    if (!phoneCode) {
      return res.status(400).json({ error: 'phoneCode is required.' });
    }

    try {
      const config = await storage.getConfig(userId);
      const numericApiId = parseInt(config.telegramApiId ?? '0', 10);
      const apiHash = config.telegramApiHash ?? '';

      try {
        await pending.client.invoke(
          new (await import('telegram/tl/index.js')).Api.auth.SignIn({
            phoneNumber: pending.phone,
            phoneCodeHash: pending.phoneCodeHash,
            phoneCode,
          }),
        );
      } catch (err: any) {
        if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          if (!password) {
            return res.json({ success: false, needs2FA: true });
          }
          await pending.client.signInWithPassword(
            { apiId: numericApiId, apiHash },
            { password: () => password, onError: (err) => { throw err; } },
          );
        } else {
          throw err;
        }
      }

      const sessionString = pending.client.session.save() as unknown as string;
      pendingTelegramAuth.delete(userId);

      const existingSessions = config.telegramSessions ?? [];
      const updatedSessions = [...existingSessions, sessionString];
      await storage.updateConfig(userId, { telegramSessions: updatedSessions });

      // Connect the telegram client
      const { connectTelegram } = await import('../index.js');
      await connectTelegram(numericApiId, apiHash, updatedSessions, wsServer, userId);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to verify Telegram code') });
    }
  });

  router.post('/auth/telegram/2fa', async (req, res) => {
    const userId = getUserId(req);
    const { password } = req.body;

    const pending = pendingTelegramAuth.get(userId);
    if (!pending) {
      return res.status(400).json({ error: 'No pending Telegram auth.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'password is required.' });
    }

    try {
      const config = await storage.getConfig(userId);
      const numericApiId = parseInt(config.telegramApiId ?? '0', 10);
      const apiHash = config.telegramApiHash ?? '';

      await pending.client.signInWithPassword(
        { apiId: numericApiId, apiHash },
        { password: () => password, onError: (err) => { throw err; } },
      );

      const sessionString = pending.client.session.save() as unknown as string;
      pendingTelegramAuth.delete(userId);

      const existingSessions = config.telegramSessions ?? [];
      const updatedSessions = [...existingSessions, sessionString];
      await storage.updateConfig(userId, { telegramSessions: updatedSessions });

      const { connectTelegram } = await import('../index.js');
      await connectTelegram(numericApiId, apiHash, updatedSessions, wsServer, userId);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to verify 2FA password') });
    }
  });

  router.post('/auth/telegram/disconnect', async (req, res) => {
    const userId = getUserId(req);
    await storage.updateConfig(userId, { telegramSessions: [] });
    const { disconnectTelegram } = await import('../index.js');
    disconnectTelegram(userId);
    res.json({ success: true });
  });

  router.get('/auth/telegram/status', async (req, res) => {
    const userId = getUserId(req);
    const config = await storage.getConfig(userId);
    const { getUserTelegram } = await import('../index.js');
    const tg = getUserTelegram(userId);
    res.json({
      configured: (config.telegramSessions?.length ?? 0) > 0,
      connected: tg !== null && tg.isConnected(),
      hasApiCredentials: !!(config.telegramApiId && config.telegramApiHash),
      sessionCount: config.telegramSessions?.length ?? 0,
    });
  });

  // --- Telegram Media & Avatars ---

  const avatarCache = new Map<string, { buffer: Buffer; timestamp: number }>();
  const AVATAR_CACHE_TTL = 3600_000; // 1 hour

  router.get('/telegram/avatar/:peerId', async (req, res) => {
    const { peerId } = req.params;
    const cached = avatarCache.get(peerId);
    if (cached && Date.now() - cached.timestamp < AVATAR_CACHE_TTL) {
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(cached.buffer);
    }

    const tg = await requireTelegramManager(req, res);
    if (!tg) return;
    await tg.waitUntilReady();

    const buffer = await tg.downloadProfilePhoto(peerId);
    if (!buffer) {
      return res.status(404).json({ error: 'Profile photo not found' });
    }

    avatarCache.set(peerId, { buffer, timestamp: Date.now() });
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  });

  const mediaCache = new Map<string, { buffer: Buffer; mimeType: string; timestamp: number }>();
  const MEDIA_CACHE_TTL = 3600_000;

  router.get('/telegram/media/:chatId/:messageId', async (req, res) => {
    const { chatId, messageId } = req.params;
    const cacheKey = `${chatId}:${messageId}`;

    const cached = mediaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < MEDIA_CACHE_TTL) {
      res.set('Content-Type', cached.mimeType);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(cached.buffer);
    }

    const tg = await requireTelegramManager(req, res);
    if (!tg) return;
    await tg.waitUntilReady();

    const result = await tg.downloadMediaByIds(chatId, parseInt(messageId, 10));
    if (!result) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (result.buffer.length < 10_000_000) {
      mediaCache.set(cacheKey, { ...result, timestamp: Date.now() });
    }
    res.set('Content-Type', result.mimeType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(result.buffer);
  });

  // --- Telegram Chats ---

  router.get('/telegram/chats', async (req, res) => {
    const tg = await requireTelegramManager(req, res);
    if (!tg) return;
    await tg.waitUntilReady();
    const chats = await tg.getChats();
    res.json(chats);
  });

  // --- Channel History ---

  router.get('/history', async (req, res) => {
    const userId = getUserId(req);
    const rooms = await storage.getRooms(userId);
    const result: Record<string, FrontendMessage[]> = {};

    // Separate Discord and Telegram channels
    const discordChannelToRooms = new Map<string, string[]>();
    const telegramChannelToRooms = new Map<string, string[]>();

    for (const room of rooms) {
      for (const ch of room.channels) {
        const isTelegram = ch.source === 'telegram';
        const map = isTelegram ? telegramChannelToRooms : discordChannelToRooms;
        const existing = map.get(ch.channelId) ?? [];
        existing.push(room.id);
        map.set(ch.channelId, existing);
      }
    }

    // Fetch Discord history
    if (discordChannelToRooms.size > 0) {
      const { getUserGateway, connectGateway } = await import('../index.js');
      let gateway = getUserGateway(userId);
      if (!gateway) {
        const tokens = await storage.getTokens(userId);
        if (tokens.length > 0) {
          gateway = connectGateway(tokens, wsServer, userId);
        }
      }

      if (gateway) {
        await gateway.waitUntilReady();
        const BATCH_SIZE = 5;
        const channelIds = Array.from(discordChannelToRooms.keys());

        for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
          const batch = channelIds.slice(i, i + BATCH_SIZE);
          const fetches = batch.map(async (channelId) => {
            const rawMessages = await gateway!.fetchChannelMessages(channelId, 30);
            const roomIds = discordChannelToRooms.get(channelId) ?? [];
            for (const rawMsg of rawMessages) {
              const frontendMsg = processDiscordMessage(gateway!, rawMsg);
              for (const roomId of roomIds) {
                if (!result[roomId]) result[roomId] = [];
                result[roomId].push(frontendMsg);
              }
            }
          });
          await Promise.all(fetches);
        }
      }
    }

    // Fetch Telegram history
    if (telegramChannelToRooms.size > 0) {
      const { getUserTelegram } = await import('../index.js');
      const tg = getUserTelegram(userId);

      if (tg) {
        await tg.waitUntilReady();
        const BATCH_SIZE = 3;
        const chatIds = Array.from(telegramChannelToRooms.keys());

        for (let i = 0; i < chatIds.length; i += BATCH_SIZE) {
          const batch = chatIds.slice(i, i + BATCH_SIZE);
          const fetches = batch.map(async (chatId) => {
            const rawMessages = await tg.fetchMessages(chatId, 30);
            const roomIds = telegramChannelToRooms.get(chatId) ?? [];
            for (const rawMsg of rawMessages) {
              const frontendMsg = processTelegramMessage(rawMsg);
              for (const roomId of roomIds) {
                if (!result[roomId]) result[roomId] = [];
                result[roomId].push(frontendMsg);
              }
            }
          });
          await Promise.all(fetches);
        }
      }
    }

    for (const roomId of Object.keys(result)) {
      result[roomId].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const seen = new Set<string>();
      result[roomId] = result[roomId].filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    }

    res.json(result);
  });

  // --- Guilds & Channels ---

  router.get('/guilds', async (req, res) => {
    const gateway = await requireGateway(req, res);
    if (!gateway) return;
    await gateway.waitUntilReady();
    const guilds = gateway.getGuilds();
    res.json(guilds);
  });

  router.get('/dm-channels', async (req, res) => {
    const gateway = await requireGateway(req, res);
    if (!gateway) return;
    await gateway.waitUntilReady();
    const dms = gateway.getDMChannels();
    res.json(dms);
  });

  // --- Rooms CRUD ---

  router.get('/rooms', async (req, res) => {
    const userId = getUserId(req);
    res.json(await storage.getRooms(userId));
  });

  router.get('/rooms/:id', async (req, res) => {
    const userId = getUserId(req);
    const room = await storage.getRoom(userId, req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  });

  router.post('/rooms', async (req, res) => {
    const userId = getUserId(req);
    const { name, channels, highlightedUsers, filteredUsers, filterEnabled, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const room = await storage.createRoom(userId, {
      name,
      channels: channels ?? [],
      highlightedUsers: highlightedUsers ?? [],
      filteredUsers: filteredUsers ?? [],
      filterEnabled: filterEnabled ?? false,
      color: color ?? null,
    });
    res.status(201).json(room);
  });

  router.put('/rooms/:id', async (req, res) => {
    const userId = getUserId(req);
    const { name, channels, highlightedUsers, filteredUsers, filterEnabled, color, keywordPatterns, highlightMode, highlightedUserColors } = req.body;
    const room = await storage.updateRoom(userId, req.params.id, {
      ...(name !== undefined && { name }),
      ...(channels !== undefined && { channels }),
      ...(highlightedUsers !== undefined && { highlightedUsers }),
      ...(filteredUsers !== undefined && { filteredUsers }),
      ...(filterEnabled !== undefined && { filterEnabled }),
      ...(color !== undefined && { color }),
      ...(keywordPatterns !== undefined && { keywordPatterns }),
      ...(highlightMode !== undefined && { highlightMode }),
      ...(highlightedUserColors !== undefined && { highlightedUserColors }),
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  });

  router.delete('/rooms/:id', async (req, res) => {
    const userId = getUserId(req);
    const deleted = await storage.deleteRoom(userId, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true });
  });

  // --- Global Config ---

  router.get('/config', async (req, res) => {
    const userId = getUserId(req);
    const fullConfig = await storage.getConfig(userId);
    const { discordTokens, telegramSessions, ...safeConfig } = fullConfig;
    res.json(safeConfig);
  });

  router.put('/config', async (req, res) => {
    const userId = getUserId(req);
    const { globalHighlightedUsers, contractDetection, guildColors, dmColors, enabledGuilds, hiddenUsers, evmAddressColor, solAddressColor, openInDiscordApp, openInTelegramApp, messageSounds, soundSettings, pushover, contractLinkTemplates, autoOpenHighlightedContracts, globalKeywordPatterns, keywordAlertsEnabled, desktopNotifications, badgeClickAction, chattingEnabled, messageDisplay, compactModeAvatars, roleColors } = req.body;
    const config = await storage.updateConfig(userId, {
      ...(globalHighlightedUsers !== undefined && { globalHighlightedUsers }),
      ...(contractDetection !== undefined && { contractDetection }),
      ...(guildColors !== undefined && { guildColors }),
      ...(dmColors !== undefined && { dmColors }),
      ...(enabledGuilds !== undefined && { enabledGuilds }),
      ...(hiddenUsers !== undefined && { hiddenUsers }),
      ...(evmAddressColor !== undefined && { evmAddressColor }),
      ...(solAddressColor !== undefined && { solAddressColor }),
      ...(openInDiscordApp !== undefined && { openInDiscordApp }),
      ...(openInTelegramApp !== undefined && { openInTelegramApp }),
      ...(messageSounds !== undefined && { messageSounds }),
      ...(soundSettings !== undefined && { soundSettings }),
      ...(pushover !== undefined && { pushover }),
      ...(contractLinkTemplates !== undefined && { contractLinkTemplates }),
      ...(autoOpenHighlightedContracts !== undefined && { autoOpenHighlightedContracts }),
      ...(globalKeywordPatterns !== undefined && { globalKeywordPatterns }),
      ...(keywordAlertsEnabled !== undefined && { keywordAlertsEnabled }),
      ...(desktopNotifications !== undefined && { desktopNotifications }),
      ...(badgeClickAction !== undefined && { badgeClickAction }),
      ...(chattingEnabled !== undefined && { chattingEnabled }),
      ...(messageDisplay !== undefined && { messageDisplay }),
      ...(compactModeAvatars !== undefined && { compactModeAvatars }),
      ...(roleColors !== undefined && { roleColors }),
    });
    res.json(config);
  });

  // --- Sound file uploads ---

  const validSoundTypes: SoundType[] = ['highlight', 'contractAlert', 'keywordAlert'];

  function getSupabaseStorage() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Supabase not configured');
    return createClient(url, key, { auth: { persistSession: false } }).storage.from('sounds');
  }

  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: soundFileFilter,
    limits: { fileSize: 2 * 1024 * 1024 },
  });

  router.post('/sounds/:soundType', isHostedMode() ? memoryUpload.single('file') : upload.single('file'), async (req, res) => {
    if (!validSoundTypes.includes(req.params.soundType as SoundType)) {
      return res.status(400).json({ error: 'Invalid sound type' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided or unsupported format' });
    }

    if (isHostedMode()) {
      const userId = getUserId(req);
      const ext = extname(req.file.originalname);
      const storagePath = `${userId}/${req.params.soundType}${ext}`;
      const bucket = getSupabaseStorage();

      const { error } = await bucket.upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
      if (error) return res.status(500).json({ error: safeError(error, 'Failed to upload sound') });

      const { data: urlData } = bucket.getPublicUrl(storagePath);
      res.json({ url: urlData.publicUrl, filename: `${req.params.soundType}${ext}` });
    } else {
      const url = `/api/sounds/${req.file.filename}`;
      res.json({ url, filename: req.file.filename });
    }
  });

  router.delete('/sounds/:soundType', async (req, res) => {
    const soundType = req.params.soundType as SoundType;
    if (!validSoundTypes.includes(soundType)) {
      return res.status(400).json({ error: 'Invalid sound type' });
    }

    if (isHostedMode()) {
      const userId = getUserId(req);
      const bucket = getSupabaseStorage();
      const extensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
      const paths = extensions.map((ext) => `${userId}/${soundType}${ext}`);
      await bucket.remove(paths);
    } else {
      const extensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
      for (const ext of extensions) {
        const filePath = join(SOUNDS_DIR, `${soundType}${ext}`);
        try { if (existsSync(filePath)) unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    res.json({ success: true });
  });

  router.post('/channel-sounds/:channelId', isHostedMode() ? memoryUpload.single('file') : channelSoundUpload.single('file'), async (req, res) => {
    const channelId = req.params.channelId as string;
    if (!channelId || !/^\d+$/.test(channelId)) {
      return res.status(400).json({ error: 'Invalid channel ID' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided or unsupported format' });
    }

    if (isHostedMode()) {
      const userId = getUserId(req);
      const ext = extname(req.file.originalname);
      const storagePath = `${userId}/ch_${channelId}${ext}`;
      const bucket = getSupabaseStorage();

      const { error } = await bucket.upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
      if (error) return res.status(500).json({ error: safeError(error, 'Failed to upload channel sound') });

      const { data: urlData } = bucket.getPublicUrl(storagePath);
      res.json({ url: urlData.publicUrl, filename: `ch_${channelId}${ext}` });
    } else {
      const url = `/api/sounds/${req.file.filename}`;
      res.json({ url, filename: req.file.filename });
    }
  });

  router.delete('/channel-sounds/:channelId', async (req, res) => {
    const channelId = req.params.channelId as string;
    if (!channelId || !/^\d+$/.test(channelId)) {
      return res.status(400).json({ error: 'Invalid channel ID' });
    }

    if (isHostedMode()) {
      const userId = getUserId(req);
      const bucket = getSupabaseStorage();
      const extensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
      const paths = extensions.map((ext) => `${userId}/ch_${channelId}${ext}`);
      await bucket.remove(paths);
    } else {
      const extensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
      for (const ext of extensions) {
        const filePath = join(SOUNDS_DIR, `ch_${channelId}${ext}`);
        try { if (existsSync(filePath)) unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    res.json({ success: true });
  });

  router.use('/sounds', expressStatic(SOUNDS_DIR));

  // --- Send Message ---

  const messageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  });

  router.post('/send-message', messageUpload.array('files', 10), async (req, res) => {
    const userId = getUserId(req);

    const config = await storage.getConfig(userId);
    if (!config.chattingEnabled) {
      return res.status(403).json({ error: 'Chatting is disabled. Enable it in Settings > General.' });
    }

    const { channelId, content, source } = req.body;
    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required' });
    }
    if ((!content || !content.trim()) && (!req.files || (req.files as Express.Multer.File[]).length === 0)) {
      return res.status(400).json({ error: 'Message content or files required' });
    }

    try {
      const files = (req.files as Express.Multer.File[]) ?? [];
      const attachments = files.map((f) => ({
        filename: f.originalname,
        data: f.buffer,
        contentType: f.mimetype,
      }));

      if (source === 'telegram') {
        const tg = await requireTelegramManager(req, res);
        if (!tg) return;
        await tg.waitUntilReady();
        const result = await tg.sendMessage(channelId, content?.trim() ?? '', attachments.length > 0 ? attachments : undefined);
        res.json({ success: true, messageId: result.id });
      } else {
        const gateway = await requireGateway(req, res);
        if (!gateway) return;
        const result = await gateway.sendChannelMessage(channelId, content?.trim() ?? '', attachments.length > 0 ? attachments : undefined);
        res.json({ success: true, messageId: result.id });
      }
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to send message') });
    }
  });

  // --- Contracts ---

  router.get('/contracts', async (req, res) => {
    const userId = getUserId(req);
    const limit = parseInt(req.query.limit as string) || 100;
    const since = req.query.since as string | undefined;
    res.json(await storage.getContracts(userId, limit, since));
  });

  router.delete('/contracts', async (req, res) => {
    const userId = getUserId(req);
    await storage.deleteAllContracts(userId);
    res.json({ success: true });
  });

  router.delete('/contracts/:messageId/:address', async (req, res) => {
    const userId = getUserId(req);
    const deleted = await storage.deleteContract(userId, req.params.messageId, req.params.address);
    if (!deleted) return res.status(404).json({ error: 'Contract not found' });
    res.json({ success: true });
  });

  return router;
}
