import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EyeOff, Copy, MessageSquare, Star, StarOff, Shield, ChevronDown, Pencil } from 'lucide-react';
import { isIOSApp } from '../utils/platform';

interface UserContextMenuProps {
  userId: string;
  displayName: string;
  /** Custom rename currently applied to this user (absent = platform name). */
  customName?: string;
  /** Save a rename; null clears it back to the platform name. */
  onRename?: (name: string | null) => void;
  guildId: string | null;
  channelId: string;
  channelName: string;
  guildName: string | null;
  openInDiscordApp: boolean;
  /** anchorTop: top edge of the clicked element, so the menu can flip above
   * it when there is no room below. */
  position: { x: number; y: number; anchorTop?: number };
  isHighlighted?: boolean;
  onToggleHighlight?: () => void;
  onHide: () => void;
  /** The author's roles on this server ({id, name}, highest first). Absent on
   * DMs, Telegram, and history messages — the mute-by-role entry hides then. */
  authorRoles?: { id: string; name: string }[];
  onHideRole?: (roleId: string, roleName: string) => void;
  onToggleHighlightRole?: (roleId: string, roleName: string) => void;
  /** Role ids already highlighted in this room, to render toggle state. */
  highlightedRoleIds?: string[];
  onCopyId: () => void;
  onClose: () => void;
}

export default function UserContextMenu({
  userId,
  displayName,
  customName,
  onRename,
  guildName,
  channelName,
  openInDiscordApp,
  position,
  isHighlighted,
  onToggleHighlight,
  onHide,
  authorRoles,
  onHideRole,
  onToggleHighlightRole,
  highlightedRoleIds,
  onCopyId,
  onClose,
}: UserContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [hlRolesOpen, setHlRolesOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(customName ?? displayName);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    // Typing the platform name back is the same as clearing the rename.
    onRename?.(trimmed && trimmed !== displayName ? trimmed : null);
    onClose();
  };

  useEffect(() => {
    const handle = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    // offsetWidth/Height are layout sizes, unaffected by the pop-in scale
    // transform that shrinks getBoundingClientRect mid-animation.
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const pad = 8;
    // Keep the menu clear of the notch/home indicator too — --safe-* is 0
    // outside the phone builds.
    const rootStyle = getComputedStyle(document.documentElement);
    const safeTop = parseFloat(rootStyle.getPropertyValue('--safe-top')) || 0;
    const safeBottom = parseFloat(rootStyle.getPropertyValue('--safe-bottom')) || 0;
    let x = position.x;
    let y = position.y;
    if (x + w > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - w - pad);
    }
    if (y + h > window.innerHeight - safeBottom - pad) {
      // No room below — open above the clicked element instead.
      y = (position.anchorTop ?? position.y) - h;
    }
    y = Math.min(y, window.innerHeight - safeBottom - h - pad);
    if (y < safeTop + pad) y = safeTop + pad;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    // The expandable role lists and rename input change the menu height, so
    // reposition when any of them toggles.
  }, [position, rolesOpen, hlRolesOpen, renameOpen]);

  const channelLabel = guildName ? `${guildName} / #${channelName}` : `#${channelName}`;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-discord-darker rounded-md shadow-[0_8px_16px_rgba(0,0,0,0.24)] py-[6px] px-[6px] min-w-[220px] animate-pop-in origin-top-left"
      style={{ left: position.x, top: position.y }}
    >
      <div className="px-2 py-1.5 text-xs text-discord-text-muted border-b border-white/[0.06] mb-1">
        <div className="truncate">{customName ?? displayName}</div>
        {customName && <div className="truncate text-[10px] opacity-60">{displayName}</div>}
      </div>

      {onRename && (
        renameOpen ? (
          <div className="px-2 py-1.5">
            <input
              autoFocus
              type="text"
              value={renameValue}
              maxLength={80}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                // Keep Escape local: close the input, not the whole menu.
                e.stopPropagation();
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenameOpen(false);
              }}
              placeholder={displayName}
              className="w-full bg-discord-dark rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
            />
            <div className="flex items-center justify-end gap-1.5 mt-1.5">
              {customName && (
                <button
                  onClick={() => { onRename(null); onClose(); }}
                  className="px-2 py-1 rounded text-[11px] text-discord-text-muted hover:text-white transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                onClick={commitRename}
                className="px-2.5 py-1 rounded bg-discord-blurple hover:bg-discord-blurple-hover text-[11px] font-medium text-white transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setRenameValue(customName ?? displayName); setRenameOpen(true); }}
            className="w-full flex items-center gap-2 px-2 py-[6px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
          >
            <Pencil size={16} className="shrink-0" />
            <div className="min-w-0">
              <div>{customName ? 'Edit Custom Name' : 'Rename User'}</div>
              <div className="text-[10px] text-discord-text-muted truncate">Only changes the name shown in Trenchcord</div>
            </div>
          </button>
        )
      )}

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

      {onHideRole && authorRoles && authorRoles.length > 0 && (
        <>
          <button
            onClick={() => setRolesOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-2 py-[6px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
          >
            <Shield size={16} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span>Mute by Role</span>
                <ChevronDown size={12} className={`shrink-0 transition-transform ${rolesOpen ? 'rotate-180' : ''}`} />
              </div>
              <div className="text-[10px] text-discord-text-muted truncate">
                Hides everyone with the role{guildName ? ` · ${guildName}` : ''}
              </div>
            </div>
          </button>
          {rolesOpen && (
            <div className="max-h-[160px] overflow-y-auto ml-4 border-l border-white/[0.06] mb-1">
              {authorRoles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => { onHideRole(role.id, role.name); onClose(); }}
                  className="w-full flex items-center gap-2 px-2 py-[5px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
                >
                  <span className="truncate">{role.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {onToggleHighlight && (
        <button
          onClick={() => { onToggleHighlight(); onClose(); }}
          className="w-full flex items-center gap-2 px-2 py-[6px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
        >
          {isHighlighted ? <StarOff size={16} className="shrink-0" /> : <Star size={16} className="shrink-0" />}
          <span>{isHighlighted ? 'Remove Highlight' : 'Highlight User'}</span>
        </button>
      )}

      {onToggleHighlightRole && authorRoles && authorRoles.length > 0 && (
        <>
          <button
            onClick={() => setHlRolesOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-2 py-[6px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
          >
            <Star size={16} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span>Highlight by Role</span>
                <ChevronDown size={12} className={`shrink-0 transition-transform ${hlRolesOpen ? 'rotate-180' : ''}`} />
              </div>
              <div className="text-[10px] text-discord-text-muted truncate">
                Highlights everyone with the role in this room
              </div>
            </div>
          </button>
          {hlRolesOpen && (
            <div className="max-h-[160px] overflow-y-auto ml-4 border-l border-white/[0.06] mb-1">
              {authorRoles.map((role) => {
                const isHl = highlightedRoleIds?.includes(role.id) ?? false;
                return (
                  <button
                    key={role.id}
                    onClick={() => { onToggleHighlightRole(role.id, role.name); onClose(); }}
                    className="w-full flex items-center justify-between gap-2 px-2 py-[5px] text-sm text-discord-header-secondary hover:bg-discord-blurple hover:text-white rounded-sm transition-colors text-left"
                  >
                    <span className="truncate">{role.name}</span>
                    {isHl && <StarOff size={12} className="shrink-0 opacity-70" />}
                  </button>
                );
              })}
            </div>
          )}
        </>
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
          const useApp = openInDiscordApp || isIOSApp();
          const url = useApp ? `discord://${dmPath}` : `https://${dmPath}`;
          if (useApp) {
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
