import { create } from 'zustand';
import type { Room, FrontendMessage, Alert, AppConfig, GuildInfo, GuildRole, DMChannel, ContractEntry, FrontendReaction, ReactionUser, AuthStatus, MaskedToken, TelegramAccount, TelegramChatInfo, TradingStatus, CloudSubscriptionStatus, CloudLinkState, PriceAlert, TweetAlert, TelegramTrack, PremiumEvent, PremiumNotifyPrefs, PremiumBots, PremiumOverview, PushoverProfile } from '../types';
import { isDemoMode, createDemoOverrides } from '../demo/demoStore';
import { loadSoundsMuted, setSoundsMuted } from '../utils/notificationSound';
import { isHostedMode, getAccessToken } from '../lib/supabase';
import { markTokenEverConfigured } from '../utils/tokenState';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';
const MAX_MESSAGES_PER_ROOM = 1000;
const MAX_ALERTS = 50;
/** Monotonic id for in-flight /guilds fetches — see fetchGuilds. */
let guildsFetchSeq = 0;
const MAX_PREMIUM_EVENTS = 200;
const MAX_CONTRACTS = 2000;
const MAX_PANES = 4;
const MAX_TOASTS = 4;

/**
 * A general-purpose transient message. Distinct from `Alert`, which is
 * WebSocket-driven and carries a whole FrontendMessage.
 */
export interface Toast {
  id: string;
  kind: 'success' | 'error';
  title: string;
  detail?: string;
}

/** Per-wallet outcome of one buy click. */
export interface BuyWalletResult {
  walletId: string;
  label: string;
  solAmount: number;
  ok: boolean;
  signature?: string;
  error?: string;
  code?: string;
}

export interface BuyOutcome {
  success: boolean;
  error?: string;
  walletCount?: number;
  succeeded?: number;
  failed?: number;
  /** SOL actually spent across the wallets that succeeded. */
  spent?: number;
  results?: BuyWalletResult[];
}

function deriveAddressChains(contracts: ContractEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of contracts) {
    if (c.chain === 'evm' && c.evmChain) map[c.address.toLowerCase()] = c.evmChain;
  }
  return map;
}
const PANE_STORAGE_KEY = 'trenchcord.paneRoomIds';

// A popout window shares the main window's origin (and therefore its
// localStorage). It must never write the shared layout keys or persist layout
// to the backend, or it would clobber the main window's saved split layout.
export const IS_POPOUT = (() => {
  try {
    return new URLSearchParams(window.location.search).get('popout') === '1';
  } catch {
    return false;
  }
})();

export function popoutSeedStorageKey(roomId: string): string {
  return `trenchcord.popoutSeed.${roomId}`;
}

// Browser (non-Electron) popouts: track Window handles so we can focus an
// existing one and re-dock when the user closes it.
const webPopoutWindows = new Map<string, Window>();
const webPopoutPolls = new Map<string, number>();

function openBrowserPopout(
  roomId: string,
  title: string,
  seed: FrontendMessage[],
  onClose: () => void,
): boolean {
  const existing = webPopoutWindows.get(roomId);
  if (existing && !existing.closed) {
    existing.focus();
    return true;
  }

  try {
    sessionStorage.setItem(popoutSeedStorageKey(roomId), JSON.stringify(seed));
  } catch {
    /* ignore quota / private mode */
  }

  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('popout', '1');
  url.searchParams.set('roomId', roomId);
  if (title) url.searchParams.set('title', title);

  const win = window.open(
    url.toString(),
    `trenchcord-popout-${roomId}`,
    'popup=yes,width=520,height=720',
  );
  if (!win) return false;

  webPopoutWindows.set(roomId, win);
  const prev = webPopoutPolls.get(roomId);
  if (prev != null) window.clearInterval(prev);
  const pollId = window.setInterval(() => {
    if (!win.closed) return;
    window.clearInterval(pollId);
    webPopoutPolls.delete(roomId);
    webPopoutWindows.delete(roomId);
    onClose();
  }, 500);
  webPopoutPolls.set(roomId, pollId);
  return true;
}

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
  if (IS_POPOUT) return;
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

// Clears one room's unread badge, mutating the passed copies. A DM message
// counts toward both its own `dm:`/`tg-dm:` badge and the aggregate All DMs badge;
// dmsShare records each DM's contribution to the aggregate, so reading that
// DM (here or in Discord via ack) subtracts exactly its share — and DMs
// excluded from All DMs, which never count toward it, subtract nothing.
function clearRoomUnread(
  unreadCounts: Record<string, number>,
  dmsShare: Record<string, number>,
  roomId: string,
): void {
  if (roomId === 'dms') {
    for (const key of Object.keys(dmsShare)) delete dmsShare[key];
  } else if (roomId.startsWith('dm:') || roomId.startsWith('tg-dm:')) {
    const share = dmsShare[roomId] ?? 0;
    if (share > 0) {
      unreadCounts['dms'] = Math.max(0, (unreadCounts['dms'] ?? 0) - share);
    }
    delete dmsShare[roomId];
  }
  unreadCounts[roomId] = 0;
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (isHostedMode) {
    const token = await getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  // Local mode authenticates with an HttpOnly cookie, which a cross-origin
  // fetch (VITE_API_URL pointing elsewhere) would otherwise drop.
  return fetch(input, { ...init, headers, credentials: 'include' });
}

/**
 * Authenticated fetch against the local backend for components that talk to
 * one-off endpoints (the Account panel) without adding store actions per call.
 * `path` starts with a slash and excludes the /api prefix.
 */
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return apiFetch(`${API_BASE}${path}`, init);
}

/** `channelId:messageId` keys fetchInteractionArgs has already fired for, so
 * hovering the same command line again never repeats the request. */
const attemptedInteractionArgs = new Set<string>();

