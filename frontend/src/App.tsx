import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useDmReadSync } from './hooks/useDmReadSync';
import { useAppStore } from './stores/appStore';
import { isHostedMode, getSupabase } from './lib/supabase';
import { isDemoMode, demoFlagSet, exitDemoMode, isTourMode, isSceneMode } from './demo/demoStore';
import TourOverlay from './demo/tour';
import SceneOverlay from './demo/scenes';
import { isIOSApp, isCompactLayout } from './utils/platform';
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
import SubscriptionGate, { SubscriptionGraceBanner } from './components/SubscriptionGate';
import OnboardingWizard, { isOnboardingComplete } from './components/OnboardingWizard';
import ProfilePage from './components/ProfilePage';
import AuthPage from './components/auth/AuthPage';
import { hasTokenEverBeenConfigured, setTokenStateUserId } from './utils/tokenState';

const MOBILE_BREAKPOINT = 768;

/**
 * Way back out of the sample-data preview the iOS gate offers. Only shown when
 * the preview was entered at runtime — the hosted web demo is permanently in
 * demo mode and has nothing to return to.
 */
function DemoPreviewBanner() {
  // Scripted promo scenes must not carry the banner into a recording (the iOS
  // scene poses as the iPhone shell, which would otherwise show it).
  if (!isDemoMode || !isIOSApp() || !demoFlagSet() || isSceneMode) return null;
  return (
    <div className="bg-discord-blurple/95 text-white text-xs py-1.5 px-3 text-center">
      Sample data — nothing here is a real message.{' '}
      <button onClick={exitDemoMode} className="underline font-medium">
        Exit preview
      </button>
    </div>
  );
}

function useZoomScale() {
  const zoomScale = useAppStore((s) => s.config?.mobileZoomScale ?? 1);

  useEffect(() => {
    // iOS gets real compact-mode sizing instead; CSS zoom would also scale the
    // px safe-area insets the shell injects and break fixed positioning.
    if (isIOSApp()) {
      document.documentElement.style.zoom = '';
      return;
    }
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT || 'ontouchstart' in window;
    if (!isMobile || zoomScale === 1) {
      document.documentElement.style.zoom = '';
      return;
    }
    document.documentElement.style.zoom = String(zoomScale);
    return () => { document.documentElement.style.zoom = ''; };
  }, [zoomScale]);
}

/**
 * iOS-style edge gesture: with the sidebar closed on a phone, swiping right
 * from the left screen edge opens it. (Closing by swiping left lives on the
 * drawer itself, in Sidebar.tsx.)
 */
function useEdgeSwipeOpen() {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);

  useEffect(() => {
    if (!isCompactLayout() || !sidebarCollapsed) return;
    let startX = -1;
    let startY = -1;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX <= 28 ? t.clientX : -1;
      startY = t.clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startX < 0) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      // Clearly vertical movement is a scroll — give the gesture up rather
      // than firing later when the finger happens to drift rightwards.
      if (dy > 60 && dy > dx) {
        startX = -1;
        return;
      }
      // Deliberate pull only: a good quarter of the screen, and clearly
      // horizontal. The old 40px trigger flung the drawer open on casual
      // grazes of the left edge.
      if (dx > 96 && dx > dy * 1.5) {
        startX = -1;
        setSidebarCollapsed(false);
      }
    };
    const onEnd = () => {
      startX = -1;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [sidebarCollapsed, setSidebarCollapsed]);
}

/**
 * Keeps the `compact` class (set before first paint by the inline script in
 * index.html) in sync when a web browser is resized across the breakpoint.
 * On iOS the class is permanent.
 */
