/**
 * Premium alerts (cloud-evaluated price/tweet/telegram alerts).
 *
 * The client is deliberately thin: alert definitions live on Trenchcord Cloud
 * (that's what lets them fire and push to Pushover/Telegram while the PC is
 * off). This module only (a) proxies the frontend's CRUD calls to the cloud
 * with the device token, and (b) polls the fired-events feed while the app is
 * open, fanning new events out over the local WebSocket hub.
 *
 * Every request made here is documented in README.md "What Leaves Your PC".
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Router, type Request, type Response } from 'express';
import { appFetch } from '../utils/http.js';
import { isHostedMode } from '../storage/index.js';
import { cloudClient, CLOUD_URL } from './client.js';
import type { WsServer } from '../ws/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.TRENCHCORD_DATA_DIR || join(__dirname, '../../data');
const CURSOR_PATH = join(DATA_DIR, 'premium-events-cursor.json');

const POLL_MS = 25_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const AUTH_BACKOFF_MS = 10 * 60_000;
const POLL_LIMIT = 50;

export interface PremiumEvent {
  id: string;
  kind: 'price' | 'tweet' | 'telegram';
  source_id: string | null;
  title: string;
  body: string;
  url: string | null;
  payload: Record<string, unknown> | null;
  urgency: 'normal' | 'critical';
  created_at: string;
}

// --- Proxy router -----------------------------------------------------------

export async function proxyCloud(req: Request, res: Response, method: string, cloudPath: string): Promise<void> {
  return proxy(req, res, method, cloudPath);
}

async function proxy(req: Request, res: Response, method: string, cloudPath: string): Promise<void> {
  if (isHostedMode()) {
    res.status(404).json({ error: 'Not available in hosted mode.' });
    return;
  }
  const auth = cloudClient.getDeviceAuthHeader();
  if (!auth) {
    res.status(403).json({ error: 'Link your Trenchcord account first.', code: 'NOT_LINKED' });
    return;
  }
  try {
    const hasBody = method !== 'GET' && method !== 'DELETE';
    const r = await appFetch(`${CLOUD_URL}${cloudPath}`, {
      method,
      headers: hasBody ? { ...auth, 'content-type': 'application/json' } : auth,
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch {
    res.status(502).json({ error: 'Trenchcord Cloud unreachable.' });
  }
}

export function createPremiumAlertsRouter(): Router {
  const router = Router();

  router.get('/overview', (req, res) => void proxy(req, res, 'GET', '/premium/overview'));
  router.put('/notify', (req, res) => void proxy(req, res, 'PUT', '/premium/notify'));
  router.post('/delivery/link', (req, res) => void proxy(req, res, 'POST', '/premium/delivery/link'));

  router.get('/alerts', (req, res) => void proxy(req, res, 'GET', '/premium/alerts'));
  router.post('/alerts', (req, res) => void proxy(req, res, 'POST', '/premium/alerts'));
  router.patch('/alerts/:id', (req, res) =>
    void proxy(req, res, 'PATCH', `/premium/alerts/${encodeURIComponent(req.params.id)}`));
  router.delete('/alerts/:id', (req, res) =>
    void proxy(req, res, 'DELETE', `/premium/alerts/${encodeURIComponent(req.params.id)}`));

  router.get('/tweets', (req, res) => void proxy(req, res, 'GET', '/premium/tweets'));
  router.post('/tweets', (req, res) => void proxy(req, res, 'POST', '/premium/tweets'));
  router.patch('/tweets/:id', (req, res) =>
    void proxy(req, res, 'PATCH', `/premium/tweets/${encodeURIComponent(req.params.id)}`));
  router.delete('/tweets/:id', (req, res) =>
    void proxy(req, res, 'DELETE', `/premium/tweets/${encodeURIComponent(req.params.id)}`));

  router.get('/telegram-tracks', (req, res) => void proxy(req, res, 'GET', '/premium/telegram-tracks'));
  router.post('/telegram-tracks', (req, res) => void proxy(req, res, 'POST', '/premium/telegram-tracks'));
  router.patch('/telegram-tracks/:id', (req, res) =>
    void proxy(req, res, 'PATCH', `/premium/telegram-tracks/${encodeURIComponent(req.params.id)}`));
  router.delete('/telegram-tracks/:id', (req, res) =>
    void proxy(req, res, 'DELETE', `/premium/telegram-tracks/${encodeURIComponent(req.params.id)}`));

  // Live quote for the create-alert form.
  router.get('/quote', (req, res) => {
    const params = new URLSearchParams();
    for (const key of ['kind', 'symbol', 'chain', 'contract_address'] as const) {
      if (typeof req.query[key] === 'string') params.set(key, req.query[key] as string);
    }
    void proxy(req, res, 'GET', `/premium/quote?${params.toString()}`);
  });

  // Event-history hydration for the frontend feed (the live path is the poller).
  router.get('/events', (req, res) => {
    const params = new URLSearchParams();
    if (typeof req.query.after === 'string') params.set('after', req.query.after);
    if (typeof req.query.limit === 'string') params.set('limit', req.query.limit);
    const qs = params.toString();
    void proxy(req, res, 'GET', `/premium/events${qs ? `?${qs}` : ''}`);
  });
  router.delete('/events/:id', (req, res) =>
    void proxy(req, res, 'DELETE', `/premium/events/${encodeURIComponent(req.params.id)}`));
  router.delete('/events', (req, res) => void proxy(req, res, 'DELETE', '/premium/events'));

  return router;
}

// --- Events poller ----------------------------------------------------------

class PremiumEventsPoller {
  private wsServer: WsServer | null = null;
  private userId = 'local';
  private cursor: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = POLL_MS;
  private polling = false;

  start(wsServer: WsServer, userId: string): void {
    if (this.wsServer) return;
    this.wsServer = wsServer;
    this.userId = userId;
    this.loadCursor();
    // A lapsed subscription pauses polling; resume promptly once it's back.
    cloudClient.on('entitled', () => this.pollNow());
    this.schedule(POLL_MS);
  }

  /** Immediate poll — used by the iOS resume hook for foreground catch-up. */
  pollNow(): void {
    this.schedule(0);
  }

  private schedule(delay: number): void {
    if (!this.wsServer) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delay);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      if (isHostedMode() || !cloudClient.isLinked() || !cloudClient.isEntitled()) {
        this.schedule(POLL_MS);
        return;
      }
      const auth = cloudClient.getDeviceAuthHeader();
      if (!auth) {
        this.schedule(POLL_MS);
        return;
      }

      const params = new URLSearchParams({ limit: String(POLL_LIMIT) });
      // First run with no cursor: fetch only the newest event to seat the
      // cursor without re-broadcasting history (the frontend hydrates history
      // itself via /api/premium/events).
      if (this.cursor === null) params.set('limit', '1');
      else params.set('after', this.cursor);

      const res = await appFetch(`${CLOUD_URL}/premium/events?${params}`, {
        headers: auth,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401 || res.status === 403) {
        this.schedule(AUTH_BACKOFF_MS);
        return;
      }
      if (!res.ok) throw new Error(`http ${res.status}`);

      const data = (await res.json()) as { events: PremiumEvent[]; next_cursor: string };
      const seeding = this.cursor === null;
      if (data.next_cursor && data.next_cursor !== this.cursor) {
        this.cursor = data.next_cursor;
        this.persistCursor();
      }
      if (!seeding) {
        for (const event of data.events) {
          this.wsServer!.broadcastRaw({ type: 'premium_alert', data: event }, this.userId);
        }
      }
      this.backoffMs = POLL_MS;
      this.schedule(POLL_MS);
    } catch {
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
      this.schedule(this.backoffMs);
    } finally {
      this.polling = false;
    }
  }

  private loadCursor(): void {
    try {
      if (existsSync(CURSOR_PATH)) {
        const data = JSON.parse(readFileSync(CURSOR_PATH, 'utf-8')) as { cursor?: string };
        if (typeof data.cursor === 'string') this.cursor = data.cursor;
      }
    } catch {
      this.cursor = null;
    }
  }

  private persistCursor(): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(CURSOR_PATH, JSON.stringify({ cursor: this.cursor }), 'utf-8');
    } catch {
      /* non-fatal — worst case the next boot re-seeds at newest */
    }
  }
}

export const premiumEventsPoller = new PremiumEventsPoller();

export function startPremiumEventsPoller(wsServer: WsServer, userId: string): void {
  premiumEventsPoller.start(wsServer, userId);
}
