import { EventEmitter } from 'events';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { NextFunction, Request, Response } from 'express';
import { configStore } from '../config/store.js';
import { isHostedMode } from '../storage/index.js';
import { appFetch } from '../utils/http.js';
import { getPlatform, type AppPlatform } from '../platform.js';
import { verifyEntitlementJwt, type EntitlementPayload } from './entitlement.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.TRENCHCORD_DATA_DIR || join(__dirname, '../../data');
const ENTITLEMENT_CACHE_PATH = join(DATA_DIR, 'entitlement.json');

// Packaged desktop builds run with NODE_ENV=production (set in desktop/main.js)
// and talk to the real cloud; everything else defaults to a locally running
// trenchcord-cloud so dev "just works". Both are overridable via env.
const IS_PROD = process.env.NODE_ENV === 'production';
export const CLOUD_URL = (
  process.env.TRENCHCORD_CLOUD_URL ?? (IS_PROD ? 'https://api.trenchcord.app' : 'http://localhost:8787')
).replace(/\/$/, '');
export const DASHBOARD_URL = (
  process.env.TRENCHCORD_DASHBOARD_URL ?? (IS_PROD ? 'https://dashboard.trenchcord.app' : 'http://localhost:5175')
).replace(/\/$/, '');

// Re-validate with the cloud every 5 minutes so a device revoked on the
// dashboard (or a subscription past its grace window) locks the app out within
// minutes, not hours. Failures simply retry on the same cadence.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Whether the app requires a linked account with an active subscription.
 * ON by default — set TRENCHCORD_REQUIRE_SUBSCRIPTION=0 to run ungated.
 * The hosted read-only demo is never gated (nothing to link there).
 * (The gate is client-side and openly documented as strippable —
 * server-side premium features are the real wall.)
 */
export function isSubscriptionEnforced(): boolean {
  if (isHostedMode()) return false;
  return process.env.TRENCHCORD_REQUIRE_SUBSCRIPTION !== '0';
}

export interface CloudStatus {
  enforced: boolean;
  linked: boolean;
  active: boolean;
  inGrace: boolean;
  entitledUntil: string | null;
  /** Empty on iOS — the frontend renders no billing links when this is blank. */
  dashboardUrl: string;
  platform: AppPlatform;
}

interface PendingLink {
  code: string;
  secret: string;
  approveUrl: string;
  expiresAt: number;
  pollInterval: number;
  error?: string;
}

class CloudClient extends EventEmitter {
  private entitlement: { token: string; payload: EntitlementPayload } | null = null;
  private pendingLink: PendingLink | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private wasEntitled = false;

  private getDeviceToken(): string | null {
    return configStore.getConfig().cloudDeviceToken || null;
  }

  isLinked(): boolean {
    return !!this.getDeviceToken();
  }

  /** Auth header for premium cloud calls; null when unlinked. The raw token never leaves this class. */
  getDeviceAuthHeader(): { authorization: string } | null {
    const token = this.getDeviceToken();
    return token ? { authorization: `Device ${token}` } : null;
  }

  /** A validly-signed, unexpired cached token counts — that's the offline grace. */
  isEntitled(): boolean {
    const p = this.entitlement?.payload;
    return !!p && (p.exp ?? 0) * 1000 > Date.now();
  }

  getStatus(): CloudStatus {
    const p = this.entitlement?.payload;
    const entitledUntil = p?.entitled_until ?? null;
    const active = this.isEntitled();
    const inGrace = active && !!entitledUntil && new Date(entitledUntil).getTime() < Date.now();
    return {
      enforced: isSubscriptionEnforced(),
      linked: this.isLinked(),
      active,
      inGrace,
      entitledUntil,
      // Sent on iOS too (a deliberate decision — TestFlight-only distribution,
      // and the shipped version string is already through Beta App Review):
      // dashboard links open in Safari everywhere. Only the in-app payment
      // routes stay hidden on iOS — see isBillingHidden().
      dashboardUrl: DASHBOARD_URL,
      platform: getPlatform(),
    };
  }

  async init(): Promise<void> {
    try {
      if (existsSync(ENTITLEMENT_CACHE_PATH)) {
        const cached = JSON.parse(readFileSync(ENTITLEMENT_CACHE_PATH, 'utf-8')) as { token?: string };
        if (cached.token) {
          const payload = await verifyEntitlementJwt(cached.token, CLOUD_URL);
          if (payload) this.entitlement = { token: cached.token, payload };
        }
      }
    } catch (err) {
      console.warn('[Cloud] Failed to load cached entitlement:', err instanceof Error ? err.message : err);
    }
    this.wasEntitled = this.isEntitled();
    if (this.isLinked()) {
      await this.refreshNow();
    }
    this.scheduleRefresh(REFRESH_INTERVAL_MS);
  }

