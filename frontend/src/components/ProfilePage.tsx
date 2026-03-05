import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { getSupabase } from '../lib/supabase';
import { User, Mail, LogOut, Calendar, Clock, Shield, ArrowLeft, PanelLeftOpen, Loader2 } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string | null;
  provider: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  createdAt: string | null;
  lastSignIn: string | null;
}

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

export default function ProfilePage() {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const token = (await getSupabase().auth.getSession()).data.session?.access_token;
        const res = await fetch(`${API_BASE}/auth/profile`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setProfile(await res.json());
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await getSupabase().auth.signOut();
    window.location.reload();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const providerLabel = (p: string) => {
    if (p === 'discord') return 'Discord';
    if (p === 'email') return 'Email & Password';
    if (p === 'google') return 'Google';
    return p.charAt(0).toUpperCase() + p.slice(1);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-discord-dark overflow-y-auto">
      <div className="h-12 px-4 flex items-center gap-3 shadow-[0_1px_0_rgba(0,0,0,0.2)] border-b border-discord-darker/50 shrink-0 bg-discord-dark">
        {sidebarCollapsed && (
          <button onClick={toggleSidebar} className="p-1 rounded text-discord-channel-icon hover:text-discord-header-primary hover:bg-discord-hover transition-colors" title="Show sidebar">
            <PanelLeftOpen size={18} />
          </button>
        )}
        <button
          onClick={() => setActiveView('chat')}
          className="p-1 rounded text-discord-channel-icon hover:text-discord-header-primary hover:bg-discord-hover transition-colors"
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <User size={18} className="text-discord-channel-icon" />
        <span className="text-discord-header-primary font-semibold text-base">Profile</span>
      </div>

      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-discord-blurple" />
          </div>
        ) : !profile ? (
          <div className="text-center text-discord-text-muted py-20">
            Failed to load profile.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Avatar & Identity */}
            <div className="bg-discord-sidebar rounded-lg p-6">
              <div className="flex items-center gap-4">
                {profile.discordAvatar ? (
                  <img src={profile.discordAvatar} alt="" className="w-16 h-16 rounded-full" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-discord-blurple/20 flex items-center justify-center">
                    <User size={28} className="text-discord-blurple" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {profile.discordUsername && (
                    <h2 className="text-lg font-semibold text-discord-header-primary truncate">
                      {profile.discordUsername}
                    </h2>
                  )}
                  {profile.email && (
                    <p className="text-sm text-discord-text-muted truncate flex items-center gap-1.5">
                      <Mail size={14} />
                      {profile.email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="bg-discord-sidebar rounded-lg divide-y divide-discord-darker/40">
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <Shield size={16} className="text-discord-channel-icon shrink-0" />
                  <span className="text-discord-text-muted">Login Method</span>
                </div>
                <span className="text-sm text-discord-header-primary font-medium flex items-center gap-2">
                  {profile.provider === 'discord' && (
                    <svg width="16" height="16" viewBox="0 0 71 55" fill="currentColor" className="text-[#5865F2]">
                      <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.7 40.7 0 00-1.8 3.7 54 54 0 00-16.2 0A26.4 26.4 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1 0A59.7 59.7 0 00.2 43.6a.2.2 0 000 .2 58.8 58.8 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 010-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3 0A58.6 58.6 0 0070.6 43.8a.2.2 0 000-.2A59.2 59.2 0 0060.2 5a.2.2 0 00-.1 0z" />
                    </svg>
                  )}
                  {providerLabel(profile.provider)}
                </span>
              </div>

              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar size={16} className="text-discord-channel-icon shrink-0" />
                  <span className="text-discord-text-muted">Account Created</span>
                </div>
                <span className="text-sm text-discord-header-secondary">{formatDate(profile.createdAt)}</span>
              </div>

              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <Clock size={16} className="text-discord-channel-icon shrink-0" />
                  <span className="text-discord-text-muted">Last Sign In</span>
                </div>
                <span className="text-sm text-discord-header-secondary">{formatDateTime(profile.lastSignIn)}</span>
              </div>

            </div>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full py-2.5 bg-discord-red/10 hover:bg-discord-red/20 border border-discord-red/20 hover:border-discord-red/30 rounded text-sm font-medium text-discord-red transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <LogOut size={16} />
              )}
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
