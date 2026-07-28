import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useAppStore } from './stores/appStore';
import { isHostedMode, getSupabase } from './lib/supabase';
import { isDemoMode } from './demo/demoStore';
import DiscontinuedNotice from './components/DiscontinuedNotice';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import ContractDashboard from './components/ContractDashboard';
import GlobalSettings from './components/GlobalSettings';
import RoomConfig from './components/RoomConfig';
import AlertToast from './components/AlertToast';
import TradeToast from './components/TradeToast';
import GatewayAuthBanner from './components/GatewayAuthBanner';
import TokenSetup from './components/TokenSetup';
import OnboardingWizard, { isOnboardingComplete } from './components/OnboardingWizard';
import ProfilePage from './components/ProfilePage';
import AuthPage from './components/auth/AuthPage';
import { hasTokenEverBeenConfigured, setTokenStateUserId } from './utils/tokenState';

const MOBILE_BREAKPOINT = 768;

function useZoomScale() {
  const zoomScale = useAppStore((s) => s.config?.mobileZoomScale ?? 1);

  useEffect(() => {
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT || 'ontouchstart' in window;
    if (!isMobile || zoomScale === 1) {
      document.documentElement.style.zoom = '';
      return;
    }
    document.documentElement.style.zoom = String(zoomScale);
    return () => { document.documentElement.style.zoom = ''; };
  }, [zoomScale]);
}

export default function App() {
  useWebSocket();
  useZoomScale();

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
  const setActiveRoom = useAppStore((s) => s.setActiveRoom);
  const fetchRooms = useAppStore((s) => s.fetchRooms);
  const fetchHistory = useAppStore((s) => s.fetchHistory);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const fetchTradingStatus = useAppStore((s) => s.fetchTradingStatus);
  const activeView = useAppStore((s) => s.activeView);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const setGatewayAuthError = useAppStore((s) => s.setGatewayAuthError);
  const previewMode = useAppStore((s) => s.previewMode);
  const dockPopout = useAppStore((s) => s.dockPopout);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // Re-dock a chat when its popout window is closed (desktop only).
  useEffect(() => {
    return window.trenchcord?.onPopoutClosed((roomId) => dockPopout(roomId));
  }, [dockPopout]);

  useEffect(() => {
    setTokenStateUserId(supabaseUserId);
  }, [supabaseUserId]);

  useEffect(() => {
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      setSidebarCollapsed(true);
    }
  }, [setSidebarCollapsed]);

  // Room hotkeys: pressing a room's configured key (outside a text field) jumps
  // the focused pane to that room.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key.length !== 1) return;
      const key = e.key.toLowerCase();
      const room = rooms.find((r) => r.hotkey && r.hotkey.toLowerCase() === key);
      if (room) {
        e.preventDefault();
        setActiveRoom(room.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rooms, setActiveRoom]);

  useEffect(() => {
    if (!isHostedMode || supabaseSession) {
      checkAuth();
    }
  }, [checkAuth, supabaseSession]);

  useEffect(() => {
    if (authStatus?.configured || previewMode) {
      Promise.all([fetchRooms(), fetchConfig()]).then(() => setDataReady(true));
      fetchDMChannels();
      fetchHistory();
      fetchTradingStatus();
    }
  }, [authStatus?.configured, previewMode, fetchRooms, fetchHistory, fetchConfig, fetchDMChannels, fetchTradingStatus]);

  useEffect(() => {
    if (dataReady && !previewMode && rooms.length === 0 && !isOnboardingComplete(supabaseUserId)) {
      setShowOnboarding(true);
    }
  }, [dataReady, previewMode, rooms.length, supabaseUserId]);

  const tokenPreviouslyConfigured = hasTokenEverBeenConfigured(supabaseUserId);

  useEffect(() => {
    if (authLoading) return;
    if (authStatus?.configured) return;
    if (!tokenPreviouslyConfigured) return;
    setGatewayAuthError(
      'Your Discord token is missing or expired. Please re-enter it in Settings > Tokens.',
    );
  }, [authLoading, authStatus?.configured, tokenPreviouslyConfigured, setGatewayAuthError]);

  // The hosted web app is discontinued: send users to the desktop app instead.
  // The public demo build (demo.trenchcord.app) stays available.
  if (isHostedMode && !isDemoMode) {
    return <DiscontinuedNotice />;
  }

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

  if (!authStatus?.configured && !tokenPreviouslyConfigured && !previewMode) {
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
      <TradeToast />
      <GatewayAuthBanner />
    </div>
  );
}
