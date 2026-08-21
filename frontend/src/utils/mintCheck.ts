import { useEffect, useSyncExternalStore } from 'react';
import { backendFetch } from '../stores/appStore';

/**
 * Tells Solana token mints ("CAs") apart from wallet addresses so trade
 * buttons only render under something that can actually be bought. Base58
 * alone can't make the distinction -- a wallet and a mint look identical in
 * text -- so detected addresses are looked up once on the Solana RPC: mints
 * are owned by a token program, wallets by the System Program.
 *
 * The lookup itself runs in the backend (POST /api/trading/mint-check), which
 * is not a detail: api.mainnet-beta.solana.com answers 403 to any request
 * carrying an Origin header, so asking it from the app window failed every
 * single time -- leaving every address unresolved, and every pasted wallet
 * with a full set of buy buttons under it.
 *
 * Fails open: an address counts as buyable until the chain definitively says
 * otherwise. "Not on chain yet" stays buyable too, so a token minted seconds
 * ago is never held hostage to RPC lag -- only "this account exists and is
 * not a mint" removes buttons. Anything unresolved is re-asked after a
 * cooldown rather than cached, so one bad answer can't switch the check off
 * for the rest of the session.
 */

// The backend caps a request at the RPC's own batch size.
const MAX_BATCH = 100;
// Messages land in bursts; a short collect window turns a burst into one call.
const BATCH_DELAY_MS = 150;
// How long an unresolved address is left alone before it is asked about again.
const RECHECK_MS = 30_000;

type Verdict = 'ca' | 'not-ca';

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = new Map([...B58_ALPHABET].map((c, i) => [c, i] as const));
const validityCache = new Map<string, boolean>();

/**
 * Whether the string decodes to exactly 32 bytes, i.e. is a syntactically
 * valid pubkey. The detector regex only checks length and alphabet, which
 * also matches strings no key can have; they can't be mints, so they are
 * filtered here without ever going to the backend.
 */
function isValidPubkey(addr: string): boolean {
  const cached = validityCache.get(addr);
  if (cached !== undefined) return cached;

  let zeros = 0;
  while (zeros < addr.length && addr[zeros] === '1') zeros++;
  const bytes: number[] = [];
  let valid = true;
  for (const ch of addr) {
    let carry = B58_MAP.get(ch);
    if (carry === undefined) {
      valid = false;
      break;
    }
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const result = valid && zeros + bytes.length === 32;
  validityCache.set(addr, result);
  return result;
}

// Session-lifetime cache: an account's mint-ness never changes, and the wallet
// trackers that cause the false buttons repeat the same addresses all day.
const verdicts = new Map<string, Verdict>();
// Addresses the last answer couldn't settle, and the moment they may be asked
// about again.
const recheckAt = new Map<string, number>();
const queued = new Set<string>();
const inflight = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

let version = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getVersion = () => version;

async function flush() {
  flushTimer = null;
  const batch = [...queued].slice(0, MAX_BATCH);
  for (const addr of batch) {
    queued.delete(addr);
    inflight.add(addr);
  }
  if (queued.size > 0) flushTimer = setTimeout(flush, BATCH_DELAY_MS);
  if (batch.length === 0) return;

  const retryAt = Date.now() + RECHECK_MS;
  try {
    const res = await backendFetch('/trading/mint-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: batch }),
    });
    if (!res.ok) throw new Error(`mint-check ${res.status}`);
    const body = (await res.json()) as { verdicts?: Record<string, string> };
    for (const addr of batch) {
      const verdict = body.verdicts?.[addr];
      if (verdict === 'ca' || verdict === 'not-ca') verdicts.set(addr, verdict);
      // Rate limited, offline, or not on chain yet: keep the buttons and ask
      // again later rather than settling on an answer nobody gave.
      else recheckAt.set(addr, retryAt);
    }
  } catch {
    for (const addr of batch) recheckAt.set(addr, retryAt);
  }

  for (const addr of batch) inflight.delete(addr);
  version++;
  for (const fn of listeners) fn();
}

function ensureChecked(addrs: string[]) {
  const now = Date.now();
  for (const addr of addrs) {
    if (verdicts.has(addr) || inflight.has(addr) || queued.has(addr)) continue;
    if ((recheckAt.get(addr) ?? 0) > now) continue;
    if (isValidPubkey(addr)) queued.add(addr);
  }
  if (queued.size > 0 && flushTimer === null) flushTimer = setTimeout(flush, BATCH_DELAY_MS);
}

/**
 * `addrs` minus everything the chain says is not a token mint. Unresolved and
 * unresolvable addresses stay in, so a row can render and then drop once its
 * lookup lands. With `enabled` false nothing is looked up or filtered --
 * callers pass false when the buttons wouldn't render anyway (or in demo
 * mode, whose fake mints must not hit the network).
 */
export function useLikelyMints(addrs: string[], enabled: boolean): string[] {
  const key = addrs.join(',');
  useEffect(() => {
    if (enabled && key !== '') ensureChecked(key.split(','));
  }, [key, enabled]);
  useSyncExternalStore(subscribe, getVersion);
  if (!enabled) return addrs;
  return addrs.filter((addr) => isValidPubkey(addr) && verdicts.get(addr) !== 'not-ca');
}
