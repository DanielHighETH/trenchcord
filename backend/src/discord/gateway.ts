import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type {
  GatewayPayload,
  DiscordMessage,
  DiscordGuild,
  DiscordChannel,
  DiscordUser,
  DiscordCommandOption,
  GuildInfo,
  DMChannel,
} from './types.js';
import { GatewayOpcodes } from './types.js';
import type { ProxyBundle } from './proxy.js';
import { appFetch, type AppRequestInit, type AppResponse } from '../utils/http.js';

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const REST_BASE = 'https://discord.com/api/v10';

// Channel types that support text messages
const TEXT_CHANNEL_TYPES = new Set([0, 2, 5, 10, 11, 12, 13, 15, 16]);

// Category ("group of channels" in the Discord sidebar).
const CATEGORY_TYPE = 4;

function isTextChannel(type: number): boolean {
  return TEXT_CHANNEL_TYPES.has(type);
}

/**
 * One channel of a guild payload, from either shape Discord sends: full
 * objects, or the compact arrays READY sometimes uses ([id, name, ?, type]).
 * The array form carries no parent, so guilds delivered that way have no
 * category information -- rooms can still watch their channels one by one.
 */
function parseGuildChannel(c: any): { id: string; name: string; type: number; parentId: string | null; position?: number } {
  if (Array.isArray(c)) {
    return { id: String(c[0]), name: String(c[1] ?? ''), type: Number(c[3] ?? 0), parentId: null };
  }
  return {
    id: c.id,
    name: c.name ?? '',
    type: c.type ?? 0,
    parentId: c.parent_id ?? null,
    position: typeof c.position === 'number' ? c.position : undefined,
  };
}

export interface GatewayAuthFailure {
  tokenIndex: number;
  message: string;
  // true only when Discord explicitly rejected the token (close code 4004).
  // Connection-exhaustion failures are ambiguous and must not flag a token.
  invalid: boolean;
  // true when the failure looks like Discord/Cloudflare refusing the connection
  // (HTTP 403/429 on the gateway handshake), typically a VPN/datacenter IP block.
  blocked?: boolean;
}

export class DiscordGateway extends EventEmitter {
  private ws: WebSocket | null = null;
  private token: string;
  private tokenIndex: number;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private probeAckTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly PROBE_ACK_TIMEOUT_MS = 10_000;
  private lastSequence: number | null = null;
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;
  private guilds: Map<string, GuildInfo> = new Map();
  private dmChannels: Map<string, DMChannel> = new Map();
  private channelGuildMap: Map<string, string> = new Map();
  private channelNameMap: Map<string, string> = new Map();
  // channel id -> id of the category it sits under. Rooms that watch a whole
  // category match incoming messages through this.
  private channelParentMap: Map<string, string> = new Map();
  // thread/forum-post id -> parent channel id. Thread messages arrive with the
  // thread's own channel_id, so room matching needs the parent to resolve.
  private threadParentMap: Map<string, string> = new Map();
  private roleNameMap: Map<string, string> = new Map();
  private roleDataMap: Map<string, { name: string; color: number; position: number }> = new Map();
  // Which roles belong to which guild — roleDataMap alone is flat, so listing
  // "all roles of server X" (the room-config role pickers) needs this index.
  private guildRoleIds: Map<string, Set<string>> = new Map();
  private selfUserId: string | null = null;
  // Display name of the logged-in account (READY user), so a DM can say which
  // of several configured accounts received it.
  private selfUserName: string | null = null;
  // guildId -> { roleIds, fetchedAt }. Lazily fetched via REST, refreshed periodically.
  private selfGuildRoles: Map<string, { roleIds: Set<string>; fetchedAt: number }> = new Map();
  private static readonly SELF_ROLES_TTL_MS = 10 * 60 * 1000;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 30;
  private stopped = false;
  /** True when stopped only because the retry budget ran out (not a fatal
   *  close, invalid token, or an intentional disconnect) — probeNow may revive. */
  private gaveUp = false;
  private proxy: ProxyBundle | null;
  // Set when the gateway handshake is rejected with an HTTP status (403/429),
  // which is how a Cloudflare/VPN IP block surfaces. Cleared on a clean open.
  private lastBlockStatus: number | null = null;

  constructor(token: string, tokenIndex = 0, proxy: ProxyBundle | null = null) {
    super();
    this.token = token;
    this.tokenIndex = tokenIndex;
    this.proxy = proxy;
  }

