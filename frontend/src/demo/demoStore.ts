import type { Room, AppConfig, FrontendMessage, ContractEntry, PriceAlert, TweetAlert, TelegramTrack, PremiumEvent, PremiumNotifyPrefs } from '../types';
import {
  DEMO_ROOMS,
  DEMO_CONFIG,
  DEMO_GUILDS,
  DEMO_DM_CHANNELS,
  DEMO_MESSAGES,
  DEMO_CONTRACTS,
  DEMO_MASKED_TOKENS,
  DEMO_PRICE_ALERTS,
  DEMO_TWEET_ALERTS,
  DEMO_TELEGRAM_TRACKS,
  DEMO_PREMIUM_EVENTS,
  DEMO_PREMIUM_NOTIFY,
  DEMO_PREMIUM_BOTS,
  DEMO_TELEGRAM_CHATS,
  DEMO_TRADING_STATUS,
} from './demoData';

/** Set by the "Preview with sample data" button; survives a reload, hence the flag. */
export const DEMO_FLAG_KEY = 'tc_demo';

export function demoFlagSet(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG_KEY) === '1';
  } catch {
    return false; // private mode / storage disabled
  }
}

/**
 * The hosted demo sets this at build time. The runtime flag exists for the iOS
 * app, where App Review needs to evaluate the UI without a Discord account, a
 * Telegram account, or a subscription — there is no build-time switch available
 * to a reviewer. Read once at module load: the store is assembled from it, so
 * toggling it takes a reload either way.
 */
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' || demoFlagSet();

/**
 * Scripted walk-through of the app for promo recordings: ?tour starts it,
 * ?tour=loop restarts it forever. Only meaningful on top of demo mode — the
 * tour drives the demo store, never a real backend.
 */
export const tourParam = (() => {
  try {
    return new URLSearchParams(window.location.search).get('tour');
  } catch {
    return null;
  }
})();

export const isTourMode = isDemoMode && tourParam !== null;

/**
 * Fast-paced scripted promo scenes for recording short marketing clips:
 * ?scene=call | storm | confluence (or 1 | 2 | 3). Like the tour, only
 * meaningful on top of demo mode; the tour wins if both params are present.
 */
export const sceneParam = (() => {
  try {
    return new URLSearchParams(window.location.search).get('scene');
  } catch {
    return null;
  }
})();

export const isSceneMode = isDemoMode && !isTourMode && sceneParam !== null;

/**
 * The iOS promo scene (?scene=ios) poses as the iPhone shell so the real phone
 * chrome — mobile room bar, single-pane layout — renders in a desktop-browser
 * recording. Must happen at module load, before any component asks isIOSApp().
 */
export const isPhoneScene = isSceneMode
  && (sceneParam === 'ios' || sceneParam === 'iphone' || sceneParam === '4');
if (isPhoneScene) window.__TRENCHCORD_PLATFORM__ = 'ios';

export function enterDemoMode(): void {
  try {
    localStorage.setItem(DEMO_FLAG_KEY, '1');
  } catch {
    /* ignore — the reload below simply won't take effect */
  }
  window.location.reload();
}

