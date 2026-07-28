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
import { createProxyBundle } from './discord/proxy.js';
import { configStore } from './config/store.js';
import { TelegramClientManager } from './telegram/clientManager.js';
import { processTelegramMessage } from './telegram/messageProcessor.js';
import type { TelegramRawMessage } from './telegram/types.js';
import type { TelegramMessageProcessorContext } from './telegram/messageProcessor.js';
import { WsServer } from './ws/server.js';
import { createRouter } from './api/routes.js';
import { getStorageProvider, isHostedMode } from './storage/index.js';
import { getBindHost, isAllowedHost, isAllowedOrigin, warnIfExposed } from './security/localAccess.js';
import {
  getLocalToken,
  isAuthorizedLocalRequest,
  isLoopbackRequest,
  isValidToken,
  sessionCookie,
} from './security/localAuth.js';
import { authMiddleware } from './auth/middleware.js';
import { getGateway, setGateway } from './gateway/state.js';
import { UserGatewayPool } from './gateway/userGatewayPool.js';
import { buildContractUrl, detectEvmChainFromContent, extractEvmChainFromGmgnLinks, resolveEvmChainFromApi } from './utils/contract.js';
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

// When a message carries no chain hint, resolve the real chain for each EVM
// address via external liquidity APIs and backfill it. Runs in the background
// (never awaited on the message path) and broadcasts a chain_update once known.
function backfillEvmChainsFromApi(
  wsServer: WsServer,
  userId: string,
  addresses: string[],
  evmChainHint: string | null,
): void {
  if (evmChainHint) return;
  const storage = getStorageProvider();
  for (const addr of addresses) {
    if (!addr.startsWith('0x')) continue;
    resolveEvmChainFromApi(addr)
      .then(async (resolved) => {
        if (!resolved) return;
        const updated = await storage.updateEvmChain(userId, addr, resolved);
        if (updated) wsServer.broadcastChainUpdate(addr, resolved, userId);
      })
      .catch((err) => console.error('[App] EVM chain backfill failed:', err.message));
  }
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

    // Mentions: collect guild messages where the logged-in user / their role / @here / @everyone
    // was mentioned, per enabled settings, into a virtual "mentions" room.
    if (rawMsg.guild_id) {
      const selfIds = gw.getSelfUserIds();
      if (!selfIds.has(rawMsg.author.id)) {
        const mentionTypes: ('user' | 'role' | 'here' | 'everyone')[] = [];
        if (config.mentionsUserEnabled && rawMsg.mentions?.some((u) => selfIds.has(u.id))) {
          mentionTypes.push('user');
        }
        if (rawMsg.mention_everyone) {
          if (config.mentionsHereEnabled && rawMsg.content.includes('@here')) mentionTypes.push('here');
          if (config.mentionsEveryoneEnabled && rawMsg.content.includes('@everyone')) mentionTypes.push('everyone');
        }
        if (config.mentionsRoleEnabled && rawMsg.mention_roles && rawMsg.mention_roles.length > 0) {
          const selfRoles = await gw.getSelfRoleIds(rawMsg.guild_id);
          if (rawMsg.mention_roles.some((r) => selfRoles.has(r))) mentionTypes.push('role');
        }
        if (mentionTypes.length > 0) {
          frontendMsg.mentionTypes = mentionTypes;
          roomIds.push('mentions');
        }
      }
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
      backfillEvmChainsFromApi(wsServer, userId, frontendMsg.contractAddresses, evmChainHint);
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
      editedTimestamp: rawMsg.edited_timestamp ?? null,
    }, roomIds, userId);
  });

  gw.on('messageDelete', async (data: { id: string; channel_id: string; guild_id?: string | null }) => {
    const rooms = await storage.getRoomsForChannel(userId, data.channel_id);
    const isDM = !data.guild_id && gw.getDMChannels().some((dm) => dm.id === data.channel_id);
    if (rooms.length === 0 && !isDM) return;

    const roomIds = rooms.map((r) => r.id);
    if (isDM) roomIds.push(`dm:${data.channel_id}`);

    wsServer.broadcastMessageDelete({
      messageId: data.id,
      channelId: data.channel_id,
    }, roomIds, userId);
  });

  gw.on('reactionUpdate', (data) => {
    wsServer.broadcastReactionUpdate(data, userId);
  });

  gw.on('fatal', (err: Error) => {
    console.error('[App] Fatal gateway error:', err.message);
  });

  gw.on('auth_failed', (failure: { tokenIndex: number; message: string; invalid: boolean; blocked?: boolean }) => {
    const tokenNumber = failure.tokenIndex + 1;
    // A block is an IP/network problem, not a per-token issue, so skip the
    // "Token #N:" prefix that would wrongly imply the token is at fault.
    const error = failure.blocked ? failure.message : `Token #${tokenNumber}: ${failure.message}`;
    console.error('[App] Discord gateway connection failed:', error);
    wsServer.broadcastRaw(
      { type: 'gateway_auth_failed', error, tokenIndex: failure.tokenIndex, tokenInvalid: failure.invalid, tokenBlocked: failure.blocked ?? false },
      userId,
    );
  });
}

