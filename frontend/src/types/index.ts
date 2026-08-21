export type MessageSource = 'discord' | 'telegram';

export interface ChannelRef {
  source?: MessageSource;
  guildId: string | null;
  channelId: string;
  guildName?: string;
  channelName?: string;
  disableEmbeds?: boolean;
  /** Present on channels the server folded in from one of the room's watched
   * categories. Derived refs are never sent back on save — the category is
   * what's stored, so the channel list follows Discord by itself. */
  categoryId?: string;
}

/**
 * A whole Discord category watched by a room: every text channel under it
 * belongs to the room, minus the ones switched off in `excludedChannelIds`.
 * Channels added to or removed from the category in Discord follow along.
 */
export interface CategoryRef {
  guildId: string;
  categoryId: string;
  guildName?: string;
  categoryName?: string;
  excludedChannelIds?: string[];
}

export type HighlightMode = 'background' | 'username';
export type MessageDisplay = 'default' | 'compact';
export type SplitLayout = 'row' | 'grid';

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
  /** Individually picked channels plus, as served by the API, the channels of
   * every category in `categories`. */
  channels: ChannelRef[];
  categories?: CategoryRef[];
  highlightedUsers: string[];
  filteredUsers: string[];
  filterEnabled: boolean;
  color?: string | null;
  keywordPatterns?: KeywordPattern[];
  highlightMode?: HighlightMode;
  highlightedUserColors?: Record<string, string>;
  /** Highlight every message whose author holds one of these roles — same
   * semantics as highlightedUsers (visuals + alerts). roleName/guildId are
   * kept for display; matching is by roleId. */
  highlightedRoles?: { roleId: string; roleName: string; guildId: string; color?: string }[];
  hotkey?: string | null;
}

/** One guild role as served by GET /guilds/:id/roles (highest first). */
export interface GuildRole {
  id: string;
  name: string;
  color: string | null;
}

export type PushoverPriority = -2 | -1 | 0 | 1 | 2;

export const PUSHOVER_SOUNDS = [
  'pushover', 'bike', 'bugle', 'cashregister', 'classical', 'cosmic',
  'falling', 'gamelan', 'incoming', 'intermission', 'magic', 'mechanical',
  'pianobar', 'siren', 'spacealarm', 'tugboat', 'alien', 'climb',
  'persistent', 'echo', 'updown', 'vibrate', 'none',
] as const;

export type PushoverSound = (typeof PUSHOVER_SOUNDS)[number];

export interface PushoverTriggers {
  highlightedUser: boolean;
  highlightedUserContract: boolean;
  contract: boolean;
  keyword: boolean;
}

export interface PushoverFilters {
  userIds: string[];
  channelIds: string[];
  guildIds: string[];
}

export interface PushoverConfig {
  enabled: boolean;
  appToken: string;
  userKey: string;
  priority: PushoverPriority;
  sound: PushoverSound;
  triggers: PushoverTriggers;
  filters: PushoverFilters;
}

export type SolPlatform = 'axiom' | 'padre' | 'bloom' | 'gmgn' | 'fomo' | 'custom';
export type EvmPlatform = 'gmgn' | 'bloom' | 'fomo' | 'custom';
export type ContractClickAction = 'copy' | 'copy_open' | 'open';
export type BadgeClickAction = 'discord' | 'platform' | 'both';
/** Clicking an alert toast opens the Trenchcord room or the source app (Discord/Telegram). */
export type NotificationClickAction = 'trenchcord' | 'discord';

export interface ContractLinkTemplates {
  evm: string;
  sol: string;
  solPlatform: SolPlatform;
  evmPlatform: EvmPlatform;
}

export type SoundType = 'highlight' | 'contractAlert' | 'keywordAlert' | 'premiumAlert';

export interface SoundConfig {
  enabled: boolean;
  volume: number;
  useCustom: boolean;
  customSoundUrl?: string;
  presetSound?: string;
}

