import { useEffect, useRef } from 'react';
import { EyeOff, Copy, MessageSquare, Star, StarOff } from 'lucide-react';

interface UserContextMenuProps {
  userId: string;
  displayName: string;
  guildId: string | null;
  channelId: string;
  channelName: string;
  guildName: string | null;
  openInDiscordApp: boolean;
  position: { x: number; y: number };
  isHighlighted?: boolean;
  onToggleHighlight?: () => void;
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
  isHighlighted,
  onToggleHighlight,
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
      className="fixed z-[100] bg-discord-darker rounded-md shadow-[0_8px_16px_rgba(0,0,0,0.24)] py-[6px] px-[6px] min-w-[220px]"
      style={{ left: position.x, top: position.y }}
    >
      <div className="px-2 py-1.5 text-xs text-discord-text-muted truncate border-b border-white/[0.06] mb-1">
        {displayName}
      </div>

      <button
        onClick={() => { onHide(); onClose(); }}
        className="w-full flex items-center gap-2 px-2 py-[6px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
      >
        <EyeOff size={16} className="shrink-0" />
        <div className="min-w-0">
          <div>Hide User From Channel</div>
          <div className="text-[10px] text-discord-text-muted truncate">{channelLabel}</div>
        </div>
      </button>

      {onToggleHighlight && (
        <button
          onClick={() => { onToggleHighlight(); onClose(); }}
          className="w-full flex items-center gap-2 px-2 py-[6px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
        >
          {isHighlighted ? <StarOff size={16} className="shrink-0" /> : <Star size={16} className="shrink-0" />}
          <span>{isHighlighted ? 'Remove Highlight' : 'Highlight User'}</span>
        </button>
      )}

      <button
        onClick={() => { onCopyId(); onClose(); }}
        className="w-full flex items-center gap-2 px-2 py-[6px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
      >
        <Copy size={16} className="shrink-0" />
        <span>Copy User ID</span>
      </button>

      <div className="border-t border-white/[0.06] my-1 mx-[-2px]" />

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
        className="w-full flex items-center gap-2 px-2 py-[6px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
      >
        <MessageSquare size={16} className="shrink-0" />
        <span>DM User</span>
      </button>
    </div>
  );
}
