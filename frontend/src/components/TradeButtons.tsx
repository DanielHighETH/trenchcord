import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { colorWithExtraAlpha } from './ColorPickerWithAlpha';
import { collectTradeTargets } from '../utils/addressDetect';
import { useLikelyMints } from '../utils/mintCheck';
import { buildBuySiteUrl } from '../utils/contractUrl';
import { isHostedMode } from '../lib/supabase';
import { isDemoMode } from '../demo/demoStore';
import type { FrontendMessage, TradeButtonSize } from '../types';

interface TradeButtonsProps {
  message: FrontendMessage;
  /** Tighter top margin for the compact / grouped message layouts. */
  dense?: boolean;
}

// A spam message can list a dozen addresses; a wall of spend buttons under it
// is worse than useless, so the row starts at the first few and says how many
// it is holding back.
const COLLAPSED_TRADE_ROWS = 3;
// Ceiling once expanded: past this the message is a token dump, not a call, and
// every extra row is another way to misclick a real buy.
const MAX_TRADE_ROWS = 12;
// How long a button stays armed waiting for the second click. Generous enough
// to cover a slow system double-click setting: the armed state is invisible, so
// a window that expires early just looks like the click did nothing.
const ARM_MS = 800;
// Scaling into a token means several buys seconds apart, each of which would
// otherwise open its own tab (the desktop build hands every window.open to the
// system browser). Module scope, because the split-grid layout can render the
// same message - and so the same button row - in two panes at once.
const SITE_REOPEN_MS = 15_000;
const siteOpenedAt = new Map<string, number>();

/** Trim float noise from split amounts (5/3 SOL) without padding whole ones. */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

const SIZE_STYLES: Record<TradeButtonSize, { button: string; pill: string; unit: string }> = {
  sm: { button: 'px-1.5 py-0.5 text-[10px]', pill: 'text-[10px] px-1', unit: 'text-[9px]' },
  md: { button: 'px-2 py-0.5 text-[11px]', pill: 'text-[11px] px-1', unit: 'text-[10px]' },
  lg: { button: 'px-3 py-1.5 text-sm', pill: 'text-xs px-1.5', unit: 'text-[11px]' },
};

