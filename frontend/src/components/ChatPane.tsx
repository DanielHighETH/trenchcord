import { useEffect, useRef, useCallback, useState, useMemo, type ReactNode } from 'react';
import { useAppStore, backendFetch } from '../stores/appStore';
import Message from './Message';
import ChatInput from './ChatInput';
import AlertsPage from './AlertsPage';
import SnipesPanel from './SnipesPanel';
import ConfirmModal from './ConfirmModal';
import { isIOSApp, isCompactLayout, useCompactLayout } from '../utils/platform';
import { messageFallbackText } from '../utils/addressDetect';
import { dmListMatches } from '../utils/dmFilters';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { Hash, MessageCircle, Settings, ArrowDown, Filter, EyeOff, X, Trash2, Eye, Search, ChevronUp, ChevronDown, PanelLeftOpen, Send, AtSign, Tag, Crosshair, BellRing, GripVertical, Plus, Rows2, Columns2, ArrowLeft, ArrowRight, Lock, Unlock, ExternalLink, MoreVertical, Check, Shield, RefreshCw, Volume2, VolumeX, MessagesSquare, Eraser } from 'lucide-react';

const MAX_PANES = 4;

// Virtual feed rooms: live like rooms in `messages`, but have no Room config.
const FEED_VIEWS = {
  mentions: { title: 'Mentions', icon: AtSign, empty: 'No mentions yet.' },
  keywords: { title: 'Keywords', icon: Tag, empty: 'No keyword matches yet.' },
  snipes: { title: 'Snipes', icon: Crosshair, empty: 'No snipes yet.' },
  alerts: { title: 'Alerts', icon: BellRing, empty: 'No alerts yet.' },
  dms: { title: 'All DMs', icon: MessagesSquare, empty: 'No direct messages yet.' },
} as const;

const SCROLL_THRESHOLD = 150;
const WINDOW_INITIAL = 200;
const WINDOW_GROW = 200;
const LOAD_MORE_THRESHOLD = 300;

function formatTime(ts: string | number | Date) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

type FocusFilter = { guildId: string | null; channelId: string; guildName: string | null; channelName: string } | null;

// Instant styled hover label ("legend") for the compact header icon buttons.
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip flex items-center">
      {children}
      <span className="pointer-events-none absolute top-full right-0 mt-1.5 z-50 whitespace-nowrap rounded bg-discord-dark px-2 py-1 text-[11px] font-medium text-discord-text shadow-lg border border-black/30 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-100">
        {label}
      </span>
    </div>
  );
}

/**
 * Onboarding shown in an empty Snipes feed while the Slotshark/trading/sniping
 * chain isn't fully set up -- a blank "No snipes yet." tells a new user
 * nothing about why nothing will ever appear.
 */
