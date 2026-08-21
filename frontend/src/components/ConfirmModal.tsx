import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  // Portaled to <body>: callers render this from inside containers that carry a
  // transform (the sidebar drawer keeps `md:translate-x-0`), and a transformed
  // ancestor becomes the containing block for `fixed` — the backdrop would cover
  // only that container instead of the whole app.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 pt-[var(--safe-top)] pb-[var(--safe-bottom)] animate-fade-in" onClick={onCancel}>
      <div
        className="bg-discord-sidebar rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3">
          <div className={`p-3 rounded-full ${danger ? 'bg-discord-red/10' : 'bg-discord-blurple/10'}`}>
            <AlertTriangle size={28} className={danger ? 'text-discord-red' : 'text-discord-blurple'} />
          </div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-discord-text-muted leading-relaxed">{message}</p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-discord-dark/40">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-discord-text-muted hover:text-white hover:underline transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-discord-sidebar ${
              danger
                ? 'bg-discord-red hover:bg-discord-red/80 text-white focus:ring-discord-red'
                : 'bg-discord-blurple hover:bg-discord-blurple/80 text-white focus:ring-discord-blurple'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
