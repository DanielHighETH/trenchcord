import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __envDir = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.resolve(__envDir, '../.env'), override: true });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { GatewayManager } from './discord/gatewayManager.js';
import { TelegramClientManager } from './telegram/clientManager.js';
import { processTelegramMessage } from './telegram/messageProcessor.js';
import type { TelegramRawMessage } from './telegram/types.js';
import type { TelegramMessageProcessorContext } from './telegram/messageProcessor.js';
import { WsServer } from './ws/server.js';
import { createRouter } from './api/routes.js';
import { getStorageProvider, isHostedMode } from './storage/index.js';
import { authMiddleware } from './auth/middleware.js';
import { getGateway, setGateway } from './gateway/state.js';
import { UserGatewayPool } from './gateway/userGatewayPool.js';
import { buildContractUrl, detectEvmChainFromContent, extractEvmChainFromGmgnLinks } from './utils/contract.js';
import { processDiscordMessage } from './utils/messageProcessor.js';
import type { MessageProcessorContext } from './utils/messageProcessor.js';
import { sendPushover } from './utils/pushover.js';
import type { DiscordMessage, PushoverConfig, FrontendMessage, ContractLinkTemplates } from './discord/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const LOCAL_USER_ID = 'local';

const gatewayPool = new UserGatewayPool();

// Telegram state
let localTelegramManager: TelegramClientManager | null = null;
const telegramManagers = new Map<string, TelegramClientManager>();

function checkPushover(cfg: PushoverConfig, msg: FrontendMessage, evmChainHint: string | null, contractLinkTemplates: ContractLinkTemplates): void {
  if (!cfg.enabled || !cfg.appToken || !cfg.userKey) return;

  const t = cfg.triggers ?? { highlightedUser: false, highlightedUserContract: true, contract: false, keyword: false };
  const f = cfg.filters ?? { userIds: [], channelIds: [], guildIds: [] };

  const triggered =
    (t.highlightedUserContract && msg.isHighlighted && msg.hasContractAddress) ||
    (t.highlightedUser && msg.isHighlighted) ||
    (t.contract && msg.hasContractAddress) ||
    (t.keyword && msg.matchedKeywords && msg.matchedKeywords.length > 0);

  if (!triggered) return;

  if (f.userIds.length > 0 && !f.userIds.includes(msg.author.id)) return;
  if (f.channelIds.length > 0 && !f.channelIds.includes(msg.channelId)) return;
  if (f.guildIds.length > 0 && msg.guildId && !f.guildIds.includes(msg.guildId)) return;

  let title: string;
  let message: string;
  let url: string | undefined;
  let urlTitle: string | undefined;

  if (msg.hasContractAddress) {
    const addr = msg.contractAddresses[0];
    url = buildContractUrl(addr, contractLinkTemplates, evmChainHint ?? undefined);
    urlTitle = 'Open in Explorer';
    title = `Contract Alert: ${msg.author.displayName}`;
    message = `${msg.author.displayName} posted ${addr} in #${msg.channelName}`;
  } else if (msg.matchedKeywords && msg.matchedKeywords.length > 0) {
    title = `Keyword: ${msg.matchedKeywords[0]}`;
    message = `${msg.author.displayName} in #${msg.channelName}: ${msg.content.slice(0, 120)}`;
  } else {
    title = `${msg.author.displayName}`;
    message = `Message in #${msg.channelName}: ${msg.content.slice(0, 120)}`;
  }

  sendPushover(cfg, { title, message, url, urlTitle });
}

