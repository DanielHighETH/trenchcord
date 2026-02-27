import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { playHighlightSound, playContractAlertSound, playKeywordAlertSound } from '../utils/notificationSound';
import { buildContractUrl } from '../utils/contractUrl';
import { showDesktopNotification } from '../utils/desktopNotification';
import type { WsIncoming, Alert, FrontendMessage, ContractEntry } from '../types';

let idCounter = 0;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const addMessage = useAppStore((s) => s.addMessage);
  const addAlert = useAppStore((s) => s.addAlert);
  const setConnected = useAppStore((s) => s.setConnected);
  const updateReaction = useAppStore((s) => s.updateReaction);
  const addContract = useAppStore((s) => s.addContract);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      if (disposed) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        console.log('[WS] Connected');
        setConnected(true);
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

            if (msg.isHighlighted && msg.hasContractAddress) {
              if (config?.messageSounds) playContractAlertSound(ss?.contractAlert);
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
            } else if (msg.isHighlighted) {
              if (config?.messageSounds) playHighlightSound(ss?.highlight);
              if (config?.desktopNotifications) {
                showDesktopNotification(msg, 'Highlighted user');
              }
            }

            if (msg.matchedKeywords && msg.matchedKeywords.length > 0) {
              if (config?.messageSounds && config?.keywordAlertsEnabled) playKeywordAlertSound(ss?.keywordAlert);
              if (config?.desktopNotifications && config?.keywordAlertsEnabled) {
                showDesktopNotification(msg, `Keyword: ${msg.matchedKeywords.join(', ')}`);
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
          } else if (incoming.type === 'reaction_update') {
            const { channelId, messageId, emoji, delta } = incoming.data;
            updateReaction(channelId, messageId, emoji, delta);
          } else if (incoming.type === 'contract') {
            const entry = incoming.data as ContractEntry;
            addContract(entry);
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
  }, [addMessage, addAlert, setConnected, updateReaction, addContract]);
}