export type SoundSettings = Record<SoundType, SoundConfig>;

export type SlotsharkRegion = 'us' | 'eu';

export type TradeButtonSize = 'sm' | 'md' | 'lg';

/** Which site a buy opens. 'default' follows the contract-link SOL platform. */
export type BuySitePlatform = 'default' | SolPlatform;

/**
 * How a clicked amount maps onto several enabled wallets.
 * - `per_wallet`: each wallet buys the full amount (5 SOL x 2 = 10 SOL spent)
 * - `split`: the amount is divided between them (5 SOL / 2 = 2.5 SOL each)
 */
export type WalletAmountMode = 'per_wallet' | 'split';

export interface TradingWallet {
  id: string;
  label: string;
  /** Slotshark wallet pubkey. Case-sensitive -- trim only, never lowercase. */
  address: string;
}

export interface TradingConfig {
  enabled: boolean;
  region: SlotsharkRegion;
  wallets: TradingWallet[];
  /** Wallets a buy fires from. Empty is legitimate: every wallet switched off. */
  activeWalletIds: string[];
  walletAmountMode: WalletAmountMode;
  /** Up to 5 buy buttons, in SOL. */
  presetAmounts: number[];
  slippage: number;
  /** null = auto (field omitted from the request; Slotshark picks p75/p99). */
  tip: number | null;
  priorityFee: number | null;
  antimev: boolean;
  requireDoubleClick: boolean;
  buttonSize: TradeButtonSize;
  buttonBgColor: string;
  buttonTextColor: string;
  /** Show the shortened contract pill at the start of the buy row. */
  showContractPill: boolean;
  /** Open the token on a chart/trading site when a buy fires (SOL only). */
  openSiteOnBuy: boolean;
  /** 'default' follows contractLinkTemplates.solPlatform; 'custom' uses buySiteUrl. */
  buySitePlatform: BuySitePlatform;
  /** Custom template, e.g. https://example.com/token/{address} */
  buySiteUrl: string;
}

export interface TradingStatus {
  configured: boolean;
  masked: string | null;
  walletCount: number;
}

export type LimitSellType = 'time' | 'pnl';

export interface LimitSell {
  type: LimitSellType;
  /**
   * time: seconds after the buy, fires once. pnl: profit/loss % threshold --
   * positive = take profit, negative = stop loss, monitored until triggered.
   */
  value: number;
  /** 1-100, portion of the position to sell when the order fires. */
  sellPercent: number;
  /** SOL. null/undefined = auto (tip p75, priorityFee p99). */
  tip?: number | null;
  priorityFee?: number | null;
}

/** room: any Solana CA in the room fires. users: only CAs from `users` fire. */
export type SnipeMode = 'room' | 'users';

export interface SnipeConfig {
  id: string;
  name: string;
  enabled: boolean;
  roomId: string;
  mode: SnipeMode;
  /** User ids or "@username" entries -- same semantics as highlightedUsers. */
  users: string[];
  solAmount: number;
  /** Refs into trading.wallets; amount mapping follows trading.walletAmountMode. */
  walletIds: string[];
  /** null = inherit the corresponding Trading setting. */
  slippage?: number | null;
  tip?: number | null;
  priorityFee?: number | null;
  /** USD bounds enforced by Slotshark at buy time. null = no bound. */
  minMarketCap?: number | null;
  maxMarketCap?: number | null;
  /** never = one snipe per token; cooldown = again after resnipeCooldownSec;
   * limit = up to resnipeMaxCount snipes per token. */
  resnipeMode?: ResnipeMode;
  resnipeCooldownSec?: number | null;
  resnipeMaxCount?: number | null;
  /** Legacy minutes cooldown (pre-seconds); migrated to cooldown mode on read. */
  resnipeCooldownMin?: number | null;
  /** contract (default) = buy CAs found in messages; keyword = buy mapped mints. */
  trigger?: SnipeTrigger;
  keywordMap?: SnipeKeywordMap[];
  limitSells: LimitSell[];
  /** Send a Pushover notification with the result of every snipe this config
   * fires. Uses the global Pushover credentials/sound; silent while Pushover
   * is disabled or unconfigured. */
  pushoverOnSnipe?: boolean;
  /** Slotshark skips the buy when the wallet already holds the token
   * (enforced server-side, per wallet). */
  skipIfBought?: boolean;
}

