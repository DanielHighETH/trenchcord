import { useState, type DragEvent } from 'react';
import { useAppStore } from '../stores/appStore';
import { Hash, Plus, Settings, Trash2, FileText, HelpCircle, PanelLeftClose, User, Send, AtSign, LayoutGrid } from 'lucide-react';
import { isHostedMode } from '../lib/supabase';
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
  const connected = useAppStore((s) => s.connected);
  const messages = useAppStore((s) => s.messages);
  const dmChannels = useAppStore((s) => s.dmChannels);
  const contracts = useAppStore((s) => s.contracts);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const authStatus = useAppStore((s) => s.authStatus);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const closeMobile = () => {
    if (window.innerWidth < 768) toggleSidebar();
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

  if (collapsed) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={toggleSidebar} />
      <div className="fixed inset-y-0 left-0 z-50 md:relative md:z-auto w-60 bg-discord-sidebar flex flex-col h-full shrink-0 transition-all duration-200">
      {/* Header */}
      <div className="h-12 px-4 flex items-center shadow-[0_1px_0_rgba(0,0,0,0.2),0_1.5px_0_rgba(0,0,0,0.05),0_2px_0_rgba(0,0,0,0.05)] border-b border-discord-darker/50 shrink-0">
        <h1 className="flex items-center gap-2 text-base font-semibold text-discord-header-primary truncate">
          <img src="/trenchcord.png" alt="Trenchcord" decoding="async" className="w-6 h-6 rounded" />
          Trenchcord
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-discord-green' : 'bg-discord-red'}`}
            title={connected ? 'Discord connected' : 'Discord disconnected'}
          />
          {authStatus?.telegramConfigured && (
            <div
              className={`w-2 h-2 rounded-full ${authStatus.telegramConnected ? 'bg-[#2AABEE]' : 'bg-yellow-500'}`}
              title={authStatus.telegramConnected ? 'Telegram connected' : 'Telegram disconnected'}
            />
          )}
          <button
            onClick={toggleSidebar}
            className="ml-1 p-1 rounded text-discord-channel-icon hover:text-discord-header-primary hover:bg-discord-hover transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto pt-4 px-2">
        {/* Contract Dashboard link */}
        <div
          className={`flex items-center gap-1.5 px-2 py-[6px] rounded cursor-pointer mb-2 ${
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
          className={`flex items-center gap-1.5 px-2 py-[6px] rounded cursor-pointer mb-2 ${
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

        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-xs font-bold uppercase tracking-[0.02em] text-discord-channel-icon">
            Rooms
          </span>
          <button
            onClick={() => openConfigModal()}
            className="text-discord-text-muted hover:text-discord-text transition-colors"
            title="Create room"
          >
            <Plus size={16} />
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
              className={`group flex items-center gap-1.5 px-2 py-[6px] rounded cursor-pointer mb-[1px] ${
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
              <div className="hidden group-hover:flex items-center gap-0.5">
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
          const activeDMs = Object.keys(messages)
            .filter((key) => key.startsWith('dm:') && (messages[key]?.length ?? 0) > 0)
            .map((key) => {
              const channelId = key.slice(3);
              const dm = dmLookup.get(channelId);
              const msgs = messages[key];
              const lastMsg = msgs[msgs.length - 1];
              return { channelId, dm, dmRoomId: key, lastTimestamp: lastMsg?.timestamp ?? '' };
            })
            .sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp));

          if (activeDMs.length === 0) return null;

          return (
            <>
              <div className="flex items-center px-2 mb-1 mt-4">
                <span className="text-xs font-bold uppercase tracking-[0.02em] text-discord-channel-icon">
                  Direct Messages
                </span>
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
                    className={`group flex items-center gap-1.5 px-2 py-[6px] rounded cursor-pointer mb-[1px] ${
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
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* Telegram DM Channels */}
        {(() => {
          const activeTgDMs = Object.keys(messages)
            .filter((key) => key.startsWith('tg-dm:') && (messages[key]?.length ?? 0) > 0)
            .map((key) => {
              const chatId = key.slice(6);
              const msgs = messages[key];
              const lastMsg = msgs[msgs.length - 1];
              return { chatId, tgDmRoomId: key, lastTimestamp: lastMsg?.timestamp ?? '', displayName: lastMsg?.author.displayName ?? 'TG Chat' };
            })
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
                    className={`group flex items-center gap-1.5 px-2 py-[6px] rounded cursor-pointer mb-[1px] ${
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
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>

      {/* Social links */}
      <div className="px-2 pb-1 pt-2 flex items-center gap-1.5 shrink-0">
        <a
          href="https://discord.gg/cDhrRVZ9xg"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 flex-1 px-2 py-1.5 rounded text-sm font-medium text-white bg-discord-blurple hover:bg-discord-blurple-hover transition-colors"
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
          className="p-1.5 rounded text-discord-header-secondary hover:text-discord-header-primary hover:bg-discord-hover transition-colors"
          title="Follow on X"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
          </svg>
        </a>
      </div>

      {/* Footer */}
      <div className="h-[52px] px-2 flex items-center gap-1 shrink-0 bg-discord-sidebar border-t border-discord-darker/30">
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
            className={`p-1.5 rounded transition-colors ${
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
          className={`p-1.5 rounded transition-colors ${
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
          className="p-1.5 rounded text-discord-header-secondary hover:text-discord-header-primary hover:bg-discord-hover transition-colors"
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
