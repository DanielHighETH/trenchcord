import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import type { SolPlatform, EvmPlatform, ContractClickAction, BadgeClickAction, NotificationClickAction, KeywordPattern, KeywordMatchMode, SoundSettings, SoundType, SoundConfig, PushoverPriority, PushoverSound, PushoverTriggers, PushoverFilters, MessageDisplay, SplitLayout, SlotsharkRegion, TradingWallet, TradeButtonSize, BuySitePlatform, WalletAmountMode, SnipingConfig, FeedHotkeys } from '../types';
import { PUSHOVER_SOUNDS } from '../types';
import { Key, Search, Plus, Trash2, Eye, EyeOff, Volume2, Upload, Play, Users, Shield, Tag, Zap, Settings2, ArrowLeft, HelpCircle, Bell, BellRing, PanelLeftOpen, Send, Download, DatabaseBackup, AlertTriangle, AtSign, CandlestickChart, Check, BadgeCheck, ExternalLink, Loader2, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, X, MessagesSquare } from 'lucide-react';
import { requestNotificationPermission } from '../utils/desktopNotification';
import { previewSound, previewPreset, PRESET_SOUNDS } from '../utils/notificationSound';
import ColorPickerWithAlpha, { colorWithExtraAlpha } from './ColorPickerWithAlpha';
import TelegramSetup from './TelegramSetup';
import AccountPanel from './AccountPanel';
import { isHostedMode, getAccessToken } from '../lib/supabase';
import { isIOSApp, isCompactLayout, useCompactLayout } from '../utils/platform';
import { backupTelegramSessionCount } from '../utils/backup';
import { requestInstantDrawerOpen } from '../utils/drawer';

type Section = 'tokens' | 'account' | 'general' | 'contracts' | 'trading' | 'sounds' | 'pushover' | 'keywords' | 'mentions' | 'dms' | 'users' | 'guilds' | 'backup' | 'help';

const ALL_SECTIONS: { id: Section; label: string; icon: typeof Key }[] = [
  { id: 'tokens', label: 'Tokens', icon: Key },
  { id: 'account', label: 'Account & Subscription', icon: BadgeCheck },
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'contracts', label: 'Contracts', icon: Zap },
  { id: 'trading', label: 'Trading', icon: CandlestickChart },
  { id: 'sounds', label: 'Sounds & Notifications', icon: Volume2 },
  { id: 'pushover', label: 'Pushover', icon: Bell },
  { id: 'keywords', label: 'Keywords', icon: Tag },
  { id: 'mentions', label: 'Mentions', icon: AtSign },
  { id: 'dms', label: 'Direct Messages', icon: MessagesSquare },
  { id: 'users', label: 'Highlighted Users', icon: Users },
  { id: 'guilds', label: 'Guilds', icon: Shield },
  { id: 'backup', label: 'Backup & Restore', icon: DatabaseBackup },
  { id: 'help', label: 'Help & Features', icon: HelpCircle },
];

const SECTIONS = ALL_SECTIONS;

const SECTION_META = new Map(ALL_SECTIONS.map((s) => [s.id, s]));

/** Boolean settings the search results can flip in place. Keys are wired to
    their local draft state inside the component, so a completeness error here
    is a compile error there. */
type SearchToggleKey =
  | 'roleColors' | 'serverIconBadge' | 'showEphemeralMessages' | 'contractDetection' | 'openInDiscordApp' | 'openInTelegramApp'
  | 'chattingEnabled' | 'dmReadSyncEnabled' | 'autoUpdate' | 'mobileRoomBar' | 'telegramDmsInAllDms'
  | 'showFullContractAddress' | 'autoOpenHighlightedContracts'
  | 'tradingEnabled' | 'snipingEnabled' | 'tradingAntimev' | 'tradingShowContractPill'
  | 'tradingOpenSiteOnBuy' | 'tradingRequireDoubleClick'
  | 'desktopNotifications' | 'messageSounds' | 'pushoverEnabled' | 'keywordAlertsEnabled'
  | 'mentionsUser' | 'mentionsRole' | 'mentionsHere' | 'mentionsEveryone' | 'mentionsBots';

type SettingSearchCtx = {
  compact: boolean;
  ios: boolean;
  hosted: boolean;
  focusShortcut: boolean;
  autoUpdate: boolean;
};

type SettingSearchEntry = {
  section: Section;
  /** Name shown in results. Doubles as the scroll target unless `anchor` is set. */
  label: string;
  /** On-screen h3/h4 heading to scroll to when it differs from `label`. */
  anchor?: string;
  /** Extra search terms beyond the label and section name. */
  keywords?: string;
  /** Boolean settings get a switch right in the result row. */
  toggle?: SearchToggleKey;
  /** Hide entries whose setting isn't rendered on this platform/mode. */
  when?: (ctx: SettingSearchCtx) => boolean;
};

// Searchable map of every setting. `label`/`anchor` must match the heading
// text rendered below — that's how a result scrolls to its card — so renaming
// a heading means updating its entry here.
const SETTINGS_INDEX: SettingSearchEntry[] = [
  // Tokens
  { section: 'tokens', label: 'Discord Tokens', keywords: 'account token auth add remove login' },
  { section: 'tokens', label: 'Connection', keywords: 'proxy http https vpn network', when: (c) => !c.hosted && !c.ios },
  { section: 'tokens', label: 'Telegram', keywords: 'account connect login phone number session' },
  // Account
  { section: 'account', label: 'Account & Subscription', keywords: 'cloud link device pairing premium plan renew manage' },
  // General
  { section: 'general', label: 'Message Display', keywords: 'cozy compact density avatars chat view' },
  { section: 'general', label: 'Split Screen Layout', keywords: 'panes grid row multi pane', when: (c) => !c.ios },
  { section: 'general', label: 'Role Colors', keywords: 'username discord colored names', toggle: 'roleColors' },
  { section: 'general', label: 'Source Badge', keywords: 'server icon channel name message badge', toggle: 'serverIconBadge' },
  { section: 'general', label: 'Ephemeral Messages', keywords: 'only you can see this bot reply hidden private temporary too old to delete', toggle: 'showEphemeralMessages' },
  { section: 'general', label: 'Feed Hotkeys', keywords: 'keyboard shortcut key jump contract mentions keywords snipes alerts dms', when: (c) => !c.compact },
  { section: 'general', label: 'Bring Trenchcord To Front', keywords: 'global shortcut hotkey focus window foreground', when: (c) => c.focusShortcut && !c.compact },
  { section: 'general', label: 'Automatic Updates', keywords: 'auto update download install windows github releases', toggle: 'autoUpdate', when: (c) => c.autoUpdate },
  { section: 'general', label: 'Mobile Zoom Scale', keywords: 'zoom size scale phone bigger smaller', when: (c) => !c.ios },
  { section: 'general', label: 'Bottom Room Bar', keywords: 'room switcher quick bar iphone', toggle: 'mobileRoomBar', when: (c) => c.ios },
  { section: 'general', label: 'Contract Detection', keywords: 'detect sol evm address messages ca', toggle: 'contractDetection' },
  { section: 'general', label: 'Open in Discord App', keywords: 'deeplink jump channel badge click', toggle: 'openInDiscordApp' },
  { section: 'general', label: 'Open in Telegram App', keywords: 'deeplink jump tg channel badge click', toggle: 'openInTelegramApp' },
  { section: 'general', label: 'Badge Click Action', keywords: 'keyword contract badge click discord platform both' },
  { section: 'general', label: 'Notification Click', keywords: 'toast click open trenchcord discord telegram' },
  { section: 'general', label: 'Chat / Send Messages', keywords: 'send messages typing reply input write', toggle: 'chattingEnabled' },
  { section: 'general', label: 'DM Read Sync', keywords: 'mark read discord unread badge ack sync dms seen', toggle: 'dmReadSyncEnabled' },
  // Contracts
  { section: 'contracts', label: 'Contract Click Action', keywords: 'copy open address click clipboard' },
  { section: 'contracts', label: 'Display Full Contract Address', keywords: 'shortened full address show', toggle: 'showFullContractAddress' },
  { section: 'contracts', label: 'Trading Platform', keywords: 'axiom padre bloom gmgn fomo custom sol evm chart links open' },
  { section: 'contracts', label: 'Auto-Open Highlighted Contracts', keywords: 'automatically open tab highlighted user posts contract', toggle: 'autoOpenHighlightedContracts' },
  { section: 'contracts', label: 'Address Colors', keywords: 'evm sol color highlight contract' },
  // Trading (hidden in hosted mode, where the whole section is unavailable)
  { section: 'trading', label: 'Enable Trading', keywords: 'buy buttons slotshark solana swap', toggle: 'tradingEnabled', when: (c) => !c.hosted },
  { section: 'trading', label: 'Enable Sniping', keywords: 'snipe auto buy configs', toggle: 'snipingEnabled', when: (c) => !c.hosted },
  { section: 'trading', label: 'API Token', keywords: 'slotshark key token save', when: (c) => !c.hosted },
  { section: 'trading', label: 'Server Region', keywords: 'us eu latency slotshark', when: (c) => !c.hosted },
  { section: 'trading', label: 'Wallets', keywords: 'wallet public key solana add multi', when: (c) => !c.hosted },
  { section: 'trading', label: 'Buy Amounts (SOL)', keywords: 'preset amounts buttons sol quick', when: (c) => !c.hosted },
  { section: 'trading', label: 'Execution', keywords: 'slippage tip priority fee auto', when: (c) => !c.hosted },
  { section: 'trading', label: 'Anti-MEV Protection', anchor: 'Execution', keywords: 'mev sandwich protection', toggle: 'tradingAntimev', when: (c) => !c.hosted },
  { section: 'trading', label: 'Button Appearance', keywords: 'size color background text buy buttons preview', when: (c) => !c.hosted },
  { section: 'trading', label: 'Contract Pill on Buy Row', anchor: 'Button Appearance', keywords: 'show address pill buy row', toggle: 'tradingShowContractPill', when: (c) => !c.hosted },
  { section: 'trading', label: 'Open Chart on Buy', keywords: 'site chart open buy trading', toggle: 'tradingOpenSiteOnBuy', when: (c) => !c.hosted },
  { section: 'trading', label: 'Misclick Protection', keywords: 'double click confirm arm buy accidental', toggle: 'tradingRequireDoubleClick', when: (c) => !c.hosted },
  // Sounds & Notifications
  { section: 'sounds', label: 'Desktop Notifications', keywords: 'browser notification permission popup', toggle: 'desktopNotifications' },
  { section: 'sounds', label: 'Sound Settings', keywords: 'notification sounds master volume highlight contract keyword premium custom preset upload', toggle: 'messageSounds' },
  { section: 'sounds', label: 'Channel Sounds', keywords: 'per channel sound every message volume' },
  // Pushover
  { section: 'pushover', label: 'Enable Pushover', anchor: 'Pushover', keywords: 'push phone notifications mobile', toggle: 'pushoverEnabled' },
  { section: 'pushover', label: 'Credentials', anchor: 'Credentials', keywords: 'pushover api token user key app' },
  { section: 'pushover', label: 'Triggers', keywords: 'pushover events highlighted user contract keyword' },
  { section: 'pushover', label: 'Filters', keywords: 'pushover user guild channel filter narrow' },
  { section: 'pushover', label: 'Notification Settings', keywords: 'pushover priority sound emergency quiet hours' },
  // Keywords
  { section: 'keywords', label: 'Keyword Alerts', keywords: 'enable regex pattern matching alerts', toggle: 'keywordAlertsEnabled' },
  { section: 'keywords', label: 'Global Keyword Patterns', keywords: 'regex pattern contains exact match add label' },
  // Mentions
  { section: 'mentions', label: 'User Mentions', anchor: 'Mentions', keywords: 'mention ping direct @', toggle: 'mentionsUser' },
  { section: 'mentions', label: 'Role Mentions', anchor: 'Mentions', keywords: 'mention ping role @', toggle: 'mentionsRole' },
  { section: 'mentions', label: '@here Mentions', anchor: 'Mentions', keywords: 'mention ping here channel', toggle: 'mentionsHere' },
  { section: 'mentions', label: '@everyone Mentions', anchor: 'Mentions', keywords: 'mention ping everyone channel', toggle: 'mentionsEveryone' },
  { section: 'mentions', label: 'Mentions from Bots', anchor: 'Mentions', keywords: 'mention ping bot rick reply respond', toggle: 'mentionsBots' },

  { section: 'dms', label: 'Discord Excluded Users', keywords: 'dm direct message exclude user skip hide feed bot spam' },
  { section: 'dms', label: 'Telegram DMs', keywords: 'telegram tg dm include all dms feed collect', toggle: 'telegramDmsInAllDms' },
  { section: 'dms', label: 'Telegram Excluded Users', keywords: 'telegram tg dm direct message exclude user skip hide feed bot spam' },
  { section: 'dms', label: 'Hidden Conversations (Discord)', keywords: 'dm direct message hide conversation sidebar exclude user bot spam remove' },
  { section: 'dms', label: 'Hidden Conversations (Telegram)', keywords: 'telegram tg dm direct message hide conversation sidebar exclude user bot spam remove' },
  // Highlighted users
  { section: 'users', label: 'Global Highlighted Users', keywords: 'highlight user id telegram username track alert' },
  { section: 'users', label: 'Custom Renames', keywords: 'rename user custom name nickname' },
  // Guilds
  { section: 'guilds', label: 'Enabled Guilds', keywords: 'server enable disable guild list' },
  { section: 'guilds', label: 'Guild Message Colors', keywords: 'server background color message' },
  { section: 'guilds', label: 'DM Message Colors', keywords: 'direct message background color' },
  { section: 'guilds', label: 'Telegram Chat Colors', keywords: 'telegram background color chat' },
  // Backup
  { section: 'backup', label: 'Backup & Restore', keywords: 'export import settings backup restore json file' },
];

const EMPTY_SNIPING: SnipingConfig = { enabled: false, configs: [] };

// Slotshark wallet pubkeys and token mints are base58, 32-44 chars.
const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TRADING_PRESET_SLOTS = 5;
const DEFAULT_TRADE_BG = '#383a40';
const DEFAULT_TRADE_FG = '#dbdee1';
// Mirrors SIZE_STYLES in TradeButtons.tsx so the settings preview matches what
// actually renders under a message.
const TRADE_PREVIEW_SIZES: Record<TradeButtonSize, { button: string; pill: string; unit: string }> = {
  sm: { button: 'px-1.5 py-0.5 text-[10px]', pill: 'text-[10px] px-1', unit: 'text-[9px]' },
  md: { button: 'px-2 py-0.5 text-[11px]', pill: 'text-[11px] px-1', unit: 'text-[10px]' },
  lg: { button: 'px-3 py-1.5 text-sm', pill: 'text-xs px-1.5', unit: 'text-[11px]' },
};

/** Pad the stored amounts out to five editable slots. */
function presetsToInputs(amounts: number[] | undefined): string[] {
  const filled = (amounts ?? []).map((a) => String(a));
  while (filled.length < TRADING_PRESET_SLOTS) filled.push('');
  return filled.slice(0, TRADING_PRESET_SLOTS);
}

/** Trim float noise from a divided amount without padding whole numbers. */
function roundSol(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Drop blanks and non-positive entries; the button row renders what's left. */
function inputsToPresets(inputs: string[]): number[] {
  return inputs
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, TRADING_PRESET_SLOTS);
}

