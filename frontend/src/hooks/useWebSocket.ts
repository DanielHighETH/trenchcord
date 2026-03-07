import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { playHighlightSound, playContractAlertSound, playKeywordAlertSound, playSound } from '../utils/notificationSound';
import { buildContractUrl } from '../utils/contractUrl';
import { showDesktopNotification } from '../utils/desktopNotification';
import { isDemoMode } from '../demo/demoStore';
import { isHostedMode, getSupabase } from '../lib/supabase';
import { buildStreamMessage, STREAM_POOL } from '../demo/demoData';
import type { WsIncoming, Alert, FrontendMessage, ContractEntry } from '../types';

let idCounter = 0;

function useDemoStream() {
  const addMessage = useAppStore((s) => s.addMessage);
  const setConnected = useAppStore((s) => s.setConnected);
  const poolIndex = useRef(0);

  useEffect(() => {
    if (!isDemoMode) return;
    setConnected(true);

    const interval = setInterval(() => {
      const { message, roomIds } = buildStreamMessage(poolIndex.current);
      poolIndex.current = (poolIndex.current + 1) % STREAM_POOL.length;
      addMessage(message, roomIds);
    }, 6000 + Math.random() * 4000);

    return () => clearInterval(interval);
  }, [addMessage, setConnected]);
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateMessage = useAppStore((s) => s.updateMessage);
  const addAlert = useAppStore((s) => s.addAlert);
  const setConnected = useAppStore((s) => s.setConnected);
  const updateReaction = useAppStore((s) => s.updateReaction);
  const addContract = useAppStore((s) => s.addContract);
  const updateContractChain = useAppStore((s) => s.updateContractChain);
  const fetchGuilds = useAppStore((s) => s.fetchGuilds);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const fetchHistory = useAppStore((s) => s.fetchHistory);
  const fetchTelegramChats = useAppStore((s) => s.fetchTelegramChats);
  const checkAuth = useAppStore((s) => s.checkAuth);

  useDemoStream();

  useEffect(() => {
    if (isDemoMode) return;

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    let wsUrl: string;
    if (import.meta.env.VITE_API_URL) {
      const apiUrl = new URL(import.meta.env.VITE_API_URL);
      const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${wsProtocol}//${apiUrl.host}/ws`;
    } else {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    }

    function connect() {
      if (disposed) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        if (disposed) { ws.close(); return; }
        console.log('[WS] Connected');
        setConnected(true);

        if (isHostedMode) {
          try {
            const { data } = await getSupabase().auth.getSession();
            if (data.session?.access_token) {
              ws.send(JSON.stringify({ type: 'auth', token: data.session.access_token }));
            }
          } catch {}
        }

        ws.send(JSON.stringify({ type: 'subscribe_all' }));
      };

      ws.onmessage = (event) => {
        try {
          const incoming: WsIncoming = JSON.parse(event.data);

          if (incoming.type === 'message') {
            const msg = incoming.data as FrontendMessage;
            const roomIds = incoming.roomIds ?? [];
            const config = useAppStore.getState().config;

            const ss = config?.soundSettings;

            let eventSoundPlayed = false;

            if (msg.isHighlighted && msg.hasContractAddress) {
              if (config?.messageSounds) { playContractAlertSound(ss?.contractAlert); eventSoundPlayed = true; }
              if (config?.autoOpenHighlightedContracts && msg.contractAddresses.length > 0) {
                const url = buildContractUrl(
                  msg.contractAddresses[0],
                  config.contractLinkTemplates,
                );
                window.open(url, '_blank');
              }
              if (config?.desktopNotifications) {
                showDesktopNotification(msg, 'Contract from highlighted user');
              }
            } else if (msg.matchedKeywords && msg.matchedKeywords.length > 0 && config?.keywordAlertsEnabled) {
              if (config?.messageSounds) { playKeywordAlertSound(ss?.keywordAlert); eventSoundPlayed = true; }
              if (config?.desktopNotifications) {
                showDesktopNotification(msg, `Keyword: ${msg.matchedKeywords.join(', ')}`);
              }
            } else if (msg.isHighlighted) {
              if (config?.messageSounds) { playHighlightSound(ss?.highlight); eventSoundPlayed = true; }
              if (config?.desktopNotifications) {
                showDesktopNotification(msg, 'Highlighted user');
              }
            }

            if (!eventSoundPlayed && config?.messageSounds) {
              const chSound = config.channelSounds?.[msg.channelId];
              if (chSound?.enabled) {
                playSound('highlight', chSound);
              }
            }

            addMessage(msg, roomIds);
          } else if (incoming.type === 'alert') {
            const alertData = incoming.data as { type: string; message: FrontendMessage; reason: string };
            const alert: Alert = {
              id: `alert-${++idCounter}`,
              type: alertData.type as Alert['type'],
              message: alertData.message,
              reason: alertData.reason,
              timestamp: Date.now(),
            };
            addAlert(alert);
          } else if (incoming.type === 'message_update') {
            updateMessage(incoming.data);
          } else if (incoming.type === 'reaction_update') {
            const { channelId, messageId, emoji, delta } = incoming.data;
            updateReaction(channelId, messageId, emoji, delta);
          } else if (incoming.type === 'contract') {
            const entry = incoming.data as ContractEntry;
            addContract(entry);
          } else if (incoming.type === 'chain_update') {
            const { address, evmChain } = incoming.data as { address: string; evmChain: string };
            updateContractChain(address, evmChain);
          } else if (incoming.type === 'gateway_ready') {
            fetchGuilds();
            fetchDMChannels();
            fetchHistory();
          } else if (incoming.type === 'telegram_ready') {
            fetchTelegramChats();
            fetchHistory();
            checkAuth();
          }
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
        console.log('[WS] Disconnected, reconnecting in 3s...');
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [addMessage, updateMessage, addAlert, setConnected, updateReaction, addContract, updateContractChain, fetchGuilds, fetchDMChannels, fetchHistory, fetchTelegramChats, checkAuth]);
}