export function exitDemoMode(): void {
  try {
    localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

type SetFn = (
  partial:
    | Record<string, unknown>
    | ((state: Record<string, unknown>) => Record<string, unknown>),
) => void;
type GetFn = () => Record<string, unknown>;

// Deep-clone helper so mutations stay session-local
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

let _roomCounter = 100;

export function createDemoOverrides(set: SetFn, get: GetFn) {
  return {
    checkAuth: () => {
      set({
        authStatus: {
          configured: true,
          connected: true,
          telegramConfigured: true,
          telegramConnected: true,
          telegramAccountCount: 1,
        },
        authLoading: false,
      });
    },

    fetchTradingStatus: () => {
      set({ tradingStatus: clone(DEMO_TRADING_STATUS) });
    },

    // Pretend the buy went through so the full flow (buttons → success toast)
    // can be experienced; nothing leaves the app and no real SOL exists here.
    // The demo config splits the amount across wallets, so the button's number
    // is exactly what the toast reports as spent.
    slotsharkBuy: (_mint: string, solAmount: number) => {
      const wallets = DEMO_CONFIG.trading.wallets;
      return {
        success: true,
        walletCount: wallets.length,
        succeeded: wallets.length,
        failed: 0,
        spent: solAmount,
        results: wallets.map((w) => ({ walletId: w.id, label: w.label, solAmount: solAmount / wallets.length, ok: true })),
      };
    },

    fetchTelegramChats: () => {
      set({ telegramChats: clone(DEMO_TELEGRAM_CHATS) });
    },

    submitToken: () => ({ success: true }),
    addToken: () => ({ success: true }),
    removeToken: () => ({ success: true }),

    fetchMaskedTokens: () => {
      set({ maskedTokens: clone(DEMO_MASKED_TOKENS) });
    },

    fetchRooms: () => {
      const state = get();
      const rooms = (state.rooms as Room[]);
      if (rooms.length === 0) {
        const demoRooms = clone(DEMO_ROOMS);
        const firstId = demoRooms[0]?.id ?? null;
        set({ rooms: demoRooms, activeRoomId: firstId, paneRoomIds: firstId ? [firstId] : [] });
      }
    },

    fetchHistory: () => {
      set((state: Record<string, unknown>) => {
        const existing = state.messages as Record<string, FrontendMessage[]>;
        const hasData = Object.values(existing).some((msgs) => msgs.length > 0);
        if (hasData) return state;
        return { messages: clone(DEMO_MESSAGES) };
      });
    },

    fetchGuilds: () => {
      set({ guilds: clone(DEMO_GUILDS) });
    },

    fetchGuildRoles: (guildId: string) => {
      // Demo servers have a small fixed role list so the room-config pickers
      // aren't empty in the tour.
      set((state: Record<string, unknown>) => ({
        guildRoles: {
          ...(state.guildRoles as Record<string, unknown>),
          [guildId]: [
            { id: `${guildId}-role-caller`, name: 'Caller', color: '#e91e63' },
            { id: `${guildId}-role-mod`, name: 'Mod', color: '#3498db' },
            { id: `${guildId}-role-member`, name: 'Member', color: null },
          ],
        },
      }));
    },

    fetchDMChannels: () => {
      set({ dmChannels: clone(DEMO_DM_CHANNELS) });
    },

    fetchConfig: () => {
      const state = get();
      if (!state.config) {
        set({ config: clone(DEMO_CONFIG) });
      }
    },

    fetchContracts: () => {
      const state = get();
      if ((state.contracts as ContractEntry[]).length === 0) {
        const contracts = clone(DEMO_CONTRACTS) as ContractEntry[];
        const addressChains: Record<string, string> = {};
        for (const c of contracts) {
          if (c.chain === 'evm' && c.evmChain) addressChains[c.address.toLowerCase()] = c.evmChain;
        }
        set({ contracts, addressChains });
      }
    },

    createRoom: (
      name: string,
      channels: Room['channels'],
      highlightedUsers: string[],
      color?: string | null,
      filteredUsers?: string[],
      filterEnabled?: boolean,
    ): Room => {
      const room: Room = {
        id: `demo-room-${++_roomCounter}`,
        name,
        channels,
        highlightedUsers,
        filteredUsers: filteredUsers ?? [],
        filterEnabled: filterEnabled ?? false,
        color: color ?? null,
      };
      set((state: Record<string, unknown>) => ({
        rooms: [...(state.rooms as Room[]), room],
      }));
      return room;
    },

    updateRoom: (id: string, data: Partial<Omit<Room, 'id'>>) => {
      set((state: Record<string, unknown>) => ({
        rooms: (state.rooms as Room[]).map((r) =>
          r.id === id ? { ...r, ...data } : r,
        ),
      }));
    },

    deleteRoom: (id: string) => {
      set((state: Record<string, unknown>) => {
        const rooms = (state.rooms as Room[]).filter((r) => r.id !== id);
        let panes = (state.paneRoomIds as string[]).filter((p) => p !== id);
        if (panes.length === 0 && rooms[0]) panes = [rooms[0].id];
        return { rooms, paneRoomIds: panes, activeRoomId: panes[0] ?? null };
      });
    },

    updateConfig: (data: Partial<AppConfig>) => {
      set((state: Record<string, unknown>) => ({
        config: { ...(state.config as AppConfig), ...data },
      }));
    },

    hideUser: (guildId: string | null, channelId: string, userId: string, displayName: string) => {
      const config = get().config as AppConfig | null;
      if (!config) return;
      const key = `${guildId ?? 'null'}:${channelId}`;
      const current = config.hiddenUsers?.[key] ?? [];
      if (current.some((e) => e.userId === userId)) return;
      const hiddenUsers = { ...config.hiddenUsers, [key]: [...current, { userId, displayName }] };
      set({ config: { ...config, hiddenUsers } });
    },

    unhideUser: (guildId: string | null, channelId: string, userId: string) => {
      const config = get().config as AppConfig | null;
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
      set({ config: { ...config, hiddenUsers } });
    },

    hideRole: (guildId: string, roleId: string, roleName: string) => {
      const config = get().config as AppConfig | null;
      if (!config) return;
      const current = config.hiddenRoles?.[guildId] ?? [];
      if (current.some((e) => e.roleId === roleId)) return;
      const hiddenRoles = { ...config.hiddenRoles, [guildId]: [...current, { roleId, roleName }] };
      set({ config: { ...config, hiddenRoles } });
    },

    unhideRole: (guildId: string, roleId: string) => {
      const config = get().config as AppConfig | null;
      if (!config) return;
      const current = config.hiddenRoles?.[guildId] ?? [];
      const filtered = current.filter((e) => e.roleId !== roleId);
      const hiddenRoles = { ...config.hiddenRoles };
      if (filtered.length === 0) {
        delete hiddenRoles[guildId];
      } else {
        hiddenRoles[guildId] = filtered;
      }
      set({ config: { ...config, hiddenRoles } });
    },

    deleteContract: (messageId: string, address: string) => {
      set((state: Record<string, unknown>) => ({
        contracts: (state.contracts as ContractEntry[]).filter(
          (c) => !(c.messageId === messageId && c.address === address),
        ),
      }));
    },

    deleteAllContracts: () => {
      set({ contracts: [] });
    },

    // --- Premium alerts ---

    fetchPremiumOverview: () => {
      set({ premiumNotify: clone(DEMO_PREMIUM_NOTIFY), premiumBots: clone(DEMO_PREMIUM_BOTS) });
    },

    fetchAlertQuote: (params: Record<string, string>) => {
      if (params.kind === 'dex') {
        return { symbol: 'TRENCH', name: 'Trenchcoin', price: 0.0042, mcap: 4_200_000 };
      }
      const symbol = (params.symbol ?? 'SOL').toUpperCase();
      return { symbol, name: null, price: symbol === 'SOL' ? 261.4 : 123.45, mcap: null };
    },

    linkDeliveryBot: (provider: 'telegram' | 'discord', _code: string) => {
      set((state: Record<string, unknown>) => {
        const current = state.premiumNotify as Record<string, unknown> | null;
        return {
          premiumNotify: {
            ...(current ?? {}),
            ...(provider === 'telegram'
              ? { telegramLinked: true, telegramDm: true }
              : { discordLinked: true, discordDm: true }),
          },
        };
      });
      return { success: true, username: 'demo_user' };
    },

    fetchPriceAlerts: () => {
      const existing = get().priceAlerts as PriceAlert[] | null;
      if (!existing) set({ priceAlerts: clone(DEMO_PRICE_ALERTS) });
    },

    createPriceAlert: (input: Record<string, unknown>) => {
      const alert: PriceAlert = {
        id: `demo-price-${Date.now()}`,
        kind: (input.kind as PriceAlert['kind']) ?? 'cex',
        symbol: typeof input.symbol === 'string' ? input.symbol.toUpperCase() : null,
        chain: (input.chain as string) ?? null,
        contractAddress: (input.contract_address as string) ?? null,
        condition: (input.condition as PriceAlert['condition']) ?? 'goes_over',
        target: input.target === 'mcap' ? 'mcap' : 'price',
        value: Number(input.value) || 0,
        basePrice: 123.45,
        urgency: input.urgency === 'critical' ? 'critical' : 'normal',
        triggered: false,
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      set((state: Record<string, unknown>) => ({
        priceAlerts: [alert, ...((state.priceAlerts as PriceAlert[]) ?? [])],
      }));
      return { success: true, alert, currentPrice: 123.45 };
    },

    updatePriceAlert: (id: string, patch: Record<string, unknown>) => {
      // Mirror the cloud: (re-)enabling re-arms a fired alert.
      const rearm = patch.enabled === true ? { triggered: false } : {};
      set((state: Record<string, unknown>) => ({
        priceAlerts: ((state.priceAlerts as PriceAlert[]) ?? []).map((a) =>
          a.id === id ? { ...a, ...(patch as Partial<PriceAlert>), ...rearm } : a,
        ),
      }));
      return { success: true };
    },

    deletePriceAlert: (id: string) => {
      set((state: Record<string, unknown>) => ({
        priceAlerts: ((state.priceAlerts as PriceAlert[]) ?? []).filter((a) => a.id !== id),
      }));
      return { success: true };
    },

    fetchTweetAlerts: () => {
      const existing = get().tweetAlerts as TweetAlert[] | null;
      if (!existing) set({ tweetAlerts: clone(DEMO_TWEET_ALERTS) });
    },

    createTweetAlert: (input: Record<string, unknown>) => {
      const alert: TweetAlert = {
        id: `demo-tweet-${Date.now()}`,
        kind: (input.kind as TweetAlert['kind']) ?? 'tweet',
        author: String(input.author ?? '').replace(/^@/, '').toLowerCase(),
        subType: (input.sub_type as TweetAlert['subType']) ?? 'any',
        target: (input.target as string) ?? null,
        keywords: Array.isArray(input.keywords) ? (input.keywords as string[]) : [],
        urgency: input.urgency === 'normal' ? 'normal' : 'critical',
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      set((state: Record<string, unknown>) => ({
        tweetAlerts: [alert, ...((state.tweetAlerts as TweetAlert[]) ?? [])],
      }));
      return { success: true };
    },

    updateTweetAlert: (id: string, patch: Record<string, unknown>) => {
      set((state: Record<string, unknown>) => ({
        tweetAlerts: ((state.tweetAlerts as TweetAlert[]) ?? []).map((a) =>
          a.id === id ? { ...a, ...(patch as Partial<TweetAlert>) } : a,
        ),
      }));
      return { success: true };
    },

    deleteTweetAlert: (id: string) => {
      set((state: Record<string, unknown>) => ({
        tweetAlerts: ((state.tweetAlerts as TweetAlert[]) ?? []).filter((a) => a.id !== id),
      }));
      return { success: true };
    },

    fetchTelegramTracks: () => {
      const existing = get().telegramTracks as TelegramTrack[] | null;
      if (!existing) set({ telegramTracks: clone(DEMO_TELEGRAM_TRACKS) });
    },

    createTelegramTrack: (input: Record<string, unknown>) => {
      const track: TelegramTrack = {
        id: `demo-tg-${Date.now()}`,
        channelUsername: String(input.channel ?? '').replace(/^@/, '').toLowerCase(),
        keywords: Array.isArray(input.keywords) ? (input.keywords as string[]) : [],
        enabled: true,
        createdAt: new Date().toISOString(),
        channelStatus: 'joined',
        channelTitle: null,
        channelError: null,
      };
      set((state: Record<string, unknown>) => ({
        telegramTracks: [track, ...((state.telegramTracks as TelegramTrack[]) ?? [])],
      }));
      return { success: true };
    },

    updateTelegramTrack: (id: string, patch: Record<string, unknown>) => {
      set((state: Record<string, unknown>) => ({
        telegramTracks: ((state.telegramTracks as TelegramTrack[]) ?? []).map((t) =>
          t.id === id ? { ...t, ...(patch as Partial<TelegramTrack>) } : t,
        ),
      }));
      return { success: true };
    },

    deleteTelegramTrack: (id: string) => {
      set((state: Record<string, unknown>) => ({
        telegramTracks: ((state.telegramTracks as TelegramTrack[]) ?? []).filter((t) => t.id !== id),
      }));
      return { success: true };
    },

    fetchPremiumEvents: () => {
      const events = clone(DEMO_PREMIUM_EVENTS) as PremiumEvent[];
      set({ premiumEvents: events });
      // Feed the alerts room through the real synthesis path.
      const addPremiumEvent = get().addPremiumEvent as (e: PremiumEvent) => void;
      for (const event of events.slice().reverse()) addPremiumEvent(event);
      set((state: Record<string, unknown>) => ({
        unreadCounts: { ...(state.unreadCounts as Record<string, number>), alerts: 0 },
      }));
    },

    deletePremiumEvent: (id: string) => {
      set((state: Record<string, unknown>) => ({
        premiumEvents: ((state.premiumEvents as PremiumEvent[]) ?? []).filter((e) => e.id !== id),
      }));
    },

    clearPremiumEvents: () => {
      set({ premiumEvents: [] });
    },

    savePremiumNotify: (prefs: {
      pushover_user_key?: string | null;
      telegram_dm?: boolean;
      discord_dm?: boolean;
      pushover_enabled?: boolean;
      pushover_profiles?: PremiumNotifyPrefs['pushoverProfiles'];
    }) => {
      set((state: Record<string, unknown>) => {
        const current = state.premiumNotify as PremiumNotifyPrefs | null;
        return {
          premiumNotify: {
            ...(current ?? { telegramLinked: false, discordLinked: false }),
            pushoverUserKey: prefs.pushover_user_key !== undefined ? prefs.pushover_user_key : current?.pushoverUserKey ?? null,
            pushoverEnabled: prefs.pushover_enabled !== undefined ? prefs.pushover_enabled : current?.pushoverEnabled ?? true,
            telegramDm: prefs.telegram_dm !== undefined ? prefs.telegram_dm : current?.telegramDm ?? false,
            discordDm: prefs.discord_dm !== undefined ? prefs.discord_dm : current?.discordDm ?? false,
            pushoverProfiles: prefs.pushover_profiles !== undefined ? prefs.pushover_profiles : current?.pushoverProfiles ?? null,
          },
        };
      });
      return { success: true };
    },
  };
}
