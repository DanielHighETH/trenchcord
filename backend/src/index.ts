import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { GatewayManager } from './discord/gatewayManager.js';
import { WsServer } from './ws/server.js';
import { createRouter } from './api/routes.js';
import { configStore } from './config/store.js';
import { getGateway, setGateway } from './gateway/state.js';
import { buildContractUrl, detectEvmChainFromContent, extractEvmChainFromGmgnLinks } from './utils/contract.js';
import { processDiscordMessage } from './utils/messageProcessor.js';
import { sendPushover } from './utils/pushover.js';
import { contractLog } from './utils/contractLog.js';
import type { DiscordMessage, PushoverConfig, FrontendMessage } from './discord/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

function checkPushover(cfg: PushoverConfig, msg: FrontendMessage, evmChainHint: string | null): void {
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
    const fullCfg = configStore.getConfig();
    const addr = msg.contractAddresses[0];
    url = buildContractUrl(addr, fullCfg.contractLinkTemplates, evmChainHint ?? undefined);
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

function wireGatewayEvents(gw: GatewayManager, wsServer: WsServer): void {
  gw.on('ready', (user) => {
    console.log(`[App] Logged in as ${user.username}`);
  });

  gw.on('message', (rawMsg: DiscordMessage & { _channelName: string; _guildName: string | null }) => {
    const isDM = !rawMsg.guild_id && gw.getDMChannels().some((dm) => dm.id === rawMsg.channel_id);
    const rooms = configStore.getRoomsForChannel(rawMsg.channel_id);

    if (rooms.length === 0 && !isDM) return;

    const roomKeywords = rooms.flatMap((r) => r.keywordPatterns ?? []);
    const frontendMsg = processDiscordMessage(gw, rawMsg, rawMsg._channelName, rawMsg._guildName, roomKeywords);
    const evmChainHint = detectEvmChainFromContent(rawMsg.content, rawMsg.embeds);

    checkPushover(configStore.getConfig().pushover, frontendMsg, evmChainHint);

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
        contractLog.logContract(entry);
        if (isEvm && evmChainHint) {
          contractLog.updateEvmChain(addr, evmChainHint);
        }
        wsServer.broadcastContract(entry);
      }
    }

    const gmgnChainUpdates = extractEvmChainFromGmgnLinks(rawMsg.content, rawMsg.embeds);
    for (const { address, chain: detectedChain } of gmgnChainUpdates) {
      if (contractLog.updateEvmChain(address, detectedChain)) {
        wsServer.broadcastChainUpdate(address, detectedChain);
      }
    }

    if (frontendMsg.matchedKeywords && frontendMsg.matchedKeywords.length > 0) {
      wsServer.broadcastAlert({
        type: 'keyword_match',
        message: frontendMsg,
        reason: `Keyword match: ${frontendMsg.matchedKeywords.join(', ')}`,
      });
    }

    wsServer.broadcastMessage(frontendMsg, roomIds);
  });

  gw.on('messageUpdate', (rawMsg: Partial<DiscordMessage> & { id: string; channel_id: string; guild_id?: string; _channelName: string; _guildName: string | null }) => {
    const rooms = configStore.getRoomsForChannel(rawMsg.channel_id);
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
    }, roomIds);
  });

  gw.on('reactionUpdate', (data) => {
    wsServer.broadcastReactionUpdate(data);
  });

  gw.on('fatal', (err: Error) => {
    console.error('[App] Fatal gateway error:', err.message);
  });
}

export function connectGateway(tokens: string[], wsServer: WsServer): GatewayManager {
  const existing = getGateway();
  if (existing) {
    existing.disconnect();
  }
  const gw = new GatewayManager(tokens);
  setGateway(gw);
  wireGatewayEvents(gw, wsServer);
  gw.connect();
  return gw;
}

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const wsServer = new WsServer(httpServer);

app.use('/api', createRouter(wsServer));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`[App] Server running on http://localhost:${PORT}`);

  const tokens = configStore.getTokens();
  if (tokens.length > 0) {
    console.log(`[App] Found ${tokens.length} Discord token(s), connecting...`);
    connectGateway(tokens, wsServer);
  } else {
    console.log('[App] No Discord tokens configured. Waiting for token setup via frontend.');
  }
});
