import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig, Room } from '../discord/types.js';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const DEFAULT_CONFIG_PATH = join(DATA_DIR, 'config.default.json');

const DEFAULT_CONFIG: AppConfig = {
  discordTokens: [],
  rooms: [],
  globalHighlightedUsers: [],
  contractDetection: true,
  guildColors: {},
  enabledGuilds: [],
  evmAddressColor: '#fee75c',
  solAddressColor: '#14f195',
  openInDiscordApp: false,
  hiddenUsers: {},
  messageSounds: false,
  pushover: { enabled: false, appToken: '', userKey: '' },
  contractLinkTemplates: {
    evm: 'https://gmgn.ai/base/token/{address}',
    sol: 'https://axiom.trade/t/{address}?chain=sol',
    solPlatform: 'axiom',
    evmPlatform: 'gmgn',
  },
  contractClickAction: 'copy_open',
  autoOpenHighlightedContracts: false,
  globalKeywordPatterns: [],
  keywordAlertsEnabled: true,
  desktopNotifications: false,
};

class ConfigStore {
  private config: AppConfig;

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

    if (config.rooms.length === 0) {
      config.rooms.push({
        id: uuidv4(),
        name: 'main',
        channels: [],
        highlightedUsers: [],
        color: null,
        filteredUsers: [],
        filterEnabled: false,
      } as Room);
    }

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

  updateConfig(partial: Partial<Pick<AppConfig, 'globalHighlightedUsers' | 'contractDetection' | 'guildColors' | 'enabledGuilds' | 'evmAddressColor' | 'solAddressColor' | 'openInDiscordApp' | 'hiddenUsers' | 'messageSounds' | 'pushover' | 'contractLinkTemplates' | 'contractClickAction' | 'autoOpenHighlightedContracts' | 'globalKeywordPatterns' | 'keywordAlertsEnabled' | 'desktopNotifications'>>): AppConfig {
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

  isChannelSubscribed(channelId: string): boolean {
    return this.config.rooms.some((r) => r.channels.some((c) => c.channelId === channelId));
  }

  getRoomsForChannel(channelId: string): Room[] {
    return this.config.rooms.filter((r) => r.channels.some((c) => c.channelId === channelId));
  }

  isUserHighlighted(userId: string, roomId?: string): boolean {
    if (this.config.globalHighlightedUsers.includes(userId)) return true;
    if (roomId) {
      const room = this.getRoom(roomId);
      return room?.highlightedUsers.includes(userId) ?? false;
    }
    return this.config.rooms.some((r) => r.highlightedUsers.includes(userId));
  }

  getTokens(): string[] {
    return this.config.discordTokens ?? [];
  }

  setTokens(tokens: string[]): void {
    this.config.discordTokens = tokens;
    this.save();
  }
}

export const configStore = new ConfigStore();
