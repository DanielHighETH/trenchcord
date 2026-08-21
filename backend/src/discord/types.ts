export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name?: string | null;
  bot?: boolean;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
  recipients?: DiscordUser[];
}

export interface DiscordReaction {
  emoji: { id: string | null; name: string; animated?: boolean };
  count: number;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: DiscordUser;
  member?: { roles: string[] };
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  components?: MessageComponent[];
  flags?: number;
  /** Present on forwarded messages (message_reference.type === 1): the
   * forwarded body lives here, while the message's own content is empty.
   * Discord deliberately omits the original author from snapshots. */
  message_snapshots?: MessageSnapshot[];
  /** Native Discord poll. Counts reflect the state at fetch/create time. */
  poll?: {
    question?: { text?: string };
    answers?: { answer_id: number; poll_media?: { text?: string; emoji?: { id?: string | null; name?: string } } }[];
    results?: { answer_counts?: { id: number; count: number; me_voted?: boolean }[]; is_finalized?: boolean };
    expiry?: string | null;
    allow_multiselect?: boolean;
  };
  /** format_type: 1 PNG, 2 APNG, 3 Lottie (no raster URL), 4 GIF. */
  sticker_items?: { id: string; name?: string; format_type?: number }[];
  mentions?: DiscordUser[];
  mention_roles?: string[];
  mention_everyone?: boolean;
  mention_channels?: { id: string; guild_id: string; name: string; type: number }[];
  referenced_message?: DiscordMessage | null;
  /** Set on bot messages that answer a slash command or a bot-panel button.
   * Discord sends two overlapping shapes: the deprecated `interaction`, which
   * is the only one carrying the command name, and `interaction_metadata`,
   * which replaces it but names only the ids and the invoking user. Both are
   * read so the "used /command" line survives either payload. */
  interaction?: DiscordMessageInteraction;
  interaction_metadata?: {
    id?: string;
    type?: number;
    user?: DiscordUser;
    name?: string;
  };
  reactions?: DiscordReaction[];
}

/** One argument of an invoked command; subcommands (types 1 and 2) carry
 * nested `options` instead of a value of their own. */
export interface DiscordCommandOption {
  name?: string;
  type?: number;
  value?: string | number | boolean;
  options?: DiscordCommandOption[];
}

export interface DiscordMessageInteraction {
  id?: string;
  /** 2 application command, 3 message component, 5 modal submit. */
  type?: number;
  /** Command name including subcommand groups, e.g. "pf callouts". */
  name?: string;
  user?: DiscordUser;
  /** Discord normally leaves the invoked arguments out of the message payload;
   * when a payload does carry them they are shown after the command name,
   * otherwise the bare name is all there is. */
  data?: { options?: DiscordCommandOption[] };
}

export interface MessageSnapshot {
  message: {
    content?: string;
    timestamp?: string;
    edited_timestamp?: string | null;
    embeds?: DiscordEmbed[];
    attachments?: DiscordAttachment[];
    components?: MessageComponent[];
    flags?: number;
  };
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  url: string;
  proxy_url: string;
  size: number;
  content_type?: string;
  width?: number;
  height?: number;
  /** Voice messages (flag 1<<13) only: recorded length, and a base64
   * waveform of one 0-255 amplitude sample per byte. */
  duration_secs?: number;
  waveform?: string;
}

/**
 * One node of a message's component tree. Covers both classic action-row
 * components and Discord's "Components v2" (messages with flag 1<<15, whose
 * entire body -- text, images, buttons -- lives here instead of
 * content/embeds). Kept as a single loose recursive shape: unknown types are
 * simply skipped by the renderer, so new Discord component types can't break
 * message display.
 *
 * Known types: 1 action row, 2 button, 3/5/6/7/8 select menus, 9 section,
 * 10 text display, 11 thumbnail, 12 media gallery, 13 file, 14 separator,
 * 17 container.
 */