interface AppState {
  authStatus: AuthStatus | null;
  authLoading: boolean;
  rooms: Room[];
  /** True once /rooms has answered OK at least once. An empty `rooms` before
   * that means "not loaded yet / load failed", never "the user has no rooms" —
   * gating on it keeps a flaky boot from rendering the first-run wizard over
   * a fully configured install. */
  roomsLoaded: boolean;
  activeRoomId: string | null;
  paneRoomIds: string[];
  paneLocks: boolean[];
  poppedOutRoomIds: string[];
  activePaneIndex: number;
  unreadCounts: Record<string, number>;
  /** How much each `dm:`/`tg-dm:` room contributed to the aggregate All DMs
   * badge — see clearRoomUnread. */
  dmsShare: Record<string, number>;
  layoutEditMode: boolean;
  gridMirror: boolean;
  _layoutHydrated: boolean;
  activeView: 'chat' | 'contracts' | 'settings' | 'profile';
  settingsSection: string | null;
  messages: Record<string, FrontendMessage[]>;
  alerts: Alert[];
  guilds: GuildInfo[];
  /** Role lists by guild id, fetched on demand for the room-config pickers. */
  guildRoles: Record<string, GuildRole[]>;
  dmChannels: DMChannel[];
  config: AppConfig | null;
  configModalOpen: boolean;
  configModalTab: 'channels' | 'users' | 'filter' | 'keywords' | 'global' | null;
  editingRoom: Room | null;
  connected: boolean;
  focusFilter: { guildId: string | null; channelId: string; guildName: string | null; channelName: string } | null;
  contracts: ContractEntry[];
  // Maps a lowercased contract address to its resolved EVM chain slug, so a
  // message's trade link can be corrected once the chain is known (e.g. from a
  // Rick follow-up or the API backfill), even if the address was posted bare.
  addressChains: Record<string, string>;
  maskedTokens: MaskedToken[];
  sidebarCollapsed: boolean;
  /** Global mute for automatic notification sounds (header speaker button). */
  soundsMuted: boolean;
  telegramChats: TelegramChatInfo[];
  telegramAccounts: TelegramAccount[];
  gatewayAuthError: string | null;
  gatewayBlocked: boolean;
  previewMode: boolean;
  toasts: Toast[];
  tradingStatus: TradingStatus | null;
  subscriptionStatus: CloudSubscriptionStatus | null;

  // Premium alerts (cloud-evaluated). Null until a successful fetch so an
  // older backend without the premium module degrades to "feature absent".
  priceAlerts: PriceAlert[] | null;
  tweetAlerts: TweetAlert[] | null;
  telegramTracks: TelegramTrack[] | null;
  premiumEvents: PremiumEvent[];
  premiumNotify: PremiumNotifyPrefs | null;
  /** One-shot handoff from the Contract feed into the DEX alert form. */
  alertPrefill: { chain?: string; contract?: string; symbol?: string } | null;

