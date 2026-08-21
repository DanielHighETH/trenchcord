// Must stay the first import — see env.ts for why.
import './env.js';
import path from 'path';
import { fileURLToPath } from 'url';

// A single uncaught error must not kill the process in the local app: under
// nodejs-mobile the engine cannot be restarted in-process, so a dying backend
// leaves the iOS app permanently broken until the user force-quits it (resume
// after suspension is the classic trigger — a burst of errors from sockets iOS
// tore down). The connection supervisors self-heal, so staying alive is safe.
// Hosted mode keeps default crash semantics — its process manager restarts it.
if (process.env.TRENCHCORD_MODE !== 'hosted') {
  process.on('uncaughtException', (err) => {
    console.error('[fatal-suppressed] Uncaught exception:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[fatal-suppressed] Unhandled rejection:', reason);
  });
}
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer, get as httpGet } from 'http';
import { GatewayManager } from './discord/gatewayManager.js';
import { createProxyBundle } from './discord/proxy.js';
import { configStore } from './config/store.js';
import { TelegramClientManager } from './telegram/clientManager.js';
import { processTelegramMessage } from './telegram/messageProcessor.js';
import type { TelegramRawMessage } from './telegram/types.js';
import type { TelegramMessageProcessorContext } from './telegram/messageProcessor.js';
import { WsServer } from './ws/server.js';
import { createRouter } from './api/routes.js';
import { getStorageProvider, isHostedMode } from './storage/index.js';
import { getBindHost, isAllowedHost, isAllowedOrigin, trustsLoopbackForSession, warnIfExposed } from './security/localAccess.js';
import {
  getLocalToken,
  isAuthorizedLocalRequest,
  isLoopbackRequest,
  isValidToken,
  sessionCookie,
} from './security/localAuth.js';
import { authMiddleware } from './auth/middleware.js';
import { cloudClient, isSubscriptionEnforced, subscriptionGate } from './cloud/client.js';
import { createPremiumAlertsRouter, premiumEventsPoller, startPremiumEventsPoller } from './cloud/premiumAlerts.js';
import { createCloudRouter } from './cloud/routes.js';
import { getGateway, setGateway } from './gateway/state.js';
import { UserGatewayPool } from './gateway/userGatewayPool.js';
import { buildContractUrl, detectEvmChainFromContent, extractEvmChainFromGmgnLinks, resolveEvmChainFromApi } from './utils/contract.js';
import { processDiscordMessage, resolveMentions } from './utils/messageProcessor.js';
import { extractComponentText } from './utils/componentText.js';
import type { MessageProcessorContext } from './utils/messageProcessor.js';
import { sendPushover } from './utils/pushover.js';
import { evaluateSnipe } from './sniping/engine.js';
import type { DiscordMessage, PushoverConfig, FrontendMessage, ContractLinkTemplates } from './discord/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const LOCAL_USER_ID = 'local';

const gatewayPool = new UserGatewayPool();

// Telegram state
let localTelegramManager: TelegramClientManager | null = null;
const telegramManagers = new Map<string, TelegramClientManager>();

function checkPushover(cfg: PushoverConfig, msg: FrontendMessage, evmChainHint: string | null, contractLinkTemplates: ContractLinkTemplates): void {
  // Components v2 / forwarded messages have empty content; notify with their
  // text instead.
  const text = msg.content
    || extractComponentText(msg.components)
    || msg.forwardedMessage?.content
    || extractComponentText(msg.forwardedMessage?.components)
    || (msg.poll ? `📊 ${msg.poll.question}` : '')
    || (msg.sticker ? '[Sticker]' : '')
    || '';
  if (!cfg.enabled || !cfg.appToken || !cfg.userKey) return;

  const t = cfg.triggers ?? { highlightedUser: false, highlightedUserContract: true, contract: false, keyword: false };
  const f = cfg.filters ?? { userIds: [], channelIds: [], guildIds: [] };

  const triggered =
    (t.highlightedUserContract && msg.isHighlighted && msg.hasContractAddress) ||
    (t.highlightedUser && msg.isHighlighted) ||
    (t.contract && msg.hasContractAddress) ||
    (t.keyword && msg.matchedKeywords && msg.matchedKeywords.length > 0);

  if (!triggered) return;

  if (f.userIds.length > 0 && !f.userIds.includes(msg.author.id)) return;
  if (f.channelIds.length > 0 && !f.channelIds.includes(msg.channelId)) return;
  if (f.guildIds.length > 0 && msg.guildId && !f.guildIds.includes(msg.guildId)) return;

  let title: string;
  let message: string;
  let url: string | undefined;
  let urlTitle: string | undefined;

  if (msg.hasContractAddress) {
    const addr = msg.contractAddresses[0];
    url = buildContractUrl(addr, contractLinkTemplates, evmChainHint ?? undefined);
    urlTitle = 'Open in Explorer';
    title = `Contract Alert: ${msg.author.displayName}`;
    message = `${msg.author.displayName} posted ${addr} in #${msg.channelName}`;
  } else if (msg.matchedKeywords && msg.matchedKeywords.length > 0) {
    title = `Keyword: ${msg.matchedKeywords[0]}`;
    message = `${msg.author.displayName} in #${msg.channelName}: ${text.slice(0, 120)}`;
  } else {
    title = `${msg.author.displayName}`;
    message = `Message in #${msg.channelName}: ${text.slice(0, 120)}`;
  }

  sendPushover(cfg, { title, message, url, urlTitle });
}

