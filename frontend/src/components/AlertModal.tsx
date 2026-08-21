import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import {
  X, Trash2, Loader2, Plus, Pause, Play, TrendingUp, Twitter, Send,
  ChevronLeft, ChevronRight, Coins, Rocket, LineChart, Gem, RotateCcw, Volume2,
} from 'lucide-react';
import type {
  PriceAlert, TweetAlert, TelegramTrack,
  PriceAlertKind, PriceAlertCondition, TweetAlertKind, TweetAlertSubType,
  PushoverProfile,
} from '../types';
import { DEFAULT_PUSHOVER_PROFILES, PUSHOVER_PRIORITIES } from '../utils/pushoverOptions';
import { SoundChips } from './AlertSoundSettings';

export type AlertEditTarget =
  | { type: 'price'; alert: PriceAlert }
  | { type: 'tweet'; alert: TweetAlert }
  | { type: 'telegram'; track: TelegramTrack };

const CHAINS: { id: string; label: string }[] = [
  { id: 'sol', label: 'Solana' },
  { id: 'eth', label: 'Ethereum' },
  { id: 'bsc', label: 'BSC' },
  { id: 'base', label: 'Base' },
  { id: 'robinhood', label: 'Robinhood' },
  { id: 'monad', label: 'Monad' },
  { id: 'tron', label: 'Tron' },
];

const METALS: { id: string; label: string }[] = [
  { id: 'gold', label: 'Gold' },
  { id: 'silver', label: 'Silver' },
  { id: 'platinum', label: 'Platinum' },
  { id: 'palladium', label: 'Palladium' },
  { id: 'copper', label: 'Copper' },
];

const CONDITIONS: { id: PriceAlertCondition; label: string }[] = [
  { id: 'goes_over', label: 'Goes over' },
  { id: 'goes_under', label: 'Goes under' },
  { id: 'percent_up', label: '% up' },
  { id: 'percent_down', label: '% down' },
];

const PRICE_KINDS: { id: PriceAlertKind; label: string; desc: string; icon: typeof Coins }[] = [
  { id: 'cex', label: 'Crypto (CEX)', desc: 'BTC, SOL, ETH… by price', icon: Coins },
  { id: 'dex', label: 'DEX token', desc: 'Any contract, by market cap', icon: Rocket },
  { id: 'stock', label: 'Stock', desc: 'AAPL, TSLA, NVDA…', icon: LineChart },
  { id: 'metal', label: 'Metal', desc: 'Gold, silver, platinum…', icon: Gem },
];

const TWEET_KINDS: { id: TweetAlertKind; label: string; hint: string }[] = [
  { id: 'tweet', label: 'New post', hint: 'Alert whenever this account posts' },
  { id: 'keyword', label: 'Keyword', hint: 'Alert when a post contains one of your keywords' },
  { id: 'reply', label: 'Reply', hint: 'Alert when this account replies to another account' },
  { id: 'interact', label: 'Interaction', hint: 'Alert when this account replies to / quotes / retweets a specific post' },
  { id: 'follow', label: 'New follow', hint: 'Alert when this account follows another account' },
];

const SUB_TYPES: { id: TweetAlertSubType; label: string }[] = [
  { id: 'any', label: 'Any post' },
  { id: 'tweet', label: 'Original posts' },
  { id: 'reply', label: 'Replies' },
  { id: 'quote', label: 'Quotes' },
  { id: 'retweet', label: 'Retweets' },
];

const URGENCIES: { id: 'normal' | 'critical'; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'critical', label: 'Critical' },
];

const inputCls =
  'w-full bg-discord-dark border border-white/10 rounded px-2.5 py-1.5 text-sm text-discord-text placeholder:text-discord-text-muted/60 focus:outline-none focus:border-discord-blurple/60';
const primaryBtnCls =
  'flex items-center gap-2 px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors disabled:opacity-50';
