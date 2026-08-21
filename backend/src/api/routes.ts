import { Router, static as expressStatic, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { getStorageProvider, isHostedMode } from '../storage/index.js';
import type { GatewayManager } from '../discord/gatewayManager.js';
import type { WsServer } from '../ws/server.js';
import { processDiscordMessage, formatCommandOptions } from '../utils/messageProcessor.js';
import { classifyAddresses, MAX_MINT_BATCH } from '../utils/mintCheck.js';
import { processTelegramMessage } from '../telegram/messageProcessor.js';
import type { FrontendMessage, SoundType, ChannelRef, CategoryRef, GuildInfo, TradingConfig, TradingWallet, SnipingConfig, SnipeConfig, LimitSell, ResnipeMode, SnipeKeywordMap, FeedHotkeys } from '../discord/types.js';
import { expandRoomChannels, stripDerivedChannels } from '../discord/roomCategories.js';
import { slotsharkBuy, extractSignature, type SlotsharkResult } from '../utils/slotshark.js';
import { maskToken } from '../auth/encryption.js';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import type { TelegramClientManager } from '../telegram/clientManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Same TRENCHCORD_DATA_DIR convention as config/store.ts: on iOS the bundle
// directory is read-only, so the env override is what makes this writable.
const SOUNDS_DIR = join(process.env.TRENCHCORD_DATA_DIR || join(__dirname, '../../data'), 'sounds');
if (!existsSync(SOUNDS_DIR)) mkdirSync(SOUNDS_DIR, { recursive: true });

// Resolved "used /command" arguments by message id, so re-hovers and pop-out
// windows don't repeat the Discord request. Insertion-ordered, oldest evicted.
const interactionArgsCache = new Map<string, string>();
const INTERACTION_ARGS_CACHE_MAX = 500;

/**
 * Keep only well-formed category subscriptions, with ids as strings: they come
 * straight from a client body and are matched against gateway ids later.
 */
function sanitizeCategories(input: any): CategoryRef[] {
  if (!Array.isArray(input)) return [];
  const out: CategoryRef[] = [];
  for (const raw of input) {
    const guildId = typeof raw?.guildId === 'string' ? raw.guildId : '';
    const categoryId = typeof raw?.categoryId === 'string' ? raw.categoryId : '';
    if (!guildId || !categoryId) continue;
    if (out.some((c) => c.categoryId === categoryId)) continue;
    out.push({
      guildId,
      categoryId,
      ...(typeof raw.guildName === 'string' && { guildName: raw.guildName }),
      ...(typeof raw.categoryName === 'string' && { categoryName: raw.categoryName }),
      excludedChannelIds: Array.isArray(raw.excludedChannelIds)
        ? [...new Set(raw.excludedChannelIds.filter((id: any) => typeof id === 'string'))] as string[]
        : [],
    });
  }
  return out;
}

function safeError(err: any, fallback: string): string {
  if (!isHostedMode()) return err?.message ?? fallback;
  console.error(`[API] ${fallback}:`, err?.message ?? err);
  return fallback;
}

// --- Trading (Slotshark) ---

// Base58, 32-44 chars. Deliberately NOT the >=40 heuristic from
// utils/contract.ts -- that exists to suppress false positives in chat prose,
// and is too strict for an address the user is deliberately acting on.
const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// Backstop only; the real guard is that the amount must match a configured
// preset, which the UI is the only thing able to produce.
const MAX_SOL_PER_TRADE = 100;
// Tip and priority fee are per-transaction amounts in SOL; anything approaching
// 1 SOL is a typo, not an intent.
const MAX_FEE_SOL = 1;
// Floor for a single wallet's share when splitting. Exists so a big wallet
// count can't turn a buy into dust orders that Slotshark rejects one by one.
const MIN_SOL_PER_BUY = 0.0001;
const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Divide `totalSol` into `parts` amounts that sum back to exactly `totalSol`.
 * Done in integer lamports: splitting 5 SOL three ways in floating point gives
 * 1.6666666666666667 each, which sums to more than was clicked. The odd
 * lamports land on the first wallets rather than being dropped.
 */
export function splitLamports(totalSol: number, parts: number): number[] {
  const total = Math.round(totalSol * LAMPORTS_PER_SOL);
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from(
    { length: parts },
    (_, i) => (base + (i < remainder ? 1 : 0)) / LAMPORTS_PER_SOL,
  );
}

/** Human-readable reason for a failed Slotshark call. */
export function buyErrorMessage(result: Extract<SlotsharkResult, { ok: false }>): string {
  switch (result.kind) {
    case 'timeout':
      // Deliberately not phrased as a failure: with retries:true the swap can
      // still land after we give up, and "failed" invites a re-click that
      // double-buys.
      return "Slotshark didn't respond in time — the buy may still have landed. Check your dashboard before retrying.";
    case 'network':
      return 'Could not reach Slotshark.';
    case 'auth':
      return 'Slotshark rejected your API token.';
    case 'rate_limit':
      return 'Slotshark rate limit hit.';
    case 'upstream':
      return 'Slotshark is unavailable right now.';
    default:
      return result.message || 'Slotshark rejected the buy.';
  }
}

const TRADE_BUTTON_SIZES: readonly string[] = ['sm', 'md', 'lg'];
const BUY_SITE_PLATFORMS: readonly string[] = ['default', 'axiom', 'padre', 'bloom', 'gmgn', 'fomo', 'custom'];
// #rgb / #rrggbb / #rrggbbaa -- the shapes ColorPickerWithAlpha produces. These
// land in a style attribute, so anything else is rejected rather than coerced.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function sanitizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}

/**
 * The buy-site template is handed straight to window.open, so only http(s) and
 * the tg: / Telegram bot links the presets already use are accepted -- never a
 * javascript: or data: URL. Blank clears it (falls back to the default site).
 */
function sanitizeBuySiteUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, 500);
  if (!trimmed) return '';
  return /^(https?:\/\/|tg:\/\/)/i.test(trimmed) ? trimmed : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** null (auto) unless the value is a usable SOL fee amount. */
function sanitizeFee(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_FEE_SOL) return null;
  return n;
}

/**
 * Normalise a client-supplied trading config. Everything here is user-owned
 * preference rather than a security boundary -- but the buy route reads these
 * values back as trusted input, so they are bounded on the way in too.
 */
function sanitizeTradingConfig(incoming: any, existing: TradingConfig): TradingConfig {
  if (!incoming || typeof incoming !== 'object') return existing;

  const wallets: TradingWallet[] = Array.isArray(incoming.wallets)
    ? incoming.wallets
        .filter((w: any) => w && typeof w.address === 'string' && SOL_ADDRESS_RE.test(w.address.trim()))
        .slice(0, 20)
        .map((w: any) => ({
          id: typeof w.id === 'string' && w.id ? w.id : randomUUID(),
          label: typeof w.label === 'string' ? w.label.trim().slice(0, 40) : '',
          // Case-sensitive: trim only, never lowercase.
          address: w.address.trim(),
        }))
    : existing.wallets;

  // Filtered against the wallet list in the same payload, so removing a wallet
  // can never leave a buy pointing at an id that no longer exists. An empty
  // result is kept as-is: switching every wallet off is a deliberate state.
  const legacyActiveId = incoming.activeWalletId;
  const activeWalletIds: string[] = Array.isArray(incoming.activeWalletIds)
    ? [...new Set(
        incoming.activeWalletIds.filter(
          (id: any) => typeof id === 'string' && wallets.some((w) => w.id === id),
        ),
      )] as string[]
    // A pre-multi-wallet payload (an older settings backup) names one wallet in
    // `activeWalletId`. Honour it, so restoring a backup doesn't come back with
    // every wallet switched off.
    : typeof legacyActiveId === 'string' && wallets.some((w) => w.id === legacyActiveId)
      ? [legacyActiveId]
      : (existing.activeWalletIds ?? []).filter((id) => wallets.some((w) => w.id === id));

  const presetAmounts = Array.isArray(incoming.presetAmounts)
    ? incoming.presetAmounts
        .map((a: any) => Number(a))
        .filter((a: number) => Number.isFinite(a) && a > 0 && a <= MAX_SOL_PER_TRADE)
        .slice(0, 5)
    : existing.presetAmounts;

  return {
    enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : existing.enabled,
    region: incoming.region === 'eu' ? 'eu' : 'us',
    wallets,
    activeWalletIds,
    walletAmountMode: incoming.walletAmountMode === 'split' ? 'split' : 'per_wallet',
    presetAmounts,
    slippage: Math.round(clampNumber(incoming.slippage, 1, 10000, existing.slippage)),
    tip: sanitizeFee(incoming.tip),
    priorityFee: sanitizeFee(incoming.priorityFee),
    antimev: typeof incoming.antimev === 'boolean' ? incoming.antimev : existing.antimev,
    requireDoubleClick:
      typeof incoming.requireDoubleClick === 'boolean'
        ? incoming.requireDoubleClick
        : existing.requireDoubleClick,
    buttonSize: TRADE_BUTTON_SIZES.includes(incoming.buttonSize)
      ? incoming.buttonSize
      : existing.buttonSize,
    buttonBgColor: sanitizeColor(incoming.buttonBgColor, existing.buttonBgColor),
    buttonTextColor: sanitizeColor(incoming.buttonTextColor, existing.buttonTextColor),
    showContractPill:
      typeof incoming.showContractPill === 'boolean' ? incoming.showContractPill : existing.showContractPill,
    openSiteOnBuy:
      typeof incoming.openSiteOnBuy === 'boolean' ? incoming.openSiteOnBuy : existing.openSiteOnBuy,
    buySitePlatform: BUY_SITE_PLATFORMS.includes(incoming.buySitePlatform)
      ? incoming.buySitePlatform
      : existing.buySitePlatform,
    buySiteUrl: sanitizeBuySiteUrl(incoming.buySiteUrl, existing.buySiteUrl),
  };
}