function wireGatewayEvents(gw: GatewayManager, wsServer: WsServer, userId: string): void {
  const storage = getStorageProvider();

  gw.on('ready', (user) => {
    console.log(`[App] Logged in as ${user.username}`);
    wsServer.broadcastRaw({ type: 'gateway_ready', data: { username: user.username } }, userId);
  });

  gw.on('message', async (rawMsg: DiscordMessage & { _channelName: string; _guildName: string | null }) => {
    const isDM = !rawMsg.guild_id && gw.getDMChannels().some((dm) => dm.id === rawMsg.channel_id);
    const rooms = await storage.getRoomsForChannel(userId, rawMsg.channel_id);

    if (rooms.length === 0 && !isDM) return;

    const config = await storage.getConfig(userId);
    const isHighlighted = await storage.isUserHighlighted(userId, rawMsg.author.id);
    const ctx: MessageProcessorContext = {
      config,
      isHighlighted,
      cacheUserName: (discordUserId, displayName) => {
        storage.cacheUserName(userId, discordUserId, displayName);
      },
    };

    const roomKeywords = rooms.flatMap((r) => r.keywordPatterns ?? []);
    const frontendMsg = processDiscordMessage(gw, rawMsg, rawMsg._channelName, rawMsg._guildName, roomKeywords, ctx);
    const evmChainHint = detectEvmChainFromContent(rawMsg.content, rawMsg.embeds);

    checkPushover(config.pushover, frontendMsg, evmChainHint, config.contractLinkTemplates);

    const roomIds = rooms.map((r) => r.id);
    if (isDM) {
      roomIds.push(`dm:${rawMsg.channel_id}`);
    }

    if (frontendMsg.hasContractAddress) {
      for (const addr of frontendMsg.contractAddresses) {
        const isEvm = addr.startsWith('0x');
        const entry = {
          address: addr,
          chain: (isEvm ? 'evm' : 'sol') as 'evm' | 'sol',
          evmChain: isEvm ? (evmChainHint ?? undefined) : undefined,
          authorId: frontendMsg.author.id,
          authorName: frontendMsg.author.displayName,
          channelId: frontendMsg.channelId,
          channelName: frontendMsg.channelName,
          guildId: frontendMsg.guildId,
          guildName: frontendMsg.guildName,
          roomIds,
          messageId: frontendMsg.id,
          timestamp: frontendMsg.timestamp,
        };
        await storage.logContract(userId, entry);
        if (isEvm && evmChainHint) {
          await storage.updateEvmChain(userId, addr, evmChainHint);
        }
        wsServer.broadcastContract(entry, userId);
      }
    }

    const gmgnChainUpdates = extractEvmChainFromGmgnLinks(rawMsg.content, rawMsg.embeds);
    for (const { address, chain: detectedChain } of gmgnChainUpdates) {
      const updated = await storage.updateEvmChain(userId, address, detectedChain);
      if (updated) {
        wsServer.broadcastChainUpdate(address, detectedChain, userId);
      }
    }

    if (frontendMsg.matchedKeywords && frontendMsg.matchedKeywords.length > 0) {
      wsServer.broadcastAlert({
        type: 'keyword_match',
        message: frontendMsg,
        reason: `Keyword match: ${frontendMsg.matchedKeywords.join(', ')}`,
      }, userId);
    }

    wsServer.broadcastMessage(frontendMsg, roomIds, userId);
  });

  gw.on('messageUpdate', async (rawMsg: Partial<DiscordMessage> & { id: string; channel_id: string; guild_id?: string; _channelName: string; _guildName: string | null }) => {
    const rooms = await storage.getRoomsForChannel(userId, rawMsg.channel_id);
    const isDM = !rawMsg.guild_id && gw.getDMChannels().some((dm) => dm.id === rawMsg.channel_id);
    if (rooms.length === 0 && !isDM) return;

    const roomIds = rooms.map((r) => r.id);
    if (isDM) roomIds.push(`dm:${rawMsg.channel_id}`);

    wsServer.broadcastMessageUpdate({
      messageId: rawMsg.id,
      channelId: rawMsg.channel_id,
      embeds: rawMsg.embeds,
      content: rawMsg.content,
      attachments: rawMsg.attachments,
    }, roomIds, userId);
  });

  gw.on('reactionUpdate', (data) => {
    wsServer.broadcastReactionUpdate(data, userId);
  });

  gw.on('fatal', (err: Error) => {
    console.error('[App] Fatal gateway error:', err.message);
  });
}

