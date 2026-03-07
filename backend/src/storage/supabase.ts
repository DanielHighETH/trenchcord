import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { encryptToken, decryptToken, maskToken } from '../auth/encryption.js';
import type { StorageProvider } from './interface.js';
import type { AppConfig, Room, ChannelRef } from '../discord/types.js';
import type { ContractEntry } from '../utils/contractLog.js';

const DEFAULT_SETTINGS: Omit<AppConfig, 'discordTokens' | 'rooms'> = {
  globalHighlightedUsers: [],
  contractDetection: true,
  guildColors: {},
  dmColors: {},
  enabledGuilds: [],
  evmAddressColor: '#fee75c',
  solAddressColor: '#14f195',
  openInDiscordApp: false,
  openInTelegramApp: false,
  hiddenUsers: {},
  messageSounds: false,
  soundSettings: {
    highlight: { enabled: true, volume: 80, useCustom: false },
    contractAlert: { enabled: true, volume: 80, useCustom: false },
    keywordAlert: { enabled: true, volume: 80, useCustom: false },
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
  autoOpenHighlightedContracts: false,
  globalKeywordPatterns: [],
  keywordAlertsEnabled: true,
  desktopNotifications: false,
  badgeClickAction: 'discord',
  userNameCache: {},
  chattingEnabled: false,
  messageDisplay: 'default',
  compactModeAvatars: true,
  roleColors: true,
  telegramColors: {},
};

function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required in hosted mode.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function throwIfError(result: { error: any }, context: string): void {
  if (result.error) {
    console.error(`[Supabase] ${context}:`, result.error);
    throw new Error(`${context}: ${result.error.message ?? 'Unknown error'}`);
  }
}

function dbRoomToAppRoom(
  row: any,
  channels: ChannelRef[],
): Room {
  return {
    id: row.id,
    name: row.name,
    channels,
    highlightedUsers: row.highlighted_users ?? [],
    filteredUsers: row.filtered_users ?? [],
    filterEnabled: row.filter_enabled ?? false,
    color: row.color ?? null,
    keywordPatterns: row.keyword_patterns ?? [],
    highlightMode: row.highlight_mode ?? 'background',
    highlightedUserColors: row.highlighted_user_colors ?? {},
  };
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 10_000; // 10 seconds

export class SupabaseStorageProvider implements StorageProvider {
  private supabase: SupabaseClient;
  private cache = new Map<string, CacheEntry<any>>();

  constructor() {
    this.supabase = createServiceClient();
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private invalidateUser(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(userId)) this.cache.delete(key);
    }
  }

  // ---- Config ----

  async getConfig(userId: string): Promise<AppConfig> {
    const cacheKey = `${userId}:config`;
    const cached = this.getCached<AppConfig>(cacheKey);
    if (cached) return cached;

    const { data } = await this.supabase
      .from('user_configs')
      .select('settings')
      .eq('user_id', userId)
      .single();

    const settings = data?.settings ?? {};
    delete settings.telegramApiId;
    delete settings.telegramApiHash;
    delete settings.telegramSessions;
    const merged = { ...DEFAULT_SETTINGS, ...settings };

    const tokens = await this.getTokens(userId);
    const rooms = await this.getRooms(userId);
    const telegramCreds = await this.getTelegramApiCredentials(userId);
    const telegramSessions = await this.getTelegramSessions(userId);

    const config = {
      ...merged,
      discordTokens: tokens,
      rooms,
      telegramApiId: telegramCreds?.apiId,
      telegramApiHash: telegramCreds?.apiHash,
      telegramSessions,
    } as AppConfig;
    this.setCache(cacheKey, config);
    return config;
  }

  async updateConfig(userId: string, partial: Partial<AppConfig>): Promise<AppConfig> {
    const {
      discordTokens: _t,
      rooms: _r,
      telegramApiId,
      telegramApiHash,
      telegramSessions,
      ...settingsUpdate
    } = partial as any;

    if (telegramApiId !== undefined || telegramApiHash !== undefined) {
      await this.setTelegramApiCredentials(userId, telegramApiId, telegramApiHash);
    }

    if (telegramSessions !== undefined) {
      await this.setTelegramSessions(userId, telegramSessions);
    }

    const { data: existing } = await this.supabase
      .from('user_configs')
      .select('settings')
      .eq('user_id', userId)
      .single();

    const currentSettings = existing?.settings ?? {};
    const newSettings = { ...currentSettings, ...settingsUpdate };

    // Scrub any leftover plaintext telegram fields from the JSON blob
    delete newSettings.telegramApiId;
    delete newSettings.telegramApiHash;
    delete newSettings.telegramSessions;

    const result = await this.supabase
      .from('user_configs')
      .upsert({ user_id: userId, settings: newSettings }, { onConflict: 'user_id' });
    throwIfError(result, 'Failed to update config');

    this.invalidateUser(userId);
    return this.getConfig(userId);
  }

  // ---- Tokens ----

  async getTokens(userId: string): Promise<string[]> {
    const cacheKey = `${userId}:tokens`;
    const cached = this.getCached<string[]>(cacheKey);
    if (cached) return cached;

    const result = await this.supabase
      .from('discord_tokens')
      .select('encrypted_token, token_iv, token_tag, position')
      .eq('user_id', userId)
      .order('position');

    throwIfError(result, 'Failed to fetch tokens');
    if (!result.data || result.data.length === 0) return [];

    const tokens = result.data.map((row) => decryptToken(row.encrypted_token, row.token_iv, row.token_tag));
    this.setCache(cacheKey, tokens);
    return tokens;
  }

  async setTokens(userId: string, tokens: string[]): Promise<void> {
    const delResult = await this.supabase.from('discord_tokens').delete().eq('user_id', userId);
    throwIfError(delResult, 'Failed to delete existing tokens');

    if (tokens.length === 0) return;

    const rows = tokens.map((token, i) => {
      const { encrypted, iv, tag } = encryptToken(token);
      return {
        user_id: userId,
        encrypted_token: encrypted,
        token_iv: iv,
        token_tag: tag,
        token_mask: maskToken(token),
        position: i,
      };
    });

    const insResult = await this.supabase.from('discord_tokens').insert(rows);
    throwIfError(insResult, 'Failed to store tokens');
    this.invalidateUser(userId);
  }

  // ---- Rooms ----

  async getRooms(userId: string): Promise<Room[]> {
    const cacheKey = `${userId}:rooms`;
    const cached = this.getCached<Room[]>(cacheKey);
    if (cached) return cached;

    const { data: roomRows } = await this.supabase
      .from('rooms')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');

    if (!roomRows || roomRows.length === 0) return [];

    const roomIds = roomRows.map((r) => r.id);
    const { data: channelRows } = await this.supabase
      .from('room_channels')
      .select('*')
      .in('room_id', roomIds);

    const channelsByRoom = new Map<string, ChannelRef[]>();
    for (const ch of channelRows ?? []) {
      const list = channelsByRoom.get(ch.room_id) ?? [];
      list.push({
        source: ch.source ?? 'discord',
        guildId: ch.guild_id,
        channelId: ch.channel_id,
        guildName: ch.guild_name,
        channelName: ch.channel_name,
        disableEmbeds: ch.disable_embeds,
      });
      channelsByRoom.set(ch.room_id, list);
    }

    const rooms = roomRows.map((r) => dbRoomToAppRoom(r, channelsByRoom.get(r.id) ?? []));
    this.setCache(cacheKey, rooms);
    return rooms;
  }

  async getRoom(userId: string, roomId: string): Promise<Room | null> {
    const { data: row } = await this.supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .eq('user_id', userId)
      .single();

    if (!row) return null;

    const { data: channelRows } = await this.supabase
      .from('room_channels')
      .select('*')
      .eq('room_id', roomId);

    const channels: ChannelRef[] = (channelRows ?? []).map((ch) => ({
      source: ch.source ?? 'discord',
      guildId: ch.guild_id,
      channelId: ch.channel_id,
      guildName: ch.guild_name,
      channelName: ch.channel_name,
      disableEmbeds: ch.disable_embeds,
    }));

    return dbRoomToAppRoom(row, channels);
  }

  async createRoom(userId: string, data: Omit<Room, 'id'>): Promise<Room> {
    const roomId = uuidv4();

    const roomResult = await this.supabase.from('rooms').insert({
      id: roomId,
      user_id: userId,
      name: data.name,
      color: data.color ?? null,
      highlighted_users: data.highlightedUsers ?? [],
      filtered_users: data.filteredUsers ?? [],
      filter_enabled: data.filterEnabled ?? false,
      keyword_patterns: data.keywordPatterns ?? [],
      highlight_mode: data.highlightMode ?? 'background',
      highlighted_user_colors: data.highlightedUserColors ?? {},
    });
    throwIfError(roomResult, 'Failed to create room');

    if (data.channels && data.channels.length > 0) {
      const channelRows = data.channels.map((ch) => ({
        room_id: roomId,
        user_id: userId,
        source: ch.source ?? 'discord',
        guild_id: ch.guildId,
        channel_id: ch.channelId,
        guild_name: ch.guildName,
        channel_name: ch.channelName,
        disable_embeds: ch.disableEmbeds ?? false,
      }));
      const chResult = await this.supabase.from('room_channels').insert(channelRows);
      throwIfError(chResult, 'Failed to create room channels');
    }

    this.invalidateUser(userId);
    return { id: roomId, ...data };
  }

  async updateRoom(userId: string, roomId: string, data: Partial<Room>): Promise<Room | null> {
    const existing = await this.getRoom(userId, roomId);
    if (!existing) return null;

    const updateFields: any = {};
    if (data.name !== undefined) updateFields.name = data.name;
    if (data.color !== undefined) updateFields.color = data.color;
    if (data.highlightedUsers !== undefined) updateFields.highlighted_users = data.highlightedUsers;
    if (data.filteredUsers !== undefined) updateFields.filtered_users = data.filteredUsers;
    if (data.filterEnabled !== undefined) updateFields.filter_enabled = data.filterEnabled;
    if (data.keywordPatterns !== undefined) updateFields.keyword_patterns = data.keywordPatterns;
    if (data.highlightMode !== undefined) updateFields.highlight_mode = data.highlightMode;
    if (data.highlightedUserColors !== undefined) updateFields.highlighted_user_colors = data.highlightedUserColors;

    if (Object.keys(updateFields).length > 0) {
      await this.supabase.from('rooms').update(updateFields).eq('id', roomId).eq('user_id', userId);
    }

    if (data.channels !== undefined) {
      await this.supabase.from('room_channels').delete().eq('room_id', roomId);
      if (data.channels.length > 0) {
        const channelRows = data.channels.map((ch) => ({
          room_id: roomId,
          user_id: userId,
          source: ch.source ?? 'discord',
          guild_id: ch.guildId,
          channel_id: ch.channelId,
          guild_name: ch.guildName,
          channel_name: ch.channelName,
          disable_embeds: ch.disableEmbeds ?? false,
        }));
        await this.supabase.from('room_channels').insert(channelRows);
      }
    }

    this.invalidateUser(userId);
    return this.getRoom(userId, roomId);
  }

  async deleteRoom(userId: string, roomId: string): Promise<boolean> {
    const { count } = await this.supabase
      .from('rooms')
      .delete({ count: 'exact' })
      .eq('id', roomId)
      .eq('user_id', userId);

    this.invalidateUser(userId);
    return (count ?? 0) > 0;
  }

  // ---- Room queries ----

  async getRoomsForChannel(userId: string, channelId: string): Promise<Room[]> {
    const rooms = await this.getRooms(userId);
    return rooms.filter((r) => r.channels.some((ch) => ch.channelId === channelId));
  }

  async isChannelSubscribed(userId: string, channelId: string): Promise<boolean> {
    const rooms = await this.getRooms(userId);
    return rooms.some((r) => r.channels.some((ch) => ch.channelId === channelId));
  }

  async isUserHighlighted(userId: string, discordUserId: string, roomId?: string, username?: string | null): Promise<boolean> {
    const matchesList = (list: string[]) =>
      list.includes(discordUserId) ||
      (username ? list.some((e) => e.startsWith('@') && e.slice(1).toLowerCase() === username.toLowerCase()) : false);

    const config = await this.getConfig(userId);
    if (matchesList(config.globalHighlightedUsers)) return true;

    if (roomId) {
      const room = await this.getRoom(userId, roomId);
      return room ? matchesList(room.highlightedUsers) : false;
    }

    const rooms = await this.getRooms(userId);
    return rooms.some((r) => matchesList(r.highlightedUsers));
  }

  // ---- Contracts ----

  async getContracts(userId: string, limit = 100, since?: string): Promise<ContractEntry[]> {
    let query = this.supabase
      .from('contracts')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (since) {
      query = query.gt('timestamp', since);
    }

    const { data } = await query;
    if (!data) return [];

    return data.map((row) => ({
      address: row.address,
      chain: row.chain as 'evm' | 'sol',
      evmChain: row.evm_chain ?? undefined,
      authorId: row.author_id,
      authorName: row.author_name,
      channelId: row.channel_id,
      channelName: row.channel_name,
      guildId: row.guild_id,
      guildName: row.guild_name,
      roomIds: row.room_ids ?? [],
      messageId: row.message_id,
      timestamp: row.timestamp,
      firstSeen: row.first_seen ?? undefined,
    }));
  }

  async logContract(userId: string, entry: ContractEntry): Promise<void> {
    const isFirstSeen = !(await this.hasAddress(userId, entry.address));

    const result = await this.supabase.from('contracts').insert({
      user_id: userId,
      address: entry.address,
      chain: entry.chain,
      evm_chain: entry.evmChain ?? null,
      author_id: entry.authorId,
      author_name: entry.authorName,
      channel_id: entry.channelId,
      channel_name: entry.channelName,
      guild_id: entry.guildId,
      guild_name: entry.guildName,
      room_ids: entry.roomIds,
      message_id: entry.messageId,
      timestamp: entry.timestamp,
      first_seen: isFirstSeen,
    });
    throwIfError(result, 'Failed to log contract');
  }

  async deleteContract(userId: string, messageId: string, address: string): Promise<boolean> {
    const { count } = await this.supabase
      .from('contracts')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('message_id', messageId)
      .eq('address', address);

    return (count ?? 0) > 0;
  }

  async deleteAllContracts(userId: string): Promise<void> {
    await this.supabase.from('contracts').delete().eq('user_id', userId);
  }

  async updateEvmChain(userId: string, address: string, evmChain: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('contracts')
      .update({ evm_chain: evmChain })
      .eq('user_id', userId)
      .eq('address', address)
      .eq('chain', 'evm')
      .is('evm_chain', null)
      .select('id');

    return (data?.length ?? 0) > 0;
  }

  async hasAddress(userId: string, address: string): Promise<boolean> {
    const { count } = await this.supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('address', address);

    return (count ?? 0) > 0;
  }

  // ---- Telegram credentials (encrypted) ----

  private async getTelegramApiCredentials(userId: string): Promise<{ apiId: string; apiHash: string } | null> {
    const cacheKey = `${userId}:tg_creds`;
    const cached = this.getCached<{ apiId: string; apiHash: string }>(cacheKey);
    if (cached) return cached;

    const { data } = await this.supabase
      .from('telegram_credentials')
      .select('encrypted_api_id, api_id_iv, api_id_tag, encrypted_api_hash, api_hash_iv, api_hash_tag')
      .eq('user_id', userId)
      .single();

    if (!data) return null;

    const apiId = decryptToken(data.encrypted_api_id, data.api_id_iv, data.api_id_tag);
    const apiHash = decryptToken(data.encrypted_api_hash, data.api_hash_iv, data.api_hash_tag);
    const result = { apiId, apiHash };
    this.setCache(cacheKey, result);
    return result;
  }

  private async setTelegramApiCredentials(userId: string, apiId?: string, apiHash?: string): Promise<void> {
    if (!apiId && !apiHash) return;

    const existing = await this.getTelegramApiCredentials(userId);
    const finalApiId = apiId ?? existing?.apiId;
    const finalApiHash = apiHash ?? existing?.apiHash;

    if (!finalApiId || !finalApiHash) return;

    const encId = encryptToken(finalApiId);
    const encHash = encryptToken(finalApiHash);

    const result = await this.supabase.from('telegram_credentials').upsert({
      user_id: userId,
      encrypted_api_id: encId.encrypted,
      api_id_iv: encId.iv,
      api_id_tag: encId.tag,
      encrypted_api_hash: encHash.encrypted,
      api_hash_iv: encHash.iv,
      api_hash_tag: encHash.tag,
    }, { onConflict: 'user_id' });
    throwIfError(result, 'Failed to store Telegram API credentials');
    this.invalidateUser(userId);
  }

  private async getTelegramSessions(userId: string): Promise<string[]> {
    const cacheKey = `${userId}:tg_sessions`;
    const cached = this.getCached<string[]>(cacheKey);
    if (cached) return cached;

    const { data } = await this.supabase
      .from('telegram_sessions')
      .select('encrypted_session, session_iv, session_tag, position')
      .eq('user_id', userId)
      .order('position');

    if (!data || data.length === 0) return [];

    const sessions = data.map((row) => decryptToken(row.encrypted_session, row.session_iv, row.session_tag));
    this.setCache(cacheKey, sessions);
    return sessions;
  }

  private async setTelegramSessions(userId: string, sessions: string[]): Promise<void> {
    const delResult = await this.supabase.from('telegram_sessions').delete().eq('user_id', userId);
    throwIfError(delResult, 'Failed to delete existing Telegram sessions');

    if (sessions.length === 0) {
      this.invalidateUser(userId);
      return;
    }

    const rows = sessions.map((session, i) => {
      const enc = encryptToken(session);
      return {
        user_id: userId,
        encrypted_session: enc.encrypted,
        session_iv: enc.iv,
        session_tag: enc.tag,
        position: i,
      };
    });

    const insResult = await this.supabase.from('telegram_sessions').insert(rows);
    throwIfError(insResult, 'Failed to store Telegram sessions');
    this.invalidateUser(userId);
  }

  // ---- User name cache ----

  async cacheUserName(userId: string, discordUserId: string, displayName: string): Promise<void> {
    const { data } = await this.supabase
      .from('user_configs')
      .select('settings')
      .eq('user_id', userId)
      .single();

    const settings = data?.settings ?? {};
    const cache = settings.userNameCache ?? {};
    if (cache[discordUserId] === displayName) return;

    cache[discordUserId] = displayName;
    settings.userNameCache = cache;

    const result = await this.supabase
      .from('user_configs')
      .upsert({ user_id: userId, settings }, { onConflict: 'user_id' });
    throwIfError(result, 'Failed to cache user name');
    this.invalidateUser(userId);
  }
}