  fetchPremiumOverview: () => Promise<void>;
  fetchPriceAlerts: () => Promise<void>;
  createPriceAlert: (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string; alert?: PriceAlert; currentPrice?: number }>;
  updatePriceAlert: (id: string, patch: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  deletePriceAlert: (id: string) => Promise<{ success: boolean; error?: string }>;
  fetchTweetAlerts: () => Promise<void>;
  createTweetAlert: (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  updateTweetAlert: (id: string, patch: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  deleteTweetAlert: (id: string) => Promise<{ success: boolean; error?: string }>;
  fetchTelegramTracks: () => Promise<void>;
  createTelegramTrack: (input: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  updateTelegramTrack: (id: string, patch: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  deleteTelegramTrack: (id: string) => Promise<{ success: boolean; error?: string }>;
  fetchPremiumEvents: () => Promise<void>;
  deletePremiumEvent: (id: string) => Promise<void>;
  clearPremiumEvents: () => Promise<void>;
  savePremiumNotify: (prefs: {
    pushover_user_key?: string | null;
    pushover_enabled?: boolean;
    telegram_dm?: boolean;
    discord_dm?: boolean;
    pushover_profiles?: { normal?: PushoverProfile; critical?: PushoverProfile } | null;
  }) => Promise<{ success: boolean; error?: string }>;
  linkDeliveryBot: (provider: 'telegram' | 'discord', code: string) => Promise<{ success: boolean; error?: string; username?: string | null }>;
  premiumBots: PremiumBots | null;
  fetchAlertQuote: (params: Record<string, string>) => Promise<{ symbol: string; name: string | null; price: number; mcap: number | null } | { error: string } | null>;
  setAlertPrefill: (prefill: AppState['alertPrefill']) => void;
  addPremiumEvent: (event: PremiumEvent) => void;
  /** Opens the create-alert modal on the Alerts page (set from the pane header / contract feed). */
  alertCreateOpen: boolean;
  setAlertCreateOpen: (open: boolean) => void;

  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  fetchTradingStatus: () => Promise<void>;
  fetchSubscriptionStatus: () => Promise<void>;
  startCloudLink: () => Promise<{ success: boolean; code?: string; approveUrl?: string; error?: string }>;
  fetchCloudLinkStatus: () => Promise<CloudLinkState | null>;
  refreshCloudSubscription: () => Promise<void>;
  unlinkCloud: () => Promise<void>;
  saveSlotsharkToken: (token: string) => Promise<{ success: boolean; error?: string }>;
  removeSlotsharkToken: () => Promise<{ success: boolean; error?: string }>;
  slotsharkBuy: (mint: string, solAmount: number) => Promise<BuyOutcome>;

  setPreviewMode: (value: boolean) => void;
  importSettings: (
    raw: unknown,
    options?: { telegramSessions?: 'reuse' | 'fresh' },
  ) => Promise<{ success: boolean; error?: string }>;
  setGatewayAuthError: (error: string | null, blocked?: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSoundsMuted: () => void;
  setConnected: (connected: boolean) => void;
  setFocusFilter: (filter: AppState['focusFilter']) => void;
  clearFocusFilter: () => void;
  setActiveRoom: (roomId: string | null) => void;
  setPaneRoom: (index: number, roomId: string) => void;
  setActivePane: (index: number) => void;
  togglePaneLock: (index: number) => void;
  addPane: () => void;
  removePane: (index: number) => void;
  popOutPane: (index: number) => void;
  dockPopout: (roomId: string) => void;
  swapPanes: (a: number, b: number) => void;
  toggleLayoutEditMode: () => void;
  setGridMirror: (value: boolean) => void;
  moveGridBottomChat: () => void;
  persistLayout: () => void;
  /** Forget that the pane layout was hydrated, so the next fetchConfig applies
   * the server's paneRoomIds again — needed after a settings import replaces
   * the layout under a running app. */
  rehydrateLayout: () => void;
  setActiveView: (view: 'chat' | 'contracts' | 'settings' | 'profile', settingsSection?: string) => void;
  addMessage: (message: FrontendMessage, roomIds: string[], isLive?: boolean) => void;
  addSnipeResult: (data: {
    status: 'bought' | 'failed' | 'skipped';
    mint: string;
    configName: string;
    solAmount: number;
    wallets: { label: string; ok: boolean; error?: string }[];
    reason?: string;
    messageId?: string;
    channelId?: string;
    timestamp?: string;
  }) => void;
  updateMessage: (update: { messageId: string; channelId: string; embeds?: FrontendMessage['embeds']; content?: string; attachments?: FrontendMessage['attachments']; components?: FrontendMessage['components']; mentions?: Record<string, string>; editedTimestamp?: string | null }) => void;
  markMessageDeleted: (data: { messageId: string; channelId: string }) => void;
  /** Resolves the arguments of a message's slash command ("used /wallet" →
   * "used /wallet handle: …") and writes them onto every stored copy. Fired
   * lazily from the command line's hover, like the official client's tooltip;
   * each message is only ever asked about once per session. */
  fetchInteractionArgs: (channelId: string, messageId: string) => Promise<void>;
  markRoomsRead: (roomIds: string[]) => void;
  /** Empties one feed/DM room's message list and its unread badge. Live-only
   * views (Mentions, Keywords, DMs) never refetch, so a cleared one stays
   * empty until the next matching message arrives. */
  clearRoomMessages: (roomId: string) => void;
  /** Drops a single message from one feed room, leaving the copies other rooms
   * hold alone. */
  dismissRoomMessage: (roomId: string, messageId: string) => void;
  addAlert: (alert: Alert) => void;
  dismissAlert: (alertId: string) => void;
  updateReaction: (channelId: string, messageId: string, emoji: FrontendReaction['emoji'], delta: number) => void;
  updatePollVote: (channelId: string, messageId: string, answerId: number, delta: number) => void;
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
  fetchGuildRoles: (guildId: string) => Promise<void>;
  fetchDMChannels: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchContracts: () => Promise<void>;
  fetchReactionUsers: (channelId: string, messageId: string, emoji: FrontendReaction['emoji']) => Promise<ReactionUser[]>;

  createRoom: (name: string, channels: Room['channels'], highlightedUsers: string[], color?: string | null, filteredUsers?: string[], filterEnabled?: boolean, categories?: Room['categories']) => Promise<Room>;
  updateRoom: (id: string, data: Partial<Omit<Room, 'id'>>) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
  updateConfig: (data: Partial<Pick<AppConfig, 'globalHighlightedUsers' | 'contractDetection' | 'guildColors' | 'channelColors' | 'dmColors' | 'telegramColors' | 'enabledGuilds' | 'evmAddressColor' | 'solAddressColor' | 'openInDiscordApp' | 'openInTelegramApp' | 'mobileRoomBar' | 'serverIconBadge' | 'serverIconBadgeMobile' | 'showEphemeralMessages' | 'customUserNames' | 'hiddenUsers' | 'hiddenRoles' | 'dmExcludedUsers' | 'telegramDmsInAllDms' | 'tgDmExcludedUsers' | 'dmHiddenConversations' | 'tgDmHiddenConversations' | 'messageSounds' | 'soundSettings' | 'channelSounds' | 'pushover' | 'contractLinkTemplates' | 'contractClickAction' | 'showFullContractAddress' | 'autoOpenHighlightedContracts' | 'globalKeywordPatterns' | 'keywordAlertsEnabled' | 'desktopNotifications' | 'mentionsUserEnabled' | 'mentionsRoleEnabled' | 'mentionsHereEnabled' | 'mentionsEveryoneEnabled' | 'mentionsBotsEnabled' | 'badgeClickAction' | 'notificationClickAction' | 'chattingEnabled' | 'dmReadSyncEnabled' | 'messageDisplay' | 'compactModeAvatars' | 'compactModeNameOnce' | 'roleColors' | 'mobileZoomScale' | 'splitLayout' | 'seenAnnouncements' | 'onboardingComplete' | 'discordProxyUrl' | 'trading' | 'sniping' | 'feedHotkeys' | 'focusHotkey'>>) => Promise<void>;
  sendMessage: (channelId: string, content: string, files?: File[], source?: 'discord' | 'telegram') => Promise<{ success: boolean; error?: string }>;
  hideUser: (guildId: string | null, channelId: string, userId: string, displayName: string) => Promise<void>;
  unhideUser: (guildId: string | null, channelId: string, userId: string) => Promise<void>;
  hideRole: (guildId: string, roleId: string, roleName: string) => Promise<void>;
  unhideRole: (guildId: string, roleId: string) => Promise<void>;
  /** Set (or clear with null/blank) the custom display name shown for a user. */
  renameUser: (userId: string, customName: string | null) => Promise<void>;

  openConfigModal: (room?: Room, tab?: 'channels' | 'users' | 'filter' | 'keywords' | 'global') => void;
  closeConfigModal: () => void;

  fetchTelegramChats: () => Promise<void>;
  fetchTelegramAccounts: () => Promise<void>;
  telegramAuthStart: (apiId: string | null, apiHash: string | null, phoneNumber: string) => Promise<{ success: boolean; error?: string; needs2FA?: boolean }>;
  telegramAuthVerify: (phoneCode: string, password?: string) => Promise<{ success: boolean; error?: string; needs2FA?: boolean }>;
  telegramAuth2FA: (password: string) => Promise<{ success: boolean; error?: string }>;
  telegramRemoveAccount: (index: number) => Promise<{ success: boolean; error?: string }>;
  telegramDisconnect: () => Promise<{ success: boolean; error?: string }>;
}

export const useAppStore = create<AppState>((set, get) => {
  const demo = isDemoMode ? createDemoOverrides(set as any, get as any) : null;

  // Pane ids that mean the same thing on every install, unlike room ids.
  const VIRTUAL_PANE_IDS = new Set(['mentions', 'keywords', 'snipes', 'alerts']);

  // Drops panes that point at rooms that no longer exist — a settings import
  // recreates every room under a fresh id, and a layout restored from
  // localStorage/config can outlive deletes made elsewhere. Left alone, each
  // stale id renders a dead "Unknown" pane. Runs after both /rooms and /config
  // land (whichever is later wins), and no-ops until rooms have truly loaded.
  const prunePanes = () => {
    const state = get();
    if (!state.roomsLoaded || state.rooms.length === 0) return;
    const isValidPane = (id: string) =>
      VIRTUAL_PANE_IDS.has(id) ||
      id.startsWith('dm:') ||
      id.startsWith('tg-dm:') ||
      state.rooms.some((r) => r.id === id);
    if (state.activeRoomId !== null && state.paneRoomIds.length > 0 && state.paneRoomIds.every(isValidPane)) {
      return;
    }
    const panes: string[] = [];
    const locks: boolean[] = [];
    state.paneRoomIds.forEach((id, i) => {
      if (isValidPane(id)) {
        panes.push(id);
        locks.push(state.paneLocks[i] ?? false);
      }
    });
    if (panes.length === 0) {
      panes.push(state.rooms[0].id);
      locks.length = 0;
    }
    savePaneRoomIds(panes);
    set({
      paneRoomIds: panes,
      paneLocks: locks,
      activeRoomId: panes[0],
      activePaneIndex: Math.min(state.activePaneIndex, panes.length - 1),
    });
    // Write the cleaned layout back so the next boot hydrates it as-is — but
    // only once the config layout has been applied. Before that, this set()
    // is just the localStorage bootstrap, and persisting it would overwrite
    // the real (possibly multi-pane) layout still sitting in the config.
    if (state._layoutHydrated) get().persistLayout();
  };

  return {
  authStatus: null,
  authLoading: true,
  rooms: [],
  roomsLoaded: false,
  activeRoomId: loadPaneRoomIds()[0] ?? null,
  paneRoomIds: loadPaneRoomIds(),
  paneLocks: [],
  poppedOutRoomIds: [],
  activePaneIndex: 0,
  unreadCounts: {},
  dmsShare: {},
  layoutEditMode: loadLayoutEditMode(),
  gridMirror: loadGridMirror(),
  _layoutHydrated: false,
  activeView: 'chat',
  settingsSection: null,
  messages: {},
  alerts: [],
  guilds: [],
  guildRoles: {},
  dmChannels: [],
  config: null,
  configModalOpen: false,
  configModalTab: null,
  editingRoom: null,
  connected: false,
  focusFilter: null,
  contracts: [],
  addressChains: {},
  maskedTokens: [],
  sidebarCollapsed: false,
  soundsMuted: loadSoundsMuted(),
  telegramChats: [],
  telegramAccounts: [],
  gatewayAuthError: null,
  gatewayBlocked: false,
  previewMode: false,
  toasts: [],
  tradingStatus: null,
  subscriptionStatus: null,
  priceAlerts: null,
  tweetAlerts: null,
  telegramTracks: null,
  premiumEvents: [],
  premiumNotify: null,
  premiumBots: null,
  alertPrefill: null,
  alertCreateOpen: false,

  setPreviewMode: (value) => set({ previewMode: value }),

  pushToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_TOASTS) }));
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  fetchTradingStatus: async () => {
    if (demo) return demo.fetchTradingStatus();
    try {
      const res = await apiFetch(`${API_BASE}/trading/status`);
      // 403 in hosted mode — leave status null so the UI stays hidden.
      if (!res.ok) return;
      set({ tradingStatus: await res.json() });
    } catch {}
  },

  fetchSubscriptionStatus: async () => {
    if (demo) return;
    try {
      const res = await apiFetch(`${API_BASE}/cloud/status`);
      // Older backends without the cloud module: leave null (no gate, no UI).
      if (!res.ok) return;
      set({ subscriptionStatus: await res.json() });
    } catch {}
  },

  startCloudLink: async () => {
    if (demo) return { success: false, error: 'Not available in the demo.' };
    try {
      const res = await apiFetch(`${API_BASE}/cloud/link/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      return { success: true, code: data.code, approveUrl: data.approve_url };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  fetchCloudLinkStatus: async () => {
    if (demo) return null;
    try {
      const res = await apiFetch(`${API_BASE}/cloud/link/status`);
      if (!res.ok) return null;
      const data: CloudLinkState = await res.json();
      const { state: _state, code: _code, approveUrl: _a, error: _e, ...status } = data;
      set({ subscriptionStatus: status });
      return data;
    } catch {
      return null;
    }
  },

  refreshCloudSubscription: async () => {
    if (demo) return;
    try {
      const res = await apiFetch(`${API_BASE}/cloud/refresh`, { method: 'POST' });
      if (res.ok) set({ subscriptionStatus: await res.json() });
    } catch {}
  },

  unlinkCloud: async () => {
    if (demo) return;
    try {
      const res = await apiFetch(`${API_BASE}/cloud/unlink`, { method: 'POST' });
      if (res.ok) set({ subscriptionStatus: await res.json() });
    } catch {}
  },

  // --- Premium alerts (cloud CRUD via the local /api/premium proxy) ---

  fetchPremiumOverview: async () => {
    if (demo) return demo.fetchPremiumOverview();
    try {
      const res = await apiFetch(`${API_BASE}/premium/overview`);
      if (!res.ok) return;
      const data: PremiumOverview = await res.json();
      set({ premiumNotify: data.prefs, premiumBots: data.bots ?? null });
    } catch {}
  },

  linkDeliveryBot: async (provider, code) => {
    if (demo) return demo.linkDeliveryBot(provider, code);
    try {
      const res = await apiFetch(`${API_BASE}/premium/delivery/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, code }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Linking failed.' };
      set({ premiumNotify: data.prefs });
      return { success: true, username: data.username ?? null };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  fetchPriceAlerts: async () => {
    if (demo) return demo.fetchPriceAlerts();
    try {
      const res = await apiFetch(`${API_BASE}/premium/alerts`);
      if (!res.ok) return;
      const data = await res.json();
      set({ priceAlerts: data.alerts ?? [] });
    } catch {}
  },

  createPriceAlert: async (input) => {
    if (demo) return demo.createPriceAlert(input);
    try {
      const res = await apiFetch(`${API_BASE}/premium/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Could not create the alert.' };
      set((state) => ({ priceAlerts: [data.alert, ...(state.priceAlerts ?? [])] }));
      return { success: true, alert: data.alert, currentPrice: data.current_price };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  updatePriceAlert: async (id, patch) => {
    if (demo) return demo.updatePriceAlert(id, patch);
    try {
      const res = await apiFetch(`${API_BASE}/premium/alerts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Update failed.' };
      set((state) => ({
        priceAlerts: (state.priceAlerts ?? []).map((a) => (a.id === id ? data.alert : a)),
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  deletePriceAlert: async (id) => {
    if (demo) return demo.deletePriceAlert(id);
    try {
      const res = await apiFetch(`${API_BASE}/premium/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.error ?? 'Delete failed.' };
      }
      set((state) => ({ priceAlerts: (state.priceAlerts ?? []).filter((a) => a.id !== id) }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  fetchTweetAlerts: async () => {
    if (demo) return demo.fetchTweetAlerts();
    try {
      const res = await apiFetch(`${API_BASE}/premium/tweets`);
      if (!res.ok) return;
      const data = await res.json();
      set({ tweetAlerts: data.tweets ?? [] });
    } catch {}
  },

  createTweetAlert: async (input) => {
    if (demo) return demo.createTweetAlert(input);
    try {
      const res = await apiFetch(`${API_BASE}/premium/tweets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Could not create the alert.' };
      set((state) => ({ tweetAlerts: [data.tweet, ...(state.tweetAlerts ?? [])] }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  updateTweetAlert: async (id, patch) => {
    if (demo) return demo.updateTweetAlert(id, patch);
    try {
      const res = await apiFetch(`${API_BASE}/premium/tweets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Update failed.' };
      set((state) => ({
        tweetAlerts: (state.tweetAlerts ?? []).map((a) => (a.id === id ? data.tweet : a)),
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  deleteTweetAlert: async (id) => {
    if (demo) return demo.deleteTweetAlert(id);
    try {
      const res = await apiFetch(`${API_BASE}/premium/tweets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.error ?? 'Delete failed.' };
      }
      set((state) => ({ tweetAlerts: (state.tweetAlerts ?? []).filter((a) => a.id !== id) }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  fetchTelegramTracks: async () => {
    if (demo) return demo.fetchTelegramTracks();
    try {
      const res = await apiFetch(`${API_BASE}/premium/telegram-tracks`);
      if (!res.ok) return;
      const data = await res.json();
      set({ telegramTracks: data.tracks ?? [] });
    } catch {}
  },

  createTelegramTrack: async (input) => {
    if (demo) return demo.createTelegramTrack(input);
    try {
      const res = await apiFetch(`${API_BASE}/premium/telegram-tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Could not track the channel.' };
      set((state) => ({ telegramTracks: [data.track, ...(state.telegramTracks ?? [])] }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  deleteTelegramTrack: async (id) => {
    if (demo) return demo.deleteTelegramTrack(id);
    try {
      const res = await apiFetch(`${API_BASE}/premium/telegram-tracks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.error ?? 'Delete failed.' };
      }
      set((state) => ({ telegramTracks: (state.telegramTracks ?? []).filter((t) => t.id !== id) }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  fetchPremiumEvents: async () => {
    if (demo) return demo.fetchPremiumEvents();
    try {
      const res = await apiFetch(`${API_BASE}/premium/events?limit=100`);
      if (!res.ok) return;
      const data = (await res.json()) as { events: PremiumEvent[] };
      const events = (data.events ?? []).slice().reverse(); // newest-first
      set({ premiumEvents: events.slice(0, MAX_PREMIUM_EVENTS) });
      // Seed the Alerts feed room with history (dedupes against live events).
      for (const event of events.slice().reverse()) {
        get().addPremiumEvent(event);
      }
      set({ unreadCounts: { ...get().unreadCounts, alerts: 0 } });
    } catch {}
  },

  deletePremiumEvent: async (id) => {
    if (demo) return demo.deletePremiumEvent(id);
    // Optimistic: history is cosmetic, a failed delete just resurfaces on reload.
    set((state) => ({ premiumEvents: state.premiumEvents.filter((e) => e.id !== id) }));
    try {
      await apiFetch(`${API_BASE}/premium/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {}
  },

  clearPremiumEvents: async () => {
    if (demo) return demo.clearPremiumEvents();
    set({ premiumEvents: [] });
    try {
      await apiFetch(`${API_BASE}/premium/events`, { method: 'DELETE' });
    } catch {}
  },

  savePremiumNotify: async (prefs) => {
    if (demo) return demo.savePremiumNotify(prefs);
    try {
      const res = await apiFetch(`${API_BASE}/premium/notify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Save failed.' };
      set({ premiumNotify: data.prefs });
      // Same key, two features: mirror it into Settings → Pushover so the user
      // never has to type it twice.
      const savedKey = typeof prefs.pushover_user_key === 'string' ? prefs.pushover_user_key : undefined;
      const cfg = get().config;
      if (savedKey && cfg && cfg.pushover.userKey !== savedKey) {
        void get().updateConfig({ pushover: { ...cfg.pushover, userKey: savedKey } });
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  setAlertPrefill: (prefill) => set({ alertPrefill: prefill }),

  setAlertCreateOpen: (open) => set({ alertCreateOpen: open }),

  fetchAlertQuote: async (params) => {
    if (demo) return demo.fetchAlertQuote(params);
    try {
      const res = await apiFetch(`${API_BASE}/premium/quote?${new URLSearchParams(params)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) return data?.error ? { error: data.error } : null;
      return data;
    } catch {
      return null;
    }
  },

  updateTelegramTrack: async (id, patch) => {
    if (demo) return demo.updateTelegramTrack(id, patch);
    try {
      const res = await apiFetch(`${API_BASE}/premium/telegram-tracks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error ?? 'Update failed.' };
      set((state) => ({
        telegramTracks: (state.telegramTracks ?? []).map((t) => (t.id === id ? { ...t, ...data.track } : t)),
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // WS + hydration entry point: record the event and mirror it into the
  // virtual "alerts" feed room as a synthesized message (snipes precedent).
  addPremiumEvent: (event) => {
    set((state) => {
      if (state.premiumEvents.some((e) => e.id === event.id)) return state;
      const premiumEvents = [event, ...state.premiumEvents];
      if (premiumEvents.length > MAX_PREMIUM_EVENTS) premiumEvents.length = MAX_PREMIUM_EVENTS;

      // A fired price alert flips to triggered server-side — mirror it locally
      // so the card shows FIRED/Reactivate without waiting for a refetch. Only
      // for fresh events: this also runs while seeding history at startup, and
      // an old event must not re-flip an alert that was reactivated since
      // (fetchPriceAlerts is the authority for anything older).
      const fresh = Date.now() - new Date(event.created_at).getTime() < 120_000;
      const priceAlerts =
        fresh && event.kind === 'price' && event.source_id && state.priceAlerts?.some((a) => a.id === event.source_id)
          ? state.priceAlerts.map((a) =>
              a.id === event.source_id ? { ...a, triggered: true, lastNotified: event.created_at } : a,
            )
          : state.priceAlerts;

      const entry: FrontendMessage = {
        id: `premium-${event.id}`,
        channelId: 'alerts',
        guildId: null,
        channelName: 'alerts',
        guildName: null,
        author: { id: 'alerts', username: 'alerts', displayName: 'Alerts', avatar: null },
        content: `**${event.title}**\n${event.body}${event.url ? `\n${event.url}` : ''}`,
        timestamp: event.created_at,
        attachments: [],
        embeds: [],
        isHighlighted: false,
        hasContractAddress: false,
        contractAddresses: [],
        mentions: {},
      };
      const existing = state.messages['alerts'] ?? [];
      if (existing.some((m) => m.id === entry.id)) return { premiumEvents, priceAlerts };
      const updated = [...existing, entry];
      if (updated.length > MAX_MESSAGES_PER_ROOM) {
        updated.splice(0, updated.length - MAX_MESSAGES_PER_ROOM);
      }
      const visible = state.activeView === 'chat' && state.paneRoomIds.includes('alerts');
      const unreadCounts = visible
        ? state.unreadCounts
        : { ...state.unreadCounts, alerts: (state.unreadCounts['alerts'] ?? 0) + 1 };
      return { premiumEvents, priceAlerts, messages: { ...state.messages, alerts: updated }, unreadCounts };
    });
  },

  saveSlotsharkToken: async (token: string) => {
    if (demo) return { success: false, error: 'Trading is not available in the demo.' };
    try {
      const res = await apiFetch(`${API_BASE}/trading/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await get().fetchTradingStatus();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  removeSlotsharkToken: async () => {
    if (demo) return { success: false, error: 'Trading is not available in the demo.' };
    try {
      const res = await apiFetch(`${API_BASE}/trading/token`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await get().fetchTradingStatus();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  slotsharkBuy: async (mint, solAmount) => {
    if (demo) return demo.slotsharkBuy(mint, solAmount);
    try {
      // Which wallets to spend from is decided server-side from saved settings,
      // so a buy can only ever touch wallets the user enabled.
      const res = await apiFetch(`${API_BASE}/trading/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint, solAmount }),
      });
      const data = await res.json();
      if (!res.ok && !data.results) return { success: false, error: data.error ?? 'Buy failed.' };
      return {
        success: !!data.success,
        error: data.error,
        walletCount: data.walletCount,
        succeeded: data.succeeded,
        failed: data.failed,
        spent: data.spent,
        results: data.results,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  importSettings: async (raw, options) => {
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

      // A Telegram session is one MTProto auth key — used from two devices at
      // once, Telegram revokes it (AUTH_KEY_DUPLICATED) and BOTH sides lose the
      // login. 'fresh' drops the sessions (API credentials stay, so the login
      // flow skips straight to the phone-number step on this device).
      if (options?.telegramSessions === 'fresh') {
        configPayload = { ...configPayload };
        delete configPayload.telegramSessions;
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

      // The import replaced rooms and pane layout wholesale; re-apply the
      // server's layout on the next fetchConfig instead of keeping panes that
      // now point at deleted room ids.
      set({ _layoutHydrated: false });

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

  setGatewayAuthError: (error, blocked) => set({ gatewayAuthError: error, gatewayBlocked: error ? (blocked ?? false) : false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  toggleSoundsMuted: () => set((s) => {
    const next = !s.soundsMuted;
    // notificationSound owns the flag playSound checks (and its localStorage
    // persistence); the store copy only drives the header button UI.
    setSoundsMuted(next);
    return { soundsMuted: next };
  }),
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
      // A working token ends preview mode — this is what lets the first-run
      // wizard appear for users who chose "Continue without a token" and only
      // connected Discord later from Settings.
      set({ authStatus: { configured: true, connected: true }, previewMode: false });
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
      // See submitToken: leaving preview here is what surfaces the first-run
      // wizard for "Continue without a token" users adding their first token.
      set({ authStatus: { configured: true, connected: true }, previewMode: false });
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
      const unreadCounts = { ...state.unreadCounts };
      const dmsShare = { ...state.dmsShare };
      clearRoomUnread(unreadCounts, dmsShare, roomId);
      if (state.paneRoomIds.length === 0) {
        savePaneRoomIds([roomId]);
        return { activeRoomId: roomId, activeView: 'chat', paneRoomIds: [roomId], activePaneIndex: 0, unreadCounts, dmsShare };
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
        unreadCounts,
        dmsShare,
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
      const unreadCounts = { ...state.unreadCounts };
      const dmsShare = { ...state.dmsShare };
      clearRoomUnread(unreadCounts, dmsShare, roomId);
      return {
        paneRoomIds: panes,
        activeRoomId: panes[0] ?? null,
        activePaneIndex: index,
        unreadCounts,
        dmsShare,
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
      const dmsShare = { ...state.dmsShare };
      if (state.activeView === 'chat') clearRoomUnread(unreadCounts, dmsShare, fill);
      return { paneRoomIds: panes, paneLocks: locks, activeView: 'chat', unreadCounts, dmsShare };
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

  // Detach a pane into a popout window (Electron IPC, or browser window.open).
  // The chat leaves the grid (which may drop to zero panes -> "No room selected"
  // empty state) and is tracked in poppedOutRoomIds so it re-docks when the
  // popout closes. Kept ephemeral: the removal is not persisted, so the saved
  // layout stays intact across restarts.
  popOutPane: (index) => {
    const state = get();
    if (index < 0 || index >= state.paneRoomIds.length) return;
    const roomId = state.paneRoomIds[index];
    const room = state.rooms.find((r) => r.id === roomId);
    const title = room?.name ?? ({ mentions: 'Mentions', keywords: 'Keywords', snipes: 'Snipes' } as Record<string, string>)[roomId] ?? 'Trenchcord';
    // Hand the popout the messages already loaded here so it shows history
    // immediately (covers rooms, DMs, and mentions, which /history can't).
    const seed = state.messages[roomId] ?? [];

    if (window.trenchcord?.openPopout) {
      window.trenchcord.openPopout(roomId, title, seed);
    } else if (!openBrowserPopout(roomId, title, seed, () => get().dockPopout(roomId))) {
      // Popup blocked — leave the pane in the grid.
      return;
    }

    set((s) => {
      const panes = s.paneRoomIds.filter((_, i) => i !== index);
      const locks = s.paneLocks.filter((_, i) => i !== index);
      const activePaneIndex = Math.max(0, Math.min(s.activePaneIndex, panes.length - 1));
      const poppedOutRoomIds = s.poppedOutRoomIds.includes(roomId)
        ? s.poppedOutRoomIds
        : [...s.poppedOutRoomIds, roomId];
      return { paneRoomIds: panes, paneLocks: locks, activeRoomId: panes[0] ?? null, activePaneIndex, poppedOutRoomIds };
    });
  },

  // Re-dock a chat when its popout window closes.
  dockPopout: (roomId) => {
    set((s) => {
      if (!s.poppedOutRoomIds.includes(roomId)) return s;
      const poppedOutRoomIds = s.poppedOutRoomIds.filter((id) => id !== roomId);
      if (s.paneRoomIds.includes(roomId) || s.paneRoomIds.length >= MAX_PANES) {
        return { poppedOutRoomIds };
      }
      const panes = [...s.paneRoomIds, roomId];
      const locks = [...s.paneLocks];
      while (locks.length < panes.length) locks.push(false);
      return { paneRoomIds: panes, paneLocks: locks, activeRoomId: panes[0] ?? null, poppedOutRoomIds };
    });
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
    if (demo || IS_POPOUT) return;
    const { paneRoomIds, paneLocks, gridMirror } = get();
    apiFetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paneRoomIds, paneLocks, gridMirror }),
    }).catch(() => {});
  },

  rehydrateLayout: () => set({ _layoutHydrated: false }),

  setActiveView: (view, settingsSection) => set((state) => {
    // Returning to the chat view means the open panes are visible again, so
    // clear their unread badges.
    if (view === 'chat' && state.paneRoomIds.length > 0) {
      const unreadCounts = { ...state.unreadCounts };
      const dmsShare = { ...state.dmsShare };
      for (const id of state.paneRoomIds) clearRoomUnread(unreadCounts, dmsShare, id);
      return { activeView: view, settingsSection: settingsSection ?? null, unreadCounts, dmsShare };
    }
    return { activeView: view, settingsSection: settingsSection ?? null };
  }),

  addMessage: (message, roomIds, isLive = false) => {
    set((state) => {
      const newMessages = { ...state.messages };
      const newUnread = { ...state.unreadCounts };
      const newShare = { ...state.dmsShare };
      let unreadChanged = false;
      const visible = state.activeView === 'chat' ? new Set(state.paneRoomIds) : new Set<string>();
      // A message showing in any visible pane has been seen; it must not light
      // up badges in the other places it lands (a DM open in a pane shouldn't
      // keep counting into the aggregate All DMs badge, a message on screen in
      // one room shouldn't count as unread in another room watching the same
      // channel).
      const seen = roomIds.some((id) => visible.has(id));
      const dmRoomId = roomIds.find((id) => id.startsWith('dm:') || id.startsWith('tg-dm:'));
      for (const roomId of roomIds) {
        const existing = newMessages[roomId] ?? [];
        if (existing.some((m) => m.id === message.id)) continue;
        const updated = [...existing, message];
        if (updated.length > MAX_MESSAGES_PER_ROOM) {
          updated.splice(0, updated.length - MAX_MESSAGES_PER_ROOM);
        }
        newMessages[roomId] = updated;
        if (isLive && !seen) {
          newUnread[roomId] = (newUnread[roomId] ?? 0) + 1;
          if (roomId === 'dms' && dmRoomId) {
            newShare[dmRoomId] = (newShare[dmRoomId] ?? 0) + 1;
          }
          unreadChanged = true;
        }
      }
      return unreadChanged
        ? { messages: newMessages, unreadCounts: newUnread, dmsShare: newShare }
        : { messages: newMessages };
    });
  },

  // Reading a channel in an official Discord client clears the matching room
  // badges here too (see clearRoomUnread for the All DMs share handling).
  markRoomsRead: (roomIds) => {
    set((state) => {
      const unreadCounts = { ...state.unreadCounts };
      const dmsShare = { ...state.dmsShare };
      let changed = false;
      for (const roomId of roomIds) {
        if ((unreadCounts[roomId] ?? 0) === 0 && (dmsShare[roomId] ?? 0) === 0) continue;
        clearRoomUnread(unreadCounts, dmsShare, roomId);
        changed = true;
      }
      return changed ? { unreadCounts, dmsShare } : {};
    });
  },

  // Pin a snipe result onto its triggering message and collect it into the
  // virtual "snipes" room. Runs client-side because the triggering message
  // (including caller-bot edits) is already in the store, while the backend
  // only has the full message on the create path.
  addSnipeResult: (data) => {
    set((state) => {
      const snipeInfo = {
        status: data.status,
        mint: data.mint,
        configName: data.configName,
        solAmount: data.solAmount,
        walletsOk: data.wallets?.filter((w) => w.ok).length ?? 0,
        walletsTotal: data.wallets?.length ?? 0,
        reason: data.reason,
        timestamp: data.timestamp ?? new Date().toISOString(),
      };
      let source: FrontendMessage | undefined;
      if (data.messageId) {
        for (const msgs of Object.values(state.messages)) {
          const found = msgs.find(
            (m) => m.id === data.messageId && (!data.channelId || m.channelId === data.channelId),
          );
          if (found) { source = found; break; }
        }
      }
      const entry: FrontendMessage = source
        ? { ...source, snipeInfo }
        : {
            // Triggering message not loaded (evicted, or an edit before any
            // create was seen): still record the snipe against the mint.
            id: data.messageId ?? `snipe-${data.mint}-${snipeInfo.timestamp}`,
            channelId: data.channelId ?? '',
            guildId: null,
            channelName: 'sniper',
            guildName: null,
            author: { id: 'sniper', username: 'sniper', displayName: 'Sniper', avatar: null },
            content: data.mint,
            timestamp: snipeInfo.timestamp,
            attachments: [],
            embeds: [],
            isHighlighted: false,
            hasContractAddress: true,
            contractAddresses: [data.mint],
            mentions: {},
            snipeInfo,
          };
      const existing = state.messages['snipes'] ?? [];
      const idx = existing.findIndex((m) => m.id === entry.id);
      // A re-snipe of the same message refreshes its info instead of duplicating.
      const updated = idx >= 0 ? existing.map((m, i) => (i === idx ? entry : m)) : [...existing, entry];
      if (updated.length > MAX_MESSAGES_PER_ROOM) {
        updated.splice(0, updated.length - MAX_MESSAGES_PER_ROOM);
      }
      const visible = state.activeView === 'chat' && state.paneRoomIds.includes('snipes');
      const unreadCounts = visible || idx >= 0
        ? state.unreadCounts
        : { ...state.unreadCounts, snipes: (state.unreadCounts['snipes'] ?? 0) + 1 };
      return { messages: { ...state.messages, snipes: updated }, unreadCounts };
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
        if (update.components !== undefined) msg.components = update.components;
        // Merged, not replaced: a partial edit payload resolves fewer mentions
        // than the original create (its scan text is only what the edit sent).
        if (update.mentions && Object.keys(update.mentions).length > 0) {
          msg.mentions = { ...msg.mentions, ...update.mentions };
        }
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

  clearRoomMessages: (roomId) => {
    set((state) => {
      const messages = { ...state.messages };
      delete messages[roomId];
      const unreadCounts = { ...state.unreadCounts };
      const dmsShare = { ...state.dmsShare };
      clearRoomUnread(unreadCounts, dmsShare, roomId);
      return { messages, unreadCounts, dmsShare };
    });
  },

  dismissRoomMessage: (roomId, messageId) => {
    set((state) => {
      const msgs = state.messages[roomId];
      if (!msgs) return state;
      const remaining = msgs.filter((m) => m.id !== messageId);
      if (remaining.length === msgs.length) return state;
      return { messages: { ...state.messages, [roomId]: remaining } };
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

  updatePollVote: (channelId, messageId, answerId, delta) => {
    set((state) => {
      const newMessages = { ...state.messages };
      let changed = false;
      for (const roomId of Object.keys(newMessages)) {
        const msgs = newMessages[roomId];
        const idx = msgs.findIndex((m) => m.id === messageId && m.channelId === channelId);
        if (idx === -1 || !msgs[idx].poll) continue;
        const poll = msgs[idx].poll!;
        // Options carry the Discord answer_id; fall back to Discord's 1-based
        // ordering for polls stored before ids were kept.
        const oIdx = poll.options.findIndex((o) => o.id === answerId);
        const optIdx = oIdx >= 0 ? oIdx : answerId - 1;
        if (!poll.options[optIdx]) continue;
        changed = true;
        const options = [...poll.options];
        options[optIdx] = { ...options[optIdx], voters: Math.max(0, options[optIdx].voters + delta) };
        const updated = [...msgs];
        updated[idx] = { ...msgs[idx], poll: { ...poll, options } };
        newMessages[roomId] = updated;
      }
      return changed ? { messages: newMessages } : state;
    });
  },

  addContract: (entry) => {
    set((state) => {
      const updated = [entry, ...state.contracts];
      if (updated.length > MAX_CONTRACTS) updated.length = MAX_CONTRACTS;
      if (entry.chain === 'evm' && entry.evmChain) {
        const key = entry.address.toLowerCase();
        if (state.addressChains[key] !== entry.evmChain) {
          return { contracts: updated, addressChains: { ...state.addressChains, [key]: entry.evmChain } };
        }
      }
      return { contracts: updated };
    });
  },

  updateContractChain: (address, evmChain) => {
    const key = address.toLowerCase();
    set((state) => ({
      contracts: state.contracts.map((c) =>
        c.address.toLowerCase() === key && c.chain === 'evm' ? { ...c, evmChain } : c,
      ),
      addressChains: { ...state.addressChains, [key]: evmChain },
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
      set({ rooms, roomsLoaded: true });
      prunePanes();
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
    // Each gateway_ready (one per Discord account) triggers a refetch; if an
    // earlier request resolves after a later one, it would overwrite the
    // fuller list with a partial snapshot — only the newest request may land.
    const seq = ++guildsFetchSeq;
    try {
      const res = await apiFetch(`${API_BASE}/guilds`);
      if (!res.ok || seq !== guildsFetchSeq) return;
      const guilds: GuildInfo[] = await res.json();
      if (seq !== guildsFetchSeq) return;
      set({ guilds });
    } catch {}
  },

  fetchGuildRoles: async (guildId) => {
    if (demo) return demo.fetchGuildRoles(guildId);
    try {
      const res = await apiFetch(`${API_BASE}/guilds/${encodeURIComponent(guildId)}/roles`);
      if (!res.ok) return;
      const roles: GuildRole[] = await res.json();
      set((state) => ({ guildRoles: { ...state.guildRoles, [guildId]: roles } }));
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
      prunePanes();
    } catch {}
  },

  fetchContracts: async () => {
    if (demo) return demo.fetchContracts();
    try {
      const res = await apiFetch(`${API_BASE}/contracts`);
      if (!res.ok) return;
      const contracts: ContractEntry[] = await res.json();
      set({ contracts, addressChains: deriveAddressChains(contracts) });
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

  fetchInteractionArgs: async (channelId, messageId) => {
    if (demo) return;
    const key = `${channelId}:${messageId}`;
    if (attemptedInteractionArgs.has(key)) return;
    attemptedInteractionArgs.add(key);
    try {
      const res = await apiFetch(`${API_BASE}/interaction-data/${channelId}/${messageId}`);
      if (!res.ok) return;
      const data = await res.json();
      const args = typeof data?.args === 'string' ? data.args : '';
      set((state) => {
        const newMessages = { ...state.messages };
        let changed = false;
        // Every room's copy, so a feed copy and the source room stay in step.
        for (const roomId of Object.keys(newMessages)) {
          const msgs = newMessages[roomId];
          const idx = msgs.findIndex((m) => m.id === messageId && m.channelId === channelId);
          if (idx === -1 || !msgs[idx].interaction) continue;
          changed = true;
          const updated = [...msgs];
          updated[idx] = { ...msgs[idx], interaction: { ...msgs[idx].interaction!, args } };
          newMessages[roomId] = updated;
        }
        return changed ? { messages: newMessages } : state;
      });
    } catch (err) {
      // Leave the bare command name; the entry in attemptedInteractionArgs
      // keeps a flaky message from being retried on every hover.
      console.error('[Store] Failed to fetch interaction args:', err);
    }
  },

  createRoom: async (name, channels, highlightedUsers, color, filteredUsers, filterEnabled, categories) => {
    if (demo) return demo.createRoom(name, channels, highlightedUsers, color, filteredUsers, filterEnabled);
    const res = await apiFetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, channels, categories: categories ?? [], highlightedUsers, color: color ?? null, filteredUsers: filteredUsers ?? [], filterEnabled: filterEnabled ?? false }),
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
    // Mirror a newly saved Pushover user key into Alerts delivery (same key,
    // two features). Only when premium prefs are loaded — i.e. the user
    // actually uses Alerts — and only valid-shaped keys, best-effort.
    const localKey = data.pushover?.userKey?.trim();
    const notify = get().premiumNotify;
    if (localKey && /^[A-Za-z0-9]{30}$/.test(localKey) && notify && notify.pushoverUserKey !== localKey) {
      void get().savePremiumNotify({ pushover_user_key: localKey });
    }
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

  hideRole: async (guildId, roleId, roleName) => {
    if (demo) return demo.hideRole(guildId, roleId, roleName);
    const config = get().config;
    if (!config) return;
    const current = config.hiddenRoles?.[guildId] ?? [];
    if (current.some((e) => e.roleId === roleId)) return;
    const hiddenRoles = { ...config.hiddenRoles, [guildId]: [...current, { roleId, roleName }] };
    await get().updateConfig({ hiddenRoles });
  },

  unhideRole: async (guildId, roleId) => {
    if (demo) return demo.unhideRole(guildId, roleId);
    const config = get().config;
    if (!config) return;
    const current = config.hiddenRoles?.[guildId] ?? [];
    const filtered = current.filter((e) => e.roleId !== roleId);
    const hiddenRoles = { ...config.hiddenRoles };
    if (filtered.length === 0) {
      delete hiddenRoles[guildId];
    } else {
      hiddenRoles[guildId] = filtered;
    }
    await get().updateConfig({ hiddenRoles });
  },

  // No demo branch: updateConfig already routes to the demo store's config merge.
  renameUser: async (userId, customName) => {
    const config = get().config;
    if (!config) return;
    const customUserNames = { ...(config.customUserNames ?? {}) };
    const name = customName?.trim();
    if (name) {
      customUserNames[userId] = name;
    } else {
      delete customUserNames[userId];
    }
    await get().updateConfig({ customUserNames });
  },

  fetchTelegramChats: async () => {
    if (demo) return demo.fetchTelegramChats();
    try {
      const res = await apiFetch(`${API_BASE}/telegram/chats`);
      if (!res.ok) return;
      const chats: TelegramChatInfo[] = await res.json();
      set({ telegramChats: chats });
    } catch {}
  },

  fetchTelegramAccounts: async () => {
    if (demo) return;
    try {
      const res = await apiFetch(`${API_BASE}/auth/telegram/accounts`);
      if (!res.ok) return;
      const data = await res.json();
      set({ telegramAccounts: data.accounts ?? [] });
    } catch {}
  },

  telegramAuthStart: async (apiId, apiHash, phoneNumber) => {
    try {
      const res = await apiFetch(`${API_BASE}/auth/telegram/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Omitted credentials tell the backend to reuse the stored ones, which
        // is how additional accounts only need a phone number.
        body: JSON.stringify({
          ...(apiId ? { apiId } : {}),
          ...(apiHash ? { apiHash } : {}),
          phoneNumber,
        }),
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
      await get().fetchTelegramAccounts();
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
      await get().fetchTelegramAccounts();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  telegramRemoveAccount: async (index) => {
    try {
      const res = await apiFetch(`${API_BASE}/auth/telegram/sessions/${index}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      if (data.count === 0) set({ telegramChats: [] });
      await get().fetchTelegramAccounts();
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
      set({ telegramChats: [], telegramAccounts: [] });
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
