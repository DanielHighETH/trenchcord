import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig, SnipeConfig, TradingWallet } from '../discord/types.js';
import type { WsServer } from '../ws/server.js';
import { isHostedMode } from '../storage/index.js';
import { slotsharkBuy, extractSignature, type SlotsharkLimitSell } from '../utils/slotshark.js';
import { detectSolAddressesInMessage, collectEmbedText, buildContractUrl } from '../utils/contract.js';
import { extractComponentText } from '../utils/componentText.js';
import { splitLamports, buyErrorMessage } from '../api/routes.js';
import { sendPushover } from '../utils/pushover.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Same TRENCHCORD_DATA_DIR convention as config/store.ts.
const DATA_DIR = process.env.TRENCHCORD_DATA_DIR || join(__dirname, '../../data');
const SNIPED_MINTS_PATH = join(DATA_DIR, 'sniped-mints.json');

// Same loose rule as the manual buy route (routes.ts SOL_ADDRESS_RE), not the
// stricter prose heuristic in utils/contract.ts.
const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// Mirrors routes.ts MIN_SOL_PER_BUY: a split share below this is dust that
// Slotshark rejects one wallet at a time.
const MIN_SOL_PER_BUY = 0.0001;
// The re-snipe ledger is bounded so years of uptime can't grow it unbounded;
// oldest entries are evicted first, which for CAs (relevant for hours at most)
// is harmless.
const MAX_TRACKED_MINTS = 5000;

/** Minimal slice of a message the engine needs -- the full FrontendMessage
 * satisfies it, and the Discord messageUpdate partial can be adapted to it. */
export interface SnipeMessageView {
  content: string;
  embeds?: any[];
  /** Components v2 tree -- v2 caller bots carry the CA here, not in content/embeds. */
  components?: any[];
  /** Discord-forwarded body (message_snapshots): the CA of a forwarded call
   * lives here, the outer message is empty. */
  forwardedMessage?: { content?: string; embeds?: any[]; components?: any[] } | null;
  author?: { id: string; username?: string | null };
  contractAddresses?: string[];
}

// Per-mint snipe ledger. Marked at attempt time, success or not: a failed buy
// must never retry itself into a loop. `count` backs the 'limit' re-snipe
// mode; `lastMessageId` guards against create+edit double-delivery of the
// same message re-firing a mint.
interface SnipeLedgerEntry {
  ts: number;
  count: number;
  lastMessageId?: string;
}
let snipedMints: Map<string, SnipeLedgerEntry> | null = null;
const snipeInFlight = new Set<string>();