export interface MessageComponent {
  type: number;
  // Text Display (10)
  content?: string;
  // Action Row (1) / Section (9) / Container (17) children
  components?: MessageComponent[];
  // Section (9) accessory: a Thumbnail or Button on the right
  accessory?: MessageComponent;
  // Thumbnail (11) media + shared spoiler/description fields
  media?: { url: string; proxy_url?: string; width?: number; height?: number; content_type?: string };
  description?: string | null;
  spoiler?: boolean;
  // Media Gallery (12)
  items?: {
    media: { url: string; proxy_url?: string; width?: number; height?: number; content_type?: string };
    description?: string | null;
    spoiler?: boolean;
  }[];
  // File (13)
  file?: { url: string; proxy_url?: string };
  name?: string;
  size?: number;
  // Separator (14)
  divider?: boolean;
  spacing?: number;
  // Container (17)
  accent_color?: number | null;
  // Button (2)
  style?: number;
  label?: string;
  emoji?: { id?: string | null; name?: string; animated?: boolean };
  url?: string;
  disabled?: boolean;
  // Select menus (3, 5-8)
  placeholder?: string;
}

export interface DiscordEmbed {
  /** 'rich' | 'image' | 'video' | 'gifv' | 'link' | ... (gifv = Tenor/Giphy). */
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  thumbnail?: { url: string };
  image?: { url: string };
  video?: { url?: string; proxy_url?: string; width?: number; height?: number };
  provider?: { name?: string; url?: string };
  author?: { name?: string; url?: string; icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string; icon_url?: string };
  /** ISO timestamp shown after the footer text ("footer • 0:44", dated for older messages). */
  timestamp?: string;
}

export interface GatewayPayload {
  op: number;
  d: any;
  s: number | null;
  t: string | null;
}

export const GatewayOpcodes = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

export type MessageSource = 'discord' | 'telegram';

export interface ChannelRef {
  source?: MessageSource;
  guildId: string | null;
  channelId: string;
  guildName?: string;
  channelName?: string;
  disableEmbeds?: boolean;
  /** Set on refs derived from one of the room's CategoryRefs. Derived refs are
   * recomputed from the live channel list on every read and are never stored,
   * so a channel added to or removed from the category follows automatically. */
  categoryId?: string;
}

/**
 * A whole Discord category watched by a room: every text channel currently
 * under it counts as part of the room, minus the ones switched off. The
 * channel list is never materialised -- it is resolved from the gateway's live
 * guild data, so channels created or deleted in Discord track by themselves.
 */
