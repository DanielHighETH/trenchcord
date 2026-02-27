import type { Room, AppConfig, GuildInfo, DMChannel, FrontendMessage, ContractEntry, MaskedToken } from '../types';

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

const GUILD_ALPHA = 'guild-alpha-001';
const GUILD_DEGEN = 'guild-degen-002';
const GUILD_NFT = 'guild-nft-003';

const CH_ALPHA_CALLS = 'ch-alpha-calls';
const CH_WHALE_WATCH = 'ch-whale-watch';
const CH_GENERAL = 'ch-general';
const CH_TOKEN_DROPS = 'ch-token-drops';
const CH_NFT_ALERTS = 'ch-nft-alerts';
const CH_FLOOR_WATCH = 'ch-floor-watch';

const ROOM_ALPHA = 'room-alpha';
const ROOM_DEGEN = 'room-degen';
const ROOM_NFT = 'room-nft';
const ROOM_WHALE = 'room-whale';

const USER_WHALE = '900000000000000100';
const USER_ALPHA = '900000000000000101';
const USER_MIKE = '900000000000000102';
const USER_SARAH = '900000000000000103';
const USER_NFT = '900000000000000104';
const USER_SOL = '900000000000000105';
const USER_ETH = '900000000000000106';
const USER_CHART = '900000000000000107';

const EVM_ADDR_1 = '0xb695559b26bb2c9703ef1935c37aeae9526bab07';
const EVM_ADDR_2 = '0xDeaD000000000000000000000000000000BeEF42';
const SOL_ADDR_1 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_ADDR_2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ---------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------

