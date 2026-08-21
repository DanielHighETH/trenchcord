import { appFetch } from './http.js';

/**
 * Tells Solana token mints ("CAs") apart from wallet addresses, so the buy row
 * only renders under something that can actually be bought. Base58 alone can't
 * make the distinction -- a wallet and a mint look identical in text -- so
 * addresses are looked up on the public RPC: mints are owned by a token
 * program, wallets by the System Program.
 *
 * The lookup lives here rather than in the app window for one reason:
 * api.mainnet-beta.solana.com answers 403 to any request carrying an Origin
 * header, which is every request a browser can make. From Node there is no
 * Origin and the same call succeeds.
 */

export type MintVerdict = 'ca' | 'not-ca' | 'unknown';

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAMS = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
]);
/** getMultipleAccounts takes at most 100 keys per call. */
export const MAX_MINT_BATCH = 100;
const RPC_TIMEOUT_MS = 8000;

// An account's mint-ness never changes, so a definitive verdict is cached for
// the life of the process -- the wallet trackers that cause the false buttons
// repeat the same addresses all day. Failures and "not on chain yet" are never
// cached: those have to be askable again.
const cache = new Map<string, MintVerdict>();
const MAX_CACHE = 5000;

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = new Map([...B58_ALPHABET].map((c, i) => [c, i] as const));

/**
 * Whether the string decodes to exactly 32 bytes, i.e. is a syntactically valid
 * pubkey. The detector regex only checks length and alphabet, which also matches
 * strings no key can have -- and one of those in a getMultipleAccounts batch
 * fails the whole call with "WrongSize", taking down the verdicts of every real
 * address beside it.
 */
function isValidPubkey(addr: string): boolean {
  let zeros = 0;
  while (zeros < addr.length && addr[zeros] === '1') zeros++;
  const bytes: number[] = [];
  for (const ch of addr) {
    let carry = B58_MAP.get(ch);
    if (carry === undefined) return false;
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
  return zeros + bytes.length === 32;
}

interface AccountInfo {
  owner?: string;
  data?: { parsed?: { type?: string } };
}

function classify(info: AccountInfo | null): MintVerdict {
  // Never seen on chain: could be a mint from seconds ago, so no verdict.
  if (!info) return 'unknown';
  // System Program (wallets) and arbitrary PDAs (pools, bonding curves).
  if (!info.owner || !TOKEN_PROGRAMS.has(info.owner)) return 'not-ca';
  // Owned by a token program but not a mint: token accounts, multisigs.
  return info.data?.parsed?.type === 'mint' ? 'ca' : 'not-ca';
}

async function lookup(batch: string[]): Promise<MintVerdict[]> {
  const res = await appFetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getMultipleAccounts',
      params: [batch, { encoding: 'jsonParsed', commitment: 'confirmed' }],
    }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const body = await res.json() as { result?: { value?: (AccountInfo | null)[] } };
  const values = body.result?.value;
  if (!Array.isArray(values) || values.length !== batch.length) {
    throw new Error('unexpected RPC response shape');
  }
  return values.map(classify);
}

/**
 * What the chain says each address is. Anything the lookup can't answer for --
 * rate limited, offline, garbled, or simply not on chain yet -- comes back
 * 'unknown', which the caller treats as buyable: a wallet keeping its buttons
 * is cosmetic, a real CA losing them is not.
 */
export async function classifyAddresses(addresses: string[]): Promise<Record<string, MintVerdict>> {
  const out: Record<string, MintVerdict> = {};
  const pending: string[] = [];

  for (const addr of addresses) {
    if (out[addr] !== undefined) continue;
    // Not a 32-byte key, so it cannot be a mint -- and must not reach the RPC,
    // where it would fail the whole batch.
    if (!isValidPubkey(addr)) {
      out[addr] = 'not-ca';
      continue;
    }
    const cached = cache.get(addr);
    if (cached) out[addr] = cached;
    else if (!pending.includes(addr)) pending.push(addr);
  }

  for (let i = 0; i < pending.length; i += MAX_MINT_BATCH) {
    const batch = pending.slice(i, i + MAX_MINT_BATCH);
    let results: MintVerdict[];
    try {
      results = await lookup(batch);
    } catch (err) {
      console.warn('[mintCheck] lookup failed:', (err as Error).message);
      results = batch.map(() => 'unknown' as const);
    }
    batch.forEach((addr, j) => {
      const verdict = results[j];
      out[addr] = verdict;
      if (verdict !== 'unknown') {
        if (cache.size >= MAX_CACHE) cache.clear();
        cache.set(addr, verdict);
      }
    });
  }

  return out;
}
