import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { isDemoMode } from '../demo/demoStore';
import AlertModal, { type AlertEditTarget } from './AlertModal';
import AlertSoundSettings from './AlertSoundSettings';
import {
  Plus, Lock, ExternalLink, TrendingUp, Twitter, Send, BellRing, Loader2, X, MessageCircle, Settings, RotateCcw, Volume2, Trash2,
} from 'lucide-react';
import type { PriceAlert, PriceAlertCondition } from '../types';

const primaryBtnCls =
  'flex items-center gap-2 px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors disabled:opacity-50';
const inputCls =
  'w-full bg-discord-dark border border-white/10 rounded px-2.5 py-1.5 text-sm text-discord-text placeholder:text-discord-text-muted/60 focus:outline-none focus:border-discord-blurple/60';
const smallBtnCls =
  'flex items-center gap-1.5 px-2.5 py-1.5 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-xs text-white transition-colors disabled:opacity-50 shrink-0';
const ghostBtnCls =
  'px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px] text-discord-text-muted hover:text-discord-text transition-colors disabled:opacity-50 shrink-0';

function conditionSummary(a: PriceAlert): string {
  const fmt = (v: number) =>
    v >= 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(2)}B`
    : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
    : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K`
    : `${v}`;
  const cond: Record<PriceAlertCondition, string> = {
    goes_over: `goes over $${fmt(a.value)}`,
    goes_under: `goes under $${fmt(a.value)}`,
    percent_up: `+${a.value}%`,
    percent_down: `-${a.value}%`,
  };
  return `${a.target === 'mcap' ? 'mcap ' : ''}${cond[a.condition]}`;
}