// When a message carries no chain hint, resolve the real chain for each EVM
// address via external liquidity APIs and backfill it. Runs in the background
// (never awaited on the message path) and broadcasts a chain_update once known.
function backfillEvmChainsFromApi(
  wsServer: WsServer,
  userId: string,
  addresses: string[],
  evmChainHint: string | null,
): void {
  if (evmChainHint) return;
  const storage = getStorageProvider();
  for (const addr of addresses) {
    if (!addr.startsWith('0x')) continue;
    resolveEvmChainFromApi(addr)
      .then(async (resolved) => {
        if (!resolved) return;
        const updated = await storage.updateEvmChain(userId, addr, resolved);
        if (updated) wsServer.broadcastChainUpdate(addr, resolved, userId);
      })
      .catch((err) => console.error('[App] EVM chain backfill failed:', err.message));
  }
}

function wireGatewayEvents(gw: GatewayManager, wsServer: WsServer, userId: string): void {
  const storage = getStorageProvider();

  gw.on('ready', (user) => {
    console.log(`[App] Logged in as ${user.username}`);
    wsServer.broadcastRaw({ type: 'gateway_ready', data: { username: user.username } }, userId);
  });

  // A guild gained, lost, renamed or moved a channel: rooms watching one of its
  // categories now resolve to a different channel list, so the clients need a
  // fresh copy. Live messages already route correctly without this.
  gw.on('guildChannelsUpdated', ({ guildId }: { guildId: string }) => {
    wsServer.broadcastRaw({ type: 'guild_channels_updated', data: { guildId } }, userId);
  });

  // Thread/forum-post messages carry the thread's id as channel_id; rooms
  // watch the parent channel, so matching considers both. Rooms that watch a
  // whole category match through the category the channel (or, for a thread,
  // its parent channel) sits under.
  async function roomsForMessageChannel(channelId: string) {
    const parentId = gw.getThreadParent(channelId);
    const categoryChannelId = parentId ?? channelId;
    const categoryId = gw.getChannelCategory(categoryChannelId);
    const category = categoryId ? { categoryId, channelId: categoryChannelId } : null;

    const rooms = await storage.getRoomsForChannel(userId, channelId, category);
    if (parentId) {
      const parentRooms = await storage.getRoomsForChannel(userId, parentId);
      for (const r of parentRooms) {
        if (!rooms.some((existing) => existing.id === r.id)) rooms.push(r);
      }
    }
    return rooms;
  }

  // DM exclusion entries match by user ID or by username/global name (leading
  // @ and case differences ignored) — the same entries the settings screen
  // takes. A list is checked against several people at once because a
  // conversation has two halves: the author covers incoming messages, the
  // channel's recipients cover outgoing ones — where the author is the
  // logged-in account, not the person the entry names.
  const dmEntryMatchesPerson = (entry: string, person: { id: string; username?: string | null; global_name?: string | null }): boolean => {
    const e = entry.trim();
    if (e === person.id) return true;
    const wanted = (e.startsWith('@') ? e.slice(1) : e).toLowerCase();
    return [person.username, person.global_name].some((n) => !!n && n.toLowerCase() === wanted);
  };
  const isDmListMatch = (
    list: string[] | undefined,
    people: { id: string; username?: string | null; global_name?: string | null }[],
  ): boolean => {
    if (!list || list.length === 0) return false;
    return list.some((entry) => people.some((p) => dmEntryMatchesPerson(entry, p)));
  };

  gw.on('message', async (rawMsg: DiscordMessage & { _channelName: string; _guildName: string | null; _accountName?: string | null }) => {
    const dmChannel = !rawMsg.guild_id ? gw.getDMChannels().find((dm) => dm.id === rawMsg.channel_id) : undefined;
    const isDM = !!dmChannel;
    const rooms = await roomsForMessageChannel(rawMsg.channel_id);

    if (rooms.length === 0 && !isDM) return;

    const config = await storage.getConfig(userId);
    const isHighlighted = await storage.isUserHighlighted(userId, rawMsg.author.id, undefined, undefined, rawMsg.member?.roles);
    const ctx: MessageProcessorContext = {
      config,
      isHighlighted,
      cacheUserName: (discordUserId, displayName) => {
        storage.cacheUserName(userId, discordUserId, displayName);
      },
    };

    const roomKeywords = rooms.flatMap((r) => r.keywordPatterns ?? []);
    const frontendMsg = processDiscordMessage(gw, rawMsg, rawMsg._channelName, rawMsg._guildName, roomKeywords, ctx);
    // Text/embeds outside `content`: Components v2 trees plus forwarded
    // snapshots (message_snapshots), both invisible to plain content scans.
    const snapshot = rawMsg.message_snapshots?.[0]?.message;
    const auxText = [
      extractComponentText(rawMsg.components),
      snapshot?.content,
      extractComponentText(snapshot?.components),
    ].filter(Boolean).join('\n');
    const allEmbeds = snapshot?.embeds?.length
      ? [...(rawMsg.embeds ?? []), ...snapshot.embeds]
      : rawMsg.embeds;
    const evmChainHint = detectEvmChainFromContent(rawMsg.content, allEmbeds, auxText);

    checkPushover(config.pushover, frontendMsg, evmChainHint, config.contractLinkTemplates);

    const roomIds = rooms.map((r) => r.id);
    if (isDM) {
      const recipients = dmChannel?.recipients ?? [];
      // A hidden conversation gets routed nowhere — neither its own sidebar
      // entry nor the aggregate feed — and matches by any participant, so a
      // group DM the hidden account sits in disappears too.
      if (!isDmListMatch(config.dmHiddenConversations, [rawMsg.author, ...recipients])) {
        roomIds.push(`dm:${rawMsg.channel_id}`);
        // Every DM also collects into the virtual "All DMs" room — unless
        // excluded there; the individual DM conversation pushed above is kept
        // either way. Matching the sole recipient besides the author keeps
        // *your* half of a 1:1 conversation out too, while in a group DM only
        // the excluded member's own messages are dropped.
        const excludedPeople = recipients.length === 1 ? [rawMsg.author, ...recipients] : [rawMsg.author];
        if (!isDmListMatch(config.dmExcludedUsers, excludedPeople)) roomIds.push('dms');
      }
      // With several tokens, say which account the DM landed on; with one
      // there is nothing to disambiguate.
      if (gw.getAccountCount() > 1 && rawMsg._accountName) {
        frontendMsg.receiverName = rawMsg._accountName;
      }
    }

    // Mentions: collect guild messages where the logged-in user / their role / @here / @everyone
    // was mentioned, per enabled settings, into a virtual "mentions" room. Bot-authored
    // messages (Rick replies etc.) are skipped entirely when mentionsBotsEnabled is off.
    if (rawMsg.guild_id) {
      const selfIds = gw.getSelfUserIds();
      if (!selfIds.has(rawMsg.author.id) && (config.mentionsBotsEnabled || !rawMsg.author.bot)) {
        const mentionTypes: ('user' | 'role' | 'here' | 'everyone')[] = [];
        if (config.mentionsUserEnabled && rawMsg.mentions?.some((u) => selfIds.has(u.id))) {
          mentionTypes.push('user');
        }
        if (rawMsg.mention_everyone) {
          if (config.mentionsHereEnabled && rawMsg.content.includes('@here')) mentionTypes.push('here');
          if (config.mentionsEveryoneEnabled && rawMsg.content.includes('@everyone')) mentionTypes.push('everyone');
        }
        if (config.mentionsRoleEnabled && rawMsg.mention_roles && rawMsg.mention_roles.length > 0) {
          const selfRoles = await gw.getSelfRoleIds(rawMsg.guild_id);
          if (rawMsg.mention_roles.some((r) => selfRoles.has(r))) mentionTypes.push('role');
        }
        if (mentionTypes.length > 0) {
          frontendMsg.mentionTypes = mentionTypes;
          roomIds.push('mentions');
        }
      }
    }

    // Keywords: keyword-matched messages also collect into the virtual
    // "keywords" room, a running history feed like Mentions.
    if (frontendMsg.matchedKeywords && frontendMsg.matchedKeywords.length > 0) {
      roomIds.push('keywords');
    }

    if (frontendMsg.hasContractAddress) {
      for (const addr of frontendMsg.contractAddresses) {
        const isEvm = addr.startsWith('0x');
        const entry = {
          address: addr,
          chain: (isEvm ? 'evm' : 'sol') as 'evm' | 'sol',
          evmChain: isEvm ? (evmChainHint ?? undefined) : undefined,
          authorId: frontendMsg.author.id,
          authorName: frontendMsg.author.displayName,
          authorAvatar: frontendMsg.author.avatar,
          authorIsBot: frontendMsg.author.isBot,
          channelId: frontendMsg.channelId,
          channelName: frontendMsg.channelName,
          guildId: frontendMsg.guildId,
          guildName: frontendMsg.guildName,
          roomIds,
          messageId: frontendMsg.id,
          timestamp: frontendMsg.timestamp,
          source: 'discord' as const,
          // v2/forwarded messages have empty content; fall back to their text.
          content: (frontendMsg.content || auxText).slice(0, 400),
        };
        await storage.logContract(userId, entry);
        if (isEvm && evmChainHint) {
          await storage.updateEvmChain(userId, addr, evmChainHint);
        }
        wsServer.broadcastContract(entry, userId);
      }
      backfillEvmChainsFromApi(wsServer, userId, frontendMsg.contractAddresses, evmChainHint);
    }

    const gmgnChainUpdates = extractEvmChainFromGmgnLinks(rawMsg.content, allEmbeds, auxText);
    for (const { address, chain: detectedChain } of gmgnChainUpdates) {
      const updated = await storage.updateEvmChain(userId, address, detectedChain);
      if (updated) {
        wsServer.broadcastChainUpdate(address, detectedChain, userId);
      }
    }

    if (frontendMsg.matchedKeywords && frontendMsg.matchedKeywords.length > 0) {
      wsServer.broadcastAlert({
        type: 'keyword_match',
        message: frontendMsg,
        reason: `Keyword match: ${frontendMsg.matchedKeywords.join(', ')}`,
      }, userId);
    }

    // Fire-and-forget, and unconditional: an embed-only CA (Rick-style caller
    // bots) has hasContractAddress === false, so the engine does its own
    // extraction. Its cheap bails make this free for non-sniped rooms.
    void evaluateSnipe({
      userId, config, message: frontendMsg, roomIds, wsServer,
      messageRef: { messageId: frontendMsg.id, channelId: frontendMsg.channelId },
    }).catch((err) => console.error('[sniper] evaluate failed:', err));

    wsServer.broadcastMessage(frontendMsg, roomIds, userId);
  });

  gw.on('messageUpdate', async (rawMsg: Partial<DiscordMessage> & { id: string; channel_id: string; guild_id?: string; _channelName: string; _guildName: string | null }) => {
    const rooms = await roomsForMessageChannel(rawMsg.channel_id);
    const isDM = !rawMsg.guild_id && gw.getDMChannels().some((dm) => dm.id === rawMsg.channel_id);
    if (rooms.length === 0 && !isDM) return;

    const roomIds = rooms.map((r) => r.id);
    if (isDM) roomIds.push(`dm:${rawMsg.channel_id}`, 'dms');

    const config = await storage.getConfig(userId);

    // Caller bots typically post first and attach the CA-bearing embed via an
    // edit moments later, so the update path is the one that matters most for
    // sniping. The engine's already-sniped ledger makes create+edit
    // double-delivery safe. Author is absent on some edit payloads, in which
    // case only whole-room configs can match.
    if (!isHostedMode()) {
      void evaluateSnipe({
        userId,
        config,
        message: {
          content: rawMsg.content ?? '',
          embeds: rawMsg.embeds ?? [],
          components: rawMsg.components ?? [],
          forwardedMessage: rawMsg.message_snapshots?.[0]?.message ?? null,
          author: rawMsg.author ? { id: rawMsg.author.id, username: rawMsg.author.username } : undefined,
        },
        roomIds,
        wsServer,
        messageRef: { messageId: rawMsg.id, channelId: rawMsg.channel_id },
      }).catch((err) => console.error('[sniper] evaluate failed:', err));
    }

    wsServer.broadcastMessageUpdate({
      messageId: rawMsg.id,
      channelId: rawMsg.channel_id,
      embeds: rawMsg.embeds,
      content: rawMsg.content,
      attachments: rawMsg.attachments,
      components: rawMsg.components,
      // Deferred bot replies create an empty shell and attach the
      // mention-bearing embeds via this edit, so mentions re-resolve here.
      mentions: resolveMentions(gw, rawMsg, config.userNameCache ?? {}, (id, name) => storage.cacheUserName(userId, id, name)),
      editedTimestamp: rawMsg.edited_timestamp ?? null,
    }, roomIds, userId);
  });

  gw.on('messageDelete', async (data: { id: string; channel_id: string; guild_id?: string | null }) => {
    const rooms = await roomsForMessageChannel(data.channel_id);
    const isDM = !data.guild_id && gw.getDMChannels().some((dm) => dm.id === data.channel_id);
    if (rooms.length === 0 && !isDM) return;

    const roomIds = rooms.map((r) => r.id);
    if (isDM) roomIds.push(`dm:${data.channel_id}`, 'dms');

    wsServer.broadcastMessageDelete({
      messageId: data.id,
      channelId: data.channel_id,
    }, roomIds, userId);
  });

  // Reading a channel in an official Discord client acks it on the gateway;
  // mirror that so the matching unread badges clear here too. The aggregate
  // All DMs badge is intentionally not in roomIds — other DMs may still be
  // unread, so the frontend subtracts this DM's share instead.
  gw.on('messageAck', async (data: { channelId: string; messageId: string }) => {
    const rooms = await roomsForMessageChannel(data.channelId);
    const isDM = gw.getDMChannels().some((dm) => dm.id === data.channelId);
    if (rooms.length === 0 && !isDM) return;

    const roomIds = rooms.map((r) => r.id);
    if (isDM) roomIds.push(`dm:${data.channelId}`);

    wsServer.broadcastMessageAck({ channelId: data.channelId, messageId: data.messageId }, roomIds, userId);
  });

  gw.on('reactionUpdate', (data) => {
    wsServer.broadcastReactionUpdate(data, userId);
  });

  gw.on('pollVoteUpdate', (data) => {
    wsServer.broadcastPollVoteUpdate(data, userId);
  });

  gw.on('fatal', (err: Error) => {
    console.error('[App] Fatal gateway error:', err.message);
  });

  gw.on('auth_failed', (failure: { tokenIndex: number; message: string; invalid: boolean; blocked?: boolean }) => {
    const tokenNumber = failure.tokenIndex + 1;
    // A block is an IP/network problem, not a per-token issue, so skip the
    // "Token #N:" prefix that would wrongly imply the token is at fault.
    const error = failure.blocked ? failure.message : `Token #${tokenNumber}: ${failure.message}`;
    console.error('[App] Discord gateway connection failed:', error);
    wsServer.broadcastRaw(
      { type: 'gateway_auth_failed', error, tokenIndex: failure.tokenIndex, tokenInvalid: failure.invalid, tokenBlocked: failure.blocked ?? false },
      userId,
    );
  });
}

