import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { X, AlertTriangle, User, Search } from 'lucide-react';

const AUTO_DISMISS_MS = 8000;

export default function AlertToast() {
  const alerts = useAppStore((s) => s.alerts);
  const dismissAlert = useAppStore((s) => s.dismissAlert);

  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[0];
    const timer = setTimeout(() => dismissAlert(latest.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [alerts, dismissAlert]);

  const visible = alerts.slice(0, 5);

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-96">
      {visible.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start gap-3 p-3 rounded-lg shadow-xl border animate-slide-in ${
            alert.type === 'highlighted_user'
              ? 'bg-discord-blurple/10 border-discord-blurple/30'
              : alert.type === 'keyword_match'
                ? 'bg-orange-400/10 border-orange-400/30'
                : 'bg-discord-yellow/10 border-discord-yellow/30'
          }`}
          style={{
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <div className="mt-0.5">
            {alert.type === 'highlighted_user' ? (
              <User size={18} className="text-discord-blurple" />
            ) : alert.type === 'keyword_match' ? (
              <Search size={18} className="text-orange-400" />
            ) : (
              <AlertTriangle size={18} className="text-discord-yellow" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{alert.reason}</p>
            <p className="text-xs text-discord-text-muted truncate mt-0.5">
              {alert.message.content.slice(0, 100)}{alert.message.content.length > 100 ? '...' : ''}
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