  private static readonly NON_RECOVERABLE_CODES = new Set([
    4004, // Authentication failed
    4010, // Invalid shard
    4011, // Sharding required
    4014, // Disallowed intents
  ]);

  connect(): void {
    if (this.stopped) return;
    // Cleared per-attempt so a block status only reflects the current handshake.
    this.lastBlockStatus = null;
    const url = this.resumeGatewayUrl ?? GATEWAY_URL;
    if (this.reconnectAttempts === 0) {
      console.log(`[Gateway] Connecting to ${url}${this.proxy ? ' via proxy' : ''}...`);
    }
    this.ws = new WebSocket(url, this.proxy ? { agent: this.proxy.wsAgent } : undefined);

    this.ws.on('open', () => {
      if (this.reconnectAttempts > 0) {
        console.log(`[Gateway] Reconnected (after ${this.reconnectAttempts} attempts)`);
      }
    });

    // Fires when Discord/Cloudflare rejects the WS upgrade with an HTTP response
    // (e.g. 403/429/1015). This is the signature of a VPN/datacenter IP block.
    this.ws.on('unexpected-response', (_req, res) => {
      this.lastBlockStatus = res.statusCode ?? null;
      res.resume();
      if (this.reconnectAttempts === 0) {
        console.error(`[Gateway] Handshake rejected with HTTP ${res.statusCode}`);
      }
    });

    this.ws.on('message', (data) => {
      const payload: GatewayPayload = JSON.parse(data.toString());
      this.handlePayload(payload);
    });

    this.ws.on('close', (code, reason) => {
      this.cleanup();

      if (DiscordGateway.NON_RECOVERABLE_CODES.has(code)) {
        const reasonStr = reason.toString() || 'Unknown reason';
        console.error(`[Gateway] Fatal close code ${code}: ${reasonStr}. Not reconnecting.`);
        this.stopped = true;
        if (code === 4004) {
          this.emit('auth_failed', {
            tokenIndex: this.tokenIndex,
            message: 'Authentication failed. This token is invalid or expired — please update it in settings.',
            invalid: true,
          } satisfies GatewayAuthFailure);
        } else {
          this.emit('fatal', new Error(`${reasonStr} (code ${code})`));
        }
        return;
      }

      if (this.reconnectAttempts === 0) {
        console.log(`[Gateway] Disconnected: ${code} - ${reason.toString()}`);
      }
      this.attemptReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[Gateway] Error:', err.message);
    });
  }

  private handlePayload(payload: GatewayPayload): void {
    if (payload.s !== null) {
      this.lastSequence = payload.s;
    }

    switch (payload.op) {
      case GatewayOpcodes.HELLO:
        this.startHeartbeat(payload.d.heartbeat_interval);
        this.identify();
        break;

      case GatewayOpcodes.HEARTBEAT_ACK:
        this.clearProbeDeadline();
        break;

      case GatewayOpcodes.HEARTBEAT:
        this.sendHeartbeat();
        break;

      case GatewayOpcodes.RECONNECT:
        console.log('[Gateway] Server requested reconnect');
        this.ws?.close();
        break;

      case GatewayOpcodes.INVALID_SESSION:
        console.log('[Gateway] Invalid session, re-identifying...');
        this.sessionId = null;
        setTimeout(() => this.identify(), 1000 + Math.random() * 4000);
        break;

      case GatewayOpcodes.DISPATCH:
        // A successful session resume refills the retry budget just like READY.
        // Without this, every suspend/wake cycle (iOS backgrounding, laptop
        // sleep) permanently ate attempts until the gateway "gave up" for good.
        if (payload.t === 'RESUMED') {
          this.reconnectAttempts = 0;
        }
        this.handleDispatch(payload.t!, payload.d);
        break;
    }
  }

  private handleDispatch(event: string, data: any): void {
    switch (event) {
      case 'READY':
        this.sessionId = data.session_id;
        this.resumeGatewayUrl = data.resume_gateway_url;
        this.reconnectAttempts = 0;
        this.selfUserId = data.user?.id ?? null;
        this.selfUserName = data.user?.global_name || data.user?.username || null;
        console.log(`[Gateway] Ready as ${data.user.username}#${data.user.discriminator}`);

        for (const guild of data.guilds ?? []) {
          const guildName = guild.properties?.name ?? guild.name ?? 'Unknown';
          const guildIcon = guild.properties?.icon ?? guild.icon ?? null;
          const guildId = guild.id;

          // User tokens get channel data directly in READY (not via GUILD_CREATE)
          const parsedChannels = ((guild.channels ?? []) as any[]).map(parseGuildChannel);
          const channels = parsedChannels
            .filter((c) => isTextChannel(c.type))
            .map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId }));
          const categories = parsedChannels
            .filter((c) => c.type === CATEGORY_TYPE)
            .map((c) => ({ id: c.id, name: c.name, position: c.position }));