export type ResnipeMode = 'never' | 'cooldown' | 'limit';
export type SnipeTrigger = 'contract' | 'keyword';

export interface SnipeKeywordMap {
  keyword: string;
  /** Solana mint bought when the keyword is posted. */
  mint: string;
}

export interface SnipingConfig {
  enabled: boolean;
  configs: SnipeConfig[];
}

/**
 * Global hotkeys for the built-in feeds (Contract feed + the virtual
 * mentions/keywords/snipes rooms). Same single-key semantics as Room.hotkey.
 */
export interface FeedHotkeys {
  contracts?: string | null;
  mentions?: string | null;
  keywords?: string | null;
  snipes?: string | null;
  alerts?: string | null;
  dms?: string | null;
}

/** Snipe outcome pinned onto the triggering message in the Snipes feed. */
export interface SnipeInfo {
  status: 'bought' | 'failed' | 'skipped';
  mint: string;
  configName: string;
  solAmount: number;
  walletsOk: number;
  walletsTotal: number;
  reason?: string;
  timestamp: string;
}

/** Mirror of backend cloud/client.ts CloudStatus (GET /api/cloud/status). */
export interface CloudSubscriptionStatus {
  enforced: boolean;
  linked: boolean;
  active: boolean;
  inGrace: boolean;
  entitledUntil: string | null;
  /** Blank on iOS, where no link to billing may be shown. */
  dashboardUrl: string;
  platform?: 'ios' | 'desktop';
}

/** GET /api/cloud/link/status — pairing state merged with the status above. */
export interface CloudLinkState extends CloudSubscriptionStatus {
  state: 'linked' | 'pending' | 'idle';
  code?: string;
  approveUrl?: string;
  error?: string;
}

