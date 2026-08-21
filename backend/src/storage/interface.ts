import type { AppConfig, Room } from '../discord/types.js';
import type { CategoryMatch } from '../discord/roomCategories.js';
import type { ContractEntry } from '../utils/contractLog.js';

export interface StorageProvider {
  getConfig(userId: string): Promise<AppConfig>;
  updateConfig(userId: string, partial: Partial<AppConfig>): Promise<AppConfig>;

  getTokens(userId: string): Promise<string[]>;
  setTokens(userId: string, tokens: string[]): Promise<void>;

  getRooms(userId: string): Promise<Room[]>;
  getRoom(userId: string, roomId: string): Promise<Room | null>;
  createRoom(userId: string, data: Omit<Room, 'id'>): Promise<Room>;
  updateRoom(userId: string, roomId: string, data: Partial<Room>): Promise<Room | null>;
  deleteRoom(userId: string, roomId: string): Promise<boolean>;

  /** `category` lets rooms that watch a whole category match too; pass the
   * category the channel sits under, or null when it has none. */
  getRoomsForChannel(userId: string, channelId: string, category?: CategoryMatch | null): Promise<Room[]>;
  isChannelSubscribed(userId: string, channelId: string, category?: CategoryMatch | null): Promise<boolean>;
  isUserHighlighted(userId: string, discordUserId: string, roomId?: string, username?: string | null, roleIds?: string[]): Promise<boolean>;

  getContracts(userId: string, limit?: number, since?: string): Promise<ContractEntry[]>;
  logContract(userId: string, entry: ContractEntry): Promise<void>;
  deleteContract(userId: string, messageId: string, address: string): Promise<boolean>;
  deleteAllContracts(userId: string): Promise<void>;
  updateEvmChain(userId: string, address: string, evmChain: string): Promise<boolean>;
  hasAddress(userId: string, address: string): Promise<boolean>;

  cacheUserName(userId: string, discordUserId: string, displayName: string): Promise<void>;
}
