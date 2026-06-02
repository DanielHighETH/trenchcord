import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import Message from './Message';
import ChatInput from './ChatInput';
import { Hash, MessageCircle, Settings, ArrowDown, Filter, EyeOff, X, Trash2, Eye, Search, ChevronUp, ChevronDown, PanelLeftOpen, Send } from 'lucide-react';

const SCROLL_THRESHOLD = 150;
const WINDOW_INITIAL = 200;
const WINDOW_GROW = 200;
const LOAD_MORE_THRESHOLD = 300;

export default function ChatView() {
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const rooms = useAppStore((s) => s.rooms);
  const messages = useAppStore((s) => s.messages);
  const config = useAppStore((s) => s.config);
  const openConfigModal = useAppStore((s) => s.openConfigModal);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevLastIdRef = useRef<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const programmaticScrollRef = useRef(false);
  const settleRafRef = useRef<number | undefined>(undefined);
  const [renderLimit, setRenderLimit] = useState(WINDOW_INITIAL);
  const growingRef = useRef(false);

  const updateRoom = useAppStore((s) => s.updateRoom);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const dmChannels = useAppStore((s) => s.dmChannels);
  const hideUser = useAppStore((s) => s.hideUser);
  const unhideUser = useAppStore((s) => s.unhideUser);
  const focusFilter = useAppStore((s) => s.focusFilter);
  const setFocusFilter = useAppStore((s) => s.setFocusFilter);
  const clearFocusFilter = useAppStore((s) => s.clearFocusFilter);
  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [quickReplyChannelId, setQuickReplyChannelId] = useState<string | null>(null);

  const chattingEnabled = config?.chattingEnabled ?? false;

  const isDMView = activeRoomId?.startsWith('dm:') ?? false;
  const isTgDMView = activeRoomId?.startsWith('tg-dm:') ?? false;
  const isAnyDMView = isDMView || isTgDMView;
  const dmChannelId = isDMView ? activeRoomId!.slice(3) : isTgDMView ? activeRoomId!.slice(6) : null;
  const activeDM = isDMView ? dmChannels.find((dm) => dm.id === dmChannelId) : null;

  const activeRoom = isAnyDMView ? null : rooms.find((r) => r.id === activeRoomId);
  const allRoomMessages = activeRoomId ? (messages[activeRoomId] ?? []) : [];
  const embedDisabledChannels = new Set(
    activeRoom?.channels.filter((c) => c.disableEmbeds).map((c) => c.channelId)
  );

  const isFilterActive = activeRoom?.filterEnabled && (activeRoom?.filteredUsers?.length ?? 0) > 0;
  const filterSet = new Set(activeRoom?.filteredUsers?.map((u) => u.toLowerCase()) ?? []);

  const hiddenUsers = config?.hiddenUsers ?? {};
  const isUserHidden = (msg: typeof allRoomMessages[0]) => {
    const key = `${msg.guildId ?? 'null'}:${msg.channelId}`;
    return hiddenUsers[key]?.some((e) => e.userId === msg.author.id) ?? false;
  };

  const afterFilter = isFilterActive
    ? allRoomMessages.filter((msg) =>
        filterSet.has(msg.author.id) ||
        filterSet.has(msg.author.username.toLowerCase()) ||
        filterSet.has(msg.author.displayName.toLowerCase())
      )
    : allRoomMessages;

  const afterHidden = afterFilter.filter((msg) => !isUserHidden(msg));

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
        msg.author.username.toLowerCase().includes(trimmedSearch)
      ) {
        matches.push(msg);
      }
    }
    return matches;
  }, [afterFocus, trimmedSearch, searchOpen]);

  const roomMessages = searchResults
    ? searchResults
    : afterFocus.length > renderLimit
      ? afterFocus.slice(-renderLimit)
      : afterFocus;

  // The id of the newest message. We key auto-scroll off this rather than the
  // rendered count: in busy channels the render window is capped (slice of the
  // last N), so the count stops changing once it's full and new messages would
  // otherwise slip in without triggering a scroll.
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

  const handleQuickReply = useCallback((channelId: string) => {
    setQuickReplyChannelId(channelId);
  }, []);

  const handleFocus = useCallback((guildId: string | null, channelId: string, guildName: string | null, channelName: string) => {
    if (focusFilter && focusFilter.guildId === guildId && focusFilter.channelId === channelId) {
      clearFocusFilter();
    } else {
      setFocusFilter({ guildId, channelId, guildName, channelName });
    }
  }, [focusFilter, setFocusFilter, clearFocusFilter]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (searchOpen) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          openSearch();
        }
      }
      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        closeSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, openSearch, closeSearch]);

  const checkNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (programmaticScrollRef.current) return;

    // Grow the rendered window when the user scrolls near the top, preserving
    // visual scroll position so the viewport doesn't jump.
    if (
      !growingRef.current &&
      !searchResults &&
      el.scrollTop < LOAD_MORE_THRESHOLD &&
      renderLimit < afterFocus.length
    ) {
      growingRef.current = true;
      const prevHeight = el.scrollHeight;
      const prevTop = el.scrollTop;
      setRenderLimit((n) => Math.min(n + WINDOW_GROW, afterFocus.length));
      requestAnimationFrame(() => {
        const newEl = scrollContainerRef.current;
        if (newEl) {
          const delta = newEl.scrollHeight - prevHeight;
          if (delta > 0) newEl.scrollTop = prevTop + delta;
        }
        growingRef.current = false;
      });
    }

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, [searchResults, renderLimit, afterFocus.length]);

  const cancelSettle = useCallback(() => {
    if (settleRafRef.current !== undefined) {
      cancelAnimationFrame(settleRafRef.current);
      settleRafRef.current = undefined;
    }
  }, []);

  // Scroll to the bottom and keep chasing it until the layout settles. Tall
  // embeds and lazy-loaded images grow the content *after* the scroll begins,
  // so a fixed timeout would either release too early (stranding us mid-list
  // once checkNearBottom flips isNearBottom during a long smooth animation) or
  // fight the animation. The rAF loop re-reads scrollHeight every frame and
  // only finalizes once we're actually at the bottom and the height is stable.
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
          // Content grew (e.g. an image finished loading) — re-target the
          // smooth animation to the new bottom so we don't land short.
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
      // Instant chase, not a smooth animation. When several messages land at
      // once (or a multi-row/embed message arrives), a smooth scroll captures
      // a target that's stale by the time the content finishes growing and
      // finalizes mid-flight, leaving the newest message clipped below the
      // fold. The instant settle loop re-pins to the live scrollHeight every
      // frame, so it can't land short. Smooth is reserved for the manual
      // jump-to-bottom button, where the content is already laid out.
      performScroll(false);
    }
  }, [lastMessageId, performScroll]);

  useEffect(() => {
    isNearBottomRef.current = true;
    setShowScrollButton(false);
    cancelSettle();
    // Use the chasing scroll so a freshly-opened room with tall embeds/images
    // still ends up pinned to the bottom once those load.
    performScroll(false);
    clearFocusFilter();
    closeSearch();
  }, [activeRoomId, clearFocusFilter, performScroll, cancelSettle, closeSearch]);

  // Reset the rendered window so we never carry a stale large window across
  // rooms, focus filters or search toggles. The bottom-most messages are still
  // rendered immediately; the user can scroll up to load more.
  useEffect(() => {
    setRenderLimit(WINDOW_INITIAL);
    growingRef.current = false;
  }, [activeRoomId, focusFilter, searchOpen]);

  useEffect(() => {
    return () => cancelSettle();
  }, [cancelSettle]);

  // Cancel any in-flight programmatic scroll the moment the user takes over, so
  // the (now longer) chase loop never yanks them back while they scroll up.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onUserScroll = () => {
      if (!programmaticScrollRef.current) return;
      cancelSettle();
      programmaticScrollRef.current = false;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
      isNearBottomRef.current = nearBottom;
      setShowScrollButton(!nearBottom);
    };
    el.addEventListener('wheel', onUserScroll, { passive: true });
    el.addEventListener('touchstart', onUserScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', onUserScroll);
      el.removeEventListener('touchstart', onUserScroll);
    };
  }, [cancelSettle]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      // A settle loop already owns scrolling (and may be animating smoothly);
      // don't fight it.
      if (settleRafRef.current !== undefined) return;
      // The content height changed: a reaction pill appeared, a late embed or
      // image arrived/decoded, or a message was edited. If we were pinned, chase
      // the new bottom. Using the settle loop instead of a one-shot pin keeps us
      // glued even when the growth lands over several frames (e.g. a reaction's
      // emoji image decoding a beat after its pill), which previously left us
      // stranded a little above the newest message.
      if (isNearBottomRef.current) {
        performScroll(false);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [performScroll]);

  const scrollToBottom = () => {
    isNearBottomRef.current = true;
    setShowScrollButton(false);
    performScroll(true);
  };

  const dmRecipientNames = activeDM
    ? activeDM.recipients.map((r) => r.global_name || r.username || 'Unknown').join(', ')
    : isTgDMView
      ? (allRoomMessages[0]?.channelName ?? allRoomMessages[0]?.author.displayName ?? 'Telegram Chat')
      : null;

  if (!activeRoom && !activeDM && !isTgDMView) {
    return (
      <div className="flex-1 flex flex-col bg-discord-main">
        {sidebarCollapsed && (
          <div className="h-12 px-2 flex items-center border-b border-discord-dark/60 shrink-0">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded text-discord-channel-icon hover:text-discord-header-primary hover:bg-discord-hover transition-colors"
              title="Show sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-discord-text-muted">
            <Hash size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-xl font-semibold mb-2">No room selected</p>
            <p className="text-sm">Create a room and add some Discord channels to get started.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 relative" style={{ backgroundColor: activeRoom?.color || '#313338' }}>
      {/* Channel header */}
      <div className="h-12 px-2 sm:px-4 flex items-center shadow-[0_1px_0_rgba(0,0,0,0.2),0_1.5px_0_rgba(0,0,0,0.05),0_2px_0_rgba(0,0,0,0.05)] border-b border-discord-dark/60 shrink-0 bg-transparent z-10 gap-1">
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 -ml-0.5 mr-0.5 rounded text-discord-channel-icon hover:text-discord-header-primary hover:bg-discord-hover transition-colors shrink-0"
            title="Show sidebar"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        {isTgDMView ? (
          <Send size={20} className="text-[#2AABEE] mr-1.5 shrink-0" />
        ) : isDMView ? (
          <MessageCircle size={20} className="text-discord-channel-icon mr-1.5 shrink-0" />
        ) : (
          <Hash size={20} className="text-discord-channel-icon mr-1.5 shrink-0" />
        )}
        <span className="font-semibold text-sm sm:text-base text-discord-header-primary truncate">
          {isAnyDMView ? dmRecipientNames : activeRoom!.name}
        </span>
        {!isAnyDMView && (
          <span className="ml-2 text-xs sm:text-sm text-discord-header-secondary truncate hidden sm:inline">
            {activeRoom!.channels.length} channel{activeRoom!.channels.length !== 1 ? 's' : ''}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
          {activeRoom && activeRoom.highlightedUsers.length > 0 && (
            <span className="text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full bg-discord-blurple/20 text-discord-blurple hidden sm:inline-flex">
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
              <span className="hidden sm:inline">{activeRoom.filteredUsers.length} filtered</span> {activeRoom.filterEnabled ? 'ON' : 'OFF'}
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
          {channelHiddenUsers.length > 0 && (
            <button
              onClick={() => setHiddenPanelOpen(!hiddenPanelOpen)}
              className={`flex items-center gap-1 text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full transition-colors ${
                hiddenPanelOpen
                  ? 'bg-discord-red/20 text-discord-red'
                  : 'bg-discord-dark/50 text-discord-text-muted hover:text-discord-text'
              }`}
              title="View hidden users"
            >
              <EyeOff size={10} />
              <span className="hidden sm:inline">{channelHiddenUsers.length} hidden</span>
            </button>
          )}
          <button
            onClick={searchOpen ? closeSearch : openSearch}
            className={`p-1 transition-colors ${
              searchOpen ? 'text-white' : 'text-discord-channel-icon hover:text-discord-text'
            }`}
            title="Search messages (Ctrl+F)"
          >
            <Search size={18} />
          </button>
          {activeRoom && (
            <button
              onClick={() => openConfigModal(activeRoom)}
              className="p-1 text-discord-channel-icon hover:text-discord-text transition-colors"
              title="Room settings"
            >
              <Settings size={18} />
            </button>
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

      {/* Hidden users panel */}
      {hiddenPanelOpen && channelHiddenUsers.length > 0 && (
        <div className="border-b border-discord-dark/60 bg-discord-embed-bg px-3 sm:px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">
              Hidden Users
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
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={checkNearBottom}
        style={{ overflowAnchor: 'none' }}
      >
        <div ref={contentRef}>
          {roomMessages.length === 0 && (
            <div className="flex items-center justify-center h-full text-discord-text-muted text-sm">
              {searchOpen && trimmedSearch ? 'No messages match your search.' : 'Waiting for messages...'}
            </div>
          )}

          {roomMessages.map((msg, i) => {
            const prev = i > 0 ? roomMessages[i - 1] : null;
            const sameAuthor = prev?.author.id === msg.author.id;
            const timeDiff = prev
              ? new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime()
              : Infinity;
            const isCompact = sameAuthor && timeDiff < 5 * 60 * 1000 && prev?.channelId === msg.channelId;

            const guildColor = msg.source === 'telegram'
              ? config?.telegramColors?.[msg.channelId]
              : msg.guildId
                ? config?.guildColors?.[msg.guildId]
                : config?.dmColors?.[msg.channelId];
            const highlightColor = activeRoom?.highlightedUserColors?.[msg.author.id];

            return (
              <div key={msg.id} id={`msg-${msg.id}`} className="transition-colors duration-500">
                <Message
                  message={msg}
                  isCompact={isCompact}
                  messageDisplay={config?.messageDisplay ?? 'default'}
                  compactModeAvatars={config?.compactModeAvatars ?? true}
                  guildColor={guildColor}
                  highlightMode={activeRoom?.highlightMode ?? 'background'}
                  highlightColor={highlightColor}
                  disableEmbeds={embedDisabledChannels.has(msg.channelId)}
                  evmAddressColor={config?.evmAddressColor ?? '#fee75c'}
                  solAddressColor={config?.solAddressColor ?? '#14f195'}
                  contractLinkTemplates={config?.contractLinkTemplates}
                  contractClickAction={config?.contractClickAction ?? 'copy_open'}
                  showFullContractAddress={config?.showFullContractAddress ?? false}
                  openInDiscordApp={config?.openInDiscordApp ?? false}
                  openInTelegramApp={config?.openInTelegramApp ?? false}
                  badgeClickAction={config?.badgeClickAction ?? 'discord'}
                  onHideUser={hideUser}
                  onToggleHighlight={activeRoom ? toggleHighlightUser : undefined}
                  isUserHighlighted={
                    activeRoom?.highlightedUsers?.some((e) =>
                      e === msg.author.id ||
                      (e.startsWith('@') && msg.author.username && e.slice(1).toLowerCase() === msg.author.username.toLowerCase())
                    ) ?? false
                  }
                  onFocus={handleFocus}
                  isFocused={focusFilter !== null && focusFilter.guildId === msg.guildId && focusFilter.channelId === msg.channelId}
                  onQuickReply={handleQuickReply}
                  chattingEnabled={chattingEnabled}
                  roleColors={config?.roleColors ?? true}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollButton && roomMessages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className={`absolute ${chattingEnabled ? 'bottom-20' : 'bottom-6'} right-6 w-10 h-10 rounded-full bg-discord-dark border border-discord-dark flex items-center justify-center text-discord-text-muted hover:text-white hover:bg-discord-embed-bg transition-colors shadow-lg shadow-black/25`}
          title="Jump to bottom"
        >
          <ArrowDown size={18} />
        </button>
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
    </div>
  );
}
