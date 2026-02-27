import { configStore } from '../config/store.js';
import { detectContractAddresses } from './contract.js';
import { matchKeywords } from './keywordMatcher.js';
import type { GatewayManager } from '../discord/gatewayManager.js';
import type { FrontendMessage, DiscordMessage, KeywordPattern } from '../discord/types.js';

export function processDiscordMessage(
  gateway: GatewayManager,
  rawMsg: DiscordMessage,
  channelName?: string,
  guildName?: string | null,
  roomKeywordPatterns?: KeywordPattern[],
): FrontendMessage {
  const config = configStore.getConfig();
  const isHighlighted = configStore.isUserHighlighted(rawMsg.author.id);

  let contractResult = { hasContract: false, addresses: [] as string[] };
  if (config.contractDetection) {
    contractResult = detectContractAddresses(rawMsg.content);
  }

  let matchedKeywords: string[] = [];
  if (config.keywordAlertsEnabled) {
    const allPatterns = [...(config.globalKeywordPatterns ?? []), ...(roomKeywordPatterns ?? [])];
    matchedKeywords = matchKeywords(rawMsg.content, allPatterns);
  }

  const mentionsMap: Record<string, string> = {};
  for (const user of rawMsg.mentions ?? []) {
    mentionsMap[user.id] = user.global_name ?? user.username;
  }
  for (const ch of rawMsg.mention_channels ?? []) {
    mentionsMap[`ch:${ch.id}`] = ch.name;
  }
  const channelMentionRegex = /<#(\d+)>/g;
  let chMatch;
  while ((chMatch = channelMentionRegex.exec(rawMsg.content)) !== null) {
    if (!mentionsMap[`ch:${chMatch[1]}`]) {
      const chName = gateway.getChannelName(chMatch[1]);
      if (chName !== 'unknown') mentionsMap[`ch:${chMatch[1]}`] = chName;
    }
  }
  const roleMentionRegex = /<@&(\d+)>/g;
  let roleMatch;
  while ((roleMatch = roleMentionRegex.exec(rawMsg.content)) !== null) {
    const rName = gateway.getRoleName(roleMatch[1]);
    if (rName) mentionsMap[`role:${roleMatch[1]}`] = rName;
  }

  const resolvedChannelName = channelName ?? gateway.getChannelName(rawMsg.channel_id);
  const guildId = rawMsg.guild_id ?? null;
  const resolvedGuildName = guildName !== undefined ? guildName : (guildId ? gateway.getGuildName(guildId) : null);

  const displayName = rawMsg.author.global_name ?? rawMsg.author.username;
  configStore.cacheUserName(rawMsg.author.id, displayName);

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
    },
    content: rawMsg.content,
    timestamp: rawMsg.timestamp,
    attachments: rawMsg.attachments ?? [],
    embeds: rawMsg.embeds ?? [],
    isHighlighted,
    hasContractAddress: contractResult.hasContract,
    contractAddresses: contractResult.addresses,
    mentions: mentionsMap,
    referencedMessage: rawMsg.referenced_message
      ? (() => {
          const refMentions: Record<string, string> = {};
          for (const user of rawMsg.referenced_message!.mentions ?? []) {
            refMentions[user.id] = user.global_name ?? user.username;
          }
          return {
            id: rawMsg.referenced_message!.id,
            author: rawMsg.referenced_message!.author.global_name ?? rawMsg.referenced_message!.author.username,
            content: rawMsg.referenced_message!.content,
            mentions: refMentions,
          };
        })()
      : null,
    reactions: (rawMsg.reactions ?? []).map((r) => ({
      emoji: r.emoji,
      count: r.count,
    })),
    matchedKeywords: matchedKeywords.length > 0 ? matchedKeywords : undefined,
  };
}