const subtleBtnCls =
  'flex items-center gap-2 px-3 py-2 bg-discord-dark hover:bg-white/5 rounded text-sm text-discord-text transition-colors disabled:opacity-50';
const choiceCardCls =
  'w-full flex items-center gap-3 px-4 py-3 bg-discord-dark hover:bg-white/5 border border-white/5 hover:border-discord-blurple/50 rounded-lg text-left transition-colors group';

/** Pill-button row — the app's replacement for dropdowns in this modal. */
function Chips({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-60 ${
            value === o.id
              ? 'bg-discord-blurple text-white'
              : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Accepts "94.2k" / "5m" / "1.2b" shorthand. */
function parseValue(raw: string): number | null {
  const cleaned = raw.replace(/[$,%\s]/g, '').toLowerCase();
  const match = cleaned.match(/^(\d+\.?\d*)([kmb])?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return null;
  const mult = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : match[2] === 'b' ? 1_000_000_000 : 1;
  return num * mult;
}

const parseKeywords = (raw: string): string[] =>
  raw.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 20);

/** "5 000 000" — space-grouped, so shorthand like "5m" is easy to sanity-check. */
const formatParsedValue = (n: number): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: 8 }).replace(/,/g, ' ');

function formatQuotePrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

function formatQuoteMcap(mcap: number): string {
  if (mcap >= 1_000_000_000) return `$${(mcap / 1_000_000_000).toFixed(2)}B`;
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(2)}K`;
  return `$${mcap.toFixed(2)}`;
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

interface Quote {
  symbol: string;
  name: string | null;
  price: number;
  mcap: number | null;
}

type Category = 'price' | 'tweet' | 'telegram';
// category → (price/tweet only) kind → form. Edit mode jumps straight to 'form'.
type Step = 'category' | 'kind' | 'form';

export default function AlertModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: AlertEditTarget | null;
  onClose: () => void;
}) {
  const alertPrefill = useAppStore((s) => s.alertPrefill);
  const setAlertPrefill = useAppStore((s) => s.setAlertPrefill);
  const createPriceAlert = useAppStore((s) => s.createPriceAlert);
  const updatePriceAlert = useAppStore((s) => s.updatePriceAlert);
  const deletePriceAlert = useAppStore((s) => s.deletePriceAlert);
  const createTweetAlert = useAppStore((s) => s.createTweetAlert);
  const updateTweetAlert = useAppStore((s) => s.updateTweetAlert);
  const deleteTweetAlert = useAppStore((s) => s.deleteTweetAlert);
  const createTelegramTrack = useAppStore((s) => s.createTelegramTrack);
  const updateTelegramTrack = useAppStore((s) => s.updateTelegramTrack);
  const deleteTelegramTrack = useAppStore((s) => s.deleteTelegramTrack);

  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<Category>('price');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // price fields
  const [priceKind, setPriceKind] = useState<PriceAlertKind>('cex');
  const [priceSymbol, setPriceSymbol] = useState('');
  const [priceChain, setPriceChain] = useState('sol');
  const [priceContract, setPriceContract] = useState('');
  const [priceCondition, setPriceCondition] = useState<PriceAlertCondition>('goes_over');
  const [priceValue, setPriceValue] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'critical'>('normal');

  // tweet fields
  const [tweetKind, setTweetKind] = useState<TweetAlertKind>('tweet');
  const [tweetAuthor, setTweetAuthor] = useState('');
  const [tweetSubType, setTweetSubType] = useState<TweetAlertSubType>('any');
  const [tweetTarget, setTweetTarget] = useState('');

  // shared keyword field (tweet keyword kind + telegram)
  const [keywords, setKeywords] = useState('');
  const [keywordPreview, setKeywordPreview] = useState<string[]>([]);

  // telegram fields
  const [tgChannel, setTgChannel] = useState('');

  // per-alert Pushover override (price + tweet alerts)
  const premiumNotify = useAppStore((s) => s.premiumNotify);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [ovPriority, setOvPriority] = useState(0);
  const [ovSound, setOvSound] = useState('pushover');
  const [ovRetryStr, setOvRetryStr] = useState('60');
  const [ovExpireStr, setOvExpireStr] = useState('3600');

  const seedOverride = (from?: PushoverProfile | null, forUrgency?: 'normal' | 'critical') => {
    const profile =
      from
      ?? premiumNotify?.pushoverProfiles?.[forUrgency ?? urgency]
      ?? DEFAULT_PUSHOVER_PROFILES[forUrgency ?? urgency];
    setOvPriority(profile.priority);
    setOvSound(profile.sound);
    setOvRetryStr(String(profile.retry ?? DEFAULT_PUSHOVER_PROFILES.critical.retry));
    setOvExpireStr(String(profile.expire ?? DEFAULT_PUSHOVER_PROFILES.critical.expire));
  };

  /** Validated override payload, or null after setting an error message. */
  const buildOverride = (): PushoverProfile | null => {
    const profile: PushoverProfile = { priority: ovPriority, sound: ovSound };
    if (ovPriority === 2) {
      const retry = parseInt(ovRetryStr, 10);
      const expire = parseInt(ovExpireStr, 10);
      if (!Number.isInteger(retry) || retry < 30 || retry > 10_800) {
        setError('Emergency repeat must be 30–10800 seconds.');
        return null;
      }
      if (!Number.isInteger(expire) || expire < 30 || expire > 10_800) {
        setError('Emergency expire must be 30–10800 seconds.');
        return null;
      }
      profile.retry = retry;
      profile.expire = expire;
    }
    return profile;
  };

  // Debounced badge preview so the comma-separated input is easy to verify.
  useEffect(() => {
    const timer = setTimeout(() => setKeywordPreview(parseKeywords(keywords)), 300);
    return () => clearTimeout(timer);
  }, [keywords]);

  // live quote preview for price alerts
  const fetchAlertQuote = useAppStore((s) => s.fetchAlertQuote);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteSeq = useRef(0);

  // Fetch a preview as soon as the asset input looks complete (debounced —
  // quotes cost upstream API credits).
  useEffect(() => {
    if (!open || editing || category !== 'price') return;
    setQuote(null);
    setQuoteError(null);

    let params: Record<string, string> | null = null;
    if (priceKind === 'dex') {
      const address = priceContract.trim();
      const addrOk =
        priceChain === 'sol' ? SOL_ADDRESS_RE.test(address)
        : priceChain === 'tron' ? TRON_ADDRESS_RE.test(address)
        : EVM_ADDRESS_RE.test(address);
      if (addrOk) params = { kind: 'dex', chain: priceChain, contract_address: address };
    } else if (priceKind === 'metal') {
      if (priceSymbol) params = { kind: 'metal', symbol: priceSymbol };
    } else {
      const symbol = priceSymbol.trim();
      if (symbol.length >= 2) params = { kind: priceKind, symbol };
    }
    if (!params) return;

    const seq = ++quoteSeq.current;
    setQuoteLoading(true);
    const timer = setTimeout(async () => {
      const result = await fetchAlertQuote(params!);
      if (seq !== quoteSeq.current) return; // stale response
      setQuoteLoading(false);
      if (result && 'error' in result) {
        setQuoteError(result.error);
      } else if (result) {
        setQuote(result);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      if (seq === quoteSeq.current) setQuoteLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, category, priceKind, priceChain, priceContract, priceSymbol]);

  // Reset per open; consume the contract-feed prefill in create mode.
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError(null);
    if (editing) {
      setStep('form');
      setCategory(editing.type);
      if (editing.type === 'price') {
        const a = editing.alert;
        setPriceKind(a.kind);
        setPriceCondition(a.condition);
        setPriceValue(String(a.value));
        setUrgency(a.urgency);
        setOverrideOpen(!!a.pushoverOverride);
        seedOverride(a.pushoverOverride, a.urgency);
      } else if (editing.type === 'tweet') {
        setUrgency(editing.alert.urgency);
        setOverrideOpen(!!editing.alert.pushoverOverride);
        seedOverride(editing.alert.pushoverOverride, editing.alert.urgency);
      } else {
        setKeywords(editing.track.keywords.join(', '));
      }
      return;
    }
    setOverrideOpen(false);
    setStep('category');
    setCategory('price');
    setPriceKind('cex');
    setPriceSymbol('');
    setPriceContract('');
    setPriceValue('');
    setPriceCondition('goes_over');
    setUrgency('normal');
    setTweetKind('tweet');
    setTweetAuthor('');
    setTweetSubType('any');
    setTweetTarget('');
    setKeywords('');
    setTgChannel('');
    if (alertPrefill) {
      // Coming from the Contract feed: the choice is already made, skip the wizard.
      setCategory('price');
      setPriceKind('dex');
      setStep('form');
      if (alertPrefill.chain) setPriceChain(alertPrefill.chain);
      if (alertPrefill.contract) setPriceContract(alertPrefill.contract);
      setAlertPrefill(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }
    onClose();
  };

  const pickCategory = (id: Category) => {
    setCategory(id);
    setError(null);
    // Telegram has no sub-type to pick — go straight to the form.
    setStep(id === 'telegram' ? 'form' : 'kind');
  };

  const goBack = () => {
    setError(null);
    if (step === 'form') setStep(category === 'telegram' ? 'category' : 'kind');
    else setStep('category');
  };

  const submitCreate = () => {
    if (category === 'price') {
      const value = parseValue(priceValue);
      if (value === null || value <= 0) {
        setError('Enter a positive number for the target value.');
        return;
      }
      const input: Record<string, unknown> = {
        kind: priceKind,
        condition: priceCondition,
        target: priceKind === 'dex' ? 'mcap' : 'price',
        value,
        urgency,
      };
      if (priceKind === 'dex') {
        input.chain = priceChain;
        input.contract_address = priceContract.trim();
      } else {
        input.symbol = priceSymbol.trim();
      }
      if (overrideOpen) {
        const override = buildOverride();
        if (!override) return;
        input.pushover_override = override;
      }
      void run(() => createPriceAlert(input));
    } else if (category === 'tweet') {
      const input: Record<string, unknown> = { kind: tweetKind, author: tweetAuthor.trim(), urgency };
      if (tweetKind === 'tweet' || tweetKind === 'keyword' || tweetKind === 'interact') input.sub_type = tweetSubType;
      if (tweetKind === 'reply' || tweetKind === 'follow' || tweetKind === 'interact') input.target = tweetTarget.trim();
      if (tweetKind === 'keyword') {
        const kws = parseKeywords(keywords);
        if (kws.length === 0) {
          setError('Add at least one keyword (comma-separated).');
          return;
        }
        input.keywords = kws;
      }
      if (!input.author) {
        setError('Enter the X handle to watch.');
        return;
      }
      if (overrideOpen) {
        const override = buildOverride();
        if (!override) return;
        input.pushover_override = override;
      }
      void run(() => createTweetAlert(input));
    } else {
      if (!tgChannel.trim()) {
        setError('Enter a public channel name.');
        return;
      }
      void run(() => createTelegramTrack({ channel: tgChannel.trim(), keywords: parseKeywords(keywords) }));
    }
  };

  const submitEdit = () => {
    if (!editing) return;
    if (editing.type === 'price') {
      const value = parseValue(priceValue);
      if (value === null || value <= 0) {
        setError('Enter a positive number for the target value.');
        return;
      }
      const patch: Record<string, unknown> = { urgency };
      if (value !== editing.alert.value) patch.value = value;
      if (priceCondition !== editing.alert.condition) patch.condition = priceCondition;
      if (overrideOpen) {
        const override = buildOverride();
        if (!override) return;
        patch.pushover_override = override;
      } else {
        patch.pushover_override = null;
      }
      void run(() => updatePriceAlert(editing.alert.id, patch));
    } else if (editing.type === 'tweet') {
      const patch: Record<string, unknown> = { urgency };
      if (overrideOpen) {
        const override = buildOverride();
        if (!override) return;
        patch.pushover_override = override;
      } else {
        patch.pushover_override = null;
      }
      void run(() => updateTweetAlert(editing.alert.id, patch));
    } else {
      void run(() => updateTelegramTrack(editing.track.id, { keywords: parseKeywords(keywords) }));
    }
  };

  const togglePause = () => {
    if (!editing) return;
    if (editing.type === 'price') {
      void run(() => updatePriceAlert(editing.alert.id, { enabled: !editing.alert.enabled }));
    } else if (editing.type === 'tweet') {
      void run(() => updateTweetAlert(editing.alert.id, { enabled: !editing.alert.enabled }));
    } else {
      void run(() => updateTelegramTrack(editing.track.id, { enabled: !editing.track.enabled }));
    }
  };

  const remove = () => {
    if (!editing) return;
    if (editing.type === 'price') void run(() => deletePriceAlert(editing.alert.id));
    else if (editing.type === 'tweet') void run(() => deleteTweetAlert(editing.alert.id));
    else void run(() => deleteTelegramTrack(editing.track.id));
  };

  const paused = editing
    ? editing.type === 'telegram'
      ? !editing.track.enabled
      : !editing.alert.enabled
    : false;

  const narrowInputCls =
    'bg-discord-dark border border-white/10 rounded px-2 py-1 text-sm text-discord-text text-center focus:outline-none focus:border-discord-blurple/60';

  // Pushover-only per-alert tuning, shared by the price and X forms.
  const overrideEditor = (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => { if (!overrideOpen) seedOverride(); setOverrideOpen(!overrideOpen); setError(null); }}
        className="flex items-center gap-1.5 text-[11px] text-discord-text-muted hover:text-discord-text transition-colors"
      >
        <Volume2 size={12} />
        {overrideOpen
          ? 'Custom sound & priority for this alert — click to use your defaults'
          : 'Customize sound & priority for this alert (optional)'}
      </button>
      {overrideOpen && (
        <div className="bg-discord-dark/60 rounded-lg p-3 space-y-2.5">
          <Chips
            options={PUSHOVER_PRIORITIES.map((p) => ({ id: String(p.id), label: p.label }))}
            value={String(ovPriority)}
            onChange={(id) => setOvPriority(Number(id))}
          />
          <p className="text-[11px] text-discord-text-muted">
            {PUSHOVER_PRIORITIES.find((p) => p.id === ovPriority)?.desc}
          </p>
          {ovPriority === 2 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-discord-text-muted">
              Repeat every
              <input value={ovRetryStr} onChange={(e) => setOvRetryStr(e.target.value)} className={`${narrowInputCls} w-16`} />
              s, give up after
              <input value={ovExpireStr} onChange={(e) => setOvExpireStr(e.target.value)} className={`${narrowInputCls} w-16`} />
              s
            </div>
          )}
          <SoundChips value={ovSound} onChange={setOvSound} />
          <p className="text-[10px] text-discord-text-muted/70">
            Applies to Pushover delivery only; overrides your Sound settings for this alert.
          </p>
        </div>
      )}
    </div>
  );

  const keywordBadges = keywordPreview.length > 0 && (
    <div className="flex flex-wrap gap-1">
      {keywordPreview.map((k, i) => (
        <span
          key={`${k}-${i}`}
          className="px-2 py-0.5 rounded-full bg-discord-blurple/15 text-discord-blurple text-[11px] font-medium"
        >
          {k}
        </span>
      ))}
    </div>
  );

  const priceKindLabel = PRICE_KINDS.find((k) => k.id === priceKind)?.label ?? 'Token';
  const tweetKindLabel = TWEET_KINDS.find((k) => k.id === tweetKind)?.label ?? 'X';

  const title = editing
    ? editing.type === 'price'
      ? `${editing.alert.tokenSymbol ?? editing.alert.symbol ?? 'Token'} price alert`
      : editing.type === 'tweet'
        ? `@${editing.alert.author} — ${TWEET_KINDS.find((k) => k.id === editing.alert.kind)?.label ?? editing.alert.kind}`
        : `@${editing.track.channelUsername} channel alert`
    : step === 'category'
      ? 'New alert'
      : step === 'kind'
        ? category === 'price' ? 'Price alert' : 'X account alert'
        : category === 'price'
          ? `${priceKindLabel} alert`
          : category === 'tweet'
            ? `${tweetKindLabel} — X alert`
            : 'Telegram channel alert';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 pt-[var(--safe-top)] pb-[var(--safe-bottom)] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-discord-sidebar rounded-lg shadow-2xl w-full max-w-lg mx-4 animate-pop-in max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
          <div className="flex items-center gap-1.5">
            {!editing && step !== 'category' && (
              <button
                onClick={goBack}
                className="-ml-1.5 p-0.5 text-discord-text-muted hover:text-white transition-colors"
                title="Back"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <h3 className="text-base font-semibold text-white">{title}</h3>
          </div>
          <button onClick={onClose} className="text-discord-text-muted hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── Step 1: what to watch ── */}
        {!editing && step === 'category' && (
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs text-discord-text-muted pb-1">What do you want to watch?</p>
            {([
              ['price', 'Price', 'Crypto, DEX tokens, stocks & metals', TrendingUp],
              ['tweet', 'X account', 'Posts, replies, keywords, follows', Twitter],
              ['telegram', 'Telegram channel', 'New posts in a public channel', Send],
            ] as [Category, string, string, typeof TrendingUp][]).map(([id, label, desc, Icon]) => (
              <button key={id} onClick={() => pickCategory(id)} className={choiceCardCls}>
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-discord-blurple/15 text-discord-blurple shrink-0">
                  <Icon size={17} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white">{label}</span>
                  <span className="block text-xs text-discord-text-muted">{desc}</span>
                </span>
                <ChevronRight size={15} className="text-discord-text-muted/50 group-hover:text-discord-text-muted shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* ── Step 2 (price): which market ── */}
        {!editing && step === 'kind' && category === 'price' && (
          <div className="px-5 py-4">
            <p className="text-xs text-discord-text-muted pb-3">What kind of asset?</p>
            <div className="grid grid-cols-2 gap-2">
              {PRICE_KINDS.map(({ id, label, desc, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setPriceKind(id); setError(null); setStep('form'); }}
                  className="flex flex-col items-start gap-2 px-4 py-3 bg-discord-dark hover:bg-white/5 border border-white/5 hover:border-discord-blurple/50 rounded-lg text-left transition-colors"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-discord-blurple/15 text-discord-blurple">
                    <Icon size={15} />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-white">{label}</span>
                    <span className="block text-xs text-discord-text-muted">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2 (X): what should trigger it ── */}
        {!editing && step === 'kind' && category === 'tweet' && (
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs text-discord-text-muted pb-1">What should trigger the alert?</p>
            {TWEET_KINDS.map(({ id, label, hint }) => (
              <button
                key={id}
                onClick={() => { setTweetKind(id); setError(null); setStep('form'); }}
                className={choiceCardCls}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-white">{label}</span>
                  <span className="block text-xs text-discord-text-muted">{hint}</span>
                </span>
                <ChevronRight size={15} className="text-discord-text-muted/50 group-hover:text-discord-text-muted shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* ── Step 3: the form ── */}
        {(editing || step === 'form') && (
          <div className="px-5 py-4 space-y-3">
            {/* ── Price ── */}
            {category === 'price' && (
              <div className="space-y-2.5">
                {!editing && (priceKind === 'dex' ? (
                  <div className="space-y-2">
                    <Chips options={CHAINS} value={priceChain} onChange={setPriceChain} />
                    <input
                      value={priceContract}
                      onChange={(e) => setPriceContract(e.target.value)}
                      placeholder="Contract address"
                      autoFocus
                      className={`${inputCls} font-mono text-xs`}
                    />
                  </div>
                ) : priceKind === 'metal' ? (
                  <Chips options={METALS} value={priceSymbol} onChange={setPriceSymbol} />
                ) : (
                  <input
                    value={priceSymbol}
                    onChange={(e) => setPriceSymbol(e.target.value)}
                    placeholder={priceKind === 'cex' ? 'Symbol (e.g. SOL, BTC)' : 'Ticker (e.g. AAPL)'}
                    autoFocus
                    className={inputCls}
                  />
                ))}

                {!editing && (quoteLoading || quote || quoteError) && (
                  <div className="flex items-center gap-2 px-2.5 py-2 bg-discord-dark/60 rounded text-xs">
                    {quoteLoading ? (
                      <>
                        <Loader2 size={12} className="animate-spin text-discord-text-muted" />
                        <span className="text-discord-text-muted">Fetching…</span>
                      </>
                    ) : quoteError ? (
                      <span className="text-discord-red">{quoteError}</span>
                    ) : quote ? (
                      <>
                        <span className="text-white font-medium">
                          {quote.symbol}
                          {quote.name && quote.name !== quote.symbol ? ` · ${quote.name}` : ''}
                        </span>
                        <span className="text-discord-text-muted">
                          {priceKind === 'dex' && quote.mcap !== null
                            ? `mcap ${formatQuoteMcap(quote.mcap)} · $${formatQuotePrice(quote.price)}`
                            : `$${formatQuotePrice(quote.price)}`}
                        </span>
                      </>
                    ) : null}
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs text-discord-text-muted">
                    Alert when {priceKind === 'dex' ? 'market cap' : 'price'}…
                  </p>
                  <Chips
                    options={CONDITIONS}
                    value={priceCondition}
                    onChange={(id) => setPriceCondition(id as PriceAlertCondition)}
                  />
                  <input
                    value={priceValue}
                    onChange={(e) => setPriceValue(e.target.value)}
                    placeholder={priceCondition.startsWith('percent') ? 'Percent (e.g. 25)' : priceKind === 'dex' ? 'Mcap (e.g. 5m, 750k)' : 'Price (e.g. 300)'}
                    className={`${inputCls} w-40`}
                  />
                  {(() => {
                    if (!priceValue.trim()) return null;
                    const parsed = parseValue(priceValue);
                    if (parsed === null || parsed <= 0) return null;
                    return (
                      <p className="text-[11px] text-discord-text-muted">
                        = {priceCondition.startsWith('percent') ? `${formatParsedValue(parsed)}%` : `$${formatParsedValue(parsed)}`}
                      </p>
                    );
                  })()}
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-discord-text-muted">Priority</p>
                  <Chips options={URGENCIES} value={urgency} onChange={(id) => setUrgency(id as 'normal' | 'critical')} />
                </div>

                {overrideEditor}

                {priceCondition.startsWith('percent') && !editing && (
                  <p className="text-[11px] text-discord-text-muted">
                    Percent moves are measured from the current {priceKind === 'dex' ? 'market cap' : 'price'}, captured when you save.
                  </p>
                )}
                {editing?.type === 'price' && (
                  <p className="text-[11px] text-discord-text-muted">
                    Changing the condition re-arms the alert
                    {priceCondition.startsWith('percent')
                      ? `; percent changes re-capture the baseline at the current ${priceKind === 'dex' ? 'market cap' : 'price'}`
                      : ''}.
                  </p>
                )}
              </div>
            )}

            {/* ── X account ── */}
            {category === 'tweet' && (
              <div className="space-y-2.5">
                {!editing ? (
                  <>
                    <input
                      value={tweetAuthor}
                      onChange={(e) => setTweetAuthor(e.target.value)}
                      placeholder="@handle to watch"
                      autoFocus
                      className={inputCls}
                    />
                    {(tweetKind === 'tweet' || tweetKind === 'keyword' || tweetKind === 'interact') && (
                      <Chips
                        options={SUB_TYPES}
                        value={tweetSubType}
                        onChange={(id) => setTweetSubType(id as TweetAlertSubType)}
                      />
                    )}
                    {(tweetKind === 'reply' || tweetKind === 'follow') && (
                      <input
                        value={tweetTarget}
                        onChange={(e) => setTweetTarget(e.target.value)}
                        placeholder={tweetKind === 'reply' ? '@handle they reply to' : '@handle they follow'}
                        className={inputCls}
                      />
                    )}
                    {tweetKind === 'interact' && (
                      <input
                        value={tweetTarget}
                        onChange={(e) => setTweetTarget(e.target.value)}
                        placeholder="Tweet link or id"
                        className={inputCls}
                      />
                    )}
                    {tweetKind === 'keyword' && (
                      <>
                        <input
                          value={keywords}
                          onChange={(e) => setKeywords(e.target.value)}
                          placeholder="Keywords, comma-separated (any match fires)"
                          className={inputCls}
                        />
                        {keywordBadges}
                      </>
                    )}
                    <p className="text-[11px] text-discord-text-muted">
                      {TWEET_KINDS.find((k) => k.id === tweetKind)?.hint}
                    </p>
                  </>
                ) : (
                  editing.type === 'tweet' && editing.alert.keywords.length > 0 && (
                    <p className="text-xs text-discord-text-muted">
                      Keywords: {editing.alert.keywords.join(', ')}
                    </p>
                  )
                )}
                <div className="space-y-1.5">
                  <p className="text-xs text-discord-text-muted">Priority</p>
                  <Chips options={URGENCIES} value={urgency} onChange={(id) => setUrgency(id as 'normal' | 'critical')} />
                </div>

                {overrideEditor}
              </div>
            )}

            {/* ── Telegram ── */}
            {category === 'telegram' && (
              <div className="space-y-2.5">
                {!editing && (
                  <>
                    <input
                      value={tgChannel}
                      onChange={(e) => setTgChannel(e.target.value)}
                      placeholder="@channel (public)"
                      autoFocus
                      className={`${inputCls} w-56`}
                    />
                    <p className="text-[11px] text-discord-text-muted">
                      Public channels are watched by Trenchcord's own watcher accounts — your Telegram login is never used.
                    </p>
                  </>
                )}
                <input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Keywords, comma-separated (empty = every post)"
                  className={inputCls}
                />
                {keywordBadges}
              </div>
            )}

            {error && <p className="text-xs text-discord-red">{error}</p>}
          </div>
        )}

        {(editing || step === 'form') && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5">
            {editing ? (
              <>
                <button onClick={submitEdit} disabled={busy} className={primaryBtnCls}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save
                </button>
                {editing.type === 'price' && editing.alert.enabled && editing.alert.triggered && (
                  <button
                    onClick={() => void run(() => updatePriceAlert(editing.alert.id, { enabled: true }))}
                    disabled={busy}
                    className="flex items-center gap-2 px-3 py-2 bg-discord-yellow/15 hover:bg-discord-yellow/25 rounded text-sm text-discord-yellow transition-colors disabled:opacity-50"
                    title="This alert already fired — arm it again"
                  >
                    <RotateCcw size={14} /> Reactivate
                  </button>
                )}
                <button onClick={togglePause} disabled={busy} className={subtleBtnCls}>
                  {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={remove}
                  disabled={busy}
                  className="ml-auto flex items-center gap-2 px-3 py-2 bg-discord-red/15 hover:bg-discord-red/25 rounded text-sm text-discord-red transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </>
            ) : (
              <button onClick={submitCreate} disabled={busy} className={primaryBtnCls}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create alert
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