export interface AppConfig {
  discordTokens: string[];
  rooms: Room[];
  globalHighlightedUsers: string[];
  contractDetection: boolean;
  guildColors: Record<string, string>;
  /** Per-channel overrides; a channel entry wins over its guild's color. */
  channelColors: Record<string, string>;
  dmColors: Record<string, string>;
  telegramColors: Record<string, string>;
  enabledGuilds: string[];
  evmAddressColor: string;
  solAddressColor: string;
  openInDiscordApp: boolean;
  openInTelegramApp: boolean;
  /** Phone-only: quick room-switcher bar at the bottom of the chat. */
  mobileRoomBar?: boolean;
  /** Message source badge shows the server icon + #channel instead of
   * "Server / #channel". Separate desktop/phone keys so each platform keeps
   * its own default (desktop: off, phone: on) even on a shared config. */
  serverIconBadge?: boolean;
  serverIconBadgeMobile?: boolean;
  /** Discord ephemeral messages (bot replies only the logged-in account was
   * shown, e.g. "This message is too old to delete."). On by default; when
   * shown they carry an "Only you can see this" note in chat. */
  showEphemeralMessages?: boolean;
  /** Custom display names (author id → name), shown instead of the platform
   * name everywhere in chat. Applies to Discord and Telegram authors alike. */
  customUserNames?: Record<string, string>;
  hiddenUsers: Record<string, { userId: string; displayName: string }[]>;
  /** Muted roles keyed by guild id — hides messages from any member holding
   * the role, server-wide. */
  hiddenRoles?: Record<string, { roleId: string; roleName: string }[]>;
  /** Users whose DMs stay out of the aggregate All DMs feed. Entries are
   * Discord user IDs or usernames (case-insensitive, leading @ allowed).
   * Their individual DM conversations are unaffected. */
  dmExcludedUsers?: string[];
  /** Telegram DMs collect into the aggregate All DMs feed alongside Discord
   * DMs. On by default; off keeps every Telegram DM out of the feed. The
   * individual tg-dm conversations are unaffected either way. */
  telegramDmsInAllDms?: boolean;
  /** Telegram users whose DMs stay out of the aggregate All DMs feed (spammy
   * bots, mostly). Entries are Telegram user IDs or @usernames
   * (case-insensitive, leading @ allowed). Their individual DM conversations
   * are unaffected. */
  tgDmExcludedUsers?: string[];
  /** Accounts whose Discord DM conversations are hidden entirely — from the
   * sidebar's Direct Messages list and from All DMs. Same entry format as
   * dmExcludedUsers; a group DM is hidden when any participant matches. */
  dmHiddenConversations?: string[];
  /** Accounts whose Telegram DM conversations are hidden entirely — from the
   * sidebar's Telegram DMs list and from All DMs. Same entry format as
   * tgDmExcludedUsers. */
  tgDmHiddenConversations?: string[];
  messageSounds: boolean;
  soundSettings: SoundSettings;
  channelSounds: Record<string, SoundConfig>;
  pushover: PushoverConfig;
  contractLinkTemplates: ContractLinkTemplates;
  contractClickAction: ContractClickAction;
  showFullContractAddress: boolean;
  autoOpenHighlightedContracts: boolean;
  globalKeywordPatterns: KeywordPattern[];
  keywordAlertsEnabled: boolean;
  desktopNotifications: boolean;
  mentionsUserEnabled: boolean;
  mentionsRoleEnabled: boolean;
  mentionsHereEnabled: boolean;
  mentionsEveryoneEnabled: boolean;
  /** When false, messages authored by bots (Rick etc.) never enter the Mentions room. */
  mentionsBotsEnabled: boolean;
  badgeClickAction: BadgeClickAction;
  notificationClickAction?: NotificationClickAction;
  userNameCache: Record<string, string>;
  chattingEnabled: boolean;
  /** When true, viewing a DM marks it read on the Discord account itself. */
  dmReadSyncEnabled: boolean;
  messageDisplay: MessageDisplay;
  compactModeAvatars: boolean;
  /** Compact mode: show the author name only on the first message of a consecutive group. */
  compactModeNameOnce: boolean;
  roleColors: boolean;
  mobileZoomScale: number;
  splitLayout: SplitLayout;
  paneRoomIds: string[];
  paneLocks: boolean[];
  gridMirror: boolean;
  seenAnnouncements: string[];
  /** First-run wizard finished. Kept in the server config because iOS evicts
   * WKWebView localStorage under disk pressure; this flag must survive. */
  onboardingComplete?: boolean;
  telegramApiId?: string;
  telegramApiHash?: string;
  telegramSessions?: string[];
  discordProxyUrl?: string;
  trading: TradingConfig;
  sniping: SnipingConfig;
  feedHotkeys?: FeedHotkeys;
  /** Electron accelerator for the OS-wide "bring Trenchcord to front" shortcut. */
  focusHotkey?: string | null;
  // NOTE: slotsharkApiToken is deliberately absent. GET /api/config strips it,
  // so the frontend never holds the token -- read its presence via
  // GET /api/trading/status instead.
}

export interface AuthStatus {
  configured: boolean;
  connected: boolean;
  telegramConfigured?: boolean;
  telegramConnected?: boolean;
  telegramAccountCount?: number;
  telegramHasApiCredentials?: boolean;
}

export interface MaskedToken {
  index: number;
  masked: string;
  invalid?: boolean;
}

export interface TelegramAccount {
  index: number;
  accountId: string | null;
  username: string | null;
  firstName: string | null;
  connected: boolean;
  invalid: boolean;
}

export interface MaskedTokensResponse {
  tokens: MaskedToken[];
  count: number;
}

export interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
  /** `parentId` is the category the channel sits under, absent when it has
   * none (or when Discord's payload carried no parent for this guild). */
  channels: { id: string; name: string; type: number; parentId?: string | null }[];
  categories?: { id: string; name: string; position?: number }[];
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

export interface ReactionUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  discriminator: string;
}

export interface TelegramSticker {
  url: string;
  emoji?: string;
  isAnimated?: boolean;
}

export interface TelegramPoll {
  question: string;
  /** `id` is the Discord poll answer_id (absent on Telegram polls); live
   * vote updates are matched against it. */
  options: { text: string; voters: number; id?: number }[];
}

export interface TelegramForward {
  name: string;
  chatTitle?: string;
}

export interface TelegramButton {
  text: string;
  url: string;
}

/**
 * One node of a Discord message's component tree, covering classic action
 * rows and Components v2 (flag 1<<15), where the entire message body lives
 * here instead of content/embeds. Unknown types are skipped by the renderer.
 *
 * Known types: 1 action row, 2 button, 3/5/6/7/8 select menus, 9 section,
 * 10 text display, 11 thumbnail, 12 media gallery, 13 file, 14 separator,
 * 17 container.
 */
export interface MessageComponent {
  type: number;
  content?: string;
  components?: MessageComponent[];
  accessory?: MessageComponent;
  media?: { url: string; proxy_url?: string; width?: number; height?: number; content_type?: string };
  description?: string | null;
  spoiler?: boolean;
  items?: {
    media: { url: string; proxy_url?: string; width?: number; height?: number; content_type?: string };
    description?: string | null;
    spoiler?: boolean;
  }[];
  file?: { url: string; proxy_url?: string };
  name?: string;
  size?: number;
  divider?: boolean;
  spacing?: number;
  accent_color?: number | null;
  style?: number;
  label?: string;
  emoji?: { id?: string | null; name?: string; animated?: boolean };
  url?: string;
  disabled?: boolean;
  placeholder?: string;
}

export interface FrontendMessage {
  id: string;
  channelId: string;
  guildId: string | null;
  channelName: string;
  guildName: string | null;
  source?: MessageSource;
  /** Telegram only: the chat's public @username, when it has one. Lets DM
   * exclusion entries written as @username match the conversation whichever
   * side authored the message. */
  chatUsername?: string | null;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
    roleColor?: string | null;
    /** The author's guild roles ({id, name}, highest first). Only present on
     * live gateway messages — REST-fetched history carries no member data. */
    roles?: { id: string; name: string }[];
    isBot?: boolean;
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
    /** Voice notes only: recorded length, and a base64 waveform of one
     * 0-255 amplitude sample per byte. Discord sends both; the Telegram
     * client rescales its own samples into the same shape. */
    duration_secs?: number;
    waveform?: string;
  }[];
  embeds: {
    /** 'rich' | 'image' | 'video' | 'gifv' | 'link' | ... (gifv = Tenor/Giphy). */
    type?: string;
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    thumbnail?: { url: string; proxy_url?: string; width?: number; height?: number };
    image?: { url: string; proxy_url?: string; width?: number; height?: number };
    video?: { url?: string; proxy_url?: string; width?: number; height?: number };
    provider?: { name?: string; url?: string };
    author?: { name?: string; url?: string; icon_url?: string };
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string; icon_url?: string };
    /** ISO timestamp shown after the footer text ("footer • 0:44", dated for older messages). */
    timestamp?: string;
  }[];
  components?: MessageComponent[];
  /** Discord-forwarded message body (from message_snapshots). Discord does
   * not expose the original author, only the content. */
  forwardedMessage?: {
    content: string;
    embeds: FrontendMessage['embeds'];
    attachments: FrontendMessage['attachments'];
    components?: MessageComponent[];
    timestamp?: string;
  } | null;
  isHighlighted: boolean;
  hasContractAddress: boolean;
  contractAddresses: string[];
  mentions: Record<string, string>;
  mentionTypes?: ('user' | 'role' | 'here' | 'everyone')[];
  /** For DMs when several Discord accounts are configured: display name of the
   * logged-in account the DM arrived on. Absent with a single token. */
  receiverName?: string | null;
  referencedMessage?: {
    id: string;
    author: string;
    /** Platform user id of the replied-to author, for custom-name lookups. */
    authorId?: string;
    /** Avatar hash (Discord) or proxied avatar path (Telegram) of the
     * replied-to author, for the thumbnail on the reply spine. */
    avatar?: string | null;
    roleColor?: string | null;
    /** The replied-to author is an app, so the reply line carries the APP tag. */
    isBot?: boolean;
    content: string;
    /** The replied-to message is media only, so there is no text to preview:
     * the reply line reads "Click to see attachment" instead. */
    hasAttachment?: boolean;
    mentions: Record<string, string>;
  } | null;
  reactions?: FrontendReaction[];
  matchedKeywords?: string[];
  platformUrl?: string;
  sticker?: TelegramSticker;
  poll?: TelegramPoll;
  forwardFrom?: TelegramForward;
  buttons?: TelegramButton[];
  isEdited?: boolean;
  originalContent?: string;
  editedTimestamp?: string | null;
  isDeleted?: boolean;
  /** Discord ephemeral message (flag 1<<6): only the logged-in account was
   * ever shown it. Set only when true to keep payloads lean. */
  isEphemeral?: boolean;
  /** Present only on copies shown in the virtual "snipes" feed. */
  snipeInfo?: SnipeInfo;
  /** The slash command this bot message answers (Discord's message
   * interaction), shown above it as "<user> used /<command>". */
  interaction?: MessageInteractionInfo;
}

