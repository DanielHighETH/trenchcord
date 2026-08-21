import type { Agent as HttpAgent } from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { AppRequestInit, AppResponse } from '../utils/http.js';

// Bundles the two proxy primitives Discord traffic needs: an http.Agent for the
// gateway WebSocket (the `ws` library takes `agent`) and a proxied fetch for the
// REST calls. Both must route through the same proxy so a VPN-blocked user gets
// channels (WS) *and* history (REST).
export interface ProxyBundle {
  url: string;
  wsAgent: HttpAgent;
  fetch(url: string, init?: AppRequestInit): Promise<AppResponse>;
}

// undici is loaded on first proxied request rather than at import time. It parses
// HTTP with a WebAssembly module, which doesn't exist under nodejs-mobile's
// JIT-less V8 — a static import there risks an unhandled rejection at startup on
// iOS, where proxies aren't supported anyway.
let proxyAgentCtor: Promise<typeof import('undici')> | null = null;

async function proxiedFetch(proxyUrl: string, url: string, init?: AppRequestInit): Promise<AppResponse> {
  proxyAgentCtor ??= import('undici');
  const { fetch: undiciFetch, ProxyAgent } = await proxyAgentCtor;
  const dispatcher = getDispatcher(proxyUrl, ProxyAgent);
  return undiciFetch(url, { ...(init as any), dispatcher }) as unknown as Promise<AppResponse>;
}

// One dispatcher per proxy URL: a fresh ProxyAgent per request would leak sockets.
const dispatchers = new Map<string, unknown>();

function getDispatcher(proxyUrl: string, ProxyAgent: typeof import('undici').ProxyAgent): unknown {
  let dispatcher = dispatchers.get(proxyUrl);
  if (!dispatcher) {
    dispatcher = new ProxyAgent(proxyUrl);
    dispatchers.set(proxyUrl, dispatcher);
  }
  return dispatcher;
}

// Only HTTP/HTTPS CONNECT proxies are supported. SOCKS is intentionally left out:
// undici's fetch has no built-in SOCKS dispatcher, so supporting it would proxy
// the WebSocket but silently fail the REST calls — an inconsistent half-fix.
// Not supported on iOS at all (see proxiedFetch above); the settings export
// strips discordProxyUrl, so an imported config never carries one over.
export function createProxyBundle(rawUrl: string | undefined | null): ProxyBundle | null {
  const url = rawUrl?.trim();
  if (!url) return null;

  let scheme: string;
  try {
    scheme = new URL(url).protocol.replace(':', '').toLowerCase();
  } catch {
    console.warn(`[Proxy] Invalid proxy URL "${url}" — ignoring, connecting directly.`);
    return null;
  }

  if (scheme !== 'http' && scheme !== 'https') {
    console.warn(`[Proxy] Unsupported proxy scheme "${scheme}" (only http/https). Ignoring.`);
    return null;
  }

  try {
    return {
      url,
      wsAgent: new HttpsProxyAgent(url),
      fetch: (target, init) => proxiedFetch(url, target, init),
    };
  } catch (err: any) {
    console.warn(`[Proxy] Failed to initialise proxy "${url}": ${err?.message ?? err}. Connecting directly.`);
    return null;
  }
}
