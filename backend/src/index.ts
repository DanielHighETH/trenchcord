import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { GatewayManager } from './discord/gatewayManager.js';
import { WsServer } from './ws/server.js';
import { createRouter } from './api/routes.js';
import { configStore } from './config/store.js';
import { buildContractUrl } from './utils/contract.js';
import { processDiscordMessage } from './utils/messageProcessor.js';
import { sendPushover } from './utils/pushover.js';
import { contractLog } from './utils/contractLog.js';
import type { DiscordMessage } from './discord/types.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const tokens: string[] = [];
if (process.env.DISCORD_TOKENS) {
  tokens.push(...process.env.DISCORD_TOKENS.split(',').map((t) => t.trim()).filter(Boolean));
} else if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'your_discord_token_here') {
  tokens.push(process.env.DISCORD_TOKEN);
}

if (tokens.length === 0) {
  console.error('ERROR: Set DISCORD_TOKEN or DISCORD_TOKENS (comma-separated) in backend/.env');
  process.exit(1);
}

console.log(`[App] Starting with ${tokens.length} Discord token(s)`);

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const gateway = new GatewayManager(tokens);
const wsServer = new WsServer(httpServer);

app.use('/api', createRouter(gateway));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

gateway.on('ready', (user) => {
  console.log(`[App] Logged in as ${user.username}`);
});

gateway.on('message', (rawMsg: DiscordMessage & { _channelName: string; _guildName: string | null }) => {
  const isDM = !rawMsg.guild_id && gateway.getDMChannels().some((dm) => dm.id === rawMsg.channel_id);
  const rooms = configStore.getRoomsForChannel(rawMsg.channel_id);

  if (rooms.length === 0 && !isDM) return;

  const roomKeywords = rooms.flatMap((r) => r.keywordPatterns ?? []);
  const frontendMsg = processDiscordMessage(gateway, rawMsg, rawMsg._channelName, rawMsg._guildName, roomKeywords);

  if (frontendMsg.isHighlighted && frontendMsg.hasContractAddress) {
    const config = configStore.getConfig();
    const addr = frontendMsg.contractAddresses[0];
    const url = buildContractUrl(addr, config.contractLinkTemplates);

    sendPushover(config.pushover, {
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

gateway.on('reactionUpdate', (data) => {
  wsServer.broadcastReactionUpdate(data);
});

gateway.on('fatal', (err: Error) => {
  console.error('[App] Fatal gateway error:', err.message);
});

httpServer.listen(PORT, () => {
  console.log(`[App] Server running on http://localhost:${PORT}`);
  gateway.connect();
});
