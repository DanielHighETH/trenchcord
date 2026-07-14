import type { Agent as HttpAgent } from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyAgent } from 'undici';

// Bundles the two proxy primitives Discord traffic needs: an http.Agent for the
// gateway WebSocket (the `ws` library takes `agent`) and an undici dispatcher for
// the REST calls (global fetch honours `dispatcher`). Both must route through the
// same proxy so a VPN-blocked user gets channels (WS) *and* history (REST).
export interface ProxyBundle {
  url: string;
  wsAgent: HttpAgent;
  dispatcher: ProxyAgent;
}

// Only HTTP/HTTPS CONNECT proxies are supported. SOCKS is intentionally left out:
// undici's fetch has no built-in SOCKS dispatcher, so supporting it would proxy
// the WebSocket but silently fail the REST calls — an inconsistent half-fix.
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
      dispatcher: new ProxyAgent(url),
    };
  } catch (err: any) {
    console.warn(`[Proxy] Failed to initialise proxy "${url}": ${err?.message ?? err}. Connecting directly.`);
    return null;
  }
}
