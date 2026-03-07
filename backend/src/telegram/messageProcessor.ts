import { detectContractAddresses } from '../utils/contract.js';
import { matchKeywords } from '../utils/keywordMatcher.js';
import type { FrontendMessage, KeywordPattern, AppConfig } from '../discord/types.js';
import type { TelegramRawMessage } from './types.js';

export interface TelegramMessageProcessorContext {
  config: AppConfig;
  isHighlighted: boolean;
  cacheUserName: (telegramUserId: string, displayName: string) => void;
}

export function processTelegramMessage(
  raw: TelegramRawMessage,
  roomKeywordPatterns?: KeywordPattern[],
  ctx?: TelegramMessageProcessorContext,
): FrontendMessage {
  const config = ctx?.config;
  const isHighlighted = ctx?.isHighlighted ?? false;
  const cacheUserName = ctx?.cacheUserName;

  let contractResult = { hasContract: false, addresses: [] as string[] };
  if (config?.contractDetection) {
    contractResult = detectContractAddresses(raw.text);
  }

  let matchedKeywords: string[] = [];
  if (config?.keywordAlertsEnabled) {
    const allPatterns = [...(config.globalKeywordPatterns ?? []), ...(roomKeywordPatterns ?? [])];
    matchedKeywords = matchKeywords(raw.text, allPatterns);
  }

  const displayName = raw.sender.firstName +
    (raw.sender.lastName ? ` ${raw.sender.lastName}` : '');

  if (cacheUserName) {
    cacheUserName(raw.sender.id, displayName);
  }

  const attachments: FrontendMessage['attachments'] = [];
  if (raw.media) {
    attachments.push({
      id: `tg_media_${raw.id}`,
      filename: raw.media.filename,
      url: raw.media.url,
      proxy_url: raw.media.url,
      size: raw.media.size,
      content_type: raw.media.mimeType,
      width: raw.media.width,
      height: raw.media.height,
    });
  }

  const referencedMessage = raw.replyTo
    ? {
        id: raw.replyTo.id.toString(),
        author: raw.replyTo.senderName,
        content: raw.replyTo.text,
        mentions: {} as Record<string, string>,
      }
    : null;

  let platformUrl: string | undefined;
  if (raw.chatUsername) {
    platformUrl = `https://t.me/${raw.chatUsername}/${raw.id}`;
  } else if (raw.chatId.startsWith('-100')) {
    platformUrl = `https://t.me/c/${raw.chatId.slice(4)}/${raw.id}`;
  }

  return {
    id: `tg_${raw.chatId}_${raw.id}`,
    channelId: raw.chatId,
    guildId: null,
    channelName: raw.chatTitle,
    guildName: raw.chatType === 'user' ? null : raw.chatTitle,
    source: 'telegram',
    platformUrl,
    author: {
      id: raw.sender.id,
      username: raw.sender.username ?? raw.sender.firstName,
      displayName,
      avatar: raw.sender.photo,
      roleColor: null,
    },
    content: raw.text,
    timestamp: new Date(raw.date * 1000).toISOString(),
    attachments,
    embeds: [],
    isHighlighted,
    hasContractAddress: contractResult.hasContract,
    contractAddresses: contractResult.addresses,
    mentions: {},
    referencedMessage,
    matchedKeywords: matchedKeywords.length > 0 ? matchedKeywords : undefined,
    sticker: raw.sticker ?? undefined,
    poll: raw.poll ?? undefined,
    forwardFrom: raw.forward ? { name: raw.forward.senderName, chatTitle: raw.forward.chatTitle } : undefined,
  };
}
