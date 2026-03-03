import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useAppStore } from './stores/appStore';
import { isDemoMode } from './demo/demoStore';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import ContractDashboard from './components/ContractDashboard';
import GlobalSettings from './components/GlobalSettings';
import RoomConfig from './components/RoomConfig';
import AlertToast from './components/AlertToast';
import TokenSetup from './components/TokenSetup';
import OnboardingWizard, { isOnboardingComplete } from './components/OnboardingWizard';

const MOBILE_BREAKPOINT = 768;
const SIDEBAR_COLLAPSE_BREAKPOINT = 640;

function detectMobile(): boolean {
  // User-Agent Client Hints — the modern definitive check
  const uaData = (navigator as any).userAgentData;
  if (uaData?.mobile) return true;

  if (window.innerWidth < MOBILE_BREAKPOINT) return true;

  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;

  // Touch-primary device with no hover capability (phones & tablets, not touch laptops)
  const coarse = window.matchMedia('(pointer: coarse) and (hover: none)').matches;
  if (coarse && navigator.maxTouchPoints > 1) return true;

  return false;
}

function MobileGate() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-discord-darker px-8 text-center">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#5865f2"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-6"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
      <h1 className="text-2xl font-bold text-white mb-3">Desktop Only</h1>
      <p className="text-discord-text-muted text-sm leading-relaxed max-w-xs">
        Trenchcord is built for desktop. Please visit on a computer for the full experience.
      </p>
      <a
        href="https://trenchcord.app"
        className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded bg-discord-blurple text-white text-sm font-medium hover:bg-discord-blurple-hover transition-colors"
      >
        Back to Homepage
      </a>
    </div>
  );
}

export default function App() {
  useWebSocket();

  const [isMobile, setIsMobile] = useState(detectMobile);

  useEffect(() => {
    const onResize = () => setIsMobile(detectMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
    const checkWidth = () => {
      if (window.innerWidth < SIDEBAR_COLLAPSE_BREAKPOINT) {
        setSidebarCollapsed(true);
      }
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, [setSidebarCollapsed]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authStatus?.configured) {
      Promise.all([
        fetchRooms().then(() => fetchHistory()),
        fetchConfig(),
        fetchDMChannels(),
      ]).then(() => setDataReady(true));
    }
  }, [authStatus?.configured, fetchRooms, fetchHistory, fetchConfig, fetchDMChannels]);

  useEffect(() => {
    if (dataReady && rooms.length === 0 && !isOnboardingComplete()) {
      setShowOnboarding(true);
    }
  }, [dataReady, rooms.length]);

  if (isDemoMode && isMobile) {
    return <MobileGate />;
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
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="flex h-full w-full">
      <Sidebar />
      {activeView === 'settings' ? <GlobalSettings /> : activeView === 'contracts' ? <ContractDashboard /> : <ChatView />}
      <RoomConfig />
      <AlertToast />
    </div>
  );
}
