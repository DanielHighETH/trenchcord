/**
 * Shared stagecraft for scripted demo overlays — the full promo tour
 * (tour.tsx) and the fast-paced promo scenes (scenes.tsx). A fake cursor
 * glides through the real UI, clicks ripple, elements get spotlighted, and
 * targets are found by their visible text so no data-attributes leak into
 * real components. Each overlay constructs one Director per run; every wait
 * goes through it, so cancelling (unmount) aborts the script cleanly via the
 * thrown 'director-cancelled'.
 */
import type { RefObject } from 'react';

export const CURSOR_SVG = (
  <svg width="26" height="30" viewBox="0 0 26 30" fill="none">
    <path
      d="M3 1.5 L3 24 L9 18.6 L12.8 27.4 L17.2 25.5 L13.5 17 L21.5 17 Z"
      fill="#ffffff"
      stroke="#000000"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

export const DIRECTOR_CSS = `
  html.touring ::-webkit-scrollbar { display: none; }
  html.touring, html.touring * { cursor: none !important; }
  .tour-cursor { position: absolute; left: 0; top: 0; z-index: 60; will-change: transform;
    filter: drop-shadow(0 2px 6px rgba(0,0,0,.55)); transition: opacity .4s ease; }
  .tour-cursor-inner { transform-origin: 6px 4px; }
  .tour-ripple { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 9999px;
    border: 2.5px solid rgba(255,255,255,.85); animation: tour-ripple .65s ease-out forwards; z-index: 55; }
  @keyframes tour-ripple { from { transform: scale(.4); opacity: .9 } to { transform: scale(3.2); opacity: 0 } }
  .tour-spot { position: absolute; z-index: 45; border: 2.5px solid #5865f2; border-radius: 8px;
    box-shadow: 0 0 0 5px rgba(88,101,242,.3), 0 0 26px rgba(88,101,242,.55); pointer-events: none;
    animation: tour-spot-pulse .8s ease-in-out infinite alternate; }
  @keyframes tour-spot-pulse { from { transform: scale(1); opacity: .8 } to { transform: scale(1.06); opacity: 1 } }
  .tour-caption-wrap { position: absolute; left: 0; right: 0; bottom: 44px; display: flex; justify-content: center;
    z-index: 40; animation: tour-caption-in .45s cubic-bezier(.2,.7,.2,1); }
  .tour-caption { max-width: min(880px, 86vw); text-align: center; padding: 14px 28px; border-radius: 18px;
    background: rgba(17,18,20,.9); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 12px 40px rgba(0,0,0,.5);
    backdrop-filter: blur(10px); color: #fff; font-size: 20px; font-weight: 600; letter-spacing: .01em; }
  @keyframes tour-caption-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
  .tour-card { position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 14px;
    background: radial-gradient(1200px 700px at 50% 35%, #24263a 0%, #17181c 55%, #101114 100%);
    animation: tour-card-in .6s ease; }
  .tour-card.leaving { animation: tour-card-out .65s ease forwards; }
  @keyframes tour-card-in { from { opacity: 0 } to { opacity: 1 } }
  @keyframes tour-card-out { from { opacity: 1 } to { opacity: 0 } }
  .tour-card img { width: 100px; height: 100px; border-radius: 26px;
    box-shadow: 0 18px 60px rgba(88,101,242,.35); animation: tour-pop .7s cubic-bezier(.2,.8,.2,1.15); }
  @keyframes tour-pop { from { transform: scale(.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }
  .tour-card h1 { font-size: 58px; font-weight: 800; color: #fff; letter-spacing: -.02em; margin-top: 6px; }
  .tour-card p { font-size: 22px; color: #b5bac1; }
  .tour-card .tour-platforms { font-size: 17px; color: #82868f; letter-spacing: .06em; margin-top: 2px; }
  .tour-card .tour-cta { margin-top: 14px; padding: 13px 30px; border-radius: 9999px; background: #5865f2;
    color: #fff; font-size: 21px; font-weight: 700; box-shadow: 0 10px 34px rgba(88,101,242,.45); }
`;

/**
 * react-resizable-panels persists dragged sizes per autoSaveId; drop them so
 * every take opens its split at a clean 50/50.
 */
export function clearPaneSizeMemory(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.includes('react-resizable-panels')) localStorage.removeItem(key);
    }
  } catch {
    /* storage disabled */
  }
}

export class Director {
  private cx = window.innerWidth / 2;
  private cy = window.innerHeight * 0.6;

  /**
   * cursorSpeed scales cursor travel time — 1 is the tour's pace, lower is
   * snappier (the promo scenes run at ~0.75).
   */
  constructor(
    private cursorRef: RefObject<HTMLDivElement | null>,
    private rippleHostRef: RefObject<HTMLDivElement | null>,
    private isCancelled: () => boolean,
    private cursorSpeed = 1,
  ) {}

  private ck(): void {
    if (this.isCancelled()) throw new Error('director-cancelled');
  }