export interface MessageInteractionInfo {
  /** Command name without the leading slash, including subcommands
   * ("pf callouts"). */
  name: string;
  /** The arguments it was invoked with ("ca: 488Sa...pump"). Discord usually
   * leaves these out of the message payload, so most messages arrive with only
   * a name; hovering the command line resolves them via /interaction-data.
   * An empty string means resolved-and-none, undefined means not resolved. */
  args?: string;
  /** 2 application command, 3 message component, 5 modal submit. */
  type?: number;
  user: {
    id: string;
    displayName: string;
    avatar: string | null;
  };
}

export interface TelegramChatInfo {
  id: string;
  title: string;
  type: 'user' | 'group' | 'supergroup' | 'channel';
  photo?: string | null;
  isBot?: boolean;
}

/**
 * Token metadata for a contract entry. Populated by the Trenchcord Cloud
 * token-info service (premium feature, not yet live); absent locally.
 */
export interface ContractTokenInfo {
  name?: string;
  symbol?: string;
  imageUrl?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  updatedAt?: string;
}

export interface ContractEntry {
  address: string;
  chain: 'evm' | 'sol';
  evmChain?: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  /** The poster is an app (scanner bot, webhook), shown with the APP tag. */
  authorIsBot?: boolean;
  channelId: string;
  channelName: string;
  guildId: string | null;
  guildName: string | null;
  roomIds: string[];
  messageId: string;
  timestamp: string;
  firstSeen?: boolean;
  source?: 'discord' | 'telegram';
  /** Snapshot of the message text the CA appeared in (truncated). */
  content?: string;
  tokenInfo?: ContractTokenInfo;
}

// ── Premium alerts (cloud-evaluated; definitions live on Trenchcord Cloud) ──

export type PriceAlertKind = 'cex' | 'dex' | 'stock' | 'metal';
export type PriceAlertCondition = 'goes_over' | 'goes_under' | 'percent_up' | 'percent_down';
export type PriceAlertTarget = 'price' | 'mcap'; // dex alerts are always mcap; everything else is price
export type PremiumUrgency = 'normal' | 'critical';