  private scheduleRefresh(delay: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      void this.refreshNow().finally(() => this.scheduleRefresh(REFRESH_INTERVAL_MS));
    }, delay);
    this.refreshTimer.unref?.();
  }

  async refreshNow(tokenOverride?: string): Promise<void> {
    const deviceToken = tokenOverride ?? this.getDeviceToken();
    if (!deviceToken) return;
    try {
      const res = await appFetch(`${CLOUD_URL}/entitlement/token`, {
        method: 'POST',
        headers: { authorization: `Device ${deviceToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { token: string };
        const payload = await verifyEntitlementJwt(data.token, CLOUD_URL);
        if (payload) {
          this.entitlement = { token: data.token, payload };
          this.persistCache(data.token);
        }
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (res.status === 401 && body.code === 'DEVICE_REVOKED') {
        console.warn('[Cloud] Device was revoked on the dashboard — unlinking.');
        this.clearEntitlement();
        configStore.updateConfig({ cloudDeviceToken: '' });
      } else if (res.status === 403) {
        // Subscription lapsed. Keep the cached token — its exp already encodes
        // the grace window; when it expires, isEntitled() flips on its own.
        console.warn('[Cloud] Subscription expired or missing.');
      }
    } catch (err) {
      // Offline / cloud unreachable: keep the cached token (offline grace);
      // the next scheduled refresh retries.
      console.warn('[Cloud] Entitlement refresh failed:', err instanceof Error ? err.message : err);
    } finally {
      // Entitlement can flip either way above — a fresh token arriving, the
      // device being revoked, or the cached token's exp passing — so every
      // refresh re-checks and lets the app connect/disconnect accordingly.
      this.syncEntitledState();
    }
  }

  /** Emits 'entitled' / 'unentitled' whenever isEntitled() has flipped. */
  private syncEntitledState(): void {
    const entitled = this.isEntitled();
    if (entitled === this.wasEntitled) return;
    this.wasEntitled = entitled;
    this.emit(entitled ? 'entitled' : 'unentitled');
  }

  private persistCache(token: string): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(ENTITLEMENT_CACHE_PATH, JSON.stringify({ token }), 'utf-8');
    } catch (err) {
      console.warn('[Cloud] Failed to persist entitlement cache:', err instanceof Error ? err.message : err);
    }
  }

  private clearEntitlement(): void {
    this.entitlement = null;
    try {
      if (existsSync(ENTITLEMENT_CACHE_PATH)) unlinkSync(ENTITLEMENT_CACHE_PATH);
    } catch {
      /* ignore */
    }
  }

  // --- Device pairing (device-code flow) ---

  async startLink(name: string, platform: string): Promise<{ code: string; approveUrl: string; expiresIn: number }> {
    const res = await appFetch(`${CLOUD_URL}/link/device/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, platform }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error('Could not reach the Trenchcord account server');
    const data = (await res.json()) as {
      code: string;
      device_temp_secret: string;
      poll_interval: number;
      expires_in: number;
      approve_url: string;
    };
    this.pendingLink = {
      code: data.code,
      secret: data.device_temp_secret,
      approveUrl: data.approve_url,
      expiresAt: Date.now() + data.expires_in * 1000,
      pollInterval: Math.max(3, data.poll_interval),
    };
    this.pollPendingLink();
    return { code: data.code, approveUrl: data.approve_url, expiresIn: data.expires_in };
  }

  private pollPendingLink(): void {
    const pending = this.pendingLink;
    if (!pending) return;
    const timer = setTimeout(async () => {
      if (this.pendingLink !== pending) return;
      if (Date.now() > pending.expiresAt) {
        pending.error = 'Pairing code expired — start again.';
        this.pendingLink = null;
        return;
      }
      try {
        const res = await appFetch(`${CLOUD_URL}/link/device/poll`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: pending.code, device_temp_secret: pending.secret }),
          signal: AbortSignal.timeout(15_000),
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          device_token?: string;
          error?: string;
          code?: string;
        };
        if (res.ok && data.status === 'approved' && data.device_token) {
          // Entitlement first, then flip to linked: storing the token first
          // made getStatus() report linked-but-inactive for a beat, which
          // bounced the gate screen to "Subscription required" right after
          // the user approved the device.
          await this.refreshNow(data.device_token);
          configStore.updateConfig({ cloudDeviceToken: data.device_token });
          this.pendingLink = null;
          return;
        }
        if (res.ok && data.status === 'pending') {
          this.pollPendingLink();
          return;
        }
        // Terminal failure (expired, consumed, device limit).
        this.pendingLink = null;
        this.lastLinkError = data.error ?? 'Pairing failed — start again.';
      } catch {
        this.pollPendingLink(); // network hiccup: keep trying until the code expires
      }
    }, pending.pollInterval * 1000);
    timer.unref?.();
  }

  private lastLinkError: string | null = null;

  getLinkState(): { state: 'linked' | 'pending' | 'idle'; code?: string; approveUrl?: string; error?: string } {
    if (this.isLinked()) return { state: 'linked' };
    if (this.pendingLink) {
      // The code alone is what the user needs; withholding the URL on iOS keeps
      // the app from surfacing a route to the paid dashboard.
      return { state: 'pending', code: this.pendingLink.code, approveUrl: this.pendingLink.approveUrl };
    }
    const error = this.lastLinkError ?? undefined;
    this.lastLinkError = null;
    return { state: 'idle', error };
  }

  unlink(): void {
    configStore.updateConfig({ cloudDeviceToken: '' });
    this.pendingLink = null;
    this.clearEntitlement();
    this.syncEntitledState();
  }
}

export const cloudClient = new CloudClient();

/**
 * Full gate for the official build — mirrors the rejectIfHosted pattern.
 * Mounted on /api after the local auth guard; /api/cloud/* is mounted earlier
 * so pairing/status always work. /auth/status stays reachable so the frontend
 * can render its gate screens with basic state.
 */
export function subscriptionGate(req: Request, res: Response, next: NextFunction): void {
  if (!isSubscriptionEnforced() || cloudClient.isEntitled()) {
    next();
    return;
  }
  if (req.path === '/auth/status' || req.path === '/local-session') {
    next();
    return;
  }
  res.status(403).json({
    error: 'An active Trenchcord subscription is required.',
    code: 'SUBSCRIPTION_REQUIRED',
    linked: cloudClient.isLinked(),
  });
}
