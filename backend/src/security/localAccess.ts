/**
 * Local-mode network exposure rules.
 *
 * In local mode every /api route runs as the single 'local' user with no
 * authentication, and GET /api/config/export deliberately returns Discord
 * tokens and Telegram sessions in plaintext so a backup can restore access.
 * That is only safe as long as nothing but this machine can reach the server,
 * so the surface is closed on three sides:
 *
 *   1. the listener binds to loopback unless the user opts out (getBindHost)
 *   2. browser origins are restricted to localhost (isAllowedOrigin)
 *   3. the Host header is validated (isAllowedHost)
 *
 * (3) is not redundant with (2): in a DNS rebinding attack the attacker's page
 * at evil.com re-resolves to 127.0.0.1, which makes it *same-origin* with us,
 * so CORS never runs. What it cannot fake is the Host header - the browser
 * still sends `evil.com`. WebSockets need the same check for a different
 * reason: CORS does not govern them at all.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Hostnames the user explicitly trusts, e.g. TRENCHCORD_ALLOWED_HOSTS=nas.local */
function extraAllowedHosts(): Set<string> {
  const raw = process.env.TRENCHCORD_ALLOWED_HOSTS ?? '';
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function bindsBeyondLoopback(): boolean {
  const host = process.env.TRENCHCORD_HOST?.trim();
  return !!host && !LOOPBACK_HOSTNAMES.has(host.toLowerCase());
}

/** Strip the :port and normalise, so `127.0.0.1:3001` -> `127.0.0.1`. */
function hostnameOf(hostHeader: string): string {
  const value = hostHeader.trim().toLowerCase();
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1); // [::1]:3001
  const colon = value.lastIndexOf(':');
  return colon === -1 ? value : value.slice(0, colon);
}

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isIpLiteral(hostname: string): boolean {
  return IPV4_RE.test(hostname) || hostname.startsWith('[');
}

/**
 * Which address the HTTP server binds. Loopback by default: on a public or
 * shared network, binding every interface would let anyone on that network
 * read the token export straight off this port.
 */
export function getBindHost(hosted: boolean): string {
  if (hosted) return process.env.TRENCHCORD_HOST ?? '0.0.0.0';
  return process.env.TRENCHCORD_HOST ?? '127.0.0.1';
}

/**
 * Origins allowed to read API responses from a browser. Any port, since the
 * Vite dev server, the packaged desktop app, and a custom PORT all differ.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  // No Origin header: a same-origin browser request or a non-browser client
  // (curl, the desktop shell). Those are governed by the bind address instead.
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    const normalized = hostname.toLowerCase();
    return LOOPBACK_HOSTNAMES.has(normalized) || extraAllowedHosts().has(normalized);
  } catch {
    return false;
  }
}

/**
 * Whether a request's Host header names this machine. Rejecting anything else
 * blocks DNS rebinding, which is the one path that survives both the loopback
 * bind and the origin allowlist.
 */
export function isAllowedHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const hostname = hostnameOf(hostHeader);
  if (LOOPBACK_HOSTNAMES.has(hostname)) return true;
  if (extraAllowedHosts().has(hostname)) return true;
  // Opted into LAN access: a bare IP is someone typing their own machine's
  // address, which is the intended use. A *hostname* resolving here is not -
  // that is what a rebinding attack looks like - so it still needs to be
  // listed in TRENCHCORD_ALLOWED_HOSTS.
  return bindsBeyondLoopback() && isIpLiteral(hostname);
}

/**
 * Whether arriving from loopback is by itself enough to be handed a session
 * token (GET /api/local-session).
 *
 * On a desktop it is: a request from 127.0.0.1 is the app the user just opened,
 * and other local processes already run as that user. On iOS it is not — every
 * app on the phone shares 127.0.0.1, so loopback proves nothing about *which*
 * app is asking. The native shell there passes the token explicitly instead, so
 * nothing legitimate depends on the loopback shortcut.
 */
export function trustsLoopbackForSession(): boolean {
  const override = process.env.TRENCHCORD_TRUST_LOOPBACK;
  if (override !== undefined) return override !== '0';
  return process.env.TRENCHCORD_PLATFORM !== 'ios';
}

/**
 * Warn loudly when the user has opened the server up beyond this machine.
 * Returns whether it is in fact exposed.
 */
export function warnIfExposed(bindHost: string): boolean {
  if (LOOPBACK_HOSTNAMES.has(bindHost.toLowerCase())) return false;
  console.warn(
    '[App] WARNING: TRENCHCORD_HOST is set, so Trenchcord is reachable from other devices ' +
      `on your network (bound to ${bindHost}). The API still requires the local token, but its ` +
      'settings export includes your Discord tokens and Telegram sessions, so anyone who gets ' +
      'that token gets those too. Only do this on a network you trust - never on public Wi-Fi.',
  );
  return true;
}