function SnipesSetupGuide({ hasToken, tradingOn, snipingEnabled, openSettings }: {
  hasToken: boolean;
  tradingOn: boolean;
  snipingEnabled: boolean;
  openSettings: (section: string) => void;
}) {
  const steps: { done: boolean; title: string; body: ReactNode; action?: { label: string; section: string } }[] = [
    {
      done: hasToken,
      title: 'Create a Slotshark account',
      body: (
        <>
          Sniping buys through Slotshark, a Solana trading API. Register at{' '}
          <a
            href="https://slotshark.xyz/?ref=1q79wsl2"
            target="_blank"
            rel="noopener noreferrer"
            className="text-discord-text-link hover:underline inline-flex items-center gap-0.5"
          >
            slotshark.xyz <ExternalLink size={10} />
          </a>
          .
        </>
      ),
    },
    {
      done: hasToken,
      title: 'Get your API token and a wallet',
      body: 'In the Slotshark dashboard, create a trading wallet, deposit some SOL into it, and copy your API token.',
    },
    {
      done: hasToken && tradingOn,
      title: 'Connect it to Trenchcord',
      body: 'Paste the API token in Settings → Trading, add your wallet address, and enable Trading. The token never leaves your machine except to call Slotshark.',
      action: { label: 'Open Trading Settings', section: 'trading' },
    },
    {
      done: snipingEnabled,
      title: 'Enable Sniping',
      body: 'Turn on Sniping under Settings → Trading, right below Enable Trading. Snipe configs are then created right here, at the top of this feed.',
      action: { label: 'Open Trading Settings', section: 'trading' },
    },
  ];
  return (
    <div className="flex items-center justify-center h-full p-4">
      <div className="max-w-md w-full bg-discord-sidebar rounded-lg p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Crosshair size={18} className="text-discord-blurple" />
          <h3 className="text-white font-semibold text-sm">Set up sniping</h3>
        </div>
        <p className="text-xs text-discord-text-muted mb-4">
          Sniped messages will show up in this feed. Trenchcord can't snipe yet — finish these steps first:
        </p>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-2.5">
              <span
                className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold ${
                  s.done ? 'bg-discord-green/20 text-discord-green' : 'bg-discord-dark text-discord-text-muted'
                }`}
              >
                {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${s.done ? 'text-discord-text-muted' : 'text-white'}`}>{s.title}</p>
                <p className="text-xs text-discord-text-muted mt-0.5">{s.body}</p>
                {s.action && !s.done && (
                  <button
                    onClick={() => openSettings(s.action!.section)}
                    className="mt-1.5 px-2.5 py-1 rounded bg-discord-blurple hover:bg-discord-blurple/80 text-white text-xs font-medium transition-colors"
                  >
                    {s.action.label}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-discord-text-muted mt-4">
          Snipes execute real swaps with real SOL, automatically and without confirmation.
        </p>
      </div>
    </div>
  );
}

interface ChatPaneProps {
  roomId: string;
  paneIndex: number;
  paneCount: number;
  editMode: boolean;
  variant?: 'grid' | 'popout';
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

export default function ChatPane({ roomId, paneIndex, paneCount, editMode, variant = 'grid', onMoveLeft, onMoveRight }: ChatPaneProps) {
  const isPopout = variant === 'popout';
  const rooms = useAppStore((s) => s.rooms);
  const messages = useAppStore((s) => s.messages);
  const config = useAppStore((s) => s.config);
  const tradingStatus = useAppStore((s) => s.tradingStatus);
  const fetchTradingStatus = useAppStore((s) => s.fetchTradingStatus);
  const setActiveView = useAppStore((s) => s.setActiveView);

  // Snipes feed: know whether the Slotshark chain is configured so an empty
  // feed can show setup steps instead of a dead-end blank state.
  useEffect(() => {
    if (roomId === 'snipes' && !tradingStatus) void fetchTradingStatus();
  }, [roomId, tradingStatus, fetchTradingStatus]);
  // Guide disappears once the chain is fully enabled — from there the
  // Snipe-configs panel at the top of the feed takes over.
  const snipeGuideNeeded =
    roomId === 'snipes' &&
    (tradingStatus?.configured !== true ||
      config?.trading?.enabled !== true ||
      config?.sniping?.enabled !== true);
  const openConfigModal = useAppStore((s) => s.openConfigModal);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const prevLastIdRef = useRef<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const programmaticScrollRef = useRef(false);
  const settleRafRef = useRef<number | undefined>(undefined);
  const [renderLimit, setRenderLimit] = useState(WINDOW_INITIAL);
  const growingRef = useRef(false);
  // When the user scrolls up, we pin the rendered list to this message id so
  // incoming messages don't shift/drift the view. Cleared when back at bottom.
  const [frozenAtId, setFrozenAtId] = useState<string | null>(null);
  const lastLiveIdRef = useRef<string | null>(null);

  const updateRoom = useAppStore((s) => s.updateRoom);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const soundsMuted = useAppStore((s) => s.soundsMuted);
  const toggleSoundsMuted = useAppStore((s) => s.toggleSoundsMuted);
  const dmChannels = useAppStore((s) => s.dmChannels);
  const hideUser = useAppStore((s) => s.hideUser);
  const unhideUser = useAppStore((s) => s.unhideUser);
  const hideRole = useAppStore((s) => s.hideRole);
  const unhideRole = useAppStore((s) => s.unhideRole);
  const renameUser = useAppStore((s) => s.renameUser);
  const clearRoomMessages = useAppStore((s) => s.clearRoomMessages);
  const dismissRoomMessage = useAppStore((s) => s.dismissRoomMessage);
  const guilds = useAppStore((s) => s.guilds);
  const setPaneRoom = useAppStore((s) => s.setPaneRoom);
  const swapPanes = useAppStore((s) => s.swapPanes);
  const addPane = useAppStore((s) => s.addPane);
  const removePane = useAppStore((s) => s.removePane);
  const popOutPane = useAppStore((s) => s.popOutPane);
  const poppedOutRoomIds = useAppStore((s) => s.poppedOutRoomIds);
  const updateConfig = useAppStore((s) => s.updateConfig);
  const isGrid = useAppStore((s) => s.config?.splitLayout === 'grid');
  const setActivePane = useAppStore((s) => s.setActivePane);
  const togglePaneLock = useAppStore((s) => s.togglePaneLock);
  // Pane locking is a split-layout concept; the phone has one pane and no
  // unlock affordance, so a lock imported from a desktop backup is ignored
  // there rather than trapping the user on one room.
  const rawLocked = useAppStore((s) => s.paneLocks[paneIndex] ?? false);
  const locked = rawLocked && !isCompactLayout();
  const [dragOver, setDragOver] = useState(false);

  // Focus filter is local to each pane so split panes stay independent.
  const [focusFilter, setFocusFilterState] = useState<FocusFilter>(null);
  const clearFocusFilter = useCallback(() => setFocusFilterState(null), []);

  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [quickReplyChannelId, setQuickReplyChannelId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Compact phones collapse the header icon cluster into this overflow menu.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const compact = useCompactLayout();
  // Phone and desktop keep separate badge-style settings; icon badges are on
  // by default on both.
  const serverIconBadge = compact
    ? (config?.serverIconBadgeMobile ?? true)
    : (config?.serverIconBadge ?? true);
  const guildIcons = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const g of guilds) map[g.id] = g.icon;
    return map;
  }, [guilds]);

  const chattingEnabled = config?.chattingEnabled ?? false;

  const isDMView = roomId.startsWith('dm:');
  const isTgDMView = roomId.startsWith('tg-dm:');
  const feedView = FEED_VIEWS[roomId as keyof typeof FEED_VIEWS];
  const isAnyDMView = isDMView || isTgDMView;
  const dmChannelId = isDMView ? roomId.slice(3) : isTgDMView ? roomId.slice(6) : null;
  const activeDM = isDMView ? dmChannels.find((dm) => dm.id === dmChannelId) : null;

  const activeRoom = isAnyDMView || feedView ? undefined : rooms.find((r) => r.id === roomId);

  // Pull-to-refresh (iOS app, regular chat rooms only): pulling down past the
  // top of the list re-probes the backend's sockets and refetches history.
  const fetchHistory = useAppStore((s) => s.fetchHistory);
  const pullIndicatorRef = useRef<HTMLDivElement>(null);
  // The pane header is a second pull surface: in a room full of messages the
  // list gesture correctly scrolls history instead, so the header is the spot
  // that always refreshes.
  const pullHeaderRef = useRef<HTMLDivElement>(null);
  const pullEnabled = isIOSApp() && !isPopout && !!activeRoom;
  const handlePullRefresh = useCallback(async () => {
    // iOS froze the backend along with the app, which silently kills its
    // Discord/Telegram sockets — probe them first so the history fetch
    // actually returns fresh messages, not the pre-freeze state.
    try {
      await backendFetch('/system/resume', { method: 'POST' });
    } catch {
      // Backend still thawing — the history fetch below retries the point.
    }
    await fetchHistory();
  }, [fetchHistory]);
  const pullRefreshing = usePullToRefresh(scrollContainerRef, pullIndicatorRef, pullEnabled, handlePullRefresh, pullHeaderRef);

  const allRoomMessages = messages[roomId] ?? [];

  // Clearing only makes sense where nothing refetches the messages: the live
  // feeds and DM conversations. A normal room reloads its channels' history on
  // the next fetch, so emptying it would undo itself.
  const clearableFeed = roomId === 'mentions' || roomId === 'keywords' || roomId === 'dms' || isAnyDMView;
  // Triage feeds, where single entries are worth dismissing one at a time. A
  // conversation isn't one — pulling a message out of its middle just confuses.
  const dismissableFeed = roomId === 'mentions' || roomId === 'keywords';
  const embedDisabledChannels = new Set(
    activeRoom?.channels.filter((c) => c.disableEmbeds).map((c) => c.channelId)
  );

  const isFilterActive = activeRoom?.filterEnabled && (activeRoom?.filteredUsers?.length ?? 0) > 0;
  const filterSet = new Set(activeRoom?.filteredUsers?.map((u) => u.toLowerCase()) ?? []);

  const hiddenUsers = config?.hiddenUsers ?? {};
  const isUserHidden = (msg: typeof allRoomMessages[0]) => {
    const key = `${msg.guildId ?? 'null'}:${msg.channelId}`;
    const hidden = hiddenUsers[key];
    if (!hidden || hidden.length === 0) return false;
    if (hidden.some((e) => e.userId === msg.author.id)) return true;
    // Bot replies to a hidden user (e.g. Rick scanning their token) are noise
    // from the same source, so they follow the hidden user out of the feed.
    const refAuthorId = msg.referencedMessage?.authorId;
    return !!(msg.author.isBot && refAuthorId && hidden.some((e) => e.userId === refAuthorId));
  };

  const hiddenRoles = config?.hiddenRoles ?? {};
  // Users seen holding a muted role in the loaded window, keyed guildId:userId.
  // Matching by author (not just per-message roles) also catches their
  // REST-fetched history messages, which carry no member/role data.
  const roleHiddenUserIds = new Set<string>();
  if (Object.keys(hiddenRoles).length > 0) {
    for (const msg of allRoomMessages) {
      if (!msg.guildId || !msg.author.roles) continue;
      const muted = hiddenRoles[msg.guildId];
      if (muted && muted.length > 0 && msg.author.roles.some((r) => muted.some((m) => m.roleId === r.id))) {
        roleHiddenUserIds.add(`${msg.guildId}:${msg.author.id}`);
      }
    }
  }
  const isRoleHidden = (msg: typeof allRoomMessages[0]) => {
    if (!msg.guildId || roleHiddenUserIds.size === 0) return false;
    if (roleHiddenUserIds.has(`${msg.guildId}:${msg.author.id}`)) return true;
    // Same rule as hidden users: bot replies to a role-muted member follow
    // that member out of the feed.
    const refAuthorId = msg.referencedMessage?.authorId;
    return !!(msg.author.isBot && refAuthorId && roleHiddenUserIds.has(`${msg.guildId}:${refAuthorId}`));
  };

  // All DMs exclusions: the backend keeps new DMs in excluded and hidden
  // conversations out of the feed; filtering here too hides their
  // already-stored history. Entries match by user ID or username/display name
  // (leading @ and case ignored), same as the backend — against the author
  // *and* the conversation partner, so entries also catch your own half of a
  // conversation, where the author is you. Telegram messages check the
  // Telegram lists (and the feed-wide Telegram switch), Discord messages the
  // Discord ones.
  const dmExcludedUsers = roomId === 'dms' ? (config?.dmExcludedUsers ?? []) : [];
  const tgDmExcludedUsers = roomId === 'dms' ? (config?.tgDmExcludedUsers ?? []) : [];
  const dmHiddenConversations = roomId === 'dms' ? (config?.dmHiddenConversations ?? []) : [];
  const tgDmHiddenConversations = roomId === 'dms' ? (config?.tgDmHiddenConversations ?? []) : [];
  const hideTelegramDms = roomId === 'dms' && (config?.telegramDmsInAllDms ?? true) === false;
  const dmRecipientsById = new Map(dmChannels.map((ch) => [ch.id, ch.recipients]));
  const isDmExcluded = (msg: typeof allRoomMessages[0]) => {
    const fromTelegram = msg.source === 'telegram';
    if (fromTelegram && hideTelegramDms) return true;
    const author = { id: msg.author.id, names: [msg.author.username, msg.author.displayName] };
    if (fromTelegram) {
      // The chat is the conversation partner whichever side wrote.
      const chat = { id: msg.channelId, names: [msg.chatUsername, msg.channelName] };
      return dmListMatches(tgDmExcludedUsers, [author, chat]) || dmListMatches(tgDmHiddenConversations, [author, chat]);
    }
    const recipients = (dmRecipientsById.get(msg.channelId) ?? []).map((r) => ({ id: r.id, names: [r.username, r.global_name] }));
    // Feed exclusion in a group DM matches only by author — excluding one
    // member doesn't silence the whole group. A hidden conversation goes by
    // any participant.
    const excludedPeople = recipients.length === 1 ? [author, ...recipients] : [author];
    return dmListMatches(dmExcludedUsers, excludedPeople) || dmListMatches(dmHiddenConversations, [author, ...recipients]);
  };

  const afterFilter = isFilterActive
    ? allRoomMessages.filter((msg) =>
        filterSet.has(msg.author.id) ||
        filterSet.has(msg.author.username.toLowerCase()) ||
        filterSet.has(msg.author.displayName.toLowerCase())
      )
    : allRoomMessages;

  // Ephemeral messages (visible only to the logged-in account) can be switched
  // off globally; filtering at render keeps already-stored ones toggleable.
  const showEphemeral = config?.showEphemeralMessages ?? true;

  const afterHidden = afterFilter.filter(
    (msg) => !isUserHidden(msg) && !isRoleHidden(msg) && !isDmExcluded(msg) && (showEphemeral || !msg.isEphemeral)
  );

  const afterFocus = focusFilter
    ? afterHidden.filter((msg) => msg.guildId === focusFilter.guildId && msg.channelId === focusFilter.channelId)
    : afterHidden;

  const trimmedSearch = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!searchOpen || !trimmedSearch) return null;
    const matches: typeof afterFocus = [];
    for (const msg of afterFocus) {
      if (
        msg.content.toLowerCase().includes(trimmedSearch) ||
        msg.author.displayName.toLowerCase().includes(trimmedSearch) ||
        msg.author.username.toLowerCase().includes(trimmedSearch) ||
        // v2/forwarded messages carry their text outside `content`.
        messageFallbackText(msg).toLowerCase().includes(trimmedSearch)
      ) {
        matches.push(msg);
      }
    }
    return matches;
  }, [afterFocus, trimmedSearch, searchOpen]);

  const liveLastId = afterFocus.length > 0 ? afterFocus[afterFocus.length - 1].id : null;

  // While "frozen" (user scrolled up), hold the rendered list at the boundary
  // and keep newer messages out of the view. They are counted and surfaced via
  // the "new messages" pill / "jump to present" banner instead of drifting in.
  let frozenIndex = -1;
  if (frozenAtId) {
    for (let i = afterFocus.length - 1; i >= 0; i--) {
      if (afterFocus[i].id === frozenAtId) { frozenIndex = i; break; }
    }
  }
  const baseList = frozenIndex >= 0 ? afterFocus.slice(0, frozenIndex + 1) : afterFocus;
  const newMessageCount = frozenIndex >= 0 ? afterFocus.length - 1 - frozenIndex : 0;
  const firstNewMessage = newMessageCount > 0 ? afterFocus[frozenIndex + 1] : null;
  const viewingOlder = frozenAtId !== null;

  const roomMessages = searchResults
    ? searchResults
    : baseList.length > renderLimit
      ? baseList.slice(-renderLimit)
      : baseList;

  const lastMessageId = roomMessages.length > 0 ? roomMessages[roomMessages.length - 1].id : null;

  const channelHiddenUsers = activeRoom
    ? activeRoom.channels.flatMap((ch) => {
        const key = `${ch.guildId ?? 'null'}:${ch.channelId}`;
        return (hiddenUsers[key] ?? []).map((entry) => ({
          userId: entry.userId,
          displayName: entry.displayName,
          guildId: ch.guildId,
          channelId: ch.channelId,
          channelName: ch.channelName ?? ch.channelId,
          guildName: ch.guildName ?? null,
        }));
      })
    : [];

  // Muted roles for every guild this room watches (server-wide, so deduped by
  // guild rather than listed per channel).
  const roomMutedRoles = activeRoom
    ? [...new Map(activeRoom.channels.filter((ch) => ch.guildId).map((ch) => [ch.guildId!, ch.guildName ?? null])).entries()].flatMap(
        ([gId, gName]) =>
          (hiddenRoles[gId] ?? []).map((entry) => ({
            guildId: gId,
            guildName: gName,
            roleId: entry.roleId,
            roleName: entry.roleName,
          }))
      )
    : [];
  const hiddenCount = channelHiddenUsers.length + roomMutedRoles.length;

  const toggleFilter = () => {
    if (activeRoom) {
      updateRoom(activeRoom.id, { filterEnabled: !activeRoom.filterEnabled });
    }
  };

  const toggleHighlightUser = useCallback(async (userId: string, displayName: string) => {
    if (!activeRoom) return;
    const current = activeRoom.highlightedUsers ?? [];
    const isAlready = current.includes(userId);
    const highlightedUsers = isAlready ? current.filter((id) => id !== userId) : [...current, userId];
    const updates: Partial<typeof activeRoom> = { highlightedUsers };
    if (isAlready && activeRoom.highlightedUserColors?.[userId]) {
      const { [userId]: _, ...rest } = activeRoom.highlightedUserColors;
      updates.highlightedUserColors = rest;
    }
    await updateRoom(activeRoom.id, updates);
  }, [activeRoom, updateRoom]);

  const toggleHighlightRole = useCallback(async (guildId: string, roleId: string, roleName: string) => {
    if (!activeRoom) return;
    const current = activeRoom.highlightedRoles ?? [];
    const highlightedRoles = current.some((r) => r.roleId === roleId)
      ? current.filter((r) => r.roleId !== roleId)
      : [...current, { roleId, roleName, guildId }];
    await updateRoom(activeRoom.id, { highlightedRoles });
  }, [activeRoom, updateRoom]);

  const handleQuickReply = useCallback((channelId: string) => {
    setQuickReplyChannelId(channelId);
  }, []);

  const handleFocus = useCallback((guildId: string | null, channelId: string, guildName: string | null, channelName: string) => {
    setFocusFilterState((prev) =>
      prev && prev.guildId === guildId && prev.channelId === channelId
        ? null
        : { guildId, channelId, guildName, channelName }
    );
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setActiveMatchIndex(0);
  }, []);

  const jumpToMatch = useCallback((index: number) => {
    if (!searchResults || searchResults.length === 0) return;
    const clamped = ((index % searchResults.length) + searchResults.length) % searchResults.length;
    setActiveMatchIndex(clamped);
    const msg = searchResults[clamped];
    const el = document.getElementById(`msg-${msg.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-1', 'ring-discord-blurple');
      setTimeout(() => el.classList.remove('ring-1', 'ring-discord-blurple'), 2000);
    }
  }, [searchResults]);

  const checkNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // Track scroll direction. Keep the baseline current even during programmatic
    // scrolls so the next user-driven event compares correctly.
    const prevTop = lastScrollTopRef.current;
    lastScrollTopRef.current = el.scrollTop;
    const scrolledUp = el.scrollTop < prevTop - 2;

    if (programmaticScrollRef.current) return;

    if (
      !growingRef.current &&
      !searchResults &&
      el.scrollTop < LOAD_MORE_THRESHOLD &&
      renderLimit < afterFocus.length
    ) {
      growingRef.current = true;
      const prevHeight = el.scrollHeight;
      const growPrevTop = el.scrollTop;
      setRenderLimit((n) => Math.min(n + WINDOW_GROW, afterFocus.length));
      requestAnimationFrame(() => {
        const newEl = scrollContainerRef.current;
        if (newEl) {
          const delta = newEl.scrollHeight - prevHeight;
          if (delta > 0) newEl.scrollTop = growPrevTop + delta;
        }
        growingRef.current = false;
      });
    }

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < SCROLL_THRESHOLD) {
      // Back at the bottom -> stick to the present.
      isNearBottomRef.current = true;
      setShowScrollButton(false);
    } else if (scrolledUp) {
      // Deliberate upward scroll -> pause and view older messages. We only pause
      // on a real up-scroll (not merely distance) so that content growing during
      // load/streaming never yanks us off the present.
      isNearBottomRef.current = false;
      setShowScrollButton(true);
    } else {
      setShowScrollButton(!isNearBottomRef.current);
    }
  }, [searchResults, renderLimit, afterFocus.length]);

  const cancelSettle = useCallback(() => {
    if (settleRafRef.current !== undefined) {
      cancelAnimationFrame(settleRafRef.current);
      settleRafRef.current = undefined;
    }
  }, []);

  const performScroll = useCallback((smooth: boolean) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const useSmooth = smooth && !document.hidden;

    programmaticScrollRef.current = true;
    cancelSettle();

    if (useSmooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }

    const startedAt = performance.now();
    const MAX_DURATION = 2000;
    let lastHeight = el.scrollHeight;
    let stableFrames = 0;

    const step = () => {
      const c = scrollContainerRef.current;
      if (!c) {
        programmaticScrollRef.current = false;
        settleRafRef.current = undefined;
        return;
      }

      const height = c.scrollHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        stableFrames = 0;
        if (useSmooth) {
          c.scrollTo({ top: height, behavior: 'smooth' });
        }
      } else {
        stableFrames++;
      }

      if (!useSmooth) c.scrollTop = c.scrollHeight;

      const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 4;
      const elapsed = performance.now() - startedAt;

      if ((atBottom && stableFrames >= 3) || elapsed > MAX_DURATION) {
        c.scrollTop = c.scrollHeight;
        programmaticScrollRef.current = false;
        isNearBottomRef.current = true;
        setShowScrollButton(false);
        settleRafRef.current = undefined;
      } else {
        settleRafRef.current = requestAnimationFrame(step);
      }
    };

    settleRafRef.current = requestAnimationFrame(step);
  }, [cancelSettle]);

  useEffect(() => {
    if (lastMessageId === prevLastIdRef.current) return;
    prevLastIdRef.current = lastMessageId;
    if (lastMessageId && isNearBottomRef.current) {
      performScroll(false);
    }
  }, [lastMessageId, performScroll]);

  useEffect(() => {
    isNearBottomRef.current = true;
    setShowScrollButton(false);
    cancelSettle();
    performScroll(false);
    clearFocusFilter();
    closeSearch();
  }, [roomId, clearFocusFilter, performScroll, cancelSettle, closeSearch]);

  useEffect(() => {
    setRenderLimit(WINDOW_INITIAL);
    growingRef.current = false;
  }, [roomId, focusFilter, searchOpen]);

  useEffect(() => {
    return () => cancelSettle();
  }, [cancelSettle]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // The instant the user scrolls up, release the auto-scroll lock and stop the
    // settle loop. Reading deltaY directly (instead of recomputing from scroll
    // position) avoids a race where an incoming message re-snaps to the bottom
    // before the user's upward scroll has actually moved the viewport.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0) return;
      cancelSettle();
      programmaticScrollRef.current = false;
      isNearBottomRef.current = false;
      setShowScrollButton(true);
    };
    // On touch, hand control back so the position-based checkNearBottom logic
    // governs auto-scroll while the user drags.
    const onTouchStart = () => {
      if (!programmaticScrollRef.current) return;
      cancelSettle();
      programmaticScrollRef.current = false;
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
    };
  }, [cancelSettle]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (settleRafRef.current !== undefined) return;
      if (isNearBottomRef.current) {
        performScroll(false);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [performScroll]);

  useEffect(() => {
    lastLiveIdRef.current = liveLastId;
  }, [liveLastId]);

  // showScrollButton mirrors "not pinned to bottom" across every scroll code
  // path, so drive the freeze off it: capture the boundary once when the user
  // leaves the bottom, and release it when they return.
  useEffect(() => {
    if (showScrollButton) {
      setFrozenAtId((prev) => prev ?? lastLiveIdRef.current);
    } else {
      setFrozenAtId(null);
    }
  }, [showScrollButton]);

  const scrollToBottom = () => {
    isNearBottomRef.current = true;
    setShowScrollButton(false);
    performScroll(true);
  };

  const jumpToPresent = () => {
    setFrozenAtId(null);
    setRenderLimit(WINDOW_INITIAL);
    scrollToBottom();
  };

  // Options for the per-pane room switcher dropdown.
  const switcherOptions = useMemo(() => {
    const opts: { id: string; label: string; kind: 'mentions' | 'keywords' | 'snipes' | 'alerts' | 'dms' | 'room' | 'dm' | 'tg' }[] = [];
    opts.push({ id: 'mentions', label: 'Mentions', kind: 'mentions' });
    opts.push({ id: 'keywords', label: 'Keywords', kind: 'keywords' });
    opts.push({ id: 'snipes', label: 'Snipes', kind: 'snipes' });
    opts.push({ id: 'alerts', label: 'Alerts', kind: 'alerts' });
    opts.push({ id: 'dms', label: 'All DMs', kind: 'dms' });
    for (const r of rooms) opts.push({ id: r.id, label: r.name, kind: 'room' });
    const dmLookup = new Map(dmChannels.map((dm) => [dm.id, dm]));
    // Hidden conversations stay out of the switcher, same as the sidebar.
    const hiddenDm = config?.dmHiddenConversations ?? [];
    const hiddenTg = config?.tgDmHiddenConversations ?? [];
    for (const key of Object.keys(messages)) {
      if ((messages[key]?.length ?? 0) === 0) continue;
      if (key.startsWith('dm:')) {
        const dm = dmLookup.get(key.slice(3));
        const first = messages[key][0];
        if (dmListMatches(hiddenDm, [
          ...(dm?.recipients ?? []).map((r) => ({ id: r.id, names: [r.username, r.global_name] })),
          ...(first ? [{ id: first.author.id, names: [first.author.username, first.author.displayName] }] : []),
        ])) continue;
        const label = dm ? dm.recipients.map((r) => r.global_name || r.username || 'Unknown').join(', ') : (first?.author.displayName ?? 'DM');
        opts.push({ id: key, label, kind: 'dm' });
      } else if (key.startsWith('tg-dm:')) {
        const last = messages[key][messages[key].length - 1];
        if (dmListMatches(hiddenTg, [
          { id: key.slice(6), names: [last?.chatUsername, last?.channelName] },
          ...(last ? [{ id: last.author.id, names: [last.author.username, last.author.displayName] }] : []),
        ])) continue;
        const label = messages[key][0]?.channelName ?? messages[key][0]?.author.displayName ?? 'Telegram Chat';
        opts.push({ id: key, label, kind: 'tg' });
      }
    }
    return opts;
  }, [rooms, dmChannels, messages, config?.dmHiddenConversations, config?.tgDmHiddenConversations]);

  const dmRecipientNames = activeDM
    ? activeDM.recipients.map((r) => r.global_name || r.username || 'Unknown').join(', ')
    : isTgDMView
      ? (allRoomMessages[0]?.channelName ?? allRoomMessages[0]?.author.displayName ?? 'Telegram Chat')
      : null;

  const headerTitle = feedView
    ? feedView.title
    : isAnyDMView
      ? (dmRecipientNames ?? 'Direct Message')
      : (activeRoom?.name ?? 'Unknown');

  const clearLabel = isAnyDMView
    ? 'Clear this conversation'
    : roomId === 'dms'
      ? 'Clear All DMs'
      : `Clear all ${headerTitle.toLowerCase()}`;

  const HeaderIcon = feedView ? feedView.icon : isTgDMView ? Send : isDMView ? MessageCircle : Hash;
  const headerIconClass = isTgDMView ? 'text-[#2AABEE]' : 'text-discord-channel-icon';

  const canDrag = editMode && paneCount > 1 && !locked;
  // Popouts are separate OS windows opened by the Electron main process; iOS has
  // no equivalent, and the button would silently do nothing there.
  const canPopOut = variant === 'grid' && !isIOSApp() && !poppedOutRoomIds.includes(roomId);

  const handleDrop = (e: React.DragEvent) => {
    if (!editMode || locked) return;
    e.preventDefault();
    setDragOver(false);
    const data = e.dataTransfer.getData('text/plain');
    if (data.startsWith('room:')) {
      setPaneRoom(paneIndex, data.slice(5));
    } else if (data.startsWith('pane:')) {
      const from = Number(data.slice(5));
      if (!Number.isNaN(from)) swapPanes(from, paneIndex);
    }
  };

  const unknownPane = !activeRoom && !activeDM && !isTgDMView && !feedView;

  const ringClass = editMode ? 'ring-1 ring-inset ring-discord-blurple/30' : '';

  return (
    <div
      className={`flex-1 flex flex-col min-w-0 h-full relative ${ringClass}`}
      style={{ backgroundColor: activeRoom?.color || '#313338' }}
      onMouseDownCapture={() => setActivePane(paneIndex)}
      onDragOver={(e) => { if (editMode && !locked) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (editMode && !e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={handleDrop}
    >
      {editMode && !locked && dragOver && (
        <div className="absolute inset-0 z-40 bg-discord-blurple/20 border-2 border-dashed border-discord-blurple pointer-events-none flex items-center justify-center">
          <span className="text-sm font-semibold text-white bg-discord-blurple/80 px-3 py-1.5 rounded">Drop here</span>
        </div>
      )}
      {/* Channel header — also the always-available pull-to-refresh handle on
          iOS (ref only feeds usePullToRefresh; taps and buttons unaffected). */}
      <div ref={pullHeaderRef} className="h-12 compact:h-[52px] px-2 sm:px-4 flex items-center shadow-[0_1px_0_rgba(0,0,0,0.2),0_1.5px_0_rgba(0,0,0,0.05),0_2px_0_rgba(0,0,0,0.05)] border-b border-discord-dark/60 shrink-0 bg-transparent z-10 gap-1">
        {!isPopout && sidebarCollapsed && paneIndex === 0 && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 compact:p-2.5 -ml-0.5 mr-0.5 rounded text-discord-channel-icon hover:text-discord-header-primary hover:bg-discord-hover transition-colors shrink-0"
            title="Show sidebar"
          >
            <PanelLeftOpen size={18} className="compact:w-5 compact:h-5" />
          </button>
        )}

        {canDrag && (
          <div
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/plain', `pane:${paneIndex}`); e.dataTransfer.effectAllowed = 'move'; }}
            className="p-0.5 -ml-0.5 mr-0.5 rounded text-discord-channel-icon hover:text-discord-header-primary cursor-grab active:cursor-grabbing shrink-0"
            title="Drag to rearrange pane"
          >
            <GripVertical size={16} />
          </div>
        )}

        {/* Room switcher */}
        <div className="relative min-w-0 flex items-center">
          <button
            onClick={() => { if (!locked) setSwitcherOpen((v) => !v); }}
            className="flex items-center gap-1.5 min-w-0 rounded px-1 py-0.5 compact:py-2 hover:bg-discord-hover/50 transition-colors"
            title={locked ? 'Pane locked - unlock to change room' : 'Switch pane content'}
          >
            <HeaderIcon size={20} className={`${headerIconClass} shrink-0`} />
            <span className="font-semibold text-sm sm:text-base text-discord-header-primary truncate max-w-[40vw] sm:max-w-none">
              {headerTitle}
            </span>
            {locked ? <Lock size={13} className="text-discord-channel-icon shrink-0" /> : <ChevronDown size={14} className="text-discord-channel-icon shrink-0" />}
          </button>
          {switcherOpen && !locked && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setSwitcherOpen(false)} />
              <div className="absolute top-full left-0 mt-1 z-30 w-56 max-w-[calc(100vw-1rem)] max-h-[60dvh] overflow-y-auto bg-discord-sidebar border border-discord-dark rounded-md shadow-xl py-1 animate-pop-in origin-top-left">
                {switcherOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => { setPaneRoom(paneIndex, opt.id); setSwitcherOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 compact:py-2.5 compact:text-[15px] text-left text-sm truncate transition-colors ${
                      opt.id === roomId
                        ? 'bg-discord-hover-light text-discord-header-primary'
                        : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
                    }`}
                  >
                    {opt.kind === 'mentions' ? <AtSign size={16} className="shrink-0 opacity-70" />
                      : opt.kind === 'keywords' ? <Tag size={16} className="shrink-0 opacity-70" />
                      : opt.kind === 'snipes' ? <Crosshair size={16} className="shrink-0 opacity-70" />
                      : opt.kind === 'alerts' ? <BellRing size={16} className="shrink-0 opacity-70" />
                      : opt.kind === 'dms' ? <MessagesSquare size={16} className="shrink-0 opacity-70" />
                      : opt.kind === 'tg' ? <Send size={16} className="shrink-0 text-[#2AABEE]" />
                      : opt.kind === 'dm' ? <MessageCircle size={16} className="shrink-0 opacity-70" />
                      : <Hash size={16} className="shrink-0 opacity-70" />}
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {!isAnyDMView && !feedView && activeRoom && (
          <span className="ml-2 text-xs sm:text-sm text-discord-header-secondary truncate hidden lg:inline">
            {activeRoom.channels.length} channel{activeRoom.channels.length !== 1 ? 's' : ''}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {clearableFeed && !compact && allRoomMessages.length > 0 && (
            <Tip label={clearLabel}>
              <button
                onClick={() => setClearConfirmOpen(true)}
                className="p-1.5 rounded hover:bg-discord-hover text-discord-text-muted hover:text-discord-red transition-colors"
              >
                <Eraser size={18} />
              </button>
            </Tip>
          )}
          {roomId === 'alerts' && (
            <Tip label="New alert">
              <button
                onClick={() => useAppStore.getState().setAlertCreateOpen(true)}
                className="p-1.5 rounded hover:bg-discord-hover text-discord-text-muted hover:text-discord-text transition-colors"
              >
                <Plus size={18} />
              </button>
            </Tip>
          )}
          {activeRoom && activeRoom.highlightedUsers.length > 0 && (
            <span className="text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full bg-discord-blurple/20 text-discord-blurple hidden lg:inline-flex">
              {activeRoom.highlightedUsers.length} highlighted
            </span>
          )}
          {activeRoom && (activeRoom.filteredUsers?.length ?? 0) > 0 && (
            <button
              onClick={toggleFilter}
              className={`flex items-center gap-1 text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full transition-colors ${
                activeRoom.filterEnabled
                  ? 'bg-discord-green/20 text-discord-green'
                  : 'bg-discord-dark/50 text-discord-text-muted hover:text-discord-text'
              }`}
              title={activeRoom.filterEnabled ? 'Click to disable user filter' : 'Click to enable user filter'}
            >
              <Filter size={10} />
              <span className="hidden lg:inline">{activeRoom.filteredUsers.length} filtered</span> {activeRoom.filterEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          {focusFilter && (
            <button
              onClick={clearFocusFilter}
              className="flex items-center gap-1 text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full bg-discord-blurple/20 text-discord-blurple hover:bg-discord-blurple/30 transition-colors max-w-[120px] sm:max-w-none"
              title="Click to exit focus mode"
            >
              <Eye size={10} className="shrink-0" />
              <span className="truncate">Focus</span>
              <X size={10} className="shrink-0" />
            </button>
          )}
          {hiddenCount > 0 && (
            <button
              onClick={() => setHiddenPanelOpen(!hiddenPanelOpen)}
              className={`flex items-center gap-1 text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full transition-colors ${
                hiddenPanelOpen
                  ? 'bg-discord-red/20 text-discord-red'
                  : 'bg-discord-dark/50 text-discord-text-muted hover:text-discord-text'
              }`}
              title="View hidden users & muted roles"
            >
              <EyeOff size={10} />
              <span className="hidden lg:inline">{hiddenCount} hidden</span>
            </button>
          )}
          {compact ? (
            /* Phone header: one comfortable overflow menu instead of a strip of
               26px icon buttons. Same actions, same conditions as the desktop
               cluster below. */
            <div className="relative flex items-center">
              <button
                onClick={() => setOverflowOpen((v) => !v)}
                className={`p-2 rounded transition-colors ${overflowOpen ? 'text-white bg-discord-hover' : 'text-discord-channel-icon hover:text-discord-text'}`}
                title="More actions"
              >
                <MoreVertical size={20} />
              </button>
              {overflowOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setOverflowOpen(false)} />
                  <div className="absolute top-full right-0 mt-1 z-30 w-60 max-w-[calc(100vw-1rem)] bg-discord-sidebar border border-discord-dark rounded-md shadow-xl py-1 animate-pop-in origin-top-right">
                    {(
                      [
                        {
                          key: 'search',
                          show: true,
                          icon: <Search size={18} />,
                          label: searchOpen ? 'Close search' : 'Search messages',
                          onClick: searchOpen ? closeSearch : openSearch,
                        },
                        {
                          key: 'clear',
                          show: clearableFeed && allRoomMessages.length > 0,
                          icon: <Eraser size={18} />,
                          label: clearLabel,
                          onClick: () => setClearConfirmOpen(true),
                        },
                        {
                          key: 'settings',
                          show: !!activeRoom,
                          icon: <Settings size={18} />,
                          label: 'Room settings',
                          onClick: () => activeRoom && openConfigModal(activeRoom),
                        },
                        {
                          key: 'mute',
                          show: !isPopout && paneIndex === 0,
                          icon: soundsMuted ? <VolumeX size={18} /> : <Volume2 size={18} />,
                          label: soundsMuted ? 'Unmute Trenchcord sounds' : 'Mute all Trenchcord sounds',
                          onClick: toggleSoundsMuted,
                        },
                        {
                          key: 'popout',
                          show: canPopOut,
                          icon: <ExternalLink size={18} />,
                          label: 'Pop out to its own window',
                          onClick: () => popOutPane(paneIndex),
                        },
                        {
                          key: 'moveLeft',
                          show: !!(editMode && onMoveLeft),
                          icon: <ArrowLeft size={18} />,
                          label: 'Move chat to left side',
                          onClick: () => onMoveLeft?.(),
                        },
                        {
                          key: 'moveRight',
                          show: !!(editMode && onMoveRight),
                          icon: <ArrowRight size={18} />,
                          label: 'Move chat to right side',
                          onClick: () => onMoveRight?.(),
                        },
                        {
                          key: 'layout',
                          show: paneIndex === 0 && paneCount > 1,
                          icon: isGrid ? <Columns2 size={18} /> : <Rows2 size={18} />,
                          label: isGrid ? 'Single row layout' : 'Two rows layout',
                          onClick: () => updateConfig({ splitLayout: isGrid ? 'row' : 'grid' }),
                        },
                        // No lock entry: with a single pane on the phone there
                        // is no layout to protect, it's just a confusing switch.
                        // Split panes don't exist on iOS (see ChatView).
                        {
                          key: 'addPane',
                          show: !isPopout && !isIOSApp() && paneCount < MAX_PANES,
                          icon: <Plus size={18} />,
                          label: 'Add chat pane',
                          onClick: () => addPane(),
                        },
                        {
                          key: 'closePane',
                          show: paneCount > 1,
                          icon: <X size={18} />,
                          label: 'Close pane',
                          onClick: () => removePane(paneIndex),
                        },
                      ] as const
                    )
                      .filter((item) => item.show)
                      .map((item) => (
                        <button
                          key={item.key}
                          onClick={() => { item.onClick(); setOverflowOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[15px] text-discord-text hover:bg-discord-hover transition-colors"
                        >
                          <span className="shrink-0 opacity-80">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Tip label={searchOpen ? 'Close search' : 'Search messages (Ctrl+F)'}>
                <button
                  onClick={searchOpen ? closeSearch : openSearch}
                  className={`p-1 transition-colors ${
                    searchOpen ? 'text-white' : 'text-discord-channel-icon hover:text-discord-text'
                  }`}
                >
                  <Search size={18} />
                </button>
              </Tip>
              {activeRoom && (
                <Tip label="Room settings">
                  <button
                    onClick={() => openConfigModal(activeRoom)}
                    className="p-1 text-discord-channel-icon hover:text-discord-text transition-colors"
                  >
                    <Settings size={18} />
                  </button>
                </Tip>
              )}
              {/* Global mute, so first pane only (like the sidebar toggle).
                  Popout windows never play sounds (useWebSocket skips them),
                  so a mute toggle there would be a dead control. */}
              {!isPopout && paneIndex === 0 && (
                <Tip label={soundsMuted ? 'Unmute Trenchcord sounds' : 'Mute all Trenchcord sounds'}>
                  <button
                    onClick={toggleSoundsMuted}
                    className={`p-1 transition-colors ${soundsMuted ? 'text-discord-red hover:text-discord-red/80' : 'text-discord-channel-icon hover:text-discord-text'}`}
                  >
                    {soundsMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                </Tip>
              )}
              {canPopOut && (
                <Tip label="Pop out to its own window">
                  <button
                    onClick={() => popOutPane(paneIndex)}
                    className="p-1 text-discord-channel-icon hover:text-discord-text transition-colors"
                  >
                    <ExternalLink size={18} />
                  </button>
                </Tip>
              )}
              {editMode && onMoveLeft && (
                <Tip label="Move chat to left side">
                  <button
                    onClick={onMoveLeft}
                    className="p-1 text-discord-channel-icon hover:text-discord-text transition-colors"
                  >
                    <ArrowLeft size={18} />
                  </button>
                </Tip>
              )}
              {editMode && onMoveRight && (
                <Tip label="Move chat to right side">
                  <button
                    onClick={onMoveRight}
                    className="p-1 text-discord-channel-icon hover:text-discord-text transition-colors"
                  >
                    <ArrowRight size={18} />
                  </button>
                </Tip>
              )}
              {paneIndex === 0 && paneCount > 1 && (
                <Tip label={isGrid ? 'Single row layout' : 'Two rows layout'}>
                  <button
                    onClick={() => updateConfig({ splitLayout: isGrid ? 'row' : 'grid' })}
                    className="p-1 text-discord-channel-icon hover:text-discord-text transition-colors"
                  >
                    {isGrid ? <Columns2 size={18} /> : <Rows2 size={18} />}
                  </button>
                </Tip>
              )}
              {!isPopout && (
                <Tip label={locked ? 'Unlock pane' : 'Lock pane (prevent changing room)'}>
                  <button
                    onClick={() => togglePaneLock(paneIndex)}
                    className={`p-1 transition-colors ${locked ? 'text-discord-blurple hover:text-discord-blurple-hover' : 'text-discord-channel-icon hover:text-discord-text'}`}
                  >
                    {locked ? <Lock size={18} /> : <Unlock size={18} />}
                  </button>
                </Tip>
              )}
              {/* Split panes don't exist on iOS (see ChatView), so nothing to add to. */}
              {!isPopout && !isIOSApp() && paneCount < MAX_PANES && (
                <Tip label="Add chat pane">
                  <button
                    onClick={() => addPane()}
                    className="p-1 text-discord-channel-icon hover:text-discord-text transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                </Tip>
              )}
              {paneCount > 1 && (
                <Tip label="Close pane">
                  <button
                    onClick={() => removePane(paneIndex)}
                    className="p-1 text-discord-channel-icon hover:text-discord-red transition-colors"
                  >
                    <X size={18} />
                  </button>
                </Tip>
              )}
            </>
          )}
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-2 sm:px-4 py-2 border-b border-discord-dark/60 bg-discord-embed-bg shrink-0 flex items-center gap-2">
          <Search size={16} className="text-discord-text-muted shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setActiveMatchIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) jumpToMatch(activeMatchIndex - 1);
                else jumpToMatch(activeMatchIndex + 1);
              }
              if (e.key === 'Escape') closeSearch();
            }}
            placeholder="Search messages..."
            className="flex-1 bg-discord-dark text-discord-text text-sm px-3 py-1.5 rounded outline-none placeholder:text-discord-text-muted/60"
            autoFocus
          />
          {trimmedSearch && searchResults && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[12px] text-discord-text-muted tabular-nums">
                {searchResults.length === 0
                  ? 'No results'
                  : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
              </span>
              {searchResults.length > 1 && (
                <>
                  <button
                    onClick={() => jumpToMatch(activeMatchIndex - 1)}
                    className="p-0.5 text-discord-text-muted hover:text-white transition-colors"
                    title="Previous match (Shift+Enter)"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => jumpToMatch(activeMatchIndex + 1)}
                    className="p-0.5 text-discord-text-muted hover:text-white transition-colors"
                    title="Next match (Enter)"
                  >
                    <ChevronDown size={16} />
                  </button>
                </>
              )}
            </div>
          )}
          <button
            onClick={closeSearch}
            className="p-0.5 text-discord-text-muted hover:text-white transition-colors shrink-0"
            title="Close search (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Hidden users & muted roles panel */}
      {hiddenPanelOpen && hiddenCount > 0 && (
        <div className="border-b border-discord-dark/60 bg-discord-embed-bg px-3 sm:px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">
              {channelHiddenUsers.length > 0 && roomMutedRoles.length > 0
                ? 'Hidden Users & Muted Roles'
                : roomMutedRoles.length > 0
                  ? 'Muted Roles'
                  : 'Hidden Users'}
            </span>
            <button
              onClick={() => setHiddenPanelOpen(false)}
              className="text-discord-text-muted hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {channelHiddenUsers.map((entry) => (
              <div
                key={`${entry.guildId}:${entry.channelId}:${entry.userId}`}
                className="flex items-center justify-between gap-2 px-2 sm:px-2.5 py-1.5 rounded bg-discord-sidebar/60"
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <EyeOff size={12} className="shrink-0 text-discord-red/70" />
                  <span className="text-sm text-white font-medium truncate">{entry.displayName}</span>
                  <span className="text-[11px] text-discord-text-muted font-mono hidden sm:inline">{entry.userId}</span>
                  <span className="text-[10px] text-discord-text-muted truncate hidden sm:inline">
                    {entry.guildName ? `${entry.guildName} / ` : ''}#{entry.channelName}
                  </span>
                </div>
                <button
                  onClick={() => unhideUser(entry.guildId, entry.channelId, entry.userId)}
                  className="shrink-0 text-discord-text-muted hover:text-discord-red transition-colors"
                  title="Unhide user"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {roomMutedRoles.map((entry) => (
              <div
                key={`role:${entry.guildId}:${entry.roleId}`}
                className="flex items-center justify-between gap-2 px-2 sm:px-2.5 py-1.5 rounded bg-discord-sidebar/60"
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <Shield size={12} className="shrink-0 text-discord-red/70" />
                  <span className="text-sm text-white font-medium truncate">{entry.roleName}</span>
                  <span className="text-[10px] text-discord-text-muted truncate hidden sm:inline">
                    {entry.guildName ?? entry.guildId} · everyone with this role
                  </span>
                </div>
                <button
                  onClick={() => unhideRole(entry.guildId, entry.roleId)}
                  className="shrink-0 text-discord-text-muted hover:text-discord-red transition-colors"
                  title="Unmute role"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {unknownPane ? (
        <div className="flex-1 flex items-center justify-center text-center text-discord-text-muted p-4">
          <div>
            <Hash size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">This chat is no longer available. Pick another from the header.</p>
          </div>
        </div>
      ) : roomId === 'alerts' ? (
        // The Alerts feed is a management page (create/edit cards + fired
        // history), not a message stream.
        <AlertsPage />
      ) : (
        <>
        {/* Snipes mirrors Alerts: configs are managed on the feed itself. The
            panel only appears once the chain is fully enabled — while setting
            up, the checklist below is the sole guide. */}
        {roomId === 'snipes' &&
          tradingStatus?.configured === true &&
          config?.trading?.enabled === true &&
          config?.sniping?.enabled === true && <SnipesPanel />}
        {/* Pull-to-refresh disc. Position/opacity are painted imperatively by
            usePullToRefresh during the pull; React only drives the spin. */}
        {pullEnabled && (
          <div
            ref={pullIndicatorRef}
            className="absolute top-14 compact:top-[60px] left-1/2 z-30 w-9 h-9 rounded-full bg-discord-darker border border-discord-dark shadow-lg flex items-center justify-center pointer-events-none"
            style={{ opacity: 0, transform: 'translate(-50%, 0px)' }}
          >
            <RefreshCw size={16} className={`text-discord-blurple ${pullRefreshing ? 'animate-spin' : ''}`} />
          </div>
        )}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onScroll={checkNearBottom}
          style={{ overflowAnchor: 'none' }}
        >
          <div ref={contentRef} className="pb-[1vh]">
            {roomMessages.length === 0 && (
              snipeGuideNeeded && !(searchOpen && trimmedSearch) ? (
                <SnipesSetupGuide
                  hasToken={tradingStatus?.configured === true}
                  tradingOn={config?.trading?.enabled === true}
                  snipingEnabled={config?.sniping?.enabled === true}
                  openSettings={(section) => setActiveView('settings', section)}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-discord-text-muted text-sm">
                  {searchOpen && trimmedSearch
                    ? 'No messages match your search.'
                    : feedView
                      ? feedView.empty
                      : 'Waiting for messages...'}
                </div>
              )
            )}

            {roomMessages.map((msg, i) => {
              const prev = i > 0 ? roomMessages[i - 1] : null;
              const sameAuthor = prev?.author.id === msg.author.id;
              const timeDiff = prev
                ? new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime()
                : Infinity;
              const isCompact = sameAuthor && timeDiff < 5 * 60 * 1000 && prev?.channelId === msg.channelId;

              const guildColor = msg.source === 'telegram'
                ? config?.telegramColors?.[msg.channelId] ?? config?.dmColors?.[msg.channelId]
                : msg.guildId
                  ? config?.channelColors?.[msg.channelId] ?? config?.guildColors?.[msg.guildId]
                  : config?.dmColors?.[msg.channelId];
              // User-specific highlights win over role-wide ones: a highlighted
              // user keeps their own color (or the default style), and the role
              // color only applies to authors who aren't highlighted themselves.
              const userHighlightEntry = activeRoom?.highlightedUsers?.find((e) =>
                e === msg.author.id ||
                (e.startsWith('@') && msg.author.username && e.slice(1).toLowerCase() === msg.author.username.toLowerCase())
              );
              const roleHighlight = activeRoom?.highlightedRoles?.find((hr) =>
                msg.author.roles?.some((r) => r.id === hr.roleId)
              );
              const highlightColor = userHighlightEntry
                ? activeRoom?.highlightedUserColors?.[userHighlightEntry] ?? activeRoom?.highlightedUserColors?.[msg.author.id]
                : roleHighlight?.color;

              return (
                <div key={msg.id} id={`msg-${msg.id}`} className="transition-colors duration-500">
                  <Message
                    message={msg}
                    isCompact={isCompact}
                    messageDisplay={config?.messageDisplay ?? 'default'}
                    compactModeAvatars={config?.compactModeAvatars ?? true}
                    compactModeNameOnce={config?.compactModeNameOnce ?? false}
                    guildColor={guildColor}
                    highlightMode={activeRoom?.highlightMode ?? 'background'}
                    highlightColor={highlightColor}
                    disableEmbeds={embedDisabledChannels.has(msg.channelId)}
                    evmAddressColor={config?.evmAddressColor ?? '#fee75c'}
                    solAddressColor={config?.solAddressColor ?? '#14f195'}
                    contractLinkTemplates={config?.contractLinkTemplates}
                    contractClickAction={config?.contractClickAction ?? 'copy_open'}
                    showFullContractAddress={config?.showFullContractAddress ?? false}
                    openInDiscordApp={config?.openInDiscordApp ?? true}
                    openInTelegramApp={config?.openInTelegramApp ?? true}
                    badgeClickAction={config?.badgeClickAction ?? 'discord'}
                    serverIconBadge={serverIconBadge}
                    guildIcon={msg.guildId ? guildIcons[msg.guildId] ?? null : null}
                    customUserNames={config?.customUserNames}
                    onRenameUser={renameUser}
                    onHideUser={hideUser}
                    onHideRole={hideRole}
                    onToggleHighlight={activeRoom ? toggleHighlightUser : undefined}
                    onToggleHighlightRole={activeRoom ? toggleHighlightRole : undefined}
                    highlightedRoleIds={activeRoom?.highlightedRoles?.map((hr) => hr.roleId)}
                    isUserHighlighted={!!userHighlightEntry}
                    isRoleHighlighted={!!roleHighlight}
                    onFocus={handleFocus}
                    isFocused={focusFilter !== null && focusFilter.guildId === msg.guildId && focusFilter.channelId === msg.channelId}
                    onQuickReply={handleQuickReply}
                    onDismiss={dismissableFeed ? () => dismissRoomMessage(roomId, msg.id) : undefined}
                    chattingEnabled={chattingEnabled}
                    roleColors={config?.roleColors ?? true}
                  />
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}

      {/* New-messages pill (shown while viewing older messages) */}
      {newMessageCount > 0 && !searchOpen && (
        <button
          onClick={jumpToPresent}
          className="absolute top-12 compact:top-[52px] left-0 right-0 z-20 flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 compact:py-2.5 bg-discord-blurple hover:bg-discord-blurple-hover text-white text-xs sm:text-sm compact:text-sm font-medium shadow-md transition-colors"
        >
          <span className="truncate">
            {newMessageCount} new message{newMessageCount !== 1 ? 's' : ''}
            {firstNewMessage ? ` since ${formatTime(firstNewMessage.timestamp)}` : ''}
          </span>
          <span className="flex items-center gap-1 shrink-0">Jump <ArrowDown size={14} /></span>
        </button>
      )}

      {/* "Viewing older messages" banner (replaces the plain jump button) */}
      {viewingOlder && !searchOpen && roomMessages.length > 0 && (
        <div
          className={`absolute ${chattingEnabled ? 'bottom-16' : 'bottom-4'} left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-full bg-discord-dark/95 border border-black/30 shadow-lg shadow-black/25`}
        >
          <span className="text-xs sm:text-sm text-discord-text-muted whitespace-nowrap">You're viewing older messages</span>
          <button
            onClick={jumpToPresent}
            className="flex items-center gap-1 text-xs sm:text-sm compact:text-sm font-semibold text-white bg-discord-blurple hover:bg-discord-blurple-hover px-2.5 py-1 compact:py-2 compact:px-3.5 rounded-full transition-colors whitespace-nowrap"
          >
            Jump To Present <ArrowDown size={14} />
          </button>
        </div>
      )}

      {/* Chat input */}
      {chattingEnabled && (
        isAnyDMView && dmChannelId ? (
          <ChatInput
            channels={[]}
            isDM
            dmChannelId={dmChannelId}
            dmSource={isTgDMView ? 'telegram' : 'discord'}
          />
        ) : activeRoom ? (
          <ChatInput
            channels={activeRoom.channels}
            defaultChannelId={quickReplyChannelId ?? focusFilter?.channelId ?? null}
          />
        ) : null
      )}

      <ConfirmModal
        open={clearConfirmOpen}
        title={isAnyDMView ? 'Clear Conversation' : `Clear ${headerTitle}`}
        message={
          isAnyDMView
            ? `Remove all ${allRoomMessages.length} message${allRoomMessages.length === 1 ? '' : 's'} from this conversation? It disappears from the sidebar until they message you again.`
            : `Remove all ${allRoomMessages.length} message${allRoomMessages.length === 1 ? '' : 's'} from ${headerTitle}? New ones keep arriving as usual.`
        }
        confirmLabel="Clear"
        onConfirm={() => {
          clearRoomMessages(roomId);
          setClearConfirmOpen(false);
        }}
        onCancel={() => setClearConfirmOpen(false)}
      />
    </div>
  );
}
