import { useRef, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { KeyRound, Loader2, AlertCircle, Upload, ArrowRight, Send } from 'lucide-react';
import { isIOSApp } from '../utils/platform';
import { backupTelegramSessionCount } from '../utils/backup';

export default function TokenSetup() {
  const submitToken = useAppStore((s) => s.submitToken);
  const checkAuth = useAppStore((s) => s.checkAuth);
  const importSettings = useAppStore((s) => s.importSettings);
  const setPreviewMode = useAppStore((s) => s.setPreviewMode);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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

  // A backup holding a Telegram session needs a decision on iOS — the session
  // is one auth key, and Telegram logs BOTH devices out (AUTH_KEY_DUPLICATED)
  // if the phone and the computer use it at the same time.
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);

  const runImport = async (raw: unknown, telegramSessions?: 'reuse' | 'fresh') => {
    setImporting(true);
    setError(null);
    try {
      const result = await importSettings(raw, telegramSessions ? { telegramSessions } : undefined);
      if (!result.success) {
        setError(result.error ?? 'Failed to import settings.');
      }
      // On success the app store flips previewMode / auth, so App unmounts this screen.
    } finally {
      setImporting(false);
      setPendingImport(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (importInputRef.current) importInputRef.current.value = '';
    if (!file) return;

    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (isIOSApp() && backupTelegramSessionCount(parsed) > 0) {
        setPendingImport(parsed);
        return;
      }
      await runImport(parsed);
    } catch {
      setError('Could not read that file. Make sure it is a valid config.json.');
    }
  };

  // On the phone, importing a desktop backup is the expected path in and the
  // only practical one — a Discord token is not something you have to hand on
  // iOS — so it leads, and the manual token entry becomes the fallback.
  const importFirst = isIOSApp();

  const tokenForm = (
    <>
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
              name="trenchcord-token-field"
              autoComplete="one-time-code"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              autoFocus
              disabled={loading}
              className="w-full px-3 py-2.5 bg-discord-darker border border-discord-dark rounded text-sm text-discord-text placeholder:text-discord-channel-icon focus:outline-none focus:ring-2 focus:ring-discord-blurple/40 disabled:opacity-50 transition-shadow"
            />
          </div>

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
    </>
  );

  const divider = (
    <div className="flex items-center gap-3 my-6">
      <div className="h-px flex-1 bg-discord-dark" />
      <span className="text-[11px] uppercase tracking-wide text-discord-channel-icon">or</span>
      <div className="h-px flex-1 bg-discord-dark" />
    </div>
  );

  const importBlock = (
    <>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          className="hidden"
        />

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={loading || importing}
            className={`w-full py-2.5 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              importFirst
                ? 'bg-discord-blurple hover:bg-discord-blurple-hover text-white'
                : 'bg-discord-darker hover:bg-discord-dark border border-discord-dark text-discord-text'
            }`}
          >
            {importing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload size={16} />
                {importFirst ? 'Import from your computer' : 'Import settings'}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setPreviewMode(true)}
            disabled={loading || importing}
            className="w-full py-2.5 hover:bg-discord-darker disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium text-discord-text-muted hover:text-discord-text transition-colors flex items-center justify-center gap-2"
          >
            Continue without a token
            <ArrowRight size={16} />
          </button>
        </div>

        <p className="text-[11px] text-discord-channel-icon text-center mt-4 leading-relaxed">
          {importFirst ? (
            <>
              On your computer, open <span className="text-discord-text-muted">Settings → Backup &amp; Restore → Export</span>,
              AirDrop the file to this phone and save it to Files — then pick it above.
            </>
          ) : (
            <>
              Import your existing <span className="text-discord-text-muted">config.json</span> to bring over your token, rooms and settings — or explore the app first without connecting.
            </>
          )}
        </p>
      </>
  );

  return (
    <div className="flex items-center justify-center h-full w-full bg-discord-dark overflow-y-auto">
      <div className="w-full max-w-md px-8 py-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-discord-blurple/10 flex items-center justify-center mb-5">
            {importFirst ? <Upload size={32} className="text-discord-blurple" /> : <KeyRound size={32} className="text-discord-blurple" />}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to Trenchcord</h1>
          <p className="text-discord-text-muted text-sm text-center leading-relaxed">
            {importFirst
              ? 'Bring your rooms, keywords and accounts over from your computer. Everything stays on this device.'
              : 'Enter your Discord token to get started. Your token and data are stored locally and never leaves your machine.'}
          </p>
        </div>

        {/* Shared by both entry paths, so it stays visible whichever leads. */}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 mb-4 bg-discord-red/10 border border-discord-red/20 rounded text-sm text-discord-red">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {pendingImport ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 px-3 py-3 bg-[#2AABEE]/10 border border-[#2AABEE]/20 rounded">
              <Send size={18} className="shrink-0 mt-0.5 text-[#2AABEE]" />
              <p className="text-sm text-discord-text leading-relaxed">
                This backup includes your <strong>Telegram login</strong>. A Telegram
                session only works on one device at a time — if this phone and your
                computer both use it, Telegram logs <strong>both</strong> out.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void runImport(pendingImport, 'fresh')}
              disabled={importing}
              className="w-full py-2.5 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 rounded text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : null}
              Import &amp; log in to Telegram on this phone
            </button>
            <p className="text-[11px] text-discord-channel-icon text-center -mt-2 leading-relaxed">
              Recommended — your computer stays connected. Afterwards, open{' '}
              <span className="text-discord-text-muted">Settings → Telegram</span> and enter your
              phone number; the code arrives in Telegram itself.
            </p>

            <button
              type="button"
              onClick={() => void runImport(pendingImport, 'reuse')}
              disabled={importing}
              className="w-full py-2.5 bg-discord-darker hover:bg-discord-dark border border-discord-dark disabled:opacity-50 rounded text-sm font-medium text-discord-text transition-colors"
            >
              Move the session to this phone
            </button>
            <p className="text-[11px] text-discord-channel-icon text-center -mt-2 leading-relaxed">
              Only if you've closed Trenchcord on your computer for good.
            </p>

            <button
              type="button"
              onClick={() => setPendingImport(null)}
              disabled={importing}
              className="w-full py-2 text-sm text-discord-text-muted hover:text-discord-text transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : importFirst ? (
          <>
            {importBlock}
            {divider}
            {tokenForm}
          </>
        ) : (
          <>
            {tokenForm}
            {divider}
            {importBlock}
          </>
        )}
      </div>
    </div>
  );
}
