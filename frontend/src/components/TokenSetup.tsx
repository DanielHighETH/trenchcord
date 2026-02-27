import { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';

export default function TokenSetup() {
  const submitToken = useAppStore((s) => s.submitToken);
  const checkAuth = useAppStore((s) => s.checkAuth);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setError(null);

    const result = await submitToken(token.trim());
    if (result.success) {
      await checkAuth();
    } else {
      setError(result.error ?? 'Failed to connect. Check your token and try again.');
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center h-full w-full bg-discord-dark">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-discord-blurple/10 flex items-center justify-center mb-5">
            <KeyRound size={32} className="text-discord-blurple" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to Trenchcord</h1>
          <p className="text-discord-text-muted text-sm text-center leading-relaxed">
            Enter your Discord token to get started. Your token is stored locally and never leaves your machine.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="token" className="block text-xs font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
              Discord Token
            </label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Discord token here"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              autoFocus
              disabled={loading}
              className="w-full px-3 py-2.5 bg-discord-darker border border-discord-dark rounded text-sm text-discord-text placeholder:text-discord-channel-icon focus:outline-none focus:ring-2 focus:ring-discord-blurple/40 disabled:opacity-50 transition-shadow"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-discord-red/10 border border-discord-red/20 rounded text-sm text-discord-red">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full py-2.5 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </form>

        <p className="text-[11px] text-discord-channel-icon text-center mt-6 leading-relaxed">
          You can also set multiple tokens separated by commas.
        </p>
      </div>
    </div>
  );
}
