import { EventEmitter } from 'events';
import { DiscordGateway } from './gateway.js';
import type { GatewayAuthFailure } from './gateway.js';
import type { ProxyBundle } from './proxy.js';
import type { GuildInfo, DMChannel, DiscordMessage, DiscordUser, DiscordCommandOption } from './types.js';

const DEDUP_WINDOW_MS = 10_000;
const DEDUP_MAX_SIZE = 5_000;
const CHANNEL_CHANGE_DEBOUNCE_MS = 2_000;

export class GatewayManager extends EventEmitter {
  private gateways: DiscordGateway[] = [];
  private invalidTokenIndices = new Set<number>();
  private recentMessageIds = new Map<string, number>();
  private dedupeTimer: ReturnType<typeof setInterval> | null = null;
  private readyCount = 0;
  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void>;
  private channelChangeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(tokens: string[], proxy: ProxyBundle | null = null) {
    super();
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    tokens.forEach((token, index) => {
      const gw = new DiscordGateway(token, index, proxy);
      this.gateways.push(gw);
      this.wireEvents(gw);
    });
    if (tokens.length === 0) {
      this.readyResolve?.();
    }
  }

  private wireEvents(gw: DiscordGateway): void {
    gw.on('message', (rawMsg: DiscordMessage & { _channelName: string; _guildName: string | null; _accountName?: string | null }) => {
      const now = Date.now();
      if (this.recentMessageIds.has(rawMsg.id)) return;
      this.recentMessageIds.set(rawMsg.id, now);
      // Which logged-in account this message arrived on — for DMs across
      // several tokens, that account is the DM's receiver.
      rawMsg._accountName = gw.getSelfUserName();
      this.emit('message', rawMsg);
    });

    gw.on('messageUpdate', (data) => this.emit('messageUpdate', data));
    gw.on('messageDelete', (data) => this.emit('messageDelete', data));
    gw.on('ready', (user) => {
      this.readyCount++;
      if (this.readyCount >= this.gateways.length) {
        this.readyResolve?.();
      }
      this.emit('ready', user);
    });
    gw.on('fatal', (err: Error) => this.emit('fatal', err));
    gw.on('auth_failed', (failure: GatewayAuthFailure) => {
      if (failure.invalid) this.invalidTokenIndices.add(failure.tokenIndex);
      this.emit('auth_failed', failure);
    });
    gw.on('guildChannelsUpdated', ({ guildId }: { guildId: string }) => this.queueChannelsChanged(guildId));
    gw.on('reactionUpdate', (data) => this.emit('reactionUpdate', data));
    gw.on('pollVoteUpdate', (data) => this.emit('pollVoteUpdate', data));
    gw.on('messageAck', (data) => this.emit('messageAck', data));
  }

  /**
   * Coalesce a burst of channel edits (a category being reordered fires one
   * event per channel, once per connected account) into a single notification
   * per guild.
   */
  private queueChannelsChanged(guildId: string): void {
    if (this.channelChangeTimers.has(guildId)) return;
    const timer = setTimeout(() => {
      this.channelChangeTimers.delete(guildId);
      this.emit('guildChannelsUpdated', { guildId });
    }, CHANNEL_CHANGE_DEBOUNCE_MS);
    timer.unref?.();
    this.channelChangeTimers.set(guildId, timer);
  }

