import { useEffect, useState, useCallback } from 'react';
import { Megaphone, AlertTriangle, X } from 'lucide-react';
import {
  fetchAnnouncements,
  selectUnseen,
  markSeen,
  type Announcement,
} from '../utils/announcements';

const REFRESH_MS = 6 * 60 * 60 * 1000; // re-check every 6 hours

const LEVEL_STYLES: Record<string, { accent: string; ring: string }> = {
  info: { accent: 'text-discord-blurple', ring: 'border-discord-blurple/30' },
  warning: { accent: 'text-orange-400', ring: 'border-orange-400/30' },
  critical: { accent: 'text-discord-red', ring: 'border-discord-red/40' },
};

export default function AnnouncementModal() {
  const [queue, setQueue] = useState<Announcement[]>([]);

  const load = useCallback(async () => {
    const all = await fetchAnnouncements();
    setQueue(selectUnseen(all));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const current = queue[0];
  if (!current) return null;

  const dismiss = () => {
    markSeen(current.id);
    setQueue((q) => q.slice(1));
  };

  const openCta = () => {
    if (current.ctaUrl) window.open(current.ctaUrl, '_blank', 'noopener,noreferrer');
    dismiss();
  };

  const style = LEVEL_STYLES[current.level] ?? LEVEL_STYLES.info;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className={`w-full max-w-md bg-discord-darker border ${style.ring} rounded-lg shadow-2xl overflow-hidden`}>
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="mt-0.5">
            {current.level === 'critical' || current.level === 'warning' ? (
              <AlertTriangle size={22} className={style.accent} />
            ) : (
              <Megaphone size={22} className={style.accent} />
            )}
          </div>
          <h2 className="flex-1 text-lg font-bold text-white leading-snug">{current.title}</h2>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-discord-text-muted hover:text-white shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-discord-text leading-relaxed whitespace-pre-wrap">{current.body}</p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-discord-dark/40 border-t border-discord-dark">
          <button
            onClick={dismiss}
            className="px-3.5 py-2 rounded text-sm font-medium text-discord-text-muted hover:text-white hover:bg-discord-dark transition-colors"
          >
            {current.ctaUrl ? 'Dismiss' : 'Got it'}
          </button>
          {current.ctaUrl && (
            <button
              onClick={openCta}
              className="px-3.5 py-2 rounded text-sm font-medium text-white bg-discord-blurple hover:bg-discord-blurple-hover transition-colors"
            >
              {current.ctaLabel || 'Open'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
