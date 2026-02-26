import { Router } from 'express';
import { configStore } from '../config/store.js';
import type { GatewayManager } from '../discord/gatewayManager.js';
import type { WsServer } from '../ws/server.js';
import { getGateway } from '../gateway/state.js';
import { processDiscordMessage } from '../utils/messageProcessor.js';
import { contractLog } from '../utils/contractLog.js';
import type { FrontendMessage } from '../discord/types.js';

export function createRouter(wsServer: WsServer): Router {
  const router = Router();

  function requireGateway(res: any): GatewayManager | null {
    const gw = getGateway();
    if (!gw) {
      res.status(503).json({ error: 'Discord not connected. Please configure your token first.' });
      return null;
    }
    return gw;
  }

  // --- Auth / Token Management ---

  router.get('/auth/status', (_req, res) => {
    const tokens = configStore.getTokens();
    const gw = getGateway();
    res.json({
      configured: tokens.length > 0,
      connected: gw !== null,
    });
  });

  router.post('/auth/token', async (_req, res) => {
    const { token } = _req.body;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'A valid Discord token is required.' });
    }

    const tokens = token.includes(',')
      ? token.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [token.trim()];

    configStore.setTokens(tokens);

    try {
      const { connectGateway } = await import('../index.js');
      connectGateway(tokens, wsServer);
      res.json({ success: true, tokenCount: tokens.length });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to connect: ${err.message}` });
    }
  });

  router.post('/auth/disconnect', (_req, res) => {
    configStore.setTokens([]);
    const gw = getGateway();
    if (gw) gw.disconnect();
    res.json({ success: true });
  });

  // --- Channel History ---

  router.get('/history', async (_req, res) => {
    const gateway = requireGateway(res);
    if (!gateway) return;

    const rooms = configStore.getRooms();
    const result: Record<string, FrontendMessage[]> = {};

    const channelToRooms = new Map<string, string[]>();
    for (const room of rooms) {
      for (const ch of room.channels) {
        const existing = channelToRooms.get(ch.channelId) ?? [];
        existing.push(room.id);
        channelToRooms.set(ch.channelId, existing);
      }
    }

    const BATCH_SIZE = 5;
    const channelIds = Array.from(channelToRooms.keys());

    for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
      const batch = channelIds.slice(i, i + BATCH_SIZE);
      const fetches = batch.map(async (channelId) => {
        const rawMessages = await gateway.fetchChannelMessages(channelId, 30);
        const roomIds = channelToRooms.get(channelId) ?? [];
        for (const rawMsg of rawMessages) {
          const frontendMsg = processDiscordMessage(gateway, rawMsg);
          for (const roomId of roomIds) {
            if (!result[roomId]) result[roomId] = [];
            result[roomId].push(frontendMsg);
          }
        }
      });
      await Promise.all(fetches);
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

  router.get('/guilds', (_req, res) => {
    const gateway = requireGateway(res);
    if (!gateway) return;
    const guilds = gateway.getGuilds();
    res.json(guilds);
  });

  router.get('/dm-channels', (_req, res) => {
    const gateway = requireGateway(res);
    if (!gateway) return;
    const dms = gateway.getDMChannels();
    res.json(dms);
  });

  // --- Rooms CRUD ---

  router.get('/rooms', (_req, res) => {
    res.json(configStore.getRooms());
  });

  router.get('/rooms/:id', (req, res) => {
    const room = configStore.getRoom(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  });

  router.post('/rooms', (req, res) => {
    const { name, channels, highlightedUsers, filteredUsers, filterEnabled, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const room = configStore.createRoom({
      name,
      channels: channels ?? [],
      highlightedUsers: highlightedUsers ?? [],
      filteredUsers: filteredUsers ?? [],
      filterEnabled: filterEnabled ?? false,
      color: color ?? null,
    });
    res.status(201).json(room);
  });

  router.put('/rooms/:id', (req, res) => {
    const { name, channels, highlightedUsers, filteredUsers, filterEnabled, color, keywordPatterns } = req.body;
    const room = configStore.updateRoom(req.params.id, {
      ...(name !== undefined && { name }),
      ...(channels !== undefined && { channels }),
      ...(highlightedUsers !== undefined && { highlightedUsers }),
      ...(filteredUsers !== undefined && { filteredUsers }),
      ...(filterEnabled !== undefined && { filterEnabled }),
      ...(color !== undefined && { color }),
      ...(keywordPatterns !== undefined && { keywordPatterns }),
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  });

  router.delete('/rooms/:id', (req, res) => {
    const deleted = configStore.deleteRoom(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true });
  });

  // --- Global Config ---

  router.get('/config', (_req, res) => {
    const { discordTokens, ...safeConfig } = configStore.getConfig();
    res.json(safeConfig);
  });

  router.put('/config', (req, res) => {
    const { globalHighlightedUsers, contractDetection, guildColors, enabledGuilds, hiddenUsers, evmAddressColor, solAddressColor, openInDiscordApp, messageSounds, pushover, contractLinkTemplates, autoOpenHighlightedContracts, globalKeywordPatterns, keywordAlertsEnabled, desktopNotifications } = req.body;
    const config = configStore.updateConfig({
      ...(globalHighlightedUsers !== undefined && { globalHighlightedUsers }),
      ...(contractDetection !== undefined && { contractDetection }),
      ...(guildColors !== undefined && { guildColors }),
      ...(enabledGuilds !== undefined && { enabledGuilds }),
      ...(hiddenUsers !== undefined && { hiddenUsers }),
      ...(evmAddressColor !== undefined && { evmAddressColor }),
      ...(solAddressColor !== undefined && { solAddressColor }),
      ...(openInDiscordApp !== undefined && { openInDiscordApp }),
      ...(messageSounds !== undefined && { messageSounds }),
      ...(pushover !== undefined && { pushover }),
      ...(contractLinkTemplates !== undefined && { contractLinkTemplates }),
      ...(autoOpenHighlightedContracts !== undefined && { autoOpenHighlightedContracts }),
      ...(globalKeywordPatterns !== undefined && { globalKeywordPatterns }),
      ...(keywordAlertsEnabled !== undefined && { keywordAlertsEnabled }),
      ...(desktopNotifications !== undefined && { desktopNotifications }),
    });
    res.json(config);
  });

  // --- Contracts ---

  router.get('/contracts', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const since = req.query.since as string | undefined;
    res.json(contractLog.getContracts(limit, since));
  });

  return router;
}
