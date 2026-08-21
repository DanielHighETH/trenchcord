import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { BadgeCheck, Check, Copy, ExternalLink, Loader2, AlertCircle, RefreshCw, X, Eye } from 'lucide-react';
import { isIOSApp } from '../utils/platform';
import { enterDemoMode } from '../demo/demoStore';

/**
 * Full-screen gate shown when the official build requires a linked account
 * with an active subscription (subscriptionStatus.enforced && !active).
 * Handles both states: not linked yet (device-code pairing) and linked but
 * expired (dashboard deep link + refresh).
 */
export default function SubscriptionGate() {
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const startCloudLink = useAppStore((s) => s.startCloudLink);
  const fetchCloudLinkStatus = useAppStore((s) => s.fetchCloudLinkStatus);
  const refreshCloudSubscription = useAppStore((s) => s.refreshCloudSubscription);

  const [pairing, setPairing] = useState<{ code: string; approveUrl?: string } | null>(null);
  // First step of the flow: "Do you already have a Trenchcord account?".
  // Both answers lead to the same pairing code (the dashboard's approve page
  // handles sign-up too, and the code survives it) — the answer only tailors
  // the instructions around the code.
  const [hasAccount, setHasAccount] = useState<'yes' | 'no' | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // While pairing (or linked-but-inactive), poll so the gate lifts on its own
  // once the user approves the code / pays on the dashboard.
  useEffect(() => {
    pollTimer.current = setInterval(() => {
      void fetchCloudLinkStatus().then((state) => {
        if (state?.state !== 'pending' && pairing) setPairing(null);
        if (state?.state === 'idle' && state.error) setError(state.error);
      });
    }, 4000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [fetchCloudLinkStatus, pairing]);

  const handleStartLink = async (answer: 'yes' | 'no') => {
    setHasAccount(answer);
    setStarting(true);
    setError(null);
    const result = await startCloudLink();
    setStarting(false);
    if (result.success && result.code) {
      // Deliberately no window.open here: yanking the user into a browser
      // mid-flow was jarring — the "Open dashboard" link below does the same
      // thing when they're ready.
      setPairing({ code: result.code, approveUrl: result.approveUrl });
    } else {
      setError(result.error ?? 'Could not reach the account server.');
    }
  };

  const handleCopyCode = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.code);
    } catch {
      // Clipboard API can be unavailable outside secure contexts — fall back.
      const ta = document.createElement('textarea');
      ta.value = pairing.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshCloudSubscription();
    setRefreshing(false);
  };

  const linked = subscriptionStatus?.linked ?? false;
  // No fallback URL on purpose: the backend is the single authority on whether
  // a route to the dashboard exists (backend/src/platform.ts). Since v2 it
  // sends the URL on iOS too — dashboard links open in Safari there; only the
  // in-app payment flow (AccountPanel) stays hidden on the phone.
  const dashboardUrl = subscriptionStatus?.dashboardUrl ?? '';
  const billingHidden = !dashboardUrl;

  return (
    <div className="flex items-center justify-center h-full w-full bg-discord-dark">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-discord-blurple/10 flex items-center justify-center mb-5">
            <BadgeCheck size={32} className="text-discord-blurple" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">
            {linked ? 'Subscription required' : 'Link your Trenchcord account'}
          </h1>
          <p className="text-sm text-gray-400 text-center">
            {linked
              ? billingHidden
                ? 'Subscription expired. This screen unlocks automatically once it is active again.'
                : 'Subscription expired — renew on the dashboard and this screen unlocks automatically.'
              : 'Your Discord and Telegram data never leaves this device.'}
          </p>
        </div>

        {!linked && !pairing && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-white text-center">
              Do you already have a Trenchcord account?
            </p>
            <button
              onClick={() => void handleStartLink('yes')}
              disabled={starting}
              className="w-full flex items-center justify-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {starting && hasAccount === 'yes' ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
              Yes — link this device
            </button>
            <button
              onClick={() => void handleStartLink('no')}
              disabled={starting}
              className="w-full flex items-center justify-center gap-2 border border-gray-700 hover:bg-white/5 text-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {starting && hasAccount === 'no' ? <Loader2 size={16} className="animate-spin" /> : null}
              No — create one
            </button>
          </div>
        )}

        {!linked && pairing && (
          <div className="bg-black/30 rounded-xl p-5 text-center space-y-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              {hasAccount === 'no'
                ? billingHidden
                  ? 'Create your Trenchcord account on your computer, then enter this code there to approve this device:'
                  : 'Create your account on the dashboard — this code approves this device once you’re signed up:'
                : billingHidden
                  ? 'Open your Trenchcord account on your computer and enter this code to approve this device:'
                  : 'Approve this code on the dashboard:'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <p className="font-mono text-2xl tracking-widest text-white">{pairing.code}</p>
              <button
                onClick={() => void handleCopyCode()}
                title="Copy code"
                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
            </div>
            {pairing.approveUrl && (
              <div className="space-y-1.5">
                <a
                  href={pairing.approveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                >
                  <ExternalLink size={16} />
                  {hasAccount === 'no' ? 'Create your account' : 'Open dashboard'}
                </a>
                <p className="text-[11px] text-gray-500">The code fills in automatically.</p>
              </div>
            )}
            <p className="text-xs text-gray-500 flex items-center justify-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Waiting for approval…
            </p>
            {/* A fresh code is issued on every /link/start, so bailing out and
                answering again is harmless. */}
            <button
              onClick={() => setPairing(null)}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {linked && (
          <div className="space-y-3">
            {dashboardUrl && (
              <a
                href={dashboardUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
              >
                <ExternalLink size={16} /> Manage subscription
              </a>
            )}
            <button
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="w-full flex items-center justify-center gap-2 border border-gray-700 hover:bg-white/5 text-gray-300 rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {billingHidden ? 'Check subscription status again' : 'I already paid — check again'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-400">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/*
          App Review reaches this screen with no Discord account, no Telegram
          account and no subscription, so without this there is nothing for a
          reviewer to evaluate. Loads the same sample data as the web demo.
        */}
        {isIOSApp() && (
          <button
            onClick={enterDemoMode}
            className="mt-6 w-full flex items-center justify-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Eye size={14} /> Preview with sample data
          </button>
        )}
      </div>
    </div>
  );
}

const EXPIRY_WARN_MS = 3 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'tc_sub_renew_dismissed';

/**
 * Slim top banner for subscription nudges. Two states:
 * - grace: the period already ended and we're coasting on the offline grace
 *   window — always visible (it's about to gate).
 * - expiring soon: the period ends within 3 days — closable; the dismissal is
 *   remembered per day and per period end, so it comes back tomorrow (or
 *   immediately after the period end changes) until the user renews.
 */
export function SubscriptionGraceBanner() {
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const [dismissed, setDismissed] = useState(false);

  const entitledUntil = subscriptionStatus?.entitledUntil ?? null;
  const msLeft = entitledUntil ? new Date(entitledUntil).getTime() - Date.now() : null;
  const expiringSoon =
    !!subscriptionStatus?.active &&
    !subscriptionStatus.inGrace &&
    msLeft !== null &&
    msLeft > 0 &&
    msLeft <= EXPIRY_WARN_MS;

  const dismissStamp = `${entitledUntil ?? ''}|${new Date().toDateString()}`;

  useEffect(() => {
    if (!expiringSoon) return;
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === dismissStamp);
    } catch {
      setDismissed(false);
    }
  }, [expiringSoon, dismissStamp]);

  if (!subscriptionStatus?.enforced) return null;

  // The backend decides whether a dashboard route exists (backend/src/platform.ts);
  // since v2 it sends the URL on iOS too, so the renew link shows there as well.
  const dashboardUrl = subscriptionStatus.dashboardUrl;
  const renewLink = dashboardUrl ? (
    <a href={dashboardUrl} target="_blank" rel="noreferrer" className="underline font-medium">
      Renew now
    </a>
  ) : null;

  if (subscriptionStatus.inGrace) {
    return (
      <div className="bg-amber-600/90 text-black text-xs text-center py-1 px-3">
        Your subscription has ended — Trenchcord keeps working during a short grace period. {renewLink}
      </div>
    );
  }

  if (expiringSoon && !dismissed) {
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    return (
      <div className="relative bg-discord-blurple/95 text-white text-xs py-1.5 pl-3 pr-9 text-center">
        Your Trenchcord subscription ends {daysLeft <= 1 ? 'in less than a day' : `in ${daysLeft} days`}. {renewLink}
        <button
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, dismissStamp);
            } catch {
              /* private mode etc. — dismiss for this session only */
            }
            setDismissed(true);
          }}
          aria-label="Dismiss renewal reminder"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/20 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return null;
}
