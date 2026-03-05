import { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { Hash, Plus, Settings, Trash2, FileText, HelpCircle, PanelLeftClose } from 'lucide-react';
import { getAvatarUrl } from './Message';
import ConfirmModal from './ConfirmModal';

export default function Sidebar() {
  const rooms = useAppStore((s) => s.rooms);
  const activeRoomId = useAppStore((s) => s.activeRoomId);
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  if (collapsed) {
    return null;
  }

  return (
    <div className="w-60 bg-discord-sidebar flex flex-col h-full shrink-0 transition-all duration-200">
      {/* Header */}
      <div className="h-12 px-4 flex items-center shadow-[0_1px_0_rgba(0,0,0,0.2),0_1.5px_0_rgba(0,0,0,0.05),0_2px_0_rgba(0,0,0,0.05)] border-b border-discord-darker/50 shrink-0">
        <h1 className="flex items-center gap-2 text-base font-semibold text-discord-header-primary truncate">
          <img src="/trenchcord.png" alt="Trenchcord" className="w-6 h-6 rounded" />
          Trenchcord
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-discord-green' : 'bg-discord-red'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
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
          onClick={() => setActiveView('contracts')}
        >
          <FileText size={20} className="shrink-0 opacity-70" />
          <span className="text-base leading-5 truncate flex-1">Contracts</span>
          {contracts.length > 0 && (
            <span className="text-[10px] text-discord-text-muted">{contracts.length}</span>
          )}
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
          const isActive = room.id === activeRoomId && activeView === 'chat';
          const msgCount = messages[room.id]?.length ?? 0;

          return (
            <div
              key={room.id}
              className={`group flex items-center gap-1.5 px-2 py-[6px] rounded cursor-pointer mb-[1px] ${
                isActive
                  ? 'bg-discord-hover-light text-discord-header-primary font-medium'
                  : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
              }`}
              onClick={() => setActiveRoom(room.id)}
            >
              <Hash size={20} className="shrink-0 opacity-70" />
              <span className="text-base leading-5 truncate flex-1">{room.name}</span>
              {msgCount > 0 && (
                <span className="text-[10px] text-discord-text-muted">{msgCount}</span>
              )}
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

        {/* DM Channels - only show DMs that have received messages */}
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
                const isActive = activeRoomId === dmRoomId && activeView === 'chat';
                const msgCount = messages[dmRoomId]?.length ?? 0;

                return (
                  <div
                    key={channelId}
                    className={`group flex items-center gap-1.5 px-2 py-[6px] rounded cursor-pointer mb-[1px] ${
                      isActive
                        ? 'bg-discord-hover-light text-discord-header-primary font-medium'
                        : 'text-discord-channel-icon hover:bg-discord-hover hover:text-discord-header-secondary'
                    }`}
                    onClick={() => setActiveRoom(dmRoomId)}
                  >
                    {dm && dm.recipients.length === 1 ? (
                      <img
                        src={getAvatarUrl(dm.recipients[0].id, dm.recipients[0].avatar)}
                        alt=""
                        className="w-6 h-6 rounded-full shrink-0"
                      />
                    ) : dm && dm.recipients.length > 1 ? (
                      <div className="relative w-6 h-6 shrink-0">
                        <img
                          src={getAvatarUrl(dm.recipients[0].id, dm.recipients[0].avatar)}
                          alt=""
                          className="absolute top-0 left-0 w-[18px] h-[18px] rounded-full ring-2 ring-discord-sidebar"
                        />
                        <img
                          src={getAvatarUrl(dm.recipients[1].id, dm.recipients[1].avatar)}
                          alt=""
                          className="absolute bottom-0 right-0 w-[18px] h-[18px] rounded-full ring-2 ring-discord-sidebar"
                        />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-discord-dark flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-discord-text-muted">DM</span>
                      </div>
                    )}
                    <span className="text-base leading-5 truncate flex-1">{recipientNames}</span>
                    {msgCount > 0 && (
                      <span className="text-[10px] text-discord-text-muted">{msgCount}</span>
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>

      {/* Footer */}
      <div className="h-[52px] px-2 flex items-center gap-1 shrink-0 bg-discord-sidebar border-t border-discord-darker/30">
        <button
          onClick={() => setActiveView('settings')}
          className={`flex items-center gap-2 text-sm transition-colors flex-1 px-2 py-1.5 rounded ${
            activeView === 'settings'
              ? 'text-discord-header-primary bg-discord-hover-light'
              : 'text-discord-header-secondary hover:text-discord-header-primary hover:bg-discord-hover'
          }`}
        >
          <Settings size={18} className={activeView === 'settings' ? 'text-discord-text' : ''} />
          <span>Settings</span>
        </button>
        <button
          onClick={() => setActiveView('settings', 'help')}
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
  );
}