export function connectGateway(tokens: string[], wsServer: WsServer, userId: string = LOCAL_USER_ID): GatewayManager {
  if (isHostedMode()) {
    return gatewayPool.getOrCreate(userId, tokens, (gw) => {
      wireGatewayEvents(gw, wsServer, userId);
    });
  }

  // Local mode: single global gateway. The Discord connection originates from
  // the user's own machine/IP, so an optional proxy lets VPN-blocked users route
  // gateway + REST traffic through a residential/HTTP proxy.
  const existing = getGateway();
  if (existing) {
    existing.disconnect();
  }
  const proxy = createProxyBundle(configStore.getConfig().discordProxyUrl);
  const gw = new GatewayManager(tokens, proxy);
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
      backfillEvmChainsFromApi(wsServer, userId, frontendMsg.contractAddresses, evmChainHint);
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

  tg.on('disconnected', (reason: string) => {
    console.warn(`[App] Telegram disconnected: ${reason}`);
    wsServer.broadcastRaw({ type: 'telegram_status', data: { connected: false, reason } }, userId);
  });

  tg.on('reconnected', () => {
    console.log('[App] Telegram reconnected');
    wsServer.broadcastRaw({ type: 'telegram_status', data: { connected: true } }, userId);
  });

  tg.on('fatal', (err: Error) => {
    console.error('[App] Fatal Telegram error:', err.message);
    wsServer.broadcastRaw({ type: 'telegram_status', data: { connected: false, reason: err.message, fatal: true } }, userId);
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

// CORS: restrict origins in hosted mode, restrict to this machine in local mode
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
  // Local mode has no authentication and its settings export contains Discord
  // tokens and Telegram sessions in plaintext, so a wildcard here would let any
  // page you happen to have open read them out of localhost.
  app.use(cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  }));

  // Rejects requests whose Host header isn't this machine, which is what a DNS
  // rebinding attack looks like once the attacker's domain resolves to
  // 127.0.0.1 and the origin check no longer applies. The Origin check is
  // enforced here rather than left to the cors() middleware above, because that
  // one only withholds the response header - the request still runs.
  app.use((req, res, next) => {
    if (!isAllowedHost(req.headers.host)) {
      console.warn(`[App] Blocked request with unexpected Host header: ${req.headers.host}`);
      return res.status(403).json({ error: 'Forbidden: unexpected Host header.' });
    }
    if (!isAllowedOrigin(req.headers.origin)) {
      console.warn(`[App] Blocked request from unexpected origin: ${req.headers.origin}`);
      return res.status(403).json({ error: 'Forbidden: unexpected origin.' });
    }
    next();
  });
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

if (!isHostedMode()) {
  // Hands the page its token. A request already on this machine is trusted to
  // ask for one (it is the app you just opened); anything else has to prove it
  // already knows the token, which is how a phone on the LAN gets in after you
  // open the tokenised URL printed at startup.
  app.get('/api/local-session', (req, res) => {
    if (!isLoopbackRequest(req) && !isAuthorizedLocalRequest(req)) {
      return res.status(401).json({ error: 'A valid token is required from a remote device.' });
    }
    res.setHeader('Set-Cookie', sessionCookie());
    res.status(204).end();
  });

  app.use('/api', (req, res, next) => {
    if (isAuthorizedLocalRequest(req)) return next();
    res.status(401).json({ error: 'Unauthorized: this Trenchcord API requires the local session token.' });
  });
}

app.use('/api', authMiddleware, createRouter(wsServer));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const frontendDist = process.env.TRENCHCORD_FRONTEND_DIST || path.resolve(__dirname, '../../frontend/dist');

// Ahead of the static handler, which would otherwise answer "/" itself and skip
// this. Opening the tokenised URL on another device exchanges the token for the
// cookie once, then drops it from the address bar so it isn't left behind in
// history or read off a shared screen.
if (!isHostedMode()) {
  app.get('*', (req, res, next) => {
    if (typeof req.query.token !== 'string' || !isValidToken(req.query.token)) return next();
    res.setHeader('Set-Cookie', sessionCookie());
    res.redirect(req.path);
  });
}

app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const BIND_HOST = getBindHost(isHostedMode());

httpServer.listen(PORT, BIND_HOST, async () => {
  console.log(`[App] Server running on http://localhost:${PORT}`);
  console.log(`[App] Mode: ${isHostedMode() ? 'hosted' : 'local'}`);
  if (!isHostedMode() && warnIfExposed(BIND_HOST)) {
    console.warn(
      `[App] To open Trenchcord from another device, use:  http://<this-machine>:${PORT}/?token=${getLocalToken()}`,
    );
  }

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
