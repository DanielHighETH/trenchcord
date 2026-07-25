import { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { popoutSeedStorageKey, useAppStore } from '../stores/appStore';
import type { FrontendMessage } from '../types';
import ChatPane from './ChatPane';

function getPopoutRoomId(): string {
  try {
    return new URLSearchParams(window.location.search).get('roomId') ?? '';
  } catch {
    return '';
  }
}

function getPopoutTitle(): string {
  try {
    return new URLSearchParams(window.location.search).get('title') ?? '';
  } catch {
    return '';
  }
}

async function loadPopoutSeed(roomId: string): Promise<FrontendMessage[] | null> {
  const fromBridge = (await window.trenchcord?.getPopoutSeed(roomId)) as FrontendMessage[] | null | undefined;
  if (Array.isArray(fromBridge) && fromBridge.length > 0) return fromBridge;

  try {
    const key = popoutSeedStorageKey(roomId);
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FrontendMessage[]) : null;
  } catch {
    return null;
  }
}

// Renders a single chat in its own window (Electron or browser popout). Its own
// renderer means an independent store + WebSocket, so it stays live on its own.
// The room switcher drives the shown chat via the store's single pane.
export default function PopoutView() {
  useWebSocket();

  const roomIdParam = getPopoutRoomId();
  const checkAuth = useAppStore((s) => s.checkAuth);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const fetchRooms = useAppStore((s) => s.fetchRooms);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const fetchHistory = useAppStore((s) => s.fetchHistory);
  const paneRoomIds = useAppStore((s) => s.paneRoomIds);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    const title = getPopoutTitle();
    if (title) document.title = title;
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Pin the popout store to exactly this one room. The room switcher updates
    // paneRoomIds[0]; layout persistence is a no-op in popout mode.
    useAppStore.setState({
      paneRoomIds: [roomIdParam],
      paneLocks: [false],
      activeRoomId: roomIdParam,
      activePaneIndex: 0,
    });

    // Seed the store with the messages the main window already had loaded, so
    // history shows instantly (rooms, DMs, and mentions alike).
    (async () => {
      const seed = await loadPopoutSeed(roomIdParam);
      if (cancelled || !seed || seed.length === 0) return;
      useAppStore.setState((s) => {
        const existing = s.messages[roomIdParam] ?? [];
        const existingIds = new Set(existing.map((m) => m.id));
        const merged = [...seed.filter((m) => !existingIds.has(m.id)), ...existing];
        return { messages: { ...s.messages, [roomIdParam]: merged } };
      });
    })();

    return () => { cancelled = true; };
  }, [roomIdParam]);

  useEffect(() => {
    checkAuth();
    Promise.all([fetchConfig(), fetchRooms()]).then(() => setReady(true));
    fetchDMChannels();
    fetchHistory();
  }, [checkAuth, fetchConfig, fetchRooms, fetchDMChannels, fetchHistory]);

  const roomId = paneRoomIds[0] ?? roomIdParam;

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-discord-dark">
        <div className="w-6 h-6 border-2 border-discord-blurple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <ChatPane roomId={roomId} paneIndex={0} paneCount={1} editMode={false} variant="popout" />
    </div>
  );
}
