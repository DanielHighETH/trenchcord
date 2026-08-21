import type { Room, AppConfig, GuildInfo, DMChannel, FrontendMessage, ContractEntry, MaskedToken, PriceAlert, TweetAlert, TelegramTrack, PremiumEvent, PremiumNotifyPrefs, TelegramChatInfo, TradingStatus } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60 * 1000).toISOString();
}

let _streamId = 1000;
export function nextStreamId(): string {
  return `demo-stream-${++_streamId}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const GUILD_PROSPERITY = 'guild-prosperity-001';
const GUILD_WAGMI = 'guild-wagmi-002';
const GUILD_INVERSE = 'guild-inverse-003';

const CH_PROS_ALPHA = 'ch-pros-alpha';
const CH_WAGMI_GENERAL = 'ch-wagmi-general';
const CH_WAGMI_CALLS = 'ch-wagmi-calls';
const CH_INVERSE_CLEAN = 'ch-inverse-clean';

const TG_CABAL = 'tg-cabal-001';
const TG_LOUNGE = 'tg-lounge-002';

const ROOM_MAIN = 'room-main';
const ROOM_CALLS = 'room-calls';
const ROOM_TG = 'room-tg';

// Real, well-known SOL mints so address rendering/detection behaves exactly
// like production. The token names in the copy are made up.
const MINT_ANSEM = '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr';
const MINT_WIF = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
const EVM_ADDR_1 = '0xb695559b26bb2c9703ef1935c37aeae9526bab07';

// ---------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------

export const DEMO_GUILDS: GuildInfo[] = [
  {
    id: GUILD_PROSPERITY,
    name: 'Prosperity DAO',
    icon: null,
    channels: [
      { id: CH_PROS_ALPHA, name: '👾｜alpha', type: 0 },
    ],
  },
  {
    id: GUILD_WAGMI,
    name: 'WAGMI DAO',
    icon: null,
    channels: [
      { id: CH_WAGMI_GENERAL, name: 'wagmi-general', type: 0 },
      { id: CH_WAGMI_CALLS, name: 'wagmi-calls', type: 0 },
    ],
  },
  {
    id: GUILD_INVERSE,
    name: 'Inverse',
    icon: null,
    channels: [
      { id: CH_INVERSE_CLEAN, name: 'clean-chat', type: 0 },
    ],
  },
];

export const DEMO_TELEGRAM_CHATS: TelegramChatInfo[] = [
  { id: TG_CABAL, title: 'Cabal Calls', type: 'channel', photo: null },
  { id: TG_LOUNGE, title: 'Trench Lounge', type: 'supergroup', photo: null },
];

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export const DEMO_ROOMS: Room[] = [
  {
    id: ROOM_MAIN,
    name: 'Main',
    channels: [
      { guildId: GUILD_PROSPERITY, channelId: CH_PROS_ALPHA, guildName: 'Prosperity DAO', channelName: '👾｜alpha' },
      { guildId: GUILD_WAGMI, channelId: CH_WAGMI_GENERAL, guildName: 'WAGMI DAO', channelName: 'wagmi-general' },
      { guildId: GUILD_INVERSE, channelId: CH_INVERSE_CLEAN, guildName: 'Inverse', channelName: 'clean-chat' },
      { source: 'telegram', guildId: null, channelId: TG_CABAL, channelName: 'Cabal Calls' },
    ],
    highlightedUsers: [],
    filteredUsers: [],
    filterEnabled: false,
    color: '#2c2f3e',
  },
  {
    id: ROOM_CALLS,
    name: 'Calls',
    channels: [
      { guildId: GUILD_PROSPERITY, channelId: CH_PROS_ALPHA, guildName: 'Prosperity DAO', channelName: '👾｜alpha' },
      { guildId: GUILD_WAGMI, channelId: CH_WAGMI_CALLS, guildName: 'WAGMI DAO', channelName: 'wagmi-calls' },
      { source: 'telegram', guildId: null, channelId: TG_CABAL, channelName: 'Cabal Calls' },
    ],
    highlightedUsers: [],
    filteredUsers: [],
    filterEnabled: false,
    color: '#2a332e',
  },
  {
    id: ROOM_TG,
    name: 'Telegram',
    channels: [
      { source: 'telegram', guildId: null, channelId: TG_CABAL, channelName: 'Cabal Calls' },
      { source: 'telegram', guildId: null, channelId: TG_LOUNGE, channelName: 'Trench Lounge' },
    ],
    highlightedUsers: [],
    filteredUsers: [],
    filterEnabled: false,
    color: '#26323e',
    keywordPatterns: [
      { pattern: 'presale', matchMode: 'includes', label: 'presale' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

const USER_WOLFIE = '900000000000000100';
const USER_ASHTON = '900000000000000101';
const USER_SAM = '900000000000000102';
const USER_NICK = '900000000000000103';
const USER_JENZ = '900000000000000104';
const USER_WHATEVER = '900000000000000105';
const USER_KONDA = '900000000000000106';
const USER_LUCAS = '900000000000000107';
const USER_BRIX = '900000000000000108';
const USER_PILKS = '900000000000000109';
const USER_MERA = '900000000000000110';
const USER_RICK = '900000000000000111';

const authors = {
  wolfie: { id: USER_WOLFIE, username: 'wolfie', displayName: 'wolfie', avatar: null, roleColor: '#00b0f4' },
  ashton: { id: USER_ASHTON, username: 'ashton', displayName: 'ashton', avatar: null, roleColor: '#faa61a' },
  sam: { id: USER_SAM, username: 'sam', displayName: 'Sam', avatar: null, roleColor: '#2ecc71' },
  nick: { id: USER_NICK, username: 'nick', displayName: 'Nick', avatar: null, roleColor: '#f47b67' },
  jenz: { id: USER_JENZ, username: 'jenz', displayName: 'jenz', avatar: null },
  whatever: { id: USER_WHATEVER, username: 'Whatever', displayName: 'Whatever', avatar: null },
  konda: { id: USER_KONDA, username: 'konda', displayName: 'konda', avatar: null, roleColor: '#e67e22' },
  lucas: { id: USER_LUCAS, username: 'lucas', displayName: 'Lucas CABAL MAFIA', avatar: null, roleColor: '#d4a017' },
  brix: { id: USER_BRIX, username: 'brix', displayName: 'brix', avatar: null, roleColor: '#9b59b6' },
  pilks: { id: USER_PILKS, username: 'pilks', displayName: 'pilks', avatar: null },
  mera: { id: USER_MERA, username: 'mera', displayName: 'mera', avatar: null, roleColor: '#eb459e' },
  rick: { id: USER_RICK, username: 'Rick', displayName: 'Rick', avatar: null, roleColor: '#43b581', isBot: true },
  // Telegram: a channel posts as itself; group members post by name.
  // (Numeric ids, like real Telegram — avatar fallbacks BigInt-parse them.)
  tgCabal: { id: '7000000000000000001', username: 'Cabal Calls', displayName: 'Cabal Calls', avatar: null },
  tgDario: { id: '7000000000000000002', username: 'dario', displayName: 'Dario', avatar: null },
  tgMeeks: { id: '7000000000000000003', username: 'meeks', displayName: 'meeks', avatar: null },
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const DEMO_CONFIG: AppConfig = {
  discordTokens: [],
  rooms: DEMO_ROOMS,
  globalHighlightedUsers: [USER_WOLFIE, USER_ASHTON],
  contractDetection: true,
  guildColors: {
    [GUILD_PROSPERITY]: '#2d3142',
    [GUILD_WAGMI]: '#2d3832',
    [GUILD_INVERSE]: '#38352d',
  },
  channelColors: {},
  dmColors: {},
  enabledGuilds: [GUILD_PROSPERITY, GUILD_WAGMI, GUILD_INVERSE],
  evmAddressColor: '#fee75c',
  solAddressColor: '#14f195',
  openInDiscordApp: false,
  openInTelegramApp: false,
  hiddenUsers: {},
  hiddenRoles: {},
  messageSounds: false,
  soundSettings: {
    highlight: { enabled: true, volume: 80, useCustom: false },
    contractAlert: { enabled: true, volume: 80, useCustom: false },
    keywordAlert: { enabled: true, volume: 80, useCustom: false },
    premiumAlert: { enabled: true, volume: 80, useCustom: false },
  },
  pushover: { enabled: false, appToken: '', userKey: '', priority: 0, sound: 'pushover', triggers: { highlightedUser: false, highlightedUserContract: false, contract: false, keyword: false }, filters: { userIds: [], channelIds: [], guildIds: [] } },
  contractLinkTemplates: { evm: '', sol: '', solPlatform: 'axiom', evmPlatform: 'gmgn' },
  contractClickAction: 'copy_open',
  showFullContractAddress: false,
  autoOpenHighlightedContracts: false,
  globalKeywordPatterns: [
    { pattern: 'presale', matchMode: 'includes', label: 'presale' },
  ],
  keywordAlertsEnabled: true,
  desktopNotifications: false,
  mentionsUserEnabled: true,
  mentionsRoleEnabled: true,
  mentionsBotsEnabled: true,
  mentionsHereEnabled: false,
  mentionsEveryoneEnabled: false,
  badgeClickAction: 'discord',
  channelSounds: {},
  userNameCache: {},
  chattingEnabled: false,
  dmReadSyncEnabled: false,
  messageDisplay: 'default',
  compactModeAvatars: true,
  compactModeNameOnce: false,
  roleColors: true,
  mobileZoomScale: 1,
  splitLayout: 'row',
  paneRoomIds: [],
  paneLocks: [],
  gridMirror: false,
  seenAnnouncements: [],
  telegramColors: {
    [TG_CABAL]: '#26323e',
    [TG_LOUNGE]: '#2c3a3a',
  },
  // Trading looks fully set up so buy buttons and the sniper render, but the
  // store rejects actual buys before any request leaves the app.
  trading: {
    enabled: true,
    region: 'us',
    wallets: [
      { id: 'demo-wallet-1', label: 'Main', address: 'GJtaN2GEZsWnQxgQvzTdmBWQfSJwn6Wsb8dTL5ajb1q7' },
      { id: 'demo-wallet-2', label: 'Sniper', address: '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9' },
    ],
    activeWalletIds: ['demo-wallet-1', 'demo-wallet-2'],
    walletAmountMode: 'split',
    presetAmounts: [1, 3, 5, 10, 20],
    slippage: 20,
    tip: null,
    priorityFee: null,
    antimev: true,
    requireDoubleClick: false,
    buttonSize: 'md',
    buttonBgColor: '#23a55a',
    buttonTextColor: '#ffffff',
    showContractPill: true,
    openSiteOnBuy: false,
    buySitePlatform: 'default',
    buySiteUrl: '',
  },
  sniping: {
    enabled: true,
    configs: [
      {
        id: 'demo-snipe-1',
        name: 'Insiders',
        enabled: true,
        roomId: ROOM_MAIN,
        mode: 'users',
        users: [USER_WOLFIE, USER_ASHTON],
        solAmount: 0.5,
        walletIds: ['demo-wallet-2'],
        resnipeMode: 'never',
        limitSells: [],
      },
    ],
  },
};

export const DEMO_TRADING_STATUS: TradingStatus = {
  configured: true,
  masked: 'slk_****…****demo',
  walletCount: 2,
};

// ---------------------------------------------------------------------------
// DM Channels
// ---------------------------------------------------------------------------

export const DEMO_DM_CHANNELS: DMChannel[] = [
  {
    id: 'dm-channel-001',
    recipients: [
      { id: USER_WOLFIE, username: 'wolfie', global_name: 'wolfie', avatar: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// Masked Tokens
// ---------------------------------------------------------------------------

export const DEMO_MASKED_TOKENS: MaskedToken[] = [
  { index: 0, masked: 'MTA1***...***kNDg' },
];

// ---------------------------------------------------------------------------
// Message factory
// ---------------------------------------------------------------------------

function msg(
  id: string,
  channelId: string,
  guildId: string | null,
  channelName: string,
  guildName: string | null,
  author: FrontendMessage['author'],
  content: string,
  timestamp: string,
  overrides: Partial<FrontendMessage> = {},
): FrontendMessage {
  return {
    id,
    channelId,
    guildId,
    channelName,
    guildName,
    author,
    content,
    timestamp,
    attachments: [],
    embeds: [],
    isHighlighted: false,
    hasContractAddress: false,
    contractAddresses: [],
    mentions: {},
    ...overrides,
  };
}

function tgMsg(
  id: string,
  chatId: string,
  chatTitle: string,
  author: FrontendMessage['author'],
  content: string,
  timestamp: string,
  overrides: Partial<FrontendMessage> = {},
): FrontendMessage {
  return msg(id, chatId, null, chatTitle, null, author, content, timestamp, {
    source: 'telegram',
    ...overrides,
  });
}

/**
 * A Rick-style scanner reply: hyperlinked headline embed with the stat block,
 * token links, the CA in a code pill, and a link-button row. Shared with the
 * promo tour so its live-injected scan looks identical.
 */
export function buildRickScan(
  id: string,
  mint: string,
  tokenName: string,
  ticker: string,
  timestamp: string,
  reply: { id: string; authorId?: string; author: string; content: string; roleColor?: string | null },
  channel: { channelId: string; guildId: string; channelName: string; guildName: string },
): FrontendMessage {
  const dex = `https://dexscreener.com/solana/${mint}`;
  return msg(id, channel.channelId, channel.guildId, channel.channelName, channel.guildName, authors.rick, '', timestamp, {
    hasContractAddress: true,
    contractAddresses: [mint],
    referencedMessage: { id: reply.id, authorId: reply.authorId, author: reply.author, roleColor: reply.roleColor, content: reply.content, mentions: {} },
    embeds: [
      {
        type: 'rich',
        title: `${tokenName} [412K/8.4K%] - ${ticker}/SOL ⬆`,
        url: dex,
        color: 0x57f287,
        description: [
          `🟢 **Solana @ Raydium** 🔥 \`#3\``,
          `💰 USD: \`0.0004120\``,
          `💎 FDV: \`412K\` ➡ \`465K\` \`[12m]\``,
          `💦 Liq: \`41.2K\` \`[x10]\` ‼ \`0%\``,
          `📊 Vol: \`152M\` · Age: \`1h\``,
          `⚡ 1H: \`482K\` · \`241%\` 🅑 \`2.1K\` Ⓢ \`1.5K\``,
          ``,
          `👥 TH: [11.2](${dex})·[2.9](${dex})·[2.4](${dex})·[2.2](${dex})·[2.1](${dex}) \`[28%]\``,
          `🖨 Total: \`731\` · avg \`14w\` old`,
          `🌱 Fresh 1D: \`7%\` · 7D: \`24%\``,
          `🦎 Chart: [DEX](${dex}) · [DEF](https://www.defined.fi/sol/${mint})`,
          ``,
          `\`${mint}\``,
          ``,
          `[MAE](${dex})·[BAN](${dex})·[BNK](${dex})·[PDR](${dex})·[BLO](${dex})·[STB](${dex})`,
          `[TRO](${dex})·[TRT](${dex})·[GMG](${dex})·[PHO](${dex})·[AXI](${dex})·[EXP](${dex})`,
        ].join('\n'),
      },
    ],
    components: [
      { type: 1, components: [{ type: 2, style: 5, label: 'PDR', url: dex }] },
    ],
    reactions: [{ emoji: { id: null, name: '🗑' }, count: 1 }],
  });
}

