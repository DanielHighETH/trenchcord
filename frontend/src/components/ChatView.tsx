import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import Message from './Message';
import { Hash, MessageCircle, Settings, ArrowDown, Filter, EyeOff, X, Trash2, Eye, Search, ChevronUp, ChevronDown } from 'lucide-react';

const SCROLL_THRESHOLD = 150;

export default function ChatView() {
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const rooms = useAppStore((s) => s.rooms);
  const messages = useAppStore((s) => s.messages);
  const config = useAppStore((s) => s.config);
  const openConfigModal = useAppStore((s) => s.openConfigModal);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const programmaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateRoom = useAppStore((s) => s.updateRoom);
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

  const isDMView = activeRoomId?.startsWith('dm:') ?? false;
  const dmChannelId = isDMView ? activeRoomId!.slice(3) : null;
  const activeDM = isDMView ? dmChannels.find((dm) => dm.id === dmChannelId) : null;

  const activeRoom = isDMView ? null : rooms.find((r) => r.id === activeRoomId);
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

  const roomMessages = searchResults ?? afterFocus;

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

  const handleFocus = (guildId: string | null, channelId: string, guildName: string | null, channelName: string) => {
    if (focusFilter && focusFilter.guildId === guildId && focusFilter.channelId === channelId) {
      clearFocusFilter();
    } else {
      setFocusFilter({ guildId, channelId, guildName, channelName });
    }
  };

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

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, []);

  const scrollToEnd = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const performScroll = useCallback((smooth: boolean) => {
    const useSmooth = smooth && !document.hidden;

    programmaticScrollRef.current = true;
    clearTimeout(scrollTimeoutRef.current);

    if (useSmooth) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

      scrollTimeoutRef.current = setTimeout(() => {
        scrollToEnd();
        programmaticScrollRef.current = false;
        isNearBottomRef.current = true;
        setShowScrollButton(false);
      }, 400);
    } else {
      scrollToEnd();
      requestAnimationFrame(() => {
        scrollToEnd();
        programmaticScrollRef.current = false;
        isNearBottomRef.current = true;
        setShowScrollButton(false);
      });
    }
  }, [scrollToEnd]);

  useEffect(() => {
    const prev = prevMessageCountRef.current;
    if (roomMessages.length !== prev) {
      prevMessageCountRef.current = roomMessages.length;
      if (isNearBottomRef.current) {
        const isBulkLoad = prev === 0 && roomMessages.length > 1;
        performScroll(!isBulkLoad);
      }
    }
  }, [roomMessages.length, performScroll]);

  useEffect(() => {
    isNearBottomRef.current = true;
    setShowScrollButton(false);
    programmaticScrollRef.current = false;
    clearTimeout(scrollTimeoutRef.current);
    scrollToEnd();
    requestAnimationFrame(scrollToEnd);
    clearFocusFilter();
    closeSearch();
  }, [activeRoomId, clearFocusFilter, scrollToEnd, closeSearch]);

  useEffect(() => {
    return () => clearTimeout(scrollTimeoutRef.current);
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (isNearBottomRef.current) {
        const container = scrollContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = () => {
    isNearBottomRef.current = true;
    setShowScrollButton(false);
    performScroll(true);
  };

  const dmRecipientNames = activeDM
    ? activeDM.recipients.map((r) => r.global_name || r.username || 'Unknown').join(', ')
    : null;

  if (!activeRoom && !activeDM) {
    return (
      <div className="flex-1 flex items-center justify-center bg-discord-main">
        <div className="text-center text-discord-text-muted">
          <Hash size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-xl font-semibold mb-2">No room selected</p>
          <p className="text-sm">Create a room and add some Discord channels to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 relative" style={{ backgroundColor: activeRoom?.color || '#313338' }}>
      {/* Channel header */}
      <div className="h-12 px-4 flex items-center shadow-md border-b border-discord-darker/50 shrink-0">
        {isDMView ? (
          <MessageCircle size={20} className="text-discord-channel-icon mr-2" />
        ) : (
          <Hash size={20} className="text-discord-channel-icon mr-2" />
        )}
        <span className="font-semibold text-[15px] text-white">
          {isDMView ? dmRecipientNames : activeRoom!.name}
        </span>
        {!isDMView && (
          <span className="ml-3 text-sm text-discord-text-muted">
            {activeRoom!.channels.length} channel{activeRoom!.channels.length !== 1 ? 's' : ''}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {activeRoom && activeRoom.highlightedUsers.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-discord-blurple/20 text-discord-blurple">
              {activeRoom.highlightedUsers.length} highlighted
            </span>
          )}
          {activeRoom && (activeRoom.filteredUsers?.length ?? 0) > 0 && (
            <button
              onClick={toggleFilter}
              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                activeRoom.filterEnabled
                  ? 'bg-discord-green/20 text-discord-green'
                  : 'bg-discord-dark/50 text-discord-text-muted hover:text-discord-text'
              }`}
              title={activeRoom.filterEnabled ? 'Click to disable user filter' : 'Click to enable user filter'}
            >
              <Filter size={10} />
              {activeRoom.filteredUsers.length} filtered {activeRoom.filterEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          {focusFilter && (
            <button
              onClick={clearFocusFilter}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-discord-blurple/20 text-discord-blurple hover:bg-discord-blurple/30 transition-colors"
              title="Click to exit focus mode"
            >
              <Eye size={10} />
              Focus Mode — {focusFilter.guildName ? `${focusFilter.guildName} / ` : ''}#{focusFilter.channelName}
              <X size={10} />
            </button>
          )}
          {channelHiddenUsers.length > 0 && (
            <button
              onClick={() => setHiddenPanelOpen(!hiddenPanelOpen)}
              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                hiddenPanelOpen
                  ? 'bg-discord-red/20 text-discord-red'
                  : 'bg-discord-dark/50 text-discord-text-muted hover:text-discord-text'
              }`}
              title="View hidden users"
            >
              <EyeOff size={10} />
              {channelHiddenUsers.length} hidden
            </button>
          )}
          <button
            onClick={searchOpen ? closeSearch : openSearch}
            className={`transition-colors ${
              searchOpen ? 'text-white' : 'text-discord-channel-icon hover:text-discord-text'
            }`}
            title="Search messages (Ctrl+F)"
          >
            <Search size={18} />
          </button>
          {activeRoom && (
            <button
              onClick={() => openConfigModal(activeRoom)}
              className="text-discord-channel-icon hover:text-discord-text transition-colors"
              title="Room settings"
            >
              <Settings size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-discord-darker/50 bg-discord-dark/60 shrink-0 flex items-center gap-2">
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
            className="flex-1 bg-discord-darker/80 text-discord-text text-sm px-3 py-1.5 rounded-md outline-none placeholder:text-discord-text-muted/60 focus:ring-1 focus:ring-discord-blurple/50"
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
        <div className="border-b border-discord-divider bg-discord-dark/80 px-4 py-3 shrink-0">
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
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-discord-sidebar/60"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <EyeOff size={12} className="shrink-0 text-discord-red/70" />
                  <span className="text-sm text-white font-medium truncate">{entry.displayName}</span>
                  <span className="text-[11px] text-discord-text-muted font-mono">{entry.userId}</span>
                  <span className="text-[10px] text-discord-text-muted truncate">
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
        className="flex-1 overflow-y-auto py-4"
        onScroll={checkNearBottom}
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

            const guildColor = msg.guildId ? config?.guildColors?.[msg.guildId] : undefined;

            return (
              <div key={msg.id} id={`msg-${msg.id}`} className="transition-colors duration-500">
                <Message
                  message={msg}
                  isCompact={isCompact}
                  guildColor={guildColor}
                  disableEmbeds={embedDisabledChannels.has(msg.channelId)}
                  evmAddressColor={config?.evmAddressColor ?? '#fee75c'}
                  solAddressColor={config?.solAddressColor ?? '#14f195'}
                  contractLinkTemplates={config?.contractLinkTemplates}
                  contractClickAction={config?.contractClickAction ?? 'copy_open'}
                  openInDiscordApp={config?.openInDiscordApp ?? false}
                  badgeClickAction={config?.badgeClickAction ?? 'discord'}
                  onHideUser={hideUser}
                  onFocus={handleFocus}
                  isFocused={focusFilter !== null && focusFilter.guildId === msg.guildId && focusFilter.channelId === msg.channelId}
                />
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollButton && roomMessages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 w-10 h-10 rounded-full bg-discord-dark border border-discord-divider flex items-center justify-center text-discord-text-muted hover:text-white hover:bg-discord-sidebar transition-colors shadow-lg"
          title="Jump to bottom"
        >
          <ArrowDown size={18} />
        </button>
      )}
    </div>
  );
}
