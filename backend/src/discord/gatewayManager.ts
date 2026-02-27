import { EventEmitter } from 'events';
import { DiscordGateway } from './gateway.js';
import type { GuildInfo, DMChannel, DiscordMessage } from './types.js';

const DEDUP_WINDOW_MS = 10_000;
const DEDUP_MAX_SIZE = 5_000;

export class GatewayManager extends EventEmitter {
  private gateways: DiscordGateway[] = [];
  private recentMessageIds = new Map<string, number>();
  private dedupeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(tokens: string[]) {
    super();
    for (const token of tokens) {
      const gw = new DiscordGateway(token);
      this.gateways.push(gw);
      this.wireEvents(gw);
    }
  }

  private wireEvents(gw: DiscordGateway): void {
    gw.on('message', (rawMsg: DiscordMessage & { _channelName: string; _guildName: string | null }) => {
      const now = Date.now();
      if (this.recentMessageIds.has(rawMsg.id)) return;
      this.recentMessageIds.set(rawMsg.id, now);
      this.emit('message', rawMsg);
    });

    gw.on('messageUpdate', (data) => this.emit('messageUpdate', data));
    gw.on('ready', (user) => this.emit('ready', user));
    gw.on('fatal', (err: Error) => this.emit('fatal', err));
    gw.on('reactionUpdate', (data) => this.emit('reactionUpdate', data));
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
    for (const gw of this.gateways) {
      gw.disconnect();
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
}
