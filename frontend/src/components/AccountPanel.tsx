import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check, Copy, ExternalLink, Laptop, Link2, Loader2, RefreshCw, X,
} from 'lucide-react';
import { backendFetch, useAppStore } from '../stores/appStore';
import { isDemoMode } from '../demo/demoStore';
import { isIOSApp } from '../utils/platform';

/**
 * In-app mirror of the dashboard.trenchcord.app dashboard, shown in
 * Settings → Account & Subscription once the device is linked: extend the
 * subscription (SOL checkout with QR + deposit address), linked devices,
 * connected accounts, and payment history. Everything is proxied through the
 * local backend with the device token (/api/cloud/account/*).
 *
 * Deliberately read-only where a device token shouldn't have power: revoking
 * devices and linking/unlinking Discord/Telegram stay on the dashboard.
 */

interface CloudPlan {
  code: string;
  months: number;
  price_lamports: number;
  /** Present only when this account currently qualifies for the OG discount. */
  discounted_price_lamports?: number;
}

/** OG-role discount status from the cloud API; null when the feature is off. */
interface CloudPlanDiscount {
  eligible: boolean;
  percent: number;
  reason: 'og_role' | 'not_linked' | 'no_role' | 'check_failed';
}

interface CloudIntent {
  id: string;
  plan?: string;
  months?: number;
  amount_lamports: number;
  amount_received_lamports?: number;
  /** What was locked in at intent creation; 0 / null on undiscounted intents. */
  discount_percent?: number;
  list_price_lamports?: number | null;
  deposit_address: string;
  solana_pay_url?: string;
  expires_at: string;
  status?: string;
  credited_at?: string | null;
}

interface CloudHistoryEntry {
  id: string;
  status: string;
  amount_lamports: number;
  created_at: string;
  credited_at: string | null;
  plans: { code: string; months: number } | null;
  payments: { tx_signature: string; block_time: string | null }[] | null;
}

interface CloudSubscriptionInfo {
  active: boolean;
  current_period_end: string | null;
  cluster: 'devnet' | 'mainnet';
  history: CloudHistoryEntry[];
  open_intents: CloudIntent[];
}

interface CloudIdentity {
  provider: string;
  provider_user_id: string;
  username: string | null;
}

interface CloudDevice {
  id: string;
  name: string | null;
  platform: string | null;
  last_seen_at: string | null;
  created_at: string;
}

