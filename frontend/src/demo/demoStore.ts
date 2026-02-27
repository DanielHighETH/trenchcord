import type { Room, AppConfig, FrontendMessage, ContractEntry } from '../types';
import {
  DEMO_ROOMS,
  DEMO_CONFIG,
  DEMO_GUILDS,
  DEMO_DM_CHANNELS,
  DEMO_MESSAGES,
  DEMO_CONTRACTS,
  DEMO_MASKED_TOKENS,
} from './demoData';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

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
      set({ authStatus: { configured: true, connected: true }, authLoading: false });
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
        set({ rooms: demoRooms, activeRoomId: demoRooms[0]?.id ?? null });
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
        set({ contracts: clone(DEMO_CONTRACTS) });
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
        const activeRoomId = state.activeRoomId === id
          ? rooms[0]?.id ?? null
          : state.activeRoomId;
        return { rooms, activeRoomId };
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
  };
}
