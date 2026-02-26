export interface ChannelRef {
  guildId: string | null;
  channelId: string;
  guildName?: string;
  channelName?: string;
  disableEmbeds?: boolean;
}

export interface KeywordPattern {
  pattern: string;
  isRegex: boolean;
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
}

export interface PushoverConfig {
  enabled: boolean;
  appToken: string;
  userKey: string;
}

export type SolPlatform = 'axiom' | 'padre' | 'bloom' | 'gmgn' | 'custom';
export type EvmPlatform = 'gmgn' | 'bloom' | 'custom';
export type ContractClickAction = 'copy' | 'copy_open' | 'open';

export interface ContractLinkTemplates {
  evm: string;
  sol: string;
  solPlatform: SolPlatform;
  evmPlatform: EvmPlatform;
}

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
  pushover: PushoverConfig;
  contractLinkTemplates: ContractLinkTemplates;
  contractClickAction: ContractClickAction;
  autoOpenHighlightedContracts: boolean;
  globalKeywordPatterns: KeywordPattern[];
  keywordAlertsEnabled: boolean;
  desktopNotifications: boolean;
}

export interface AuthStatus {
  configured: boolean;
  connected: boolean;
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
  authorId: string;
  authorName: string;
  channelId: string;
  channelName: string;
  guildName: string | null;
  roomIds: string[];
  messageId: string;
  timestamp: string;
}

export interface Alert {
  id: string;
  type: 'highlighted_user' | 'contract_address' | 'keyword_match';
  message: FrontendMessage;
  reason: string;
  timestamp: number;
}

export interface WsIncoming {
  type: 'message' | 'alert' | 'reaction_update' | 'contract';
  data: any;
  roomIds?: string[];
}