  async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
    this.ck();
  }

  private cursorEl(): HTMLDivElement | null {
    return this.cursorRef.current;
  }

  setCursorVisible(visible: boolean): void {
    const el = this.cursorEl();
    if (el) el.style.opacity = visible ? '1' : '0';
  }

  /** Snap the cursor to its current logical position without animating. */
  placeCursor(): void {
    const el = this.cursorEl();
    if (el) el.style.transform = `translate(${this.cx}px, ${this.cy}px)`;
  }

  async moveToPoint(x: number, y: number): Promise<void> {
    const el = this.cursorEl();
    if (!el) return;
    const dist = Math.hypot(x - this.cx, y - this.cy);
    const dur = Math.max(420, Math.min(1150, dist * 1.7)) * this.cursorSpeed;
    el.style.transition = `transform ${dur}ms cubic-bezier(.3,.6,.15,1), opacity .4s ease`;
    el.style.transform = `translate(${x}px, ${y}px)`;
    this.cx = x;
    this.cy = y;
    await this.sleep(dur + 100);
  }

  // Anchor UI targets by their visible label — keeps the scripts free of
  // data-attributes sprinkled through real components.
  private textNodes(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('button, span, div, a, h1, h2, h3'));
  }

  findText(text: string): HTMLElement | null {
    for (const el of this.textNodes()) {
      if (el.childElementCount === 0 && el.textContent?.trim() === text) return el;
    }
    return null;
  }

  /** Last match in DOM order — e.g. the buy row under the *newest* message. */
  findLastText(text: string): HTMLElement | null {
    let found: HTMLElement | null = null;
    for (const el of this.textNodes()) {
      if (el.childElementCount === 0 && el.textContent?.trim() === text) found = el;
    }
    return found;
  }

  findTitle(prefix: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[title^="${prefix}"]`);
  }

  /** Last *visible* element matching a selector — skips display:none twins. */
  findLastVisible(selector: string): HTMLElement | null {
    let found: HTMLElement | null = null;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (el.offsetParent !== null) found = el;
    }
    return found;
  }

  /** Icon-only buttons wrapped in <Tip label>: the label is a hidden sibling span. */
  tipButton(label: string): HTMLElement | null {
    const span = this.findText(label);
    return (span?.parentElement?.querySelector('button') as HTMLElement | null) ?? null;
  }

  async waitFor<T>(fn: () => T | null, timeout = 6000): Promise<T | null> {
    const start = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - start > timeout) return null;
      await this.sleep(120);
    }
  }

  pressAndRipple(): void {
    const c = this.cursorEl();
    const inner = c?.firstElementChild as HTMLElement | null;
    if (inner) {
      inner.style.transition = 'transform 110ms ease';
      inner.style.transform = 'scale(0.82)';
      setTimeout(() => {
        inner.style.transform = 'scale(1)';
      }, 130);
    }
    const host = this.rippleHostRef.current;
    if (host) {
      const r = document.createElement('div');
      r.className = 'tour-ripple';
      r.style.left = `${this.cx}px`;
      r.style.top = `${this.cy}px`;
      host.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }
  }

  async clickEl(el: HTMLElement): Promise<void> {
    this.pressAndRipple();
    await this.sleep(140);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await this.sleep(260);
  }

  clickable(el: HTMLElement): HTMLElement {
    return (el.closest('button, [role="button"], [class*="cursor-pointer"]') as HTMLElement | null) ?? el;
  }

  async moveToEl(el: HTMLElement, xFrac = 0.5): Promise<void> {
    const r = el.getBoundingClientRect();
    await this.moveToPoint(r.left + Math.min(r.width * xFrac, 140), r.top + r.height / 2);
  }

  async clickText(text: string): Promise<boolean> {
    const label = await this.waitFor(() => this.findText(text));
    if (!label) return false; // markup drifted — skip the beat, keep the show going
    const target = this.clickable(label);
    await this.moveToEl(target);
    await this.clickEl(target);
    return true;
  }

  /** Pulsing outline around an element while the cursor rests on it. */
  spotlight(el: HTMLElement, ms: number): void {
    const host = this.rippleHostRef.current;
    if (!host) return;
    const r = el.getBoundingClientRect();
    const s = document.createElement('div');
    s.className = 'tour-spot';
    s.style.left = `${r.left - 6}px`;
    s.style.top = `${r.top - 6}px`;
    s.style.width = `${r.width + 12}px`;
    s.style.height = `${r.height + 12}px`;
    host.appendChild(s);
    setTimeout(() => s.remove(), ms);
  }

  /** Simulated drag on a react-resizable-panels handle (edit mode only). */
  async dragResize(dx: number): Promise<void> {
    const handle = document.querySelector<HTMLElement>('[data-panel-resize-handle-id]');
    if (!handle) return;
    const r = handle.getBoundingClientRect();
    const sx = r.left + r.width / 2;
    const sy = r.top + r.height * 0.45;
    await this.moveToPoint(sx, sy);
    const opts = (x: number, buttons: number): PointerEventInit => ({
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: sy,
      pointerId: 7,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons,
    });
    // The panel library aborts a drag when it sees a pointermove with no
    // button held — which is exactly what the viewer's real, un-pressed
    // mouse emits if it drifts even a pixel during the simulation. Swallow
    // trusted events for the drag window so only the scripted ones land.
    const swallowReal = (e: Event) => {
      if (e.isTrusted) e.stopImmediatePropagation();
    };
    const realTypes = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'contextmenu', 'mousedown', 'mousemove', 'mouseup'];
    for (const t of realTypes) window.addEventListener(t, swallowReal, true);
    try {
      handle.dispatchEvent(new PointerEvent('pointerdown', opts(sx, 1)));
      // Slow enough to register as a deliberate drag on video — an instant
      // jump reads as "nothing happened".
      const steps = 26;
      for (let i = 1; i <= steps; i++) {
        // Ease in/out so the drag looks hand-made.
        const t = i / steps;
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const x = sx + dx * eased;
        document.body.dispatchEvent(new PointerEvent('pointermove', opts(x, 1)));
        const el = this.cursorEl();
        if (el) {
          el.style.transition = 'transform 55ms linear';
          el.style.transform = `translate(${x}px, ${sy}px)`;
        }
        this.cx = x;
        await this.sleep(55);
      }
      document.body.dispatchEvent(new PointerEvent('pointerup', opts(sx + dx, 0)));
    } finally {
      for (const t of realTypes) window.removeEventListener(t, swallowReal, true);
    }
    await this.sleep(500);
  }
}
