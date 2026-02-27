import { create } from 'zustand';
import type { Room, FrontendMessage, Alert, AppConfig, GuildInfo, DMChannel, ContractEntry, FrontendReaction, AuthStatus, MaskedToken } from '../types';

const API_BASE = '/api';
const MAX_MESSAGES_PER_ROOM = 500;
const MAX_ALERTS = 50;
const MAX_CONTRACTS = 2000;

interface AppState {
  authStatus: AuthStatus | null;
  authLoading: boolean;
  rooms: Room[];
  activeRoomId: string | null;
  activeView: 'chat' | 'contracts' | 'settings';
  settingsSection: string | null;
  messages: Record<string, FrontendMessage[]>;
  alerts: Alert[];
  guilds: GuildInfo[];
  dmChannels: DMChannel[];
  config: AppConfig | null;
  configModalOpen: boolean;
  configModalTab: 'channels' | 'users' | 'filter' | 'keywords' | 'global' | null;
  editingRoom: Room | null;
  connected: boolean;
  focusFilter: { guildId: string | null; channelId: string; guildName: string | null; channelName: string } | null;
  contracts: ContractEntry[];
  maskedTokens: MaskedToken[];

  setConnected: (connected: boolean) => void;
  setFocusFilter: (filter: AppState['focusFilter']) => void;
  clearFocusFilter: () => void;
  setActiveRoom: (roomId: string | null) => void;
  setActiveView: (view: 'chat' | 'contracts' | 'settings', settingsSection?: string) => void;
  addMessage: (message: FrontendMessage, roomIds: string[]) => void;
  updateMessage: (update: { messageId: string; channelId: string; embeds?: FrontendMessage['embeds']; content?: string; attachments?: FrontendMessage['attachments'] }) => void;
  addAlert: (alert: Alert) => void;
  dismissAlert: (alertId: string) => void;
  updateReaction: (channelId: string, messageId: string, emoji: FrontendReaction['emoji'], delta: number) => void;
  addContract: (entry: ContractEntry) => void;
  updateContractChain: (address: string, evmChain: string) => void;
  deleteContract: (messageId: string, address: string) => Promise<void>;
  deleteAllContracts: () => Promise<void>;

  checkAuth: () => Promise<void>;
  submitToken: (token: string) => Promise<{ success: boolean; error?: string }>;
  fetchMaskedTokens: () => Promise<void>;
  addToken: (token: string) => Promise<{ success: boolean; error?: string }>;
  removeToken: (index: number) => Promise<{ success: boolean; error?: string }>;

  fetchRooms: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  fetchGuilds: () => Promise<void>;
  fetchDMChannels: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchContracts: () => Promise<void>;

  createRoom: (name: string, channels: Room['channels'], highlightedUsers: string[], color?: string | null, filteredUsers?: string[], filterEnabled?: boolean) => Promise<Room>;
  updateRoom: (id: string, data: Partial<Omit<Room, 'id'>>) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
  updateConfig: (data: Partial<Pick<AppConfig, 'globalHighlightedUsers' | 'contractDetection' | 'guildColors' | 'enabledGuilds' | 'evmAddressColor' | 'solAddressColor' | 'openInDiscordApp' | 'hiddenUsers' | 'messageSounds' | 'soundSettings' | 'pushover' | 'contractLinkTemplates' | 'contractClickAction' | 'autoOpenHighlightedContracts' | 'globalKeywordPatterns' | 'keywordAlertsEnabled' | 'desktopNotifications' | 'badgeClickAction'>>) => Promise<void>;
  hideUser: (guildId: string | null, channelId: string, userId: string, displayName: string) => Promise<void>;
  unhideUser: (guildId: string | null, channelId: string, userId: string) => Promise<void>;

  openConfigModal: (room?: Room, tab?: 'channels' | 'users' | 'filter' | 'keywords' | 'global') => void;
  closeConfigModal: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  authStatus: null,
  authLoading: true,
  rooms: [],
  activeRoomId: null,
  activeView: 'chat',
  settingsSection: null,
  messages: {},
  alerts: [],
  guilds: [],
  dmChannels: [],
  config: null,
  configModalOpen: false,
  configModalTab: null,
  editingRoom: null,
  connected: false,
  focusFilter: null,
  contracts: [],
  maskedTokens: [],

  setConnected: (connected) => set({ connected }),
  setFocusFilter: (filter) => set({ focusFilter: filter }),
  clearFocusFilter: () => set({ focusFilter: null }),