const MAX_SNIPE_CONFIGS = 50;
const MAX_SNIPE_USERS = 50;
const MAX_LIMIT_SELLS = 10;

/** Finite number >= min, or null (= no bound / inherit). */
function sanitizeOptionalNumber(value: unknown, min: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : null;
}

// Same base58 shape Slotshark accepts for mints. Entries that don't parse are
// dropped rather than kept broken -- a malformed mint would 4xx every snipe.
const SNIPE_MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,48}$/;
const MAX_SNIPE_KEYWORDS = 50;

function sanitizeSnipeKeywordMap(incoming: unknown): SnipeKeywordMap[] {
  if (!Array.isArray(incoming)) return [];
  const out: SnipeKeywordMap[] = [];
  for (const entry of incoming.slice(0, MAX_SNIPE_KEYWORDS)) {
    if (!entry || typeof entry !== 'object') continue;
    const keyword = typeof (entry as any).keyword === 'string' ? (entry as any).keyword.trim().slice(0, 64) : '';
    const mint = typeof (entry as any).mint === 'string' ? (entry as any).mint.trim() : '';
    // Empty rows are kept as drafts (the UI adds blank rows); rows with a
    // malformed non-empty mint are dropped. The engine only fires on rows
    // where both fields are valid.
    if (!keyword && !mint) continue;
    if (mint && !SNIPE_MINT_RE.test(mint)) continue;
    out.push({ keyword, mint });
  }
  return out;
}

function sanitizeLimitSells(incoming: unknown): LimitSell[] {
  if (!Array.isArray(incoming)) return [];
  const out: LimitSell[] = [];
  for (const row of incoming.slice(0, MAX_LIMIT_SELLS)) {
    if (!row || typeof row !== 'object') continue;
    const type = row.type === 'pnl' ? 'pnl' : row.type === 'time' ? 'time' : null;
    if (!type) continue;
    const rawValue = Number(row.value);
    if (!Number.isFinite(rawValue)) continue;
    // time: 1s .. 24h after the buy. pnl: can't lose more than 100%; profit
    // thresholds are uncapped.
    const value =
      type === 'time'
        ? Math.round(clampNumber(rawValue, 1, 86_400, 0))
        : Math.max(-100, rawValue);
    if (type === 'time' && value <= 0) continue;
    const sellPercent = Math.round(clampNumber(row.sellPercent, 1, 100, 0));
    if (sellPercent <= 0) continue;
    out.push({
      type,
      value,
      sellPercent,
      tip: sanitizeFee(row.tip),
      priorityFee: sanitizeFee(row.priorityFee),
    });
  }
  return out;
}

/**
 * Normalise a client-supplied sniping config. Like sanitizeTradingConfig, the
 * snipe engine reads these values back as trusted input on every auto-buy, so
 * every spend-relevant number is bounded here.
 */
function sanitizeSnipingConfig(incoming: any, existing: SnipingConfig, trading: TradingConfig): SnipingConfig {
  if (!incoming || typeof incoming !== 'object') return existing;

  const configs: SnipeConfig[] = Array.isArray(incoming.configs)
    ? incoming.configs
        .slice(0, MAX_SNIPE_CONFIGS)
        .map((c: any): SnipeConfig | null => {
          if (!c || typeof c !== 'object' || typeof c.roomId !== 'string') return null;
          // A zero amount is kept rather than dropped -- it's a half-filled
          // draft the user is still editing. The engine refuses to fire any
          // config below MIN_SOL_PER_BUY.
          const solAmount = clampNumber(c.solAmount, 0, MAX_SOL_PER_TRADE, 0);
          const minMarketCap = sanitizeOptionalNumber(c.minMarketCap, 0);
          const maxMarketCap = sanitizeOptionalNumber(c.maxMarketCap, 0);
          // Re-snipe: new configs carry mode + seconds/count; configs saved
          // before the mode existed only have the legacy minutes cooldown,
          // which migrates to cooldown mode here.
          const legacyCooldownMin = sanitizeOptionalNumber(c.resnipeCooldownMin, 1);
          const cooldownSec = sanitizeOptionalNumber(c.resnipeCooldownSec, 1)
            ?? (legacyCooldownMin !== null ? legacyCooldownMin * 60 : null);
          const maxCount = sanitizeOptionalNumber(c.resnipeMaxCount, 1);
          const resnipeMode: ResnipeMode =
            c.resnipeMode === 'cooldown' || c.resnipeMode === 'limit' || c.resnipeMode === 'never'
              ? c.resnipeMode
              : legacyCooldownMin !== null ? 'cooldown' : 'never';
          return {
            id: typeof c.id === 'string' && c.id ? c.id : randomUUID(),
            name: typeof c.name === 'string' ? c.name.trim().slice(0, 40) : '',
            enabled: c.enabled === true,
            roomId: c.roomId,
            mode: c.mode === 'users' ? 'users' : 'room',
            users: Array.isArray(c.users)
              ? c.users
                  .filter((u: any) => typeof u === 'string' && u.trim())
                  .map((u: string) => u.trim().slice(0, 64))
                  .slice(0, MAX_SNIPE_USERS)
              : [],
            solAmount,
            // Same rule as activeWalletIds: only ids that exist in the trading
            // wallet list survive, so a deleted wallet can't be sniped from.
            walletIds: Array.isArray(c.walletIds)
              ? [...new Set(
                  c.walletIds.filter(
                    (id: any) => typeof id === 'string' && trading.wallets.some((w) => w.id === id),
                  ),
                )] as string[]
              : [],
            slippage:
              sanitizeOptionalNumber(c.slippage, 1) !== null
                ? Math.round(clampNumber(c.slippage, 1, 10000, trading.slippage))
                : null,
            tip: sanitizeFee(c.tip),
            priorityFee: sanitizeFee(c.priorityFee),
            // Drop an inverted band rather than silently swapping: the user
            // typed it, the UI shows both fields, and a swap would buy tokens
            // they explicitly bounded out.
            minMarketCap,
            maxMarketCap:
              minMarketCap !== null && maxMarketCap !== null && maxMarketCap < minMarketCap
                ? null
                : maxMarketCap,
            resnipeMode,
            // Cooldown clamped to [1s, 7 days]; count to [1, 100] -- both are
            // spend multipliers, so they stay bounded.
            resnipeCooldownSec:
              cooldownSec !== null ? Math.round(clampNumber(cooldownSec, 1, 604800, 60)) : null,
            resnipeMaxCount:
              maxCount !== null ? Math.round(clampNumber(maxCount, 1, 100, 1)) : null,
            trigger: c.trigger === 'keyword' ? 'keyword' : 'contract',
            keywordMap: sanitizeSnipeKeywordMap(c.keywordMap),
            limitSells: sanitizeLimitSells(c.limitSells),
            pushoverOnSnipe: c.pushoverOnSnipe === true,
            skipIfBought: c.skipIfBought === true,
          };
        })
        .filter((c: SnipeConfig | null): c is SnipeConfig => c !== null)
    : existing.configs;

  return {
    enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : existing.enabled,
    configs,
  };
}

// Same single-key rule as room hotkeys; unknown keys are dropped.
const FEED_HOTKEY_KEYS = ['contracts', 'mentions', 'keywords', 'snipes', 'alerts', 'dms'] as const;

function sanitizeFeedHotkeys(incoming: any): FeedHotkeys {
  const out: FeedHotkeys = {};
  if (!incoming || typeof incoming !== 'object') return out;
  for (const key of FEED_HOTKEY_KEYS) {
    const v = incoming[key];
    if (typeof v === 'string' && v.length === 1) out[key] = v.toLowerCase();
    else out[key] = null;
  }
  return out;
}

// Custom display names are free text rendered in the UI; keep them short and
// drop anything that isn't a plain non-empty string.
function sanitizeCustomUserNames(incoming: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!incoming || typeof incoming !== 'object') return out;
  for (const [id, name] of Object.entries(incoming)) {
    if (typeof name !== 'string') continue;
    const trimmed = name.trim().slice(0, 80);
    if (trimmed) out[id] = trimmed;
  }
  return out;
}

// Exact-duplicate suppression. Not redundant with the frontend's in-flight
// guard: the split-grid layout can render one message in two panes at once, and
// the same CA can appear across rooms, so two live button rows is a real state.
const buyInFlight = new Set<string>();
const buyCooldown = new Map<string, number>();
const BUY_COOLDOWN_MS = 1500;

function sweepBuyCooldown(now: number): void {
  for (const [key, expires] of buyCooldown) {
    if (expires <= now) buyCooldown.delete(key);
  }
}

const soundFileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
  cb(null, allowed.includes(extname(file.originalname).toLowerCase()));
};

