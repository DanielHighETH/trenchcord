import { useState } from 'react';
import { Loader2, AlertCircle, Mail, Lock, ArrowLeft } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';

type AuthView = 'login' | 'signup' | 'forgot';

export default function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = getSupabase();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || (!password.trim() && view !== 'forgot')) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (view === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw error;
        setMessage('Password reset link sent. Check your email.');
        setLoading(false);
        return;
      }

      if (view === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });
        if (error) throw error;
        setMessage('Account created! Check your email to confirm, then sign in.');
        setView('login');
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
      if (error) throw error;
      onAuth();
    } catch (err: any) {
      setError(err.message ?? 'Authentication failed.');
    }
    setLoading(false);
  };

  const handleDiscordOAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message ?? 'OAuth failed.');
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full w-full bg-discord-dark">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-discord-blurple/10 flex items-center justify-center mb-5">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5865f2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {view === 'login' ? 'Welcome back' : view === 'signup' ? 'Create account' : 'Reset password'}
          </h1>
          <p className="text-discord-text-muted text-sm text-center leading-relaxed">
            {view === 'login'
              ? 'Sign in to access your Trenchcord dashboard.'
              : view === 'signup'
                ? 'Create a new account to get started.'
                : 'Enter your email and we\'ll send a reset link.'}
          </p>
        </div>

        {view !== 'forgot' && (
          <>
            <button
              onClick={handleDiscordOAuth}
              disabled={loading}
              className="w-full py-2.5 bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium text-white transition-colors flex items-center justify-center gap-2 mb-4"
            >
              <svg width="20" height="20" viewBox="0 0 71 55" fill="white">
                <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.7 40.7 0 00-1.8 3.7 54 54 0 00-16.2 0A26.4 26.4 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1 0A59.7 59.7 0 00.2 43.6a.2.2 0 000 .2 58.8 58.8 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 010-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3 0A58.6 58.6 0 0070.6 43.8a.2.2 0 000-.2A59.2 59.2 0 0060.2 5a.2.2 0 00-.1 0zM23.7 35.8c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.7 7-6.2 7z" />
              </svg>
              Continue with Discord
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-discord-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-discord-dark px-3 text-discord-text-muted uppercase tracking-wider">or</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-channel-icon" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 bg-discord-darker border border-discord-dark rounded text-sm text-discord-text placeholder:text-discord-channel-icon focus:outline-none focus:ring-2 focus:ring-discord-blurple/40 disabled:opacity-50 transition-shadow"
              />
            </div>
          </div>

          {view !== 'forgot' && (
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-channel-icon" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={view === 'signup' ? 'Create a password (min 6 chars)' : 'Enter your password'}
                  autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                  disabled={loading}
                  className="w-full pl-9 pr-3 py-2.5 bg-discord-darker border border-discord-dark rounded text-sm text-discord-text placeholder:text-discord-channel-icon focus:outline-none focus:ring-2 focus:ring-discord-blurple/40 disabled:opacity-50 transition-shadow"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-discord-red/10 border border-discord-red/20 rounded text-sm text-discord-red">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-green-500/10 border border-green-500/20 rounded text-sm text-green-400">
              <span>{message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || (view !== 'forgot' && !password.trim())}
            className="w-full py-2.5 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {view === 'forgot' ? 'Sending...' : view === 'signup' ? 'Creating account...' : 'Signing in...'}
              </>
            ) : (
              view === 'forgot' ? 'Send reset link' : view === 'signup' ? 'Create account' : 'Sign in'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-discord-text-muted space-y-2">
          {view === 'login' && (
            <>
              <button onClick={() => { setView('forgot'); setError(null); setMessage(null); }} className="hover:text-discord-text transition-colors">
                Forgot password?
              </button>
              <p>
                Don&apos;t have an account?{' '}
                <button onClick={() => { setView('signup'); setError(null); setMessage(null); }} className="text-discord-blurple hover:underline">
                  Sign up
                </button>
              </p>
            </>
          )}
          {view === 'signup' && (
            <p>
              Already have an account?{' '}
              <button onClick={() => { setView('login'); setError(null); setMessage(null); }} className="text-discord-blurple hover:underline">
                Sign in
              </button>
            </p>
          )}
          {view === 'forgot' && (
            <button
              onClick={() => { setView('login'); setError(null); setMessage(null); }}
              className="inline-flex items-center gap-1 hover:text-discord-text transition-colors"
            >
              <ArrowLeft size={14} />
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