export function connectGateway(tokens: string[], wsServer: WsServer, userId: string = LOCAL_USER_ID): GatewayManager {
  if (isHostedMode()) {
    return gatewayPool.getOrCreate(userId, tokens, (gw) => {
      wireGatewayEvents(gw, wsServer, userId);
    });
  }

  // Local mode: single global gateway. The Discord connection originates from
  // the user's own machine/IP, so an optional proxy lets VPN-blocked users route
  // gateway + REST traffic through a residential/HTTP proxy.
  const existing = getGateway();
  if (existing) {
    existing.disconnect();
  }
  const proxy = createProxyBundle(configStore.getConfig().discordProxyUrl);
  const gw = new GatewayManager(tokens, proxy);
  setGateway(gw);
  wireGatewayEvents(gw, wsServer, userId);
  gw.connect();
  return gw;
}

export function disconnectGateway(userId: string = LOCAL_USER_ID): void {
  if (isHostedMode()) {
    gatewayPool.disconnect(userId);
  } else {
    const gw = getGateway();
    if (gw) gw.disconnect();
    setGateway(null);
  }
}

export function getUserGateway(userId: string): GatewayManager | null {
  if (isHostedMode()) {
    return gatewayPool.get(userId);
  }
  return getGateway();
}

// --- Telegram ---