export default function TradeButtons({ message, dense = false }: TradeButtonsProps) {
  const trading = useAppStore((s) => s.config?.trading);
  const linkTemplates = useAppStore((s) => s.config?.contractLinkTemplates);
  const solColor = useAppStore((s) => s.config?.solAddressColor) ?? '#14f195';
  const tradingStatus = useAppStore((s) => s.tradingStatus);
  const slotsharkBuy = useAppStore((s) => s.slotsharkBuy);
  const pushToast = useAppStore((s) => s.pushToast);

  const [pending, setPending] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);

  const amounts = (trading?.presetAmounts ?? []).filter((a) => a > 0).slice(0, 5);
  const activeWallets = (trading?.activeWalletIds ?? []).filter((id) =>
    trading?.wallets.some((w) => w.id === id),
  );

  // Everything except the addresses themselves. Checked before scanning because
  // this component renders under every message in the feed, and with trading
  // switched off none of that text is worth reading.
  const canTrade =
    !isHostedMode &&
    !!trading?.enabled &&
    !!tradingStatus?.configured &&
    activeWallets.length > 0 &&
    amounts.length > 0;

  // Includes tokens that only appear in an embed -- caller bots like Rick put
  // the contract there and leave the message body free of it, so the backend
  // detector (content-only) never sees it -- and tokens named only by a link,
  // which is how command bots list several at once.
  const targets = canTrade ? collectTradeTargets(message) : [];

  // Regex detection can't tell a wallet from a mint, so wallet-tracker posts
  // grow buy buttons under the tracked wallet. The RPC check drops addresses
  // the chain says aren't mints, and never runs in demo mode (fake mints, and
  // tours should stay offline).
  const solAddresses = useLikelyMints(
    targets.map((t) => t.address),
    canTrade && !isDemoMode,
  );

  if (!canTrade || solAddresses.length === 0) return null;

  const size = SIZE_STYLES[trading.buttonSize] ?? SIZE_STYLES.md;
  const bg = trading.buttonBgColor || '#383a40';
  const fg = trading.buttonTextColor || '#dbdee1';
  const rows = solAddresses.slice(0, expanded ? MAX_TRADE_ROWS : COLLAPSED_TRADE_ROWS);
  const hidden = solAddresses.length - rows.length;
  // The name each token was linked under, when the message gave one: three
  // shortened addresses in a column say nothing about which coin is which.
  const labels = new Map(targets.filter((t) => t.label).map((t) => [t.address, t.label!]));
  const showPill = trading.showContractPill !== false;
  const walletCount = activeWallets.length;
  const splitMode = trading.walletAmountMode === 'split';

  // What a click actually costs. With several wallets on `per_wallet` the
  // number on the button is not the number leaving your balance, so every label
  // and tooltip states the total outright.
  const totalFor = (amount: number) => (splitMode ? amount : amount * walletCount);
  const describeSpend = (amount: number) => {
    if (walletCount === 1) return `${amount} SOL`;
    return splitMode
      ? `${amount} SOL split across ${walletCount} wallets (~${round4(amount / walletCount)} each)`
      : `${amount} SOL on each of ${walletCount} wallets (${round4(totalFor(amount))} SOL total)`;
  };

  // Opened from the click handler, before the buy is awaited: a window.open
  // that runs after an await has lost the user gesture and browsers block it.
  // Fires whether or not the buy lands - if it fails you want the chart up to
  // retry there, which is also why it doesn't wait for the result.
  function openBuySite(addr: string) {
    const url = buildBuySiteUrl(addr, trading, linkTemplates);
    if (!url) return;

    const now = Date.now();
    const last = siteOpenedAt.get(addr);
    if (last && now - last < SITE_REOPEN_MS) return;
    if (siteOpenedAt.size > 100) {
      for (const [key, at] of siteOpenedAt) {
        if (now - at >= SITE_REOPEN_MS) siteOpenedAt.delete(key);
      }
    }
    siteOpenedAt.set(addr, now);

    // noopener over reusing a per-token named tab: the target is a user-supplied
    // URL, so it must not get a handle back on the app window.
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function fire(addr: string, amount: number, key: string) {
    openBuySite(addr);
    setPending(key);
    const short = `${addr.slice(0, 4)}…${addr.slice(-4)}`;
    const res = await slotsharkBuy(addr, amount);
    setPending((p) => (p === key ? null : p));

    const failures = (res.results ?? []).filter((r) => !r.ok);

    if (res.success && failures.length === 0) {
      pushToast({
        kind: 'success',
        title: `Bought ${round4(res.spent ?? amount)} SOL of ${short}`,
        detail: (res.walletCount ?? 1) > 1 ? `Across ${res.walletCount} wallets` : undefined,
      });
      return;
    }

    // A partial fill spent real SOL, so it can't be a quiet success -- it is
    // shown as an error the user has to read, naming the wallets that missed.
    if (res.success) {
      pushToast({
        kind: 'error',
        title: `Partly bought ${short} — ${res.succeeded}/${res.walletCount} wallets`,
        detail: `${round4(res.spent ?? 0)} SOL went through. Failed: ${failures
          .map((f) => `${f.label || 'wallet'} (${f.error ?? 'unknown error'})`)
          .join('; ')}`,
      });
      return;
    }

    pushToast({
      kind: 'error',
      title: `Buy failed — ${short}`,
      detail: res.error ?? failures[0]?.error,
    });
  }

  function onButtonClick(addr: string, amount: number) {
    const key = `${addr}:${amount}`;
    if (pending === key) return;

    if (!trading?.requireDoubleClick) {
      void fire(addr, amount, key);
      return;
    }

    if (armed === key) {
      if (armTimer.current) clearTimeout(armTimer.current);
      setArmed(null);
      void fire(addr, amount, key);
      return;
    }

    if (armTimer.current) clearTimeout(armTimer.current);
    setArmed(key);
    armTimer.current = setTimeout(() => setArmed(null), ARM_MS);
  }

  return (
    // w-full + basis-full so the row claims its own line even when an ancestor
    // is a wrapping flex container (the compact layouts are).
    <div className={`w-full basis-full flex flex-col gap-1 ${dense ? 'mt-1' : 'mt-1.5'}`}>
      {rows.map((addr) => (
        <div key={addr} className="w-full flex items-center gap-1.5 flex-wrap">
          {/* The token's name when the message linked it under one -- on a
              multi-token list it is the only thing telling the rows apart at a
              glance. */}
          {labels.get(addr) && (
            <span
              className={`font-semibold text-discord-text-normal truncate max-w-[8rem] shrink-0 ${size.pill}`}
              title={labels.get(addr)}
            >
              {labels.get(addr)}
            </span>
          )}
          {/* Same pill styling as the inline CA so the row is unambiguously
              tied to one token, which matters most in the grouped layout
              where the message has no header at all. It can be turned off to
              save a line of noise, but never when a message carries several
              contracts: then it is the only thing saying which row spends on
              which token. */}
          {(showPill || rows.length > 1) && (
            <span
              className={`rounded font-mono shrink-0 ${size.pill}`}
              style={{ backgroundColor: colorWithExtraAlpha(solColor, 0.125), color: solColor }}
              title={addr}
            >
              {addr.slice(0, 4)}…{addr.slice(-4)}
            </span>
          )}
          {amounts.map((amount) => {
            const key = `${addr}:${amount}`;
            const isPending = pending === key;
            return (
              <button
                key={key}
                onClick={() => onButtonClick(addr, amount)}
                // React fires onDoubleClick *after* onClick, so it can never
                // gate a buy — the arming logic above does that. This only
                // stops a fast double-click selecting text.
                onDoubleClick={(e) => e.preventDefault()}
                disabled={isPending}
                title={`${trading?.requireDoubleClick ? 'Double click to buy' : 'Buy'} ${describeSpend(amount)} of ${addr}`}
                // Armed state is deliberately invisible: the button looks
                // identical whether or not it is waiting for the second click,
                // so a double click behaves like an ordinary double click.
                className={`select-none rounded font-semibold transition-opacity hover:opacity-80 ${size.button} ${
                  isPending ? 'opacity-60 cursor-wait' : ''
                }`}
                style={{ backgroundColor: bg, color: fg }}
              >
                {isPending ? '…' : amount}
              </button>
            );
          })}
          <span className={`text-discord-text-muted shrink-0 ${size.unit}`}>SOL</span>
          {/* With one wallet the button number is the whole story; with several
              it isn't, so the row says how the amount is being applied. */}
          {walletCount > 1 && (
            <span
              className={`text-discord-text-muted shrink-0 ${size.unit}`}
              title={splitMode
                ? `Each buy is split across your ${walletCount} enabled wallets`
                : `Each buy fires on all ${walletCount} of your enabled wallets`}
            >
              {splitMode ? `· split ×${walletCount}` : `· ×${walletCount} wallets`}
            </span>
          )}
        </div>
      ))}
      {/* Collapsed by default, but reachable: a callout list can hold every
          token worth buying in the message, and the row is useless if the one
          you want is the fourth. */}
      {(hidden > 0 || expanded) && (
        <div className="flex items-center gap-2 text-[10px] text-discord-text-muted">
          {expanded ? (
            <>
              <button
                onClick={() => setExpanded(false)}
                className="hover:text-discord-text-normal hover:underline underline-offset-2"
              >
                Show fewer
              </button>
              {hidden > 0 && (
                <span title={`Only the first ${MAX_TRADE_ROWS} contracts get a buy row`}>
                  +{hidden} not shown
                </span>
              )}
            </>
          ) : (
            <button
              onClick={() => setExpanded(true)}
              className="hover:text-discord-text-normal hover:underline underline-offset-2"
            >
              +{hidden} more contract{hidden > 1 ? 's' : ''} in this message
            </button>
          )}
        </div>
      )}
    </div>
  );
}