  waitUntilReady(timeoutMs = 15_000): Promise<void> {
    return Promise.race([
      this.readyPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  connect(): void {
    this.dedupeTimer = setInterval(() => this.pruneDedup(), DEDUP_WINDOW_MS);
    for (const gw of this.gateways) {
      gw.connect();
    }
  }

  disconnect(): void {
    if (this.dedupeTimer) {
      clearInterval(this.dedupeTimer);
      this.dedupeTimer = null;
    }
    for (const timer of this.channelChangeTimers.values()) clearTimeout(timer);
    this.channelChangeTimers.clear();
    for (const gw of this.gateways) {
      gw.disconnect();
    }
  }

  /** Immediate liveness check on every connection — see DiscordGateway.probeNow. */
  probeNow(): void {
    for (const gw of this.gateways) {
      gw.probeNow();
    }
  }

  private pruneDedup(): void {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [id, ts] of this.recentMessageIds) {
      if (ts < cutoff) this.recentMessageIds.delete(id);
    }
    if (this.recentMessageIds.size > DEDUP_MAX_SIZE) {
      const entries = [...this.recentMessageIds.entries()].sort((a, b) => a[1] - b[1]);
      const toRemove = entries.slice(0, entries.length - DEDUP_MAX_SIZE);
      for (const [id] of toRemove) this.recentMessageIds.delete(id);
    }
  }

  getInvalidTokenIndices(): number[] {
    return Array.from(this.invalidTokenIndices);
  }

  getGuilds(): GuildInfo[] {
    const merged = new Map<string, GuildInfo>();
    for (const gw of this.gateways) {
      for (const guild of gw.getGuilds()) {
        const existing = merged.get(guild.id);
        if (!existing || guild.channels.length > existing.channels.length) {
          merged.set(guild.id, guild);
        }
      }
    }
    return Array.from(merged.values());
  }

  getDMChannels(): DMChannel[] {
    const merged = new Map<string, DMChannel>();
    for (const gw of this.gateways) {
      for (const dm of gw.getDMChannels()) {
        if (!merged.has(dm.id)) merged.set(dm.id, dm);
      }
    }
    return Array.from(merged.values());
  }

  getChannelName(channelId: string): string {
    for (const gw of this.gateways) {
      const name = gw.getChannelName(channelId);
      if (name !== 'unknown') return name;
    }
    return 'unknown';
  }

  getGuildForChannel(channelId: string): string | null {
    for (const gw of this.gateways) {
      const guildId = gw.getGuildForChannel(channelId);
      if (guildId) return guildId;
    }
    return null;
  }

  getThreadParent(channelId: string): string | null {
    for (const gw of this.gateways) {
      const parentId = gw.getThreadParent(channelId);
      if (parentId) return parentId;
    }
    return null;
  }

  getChannelCategory(channelId: string): string | null {
    for (const gw of this.gateways) {
      const categoryId = gw.getChannelCategory(channelId);
      if (categoryId) return categoryId;
    }
    return null;
  }

  getGuildName(guildId: string): string | null {
    for (const gw of this.gateways) {
      const name = gw.getGuildName(guildId);
      if (name) return name;
    }
    return null;
  }

  getRoleName(roleId: string): string | null {
    for (const gw of this.gateways) {
      const name = gw.getRoleName(roleId);
      if (name) return name;
    }
    return null;
  }

  getMemberRoleColor(roleIds: string[] | undefined): string | null {
    for (const gw of this.gateways) {
      const color = gw.getMemberRoleColor(roleIds);
      if (color) return color;
    }
    return null;
  }

  getMemberRoles(roleIds: string[] | undefined): { id: string; name: string }[] | undefined {
    for (const gw of this.gateways) {
      const roles = gw.getMemberRoles(roleIds);
      if (roles) return roles;
    }
    return undefined;
  }

  getGuildRoles(guildId: string): { id: string; name: string; color: string | null }[] {
    for (const gw of this.gateways) {
      const roles = gw.getGuildRoles(guildId);
      if (roles.length > 0) return roles;
    }
    return [];
  }

  /** How many Discord accounts (tokens) this manager runs. */
  getAccountCount(): number {
    return this.gateways.length;
  }

  getSelfUserIds(): Set<string> {
    const ids = new Set<string>();
    for (const gw of this.gateways) {
      const id = gw.getSelfUserId();
      if (id) ids.add(id);
    }
    return ids;
  }

  // Union of the logged-in accounts' role IDs for a guild (across all tokens).
  async getSelfRoleIds(guildId: string): Promise<Set<string>> {
    const merged = new Set<string>();
    const results = await Promise.all(this.gateways.map((gw) => gw.getSelfRoleIds(guildId)));
    for (const roleIds of results) {
      for (const id of roleIds) merged.add(id);
    }
    return merged;
  }

  async sendChannelMessage(channelId: string, content: string, attachments?: { filename: string; data: Buffer; contentType: string }[]): Promise<any> {
    for (const gw of this.gateways) {
      if (gw.getGuildForChannel(channelId) || gw.getDMChannels().some((dm) => dm.id === channelId)) {
        return gw.sendChannelMessage(channelId, content, attachments);
      }
    }
    if (this.gateways.length > 0) {
      return this.gateways[0].sendChannelMessage(channelId, content, attachments);
    }
    throw new Error('No gateway available to send message');
  }

  async fetchChannelMessages(channelId: string, limit = 30): Promise<DiscordMessage[]> {
    for (const gw of this.gateways) {
      if (gw.getGuildForChannel(channelId) || gw.getDMChannels().some((dm) => dm.id === channelId)) {
        return gw.fetchChannelMessages(channelId, limit);
      }
    }
    if (this.gateways.length > 0) {
      return this.gateways[0].fetchChannelMessages(channelId, limit);
    }
    return [];
  }

  async ackChannelMessage(channelId: string, messageId: string): Promise<boolean> {
    for (const gw of this.gateways) {
      if (gw.getGuildForChannel(channelId) || gw.getDMChannels().some((dm) => dm.id === channelId)) {
        return gw.ackChannelMessage(channelId, messageId);
      }
    }
    if (this.gateways.length > 0) {
      return this.gateways[0].ackChannelMessage(channelId, messageId);
    }
    return false;
  }

  async fetchReactionUsers(channelId: string, messageId: string, emoji: string, limit = 100): Promise<DiscordUser[]> {
    for (const gw of this.gateways) {
      if (gw.getGuildForChannel(channelId) || gw.getDMChannels().some((dm) => dm.id === channelId)) {
        return gw.fetchReactionUsers(channelId, messageId, emoji, limit);
      }
    }
    if (this.gateways.length > 0) {
      return this.gateways[0].fetchReactionUsers(channelId, messageId, emoji, limit);
    }
    return [];
  }

  async fetchMessageInteractionData(channelId: string, messageId: string): Promise<DiscordCommandOption[] | null> {
    for (const gw of this.gateways) {
      if (gw.getGuildForChannel(channelId) || gw.getDMChannels().some((dm) => dm.id === channelId)) {
        return gw.fetchMessageInteractionData(channelId, messageId);
      }
    }
    if (this.gateways.length > 0) {
      return this.gateways[0].fetchMessageInteractionData(channelId, messageId);
    }
    return null;
  }
}
