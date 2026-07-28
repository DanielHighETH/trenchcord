import { useEffect } from 'react';
import { useAppStore, type Toast } from '../stores/appStore';
import { X, Check, AlertCircle } from 'lucide-react';

const AUTO_DISMISS_MS = 6000;

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  // Each toast owns its timer so a later arrival can't reset an earlier one's
  // countdown (or leave it on screen forever).
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isSuccess = toast.kind === 'success';

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg shadow-xl border ${
        isSuccess
          ? 'bg-discord-green/10 border-discord-green/30'
          : 'bg-discord-red/10 border-discord-red/30'
      }`}
      style={{ animation: 'slideIn 0.3s ease-out' }}
    >
      <div className="mt-0.5 shrink-0">
        {isSuccess ? (
          <Check size={18} className="text-discord-green" />
        ) : (
          <AlertCircle size={18} className="text-discord-red" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{toast.title}</p>
        {toast.detail && (
          <p className="text-xs text-discord-text-muted mt-0.5 break-words">{toast.detail}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-discord-text-muted hover:text-white transition-colors shrink-0"
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * General-purpose transient feedback. Anchored bottom-right so it never
 * collides with AlertToast's top-right stack.
 */
export default function TradeToast() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