  checkAuth: async () => {
    try {
      set({ authLoading: true });
      const res = await fetch(`${API_BASE}/auth/status`);
      const status: AuthStatus = await res.json();
      set({ authStatus: status, authLoading: false });
    } catch {
      set({ authStatus: null, authLoading: false });
    }
  },

  submitToken: async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      set({ authStatus: { configured: true, connected: true } });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  fetchMaskedTokens: async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/tokens`);
      if (!res.ok) return;
      const data = await res.json();
      set({ maskedTokens: data.tokens ?? [] });
    } catch {}
  },

  addToken: async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/tokens/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await get().fetchMaskedTokens();
      set({ authStatus: { configured: true, connected: true } });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  removeToken: async (index: number) => {
    try {
      const res = await fetch(`${API_BASE}/auth/tokens/${index}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await get().fetchMaskedTokens();
      await get().checkAuth();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  setActiveRoom: (roomId) => set({ activeRoomId: roomId, activeView: 'chat' }),
  setActiveView: (view, settingsSection) => set({ activeView: view, settingsSection: settingsSection ?? null }),

  addMessage: (message, roomIds) => {
    set((state) => {
      const newMessages = { ...state.messages };
      for (const roomId of roomIds) {
        const existing = newMessages[roomId] ?? [];
        if (existing.some((m) => m.id === message.id)) continue;
        const updated = [...existing, message];
        if (updated.length > MAX_MESSAGES_PER_ROOM) {
          updated.splice(0, updated.length - MAX_MESSAGES_PER_ROOM);
        }
        newMessages[roomId] = updated;
      }
      return { messages: newMessages };
    });
  },

  updateMessage: (update) => {
    set((state) => {
      const newMessages = { ...state.messages };
      let changed = false;
      for (const roomId of Object.keys(newMessages)) {
        const msgs = newMessages[roomId];
        const idx = msgs.findIndex((m) => m.id === update.messageId && m.channelId === update.channelId);
        if (idx === -1) continue;
        changed = true;
        const msg = { ...msgs[idx] };
        if (update.embeds !== undefined) msg.embeds = update.embeds;
        if (update.content !== undefined) msg.content = update.content;
        if (update.attachments !== undefined) msg.attachments = update.attachments;
        const updated = [...msgs];
        updated[idx] = msg;
        newMessages[roomId] = updated;
      }
      return changed ? { messages: newMessages } : state;
    });
  },

  addAlert: (alert) => {
    set((state) => {
      const updated = [alert, ...state.alerts];
      if (updated.length > MAX_ALERTS) updated.length = MAX_ALERTS;
      return { alerts: updated };
    });
  },

  dismissAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== alertId),
    }));
  },

  updateReaction: (channelId, messageId, emoji, delta) => {
    set((state) => {
      const newMessages = { ...state.messages };
      let changed = false;
      for (const roomId of Object.keys(newMessages)) {
        const msgs = newMessages[roomId];
        const idx = msgs.findIndex((m) => m.id === messageId && m.channelId === channelId);
        if (idx === -1) continue;
        changed = true;
        const msg = { ...msgs[idx] };
        const reactions = [...(msg.reactions ?? [])];
        const emojiKey = emoji.id ?? emoji.name;
        const rIdx = reactions.findIndex((r) => (r.emoji.id ?? r.emoji.name) === emojiKey);
        if (rIdx >= 0) {
          const newCount = reactions[rIdx].count + delta;
          if (newCount <= 0) {
            reactions.splice(rIdx, 1);
          } else {
            reactions[rIdx] = { ...reactions[rIdx], count: newCount };
          }
        } else if (delta > 0) {
          reactions.push({ emoji, count: delta });
        }
        msg.reactions = reactions;
        const updated = [...msgs];
        updated[idx] = msg;
        newMessages[roomId] = updated;
      }
      return changed ? { messages: newMessages } : state;
    });
  },

  addContract: (entry) => {
    set((state) => {
      const updated = [entry, ...state.contracts];
      if (updated.length > MAX_CONTRACTS) updated.length = MAX_CONTRACTS;
      return { contracts: updated };
    });
  },

  updateContractChain: (address, evmChain) => {
    set((state) => ({
      contracts: state.contracts.map((c) =>
        c.address === address && c.chain === 'evm' ? { ...c, evmChain } : c,
      ),
    }));
  },

  deleteContract: async (messageId, address) => {
    try {
      const res = await fetch(`${API_BASE}/contracts/${messageId}/${encodeURIComponent(address)}`, { method: 'DELETE' });
      if (!res.ok) return;
      set((state) => ({
        contracts: state.contracts.filter((c) => !(c.messageId === messageId && c.address === address)),
      }));
    } catch (err) {
      console.error('[Store] Failed to delete contract:', err);
    }
  },

  deleteAllContracts: async () => {
    try {
      const res = await fetch(`${API_BASE}/contracts`, { method: 'DELETE' });
      if (!res.ok) return;
      set({ contracts: [] });
    } catch (err) {
      console.error('[Store] Failed to delete all contracts:', err);
    }
  },

  fetchRooms: async () => {
    const res = await fetch(`${API_BASE}/rooms`);
    const rooms: Room[] = await res.json();
    set({ rooms });
    if (rooms.length > 0 && !get().activeRoomId) {
      set({ activeRoomId: rooms[0].id });
    }
  },

  fetchHistory: async () => {
    try {
      const res = await fetch(`${API_BASE}/history`);
      if (!res.ok) return;
      const history: Record<string, FrontendMessage[]> = await res.json();
      set((state) => {
        const newMessages = { ...state.messages };
        for (const [roomId, msgs] of Object.entries(history)) {
          const existing = newMessages[roomId] ?? [];
          const existingIds = new Set(existing.map((m) => m.id));
          const fresh = msgs.filter((m) => !existingIds.has(m.id));
          if (fresh.length > 0) {
            const merged = [...fresh, ...existing];
            merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            if (merged.length > MAX_MESSAGES_PER_ROOM) {
              merged.splice(0, merged.length - MAX_MESSAGES_PER_ROOM);
            }
            newMessages[roomId] = merged;
          }
        }
        return { messages: newMessages };
      });
    } catch (err) {
      console.error('[Store] Failed to fetch history:', err);
    }
  },

  fetchGuilds: async () => {
    const res = await fetch(`${API_BASE}/guilds`);
    const guilds: GuildInfo[] = await res.json();
    set({ guilds });
  },

  fetchDMChannels: async () => {
    const res = await fetch(`${API_BASE}/dm-channels`);
    const dmChannels: DMChannel[] = await res.json();
    set({ dmChannels });
  },

  fetchConfig: async () => {
    const res = await fetch(`${API_BASE}/config`);
    const config: AppConfig = await res.json();
    set({ config });
  },

  fetchContracts: async () => {
    try {
      const res = await fetch(`${API_BASE}/contracts`);
      if (!res.ok) return;
      const contracts: ContractEntry[] = await res.json();
      set({ contracts });
    } catch (err) {
      console.error('[Store] Failed to fetch contracts:', err);
    }
  },

  createRoom: async (name, channels, highlightedUsers, color, filteredUsers, filterEnabled) => {
    const res = await fetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, channels, highlightedUsers, color: color ?? null, filteredUsers: filteredUsers ?? [], filterEnabled: filterEnabled ?? false }),
    });
    const room: Room = await res.json();
    await get().fetchRooms();
    return room;
  },

  updateRoom: async (id, data) => {
    await fetch(`${API_BASE}/rooms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await get().fetchRooms();
  },

  deleteRoom: async (id) => {
    await fetch(`${API_BASE}/rooms/${id}`, { method: 'DELETE' });
    const state = get();
    if (state.activeRoomId === id) {
      const remaining = state.rooms.filter((r) => r.id !== id);
      set({ activeRoomId: remaining[0]?.id ?? null });
    }
    await get().fetchRooms();
  },

  updateConfig: async (data) => {
    await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await get().fetchConfig();
  },

  hideUser: async (guildId, channelId, userId, displayName) => {
    const config = get().config;
    if (!config) return;
    const key = `${guildId ?? 'null'}:${channelId}`;
    const current = config.hiddenUsers?.[key] ?? [];
    if (current.some((e) => e.userId === userId)) return;
    const hiddenUsers = { ...config.hiddenUsers, [key]: [...current, { userId, displayName }] };
    await get().updateConfig({ hiddenUsers });
  },

  unhideUser: async (guildId, channelId, userId) => {
    const config = get().config;
    if (!config) return;
    const key = `${guildId ?? 'null'}:${channelId}`;
    const current = config.hiddenUsers?.[key] ?? [];
    const filtered = current.filter((e) => e.userId !== userId);
    const hiddenUsers = { ...config.hiddenUsers };
    if (filtered.length === 0) {
      delete hiddenUsers[key];
    } else {
      hiddenUsers[key] = filtered;
    }
    await get().updateConfig({ hiddenUsers });
  },

  openConfigModal: (room, tab) => set({ configModalOpen: true, editingRoom: room ?? null, configModalTab: tab ?? null }),
  closeConfigModal: () => set({ configModalOpen: false, editingRoom: null, configModalTab: null }),
}));
