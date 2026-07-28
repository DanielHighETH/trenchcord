import { randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import type { IncomingMessage } from 'http';

/**
 * Local-mode API token.
 *
 * The network guards in ./localAccess keep other machines and other websites
 * out. This is the layer under them: proof that a request came from the
 * Trenchcord page you opened, not merely from something that can reach the
 * port. It matters in two cases the network rules can't cover - another user or
 * process on a shared machine, and the LAN opt-in (TRENCHCORD_HOST), where
 * "can reach the port" is exactly what we stopped relying on.
 *
 * The token is handed to the page as an HttpOnly, SameSite=Strict cookie, so
 * the browser attaches it to everything the app does - fetches, <img> avatars,
 * media downloads, the WebSocket handshake - without any of those call sites
 * needing to know about it, and page JavaScript can never read it back out.
 */

const COOKIE_NAME = 'tc_local';
const TOKEN_FILE = 'local-token';
// A year: this is a persistent trust decision for a machine, not a session.
export const COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

let cached: string | null = null;

function dataDir(): string {
  return process.env.TRENCHCORD_DATA_DIR ?? path.resolve(process.cwd(), 'data');
}

/** The token for this install, generated on first run and reused after that. */
export function getLocalToken(): string {
  if (cached) return cached;

  const file = path.join(dataDir(), TOKEN_FILE);
  try {
    if (existsSync(file)) {
      const stored = readFileSync(file, 'utf-8').trim();
      if (stored.length >= 32) {
        cached = stored;
        return cached;
      }
    }
  } catch {
    // Unreadable: fall through and mint a new one.
  }

  const token = randomBytes(32).toString('hex');
  try {
    mkdirSync(dataDir(), { recursive: true });
    // 0600: on a shared machine the whole point is that other users can't read
    // this, so a token file they could open would defeat the exercise.
    writeFileSync(file, token, { encoding: 'utf-8', mode: 0o600 });
  } catch (err: any) {
    console.error(`[Auth] Could not persist the local API token (${err.message}); it will reset on restart.`);
  }
  cached = token;
  return token;
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Cookie first, then the header/query forms a script or curl would use. */
export function tokenFromRequest(req: IncomingMessage & { query?: any }): string | null {
  const fromCookie = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (fromCookie) return fromCookie;

  const header = req.headers['x-trenchcord-token'];
  if (typeof header === 'string' && header) return header;

  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);

  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken) return queryToken;

  // A raw WebSocket upgrade has no parsed query, so read it off the URL.
  if (req.url?.includes('token=')) {
    const value = new URLSearchParams(req.url.split('?')[1] ?? '').get('token');
    if (value) return value;
  }

  return null;
}

export function isValidToken(candidate: string | null): boolean {
  if (!candidate) return false;
  const expected = Buffer.from(getLocalToken());
  const given = Buffer.from(candidate);
  // timingSafeEqual throws on a length mismatch, and the lengths are not secret.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function isAuthorizedLocalRequest(req: IncomingMessage & { query?: any }): boolean {
  return isValidToken(tokenFromRequest(req));
}

/** Whether the connection came from this machine. */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function sessionCookie(): string {
  // No Secure flag: local mode is plain http on loopback, and a Secure cookie
  // would simply never be stored. SameSite=Strict is what does the work here -
  // it keeps another site's requests to localhost from carrying the token.
  return `${COOKIE_NAME}=${getLocalToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_S}`;
}