function wireTelegramEvents(tg: TelegramClientManager, wsServer: WsServer, userId: string): void {
  const storage = getStorageProvider();

  // DM exclusions for Telegram: match by user ID or by @username / display
  // name (leading @ and case differences ignored) — the same entries the
  // settings screen takes. Matched against the *chat*, not the sender: in a
  // 1:1 Telegram chat the chat is the conversation partner whichever side
  // wrote, so an entry also catches your own outgoing half, where the sender
  // is you. Mirrors the Discord matcher above.
  const isTgDmConversationMatch = (list: string[] | undefined, raw: TelegramRawMessage): boolean => {
    if (!list || list.length === 0) return false;
    const names = [raw.chatUsername, raw.chatTitle]
      .filter((n): n is string => !!n)
      .map((n) => n.toLowerCase());
    return list.some((entry) => {
      const e = entry.trim();
      if (e === raw.chatId) return true;
      return names.includes((e.startsWith('@') ? e.slice(1) : e).toLowerCase());
    });
  };

  tg.on('ready', (user: { id: string; username: string | null; firstName: string; index: number }) => {
    console.log(`[App] Telegram logged in as ${user.firstName} (@${user.username ?? 'no-username'})`);
    wsServer.broadcastRaw({
      type: 'telegram_ready',
      data: { username: user.username, firstName: user.firstName, accountIndex: user.index },
    }, userId);
  });

  tg.on('message', async (raw: TelegramRawMessage) => {
    const rooms = await storage.getRoomsForChannel(userId, raw.chatId);
    const isTgDm = raw.chatType === 'user';

    if (rooms.length === 0 && !isTgDm) return;

    const config = await storage.getConfig(userId);
    const isHighlighted = await storage.isUserHighlighted(userId, raw.sender.id, undefined, raw.sender.username);
    const ctx: TelegramMessageProcessorContext = {
      config,
      isHighlighted,
      cacheUserName: (telegramUserId, displayName) => {
        storage.cacheUserName(userId, telegramUserId, displayName);
      },
    };

    const roomKeywords = rooms.flatMap((r) => r.keywordPatterns ?? []);
    const frontendMsg = processTelegramMessage(raw, roomKeywords, ctx);
    const evmChainHint = detectEvmChainFromContent(raw.text, []);

    checkPushover(config.pushover, frontendMsg, evmChainHint, config.contractLinkTemplates);

    const roomIds = rooms.map((r) => r.id);
    if (isTgDm) {
      // A hidden conversation gets routed nowhere — neither its own sidebar
      // entry nor the aggregate feed.
      if (!isTgDmConversationMatch(config.tgDmHiddenConversations, raw)) {
        roomIds.push(`tg-dm:${raw.chatId}`);
        // Telegram DMs collect into the same aggregate "All DMs" feed as
        // Discord DMs — unless that's switched off or the conversation is
        // excluded there; the individual conversation pushed above is kept
        // either way.
        if (config.telegramDmsInAllDms !== false && !isTgDmConversationMatch(config.tgDmExcludedUsers, raw)) {
          roomIds.push('dms');
        }
      }
    }

    // Same virtual "keywords" feed as the Discord handler.
    if (frontendMsg.matchedKeywords && frontendMsg.matchedKeywords.length > 0) {
      roomIds.push('keywords');
    }

    if (frontendMsg.hasContractAddress) {
      for (const addr of frontendMsg.contractAddresses) {
        const isEvm = addr.startsWith('0x');
        const entry = {
          address: addr,
          chain: (isEvm ? 'evm' : 'sol') as 'evm' | 'sol',
          evmChain: isEvm ? (evmChainHint ?? undefined) : undefined,
          authorId: frontendMsg.author.id,
          authorName: frontendMsg.author.displayName,
          authorAvatar: frontendMsg.author.avatar,
          authorIsBot: frontendMsg.author.isBot,
          channelId: frontendMsg.channelId,
          channelName: frontendMsg.channelName,
          guildId: frontendMsg.guildId,
          guildName: frontendMsg.guildName,
          roomIds,
          messageId: frontendMsg.id,
          timestamp: frontendMsg.timestamp,
          source: 'telegram' as const,
          content: frontendMsg.content.slice(0, 400),
        };
        await storage.logContract(userId, entry);
        if (isEvm && evmChainHint) {
          await storage.updateEvmChain(userId, addr, evmChainHint);
        }
        wsServer.broadcastContract(entry, userId);
      }
      backfillEvmChainsFromApi(wsServer, userId, frontendMsg.contractAddresses, evmChainHint);
    }

    if (frontendMsg.matchedKeywords && frontendMsg.matchedKeywords.length > 0) {
      wsServer.broadcastAlert({
        type: 'keyword_match',
        message: frontendMsg,
        reason: `Keyword match: ${frontendMsg.matchedKeywords.join(', ')}`,
      }, userId);
    }

    // Same fire-and-forget snipe hook as the Discord handler. Telegram
    // messages carry no embeds, so content extraction covers everything.
    void evaluateSnipe({
      userId, config, message: frontendMsg, roomIds, wsServer,
      messageRef: { messageId: frontendMsg.id, channelId: frontendMsg.channelId },
    }).catch((err) => console.error('[sniper] evaluate failed:', err));

    wsServer.broadcastMessage(frontendMsg, roomIds, userId);
  });

  tg.on('messageUpdate', async (raw: TelegramRawMessage) => {
    const rooms = await storage.getRoomsForChannel(userId, raw.chatId);
    const isTgDm = raw.chatType === 'user';
    if (rooms.length === 0 && !isTgDm) return;

    const roomIds = rooms.map((r) => r.id);
    // Like the Discord edit path, 'dms' is pushed unconditionally: an edit for
    // a message the feed never received is a client-side no-op.
    if (isTgDm) roomIds.push(`tg-dm:${raw.chatId}`, 'dms');

    const frontendMsg = processTelegramMessage(raw);
    wsServer.broadcastMessageUpdate({
      messageId: frontendMsg.id,
      channelId: frontendMsg.channelId,
      content: frontendMsg.content,
    }, roomIds, userId);
  });

  tg.on('disconnected', (reason: string) => {
    console.warn(`[App] Telegram disconnected: ${reason}`);
    wsServer.broadcastRaw({ type: 'telegram_status', data: { connected: false, reason } }, userId);
  });

  tg.on('reconnected', () => {
    console.log('[App] Telegram reconnected');
    wsServer.broadcastRaw({ type: 'telegram_status', data: { connected: true } }, userId);
  });

  tg.on('account_fatal', (info: { index: number; accountId: string | null; error: string }) => {
    console.error(`[App] Telegram account #${info.index + 1} session is no longer valid:`, info.error);
    wsServer.broadcastRaw({
      type: 'telegram_status',
      data: { accountIndex: info.index, reason: info.error, accountFatal: true },
    }, userId);
  });

  tg.on('fatal', (err: Error) => {
    console.error('[App] Fatal Telegram error:', err.message);
    wsServer.broadcastRaw({ type: 'telegram_status', data: { connected: false, reason: err.message, fatal: true } }, userId);
  });
}

