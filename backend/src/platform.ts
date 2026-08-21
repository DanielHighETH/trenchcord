/**
 * Which shell the backend is running inside. Set by the native host:
 * `ios` from the iOS app, unset everywhere else (desktop, dev, hosted).
 *
 * The iOS build hides the in-app payment flow (plans, checkout, payment
 * history — the routes gated by isBillingHidden below): App Store guideline
 * 3.1.1 forbids unlocking features through purchases made outside Apple's
 * IAP. Dashboard *links* (signup, device approval, manage subscription) are
 * deliberately allowed on iOS as of v2 — the app is TestFlight-only and the
 * shipped version string has passed Beta App Review — they open in Safari,
 * and payment itself always happens on the web dashboard, never in the app.
 */
export type AppPlatform = 'ios' | 'desktop';

export function getPlatform(): AppPlatform {
  return process.env.TRENCHCORD_PLATFORM === 'ios' ? 'ios' : 'desktop';
}

export function isIosApp(): boolean {
  return getPlatform() === 'ios';
}

/** Whether the in-app payment flow (plans/checkout/payment routes) must be
 * withheld. Dashboard links are exempt — see the header comment. */
export function isBillingHidden(): boolean {
  return isIosApp();
}

/**
 * Human label for this install in the account dashboard's device list.
 * os.hostname() is meaningless under nodejs-mobile (it returns "localhost"),
 * so the native shell passes the real device name in.
 */
export function getDeviceLabel(fallbackHostname: string): string {
  const supplied = process.env.TRENCHCORD_DEVICE_NAME?.trim();
  return supplied || fallbackHostname;
}

export function getPlatformLabel(): string {
  if (isIosApp()) return 'iOS';
  return process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
}
