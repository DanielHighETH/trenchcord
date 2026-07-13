import { create } from 'zustand';
import type { Room, FrontendMessage, Alert, AppConfig, GuildInfo, DMChannel, ContractEntry, FrontendReaction, ReactionUser, AuthStatus, MaskedToken, TelegramChatInfo } from '../types';
import { isDemoMode, createDemoOverrides } from '../demo/demoStore';
import { isHostedMode, getAccessToken } from '../lib/supabase';
import { markTokenEverConfigured } from '../utils/tokenState';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';
const MAX_MESSAGES_PER_ROOM = 1000;
const MAX_ALERTS = 50;
const MAX_CONTRACTS = 2000;
const MAX_PANES = 4;
const PANE_STORAGE_KEY = 'trenchcord.paneRoomIds';

function loadPaneRoomIds(): string[] {
  try {
    const raw = localStorage.getItem(PANE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_PANES);
  } catch {}
  return [];
}

function savePaneRoomIds(ids: string[]): void {
  try { localStorage.setItem(PANE_STORAGE_KEY, JSON.stringify(ids)); } catch {}
}

const EDIT_MODE_STORAGE_KEY = 'trenchcord.layoutEditMode';
const GRID_MIRROR_STORAGE_KEY = 'trenchcord.gridMirror';

function loadLayoutEditMode(): boolean {
  try { return localStorage.getItem(EDIT_MODE_STORAGE_KEY) === '1'; } catch { return false; }
}

function loadGridMirror(): boolean {
  try { return localStorage.getItem(GRID_MIRROR_STORAGE_KEY) === '1'; } catch { return false; }
}