export default function GlobalSettings() {
  const config = useAppStore((s) => s.config);
  const updateConfig = useAppStore((s) => s.updateConfig);
  const guilds = useAppStore((s) => s.guilds);
  const rooms = useAppStore((s) => s.rooms);
  const dmChannels = useAppStore((s) => s.dmChannels);
  const fetchGuilds = useAppStore((s) => s.fetchGuilds);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const rehydrateLayout = useAppStore((s) => s.rehydrateLayout);
  const maskedTokens = useAppStore((s) => s.maskedTokens);
  const fetchMaskedTokens = useAppStore((s) => s.fetchMaskedTokens);
  const addToken = useAppStore((s) => s.addToken);
  const removeToken = useAppStore((s) => s.removeToken);
  const allMessages = useAppStore((s) => s.messages);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const settingsSection = useAppStore((s) => s.settingsSection);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const authStatus = useAppStore((s) => s.authStatus);
  const telegramDisconnect = useAppStore((s) => s.telegramDisconnect);
  const telegramAccounts = useAppStore((s) => s.telegramAccounts);
  const fetchTelegramAccounts = useAppStore((s) => s.fetchTelegramAccounts);
  const telegramRemoveAccount = useAppStore((s) => s.telegramRemoveAccount);
  const fetchRooms = useAppStore((s) => s.fetchRooms);
  const tradingStatus = useAppStore((s) => s.tradingStatus);
  const fetchTradingStatus = useAppStore((s) => s.fetchTradingStatus);
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const fetchSubscriptionStatus = useAppStore((s) => s.fetchSubscriptionStatus);
  const startCloudLink = useAppStore((s) => s.startCloudLink);
  const fetchCloudLinkStatus = useAppStore((s) => s.fetchCloudLinkStatus);
  const refreshCloudSubscription = useAppStore((s) => s.refreshCloudSubscription);
  const unlinkCloud = useAppStore((s) => s.unlinkCloud);
  const saveSlotsharkToken = useAppStore((s) => s.saveSlotsharkToken);
  const removeSlotsharkToken = useAppStore((s) => s.removeSlotsharkToken);
  const renameUser = useAppStore((s) => s.renameUser);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (config?.userNameCache) {
      for (const [id, name] of Object.entries(config.userNameCache)) {
        map.set(id, name);
      }
    }
    for (const msgs of Object.values(allMessages)) {
      for (const msg of msgs) {
        map.set(msg.author.id, msg.author.displayName);
      }
    }
    return map;
  }, [allMessages, config?.userNameCache]);

  const [section, setSection] = useState<Section>((settingsSection as Section) || 'tokens');
  const compact = useCompactLayout();
  // Phone navigation is a two-level drill-down like the iOS Settings app: a
  // root list of sections, then the section as its own page with a back
  // button. Targeted navigation ("Go to Settings → Tokens" links) skips the
  // root. Desktop keeps the persistent sidebar nav.
  const [mobileRoot, setMobileRoot] = useState(() => isCompactLayout() && !settingsSection);
  const [cloudPairing, setCloudPairing] = useState<{ code: string; approveUrl?: string } | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // --- Settings search ---
  const [settingsSearch, setSettingsSearch] = useState('');
  // Heading text a clicked result should scroll to once its section renders.
  const [pendingSettingAnchor, setPendingSettingAnchor] = useState<string | null>(null);
  const settingsContentRef = useRef<HTMLDivElement>(null);

  // Account section: keep status fresh, and poll while a pairing code is
  // outstanding so the card flips to "linked" the moment it's approved.
  useEffect(() => {
    if (section !== 'account') return;
    fetchSubscriptionStatus();
    if (!cloudPairing) return;
    const timer = setInterval(() => {
      fetchCloudLinkStatus().then((state) => {
        if (state && state.state !== 'pending') {
          setCloudPairing(null);
          if (state.state === 'idle' && state.error) setCloudError(state.error);
        }
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [section, cloudPairing, fetchSubscriptionStatus, fetchCloudLinkStatus]);
  const [globalUsers, setGlobalUsers] = useState<string[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [dmExcludedUsers, setDmExcludedUsers] = useState<string[]>([]);
  const [newDmExcludedUser, setNewDmExcludedUser] = useState('');
  const [telegramDmsInAllDms, setTelegramDmsInAllDms] = useState(true);
  const [tgDmExcludedUsers, setTgDmExcludedUsers] = useState<string[]>([]);
  const [newTgDmExcludedUser, setNewTgDmExcludedUser] = useState('');
  const [dmHiddenConversations, setDmHiddenConversations] = useState<string[]>([]);
  const [newDmHiddenConversation, setNewDmHiddenConversation] = useState('');
  const [tgDmHiddenConversations, setTgDmHiddenConversations] = useState<string[]>([]);
  const [newTgDmHiddenConversation, setNewTgDmHiddenConversation] = useState('');
  const [contractDetection, setContractDetection] = useState(true);
  const [guildColors, setGuildColors] = useState<Record<string, string>>({});
  const [dmColors, setDmColors] = useState<Record<string, string>>({});
  const [telegramColors, setTelegramColors] = useState<Record<string, string>>({});
  const [enabledGuilds, setEnabledGuilds] = useState<string[]>([]);
  const [guildSearch, setGuildSearch] = useState('');
  const [evmAddressColor, setEvmAddressColor] = useState('#fee75c');
  const [solAddressColor, setSolAddressColor] = useState('#14f195');
  const [openInDiscordApp, setOpenInDiscordApp] = useState(true);
  const [openInTelegramApp, setOpenInTelegramApp] = useState(true);
  const [messageSounds, setMessageSounds] = useState(false);
  const defaultSoundConfig: SoundConfig = { enabled: true, volume: 80, useCustom: false };
  const [soundSettings, setSoundSettings] = useState<SoundSettings>({
    highlight: { ...defaultSoundConfig },
    contractAlert: { ...defaultSoundConfig },
    keywordAlert: { ...defaultSoundConfig },
    premiumAlert: { ...defaultSoundConfig },
  });
  const [channelSounds, setChannelSounds] = useState<Record<string, SoundConfig>>({});
  const [uploadingSoundType, setUploadingSoundType] = useState<SoundType | null>(null);
  const [uploadingChannelId, setUploadingChannelId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelFileInputRef = useRef<HTMLInputElement>(null);
  const [pushoverEnabled, setPushoverEnabled] = useState(false);
  const [pushoverAppToken, setPushoverAppToken] = useState('');
  const [pushoverUserKey, setPushoverUserKey] = useState('');
  const [pushoverPriority, setPushoverPriority] = useState<PushoverPriority>(1);
  const [pushoverSound, setPushoverSound] = useState<PushoverSound>('siren');
  const defaultTriggers: PushoverTriggers = { highlightedUser: false, highlightedUserContract: true, contract: false, keyword: false };
  const defaultFilters: PushoverFilters = { userIds: [], channelIds: [], guildIds: [] };
  const [pushoverTriggers, setPushoverTriggers] = useState<PushoverTriggers>({ ...defaultTriggers });
  const [pushoverFilters, setPushoverFilters] = useState<PushoverFilters>({ ...defaultFilters });
  const [appTokenHelpOpen, setAppTokenHelpOpen] = useState(false);
  const [solPlatform, setSolPlatform] = useState<SolPlatform>('axiom');
  const [evmPlatform, setEvmPlatform] = useState<EvmPlatform>('gmgn');
  const [customSolUrl, setCustomSolUrl] = useState('');
  const [customEvmUrl, setCustomEvmUrl] = useState('');
  const [contractClickAction, setContractClickAction] = useState<ContractClickAction>('copy_open');
  const [showFullContractAddress, setShowFullContractAddress] = useState(false);
  const [autoOpenHighlightedContracts, setAutoOpenHighlightedContracts] = useState(false);
  const [globalKeywordPatterns, setGlobalKeywordPatterns] = useState<KeywordPattern[]>([]);
  const [keywordAlertsEnabled, setKeywordAlertsEnabled] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(false);
  const [mentionsUserEnabled, setMentionsUserEnabled] = useState(true);
  const [mentionsRoleEnabled, setMentionsRoleEnabled] = useState(true);
  const [mentionsHereEnabled, setMentionsHereEnabled] = useState(false);
  const [mentionsEveryoneEnabled, setMentionsEveryoneEnabled] = useState(false);
  const [mentionsBotsEnabled, setMentionsBotsEnabled] = useState(true);
  const [badgeClickAction, setBadgeClickAction] = useState<BadgeClickAction>('discord');
  const [notificationClickAction, setNotificationClickAction] = useState<NotificationClickAction>('trenchcord');
  const [chattingEnabled, setChattingEnabled] = useState(false);
  const [dmReadSyncEnabled, setDmReadSyncEnabled] = useState(false);
  const [messageDisplay, setMessageDisplay] = useState<MessageDisplay>('default');
  const [compactModeAvatars, setCompactModeAvatars] = useState(true);
  const [compactModeNameOnce, setCompactModeNameOnce] = useState(false);
  const [roleColors, setRoleColors] = useState(true);
  const [mobileZoomScale, setMobileZoomScale] = useState(1);
  const [mobileRoomBar, setMobileRoomBar] = useState(true);
  // Separate desktop/phone keys so each platform keeps its own setting (both
  // default on); the UI shows the one for the current layout.
  const [serverIconBadge, setServerIconBadge] = useState(true);
  const [serverIconBadgeMobile, setServerIconBadgeMobile] = useState(true);
  const [showEphemeralMessages, setShowEphemeralMessages] = useState(true);
  const [feedHotkeys, setFeedHotkeys] = useState<FeedHotkeys>({});
  const [focusHotkey, setFocusHotkey] = useState<string | null>(null);
  // Desktop-app auto-update opt-in. Lives in the Electron main process (not the
  // backend config), so it's read/written over IPC and applies immediately —
  // no Save button involved. Hidden entirely unless the platform supports it.
  const [autoUpdateSupported, setAutoUpdateSupported] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [splitLayout, setSplitLayout] = useState<SplitLayout>('row');
  const [newKeywordPattern, setNewKeywordPattern] = useState('');
  const [newKeywordMatchMode, setNewKeywordMatchMode] = useState<KeywordMatchMode>('includes');
  const [newKeywordLabel, setNewKeywordLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [showNewToken, setShowNewToken] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [addingToken, setAddingToken] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxySaving, setProxySaving] = useState(false);
  const [proxySaved, setProxySaved] = useState(false);
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [telegramError, setTelegramError] = useState('');

  // --- Trading (Slotshark) ---
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [tradingRegion, setTradingRegion] = useState<SlotsharkRegion>('us');
  const [tradingWallets, setTradingWallets] = useState<TradingWallet[]>([]);
  const [tradingActiveWalletIds, setTradingActiveWalletIds] = useState<string[]>([]);
  const [tradingWalletAmountMode, setTradingWalletAmountMode] = useState<WalletAmountMode>('per_wallet');
  // Held as strings so typing "0." doesn't fight the input; parsed on save.
  const [tradingPresets, setTradingPresets] = useState<string[]>(['', '', '', '', '']);
  const [tradingSlippage, setTradingSlippage] = useState(20);
  const [tradingTip, setTradingTip] = useState<number | null>(null);
  const [tradingPriorityFee, setTradingPriorityFee] = useState<number | null>(null);
  const [tradingAntimev, setTradingAntimev] = useState(true);
  const [tradingRequireDoubleClick, setTradingRequireDoubleClick] = useState(false);
  const [tradingButtonSize, setTradingButtonSize] = useState<TradeButtonSize>('md');
  const [tradingButtonBgColor, setTradingButtonBgColor] = useState(DEFAULT_TRADE_BG);
  const [tradingButtonTextColor, setTradingButtonTextColor] = useState(DEFAULT_TRADE_FG);
  const [tradingShowContractPill, setTradingShowContractPill] = useState(true);
  const [tradingOpenSiteOnBuy, setTradingOpenSiteOnBuy] = useState(false);
  const [tradingBuySitePlatform, setTradingBuySitePlatform] = useState<BuySitePlatform>('default');
  const [tradingBuySiteUrl, setTradingBuySiteUrl] = useState('');
  const [slotsharkTokenInput, setSlotsharkTokenInput] = useState('');
  const [savingSlotsharkToken, setSavingSlotsharkToken] = useState(false);
  const [slotsharkTokenError, setSlotsharkTokenError] = useState('');
  const [slotsharkTokenSaved, setSlotsharkTokenSaved] = useState(false);
  const [newWalletLabel, setNewWalletLabel] = useState('');
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [walletError, setWalletError] = useState('');

  // --- Sniping ---
  // Only the global on/off switch lives here (under Trading); the configs
  // themselves are managed on the Snipes feed page.
  const [snipingEnabled, setSnipingEnabled] = useState(false);

  useEffect(() => {
    fetchGuilds();
    fetchDMChannels();
    fetchConfig();
    fetchMaskedTokens();
    fetchTelegramAccounts();
    fetchTradingStatus();
  }, [fetchGuilds, fetchDMChannels, fetchConfig, fetchMaskedTokens, fetchTelegramAccounts, fetchTradingStatus]);

  useEffect(() => {
    window.trenchcord?.getAutoUpdate?.().then(({ supported, enabled }) => {
      setAutoUpdateSupported(supported);
      setAutoUpdateEnabled(enabled);
    });
  }, []);

  useEffect(() => {
    if (config) {
      setGlobalUsers(config.globalHighlightedUsers);
      setDmExcludedUsers(config.dmExcludedUsers ?? []);
      setTelegramDmsInAllDms(config.telegramDmsInAllDms ?? true);
      setTgDmExcludedUsers(config.tgDmExcludedUsers ?? []);
      setDmHiddenConversations(config.dmHiddenConversations ?? []);
      setTgDmHiddenConversations(config.tgDmHiddenConversations ?? []);
      setContractDetection(config.contractDetection);
      setGuildColors(config.guildColors ?? {});
      setDmColors(config.dmColors ?? {});
      setTelegramColors(config.telegramColors ?? {});
      setEnabledGuilds(config.enabledGuilds ?? []);
      setEvmAddressColor(config.evmAddressColor ?? '#fee75c');
      setSolAddressColor(config.solAddressColor ?? '#14f195');
      setOpenInDiscordApp(config.openInDiscordApp ?? true);
      setOpenInTelegramApp(config.openInTelegramApp ?? true);
      setMessageSounds(config.messageSounds ?? false);
      if (config.soundSettings) {
        setSoundSettings({
          highlight: { ...defaultSoundConfig, ...config.soundSettings.highlight },
          contractAlert: { ...defaultSoundConfig, ...config.soundSettings.contractAlert },
          keywordAlert: { ...defaultSoundConfig, ...config.soundSettings.keywordAlert },
          premiumAlert: { ...defaultSoundConfig, ...config.soundSettings.premiumAlert },
        });
      }
      setChannelSounds(config.channelSounds ?? {});
      setPushoverEnabled(config.pushover?.enabled ?? false);
      setPushoverAppToken(config.pushover?.appToken ?? '');
      setPushoverUserKey(config.pushover?.userKey ?? '');
      setPushoverPriority(config.pushover?.priority ?? 1);
      setPushoverSound(config.pushover?.sound ?? 'siren');
      setPushoverTriggers(config.pushover?.triggers ?? { ...defaultTriggers });
      setPushoverFilters(config.pushover?.filters ?? { ...defaultFilters });
      setSolPlatform(config.contractLinkTemplates?.solPlatform ?? 'axiom');
      setEvmPlatform(config.contractLinkTemplates?.evmPlatform ?? 'gmgn');
      setCustomSolUrl(config.contractLinkTemplates?.sol ?? '');
      setCustomEvmUrl(config.contractLinkTemplates?.evm ?? '');
      setContractClickAction(config.contractClickAction ?? 'copy_open');
      setShowFullContractAddress(config.showFullContractAddress ?? false);
      setAutoOpenHighlightedContracts(config.autoOpenHighlightedContracts ?? false);
      setGlobalKeywordPatterns(config.globalKeywordPatterns ?? []);
      setKeywordAlertsEnabled(config.keywordAlertsEnabled ?? true);
      setDesktopNotifications(config.desktopNotifications ?? false);
      setMentionsUserEnabled(config.mentionsUserEnabled ?? true);
      setMentionsRoleEnabled(config.mentionsRoleEnabled ?? true);
      setMentionsHereEnabled(config.mentionsHereEnabled ?? false);
      setMentionsEveryoneEnabled(config.mentionsEveryoneEnabled ?? false);
      setMentionsBotsEnabled(config.mentionsBotsEnabled ?? true);
      setBadgeClickAction(config.badgeClickAction ?? 'discord');
      setNotificationClickAction(config.notificationClickAction ?? 'trenchcord');
      setChattingEnabled(config.chattingEnabled ?? false);
      setDmReadSyncEnabled(config.dmReadSyncEnabled ?? false);
      setMessageDisplay(config.messageDisplay ?? 'default');
      setCompactModeAvatars(config.compactModeAvatars ?? true);
      setCompactModeNameOnce(config.compactModeNameOnce ?? false);
      setRoleColors(config.roleColors ?? true);
      setMobileZoomScale(config.mobileZoomScale ?? 1);
      setMobileRoomBar(config.mobileRoomBar ?? true);
      setServerIconBadge(config.serverIconBadge ?? true);
      setServerIconBadgeMobile(config.serverIconBadgeMobile ?? true);
      setShowEphemeralMessages(config.showEphemeralMessages ?? true);
      setFeedHotkeys(config.feedHotkeys ?? {});
      setFocusHotkey(config.focusHotkey ?? null);
      setSplitLayout(config.splitLayout === 'grid' ? 'grid' : 'row');
      setProxyUrl(config.discordProxyUrl ?? '');
      const t = config.trading;
      setTradingEnabled(t?.enabled ?? false);
      setTradingRegion(t?.region === 'eu' ? 'eu' : 'us');
      setTradingWallets(t?.wallets ?? []);
      setTradingActiveWalletIds(t?.activeWalletIds ?? []);
      setTradingWalletAmountMode(t?.walletAmountMode ?? 'per_wallet');
      setTradingPresets(presetsToInputs(t?.presetAmounts));
      setTradingSlippage(t?.slippage ?? 20);
      setTradingTip(t?.tip ?? null);
      setTradingPriorityFee(t?.priorityFee ?? null);
      setTradingAntimev(t?.antimev ?? true);
      setTradingRequireDoubleClick(t?.requireDoubleClick ?? false);
      setTradingButtonSize(t?.buttonSize ?? 'md');
      setTradingButtonBgColor(t?.buttonBgColor ?? DEFAULT_TRADE_BG);
      setTradingButtonTextColor(t?.buttonTextColor ?? DEFAULT_TRADE_FG);
      setTradingShowContractPill(t?.showContractPill ?? true);
      setTradingOpenSiteOnBuy(t?.openSiteOnBuy ?? false);
      setTradingBuySitePlatform(t?.buySitePlatform ?? 'default');
      setTradingBuySiteUrl(t?.buySiteUrl ?? '');
      setSnipingEnabled(config.sniping?.enabled ?? false);
    }
  }, [config]);

  const hasUnsavedChanges = useMemo(() => {
    if (!config) return false;
    const arraysEqual = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    const kpEqual = (a: KeywordPattern[], b: KeywordPattern[]) =>
      a.length === b.length && a.every((v, i) => v.pattern === b[i].pattern && v.matchMode === b[i].matchMode && v.label === b[i].label);
    const objEqual = (a: Record<string, string>, b: Record<string, string>) => {
      const aKeys = Object.keys(a), bKeys = Object.keys(b);
      return aKeys.length === bKeys.length && aKeys.every((k) => a[k] === b[k]);
    };

    return (
      !arraysEqual(globalUsers, config.globalHighlightedUsers) ||
      !arraysEqual(dmExcludedUsers, config.dmExcludedUsers ?? []) ||
      telegramDmsInAllDms !== (config.telegramDmsInAllDms ?? true) ||
      !arraysEqual(tgDmExcludedUsers, config.tgDmExcludedUsers ?? []) ||
      !arraysEqual(dmHiddenConversations, config.dmHiddenConversations ?? []) ||
      !arraysEqual(tgDmHiddenConversations, config.tgDmHiddenConversations ?? []) ||
      contractDetection !== config.contractDetection ||
      !objEqual(guildColors, config.guildColors ?? {}) ||
      !objEqual(dmColors, config.dmColors ?? {}) ||
      !objEqual(telegramColors, config.telegramColors ?? {}) ||
      !arraysEqual(enabledGuilds, config.enabledGuilds ?? []) ||
      evmAddressColor !== (config.evmAddressColor ?? '#fee75c') ||
      solAddressColor !== (config.solAddressColor ?? '#14f195') ||
      openInDiscordApp !== (config.openInDiscordApp ?? true) ||
      openInTelegramApp !== (config.openInTelegramApp ?? true) ||
      messageSounds !== (config.messageSounds ?? false) ||
      JSON.stringify(soundSettings) !== JSON.stringify(config.soundSettings ? {
        highlight: { ...defaultSoundConfig, ...config.soundSettings.highlight },
        contractAlert: { ...defaultSoundConfig, ...config.soundSettings.contractAlert },
        keywordAlert: { ...defaultSoundConfig, ...config.soundSettings.keywordAlert },
        premiumAlert: { ...defaultSoundConfig, ...config.soundSettings.premiumAlert },
      } : { highlight: defaultSoundConfig, contractAlert: defaultSoundConfig, keywordAlert: defaultSoundConfig, premiumAlert: defaultSoundConfig }) ||
      JSON.stringify(channelSounds) !== JSON.stringify(config.channelSounds ?? {}) ||
      pushoverEnabled !== (config.pushover?.enabled ?? false) ||
      pushoverAppToken !== (config.pushover?.appToken ?? '') ||
      pushoverUserKey !== (config.pushover?.userKey ?? '') ||
      pushoverPriority !== (config.pushover?.priority ?? 1) ||
      pushoverSound !== (config.pushover?.sound ?? 'siren') ||
      JSON.stringify(pushoverTriggers) !== JSON.stringify(config.pushover?.triggers ?? defaultTriggers) ||
      JSON.stringify(pushoverFilters) !== JSON.stringify(config.pushover?.filters ?? defaultFilters) ||
      solPlatform !== (config.contractLinkTemplates?.solPlatform ?? 'axiom') ||
      evmPlatform !== (config.contractLinkTemplates?.evmPlatform ?? 'gmgn') ||
      customSolUrl !== (config.contractLinkTemplates?.sol ?? '') ||
      customEvmUrl !== (config.contractLinkTemplates?.evm ?? '') ||
      contractClickAction !== (config.contractClickAction ?? 'copy_open') ||
      showFullContractAddress !== (config.showFullContractAddress ?? false) ||
      autoOpenHighlightedContracts !== (config.autoOpenHighlightedContracts ?? false) ||
      !kpEqual(globalKeywordPatterns, config.globalKeywordPatterns ?? []) ||
      keywordAlertsEnabled !== (config.keywordAlertsEnabled ?? true) ||
      desktopNotifications !== (config.desktopNotifications ?? false) ||
      mentionsUserEnabled !== (config.mentionsUserEnabled ?? true) ||
      mentionsRoleEnabled !== (config.mentionsRoleEnabled ?? true) ||
      mentionsHereEnabled !== (config.mentionsHereEnabled ?? false) ||
      mentionsEveryoneEnabled !== (config.mentionsEveryoneEnabled ?? false) ||
      mentionsBotsEnabled !== (config.mentionsBotsEnabled ?? true) ||
      badgeClickAction !== (config.badgeClickAction ?? 'discord') ||
      notificationClickAction !== (config.notificationClickAction ?? 'trenchcord') ||
      chattingEnabled !== (config.chattingEnabled ?? false) ||
      dmReadSyncEnabled !== (config.dmReadSyncEnabled ?? false) ||
      messageDisplay !== (config.messageDisplay ?? 'default') ||
      compactModeAvatars !== (config.compactModeAvatars ?? true) ||
      compactModeNameOnce !== (config.compactModeNameOnce ?? false) ||
      roleColors !== (config.roleColors ?? true) ||
      mobileZoomScale !== (config.mobileZoomScale ?? 1) ||
      mobileRoomBar !== (config.mobileRoomBar ?? true) ||
      serverIconBadge !== (config.serverIconBadge ?? true) ||
      serverIconBadgeMobile !== (config.serverIconBadgeMobile ?? true) ||
      showEphemeralMessages !== (config.showEphemeralMessages ?? true) ||
      // Per-key compare: the backend stores unset hotkeys as null, the local
      // draft may omit them entirely — both mean "no hotkey".
      (['contracts', 'mentions', 'keywords', 'snipes', 'alerts'] as const).some(
        (k) => (feedHotkeys[k] ?? null) !== (config.feedHotkeys?.[k] ?? null),
      ) ||
      focusHotkey !== (config.focusHotkey ?? null) ||
      splitLayout !== (config.splitLayout === 'grid' ? 'grid' : 'row') ||
      tradingEnabled !== (config.trading?.enabled ?? false) ||
      tradingRegion !== (config.trading?.region ?? 'us') ||
      JSON.stringify(tradingWallets) !== JSON.stringify(config.trading?.wallets ?? []) ||
      JSON.stringify(tradingActiveWalletIds) !== JSON.stringify(config.trading?.activeWalletIds ?? []) ||
      tradingWalletAmountMode !== (config.trading?.walletAmountMode ?? 'per_wallet') ||
      // Compare the parsed numbers, not the raw strings: "0.50" vs 0.5 would
      // otherwise pin the save bar to "Unsaved changes" forever.
      JSON.stringify(inputsToPresets(tradingPresets)) !== JSON.stringify(config.trading?.presetAmounts ?? []) ||
      tradingSlippage !== (config.trading?.slippage ?? 20) ||
      tradingTip !== (config.trading?.tip ?? null) ||
      tradingPriorityFee !== (config.trading?.priorityFee ?? null) ||
      tradingAntimev !== (config.trading?.antimev ?? true) ||
      tradingRequireDoubleClick !== (config.trading?.requireDoubleClick ?? false) ||
      tradingButtonSize !== (config.trading?.buttonSize ?? 'md') ||
      tradingButtonBgColor !== (config.trading?.buttonBgColor ?? DEFAULT_TRADE_BG) ||
      tradingButtonTextColor !== (config.trading?.buttonTextColor ?? DEFAULT_TRADE_FG) ||
      tradingShowContractPill !== (config.trading?.showContractPill ?? true) ||
      tradingOpenSiteOnBuy !== (config.trading?.openSiteOnBuy ?? false) ||
      tradingBuySitePlatform !== (config.trading?.buySitePlatform ?? 'default') ||
      tradingBuySiteUrl !== (config.trading?.buySiteUrl ?? '') ||
      snipingEnabled !== (config.sniping?.enabled ?? false)
    );
  }, [config, snipingEnabled, globalUsers, dmExcludedUsers, telegramDmsInAllDms, tgDmExcludedUsers, dmHiddenConversations, tgDmHiddenConversations, contractDetection, guildColors, dmColors, telegramColors, enabledGuilds, evmAddressColor, solAddressColor,
    openInDiscordApp, openInTelegramApp, messageSounds, soundSettings, channelSounds, pushoverEnabled, pushoverAppToken, pushoverUserKey, pushoverPriority, pushoverSound, pushoverTriggers, pushoverFilters,
    solPlatform, evmPlatform, customSolUrl, customEvmUrl, contractClickAction, showFullContractAddress, autoOpenHighlightedContracts,
    globalKeywordPatterns, keywordAlertsEnabled, desktopNotifications, mentionsUserEnabled, mentionsRoleEnabled, mentionsHereEnabled, mentionsEveryoneEnabled, mentionsBotsEnabled, badgeClickAction, notificationClickAction, chattingEnabled, dmReadSyncEnabled, messageDisplay, compactModeAvatars, compactModeNameOnce, roleColors, mobileZoomScale, mobileRoomBar, serverIconBadge, serverIconBadgeMobile, showEphemeralMessages, splitLayout, feedHotkeys, focusHotkey,
    tradingEnabled, tradingRegion, tradingWallets, tradingActiveWalletIds, tradingWalletAmountMode, tradingPresets, tradingSlippage, tradingTip, tradingPriorityFee, tradingAntimev, tradingRequireDoubleClick, tradingButtonSize, tradingButtonBgColor, tradingButtonTextColor,
    tradingShowContractPill, tradingOpenSiteOnBuy, tradingBuySitePlatform, tradingBuySiteUrl]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const guardNavigation = useCallback((action: () => void) => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave without saving?')) {
        action();
      }
    } else {
      action();
    }
  }, [hasUnsavedChanges]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig({
        globalHighlightedUsers: globalUsers,
        dmExcludedUsers,
        telegramDmsInAllDms,
        tgDmExcludedUsers,
        dmHiddenConversations,
        tgDmHiddenConversations,
        contractDetection,
        guildColors,
        dmColors,
        telegramColors,
        enabledGuilds,
        evmAddressColor,
        solAddressColor,
        openInDiscordApp,
        openInTelegramApp,
        messageSounds,
        soundSettings,
        channelSounds,
        pushover: { enabled: pushoverEnabled, appToken: pushoverAppToken, userKey: pushoverUserKey, priority: pushoverPriority, sound: pushoverSound, triggers: pushoverTriggers, filters: pushoverFilters },
        contractLinkTemplates: { evm: customEvmUrl, sol: customSolUrl, solPlatform, evmPlatform },
        contractClickAction,
        showFullContractAddress,
        autoOpenHighlightedContracts,
        globalKeywordPatterns,
        keywordAlertsEnabled,
        desktopNotifications,
        mentionsUserEnabled,
        mentionsRoleEnabled,
        mentionsHereEnabled,
        mentionsEveryoneEnabled,
        mentionsBotsEnabled,
        badgeClickAction,
        notificationClickAction,
        chattingEnabled,
        dmReadSyncEnabled,
        messageDisplay,
        compactModeAvatars,
        compactModeNameOnce,
        roleColors,
        mobileZoomScale,
        mobileRoomBar,
        serverIconBadge,
        serverIconBadgeMobile,
        showEphemeralMessages,
        splitLayout,
        feedHotkeys,
        focusHotkey,
        trading: {
          enabled: tradingEnabled,
          region: tradingRegion,
          wallets: tradingWallets,
          activeWalletIds: tradingActiveWalletIds,
          walletAmountMode: tradingWalletAmountMode,
          presetAmounts: inputsToPresets(tradingPresets),
          slippage: tradingSlippage,
          tip: tradingTip,
          priorityFee: tradingPriorityFee,
          antimev: tradingAntimev,
          requireDoubleClick: tradingRequireDoubleClick,
          buttonSize: tradingButtonSize,
          buttonBgColor: tradingButtonBgColor,
          buttonTextColor: tradingButtonTextColor,
          showContractPill: tradingShowContractPill,
          openSiteOnBuy: tradingOpenSiteOnBuy,
          buySitePlatform: tradingBuySitePlatform,
          buySiteUrl: tradingBuySiteUrl.trim(),
        },
        // Configs are managed on the Snipes page and save straight to the
        // store; settings only owns the global on/off switch.
        ...(config ? { sniping: { ...(config.sniping ?? EMPTY_SNIPING), enabled: snipingEnabled } } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  // Only ticked wallets that still exist count, so a stale id from a removed
  // wallet can't inflate the "N wallets" maths shown below.
  const enabledWalletCount = tradingActiveWalletIds.filter((id) =>
    tradingWallets.some((w) => w.id === id),
  ).length;
  // Grounds the multi-wallet explanation in a number the user actually set.
  const exampleAmount = inputsToPresets(tradingPresets)[0] ?? 1;

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const apiBase = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api';

  const authedFetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (isHostedMode) {
      const token = await getAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }
    // credentials: local mode's session cookie (see lib/localAuth).
    return fetch(input, { ...init, headers, credentials: 'include' });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await authedFetch(`${apiBase}/config/export`);
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trenchcord-settings-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export settings.');
    } finally {
      setExporting(false);
    }
  };

  // Same decision as the TokenSetup import: on iOS a backup's Telegram session
  // must not silently race the computer's copy (AUTH_KEY_DUPLICATED kills
  // both). Holds the parsed file while the user picks fresh-login vs move.
  const [pendingImportData, setPendingImportData] = useState<Record<string, any> | null>(null);

  const runImport = async (data: Record<string, any>, telegramSessions?: 'reuse' | 'fresh') => {
    setImporting(true);
    setImportError(null);
    setImportSuccess(false);
    try {
      let config = data.config;
      if (telegramSessions === 'fresh') {
        config = { ...config };
        delete config.telegramSessions;
      }
      const res = await authedFetch(`${apiBase}/config/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, rooms: data.rooms }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Import failed');
      }
      // The import replaced every room under a fresh id; re-apply the server's
      // (remapped) pane layout instead of keeping panes aimed at dead ids.
      rehydrateLayout();
      await fetchConfig();
      await fetchRooms();
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (err: any) {
      setImportError(err.message || 'Failed to import settings.');
    } finally {
      setImporting(false);
      setPendingImportData(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.config || typeof data.config !== 'object') {
        throw new Error('Invalid settings file: missing config.');
      }
      if (isIOSApp() && backupTelegramSessionCount(data) > 0) {
        setPendingImportData(data);
        return;
      }
      await runImport(data);
    } catch (err: any) {
      setImportError(err.message || 'Failed to import settings.');
    } finally {
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const addGlobalUser = () => {
    const id = newUserId.trim();
    if (id && !globalUsers.includes(id)) {
      setGlobalUsers((prev) => [...prev, id]);
      setNewUserId('');
    }
  };

  const removeGlobalUser = (userId: string) => {
    setGlobalUsers((prev) => prev.filter((u) => u !== userId));
  };

  const addDmExcludedUser = () => {
    const entry = newDmExcludedUser.trim();
    if (entry && !dmExcludedUsers.includes(entry)) {
      setDmExcludedUsers((prev) => [...prev, entry]);
      setNewDmExcludedUser('');
    }
  };

  const removeDmExcludedUser = (entry: string) => {
    setDmExcludedUsers((prev) => prev.filter((u) => u !== entry));
  };

  const addTgDmExcludedUser = () => {
    const entry = newTgDmExcludedUser.trim();
    if (entry && !tgDmExcludedUsers.includes(entry)) {
      setTgDmExcludedUsers((prev) => [...prev, entry]);
      setNewTgDmExcludedUser('');
    }
  };

  const removeTgDmExcludedUser = (entry: string) => {
    setTgDmExcludedUsers((prev) => prev.filter((u) => u !== entry));
  };

  const addDmHiddenConversation = () => {
    const entry = newDmHiddenConversation.trim();
    if (entry && !dmHiddenConversations.includes(entry)) {
      setDmHiddenConversations((prev) => [...prev, entry]);
      setNewDmHiddenConversation('');
    }
  };

  const removeDmHiddenConversation = (entry: string) => {
    setDmHiddenConversations((prev) => prev.filter((u) => u !== entry));
  };

  const addTgDmHiddenConversation = () => {
    const entry = newTgDmHiddenConversation.trim();
    if (entry && !tgDmHiddenConversations.includes(entry)) {
      setTgDmHiddenConversations((prev) => [...prev, entry]);
      setNewTgDmHiddenConversation('');
    }
  };

  const removeTgDmHiddenConversation = (entry: string) => {
    setTgDmHiddenConversations((prev) => prev.filter((u) => u !== entry));
  };

  const addKeyword = () => {
    if (!newKeywordPattern.trim()) return;
    setGlobalKeywordPatterns((prev) => [
      ...prev,
      { pattern: newKeywordPattern.trim(), matchMode: newKeywordMatchMode, label: newKeywordLabel.trim() || undefined },
    ]);
    setNewKeywordPattern('');
    setNewKeywordLabel('');
  };

  // Enabling desktop notifications needs the browser's permission first; used
  // by the Sounds section and the search results' inline switch alike.
  const handleDesktopNotificationsToggle = async (v: boolean) => {
    if (v) {
      const perm = await requestNotificationPermission();
      if (perm === 'denied') {
        alert('Notification permission was denied. Please allow notifications for this site in your browser settings, then try again.');
        return;
      }
    }
    setDesktopNotifications(v);
  };

  // Wires each SearchToggleKey to its draft state so search results can flip
  // the setting in place. Changes go through the same Save bar as the section
  // controls — except autoUpdate, which applies immediately over IPC.
  const searchToggles: Record<SearchToggleKey, { value: boolean; onChange: (v: boolean) => void }> = {
    roleColors: { value: roleColors, onChange: setRoleColors },
    // The card edits the desktop or phone variant depending on layout; mirror that.
    serverIconBadge: compact
      ? { value: serverIconBadgeMobile, onChange: setServerIconBadgeMobile }
      : { value: serverIconBadge, onChange: setServerIconBadge },
    showEphemeralMessages: { value: showEphemeralMessages, onChange: setShowEphemeralMessages },
    contractDetection: { value: contractDetection, onChange: setContractDetection },
    openInDiscordApp: { value: openInDiscordApp, onChange: setOpenInDiscordApp },
    openInTelegramApp: { value: openInTelegramApp, onChange: setOpenInTelegramApp },
    chattingEnabled: { value: chattingEnabled, onChange: setChattingEnabled },
    dmReadSyncEnabled: { value: dmReadSyncEnabled, onChange: setDmReadSyncEnabled },
    autoUpdate: {
      value: autoUpdateEnabled,
      onChange: (v) => {
        setAutoUpdateEnabled(v);
        window.trenchcord?.setAutoUpdate?.(v);
      },
    },
    mobileRoomBar: { value: mobileRoomBar, onChange: setMobileRoomBar },
    telegramDmsInAllDms: { value: telegramDmsInAllDms, onChange: setTelegramDmsInAllDms },
    showFullContractAddress: { value: showFullContractAddress, onChange: setShowFullContractAddress },
    autoOpenHighlightedContracts: { value: autoOpenHighlightedContracts, onChange: setAutoOpenHighlightedContracts },
    tradingEnabled: { value: tradingEnabled, onChange: setTradingEnabled },
    snipingEnabled: { value: snipingEnabled, onChange: setSnipingEnabled },
    tradingAntimev: { value: tradingAntimev, onChange: setTradingAntimev },
    tradingShowContractPill: { value: tradingShowContractPill, onChange: setTradingShowContractPill },
    tradingOpenSiteOnBuy: { value: tradingOpenSiteOnBuy, onChange: setTradingOpenSiteOnBuy },
    tradingRequireDoubleClick: { value: tradingRequireDoubleClick, onChange: setTradingRequireDoubleClick },
    desktopNotifications: { value: desktopNotifications, onChange: handleDesktopNotificationsToggle },
    messageSounds: { value: messageSounds, onChange: setMessageSounds },
    pushoverEnabled: { value: pushoverEnabled, onChange: setPushoverEnabled },
    keywordAlertsEnabled: { value: keywordAlertsEnabled, onChange: setKeywordAlertsEnabled },
    mentionsUser: { value: mentionsUserEnabled, onChange: setMentionsUserEnabled },
    mentionsRole: { value: mentionsRoleEnabled, onChange: setMentionsRoleEnabled },
    mentionsHere: { value: mentionsHereEnabled, onChange: setMentionsHereEnabled },
    mentionsEveryone: { value: mentionsEveryoneEnabled, onChange: setMentionsEveryoneEnabled },
    mentionsBots: { value: mentionsBotsEnabled, onChange: setMentionsBotsEnabled },
  };

  const trimmedSettingsSearch = settingsSearch.trim();
  const settingsSearchResults = useMemo(() => {
    const q = trimmedSettingsSearch.toLowerCase();
    if (!q) return [];
    const ctx: SettingSearchCtx = {
      compact,
      ios: isIOSApp(),
      hosted: isHostedMode,
      focusShortcut: !!window.trenchcord?.setFocusShortcut,
      autoUpdate: autoUpdateSupported,
    };
    const words = q.split(/\s+/);
    return SETTINGS_INDEX.filter((entry) => {
      if (entry.when && !entry.when(ctx)) return false;
      const hay = `${entry.label} ${entry.keywords ?? ''} ${SECTION_META.get(entry.section)?.label ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [trimmedSettingsSearch, compact, autoUpdateSupported]);

  const jumpToSetting = (entry: SettingSearchEntry) => {
    setSettingsSearch('');
    setMobileRoot(false);
    setSection(entry.section);
    setPendingSettingAnchor(entry.anchor ?? entry.label);
  };

  useEffect(() => {
    if (!pendingSettingAnchor) return;
    // Give the section a frame to render before looking for the heading.
    const timer = window.setTimeout(() => {
      setPendingSettingAnchor(null);
      const root = settingsContentRef.current;
      if (!root) return;
      const heading = Array.from(root.querySelectorAll('h3, h4'))
        .find((h) => h.textContent?.trim() === pendingSettingAnchor);
      if (!heading) return;
      // Most settings live in a bg-discord-sidebar card; section-level h3
      // headings stand alone, so those flash the heading itself.
      const card = heading.closest<HTMLElement>('.bg-discord-sidebar');
      const target = card ?? (heading as HTMLElement);
      target.scrollIntoView({ behavior: 'smooth', block: card ? 'center' : 'start' });
      target.classList.add('setting-flash');
      window.setTimeout(() => target.classList.remove('setting-flash'), 1600);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [pendingSettingAnchor]);

  const settingsSearchList = (
    <div className="space-y-1.5">
      {settingsSearchResults.length === 0 ? (
        <p className="text-sm text-discord-text-muted text-center py-8">
          No settings match “{trimmedSettingsSearch}”.
        </p>
      ) : (
        settingsSearchResults.map((entry) => {
          const meta = SECTION_META.get(entry.section);
          const Icon = meta?.icon ?? Settings2;
          const toggle = entry.toggle ? searchToggles[entry.toggle] : null;
          return (
            <div
              key={`${entry.section}:${entry.label}`}
              onClick={() => jumpToSetting(entry)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-discord-sidebar hover:bg-discord-hover/70 cursor-pointer transition-colors"
            >
              <Icon size={16} className="text-discord-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm compact:text-sm text-white truncate">{entry.label}</p>
                <p className="text-[11px] text-discord-text-muted truncate">{meta?.label}</p>
              </div>
              {toggle ? (
                <div
                  className={`w-10 h-5 compact:w-11 compact:h-6 rounded-full transition-colors relative shrink-0 ${toggle.value ? 'bg-discord-green' : 'bg-discord-input'}`}
                  onClick={(e) => { e.stopPropagation(); toggle.onChange(!toggle.value); }}
                  title={toggle.value ? 'Turn off' : 'Turn on'}
                >
                  <div className={`absolute top-0.5 w-4 h-4 compact:w-5 compact:h-5 bg-white rounded-full transition-transform ${toggle.value ? 'translate-x-5 compact:translate-x-[22px]' : 'translate-x-0.5'}`} />
                </div>
              ) : (
                <ChevronRight size={16} className="text-discord-channel-icon shrink-0" />
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-start gap-3 cursor-pointer">
      <div
        className={`w-10 h-5 compact:w-11 compact:h-6 rounded-full transition-colors relative shrink-0 mt-0.5 ${value ? 'bg-discord-green' : 'bg-discord-input'}`}
        onClick={() => onChange(!value)}
      >
        <div className={`absolute top-0.5 w-4 h-4 compact:w-5 compact:h-5 bg-white rounded-full transition-transform ${value ? 'translate-x-5 compact:translate-x-[22px]' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-xs sm:text-sm compact:text-sm text-discord-text leading-snug">{label}</span>
    </label>
  );

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full w-full min-w-0 bg-discord-dark">
      {/* Mobile header: drill-down navigation bar */}
      <div className="md:hidden shrink-0 border-b border-discord-divider bg-discord-sidebar/50">
        <div className="px-2 py-2 flex items-center gap-1 min-h-[48px]">
          {mobileRoot ? (
            <>
              {/* One back button, and it returns to where the user came from:
                  the open drawer. A separate sidebar toggle next to a back
                  arrow reads as two competing ways out. */}
              <button
                onClick={() => guardNavigation(() => {
                  // The drawer should look like it never left — no slide-in.
                  requestInstantDrawerOpen();
                  setActiveView('chat');
                  setSidebarCollapsed(false);
                })}
                className="p-2 rounded text-discord-text-muted hover:text-white transition-colors"
                title="Back"
              >
                <ArrowLeft size={18} />
              </button>
              <h2 className="text-base font-semibold text-white pl-1">Settings</h2>
            </>
          ) : (
            <>
              <button
                onClick={() => setMobileRoot(true)}
                className="p-2 -mr-1 rounded text-discord-text-muted hover:text-white transition-colors flex items-center"
                title="All settings"
              >
                <ChevronLeft size={22} />
              </button>
              <h2 className="text-base font-semibold text-white">
                {SECTIONS.find((s) => s.id === section)?.label ?? 'Settings'}
              </h2>
            </>
          )}
        </div>
      </div>

      {/* Desktop sidebar nav */}
      <div className="hidden md:flex w-60 bg-discord-sidebar/50 border-r border-discord-divider flex-col shrink-0">
        <div className="px-4 pt-5 pb-3 flex items-center gap-2">
          {sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              className="p-1 rounded hover:bg-discord-hover/50 text-discord-text-muted hover:text-white transition-colors"
              title="Show sidebar"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          <button
            onClick={() => guardNavigation(() => setActiveView('chat'))}
            className="p-1 rounded hover:bg-discord-hover/50 text-discord-text-muted hover:text-white transition-colors"
            title="Back to chat"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Settings</h2>
        </div>
        <div className="px-2 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-discord-text-muted pointer-events-none" />
            <input
              type="text"
              value={settingsSearch}
              onChange={(e) => setSettingsSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSettingsSearch(''); }}
              placeholder="Search settings"
              className="w-full bg-discord-dark rounded pl-8 pr-7 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple placeholder:text-discord-text-muted"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
            {settingsSearch && (
              <button
                onClick={() => setSettingsSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-discord-text-muted hover:text-white transition-colors"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        <nav className="flex-1 px-2 pb-4 space-y-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setSettingsSearch(''); if (id !== section) setSection(id); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-left transition-colors ${
                section === id
                  ? 'bg-discord-hover text-white'
                  : 'text-discord-text-muted hover:bg-discord-hover/50 hover:text-discord-text'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div ref={settingsContentRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          {compact && mobileRoot ? (
            /* iOS-Settings-style root list: one inset-grouped card of rows. */
            <nav className="px-4 py-4 animate-page-back">
              <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-text-muted pointer-events-none" />
                <input
                  type="text"
                  value={settingsSearch}
                  onChange={(e) => setSettingsSearch(e.target.value)}
                  placeholder="Search settings"
                  className="w-full bg-discord-sidebar rounded-lg pl-9 pr-9 py-2.5 text-[15px] text-discord-text outline-none placeholder:text-discord-text-muted"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
                {settingsSearch && (
                  <button
                    onClick={() => setSettingsSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-discord-text-muted"
                    title="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              {trimmedSettingsSearch ? settingsSearchList : (
              <div className="rounded-xl overflow-hidden bg-discord-sidebar divide-y divide-discord-darker/40">
                {SECTIONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => { setSection(id); setMobileRoot(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="w-8 h-8 rounded-lg bg-discord-dark flex items-center justify-center text-discord-text-muted shrink-0">
                      <Icon size={17} />
                    </span>
                    <span className="flex-1 text-[15px] text-discord-text truncate">{label}</span>
                    <ChevronRight size={17} className="text-discord-channel-icon shrink-0" />
                  </button>
                ))}
              </div>
              )}
            </nav>
          ) : trimmedSettingsSearch ? (
            /* Search results page (desktop) — replaces the section until the
               query is cleared or a result is clicked. */
            <div className="w-full max-w-2xl mx-auto px-3 sm:px-6 md:px-8 py-3 sm:py-6">
              {settingsSearchList}
            </div>
          ) : (
          <div key={section} className={`w-full max-w-2xl mx-auto px-3 sm:px-6 md:px-8 py-3 sm:py-6 space-y-5 sm:space-y-6${compact ? ' animate-page-in' : ''}`} data-form-type="other" data-lpignore="true" data-1p-ignore>

            {section === 'tokens' && (
              <>
                <div>
                  <h3 className="text-base sm:text-base sm:text-lg font-semibold text-white mb-1">Discord Tokens</h3>
                  <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3 sm:mb-4">
                    Manage your Discord authentication tokens. Multiple tokens allow monitoring across different accounts.
                  </p>

                  {maskedTokens.length > 0 && (
                    <div className="space-y-1.5 mb-4">
                      {maskedTokens.map((t) => (
                        <div
                          key={t.index}
                          className={`flex items-center justify-between gap-2 px-2 sm:px-3 py-2 sm:py-2.5 rounded ${t.invalid ? 'bg-discord-red/10 ring-1 ring-discord-red/40' : 'bg-discord-sidebar'}`}
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                            <Key size={14} className={`shrink-0 ${t.invalid ? 'text-discord-red' : 'text-discord-blurple'}`} />
                            <span className="text-xs sm:text-sm compact:text-sm text-discord-text font-mono tracking-wider truncate">{t.masked}</span>
                            <span className={`text-[10px] px-1 sm:px-1.5 py-0.5 rounded font-semibold shrink-0 ${t.invalid ? 'bg-discord-red/20 text-discord-red' : 'bg-discord-blurple/20 text-discord-blurple'}`}>
                              #{t.index + 1}
                            </span>
                            {t.invalid && (
                              <span className="flex items-center gap-1 text-[10px] px-1 sm:px-1.5 py-0.5 rounded bg-discord-red/20 text-discord-red font-semibold shrink-0">
                                <AlertTriangle size={11} />
                                Invalid
                              </span>
                            )}
                          </div>
                          <button
                            onClick={async () => { await removeToken(t.index); }}
                            className="text-discord-text-muted hover:text-discord-red shrink-0"
                            title="Remove token"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {maskedTokens.length === 0 && (
                    <p className="text-sm text-discord-text-muted text-center py-3 mb-4 bg-discord-sidebar/50 rounded">
                      No tokens configured.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type={showNewToken ? 'text' : 'password'}
                        value={newToken}
                        onChange={(e) => { setNewToken(e.target.value); setTokenError(''); }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && newToken.trim()) {
                            setAddingToken(true);
                            setTokenError('');
                            const result = await addToken(newToken.trim());
                            if (result.success) { setNewToken(''); setShowNewToken(false); }
                            else { setTokenError(result.error ?? 'Failed to add token'); }
                            setAddingToken(false);
                          }
                        }}
                        placeholder="Paste Discord token..."
                        name="trenchcord-token-field"
                        className="w-full bg-discord-sidebar border-none rounded px-2 sm:px-3 py-2 pr-8 sm:pr-9 text-xs sm:text-sm compact:text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple font-mono"
                        disabled={addingToken}
                        autoComplete="one-time-code"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                      <button
                        onClick={() => setShowNewToken(!showNewToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-discord-text-muted hover:text-discord-text"
                        type="button"
                        tabIndex={-1}
                      >
                        {showNewToken ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        if (!newToken.trim()) return;
                        setAddingToken(true);
                        setTokenError('');
                        const result = await addToken(newToken.trim());
                        if (result.success) { setNewToken(''); setShowNewToken(false); }
                        else { setTokenError(result.error ?? 'Failed to add token'); }
                        setAddingToken(false);
                      }}
                      disabled={addingToken || !newToken.trim()}
                      className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {tokenError && (
                    <p className="text-xs text-discord-red mt-1.5">{tokenError}</p>
                  )}
                </div>

                {/* Connection / Proxy (desktop only — the iOS backend cannot
                    load undici, so a proxy can never work there) */}
                {!isHostedMode && !isIOSApp() && (
                  <div className="mt-8 pt-6 border-t border-discord-divider">
                    <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Connection</h3>
                    <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3 sm:mb-4">
                      If Discord won't load on a VPN, route the connection through an HTTP/HTTPS proxy.
                      Leave blank to connect directly. SOCKS proxies are not supported.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={proxyUrl}
                        onChange={(e) => { setProxyUrl(e.target.value); setProxySaved(false); }}
                        placeholder="http://user:pass@host:port"
                        className="flex-1 bg-discord-sidebar border-none rounded px-2 sm:px-3 py-2 text-xs sm:text-sm compact:text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple font-mono"
                        disabled={proxySaving}
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <button
                        onClick={async () => {
                          setProxySaving(true);
                          setProxySaved(false);
                          await updateConfig({ discordProxyUrl: proxyUrl.trim() });
                          setProxySaving(false);
                          setProxySaved(true);
                        }}
                        disabled={proxySaving || proxyUrl.trim() === (config?.discordProxyUrl ?? '')}
                        className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white transition-colors whitespace-nowrap"
                      >
                        {proxySaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                    {proxySaved && (
                      <p className="text-xs text-discord-green mt-1.5">
                        Saved. Reconnecting Discord{proxyUrl.trim() ? ' through the proxy' : ' directly'}…
                      </p>
                    )}
                  </div>
                )}

                {/* Telegram Section */}
                <div className="mt-8 pt-6 border-t border-discord-divider">
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Telegram</h3>
                  <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3 sm:mb-4">
                    Connect Telegram accounts to combine TG chats with Discord channels in your rooms.
                    Multiple accounts let you follow chats across different logins.
                  </p>

                  {telegramAccounts.length > 0 && (
                    <div className="space-y-1.5 mb-4">
                      {telegramAccounts.map((account) => (
                        <div
                          key={account.index}
                          className={`flex items-center justify-between gap-2 px-2 sm:px-3 py-2 sm:py-2.5 rounded ${account.invalid ? 'bg-discord-red/10 ring-1 ring-discord-red/40' : 'bg-discord-sidebar'}`}
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                account.invalid ? 'bg-discord-red' : account.connected ? 'bg-discord-green' : 'bg-yellow-500'
                              }`}
                            />
                            <span className="text-xs sm:text-sm compact:text-sm text-discord-text truncate">
                              {account.username
                                ? `@${account.username}`
                                : account.firstName || `Account #${account.index + 1}`}
                            </span>
                            <span className={`text-[10px] px-1 sm:px-1.5 py-0.5 rounded font-semibold shrink-0 ${account.invalid ? 'bg-discord-red/20 text-discord-red' : 'bg-[#2AABEE]/20 text-[#2AABEE]'}`}>
                              #{account.index + 1}
                            </span>
                            {account.invalid && (
                              <span className="flex items-center gap-1 text-[10px] px-1 sm:px-1.5 py-0.5 rounded bg-discord-red/20 text-discord-red font-semibold shrink-0">
                                <AlertTriangle size={11} />
                                Session expired
                              </span>
                            )}
                          </div>
                          <button
                            onClick={async () => {
                              const label = account.username ? `@${account.username}` : `account #${account.index + 1}`;
                              if (!confirm(`Remove ${label}? This logs the session out of Telegram.`)) return;
                              setTelegramError('');
                              const result = await telegramRemoveAccount(account.index);
                              if (!result.success) setTelegramError(result.error ?? 'Failed to remove account');
                            }}
                            className="text-discord-text-muted hover:text-discord-red shrink-0"
                            title="Remove account"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {telegramAccounts.length === 0 && !showTelegramSetup && (
                    <p className="text-sm text-discord-text-muted text-center py-3 mb-4 bg-discord-sidebar/50 rounded">
                      No Telegram accounts connected.
                    </p>
                  )}

                  {telegramError && (
                    <p className="text-xs text-discord-red mb-2">{telegramError}</p>
                  )}

                  {showTelegramSetup ? (
                    <TelegramSetup
                      hasApiCredentials={!!authStatus?.telegramHasApiCredentials}
                      onClose={() => { setShowTelegramSetup(false); fetchTelegramAccounts(); }}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { setTelegramError(''); setShowTelegramSetup(true); }}
                        className="px-4 py-2.5 bg-[#2AABEE] hover:bg-[#229ED9] rounded text-sm font-medium text-white transition-colors"
                      >
                        {telegramAccounts.length > 0 ? 'Add Account' : 'Connect Telegram'}
                      </button>
                      {telegramAccounts.length > 0 && (
                        <button
                          onClick={async () => {
                            if (!confirm('Disconnect all Telegram accounts? This logs them out of Telegram.')) return;
                            setTelegramError('');
                            const result = await telegramDisconnect();
                            if (!result.success) setTelegramError(result.error ?? 'Failed to disconnect');
                          }}
                          className="px-4 py-2.5 bg-discord-red/20 hover:bg-discord-red/30 text-discord-red rounded text-sm font-medium transition-colors"
                        >
                          Disconnect All
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {section === 'general' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-4">General</h3>

                  <div className="space-y-5">
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Message Display</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Choose how messages are displayed in chat.
                      </p>
                      <div className="flex gap-1.5">
                        {([
                          ['default', 'Cozy'],
                          ['compact', 'Compact'],
                        ] as [MessageDisplay, string][]).map(([mode, label]) => (
                          <button
                            key={mode}
                            onClick={() => setMessageDisplay(mode)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              messageDisplay === mode
                                ? 'bg-discord-blurple text-white'
                                : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-discord-text-muted mt-2">
                        {messageDisplay === 'default' && 'Cozy mode shows avatars and full message headers.'}
                        {messageDisplay === 'compact' && 'Compact mode shows timestamps on the left with inline usernames for a denser chat view.'}
                      </p>
                      {messageDisplay === 'compact' && (
                        <div className="mt-3 pt-3 border-t border-discord-divider space-y-3">
                          <Toggle
                            value={compactModeAvatars}
                            onChange={setCompactModeAvatars}
                            label="Show avatars in compact mode"
                          />
                          <div>
                            <Toggle
                              value={compactModeNameOnce}
                              onChange={setCompactModeNameOnce}
                              label="Show name only once per group"
                            />
                            <p className="text-[11px] text-discord-text-muted mt-1">
                              When someone sends several messages in a row, only the first one shows their name — the rest show just the message.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Split panes don't exist on iOS (single pane, see ChatView) */}
                    {!isIOSApp() && (
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Split Screen Layout</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Use the <strong className="text-discord-text">+</strong> button in a chat header to add up to 4 panes, and the layout button next to Help in the sidebar to resize and drag them. Choose how panes are arranged:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          ['row', 'Single row'],
                          ['grid', 'Two rows'],
                        ] as [SplitLayout, string][]).map(([mode, label]) => (
                          <button
                            key={mode}
                            onClick={() => setSplitLayout(mode)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              splitLayout === mode
                                ? 'bg-discord-blurple text-white'
                                : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    )}

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Role Colors</h4>
                      <Toggle
                        value={roleColors}
                        onChange={setRoleColors}
                        label="Show Discord role colors on usernames"
                      />
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Source Badge</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        The badge next to each message showing where it came from. Show the server's icon
                        with the channel name instead of "Server / #channel" to keep it short. Hover the badge
                        to see the server name.{' '}
                        {compact
                          ? 'This setting only applies on the phone layout.'
                          : 'This setting only applies on the desktop layout — phones have their own (on by default).'}
                      </p>
                      <Toggle
                        value={compact ? serverIconBadgeMobile : serverIconBadge}
                        onChange={compact ? setServerIconBadgeMobile : setServerIconBadge}
                        label="Show the server icon instead of the server name"
                      />
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Ephemeral Messages</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Bot replies Discord shows only to your account (e.g. "This message is too old
                        to delete."). When shown, they carry an "Only you can see this" note like in
                        Discord; turn this off to keep them out of your feeds entirely.
                      </p>
                      <Toggle
                        value={showEphemeralMessages}
                        onChange={setShowEphemeralMessages}
                        label="Show ephemeral messages"
                      />
                    </div>

                    {/* Feed hotkeys — physical-keyboard feature, hidden on phones */}
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg compact:hidden">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Feed Hotkeys</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Press the key anywhere (outside a text field) to jump to that feed — same as room
                        hotkeys, which are set per room and win if a key is used for both.
                      </p>
                      <div className="space-y-2">
                        {([
                          ['contracts', 'Contract Feed'],
                          ['mentions', 'Mentions'],
                          ['keywords', 'Keywords'],
                          ['snipes', 'Snipes'],
                          ['alerts', 'Alerts'],
                          ['dms', 'All DMs'],
                        ] as [keyof FeedHotkeys, string][])
                          .map(([feed, label]) => (
                          <div key={feed} className="flex items-center gap-3">
                            <span className="text-sm text-discord-text w-28 shrink-0">{label}</span>
                            <input
                              type="text"
                              readOnly
                              value={feedHotkeys[feed] ? feedHotkeys[feed]!.toUpperCase() : ''}
                              onKeyDown={(e) => {
                                e.preventDefault();
                                if (['Backspace', 'Delete', 'Escape'].includes(e.key)) {
                                  setFeedHotkeys((p) => ({ ...p, [feed]: null }));
                                  return;
                                }
                                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                                  const key = e.key.toLowerCase();
                                  setFeedHotkeys((p) => ({ ...p, [feed]: key }));
                                }
                              }}
                              placeholder="Press a key"
                              className="w-24 bg-discord-dark border-none rounded px-3 py-1.5 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple text-center cursor-pointer caret-transparent"
                            />
                            {feedHotkeys[feed] && (
                              <button
                                onClick={() => setFeedHotkeys((p) => ({ ...p, [feed]: null }))}
                                className="text-[11px] text-discord-text-muted hover:text-white"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* OS-wide bring-to-front shortcut — desktop app only */}
                    {window.trenchcord?.setFocusShortcut && (
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg compact:hidden">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Bring Trenchcord To Front</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        A system-wide shortcut that works even while another app (like Discord) is
                        focused — press it to jump straight back to Trenchcord. Must include
                        Ctrl/Cmd or Alt so it doesn't clash with normal typing.
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          readOnly
                          value={focusHotkey ? focusHotkey.replace('CommandOrControl', 'Ctrl/Cmd') : ''}
                          onKeyDown={(e) => {
                            e.preventDefault();
                            if (['Backspace', 'Delete', 'Escape'].includes(e.key)) { setFocusHotkey(null); return; }
                            // Ignore presses of a modifier alone.
                            if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;
                            const mods: string[] = [];
                            if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
                            if (e.altKey) mods.push('Alt');
                            if (e.shiftKey) mods.push('Shift');
                            // Require a real modifier: a bare key (or Shift+key) registered
                            // globally would swallow normal typing in every app.
                            if (!mods.includes('CommandOrControl') && !mods.includes('Alt')) return;
                            const isFn = /^F([1-9]|1[0-9]|2[0-4])$/.test(e.key);
                            if (e.key.length !== 1 && !isFn) return;
                            const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key;
                            setFocusHotkey([...mods, keyName].join('+'));
                          }}
                          placeholder="Press a key combo"
                          className="w-48 bg-discord-dark border-none rounded px-3 py-1.5 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple text-center cursor-pointer caret-transparent"
                        />
                        {focusHotkey && (
                          <button
                            onClick={() => setFocusHotkey(null)}
                            className="text-[11px] text-discord-text-muted hover:text-white"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-discord-text-muted mt-1.5">
                        Example: Ctrl/Cmd+Shift+T. Takes effect after saving.
                      </p>
                    </div>
                    )}

                    {/* Auto-update opt-in — Windows desktop app only */}
                    {autoUpdateSupported && (
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Automatic Updates</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Off by default. When on, the app checks GitHub Releases at launch, downloads new
                        versions, and asks before installing. When off, it never contacts GitHub for
                        updates — nothing is downloaded without you turning this on. You can always
                        update manually from the releases page. Applies immediately, no save needed.
                      </p>
                      <Toggle
                        value={autoUpdateEnabled}
                        onChange={(v) => {
                          setAutoUpdateEnabled(v);
                          window.trenchcord?.setAutoUpdate?.(v);
                        }}
                        label="Automatically download updates (Windows)"
                      />
                    </div>
                    )}

                    {/* The iOS app has real phone sizing (compact mode) and CSS
                        zoom would break its safe-area handling, so the setting
                        is web-mobile only there. */}
                    {!isIOSApp() && (
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Mobile Zoom Scale</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Adjust the zoom level on mobile devices to make everything larger or smaller.
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0.5}
                          max={1.5}
                          step={0.05}
                          value={mobileZoomScale}
                          onChange={(e) => setMobileZoomScale(parseFloat(e.target.value))}
                          className="flex-1 h-1.5 bg-discord-dark rounded-full appearance-none cursor-pointer accent-discord-blurple [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-discord-blurple"
                        />
                        <span className="text-xs font-mono text-discord-text w-10 text-right">{Math.round(mobileZoomScale * 100)}%</span>
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-[10px] text-discord-text-muted">50%</span>
                        <button
                          onClick={() => setMobileZoomScale(1)}
                          className="text-[10px] text-discord-blurple hover:text-discord-blurple/80 transition-colors"
                        >
                          Reset
                        </button>
                        <span className="text-[10px] text-discord-text-muted">150%</span>
                      </div>
                    </div>
                    )}

                    {/* iOS app only — the bar itself never renders elsewhere */}
                    {isIOSApp() && (
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Bottom Room Bar</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Quick room switcher along the bottom of the chat, so you don't need the
                        sidebar for every hop. Only appears with two or more rooms.
                      </p>
                      <Toggle
                        value={mobileRoomBar}
                        onChange={setMobileRoomBar}
                        label="Show the room bar"
                      />
                    </div>
                    )}

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Contract Detection</h4>
                      <Toggle
                        value={contractDetection}
                        onChange={setContractDetection}
                        label="Detect SOL/EVM contract addresses in messages"
                      />
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Open in Discord App</h4>
                      <Toggle
                        value={openInDiscordApp}
                        onChange={setOpenInDiscordApp}
                        label="Clicking a channel badge opens the message directly in the Discord app"
                      />
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Open in Telegram App</h4>
                      <Toggle
                        value={openInTelegramApp}
                        onChange={setOpenInTelegramApp}
                        label="Clicking a TG channel badge opens the message directly in the Telegram app"
                      />
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Badge Click Action</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        What happens when you click a keyword match or contract badge on a message.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          ['discord', 'Discord'],
                          ['platform', 'Platform'],
                          ['both', 'Both'],
                        ] as [BadgeClickAction, string][]).map(([action, label]) => (
                          <button
                            key={action}
                            onClick={() => setBadgeClickAction(action)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              badgeClickAction === action
                                ? 'bg-discord-blurple text-white'
                                : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-discord-text-muted mt-2">
                        {badgeClickAction === 'discord' && 'Always opens the original message in Discord.'}
                        {badgeClickAction === 'platform' && 'Opens the contract in your configured trading platform if one is detected, otherwise falls back to Discord.'}
                        {badgeClickAction === 'both' && 'Opens the message in Discord and also opens the contract in your trading platform (if detected).'}
                      </p>
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Notification Click</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Where clicking a notification toast (highlighted user, keyword, contract) takes you.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          ['trenchcord', 'In Trenchcord'],
                          ['discord', 'In Discord / Telegram'],
                        ] as [NotificationClickAction, string][]).map(([action, label]) => (
                          <button
                            key={action}
                            onClick={() => setNotificationClickAction(action)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              notificationClickAction === action
                                ? 'bg-discord-blurple text-white'
                                : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-discord-text-muted mt-2">
                        {notificationClickAction === 'trenchcord'
                          ? 'Jumps to the room the message arrived in.'
                          : 'Opens the original message in Discord (or Telegram), honoring the open-in-app toggles above.'}
                      </p>
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Chat / Send Messages</h4>
                      <Toggle
                        value={chattingEnabled}
                        onChange={setChattingEnabled}
                        label="Enable sending messages through Trenchcord"
                      />
                      <div className="mt-3 p-2.5 sm:p-3 rounded bg-discord-red/10 border border-discord-red/30">
                        <p className="text-[11px] sm:text-xs text-discord-red font-semibold mb-1">Warning: Detection Risk</p>
                        <p className="text-[10px] sm:text-[11px] text-discord-text-muted leading-relaxed">
                          Sending messages through this app increases the chance of your Discord account being detected and flagged.
                          Reading messages is passive and harder to detect, but sending messages leaves a direct API footprint
                          that Discord can associate with automated or third-party usage. Use at your own risk.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">DM Read Sync</h4>
                      <Toggle
                        value={dmReadSyncEnabled}
                        onChange={setDmReadSyncEnabled}
                        label="Mark DMs read in Discord when viewed here"
                      />
                      <p className="text-[11px] sm:text-xs text-discord-text-muted mt-2 leading-relaxed">
                        Viewing a DM in Trenchcord marks that conversation read on your Discord account, so the
                        unread badge clears in the official Discord apps too — the same request the Discord client
                        sends when you open a chat. Only the DM you're looking at is ever marked, never servers or
                        channels. Badges syncing the other way (reading in Discord clears Trenchcord) is always on.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === 'contracts' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Contracts</h3>

                  <div className="space-y-5">
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Contract Click Action</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        What happens when you click a contract address in chat.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          ['copy', 'Copy'],
                          ['copy_open', 'Copy + Open'],
                          ['open', 'Open Only'],
                        ] as [ContractClickAction, string][]).map(([action, label]) => (
                          <button
                            key={action}
                            onClick={() => setContractClickAction(action)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              contractClickAction === action
                                ? 'bg-discord-blurple text-white'
                                : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Display Full Contract Address</h4>
                      <Toggle
                        value={showFullContractAddress}
                        onChange={setShowFullContractAddress}
                        label="Show the full contract address in chat and the contract list instead of the shortened form (0x1234...abcd)"
                      />
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Trading Platform</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Choose which trading platform opens when you click a contract address.
                      </p>
                      <div className="space-y-3">
                        <div className="px-3 py-2.5 bg-discord-dark rounded">
                          <label className="text-[11px] text-discord-text-muted mb-1.5 block">SOL Platform</label>
                          <div className="flex flex-wrap gap-1.5">
                            {(['axiom', 'padre', 'bloom', 'gmgn', 'fomo', 'custom'] as SolPlatform[]).map((p) => (
                              <button
                                key={p}
                                onClick={() => setSolPlatform(p)}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  solPlatform === p
                                    ? 'bg-discord-blurple text-white'
                                    : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                                }`}
                              >
                                {p === 'axiom' ? 'Axiom' : p === 'padre' ? 'Padre' : p === 'bloom' ? 'Bloom' : p === 'gmgn' ? 'GMGN' : p === 'fomo' ? 'Fomo' : 'Custom'}
                              </button>
                            ))}
                          </div>
                          {solPlatform === 'custom' && (
                            <input
                              type="text"
                              value={customSolUrl}
                              onChange={(e) => setCustomSolUrl(e.target.value)}
                              placeholder="https://example.com/token/{address}"
                              className="w-full mt-2 bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                            />
                          )}
                        </div>
                        <div className="px-3 py-2.5 bg-discord-dark rounded">
                          <label className="text-[11px] text-discord-text-muted mb-1.5 block">EVM Platform</label>
                          <div className="flex flex-wrap gap-1.5">
                            {(['gmgn', 'bloom', 'fomo', 'custom'] as EvmPlatform[]).map((p) => (
                              <button
                                key={p}
                                onClick={() => setEvmPlatform(p)}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  evmPlatform === p
                                    ? 'bg-discord-blurple text-white'
                                    : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                                }`}
                              >
                                {p === 'gmgn' ? 'GMGN' : p === 'bloom' ? 'Bloom' : p === 'fomo' ? 'Fomo' : 'Custom'}
                              </button>
                            ))}
                          </div>
                          {evmPlatform === 'custom' && (
                            <input
                              type="text"
                              value={customEvmUrl}
                              onChange={(e) => setCustomEvmUrl(e.target.value)}
                              placeholder="https://example.com/token/{address}"
                              className="w-full mt-2 bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Auto-Open Highlighted Contracts</h4>
                      <Toggle
                        value={autoOpenHighlightedContracts}
                        onChange={setAutoOpenHighlightedContracts}
                        label="Automatically open a new tab when a highlighted user posts a contract address"
                      />
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Address Colors</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Customize highlight colors for detected contract addresses by chain type.
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-discord-dark rounded">
                          <ColorPickerWithAlpha
                            value={evmAddressColor}
                            onChange={(c) => setEvmAddressColor(c)}
                            defaultColor="#fee75c"
                            showTextInput
                          />
                          <span className="text-xs sm:text-sm compact:text-sm text-discord-text flex-1">EVM (0x...)</span>
                          {evmAddressColor !== '#fee75c' && (
                            <button onClick={() => setEvmAddressColor('#fee75c')} className="text-[11px] text-discord-text-muted hover:text-white shrink-0">Reset</button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-discord-dark rounded">
                          <ColorPickerWithAlpha
                            value={solAddressColor}
                            onChange={(c) => setSolAddressColor(c)}
                            defaultColor="#14f195"
                            showTextInput
                          />
                          <span className="text-xs sm:text-sm compact:text-sm text-discord-text flex-1">SOL</span>
                          {solAddressColor !== '#14f195' && (
                            <button onClick={() => setSolAddressColor('#14f195')} className="text-[11px] text-discord-text-muted hover:text-white shrink-0">Reset</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === 'trading' && (
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Trading</h3>
                <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-4">
                  Buy Solana tokens straight from a message, without leaving Trenchcord.
                </p>

                {isHostedMode ? (
                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                    <p className="text-sm text-discord-text">
                      Trading is only available in the desktop and iPhone apps, where your API token stays on your own device.
                    </p>
                  </div>
                ) : (
                <div className="space-y-4">
                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-2">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white">About Slotshark</h4>
                    <p className="text-sm text-discord-text leading-snug">
                      Trenchcord routes buys through{' '}
                      <a href="https://slotshark.xyz/?ref=1q79wsl2" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">Slotshark</a>
                      , a Solana trading bot with a public REST API. It charges 0.5% on manual and API trades. Beyond
                      the API it also runs Twitter, copytrade, deploy-sniper and Pump.fun claim tasks via Telegram or
                      its browser extension.
                    </p>
                    <p className="text-sm text-discord-text leading-snug">
                      Your API token and wallet addresses are stored locally and are sent only to Slotshark — never to
                      Trenchcord.
                    </p>
                    <p className="text-xs text-discord-yellow leading-snug flex items-start gap-1.5">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span>Buy buttons execute real swaps with real SOL. There is no undo.</span>
                    </p>
                  </div>

                  <details className="group bg-discord-sidebar rounded-lg">
                    <summary className="flex items-center gap-2 px-3 sm:px-4 py-3 cursor-pointer select-none">
                      <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      <span className="text-sm font-semibold text-white">How to get a Slotshark API token</span>
                    </summary>
                    <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2">
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-discord-blurple text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                        <p className="text-sm text-discord-text">
                          Go to{' '}
                          <a href="https://slotshark.xyz/?ref=1q79wsl2" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">slotshark.xyz</a>
                          , click <span className="font-semibold text-white">Open Dashboard</span> and register with Telegram.
                        </p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-discord-blurple text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                        <p className="text-sm text-discord-text">
                          Create or import a wallet under{' '}
                          <a href="https://slotshark.xyz/dashboard?tab=wallets&ref=1q79wsl2" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">Wallet Management</a>
                          , and fund it.
                        </p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-discord-blurple text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                        <p className="text-sm text-discord-text">
                          Open <span className="font-semibold text-white">Developer API</span>, click{' '}
                          <span className="font-semibold text-white">Reveal Token</span>, and paste it below.
                        </p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-discord-blurple text-white text-xs font-bold flex items-center justify-center mt-0.5">4</span>
                        <p className="text-sm text-discord-text">
                          Copy that wallet's public key into <span className="font-semibold text-white">Wallets</span> below.
                        </p>
                      </div>
                    </div>
                  </details>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Enable Trading</h4>
                    <Toggle
                      value={tradingEnabled}
                      onChange={setTradingEnabled}
                      label="Show buy buttons under messages containing a Solana contract"
                    />
                    {tradingEnabled && (!tradingStatus?.configured || tradingWallets.length === 0) && (
                      <p className="text-xs text-discord-yellow mt-2 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>
                          Buttons stay hidden until you add
                          {!tradingStatus?.configured ? ' an API token' : ''}
                          {!tradingStatus?.configured && tradingWallets.length === 0 ? ' and' : ''}
                          {tradingWallets.length === 0 ? ' a wallet' : ''}.
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Enable Sniping</h4>
                    <Toggle
                      value={snipingEnabled}
                      onChange={setSnipingEnabled}
                      label="Auto-buy contracts matching your snipe configs"
                    />
                    <p className="text-xs text-discord-yellow mt-2 flex items-start gap-1.5">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span>
                        Snipes execute real swaps with real SOL, without a click or a confirmation. There is no undo.
                      </span>
                    </p>
                    {snipingEnabled && (!tradingEnabled || !tradingStatus?.configured) && (
                      <p className="text-xs text-discord-yellow mt-2 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>
                          Sniping stays inactive until Trading is enabled
                          {!tradingStatus?.configured ? ' and a Slotshark API token is saved' : ''} above.
                        </span>
                      </p>
                    )}
                    <p className="text-[11px] text-discord-text-muted mt-2">
                      Snipe configs are created and managed on the <span className="text-discord-text">Snipes</span> feed
                      page (sidebar). Snipes buy through Slotshark using the token, region, and wallet-amount mode from
                      this page.
                    </p>
                  </div>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-3">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white">API Token</h4>
                    {tradingStatus?.configured && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-discord-dark rounded">
                        <Key size={14} className="text-discord-text-muted shrink-0" />
                        <span className="flex-1 min-w-0 text-xs font-mono tracking-wider text-discord-text truncate">
                          {tradingStatus.masked}
                        </span>
                        <button
                          onClick={async () => {
                            await removeSlotsharkToken();
                            setSlotsharkTokenSaved(false);
                          }}
                          className="text-discord-text-muted hover:text-discord-red transition-colors shrink-0"
                          title="Remove API token"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        value={slotsharkTokenInput}
                        onChange={(e) => { setSlotsharkTokenInput(e.target.value); setSlotsharkTokenError(''); setSlotsharkTokenSaved(false); }}
                        placeholder={tradingStatus?.configured ? 'Replace token…' : 'Paste your Slotshark API token'}
                        className="flex-1 bg-discord-dark text-discord-text text-sm px-3 py-2 rounded outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                      <button
                        onClick={async () => {
                          setSavingSlotsharkToken(true);
                          setSlotsharkTokenError('');
                          const res = await saveSlotsharkToken(slotsharkTokenInput.trim());
                          setSavingSlotsharkToken(false);
                          if (res.success) {
                            setSlotsharkTokenInput('');
                            setSlotsharkTokenSaved(true);
                          } else {
                            setSlotsharkTokenError(res.error ?? 'Failed to save token.');
                          }
                        }}
                        disabled={!slotsharkTokenInput.trim() || savingSlotsharkToken}
                        className="px-4 py-2 text-sm font-medium rounded bg-discord-blurple hover:bg-discord-blurple/80 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
                      >
                        {savingSlotsharkToken ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                    {slotsharkTokenError && (
                      <p className="text-xs text-discord-red flex items-center gap-1.5">
                        <AlertTriangle size={12} /> {slotsharkTokenError}
                      </p>
                    )}
                    {slotsharkTokenSaved && (
                      <p className="text-xs text-discord-green flex items-center gap-1.5">
                        <Check size={12} /> API token saved.
                      </p>
                    )}
                    <p className="text-[11px] text-discord-text-muted">
                      Saved separately from the rest of these settings, and never included in a settings export.
                    </p>
                  </div>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Server Region</h4>
                    <div className="flex gap-2">
                      {([['us', 'US'], ['eu', 'EU']] as [SlotsharkRegion, string][]).map(([region, label]) => (
                        <button
                          key={region}
                          onClick={() => setTradingRegion(region)}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            tradingRegion === region
                              ? 'bg-discord-blurple text-white'
                              : 'bg-discord-dark text-discord-text-muted hover:text-white'
                          }`}
                        >
                          {label} · {region}.slotshark.xyz
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-discord-text-muted mt-2">
                      Pick whichever is closer to you — it only affects latency.
                    </p>
                  </div>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-3">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white">Wallets</h4>
                    {tradingWallets.length === 0 && (
                      <p className="text-xs text-discord-text-muted">
                        No wallets yet. Add the public key of a wallet you created in the Slotshark dashboard.
                      </p>
                    )}
                    {tradingWallets.map((w) => {
                      const enabled = tradingActiveWalletIds.includes(w.id);
                      return (
                      <div key={w.id} className="flex items-center gap-2 px-3 py-2 bg-discord-dark rounded">
                        <button
                          onClick={() => setTradingActiveWalletIds(
                            enabled
                              ? tradingActiveWalletIds.filter((id) => id !== w.id)
                              : [...tradingActiveWalletIds, w.id],
                          )}
                          className={`w-4 h-4 rounded shrink-0 transition-colors flex items-center justify-center ${
                            enabled
                              ? 'bg-discord-blurple text-white'
                              : 'bg-discord-input hover:bg-discord-text-muted/40'
                          }`}
                          title={enabled ? 'Enabled — buys fire from this wallet' : 'Disabled — click to buy from this wallet'}
                        >
                          {enabled && <Check size={11} strokeWidth={3} />}
                        </button>
                        <span className={`text-sm truncate max-w-[8rem] ${enabled ? 'text-white' : 'text-discord-text-muted'}`}>
                          {w.label || 'Wallet'}
                        </span>
                        <span className="flex-1 min-w-0 font-mono text-xs text-discord-text-muted truncate" title={w.address}>
                          {w.address.slice(0, 6)}…{w.address.slice(-4)}
                        </span>
                        <button
                          onClick={() => {
                            setTradingWallets(tradingWallets.filter((x) => x.id !== w.id));
                            setTradingActiveWalletIds(tradingActiveWalletIds.filter((id) => id !== w.id));
                          }}
                          className="text-discord-text-muted hover:text-discord-red transition-colors shrink-0"
                          title="Remove wallet"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      );
                    })}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newWalletLabel}
                        onChange={(e) => setNewWalletLabel(e.target.value)}
                        placeholder="Label (e.g. Main)"
                        className="sm:w-32 bg-discord-dark text-discord-text text-sm px-3 py-2 rounded outline-none focus:ring-1 focus:ring-discord-blurple"
                      />
                      <input
                        type="text"
                        value={newWalletAddress}
                        onChange={(e) => { setNewWalletAddress(e.target.value); setWalletError(''); }}
                        placeholder="Wallet public key"
                        className="flex-1 bg-discord-dark text-discord-text text-sm px-3 py-2 rounded outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                      <button
                        onClick={() => {
                          // Case-sensitive: trim only, never lowercase.
                          const address = newWalletAddress.trim();
                          if (!SOL_ADDRESS_RE.test(address)) {
                            setWalletError('That does not look like a Solana wallet address.');
                            return;
                          }
                          if (tradingWallets.some((w) => w.address === address)) {
                            setWalletError('That wallet is already added.');
                            return;
                          }
                          const wallet: TradingWallet = {
                            id: crypto.randomUUID(),
                            label: newWalletLabel.trim().slice(0, 40),
                            address,
                          };
                          setTradingWallets([...tradingWallets, wallet]);
                          // Your first wallet is enabled for you, so adding one
                          // is all it takes to get buy buttons. Later ones stay
                          // off until ticked: on "that much per wallet", quietly
                          // enabling a second wallet would double what every
                          // click spends, which is not ours to decide.
                          if (enabledWalletCount === 0) {
                            setTradingActiveWalletIds([wallet.id]);
                          }
                          setNewWalletLabel('');
                          setNewWalletAddress('');
                          setWalletError('');
                        }}
                        className="px-3 py-2 rounded bg-discord-blurple hover:bg-discord-blurple/80 text-white transition-colors shrink-0 flex items-center justify-center"
                        title="Add wallet"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    {walletError && (
                      <p className="text-xs text-discord-red flex items-center gap-1.5">
                        <AlertTriangle size={12} /> {walletError}
                      </p>
                    )}
                    <p className="text-[11px] text-discord-text-muted">
                      Public keys only — Trenchcord never sees or stores a private key. Buys fire from every ticked
                      wallet; untick one to leave it out. Your first wallet is ticked automatically — any you add
                      after it start off, so adding a wallet never quietly increases what a click spends.
                    </p>

                    {tradingWallets.length > 0 && enabledWalletCount === 0 && (
                      <p className="text-xs text-discord-yellow flex items-center gap-1.5">
                        <AlertTriangle size={12} /> No wallets are ticked, so the buy buttons stay hidden.
                      </p>
                    )}

                    {enabledWalletCount > 1 && (
                      <div className="pt-1 space-y-2">
                        <label className="text-[11px] text-discord-text-muted block">
                          With {enabledWalletCount} wallets enabled, a buy amount means
                        </label>
                        <div className="flex flex-col sm:flex-row gap-1.5">
                          {([
                            ['per_wallet', 'That much per wallet'],
                            ['split', 'Split across wallets'],
                          ] as [WalletAmountMode, string][]).map(([val, label]) => (
                            <button
                              key={val}
                              onClick={() => setTradingWalletAmountMode(val)}
                              className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                tradingWalletAmountMode === val
                                  ? 'bg-discord-blurple text-white'
                                  : 'bg-discord-dark text-discord-text-muted hover:text-white'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className={`text-[11px] leading-snug ${
                          tradingWalletAmountMode === 'per_wallet' ? 'text-discord-yellow' : 'text-discord-text-muted'
                        }`}>
                          {tradingWalletAmountMode === 'per_wallet' ? (
                            <>
                              Clicking <span className="font-semibold">{exampleAmount} SOL</span> buys {exampleAmount} SOL
                              on each wallet — <span className="font-semibold">{roundSol(exampleAmount * enabledWalletCount)} SOL
                              leaves your balances in total.</span>
                            </>
                          ) : (
                            <>
                              Clicking <span className="font-semibold">{exampleAmount} SOL</span> spends {exampleAmount} SOL
                              in total — about {roundSol(exampleAmount / enabledWalletCount)} SOL from each wallet.
                            </>
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Buy Amounts (SOL)</h4>
                    <div className="grid grid-cols-5 gap-2">
                      {tradingPresets.map((value, i) => (
                        <input
                          key={i}
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={value}
                          onChange={(e) => {
                            const next = [...tradingPresets];
                            next[i] = e.target.value;
                            setTradingPresets(next);
                          }}
                          className="w-full bg-discord-dark text-discord-text text-sm px-2 py-2 rounded outline-none focus:ring-1 focus:ring-discord-blurple text-center"
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-discord-text-muted mt-2">
                      Up to five buttons. Leave a box blank or at 0 to hide that button.
                    </p>
                  </div>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-4">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white">Execution</h4>

                    <div>
                      <label className="text-[11px] text-discord-text-muted mb-1 block">Slippage</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          step="1"
                          inputMode="numeric"
                          value={tradingSlippage}
                          onChange={(e) => setTradingSlippage(Number(e.target.value))}
                          className="w-28 bg-discord-dark text-discord-text text-sm px-3 py-2 rounded outline-none focus:ring-1 focus:ring-discord-blurple"
                        />
                        <span className="text-xs text-discord-text-muted">%</span>
                      </div>
                    </div>

                    {([
                      ['Tip', tradingTip, setTradingTip, 0.005] as const,
                      ['Priority Fee', tradingPriorityFee, setTradingPriorityFee, 0.003] as const,
                    ]).map(([label, value, setValue, fallback]) => (
                      <div key={label}>
                        <label className="text-[11px] text-discord-text-muted mb-1 block">{label}</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex gap-1">
                            <button
                              onClick={() => setValue(null)}
                              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                value === null ? 'bg-discord-blurple text-white' : 'bg-discord-dark text-discord-text-muted hover:text-white'
                              }`}
                            >
                              Auto
                            </button>
                            <button
                              onClick={() => setValue(value ?? fallback)}
                              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                value !== null ? 'bg-discord-blurple text-white' : 'bg-discord-dark text-discord-text-muted hover:text-white'
                              }`}
                            >
                              Custom
                            </button>
                          </div>
                          {value !== null && (
                            <>
                              <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.0001"
                                inputMode="decimal"
                                value={value}
                                onChange={(e) => setValue(Number(e.target.value))}
                                className="w-28 bg-discord-dark text-discord-text text-sm px-3 py-2 rounded outline-none focus:ring-1 focus:ring-discord-blurple"
                              />
                              <span className="text-xs text-discord-text-muted">SOL</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <p className="text-[11px] text-discord-text-muted">
                      On Auto, Slotshark picks these from recent blocks (tip = p75, priority fee = p99). The tip is only
                      paid if the swap succeeds; the priority fee is paid whenever the transaction lands.
                    </p>

                    <Toggle
                      value={tradingAntimev}
                      onChange={setTradingAntimev}
                      label="Anti-MEV protection"
                    />
                  </div>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-4">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white">Button Appearance</h4>

                    <div>
                      <label className="text-[11px] text-discord-text-muted mb-1 block">Size</label>
                      <div className="flex gap-2">
                        {([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] as [TradeButtonSize, string][]).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => setTradingButtonSize(val)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              tradingButtonSize === val
                                ? 'bg-discord-blurple text-white'
                                : 'bg-discord-dark text-discord-text-muted hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-discord-dark rounded">
                        <ColorPickerWithAlpha
                          value={tradingButtonBgColor}
                          onChange={(c) => setTradingButtonBgColor(c)}
                          defaultColor={DEFAULT_TRADE_BG}
                          showTextInput
                        />
                        <span className="text-xs sm:text-sm compact:text-sm text-discord-text flex-1">Button background</span>
                        {tradingButtonBgColor !== DEFAULT_TRADE_BG && (
                          <button onClick={() => setTradingButtonBgColor(DEFAULT_TRADE_BG)} className="text-[11px] text-discord-text-muted hover:text-white shrink-0">Reset</button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-discord-dark rounded">
                        <ColorPickerWithAlpha
                          value={tradingButtonTextColor}
                          onChange={(c) => setTradingButtonTextColor(c)}
                          defaultColor={DEFAULT_TRADE_FG}
                          showTextInput
                        />
                        <span className="text-xs sm:text-sm compact:text-sm text-discord-text flex-1">Button text</span>
                        {tradingButtonTextColor !== DEFAULT_TRADE_FG && (
                          <button onClick={() => setTradingButtonTextColor(DEFAULT_TRADE_FG)} className="text-[11px] text-discord-text-muted hover:text-white shrink-0">Reset</button>
                        )}
                      </div>
                    </div>

                    <div className="pt-1">
                      <Toggle
                        value={tradingShowContractPill}
                        onChange={setTradingShowContractPill}
                        label="Show the contract address on the buy row"
                      />
                      <p className="text-[11px] text-discord-text-muted mt-2">
                        Turn this off for just the buttons — the address is already in the message above. A message
                        with several contracts always keeps it, since it's the only thing telling the rows apart.
                      </p>
                    </div>

                    <div>
                      <label className="text-[11px] text-discord-text-muted mb-1 block">Preview</label>
                      <div className="px-2 sm:px-3 py-2 bg-discord-dark rounded flex items-center gap-1.5 flex-wrap">
                        {tradingShowContractPill && (
                          <span
                            className={`rounded font-mono shrink-0 ${TRADE_PREVIEW_SIZES[tradingButtonSize].pill}`}
                            style={{ backgroundColor: colorWithExtraAlpha(solAddressColor, 0.125), color: solAddressColor }}
                          >
                            9xY2…k4Qp
                          </span>
                        )}
                        {(inputsToPresets(tradingPresets).length > 0 ? inputsToPresets(tradingPresets) : [0.5, 1, 3, 5, 10]).map((amount, i) => (
                          <span
                            key={i}
                            className={`select-none rounded font-semibold ${TRADE_PREVIEW_SIZES[tradingButtonSize].button}`}
                            style={{ backgroundColor: tradingButtonBgColor, color: tradingButtonTextColor }}
                          >
                            {amount}
                          </span>
                        ))}
                        <span className={`text-discord-text-muted shrink-0 ${TRADE_PREVIEW_SIZES[tradingButtonSize].unit}`}>SOL</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Open Chart on Buy</h4>
                    <Toggle
                      value={tradingOpenSiteOnBuy}
                      onChange={setTradingOpenSiteOnBuy}
                      label="Open the token on a trading site when a buy fires"
                    />
                    <p className="text-[11px] text-discord-text-muted mt-2">
                      The site opens the moment you click, without waiting for the buy to confirm — so you land on the
                      chart to manage the position (or retry by hand if the buy failed). Buying more of the same token
                      within a few seconds won't open it again.
                    </p>

                    {tradingOpenSiteOnBuy && (
                      <div className="mt-3 px-3 py-2.5 bg-discord-dark rounded">
                        <label className="text-[11px] text-discord-text-muted mb-1.5 block">Site</label>
                        <div className="flex flex-wrap gap-1.5">
                          {(['default', 'axiom', 'padre', 'bloom', 'gmgn', 'fomo', 'custom'] as BuySitePlatform[]).map((p) => (
                            <button
                              key={p}
                              onClick={() => setTradingBuySitePlatform(p)}
                              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                tradingBuySitePlatform === p
                                  ? 'bg-discord-blurple text-white'
                                  : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                              }`}
                            >
                              {p === 'default'
                                ? 'Same as contract links'
                                : p === 'axiom' ? 'Axiom' : p === 'padre' ? 'Padre' : p === 'bloom' ? 'Bloom' : p === 'gmgn' ? 'GMGN' : p === 'fomo' ? 'Fomo' : 'Custom'}
                            </button>
                          ))}
                        </div>
                        {tradingBuySitePlatform === 'custom' && (
                          <input
                            type="text"
                            value={tradingBuySiteUrl}
                            onChange={(e) => setTradingBuySiteUrl(e.target.value)}
                            placeholder="https://example.com/token/{address}"
                            className="w-full mt-2 bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                          />
                        )}
                        <p className="text-[11px] text-discord-text-muted mt-2">
                          {tradingBuySitePlatform === 'default'
                            ? 'Follows the SOL platform from Settings → Contracts, so you only set it in one place.'
                            : tradingBuySitePlatform === 'custom'
                              ? 'Use {address} where the contract goes. Buys are Solana-only, so this is a SOL link.'
                              : 'Only affects buys — clicking a contract address still uses your Contracts setting.'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Misclick Protection</h4>
                    <Toggle
                      value={tradingRequireDoubleClick}
                      onChange={setTradingRequireDoubleClick}
                      label="Require a double click to fire a buy"
                    />
                    <p className="text-[11px] text-discord-text-muted mt-2">
                      Off by default: one click buys immediately. Turn this on and the first click arms the button —
                      click again within a moment to confirm.
                    </p>
                  </div>
                </div>
                )}
              </div>
            )}

            {section === 'sounds' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Sounds & Notifications</h3>

                  <div className="space-y-5">
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Desktop Notifications</h4>
                      <Toggle
                        value={desktopNotifications}
                        onChange={handleDesktopNotificationsToggle}
                        label="Show browser notifications for highlighted users and keyword matches (when tab is not focused)"
                      />
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-3">Sound Settings</h4>
                      <Toggle
                        value={messageSounds}
                        onChange={setMessageSounds}
                        label="Enable notification sounds (master toggle)"
                      />

                      {messageSounds && (
                        <div className="space-y-3 mt-4">
                          <input
                            type="file"
                            ref={fileInputRef}
                            accept=".mp3,.wav,.ogg,.webm,.m4a"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !uploadingSoundType) return;
                              const formData = new FormData();
                              formData.append('file', file);
                              try {
                                const res = await fetch(`/api/sounds/${uploadingSoundType}`, { method: 'POST', body: formData });
                                const data = await res.json();
                                if (res.ok && data.url) {
                                  setSoundSettings((prev) => ({
                                    ...prev,
                                    [uploadingSoundType]: { ...prev[uploadingSoundType], useCustom: true, customSoundUrl: data.url },
                                  }));
                                }
                              } catch { /* ignore */ }
                              setUploadingSoundType(null);
                              e.target.value = '';
                            }}
                          />
                          {([
                            ['highlight', 'Highlighted User'],
                            ['contractAlert', 'Contract Alert'],
                            ['keywordAlert', 'Keyword Match'],
                            ['premiumAlert', 'Cloud Alert (price / X / Telegram)'],
                          ] as [SoundType, string][]).map(([type, label]) => {
                            const sc = soundSettings[type];
                            return (
                              <div key={type} className="px-2 sm:px-3 py-2.5 sm:py-3 bg-discord-dark rounded space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <Volume2 size={14} className="text-discord-text-muted shrink-0" />
                                    <span className="text-xs sm:text-sm compact:text-sm text-discord-text font-medium">{label}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => previewSound(type, sc)}
                                      className="p-1 rounded hover:bg-discord-hover/50 text-discord-text-muted hover:text-discord-text transition-colors"
                                      title="Preview sound"
                                    >
                                      <Play size={14} />
                                    </button>
                                    <div
                                      className={`w-9 h-[18px] rounded-full transition-colors relative cursor-pointer ${
                                        sc.enabled ? 'bg-discord-green' : 'bg-discord-input'
                                      }`}
                                      onClick={() => setSoundSettings((prev) => ({
                                        ...prev,
                                        [type]: { ...prev[type], enabled: !prev[type].enabled },
                                      }))}
                                    >
                                      <div
                                        className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-transform ${
                                          sc.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
                                        }`}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {sc.enabled && (
                                  <>
                                    <div className="flex items-center gap-3">
                                      <span className="text-[11px] text-discord-text-muted w-12 shrink-0">Volume</span>
                                      <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={sc.volume}
                                        onChange={(e) => setSoundSettings((prev) => ({
                                          ...prev,
                                          [type]: { ...prev[type], volume: Number(e.target.value) },
                                        }))}
                                        className="flex-1 h-1.5 accent-discord-blurple cursor-pointer"
                                      />
                                      <span className="text-[11px] text-discord-text-muted w-8 text-right">{sc.volume}%</span>
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                        <span className="text-[11px] text-discord-text-muted">Sound:</span>
                                        <button
                                          onClick={() => setSoundSettings((prev) => ({
                                            ...prev,
                                            [type]: { ...prev[type], useCustom: false, presetSound: undefined },
                                          }))}
                                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                            !sc.useCustom && !sc.presetSound
                                              ? 'bg-discord-blurple text-white'
                                              : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                                          }`}
                                        >
                                          Default
                                        </button>
                                        <button
                                          onClick={() => setSoundSettings((prev) => ({
                                            ...prev,
                                            [type]: { ...prev[type], useCustom: false, presetSound: prev[type].presetSound || 'ping' },
                                          }))}
                                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                            !sc.useCustom && sc.presetSound
                                              ? 'bg-discord-blurple text-white'
                                              : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                                          }`}
                                        >
                                          Preset
                                        </button>
                                        <button
                                          onClick={() => {
                                            if (sc.customSoundUrl) {
                                              setSoundSettings((prev) => ({ ...prev, [type]: { ...prev[type], useCustom: true, presetSound: undefined } }));
                                            } else {
                                              setUploadingSoundType(type);
                                              fileInputRef.current?.click();
                                            }
                                          }}
                                          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                            sc.useCustom
                                              ? 'bg-discord-blurple text-white'
                                              : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                                          }`}
                                        >
                                          Custom
                                        </button>
                                      </div>
                                      {!sc.useCustom && sc.presetSound && (
                                        <div className="flex flex-wrap gap-1.5">
                                          {PRESET_SOUNDS.map((preset) => (
                                            <button
                                              key={preset.id}
                                              onClick={() => {
                                                setSoundSettings((prev) => ({ ...prev, [type]: { ...prev[type], presetSound: preset.id } }));
                                                previewPreset(preset.id, sc.volume);
                                              }}
                                              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${sc.presetSound === preset.id ? 'bg-discord-blurple text-white' : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'}`}
                                            >
                                              {preset.label}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      {sc.useCustom && (
                                        <div className="flex items-center gap-2">
                                          {sc.customSoundUrl && (
                                            <span className="text-[10px] text-discord-text-muted truncate">{sc.customSoundUrl.split('/').pop()}</span>
                                          )}
                                          <button
                                            onClick={() => { setUploadingSoundType(type); fileInputRef.current?.click(); }}
                                            className="p-1 rounded hover:bg-discord-hover/50 text-discord-text-muted hover:text-discord-text transition-colors"
                                            title="Upload sound"
                                          >
                                            <Upload size={12} />
                                          </button>
                                          {sc.customSoundUrl && (
                                            <button
                                              onClick={async () => {
                                                await fetch(`/api/sounds/${type}`, { method: 'DELETE' });
                                                setSoundSettings((prev) => ({
                                                  ...prev,
                                                  [type]: { ...prev[type], useCustom: false, customSoundUrl: undefined },
                                                }));
                                              }}
                                              className="text-discord-text-muted hover:text-discord-red transition-colors"
                                              title="Remove custom sound"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Channel Sounds</h4>
                      <p className="text-xs text-discord-text-muted mb-3">
                        Play a notification sound for every message in specific channels, even when no highlight or keyword matches.
                      </p>
                      <input
                        type="file"
                        ref={channelFileInputRef}
                        accept=".mp3,.wav,.ogg,.webm,.m4a"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !uploadingChannelId) return;
                          const formData = new FormData();
                          formData.append('file', file);
                          try {
                            const res = await fetch(`/api/channel-sounds/${uploadingChannelId}`, { method: 'POST', body: formData });
                            const data = await res.json();
                            if (res.ok && data.url) {
                              setChannelSounds((prev) => ({
                                ...prev,
                                [uploadingChannelId]: { ...(prev[uploadingChannelId] ?? { enabled: true, volume: 80, useCustom: false }), useCustom: true, customSoundUrl: data.url },
                              }));
                            }
                          } catch { /* ignore */ }
                          setUploadingChannelId(null);
                          e.target.value = '';
                        }}
                      />
                      {(() => {
                        const rooms = config?.rooms ?? [];
                        const seen = new Set<string>();
                        const channels: { id: string; name: string; guildName: string | null; source: 'discord' | 'telegram' }[] = [];
                        for (const room of rooms) {
                          for (const ch of room.channels) {
                            if (!seen.has(ch.channelId)) {
                              seen.add(ch.channelId);
                              channels.push({ id: ch.channelId, name: ch.channelName ?? ch.channelId, guildName: ch.guildName ?? null, source: (ch.source ?? 'discord') as 'discord' | 'telegram' });
                            }
                          }
                        }
                        if (channels.length === 0) return <p className="text-xs text-discord-text-muted italic">No channels in rooms yet</p>;

                        const discordChannels = channels.filter((c) => c.source !== 'telegram');
                        const telegramChannels = channels.filter((c) => c.source === 'telegram');

                        const discordGrouped = new Map<string, typeof channels>();
                        for (const ch of discordChannels) {
                          const key = ch.guildName ?? 'DMs';
                          if (!discordGrouped.has(key)) discordGrouped.set(key, []);
                          discordGrouped.get(key)!.push(ch);
                        }

                        const enabledIds = Object.keys(channelSounds);

                        return (
                          <div className="space-y-3">
                            {/* Channel picker */}
                            <div className="space-y-2">
                              {Array.from(discordGrouped.entries()).map(([guildName, guildChannels]) => (
                                <div key={guildName}>
                                  <p className="text-[10px] text-discord-text-muted uppercase tracking-wider mb-1">{guildName}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {guildChannels.map((ch) => {
                                      const active = ch.id in channelSounds;
                                      return (
                                        <button
                                          key={ch.id}
                                          onClick={() => {
                                            if (active) {
                                              setChannelSounds((prev) => {
                                                const next = { ...prev };
                                                delete next[ch.id];
                                                return next;
                                              });
                                            } else {
                                              setChannelSounds((prev) => ({
                                                ...prev,
                                                [ch.id]: { enabled: true, volume: 80, useCustom: false },
                                              }));
                                            }
                                          }}
                                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-discord-blurple text-white' : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'}`}
                                        >
                                          #{ch.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}

                              {telegramChannels.length > 0 && (
                                <div>
                                  <p className="text-[10px] text-[#2AABEE] uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Send size={9} />
                                    Telegram
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {telegramChannels.map((ch) => {
                                      const active = ch.id in channelSounds;
                                      return (
                                        <button
                                          key={ch.id}
                                          onClick={() => {
                                            if (active) {
                                              setChannelSounds((prev) => {
                                                const next = { ...prev };
                                                delete next[ch.id];
                                                return next;
                                              });
                                            } else {
                                              setChannelSounds((prev) => ({
                                                ...prev,
                                                [ch.id]: { enabled: true, volume: 80, useCustom: false },
                                              }));
                                            }
                                          }}
                                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-[#2AABEE] text-white' : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'}`}
                                        >
                                          {ch.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Per-channel sound configs */}
                            {enabledIds.length > 0 && (
                              <div className="space-y-2 mt-2">
                                {enabledIds.map((chId) => {
                                  const sc = channelSounds[chId];
                                  const chInfo = channels.find((c) => c.id === chId);
                                  const isTg = chInfo?.source === 'telegram';
                                  const label = chInfo ? (isTg ? chInfo.name : `#${chInfo.name}`) : `#${chId}`;
                                  return (
                                    <div key={chId} className="px-2 sm:px-3 py-2.5 sm:py-3 bg-discord-dark rounded space-y-2.5">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                          <Volume2 size={14} className="text-discord-text-muted shrink-0" />
                                          {isTg && <Send size={12} className="text-[#2AABEE] shrink-0" />}
                                          <span className="text-xs sm:text-sm compact:text-sm text-discord-text font-medium truncate">{label}</span>
                                          {isTg
                                            ? <span className="text-[10px] text-[#2AABEE] hidden sm:inline">Telegram</span>
                                            : chInfo?.guildName && <span className="text-[10px] text-discord-text-muted hidden sm:inline">{chInfo.guildName}</span>
                                          }
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => previewSound('highlight', sc)}
                                            className="p-1 rounded hover:bg-discord-hover/50 text-discord-text-muted hover:text-discord-text transition-colors"
                                            title="Preview sound"
                                          >
                                            <Play size={14} />
                                          </button>
                                          <div
                                            className={`w-9 h-[18px] rounded-full transition-colors relative cursor-pointer ${sc.enabled ? 'bg-discord-green' : 'bg-discord-input'}`}
                                            onClick={() => setChannelSounds((prev) => ({
                                              ...prev,
                                              [chId]: { ...prev[chId], enabled: !prev[chId].enabled },
                                            }))}
                                          >
                                            <div className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-transform ${sc.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                                          </div>
                                        </div>
                                      </div>

                                      {sc.enabled && (
                                        <>
                                          <div className="flex items-center gap-3">
                                            <span className="text-[11px] text-discord-text-muted w-12 shrink-0">Volume</span>
                                            <input
                                              type="range"
                                              min={0}
                                              max={100}
                                              value={sc.volume}
                                              onChange={(e) => setChannelSounds((prev) => ({
                                                ...prev,
                                                [chId]: { ...prev[chId], volume: Number(e.target.value) },
                                              }))}
                                              className="flex-1 h-1.5 accent-discord-blurple cursor-pointer"
                                            />
                                            <span className="text-[11px] text-discord-text-muted w-8 text-right">{sc.volume}%</span>
                                          </div>
                                          <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                              <span className="text-[11px] text-discord-text-muted">Sound:</span>
                                              <button
                                                onClick={() => setChannelSounds((prev) => ({ ...prev, [chId]: { ...prev[chId], useCustom: false, presetSound: undefined } }))}
                                                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${!sc.useCustom && !sc.presetSound ? 'bg-discord-blurple text-white' : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'}`}
                                              >
                                                Default
                                              </button>
                                              <button
                                                onClick={() => setChannelSounds((prev) => ({ ...prev, [chId]: { ...prev[chId], useCustom: false, presetSound: prev[chId].presetSound || 'ping' } }))}
                                                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${!sc.useCustom && sc.presetSound ? 'bg-discord-blurple text-white' : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'}`}
                                              >
                                                Preset
                                              </button>
                                              <button
                                                onClick={() => {
                                                  if (sc.customSoundUrl) {
                                                    setChannelSounds((prev) => ({ ...prev, [chId]: { ...prev[chId], useCustom: true, presetSound: undefined } }));
                                                  } else {
                                                    setUploadingChannelId(chId);
                                                    channelFileInputRef.current?.click();
                                                  }
                                                }}
                                                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${sc.useCustom ? 'bg-discord-blurple text-white' : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'}`}
                                              >
                                                Custom
                                              </button>
                                            </div>
                                            {!sc.useCustom && sc.presetSound && (
                                              <div className="flex flex-wrap gap-1.5">
                                                {PRESET_SOUNDS.map((preset) => (
                                                  <button
                                                    key={preset.id}
                                                    onClick={() => {
                                                      setChannelSounds((prev) => ({ ...prev, [chId]: { ...prev[chId], presetSound: preset.id } }));
                                                      previewPreset(preset.id, sc.volume);
                                                    }}
                                                    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${sc.presetSound === preset.id ? 'bg-discord-blurple text-white' : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'}`}
                                                  >
                                                    {preset.label}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                            {sc.useCustom && (
                                              <div className="flex items-center gap-2">
                                                {sc.customSoundUrl && (
                                                  <span className="text-[10px] text-discord-text-muted truncate">{sc.customSoundUrl.split('/').pop()}</span>
                                                )}
                                                <button
                                                  onClick={() => { setUploadingChannelId(chId); channelFileInputRef.current?.click(); }}
                                                  className="p-1 rounded hover:bg-discord-hover/50 text-discord-text-muted hover:text-discord-text transition-colors"
                                                  title="Upload sound"
                                                >
                                                  <Upload size={12} />
                                                </button>
                                                {sc.customSoundUrl && (
                                                  <button
                                                    onClick={async () => {
                                                      await fetch(`/api/channel-sounds/${chId}`, { method: 'DELETE' });
                                                      setChannelSounds((prev) => ({
                                                        ...prev,
                                                        [chId]: { ...prev[chId], useCustom: false, customSoundUrl: undefined },
                                                      }));
                                                    }}
                                                    className="text-discord-text-muted hover:text-discord-red transition-colors"
                                                    title="Remove custom sound"
                                                  >
                                                    <Trash2 size={12} />
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                  </div>
                </div>
              </>
            )}

            {section === 'pushover' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Pushover</h3>
                  <div className="space-y-4">
                    <p className="text-sm text-discord-text-muted">
                      Send push notifications to your phone via{' '}
                      <a href="https://pushover.net" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">
                        pushover.net
                      </a>
                      . Configure which events trigger notifications and filter by user, guild, or channel.
                    </p>

                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Setup Guide</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-start gap-2.5">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-discord-blurple text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                            <p className="text-sm text-discord-text">
                              Create a Pushover account at{' '}
                              <a href="https://pushover.net" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">pushover.net</a>
                              {' '}and install the app on your{' '}
                              <a href="https://pushover.net/clients" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">phone</a>.
                            </p>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-discord-blurple text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                            <p className="text-sm text-discord-text">
                              Copy your <span className="font-semibold text-white">User Key</span> from the{' '}
                              <a href="https://pushover.net" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">Pushover dashboard</a>
                              {' '}(shown at the top of the page after logging in).
                            </p>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-discord-blurple text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                            <div className="text-sm text-discord-text">
                              <p>
                                Create a new application at{' '}
                                <a href="https://pushover.net/apps/build" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">pushover.net/apps/build</a>:
                              </p>
                              <ul className="mt-1.5 ml-1 space-y-1 text-discord-text-muted text-xs">
                                <li className="flex items-start gap-1.5"><span className="text-discord-blurple font-bold">·</span> Name it anything (e.g. "Trenchcord")</li>
                                <li className="flex items-start gap-1.5"><span className="text-discord-blurple font-bold">·</span> Type: Application</li>
                                <li className="flex items-start gap-1.5"><span className="text-discord-blurple font-bold">·</span> Description and URL are optional</li>
                              </ul>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-discord-blurple text-white text-xs font-bold flex items-center justify-center mt-0.5">4</span>
                            <p className="text-sm text-discord-text">
                              Copy the <span className="font-semibold text-white">API Token/Key</span> from your newly created application page and paste it below.
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-discord-text-muted px-1">
                          Pushover offers a 30-day free trial, then a one-time $5 purchase per platform.
                        </p>
                      </div>
                    </details>

                    <Toggle
                      value={pushoverEnabled}
                      onChange={setPushoverEnabled}
                      label="Enable Pushover notifications"
                    />

                    {pushoverEnabled && (
                      <div className="space-y-4">
                        <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-3">
                          <h4 className="text-sm font-semibold text-white">Credentials</h4>
                          <div className="px-3 py-2 bg-discord-dark rounded">
                            <div className="relative flex items-center gap-1.5 mb-1">
                              <label className="text-[11px] text-discord-text-muted block">Application API Token</label>
                              <button
                                onClick={() => setAppTokenHelpOpen((v) => !v)}
                                className={`transition-colors ${appTokenHelpOpen ? 'text-white' : 'text-discord-text-muted hover:text-white'}`}
                                title="What is this?"
                              >
                                <HelpCircle size={12} />
                              </button>
                              {appTokenHelpOpen && (
                                <div className="absolute left-0 top-5 z-20 w-72 max-w-[80vw] p-3 bg-discord-darker rounded-md shadow-[0_8px_16px_rgba(0,0,0,0.24)] text-xs text-discord-text space-y-1.5">
                                  <p>
                                    The token identifying your own Pushover application — Trenchcord sends its
                                    notifications through it.
                                  </p>
                                  <p>
                                    Create a new application at{' '}
                                    <a href="https://pushover.net/apps/build" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">pushover.net/apps/build</a>
                                    {' '}— name it anything (e.g. "Trenchcord"), type: Application, description and
                                    URL are optional. Then copy the <span className="font-semibold text-white">API Token/Key</span>{' '}
                                    from your newly created application page and paste it here.
                                  </p>
                                </div>
                              )}
                            </div>
                            <input
                              type="password"
                              value={pushoverAppToken}
                              onChange={(e) => setPushoverAppToken(e.target.value)}
                              placeholder="azGDORePK8gMaC0QOYAMyEEuzJnyUi"
                              className="w-full bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                              autoComplete="off"
                              data-1p-ignore
                              data-lpignore="true"
                              data-form-type="other"
                            />
                          </div>
                          <div className="px-3 py-2 bg-discord-dark rounded">
                            <label className="text-[11px] text-discord-text-muted mb-1 block">User Key</label>
                            <input
                              type="password"
                              value={pushoverUserKey}
                              onChange={(e) => setPushoverUserKey(e.target.value)}
                              placeholder="uQiRzpo4DXghDmr9QzzfQu27cmVRsG"
                              className="w-full bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                              autoComplete="off"
                              data-1p-ignore
                              data-lpignore="true"
                              data-form-type="other"
                            />
                          </div>
                        </div>

                        <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-3">
                          <h4 className="text-sm font-semibold text-white">Triggers</h4>
                          <p className="text-xs text-discord-text-muted">Choose which events send a push notification.</p>
                          <Toggle
                            value={pushoverTriggers.highlightedUserContract}
                            onChange={(v) => setPushoverTriggers((p) => ({ ...p, highlightedUserContract: v }))}
                            label="Highlighted user posts a contract"
                          />
                          <Toggle
                            value={pushoverTriggers.highlightedUser}
                            onChange={(v) => setPushoverTriggers((p) => ({ ...p, highlightedUser: v }))}
                            label="Highlighted user sends any message"
                          />
                          <Toggle
                            value={pushoverTriggers.contract}
                            onChange={(v) => setPushoverTriggers((p) => ({ ...p, contract: v }))}
                            label="Any contract address detected"
                          />
                          <Toggle
                            value={pushoverTriggers.keyword}
                            onChange={(v) => setPushoverTriggers((p) => ({ ...p, keyword: v }))}
                            label="Keyword pattern matched"
                          />
                        </div>

                        <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-3">
                          <h4 className="text-sm font-semibold text-white">Filters</h4>
                          <p className="text-xs text-discord-text-muted">Narrow down which messages trigger notifications. Empty = no filter (all match).</p>

                          {/* User filter */}
                          <div className="px-2 sm:px-3 py-2 bg-discord-dark rounded space-y-2">
                            <label className="text-[11px] text-discord-text-muted block">Only from these highlighted users</label>
                            {(() => {
                              const allHighlighted = Array.from(new Set([
                                ...(config?.globalHighlightedUsers ?? []),
                                ...(config?.rooms ?? []).flatMap((r) => r.highlightedUsers),
                              ]));
                              if (allHighlighted.length === 0) return <p className="text-xs text-discord-text-muted italic">No highlighted users configured</p>;
                              return (
                                <div className="flex flex-wrap gap-1.5">
                                  {allHighlighted.map((uid) => {
                                    const active = pushoverFilters.userIds.includes(uid);
                                    return (
                                      <button
                                        key={uid}
                                        onClick={() => setPushoverFilters((f) => ({
                                          ...f,
                                          userIds: active ? f.userIds.filter((id) => id !== uid) : [...f.userIds, uid],
                                        }))}
                                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-discord-blurple text-white' : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'}`}
                                      >
                                        {userNameMap.get(uid) || uid}
                                      </button>
                                    );
                                  })}
                                  {pushoverFilters.userIds.length > 0 && (
                                    <button
                                      onClick={() => setPushoverFilters((f) => ({ ...f, userIds: [] }))}
                                      className="px-2 py-1 rounded text-xs text-red-400 hover:text-red-300 transition-colors"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* Guild filter */}
                          <div className="px-2 sm:px-3 py-2 bg-discord-dark rounded space-y-2">
                            <label className="text-[11px] text-discord-text-muted block">Only from these guilds</label>
                            {(() => {
                              const filtered = guilds.filter((g) => enabledGuilds.includes(g.id));
                              if (filtered.length === 0) return <p className="text-xs text-discord-text-muted italic">No enabled guilds</p>;
                              return (
                              <div className="flex flex-wrap gap-1.5">
                                {filtered.map((g) => {
                                  const active = pushoverFilters.guildIds.includes(g.id);
                                  return (
                                    <button
                                      key={g.id}
                                      onClick={() => setPushoverFilters((f) => ({
                                        ...f,
                                        guildIds: active ? f.guildIds.filter((id) => id !== g.id) : [...f.guildIds, g.id],
                                      }))}
                                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-discord-blurple text-white' : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'}`}
                                    >
                                      {g.name}
                                    </button>
                                  );
                                })}
                                {pushoverFilters.guildIds.length > 0 && (
                                  <button
                                    onClick={() => setPushoverFilters((f) => ({ ...f, guildIds: [] }))}
                                    className="px-2 py-1 rounded text-xs text-red-400 hover:text-red-300 transition-colors"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                              );
                            })()}
                          </div>

                          {/* Channel filter */}
                          <div className="px-2 sm:px-3 py-2 bg-discord-dark rounded space-y-2">
                            <label className="text-[11px] text-discord-text-muted block">Only from these channels</label>
                            {(() => {
                              const rooms = config?.rooms ?? [];
                              const seen = new Set<string>();
                              const channels: { id: string; name: string; guildName: string | null }[] = [];
                              for (const room of rooms) {
                                for (const ch of room.channels) {
                                  if (!seen.has(ch.channelId)) {
                                    seen.add(ch.channelId);
                                    channels.push({ id: ch.channelId, name: ch.channelName ?? ch.channelId, guildName: ch.guildName ?? null });
                                  }
                                }
                              }
                              if (channels.length === 0) return <p className="text-xs text-discord-text-muted italic">No channels in rooms</p>;
                              const grouped = new Map<string, typeof channels>();
                              for (const ch of channels) {
                                const key = ch.guildName ?? 'DMs';
                                if (!grouped.has(key)) grouped.set(key, []);
                                grouped.get(key)!.push(ch);
                              }
                              return (
                                <div className="space-y-2">
                                  {Array.from(grouped.entries()).map(([guildName, guildChannels]) => (
                                    <div key={guildName}>
                                      <p className="text-[10px] text-discord-text-muted uppercase tracking-wider mb-1">{guildName}</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {guildChannels.map((ch) => {
                                          const active = pushoverFilters.channelIds.includes(ch.id);
                                          return (
                                            <button
                                              key={ch.id}
                                              onClick={() => setPushoverFilters((f) => ({
                                                ...f,
                                                channelIds: active ? f.channelIds.filter((id) => id !== ch.id) : [...f.channelIds, ch.id],
                                              }))}
                                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-discord-blurple text-white' : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'}`}
                                            >
                                              #{ch.name}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                  {pushoverFilters.channelIds.length > 0 && (
                                    <button
                                      onClick={() => setPushoverFilters((f) => ({ ...f, channelIds: [] }))}
                                      className="px-2 py-1 rounded text-xs text-red-400 hover:text-red-300 transition-colors"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-3">
                          <h4 className="text-sm font-semibold text-white">Notification Settings</h4>
                          <div className="px-3 py-2 bg-discord-dark rounded">
                            <label className="text-[11px] text-discord-text-muted mb-1 block">Priority</label>
                            <select
                              value={pushoverPriority}
                              onChange={(e) => setPushoverPriority(Number(e.target.value) as PushoverPriority)}
                              className="w-full bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple"
                            >
                              <option value={-2}>Lowest (no alert)</option>
                              <option value={-1}>Low (no sound)</option>
                              <option value={0}>Normal</option>
                              <option value={1}>High (bypass quiet hours)</option>
                              <option value={2}>Emergency (repeats until acknowledged)</option>
                            </select>
                          </div>
                          <div className="px-3 py-2 bg-discord-dark rounded">
                            <label className="text-[11px] text-discord-text-muted mb-1 block">Sound</label>
                            <select
                              value={pushoverSound}
                              onChange={(e) => setPushoverSound(e.target.value as PushoverSound)}
                              className="w-full bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple capitalize"
                            >
                              {PUSHOVER_SOUNDS.map((s) => (
                                <option key={s} value={s}>{s === 'none' ? 'None (silent)' : s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {section === 'keywords' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Keywords</h3>

                  <div className="space-y-5">
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Keyword Alerts</h4>
                      <Toggle
                        value={keywordAlertsEnabled}
                        onChange={setKeywordAlertsEnabled}
                        label="Enable keyword/regex pattern matching alerts"
                      />
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Global Keyword Patterns</h4>
                      <p className="text-sm text-discord-text-muted mb-2">
                        Add patterns to match against messages globally. Use <strong className="text-discord-text">Contains</strong> for substring matches, <strong className="text-discord-text">Exact</strong> for whole-word matches, or <strong className="text-discord-text">Regex</strong> for advanced patterns.
                      </p>
                      <div className="text-xs text-discord-text-muted bg-discord-dark rounded px-3 py-2 mb-4 space-y-1">
                        <p className="font-semibold text-discord-text-muted/80">Regex examples:</p>
                        <p><code className="text-orange-400/80 font-mono">stealth\s*(launch|drop)</code> — stealth launch, stealthdrop</p>
                        <p><code className="text-orange-400/80 font-mono">\b(airdrop|air\s*drop)\b</code> — airdrop, air drop (whole word)</p>
                        <p><code className="text-orange-400/80 font-mono">deploy(ed|ing)?</code> — deploy, deployed, deploying</p>
                        <p><code className="text-orange-400/80 font-mono">ca\s*[:=]\s*0x[a-f0-9]+</code> — ca: 0xABC..., CA=0x...</p>
                        <p className="pt-1">Build & test patterns at <a href="https://regex101.com" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">regex101.com</a></p>
                      </div>

                      <div className="space-y-3 mb-4">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newKeywordPattern}
                            onChange={(e) => setNewKeywordPattern(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(); }}
                            placeholder={
                              newKeywordMatchMode === 'regex' ? 'Regex pattern (e.g. launch|stealth)'
                              : newKeywordMatchMode === 'exact' ? 'Exact word (e.g. launch)'
                              : 'Keyword (e.g. stealth launch)'
                            }
                            className="flex-1 bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple font-mono"
                          />
                          <button
                            onClick={addKeyword}
                            className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          <div className="flex rounded overflow-hidden border border-discord-divider shrink-0">
                            {(['includes', 'exact', 'regex'] as KeywordMatchMode[]).map((mode) => (
                              <button
                                key={mode}
                                onClick={() => setNewKeywordMatchMode(mode)}
                                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                  newKeywordMatchMode === mode
                                    ? 'bg-discord-blurple text-white'
                                    : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                                }`}
                              >
                                {mode === 'includes' ? 'Contains' : mode === 'exact' ? 'Exact' : 'Regex'}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={newKeywordLabel}
                            onChange={(e) => setNewKeywordLabel(e.target.value)}
                            placeholder="Label (optional)"
                            className="flex-1 bg-discord-dark border-none rounded px-3 py-1.5 text-xs text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        {globalKeywordPatterns.length === 0 && (
                          <p className="text-sm text-discord-text-muted text-center py-4">
                            No keyword patterns configured.
                          </p>
                        )}
                        {globalKeywordPatterns.map((kw, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 bg-discord-dark rounded">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                              {(kw.matchMode === 'regex' || (!kw.matchMode && kw.isRegex)) && (
                                <span className="text-[10px] px-1 sm:px-1.5 py-0.5 rounded bg-orange-400/20 text-orange-400 font-semibold shrink-0">REGEX</span>
                              )}
                              {kw.matchMode === 'exact' && (
                                <span className="text-[10px] px-1 sm:px-1.5 py-0.5 rounded bg-discord-blurple/20 text-discord-blurple font-semibold shrink-0">EXACT</span>
                              )}
                              <span className="text-xs sm:text-sm compact:text-sm text-discord-text font-mono truncate">{kw.pattern}</span>
                              {kw.label && (
                                <span className="text-[10px] sm:text-[11px] text-discord-text-muted hidden sm:inline">({kw.label})</span>
                              )}
                            </div>
                            <button
                              onClick={() => setGlobalKeywordPatterns((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-discord-text-muted hover:text-discord-red shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === 'mentions' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Mentions</h3>
                  <p className="text-sm text-discord-text-muted mb-4">
                    Collect messages where you were mentioned into the <strong className="text-discord-text">Mentions</strong> room. Only channels already added to your rooms are scanned.
                  </p>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg space-y-3">
                    <Toggle
                      value={mentionsUserEnabled}
                      onChange={setMentionsUserEnabled}
                      label="User mentions — when someone @-mentions you directly"
                    />
                    <Toggle
                      value={mentionsRoleEnabled}
                      onChange={setMentionsRoleEnabled}
                      label="Role mentions — when one of your roles is mentioned"
                    />
                    <Toggle
                      value={mentionsHereEnabled}
                      onChange={setMentionsHereEnabled}
                      label="@here — when @here is used in a channel you monitor"
                    />
                    <Toggle
                      value={mentionsEveryoneEnabled}
                      onChange={setMentionsEveryoneEnabled}
                      label="@everyone — when @everyone is used in a channel you monitor"
                    />
                    <Toggle
                      value={mentionsBotsEnabled}
                      onChange={setMentionsBotsEnabled}
                      label="Mentions from bots — include pings and replies from bots (Rick etc.); turn off to keep them out of Mentions"
                    />
                  </div>
                </div>
              </>
            )}

            {section === 'dms' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Direct Messages</h3>
                  <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3 sm:mb-4">
                    Every incoming Discord and Telegram DM collects into the <strong className="text-discord-text">All DMs</strong> feed.
                    Exclude users to keep their DMs out of the feed.
                    Their individual DM conversations stay available in the sidebar either way —
                    to remove a conversation from the sidebar too, use <strong className="text-discord-text">Hidden Conversations</strong> below.
                  </p>

                  <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg mb-4 sm:mb-6">
                    <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Telegram DMs</h4>
                    <Toggle
                      value={telegramDmsInAllDms}
                      onChange={setTelegramDmsInAllDms}
                      label="Collect Telegram DMs into the All DMs feed"
                    />
                    <p className="text-[11px] sm:text-xs text-discord-text-muted mt-2 leading-relaxed">
                      Turn off to keep every Telegram DM out of All DMs — for keeping only specific
                      senders out (spammy bots), leave this on and exclude them below instead. Individual
                      Telegram conversations in the sidebar are unaffected.
                    </p>
                  </div>

                  <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-1">Discord Excluded Users</h4>
                  <p className="text-[11px] sm:text-xs text-discord-text-muted mb-2 sm:mb-3">
                    By Discord user ID or username.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newDmExcludedUser}
                      onChange={(e) => setNewDmExcludedUser(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addDmExcludedUser()}
                      placeholder="User ID or username"
                      className="flex-1 bg-discord-sidebar border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                    <button
                      onClick={addDmExcludedUser}
                      className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-1 mb-4 sm:mb-6">
                    {dmExcludedUsers.length === 0 && (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        No excluded users — every Discord DM lands in All DMs.
                      </p>
                    )}
                    {dmExcludedUsers.map((entry) => (
                      <div key={entry} className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 bg-discord-sidebar rounded">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-xs sm:text-sm compact:text-sm text-discord-text font-mono truncate">{entry}</span>
                          {userNameMap.has(entry) && (
                            <span className="text-[10px] sm:text-[11px] text-discord-text-muted shrink-0">{userNameMap.get(entry)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removeDmExcludedUser(entry)}
                          className="text-discord-text-muted hover:text-discord-red shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-1">Telegram Excluded Users</h4>
                  <p className="text-[11px] sm:text-xs text-discord-text-muted mb-2 sm:mb-3">
                    By Telegram user ID or @username.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newTgDmExcludedUser}
                      onChange={(e) => setNewTgDmExcludedUser(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addTgDmExcludedUser()}
                      placeholder="User ID or @username"
                      className="flex-1 bg-discord-sidebar border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                    <button
                      onClick={addTgDmExcludedUser}
                      className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-1 mb-4 sm:mb-6">
                    {tgDmExcludedUsers.length === 0 && (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        No excluded users — every Telegram DM lands in All DMs.
                      </p>
                    )}
                    {tgDmExcludedUsers.map((entry) => (
                      <div key={entry} className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 bg-discord-sidebar rounded">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-xs sm:text-sm compact:text-sm text-discord-text font-mono truncate">{entry}</span>
                          {userNameMap.has(entry) && (
                            <span className="text-[10px] sm:text-[11px] text-discord-text-muted shrink-0">{userNameMap.get(entry)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removeTgDmExcludedUser(entry)}
                          className="text-discord-text-muted hover:text-discord-red shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Hidden Conversations</h3>
                  <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3 sm:mb-4">
                    Hide an account's DM conversation everywhere: it disappears from the sidebar's{' '}
                    <strong className="text-discord-text">Direct Messages</strong> and{' '}
                    <strong className="text-discord-text">Telegram DMs</strong> lists and from All DMs.
                    A Discord group chat is hidden when any member is listed.
                  </p>

                  <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-1">Hidden Conversations (Discord)</h4>
                  <p className="text-[11px] sm:text-xs text-discord-text-muted mb-2 sm:mb-3">
                    By Discord user ID or username.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newDmHiddenConversation}
                      onChange={(e) => setNewDmHiddenConversation(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addDmHiddenConversation()}
                      placeholder="User ID or username"
                      className="flex-1 bg-discord-sidebar border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                    <button
                      onClick={addDmHiddenConversation}
                      className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-1 mb-4 sm:mb-6">
                    {dmHiddenConversations.length === 0 && (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        No hidden conversations — every Discord DM shows in the sidebar.
                      </p>
                    )}
                    {dmHiddenConversations.map((entry) => (
                      <div key={entry} className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 bg-discord-sidebar rounded">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-xs sm:text-sm compact:text-sm text-discord-text font-mono truncate">{entry}</span>
                          {userNameMap.has(entry) && (
                            <span className="text-[10px] sm:text-[11px] text-discord-text-muted shrink-0">{userNameMap.get(entry)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removeDmHiddenConversation(entry)}
                          className="text-discord-text-muted hover:text-discord-red shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-1">Hidden Conversations (Telegram)</h4>
                  <p className="text-[11px] sm:text-xs text-discord-text-muted mb-2 sm:mb-3">
                    By Telegram user ID or @username.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newTgDmHiddenConversation}
                      onChange={(e) => setNewTgDmHiddenConversation(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addTgDmHiddenConversation()}
                      placeholder="User ID or @username"
                      className="flex-1 bg-discord-sidebar border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                    <button
                      onClick={addTgDmHiddenConversation}
                      className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {tgDmHiddenConversations.length === 0 && (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        No hidden conversations — every Telegram DM shows in the sidebar.
                      </p>
                    )}
                    {tgDmHiddenConversations.map((entry) => (
                      <div key={entry} className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 bg-discord-sidebar rounded">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-xs sm:text-sm compact:text-sm text-discord-text font-mono truncate">{entry}</span>
                          {userNameMap.has(entry) && (
                            <span className="text-[10px] sm:text-[11px] text-discord-text-muted shrink-0">{userNameMap.get(entry)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removeTgDmHiddenConversation(entry)}
                          className="text-discord-text-muted hover:text-discord-red shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {section === 'users' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Global Highlighted Users</h3>
                  <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3 sm:mb-4">
                    These users will be highlighted in all rooms. Use Discord user IDs or Telegram @usernames.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addGlobalUser()}
                      placeholder="User ID or @telegram_username"
                      className="flex-1 bg-discord-sidebar border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                    <button
                      onClick={addGlobalUser}
                      className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {globalUsers.length === 0 && (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        No global highlighted users.
                      </p>
                    )}
                    {globalUsers.map((uid) => {
                      const isTgUser = uid.startsWith('@');
                      return (
                      <div key={uid} className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 bg-discord-sidebar rounded">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          {isTgUser && <Send size={12} className="text-[#2AABEE] shrink-0" />}
                          <span className={`text-xs sm:text-sm compact:text-sm truncate ${isTgUser ? 'text-[#2AABEE]' : 'text-discord-text font-mono'}`}>{uid}</span>
                          {!isTgUser && userNameMap.has(uid) && (
                            <span className="text-[10px] sm:text-[11px] text-discord-text-muted shrink-0">{userNameMap.get(uid)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removeGlobalUser(uid)}
                          className="text-discord-text-muted hover:text-discord-red shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live-managed like hidden users: renames are saved the moment
                    they're made in chat, so this list edits the config directly
                    instead of going through the Save bar. */}
                <div className="mt-8 pt-6 border-t border-discord-divider">
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Custom Renames</h3>
                  <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3 sm:mb-4">
                    Names you've given users by clicking their name in chat → Rename User.
                    They replace the platform name everywhere in Trenchcord. Remove one to go
                    back to the user's real name.
                  </p>
                  <div className="space-y-1">
                    {Object.keys(config?.customUserNames ?? {}).length === 0 && (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        No custom renames yet.
                      </p>
                    )}
                    {Object.entries(config?.customUserNames ?? {}).map(([uid, name]) => (
                      <div key={uid} className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 bg-discord-sidebar rounded">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-xs sm:text-sm compact:text-sm text-discord-text truncate">{name}</span>
                          {userNameMap.has(uid) && userNameMap.get(uid) !== name && (
                            <span className="text-[10px] sm:text-[11px] text-discord-text-muted shrink-0 truncate">was {userNameMap.get(uid)}</span>
                          )}
                          <span className="text-[10px] sm:text-[11px] text-discord-text-muted/60 font-mono shrink-0 hidden sm:inline">{uid}</span>
                        </div>
                        <button
                          onClick={() => renameUser(uid, null)}
                          className="text-discord-text-muted hover:text-discord-red shrink-0"
                          title="Remove rename"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {section === 'account' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Account & Subscription</h3>
                  <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3 sm:mb-4">
                    Link this device to your Trenchcord account and manage your subscription. Your Discord and
                    Telegram data always stays on this machine.
                  </p>

                  <div className="bg-discord-sidebar rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-white font-medium">
                          {subscriptionStatus?.linked
                            ? subscriptionStatus.active
                              ? 'Subscription active'
                              : 'Subscription inactive'
                            : 'Not linked'}
                        </p>
                        <p className="text-xs text-discord-text-muted mt-0.5">
                          {subscriptionStatus?.linked
                            ? subscriptionStatus.entitledUntil
                              ? `${subscriptionStatus.active && !subscriptionStatus.inGrace ? 'Active until' : 'Expired'} ${new Date(subscriptionStatus.entitledUntil).toLocaleDateString()}`
                              : 'No subscription found for this account.'
                            : 'Link this device to your account to activate your subscription.'}
                          {subscriptionStatus?.inGrace && ' — running on the offline grace period.'}
                        </p>
                      </div>
                      <BadgeCheck
                        size={22}
                        className={subscriptionStatus?.active ? 'text-discord-green shrink-0' : 'text-discord-text-muted shrink-0'}
                      />
                    </div>
                  </div>

                  {!subscriptionStatus?.linked && !cloudPairing && (
                    <button
                      onClick={async () => {
                        setCloudBusy(true);
                        setCloudError(null);
                        const result = await startCloudLink();
                        setCloudBusy(false);
                        if (result.success && result.code) {
                          // No auto window.open — the "Open dashboard" link
                          // below covers it without yanking the user away.
                          setCloudPairing({ code: result.code, approveUrl: result.approveUrl });
                        } else {
                          setCloudError(result.error ?? 'Could not reach the account server.');
                        }
                      }}
                      disabled={cloudBusy}
                      className="flex items-center gap-2 px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors disabled:opacity-50"
                    >
                      {cloudBusy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                      Link this device
                    </button>
                  )}

                  {!subscriptionStatus?.linked && cloudPairing && (
                    <div className="bg-discord-sidebar rounded-lg p-4 text-center space-y-2">
                      <p className="text-xs text-discord-text-muted">
                        {isIOSApp()
                          ? 'Open your Trenchcord account on your computer and approve this code:'
                          : 'Approve this code on the dashboard:'}
                      </p>
                      <p className="font-mono text-xl tracking-widest text-white">{cloudPairing.code}</p>
                      {cloudPairing.approveUrl && (
                        <a
                          href={cloudPairing.approveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-discord-blurple hover:underline"
                        >
                          <ExternalLink size={13} /> Open dashboard
                        </a>
                      )}
                      <p className="text-xs text-discord-text-muted flex items-center justify-center gap-1.5">
                        <Loader2 size={11} className="animate-spin" /> Waiting for approval…
                      </p>
                    </div>
                  )}

                  {subscriptionStatus?.linked && (
                    <div className="flex flex-wrap gap-2">
                      {/* Blank on iOS: the backend withholds the URL there so no
                          route to billing is rendered (backend/src/platform.ts). */}
                      {subscriptionStatus.dashboardUrl && (
                        <a
                          href={subscriptionStatus.dashboardUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                        >
                          <ExternalLink size={14} /> Open web dashboard
                        </a>
                      )}
                      <button
                        onClick={async () => {
                          setCloudBusy(true);
                          await refreshCloudSubscription();
                          setCloudBusy(false);
                        }}
                        disabled={cloudBusy}
                        className="flex items-center gap-2 px-3 py-2 bg-discord-sidebar hover:bg-white/5 rounded text-sm text-discord-text transition-colors disabled:opacity-50"
                      >
                        {cloudBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Refresh status
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Unlink this device from your account? You can re-link it any time.')) {
                            unlinkCloud();
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-discord-sidebar hover:bg-discord-red/20 rounded text-sm text-discord-red transition-colors"
                      >
                        <Trash2 size={14} /> Unlink device
                      </button>
                    </div>
                  )}

                  {cloudError && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-discord-red">
                      <AlertTriangle size={14} /> {cloudError}
                    </p>
                  )}

                  {/* The dashboard, in-app: extend subscription, devices,
                      connected accounts (read-only), payment history. */}
                  {subscriptionStatus?.linked && !isHostedMode && <AccountPanel />}
                </div>
              </>
            )}

            {section === 'help' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Help & Features</h3>
                  <p className="text-sm text-discord-text-muted mb-6">
                    Everything you need to know about using Trenchcord.
                  </p>

                  <div className="space-y-4">
                    {/* Getting Started */}
                    <details className="group bg-discord-sidebar rounded-lg" open>
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Getting Started</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <div className="flex gap-2 items-start">
                          <span className="text-discord-blurple font-bold mt-0.5">1.</span>
                          <span>Go to <strong className="text-white">Settings &gt; Guilds</strong> and enable the Discord servers you want to monitor.</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="text-discord-blurple font-bold mt-0.5">2.</span>
                          <span>Click the <strong className="text-white">+</strong> button next to "Rooms" in the sidebar to create a room.</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="text-discord-blurple font-bold mt-0.5">3.</span>
                          <span>Add channels from your enabled guilds into the room. A single room can aggregate channels from multiple servers.</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="text-discord-blurple font-bold mt-0.5">4.</span>
                          <span>Messages from all added channels will stream into the room in real time.</span>
                        </div>
                      </div>
                    </details>

                    {/* Message Interactions */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Message Interactions</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2.5 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Channel Badge</p>
                          <p className="text-discord-text-muted text-xs">Click the <strong className="text-discord-text">server / #channel</strong> badge on any message to jump to the original message in Discord. Configure whether it opens in the Discord app or browser in Settings &gt; General.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Badge Click Action</p>
                          <p className="text-discord-text-muted text-xs">In Settings &gt; General, choose what badge clicks do: open in <strong className="text-discord-text">Discord</strong>, open in your <strong className="text-discord-text">trading platform</strong> (if a contract is detected), or <strong className="text-discord-text">both</strong>.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Image Lightbox</p>
                          <p className="text-discord-text-muted text-xs">Click any image in a message to view it fullscreen. Press <strong className="text-discord-text">ESC</strong> to close.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Compact Messages</p>
                          <p className="text-discord-text-muted text-xs">Messages from the same author within 5 minutes are grouped together. Hover over a compact message to see its timestamp.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Right-Click Users</p>
                          <p className="text-discord-text-muted text-xs">Right-click a username to access the context menu where you can hide that user from the channel.</p>
                        </div>
                      </div>
                    </details>

                    {/* Focus Mode */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Focus Mode</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">When a room has multiple channels, you can temporarily filter to a single channel:</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Enter:</span> <span className="text-discord-text-muted">Click the</span> <Eye size={13} className="inline text-discord-text-muted mx-0.5" /> <span className="text-discord-text-muted">eye icon on any message to focus on that message's channel.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Active:</span> <span className="text-discord-text-muted">A "Focus Mode" badge appears in the channel header showing which channel you're filtering to. Only messages from that channel are displayed.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Exit:</span> <span className="text-discord-text-muted">Click the</span> <span className="text-white font-bold mx-0.5">&times;</span> <span className="text-discord-text-muted">on the badge to return to the full room view.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Chat / Quick Reply */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Chat / Quick Reply</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">Send messages directly from the Trenchcord dashboard without switching to Discord.</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Enable:</span> <span className="text-discord-text-muted">Go to Settings &gt; General and turn on <strong className="text-discord-text">Chat / Send Messages</strong> (disabled by default).</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Channel Selector:</span> <span className="text-discord-text-muted">Use the <strong className="text-discord-text">#</strong> icon in the message bar to pick which channel to send to.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Quick Reply:</span> <span className="text-discord-text-muted">Click the reply icon on any message to instantly select that channel in the input bar.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Focus Mode:</span> <span className="text-discord-text-muted">When focus mode is active, the chat input automatically targets the focused channel.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Attachments:</span> <span className="text-discord-text-muted">Attach images and files via the <strong className="text-discord-text">+</strong> button or paste from clipboard (up to 10 files).</span></p>
                        </div>
                        <div className="px-3 py-2 bg-discord-red/10 border border-discord-red/20 rounded">
                          <p className="text-xs text-discord-red font-semibold mb-0.5">Detection Risk</p>
                          <p className="text-xs text-discord-text-muted">Sending messages through a third-party client increases the risk of Discord detecting and flagging your account. Read-only monitoring is passive and much safer.</p>
                        </div>
                      </div>
                    </details>

                    {/* Contract Detection */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Contract Detection</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">Trenchcord automatically detects Solana and EVM contract addresses in messages.</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#14f195]/20 text-[#14f195] mr-1">SOL</span> <span className="text-discord-text-muted">Solana addresses appear as green pills.</span></p>
                          <p className="text-xs"><span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fee75c]/20 text-[#fee75c] mr-1">EVM</span> <span className="text-discord-text-muted">EVM addresses (0x...) appear as yellow pills.</span></p>
                          <p className="text-xs text-discord-text-muted">Click a contract to <strong className="text-discord-text">copy</strong> and/or <strong className="text-discord-text">open</strong> it in your configured trading platform (configurable in Settings &gt; Contracts).</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Contracts Dashboard</p>
                          <p className="text-discord-text-muted text-xs">Click <strong className="text-discord-text">Contracts</strong> in the sidebar to see a live feed of all detected contracts, searchable and filterable by chain.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Auto-Open</p>
                          <p className="text-discord-text-muted text-xs">Enable "Auto-Open Highlighted Contracts" in Settings &gt; Contracts to automatically open a new tab when a highlighted user posts a contract.</p>
                        </div>
                      </div>
                    </details>

                    {/* User Highlighting */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">User Highlighting</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">Track specific Discord users to never miss their messages.</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Global:</span> <span className="text-discord-text-muted">Add user IDs in Settings &gt; Highlighted Users. These users are highlighted in all rooms.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Per-Room:</span> <span className="text-discord-text-muted">Edit a room (hover &gt; gear icon) &gt; Users tab to add room-specific highlights.</span></p>
                          <p className="text-xs text-discord-text-muted">Highlighted messages appear with a <span className="text-blue-400 font-medium">blue border</span>. Toast alerts pop up in the corner when they send a message.</p>
                        </div>
                      </div>
                    </details>

                    {/* Role Highlighting & Muting */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Role Highlighting & Muting</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">Highlight or mute entire Discord server roles instead of managing users one by one.</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Highlight by Role:</span> <span className="text-discord-text-muted">Right-click a username &gt; "Highlight by Role" and pick one of their roles. Messages from anyone holding that role light up and alert, just like highlighted users. Saved per room.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Custom Colors:</span> <span className="text-discord-text-muted">In room config &gt; Roles tab, give each highlighted role its own color. If a user has their own highlight color, it takes priority over the role color.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Mute by Role:</span> <span className="text-discord-text-muted">Right-click a username &gt; "Mute by Role" to hide messages from everyone holding that role. Applies server-wide, immediately.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Manage:</span> <span className="text-discord-text-muted">Room config &gt; Roles tab lists highlighted and muted roles with a searchable list of all server roles. Muted roles also appear in the hidden-users panel in the channel header.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Keyword Alerts */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Keyword Alerts</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">Get alerted when messages match your keyword patterns.</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Global:</span> <span className="text-discord-text-muted">Settings &gt; Keywords — matched in all rooms.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Per-Room:</span> <span className="text-discord-text-muted">Room config &gt; Keywords tab — only matched in that room.</span></p>
                          <p className="text-xs text-discord-text-muted">Three match modes: <strong className="text-discord-text">Contains</strong> (substring), <strong className="text-discord-text">Exact</strong> (whole word), and <strong className="text-discord-text">Regex</strong> (advanced patterns).</p>
                          <p className="text-xs text-discord-text-muted">Matched messages appear with an <span className="text-orange-400 font-medium">orange border</span>.</p>
                        </div>
                      </div>
                    </details>

                    {/* Room Configuration */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Room Configuration</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Edit/Delete:</span> <span className="text-discord-text-muted">Hover over a room in the sidebar to reveal the gear (edit) and trash (delete) icons.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Room Color:</span> <span className="text-discord-text-muted">Set a custom background color for the room in the config modal.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Disable Embeds:</span> <span className="text-discord-text-muted">Toggle embeds off for specific channels in the Channels tab of room config.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">User Filter:</span> <span className="text-discord-text-muted">In the Filter tab, add user IDs to only show messages from those users in the room.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* User Management */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Hiding Users</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Hide:</span> <span className="text-discord-text-muted">Right-click any username &gt; "Hide user" to hide them from that specific channel.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Manage:</span> <span className="text-discord-text-muted">Click the hidden users icon in the channel header to view and unhide users.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Sounds & Notifications */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Sounds & Notifications</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs text-discord-text-muted">Independent sound channels with individual volume controls:</p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Highlighted User:</span> <span className="text-discord-text-muted">Plays when a highlighted user sends a message.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Contract Alert:</span> <span className="text-discord-text-muted">Plays when a contract address is detected.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Keyword Match:</span> <span className="text-discord-text-muted">Plays when a keyword pattern matches.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Alert Fired:</span> <span className="text-discord-text-muted">Plays when a premium Alert (price / X / Telegram) fires.</span></p>
                          <p className="text-xs text-discord-text-muted">Upload custom sounds (MP3, WAV, OGG) or use built-in tones, plus optional per-room and per-channel sounds. Configure in Settings &gt; Sounds.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="font-medium text-white text-xs mb-1">Desktop Notifications</p>
                          <p className="text-xs text-discord-text-muted">Enable in Settings &gt; Sounds &amp; Notifications. Browser notifications appear when the tab is not focused and a highlighted user or keyword match is detected.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="font-medium text-white text-xs mb-1">Pushover</p>
                          <p className="text-xs text-discord-text-muted">Push notifications to your phone via Pushover when highlighted users post contracts. Configure in Settings &gt; Pushover.</p>
                        </div>
                      </div>
                    </details>

                    {/* Guild Colors */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Guild Colors</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="text-xs text-discord-text-muted">In Settings &gt; Guilds, assign a background color to each server. In rooms with multiple guilds, messages are color-coded so you can instantly tell which server a message came from.</p>
                        </div>
                      </div>
                    </details>

                    {/* DMs */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Direct Messages</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="text-xs text-discord-text-muted">DMs automatically appear in the sidebar under "Direct Messages" when you receive new messages. Click one to view the conversation.</p>
                        </div>
                      </div>
                    </details>

                    {/* Multiple Tokens */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Multiple Accounts</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="text-xs text-discord-text-muted">Add multiple Discord tokens in Settings &gt; Tokens to monitor channels across different accounts simultaneously. All guilds and channels from all tokens are available when creating rooms.</p>
                        </div>
                      </div>
                    </details>

                    {/* Telegram */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Telegram Channels</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs text-discord-text-muted">Connect a Telegram account in Settings &gt; Tokens and add Telegram channels or groups into your rooms right next to Discord channels — contract detection, highlighting, keywords, sounds, and snipes all work the same on Telegram messages.</p>
                          <p className="text-xs text-discord-text-muted">Assign colors to Telegram chats in Settings &gt; Guilds so mixed rooms stay readable.</p>
                        </div>
                      </div>
                    </details>

                    {/* Split screen */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Split Screen</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Add a pane:</span> <span className="text-discord-text-muted">Click the <strong className="text-discord-text">+</strong> in a pane header to open another room side by side — up to 4 panes.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Layout:</span> <span className="text-discord-text-muted">Choose columns or a 2×2 grid in Settings &gt; General.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Lock:</span> <span className="text-discord-text-muted">The lock icon pins a pane to its room, so hotkeys and the switcher only affect the others.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Switch rooms:</span> <span className="text-discord-text-muted">The pane title is a room switcher — feeds (Contracts, Mentions, Keywords, Snipes, Alerts) can be opened in a pane too.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Pop-out windows */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Pop-out Windows</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="text-xs text-discord-text-muted">Click the pop-out icon in a pane header to move that room (or feed) into its own window — drag it to a second monitor and it keeps streaming live, independently of the main window.</p>
                        </div>
                      </div>
                    </details>

                    {/* Feeds */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Built-in Feeds</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Contracts:</span> <span className="text-discord-text-muted">Every detected contract with who posted it, where, and the message — searchable, filterable by chain.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Mentions:</span> <span className="text-discord-text-muted">Messages that @you, your roles, @here or @everyone (each type can be toggled in Settings &gt; Mentions).</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Keywords:</span> <span className="text-discord-text-muted">Every keyword-matched message with its matched-keyword badge.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Snipes:</span> <span className="text-discord-text-muted">Every message that triggered a snipe, with a colored outcome badge — plus your snipe configs at the top.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Alerts:</span> <span className="text-discord-text-muted">Your cloud alerts and their fired history.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Trading */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Trading (Slotshark)</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs text-discord-text-muted">Connect a Slotshark API token in Settings &gt; Trading and one-click buy buttons appear under every message with a Solana contract, using your preset amounts, wallets, slippage, tip, and priority fee.</p>
                          <p className="text-xs text-discord-text-muted">Multiple wallets are supported — buy per wallet or split the amount — with an optional double-click safety and a sell flow from the same buttons.</p>
                        </div>
                      </div>
                    </details>

                    {/* Sniping */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Auto-Sniping</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Enable:</span> <span className="text-discord-text-muted">Turn on Sniping in Settings &gt; Trading (Trading + a Slotshark token required).</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Configs:</span> <span className="text-discord-text-muted">Created on the <strong className="text-discord-text">Snipes</strong> feed page: pick a room, follow specific callers or the whole room, set the SOL amount and wallets.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Extras:</span> <span className="text-discord-text-muted">Keyword → contract maps, market-cap bounds, re-snipe policies (never / cooldown / up to X times), automatic limit sells, and an optional Pushover ping per snipe.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Alerts */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Alerts (Trenchcord Cloud)</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs text-discord-text-muted">Alerts that fire even while your PC is off, because they run on Trenchcord Cloud (requires an active subscription) — managed on the <strong className="text-discord-text">Alerts</strong> page (sidebar).</p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Price:</span> <span className="text-discord-text-muted">CEX coins, DEX tokens (by market cap), stocks, and metals — goes over/under or ±% moves.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">X accounts:</span> <span className="text-discord-text-muted">New posts, keywords, replies, interactions with a post, new follows.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Telegram channels:</span> <span className="text-discord-text-muted">Any post or keyword in a public channel — your own Telegram login is never used.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Delivery:</span> <span className="text-discord-text-muted">Pushover, Telegram DM, or Discord DM to your phone, plus in-app toasts and the Alerts feed. Priorities and sounds are fully customizable in the page's Sound settings.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Hotkeys */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Hotkeys</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Room hotkeys:</span> <span className="text-discord-text-muted">Assign a single key to a room in its config — press it to jump there.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Feed hotkeys:</span> <span className="text-discord-text-muted">Same for the Contract feed, Mentions, Keywords, Snipes, and Alerts, in Settings &gt; General.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Bring to front:</span> <span className="text-discord-text-muted">An OS-wide shortcut (Settings &gt; General) that raises Trenchcord from anywhere — even while you're in Discord.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Rich Discord content */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Threads, Polls & Rich Content</span>
                      </summary>
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Threads & forums:</span> <span className="text-discord-text-muted">Messages in threads and forum posts under monitored channels arrive labeled <strong className="text-discord-text">parent › thread-title</strong>.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Polls:</span> <span className="text-discord-text-muted">Native Discord polls render with options and live vote percentages.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Bot panels & forwards:</span> <span className="text-discord-text-muted">New-style bot messages (layout containers, galleries, buttons) and forwarded messages render fully — contract detection, keywords, and snipes see their text too.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Stickers & GIFs:</span> <span className="text-discord-text-muted">Stickers display (including animated), Tenor/Giphy links autoplay as looping clips, and videos play inline.</span></p>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              </>
            )}

            {section === 'backup' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Backup & Restore</h3>
                  <p className="text-sm text-discord-text-muted mb-6">
                    Export your settings and rooms to a file, or import from a previous backup.{' '}
                    {isHostedMode
                      ? 'Sensitive keys (Discord tokens, Telegram credentials, Pushover keys) are never included in exports.'
                      : 'This includes your Discord tokens and Telegram credentials (API ID, hash, and session), so keep the file somewhere safe. Pushover keys are not included.'}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleExport}
                      disabled={exporting}
                      className="flex items-center gap-2 px-4 py-2 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
                    >
                      <Download size={15} />
                      {exporting ? 'Exporting...' : 'Export Settings'}
                    </button>
                    <button
                      onClick={() => importFileRef.current?.click()}
                      disabled={importing}
                      className="flex items-center gap-2 px-4 py-2 bg-discord-sidebar hover:bg-discord-hover text-discord-text hover:text-white text-sm font-medium rounded border border-discord-divider transition-colors"
                    >
                      <Upload size={15} />
                      {importing ? 'Importing...' : 'Import Settings'}
                    </button>
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".json"
                      onChange={handleImportFile}
                      className="hidden"
                    />
                  </div>
                  {pendingImportData && (
                    <div className="mt-4 p-3 bg-[#2AABEE]/10 border border-[#2AABEE]/20 rounded space-y-3">
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text leading-relaxed">
                        This backup includes your <strong>Telegram login</strong>. A Telegram session
                        only works on one device at a time — if this device and your computer both
                        use it, Telegram logs <strong>both</strong> out.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void runImport(pendingImportData, 'fresh')}
                          disabled={importing}
                          className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 text-white text-xs sm:text-sm compact:text-sm font-medium rounded transition-colors"
                        >
                          Import without it — I'll log in here (recommended)
                        </button>
                        <button
                          onClick={() => void runImport(pendingImportData, 'reuse')}
                          disabled={importing}
                          className="px-3 py-2 bg-discord-sidebar hover:bg-discord-hover disabled:opacity-50 text-discord-text text-xs sm:text-sm compact:text-sm font-medium rounded border border-discord-divider transition-colors"
                        >
                          Move the session here
                        </button>
                        <button
                          onClick={() => setPendingImportData(null)}
                          disabled={importing}
                          className="px-3 py-2 text-discord-text-muted hover:text-discord-text text-xs sm:text-sm compact:text-sm transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {importError && (
                    <p className="mt-3 text-xs text-discord-red">{importError}</p>
                  )}
                  {importSuccess && (
                    <p className="mt-3 text-xs text-discord-green">Settings imported successfully.</p>
                  )}
                </div>
              </>
            )}

            {section === 'guilds' && (
              <>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Guilds</h3>

                  <div className="space-y-5">
                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Enabled Guilds</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Only enabled guilds will appear in the channel picker when creating rooms. All guilds are off by default.
                      </p>
                      <div className="relative mb-3">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-text-muted" />
                        <input
                          type="text"
                          value={guildSearch}
                          onChange={(e) => setGuildSearch(e.target.value)}
                          placeholder="Search guilds..."
                          className="w-full bg-discord-dark border-none rounded px-3 py-2 pl-9 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                        />
                      </div>
                      <div className="text-[11px] text-discord-text-muted mb-2">
                        {enabledGuilds.length} of {guilds.length} guilds enabled
                      </div>
                      <div className="space-y-1 max-h-[350px] overflow-y-auto">
                        {guilds
                          .filter((g) => !guildSearch || g.name.toLowerCase().includes(guildSearch.toLowerCase()))
                          .sort((a, b) => {
                            const aEnabled = enabledGuilds.includes(a.id) ? 0 : 1;
                            const bEnabled = enabledGuilds.includes(b.id) ? 0 : 1;
                            return aEnabled - bEnabled;
                          })
                          .map((guild) => {
                            const enabled = enabledGuilds.includes(guild.id);
                            return (
                              <button
                                key={guild.id}
                                onClick={() => {
                                  setEnabledGuilds((prev) =>
                                    enabled ? prev.filter((id) => id !== guild.id) : [...prev, guild.id]
                                  );
                                }}
                                className={`w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded text-xs sm:text-sm compact:text-sm text-left transition-colors ${
                                  enabled
                                    ? 'bg-discord-green/10 text-discord-text'
                                    : 'bg-discord-dark/50 text-discord-text-muted'
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                                    enabled
                                      ? 'bg-discord-green border-discord-green'
                                      : 'border-discord-channel-icon bg-transparent'
                                  }`}
                                >
                                  {enabled && (
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                      <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                                <Users size={14} className="shrink-0 opacity-60" />
                                <span className="truncate flex-1">{guild.name}</span>
                                <span className="text-[11px] text-discord-text-muted shrink-0">
                                  {guild.channels.length} ch
                                </span>
                              </button>
                            );
                          })}
                        {guilds.length === 0 && (
                          <p className="text-sm text-discord-text-muted text-center py-2">Loading guilds...</p>
                        )}
                        {guilds.length > 0 && guilds.filter((g) => !guildSearch || g.name.toLowerCase().includes(guildSearch.toLowerCase())).length === 0 && (
                          <p className="text-sm text-discord-text-muted text-center py-2">No guilds match your search.</p>
                        )}
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">Guild Message Colors</h4>
                      <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                        Set a background color for messages from each enabled guild to visually distinguish them in mixed rooms.
                      </p>
                      <div className="space-y-2">
                        {guilds.filter((g) => enabledGuilds.includes(g.id)).map((guild) => (
                          <div key={guild.id} className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-discord-dark rounded">
                            <ColorPickerWithAlpha
                              value={guildColors[guild.id] || '#313338'}
                              onChange={(c) => setGuildColors((prev) => ({ ...prev, [guild.id]: c }))}
                              defaultColor="#313338"
                            />
                            <span className="text-xs sm:text-sm compact:text-sm text-discord-text flex-1 truncate">{guild.name}</span>
                            {guildColors[guild.id] && (
                              <button
                                onClick={() => setGuildColors((prev) => { const { [guild.id]: _, ...rest } = prev; return rest; })}
                                className="text-discord-text-muted hover:text-white"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        {enabledGuilds.length === 0 && (
                          <p className="text-sm text-discord-text-muted text-center py-2">Enable some guilds above first.</p>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const dmChannelIdsInRooms = [...new Set(
                        rooms.flatMap((r) => r.channels.filter((c) => !c.guildId).map((c) => c.channelId))
                      )];
                      if (dmChannelIdsInRooms.length === 0) return null;
                      return (
                        <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                          <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2">DM Message Colors</h4>
                          <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                            Set a background color for messages from each DM that is added to a room.
                          </p>
                          <div className="space-y-2">
                            {dmChannelIdsInRooms.map((channelId) => {
                              const dm = dmChannels.find((d) => d.id === channelId);
                              const dmName = dm
                                ? dm.recipients.map((r) => r.global_name || r.username).join(', ')
                                : channelId;
                              return (
                                <div key={channelId} className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-discord-dark rounded">
                                  <ColorPickerWithAlpha
                                    value={dmColors[channelId] || '#313338'}
                                    onChange={(c) => setDmColors((prev) => ({ ...prev, [channelId]: c }))}
                                    defaultColor="#313338"
                                  />
                                  <span className="text-xs sm:text-sm compact:text-sm text-discord-text flex-1 truncate">{dmName}</span>
                                  {dmColors[channelId] && (
                                    <button
                                      onClick={() => setDmColors((prev) => { const { [channelId]: _, ...rest } = prev; return rest; })}
                                      className="text-discord-text-muted hover:text-white"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {(() => {
                      const tgChannelIdsInRooms = [...new Set(
                        rooms.flatMap((r) => r.channels.filter((c) => c.source === 'telegram').map((c) => c.channelId))
                      )];
                      if (tgChannelIdsInRooms.length === 0) return null;
                      return (
                        <div className="p-3 sm:p-4 bg-discord-sidebar rounded-lg">
                          <h4 className="text-xs sm:text-sm compact:text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
                            <Send size={14} className="text-[#2AABEE]" />
                            Telegram Chat Colors
                          </h4>
                          <p className="text-xs sm:text-sm compact:text-sm text-discord-text-muted mb-3">
                            Set a background color for messages from each Telegram chat that is added to a room.
                          </p>
                          <div className="space-y-2">
                            {tgChannelIdsInRooms.map((channelId) => {
                              const channelRef = rooms.flatMap((r) => r.channels).find((c) => c.channelId === channelId && c.source === 'telegram');
                              const chatName = channelRef?.channelName ?? channelId;
                              return (
                                <div key={channelId} className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-discord-dark rounded">
                                  <ColorPickerWithAlpha
                                    value={telegramColors[channelId] || '#313338'}
                                    onChange={(c) => setTelegramColors((prev) => ({ ...prev, [channelId]: c }))}
                                    defaultColor="#313338"
                                  />
                                  <span className="text-xs sm:text-sm compact:text-sm text-discord-text flex-1 truncate">{chatName}</span>
                                  {telegramColors[channelId] && (
                                    <button
                                      onClick={() => setTelegramColors((prev) => { const { [channelId]: _, ...rest } = prev; return rest; })}
                                      className="text-discord-text-muted hover:text-white"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
          )}
        </div>

        {/* Save bar */}
        <div className={`border-t px-3 sm:px-8 py-2.5 sm:py-3 compact:pb-[calc(0.625rem+var(--safe-bottom))] flex items-center justify-between gap-2 sm:gap-3 shrink-0 transition-colors ${
          hasUnsavedChanges ? 'border-discord-yellow/30 bg-discord-yellow/5' : 'border-discord-divider bg-discord-dark'
        }`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-[11px] text-discord-text-muted select-text whitespace-nowrap">
              Trenchcord v{__APP_VERSION__}
            </span>
            <span className={`text-[11px] sm:text-sm transition-opacity ${hasUnsavedChanges ? 'opacity-100 text-discord-yellow' : 'opacity-0'}`}>
              Unsaved changes
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {hasUnsavedChanges && (
              <button
                onClick={() => { if (config) fetchConfig(); }}
                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm compact:text-sm text-discord-text-muted hover:text-white font-medium transition-colors"
              >
                Reset
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
              className={`px-4 sm:px-5 py-1.5 sm:py-2 rounded text-xs sm:text-sm compact:text-sm text-white font-medium transition-colors ${
                hasUnsavedChanges
                  ? 'bg-discord-green hover:bg-discord-green/80'
                  : 'bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
