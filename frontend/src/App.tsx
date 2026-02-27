import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useAppStore } from './stores/appStore';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import ContractDashboard from './components/ContractDashboard';
import GlobalSettings from './components/GlobalSettings';
import RoomConfig from './components/RoomConfig';
import AlertToast from './components/AlertToast';
import TokenSetup from './components/TokenSetup';

const MOBILE_BREAKPOINT = 768;

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

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const authStatus = useAppStore((s) => s.authStatus);
  const authLoading = useAppStore((s) => s.authLoading);
  const checkAuth = useAppStore((s) => s.checkAuth);
  const fetchRooms = useAppStore((s) => s.fetchRooms);
  const fetchHistory = useAppStore((s) => s.fetchHistory);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const activeView = useAppStore((s) => s.activeView);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authStatus?.configured) {
      fetchRooms().then(() => fetchHistory());
      fetchConfig();
      fetchDMChannels();
    }
  }, [authStatus?.configured, fetchRooms, fetchHistory, fetchConfig, fetchDMChannels]);

  if (isMobile) {
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

  return (
    <div className="flex h-full w-full">
      <Sidebar />
      {activeView === 'settings' ? <GlobalSettings /> : activeView === 'contracts' ? <ContractDashboard /> : <ChatView />}
      <RoomConfig />
      <AlertToast />
    </div>
  );
}