export async function connectTelegram(
  apiId: number,
  apiHash: string,
  sessions: string[],
  wsServer: WsServer,
  userId: string = LOCAL_USER_ID,
): Promise<TelegramClientManager> {
  // Disconnect existing
  disconnectTelegram(userId);

  const tg = new TelegramClientManager(apiId, apiHash, sessions);
  wireTelegramEvents(tg, wsServer, userId);
  await tg.connect();

  if (isHostedMode()) {
    telegramManagers.set(userId, tg);
  } else {
    localTelegramManager = tg;
  }

  return tg;
}

export function disconnectTelegram(userId: string = LOCAL_USER_ID): void {
  if (isHostedMode()) {
    const tg = telegramManagers.get(userId);
    if (tg) {
      tg.disconnect();
      telegramManagers.delete(userId);
    }
  } else {
    if (localTelegramManager) {
      localTelegramManager.disconnect();
      localTelegramManager = null;
    }
  }
}

export function getUserTelegram(userId: string): TelegramClientManager | null {
  if (isHostedMode()) {
    return telegramManagers.get(userId) ?? null;
  }
  return localTelegramManager;
}

// Adds one account to a running manager instead of rebuilding it, so the
// accounts already connected keep their session and cached dialogs. `sessions`
// is the full updated list, used only when there is nothing running yet.
export async function addTelegramSession(
  userId: string,
  session: string,
  apiId: number,
  apiHash: string,
  sessions: string[],
  wsServer: WsServer,
): Promise<TelegramClientManager> {
  const existing = getUserTelegram(userId);
  if (existing) {
    await existing.addSession(session);
    return existing;
  }
  return connectTelegram(apiId, apiHash, sessions, wsServer, userId);
}