          this.guilds.set(guildId, { id: guildId, name: guildName, icon: guildIcon, channels, categories });

          for (const ch of parsedChannels) {
            this.channelGuildMap.set(ch.id, guildId);
            if (ch.name) this.channelNameMap.set(ch.id, ch.name);
            if (ch.parentId) this.channelParentMap.set(ch.id, ch.parentId);
          }

          const readyRoleIds = new Set<string>();
          for (const role of guild.roles ?? []) {
            const roleId = role.id ?? (Array.isArray(role) ? String(role[0]) : null);
            const roleName = role.name ?? (Array.isArray(role) ? String(role[1] ?? '') : '');
            if (roleId && roleName) this.roleNameMap.set(roleId, roleName);
            if (roleId) {
              readyRoleIds.add(roleId);
              this.roleDataMap.set(roleId, {
                name: roleName || '',
                color: role.color ?? 0,
                position: role.position ?? 0,
              });
            }
          }
          this.guildRoleIds.set(guildId, readyRoleIds);

          console.log(`[Gateway] Guild "${guildName}" - ${channels.length} text channels`);
        }

        // Build user lookup from the top-level users array (user tokens send full
        // user objects here instead of embedding them inside private_channels).
        const userLookup = new Map<string, any>();
        for (const u of data.users ?? []) {
          userLookup.set(u.id, u);
        }

        for (const channel of data.private_channels ?? []) {
          let recipients: { id: string; username: string; global_name: string | null; avatar: string | null }[];

          if (Array.isArray(channel.recipients) && channel.recipients.length > 0) {
            recipients = channel.recipients.map((r: any) => ({
              id: r.id ?? '',
              username: r.username ?? r.name ?? '',
              global_name: r.global_name ?? r.display_name ?? null,
              avatar: r.avatar ?? null,
            }));
          } else {
            // User tokens provide recipient_ids + a top-level users array
            const ids: string[] = channel.recipient_ids ?? [];
            recipients = ids.map((uid: string) => {
              const u = userLookup.get(uid);
              return {
                id: uid,
                username: u?.username ?? u?.name ?? '',
                global_name: u?.global_name ?? u?.display_name ?? null,
                avatar: u?.avatar ?? null,
              };
            });
          }

          this.dmChannels.set(channel.id, { id: channel.id, recipients });
          const name = recipients
            .map((r) => r.global_name || r.username || 'Unknown')
            .join(', ') || 'DM';
          this.channelNameMap.set(channel.id, name);
        }

        console.log(`[Gateway] Loaded ${this.guilds.size} guilds, ${this.dmChannels.size} DMs`);
        this.emit('ready', data.user);
        break;

      case 'GUILD_CREATE': {
        const parsedChannels = ((data.channels ?? []) as any[]).map(parseGuildChannel);
        const channels = parsedChannels
          .filter((c) => isTextChannel(c.type))
          .map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId }));
        const categories = parsedChannels
          .filter((c) => c.type === CATEGORY_TYPE)
          .map((c) => ({ id: c.id, name: c.name, position: c.position }));

        const guildName = data.properties?.name ?? data.name ?? 'Unknown';
        const existing = this.guilds.get(data.id);

        this.guilds.set(data.id, {
          id: data.id,
          name: guildName,
          icon: data.properties?.icon ?? data.icon ?? null,
          channels: channels.length > 0 ? channels : (existing?.channels ?? []),
          categories: channels.length > 0 ? categories : (existing?.categories ?? []),
        });

        for (const ch of parsedChannels) {
          this.channelGuildMap.set(ch.id, data.id);
          if (ch.name) this.channelNameMap.set(ch.id, ch.name);
          if (ch.parentId) this.channelParentMap.set(ch.id, ch.parentId);
        }

        // Active threads/forum posts arrive alongside the channel list.
        for (const t of data.threads ?? []) {
          this.registerThread(t, data.id);
        }

        const createRoleIds = new Set<string>();
        for (const role of data.roles ?? []) {
          if (role.id && role.name) this.roleNameMap.set(role.id, role.name);
          if (role.id) {
            createRoleIds.add(role.id);
            this.roleDataMap.set(role.id, {
              name: role.name ?? '',
              color: role.color ?? 0,
              position: role.position ?? 0,
            });
          }
        }
        if (createRoleIds.size > 0) this.guildRoleIds.set(data.id, createRoleIds);

        console.log(`[Gateway] GUILD_CREATE "${guildName}" - ${channels.length} text channels`);
        break;
      }

      case 'MESSAGE_CREATE': {
        const msg = data as DiscordMessage;
        const guildId = msg.guild_id ?? this.channelGuildMap.get(msg.channel_id) ?? null;
        const channelName = this.getChannelName(msg.channel_id);
        const guildName = guildId ? this.guilds.get(guildId)?.name ?? null : null;

        this.emit('message', {
          ...msg,
          guild_id: guildId,
          _channelName: channelName,
          _guildName: guildName,
        });
        break;
      }

      case 'MESSAGE_UPDATE': {
        const msg = data as Partial<DiscordMessage> & { id: string; channel_id: string };
        const guildId = msg.guild_id ?? this.channelGuildMap.get(msg.channel_id) ?? null;
        const channelName = this.getChannelName(msg.channel_id);
        const guildName = guildId ? this.guilds.get(guildId)?.name ?? null : null;

        this.emit('messageUpdate', {
          ...msg,
          guild_id: guildId,
          _channelName: channelName,
          _guildName: guildName,
        });
        break;
      }

      case 'MESSAGE_DELETE': {
        const guildId = data.guild_id ?? this.channelGuildMap.get(data.channel_id) ?? null;
        this.emit('messageDelete', {
          id: data.id,
          channel_id: data.channel_id,
          guild_id: guildId,
        });
        break;
      }

      case 'MESSAGE_DELETE_BULK': {
        const guildId = data.guild_id ?? this.channelGuildMap.get(data.channel_id) ?? null;
        for (const id of (data.ids ?? []) as string[]) {
          this.emit('messageDelete', {
            id,
            channel_id: data.channel_id,
            guild_id: guildId,
          });
        }
        break;
      }

      case 'MESSAGE_REACTION_ADD': {
        this.emit('reactionUpdate', {
          channelId: data.channel_id,
          messageId: data.message_id,
          guildId: data.guild_id ?? null,
          emoji: data.emoji,
          delta: 1,
        });
        break;
      }

      case 'MESSAGE_REACTION_REMOVE': {
        this.emit('reactionUpdate', {
          channelId: data.channel_id,
          messageId: data.message_id,
          guildId: data.guild_id ?? null,
          emoji: data.emoji,
          delta: -1,
        });
        break;
      }

      case 'MESSAGE_POLL_VOTE_ADD': {
        this.emit('pollVoteUpdate', {
          channelId: data.channel_id,
          messageId: data.message_id,
          answerId: data.answer_id,
          delta: 1,
        });
        break;
      }

      case 'MESSAGE_POLL_VOTE_REMOVE': {
        this.emit('pollVoteUpdate', {
          channelId: data.channel_id,
          messageId: data.message_id,
          answerId: data.answer_id,
          delta: -1,
        });
        break;
      }

      // Sent when this account reads a channel in an official Discord client.
      // A manual ack is the user moving the read marker (Mark Unread), not
      // reading — clearing badges on it would do the opposite of what they
      // asked for.
      case 'MESSAGE_ACK': {
        if (data.manual) break;
        this.emit('messageAck', {
          channelId: data.channel_id,
          messageId: data.message_id,
        });
        break;
      }

      // Threads and forum posts are channels whose messages carry the thread's
      // id as channel_id. Track id -> parent so rooms watching the parent
      // channel receive them, and the thread/post title so it can be shown.
      case 'THREAD_CREATE':
      case 'THREAD_UPDATE': {
        this.registerThread(data, data.guild_id);
        break;
      }

      case 'THREAD_DELETE': {
        this.threadParentMap.delete(data.id);
        this.channelNameMap.delete(data.id);
        this.channelGuildMap.delete(data.id);
        break;
      }

      case 'THREAD_LIST_SYNC': {
        for (const t of data.threads ?? []) {
          this.registerThread(t, data.guild_id);
        }
        break;
      }

      case 'CHANNEL_CREATE':
      case 'CHANNEL_UPDATE': {
        if (data.guild_id) {
          this.channelGuildMap.set(data.id, data.guild_id);
          if (data.name) this.channelNameMap.set(data.id, data.name);
          const parentId: string | null = data.parent_id ?? null;
          if (parentId) this.channelParentMap.set(data.id, parentId);
          else this.channelParentMap.delete(data.id);

          const guild = this.guilds.get(data.guild_id);
          if (guild && data.type === CATEGORY_TYPE) {
            if (!guild.categories) guild.categories = [];
            const idx = guild.categories.findIndex((c) => c.id === data.id);
            const entry = { id: data.id, name: data.name ?? '', position: data.position };
            if (idx >= 0) guild.categories[idx] = entry;
            else guild.categories.push(entry);
            this.emitChannelsChanged(data.guild_id);
          } else if (guild && isTextChannel(data.type)) {
            const idx = guild.channels.findIndex((c) => c.id === data.id);
            const before = idx >= 0 ? guild.channels[idx] : null;
            const entry = { id: data.id, name: data.name ?? '', type: data.type, parentId };
            if (idx >= 0) guild.channels[idx] = entry;
            else guild.channels.push(entry);
            // CHANNEL_UPDATE also fires for topic and permission edits, which
            // change nothing a room watching this category would show. Only a
            // new channel, a move between categories, or a rename is worth
            // telling the clients about.
            if (!before || before.parentId !== entry.parentId || before.name !== entry.name) {
              this.emitChannelsChanged(data.guild_id);
            }
          }
        } else if (data.type === 1 || data.type === 3) {
          const recipients = (data.recipients ?? []).map((r: any) => ({
            id: r.id ?? '',
            username: r.username ?? r.name ?? '',
            global_name: r.global_name ?? r.display_name ?? null,
            avatar: r.avatar ?? null,
          }));
          this.dmChannels.set(data.id, { id: data.id, recipients });
          const name = recipients
            .map((r: any) => r.global_name || r.username || 'Unknown')
            .join(', ') || 'DM';
          this.channelNameMap.set(data.id, name);
        }
        break;
      }

      case 'CHANNEL_DELETE': {
        const guildId = data.guild_id ?? this.channelGuildMap.get(data.id) ?? null;
        this.channelGuildMap.delete(data.id);
        this.channelNameMap.delete(data.id);
        this.channelParentMap.delete(data.id);

        if (!guildId) {
          this.dmChannels.delete(data.id);
          break;
        }
        const guild = this.guilds.get(guildId);
        if (!guild) break;
        const sizeBefore = guild.channels.length + (guild.categories?.length ?? 0);
        guild.channels = guild.channels.filter((c) => c.id !== data.id);
        if (guild.categories) guild.categories = guild.categories.filter((c) => c.id !== data.id);
        if (guild.channels.length + (guild.categories?.length ?? 0) !== sizeBefore) {
          this.emitChannelsChanged(guildId);
        }
        break;
      }
    }
  }

  /** A guild's channel or category list changed in a way rooms can see. */
  private emitChannelsChanged(guildId: string): void {
    this.emit('guildChannelsUpdated', { guildId });
  }

  private identify(): void {
    if (this.sessionId) {
      this.send({
        op: GatewayOpcodes.RESUME,
        d: {
          token: this.token,
          session_id: this.sessionId,
          seq: this.lastSequence,
        },
        s: null,
        t: null,
      });
    } else {
      this.send({
        op: GatewayOpcodes.IDENTIFY,
        d: {
          token: this.token,
          capabilities: 1734653,
          properties: {
            os: 'Windows',
            browser: 'Chrome',
            device: '',
            system_locale: 'en-US',
            browser_user_agent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            browser_version: '133.0.0.0',
            os_version: '10',
            referrer: '',
            referring_domain: '',
            referrer_current: '',
            referring_domain_current: '',
            release_channel: 'stable',
            client_build_number: 366089,
            client_event_source: null,
          },
          presence: {
            status: 'online',
            since: 0,
            activities: [],
            afk: false,
          },
          compress: false,
          client_state: {
            guild_versions: {},
            highest_last_message_id: '0',
            read_state_version: 0,
            user_guild_settings_version: -1,
            user_settings_version: -1,
            private_channels_version: '0',
            api_code_version: 0,
          },
        },
        s: null,
        t: null,
      });
    }
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), intervalMs);
  }

  private sendHeartbeat(): void {
    this.send({ op: GatewayOpcodes.HEARTBEAT, d: this.lastSequence, s: null, t: null });
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private send(payload: GatewayPayload): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private clearProbeDeadline(): void {
    if (this.probeAckTimer) {
      clearTimeout(this.probeAckTimer);
      this.probeAckTimer = null;
    }
  }

  /**
   * Force an immediate liveness check. Called when the host app comes back to
   * the foreground: iOS freezes the process while backgrounded, so the TCP
   * connection is usually dead while `ws` still reports it OPEN. Nothing would
   * notice until the next scheduled heartbeat times out, which can be a minute
   * of silently missed messages. A heartbeat with a short ACK deadline collapses
   * that to a few seconds; killing the socket lets the normal close handler
   * reconnect, and the retained session_id means it RESUMEs rather than
   * re-identifying, so no messages are lost in the gap.
   */
  probeNow(): void {
    // A connection that exhausted its retry budget (typically while the device
    // was suspended and the network wasn't back yet) gets a fresh start when
    // the app returns to the foreground. Fatal closes and invalid tokens keep
    // stopped set without gaveUp, so they are never revived here.
    if (this.gaveUp) {
      this.gaveUp = false;
      this.stopped = false;
      this.reconnectAttempts = 0;
      this.lastBlockStatus = null;
      console.log('[Gateway] Foreground resume — retrying a connection that had given up.');
      this.connect();
      return;
    }
    if (this.stopped || this.probeAckTimer) return;
    const ws = this.ws;
    // Anything other than OPEN already has a reconnect in flight via 'close'.
    if (ws?.readyState !== WebSocket.OPEN) return;

    this.sendHeartbeat();
    this.probeAckTimer = setTimeout(() => {
      this.probeAckTimer = null;
      if (this.ws === ws && ws.readyState === WebSocket.OPEN) {
        console.warn('[Gateway] No heartbeat ACK after resume — recycling the connection.');
        ws.terminate();
      }
    }, DiscordGateway.PROBE_ACK_TIMEOUT_MS);
    this.probeAckTimer.unref?.();
  }

  private cleanup(): void {
    this.stopHeartbeat();
    this.clearProbeDeadline();
  }

  private attemptReconnect(): void {
    if (this.stopped) return;

    // A handshake rejected with 403/429 won't heal by retrying the same IP, so
    // fail fast (after a few tries) with actionable guidance instead of burning
    // the full retry budget and then blaming the token.
    const isBlocked = this.lastBlockStatus === 403 || this.lastBlockStatus === 429;
    const attemptsBudget = isBlocked ? Math.min(5, this.maxReconnectAttempts) : this.maxReconnectAttempts;

    if (this.reconnectAttempts >= attemptsBudget) {
      this.stopped = true;
      this.gaveUp = true;
      if (isBlocked) {
        console.error(`[Gateway] Discord refused the connection (HTTP ${this.lastBlockStatus}). Giving up.`);
        this.emit('auth_failed', {
          tokenIndex: this.tokenIndex,
          message:
            `Discord refused the connection (HTTP ${this.lastBlockStatus}). This usually means your IP is blocked — ` +
            `common on VPNs and datacenter IPs. Try turning the VPN off (or split-tunnel discord.com and gateway.discord.gg), ` +
            `or set an HTTP/HTTPS proxy under Settings → Tokens → Connection.`,
          invalid: false,
          blocked: true,
        } satisfies GatewayAuthFailure);
      } else {
        console.error(`[Gateway] Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
        this.emit('auth_failed', {
          tokenIndex: this.tokenIndex,
          message: `Could not connect after ${this.maxReconnectAttempts} attempts. The token may be invalid, or Discord may be unreachable — please check it in settings.`,
          invalid: false,
        } satisfies GatewayAuthFailure);
      }
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;
    if (this.reconnectAttempts <= 3 || this.reconnectAttempts % 5 === 0) {
      console.log(`[Gateway] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    }
    setTimeout(() => this.connect(), delay);
  }

  getGuilds(): GuildInfo[] {
    return Array.from(this.guilds.values());
  }

  getDMChannels(): DMChannel[] {
    return Array.from(this.dmChannels.values());
  }

  getChannelName(channelId: string): string {
    const name = this.channelNameMap.get(channelId) ?? 'unknown';
    // Threads/forum posts display as "parent › title" so messages show where
    // they came from, not just the (often generic) thread title.
    const parentId = this.threadParentMap.get(channelId);
    if (parentId) {
      const parentName = this.channelNameMap.get(parentId);
      if (parentName) return `${parentName} › ${name}`;
    }
    return name;
  }

  getGuildForChannel(channelId: string): string | null {
    return this.channelGuildMap.get(channelId) ?? null;
  }

  /** Parent channel id if channelId is a known thread/forum post, else null. */
  getThreadParent(channelId: string): string | null {
    return this.threadParentMap.get(channelId) ?? null;
  }

  /** Id of the category a channel sits under, null when it has none. */
  getChannelCategory(channelId: string): string | null {
    return this.channelParentMap.get(channelId) ?? null;
  }

  private registerThread(t: any, guildId?: string): void {
    if (!t?.id || !t.parent_id) return;
    this.threadParentMap.set(t.id, t.parent_id);
    if (t.name) this.channelNameMap.set(t.id, t.name);
    const gid = t.guild_id ?? guildId ?? this.channelGuildMap.get(t.parent_id);
    if (gid) this.channelGuildMap.set(t.id, gid);
  }

  getGuildName(guildId: string): string | null {
    return this.guilds.get(guildId)?.name ?? null;
  }

  getRoleName(roleId: string): string | null {
    return this.roleNameMap.get(roleId) ?? null;
  }

  getMemberRoleColor(roleIds: string[] | undefined): string | null {
    if (!roleIds || roleIds.length === 0) return null;
    let best: { color: number; position: number } | null = null;
    for (const id of roleIds) {
      const rd = this.roleDataMap.get(id);
      if (!rd || rd.color === 0) continue;
      if (!best || rd.position > best.position) {
        best = { color: rd.color, position: rd.position };
      }
    }
    if (!best) return null;
    return `#${best.color.toString(16).padStart(6, '0')}`;
  }

  // Resolves a member's role IDs to displayable {id, name} pairs, highest role
  // first. Roles whose metadata hasn't arrived yet (no GUILD_CREATE seen) are
  // skipped rather than shown as bare IDs.
  getMemberRoles(roleIds: string[] | undefined): { id: string; name: string }[] | undefined {
    if (!roleIds || roleIds.length === 0) return undefined;
    const resolved: { id: string; name: string; position: number }[] = [];
    for (const id of roleIds) {
      const rd = this.roleDataMap.get(id);
      if (!rd || !rd.name) continue;
      resolved.push({ id, name: rd.name, position: rd.position });
    }
    if (resolved.length === 0) return undefined;
    resolved.sort((a, b) => b.position - a.position);
    return resolved.map(({ id, name }) => ({ id, name }));
  }

  // Every role of a guild, highest first, for the room-config role pickers.
  // @everyone (role id === guild id) is excluded: it isn't carried on
  // member.roles, so muting or highlighting it would silently do nothing.
  getGuildRoles(guildId: string): { id: string; name: string; color: string | null }[] {
    const roleIds = this.guildRoleIds.get(guildId);
    if (!roleIds || roleIds.size === 0) return [];
    const roles: { id: string; name: string; color: string | null; position: number }[] = [];
    for (const id of roleIds) {
      if (id === guildId) continue;
      const rd = this.roleDataMap.get(id);
      if (!rd || !rd.name) continue;
      roles.push({
        id,
        name: rd.name,
        color: rd.color !== 0 ? `#${rd.color.toString(16).padStart(6, '0')}` : null,
        position: rd.position,
      });
    }
    roles.sort((a, b) => b.position - a.position);
    return roles.map(({ id, name, color }) => ({ id, name, color }));
  }

  getSelfUserId(): string | null {
    return this.selfUserId;
  }

  getSelfUserName(): string | null {
    return this.selfUserName;
  }

  // Routes REST calls through the configured proxy when set. The proxy path uses
  // undici's own fetch so the ProxyAgent dispatcher is guaranteed compatible
  // (mixing it with Node's bundled fetch can silently ignore the dispatcher);
  // the direct path goes through appFetch, which falls back to node:https where
  // WebAssembly — and therefore undici — is unavailable.
  private fetch(url: string, init?: AppRequestInit): Promise<AppResponse> {
    if (this.proxy) {
      return this.proxy.fetch(url, init);
    }
    return appFetch(url, init);
  }

  // Returns the logged-in user's role IDs for a guild, lazily fetched via REST and cached.
  async getSelfRoleIds(guildId: string): Promise<Set<string>> {
    const cached = this.selfGuildRoles.get(guildId);
    if (cached && Date.now() - cached.fetchedAt < DiscordGateway.SELF_ROLES_TTL_MS) {
      return cached.roleIds;
    }
    try {
      const res = await this.fetch(`${REST_BASE}/users/@me/guilds/${guildId}/member`, {
        headers: { Authorization: this.token },
      });
      if (!res.ok) {
        // Cache an empty set to avoid hammering the API on repeated failures.
        const empty = cached?.roleIds ?? new Set<string>();
        this.selfGuildRoles.set(guildId, { roleIds: empty, fetchedAt: Date.now() });
        return empty;
      }
      const member = await res.json();
      const roleIds = new Set<string>(Array.isArray(member.roles) ? member.roles : []);
      this.selfGuildRoles.set(guildId, { roleIds, fetchedAt: Date.now() });
      return roleIds;
    } catch {
      const empty = cached?.roleIds ?? new Set<string>();
      this.selfGuildRoles.set(guildId, { roleIds: empty, fetchedAt: Date.now() });
      return empty;
    }
  }

  async sendChannelMessage(channelId: string, content: string, attachments?: { filename: string; data: Buffer; contentType: string }[]): Promise<any> {
    if (attachments && attachments.length > 0) {
      const boundary = `----FormBoundary${Date.now()}`;
      const parts: Buffer[] = [];

      const payloadJson: any = { content };
      const payloadPart = `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payloadJson)}\r\n`;
      parts.push(Buffer.from(payloadPart));

      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        const header = `--${boundary}\r\nContent-Disposition: form-data; name="files[${i}]"; filename="${att.filename}"\r\nContent-Type: ${att.contentType}\r\n\r\n`;
        parts.push(Buffer.from(header));
        parts.push(att.data);
        parts.push(Buffer.from('\r\n'));
      }

      parts.push(Buffer.from(`--${boundary}--\r\n`));
      const body = Buffer.concat(parts);

      const res = await this.fetch(`${REST_BASE}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: this.token,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Discord API error ${res.status}: ${text}`);
      }
      return res.json();
    }

    const res = await this.fetch(`${REST_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord API error ${res.status}: ${text}`);
    }
    return res.json();
  }

  // Marks a channel read up to a message on the Discord account itself — the
  // same call the official client makes when a channel is opened, so the
  // badge clears on the user's other Discord clients too.
  async ackChannelMessage(channelId: string, messageId: string): Promise<boolean> {
    const res = await this.fetch(`${REST_BASE}/channels/${channelId}/messages/${messageId}/ack`, {
      method: 'POST',
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: null }),
    });
    if (!res.ok) {
      console.error(`[Gateway] Failed to ack channel ${channelId}: ${res.status}`);
      return false;
    }
    return true;
  }

  async fetchChannelMessages(channelId: string, limit = 30): Promise<DiscordMessage[]> {
    const url = `${REST_BASE}/channels/${channelId}/messages?limit=${limit}`;
    const res = await this.fetch(url, {
      headers: { Authorization: this.token },
    });
    if (!res.ok) {
      console.error(`[Gateway] Failed to fetch messages for ${channelId}: ${res.status}`);
      return [];
    }
    const messages: DiscordMessage[] = await res.json();
    return messages.reverse().map((msg) => {
      const guildId = msg.guild_id ?? this.channelGuildMap.get(msg.channel_id) ?? undefined;
      return {
        ...msg,
        guild_id: guildId,
      };
    });
  }

  // Fetches the users who reacted to a message with a specific emoji.
  // `emoji` must be the raw Discord identifier: `name:id` for custom emoji or
  // the unicode character for standard emoji. Returns up to `limit` users.
  async fetchReactionUsers(
    channelId: string,
    messageId: string,
    emoji: string,
    limit = 100,
  ): Promise<DiscordUser[]> {
    const url = `${REST_BASE}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}?limit=${limit}`;
    const res = await this.fetch(url, {
      headers: { Authorization: this.token },
    });
    if (!res.ok) {
      console.error(`[Gateway] Failed to fetch reaction users for ${messageId}: ${res.status}`);
      return [];
    }
    return res.json();
  }

  // The arguments a slash command was invoked with. The message payload never
  // carries them; the official client fills its command tooltip with this same
  // per-message request when the "used /command" pill is hovered. Returns null
  // on failure so a missing permission or a deleted message degrades to the
  // bare command name.
  async fetchMessageInteractionData(channelId: string, messageId: string): Promise<DiscordCommandOption[] | null> {
    const url = `${REST_BASE}/channels/${channelId}/messages/${messageId}/interaction-data`;
    const res = await this.fetch(url, {
      headers: { Authorization: this.token },
    });
    if (!res.ok) {
      console.error(`[Gateway] Failed to fetch interaction data for ${messageId}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.options ?? data?.data?.options ?? [];
  }

  disconnect(): void {
    this.stopped = true;
    this.cleanup();
    this.ws?.close();
  }
}