function formatSol(lamports: number): string {
  return (lamports / 1e9).toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const cardCls = 'bg-discord-sidebar rounded-lg p-4';
const cardTitleCls = 'text-xs font-semibold uppercase tracking-wide text-discord-text-muted mb-3';

// --- Checkout modal ---------------------------------------------------------

function CheckoutModal({
  plan,
  existing,
  cluster,
  onClose,
}: {
  plan: CloudPlan;
  /** Resume an already-open intent instead of creating a new one. */
  existing: CloudIntent | null;
  cluster: string;
  onClose: (credited: boolean) => void;
}) {
  const [intent, setIntent] = useState<CloudIntent | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [received, setReceived] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const createStarted = useRef(false);

  useEffect(() => {
    const apply = async (i: CloudIntent) => {
      setIntent(i);
      setReceived(i.amount_received_lamports ?? 0);
      if (i.solana_pay_url) {
        try { setQr(await QRCode.toDataURL(i.solana_pay_url, { margin: 1, width: 220 })); } catch { /* address stays */ }
      }
    };
    if (existing) { void apply(existing); return; }
    if (createStarted.current) return;
    createStarted.current = true;
    backendFetch('/cloud/account/intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_code: plan.code }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? 'Could not create the payment');
        void apply(data as CloudIntent);
      })
      .catch((err: Error) => setError(err.message));
  }, [plan.code, existing]);

  useEffect(() => {
    if (!intent) return;
    const poll = setInterval(() => {
      backendFetch(`/cloud/account/intents/${encodeURIComponent(intent.id)}`)
        .then(async (r) => {
          if (!r.ok) return;
          const s = (await r.json()) as CloudIntent;
          setStatus(s.status ?? 'pending');
          setReceived(s.amount_received_lamports ?? 0);
        })
        .catch(() => undefined);
    }, 5000);
    const countdown = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(intent.expires_at).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => { clearInterval(poll); clearInterval(countdown); };
  }, [intent]);

  const checkNow = async () => {
    if (!intent || checking) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const r = await backendFetch(`/cloud/account/intents/${encodeURIComponent(intent.id)}/check`, { method: 'POST' });
      const s = (await r.json()) as CloudIntent & { error?: string };
      if (!r.ok) throw new Error(s.error ?? 'Check failed — try again in a moment.');
      setStatus(s.status ?? 'pending');
      setReceived(s.amount_received_lamports ?? 0);
      if ((s.status === 'pending' || s.status === 'expired') && !(s.amount_received_lamports ?? 0)) {
        setCheckResult('No payment found yet — transfers can take up to a minute to finalize.');
      }
    } catch (err) {
      setCheckResult(err instanceof Error ? err.message : 'Check failed — try again in a moment.');
    } finally {
      setChecking(false);
    }
  };

  const copyAddress = async () => {
    if (!intent) return;
    try { await navigator.clipboard.writeText(intent.deposit_address); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const credited = status === 'credited';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => onClose(credited)}>
      <div
        className="bg-discord-sidebar rounded-lg shadow-2xl w-full max-w-sm animate-pop-in max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white">
            {/* Prefer the intent's amount — it's what the payment actually
                requires; the plan price is only the pre-intent estimate. */}
            {plan.months} month{plan.months > 1 ? 's' : ''} ·{' '}
            <span className="text-emerald-400">
              {formatSol(intent?.amount_lamports ?? plan.discounted_price_lamports ?? plan.price_lamports)} SOL
            </span>
          </h3>
          <button onClick={() => onClose(credited)} className="text-discord-text-muted hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && <p className="text-sm text-discord-red">{error}</p>}
          {!intent && !error && (
            <p className="text-sm text-discord-text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Creating payment…</p>
          )}

          {intent && credited && (
            <div className="text-center space-y-3 py-2">
              <p className="text-3xl">✅</p>
              <p className="text-sm font-medium text-discord-green">Payment confirmed — subscription extended!</p>
              <button
                onClick={() => onClose(true)}
                className="w-full px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {intent && !credited && (
            <>
              {qr && (
                <div className="flex justify-center">
                  <img src={qr} alt="Solana Pay QR" className="rounded-lg bg-white p-1.5" />
                </div>
              )}
              <div className="text-center">
                <p className="text-xl font-bold text-emerald-400">{formatSol(intent.amount_lamports)} SOL</p>
                {(intent.discount_percent ?? 0) > 0 && intent.list_price_lamports != null && (
                  <p className="text-[11px] text-discord-yellow mt-0.5">
                    OG discount −{intent.discount_percent}% · was {formatSol(intent.list_price_lamports)} SOL
                  </p>
                )}
                {plan.discounted_price_lamports != null &&
                  (intent.discount_percent ?? 0) === 0 &&
                  intent.amount_lamports > plan.discounted_price_lamports &&
                  received === 0 && (
                    <p className="text-[11px] text-discord-text-muted mt-0.5">
                      Your OG discount could not be applied — this payment is at the regular price.
                    </p>
                  )}
                <p className="text-[11px] text-discord-text-muted mt-0.5">
                  payment window{' '}
                  {secondsLeft !== null ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` : '…'}
                </p>
              </div>
              <div className="rounded bg-discord-dark/60 border border-white/5 p-2.5">
                <p className="text-[11px] text-discord-text-muted mb-1">
                  Send exactly {formatSol(intent.amount_lamports)} SOL to your personal deposit address:
                </p>
                <button
                  onClick={() => void copyAddress()}
                  className="w-full flex items-start gap-1.5 text-left font-mono text-[11px] text-discord-text hover:text-white transition-colors break-all"
                  title="Click to copy"
                >
                  <span className="break-all">{intent.deposit_address}</span>
                  {copied ? <Check size={12} className="text-discord-green shrink-0 mt-0.5" /> : <Copy size={12} className="shrink-0 mt-0.5" />}
                </button>
              </div>
              <button
                onClick={() => void checkNow()}
                disabled={checking}
                className="w-full px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors disabled:opacity-50"
              >
                {checking ? 'Checking…' : "I've paid — check now"}
              </button>
              {checkResult && <p className="text-center text-[11px] text-discord-text-muted">{checkResult}</p>}
              <p className="text-center text-[11px] text-discord-text-muted">
                Unique to this payment — send from any wallet or exchange ({cluster === 'devnet' ? 'devnet' : 'Solana mainnet'})
                and it's credited automatically. Sending from an exchange? Account for its withdrawal fee so the full amount arrives.
              </p>
              {received > 0 && received < intent.amount_lamports && (
                <p className="rounded border border-discord-yellow/30 bg-discord-yellow/10 p-2.5 text-center text-xs text-discord-yellow">
                  Received {formatSol(received)} SOL so far — send{' '}
                  <span className="font-semibold">{formatSol(intent.amount_lamports - received)} SOL</span> more to the same address.
                </p>
              )}
              <p className="text-center text-xs text-discord-text-muted">
                {status === 'pending' && (received > 0 ? 'Waiting for the remaining amount…' : 'Waiting for payment…')}
                {status === 'detected' && '🔎 Payment detected — confirming…'}
                {status === 'expired' && '⏱ Window expired — late payments are still detected for 24 hours.'}
                {status === 'underpaid' && '⚠️ Expired with a partial payment — completing the amount still credits automatically.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Panel ------------------------------------------------------------------

export default function AccountPanel() {
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const refreshCloudSubscription = useAppStore((s) => s.refreshCloudSubscription);

  const [identities, setIdentities] = useState<CloudIdentity[] | null>(null);
  const [sub, setSub] = useState<CloudSubscriptionInfo | null>(null);
  const [devices, setDevices] = useState<CloudDevice[] | null>(null);
  const [plans, setPlans] = useState<CloudPlan[]>([]);
  const [ogDiscount, setOgDiscount] = useState<CloudPlanDiscount | null>(null);
  const [checkout, setCheckout] = useState<{ plan: CloudPlan; existing: CloudIntent | null } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const billingHidden = isIOSApp();
  const dashboardUrl = subscriptionStatus?.dashboardUrl || null;

  const refresh = useCallback(() => {
    void backendFetch('/cloud/account/me')
      .then(async (r) => (r.ok ? setIdentities(((await r.json()) as { identities: CloudIdentity[] }).identities ?? []) : null))
      .catch(() => undefined);
    void backendFetch('/cloud/account/subscription')
      .then(async (r) => (r.ok ? setSub((await r.json()) as CloudSubscriptionInfo) : null))
      .catch(() => undefined);
    void backendFetch('/cloud/account/devices')
      .then(async (r) => (r.ok ? setDevices(((await r.json()) as { devices: CloudDevice[] }).devices ?? []) : null))
      .catch(() => undefined);
    // Plans carry per-account OG-discount pricing, and linking Discord on the
    // dashboard flips eligibility — so refetch alongside everything else
    // (the Refresh button is the only in-app way to pick that up).
    if (!billingHidden) {
      void backendFetch('/cloud/account/plans')
        .then(async (r) => {
          if (!r.ok) return;
          const data = (await r.json()) as { plans: CloudPlan[]; discount?: CloudPlanDiscount | null };
          setPlans(data.plans ?? []);
          setOgDiscount(data.discount ?? null);
        })
        .catch(() => undefined);
    }
  }, [billingHidden]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cancelIntent = async (id: string) => {
    setCancelling(id);
    try {
      await backendFetch(`/cloud/account/intents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch { /* refresh shows reality either way */ }
    setCancelling(null);
    refresh();
  };

  const closeCheckout = (credited: boolean) => {
    setCheckout(null);
    refresh();
    // A credited payment changes the entitlement — pull the new period end
    // into the local cache immediately instead of waiting for the next check.
    if (credited) void refreshCloudSubscription();
  };

  if (isDemoMode) return null;

  const openIntents = sub?.open_intents ?? [];
  const history = (sub?.history ?? []).filter((h) => h.status === 'credited' || h.status === 'underpaid');
  const cluster = sub?.cluster ?? 'mainnet';

  const resumePlan = (i: CloudIntent): CloudPlan => ({
    code: i.plan ?? '?',
    months: i.months ?? 0,
    price_lamports: i.amount_lamports,
  });

  return (
    <div className="space-y-3 mt-4">
      {/* Open payments */}
      {!billingHidden && openIntents.length > 0 && (
        <div className={cardCls}>
          <h4 className={cardTitleCls}>Open payments</h4>
          <div className="space-y-2">
            {openIntents.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 rounded bg-discord-dark/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    {i.months} month{(i.months ?? 0) > 1 ? 's' : ''} · <span className="text-emerald-400">{formatSol(i.amount_lamports)} SOL</span>
                    {(i.discount_percent ?? 0) > 0 && <span className="text-discord-yellow"> · OG -{i.discount_percent}%</span>}
                  </p>
                  <p className="text-[11px] text-discord-text-muted">
                    {(i.amount_received_lamports ?? 0) > 0 && (
                      <span className="text-discord-yellow">
                        {formatSol(i.amount_received_lamports ?? 0)} / {formatSol(i.amount_lamports)} SOL received ·{' '}
                      </span>
                    )}
                    expires in {Math.max(0, Math.ceil((new Date(i.expires_at).getTime() - Date.now()) / 60_000))} min
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setCheckout({ plan: resumePlan(i), existing: i })}
                    className="px-2.5 py-1.5 rounded bg-discord-blurple hover:bg-discord-blurple-hover text-xs text-white transition-colors"
                  >
                    Pay
                  </button>
                  <button
                    onClick={() => void cancelIntent(i.id)}
                    disabled={cancelling === i.id}
                    className="px-2.5 py-1.5 rounded bg-discord-dark hover:bg-discord-red/20 text-xs text-discord-red transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plans */}
      {!billingHidden && plans.length > 0 && (
        <div className={cardCls}>
          <h4 className={cardTitleCls}>{sub?.active ? 'Extend your subscription' : 'Choose a plan'}</h4>
          {ogDiscount?.eligible && (
            <p className="mb-3 inline-block rounded bg-discord-yellow/15 px-2 py-1 text-[11px] font-semibold text-discord-yellow">
              OG holder · {ogDiscount.percent}% off every plan
            </p>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {plans.map((plan) => {
              // The BEST DEAL badge compares list prices; a uniform OG discount
              // preserves the ratio, so it stays honest without adjustment.
              const monthly = plan.price_lamports / plan.months;
              const base = plans.find((p) => p.months === 1)?.price_lamports;
              const multiDiscount = base ? Math.round((1 - monthly / base) * 100) : 0;
              // Only headline big discounts — the yearly plan is the deal we market.
              const bestDeal = multiDiscount >= 10;
              const effectiveMonthly = (plan.discounted_price_lamports ?? plan.price_lamports) / plan.months;
              return (
                <button
                  key={plan.code}
                  onClick={() => setCheckout({ plan, existing: null })}
                  className={`relative rounded-lg border p-3 text-left transition-colors bg-discord-dark/60 ${
                    bestDeal ? 'border-emerald-400/50 hover:border-emerald-400' : 'border-white/10 hover:border-discord-blurple/60'
                  }`}
                >
                  {bestDeal && (
                    <span className="absolute -top-2 right-2 rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold text-black">
                      BEST DEAL · {multiDiscount}% OFF
                    </span>
                  )}
                  <p className="text-sm font-semibold text-white">{plan.months} month{plan.months > 1 ? 's' : ''}</p>
                  <p className="mt-0.5 text-lg font-bold text-emerald-400">
                    {plan.discounted_price_lamports != null && (
                      <span className="mr-1.5 text-sm font-medium text-discord-text-muted line-through">
                        {formatSol(plan.price_lamports)}
                      </span>
                    )}
                    {formatSol(plan.discounted_price_lamports ?? plan.price_lamports)} SOL
                  </p>
                  <p className="mt-0.5 text-[11px] text-discord-text-muted">
                    {plan.months > 1 ? `≈ ${(effectiveMonthly / 1e9).toFixed(2)} SOL / month · one-time` : 'one-time payment'}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-[11px] text-discord-text-muted">
            Payments are made on Solana{cluster === 'devnet' ? ' devnet' : ''}. Buying while active extends your
            current period. No automated refunds.
          </p>
          {ogDiscount?.reason === 'not_linked' && (
            <p className="mt-1.5 text-[11px] text-discord-yellow">
              Hold the OG role on our Discord?{' '}
              {dashboardUrl ? (
                <a href={dashboardUrl} target="_blank" rel="noreferrer" className="underline hover:text-white">
                  Link Discord on the dashboard
                </a>
              ) : (
                'Link Discord on the dashboard'
              )}{' '}
              to unlock your {ogDiscount.percent}% discount.
            </p>
          )}
        </div>
      )}

      {/* Linked devices */}
      <div className={cardCls}>
        <h4 className={cardTitleCls}>Linked devices</h4>
        {devices === null && <p className="text-xs text-discord-text-muted">Loading…</p>}
        {devices !== null && devices.length === 0 && (
          <p className="text-xs text-discord-text-muted">No devices linked.</p>
        )}
        <div className="space-y-1.5">
          {(devices ?? []).map((d) => (
            <div key={d.id} className="flex items-center gap-2.5 rounded bg-discord-dark/60 px-3 py-2">
              <Laptop size={15} className="text-discord-text-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{d.name || `Trenchcord${d.platform ? ` · ${d.platform}` : ''}`}</p>
                <p className="text-[11px] text-discord-text-muted">
                  linked {formatDate(d.created_at)} · last seen {d.last_seen_at ? formatDate(d.last_seen_at) : 'never'}
                </p>
              </div>
            </div>
          ))}
        </div>
        {dashboardUrl && (
          <p className="mt-2 text-[11px] text-discord-text-muted">
            To revoke a device, use the{' '}
            <a href={dashboardUrl} target="_blank" rel="noreferrer" className="text-discord-blurple hover:underline">dashboard</a>.
          </p>
        )}
      </div>

      {/* Connected accounts (read-only) */}
      <div className={cardCls}>
        <h4 className={cardTitleCls}>Connected accounts</h4>
        {identities === null && <p className="text-xs text-discord-text-muted">Loading…</p>}
        <div className="space-y-1.5">
          {(identities ?? []).map((i) => (
            <div key={`${i.provider}-${i.provider_user_id}`} className="flex items-center justify-between gap-2 rounded bg-discord-dark/60 px-3 py-2">
              <span className="text-sm text-white capitalize flex items-center gap-2">
                <Link2 size={13} className="text-discord-text-muted" /> {i.provider}
              </span>
              <span className="text-xs text-discord-text-muted truncate">{i.username ?? i.provider_user_id}</span>
            </div>
          ))}
        </div>
        {dashboardUrl && (
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-discord-dark hover:bg-discord-hover/60 border border-white/5 text-xs text-discord-text transition-colors"
          >
            <ExternalLink size={12} /> Link or manage accounts on the dashboard
          </a>
        )}
      </div>

      {/* Payment history */}
      <div className={cardCls}>
        <h4 className={cardTitleCls}>Payment history</h4>
        {sub === null && <p className="text-xs text-discord-text-muted">Loading…</p>}
        {sub !== null && history.length === 0 && <p className="text-xs text-discord-text-muted">No payments yet.</p>}
        <div className="space-y-1">
          {history.map((h) => {
            const txs = (h.payments ?? []).filter((p) => !p.tx_signature.startsWith('deposit-'));
            return (
              <div key={h.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 odd:bg-discord-dark/40 text-sm">
                <span className="text-discord-text min-w-0">
                  {h.plans?.months ?? '?'} mo · {(h.amount_lamports / 1e9).toFixed(4)} SOL
                  {txs.map((p) => (
                    <a
                      key={p.tx_signature}
                      href={`https://solscan.io/tx/${p.tx_signature}${cluster === 'devnet' ? '?cluster=devnet' : ''}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 font-mono text-[11px] text-discord-text-muted underline hover:text-white"
                      title={p.tx_signature}
                    >
                      {p.tx_signature.slice(0, 4)}…{p.tx_signature.slice(-4)} ↗
                    </a>
                  ))}
                </span>
                <span className={`text-xs shrink-0 ${h.status === 'credited' ? 'text-discord-green' : 'text-discord-yellow'}`}>
                  {h.status} · {formatDate(h.credited_at ?? h.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={refresh}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-discord-sidebar hover:bg-discord-hover/60 border border-white/5 text-xs text-discord-text-muted hover:text-discord-text transition-colors"
      >
        <RefreshCw size={12} /> Refresh
      </button>

      {checkout && (
        <CheckoutModal
          plan={checkout.plan}
          existing={checkout.existing}
          cluster={cluster}
          onClose={closeCheckout}
        />
      )}
    </div>
  );
}