export async function removeTelegramSession(userId: string, index: number): Promise<void> {
  const manager = getUserTelegram(userId);
  if (!manager) return;
  await manager.removeSessionAt(index, { logOut: true });
  if (manager.getClientCount() === 0) {
    disconnectTelegram(userId);
  }
}

export async function logOutAllTelegramSessions(userId: string): Promise<void> {
  const manager = getUserTelegram(userId);
  if (!manager) return;
  while (manager.getClientCount() > 0) {
    await manager.removeSessionAt(0, { logOut: true });
  }
}

const app = express();

// CORS: restrict origins in hosted mode, restrict to this machine in local mode
if (isHostedMode()) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];
  app.use(cors({
    origin: allowedOrigins.length > 0
      ? (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        }
      : true,
    credentials: true,
  }));
} else {
  // Local mode has no authentication and its settings export contains Discord
  // tokens and Telegram sessions in plaintext, so a wildcard here would let any
  // page you happen to have open read them out of localhost.
  app.use(cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  }));

  // Rejects requests whose Host header isn't this machine, which is what a DNS
  // rebinding attack looks like once the attacker's domain resolves to
  // 127.0.0.1 and the origin check no longer applies. The Origin check is
  // enforced here rather than left to the cors() middleware above, because that
  // one only withholds the response header - the request still runs.
  app.use((req, res, next) => {
    if (!isAllowedHost(req.headers.host)) {
      console.warn(`[App] Blocked request with unexpected Host header: ${req.headers.host}`);
      return res.status(403).json({ error: 'Forbidden: unexpected Host header.' });
    }
    if (!isAllowedOrigin(req.headers.origin)) {
      console.warn(`[App] Blocked request from unexpected origin: ${req.headers.origin}`);
      return res.status(403).json({ error: 'Forbidden: unexpected origin.' });
    }
    next();
  });
}

