import { isHostedMode } from './supabase';

/**
 * Local-mode session bootstrap.
 *
 * The self-hosted backend requires a token on /api and the WebSocket. It hands
 * that token out as an HttpOnly cookie, which is why nothing else in the app
 * has to think about it: the browser attaches it to fetches, <img> avatars,
 * media, and the socket handshake alike. All this does is ask for the cookie
 * once at startup, before the first API call goes out.
 *
 * On this machine the backend issues it on request. From another device you
 * open the ?token=... URL the server prints at startup; we exchange it and then
 * strip it from the address bar so it isn't left sitting in history.
 */

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

let established: Promise<void> | null = null;

export function ensureLocalSession(): Promise<void> {
  if (isHostedMode) return Promise.resolve();
  if (established) return established;

  established = (async () => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');

    try {
      await fetch(`${API_BASE}/local-session${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
        credentials: 'include',
      });
    } catch {
      // Backend not up yet: the app's own retries and the WS reconnect loop
      // will come back through here rather than us blocking startup on it.
      established = null;
    }

    if (token) {
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  })();

  return established;
}
