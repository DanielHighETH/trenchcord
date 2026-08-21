import { useEffect, useRef, useState, type DragEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { useAppStore } from '../stores/appStore';
import { dmListMatches } from '../utils/dmFilters';
import { Hash, Plus, Settings, Trash2, FileText, HelpCircle, PanelLeftClose, User, Send, AtSign, LayoutGrid, Tag, Crosshair, BellRing, MessagesSquare, Eraser } from 'lucide-react';
import { isHostedMode } from '../lib/supabase';
import { isCompactLayout } from '../utils/platform';
import { consumeInstantDrawerOpen, suppressGhostClicks } from '../utils/drawer';
import { getAvatarUrl } from './Message';
import ConfirmModal from './ConfirmModal';

export default function Sidebar() {
  const rooms = useAppStore((s) => s.rooms);
  const paneRoomIds = useAppStore((s) => s.paneRoomIds);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const layoutEditMode = useAppStore((s) => s.layoutEditMode);
  const toggleLayoutEditMode = useAppStore((s) => s.toggleLayoutEditMode);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveRoom = useAppStore((s) => s.setActiveRoom);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const openConfigModal = useAppStore((s) => s.openConfigModal);
  const deleteRoom = useAppStore((s) => s.deleteRoom);
  const clearRoomMessages = useAppStore((s) => s.clearRoomMessages);
  const connected = useAppStore((s) => s.connected);
  const messages = useAppStore((s) => s.messages);
  const dmChannels = useAppStore((s) => s.dmChannels);
  const config = useAppStore((s) => s.config);
  const contracts = useAppStore((s) => s.contracts);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const authStatus = useAppStore((s) => s.authStatus);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const closeMobile = () => {
    if (window.innerWidth < 768) {
      toggleSidebar();
      suppressGhostClicks();
    }
  };

  // Phone drawer animation. `rendered` keeps the component mounted through
  // the exit slide; `shown` drives the transform/opacity classes one frame
  // after mount so the entry actually transitions. Desktop keeps the original
  // instant mount/unmount (the drawer is in-flow there, nothing to slide).
  const [rendered, setRendered] = useState(!collapsed);
  const [shown, setShown] = useState(!collapsed);
  useEffect(() => {
    if (!collapsed) {
      setRendered(true);
      // Returning from Settings: the drawer was conceptually open the whole
      // time, so it appears in place instead of sliding in.
      if (consumeInstantDrawerOpen()) {
        setShown(true);
        return;
      }
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    if (!isCompactLayout()) {
      setRendered(false);
      return;
    }
    const timer = setTimeout(() => setRendered(false), 240);
    return () => clearTimeout(timer);
  }, [collapsed]);

  // Swipe the drawer (or its scrim) left to close it — overlay mode only.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onDrawerTouchStart = (e: ReactTouchEvent) => {
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };
  const onDrawerTouchMove = (e: ReactTouchEvent) => {
    const start = swipeStart.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = start.x - t.clientX;
    const dy = Math.abs(t.clientY - start.y);
    // Clearly vertical movement is the room list scrolling — give the gesture
    // up rather than firing later when the finger drifts leftwards.
    if (dy > 60 && dy > dx) {
      swipeStart.current = null;
      return;
    }
    // Deliberate pull only — mirrors the 96px open threshold in App.tsx, so a
    // casual graze can no longer slam the drawer shut mid-scroll.
    if (dx > 96 && dx > dy * 1.5) {
      swipeStart.current = null;
      if (window.innerWidth < 768) toggleSidebar();
    }
  };

  const isRoomActive = (id: string) => activeView === 'chat' && paneRoomIds.includes(id);

  // In layout edit mode, sidebar entries can be dragged into a split pane.
  const dragProps = (key: string) =>
    layoutEditMode
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData('text/plain', `room:${key}`);
            e.dataTransfer.effectAllowed = 'copy';
          },
        }
      : {};

  const renderUnread = (count: number) =>
    count > 0 ? (
      <span className="min-w-[18px] h-[18px] px-1.5 flex items-center justify-center rounded-full bg-discord-blurple text-white text-[11px] font-bold leading-none shrink-0">
        {count > 99 ? '99+' : count}
      </span>
    ) : null;

  if (!rendered) {
    return null;
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => { toggleSidebar(); suppressGhostClicks(); }}
        onTouchStart={onDrawerTouchStart}
        onTouchMove={onDrawerTouchMove}
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 md:relative md:z-auto w-60 compact:w-full bg-discord-sidebar flex flex-col h-full shrink-0 transition-all duration-200 ease-out compact:pt-[var(--safe-top)] ${shown ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        onTouchStart={onDrawerTouchStart}
        onTouchMove={onDrawerTouchMove}
      >
      {/* Header */}
      <div className="h-12 px-4 flex items-center shadow-[0_1px_0_rgba(0,0,0,0.2),0_1.5px_0_rgba(0,0,0,0.05),0_2px_0_rgba(0,0,0,0.05)] border-b border-discord-darker/50 shrink-0">
        <h1 className="flex items-center gap-2 text-base font-semibold text-discord-header-primary truncate">
          <img
            src="/trenchcord.png"
            alt="Trenchcord"
            decoding="async"
            className="w-6 h-6 rounded"
            onError={(e) => {
              // A load that failed while iOS was thawing the local backend
              // stays a broken icon forever without this.
              const img = e.currentTarget;
              const tries = Number(img.dataset.retry ?? '0');
              if (tries >= 5) return;
              img.dataset.retry = String(tries + 1);
              setTimeout(() => {
                img.src = `/trenchcord.png?retry=${tries + 1}`;
              }, 1000 * (tries + 1));
            }}
          />
          Trenchcord
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <div
            className={`w-2 h-2 compact:w-2.5 compact:h-2.5 rounded-full ${connected ? 'bg-discord-green' : 'bg-discord-red'}`}
            title={connected ? 'Discord connected' : 'Discord disconnected'}
          />
          {authStatus?.telegramConfigured && (
            <div
              className={`w-2 h-2 compact:w-2.5 compact:h-2.5 rounded-full ${authStatus.telegramConnected ? 'bg-[#2AABEE]' : 'bg-yellow-500'}`}
              title={authStatus.telegramConnected ? 'Telegram connected' : 'Telegram disconnected'}
            />
          )}
          <button
            onClick={toggleSidebar}
            className="ml-1 p-1 compact:p-2 rounded text-discord-channel-icon hover:text-discord-header-primary hover:bg-discord-hover transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={16} className="compact:w-5 compact:h-5" />
          </button>
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto pt-4 px-2">
        {/* Contract Dashboard link */}
        <div
          className={`flex items-center gap-1.5 px-2 py-[6px] compact:py-2.5 rounded cursor-pointer mb-2 ${
            activeView === 'contracts'
              ? 'bg-discord-hover-light text-discord-header-primary font-medium'
              : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
          }`}
          onClick={() => { setActiveView('contracts'); closeMobile(); }}
        >
          <FileText size={20} className="shrink-0 opacity-70" />
          <span className="text-base leading-5 truncate flex-1">Contracts</span>
          {contracts.length > 0 && (
            <span className="text-[10px] text-discord-text-muted">{contracts.length}</span>
          )}
        </div>

        {/* Mentions link */}
        <div
          className={`flex items-center gap-1.5 px-2 py-[6px] compact:py-2.5 rounded cursor-pointer mb-2 ${
            isRoomActive('mentions')
              ? 'bg-discord-hover-light text-discord-header-primary font-medium'
              : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
          } ${layoutEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onClick={() => { setActiveRoom('mentions'); closeMobile(); }}
          {...dragProps('mentions')}
        >
          <AtSign size={20} className="shrink-0 opacity-70" />
          <span className="text-base leading-5 truncate flex-1">Mentions</span>
          {renderUnread(unreadCounts['mentions'] ?? 0)}
        </div>

        {/* Keywords link */}
        <div
          className={`flex items-center gap-1.5 px-2 py-[6px] compact:py-2.5 rounded cursor-pointer mb-2 ${
            isRoomActive('keywords')
              ? 'bg-discord-hover-light text-discord-header-primary font-medium'
              : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
          } ${layoutEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onClick={() => { setActiveRoom('keywords'); closeMobile(); }}
          {...dragProps('keywords')}
        >
          <Tag size={20} className="shrink-0 opacity-70" />
          <span className="text-base leading-5 truncate flex-1">Keywords</span>
          {renderUnread(unreadCounts['keywords'] ?? 0)}
        </div>

        <div
          className={`group/snipes flex items-center gap-1.5 px-2 py-[6px] compact:py-2.5 rounded cursor-pointer mb-2 ${
            isRoomActive('snipes')
              ? 'bg-discord-hover-light text-discord-header-primary font-medium'
              : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
          } ${layoutEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onClick={() => { setActiveRoom('snipes'); closeMobile(); }}
          {...dragProps('snipes')}
        >
          <Crosshair size={20} className="shrink-0 opacity-70" />
          <span className="text-base leading-5 truncate flex-1">Snipes</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveView('settings', 'trading');
              closeMobile();
            }}
            className="hidden group-hover/snipes:block compact:block text-discord-text-muted hover:text-discord-text transition-colors shrink-0"
            title="Sniping settings"
          >
            <Settings size={14} />
          </button>
          {renderUnread(unreadCounts['snipes'] ?? 0)}
        </div>

        {!isHostedMode && (
          <div
            className={`group/alerts flex items-center gap-1.5 px-2 py-[6px] compact:py-2.5 rounded cursor-pointer mb-2 ${
              isRoomActive('alerts')
                ? 'bg-discord-hover-light text-discord-header-primary font-medium'
                : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
            } ${layoutEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onClick={() => { setActiveRoom('alerts'); closeMobile(); }}
            {...dragProps('alerts')}
          >
            <BellRing size={20} className="shrink-0 opacity-70" />
            <span className="text-base leading-5 truncate flex-1">Alerts</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveRoom('alerts');
                useAppStore.getState().setAlertCreateOpen(true);
                closeMobile();
              }}
              className="hidden group-hover/alerts:block compact:block text-discord-text-muted hover:text-discord-text transition-colors shrink-0"
              title="New alert"
            >
              <Plus size={14} />
            </button>
            {renderUnread(unreadCounts['alerts'] ?? 0)}
          </div>
        )}

        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-xs font-bold uppercase tracking-[0.02em] text-discord-channel-icon">
            Rooms
          </span>
          <button
            onClick={() => openConfigModal()}
            className="compact:p-2 compact:-m-2 text-discord-text-muted hover:text-discord-text transition-colors"
            title="Create room"
          >
            <Plus size={16} className="compact:w-[18px] compact:h-[18px]" />
          </button>
        </div>

        {rooms.length === 0 && (
          <div className="px-2 py-4 text-sm text-discord-text-muted text-center">
            No rooms yet.
            <br />
            <button
              onClick={() => openConfigModal()}
              className="text-discord-blurple hover:underline mt-1 inline-block"
            >
              Create one
            </button>
          </div>
        )}

        {rooms.map((room) => {
          const isActive = isRoomActive(room.id);
          const unread = unreadCounts[room.id] ?? 0;

          return (
            <div
              key={room.id}
              className={`group flex items-center gap-1.5 px-2 py-[6px] compact:py-2.5 rounded cursor-pointer mb-[1px] ${
                isActive
                  ? 'bg-discord-hover-light text-discord-header-primary font-medium'
                  : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
              } ${layoutEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
              onClick={() => { setActiveRoom(room.id); closeMobile(); }}
              {...dragProps(room.id)}
            >
              <Hash size={20} className="shrink-0 opacity-70" />
              <span className="text-base leading-5 truncate flex-1">{room.name}</span>
              {renderUnread(unread)}
              <div className="hidden group-hover:flex compact:flex items-center gap-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openConfigModal(room);
                  }}
                  className="p-0.5 hover:text-white"
                  title="Edit room"
                >
                  <Settings size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: room.id, name: room.name });
                  }}
                  className="p-0.5 hover:text-discord-red"
                  title="Delete room"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}

        {/* Discord DM Channels */}
        {(() => {
          const dmLookup = new Map(dmChannels.map((dm) => [dm.id, dm]));
          // Hidden conversations never render — the backend stops routing new
          // messages to them, this filter takes care of already-stored ones.
          // Matching the first stored author too covers conversations the DM
          // channel list doesn't know (yet).
          const hiddenList = config?.dmHiddenConversations ?? [];
          const activeDMs = Object.keys(messages)
            .filter((key) => key.startsWith('dm:') && (messages[key]?.length ?? 0) > 0)
            .map((key) => {
              const channelId = key.slice(3);
              const dm = dmLookup.get(channelId);
              const msgs = messages[key];
              const lastMsg = msgs[msgs.length - 1];
              return { channelId, dm, dmRoomId: key, lastTimestamp: lastMsg?.timestamp ?? '' };
            })
            .filter(({ dm, dmRoomId }) => {
              if (hiddenList.length === 0) return true;
              const first = messages[dmRoomId]?.[0];
              return !dmListMatches(hiddenList, [
                ...(dm?.recipients ?? []).map((r) => ({ id: r.id, names: [r.username, r.global_name] })),
                ...(first ? [{ id: first.author.id, names: [first.author.username, first.author.displayName] }] : []),
              ]);
            })
            .sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp));

          // The All DMs feed aggregates Telegram DMs too, so its row (and the
          // section header) must appear as soon as *any* DM conversation
          // exists — not only once a Discord DM has arrived.
          const hasTgDMs = Object.keys(messages).some(
            (key) => key.startsWith('tg-dm:') && (messages[key]?.length ?? 0) > 0
          );
          if (activeDMs.length === 0 && !hasTgDMs) return null;

          return (
            <>
              <div className="flex items-center px-2 mb-1 mt-4">
                <span className="text-xs font-bold uppercase tracking-[0.02em] text-discord-channel-icon">
                  Direct Messages
                </span>
              </div>
              {/* Aggregate feed: every incoming Discord DM in one room. */}
              <div
                className={`group/dms flex items-center gap-1.5 px-2 py-[6px] compact:py-2.5 rounded cursor-pointer mb-[1px] ${
                  isRoomActive('dms')
                    ? 'bg-discord-hover-light text-discord-header-primary font-medium'
                    : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
                } ${layoutEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
                onClick={() => { setActiveRoom('dms'); closeMobile(); }}
                {...dragProps('dms')}
              >
                <MessagesSquare size={20} className="shrink-0 opacity-70" />
                <span className="text-base leading-5 truncate flex-1">All DMs</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveView('settings', 'dms');
                    closeMobile();
                  }}
                  className="hidden group-hover/dms:block compact:block text-discord-text-muted hover:text-discord-text transition-colors shrink-0"
                  title="Direct Messages settings"
                >
                  <Settings size={14} />
                </button>
                {renderUnread(unreadCounts['dms'] ?? 0)}
              </div>
              {activeDMs.map(({ channelId, dm, dmRoomId }) => {
                const recipientNames = dm
                  ? dm.recipients.map((r) => r.global_name || r.username || 'Unknown').join(', ')
                  : messages[dmRoomId]?.[0]?.author.displayName ?? 'DM';
                const isActive = isRoomActive(dmRoomId);
                const unread = unreadCounts[dmRoomId] ?? 0;

                return (
                  <div
                    key={channelId}
                    className={`group flex items-center gap-1.5 px-2 py-[6px] compact:py-2.5 rounded cursor-pointer mb-[1px] ${
                      isActive
                        ? 'bg-discord-hover-light text-discord-header-primary font-medium'
                        : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
                    } ${layoutEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onClick={() => { setActiveRoom(dmRoomId); closeMobile(); }}
                    {...dragProps(dmRoomId)}
                  >
                    {dm && dm.recipients.length === 1 ? (
                      <img
                        src={getAvatarUrl(dm.recipients[0].id, dm.recipients[0].avatar)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-6 h-6 rounded-full shrink-0"
                      />
                    ) : dm && dm.recipients.length > 1 ? (
                      <div className="relative w-6 h-6 shrink-0">
                        <img
                          src={getAvatarUrl(dm.recipients[0].id, dm.recipients[0].avatar)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="absolute top-0 left-0 w-[18px] h-[18px] rounded-full ring-2 ring-discord-sidebar"
                        />
                        <img
                          src={getAvatarUrl(dm.recipients[1].id, dm.recipients[1].avatar)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="absolute bottom-0 right-0 w-[18px] h-[18px] rounded-full ring-2 ring-discord-sidebar"
                        />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-discord-dark flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-discord-text-muted">DM</span>
                      </div>
                    )}
                    <span className="text-base leading-5 truncate flex-1">{recipientNames}</span>
                    {renderUnread(unread)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearRoomMessages(dmRoomId);
                      }}
                      className="hidden group-hover:block compact:block p-0.5 hover:text-white shrink-0"
                      title="Clear conversation (comes back when they message again)"
                    >
                      <Eraser size={14} />
                    </button>
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* Telegram DM Channels */}
        {(() => {
          // Hidden conversations never render — the backend stops routing new
          // messages to them, this filter takes care of already-stored ones.
          const hiddenList = config?.tgDmHiddenConversations ?? [];
          const activeTgDMs = Object.keys(messages)
            .filter((key) => key.startsWith('tg-dm:') && (messages[key]?.length ?? 0) > 0)
            .map((key) => {
              const chatId = key.slice(6);
              const msgs = messages[key];
              const lastMsg = msgs[msgs.length - 1];
              // channelName is the chat's title (the other person's name in a
              // DM); the author would be *you* whenever you sent the last message.
              return { chatId, tgDmRoomId: key, lastMsg, lastTimestamp: lastMsg?.timestamp ?? '', displayName: lastMsg?.channelName ?? lastMsg?.author.displayName ?? 'TG Chat' };
            })
            .filter(({ chatId, lastMsg }) =>
              !dmListMatches(hiddenList, [
                { id: chatId, names: [lastMsg?.chatUsername, lastMsg?.channelName] },
                ...(lastMsg ? [{ id: lastMsg.author.id, names: [lastMsg.author.username, lastMsg.author.displayName] }] : []),
              ]))
            .sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp));

          if (activeTgDMs.length === 0) return null;

          return (
            <>
              <div className="flex items-center px-2 mb-1 mt-4">
                <span className="text-xs font-bold uppercase tracking-[0.02em] text-[#2AABEE]">
                  Telegram DMs
                </span>
              </div>
              {activeTgDMs.map(({ chatId, tgDmRoomId, displayName }) => {
                const isActive = isRoomActive(tgDmRoomId);
                const unread = unreadCounts[tgDmRoomId] ?? 0;

                return (
                  <div
                    key={chatId}
                    className={`group flex items-center gap-1.5 px-2 py-[6px] compact:py-2.5 rounded cursor-pointer mb-[1px] ${
                      isActive
                        ? 'bg-discord-hover-light text-discord-header-primary font-medium'
                        : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
                    } ${layoutEditMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onClick={() => { setActiveRoom(tgDmRoomId); closeMobile(); }}
                    {...dragProps(tgDmRoomId)}
                  >
                    <Send size={16} className="shrink-0 text-[#2AABEE]" />
                    <span className="text-base leading-5 truncate flex-1">{displayName}</span>
                    {renderUnread(unread)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearRoomMessages(tgDmRoomId);
                      }}
                      className="hidden group-hover:block compact:block p-0.5 hover:text-white shrink-0"
                      title="Clear conversation (comes back when they message again)"
                    >
                      <Eraser size={14} />
                    </button>
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>

      {/* Social links. On the phone the drawer is full-width, so the button
          gets margins and breathing room above the footer divider instead of
          spanning edge to edge. */}
      <div className="px-2 pb-1 pt-2 compact:px-4 compact:pb-3 compact:pt-3 flex items-center gap-1.5 compact:gap-3 shrink-0">
        <a
          href="https://discord.gg/cDhrRVZ9xg"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 flex-1 px-2 py-1.5 compact:py-2.5 rounded compact:rounded-lg text-sm font-medium text-white bg-discord-blurple hover:bg-discord-blurple-hover transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
            <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
          </svg>
          Join Discord
        </a>
        <a
          href="https://x.com/trenchcordapp"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 compact:p-2.5 rounded text-discord-header-secondary hover:text-discord-header-primary hover:bg-discord-hover transition-colors"
          title="Follow on X"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
          </svg>
        </a>
      </div>

      {/* Footer */}
      <div className="h-[52px] px-2 flex items-center gap-1 shrink-0 bg-discord-sidebar border-t border-discord-darker/30 compact:h-auto compact:py-1.5 compact:pb-[calc(0.375rem+var(--safe-bottom))]">
        <button
          onClick={() => { setActiveView('settings'); closeMobile(); }}
          className={`flex items-center gap-2 text-sm transition-colors flex-1 px-2 py-1.5 rounded ${
            activeView === 'settings'
              ? 'text-discord-header-primary bg-discord-hover-light'
              : 'text-discord-header-secondary hover:text-discord-header-primary hover:bg-discord-hover'
          }`}
        >
          <Settings size={18} className={activeView === 'settings' ? 'text-discord-text' : ''} />
          <span>Settings</span>
        </button>
        {isHostedMode && (
          <button
            onClick={() => { setActiveView('profile'); closeMobile(); }}
            className={`p-1.5 compact:p-2.5 rounded transition-colors ${
              activeView === 'profile'
                ? 'text-discord-header-primary bg-discord-hover-light'
                : 'text-discord-header-secondary hover:text-discord-header-primary hover:bg-discord-hover'
            }`}
            title="Profile"
          >
            <User size={16} />
          </button>
        )}
        <button
          onClick={toggleLayoutEditMode}
          className={`p-1.5 compact:hidden rounded transition-colors ${
            layoutEditMode
              ? 'text-white bg-discord-blurple hover:bg-discord-blurple-hover'
              : 'text-discord-header-secondary hover:text-discord-header-primary hover:bg-discord-hover'
          }`}
          title={layoutEditMode ? 'Layout edit mode ON - resize & drag panes' : 'Edit layout (resize & drag panes)'}
        >
          <LayoutGrid size={16} />
        </button>
        <button
          onClick={() => { setActiveView('settings', 'help'); closeMobile(); }}
          className="p-1.5 compact:p-2.5 rounded text-discord-header-secondary hover:text-discord-header-primary hover:bg-discord-hover transition-colors"
          title="Help & Features"
        >
          <HelpCircle size={16} />
        </button>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Room"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteRoom(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
    </>
  );
}
