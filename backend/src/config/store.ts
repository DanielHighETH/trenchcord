import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig, Room } from '../discord/types.js';
import { roomWatchesChannel, type CategoryMatch } from '../discord/roomCategories.js';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_DATA_DIR = join(__dirname, '../../data');
// Writable data dir can be relocated (e.g. Electron userData) so a packaged,
// read-only install can still persist config. Defaults to the bundled dir.
const DATA_DIR = process.env.TRENCHCORD_DATA_DIR || BUNDLED_DATA_DIR;
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const DEFAULT_CONFIG_PATH = join(BUNDLED_DATA_DIR, 'config.default.json');

const DEFAULT_SOUND_CONFIG = { enabled: true, volume: 80, useCustom: false };

const DEFAULT_CONFIG: AppConfig = {
  discordTokens: [],
  rooms: [],
  globalHighlightedUsers: [],
  contractDetection: true,
  guildColors: {},
  channelColors: {},
  dmColors: {},
  telegramColors: {},
  enabledGuilds: [],
  evmAddressColor: '#fee75c',
  solAddressColor: '#14f195',
  openInDiscordApp: false,
  openInTelegramApp: false,
  hiddenUsers: {},
  hiddenRoles: {},
  dmExcludedUsers: [],
  telegramDmsInAllDms: true,
  tgDmExcludedUsers: [],
  dmHiddenConversations: [],
  tgDmHiddenConversations: [],
  messageSounds: false,
  soundSettings: {
    highlight: { ...DEFAULT_SOUND_CONFIG },
    contractAlert: { ...DEFAULT_SOUND_CONFIG },
    keywordAlert: { ...DEFAULT_SOUND_CONFIG },
    premiumAlert: { ...DEFAULT_SOUND_CONFIG },
  },
  channelSounds: {},
  pushover: {
    enabled: false, appToken: '', userKey: '',
    priority: 1 as const, sound: 'siren' as const,
    triggers: { highlightedUser: false, highlightedUserContract: true, contract: false, keyword: false },
    filters: { userIds: [], channelIds: [], guildIds: [] },
  },
  contractLinkTemplates: {
    evm: 'https://gmgn.ai/base/token/{address}',
    sol: 'https://axiom.trade/t/{address}?chain=sol',
    solPlatform: 'axiom',
    evmPlatform: 'gmgn',
  },
  contractClickAction: 'copy_open',
  showFullContractAddress: false,
  autoOpenHighlightedContracts: false,
  globalKeywordPatterns: [],
  keywordAlertsEnabled: true,
  desktopNotifications: false,
  mentionsUserEnabled: true,
  mentionsRoleEnabled: true,
  mentionsHereEnabled: false,
  mentionsEveryoneEnabled: false,
  mentionsBotsEnabled: true,
  badgeClickAction: 'discord',
  notificationClickAction: 'trenchcord',
  userNameCache: {},
  chattingEnabled: false,
  dmReadSyncEnabled: false,
  messageDisplay: 'default',
  compactModeAvatars: true,
  compactModeNameOnce: false,
  roleColors: true,
  mobileZoomScale: 1,
  splitLayout: 'row',
  paneRoomIds: [],
  paneLocks: [],
  gridMirror: false,
  seenAnnouncements: [],
  trading: {
    enabled: false,
    region: 'us',
    wallets: [],
    activeWalletIds: [],
    walletAmountMode: 'per_wallet',
    presetAmounts: [0.5, 1, 3, 5, 10],
    slippage: 20,
    tip: null,
    priorityFee: null,
    antimev: true,
    requireDoubleClick: false,
    buttonSize: 'md',
    buttonBgColor: '#383a40',
    buttonTextColor: '#dbdee1',
    showContractPill: true,
    openSiteOnBuy: false,
    buySitePlatform: 'default',
    buySiteUrl: '',
  },
  sniping: {
    enabled: false,
    configs: [],
  },
};

