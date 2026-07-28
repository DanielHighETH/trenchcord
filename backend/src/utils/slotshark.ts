import type { SlotsharkRegion } from '../discord/types.js';

// Fixed set rather than a user-supplied base URL: a free-form endpoint would be
// an SSRF vector, and the only real choice here is latency (US vs EU).
const REGION_BASE_URLS: Record<SlotsharkRegion, string> = {
  us: 'https://us.slotshark.xyz',
  eu: 'https://eu.slotshark.xyz',
};

// Deliberately longer than contract.ts's 5s. A swap submitted with retries:true
// can take several seconds to land, and giving up while it succeeds is the worst
// outcome -- the user assumes failure and re-clicks, double-buying.
const SLOTSHARK_TIMEOUT_MS = 20_000;

export interface SlotsharkBuyParams {
  mint: string;
  solAmount: number;
  /** Slotshark wallet pubkey. Case-sensitive -- pass through verbatim. */
  wallet: string;
  /** 1-10000, defaults to 20. */
  slippage?: number;
  /** SOL. null/undefined omits the field, which means auto (p75). */
  tip?: number | null;
  /** SOL. null/undefined omits the field, which means auto (p99). */
  priorityFee?: number | null;
  antimev?: boolean;
}

export type SlotsharkErrorKind =
  | 'auth'
  | 'validation'
  | 'rate_limit'
  | 'upstream'
  | 'network'
  | 'timeout';

export type SlotsharkResult =
  | { ok: true; data: any }
  | { ok: false; kind: SlotsharkErrorKind; status: number; message: string };

/**
 * Fire a buy against the Slotshark REST API.
 *
 * Never throws and never logs the API token. Callers map `kind` onto a
 * user-facing message -- see the trading routes in api/routes.ts.
 */
export async function slotsharkBuy(
  region: SlotsharkRegion,
  apiToken: string,
  params: SlotsharkBuyParams,
): Promise<SlotsharkResult> {
  // Omitting tip/priorityFee is meaningful (it selects auto pricing), so these
  // are assigned conditionally rather than sent as null.
  const body: Record<string, unknown> = {
    mint: params.mint,
    solAmount: params.solAmount,
    wallet: params.wallet,
    slippage: params.slippage ?? 20,
    antimev: params.antimev ?? true,
    retries: true,
    // skipIfBought intentionally omitted -- the API defaults it to false.
  };
  if (typeof params.tip === 'number') body.tip = params.tip;
  if (typeof params.priorityFee === 'number') body.priorityFee = params.priorityFee;

  // Dev seam: exercises the whole UI path with no network call and no SOL.
  if (process.env.SLOTSHARK_DRY_RUN === '1') {
    console.log(`[slotshark] DRY RUN ${region} ${JSON.stringify(body)}`);
    return { ok: true, data: { dryRun: true, signature: 'DRYRUN' } };
  }

  try {
    const res = await fetch(`${REGION_BASE_URLS[region]}/buy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SLOTSHARK_TIMEOUT_MS),
    });

    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body (e.g. an HTML error page from a proxy) -- keep the text.
    }

    if (!res.ok) {
      const message = String(parsed?.error ?? parsed?.message ?? text ?? '').slice(0, 300);
      const kind: SlotsharkErrorKind =
        res.status === 401 || res.status === 403
          ? 'auth'
          : res.status === 429
            ? 'rate_limit'
            : res.status >= 500
              ? 'upstream'
              : 'validation';
      console.error(`[slotshark] HTTP ${res.status} (${kind}): ${message}`);
      return { ok: false, kind, status: res.status, message };
    }

    return { ok: true, data: parsed };
  } catch (err) {
    const e = err as Error;
    // AbortSignal.timeout rejects with a DOMException named TimeoutError, which
    // is what separates "we gave up" from "we never connected".
    const kind: SlotsharkErrorKind = e.name === 'TimeoutError' ? 'timeout' : 'network';
    console.error(`[slotshark] buy ${kind}: ${e.message}`);
    return { ok: false, kind, status: 0, message: e.message };
  }
}

/** Pull a tx signature out of whatever shape Slotshark returns, if present. */
export function extractSignature(data: any): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const candidate = data.signature ?? data.txid ?? data.tx ?? data.data?.signature;
  return typeof candidate === 'string' ? candidate : undefined;
}