// Security headers in hosted mode
if (isHostedMode()) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
}

app.use(express.json());

// Rate limiting on auth endpoints in hosted mode
if (isHostedMode()) {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api/auth', authLimiter);

  const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api', generalLimiter);
}

const httpServer = createServer(app);
const wsServer = new WsServer(httpServer);

if (isHostedMode()) {
  wsServer.setUserLifecycleCallbacks(
    (userId) => gatewayPool.markClientConnected(userId),
    (userId) => gatewayPool.markClientDisconnected(userId),
  );
}

if (!isHostedMode()) {
  // Hands the page its token. A request already on this machine is trusted to
  // ask for one (it is the app you just opened); anything else has to prove it
  // already knows the token, which is how a phone on the LAN gets in after you
  // open the tokenised URL printed at startup.
  app.get('/api/local-session', (req, res) => {
    const trustedByOrigin = trustsLoopbackForSession() && isLoopbackRequest(req);
    if (!trustedByOrigin && !isAuthorizedLocalRequest(req)) {
      return res.status(401).json({ error: 'A valid token is required from a remote device.' });
    }
    res.setHeader('Set-Cookie', sessionCookie());
    res.status(204).end();
  });

  app.use('/api', (req, res, next) => {
    if (isAuthorizedLocalRequest(req)) return next();
    res.status(401).json({ error: 'Unauthorized: this Trenchcord API requires the local session token.' });
  });
}

// Account pairing/status must stay reachable while the gate below is closed,
// so this router is mounted ahead of it (still behind the local auth guard).
app.use('/api/cloud', createCloudRouter());

if (!isHostedMode()) {
  // The iOS shell calls this when the app returns to the foreground. iOS freezes
  // the whole process while backgrounded, which kills the Discord and Telegram
  // sockets without either side noticing; both supervisors would find out on
  // their own eventually, but only after up to a minute of silently missing
  // messages. Mounted ahead of the subscription gate so a resume still works
  // while the gate is closed (there is nothing to leak — it starts no new work).
  app.post('/api/system/resume', (_req, res) => {
    getGateway()?.probeNow();
    localTelegramManager?.probeNow();
    premiumEventsPoller.pollNow();
    res.status(204).end();
  });
}
// Full subscription gate — on by default; TRENCHCORD_REQUIRE_SUBSCRIPTION=0 disables.
app.use('/api', subscriptionGate);

// Premium alerts proxy — behind the gate (it is itself a premium feature).
app.use('/api/premium', createPremiumAlertsRouter());

app.use('/api', authMiddleware, createRouter(wsServer));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const frontendDist = process.env.TRENCHCORD_FRONTEND_DIST || path.resolve(__dirname, '../../frontend/dist');

// Ahead of the static handler, which would otherwise answer "/" itself and skip
// this. Opening the tokenised URL on another device exchanges the token for the
// cookie once, then drops it from the address bar so it isn't left behind in
// history or read off a shared screen.
if (!isHostedMode()) {
  app.get('*', (req, res, next) => {
    if (typeof req.query.token !== 'string' || !isValidToken(req.query.token)) return next();
    res.setHeader('Set-Cookie', sessionCookie());
    res.redirect(req.path);
  });
}

app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const BIND_HOST = getBindHost(isHostedMode());