class ConfigStore {
  private config: AppConfig;
  private nameCacheDirty = false;
  private nameCacheTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (existsSync(CONFIG_PATH)) {
        const raw = readFileSync(CONFIG_PATH, 'utf-8');
        const parsed = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        parsed.rooms = parsed.rooms.map((r: any) => ({
          ...r,
          filteredUsers: r.filteredUsers ?? [],
          filterEnabled: r.filterEnabled ?? false,
        }));
        if (!parsed.soundSettings) {
          parsed.soundSettings = { ...DEFAULT_CONFIG.soundSettings };
        } else {
          for (const key of ['highlight', 'contractAlert', 'keywordAlert', 'premiumAlert'] as const) {
            parsed.soundSettings[key] = { ...DEFAULT_SOUND_CONFIG, ...parsed.soundSettings[key] };
          }
        }
        // The spread above is shallow, so a stored `trading` object wins
        // wholesale and would leave any newly-added sub-key undefined. Merge
        // per-key so future releases inherit defaults on existing installs.
        parsed.trading = { ...DEFAULT_CONFIG.trading, ...(parsed.trading ?? {}) };
        if (!Array.isArray(parsed.trading.wallets)) parsed.trading.wallets = [];
        // Pre-multi-wallet configs carry a single `activeWalletId`. Carry that
        // choice over so an upgrade doesn't silently disable someone's wallet.
        if (!Array.isArray(parsed.trading.activeWalletIds)) {
          const legacy = (parsed.trading as any).activeWalletId;
          parsed.trading.activeWalletIds = typeof legacy === 'string' && legacy ? [legacy] : [];
        }
        delete (parsed.trading as any).activeWalletId;
        if (!Array.isArray(parsed.trading.presetAmounts)) {
          parsed.trading.presetAmounts = [...DEFAULT_CONFIG.trading.presetAmounts];
        }
        parsed.sniping = { ...DEFAULT_CONFIG.sniping, ...(parsed.sniping ?? {}) };
        if (!Array.isArray(parsed.sniping.configs)) parsed.sniping.configs = [];
        return parsed;
      }
    } catch (err) {
      console.error('Failed to load config, using defaults:', err);
    }

    const config = this.createInitialConfig();
    return config;
  }

  private createInitialConfig(): AppConfig {
    mkdirSync(DATA_DIR, { recursive: true });

    let config: AppConfig;
    try {
      if (existsSync(DEFAULT_CONFIG_PATH)) {
        const raw = readFileSync(DEFAULT_CONFIG_PATH, 'utf-8');
        config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } else {
        config = { ...DEFAULT_CONFIG };
      }
    } catch {
      config = { ...DEFAULT_CONFIG };
    }

    config.rooms = config.rooms.map((r: any) => ({
      ...r,
      id: r.id === '00000000-0000-0000-0000-000000000000' ? uuidv4() : r.id,
      filteredUsers: r.filteredUsers ?? [],
      filterEnabled: r.filterEnabled ?? false,
    }));

    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
      console.log('[Config] Created initial config.json');
    } catch (err) {
      console.error('Failed to write initial config:', err);
    }

    return config;
  }

  private save(): void {
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  updateConfig(partial: Partial<Pick<AppConfig, 'globalHighlightedUsers' | 'contractDetection' | 'guildColors' | 'channelColors' | 'dmColors' | 'enabledGuilds' | 'evmAddressColor' | 'solAddressColor' | 'openInDiscordApp' | 'openInTelegramApp' | 'serverIconBadge' | 'serverIconBadgeMobile' | 'showEphemeralMessages' | 'customUserNames' | 'hiddenUsers' | 'hiddenRoles' | 'dmExcludedUsers' | 'telegramDmsInAllDms' | 'tgDmExcludedUsers' | 'dmHiddenConversations' | 'tgDmHiddenConversations' | 'messageSounds' | 'soundSettings' | 'channelSounds' | 'pushover' | 'contractLinkTemplates' | 'contractClickAction' | 'showFullContractAddress' | 'autoOpenHighlightedContracts' | 'globalKeywordPatterns' | 'keywordAlertsEnabled' | 'desktopNotifications' | 'mentionsUserEnabled' | 'mentionsRoleEnabled' | 'mentionsHereEnabled' | 'mentionsEveryoneEnabled' | 'mentionsBotsEnabled' | 'badgeClickAction' | 'notificationClickAction' | 'chattingEnabled' | 'dmReadSyncEnabled' | 'messageDisplay' | 'compactModeAvatars' | 'compactModeNameOnce' | 'roleColors' | 'mobileZoomScale' | 'splitLayout' | 'paneRoomIds' | 'paneLocks' | 'gridMirror' | 'seenAnnouncements' | 'onboardingComplete' | 'telegramApiId' | 'telegramApiHash' | 'telegramSessions' | 'discordProxyUrl' | 'trading' | 'sniping' | 'feedHotkeys' | 'focusHotkey' | 'slotsharkApiToken' | 'cloudDeviceToken'>>): AppConfig {
    Object.assign(this.config, partial);
    this.save();
    return this.config;
  }

  getRooms(): Room[] {
    return this.config.rooms;
  }

  getRoom(id: string): Room | undefined {
    return this.config.rooms.find((r) => r.id === id);
  }

  createRoom(data: Omit<Room, 'id'>): Room {
    const room: Room = { id: uuidv4(), ...data };
    this.config.rooms.push(room);
    this.save();
    return room;
  }

  updateRoom(id: string, data: Partial<Omit<Room, 'id'>>): Room | null {
    const room = this.config.rooms.find((r) => r.id === id);
    if (!room) return null;
    Object.assign(room, data);
    this.save();
    return room;
  }

  deleteRoom(id: string): boolean {
    const idx = this.config.rooms.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.config.rooms.splice(idx, 1);
    this.save();
    return true;
  }

  isChannelSubscribed(channelId: string, category?: CategoryMatch | null): boolean {
    return this.config.rooms.some((r) => roomWatchesChannel(r, channelId, category));
  }

  getRoomsForChannel(channelId: string, category?: CategoryMatch | null): Room[] {
    return this.config.rooms.filter((r) => roomWatchesChannel(r, channelId, category));
  }

  isUserHighlighted(userId: string, roomId?: string, username?: string | null, roleIds?: string[]): boolean {
    const matchesList = (list: string[]) =>
      list.includes(userId) ||
      (username ? list.some((e) => e.startsWith('@') && e.slice(1).toLowerCase() === username.toLowerCase()) : false);
    const matchesRoom = (r: Room) =>
      matchesList(r.highlightedUsers) ||
      !!(roleIds?.length && r.highlightedRoles?.some((hr) => roleIds.includes(hr.roleId)));

    if (matchesList(this.config.globalHighlightedUsers)) return true;
    if (roomId) {
      const room = this.getRoom(roomId);
      return room ? matchesRoom(room) : false;
    }
    return this.config.rooms.some(matchesRoom);
  }

  getTokens(): string[] {
    return this.config.discordTokens ?? [];
  }

  setTokens(tokens: string[]): void {
    this.config.discordTokens = tokens;
    this.save();
  }

  cacheUserName(userId: string, displayName: string): void {
    if (!this.config.userNameCache) this.config.userNameCache = {};
    if (this.config.userNameCache[userId] === displayName) return;
    this.config.userNameCache[userId] = displayName;
    this.nameCacheDirty = true;
    if (!this.nameCacheTimer) {
      this.nameCacheTimer = setTimeout(() => {
        this.nameCacheTimer = null;
        if (this.nameCacheDirty) {
          this.nameCacheDirty = false;
          this.save();
        }
      }, 5000);
    }
  }
}

export const configStore = new ConfigStore();