// Picks a room/DM/mentions key to fill a new pane slot, avoiding the ones
// already shown when possible, falling back to duplicates.
function pickPaneFill(state: { rooms: Room[]; messages: Record<string, FrontendMessage[]> }, taken: string[]): string {
  const takenSet = new Set(taken);
  for (const r of state.rooms) if (!takenSet.has(r.id)) return r.id;
  for (const key of Object.keys(state.messages)) {
    if ((key.startsWith('dm:') || key.startsWith('tg-dm:')) && (state.messages[key]?.length ?? 0) > 0 && !takenSet.has(key)) {
      return key;
    }
  }
  if (!takenSet.has('mentions')) return 'mentions';
  return taken[0] ?? state.rooms[0]?.id ?? 'mentions';
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (isHostedMode) {
    const token = await getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  return fetch(input, { ...init, headers });
}

interface AppState {
  authStatus: AuthStatus | null;
  authLoading: boolean;
  rooms: Room[];
  activeRoomId: string | null;
  paneRoomIds: string[];
  paneLocks: boolean[];
  activePaneIndex: number;
  unreadCounts: Record<string, number>;
  layoutEditMode: boolean;
  gridMirror: boolean;
  _layoutHydrated: boolean;
  activeView: 'chat' | 'contracts' | 'settings' | 'profile';
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
  sidebarCollapsed: boolean;
  telegramChats: TelegramChatInfo[];
  gatewayAuthError: string | null;
  previewMode: boolean;

  setPreviewMode: (value: boolean) => void;
  importSettings: (raw: unknown) => Promise<{ success: boolean; error?: string }>;
  setGatewayAuthError: (error: string | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setConnected: (connected: boolean) => void;
  setFocusFilter: (filter: AppState['focusFilter']) => void;
  clearFocusFilter: () => void;
  setActiveRoom: (roomId: string | null) => void;
  setPaneRoom: (index: number, roomId: string) => void;
  setActivePane: (index: number) => void;
  togglePaneLock: (index: number) => void;
  addPane: () => void;
  removePane: (index: number) => void;
  swapPanes: (a: number, b: number) => void;
  toggleLayoutEditMode: () => void;
  setGridMirror: (value: boolean) => void;
  moveGridBottomChat: () => void;
  persistLayout: () => void;
  setActiveView: (view: 'chat' | 'contracts' | 'settings' | 'profile', settingsSection?: string) => void;
  addMessage: (message: FrontendMessage, roomIds: string[], isLive?: boolean) => void;
  updateMessage: (update: { messageId: string; channelId: string; embeds?: FrontendMessage['embeds']; content?: string; attachments?: FrontendMessage['attachments']; editedTimestamp?: string | null }) => void;
  markMessageDeleted: (data: { messageId: string; channelId: string }) => void;
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
  fetchReactionUsers: (channelId: string, messageId: string, emoji: FrontendReaction['emoji']) => Promise<ReactionUser[]>;

  createRoom: (name: string, channels: Room['channels'], highlightedUsers: string[], color?: string | null, filteredUsers?: string[], filterEnabled?: boolean) => Promise<Room>;
  updateRoom: (id: string, data: Partial<Omit<Room, 'id'>>) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
  updateConfig: (data: Partial<Pick<AppConfig, 'globalHighlightedUsers' | 'contractDetection' | 'guildColors' | 'dmColors' | 'telegramColors' | 'enabledGuilds' | 'evmAddressColor' | 'solAddressColor' | 'openInDiscordApp' | 'openInTelegramApp' | 'hiddenUsers' | 'messageSounds' | 'soundSettings' | 'channelSounds' | 'pushover' | 'contractLinkTemplates' | 'contractClickAction' | 'showFullContractAddress' | 'autoOpenHighlightedContracts' | 'globalKeywordPatterns' | 'keywordAlertsEnabled' | 'desktopNotifications' | 'mentionsUserEnabled' | 'mentionsRoleEnabled' | 'mentionsHereEnabled' | 'mentionsEveryoneEnabled' | 'badgeClickAction' | 'chattingEnabled' | 'messageDisplay' | 'compactModeAvatars' | 'roleColors' | 'mobileZoomScale' | 'splitLayout'>>) => Promise<void>;
  sendMessage: (channelId: string, content: string, files?: File[], source?: 'discord' | 'telegram') => Promise<{ success: boolean; error?: string }>;
  hideUser: (guildId: string | null, channelId: string, userId: string, displayName: string) => Promise<void>;
  unhideUser: (guildId: string | null, channelId: string, userId: string) => Promise<void>;

  openConfigModal: (room?: Room, tab?: 'channels' | 'users' | 'filter' | 'keywords' | 'global') => void;
  closeConfigModal: () => void;

  fetchTelegramChats: () => Promise<void>;
  telegramAuthStart: (apiId: string, apiHash: string, phoneNumber: string) => Promise<{ success: boolean; error?: string; needs2FA?: boolean }>;
  telegramAuthVerify: (phoneCode: string, password?: string) => Promise<{ success: boolean; error?: string; needs2FA?: boolean }>;
  telegramAuth2FA: (password: string) => Promise<{ success: boolean; error?: string }>;
  telegramDisconnect: () => Promise<{ success: boolean; error?: string }>;
}

export const useAppStore = create<AppState>((set, get) => {
  const demo = isDemoMode ? createDemoOverrides(set as any, get as any) : null;

  return {
  authStatus: null,
  authLoading: true,
  rooms: [],
  activeRoomId: loadPaneRoomIds()[0] ?? null,
  paneRoomIds: loadPaneRoomIds(),
  paneLocks: [],
  activePaneIndex: 0,
  unreadCounts: {},
  layoutEditMode: loadLayoutEditMode(),
  gridMirror: loadGridMirror(),
  _layoutHydrated: false,
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
  sidebarCollapsed: false,
  telegramChats: [],
  gatewayAuthError: null,
  previewMode: false,

  setPreviewMode: (value) => set({ previewMode: value }),

  importSettings: async (raw) => {
    try {
      if (!raw || typeof raw !== 'object') {
        return { success: false, error: 'Invalid settings file.' };
      }

      // Support both the sanitized export ({ config, rooms }) and a raw local
      // backend/data/config.json (flat AppConfig with discordTokens + rooms).
      const data = raw as Record<string, any>;
      let configPayload: Record<string, any>;
      let roomsPayload: unknown;
      let tokens: unknown[] = [];

      if (data.config && typeof data.config === 'object') {
        configPayload = data.config;
        roomsPayload = Array.isArray(data.rooms) ? data.rooms : undefined;
        if (Array.isArray(data.config.discordTokens)) tokens = data.config.discordTokens;
      } else {
        const { rooms, discordTokens, ...rest } = data;
        configPayload = rest;
        roomsPayload = Array.isArray(rooms) ? rooms : undefined;
        if (Array.isArray(discordTokens)) tokens = discordTokens;
      }

      const res = await apiFetch(`${API_BASE}/config/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configPayload, rooms: roomsPayload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || 'Failed to import settings.' };
      }

      const validTokens = tokens
        .map((t) => (typeof t === 'string' ? t.trim() : ''))
        .filter(Boolean);

      if (validTokens.length > 0) {
        const tokenResult = await get().submitToken(validTokens.join(','));
        await get().fetchConfig();
        await get().fetchRooms();
        if (!tokenResult.success) {
          // Settings imported, but the token didn't connect. Keep the user on
          // the setup screen (with a clear error) rather than silently entering.
          return {
            success: false,
            error:
              tokenResult.error ??
              'Settings imported, but the Discord token could not connect. Enter a token or continue without one.',
          };
        }
        await get().checkAuth();
        return { success: true };
      }

      // No token in the file: enter the app in preview so imported settings show.
      set({ previewMode: true });
      await get().fetchConfig();
      await get().fetchRooms();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? 'Failed to import settings.' };
    }
  },

  setGatewayAuthError: (error) => set({ gatewayAuthError: error }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setConnected: (connected) => set({ connected }),
  setFocusFilter: (filter) => set({ focusFilter: filter }),
  clearFocusFilter: () => set({ focusFilter: null }),

  checkAuth: async () => {
    if (demo) return demo.checkAuth();
    try {
      set({ authLoading: true });
      const res = await apiFetch(`${API_BASE}/auth/status`);
      if (!res.ok) {
        set({ authStatus: null, authLoading: false });
        return;
      }
      const status: AuthStatus = await res.json();
      if (status?.configured) {
        markTokenEverConfigured();
      }
      set({ authStatus: status, authLoading: false });
    } catch {
      set({ authStatus: null, authLoading: false });
    }
  },

  submitToken: async (token: string) => {
    if (demo) return demo.submitToken();
    try {
      const res = await apiFetch(`${API_BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      markTokenEverConfigured();
      set({ authStatus: { configured: true, connected: true } });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  fetchMaskedTokens: async () => {
    if (demo) return demo.fetchMaskedTokens();
    try {
      const res = await apiFetch(`${API_BASE}/auth/tokens`);
      if (!res.ok) return;
      const data = await res.json();
      set({ maskedTokens: data.tokens ?? [] });
    } catch {}
  },

  addToken: async (token: string) => {
    if (demo) return demo.addToken();
    try {
      const res = await apiFetch(`${API_BASE}/auth/tokens/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      markTokenEverConfigured();
      await get().fetchMaskedTokens();
      set({ authStatus: { configured: true, connected: true } });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  removeToken: async (index: number) => {
    if (demo) return demo.removeToken();
    try {
      const res = await apiFetch(`${API_BASE}/auth/tokens/${index}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await get().fetchMaskedTokens();
      await get().checkAuth();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // Opening a room from the sidebar replaces the first (primary) pane and keeps
  // any additional split panes intact, so a built layout survives a sidebar click.
  // Opening a room from the sidebar/hotkey changes the currently focused pane
  // (not always the first), and never changes a locked pane.
  setActiveRoom: (roomId) => {
    set((state) => {
      if (roomId === null) return { activeRoomId: null, activeView: 'chat' };
      if (state.paneRoomIds.length === 0) {
        savePaneRoomIds([roomId]);
        return { activeRoomId: roomId, activeView: 'chat', paneRoomIds: [roomId], activePaneIndex: 0, unreadCounts: { ...state.unreadCounts, [roomId]: 0 } };
      }
      const idx = Math.min(state.activePaneIndex, state.paneRoomIds.length - 1);
      if (state.paneLocks[idx]) {
        // Focused pane is locked: just make sure we're on the chat view.
        return { activeView: 'chat' };
      }
      const panes = [...state.paneRoomIds];
      panes[idx] = roomId;
      savePaneRoomIds(panes);
      return {
        activeRoomId: panes[0] ?? null,
        activeView: 'chat',
        paneRoomIds: panes,
        unreadCounts: { ...state.unreadCounts, [roomId]: 0 },
      };
    });
    get().persistLayout();
  },

  setPaneRoom: (index, roomId) => {
    set((state) => {
      if (index < 0 || index >= state.paneRoomIds.length) return state;
      if (state.paneLocks[index]) return state;
      const panes = [...state.paneRoomIds];
      panes[index] = roomId;
      savePaneRoomIds(panes);
      return {
        paneRoomIds: panes,
        activeRoomId: panes[0] ?? null,
        activePaneIndex: index,
        unreadCounts: { ...state.unreadCounts, [roomId]: 0 },
      };
    });
    get().persistLayout();
  },

  setActivePane: (index) => set((state) => {
    if (index < 0 || index >= state.paneRoomIds.length || index === state.activePaneIndex) return state;
    return { activePaneIndex: index };
  }),

  togglePaneLock: (index) => {
    set((state) => {
      if (index < 0 || index >= state.paneRoomIds.length) return state;
      const locks = [...state.paneLocks];
      while (locks.length < state.paneRoomIds.length) locks.push(false);
      locks[index] = !locks[index];
      return { paneLocks: locks };
    });
    get().persistLayout();
  },

  // Add a new pane (up to MAX_PANES), auto-filling with a room not already shown.
  addPane: () => {
    set((state) => {
      if (state.paneRoomIds.length >= MAX_PANES) return { activeView: 'chat' };
      const fill = pickPaneFill(state, state.paneRoomIds);
      const panes = [...state.paneRoomIds, fill];
      const locks = [...state.paneLocks];
      while (locks.length < panes.length) locks.push(false);
      savePaneRoomIds(panes);
      const unreadCounts = { ...state.unreadCounts };
      if (state.activeView === 'chat') unreadCounts[fill] = 0;
      return { paneRoomIds: panes, paneLocks: locks, activeView: 'chat', unreadCounts };
    });
    get().persistLayout();
  },

  removePane: (index) => {
    set((state) => {
      if (state.paneRoomIds.length <= 1) return state;
      const panes = state.paneRoomIds.filter((_, i) => i !== index);
      const locks = state.paneLocks.filter((_, i) => i !== index);
      savePaneRoomIds(panes);
      const activePaneIndex = Math.min(state.activePaneIndex, panes.length - 1);
      return { paneRoomIds: panes, paneLocks: locks, activeRoomId: panes[0] ?? null, activePaneIndex };
    });
    get().persistLayout();
  },

  swapPanes: (a, b) => {
    set((state) => {
      if (a === b || a < 0 || b < 0 || a >= state.paneRoomIds.length || b >= state.paneRoomIds.length) return state;
      if (state.paneLocks[a] || state.paneLocks[b]) return state;
      const panes = [...state.paneRoomIds];
      [panes[a], panes[b]] = [panes[b], panes[a]];
      const locks = [...state.paneLocks];
      while (locks.length < panes.length) locks.push(false);
      [locks[a], locks[b]] = [locks[b], locks[a]];
      savePaneRoomIds(panes);
      return { paneRoomIds: panes, paneLocks: locks, activeRoomId: panes[0] ?? null };
    });
    get().persistLayout();
  },

  toggleLayoutEditMode: () => set((state) => {
    const next = !state.layoutEditMode;
    try { localStorage.setItem(EDIT_MODE_STORAGE_KEY, next ? '1' : '0'); } catch {}
    return { layoutEditMode: next };
  }),

  setGridMirror: (value) => {
    try { localStorage.setItem(GRID_MIRROR_STORAGE_KEY, value ? '1' : '0'); } catch {}
    set({ gridMirror: value });
    get().persistLayout();
  },

  // In a 3-pane two-rows grid, move the bottom stacked chat to the other
  // column's bottom (the remaining chats re-fill). With only two columns this
  // is exactly reversing the pane order and flipping the mirror.
  moveGridBottomChat: () => {
    set((state) => {
      const panes = [...state.paneRoomIds].reverse();
      const locks = [...state.paneLocks];
      while (locks.length < state.paneRoomIds.length) locks.push(false);
      const newLocks = locks.slice(0, state.paneRoomIds.length).reverse();
      const mirror = !state.gridMirror;
      savePaneRoomIds(panes);
      try { localStorage.setItem(GRID_MIRROR_STORAGE_KEY, mirror ? '1' : '0'); } catch {}
      return {
        paneRoomIds: panes,
        paneLocks: newLocks,
        gridMirror: mirror,
        activeRoomId: panes[0] ?? null,
        activePaneIndex: Math.max(0, state.paneRoomIds.length - 1 - state.activePaneIndex),
      };
    });
    get().persistLayout();
  },

  // Persist the current split layout (panes + mirror) to the backend config so
  // it survives restarts even when localStorage is unavailable (desktop app).
  persistLayout: () => {
    if (demo) return;
    const { paneRoomIds, paneLocks, gridMirror } = get();
    apiFetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paneRoomIds, paneLocks, gridMirror }),
    }).catch(() => {});
  },

  setActiveView: (view, settingsSection) => set((state) => {
    // Returning to the chat view means the open panes are visible again, so
    // clear their unread badges.
    if (view === 'chat' && state.paneRoomIds.length > 0) {
      const unreadCounts = { ...state.unreadCounts };
      for (const id of state.paneRoomIds) unreadCounts[id] = 0;
      return { activeView: view, settingsSection: settingsSection ?? null, unreadCounts };
    }
    return { activeView: view, settingsSection: settingsSection ?? null };
  }),

  addMessage: (message, roomIds, isLive = false) => {
    set((state) => {
      const newMessages = { ...state.messages };
      const newUnread = { ...state.unreadCounts };
      let unreadChanged = false;
      const visible = state.activeView === 'chat' ? new Set(state.paneRoomIds) : new Set<string>();
      for (const roomId of roomIds) {
        const existing = newMessages[roomId] ?? [];
        if (existing.some((m) => m.id === message.id)) continue;
        const updated = [...existing, message];
        if (updated.length > MAX_MESSAGES_PER_ROOM) {
          updated.splice(0, updated.length - MAX_MESSAGES_PER_ROOM);
        }
        newMessages[roomId] = updated;
        if (isLive && !visible.has(roomId)) {
          newUnread[roomId] = (newUnread[roomId] ?? 0) + 1;
          unreadChanged = true;
        }
      }
      return unreadChanged ? { messages: newMessages, unreadCounts: newUnread } : { messages: newMessages };
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
        const isGenuineEdit = !!update.editedTimestamp;
        const contentChanged = update.content !== undefined && update.content !== msg.content;
        if (isGenuineEdit && contentChanged) {
          if (msg.originalContent === undefined) msg.originalContent = msg.content;
          msg.isEdited = true;
          msg.editedTimestamp = update.editedTimestamp;
        }
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

  markMessageDeleted: (data) => {
    set((state) => {
      const newMessages = { ...state.messages };
      let changed = false;
      for (const roomId of Object.keys(newMessages)) {
        const msgs = newMessages[roomId];
        const idx = msgs.findIndex((m) => m.id === data.messageId && m.channelId === data.channelId);
        if (idx === -1) continue;
        if (msgs[idx].isDeleted) continue;
        changed = true;
        const updated = [...msgs];
        updated[idx] = { ...msgs[idx], isDeleted: true };
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
    if (demo) return demo.deleteContract(messageId, address);
    try {
      const res = await apiFetch(`${API_BASE}/contracts/${messageId}/${encodeURIComponent(address)}`, { method: 'DELETE' });
      if (!res.ok) return;
      set((state) => ({
        contracts: state.contracts.filter((c) => !(c.messageId === messageId && c.address === address)),
      }));
    } catch (err) {
      console.error('[Store] Failed to delete contract:', err);
    }
  },

  deleteAllContracts: async () => {
    if (demo) return demo.deleteAllContracts();
    try {
      const res = await apiFetch(`${API_BASE}/contracts`, { method: 'DELETE' });
      if (!res.ok) return;
      set({ contracts: [] });
    } catch (err) {
      console.error('[Store] Failed to delete all contracts:', err);
    }
  },

  fetchRooms: async () => {
    if (demo) return demo.fetchRooms();
    try {
      const res = await apiFetch(`${API_BASE}/rooms`);
      if (!res.ok) return;
      const rooms: Room[] = await res.json();
      set({ rooms });
      if (rooms.length > 0 && !get().activeRoomId) {
        const firstId = rooms[0].id;
        savePaneRoomIds([firstId]);
        set({ activeRoomId: firstId, paneRoomIds: [firstId] });
      }
    } catch {}
  },

  fetchHistory: async () => {
    if (demo) return demo.fetchHistory();
    try {
      const res = await apiFetch(`${API_BASE}/history`);
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
    if (demo) return demo.fetchGuilds();
    try {
      const res = await apiFetch(`${API_BASE}/guilds`);
      if (!res.ok) return;
      const guilds: GuildInfo[] = await res.json();
      set({ guilds });
    } catch {}
  },

  fetchDMChannels: async () => {
    if (demo) return demo.fetchDMChannels();
    try {
      const res = await apiFetch(`${API_BASE}/dm-channels`);
      if (!res.ok) return;
      const dmChannels: DMChannel[] = await res.json();
      set({ dmChannels });
    } catch {}
  },

  fetchConfig: async () => {
    if (demo) return demo.fetchConfig();
    try {
      const res = await apiFetch(`${API_BASE}/config`);
      if (!res.ok) return;
      const config: AppConfig = await res.json();
      set((state) => {
        // Hydrate the split layout from the server config once on startup. This
        // is the durable source of truth (localStorage is lost on desktop since
        // the app runs on a random port each launch → a fresh origin).
        if (state._layoutHydrated) return { config };
        const patch: Partial<AppState> = { config, _layoutHydrated: true };
        if (Array.isArray(config.paneRoomIds) && config.paneRoomIds.length > 0) {
          const panes = config.paneRoomIds.slice(0, MAX_PANES);
          savePaneRoomIds(panes);
          patch.paneRoomIds = panes;
          patch.activeRoomId = panes[0] ?? state.activeRoomId;
          patch.paneLocks = Array.isArray(config.paneLocks) ? config.paneLocks.slice(0, panes.length) : [];
        }
        if (typeof config.gridMirror === 'boolean') patch.gridMirror = config.gridMirror;
        return patch;
      });
    } catch {}
  },

  fetchContracts: async () => {
    if (demo) return demo.fetchContracts();
    try {
      const res = await apiFetch(`${API_BASE}/contracts`);
      if (!res.ok) return;
      const contracts: ContractEntry[] = await res.json();
      set({ contracts });
    } catch (err) {
      console.error('[Store] Failed to fetch contracts:', err);
    }
  },

  fetchReactionUsers: async (channelId, messageId, emoji) => {
    if (demo) return [];
    const params = new URLSearchParams({ name: emoji.name });
    if (emoji.id) params.set('id', emoji.id);
    const res = await apiFetch(`${API_BASE}/reactions/${channelId}/${messageId}?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch reaction users');
    return res.json();
  },

  createRoom: async (name, channels, highlightedUsers, color, filteredUsers, filterEnabled) => {
    if (demo) return demo.createRoom(name, channels, highlightedUsers, color, filteredUsers, filterEnabled);
    const res = await apiFetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, channels, highlightedUsers, color: color ?? null, filteredUsers: filteredUsers ?? [], filterEnabled: filterEnabled ?? false }),
    });
    const room: Room = await res.json();
    await get().fetchRooms();
    return room;
  },

  updateRoom: async (id, data) => {
    if (demo) return demo.updateRoom(id, data);
    await apiFetch(`${API_BASE}/rooms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await get().fetchRooms();
  },

  deleteRoom: async (id) => {
    if (demo) return demo.deleteRoom(id);
    await apiFetch(`${API_BASE}/rooms/${id}`, { method: 'DELETE' });
    const state = get();
    const remaining = state.rooms.filter((r) => r.id !== id);
    let panes = state.paneRoomIds.filter((p) => p !== id);
    if (panes.length === 0) {
      const fallback = remaining[0]?.id;
      panes = fallback ? [fallback] : [];
    }
    savePaneRoomIds(panes);
    set({ paneRoomIds: panes, activeRoomId: panes[0] ?? null });
    get().persistLayout();
    await get().fetchRooms();
  },

  updateConfig: async (data) => {
    if (demo) return demo.updateConfig(data);
    await apiFetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await get().fetchConfig();
  },

  sendMessage: async (channelId, content, files, source) => {
    try {
      const formData = new FormData();
      formData.append('channelId', channelId);
      formData.append('content', content);
      if (source) {
        formData.append('source', source);
      }
      if (files) {
        for (const file of files) {
          formData.append('files', file);
        }
      }
      const res = await apiFetch(`${API_BASE}/send-message`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  hideUser: async (guildId, channelId, userId, displayName) => {
    if (demo) return demo.hideUser(guildId, channelId, userId, displayName);
    const config = get().config;
    if (!config) return;
    const key = `${guildId ?? 'null'}:${channelId}`;
    const current = config.hiddenUsers?.[key] ?? [];
    if (current.some((e) => e.userId === userId)) return;
    const hiddenUsers = { ...config.hiddenUsers, [key]: [...current, { userId, displayName }] };
    await get().updateConfig({ hiddenUsers });
  },

  unhideUser: async (guildId, channelId, userId) => {
    if (demo) return demo.unhideUser(guildId, channelId, userId);
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

  fetchTelegramChats: async () => {
    try {
      const res = await apiFetch(`${API_BASE}/telegram/chats`);
      if (!res.ok) return;
      const chats: TelegramChatInfo[] = await res.json();
      set({ telegramChats: chats });
    } catch {}
  },

  telegramAuthStart: async (apiId, apiHash, phoneNumber) => {
    try {
      const res = await apiFetch(`${API_BASE}/auth/telegram/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId, apiHash, phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  telegramAuthVerify: async (phoneCode, password) => {
    try {
      const res = await apiFetch(`${API_BASE}/auth/telegram/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneCode, password }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      if (data.needs2FA) return { success: false, needs2FA: true };
      await get().checkAuth();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  telegramAuth2FA: async (password) => {
    try {
      const res = await apiFetch(`${API_BASE}/auth/telegram/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await get().checkAuth();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  telegramDisconnect: async () => {
    try {
      const res = await apiFetch(`${API_BASE}/auth/telegram/disconnect`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      set({ telegramChats: [] });
      await get().checkAuth();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  openConfigModal: (room, tab) => set({ configModalOpen: true, editingRoom: room ?? null, configModalTab: tab ?? null }),
  closeConfigModal: () => set({ configModalOpen: false, editingRoom: null, configModalTab: null }),
};
});
