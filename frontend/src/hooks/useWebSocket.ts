import { useEffect, useRef } from 'react';
import { useAppStore, IS_POPOUT } from '../stores/appStore';
import { playHighlightSound, playContractAlertSound, playKeywordAlertSound, playSound } from '../utils/notificationSound';
import { buildContractUrl } from '../utils/contractUrl';
import { showDesktopNotification, showGenericNotification } from '../utils/desktopNotification';
import { isDemoMode, isTourMode, isSceneMode } from '../demo/demoStore';
import { isIOSApp } from '../utils/platform';
import { isHostedMode, getSupabase } from '../lib/supabase';
import { buildStreamMessage, STREAM_POOL } from '../demo/demoData';
import type { WsIncoming, Alert, MessageAlert, FrontendMessage, ContractEntry, PremiumEvent } from '../types';

let idCounter = 0;

function useDemoStream() {
  const addMessage = useAppStore((s) => s.addMessage);
  const setConnected = useAppStore((s) => s.setConnected);
  const poolIndex = useRef(0);

  useEffect(() => {
    if (!isDemoMode) return;
    setConnected(true);
    // The promo tour and promo scenes script their own message streams —
    // random arrivals would fight the scene timing.
    if (isTourMode || isSceneMode) return;

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
  const markMessageDeleted = useAppStore((s) => s.markMessageDeleted);
  const addAlert = useAppStore((s) => s.addAlert);
  const setConnected = useAppStore((s) => s.setConnected);
  const updateReaction = useAppStore((s) => s.updateReaction);
  const addContract = useAppStore((s) => s.addContract);
  const updateContractChain = useAppStore((s) => s.updateContractChain);
  const fetchGuilds = useAppStore((s) => s.fetchGuilds);
  const fetchRooms = useAppStore((s) => s.fetchRooms);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const fetchHistory = useAppStore((s) => s.fetchHistory);
  const fetchTelegramChats = useAppStore((s) => s.fetchTelegramChats);
  const fetchTelegramAccounts = useAppStore((s) => s.fetchTelegramAccounts);
  const checkAuth = useAppStore((s) => s.checkAuth);
  const setGatewayAuthError = useAppStore((s) => s.setGatewayAuthError);
  const fetchMaskedTokens = useAppStore((s) => s.fetchMaskedTokens);

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

        // A gateway_ready broadcast while this socket was down is gone for
        // good, and with it the guild refetch it would have triggered — so
        // badges showed acronyms instead of server icons until a settings
        // modal happened to refetch. Resync on every (re)connect.
        fetchGuilds();

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

            // Popout windows share the main window's live stream but must not
            // duplicate sounds, notifications, or contract auto-open.
            if (IS_POPOUT) {
              addMessage(msg, roomIds, true);
              return;
            }

            const ss = config?.soundSettings;

            let eventSoundPlayed = false;

            if (msg.isHighlighted && msg.hasContractAddress) {
              if (config?.messageSounds) { playContractAlertSound(ss?.contractAlert); eventSoundPlayed = true; }
              if (config?.autoOpenHighlightedContracts && msg.contractAddresses.length > 0) {
                const addr = msg.contractAddresses[0];
                const evmChain = useAppStore.getState().addressChains[addr.toLowerCase()];
                const url = buildContractUrl(
                  addr,
                  config.contractLinkTemplates,
                  evmChain,
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

            addMessage(msg, roomIds, true);
          } else if (incoming.type === 'alert') {
            const alertData = incoming.data as { type: string; message: FrontendMessage; reason: string };
            const alert: Alert = {
              id: `alert-${++idCounter}`,
              type: alertData.type as MessageAlert['type'],
              message: alertData.message,
              reason: alertData.reason,
              timestamp: Date.now(),
            };
            addAlert(alert);
          } else if (incoming.type === 'message_update') {
            updateMessage(incoming.data);
          } else if (incoming.type === 'message_delete') {
            markMessageDeleted(incoming.data);
          } else if (incoming.type === 'message_ack') {
            useAppStore.getState().markRoomsRead(incoming.roomIds ?? []);
          } else if (incoming.type === 'reaction_update') {
            const { channelId, messageId, emoji, delta } = incoming.data;
            updateReaction(channelId, messageId, emoji, delta);
          } else if (incoming.type === 'poll_vote_update') {
            const { channelId, messageId, answerId, delta } = incoming.data;
            useAppStore.getState().updatePollVote(channelId, messageId, answerId, delta);
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
            // Rooms carry the channels of the categories they watch, which
            // only resolve once a gateway is up.
            fetchRooms();
          } else if (incoming.type === 'guild_channels_updated') {
            // A channel was added, removed or moved in a server: pull the new
            // channel list and the rooms whose categories now resolve to it.
            fetchGuilds();
            fetchRooms();
          } else if (incoming.type === 'telegram_ready') {
            fetchTelegramChats();
            fetchHistory();
            checkAuth();
            // Identity for a newly connected account is only known once it is
            // logged in, so pull the list again to fill in its @username.
            fetchTelegramAccounts();
          } else if (incoming.type === 'telegram_status') {
            // Backend detected a dropped/restored Telegram connection - refresh
            // the auth status so the sidebar indicator stops lying.
            checkAuth();
            fetchTelegramAccounts();
          } else if (incoming.type === 'snipe_result') {
            const d = incoming.data as {
              status: 'bought' | 'failed' | 'skipped';
              mint: string;
              configName: string;
              solAmount: number;
              wallets: { label: string; ok: boolean; error?: string }[];
              reason?: string;
              messageId?: string;
              channelId?: string;
              timestamp?: string;
            };
            // Every window records the snipe into its "snipes" feed (popouts
            // hold their own store copy), but only the main window toasts.
            useAppStore.getState().addSnipeResult(d);
            if (!IS_POPOUT) {
              const shortMint = `${d.mint.slice(0, 4)}…${d.mint.slice(-4)}`;
              const name = d.configName || 'Snipe';
              if (d.status === 'bought') {
                const ok = d.wallets.filter((w) => w.ok).length;
                const partial = ok < d.wallets.length ? ` (${ok}/${d.wallets.length} wallets)` : '';
                useAppStore.getState().pushToast({
                  kind: 'success',
                  title: `Sniped ${shortMint} — ${d.solAmount} SOL${partial}`,
                  detail: name,
                });
              } else {
                useAppStore.getState().pushToast({
                  kind: 'error',
                  title: d.status === 'skipped' ? `Snipe skipped ${shortMint}` : `Snipe failed ${shortMint}`,
                  detail: d.reason ?? d.wallets.find((w) => w.error)?.error ?? name,
                });
              }
            }
          } else if (incoming.type === 'premium_alert') {
            const event = incoming.data as PremiumEvent;
            // Every window records the event into the "alerts" feed (popouts
            // hold their own store copy), but only the main window notifies.
            useAppStore.getState().addPremiumEvent(event);
            if (!IS_POPOUT) {
              addAlert({
                id: `premium-${event.id}`,
                type: 'premium',
                event,
                reason: event.title,
                timestamp: Date.now(),
              });
              const config = useAppStore.getState().config;
              if (config?.messageSounds) {
                playSound('premiumAlert', config.soundSettings?.premiumAlert);
              }
              if (config?.desktopNotifications) {
                showGenericNotification(event.title, event.body, event.url ?? undefined);
              }
            }
          } else if (incoming.type === 'gateway_auth_failed') {
            setGatewayAuthError(
              incoming.error ?? 'Discord token authentication failed. Please check your token in settings.',
              incoming.tokenBlocked,
            );
            fetchMaskedTokens();
          } else if (incoming.type === 'subscription_status') {
            // The backend noticed an entitlement change (e.g. this device was
            // revoked on the dashboard) — flip the gate now instead of waiting
            // for the next status poll.
            useAppStore.setState({ subscriptionStatus: incoming.data });
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

    // Coming back from the background (above all on iOS, where suspension
    // kills TCP without delivering a close — the socket still claims OPEN),
    // reconnect immediately instead of trusting a possibly-zombie socket or
    // waiting out the retry timer.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || disposed) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && !isIOSApp()) return;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // its close must not schedule a second reconnect
        try { ws.close(); } catch { /* already dead */ }
      }
      connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [addMessage, updateMessage, markMessageDeleted, addAlert, setConnected, updateReaction, addContract, updateContractChain, fetchGuilds, fetchRooms, fetchDMChannels, fetchHistory, fetchTelegramChats, fetchTelegramAccounts, checkAuth, setGatewayAuthError, fetchMaskedTokens]);
}
