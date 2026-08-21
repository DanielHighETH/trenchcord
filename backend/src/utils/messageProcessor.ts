import { configStore } from '../config/store.js';
import { detectContractAddresses } from './contract.js';
import { extractComponentText } from './componentText.js';
import { matchKeywords } from './keywordMatcher.js';
import type { GatewayManager } from '../discord/gatewayManager.js';
import type { FrontendMessage, DiscordMessage, DiscordCommandOption, MessageInteractionInfo, KeywordPattern, AppConfig } from '../discord/types.js';

export interface MessageProcessorContext {
  config: AppConfig;
  isHighlighted: boolean;
  cacheUserName: (discordUserId: string, displayName: string) => void;
}

/**
 * Resolves every mention in a message into the display-name map the frontend
 * renders from. Users actually pinged arrive in `mentions`; ids that only
 * appear in text -- embed text especially, which Discord never lists in
 * `mentions` (e.g. bot embeds with "Sent to <@id>") -- are resolved from the
 * gateway caches and the persisted user-name cache. Shared by the create and
 * update paths: deferred bot replies send an empty shell first and attach the
 * mention-bearing embed via an edit, so the update must re-resolve too.
 */
export function resolveMentions(
  gateway: GatewayManager,
  rawMsg: Partial<DiscordMessage>,
  userNameCache: Record<string, string>,
  cacheUserName?: (discordUserId: string, displayName: string) => void,
): Record<string, string> {
  const mentionsMap: Record<string, string> = {};
  for (const user of rawMsg.mentions ?? []) {
    const name = user.global_name ?? user.username;
    mentionsMap[user.id] = name;
    cacheUserName?.(user.id, name);
  }
  for (const ch of rawMsg.mention_channels ?? []) {
    mentionsMap[`ch:${ch.id}`] = ch.name;
  }

  const snapshot = rawMsg.message_snapshots?.[0]?.message;
  const embedText = [...(rawMsg.embeds ?? []), ...(snapshot?.embeds ?? [])]
    .flatMap((e) => [
      e.author?.name,
      e.title,
      e.description,
      e.footer?.text,
      ...(e.fields ?? []).flatMap((f) => [f.name, f.value]),
    ]);
  const scanText = [
    rawMsg.content,
    extractComponentText(rawMsg.components),
    snapshot?.content,
    extractComponentText(snapshot?.components),
    rawMsg.poll?.question?.text,
    ...(rawMsg.poll?.answers ?? []).map((a) => a.poll_media?.text),
    ...embedText,
  ].filter(Boolean).join('\n');

  const channelMentionRegex = /<#(\d+)>/g;
  let chMatch;
  while ((chMatch = channelMentionRegex.exec(scanText)) !== null) {
    if (!mentionsMap[`ch:${chMatch[1]}`]) {
      const chName = gateway.getChannelName(chMatch[1]);
      if (chName !== 'unknown') mentionsMap[`ch:${chMatch[1]}`] = chName;
    }
  }
  const roleMentionRegex = /<@&(\d+)>/g;
  let roleMatch;
  while ((roleMatch = roleMentionRegex.exec(scanText)) !== null) {
    const rName = gateway.getRoleName(roleMatch[1]);
    if (rName) mentionsMap[`role:${roleMatch[1]}`] = rName;
  }
  const userMentionRegex = /<@!?(\d+)>/g;
  let userMatch;
  while ((userMatch = userMentionRegex.exec(scanText)) !== null) {
    if (!mentionsMap[userMatch[1]] && userNameCache[userMatch[1]]) {
      mentionsMap[userMatch[1]] = userNameCache[userMatch[1]];
    }
  }
  return mentionsMap;
}

/**
 * The one-line preview shown on a reply's spine. Ordinary messages preview
 * their content, while components-v2 and forwarded messages keep their text
 * outside `content` and are read from there. A message with neither -- an
 * image, a sticker, a bot embed -- has nothing to preview, so it is flagged
 * for the "Click to see attachment" line Discord shows in its place.
 */
function buildReplyPreview(ref: DiscordMessage): { content: string; hasAttachment: boolean } {
  const snapshot = ref.message_snapshots?.[0]?.message;
  const content = [
    ref.content,
    extractComponentText(ref.components),
    snapshot?.content,
    extractComponentText(snapshot?.components),
  ].find((text) => text && text.trim().length > 0) ?? '';
  const hasMedia = (ref.attachments?.length ?? 0) > 0
    || (ref.embeds?.length ?? 0) > 0
    || (ref.sticker_items?.length ?? 0) > 0
    || (snapshot?.attachments?.length ?? 0) > 0
    || (snapshot?.embeds?.length ?? 0) > 0;
  return { content, hasAttachment: !content && hasMedia };
}

