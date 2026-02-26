import { useAppStore } from '../stores/appStore';
import { Hash, Plus, Settings, Trash2, MessageCircle, FileText } from 'lucide-react';

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

  return (
    <div className="w-60 bg-discord-sidebar flex flex-col h-full">
      {/* Header */}
      <div className="h-12 px-4 flex items-center shadow-md border-b border-discord-darker/50 shrink-0">
        <h1 className="text-[15px] font-semibold text-white truncate">Trenchcord</h1>
        <div className="ml-auto flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-discord-green' : 'bg-discord-red'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto pt-4 px-2">
        {/* Contract Dashboard link */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer mb-2 ${
            activeView === 'contracts'
              ? 'bg-discord-hover text-white'
              : 'text-discord-channel-icon hover:bg-discord-hover/50 hover:text-discord-text'
          }`}
          onClick={() => setActiveView('contracts')}
        >
          <FileText size={18} className="shrink-0 opacity-60" />
          <span className="text-[15px] truncate flex-1">Contracts</span>
          {contracts.length > 0 && (
            <span className="text-[10px] text-discord-text-muted">{contracts.length}</span>
          )}
        </div>

        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">
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
              className={`group flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer mb-0.5 ${
                isActive
                  ? 'bg-discord-hover text-white'
                  : 'text-discord-channel-icon hover:bg-discord-hover/50 hover:text-discord-text'
              }`}
              onClick={() => setActiveRoom(room.id)}
            >
              <Hash size={18} className="shrink-0 opacity-60" />
              <span className="text-[15px] truncate flex-1">{room.name}</span>
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
                    if (confirm(`Delete room "${room.name}"?`)) deleteRoom(room.id);
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
                <span className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">
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
                    className={`group flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer mb-0.5 ${
                      isActive
                        ? 'bg-discord-hover text-white'
                        : 'text-discord-channel-icon hover:bg-discord-hover/50 hover:text-discord-text'
                    }`}
                    onClick={() => setActiveRoom(dmRoomId)}
                  >
                    <MessageCircle size={18} className="shrink-0 opacity-60" />
                    <span className="text-[15px] truncate flex-1">{recipientNames}</span>
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
      <div className="h-[52px] bg-discord-darker/30 px-2 flex items-center shrink-0">
        <button
          onClick={() => openConfigModal(undefined, 'global')}
          className="flex items-center gap-2 text-sm text-discord-text-muted hover:text-white transition-colors w-full px-2 py-1 rounded hover:bg-discord-hover/50"
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
