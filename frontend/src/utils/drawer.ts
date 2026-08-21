/**
 * One-shot handshake for opening the sidebar drawer without its slide-in
 * animation. Used when navigating back from Settings on the phone: the user
 * mentally never left the drawer, so it should already be sitting there
 * rather than animating in.
 */
let instantOpen = false;

export function requestInstantDrawerOpen(): void {
  instantOpen = true;
}

/** Returns true at most once per request — the flag clears on read. */
export function consumeInstantDrawerOpen(): boolean {
  const value = instantOpen;
  instantOpen = false;
  return value;
}

/**
 * iOS WebKit dispatches trailing synthetic mouse events at the touch point
 * after a tap. When that tap closes the full-screen drawer, the late click
 * hit-tests whatever the chat now shows under the finger — an image opens its
 * lightbox, a link opens Safari — "out of nowhere". Swallow document-level
 * clicks for a beat after the drawer closes; capture phase, so it can't affect
 * the tap's own click, which has already passed the document on its way down.
 */
export function suppressGhostClicks(ms = 400): void {
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener('click', swallow, true);
  window.setTimeout(() => document.removeEventListener('click', swallow, true), ms);
}