/** Longest argument string kept on the message; a pasted contract plus a couple
 * of flags fits comfortably, a wall of text does not travel to the frontend. */
const MAX_INTERACTION_ARGS = 160;

/**
 * "ca: 488Sa...pump" -- the arguments a command was invoked with, flattened in
 * the order Discord lists them. Subcommand options (types 1 and 2) hold nested
 * options instead of a value, and their own name is already part of
 * `interaction.name`, so only the leaves are printed.
 */
export function formatCommandOptions(options: DiscordCommandOption[] | undefined): string {
  const parts: string[] = [];
  const walk = (opts: DiscordCommandOption[] | undefined) => {
    for (const opt of opts ?? []) {
      if (opt.options && opt.options.length > 0) {
        walk(opt.options);
        continue;
      }
      if (!opt.name || opt.value === undefined || opt.value === null) continue;
      parts.push(`${opt.name}: ${String(opt.value)}`);
    }
  };
  walk(options);
  const joined = parts.join(' · ');
  return joined.length > MAX_INTERACTION_ARGS ? `${joined.slice(0, MAX_INTERACTION_ARGS - 1)}…` : joined;
}

/**
 * The slash command a bot message answers, for the "marc used /pf callouts"
 * line above it.
 *
 * The command name lives only on the deprecated `interaction` field;
 * `interaction_metadata`, which supersedes it, carries the invoking user but
 * never what they ran -- so the name comes from whichever field still has it
 * and the user from either. Without a name there is nothing worth showing (a
 * button press on a bot panel arrives that way), so the line is skipped.
 */
export function buildInteractionInfo(
  rawMsg: Partial<DiscordMessage>,
  cacheUserName?: (discordUserId: string, displayName: string) => void,
): MessageInteractionInfo | undefined {
  const interaction = rawMsg.interaction;
  const meta = rawMsg.interaction_metadata;

  // Discord's own client shows the arguments a command was invoked with, but
  // the documented payload carries only the name -- INTERACTION_DEBUG=1 dumps
  // what actually arrives, so a payload that does carry them can be wired up
  // instead of guessed at.
  if (process.env.INTERACTION_DEBUG === '1' && (interaction || meta)) {
    console.log('[interaction]', JSON.stringify({ interaction, interaction_metadata: meta }));
  }

  const name = (interaction?.name ?? meta?.name ?? '').trim();
  if (!name) return undefined;

  const user = interaction?.user ?? meta?.user;
  const displayName = user ? (user.global_name ?? user.username) : 'Someone';
  if (user) cacheUserName?.(user.id, displayName);

  const args = formatCommandOptions(interaction?.data?.options);
  const type = interaction?.type ?? meta?.type;

  return {
    name,
    ...(args ? { args } : {}),
    ...(type !== undefined ? { type } : {}),
    user: {
      id: user?.id ?? '',
      displayName,
      avatar: user?.avatar ?? null,
    },
  };
}