function loadSnipedMints(): Map<string, SnipeLedgerEntry> {
  if (snipedMints) return snipedMints;
  snipedMints = new Map();
  try {
    if (existsSync(SNIPED_MINTS_PATH)) {
      const parsed = JSON.parse(readFileSync(SNIPED_MINTS_PATH, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        for (const [mint, v] of Object.entries(parsed)) {
          // Pre-limit-mode ledgers stored a bare timestamp.
          if (typeof v === 'number') {
            snipedMints.set(mint, { ts: v, count: 1 });
          } else if (v && typeof v === 'object' && typeof (v as any).ts === 'number') {
            snipedMints.set(mint, {
              ts: (v as any).ts,
              count: typeof (v as any).count === 'number' ? (v as any).count : 1,
              lastMessageId: typeof (v as any).lastMessageId === 'string' ? (v as any).lastMessageId : undefined,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[sniper] Failed to load sniped-mints ledger:', err);
  }
  return snipedMints;
}

function persistSnipedMints(): void {
  if (!snipedMints) return;
  while (snipedMints.size > MAX_TRACKED_MINTS) {
    const oldest = snipedMints.keys().next().value;
    if (oldest === undefined) break;
    snipedMints.delete(oldest);
  }
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SNIPED_MINTS_PATH, JSON.stringify(Object.fromEntries(snipedMints)), 'utf-8');
  } catch (err) {
    console.error('[sniper] Failed to persist sniped-mints ledger:', err);
  }
}

/** Same dual semantics as configStore.isUserHighlighted: raw ids match
 * exactly, "@name" entries match the username case-insensitively. */
function userMatches(list: string[], author?: SnipeMessageView['author']): boolean {
  if (!author) return false;
  if (list.includes(author.id)) return true;
  const username = author.username;
  if (!username) return false;
  return list.some((e) => e.startsWith('@') && e.slice(1).toLowerCase() === username.toLowerCase());
}

/** Whether a config's re-snipe policy lets an already-sniped mint fire again.
 * Migrates legacy minute-cooldown configs (resnipeCooldownMin) on read. */
function resnipeAllows(cfg: SnipeConfig, entry: SnipeLedgerEntry, now: number): boolean {
  const mode = cfg.resnipeMode
    ?? (typeof cfg.resnipeCooldownMin === 'number' ? 'cooldown' : 'never');
  if (mode === 'cooldown') {
    const sec = typeof cfg.resnipeCooldownSec === 'number'
      ? cfg.resnipeCooldownSec
      : typeof cfg.resnipeCooldownMin === 'number' ? cfg.resnipeCooldownMin * 60 : null;
    return sec !== null && now - entry.ts >= sec * 1000;
  }
  if (mode === 'limit') {
    return typeof cfg.resnipeMaxCount === 'number' && entry.count < cfg.resnipeMaxCount;
  }
  return false;
}

/** Case-insensitive whole-word match ("ANSEM" hits "ansem is cooking" but not
 * "ransem"), unicode-aware so emoji/punctuation count as boundaries. Property
 * escapes stay out of regex literals for the same reason as telegram/client.ts
 * MEANINGFUL_LABEL_RE: nodejs-mobile's no-ICU V8 rejects \p{...} at
 * construction, so on iOS this falls back to ASCII word boundaries. */
function keywordHit(text: string, keyword: string): boolean {
  const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
  } catch {
    try {
      return new RegExp(`(^|[^A-Za-z0-9])${esc}($|[^A-Za-z0-9])`, 'i').test(text);
    } catch {
      return false;
    }
  }
}

function toSlotsharkLimitSells(cfg: SnipeConfig): SlotsharkLimitSell[] | undefined {
  if (!cfg.limitSells?.length) return undefined;
  return cfg.limitSells.map((ls) => {
    const row: SlotsharkLimitSell = {
      type: ls.type,
      value: ls.value,
      sellPercent: ls.sellPercent,
      retries: true,
    };
    // Omit = auto pricing, same convention as the buy itself.
    if (typeof ls.tip === 'number') row.tip = ls.tip;
    if (typeof ls.priorityFee === 'number') row.priorityFee = ls.priorityFee;
    return row;
  });
}

interface SnipeWalletResult {
  label: string;
  solAmount: number;
  ok: boolean;
  signature?: string;
  error?: string;
}

function broadcastResult(
  wsServer: WsServer,
  userId: string,
  data: {
    status: 'bought' | 'failed' | 'skipped';
    mint: string;
    configId: string;
    configName: string;
    roomId: string;
    solAmount: number;
    wallets: SnipeWalletResult[];
    reason?: string;
    // Ref to the message that triggered the snipe, so the frontend can pin the
    // result onto it in the virtual "snipes" feed. Absent on some edit payloads.
    messageId?: string;
    channelId?: string;
    timestamp?: string;
  },
): void {
  wsServer.broadcastRaw({ type: 'snipe_result', data }, userId);
}

/**
 * Evaluate one incoming message against the sniping configs and fire buys.
 *
 * Called fire-and-forget from the Discord/Telegram message handlers in
 * index.ts -- it must never throw into the message path and never delay the
 * broadcast. All spend-relevant values come from the stored config
 * (sanitizeSnipingConfig bounded them on the way in), never from the message.
 */
export async function evaluateSnipe(opts: {
  userId: string;
  config: AppConfig;
  message: SnipeMessageView;
  roomIds: string[];
  wsServer: WsServer;
  /** The triggering message, for the frontend "snipes" history feed. */
  messageRef?: { messageId: string; channelId: string };
}): Promise<void> {
  const { userId, config, message, roomIds, wsServer, messageRef } = opts;
  const refFields = {
    messageId: messageRef?.messageId,
    channelId: messageRef?.channelId,
  };

  // Sniping is local-mode only, like all trading.
  if (isHostedMode()) return;
  const sniping = config.sniping;
  const trading = config.trading;
  const apiToken = config.slotsharkApiToken;
  if (!sniping?.enabled || !sniping.configs.length) return;
  // Sniping rides on the Trading setup; a disabled trading config or missing
  // token means nothing is armed, however the snipe configs look.
  if (!trading?.enabled || !apiToken) return;

  // Half-filled configs (no amount, no wallets) are stored but must never
  // match: a config that can't buy must not consume a mint from the ledger.
  const matched = sniping.configs.filter(
    (c) =>
      c.enabled &&
      c.solAmount >= MIN_SOL_PER_BUY &&
      c.walletIds.length > 0 &&
      roomIds.includes(c.roomId) &&
      (c.mode === 'room' || userMatches(c.users, message.author)),
  );
  if (matched.length === 0) return;

  const fwd = message.forwardedMessage;
  const allEmbeds = fwd?.embeds?.length ? [...(message.embeds ?? []), ...fwd.embeds] : message.embeds;
  const auxText = [
    extractComponentText(message.components),
    fwd?.content,
    extractComponentText(fwd?.components),
  ].filter(Boolean).join('\n');

  const contractConfigs = matched.filter((c) => (c.trigger ?? 'contract') === 'contract');
  const keywordConfigs = matched.filter((c) => c.trigger === 'keyword');

  const ledger = loadSnipedMints();

  // A mint may act if it was never sniped, or its ledger entry passes the
  // config's re-snipe policy. The same message can never fire a mint twice
  // regardless of policy -- caller bots deliver create + edit for one post,
  // and a seconds-scale cooldown or a count limit must not double-buy on it.
  const eligible = (c: SnipeConfig, mint: string, now: number): boolean => {
    const entry = ledger.get(mint);
    if (!entry) return true;
    if (messageRef && entry.lastMessageId === messageRef.messageId) return false;
    return resnipeAllows(c, entry, now);
  };

  // (mint, config) pairs to fire; first matched config per mint wins.
  const candidates: { mint: string; cfg: SnipeConfig; viaKeyword?: string }[] = [];

  // Contract-triggered configs: extraction only runs when one is watching.
  if (contractConfigs.length > 0) {
    const seen = new Set<string>();
    for (const addr of [
      ...detectSolAddressesInMessage(message.content ?? '', allEmbeds, auxText),
      ...(message.contractAddresses ?? []),
    ]) {
      if (!addr.startsWith('0x') && SOL_ADDRESS_RE.test(addr) && !seen.has(addr)) {
        seen.add(addr);
        const cfg = contractConfigs.find((c) => eligible(c, addr, Date.now()));
        if (cfg) candidates.push({ mint: addr, cfg });
      }
    }
  }

  // Keyword-triggered configs: the message carries no CA; a mapped keyword in
  // its text buys the mapped mint instead.
  if (keywordConfigs.length > 0) {
    const fullText = [
      message.content ?? '',
      collectEmbedText(allEmbeds),
      auxText,
    ].filter(Boolean).join('\n');
    for (const cfg of keywordConfigs) {
      for (const entry of cfg.keywordMap ?? []) {
        if (!entry?.keyword || !entry.mint || !SOL_ADDRESS_RE.test(entry.mint)) continue;
        if (!keywordHit(fullText, entry.keyword)) continue;
        if (candidates.some((x) => x.mint === entry.mint)) continue;
        if (!eligible(cfg, entry.mint, Date.now())) continue;
        candidates.push({ mint: entry.mint, cfg, viaKeyword: entry.keyword });
      }
    }
  }
  if (candidates.length === 0) return;

  for (const { mint, cfg, viaKeyword } of candidates) {
    const now = Date.now();

    const wallets: TradingWallet[] = cfg.walletIds
      .map((id) => trading.wallets.find((w) => w.id === id))
      .filter((w): w is TradingWallet => w !== undefined);
    if (wallets.length === 0) {
      broadcastResult(wsServer, userId, {
        status: 'failed', mint, configId: cfg.id, configName: cfg.name, roomId: cfg.roomId,
        solAmount: cfg.solAmount, wallets: [], reason: 'No valid wallets selected for this snipe config.',
        ...refFields, timestamp: new Date(now).toISOString(),
      });
      continue;
    }

    // Marked before firing so a concurrent message carrying the same CA can't
    // race past the guard while the first buy is still in flight. Attempts
    // count toward the re-snipe limit whether or not the buy succeeds -- a
    // failed buy must never retry itself into a loop.
    const prior = ledger.get(mint);
    ledger.set(mint, {
      ts: now,
      count: (prior?.count ?? 0) + 1,
      lastMessageId: messageRef?.messageId ?? prior?.lastMessageId,
    });
    persistSnipedMints();

    const perWalletAmounts =
      trading.walletAmountMode === 'split'
        ? splitLamports(cfg.solAmount, wallets.length)
        : wallets.map(() => cfg.solAmount);
    const limitSells = toSlotsharkLimitSells(cfg);

    const results: SnipeWalletResult[] = await Promise.all(
      wallets.map(async (wallet, i): Promise<SnipeWalletResult> => {
        const amount = perWalletAmounts[i];
        if (amount < MIN_SOL_PER_BUY) {
          return { label: wallet.label || wallet.address.slice(0, 6), solAmount: amount, ok: false, error: 'Split amount below minimum buy size.' };
        }
        const flightKey = `${userId}:${wallet.address}:${mint}`;
        if (snipeInFlight.has(flightKey)) {
          return { label: wallet.label || wallet.address.slice(0, 6), solAmount: amount, ok: false, error: 'Duplicate snipe already in flight.' };
        }
        snipeInFlight.add(flightKey);
        try {
          const result = await slotsharkBuy(trading.region, apiToken, {
            mint,
            solAmount: amount,
            wallet: wallet.address,
            slippage: cfg.slippage ?? trading.slippage,
            tip: cfg.tip ?? trading.tip,
            priorityFee: cfg.priorityFee ?? trading.priorityFee,
            antimev: trading.antimev,
            minMarketCap: typeof cfg.minMarketCap === 'number' ? cfg.minMarketCap : undefined,
            maxMarketCap: typeof cfg.maxMarketCap === 'number' ? cfg.maxMarketCap : undefined,
            limitSells,
            skipIfBought: cfg.skipIfBought === true,
          });
          if (result.ok) {
            return { label: wallet.label || wallet.address.slice(0, 6), solAmount: amount, ok: true, signature: extractSignature(result.data) };
          }
          return { label: wallet.label || wallet.address.slice(0, 6), solAmount: amount, ok: false, error: buyErrorMessage(result) };
        } finally {
          snipeInFlight.delete(flightKey);
        }
      }),
    );

    const succeeded = results.filter((r) => r.ok).length;
    const status = succeeded > 0 ? 'bought' : 'failed';
    console.log(
      `[sniper] ${status} ${mint} via "${cfg.name || cfg.id}"${viaKeyword ? ` (keyword "${viaKeyword}")` : ''} (${succeeded}/${results.length} wallets)`,
    );
    broadcastResult(wsServer, userId, {
      status, mint, configId: cfg.id, configName: cfg.name, roomId: cfg.roomId,
      solAmount: cfg.solAmount, wallets: results,
      reason: status === 'failed'
        ? results.find((r) => r.error)?.error
        : viaKeyword ? `Keyword "${viaKeyword}"` : undefined,
      ...refFields, timestamp: new Date(now).toISOString(),
    });

    // Fire-and-forget like every other Pushover call; sendPushover stays
    // silent while Pushover is globally disabled or unconfigured.
    if (cfg.pushoverOnSnipe && config.pushover) {
      const name = cfg.name || 'Unnamed snipe';
      const shortMint = `${mint.slice(0, 4)}…${mint.slice(-4)}`;
      const spent = Number(
        results.filter((r) => r.ok).reduce((sum, r) => sum + r.solAmount, 0).toFixed(4),
      );
      sendPushover(config.pushover, {
        title: status === 'bought' ? `Sniped: ${name}` : `Snipe failed: ${name}`,
        message: status === 'bought'
          ? `Bought ${spent} SOL of ${shortMint} (${succeeded}/${results.length} wallets)${viaKeyword ? ` — keyword "${viaKeyword}"` : ''}`
          : `Buy of ${shortMint} failed on all ${results.length} wallet${results.length === 1 ? '' : 's'}: ${results.find((r) => r.error)?.error ?? 'unknown error'}`,
        url: buildContractUrl(mint, config.contractLinkTemplates),
        urlTitle: 'Open Chart',
      });
    }
  }
}