export const DEMO_GUILDS: GuildInfo[] = [
  {
    id: GUILD_ALPHA,
    name: 'Alpha Hunters',
    icon: null,
    channels: [
      { id: CH_ALPHA_CALLS, name: 'alpha-calls', type: 0 },
      { id: CH_WHALE_WATCH, name: 'whale-watch', type: 0 },
    ],
  },
  {
    id: GUILD_DEGEN,
    name: 'Degen Lounge',
    icon: null,
    channels: [
      { id: CH_GENERAL, name: 'general', type: 0 },
      { id: CH_TOKEN_DROPS, name: 'token-drops', type: 0 },
    ],
  },
  {
    id: GUILD_NFT,
    name: 'NFT Collective',
    icon: null,
    channels: [
      { id: CH_NFT_ALERTS, name: 'nft-alerts', type: 0 },
      { id: CH_FLOOR_WATCH, name: 'floor-watch', type: 0 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export const DEMO_ROOMS: Room[] = [
  {
    id: ROOM_ALPHA,
    name: 'Alpha Calls',
    channels: [
      { guildId: GUILD_ALPHA, channelId: CH_ALPHA_CALLS, guildName: 'Alpha Hunters', channelName: 'alpha-calls' },
      { guildId: GUILD_ALPHA, channelId: CH_WHALE_WATCH, guildName: 'Alpha Hunters', channelName: 'whale-watch' },
    ],
    highlightedUsers: [USER_WHALE, USER_ALPHA],
    filteredUsers: [],
    filterEnabled: false,
    color: '#2c2f3e',
    keywordPatterns: [
      { pattern: 'stealth launch', matchMode: 'includes', label: 'stealth' },
    ],
  },
  {
    id: ROOM_DEGEN,
    name: 'Degen Chat',
    channels: [
      { guildId: GUILD_DEGEN, channelId: CH_GENERAL, guildName: 'Degen Lounge', channelName: 'general' },
      { guildId: GUILD_DEGEN, channelId: CH_TOKEN_DROPS, guildName: 'Degen Lounge', channelName: 'token-drops' },
    ],
    highlightedUsers: [],
    filteredUsers: [],
    filterEnabled: false,
    color: '#2a332e',
    keywordPatterns: [
      { pattern: '100x', matchMode: 'includes', label: '100x' },
    ],
  },
  {
    id: ROOM_NFT,
    name: 'NFT Signals',
    channels: [
      { guildId: GUILD_NFT, channelId: CH_NFT_ALERTS, guildName: 'NFT Collective', channelName: 'nft-alerts' },
      { guildId: GUILD_NFT, channelId: CH_FLOOR_WATCH, guildName: 'NFT Collective', channelName: 'floor-watch' },
    ],
    highlightedUsers: [USER_NFT],
    filteredUsers: [],
    filterEnabled: false,
    color: '#332c3e',
  },
  {
    id: ROOM_WHALE,
    name: 'Whale Alerts',
    channels: [
      { guildId: GUILD_ALPHA, channelId: CH_WHALE_WATCH, guildName: 'Alpha Hunters', channelName: 'whale-watch' },
      { guildId: GUILD_DEGEN, channelId: CH_TOKEN_DROPS, guildName: 'Degen Lounge', channelName: 'token-drops' },
    ],
    highlightedUsers: [USER_WHALE],
    filteredUsers: [],
    filterEnabled: false,
    color: '#3a2c2c',
  },
];

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const DEMO_CONFIG: AppConfig = {
  discordTokens: [],
  rooms: DEMO_ROOMS,
  globalHighlightedUsers: [USER_WHALE, USER_ALPHA],
  contractDetection: true,
  guildColors: {
    [GUILD_ALPHA]: '#2d3142',
    [GUILD_DEGEN]: '#2d3832',
    [GUILD_NFT]: '#382d42',
  },
  enabledGuilds: [GUILD_ALPHA, GUILD_DEGEN, GUILD_NFT],
  evmAddressColor: '#fee75c',
  solAddressColor: '#14f195',
  openInDiscordApp: false,
  hiddenUsers: {},
  messageSounds: false,
  soundSettings: {
    highlight: { enabled: true, volume: 80, useCustom: false },
    contractAlert: { enabled: true, volume: 80, useCustom: false },
    keywordAlert: { enabled: true, volume: 80, useCustom: false },
  },
  pushover: { enabled: false, appToken: '', userKey: '' },
  contractLinkTemplates: { evm: '', sol: '', solPlatform: 'axiom', evmPlatform: 'gmgn' },
  contractClickAction: 'copy_open',
  autoOpenHighlightedContracts: false,
  globalKeywordPatterns: [
    { pattern: 'airdrop', matchMode: 'includes', label: 'airdrop' },
  ],
  keywordAlertsEnabled: true,
  desktopNotifications: false,
  badgeClickAction: 'discord',
};

// ---------------------------------------------------------------------------
// DM Channels
// ---------------------------------------------------------------------------

export const DEMO_DM_CHANNELS: DMChannel[] = [
  {
    id: 'dm-channel-001',
    recipients: [
      { id: USER_ALPHA, username: 'AlphaLeaker', global_name: 'Alpha Leaker', avatar: null },
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

const authors = {
  whale: { id: USER_WHALE, username: 'WhaleTracker', displayName: 'WhaleTracker', avatar: null },
  alpha: { id: USER_ALPHA, username: 'AlphaLeaker', displayName: 'Alpha Leaker', avatar: null },
  mike: { id: USER_MIKE, username: 'degen_mike', displayName: 'Degen Mike', avatar: null },
  sarah: { id: USER_SARAH, username: 'crypto_sarah', displayName: 'Crypto Sarah', avatar: null },
  nft: { id: USER_NFT, username: 'nft_collector', displayName: 'NFT Collector', avatar: null },
  sol: { id: USER_SOL, username: 'sol_maxi', displayName: 'Sol Maxi', avatar: null },
  eth: { id: USER_ETH, username: 'eth_bull', displayName: 'ETH Bull', avatar: null },
  chart: { id: USER_CHART, username: 'chart_wizard', displayName: 'Chart Wizard', avatar: null },
};

// ---------------------------------------------------------------------------
// Initial messages per room
// ---------------------------------------------------------------------------

const alphaMessages: FrontendMessage[] = [
  msg('m-a1', CH_ALPHA_CALLS, GUILD_ALPHA, 'alpha-calls', 'Alpha Hunters', authors.mike, 'anyone watching the ETH chart? big green candle forming', minutesAgo(58)),
  msg('m-a2', CH_ALPHA_CALLS, GUILD_ALPHA, 'alpha-calls', 'Alpha Hunters', authors.sarah, 'yeah volume is picking up, looks like a breakout', minutesAgo(55)),
  msg('m-a3', CH_ALPHA_CALLS, GUILD_ALPHA, 'alpha-calls', 'Alpha Hunters', authors.whale, `new token just deployed on ETH: ${EVM_ADDR_1}`, minutesAgo(48), {
    isHighlighted: true,
    hasContractAddress: true,
    contractAddresses: [EVM_ADDR_1],
  }),
  msg('m-a4', CH_ALPHA_CALLS, GUILD_ALPHA, 'alpha-calls', 'Alpha Hunters', authors.mike, 'whale just dropped a CA, checking it now', minutesAgo(47)),
  msg('m-a5', CH_WHALE_WATCH, GUILD_ALPHA, 'whale-watch', 'Alpha Hunters', authors.chart, 'chart looks clean, low tax, liq locked', minutesAgo(45), {
    referencedMessage: { id: 'm-a3', author: 'WhaleTracker', content: `new token just deployed on ETH: ${EVM_ADDR_1}`, mentions: {} },
  }),
  msg('m-a6', CH_ALPHA_CALLS, GUILD_ALPHA, 'alpha-calls', 'Alpha Hunters', authors.alpha, `stealth launch incoming on SOL 👀 ${SOL_ADDR_1}`, minutesAgo(40), {
    isHighlighted: true,
    hasContractAddress: true,
    contractAddresses: [SOL_ADDR_1],
    matchedKeywords: ['stealth'],
  }),
  msg('m-a7', CH_ALPHA_CALLS, GUILD_ALPHA, 'alpha-calls', 'Alpha Hunters', authors.sol, 'aping in, chart looks good', minutesAgo(38), {
    reactions: [
      { emoji: { id: null, name: '🔥' }, count: 5 },
      { emoji: { id: null, name: '🚀' }, count: 3 },
    ],
  }),
  msg('m-a8', CH_WHALE_WATCH, GUILD_ALPHA, 'whale-watch', 'Alpha Hunters', authors.eth, 'whale wallet just moved 500 ETH to a new address, watching closely', minutesAgo(32)),
  msg('m-a9', CH_ALPHA_CALLS, GUILD_ALPHA, 'alpha-calls', 'Alpha Hunters', authors.sarah, 'dev is based, they shipped on two previous projects', minutesAgo(28)),
  msg('m-a10', CH_ALPHA_CALLS, GUILD_ALPHA, 'alpha-calls', 'Alpha Hunters', authors.whale, 'just added more to my SOL bag, this one has legs', minutesAgo(22), {
    isHighlighted: true,
    reactions: [
      { emoji: { id: null, name: '💯' }, count: 8 },
    ],
  }),
  msg('m-a11', CH_WHALE_WATCH, GUILD_ALPHA, 'whale-watch', 'Alpha Hunters', authors.chart, '15m chart showing bullish divergence on the RSI, expecting a bounce here', minutesAgo(15)),
  msg('m-a12', CH_ALPHA_CALLS, GUILD_ALPHA, 'alpha-calls', 'Alpha Hunters', authors.mike, 'anyone have alpha on the next big airdrop?', minutesAgo(8), {
    matchedKeywords: ['airdrop'],
  }),
];

const degenMessages: FrontendMessage[] = [
  msg('m-d1', CH_GENERAL, GUILD_DEGEN, 'general', 'Degen Lounge', authors.mike, 'gm degens', minutesAgo(62)),
  msg('m-d2', CH_GENERAL, GUILD_DEGEN, 'general', 'Degen Lounge', authors.sol, 'gm! another day another 10x', minutesAgo(60)),
  msg('m-d3', CH_GENERAL, GUILD_DEGEN, 'general', 'Degen Lounge', authors.sarah, "just woke up to a 5x on last night's play, love this market", minutesAgo(55)),
  msg('m-d4', CH_TOKEN_DROPS, GUILD_DEGEN, 'token-drops', 'Degen Lounge', authors.eth, `new memecoin on Base, degen play: ${EVM_ADDR_2}`, minutesAgo(50), {
    hasContractAddress: true,
    contractAddresses: [EVM_ADDR_2],
  }),
  msg('m-d5', CH_GENERAL, GUILD_DEGEN, 'general', 'Degen Lounge', authors.mike, 'lol this is either going to 100x or rug, no in between', minutesAgo(45), {
    matchedKeywords: ['100x'],
    reactions: [
      { emoji: { id: null, name: '😂' }, count: 12 },
      { emoji: { id: null, name: '💀' }, count: 4 },
    ],
  }),
  msg('m-d6', CH_GENERAL, GUILD_DEGEN, 'general', 'Degen Lounge', authors.chart, 'risk management is key, only ape what you can lose', minutesAgo(42)),
  msg('m-d7', CH_TOKEN_DROPS, GUILD_DEGEN, 'token-drops', 'Degen Lounge', authors.sol, `hot SOL drop just went live: ${SOL_ADDR_2}`, minutesAgo(35), {
    hasContractAddress: true,
    contractAddresses: [SOL_ADDR_2],
  }),
  msg('m-d8', CH_GENERAL, GUILD_DEGEN, 'general', 'Degen Lounge', authors.sarah, 'the market is heating up, feels like early 2021 vibes', minutesAgo(25)),
  msg('m-d9', CH_GENERAL, GUILD_DEGEN, 'general', 'Degen Lounge', authors.mike, "anyone know when the big airdrop drops? I've been farming for weeks", minutesAgo(18), {
    matchedKeywords: ['airdrop'],
    mentions: { [USER_SARAH]: 'Crypto Sarah' },
  }),
  msg('m-d10', CH_TOKEN_DROPS, GUILD_DEGEN, 'token-drops', 'Degen Lounge', authors.eth, 'new listings on the DEX screener, keep your eyes peeled', minutesAgo(10)),
];

const nftMessages: FrontendMessage[] = [
  msg('m-n1', CH_NFT_ALERTS, GUILD_NFT, 'nft-alerts', 'NFT Collective', authors.nft, 'new PFP collection just minted out in 5 minutes, crazy demand', minutesAgo(70), {
    isHighlighted: true,
  }),
  msg('m-n2', CH_FLOOR_WATCH, GUILD_NFT, 'floor-watch', 'NFT Collective', authors.sarah, 'floor on CryptoPunks just hit 55 ETH, steady climb', minutesAgo(60)),
  msg('m-n3', CH_NFT_ALERTS, GUILD_NFT, 'nft-alerts', 'NFT Collective', authors.nft, 'keep an eye on this upcoming drop, art looks insane', minutesAgo(52), {
    isHighlighted: true,
    embeds: [{
      title: 'Chromatic Worlds — Mint Live',
      description: 'A generative art collection exploring color theory through algorithmic landscapes. 3,333 unique pieces.',
      url: 'https://example.com/chromatic-worlds',
      color: 0x9b59b6,
      footer: { text: 'Mint Price: 0.08 ETH' },
    }],
  }),
  msg('m-n4', CH_FLOOR_WATCH, GUILD_NFT, 'floor-watch', 'NFT Collective', authors.eth, 'BAYC floor holding strong at 28 ETH, no panic selling', minutesAgo(45)),
  msg('m-n5', CH_NFT_ALERTS, GUILD_NFT, 'nft-alerts', 'NFT Collective', authors.mike, 'the art market on-chain is exploding rn, so many good projects', minutesAgo(38)),
  msg('m-n6', CH_FLOOR_WATCH, GUILD_NFT, 'floor-watch', 'NFT Collective', authors.chart, 'floor tracker update:\n- Pudgy Penguins: 11.2 ETH (+5%)\n- Azuki: 6.8 ETH (+2%)\n- Milady: 4.1 ETH (-1%)', minutesAgo(30)),
  msg('m-n7', CH_NFT_ALERTS, GUILD_NFT, 'nft-alerts', 'NFT Collective', authors.nft, 'just sniped a rare trait below floor, these analytics tools are a game changer', minutesAgo(20), {
    isHighlighted: true,
    reactions: [
      { emoji: { id: null, name: '🎯' }, count: 6 },
    ],
  }),
  msg('m-n8', CH_FLOOR_WATCH, GUILD_NFT, 'floor-watch', 'NFT Collective', authors.sarah, 'volume on Blur is up 40% today, big players are accumulating', minutesAgo(12)),
];

const whaleMessages: FrontendMessage[] = [
  msg('m-w1', CH_WHALE_WATCH, GUILD_ALPHA, 'whale-watch', 'Alpha Hunters', authors.chart, 'tracking whale wallet 0x7a...3f, just loaded up on 3 new tokens', minutesAgo(55)),
  msg('m-w2', CH_TOKEN_DROPS, GUILD_DEGEN, 'token-drops', 'Degen Lounge', authors.eth, `fresh contract just went live: ${EVM_ADDR_2}`, minutesAgo(50), {
    hasContractAddress: true,
    contractAddresses: [EVM_ADDR_2],
  }),
  msg('m-w3', CH_WHALE_WATCH, GUILD_ALPHA, 'whale-watch', 'Alpha Hunters', authors.whale, `whale alert: massive buy on ${SOL_ADDR_1} — 250 SOL in one tx`, minutesAgo(42), {
    isHighlighted: true,
    hasContractAddress: true,
    contractAddresses: [SOL_ADDR_1],
    reactions: [
      { emoji: { id: null, name: '🐋' }, count: 15 },
      { emoji: { id: null, name: '🚀' }, count: 9 },
    ],
  }),
  msg('m-w4', CH_TOKEN_DROPS, GUILD_DEGEN, 'token-drops', 'Degen Lounge', authors.sol, 'following that whale, in for 10 SOL', minutesAgo(40)),
  msg('m-w5', CH_WHALE_WATCH, GUILD_ALPHA, 'whale-watch', 'Alpha Hunters', authors.whale, 'another large wallet accumulated, this token is getting serious attention', minutesAgo(30), {
    isHighlighted: true,
  }),
  msg('m-w6', CH_TOKEN_DROPS, GUILD_DEGEN, 'token-drops', 'Degen Lounge', authors.mike, 'the whale tracking rooms in trenchcord are so useful ngl', minutesAgo(20), {
    reactions: [
      { emoji: { id: null, name: '💯' }, count: 3 },
    ],
  }),
  msg('m-w7', CH_WHALE_WATCH, GUILD_ALPHA, 'whale-watch', 'Alpha Hunters', authors.chart, 'whale just sold 20% of their bag, taking profits. 4h chart still bullish though', minutesAgo(12)),
];

const dmMessages: FrontendMessage[] = [
  msg('m-dm1', 'dm-channel-001', null, 'DM', null, authors.alpha, 'hey, check this token before it goes public', minutesAgo(30)),
  msg('m-dm2', 'dm-channel-001', null, 'DM', null, authors.alpha, `CA: ${SOL_ADDR_1}`, minutesAgo(29), {
    hasContractAddress: true,
    contractAddresses: [SOL_ADDR_1],
  }),
  msg('m-dm3', 'dm-channel-001', null, 'DM', null, authors.alpha, 'dev is doxxed, team looks solid. NFA but I am in heavy', minutesAgo(28)),
];

export const DEMO_MESSAGES: Record<string, FrontendMessage[]> = {
  [ROOM_ALPHA]: alphaMessages,
  [ROOM_DEGEN]: degenMessages,
  [ROOM_NFT]: nftMessages,
  [ROOM_WHALE]: whaleMessages,
  ['dm:dm-channel-001']: dmMessages,
};

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export const DEMO_CONTRACTS: ContractEntry[] = [
  {
    address: EVM_ADDR_1,
    chain: 'evm',
    evmChain: 'eth',
    authorId: USER_WHALE,
    authorName: 'WhaleTracker',
    channelId: CH_ALPHA_CALLS,
    channelName: 'alpha-calls',
    guildId: GUILD_ALPHA,
    guildName: 'Alpha Hunters',
    roomIds: [ROOM_ALPHA],
    messageId: 'm-a3',
    timestamp: minutesAgo(48),
    firstSeen: true,
  },
  {
    address: SOL_ADDR_1,
    chain: 'sol',
    authorId: USER_ALPHA,
    authorName: 'Alpha Leaker',
    channelId: CH_ALPHA_CALLS,
    channelName: 'alpha-calls',
    guildId: GUILD_ALPHA,
    guildName: 'Alpha Hunters',
    roomIds: [ROOM_ALPHA],
    messageId: 'm-a6',
    timestamp: minutesAgo(40),
    firstSeen: true,
  },
  {
    address: EVM_ADDR_2,
    chain: 'evm',
    evmChain: 'base',
    authorId: USER_ETH,
    authorName: 'ETH Bull',
    channelId: CH_TOKEN_DROPS,
    channelName: 'token-drops',
    guildId: GUILD_DEGEN,
    guildName: 'Degen Lounge',
    roomIds: [ROOM_DEGEN, ROOM_WHALE],
    messageId: 'm-d4',
    timestamp: minutesAgo(50),
    firstSeen: true,
  },
  {
    address: SOL_ADDR_2,
    chain: 'sol',
    authorId: USER_SOL,
    authorName: 'Sol Maxi',
    channelId: CH_TOKEN_DROPS,
    channelName: 'token-drops',
    guildId: GUILD_DEGEN,
    guildName: 'Degen Lounge',
    roomIds: [ROOM_DEGEN],
    messageId: 'm-d7',
    timestamp: minutesAgo(35),
    firstSeen: true,
  },
  {
    address: SOL_ADDR_1,
    chain: 'sol',
    authorId: USER_WHALE,
    authorName: 'WhaleTracker',
    channelId: CH_WHALE_WATCH,
    channelName: 'whale-watch',
    guildId: GUILD_ALPHA,
    guildName: 'Alpha Hunters',
    roomIds: [ROOM_WHALE],
    messageId: 'm-w3',
    timestamp: minutesAgo(42),
    firstSeen: false,
  },
];

// ---------------------------------------------------------------------------
// Streaming message pool (for simulated real-time feed)
// ---------------------------------------------------------------------------

export const STREAM_POOL: Array<{
  channelId: string;
  guildId: string;
  channelName: string;
  guildName: string;
  author: FrontendMessage['author'];
  content: string;
  roomIds: string[];
  overrides?: Partial<FrontendMessage>;
}> = [
  { channelId: CH_ALPHA_CALLS, guildId: GUILD_ALPHA, channelName: 'alpha-calls', guildName: 'Alpha Hunters', author: authors.mike, content: 'volume just spiked on the 5m, something is brewing', roomIds: [ROOM_ALPHA] },
  { channelId: CH_GENERAL, guildId: GUILD_DEGEN, channelName: 'general', guildName: 'Degen Lounge', author: authors.sol, content: 'lol just saw someone ape 100 SOL into a 2 minute old token', roomIds: [ROOM_DEGEN] },
  { channelId: CH_WHALE_WATCH, guildId: GUILD_ALPHA, channelName: 'whale-watch', guildName: 'Alpha Hunters', author: authors.chart, content: 'another whale wallet just moved 1M USDC to a DEX, big swap incoming', roomIds: [ROOM_ALPHA, ROOM_WHALE] },
  { channelId: CH_NFT_ALERTS, guildId: GUILD_NFT, channelName: 'nft-alerts', guildName: 'NFT Collective', author: authors.nft, content: 'rare trait just listed 30% below floor, sniping it', roomIds: [ROOM_NFT], overrides: { isHighlighted: true } },
  { channelId: CH_TOKEN_DROPS, guildId: GUILD_DEGEN, channelName: 'token-drops', guildName: 'Degen Lounge', author: authors.eth, content: 'new verified contract on etherscan, dev renounced ownership', roomIds: [ROOM_DEGEN, ROOM_WHALE] },
  { channelId: CH_ALPHA_CALLS, guildId: GUILD_ALPHA, channelName: 'alpha-calls', guildName: 'Alpha Hunters', author: authors.sarah, content: 'the narrative is shifting to AI tokens again, watch for rotations', roomIds: [ROOM_ALPHA] },
  { channelId: CH_GENERAL, guildId: GUILD_DEGEN, channelName: 'general', guildName: 'Degen Lounge', author: authors.mike, content: 'anyone else farming that airdrop on the L2? deadline is tomorrow', roomIds: [ROOM_DEGEN], overrides: { matchedKeywords: ['airdrop'] } },
  { channelId: CH_FLOOR_WATCH, guildId: GUILD_NFT, channelName: 'floor-watch', guildName: 'NFT Collective', author: authors.sarah, content: 'floor on that new collection just 2x since mint, holders are strong', roomIds: [ROOM_NFT] },
  { channelId: CH_WHALE_WATCH, guildId: GUILD_ALPHA, channelName: 'whale-watch', guildName: 'Alpha Hunters', author: authors.whale, content: 'big accumulation happening right now, not selling any of my positions', roomIds: [ROOM_ALPHA, ROOM_WHALE], overrides: { isHighlighted: true } },
  { channelId: CH_TOKEN_DROPS, guildId: GUILD_DEGEN, channelName: 'token-drops', guildName: 'Degen Lounge', author: authors.sol, content: 'another meme coin launch on Pump.fun, careful with these', roomIds: [ROOM_DEGEN, ROOM_WHALE] },
  { channelId: CH_ALPHA_CALLS, guildId: GUILD_ALPHA, channelName: 'alpha-calls', guildName: 'Alpha Hunters', author: authors.alpha, content: 'trust the process, we are still early', roomIds: [ROOM_ALPHA], overrides: { isHighlighted: true, reactions: [{ emoji: { id: null, name: '🫡' }, count: 4 }] } },
  { channelId: CH_GENERAL, guildId: GUILD_DEGEN, channelName: 'general', guildName: 'Degen Lounge', author: authors.chart, content: 'BTC dominance dropping, altseason signal is flashing', roomIds: [ROOM_DEGEN] },
  { channelId: CH_NFT_ALERTS, guildId: GUILD_NFT, channelName: 'nft-alerts', guildName: 'NFT Collective', author: authors.mike, content: 'the generative art space is producing some incredible work lately', roomIds: [ROOM_NFT] },
  { channelId: CH_ALPHA_CALLS, guildId: GUILD_ALPHA, channelName: 'alpha-calls', guildName: 'Alpha Hunters', author: authors.eth, content: 'gas fees on ETH are stupidly low right now, perfect time to move', roomIds: [ROOM_ALPHA] },
  { channelId: CH_FLOOR_WATCH, guildId: GUILD_NFT, channelName: 'floor-watch', guildName: 'NFT Collective', author: authors.chart, content: 'weekly volume on OpenSea just broke previous ATH, bullish signal', roomIds: [ROOM_NFT] },
  { channelId: CH_WHALE_WATCH, guildId: GUILD_ALPHA, channelName: 'whale-watch', guildName: 'Alpha Hunters', author: authors.chart, content: 'smart money is rotating from L1s into infra plays, follow the flow', roomIds: [ROOM_ALPHA, ROOM_WHALE] },
  { channelId: CH_GENERAL, guildId: GUILD_DEGEN, channelName: 'general', guildName: 'Degen Lounge', author: authors.sol, content: 'just hit my profit target, taking some off the table 📈', roomIds: [ROOM_DEGEN], overrides: { reactions: [{ emoji: { id: null, name: '👏' }, count: 7 }] } },
  { channelId: CH_TOKEN_DROPS, guildId: GUILD_DEGEN, channelName: 'token-drops', guildName: 'Degen Lounge', author: authors.mike, content: 'stealth launch just went live, no pre-sale, fair launch only', roomIds: [ROOM_DEGEN, ROOM_WHALE] },
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
      entry.overrides,
    ),
    roomIds: entry.roomIds,
  };
}