httpServer.listen(PORT, BIND_HOST, async () => {
  console.log(`[App] Server running on http://localhost:${PORT}`);
  console.log(`[App] Mode: ${isHostedMode() ? 'hosted' : 'local'}`);
  if (!isHostedMode()) {
    // Materialised at startup rather than on first use. The desktop app never
    // needs the file — it loads the page from loopback and is handed the cookie
    // — but the iOS shell has no loopback shortcut and must read the token off
    // disk to open the WebView, so it has to be there before the first request.
    getLocalToken();
  }
  if (!isHostedMode() && warnIfExposed(BIND_HOST)) {
    console.warn(
      `[App] To open Trenchcord from another device, use:  http://<this-machine>:${PORT}/?token=${getLocalToken()}`,
    );
  }

  if (!isHostedMode()) {
    const autoConnect = async (): Promise<void> => {
      const storage = getStorageProvider();
      const tokens = await storage.getTokens(LOCAL_USER_ID);
      if (tokens.length > 0) {
        console.log(`[App] Found ${tokens.length} Discord token(s), connecting...`);
        connectGateway(tokens, wsServer, LOCAL_USER_ID);
      } else {
        console.log('[App] No Discord tokens configured. Waiting for token setup via frontend.');
      }

      const config = await storage.getConfig(LOCAL_USER_ID);
      if (config.telegramSessions?.length && config.telegramApiId && config.telegramApiHash) {
        console.log(`[App] Found ${config.telegramSessions.length} Telegram session(s), connecting...`);
        connectTelegram(
          parseInt(config.telegramApiId),
          config.telegramApiHash,
          config.telegramSessions,
          wsServer,
          LOCAL_USER_ID,
        ).catch((err) => console.error('[App] Telegram connection failed:', err.message));
      }
    };

    await cloudClient.init();
    // Self-gates on link + entitlement, so starting unconditionally is safe.
    startPremiumEventsPoller(wsServer, LOCAL_USER_ID);
    if (isSubscriptionEnforced()) {
      // The periodic entitlement refresh can flip these mid-session: revoking
      // the device on the dashboard (or the grace window lapsing) tears the
      // connections down and gates the UI at once; re-linking brings both
      // back — no restart needed.
      cloudClient.on('unentitled', () => {
        console.log('[App] Entitlement lost — disconnecting until the account is linked again.');
        disconnectGateway(LOCAL_USER_ID);
        disconnectTelegram(LOCAL_USER_ID);
        wsServer.broadcastRaw({ type: 'subscription_status', data: cloudClient.getStatus() }, LOCAL_USER_ID);
      });
      cloudClient.on('entitled', () => {
        wsServer.broadcastRaw({ type: 'subscription_status', data: cloudClient.getStatus() }, LOCAL_USER_ID);
        void autoConnect();
      });
    }
    if (isSubscriptionEnforced() && !cloudClient.isEntitled()) {
      console.log('[App] Subscription required: waiting for account link + active subscription before connecting.');
    } else {
      await autoConnect();
    }
  } else {
    console.log('[App] Hosted mode: gateways will connect per-user on demand.');
  }
});

// ---------------------------------------------------------------------------
// iOS thaw self-healing.
//
// iOS freezes the whole process while the app is backgrounded. Two things can
// be broken by the time it thaws:
//
//   1. The Discord/Telegram sockets are dead — the supervisors fix that once
//      probed (the shell's resume nudge normally does it).
//   2. The HTTP *listener* itself was invalidated by the OS during a long
//      suspension: the event loop is fine, but no new connection is ever
//      accepted again. The web view, the shell's health checks and its resume
//      nudge all run over that listener, so everything fails forever and the
//      app dead-ends on the "backend stopped" screen even though this process
//      is alive.
//
// The shell cannot repair (2) from the outside — every channel it has to
// reach us is the broken one. So the thaw is detected from the inside: a
// timer that fires tens of seconds late means the process was suspended.
// Then the listener is probed over loopback and rebuilt if it doesn't
// answer, and the socket supervisors are probed regardless (the shell's
// nudge may have hit us before the event loop had actually thawed).
if (process.env.TRENCHCORD_PLATFORM === 'ios') {
  const TICK_MS = 5_000;
  // Below this the freeze was a quick app switch — sockets usually survive
  // those, and the shell's foreground nudge already covers them.
  const SUSPENSION_MS = 30_000;
  let lastTick = Date.now();
  let healing = false;

  const listenerAnswers = (): Promise<boolean> =>
    new Promise((resolve) => {
      // node:http directly — global fetch does not exist under nodejs-mobile
      // (see utils/http.ts), and this must stay dependency-free.
      const req = httpGet(`http://127.0.0.1:${PORT}/health`, { timeout: 3_000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve(false));
    });

  const rebuildListener = (): Promise<void> =>
    new Promise((resolve) => {
      const onError = (err: Error) => {
        console.error('[Thaw] Listener rebuild failed:', err.message);
        finish();
      };
      const finish = () => {
        httpServer.off('error', onError);
        resolve();
      };
      httpServer.closeAllConnections();
      httpServer.close(() => {
        httpServer.once('error', onError);
        httpServer.listen(PORT, BIND_HOST, () => {
          console.log('[Thaw] HTTP listener rebuilt');
          finish();
        });
      });
    });

  setInterval(() => {
    const drift = Date.now() - lastTick - TICK_MS;
    lastTick = Date.now();
    if (drift < SUSPENSION_MS || healing) return;
    healing = true;
    console.log(`[Thaw] Process was suspended ~${Math.round(drift / 1000)}s — checking listener and sockets`);
    void (async () => {
      try {
        if (!(await listenerAnswers())) {
          console.warn('[Thaw] Listener is not answering after thaw — rebuilding it');
          await rebuildListener();
        }
        getGateway()?.probeNow();
        localTelegramManager?.probeNow();
        premiumEventsPoller.pollNow();
      } finally {
        healing = false;
      }
    })();
  }, TICK_MS);
}