export interface CategoryRef {
  guildId: string;
  categoryId: string;
  guildName?: string;
  categoryName?: string;
  /** Channels of the category the user switched off by hand. They stay off
   * however the category changes, and are remembered even while the channel
   * itself is gone so a re-created channel doesn't come back on. */
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
  channels: ChannelRef[];
  /** Whole categories the room watches, on top of `channels`. */
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

export type BuySitePlatform = 'default' | SolPlatform;

// How a clicked amount maps onto several enabled wallets.
//   per_wallet: each wallet buys the full amount (5 SOL x 2 = 10 SOL spent)
//   split:      the amount is divided between them (5 SOL / 2 = 2.5 SOL each)
export type WalletAmountMode = 'per_wallet' | 'split';

export interface TradingWallet {
  id: string;
  label: string;
  // Slotshark wallet pubkey. CASE SENSITIVE -- trim only, never lowercase.
  address: string;
}

export interface TradingConfig {
  enabled: boolean;
  region: SlotsharkRegion;
  wallets: TradingWallet[];
  // Wallets a buy fires from. Empty means no buy can be placed at all, which is
  // a legitimate state (every wallet switched off) rather than a broken one.
  activeWalletIds: string[];
  walletAmountMode: WalletAmountMode;
  // Up to 5 buy buttons, in SOL. Entries <= 0 render no button.
  presetAmounts: number[];
  slippage: number;
  // null = auto: the field is omitted from the request and Slotshark picks
  // (tip = p75, priorityFee = p99 of recent blocks).
  tip: number | null;
  priorityFee: number | null;
  antimev: boolean;
  requireDoubleClick: boolean;
  buttonSize: TradeButtonSize;
  buttonBgColor: string;
  buttonTextColor: string;
  // Show the shortened contract pill at the start of the buy row. Off leaves
  // just the amounts, since the address is already in the message above.
  showContractPill: boolean;
  // Open a chart/trading site for the token when a buy fires, so you land on
  // the chart without pasting the address. SOL only -- buys are SOL-only.
  openSiteOnBuy: boolean;
  // 'default' follows contractLinkTemplates.solPlatform; 'custom' uses buySiteUrl.
  buySitePlatform: BuySitePlatform;
  // Custom template, e.g. https://example.com/token/{address}
  buySiteUrl: string;
}

export type LimitSellType = 'time' | 'pnl';

export interface LimitSell {
  type: LimitSellType;
  // time: seconds after the buy, fires once. pnl: profit/loss % threshold --
  // positive = take profit, negative = stop loss, monitored until triggered.
  value: number;
  // 1-100, portion of the position to sell when the order fires.
  sellPercent: number;
  // SOL. null/undefined = auto (tip p75, priorityFee p99), same convention as
  // TradingConfig. Tip is only paid on a successful swap; priority fee is paid
  // whenever the TX lands.
  tip?: number | null;
  priorityFee?: number | null;
}

// room: any Solana CA posted in the room fires a buy.
// users: only CAs posted by one of `users` fire.
export type SnipeMode = 'room' | 'users';

// Per-token re-snipe policy:
// never    -- one snipe per token, ever (default).
// cooldown -- the token is eligible again resnipeCooldownSec after the last
//             attempt.
// limit    -- each new post of the token snipes again, up to resnipeMaxCount
//             total attempts for that token, then it's done.
export type ResnipeMode = 'never' | 'cooldown' | 'limit';

// contract -- Solana CAs found in matched messages are bought (default).
// keyword  -- matched messages are scanned for the keywords below and the
//             mapped contract is bought instead; the message itself carries
//             no CA.
export type SnipeTrigger = 'contract' | 'keyword';

export interface SnipeKeywordMap {
  keyword: string;
  /** Solana mint bought when the keyword is posted. */
  mint: string;
}

export interface SnipeConfig {
  id: string;
  name: string;
  enabled: boolean;
  roomId: string;
  mode: SnipeMode;
  // User ids or "@username" entries -- same matching semantics as
  // Room.highlightedUsers (see configStore.isUserHighlighted).
  users: string[];
  solAmount: number;
  // Refs into trading.wallets. How the amount maps onto several wallets
  // follows trading.walletAmountMode, same as manual buys.
  walletIds: string[];
  // null = inherit the corresponding Trading setting.
  slippage?: number | null;
  tip?: number | null;
  priorityFee?: number | null;
  // USD bounds passed straight through to Slotshark's /buy body, which
  // enforces them server-side. null = no bound (field omitted).
  minMarketCap?: number | null;
  maxMarketCap?: number | null;
  resnipeMode?: ResnipeMode;
  // cooldown mode only. Seconds since the last attempt for the token to be
  // eligible again.
  resnipeCooldownSec?: number | null;
  // limit mode only. Total snipe attempts allowed per token.
  resnipeMaxCount?: number | null;
  // Legacy (pre-seconds re-snipe): minutes cooldown, null = never. Old stored
  // configs may still carry it; the engine and sanitizer migrate it to
  // resnipeMode/resnipeCooldownSec on read.
  resnipeCooldownMin?: number | null;
  trigger?: SnipeTrigger;
  // trigger 'keyword' only.
  keywordMap?: SnipeKeywordMap[];
  limitSells: LimitSell[];
  // Send a Pushover notification with the result of every snipe this config
  // fires. Rides on the global Pushover settings -- sendPushover stays silent
  // while Pushover is disabled or the credentials are missing.
  pushoverOnSnipe?: boolean;
  // Passed through to Slotshark's /buy body: skip the buy if the wallet
  // already holds the token (enforced server-side, per wallet).
  skipIfBought?: boolean;
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
   * the role, server-wide. Optional so configs saved before the feature
   * existed load unchanged. */
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
  notificationClickAction: NotificationClickAction;
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
  // Written once when the first-run wizard finishes. Lives here rather than in
  // localStorage because iOS evicts WKWebView storage under disk pressure —
  // the config file is the only store that reliably survives a long idle.
  onboardingComplete?: boolean;
  telegramApiId?: string;
  telegramApiHash?: string;
  telegramSessions?: string[];
  // Optional HTTP/HTTPS proxy for the Discord gateway + REST connection. Local
  // mode only — lets VPN-blocked users route Discord traffic through a proxy.
  discordProxyUrl?: string;
  trading: TradingConfig;
  sniping: SnipingConfig;
  feedHotkeys?: FeedHotkeys;
  // Electron accelerator (e.g. "CommandOrControl+Shift+T") for the OS-wide
  // "bring Trenchcord to front" shortcut. Desktop app only; null = disabled.
  focusHotkey?: string | null;
  // Slotshark REST token. Deliberately a top-level sibling rather than a field
  // on `trading`: it is stripped from GET /config, so if it lived inside the
  // object the settings form would hydrate from the blank and the next Save
  // would silently wipe it. Written only via POST/DELETE /api/trading/token.
  slotsharkApiToken?: string;
  // Trenchcord Cloud device token from account pairing. Stripped from
  // GET /config and from settings exports (SECRET_CONFIG_KEYS); written only
  // by the pairing flow in cloud/client.ts.
  cloudDeviceToken?: string;
}

export interface TelegramChatInfo {
  id: string;
  title: string;
  type: 'user' | 'group' | 'supergroup' | 'channel';
  photo?: string | null;
  isBot?: boolean;
}

export interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
  /** `parentId` is the id of the category the channel sits under, absent for
   * channels outside every category (and for guilds whose READY payload used
   * the compact array form, which carries no parent). */
  channels: { id: string; name: string; type: number; parentId?: string | null }[];
  categories?: { id: string; name: string; position?: number }[];
}