// ---------------------------------------------------------------------------
// Initial messages per room
// ---------------------------------------------------------------------------

// Prosperity #alpha — the main action: banter, a call, Rick's scan.
const prosAlpha = {
  chatter1: msg('m-p1', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.konda, 'anything moving or are we just staring at charts again', minutesAgo(48)),
  chatter2: msg('m-p2', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.whatever, 'pleaseeeeeeeee\nath', minutesAgo(45)),
  chatter3: msg('m-p3', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.brix, 'u didnt sell?\nlul', minutesAgo(44), {
    referencedMessage: { id: 'm-p2', authorId: USER_WHATEVER, author: 'Whatever', content: 'pleaseeeeeeeee\nath', mentions: {} },
  }),
  wolfieCall: msg('m-p4', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.wolfie, MINT_ANSEM, minutesAgo(40), {
    isHighlighted: true,
    hasContractAddress: true,
    contractAddresses: [MINT_ANSEM],
  }),
  rickScan: buildRickScan('m-p5', MINT_ANSEM, 'Ansem', 'ANSEM', minutesAgo(40), { id: 'm-p4', authorId: USER_WOLFIE, author: 'wolfie', content: MINT_ANSEM, roleColor: authors.wolfie.roleColor }, { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO' }),
  react1: msg('m-p6', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.mera, 'in. chart looks stupid good', minutesAgo(37), {
    referencedMessage: { id: 'm-p4', authorId: USER_WOLFIE, author: 'wolfie', roleColor: authors.wolfie.roleColor, content: MINT_ANSEM, mentions: {} },
    reactions: [{ emoji: { id: null, name: '🔥' }, count: 4 }],
  }),
  react2: msg('m-p7', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.lucas, 'idk why ppl arent bidding this one', minutesAgo(36)),
  thesis: msg('m-p8', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.nick, "bro your thesis was 'it went up'. bullish", minutesAgo(28), {
    referencedMessage: { id: 'm-p7', authorId: USER_LUCAS, author: 'Lucas CABAL MAFIA', roleColor: authors.lucas.roleColor, content: 'idk why ppl arent bidding this one', mentions: {} },
    reactions: [{ emoji: { id: null, name: '😭' }, count: 2 }],
  }),
  ashtonNote: msg('m-p9', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.ashton, 'second entry loading imo, watch the 15m', minutesAgo(25), {
    isHighlighted: true,
  }),
  revive: msg('m-p10', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.whatever, 'can this thing revive or is it done', minutesAgo(12)),
  leaderboard: msg('m-p11', CH_PROS_ALPHA, GUILD_PROSPERITY, '👾｜alpha', 'Prosperity DAO', authors.sam, 'he isnt 2nd on the fomo leaderboard for nothing', minutesAgo(8), {
    referencedMessage: { id: 'm-p9', authorId: USER_ASHTON, author: 'ashton', roleColor: authors.ashton.roleColor, content: 'second entry loading imo, watch the 15m', mentions: {} },
    reactions: [{ emoji: { id: null, name: '🔥' }, count: 1 }],
  }),
};

// WAGMI #wagmi-general — everyday chatter, not all of it crypto.
const wagmiGeneral = [
  msg('m-w1', CH_WAGMI_GENERAL, GUILD_WAGMI, 'wagmi-general', 'WAGMI DAO', authors.sam, 'gm', minutesAgo(60)),
  msg('m-w2', CH_WAGMI_GENERAL, GUILD_WAGMI, 'wagmi-general', 'WAGMI DAO', authors.jenz, 'gm gm', minutesAgo(59)),
  msg('m-w3', CH_WAGMI_GENERAL, GUILD_WAGMI, 'wagmi-general', 'WAGMI DAO', authors.nick, 'anyone watch the game last night', minutesAgo(52)),
  msg('m-w4', CH_WAGMI_GENERAL, GUILD_WAGMI, 'wagmi-general', 'WAGMI DAO', authors.sam, 'painful. dont wanna talk about it', minutesAgo(51), {
    referencedMessage: { id: 'm-w3', authorId: USER_NICK, author: 'Nick', roleColor: authors.nick.roleColor, content: 'anyone watch the game last night', mentions: {} },
    reactions: [{ emoji: { id: null, name: '💀' }, count: 3 }],
  }),
  msg('m-w5', CH_WAGMI_GENERAL, GUILD_WAGMI, 'wagmi-general', 'WAGMI DAO', authors.konda, 'too many catalysts at 15m', minutesAgo(33)),
  msg('m-w6', CH_WAGMI_GENERAL, GUILD_WAGMI, 'wagmi-general', 'WAGMI DAO', authors.brix, 'prob this ig', minutesAgo(32), {
    referencedMessage: { id: 'm-w5', authorId: USER_KONDA, author: 'konda', roleColor: authors.konda.roleColor, content: 'too many catalysts at 15m', mentions: {} },
  }),
  msg('m-w7', CH_WAGMI_GENERAL, GUILD_WAGMI, 'wagmi-general', 'WAGMI DAO', authors.brix, 'still good gimme 6m', minutesAgo(10)),
];

// WAGMI #wagmi-calls — a second caller channel for the Calls room.
const wagmiCalls = {
  ashtonCall: msg('m-wc1', CH_WAGMI_CALLS, GUILD_WAGMI, 'wagmi-calls', 'WAGMI DAO', authors.ashton, `adding here. dip entry\n${MINT_WIF}`, minutesAgo(90), {
    isHighlighted: true,
    hasContractAddress: true,
    contractAddresses: [MINT_WIF],
  }),
  sized: msg('m-wc2', CH_WAGMI_CALLS, GUILD_WAGMI, 'wagmi-calls', 'WAGMI DAO', authors.brix, 'sized in small, sl set', minutesAgo(88)),
};

// Inverse #clean-chat — dry one-liners.
const inverseClean = [
  msg('m-i1', CH_INVERSE_CLEAN, GUILD_INVERSE, 'clean-chat', 'Inverse', authors.pilks, 'quiet morning huh', minutesAgo(55)),
  msg('m-i2', CH_INVERSE_CLEAN, GUILD_INVERSE, 'clean-chat', 'Inverse', authors.jenz, 'someone launched a pope coin again', minutesAgo(30)),
  msg('m-i3', CH_INVERSE_CLEAN, GUILD_INVERSE, 'clean-chat', 'Inverse', authors.pilks, 'lunch break. dont rug while im gone', minutesAgo(5)),
];

// Telegram — a calls channel and a casual group.
const tgCabalMsgs = [
  tgMsg('m-t1', TG_CABAL, 'Cabal Calls', authors.tgCabal, `$ANSEM looking primed. entry zone 380-400k, invalidation if it loses 350k\n\n${MINT_ANSEM}`, minutesAgo(35), {
    hasContractAddress: true,
    contractAddresses: [MINT_ANSEM],
    buttons: [
      { text: '📈 Chart', url: `https://dexscreener.com/solana/${MINT_ANSEM}` },
      { text: '🤖 Quick buy', url: `https://t.me/` },
    ],
  }),
  tgMsg('m-t2', TG_CABAL, 'Cabal Calls', authors.tgCabal, 'presale list for the next one opens 20:00 UTC. members only, link stays the same', minutesAgo(22), {
    matchedKeywords: ['presale'],
  }),
  tgMsg('m-t3', TG_CABAL, 'Cabal Calls', authors.tgCabal, 'reminder: we never dm first. report impersonators', minutesAgo(9)),
];

const tgLoungeMsgs = [
  tgMsg('m-t4', TG_LOUNGE, 'Trench Lounge', authors.tgDario, "who's still holding from yesterday", minutesAgo(41)),
  tgMsg('m-t5', TG_LOUNGE, 'Trench Lounge', authors.tgMeeks, 'me. unfortunately', minutesAgo(40)),
  tgMsg('m-t6', TG_LOUNGE, 'Trench Lounge', authors.tgDario, 'lmaooo we are so back (we are not back)', minutesAgo(39), {
    reactions: [{ emoji: { id: null, name: '😂' }, count: 7 }],
  }),
  tgMsg('m-t7', TG_LOUNGE, 'Trench Lounge', authors.tgMeeks, 'ok the cabal call is actually moving, im in', minutesAgo(28)),
];

// DM — wolfie shares early.
const dmMessages: FrontendMessage[] = [
  msg('m-dm1', 'dm-channel-001', null, 'DM', null, authors.wolfie, 'yo', minutesAgo(70)),
  msg('m-dm2', 'dm-channel-001', null, 'DM', null, authors.wolfie, `check this before i post it in alpha\n${MINT_ANSEM}`, minutesAgo(69), {
    hasContractAddress: true,
    contractAddresses: [MINT_ANSEM],
  }),
  msg('m-dm3', 'dm-channel-001', null, 'DM', null, authors.wolfie, 'dev is a known guy, second project. dont size stupid', minutesAgo(68)),
];

function byTime(msgs: FrontendMessage[]): FrontendMessage[] {
  return [...msgs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

const p = prosAlpha;
const wc = wagmiCalls;

// A past snipe for the Snipes feed: ashton's WIF call auto-bought.
const snipedCall: FrontendMessage = {
  ...wc.ashtonCall,
  snipeInfo: {
    status: 'bought',
    mint: MINT_WIF,
    configName: 'Insiders',
    solAmount: 0.5,
    walletsOk: 1,
    walletsTotal: 1,
    timestamp: minutesAgo(90),
  },
};

export const DEMO_MESSAGES: Record<string, FrontendMessage[]> = {
  [ROOM_MAIN]: byTime([
    ...Object.values(p),
    ...wagmiGeneral,
    ...inverseClean,
    ...tgCabalMsgs,
  ]),
  [ROOM_CALLS]: byTime([
    p.wolfieCall, p.rickScan, p.react1, p.ashtonNote,
    wc.ashtonCall, wc.sized,
    ...tgCabalMsgs,
  ]),
  [ROOM_TG]: byTime([...tgCabalMsgs, ...tgLoungeMsgs]),
  ['dm:dm-channel-001']: dmMessages,
  // The live backend mirrors every DM into the aggregate "All DMs" feed.
  dms: dmMessages,
  snipes: [snipedCall],
};

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export const DEMO_CONTRACTS: ContractEntry[] = [
  {
    address: MINT_ANSEM,
    chain: 'sol',
    authorId: USER_WOLFIE,
    authorName: 'wolfie',
    channelId: CH_PROS_ALPHA,
    channelName: '👾｜alpha',
    guildId: GUILD_PROSPERITY,
    guildName: 'Prosperity DAO',
    roomIds: [ROOM_MAIN, ROOM_CALLS],
    messageId: 'm-p4',
    timestamp: minutesAgo(40),
    firstSeen: true,
    content: MINT_ANSEM,
  },
  {
    address: MINT_ANSEM,
    chain: 'sol',
    authorId: '7000000000000000001',
    authorName: 'Cabal Calls',
    channelId: TG_CABAL,
    channelName: 'Cabal Calls',
    guildId: null,
    guildName: null,
    roomIds: [ROOM_MAIN, ROOM_CALLS, ROOM_TG],
    messageId: 'm-t1',
    timestamp: minutesAgo(35),
    firstSeen: false,
    source: 'telegram',
    content: '$ANSEM looking primed. entry zone 380-400k…',
  },
  {
    address: MINT_WIF,
    chain: 'sol',
    authorId: USER_ASHTON,
    authorName: 'ashton',
    channelId: CH_WAGMI_CALLS,
    channelName: 'wagmi-calls',
    guildId: GUILD_WAGMI,
    guildName: 'WAGMI DAO',
    roomIds: [ROOM_CALLS],
    messageId: 'm-wc1',
    timestamp: minutesAgo(90),
    firstSeen: true,
    content: 'adding here. dip entry',
  },
  {
    address: EVM_ADDR_1,
    chain: 'evm',
    evmChain: 'base',
    authorId: USER_KONDA,
    authorName: 'konda',
    channelId: CH_PROS_ALPHA,
    channelName: '👾｜alpha',
    guildId: GUILD_PROSPERITY,
    guildName: 'Prosperity DAO',
    roomIds: [ROOM_MAIN],
    messageId: 'm-old-1',
    timestamp: minutesAgo(180),
    firstSeen: true,
    content: 'base play from earlier',
  },
];

// ---------------------------------------------------------------------------
// Streaming message pool (for simulated real-time feed)
// ---------------------------------------------------------------------------

export const STREAM_POOL: Array<{
  channelId: string;
  guildId: string | null;
  channelName: string;
  guildName: string | null;
  source?: 'telegram';
  author: FrontendMessage['author'];
  content: string;
  roomIds: string[];
  overrides?: Partial<FrontendMessage>;
}> = [
  { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO', author: authors.sam, content: 'volume ticking up on the 5m', roomIds: [ROOM_MAIN, ROOM_CALLS] },
  { channelId: CH_WAGMI_GENERAL, guildId: GUILD_WAGMI, channelName: 'wagmi-general', guildName: 'WAGMI DAO', author: authors.jenz, content: 'im so tired of being early and selling late', roomIds: [ROOM_MAIN] },
  { channelId: CH_INVERSE_CLEAN, guildId: GUILD_INVERSE, channelName: 'clean-chat', guildName: 'Inverse', author: authors.pilks, content: 'clean chat stays clean. take it to the trenches', roomIds: [ROOM_MAIN] },
  { channelId: TG_CABAL, guildId: null, channelName: 'Cabal Calls', guildName: null, source: 'telegram', author: authors.tgCabal, content: 'watching two setups rn, one post coming', roomIds: [ROOM_MAIN, ROOM_CALLS, ROOM_TG] },
  { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO', author: authors.whatever, content: 'ok who bought the top 😭', roomIds: [ROOM_MAIN, ROOM_CALLS], overrides: { reactions: [{ emoji: { id: null, name: '😂' }, count: 3 }] } },
  { channelId: CH_WAGMI_GENERAL, guildId: GUILD_WAGMI, channelName: 'wagmi-general', guildName: 'WAGMI DAO', author: authors.nick, content: 'new phone who dis', roomIds: [ROOM_MAIN] },
  { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO', author: authors.wolfie, content: 'next call after this candle closes', roomIds: [ROOM_MAIN, ROOM_CALLS], overrides: { isHighlighted: true } },
  { channelId: TG_LOUNGE, guildId: null, channelName: 'Trench Lounge', guildName: null, source: 'telegram', author: authors.tgMeeks, content: "anyone else's feed lagging or just me", roomIds: [ROOM_TG] },
  { channelId: CH_INVERSE_CLEAN, guildId: GUILD_INVERSE, channelName: 'clean-chat', guildName: 'Inverse', author: authors.jenz, content: 'gm at 3pm. rough one', roomIds: [ROOM_MAIN] },
  { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO', author: authors.konda, content: 'chart said up so it went down. classic', roomIds: [ROOM_MAIN, ROOM_CALLS] },
  { channelId: CH_WAGMI_GENERAL, guildId: GUILD_WAGMI, channelName: 'wagmi-general', guildName: 'WAGMI DAO', author: authors.brix, content: '6 monitors and still poor', roomIds: [ROOM_MAIN], overrides: { reactions: [{ emoji: { id: null, name: '💀' }, count: 2 }] } },
  { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO', author: authors.ashton, content: 'eyes on. dont chase', roomIds: [ROOM_MAIN, ROOM_CALLS], overrides: { isHighlighted: true } },
  { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO', author: authors.lucas, content: 'spread thin rn, only quality entries', roomIds: [ROOM_MAIN, ROOM_CALLS] },
  { channelId: TG_CABAL, guildId: null, channelName: 'Cabal Calls', guildName: null, source: 'telegram', author: authors.tgCabal, content: 'reminder: we never dm first', roomIds: [ROOM_MAIN, ROOM_CALLS, ROOM_TG] },
  { channelId: CH_WAGMI_GENERAL, guildId: GUILD_WAGMI, channelName: 'wagmi-general', guildName: 'WAGMI DAO', author: authors.sam, content: 'lets get this bread', roomIds: [ROOM_MAIN] },
];

export function buildStreamMessage(poolIndex: number): { message: FrontendMessage; roomIds: string[] } {
  const entry = STREAM_POOL[poolIndex % STREAM_POOL.length];
  const id = nextStreamId();
  return {
    message: msg(
      id,
      entry.channelId,
      entry.guildId,
      entry.channelName,
      entry.guildName,
      entry.author,
      entry.content,
      new Date().toISOString(),
      { ...(entry.source ? { source: entry.source } : {}), ...entry.overrides },
    ),
    roomIds: entry.roomIds,
  };
}

// ── Premium alerts demo data ─────────────────────────────────────────────────

export const DEMO_PRICE_ALERTS: PriceAlert[] = [
  {
    id: 'demo-price-1',
    kind: 'cex',
    symbol: 'SOL',
    condition: 'goes_over',
    target: 'price',
    value: 300,
    basePrice: 261.4,
    urgency: 'critical',
    triggered: false,
    enabled: true,
    createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
  },
  {
    id: 'demo-price-2',
    kind: 'dex',
    chain: 'sol',
    contractAddress: MINT_ANSEM,
    tokenSymbol: 'ANSEM',
    tokenName: 'Ansem',
    condition: 'percent_up',
    target: 'mcap',
    value: 50,
    baseMcap: 412_000,
    urgency: 'normal',
    triggered: false,
    enabled: true,
    createdAt: new Date(Date.now() - 86400_000).toISOString(),
  },
  {
    id: 'demo-price-3',
    kind: 'metal',
    symbol: 'XAU/USD',
    condition: 'goes_under',
    target: 'price',
    value: 2400,
    basePrice: 2489.2,
    urgency: 'normal',
    triggered: false,
    enabled: false,
    createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
  },
];

export const DEMO_TWEET_ALERTS: TweetAlert[] = [
  {
    id: 'demo-tweet-1',
    kind: 'tweet',
    author: 'satoshi',
    subType: 'any',
    keywords: [],
    urgency: 'critical',
    enabled: true,
    createdAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
  },
  {
    id: 'demo-tweet-2',
    kind: 'keyword',
    author: 'danhigh_eth',
    subType: 'tweet',
    keywords: ['airdrop', 'launch'],
    urgency: 'critical',
    enabled: true,
    createdAt: new Date(Date.now() - 86400_000).toISOString(),
  },
  {
    id: 'demo-tweet-3',
    kind: 'tweet',
    author: 'trenchcordapp',
    subType: 'any',
    keywords: [],
    urgency: 'normal',
    enabled: true,
    createdAt: new Date(Date.now() - 12 * 3600_000).toISOString(),
  },
];

export const DEMO_TELEGRAM_TRACKS: TelegramTrack[] = [
  {
    id: 'demo-tg-1',
    channelUsername: 'cabalcalls',
    keywords: ['presale'],
    enabled: true,
    createdAt: new Date(Date.now() - 86400_000).toISOString(),
    channelStatus: 'joined',
    channelTitle: 'Cabal Calls',
    channelError: null,
  },
];

export const DEMO_PREMIUM_EVENTS: PremiumEvent[] = [
  {
    id: '3',
    kind: 'price',
    source_id: 'demo-price-1',
    title: 'SOL alert triggered',
    body: 'Price goes over $290.0000\nCurrent: $291.5400',
    url: null,
    payload: { alert_kind: 'cex', symbol: 'SOL' },
    urgency: 'critical',
    created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  },
  {
    id: '4',
    kind: 'tweet',
    source_id: 'demo-tweet-3',
    title: 'trenchcordapp tweeted',
    body: 'Trenchcord v2.0 is out — your Discord and Telegram, supercharged for trenching 🪖',
    url: 'https://x.com/trenchcordapp',
    payload: { tweet_kind: 'tweet', author: 'trenchcordapp' },
    urgency: 'normal',
    created_at: new Date(Date.now() - 45 * 60_000).toISOString(),
  },
  {
    id: '2',
    kind: 'tweet',
    source_id: 'demo-tweet-2',
    title: 'danhigh_eth tweeted',
    body: 'The launch is live. LFG.\n\nMatched: launch',
    url: 'https://x.com/danhigh_eth',
    payload: { tweet_kind: 'keyword', author: 'danhigh_eth' },
    urgency: 'critical',
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: '1',
    kind: 'telegram',
    source_id: 'demo-tg-1',
    title: '@cabalcalls mentioned: presale',
    body: 'presale list for the next one opens 20:00 UTC. members only',
    url: 'https://t.me/cabalcalls/1234',
    payload: { channel: 'cabalcalls', msg_id: 1234 },
    urgency: 'normal',
    created_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
  },
];

export const DEMO_PREMIUM_NOTIFY: PremiumNotifyPrefs = {
  pushoverUserKey: 'uDemoDemoDemoDemoDemoDemoDemo1',
  pushoverEnabled: true,
  telegramDm: false,
  discordDm: false,
  telegramLinked: false,
  discordLinked: false,
};

export const DEMO_PREMIUM_BOTS = {
  telegram: 'TrenchcordBot',
  discord: 'Trenchcord',
};

// ---------------------------------------------------------------------------
// Handles for the scripted promo overlays (tour.tsx and scenes.tsx), which
// inject their own messages into the same rooms/channels the static data uses.
// ---------------------------------------------------------------------------

export const TOUR_REFS = {
  ROOM_MAIN,
  ROOM_CALLS,
  ROOM_TG,
  GUILD_PROSPERITY,
  CH_PROS_ALPHA,
  GUILD_WAGMI,
  CH_WAGMI_GENERAL,
  CH_WAGMI_CALLS,
  GUILD_INVERSE,
  CH_INVERSE_CLEAN,
  TG_CABAL,
  TG_LOUNGE,
  authors,
};
