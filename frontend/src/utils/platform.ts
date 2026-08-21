/**
 * Which shell the UI is running inside.
 *
 * The iOS app injects `window.__TRENCHCORD_PLATFORM__` before any app code runs
 * (a WKUserScript at document start). The backend independently reports the same
 * thing on GET /api/cloud/status, so anything security- or review-critical can
 * check both — but this one is available synchronously during first render.
 */
declare global {
  interface Window {
    __TRENCHCORD_PLATFORM__?: string;
  }
}

export function isIOSApp(): boolean {
  return typeof window !== 'undefined' && window.__TRENCHCORD_PLATFORM__ === 'ios';
}

/** True in the Electron desktop shell, which exposes a preload bridge. */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!window.trenchcord;
}

/**
 * Phone-shaped layout: the iOS app, or any viewport under 768px. Must stay in
 * sync with the `compact` class set on <html> by the index.html inline script
 * (and kept current by useCompactClass in App.tsx) — JS behavior and compact:
 * CSS variants must agree on what "compact" means. Deliberately ignores touch
 * capability: a touchscreen laptop at full width is not a phone.
 */
export function isCompactLayout(): boolean {
  if (typeof window === 'undefined') return false;
  return isIOSApp() || window.innerWidth < 768;
}

import { useSyncExternalStore } from 'react';

const subscribeResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

/** Reactive isCompactLayout() — re-renders when a browser crosses the breakpoint. */
export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribeResize, isCompactLayout, () => false);
}