function useCompactClass() {
  useEffect(() => {
    if (isIOSApp()) return;
    const sync = () =>
      document.documentElement.classList.toggle('compact', window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);
}

export default function App() {
  useWebSocket();
  useDmReadSync();
  useZoomScale();
  useCompactClass();
  useEdgeSwipeOpen();

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
  const roomsLoaded = useAppStore((s) => s.roomsLoaded);
  const configLoaded = useAppStore((s) => s.config !== null);
  const onboardingDoneInConfig = useAppStore((s) => s.config?.onboardingComplete === true);
  const updateConfig = useAppStore((s) => s.updateConfig);
  const setActiveRoom = useAppStore((s) => s.setActiveRoom);
  const fetchRooms = useAppStore((s) => s.fetchRooms);
  const fetchHistory = useAppStore((s) => s.fetchHistory);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const fetchGuilds = useAppStore((s) => s.fetchGuilds);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const fetchTradingStatus = useAppStore((s) => s.fetchTradingStatus);
  const fetchPremiumEvents = useAppStore((s) => s.fetchPremiumEvents);
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const fetchSubscriptionStatus = useAppStore((s) => s.fetchSubscriptionStatus);
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

  // Keep the Electron OS-wide "bring to front" shortcut in sync with the
  // saved setting (desktop only; no-op elsewhere).
  const focusHotkey = useAppStore((s) => s.config?.focusHotkey ?? null);
  useEffect(() => {
    window.trenchcord?.setFocusShortcut?.(focusHotkey);
  }, [focusHotkey]);

  useEffect(() => {
    setTokenStateUserId(supabaseUserId);
  }, [supabaseUserId]);

  useEffect(() => {
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      setSidebarCollapsed(true);
    }
  }, [setSidebarCollapsed]);

  // Room + feed hotkeys: pressing a configured key (outside a text field) jumps
  // the focused pane to that room, or opens the matching built-in feed.
  const feedHotkeys = useAppStore((s) => s.config?.feedHotkeys);
  const setActiveView = useAppStore((s) => s.setActiveView);
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
        return;
      }
      if (!feedHotkeys) return;
      // Rooms win on conflict (checked above); the Contract feed is a full
      // view, the rest are virtual rooms.
      if (feedHotkeys.contracts?.toLowerCase() === key) {
        e.preventDefault();
        setActiveView('contracts');
        return;
      }
      for (const feed of ['mentions', 'keywords', 'snipes', 'alerts', 'dms'] as const) {
        if (feedHotkeys[feed]?.toLowerCase() === key) {
          e.preventDefault();
          setActiveRoom(feed);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rooms, setActiveRoom, feedHotkeys, setActiveView]);

  useEffect(() => {
    if (!isHostedMode || supabaseSession) {
      checkAuth();
    }
  }, [checkAuth, supabaseSession]);

  useEffect(() => {
    if (isHostedMode) return;
    fetchSubscriptionStatus();
    // The backend re-validates every 5 minutes and pushes changes over the
    // socket; this poll is the fallback for missed pushes (socket reconnect
    // gaps) and still catches an approaching period end (renewal banner).
    const timer = setInterval(() => fetchSubscriptionStatus(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchSubscriptionStatus]);

  // Every fetch below 403s while the subscription gate is closed, so wait for
  // it to open — and re-run when it opens. Without the `gated` dependency the
  // boot load fired once behind a closed gate, came back empty, and the app
  // rendered with no rooms and default settings right after device pairing.
  const gated = !!(subscriptionStatus?.enforced && !subscriptionStatus.active) && !previewMode;
  useEffect(() => {
    if (gated) return;
    if (authStatus?.configured || previewMode) {
      Promise.all([fetchRooms(), fetchConfig()]).then(() => setDataReady(true));
      fetchDMChannels();
      fetchHistory();
      fetchTradingStatus();
      // Server icons for message badges. Without this boot fetch the guild
      // list only loads on a gateway_ready event or when a settings modal
      // opens — a page that loads after the gateways connected shows initials.
      fetchGuilds();
      // Hydrate the Alerts feed with recent cloud-fired events (no-op when
      // the backend lacks the premium module or the subscription is inactive).
      fetchPremiumEvents();
    }
  }, [gated, authStatus?.configured, previewMode, fetchRooms, fetchHistory, fetchConfig, fetchDMChannels, fetchGuilds, fetchTradingStatus, fetchPremiumEvents]);

  // First-run wizard. `roomsLoaded` matters: a boot whose /rooms fetch failed
  // (backend still thawing on iOS, subscription gate racing) leaves rooms
  // empty without meaning "this user has no rooms" — treating it that way
  // used to greet configured users with the setup guide. The config flag is
  // the durable record; localStorage is only a fallback because iOS evicts
  // WKWebView storage under disk pressure.
  useEffect(() => {
    if (
      dataReady &&
      roomsLoaded &&
      configLoaded &&
      !previewMode &&
      rooms.length === 0 &&
      !onboardingDoneInConfig &&
      !isOnboardingComplete(supabaseUserId)
    ) {
      setShowOnboarding(true);
    }
  }, [dataReady, roomsLoaded, configLoaded, previewMode, rooms.length, onboardingDoneInConfig, supabaseUserId]);

  // Stamp onboarding completion into the server config for installs that
  // predate the flag: anyone with rooms (or the old localStorage marker) has
  // plainly been through setup. Once stamped, an iOS storage purge can never
  // resurrect the wizard.
  useEffect(() => {
    if (!dataReady || previewMode || !configLoaded || onboardingDoneInConfig) return;
    if ((roomsLoaded && rooms.length > 0) || isOnboardingComplete(supabaseUserId)) {
      void updateConfig({ onboardingComplete: true });
    }
  }, [dataReady, previewMode, configLoaded, onboardingDoneInConfig, roomsLoaded, rooms.length, supabaseUserId, updateConfig]);

  // A failed status check leaves authStatus null — the backend isn't
  // answering (yet). Keep asking instead of concluding anything from an
  // unanswered question; the spinner below covers the wait.
  useEffect(() => {
    if (authLoading || authStatus !== null) return;
    if (isHostedMode && !supabaseSession) return;
    const timer = setTimeout(() => checkAuth(), 2000);
    return () => clearTimeout(timer);
  }, [authLoading, authStatus, checkAuth, supabaseSession]);

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

  // authStatus === null means the check itself failed (backend still coming
  // up), not "unconfigured" — hold the spinner while the retry effect above
  // keeps asking, rather than dropping a configured user on a setup screen.
  if (authLoading || (authStatus === null && !previewMode)) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-discord-dark">
        <div className="w-6 h-6 border-2 border-discord-blurple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Official builds require a linked account with an active subscription.
  // Self-hosted builds (enforcement off) never see this screen.
  if (subscriptionStatus?.enforced && !subscriptionStatus.active && !previewMode) {
    return <SubscriptionGate />;
  }

  if (authStatus !== null && !authStatus.configured && !tokenPreviouslyConfigured && !previewMode) {
    return <TokenSetup />;
  }

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={() => {
          setShowOnboarding(false);
          // The wizard can appear mid-session now (first token added from
          // Settings while previewing) — finish in the chat view, not on the
          // Settings screen left underneath. The wizard's own error path sets
          // the settings view after this callback, so it still wins.
          setActiveView('chat');
        }}
        userId={supabaseUserId}
      />
    );
  }

  return (
    // Top inset only: content may run under the translucent home indicator
    // like a native list; bottom bars (chat input, save bar, drawer footer,
    // room bar) pad themselves with --safe-bottom instead.
    <div className="flex h-full w-full relative compact:pt-[var(--safe-top)]">
      {/* Banners stack in one column so they can never overlap each other,
          and share a single safe-area offset on phones. */}
      <div className="absolute top-0 compact:top-[var(--safe-top)] left-0 right-0 z-40">
        <SubscriptionGraceBanner />
        <DemoPreviewBanner />
      </div>
      <Sidebar />
      {activeView === 'settings' ? <GlobalSettings /> : activeView === 'contracts' ? <ContractDashboard /> : activeView === 'profile' ? <ProfilePage /> : <ChatView />}
      <RoomConfig />
      <AlertToast />
      <TradeToast />
      <GatewayAuthBanner />
      {isTourMode && <TourOverlay />}
      {isSceneMode && <SceneOverlay />}
    </div>
  );
}
