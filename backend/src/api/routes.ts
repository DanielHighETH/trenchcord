import { Router } from 'express';
import { configStore } from '../config/store.js';
import type { GatewayManager } from '../discord/gatewayManager.js';
import { processDiscordMessage } from '../utils/messageProcessor.js';
import { contractLog } from '../utils/contractLog.js';
import type { FrontendMessage } from '../discord/types.js';

export function createRouter(gateway: GatewayManager): Router {
  const router = Router();

  // --- Channel History ---

  router.get('/history', async (_req, res) => {
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
    const guilds = gateway.getGuilds();
    res.json(guilds);
  });

  router.get('/dm-channels', (_req, res) => {
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
    res.json(configStore.getConfig());
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