export interface PriceAlert {
  id: string;
  kind: PriceAlertKind;
  symbol?: string | null;
  chain?: string | null;
  contractAddress?: string | null;
  tokenSymbol?: string | null;
  tokenName?: string | null;
  condition: PriceAlertCondition;
  target: PriceAlertTarget;
  value: number;
  basePrice?: number | null;
  baseMcap?: number | null;
  note?: string | null;
  urgency: PremiumUrgency;
  /** Per-alert Pushover tuning; null = the urgency's sound profile applies. */
  pushoverOverride?: PushoverProfile | null;
  triggered: boolean;
  enabled: boolean;
  lastNotified?: string | null;
  createdAt: string;
}

/** How a Pushover push should sound. Emergency (priority 2) adds retry/expire. */
export interface PushoverProfile {
  priority: number; // -2..2 per the Pushover API
  sound: string;
  retry?: number; // emergency re-alert cadence, seconds
  expire?: number; // emergency re-alert window, seconds
}

export type TweetAlertKind = 'tweet' | 'keyword' | 'reply' | 'interact' | 'follow';
export type TweetAlertSubType = 'any' | 'tweet' | 'reply' | 'quote' | 'retweet';

export interface TweetAlert {
  id: string;
  kind: TweetAlertKind;
  author: string;
  subType?: TweetAlertSubType | null;
  target?: string | null;
  keywords: string[];
  note?: string | null;
  urgency: PremiumUrgency;
  /** Per-alert Pushover tuning; null = the urgency's sound profile applies. */
  pushoverOverride?: PushoverProfile | null;
  enabled: boolean;
  createdAt: string;
}

export interface TelegramTrack {
  id: string;
  channelUsername: string;
  keywords: string[];
  enabled: boolean;
  createdAt: string;
  channelStatus?: 'pending' | 'joining' | 'joined' | 'leaving' | 'failed';
  channelTitle?: string | null;
  channelError?: string | null;
}

export interface PremiumEvent {
  id: string;
  kind: 'price' | 'tweet' | 'telegram';
  source_id: string | null;
  title: string;
  body: string;
  url: string | null;
  payload: Record<string, unknown> | null;
  urgency: PremiumUrgency;
  created_at: string;
}

export interface PremiumNotifyPrefs {
  pushoverUserKey: string | null;
  /** Channel on/off, independent of the stored key (like telegramDm/discordDm). */
  pushoverEnabled: boolean;
  telegramDm: boolean;
  discordDm: boolean;
  /** Whether a chat is bound via the bot's /start link code. */
  telegramLinked: boolean;
  discordLinked: boolean;
  /** Per-urgency Pushover tuning; null/absent = built-in defaults. */
  pushoverProfiles?: { normal?: PushoverProfile; critical?: PushoverProfile } | null;
}

export interface PremiumBots {
  telegram: string | null;
  discord: string | null;
}

export interface PremiumOverview {
  subscription: { current_period_end: string | null };
  counts: { price: number; tweets: number; telegram: number };
  prefs: PremiumNotifyPrefs;
  bots: PremiumBots;
}

export interface MessageAlert {
  id: string;
  type: 'highlighted_user' | 'contract_address' | 'keyword_match';
  message: FrontendMessage;
  reason: string;
  timestamp: number;
}

/** A cloud-fired premium alert (price/tweet/telegram) — no source message. */
export interface PremiumAlertEntry {
  id: string;
  type: 'premium';
  event: PremiumEvent;
  reason: string;
  timestamp: number;
}

export type Alert = MessageAlert | PremiumAlertEntry;

export interface WsIncoming {
  type: 'message' | 'message_update' | 'message_delete' | 'message_ack' | 'alert' | 'reaction_update' | 'poll_vote_update' | 'contract' | 'chain_update' | 'gateway_ready' | 'guild_channels_updated' | 'telegram_ready' | 'telegram_status' | 'gateway_auth_failed' | 'snipe_result' | 'premium_alert' | 'subscription_status';
  data: any;
  error?: string;
  tokenIndex?: number;
  tokenInvalid?: boolean;
  tokenBlocked?: boolean;
  roomIds?: string[];
}
