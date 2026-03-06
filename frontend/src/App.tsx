import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useAppStore } from './stores/appStore';
import { isHostedMode, getSupabase } from './lib/supabase';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import ContractDashboard from './components/ContractDashboard';
import GlobalSettings from './components/GlobalSettings';
import RoomConfig from './components/RoomConfig';
import AlertToast from './components/AlertToast';
import TokenSetup from './components/TokenSetup';
import OnboardingWizard, { isOnboardingComplete } from './components/OnboardingWizard';
import ProfilePage from './components/ProfilePage';
import AuthPage from './components/auth/AuthPage';

const MOBILE_BREAKPOINT = 768;

export default function App() {
  useWebSocket();

  const [supabaseReady, setSupabaseReady] = useState(!isHostedMode);
  const [supabaseSession, setSupabaseSession] = useState<boolean | null>(isHostedMode ? null : true);
  const [supabaseUserId, setSupabaseUserId] = useState<string | undefined>(undefined);

  // Supabase session listener (hosted mode only)
  useEffect(() => {
    if (!isHostedMode) return;

    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSupabaseSession(!!data.session);
      setSupabaseUserId(data.session?.user?.id);
      setSupabaseReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseSession(!!session);
      setSupabaseUserId(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const authStatus = useAppStore((s) => s.authStatus);
  const authLoading = useAppStore((s) => s.authLoading);
  const checkAuth = useAppStore((s) => s.checkAuth);
  const rooms = useAppStore((s) => s.rooms);
  const fetchRooms = useAppStore((s) => s.fetchRooms);
  const fetchHistory = useAppStore((s) => s.fetchHistory);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const activeView = useAppStore((s) => s.activeView);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      setSidebarCollapsed(true);
    }
  }, [setSidebarCollapsed]);

  useEffect(() => {
    if (!isHostedMode || supabaseSession) {
      checkAuth();
    }
  }, [checkAuth, supabaseSession]);

  useEffect(() => {
    if (authStatus?.configured) {
      Promise.all([fetchRooms(), fetchConfig()]).then(() => setDataReady(true));
      fetchDMChannels();
      fetchHistory();
    }
  }, [authStatus?.configured, fetchRooms, fetchHistory, fetchConfig, fetchDMChannels]);

  useEffect(() => {
    if (dataReady && rooms.length === 0 && !isOnboardingComplete(supabaseUserId)) {
      setShowOnboarding(true);
    }
  }, [dataReady, rooms.length, supabaseUserId]);

  // Hosted mode: waiting for Supabase session check
  if (isHostedMode && !supabaseReady) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-discord-dark">
        <div className="w-6 h-6 border-2 border-discord-blurple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Hosted mode: not authenticated
  if (isHostedMode && !supabaseSession) {
    return <AuthPage onAuth={() => setSupabaseSession(true)} />;
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-discord-dark">
        <div className="w-6 h-6 border-2 border-discord-blurple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authStatus?.configured) {
    return <TokenSetup />;
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} userId={supabaseUserId} />;
  }

  return (
    <div className="flex h-full w-full">
      <Sidebar />
      {activeView === 'settings' ? <GlobalSettings /> : activeView === 'contracts' ? <ContractDashboard /> : activeView === 'profile' ? <ProfilePage /> : <ChatView />}
      <RoomConfig />
      <AlertToast />
    </div>
  );
}