export function connectGateway(tokens: string[], wsServer: WsServer, userId: string = LOCAL_USER_ID): GatewayManager {
  if (isHostedMode()) {
    return gatewayPool.getOrCreate(userId, tokens, (gw) => {
      wireGatewayEvents(gw, wsServer, userId);
    });
  }

  // Local mode: single global gateway
  const existing = getGateway();
  if (existing) {
    existing.disconnect();
  }
  const gw = new GatewayManager(tokens);
  setGateway(gw);
  wireGatewayEvents(gw, wsServer, userId);
  gw.connect();
  return gw;
}

export function disconnectGateway(userId: string = LOCAL_USER_ID): void {
  if (isHostedMode()) {
    gatewayPool.disconnect(userId);
  } else {
    const gw = getGateway();
    if (gw) gw.disconnect();
    setGateway(null);
  }
}

export function getUserGateway(userId: string): GatewayManager | null {
  if (isHostedMode()) {
    return gatewayPool.get(userId);
  }
  return getGateway();
}

// --- Telegram ---

function wireTelegramEvents(tg: TelegramClientManager, wsServer: WsServer, userId: string): void {
  const storage = getStorageProvider();

  tg.on('ready', (user: { id: string; username: string | null; firstName: string }) => {
    console.log(`[App] Telegram logged in as ${user.firstName} (@${user.username ?? 'no-username'})`);
    wsServer.broadcastRaw({ type: 'telegram_ready', data: { username: user.username, firstName: user.firstName } }, userId);
  });

  tg.on('message', async (raw: TelegramRawMessage) => {
    const rooms = await storage.getRoomsForChannel(userId, raw.chatId);
    const isTgDm = raw.chatType === 'user';

    if (rooms.length === 0 && !isTgDm) return;

    const config = await storage.getConfig(userId);
    const isHighlighted = await storage.isUserHighlighted(userId, raw.sender.id, undefined, raw.sender.username);
    const ctx: TelegramMessageProcessorContext = {
      config,
      isHighlighted,
      cacheUserName: (telegramUserId, displayName) => {
        storage.cacheUserName(userId, telegramUserId, displayName);
      },
    };

    const roomKeywords = rooms.flatMap((r) => r.keywordPatterns ?? []);
    const frontendMsg = processTelegramMessage(raw, roomKeywords, ctx);
    const evmChainHint = detectEvmChainFromContent(raw.text, []);

    checkPushover(config.pushover, frontendMsg, evmChainHint, config.contractLinkTemplates);

    const roomIds = rooms.map((r) => r.id);
    if (isTgDm) {
      roomIds.push(`tg-dm:${raw.chatId}`);
    }

    if (frontendMsg.hasContractAddress) {
      for (const addr of frontendMsg.contractAddresses) {
        const isEvm = addr.startsWith('0x');
        const entry = {
          address: addr,
          chain: (isEvm ? 'evm' : 'sol') as 'evm' | 'sol',
          evmChain: isEvm ? (evmChainHint ?? undefined) : undefined,
          authorId: frontendMsg.author.id,
          authorName: frontendMsg.author.displayName,
          channelId: frontendMsg.channelId,
          channelName: frontendMsg.channelName,
          guildId: frontendMsg.guildId,
          guildName: frontendMsg.guildName,
          roomIds,
          messageId: frontendMsg.id,
          timestamp: frontendMsg.timestamp,
        };
        await storage.logContract(userId, entry);
        if (isEvm && evmChainHint) {
          await storage.updateEvmChain(userId, addr, evmChainHint);
        }
        wsServer.broadcastContract(entry, userId);
      }
    }

    if (frontendMsg.matchedKeywords && frontendMsg.matchedKeywords.length > 0) {
      wsServer.broadcastAlert({
        type: 'keyword_match',
        message: frontendMsg,
        reason: `Keyword match: ${frontendMsg.matchedKeywords.join(', ')}`,
      }, userId);
    }

    wsServer.broadcastMessage(frontendMsg, roomIds, userId);
  });

  tg.on('messageUpdate', async (raw: TelegramRawMessage) => {
    const rooms = await storage.getRoomsForChannel(userId, raw.chatId);
    const isTgDm = raw.chatType === 'user';
    if (rooms.length === 0 && !isTgDm) return;

    const roomIds = rooms.map((r) => r.id);
    if (isTgDm) roomIds.push(`tg-dm:${raw.chatId}`);

    const frontendMsg = processTelegramMessage(raw);
    wsServer.broadcastMessageUpdate({
      messageId: frontendMsg.id,
      channelId: frontendMsg.channelId,
      content: frontendMsg.content,
    }, roomIds, userId);
  });

  tg.on('fatal', (err: Error) => {
    console.error('[App] Fatal Telegram error:', err.message);
  });
}

