import { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { Loader2, AlertCircle, CheckCircle2, ExternalLink, ArrowLeft } from 'lucide-react';

type Step = 'credentials' | 'phone' | 'code' | '2fa' | 'success';

export default function TelegramSetup({ onClose }: { onClose?: () => void }) {
  const telegramAuthStart = useAppStore((s) => s.telegramAuthStart);
  const telegramAuthVerify = useAppStore((s) => s.telegramAuthVerify);
  const telegramAuth2FA = useAppStore((s) => s.telegramAuth2FA);

  const [step, setStep] = useState<Step>('credentials');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiId.trim() || !apiHash.trim() || !phone.trim()) return;
    setLoading(true);
    setError(null);

    const result = await telegramAuthStart(apiId.trim(), apiHash.trim(), phone.trim());
    if (result.success) {
      setStep('code');
    } else {
      setError(result.error ?? 'Failed to start authentication.');
    }
    setLoading(false);
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);

    const result = await telegramAuthVerify(code.trim());
    if (result.success) {
      setStep('success');
    } else if (result.needs2FA) {
      setStep('2fa');
    } else {
      setError(result.error ?? 'Invalid verification code.');
    }
    setLoading(false);
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);

    const result = await telegramAuth2FA(password.trim());
    if (result.success) {
      setStep('success');
    } else {
      setError(result.error ?? 'Invalid password.');
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-md">
      {step === 'credentials' && (
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            {onClose && (
              <button type="button" onClick={onClose} className="text-discord-text-muted hover:text-white p-1">
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-semibold text-white">Connect Telegram</h2>
          </div>

          <p className="text-sm text-discord-text-muted leading-relaxed">
            To connect your Telegram account, you need an API ID and API Hash from{' '}
            <a
              href="https://my.telegram.org/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-discord-blurple hover:underline inline-flex items-center gap-1"
            >
              my.telegram.org <ExternalLink size={12} />
            </a>
          </p>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
              API ID
            </label>
            <input
              type="text"
              value={apiId}
              onChange={(e) => setApiId(e.target.value)}
              placeholder="12345678"
              disabled={loading}
              className="w-full px-3 py-2.5 bg-discord-darker border border-discord-dark rounded text-sm text-discord-text placeholder:text-discord-channel-icon focus:outline-none focus:ring-2 focus:ring-discord-blurple/40 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
              API Hash
            </label>
            <input
              type="password"
              value={apiHash}
              onChange={(e) => setApiHash(e.target.value)}
              placeholder="Your API hash"
              disabled={loading}
              className="w-full px-3 py-2.5 bg-discord-darker border border-discord-dark rounded text-sm text-discord-text placeholder:text-discord-channel-icon focus:outline-none focus:ring-2 focus:ring-discord-blurple/40 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1234567890"
              disabled={loading}
              className="w-full px-3 py-2.5 bg-discord-darker border border-discord-dark rounded text-sm text-discord-text placeholder:text-discord-channel-icon focus:outline-none focus:ring-2 focus:ring-discord-blurple/40 disabled:opacity-50"
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
            disabled={loading || !apiId.trim() || !apiHash.trim() || !phone.trim()}
            className="w-full py-2.5 bg-[#2AABEE] hover:bg-[#229ED9] disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sending code...
              </>
            ) : (
              'Send Verification Code'
            )}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={handleCodeSubmit} className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <button type="button" onClick={() => { setStep('credentials'); setError(null); }} className="text-discord-text-muted hover:text-white p-1">
              <ArrowLeft size={18} />
            </button>
            <h2 className="text-lg font-semibold text-white">Enter Verification Code</h2>
          </div>

          <p className="text-sm text-discord-text-muted leading-relaxed">
            A verification code has been sent to your Telegram app. Enter it below.
          </p>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
              Verification Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345"
              autoFocus
              disabled={loading}
              className="w-full px-3 py-2.5 bg-discord-darker border border-discord-dark rounded text-sm text-discord-text placeholder:text-discord-channel-icon focus:outline-none focus:ring-2 focus:ring-discord-blurple/40 disabled:opacity-50 text-center text-lg tracking-[0.3em]"
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
            disabled={loading || !code.trim()}
            className="w-full py-2.5 bg-[#2AABEE] hover:bg-[#229ED9] disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify Code'
            )}
          </button>
        </form>
      )}

      {step === '2fa' && (
        <form onSubmit={handle2FASubmit} className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <button type="button" onClick={() => { setStep('code'); setError(null); }} className="text-discord-text-muted hover:text-white p-1">
              <ArrowLeft size={18} />
            </button>
            <h2 className="text-lg font-semibold text-white">Two-Factor Authentication</h2>
          </div>

          <p className="text-sm text-discord-text-muted leading-relaxed">
            Your account has two-factor authentication enabled. Enter your password to continue.
          </p>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your 2FA password"
              autoFocus
              disabled={loading}
              className="w-full px-3 py-2.5 bg-discord-darker border border-discord-dark rounded text-sm text-discord-text placeholder:text-discord-channel-icon focus:outline-none focus:ring-2 focus:ring-discord-blurple/40 disabled:opacity-50"
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
            disabled={loading || !password.trim()}
            className="w-full py-2.5 bg-[#2AABEE] hover:bg-[#229ED9] disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Verifying...
              </>
            ) : (
              'Submit Password'
            )}
          </button>
        </form>
      )}

      {step === 'success' && (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-discord-green/10 flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-discord-green" />
          </div>
          <h2 className="text-lg font-semibold text-white">Telegram Connected</h2>
          <p className="text-sm text-discord-text-muted">
            Your Telegram account has been connected. You can now add Telegram chats to your rooms.
          </p>
          {onClose && (
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm font-medium text-white transition-colors"
            >
              Done
            </button>
          )}
        </div>
      )}
    </div>
  );
}
