import { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import SnipeConfigModal from './SnipeConfigModal';
import { Plus, ChevronDown, Crosshair } from 'lucide-react';
import type { SnipeConfig } from '../types';

const COLLAPSE_KEY = 'trenchcord.snipeConfigsCollapsed';

function StatusBadge({ text, tone }: { text: string; tone: 'muted' | 'yellow' | 'green' }) {
  const color =
    tone === 'yellow' ? 'bg-discord-yellow/15 text-discord-yellow'
    : tone === 'green' ? 'bg-discord-green/15 text-discord-green'
    : 'bg-white/5 text-discord-text-muted';
  return <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${color}`}>{text}</span>;
}

/**
 * Snipe-config management embedded at the top of the Snipes feed, mirroring
 * the Alerts page: a card grid with a create card, click a card to edit.
 * The feed itself (triggering messages with outcome badges) scrolls below.
 */
export default function SnipesPanel() {
  const config = useAppStore((s) => s.config);
  const rooms = useAppStore((s) => s.rooms);

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SnipeConfig | null>(null);

  const configs = config?.sniping?.configs ?? [];

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch {}
      return !c;
    });
  };

  return (
    // No background tint of its own — the panel shares the feed's surface so
    // the pane reads as one page (the Alerts layout), with just a hairline
    // separating configs from the message stream.
    <div className="border-b border-white/5 shrink-0">
      <div className="px-3 sm:px-4 pt-3 pb-2 flex items-center gap-2">
        <button onClick={toggleCollapsed} className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <ChevronDown size={15} className={`text-discord-text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          Snipe configs
          {configs.length > 0 && (
            <span className="text-[11px] font-normal text-discord-text-muted">
              {configs.filter((c) => c.enabled).length}/{configs.length} active
            </span>
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 sm:px-4 pb-3 max-h-[38vh] overflow-y-auto">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            <button
              onClick={() => setCreateOpen(true)}
              className="min-h-[84px] rounded-lg border-2 border-dashed border-white/10 hover:border-discord-blurple/60 hover:bg-discord-blurple/5 transition-colors flex flex-col items-center justify-center gap-1 text-discord-text-muted hover:text-discord-text"
            >
              <Plus size={18} />
              <span className="text-sm font-medium">New snipe config</span>
            </button>

            {configs.map((c) => {
              const room = rooms.find((r) => r.id === c.roomId);
              const noWallets = c.walletIds.length === 0;
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditTarget(c)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditTarget(c); }}
                  className={`min-h-[84px] rounded-lg bg-discord-sidebar hover:bg-discord-hover/40 border border-white/5 transition-colors p-3 text-left flex flex-col gap-1 cursor-pointer ${!c.enabled ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <Crosshair size={14} className="text-discord-blurple shrink-0" />
                    <span className="text-sm font-medium text-white truncate flex-1">
                      {c.name || 'Unnamed snipe'}
                    </span>
                    {!c.enabled ? <StatusBadge text="paused" tone="muted" />
                      : noWallets ? <StatusBadge text="no wallet" tone="yellow" />
                      : <StatusBadge text="active" tone="green" />}
                  </div>
                  <span className="text-xs text-discord-text-muted truncate">
                    {room ? room.name : 'Deleted room'} · {c.mode === 'room' ? 'whole room' : `${c.users.length} user${c.users.length === 1 ? '' : 's'}`}
                    {(c.trigger ?? 'contract') === 'keyword' ? ' · keywords' : ''}
                  </span>
                  <span className="text-[10px] text-discord-text-muted/70 uppercase mt-auto">
                    {c.solAmount || 0} SOL{c.limitSells.length > 0 ? ` · ${c.limitSells.length} limit sell${c.limitSells.length === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <SnipeConfigModal
        open={createOpen || editTarget !== null}
        editing={editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
      />
    </div>
  );
}
