import { useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useAppStore } from './stores/appStore';
import { requestNotificationPermission } from './utils/desktopNotification';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import ContractDashboard from './components/ContractDashboard';
import RoomConfig from './components/RoomConfig';
import AlertToast from './components/AlertToast';

export default function App() {
  useWebSocket();

  const fetchRooms = useAppStore((s) => s.fetchRooms);
  const fetchHistory = useAppStore((s) => s.fetchHistory);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const activeView = useAppStore((s) => s.activeView);

  useEffect(() => {
    fetchRooms().then(() => fetchHistory());
    fetchConfig();
    fetchDMChannels();
    requestNotificationPermission();
  }, [fetchRooms, fetchHistory, fetchConfig, fetchDMChannels]);

  return (
    <div className="flex h-full w-full">
      <Sidebar />
      {activeView === 'contracts' ? <ContractDashboard /> : <ChatView />}
      <RoomConfig />
      <AlertToast />
    </div>
  );
}