export async function connectTelegram(
  apiId: number,
  apiHash: string,
  sessions: string[],
  wsServer: WsServer,
  userId: string = LOCAL_USER_ID,
): Promise<TelegramClientManager> {
  // Disconnect existing
  disconnectTelegram(userId);

  const tg = new TelegramClientManager(apiId, apiHash, sessions);
  wireTelegramEvents(tg, wsServer, userId);
  await tg.connect();

  if (isHostedMode()) {
    telegramManagers.set(userId, tg);
  } else {
    localTelegramManager = tg;
  }

  return tg;
}

export function disconnectTelegram(userId: string = LOCAL_USER_ID): void {
  if (isHostedMode()) {
    const tg = telegramManagers.get(userId);
    if (tg) {
      tg.disconnect();
      telegramManagers.delete(userId);
    }
  } else {
    if (localTelegramManager) {
      localTelegramManager.disconnect();
      localTelegramManager = null;
    }
  }
}

export function getUserTelegram(userId: string): TelegramClientManager | null {
  if (isHostedMode()) {
    return telegramManagers.get(userId) ?? null;
  }
  return localTelegramManager;
}

const app = express();

// CORS: restrict origins in hosted mode, allow all in local mode
if (isHostedMode()) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];
  app.use(cors({
    origin: allowedOrigins.length > 0
      ? (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        }
      : true,
    credentials: true,
  }));
} else {
  app.use(cors());
}

// Security headers in hosted mode
if (isHostedMode()) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
}

app.use(express.json());

// Rate limiting on auth endpoints in hosted mode
if (isHostedMode()) {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api/auth', authLimiter);

  const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api', generalLimiter);
}

const httpServer = createServer(app);
const wsServer = new WsServer(httpServer);

if (isHostedMode()) {
  wsServer.setUserLifecycleCallbacks(
    (userId) => gatewayPool.markClientConnected(userId),
    (userId) => gatewayPool.markClientDisconnected(userId),
  );
}

app.use('/api', authMiddleware, createRouter(wsServer));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

httpServer.listen(PORT, async () => {
  console.log(`[App] Server running on http://localhost:${PORT}`);
  console.log(`[App] Mode: ${isHostedMode() ? 'hosted' : 'local'}`);

  if (!isHostedMode()) {
    const storage = getStorageProvider();
    const tokens = await storage.getTokens(LOCAL_USER_ID);
    if (tokens.length > 0) {
      console.log(`[App] Found ${tokens.length} Discord token(s), connecting...`);
      connectGateway(tokens, wsServer, LOCAL_USER_ID);
    } else {
      console.log('[App] No Discord tokens configured. Waiting for token setup via frontend.');
    }

    const config = await storage.getConfig(LOCAL_USER_ID);
    if (config.telegramSessions?.length && config.telegramApiId && config.telegramApiHash) {
      console.log(`[App] Found ${config.telegramSessions.length} Telegram session(s), connecting...`);
      connectTelegram(
        parseInt(config.telegramApiId),
        config.telegramApiHash,
        config.telegramSessions,
        wsServer,
        LOCAL_USER_ID,
      ).catch((err) => console.error('[App] Telegram connection failed:', err.message));
    }
  } else {
    console.log('[App] Hosted mode: gateways will connect per-user on demand.');
  }
});
