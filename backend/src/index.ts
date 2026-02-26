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
import { buildContractUrl } from './utils/contract.js';
import { processDiscordMessage } from './utils/messageProcessor.js';
import { sendPushover } from './utils/pushover.js';
import { contractLog } from './utils/contractLog.js';
import type { DiscordMessage } from './discord/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

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

    if (frontendMsg.isHighlighted && frontendMsg.hasContractAddress) {
      const cfg = configStore.getConfig();
      const addr = frontendMsg.contractAddresses[0];
      const url = buildContractUrl(addr, cfg.contractLinkTemplates);

      sendPushover(cfg.pushover, {
        title: `Contract Alert: ${frontendMsg.author.displayName}`,
        message: `${frontendMsg.author.displayName} posted ${addr} in #${frontendMsg.channelName}`,
        url,
        urlTitle: 'Open in Explorer',
      });
    }

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
          authorId: frontendMsg.author.id,
          authorName: frontendMsg.author.displayName,
          channelId: frontendMsg.channelId,
          channelName: frontendMsg.channelName,
          guildName: frontendMsg.guildName,
          roomIds,
          messageId: frontendMsg.id,
          timestamp: frontendMsg.timestamp,
        };
        contractLog.logContract(entry);
        wsServer.broadcastContract(entry);
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
