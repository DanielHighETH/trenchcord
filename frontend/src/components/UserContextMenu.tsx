import { useEffect, useRef } from 'react';
import { EyeOff, Copy, MessageSquare } from 'lucide-react';

interface UserContextMenuProps {
  userId: string;
  displayName: string;
  guildId: string | null;
  channelId: string;
  channelName: string;
  guildName: string | null;
  openInDiscordApp: boolean;
  position: { x: number; y: number };
  onHide: () => void;
  onCopyId: () => void;
  onClose: () => void;
}

export default function UserContextMenu({
  userId,
  displayName,
  guildName,
  channelName,
  openInDiscordApp,
  position,
  onHide,
  onCopyId,
  onClose,
}: UserContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${position.x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${position.y - rect.height}px`;
    }
  }, [position]);

  const channelLabel = guildName ? `${guildName} / #${channelName}` : `#${channelName}`;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-discord-dark border border-discord-divider rounded-lg shadow-2xl py-1.5 min-w-[220px] animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
    >
      <div className="px-3 py-1.5 text-[11px] text-discord-text-muted truncate border-b border-discord-divider mb-1">
        {displayName}
      </div>

      <button
        onClick={() => { onHide(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-discord-text hover:bg-discord-blurple hover:text-white transition-colors text-left"
      >
        <EyeOff size={14} className="shrink-0" />
        <div className="min-w-0">
          <div>Hide User From Channel</div>
          <div className="text-[10px] text-discord-text-muted truncate">{channelLabel}</div>
        </div>
      </button>

      <button
        onClick={() => { onCopyId(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-discord-text hover:bg-discord-blurple hover:text-white transition-colors text-left"
      >
        <Copy size={14} className="shrink-0" />
        <span>Copy User ID</span>
      </button>

      <div className="border-t border-discord-divider my-1" />

      <button
        onClick={() => {
          const dmPath = `discord.com/users/${userId}`;
          const url = openInDiscordApp ? `discord://${dmPath}` : `https://${dmPath}`;
          if (openInDiscordApp) {
            window.location.href = url;
          } else {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-discord-text hover:bg-discord-blurple hover:text-white transition-colors text-left"
      >
        <MessageSquare size={14} className="shrink-0" />
        <span>DM User</span>
      </button>
    </div>
  );
}