const upload = multer({
  storage: multer.diskStorage({
    destination: SOUNDS_DIR,
    filename: (_req, file, cb) => {
      const soundType = _req.params.soundType as string;
      cb(null, `${soundType}${extname(file.originalname)}`);
    },
  }),
  fileFilter: soundFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

const channelSoundUpload = multer({
  storage: multer.diskStorage({
    destination: SOUNDS_DIR,
    filename: (_req, file, cb) => {
      const channelId = _req.params.channelId as string;
      cb(null, `ch_${channelId}${extname(file.originalname)}`);
    },
  }),
  fileFilter: soundFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

function getUserId(req: any): string {
  return req.userId ?? 'local';
}

export function createRouter(wsServer: WsServer): Router {
  const router = Router();
  const storage = getStorageProvider();

  /**
   * Guild list used to resolve the categories a room watches. Unlike
   * requireGateway this never connects and never errors: with no gateway up a
   * room simply comes back with its individually picked channels, and the
   * client refetches once `gateway_ready` lands.
   */
  async function categoryGuilds(req: any): Promise<GuildInfo[]> {
    const { getUserGateway } = await import('../index.js');
    const gw = getUserGateway(getUserId(req));
    return gw ? gw.getGuilds() : [];
  }

  async function requireGateway(req: any, res: any): Promise<GatewayManager | null> {
    const { getUserGateway, connectGateway } = await import('../index.js');
    const userId = getUserId(req);
    let gw = getUserGateway(userId);

    if (!gw) {
      const tokens = await storage.getTokens(userId);
      if (tokens.length > 0) {
        gw = connectGateway(tokens, wsServer, userId);
      }
    }

    if (!gw) {
      res.status(503).json({ error: 'Discord not connected. Please configure your token first.' });
      return null;
    }
    return gw;
  }

  // Pending Telegram auth sessions (phone -> client, kept alive until verify completes)
  const pendingTelegramAuth = new Map<string, { client: TelegramClient; phoneCodeHash: string; phone: string }>();

  async function requireTelegramManager(req: any, res: any): Promise<TelegramClientManager | null> {
    const { getUserTelegram, connectTelegram } = await import('../index.js');
    const userId = getUserId(req);
    let tg = getUserTelegram(userId);

    if (!tg) {
      const config = await storage.getConfig(userId);
      if (config.telegramSessions?.length && config.telegramApiId && config.telegramApiHash) {
        tg = await connectTelegram(
          parseInt(config.telegramApiId),
          config.telegramApiHash,
          config.telegramSessions,
          wsServer,
          userId,
        );
      }
    }

    if (!tg) {
      res.status(503).json({ error: 'Telegram not connected. Please configure Telegram first.' });
      return null;
    }
    return tg;
  }

  // --- Auth / Token Management ---

  router.get('/auth/status', async (req, res) => {
    const userId = getUserId(req);
    const tokens = await storage.getTokens(userId);
    const { getUserGateway, getUserTelegram } = await import('../index.js');
    const gw = getUserGateway(userId);
    const config = await storage.getConfig(userId);
    const tg = getUserTelegram(userId);
    res.json({
      configured: tokens.length > 0,
      connected: gw !== null,
      telegramConfigured: (config.telegramSessions?.length ?? 0) > 0,
      telegramConnected: tg !== null && tg.isConnected(),
      telegramAccountCount: config.telegramSessions?.length ?? 0,
      telegramHasApiCredentials: !!(config.telegramApiId && config.telegramApiHash),
    });
  });

  router.get('/auth/profile', async (req, res) => {
    if (!isHostedMode()) {
      return res.json({ email: null, provider: 'local', createdAt: null });
    }

    const userId = getUserId(req);
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return res.status(500).json({ error: 'Server misconfigured' });

    try {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await sb.auth.admin.getUserById(userId);
      if (error || !data.user) return res.status(404).json({ error: 'User not found' });

      const user = data.user;
      const provider = user.app_metadata?.provider ?? 'email';
      const discordMeta = user.user_metadata ?? {};

      res.json({
        id: user.id,
        email: user.email ?? null,
        provider,
        discordUsername: provider === 'discord' ? (discordMeta.full_name ?? discordMeta.name ?? null) : null,
        discordAvatar: provider === 'discord' ? (discordMeta.avatar_url ?? null) : null,
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to fetch profile') });
    }
  });

  router.post('/auth/token', async (req, res) => {
    const userId = getUserId(req);
    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'A valid Discord token is required.' });
    }

    const tokens = token.includes(',')
      ? token.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [token.trim()];

    try {
      await storage.setTokens(userId, tokens);
      const { connectGateway } = await import('../index.js');
      connectGateway(tokens, wsServer, userId);
      res.json({ success: true, tokenCount: tokens.length });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to save token or connect') });
    }
  });

  router.post('/auth/disconnect', async (req, res) => {
    const userId = getUserId(req);
    await storage.setTokens(userId, []);
    const { disconnectGateway } = await import('../index.js');
    disconnectGateway(userId);
    res.json({ success: true });
  });

  router.get('/auth/tokens', async (req, res) => {
    const userId = getUserId(req);
    const tokens = await storage.getTokens(userId);
    const { getUserGateway } = await import('../index.js');
    const invalidIndices = new Set(getUserGateway(userId)?.getInvalidTokenIndices() ?? []);
    const masked = tokens.map((t, index) => {
      const len = t.length;
      const visible = Math.min(4, Math.floor(len / 4));
      const maskedToken = len <= 8
        ? '*'.repeat(len)
        : t.slice(0, visible) + '*'.repeat(Math.max(4, len - visible * 2)) + t.slice(-visible);
      return { index, masked: maskedToken, invalid: invalidIndices.has(index) };
    });
    res.json({ tokens: masked, count: tokens.length });
  });

  router.post('/auth/tokens/add', async (req, res) => {
    const userId = getUserId(req);
    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'A valid Discord token is required.' });
    }
    const existing = await storage.getTokens(userId);
    const trimmed = token.trim();
    if (existing.includes(trimmed)) {
      return res.status(409).json({ error: 'This token is already configured.' });
    }
    const updated = [...existing, trimmed];
    await storage.setTokens(userId, updated);

    try {
      const { connectGateway } = await import('../index.js');
      connectGateway(updated, wsServer, userId);
      res.json({ success: true, tokenCount: updated.length });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to connect') });
    }
  });

  router.delete('/auth/tokens/:index', async (req, res) => {
    const userId = getUserId(req);
    const index = parseInt(req.params.index, 10);
    const existing = await storage.getTokens(userId);
    if (isNaN(index) || index < 0 || index >= existing.length) {
      return res.status(400).json({ error: 'Invalid token index.' });
    }
    const updated = existing.filter((_, i) => i !== index);
    await storage.setTokens(userId, updated);

    try {
      if (updated.length > 0) {
        const { connectGateway } = await import('../index.js');
        connectGateway(updated, wsServer, userId);
      } else {
        const { disconnectGateway } = await import('../index.js');
        disconnectGateway(userId);
      }
      res.json({ success: true, tokenCount: updated.length });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to reconnect') });
    }
  });

  // --- Telegram Auth ---

  // Shared tail of the two login paths (code-only and 2FA). Persists the new
  // session and attaches it to the running manager, refusing an account that is
  // already connected so the user doesn't end up with duplicate logins.
  async function finishTelegramLogin(
    userId: string,
    client: TelegramClient,
    numericApiId: number,
    apiHash: string,
  ): Promise<{ status: number; body: any }> {
    const { addTelegramSession, getUserTelegram } = await import('../index.js');

    const me = await client.getMe() as { id: { toString(): string } };
    const accountId = me.id.toString();
    const alreadyConnected = getUserTelegram(userId)
      ?.getAccounts()
      .some((a) => a.accountId === accountId);

    if (alreadyConnected) {
      // Drop the login we just created so it doesn't linger in the user's
      // Telegram device list as an orphan.
      try {
        await client.invoke(new (await import('teleproto/tl/index.js')).Api.auth.LogOut());
      } catch {}
      await client.disconnect().catch(() => {});
      return { status: 409, body: { error: 'This Telegram account is already connected.' } };
    }

    const sessionString = client.session.save() as unknown as string;
    // Drop the throwaway login client before the manager opens its own
    // connection: two live connections on one auth key risk AUTH_KEY_DUPLICATED.
    // disconnect() keeps the session valid, unlike logOut().
    await client.disconnect().catch(() => {});

    const config = await storage.getConfig(userId);
    const updatedSessions = [...(config.telegramSessions ?? []), sessionString];
    await storage.updateConfig(userId, { telegramSessions: updatedSessions });

    await addTelegramSession(userId, sessionString, numericApiId, apiHash, updatedSessions, wsServer);
    return { status: 200, body: { success: true, accountCount: updatedSessions.length } };
  }

  router.post('/auth/telegram/start', async (req, res) => {
    const userId = getUserId(req);
    const { phoneNumber } = req.body;

    // Credentials are only required for the first account - later ones reuse the
    // stored API ID/hash, so the user just enters a phone number.
    const storedConfig = await storage.getConfig(userId);
    const apiId = req.body.apiId ?? storedConfig.telegramApiId;
    const apiHash = req.body.apiHash ?? storedConfig.telegramApiHash;

    if (!apiId || !apiHash) {
      return res.status(400).json({ error: 'apiId and apiHash are required.' });
    }
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required.' });
    }

    try {
      const numericApiId = parseInt(apiId, 10);
      if (isNaN(numericApiId)) {
        return res.status(400).json({ error: 'apiId must be a number.' });
      }

      const session = new StringSession('');
      const client = new TelegramClient(session, numericApiId, apiHash, {
        connectionRetries: 5,
      });

      await client.connect();

      const result = await client.sendCode(
        { apiId: numericApiId, apiHash },
        phoneNumber,
      );

      pendingTelegramAuth.set(userId, {
        client,
        phoneCodeHash: result.phoneCodeHash,
        phone: phoneNumber,
      });

      // Auto-cleanup after 5 minutes if not completed
      setTimeout(() => {
        const p = pendingTelegramAuth.get(userId);
        if (p && p.phone === phoneNumber) {
          p.client.disconnect().catch(() => {});
          pendingTelegramAuth.delete(userId);
        }
      }, 5 * 60 * 1000);

      await storage.updateConfig(userId, {
        telegramApiId: String(numericApiId),
        telegramApiHash: apiHash,
      });

      res.json({ success: true, phoneCodeHash: result.phoneCodeHash });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to start Telegram auth') });
    }
  });

  router.post('/auth/telegram/verify', async (req, res) => {
    const userId = getUserId(req);
    const { phoneCode, password } = req.body;

    const pending = pendingTelegramAuth.get(userId);
    if (!pending) {
      return res.status(400).json({ error: 'No pending Telegram auth. Call /auth/telegram/start first.' });
    }

    if (!phoneCode) {
      return res.status(400).json({ error: 'phoneCode is required.' });
    }

    try {
      const config = await storage.getConfig(userId);
      const numericApiId = parseInt(config.telegramApiId ?? '0', 10);
      const apiHash = config.telegramApiHash ?? '';

      try {
        await pending.client.invoke(
          new (await import('teleproto/tl/index.js')).Api.auth.SignIn({
            phoneNumber: pending.phone,
            phoneCodeHash: pending.phoneCodeHash,
            phoneCode,
          }),
        );
      } catch (err: any) {
        if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          if (!password) {
            return res.json({ success: false, needs2FA: true });
          }
          await pending.client.signInWithPassword(
            { apiId: numericApiId, apiHash },
            { password: () => password, onError: (err) => { throw err; } },
          );
        } else {
          throw err;
        }
      }

      pendingTelegramAuth.delete(userId);
      const result = await finishTelegramLogin(userId, pending.client, numericApiId, apiHash);
      res.status(result.status).json(result.body);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to verify Telegram code') });
    }
  });

  router.post('/auth/telegram/2fa', async (req, res) => {
    const userId = getUserId(req);
    const { password } = req.body;

    const pending = pendingTelegramAuth.get(userId);
    if (!pending) {
      return res.status(400).json({ error: 'No pending Telegram auth.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'password is required.' });
    }

    try {
      const config = await storage.getConfig(userId);
      const numericApiId = parseInt(config.telegramApiId ?? '0', 10);
      const apiHash = config.telegramApiHash ?? '';

      await pending.client.signInWithPassword(
        { apiId: numericApiId, apiHash },
        { password: () => password, onError: (err) => { throw err; } },
      );

      pendingTelegramAuth.delete(userId);
      const result = await finishTelegramLogin(userId, pending.client, numericApiId, apiHash);
      res.status(result.status).json(result.body);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to verify 2FA password') });
    }
  });

  router.get('/auth/telegram/accounts', async (req, res) => {
    const userId = getUserId(req);
    const config = await storage.getConfig(userId);
    const sessions = config.telegramSessions ?? [];
    const { getUserTelegram } = await import('../index.js');
    const live = getUserTelegram(userId)?.getAccounts() ?? [];

    // A stored session with no live client (nothing connected yet, or the
    // manager is still starting) still gets a row, so the list always matches
    // what is actually saved.
    const accounts = sessions.map((_, index) => live[index] ?? {
      index,
      accountId: null,
      username: null,
      firstName: null,
      connected: false,
      invalid: false,
    });

    res.json({ accounts, count: accounts.length });
  });

  router.delete('/auth/telegram/sessions/:index', async (req, res) => {
    const userId = getUserId(req);
    const index = parseInt(req.params.index, 10);
    const config = await storage.getConfig(userId);
    const sessions = config.telegramSessions ?? [];

    if (isNaN(index) || index < 0 || index >= sessions.length) {
      return res.status(400).json({ error: 'Invalid Telegram account index.' });
    }

    try {
      const { removeTelegramSession } = await import('../index.js');
      await removeTelegramSession(userId, index);
      const updated = sessions.filter((_, i) => i !== index);
      await storage.updateConfig(userId, { telegramSessions: updated });
      res.json({ success: true, count: updated.length });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to remove Telegram account') });
    }
  });

  router.post('/auth/telegram/disconnect', async (req, res) => {
    const userId = getUserId(req);
    const { disconnectTelegram, logOutAllTelegramSessions } = await import('../index.js');
    // Revoke the logins before dropping them, so they stop showing up under the
    // user's active Telegram sessions.
    await logOutAllTelegramSessions(userId).catch(() => {});
    await storage.updateConfig(userId, { telegramSessions: [] });
    disconnectTelegram(userId);
    res.json({ success: true });
  });

  router.get('/auth/telegram/status', async (req, res) => {
    const userId = getUserId(req);
    const config = await storage.getConfig(userId);
    const { getUserTelegram } = await import('../index.js');
    const tg = getUserTelegram(userId);
    res.json({
      configured: (config.telegramSessions?.length ?? 0) > 0,
      connected: tg !== null && tg.isConnected(),
      hasApiCredentials: !!(config.telegramApiId && config.telegramApiHash),
      sessionCount: config.telegramSessions?.length ?? 0,
    });
  });

  // --- Telegram Media & Avatars ---

  const avatarCache = new Map<string, { buffer: Buffer; timestamp: number }>();
  const AVATAR_CACHE_TTL = 3600_000; // 1 hour

  router.get('/telegram/avatar/:peerId', async (req, res) => {
    const { peerId } = req.params;
    const cached = avatarCache.get(peerId);
    if (cached && Date.now() - cached.timestamp < AVATAR_CACHE_TTL) {
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(cached.buffer);
    }

    const tg = await requireTelegramManager(req, res);
    if (!tg) return;
    await tg.waitUntilReady();

    const buffer = await tg.downloadProfilePhoto(peerId);
    if (!buffer) {
      return res.status(404).json({ error: 'Profile photo not found' });
    }

    avatarCache.set(peerId, { buffer, timestamp: Date.now() });
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  });

  const mediaCache = new Map<string, { buffer: Buffer; mimeType: string; timestamp: number }>();
  const MEDIA_CACHE_TTL = 3600_000;

  // Byte-range support is what lets a <video> seek, paint its preview frame
  // (the moov atom often sits at the end of an mp4), and play at all on iOS.
  function sendMediaBuffer(req: Request, res: Response, buffer: Buffer, mimeType: string) {
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Accept-Ranges', 'bytes');
    const size = buffer.length;
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (match && (match[1] || match[2])) {
      // suffix form "bytes=-N" = the last N bytes
      const start = match[1] ? parseInt(match[1], 10) : Math.max(0, size - parseInt(match[2], 10));
      const end = match[1] && match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
      if (start >= size || end < start) {
        res.status(416).set('Content-Range', `bytes */${size}`).end();
        return;
      }
      res.status(206).set('Content-Range', `bytes ${start}-${end}/${size}`);
      res.send(buffer.subarray(start, end + 1));
      return;
    }
    res.send(buffer);
  }

  router.get('/telegram/media/:chatId/:messageId', async (req, res) => {
    const { chatId, messageId } = req.params;
    const cacheKey = `${chatId}:${messageId}`;

    const cached = mediaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < MEDIA_CACHE_TTL) {
      return sendMediaBuffer(req, res, cached.buffer, cached.mimeType);
    }

    const tg = await requireTelegramManager(req, res);
    if (!tg) return;
    await tg.waitUntilReady();

    const result = await tg.downloadMediaByIds(chatId, parseInt(messageId, 10));
    if (!result) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (result.buffer.length < 10_000_000) {
      mediaCache.set(cacheKey, { ...result, timestamp: Date.now() });
    }
    sendMediaBuffer(req, res, result.buffer, result.mimeType);
  });

  // --- Telegram Chats ---

  router.get('/telegram/chats', async (req, res) => {
    const tg = await requireTelegramManager(req, res);
    if (!tg) return;
    await tg.waitUntilReady();
    const chats = await tg.getChats();
    res.json(chats);
  });

  // --- Channel History ---

  router.get('/history', async (req, res) => {
    const userId = getUserId(req);
    const guilds = await categoryGuilds(req);
    const rooms = (await storage.getRooms(userId)).map((room) => expandRoomChannels(room, guilds));
    const result: Record<string, FrontendMessage[]> = {};

    // Separate Discord and Telegram channels
    const discordChannelToRooms = new Map<string, string[]>();
    const telegramChannelToRooms = new Map<string, string[]>();

    for (const room of rooms) {
      for (const ch of room.channels) {
        const isTelegram = ch.source === 'telegram';
        const map = isTelegram ? telegramChannelToRooms : discordChannelToRooms;
        const existing = map.get(ch.channelId) ?? [];
        existing.push(room.id);
        map.set(ch.channelId, existing);
      }
    }

    // Fetch Discord history
    if (discordChannelToRooms.size > 0) {
      const { getUserGateway, connectGateway } = await import('../index.js');
      let gateway = getUserGateway(userId);
      if (!gateway) {
        const tokens = await storage.getTokens(userId);
        if (tokens.length > 0) {
          gateway = connectGateway(tokens, wsServer, userId);
        }
      }

      if (gateway) {
        await gateway.waitUntilReady();
        const BATCH_SIZE = 5;
        const channelIds = Array.from(discordChannelToRooms.keys());

        for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
          const batch = channelIds.slice(i, i + BATCH_SIZE);
          const fetches = batch.map(async (channelId) => {
            const rawMessages = await gateway!.fetchChannelMessages(channelId, 30);
            const roomIds = discordChannelToRooms.get(channelId) ?? [];
            for (const rawMsg of rawMessages) {
              const frontendMsg = processDiscordMessage(gateway!, rawMsg);
              for (const roomId of roomIds) {
                if (!result[roomId]) result[roomId] = [];
                result[roomId].push(frontendMsg);
              }
            }
          });
          await Promise.all(fetches);
        }
      }
    }

    // Fetch Telegram history
    if (telegramChannelToRooms.size > 0) {
      const { getUserTelegram } = await import('../index.js');
      const tg = getUserTelegram(userId);

      if (tg) {
        await tg.waitUntilReady();
        const BATCH_SIZE = 3;
        const chatIds = Array.from(telegramChannelToRooms.keys());

        for (let i = 0; i < chatIds.length; i += BATCH_SIZE) {
          const batch = chatIds.slice(i, i + BATCH_SIZE);
          const fetches = batch.map(async (chatId) => {
            const rawMessages = await tg.fetchMessages(chatId, 30);
            const roomIds = telegramChannelToRooms.get(chatId) ?? [];
            for (const rawMsg of rawMessages) {
              const frontendMsg = processTelegramMessage(rawMsg);
              for (const roomId of roomIds) {
                if (!result[roomId]) result[roomId] = [];
                result[roomId].push(frontendMsg);
              }
            }
          });
          await Promise.all(fetches);
        }
      }
    }

    for (const roomId of Object.keys(result)) {
      result[roomId].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const seen = new Set<string>();
      result[roomId] = result[roomId].filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    }

    res.json(result);
  });

  // --- Guilds & Channels ---

  router.get('/guilds', async (req, res) => {
    const gateway = await requireGateway(req, res);
    if (!gateway) return;
    await gateway.waitUntilReady();
    const guilds = gateway.getGuilds();
    res.json(guilds);
  });

  // Roles of one guild, for the room-config mute/highlight role pickers.
  router.get('/guilds/:guildId/roles', async (req, res) => {
    const gateway = await requireGateway(req, res);
    if (!gateway) return;
    await gateway.waitUntilReady();
    res.json(gateway.getGuildRoles(req.params.guildId));
  });

  router.get('/dm-channels', async (req, res) => {
    const gateway = await requireGateway(req, res);
    if (!gateway) return;
    await gateway.waitUntilReady();
    const dms = gateway.getDMChannels();
    res.json(dms);
  });

  // Users who reacted to a Discord message with a specific emoji.
  // `name` is the emoji name (unicode char for standard emoji); `id` is the
  // custom emoji id (omitted for standard emoji).
  router.get('/reactions/:channelId/:messageId', async (req, res) => {
    const { channelId, messageId } = req.params;
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!name) return res.status(400).json({ error: 'emoji name is required' });

    const gateway = await requireGateway(req, res);
    if (!gateway) return;
    await gateway.waitUntilReady();

    const emoji = id ? `${name}:${id}` : name;
    try {
      const users = await gateway.fetchReactionUsers(channelId, messageId, emoji);
      res.json(
        users.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.global_name || u.username,
          avatar: u.avatar,
          discriminator: u.discriminator,
        })),
      );
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to fetch reaction users') });
    }
  });

  // The full arguments a slash command was invoked with, formatted for the
  // "used /command" line. Discord leaves them out of the message payload, so
  // the frontend asks for them lazily -- only when the line is hovered, the
  // same way the official client fills its command tooltip. Answers are
  // cached: a command's arguments never change once the message exists.
  router.get('/interaction-data/:channelId/:messageId', async (req, res) => {
    const { channelId, messageId } = req.params;
    const cached = interactionArgsCache.get(messageId);
    if (cached !== undefined) return res.json({ args: cached });

    const gateway = await requireGateway(req, res);
    if (!gateway) return;
    await gateway.waitUntilReady();
    try {
      const options = await gateway.fetchMessageInteractionData(channelId, messageId);
      if (options === null) return res.status(502).json({ error: 'Failed to fetch interaction data' });
      const args = formatCommandOptions(options);
      if (interactionArgsCache.size >= INTERACTION_ARGS_CACHE_MAX) {
        const oldest = interactionArgsCache.keys().next().value;
        if (oldest !== undefined) interactionArgsCache.delete(oldest);
      }
      interactionArgsCache.set(messageId, args);
      res.json({ args });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to fetch interaction data') });
    }
  });

  // --- Rooms CRUD ---

  // Rooms go out with the channels of every category they watch folded into
  // `channels`, so everything downstream keeps reading one flat list.
  router.get('/rooms', async (req, res) => {
    const userId = getUserId(req);
    const [rooms, guilds] = await Promise.all([storage.getRooms(userId), categoryGuilds(req)]);
    res.json(rooms.map((room) => expandRoomChannels(room, guilds)));
  });

  router.get('/rooms/:id', async (req, res) => {
    const userId = getUserId(req);
    const room = await storage.getRoom(userId, req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(expandRoomChannels(room, await categoryGuilds(req)));
  });

  router.post('/rooms', async (req, res) => {
    const userId = getUserId(req);
    const { name, channels, categories, highlightedUsers, filteredUsers, filterEnabled, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const room = await storage.createRoom(userId, {
      name,
      channels: stripDerivedChannels(channels ?? []),
      categories: sanitizeCategories(categories),
      highlightedUsers: highlightedUsers ?? [],
      filteredUsers: filteredUsers ?? [],
      filterEnabled: filterEnabled ?? false,
      color: color ?? null,
    });
    res.status(201).json(expandRoomChannels(room, await categoryGuilds(req)));
  });

  router.put('/rooms/:id', async (req, res) => {
    const userId = getUserId(req);
    const { name, channels, categories, highlightedUsers, filteredUsers, filterEnabled, color, keywordPatterns, highlightMode, highlightedUserColors, highlightedRoles, hotkey } = req.body;
    const room = await storage.updateRoom(userId, req.params.id, {
      ...(name !== undefined && { name }),
      ...(channels !== undefined && { channels: stripDerivedChannels(channels) }),
      ...(categories !== undefined && { categories: sanitizeCategories(categories) }),
      ...(highlightedUsers !== undefined && { highlightedUsers }),
      ...(filteredUsers !== undefined && { filteredUsers }),
      ...(filterEnabled !== undefined && { filterEnabled }),
      ...(color !== undefined && { color }),
      ...(keywordPatterns !== undefined && { keywordPatterns }),
      ...(highlightMode !== undefined && { highlightMode }),
      ...(highlightedUserColors !== undefined && { highlightedUserColors }),
      ...(highlightedRoles !== undefined && { highlightedRoles }),
      ...(hotkey !== undefined && { hotkey }),
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(expandRoomChannels(room, await categoryGuilds(req)));
  });

  router.delete('/rooms/:id', async (req, res) => {
    const userId = getUserId(req);
    const deleted = await storage.deleteRoom(userId, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true });
  });

  // --- Global Config ---

  router.get('/config', async (req, res) => {
    const userId = getUserId(req);
    const fullConfig = await storage.getConfig(userId);
    const { discordTokens, telegramSessions, slotsharkApiToken, cloudDeviceToken, ...safeConfig } = fullConfig;
    const guilds = await categoryGuilds(req);
    res.json({ ...safeConfig, rooms: (safeConfig.rooms ?? []).map((room) => expandRoomChannels(room, guilds)) });
  });

  router.put('/config', async (req, res) => {
    const userId = getUserId(req);
    const { globalHighlightedUsers, contractDetection, guildColors, channelColors, dmColors, telegramColors, enabledGuilds, hiddenUsers, hiddenRoles, dmExcludedUsers, telegramDmsInAllDms, tgDmExcludedUsers, dmHiddenConversations, tgDmHiddenConversations, customUserNames, evmAddressColor, solAddressColor, openInDiscordApp, openInTelegramApp, mobileRoomBar, serverIconBadge, serverIconBadgeMobile, showEphemeralMessages, messageSounds, soundSettings, channelSounds, pushover, contractLinkTemplates, contractClickAction, showFullContractAddress, autoOpenHighlightedContracts, globalKeywordPatterns, keywordAlertsEnabled, desktopNotifications, mentionsUserEnabled, mentionsRoleEnabled, mentionsHereEnabled, mentionsEveryoneEnabled, mentionsBotsEnabled, badgeClickAction, notificationClickAction, chattingEnabled, dmReadSyncEnabled, messageDisplay, compactModeAvatars, compactModeNameOnce, roleColors, mobileZoomScale, splitLayout, paneRoomIds, paneLocks, gridMirror, seenAnnouncements, onboardingComplete, discordProxyUrl, trading, sniping, feedHotkeys, focusHotkey } = req.body;

    // The Discord proxy only makes sense in local mode (the connection leaves the
    // user's own machine). In hosted mode the server IP is fixed, and honouring a
    // user-supplied proxy would be an SSRF vector — so reject it there.
    if (discordProxyUrl !== undefined && isHostedMode()) {
      return res.status(400).json({ error: 'Proxy configuration is only available in the desktop app.' });
    }
    const existingConfig = await storage.getConfig(userId);
    const nextProxy = typeof discordProxyUrl === 'string' ? discordProxyUrl.trim() : '';
    const proxyChanged =
      discordProxyUrl !== undefined && nextProxy !== (existingConfig.discordProxyUrl ?? '');

    const config = await storage.updateConfig(userId, {
      ...(discordProxyUrl !== undefined && { discordProxyUrl: nextProxy }),
      ...(globalHighlightedUsers !== undefined && { globalHighlightedUsers }),
      ...(contractDetection !== undefined && { contractDetection }),
      ...(guildColors !== undefined && { guildColors }),
      ...(channelColors !== undefined && { channelColors }),
      ...(dmColors !== undefined && { dmColors }),
      ...(telegramColors !== undefined && { telegramColors }),
      ...(enabledGuilds !== undefined && { enabledGuilds }),
      ...(hiddenUsers !== undefined && { hiddenUsers }),
      ...(hiddenRoles !== undefined && { hiddenRoles }),
      ...(dmExcludedUsers !== undefined && {
        dmExcludedUsers: Array.isArray(dmExcludedUsers)
          ? dmExcludedUsers.filter((e: unknown): e is string => typeof e === 'string' && e.trim().length > 0)
          : [],
      }),
      ...(telegramDmsInAllDms !== undefined && { telegramDmsInAllDms: !!telegramDmsInAllDms }),
      ...(tgDmExcludedUsers !== undefined && {
        tgDmExcludedUsers: Array.isArray(tgDmExcludedUsers)
          ? tgDmExcludedUsers.filter((e: unknown): e is string => typeof e === 'string' && e.trim().length > 0)
          : [],
      }),
      ...(dmHiddenConversations !== undefined && {
        dmHiddenConversations: Array.isArray(dmHiddenConversations)
          ? dmHiddenConversations.filter((e: unknown): e is string => typeof e === 'string' && e.trim().length > 0)
          : [],
      }),
      ...(tgDmHiddenConversations !== undefined && {
        tgDmHiddenConversations: Array.isArray(tgDmHiddenConversations)
          ? tgDmHiddenConversations.filter((e: unknown): e is string => typeof e === 'string' && e.trim().length > 0)
          : [],
      }),
      ...(evmAddressColor !== undefined && { evmAddressColor }),
      ...(solAddressColor !== undefined && { solAddressColor }),
      ...(openInDiscordApp !== undefined && { openInDiscordApp }),
      ...(openInTelegramApp !== undefined && { openInTelegramApp }),
      ...(mobileRoomBar !== undefined && { mobileRoomBar: !!mobileRoomBar }),
      ...(serverIconBadge !== undefined && { serverIconBadge: !!serverIconBadge }),
      ...(serverIconBadgeMobile !== undefined && { serverIconBadgeMobile: !!serverIconBadgeMobile }),
      ...(showEphemeralMessages !== undefined && { showEphemeralMessages: !!showEphemeralMessages }),
      ...(customUserNames !== undefined && { customUserNames: sanitizeCustomUserNames(customUserNames) }),
      ...(messageSounds !== undefined && { messageSounds }),
      ...(soundSettings !== undefined && { soundSettings }),
      ...(channelSounds !== undefined && { channelSounds }),
      ...(pushover !== undefined && { pushover }),
      ...(contractLinkTemplates !== undefined && { contractLinkTemplates }),
      ...(contractClickAction !== undefined && { contractClickAction }),
      ...(showFullContractAddress !== undefined && { showFullContractAddress }),
      ...(autoOpenHighlightedContracts !== undefined && { autoOpenHighlightedContracts }),
      ...(globalKeywordPatterns !== undefined && { globalKeywordPatterns }),
      ...(keywordAlertsEnabled !== undefined && { keywordAlertsEnabled }),
      ...(desktopNotifications !== undefined && { desktopNotifications }),
      ...(mentionsUserEnabled !== undefined && { mentionsUserEnabled }),
      ...(mentionsRoleEnabled !== undefined && { mentionsRoleEnabled }),
      ...(mentionsHereEnabled !== undefined && { mentionsHereEnabled }),
      ...(mentionsEveryoneEnabled !== undefined && { mentionsEveryoneEnabled }),
      ...(mentionsBotsEnabled !== undefined && { mentionsBotsEnabled }),
      ...(badgeClickAction !== undefined && { badgeClickAction }),
      ...(notificationClickAction !== undefined && { notificationClickAction }),
      ...(chattingEnabled !== undefined && { chattingEnabled }),
      ...(dmReadSyncEnabled !== undefined && { dmReadSyncEnabled }),
      ...(messageDisplay !== undefined && { messageDisplay }),
      ...(compactModeAvatars !== undefined && { compactModeAvatars }),
      ...(compactModeNameOnce !== undefined && { compactModeNameOnce }),
      ...(roleColors !== undefined && { roleColors }),
      ...(mobileZoomScale !== undefined && { mobileZoomScale }),
      ...(splitLayout !== undefined && { splitLayout }),
      ...(paneRoomIds !== undefined && { paneRoomIds }),
      ...(paneLocks !== undefined && { paneLocks }),
      ...(gridMirror !== undefined && { gridMirror }),
      ...(seenAnnouncements !== undefined && { seenAnnouncements }),
      ...(onboardingComplete !== undefined && { onboardingComplete: onboardingComplete === true }),
      ...(feedHotkeys !== undefined && { feedHotkeys: sanitizeFeedHotkeys(feedHotkeys) }),
      // Electron accelerator string; consumed by the desktop main process only.
      ...(focusHotkey !== undefined && {
        focusHotkey: typeof focusHotkey === 'string' && focusHotkey.length > 0 && focusHotkey.length <= 64 ? focusHotkey : null,
      }),
      // The API token is NOT part of this object -- it lives at the top level
      // and is written only via POST /trading/token, so a Save here can never
      // blank it out.
      ...(trading !== undefined && { trading: sanitizeTradingConfig(trading, existingConfig.trading) }),
      // Wallet ids are validated against the trading config saved in the same
      // request when both are present, so a payload can't point a snipe at a
      // wallet it just deleted.
      ...(sniping !== undefined && {
        sniping: sanitizeSnipingConfig(
          sniping,
          existingConfig.sniping ?? { enabled: false, configs: [] },
          trading !== undefined ? sanitizeTradingConfig(trading, existingConfig.trading) : existingConfig.trading,
        ),
      }),
    });

    // Reconnect Discord so the new proxy takes effect immediately (local mode).
    if (proxyChanged) {
      const tokens = await storage.getTokens(userId);
      if (tokens.length > 0) {
        const { connectGateway } = await import('../index.js');
        connectGateway(tokens, wsServer, userId);
      }
    }

    res.json(config);
  });

  // --- Settings Export / Import ---

  // Discord/Telegram credentials. In hosted mode these are managed/encrypted
  // server-side and must never leave the server. In local mode they are part of
  // a backup so a restore can fully re-establish Discord/Telegram access.
  const CREDENTIAL_CONFIG_KEYS = [
    'discordTokens',
    'telegramSessions',
    'telegramApiId',
    'telegramApiHash',
  ] as const;

  // Machine-generated caches and machine-specific settings that are never part
  // of a settings backup. The proxy URL can embed credentials and is tied to the
  // local network, so it must never be exported or imported.
  const NON_PORTABLE_CONFIG_KEYS = ['userNameCache', 'discordProxyUrl'] as const;

  // Never part of a backup in either mode. Unlike Discord/Telegram credentials
  // — which are deliberately included locally so a restore re-establishes
  // access — this one can spend money, and is re-issued from the Slotshark
  // dashboard in seconds.
  const SECRET_CONFIG_KEYS = ['slotsharkApiToken', 'cloudDeviceToken'] as const;

  router.get('/config/export', async (req, res) => {
    const userId = getUserId(req);
    try {
      const fullConfig = await storage.getConfig(userId);
      const rooms = await storage.getRooms(userId);

      const stripKeys: string[] = isHostedMode()
        ? [...CREDENTIAL_CONFIG_KEYS, ...NON_PORTABLE_CONFIG_KEYS, ...SECRET_CONFIG_KEYS]
        : [...NON_PORTABLE_CONFIG_KEYS, ...SECRET_CONFIG_KEYS];

      const exportConfig: Record<string, any> = {};
      for (const [key, value] of Object.entries(fullConfig)) {
        if (stripKeys.includes(key)) continue;
        if (key === 'rooms') continue;
        exportConfig[key] = value;
      }

      if (exportConfig.pushover) {
        const { appToken, userKey, ...safePushover } = exportConfig.pushover;
        exportConfig.pushover = safePushover;
      }

      res.json({
        version: 1,
        exportedAt: new Date().toISOString(),
        config: exportConfig,
        rooms,
      });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to export settings') });
    }
  });

  router.post('/config/import', async (req, res) => {
    const userId = getUserId(req);
    const { config: importedConfig, rooms: importedRooms } = req.body;

    if (!importedConfig || typeof importedConfig !== 'object') {
      return res.status(400).json({ error: 'Invalid import data: missing config object.' });
    }

    try {
      // Credentials are applied separately (and only in local mode); everything
      // else goes through the generic config merge.
      const blockedKeys: string[] = [...CREDENTIAL_CONFIG_KEYS, ...NON_PORTABLE_CONFIG_KEYS, ...SECRET_CONFIG_KEYS, 'rooms'];
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(importedConfig)) {
        if (blockedKeys.includes(key)) continue;
        sanitized[key] = value;
      }

      if (sanitized.pushover) {
        const existing = (await storage.getConfig(userId)).pushover;
        sanitized.pushover = {
          ...sanitized.pushover,
          appToken: existing?.appToken ?? '',
          userKey: existing?.userKey ?? '',
        };
      }

      // The API token is never in a backup, so an imported file would arm
      // one-click spending against whatever token is already configured. Force
      // it off and make the user turn it back on deliberately.
      //
      // Sanitised on the way in as well, because a backup from before
      // multi-wallet carries `activeWalletId` and no `activeWalletIds`, and
      // writing that shape through would leave the buy route reading a wallet
      // list that isn't there.
      if (sanitized.trading) {
        const existingTrading = (await storage.getConfig(userId)).trading;
        sanitized.trading = {
          ...sanitizeTradingConfig(sanitized.trading, existingTrading),
          enabled: false,
        };
      }

      // Same reasoning as trading, but stronger: sniping spends with no click
      // at all, so a restored backup must never come back armed.
      if (sanitized.sniping) {
        const existingCfg = await storage.getConfig(userId);
        sanitized.sniping = {
          ...sanitizeSnipingConfig(
            sanitized.sniping,
            existingCfg.sniping ?? { enabled: false, configs: [] },
            sanitized.trading ?? existingCfg.trading,
          ),
          enabled: false,
        };
      }

      await storage.updateConfig(userId, sanitized);

      if (Array.isArray(importedRooms)) {
        const existingRooms = await storage.getRooms(userId);
        for (const room of existingRooms) {
          await storage.deleteRoom(userId, room.id);
        }
        // Rooms get fresh ids on this device, but the pane layout written above
        // still references the exporting machine's ids — left alone it would
        // open dead "Unknown" panes after every restore. Remap it as the rooms
        // are recreated; ids with no mapping (virtual feeds like 'mentions',
        // DM keys, rooms deleted since the backup) pass through unchanged.
        const roomIdMap = new Map<string, string>();
        for (const room of importedRooms) {
          const { id, ...roomData } = room;
          const created = await storage.createRoom(userId, {
            ...roomData,
            channels: stripDerivedChannels(roomData.channels ?? []),
            categories: sanitizeCategories(roomData.categories),
          });
          if (typeof id === 'string' && id) roomIdMap.set(id, created.id);
        }
        if (Array.isArray(sanitized.paneRoomIds) && roomIdMap.size > 0) {
          await storage.updateConfig(userId, {
            paneRoomIds: sanitized.paneRoomIds.map((paneId: string) => roomIdMap.get(paneId) ?? paneId),
          });
        }
      }

      // Local mode: restore Discord/Telegram credentials from the backup and
      // (re)connect. Hosted mode keeps credentials encrypted server-side, so
      // any credentials present in the import are ignored.
      if (!isHostedMode()) {
        const tgUpdate: Record<string, any> = {};
        if (typeof importedConfig.telegramApiId === 'string') {
          tgUpdate.telegramApiId = importedConfig.telegramApiId;
        }
        if (typeof importedConfig.telegramApiHash === 'string') {
          tgUpdate.telegramApiHash = importedConfig.telegramApiHash;
        }
        if (Array.isArray(importedConfig.telegramSessions)) {
          tgUpdate.telegramSessions = importedConfig.telegramSessions.filter(
            (s: unknown) => typeof s === 'string',
          );
        }
        if (Object.keys(tgUpdate).length > 0) {
          await storage.updateConfig(userId, tgUpdate);
        }

        const cfg = await storage.getConfig(userId);
        const numericApiId = parseInt(cfg.telegramApiId ?? '0', 10);
        const apiHash = cfg.telegramApiHash ?? '';
        const sessions = cfg.telegramSessions ?? [];
        if (numericApiId && apiHash && sessions.length > 0) {
          try {
            const { connectTelegram } = await import('../index.js');
            await connectTelegram(numericApiId, apiHash, sessions, wsServer, userId);
          } catch (err) {
            console.error('[Import] Failed to connect Telegram after import:', err);
          }
        }

        if (Array.isArray(importedConfig.discordTokens)) {
          const validTokens = importedConfig.discordTokens
            .map((t: unknown) => (typeof t === 'string' ? t.trim() : ''))
            .filter(Boolean);
          if (validTokens.length > 0) {
            await storage.setTokens(userId, validTokens);
            try {
              const { connectGateway } = await import('../index.js');
              connectGateway(validTokens, wsServer, userId);
            } catch (err) {
              console.error('[Import] Failed to connect Discord gateway after import:', err);
            }
          }
        }
      }

      const updatedConfig = await storage.getConfig(userId);
      const { discordTokens, telegramSessions, ...safeConfig } = updatedConfig;
      const updatedRooms = await storage.getRooms(userId);

      res.json({ success: true, config: safeConfig, rooms: updatedRooms });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to import settings') });
    }
  });

  // --- Sound file uploads ---

  const validSoundTypes: SoundType[] = ['highlight', 'contractAlert', 'keywordAlert'];

  function getSupabaseStorage() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Supabase not configured');
    return createClient(url, key, { auth: { persistSession: false } }).storage.from('sounds');
  }

  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: soundFileFilter,
    limits: { fileSize: 2 * 1024 * 1024 },
  });

  router.post('/sounds/:soundType', isHostedMode() ? memoryUpload.single('file') : upload.single('file'), async (req, res) => {
    if (!validSoundTypes.includes(req.params.soundType as SoundType)) {
      return res.status(400).json({ error: 'Invalid sound type' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided or unsupported format' });
    }

    if (isHostedMode()) {
      const userId = getUserId(req);
      const ext = extname(req.file.originalname);
      const storagePath = `${userId}/${req.params.soundType}${ext}`;
      const bucket = getSupabaseStorage();

      const { error } = await bucket.upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
      if (error) return res.status(500).json({ error: safeError(error, 'Failed to upload sound') });

      const { data: urlData } = bucket.getPublicUrl(storagePath);
      res.json({ url: urlData.publicUrl, filename: `${req.params.soundType}${ext}` });
    } else {
      const url = `/api/sounds/${req.file.filename}`;
      res.json({ url, filename: req.file.filename });
    }
  });

  router.delete('/sounds/:soundType', async (req, res) => {
    const soundType = req.params.soundType as SoundType;
    if (!validSoundTypes.includes(soundType)) {
      return res.status(400).json({ error: 'Invalid sound type' });
    }

    if (isHostedMode()) {
      const userId = getUserId(req);
      const bucket = getSupabaseStorage();
      const extensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
      const paths = extensions.map((ext) => `${userId}/${soundType}${ext}`);
      await bucket.remove(paths);
    } else {
      const extensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
      for (const ext of extensions) {
        const filePath = join(SOUNDS_DIR, `${soundType}${ext}`);
        try { if (existsSync(filePath)) unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    res.json({ success: true });
  });

  router.post('/channel-sounds/:channelId', isHostedMode() ? memoryUpload.single('file') : channelSoundUpload.single('file'), async (req, res) => {
    const channelId = req.params.channelId as string;
    if (!channelId || !/^\d+$/.test(channelId)) {
      return res.status(400).json({ error: 'Invalid channel ID' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided or unsupported format' });
    }

    if (isHostedMode()) {
      const userId = getUserId(req);
      const ext = extname(req.file.originalname);
      const storagePath = `${userId}/ch_${channelId}${ext}`;
      const bucket = getSupabaseStorage();

      const { error } = await bucket.upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
      if (error) return res.status(500).json({ error: safeError(error, 'Failed to upload channel sound') });

      const { data: urlData } = bucket.getPublicUrl(storagePath);
      res.json({ url: urlData.publicUrl, filename: `ch_${channelId}${ext}` });
    } else {
      const url = `/api/sounds/${req.file.filename}`;
      res.json({ url, filename: req.file.filename });
    }
  });

  router.delete('/channel-sounds/:channelId', async (req, res) => {
    const channelId = req.params.channelId as string;
    if (!channelId || !/^\d+$/.test(channelId)) {
      return res.status(400).json({ error: 'Invalid channel ID' });
    }

    if (isHostedMode()) {
      const userId = getUserId(req);
      const bucket = getSupabaseStorage();
      const extensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
      const paths = extensions.map((ext) => `${userId}/ch_${channelId}${ext}`);
      await bucket.remove(paths);
    } else {
      const extensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];
      for (const ext of extensions) {
        const filePath = join(SOUNDS_DIR, `ch_${channelId}${ext}`);
        try { if (existsSync(filePath)) unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    res.json({ success: true });
  });

  router.use('/sounds', expressStatic(SOUNDS_DIR));

  // --- Send Message ---

  const messageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  });

  router.post('/send-message', messageUpload.array('files', 10), async (req, res) => {
    const userId = getUserId(req);

    const config = await storage.getConfig(userId);
    if (!config.chattingEnabled) {
      return res.status(403).json({ error: 'Chatting is disabled. Enable it in Settings > General.' });
    }

    const { channelId, content, source } = req.body;
    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required' });
    }
    if ((!content || !content.trim()) && (!req.files || (req.files as Express.Multer.File[]).length === 0)) {
      return res.status(400).json({ error: 'Message content or files required' });
    }

    try {
      const files = (req.files as Express.Multer.File[]) ?? [];
      const attachments = files.map((f) => ({
        filename: f.originalname,
        data: f.buffer,
        contentType: f.mimetype,
      }));

      if (source === 'telegram') {
        const tg = await requireTelegramManager(req, res);
        if (!tg) return;
        await tg.waitUntilReady();
        const result = await tg.sendMessage(channelId, content?.trim() ?? '', attachments.length > 0 ? attachments : undefined);
        res.json({ success: true, messageId: result.id });
      } else {
        const gateway = await requireGateway(req, res);
        if (!gateway) return;
        const result = await gateway.sendChannelMessage(channelId, content?.trim() ?? '', attachments.length > 0 ? attachments : undefined);
        res.json({ success: true, messageId: result.id });
      }
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to send message') });
    }
  });

  // --- Mark read (reverse of the gateway's MESSAGE_ACK sync) ---

  // Only DM channels are accepted: opening a Trenchcord room that aggregates
  // guild channels must never mass-read those channels on the real account.
  router.post('/channels/:channelId/ack', async (req, res) => {
    const { channelId } = req.params;
    const { messageId } = req.body ?? {};
    if (!/^\d{5,25}$/.test(channelId) || typeof messageId !== 'string' || !/^\d{5,25}$/.test(messageId)) {
      return res.status(400).json({ error: 'channelId and messageId must be Discord ids' });
    }

    const config = await storage.getConfig(getUserId(req));
    if (!config.dmReadSyncEnabled) {
      return res.status(403).json({ error: 'DM read sync is disabled. Enable it in Settings > General.' });
    }

    const gateway = await requireGateway(req, res);
    if (!gateway) return;
    if (!gateway.getDMChannels().some((dm) => dm.id === channelId)) {
      return res.status(400).json({ error: 'Only DM channels can be marked read' });
    }

    try {
      const success = await gateway.ackChannelMessage(channelId, messageId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to mark channel read') });
    }
  });

  // --- Contracts ---

  router.get('/contracts', async (req, res) => {
    const userId = getUserId(req);
    const limit = parseInt(req.query.limit as string) || 100;
    const since = req.query.since as string | undefined;
    res.json(await storage.getContracts(userId, limit, since));
  });

  router.delete('/contracts', async (req, res) => {
    const userId = getUserId(req);
    await storage.deleteAllContracts(userId);
    res.json({ success: true });
  });

  router.delete('/contracts/:messageId/:address', async (req, res) => {
    const userId = getUserId(req);
    const deleted = await storage.deleteContract(userId, req.params.messageId, req.params.address);
    if (!deleted) return res.status(404).json({ error: 'Contract not found' });
    res.json({ success: true });
  });

  // --- Trading (Slotshark) ---

  // Trading is desktop-only. The hosted web app is discontinued, hosted config
  // lands in a plaintext JSONB column (no encrypted table exists for this
  // token), and one shared server IP fanning buys for many users is an abuse
  // magnet. Same reasoning as the discordProxyUrl rejection above.
  function rejectIfHosted(res: any): boolean {
    if (!isHostedMode()) return false;
    res.status(403).json({ error: 'Trading is only available in the desktop app.', code: 'hosted' });
    return true;
  }

  router.get('/trading/status', async (req, res) => {
    if (rejectIfHosted(res)) return;
    const config = await storage.getConfig(getUserId(req));
    const token = config.slotsharkApiToken ?? '';
    res.json({
      configured: token.length > 0,
      masked: token ? maskToken(token) : null,
      walletCount: config.trading?.wallets.length ?? 0,
    });
  });

  // Which of the addresses in a message are token mints, so the buy row can
  // drop the wallets a caller bot posts beside them. It runs here rather than
  // in the app window because Solana's public RPC answers 403 to any request
  // carrying an Origin header -- i.e. to every request the frontend can make.
  router.post('/trading/mint-check', async (req, res) => {
    if (rejectIfHosted(res)) return;
    const { addresses } = req.body ?? {};
    if (!Array.isArray(addresses)) {
      return res.status(400).json({ error: 'addresses must be an array' });
    }
    const clean = addresses
      .filter((a: unknown): a is string => typeof a === 'string' && SOL_ADDRESS_RE.test(a))
      .slice(0, MAX_MINT_BATCH);
    try {
      res.json({ verdicts: await classifyAddresses(clean) });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Mint check failed') });
    }
  });

  router.post('/trading/token', async (req, res) => {
    if (rejectIfHosted(res)) return;
    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'A valid Slotshark API token is required.' });
    }
    try {
      await storage.updateConfig(getUserId(req), { slotsharkApiToken: token.trim() });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to save API token') });
    }
  });

  router.delete('/trading/token', async (req, res) => {
    if (rejectIfHosted(res)) return;
    try {
      await storage.updateConfig(getUserId(req), { slotsharkApiToken: '' });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'Failed to remove API token') });
    }
  });

  // express-rate-limit is otherwise only mounted in hosted mode (index.ts), so
  // this is attached per-route to cover the local desktop app too.
  const buyLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many buy requests — slow down.', code: 'rate_limit' },
  });

  router.post('/trading/buy', buyLimiter, async (req, res) => {
    if (rejectIfHosted(res)) return;

    const userId = getUserId(req);
    const config = await storage.getConfig(userId);
    const trading = config.trading;

    if (!trading?.enabled) {
      return res.status(403).json({ error: 'Trading is disabled in settings.', code: 'disabled' });
    }
    const apiToken = config.slotsharkApiToken ?? '';
    if (!apiToken) {
      return res.status(400).json({ error: 'Add your Slotshark API token in Settings → Trading.', code: 'no_token' });
    }

    const { mint, solAmount } = req.body ?? {};

    if (typeof mint !== 'string' || !SOL_ADDRESS_RE.test(mint.trim())) {
      const isEvm = typeof mint === 'string' && mint.trim().startsWith('0x');
      return res.status(400).json({
        error: isEvm ? 'Only Solana tokens can be bought.' : 'Invalid token address.',
        code: 'invalid',
      });
    }
    // Case-sensitive downstream — trim only.
    const cleanMint = mint.trim();

    const amount = Number(solAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_SOL_PER_TRADE) {
      return res.status(400).json({ error: 'Invalid buy amount.', code: 'invalid' });
    }
    // The real guard: only an amount the user configured can be spent, so a
    // tampered request cannot pick its own size.
    if (!trading.presetAmounts.some((p) => Math.abs(p - amount) < 1e-9)) {
      return res.status(400).json({ error: 'Amount is not one of your configured buy amounts.', code: 'invalid' });
    }

    // The wallet set comes from stored config, never from the request: the
    // client picks what to buy, the user's settings decide what it spends from.
    const wallets = (trading.activeWalletIds ?? [])
      .map((id) => trading.wallets.find((w) => w.id === id))
      .filter((w): w is TradingWallet => !!w);

    if (wallets.length === 0) {
      return res.status(400).json({
        error: trading.wallets.length > 0
          ? 'No wallets are enabled for buys. Enable one in Settings → Trading.'
          : 'No trading wallet configured. Add one in Settings → Trading.',
        code: 'no_wallet',
      });
    }

    // per_wallet spends `amount` from each wallet; split divides it between
    // them. Splitting is done in lamports so the parts always add back up to
    // exactly what was clicked -- dividing floats would drift over/under.
    const perWallet = trading.walletAmountMode === 'split'
      ? splitLamports(amount, wallets.length)
      : wallets.map(() => amount);

    if (perWallet.some((a) => a < MIN_SOL_PER_BUY)) {
      return res.status(400).json({
        error: `Splitting ${amount} SOL across ${wallets.length} wallets leaves less than ${MIN_SOL_PER_BUY} SOL each. Use a bigger amount or fewer wallets.`,
        code: 'invalid',
      });
    }

    const now = Date.now();
    sweepBuyCooldown(now);

    // Dedupe per wallet, so a wallet already mid-buy for this token is skipped
    // while the rest still go through.
    const planned = wallets
      .map((wallet, i) => ({
        wallet,
        solAmount: perWallet[i],
        dedupeKey: `${userId}:${wallet.address}:${cleanMint}:${perWallet[i]}`,
      }))
      .filter(({ dedupeKey }) => !buyInFlight.has(dedupeKey) && (buyCooldown.get(dedupeKey) ?? 0) <= now);

    if (planned.length === 0) {
      return res.status(429).json({ error: 'Duplicate buy ignored.', code: 'duplicate' });
    }
    for (const p of planned) buyInFlight.add(p.dedupeKey);

    // In parallel: these are independent orders and a caller is racing everyone
    // else in the channel, so they must not queue behind each other.
    const results = await Promise.all(planned.map(async ({ wallet, solAmount: walletAmount, dedupeKey }) => {
      const base = { walletId: wallet.id, label: wallet.label, solAmount: walletAmount };
      try {
        const result = await slotsharkBuy(trading.region, apiToken, {
          mint: cleanMint,
          solAmount: walletAmount,
          wallet: wallet.address,
          slippage: trading.slippage,
          tip: trading.tip,
          priorityFee: trading.priorityFee,
          antimev: trading.antimev,
        });

        if (result.ok) {
          return { ...base, ok: true as const, signature: extractSignature(result.data) };
        }
        return { ...base, ok: false as const, code: result.kind, error: buyErrorMessage(result) };
      } catch (err: any) {
        return { ...base, ok: false as const, code: 'upstream', error: safeError(err, 'Failed to submit buy') };
      } finally {
        buyInFlight.delete(dedupeKey);
        buyCooldown.set(dedupeKey, Date.now() + BUY_COOLDOWN_MS);
      }
    }));

    const succeeded = results.filter((r) => r.ok);
    const failures = results.filter((r): r is Extract<typeof r, { ok: false }> => !r.ok);
    const spent = succeeded.reduce((sum, r) => sum + r.solAmount, 0);
    const payload = {
      success: succeeded.length > 0,
      mode: trading.walletAmountMode,
      walletCount: results.length,
      succeeded: succeeded.length,
      failed: results.length - succeeded.length,
      spent: Number(spent.toFixed(9)),
      results,
      // Single-wallet callers get the old shape too, so nothing that reads
      // `error` on a failure has to special-case one wallet.
      ...(succeeded.length === 0 ? { error: failures[0]?.error ?? 'Buy failed.', code: failures[0]?.code } : {}),
    };
    // All failed reads as an upstream failure; a partial fill is a 200 the
    // client explains, because some SOL really was spent.
    return res.status(succeeded.length > 0 ? 200 : 502).json(payload);
  });

  return router;
}