export interface DMChannel {
  id: string;
  recipients: { id: string; username: string; global_name?: string | null; avatar: string | null }[];
}

export interface FrontendReaction {
  emoji: { id: string | null; name: string; animated?: boolean };
  count: number;
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

export interface FrontendMessage {
  id: string;
  channelId: string;
  guildId: string | null;
  channelName: string;
  guildName: string | null;
  source?: MessageSource;
  /** Telegram only: the chat's public @username, when it has one. Lets DM
   * exclusion entries written as @username match the conversation on the
   * client whichever side authored the message. */
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
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  components?: MessageComponent[];
  /** Discord-forwarded message body (from message_snapshots). Discord does
   * not expose the original author, only the content. */
  forwardedMessage?: {
    content: string;
    embeds: DiscordEmbed[];
    attachments: DiscordAttachment[];
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
  /** The slash command this bot message answers, rendered above it as
   * "<user> used /<command>". Absent on ordinary messages. */
  interaction?: MessageInteractionInfo;
}

export interface MessageInteractionInfo {
  /** Command name without the leading slash, e.g. "pf callouts". */
  name: string;
  /** The arguments it was invoked with ("ca: 488Sa...pump"). Rare payloads
   * include them; otherwise the frontend resolves them lazily through
   * GET /interaction-data when the command line is hovered. */
  args?: string;
  /** 2 application command, 3 message component, 5 modal submit. */
  type?: number;
  user: {
    id: string;
    displayName: string;
    avatar: string | null;
  };
}
