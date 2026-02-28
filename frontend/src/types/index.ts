export interface ChannelRef {
  guildId: string | null;
  channelId: string;
  guildName?: string;
  channelName?: string;
  disableEmbeds?: boolean;
}

export type HighlightMode = 'background' | 'username';

export type KeywordMatchMode = 'includes' | 'exact' | 'regex';

export interface KeywordPattern {
  pattern: string;
  matchMode: KeywordMatchMode;
  isRegex?: boolean;
  label?: string;
}

export interface Room {
  id: string;
  name: string;
  channels: ChannelRef[];
  highlightedUsers: string[];
  filteredUsers: string[];
  filterEnabled: boolean;
  color?: string | null;
  keywordPatterns?: KeywordPattern[];
  highlightMode?: HighlightMode;
  highlightedUserColors?: Record<string, string>;
}

export interface PushoverConfig {
  enabled: boolean;
  appToken: string;
  userKey: string;
}

export type SolPlatform = 'axiom' | 'padre' | 'bloom' | 'gmgn' | 'custom';
export type EvmPlatform = 'gmgn' | 'bloom' | 'custom';
export type ContractClickAction = 'copy' | 'copy_open' | 'open';
export type BadgeClickAction = 'discord' | 'platform' | 'both';

export interface ContractLinkTemplates {
  evm: string;
  sol: string;
  solPlatform: SolPlatform;
  evmPlatform: EvmPlatform;
}

export type SoundType = 'highlight' | 'contractAlert' | 'keywordAlert';

export interface SoundConfig {
  enabled: boolean;
  volume: number;
  useCustom: boolean;
  customSoundUrl?: string;
}

export type SoundSettings = Record<SoundType, SoundConfig>;

export interface AppConfig {
  discordTokens: string[];
  rooms: Room[];
  globalHighlightedUsers: string[];
  contractDetection: boolean;
  guildColors: Record<string, string>;
  enabledGuilds: string[];
  evmAddressColor: string;
  solAddressColor: string;
  openInDiscordApp: boolean;
  hiddenUsers: Record<string, { userId: string; displayName: string }[]>;
  messageSounds: boolean;
  soundSettings: SoundSettings;
  pushover: PushoverConfig;
  contractLinkTemplates: ContractLinkTemplates;
  contractClickAction: ContractClickAction;
  autoOpenHighlightedContracts: boolean;
  globalKeywordPatterns: KeywordPattern[];
  keywordAlertsEnabled: boolean;
  desktopNotifications: boolean;
  badgeClickAction: BadgeClickAction;
  userNameCache: Record<string, string>;
}

export interface AuthStatus {
  configured: boolean;
  connected: boolean;
}

export interface MaskedToken {
  index: number;
  masked: string;
}

export interface MaskedTokensResponse {
  tokens: MaskedToken[];
  count: number;
}

export interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
  channels: { id: string; name: string; type: number }[];
}

export interface DMChannel {
  id: string;
  recipients: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar: string | null;
  }[];
}

export interface FrontendReaction {
  emoji: { id: string | null; name: string; animated?: boolean };
  count: number;
}

export interface FrontendMessage {
  id: string;
  channelId: string;
  guildId: string | null;
  channelName: string;
  guildName: string | null;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
  };
  content: string;
  timestamp: string;
  attachments: {
    id: string;
    filename: string;
    url: string;
    proxy_url: string;
    size: number;
    content_type?: string;
    width?: number;
    height?: number;
  }[];
  embeds: {
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    thumbnail?: { url: string };
    image?: { url: string };
    author?: { name?: string; url?: string; icon_url?: string };
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string; icon_url?: string };
  }[];
  isHighlighted: boolean;
  hasContractAddress: boolean;
  contractAddresses: string[];
  mentions: Record<string, string>;
  referencedMessage?: {
    id: string;
    author: string;
    content: string;
    mentions: Record<string, string>;
  } | null;
  reactions?: FrontendReaction[];
  matchedKeywords?: string[];
}

export interface ContractEntry {
  address: string;
  chain: 'evm' | 'sol';
  evmChain?: string;
  authorId: string;
  authorName: string;
  channelId: string;
  channelName: string;
  guildId: string | null;
  guildName: string | null;
  roomIds: string[];
  messageId: string;
  timestamp: string;
  firstSeen?: boolean;
}

export interface Alert {
  id: string;
  type: 'highlighted_user' | 'contract_address' | 'keyword_match';
  message: FrontendMessage;
  reason: string;
  timestamp: number;
}

export interface WsIncoming {
  type: 'message' | 'message_update' | 'alert' | 'reaction_update' | 'contract' | 'chain_update';
  data: any;
  roomIds?: string[];
}
