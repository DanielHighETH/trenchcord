import { useAppStore } from '../stores/appStore';
import { AlertTriangle, X } from 'lucide-react';

export default function GatewayAuthBanner() {
  const error = useAppStore((s) => s.gatewayAuthError);
  const setError = useAppStore((s) => s.setGatewayAuthError);
  const setActiveView = useAppStore((s) => s.setActiveView);

  if (!error) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-3 px-4 py-3 bg-red-600/95 text-white text-sm shadow-lg">
      <AlertTriangle size={18} className="shrink-0" />
      <span className="flex-1">
        <strong>Discord token error:</strong> {error}{' '}
        <button
          onClick={() => {
            setError(null);
            setActiveView('settings', 'tokens');
          }}
          className="underline font-semibold hover:text-white/80"
        >
          Go to Settings
        </button>
      </span>
      <button onClick={() => setError(null)} className="hover:text-white/70 shrink-0">
        <X size={18} />
      </button>
    </div>
  );
}
