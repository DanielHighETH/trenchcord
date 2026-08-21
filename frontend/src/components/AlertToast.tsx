import { useEffect } from 'react';
import { useCompactLayout } from '../utils/platform';
import { useAppStore } from '../stores/appStore';
import { X, AlertTriangle, User, Search, TrendingUp, Twitter, Send } from 'lucide-react';
import { messageFallbackText } from '../utils/addressDetect';
import { openMessageSource } from '../utils/messageLinks';
import type { Alert } from '../types';

function alertPreview(alert: Alert): string {
  const text = alert.type === 'premium' ? alert.event.body : messageFallbackText(alert.message);
  return text.slice(0, 100) + (text.length > 100 ? '...' : '');
}

const AUTO_DISMISS_MS = 8000;

export default function AlertToast() {
  const compact = useCompactLayout();
  const alerts = useAppStore((s) => s.alerts);
  const dismissAlert = useAppStore((s) => s.dismissAlert);
  const config = useAppStore((s) => s.config);
  const rooms = useAppStore((s) => s.rooms);
  const setActiveRoom = useAppStore((s) => s.setActiveRoom);

  // Clicking a toast jumps to the message — in the Trenchcord room or the
  // source app, per Settings → General → Notification Click.
  const openAlert = (alert: Alert) => {
    if (alert.type === 'premium') {
      if (alert.event.url) window.open(alert.event.url, '_blank');
      dismissAlert(alert.id);
      return;
    }
    const msg = alert.message;
    if ((config?.notificationClickAction ?? 'trenchcord') === 'trenchcord') {
      const room = rooms.find((r) => r.channels.some((c) => c.channelId === msg.channelId));
      if (room) {
        setActiveRoom(room.id);
        dismissAlert(alert.id);
        return;
      }
      // No room shows this channel (e.g. it was removed) — fall through.
    }
    openMessageSource(msg, {
      openInDiscordApp: config?.openInDiscordApp,
      openInTelegramApp: config?.openInTelegramApp,
    });
    dismissAlert(alert.id);
  };

  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[0];
    const timer = setTimeout(() => dismissAlert(latest.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [alerts, dismissAlert]);

  // Phones get at most two stacked toasts — five buried half the screen.
  const visible = alerts.slice(0, compact ? 2 : 5);

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-[calc(1rem+var(--safe-top))] right-4 z-[100] flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)] compact:top-[calc(0.5rem+var(--safe-top))] compact:left-3 compact:right-3 compact:w-auto compact:gap-1.5">
      {visible.map((alert) => (
        <div
          key={alert.id}
          // Roomy panels on desktop, slim ones on phones, opaque on both: these
          // land on top of the room header and the message list, and a
          // see-through panel let the buttons underneath read straight through
          // the alert. The type's colour is a flat gradient so it layers over
          // the solid background instead of replacing it; phones drop that
          // layer (compact:bg-none) and keep their neutral banner.
          className={`flex items-start gap-3 p-3 rounded-lg shadow-xl border animate-slide-in bg-[#16171d] bg-gradient-to-b compact:gap-2 compact:p-2 compact:bg-none compact:border-white/10 compact:shadow-lg ${
            alert.type === 'highlighted_user'
              ? 'from-discord-blurple/15 to-discord-blurple/15 border-discord-blurple/30'
              : alert.type === 'keyword_match'
                ? 'from-orange-400/15 to-orange-400/15 border-orange-400/30'
                : alert.type === 'premium'
                  ? 'from-emerald-400/15 to-emerald-400/15 border-emerald-400/30'
                  : 'from-discord-yellow/15 to-discord-yellow/15 border-discord-yellow/30'
          }`}
          style={{
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <div className="mt-0.5 compact:mt-0">
            {alert.type === 'highlighted_user' ? (
              <User size={18} className="text-discord-blurple" />
            ) : alert.type === 'keyword_match' ? (
              <Search size={18} className="text-orange-400" />
            ) : alert.type === 'premium' ? (
              alert.event.kind === 'price' ? (
                <TrendingUp size={18} className="text-emerald-400" />
              ) : alert.event.kind === 'tweet' ? (
                <Twitter size={18} className="text-emerald-400" />
              ) : (
                <Send size={18} className="text-emerald-400" />
              )
            ) : (
              <AlertTriangle size={18} className="text-discord-yellow" />
            )}
          </div>
          <div
            className={`flex-1 min-w-0 ${alert.type !== 'premium' || alert.event.url ? 'cursor-pointer' : ''}`}
            onClick={() => openAlert(alert)}
          >
            <p className="text-sm font-medium text-white compact:text-xs">{alert.reason}</p>
            <p className="text-xs text-discord-text-muted truncate mt-0.5 compact:text-[11px] compact:mt-0">
              {/* v2/forwarded messages have empty content; preview their text. */}
              {alertPreview(alert)}
            </p>
          </div>
          <button
            onClick={() => dismissAlert(alert.id)}
            className="text-discord-text-muted hover:text-white shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