function timeAgo(ts: string): string {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StatusBadge({ text, tone }: { text: string; tone: 'muted' | 'yellow' | 'red' | 'green' }) {
  const color =
    tone === 'yellow' ? 'bg-discord-yellow/15 text-discord-yellow'
    : tone === 'red' ? 'bg-discord-red/15 text-discord-red'
    : tone === 'green' ? 'bg-discord-green/15 text-discord-green'
    : 'bg-white/5 text-discord-text-muted';
  return <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${color}`}>{text}</span>;
}

const DISCORD_INVITE = 'https://discord.gg/cDhrRVZ9xg';

/** Pill switch, same shape as the ones in Settings. */
function Switch({ on, onChange, title }: { on: boolean; onChange: (on: boolean) => void; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      onClick={() => onChange(!on)}
      className={`w-9 h-[18px] rounded-full transition-colors relative shrink-0 ${on ? 'bg-discord-green' : 'bg-discord-input'}`}
    >
      <span
        className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
      />
    </button>
  );
}

/**
 * One delivery channel. A channel has to be connected before it can be turned
 * on, so the two states show different controls instead of one disabled
 * checkbox: not connected → the numbered setup steps, connected → a switch.
 */
function ChannelCard({
  icon,
  label,
  connected,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  connected: boolean;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg p-3 space-y-2.5 border ${
        connected ? 'bg-discord-dark/60 border-white/5' : 'bg-discord-dark/30 border-dashed border-white/10'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-white flex-1 truncate">{label}</span>
        {connected ? (
          <>
            <span className={`text-[10px] font-semibold uppercase ${enabled ? 'text-discord-green' : 'text-discord-text-muted'}`}>
              {enabled ? 'on' : 'off'}
            </span>
            <Switch on={enabled} onChange={onToggle} title={enabled ? 'Stop sending alerts here' : 'Send alerts here'} />
          </>
        ) : (
          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white/5 text-discord-text-muted">
            not connected
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SetupStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 w-4 h-4 mt-0.5 rounded-full bg-discord-blurple text-white text-[10px] font-bold flex items-center justify-center">
        {n}
      </span>
      <div className="flex-1 min-w-0 space-y-1.5 text-[11px] text-discord-text-muted">{children}</div>
    </div>
  );
}

/** The action half of a setup step: opens the bot / invite / signup page. */
function StepLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-discord-blurple hover:bg-discord-blurple-hover text-xs text-white transition-colors"
    >
      {children} <ExternalLink size={11} />
    </a>
  );
}

function BotChannel({
  provider,
  botName,
  linked,
  enabled,
  onToggle,
  icon,
  label,
  steps,
}: {
  provider: 'telegram' | 'discord';
  botName: string | null;
  linked: boolean;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  icon: React.ReactNode;
  label: string;
  /** Everything before the code box; the code step is numbered after them. */
  steps: Array<{ text: string; link?: { label: string; href: string } }>;
}) {
  const linkDeliveryBot = useAppStore((s) => s.linkDeliveryBot);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const bot = botName ? `@${botName}` : 'the Trenchcord bot';

  const link = async () => {
    setBusy(true);
    setMsg(null);
    const result = await linkDeliveryBot(provider, code.trim().toUpperCase());
    setBusy(false);
    setFailed(!result.success);
    if (!result.success) setMsg(result.error ?? 'Linking failed.');
    else {
      setCode('');
      // Linking turns the channel on server-side, so the card flips to its
      // connected state on its own — this line just names the chat.
      setMsg(result.username ? `Connected as @${result.username}.` : 'Connected.');
    }
  };

  return (
    <ChannelCard icon={icon} label={label} connected={linked} enabled={enabled} onToggle={onToggle}>
      {linked ? (
        <p className="text-[11px] text-discord-text-muted">
          {enabled
            ? `Alerts are DM'd by ${bot} the moment they fire.`
            : 'Connected, but turned off — flip the switch to get alerts here.'}
        </p>
      ) : (
        <div className="space-y-2">
          {steps.map((step, i) => (
            <SetupStep key={i} n={i + 1}>
              <p>{step.text}</p>
              {step.link && <StepLink href={step.link.href}>{step.link.label}</StepLink>}
            </SetupStep>
          ))}
          <SetupStep n={steps.length + 1}>
            <p>Enter the 6-character code it replies with:</p>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter' && code.trim().length === 6 && !busy) void link(); }}
                placeholder="ABC123"
                maxLength={6}
                className={`${inputCls} font-mono tracking-widest text-xs w-32`}
              />
              <button onClick={() => void link()} disabled={busy || code.trim().length !== 6} className={smallBtnCls}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : 'Connect'}
              </button>
            </div>
          </SetupStep>
        </div>
      )}
      {msg && <p className={`text-[11px] ${failed ? 'text-discord-red' : 'text-discord-text-muted'}`}>{msg}</p>}
    </ChannelCard>
  );
}

function DeliveryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const premiumNotify = useAppStore((s) => s.premiumNotify);
  const premiumBots = useAppStore((s) => s.premiumBots);
  const savePremiumNotify = useAppStore((s) => s.savePremiumNotify);
  const localPushoverKey = useAppStore((s) => s.config?.pushover.userKey ?? '');
  const [pushoverKey, setPushoverKey] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Reuse the key from Settings → Pushover when Alerts has none yet.
      const fromLocal = !premiumNotify?.pushoverUserKey && !!localPushoverKey;
      setPushoverKey(premiumNotify?.pushoverUserKey ?? localPushoverKey);
      setPrefilled(fromLocal);
      setEditingKey(false);
      setMsg(null);
    }
  }, [open, premiumNotify?.pushoverUserKey, localPushoverKey]);

  if (!open) return null;

  const save = async (prefs: {
    pushover_user_key?: string | null;
    pushover_enabled?: boolean;
    telegram_dm?: boolean;
    discord_dm?: boolean;
  }) => {
    setBusy(true);
    setMsg(null);
    const result = await savePremiumNotify(prefs);
    setBusy(false);
    setMsg(result.success ? 'Saved.' : result.error ?? 'Save failed.');
    return result.success;
  };

  const savedKey = premiumNotify?.pushoverUserKey ?? '';
  const keySaved = !!savedKey;
  const pushoverOn = keySaved && (premiumNotify?.pushoverEnabled ?? true);
  const maskedKey = savedKey.length > 10 ? `${savedKey.slice(0, 4)}…${savedKey.slice(-4)}` : savedKey;
  const tgBot = premiumBots?.telegram ?? null;
  const dcBot = premiumBots?.discord ?? null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 pt-[var(--safe-top)] pb-[var(--safe-bottom)] animate-fade-in" onClick={onClose}>
      <div className="bg-discord-sidebar rounded-lg shadow-2xl w-full max-w-md mx-4 animate-pop-in max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
          <h3 className="text-base font-semibold text-white">Alert delivery</h3>
          <button onClick={onClose} className="text-discord-text-muted hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-[11px] text-discord-text-muted">
            Trenchcord Cloud pushes alerts the moment they fire — even with the app closed. Connect a
            channel below, then use its switch to turn delivery on or off. At least one channel has to
            be on before you can create alerts.
          </p>

          {/* Pushover — connected once a key is stored; the switch then turns
              delivery on/off without throwing the key away. */}
          <ChannelCard
            icon={<BellRing size={14} className="text-discord-yellow shrink-0" />}
            label="Pushover"
            connected={keySaved}
            enabled={pushoverOn}
            onToggle={(on) => void save({ pushover_enabled: on })}
          >
            {keySaved && !editingKey ? (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[11px] text-discord-text-muted flex-1 min-w-0">
                  {pushoverOn ? 'Pushed to ' : 'Turned off — flip the switch to push to '}
                  <span className="font-mono text-discord-text">{maskedKey}</span>
                </p>
                <button
                  onClick={() => { setPushoverKey(savedKey); setPrefilled(false); setEditingKey(true); }}
                  className={ghostBtnCls}
                >
                  Change key
                </button>
                <button
                  onClick={() => { setPushoverKey(''); void save({ pushover_user_key: null, pushover_enabled: false }); }}
                  disabled={busy}
                  className={ghostBtnCls}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <SetupStep n={1}>
                  <p>Install the Pushover app on your phone and copy the user key it shows.</p>
                  <StepLink href="https://pushover.net">pushover.net</StepLink>
                </SetupStep>
                <SetupStep n={2}>
                  <p>Paste the user key here:</p>
                  <div className="flex gap-2">
                    <input
                      value={pushoverKey}
                      onChange={(e) => setPushoverKey(e.target.value)}
                      placeholder="Pushover user key (u…)"
                      className={`${inputCls} font-mono text-xs flex-1`}
                    />
                    <button
                      onClick={async () => {
                        const key = pushoverKey.trim();
                        if (!key) return;
                        // Saving a key is what "connects" the channel, so it
                        // turns delivery on too.
                        if (await save({ pushover_user_key: key, pushover_enabled: true })) setEditingKey(false);
                      }}
                      disabled={busy || !pushoverKey.trim()}
                      className={smallBtnCls}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : editingKey ? 'Save' : 'Connect'}
                    </button>
                    {editingKey && (
                      <button onClick={() => setEditingKey(false)} className={ghostBtnCls}>Cancel</button>
                    )}
                  </div>
                  {prefilled && pushoverKey && (
                    <p>Prefilled from Settings → Pushover — hit Connect to use it for Alerts too.</p>
                  )}
                </SetupStep>
              </div>
            )}
          </ChannelCard>

          <BotChannel
            provider="telegram"
            botName={tgBot}
            linked={premiumNotify?.telegramLinked ?? false}
            enabled={premiumNotify?.telegramDm ?? false}
            onToggle={(on) => void save({ telegram_dm: on })}
            icon={<Send size={14} className="text-discord-blurple shrink-0" />}
            label="Telegram DM"
            steps={[
              {
                text: tgBot
                  ? `Open @${tgBot} in Telegram and press Start.`
                  : 'DM the Trenchcord bot on Telegram and send /start.',
                // ?start= makes Telegram open the chat with a Start button
                // even for people who have messaged the bot before.
                link: tgBot ? { label: `Open @${tgBot}`, href: `https://t.me/${tgBot}?start=alerts` } : undefined,
              },
            ]}
          />

          <BotChannel
            provider="discord"
            botName={dcBot}
            linked={premiumNotify?.discordLinked ?? false}
            enabled={premiumNotify?.discordDm ?? false}
            onToggle={(on) => void save({ discord_dm: on })}
            icon={<MessageCircle size={14} className="text-discord-blurple shrink-0" />}
            label="Discord DM"
            steps={[
              {
                text: 'Join the Trenchcord Discord — Discord only lets you DM a bot you share a server with.',
                link: { label: 'Join the Trenchcord Discord', href: DISCORD_INVITE },
              },
              { text: `DM ${dcBot ? `@${dcBot}` : 'the Trenchcord bot'} there and send /start.` },
            ]}
          />

          {msg && <p className="text-xs text-discord-text-muted">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const priceAlerts = useAppStore((s) => s.priceAlerts);
  const tweetAlerts = useAppStore((s) => s.tweetAlerts);
  const telegramTracks = useAppStore((s) => s.telegramTracks);
  const premiumEvents = useAppStore((s) => s.premiumEvents);
  const premiumNotify = useAppStore((s) => s.premiumNotify);
  const alertPrefill = useAppStore((s) => s.alertPrefill);
  const alertCreateOpen = useAppStore((s) => s.alertCreateOpen);
  const setAlertCreateOpen = useAppStore((s) => s.setAlertCreateOpen);
  const fetchPremiumOverview = useAppStore((s) => s.fetchPremiumOverview);
  const fetchPriceAlerts = useAppStore((s) => s.fetchPriceAlerts);
  const fetchTweetAlerts = useAppStore((s) => s.fetchTweetAlerts);
  const fetchTelegramTracks = useAppStore((s) => s.fetchTelegramTracks);
  const updatePriceAlert = useAppStore((s) => s.updatePriceAlert);
  const deletePremiumEvent = useAppStore((s) => s.deletePremiumEvent);
  const clearPremiumEvents = useAppStore((s) => s.clearPremiumEvents);
  const fetchSubscriptionStatus = useAppStore((s) => s.fetchSubscriptionStatus);
  const setActiveView = useAppStore((s) => s.setActiveView);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AlertEditTarget | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);

  const locked = !isDemoMode && !subscriptionStatus?.active;
  const hasDelivery =
    (!!premiumNotify?.pushoverUserKey && (premiumNotify?.pushoverEnabled ?? true)) ||
    !!premiumNotify?.telegramDm ||
    !!premiumNotify?.discordDm;

  // Popout windows (and any fresh renderer) start with no subscription status —
  // fetch it before showing the lock screen instead of assuming "no sub".
  const [subChecked, setSubChecked] = useState(isDemoMode || subscriptionStatus !== null);
  useEffect(() => {
    if (subChecked) return;
    void fetchSubscriptionStatus().finally(() => setSubChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (locked) return;
    fetchPremiumOverview();
    fetchPriceAlerts();
    fetchTweetAlerts();
    fetchTelegramTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  // External open requests: pane-header + button, contract-feed bell (prefill).
  useEffect(() => {
    if (alertCreateOpen || alertPrefill) {
      setAlertCreateOpen(false);
      if (locked) return;
      if (!hasDelivery) setDeliveryOpen(true);
      else setCreateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertCreateOpen, alertPrefill, locked, hasDelivery]);

  const openCreate = () => {
    if (!hasDelivery) {
      setDeliveryOpen(true);
      return;
    }
    setCreateOpen(true);
  };

  if (locked && !subChecked) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-discord-text-muted" />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-discord-sidebar rounded-lg p-5 max-w-md flex items-start gap-3">
          <Lock size={18} className="text-discord-text-muted mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-white font-medium">Alerts require an active subscription</p>
            <p className="text-xs text-discord-text-muted mt-1">
              Cloud-powered price, X, and Telegram alerts that fire even while your PC is off.
              Link this device to your Trenchcord account to get started.
            </p>
            <button onClick={() => setActiveView('settings', 'account')} className={`${primaryBtnCls} mt-3`}>
              <ExternalLink size={14} /> Account settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 sm:p-4 space-y-5">
        {!hasDelivery && premiumNotify !== null && (
          <div className="bg-discord-yellow/10 border border-discord-yellow/30 rounded-lg p-3 flex items-start gap-3">
            <BellRing size={16} className="text-discord-yellow mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-white font-medium">Set up delivery first</p>
              <p className="text-xs text-discord-text-muted mt-0.5">
                Alerts are pushed to your phone the moment they fire — turn on at least one delivery
                channel (Pushover, Telegram, or Discord) before creating alerts.
              </p>
            </div>
            <button onClick={() => setDeliveryOpen(true)} className={primaryBtnCls}>Set up</button>
          </div>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
            <h3 className="text-sm font-semibold text-white">Your alerts</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setSoundOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-discord-sidebar hover:bg-discord-hover/60 border border-white/5 text-xs text-discord-text transition-colors"
              >
                <Volume2 size={13} className="text-discord-text-muted" />
                Sound settings
              </button>
              <button
                onClick={() => setDeliveryOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-discord-sidebar hover:bg-discord-hover/60 border border-white/5 text-xs text-discord-text transition-colors"
              >
                <Settings size={13} className="text-discord-text-muted" />
                Delivery settings
                {premiumNotify !== null && (
                  <span className={`w-1.5 h-1.5 rounded-full ${hasDelivery ? 'bg-discord-green' : 'bg-discord-yellow'}`} />
                )}
              </button>
            </div>
          </div>

          {/* auto-fill sizes by the pane's actual width — viewport breakpoints
              lie inside narrow split panes */}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            {/* Create card */}
            <button
              onClick={openCreate}
              className="min-h-[92px] rounded-lg border-2 border-dashed border-white/10 hover:border-discord-blurple/60 hover:bg-discord-blurple/5 transition-colors flex flex-col items-center justify-center gap-1.5 text-discord-text-muted hover:text-discord-text"
            >
              <Plus size={20} />
              <span className="text-sm font-medium">Create new alert</span>
            </button>

            {(priceAlerts ?? []).map((a) => (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditTarget({ type: 'price', alert: a })}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditTarget({ type: 'price', alert: a }); }}
                className={`min-h-[92px] rounded-lg bg-discord-sidebar hover:bg-discord-hover/40 border border-white/5 transition-colors p-3 text-left flex flex-col gap-1.5 cursor-pointer ${!a.enabled ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-emerald-400 shrink-0" />
                  <span className="text-sm font-medium text-white truncate flex-1">
                    {a.tokenSymbol ?? a.symbol ?? `${a.contractAddress?.slice(0, 6)}…`}
                  </span>
                  {!a.enabled ? <StatusBadge text="paused" tone="muted" />
                    : a.triggered ? <StatusBadge text="fired" tone="yellow" />
                    : <StatusBadge text="active" tone="green" />}
                </div>
                <span className="text-xs text-discord-text-muted truncate">{conditionSummary(a)}</span>
                <div className="flex items-center mt-auto">
                  <span className="text-[10px] text-discord-text-muted/70 uppercase">{a.kind}</span>
                  {a.enabled && a.triggered && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void updatePriceAlert(a.id, { enabled: true }); }}
                      className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-discord-yellow/15 hover:bg-discord-yellow/30 text-[10px] font-semibold text-discord-yellow transition-colors"
                      title="Arm this alert again"
                    >
                      <RotateCcw size={10} /> Reactivate
                    </button>
                  )}
                </div>
              </div>
            ))}

            {(tweetAlerts ?? []).map((a) => (
              <button
                key={a.id}
                onClick={() => setEditTarget({ type: 'tweet', alert: a })}
                className={`min-h-[92px] rounded-lg bg-discord-sidebar hover:bg-discord-hover/40 border border-white/5 transition-colors p-3 text-left flex flex-col gap-1.5 ${!a.enabled ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Twitter size={14} className="text-sky-400 shrink-0" />
                  <span className="text-sm font-medium text-white truncate flex-1">@{a.author}</span>
                  {!a.enabled ? <StatusBadge text="paused" tone="muted" /> : <StatusBadge text="active" tone="green" />}
                </div>
                <span className="text-xs text-discord-text-muted truncate">
                  {a.kind === 'tweet' ? 'any new post'
                    : a.kind === 'keyword' ? a.keywords.join(', ')
                    : a.kind === 'reply' ? `replies to @${a.target}`
                    : a.kind === 'interact' ? `interacts with ${a.target}`
                    : `follows @${a.target}`}
                </span>
                <span className="text-[10px] text-discord-text-muted/70 uppercase mt-auto">X · {a.kind}</span>
              </button>
            ))}

            {(telegramTracks ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => setEditTarget({ type: 'telegram', track: t })}
                className={`min-h-[92px] rounded-lg bg-discord-sidebar hover:bg-discord-hover/40 border border-white/5 transition-colors p-3 text-left flex flex-col gap-1.5 ${!t.enabled ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Send size={14} className="text-discord-blurple shrink-0" />
                  <span className="text-sm font-medium text-white truncate flex-1">@{t.channelUsername}</span>
                  {!t.enabled ? <StatusBadge text="paused" tone="muted" />
                    : t.channelStatus === 'failed' ? <StatusBadge text="unavailable" tone="red" />
                    : t.channelStatus === 'joined' ? <StatusBadge text="active" tone="green" />
                    : <StatusBadge text="joining" tone="muted" />}
                </div>
                <span className="text-xs text-discord-text-muted truncate">
                  {t.keywords.length > 0 ? t.keywords.join(', ') : 'every post'}
                </span>
                <span className="text-[10px] text-discord-text-muted/70 uppercase mt-auto">telegram</span>
              </button>
            ))}
          </div>
        </div>

        {premiumEvents.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Recent alerts</h3>
              <button
                onClick={() => void clearPremiumEvents()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-discord-sidebar hover:bg-discord-hover/60 border border-white/5 text-xs text-discord-text-muted hover:text-discord-text transition-colors"
              >
                <Trash2 size={12} /> Clear all
              </button>
            </div>
            <div className="space-y-1.5">
              {premiumEvents.slice(0, 30).map((e) => (
                <div
                  key={e.id}
                  className={`group flex items-start gap-2.5 px-3 py-2 bg-discord-sidebar rounded-lg ${e.url ? 'cursor-pointer hover:bg-discord-hover/40' : ''}`}
                  onClick={() => { if (e.url) window.open(e.url, '_blank'); }}
                >
                  {e.kind === 'price' ? <TrendingUp size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                    : e.kind === 'tweet' ? <Twitter size={14} className="text-sky-400 mt-0.5 shrink-0" />
                    : <Send size={14} className="text-discord-blurple mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{e.title}</p>
                    <p className="text-xs text-discord-text-muted line-clamp-2 whitespace-pre-line">{e.body}</p>
                  </div>
                  <span className="text-[11px] text-discord-text-muted shrink-0">{timeAgo(e.created_at)}</span>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); void deletePremiumEvent(e.id); }}
                    className="shrink-0 p-0.5 rounded text-discord-text-muted/40 hover:text-discord-red opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove this alert from history"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AlertModal
        open={createOpen || editTarget !== null}
        editing={editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
      />
      <DeliveryModal open={deliveryOpen} onClose={() => setDeliveryOpen(false)} />
      <AlertSoundSettings open={soundOpen} onClose={() => setSoundOpen(false)} />
    </div>
  );
}