export function processDiscordMessage(
  gateway: GatewayManager,
  rawMsg: DiscordMessage,
  channelName?: string,
  guildName?: string | null,
  roomKeywordPatterns?: KeywordPattern[],
  ctx?: MessageProcessorContext,
): FrontendMessage {
  const config = ctx?.config ?? configStore.getConfig();
  const isHighlighted = ctx?.isHighlighted ?? configStore.isUserHighlighted(rawMsg.author.id);
  const cacheUserName = ctx?.cacheUserName ?? ((id: string, name: string) => configStore.cacheUserName(id, name));

  // Components v2 messages carry their text in the component tree instead of
  // `content`, and forwarded messages carry theirs in a snapshot -- detection
  // scans all of it.
  const componentText = extractComponentText(rawMsg.components);
  const snapshot = rawMsg.message_snapshots?.[0]?.message;
  const forwardText = snapshot
    ? [snapshot.content, extractComponentText(snapshot.components)].filter(Boolean).join('\n')
    : '';
  const pollText = rawMsg.poll
    ? [rawMsg.poll.question?.text, ...(rawMsg.poll.answers ?? []).map((a) => a.poll_media?.text)]
        .filter(Boolean).join('\n')
    : '';
  const scanText = [rawMsg.content, componentText, forwardText, pollText].filter(Boolean).join('\n');

  let contractResult = { hasContract: false, addresses: [] as string[] };
  if (config.contractDetection) {
    contractResult = detectContractAddresses(scanText);
  }

  let matchedKeywords: string[] = [];
  if (config.keywordAlertsEnabled) {
    const allPatterns = [...(config.globalKeywordPatterns ?? []), ...(roomKeywordPatterns ?? [])];
    matchedKeywords = matchKeywords(scanText, allPatterns);
  }

  const mentionsMap = resolveMentions(gateway, rawMsg, config.userNameCache ?? {}, cacheUserName);

  const resolvedChannelName = channelName ?? gateway.getChannelName(rawMsg.channel_id);
  const guildId = rawMsg.guild_id ?? null;
  const resolvedGuildName = guildName !== undefined ? guildName : (guildId ? gateway.getGuildName(guildId) : null);

  const displayName = rawMsg.author.global_name ?? rawMsg.author.username;
  cacheUserName(rawMsg.author.id, displayName);

  return {
    id: rawMsg.id,
    channelId: rawMsg.channel_id,
    guildId,
    channelName: resolvedChannelName,
    guildName: resolvedGuildName,
    author: {
      id: rawMsg.author.id,
      username: rawMsg.author.username,
      displayName: rawMsg.author.global_name ?? rawMsg.author.username,
      avatar: rawMsg.author.avatar,
      roleColor: gateway.getMemberRoleColor(rawMsg.member?.roles) ?? null,
      roles: gateway.getMemberRoles(rawMsg.member?.roles),
      isBot: rawMsg.author.bot,
    },
    content: rawMsg.content,
    timestamp: rawMsg.timestamp,
    attachments: rawMsg.attachments ?? [],
    embeds: rawMsg.embeds ?? [],
    components: rawMsg.components && rawMsg.components.length > 0 ? rawMsg.components : undefined,
    forwardedMessage: snapshot
      ? {
          content: snapshot.content ?? '',
          embeds: snapshot.embeds ?? [],
          attachments: snapshot.attachments ?? [],
          components: snapshot.components && snapshot.components.length > 0 ? snapshot.components : undefined,
          timestamp: snapshot.timestamp,
        }
      : undefined,
    // Native Discord polls reuse the shape (and UI) of Telegram polls.
    poll: rawMsg.poll
      ? {
          question: rawMsg.poll.question?.text ?? '',
          options: (rawMsg.poll.answers ?? []).map((a) => ({
            id: a.answer_id,
            text: a.poll_media?.text ?? '',
            voters: rawMsg.poll?.results?.answer_counts?.find((c) => c.id === a.answer_id)?.count ?? 0,
          })),
        }
      : undefined,
    // Discord stickers reuse the Telegram sticker slot. Lottie (format 3) has
    // no raster URL, so it falls back to the placeholder glyph.
    sticker: rawMsg.sticker_items?.[0]
      ? {
          url: rawMsg.sticker_items[0].format_type === 3
            ? ''
            : `https://media.discordapp.net/stickers/${rawMsg.sticker_items[0].id}.${rawMsg.sticker_items[0].format_type === 4 ? 'gif' : 'png'}`,
        }
      : undefined,
    isHighlighted,
    hasContractAddress: contractResult.hasContract,
    contractAddresses: contractResult.addresses,
    mentions: mentionsMap,
    referencedMessage: rawMsg.referenced_message
      ? (() => {
          const ref = rawMsg.referenced_message!;
          const refMentions: Record<string, string> = {};
          for (const user of ref.mentions ?? []) {
            refMentions[user.id] = user.global_name ?? user.username;
          }
          const preview = buildReplyPreview(ref);
          return {
            id: ref.id,
            author: ref.author.global_name ?? ref.author.username,
            authorId: ref.author.id,
            avatar: ref.author.avatar,
            roleColor: gateway.getMemberRoleColor(ref.member?.roles) ?? null,
            isBot: ref.author.bot,
            content: preview.content,
            hasAttachment: preview.hasAttachment || undefined,
            mentions: refMentions,
          };
        })()
      : null,
    reactions: (rawMsg.reactions ?? []).map((r) => ({
      emoji: r.emoji,
      count: r.count,
    })),
    matchedKeywords: matchedKeywords.length > 0 ? matchedKeywords : undefined,
    isEdited: !!rawMsg.edited_timestamp,
    editedTimestamp: rawMsg.edited_timestamp ?? null,
    isEphemeral: ((rawMsg.flags ?? 0) & 64) !== 0 ? true : undefined,
    interaction: buildInteractionInfo(rawMsg, cacheUserName),
  };
}
