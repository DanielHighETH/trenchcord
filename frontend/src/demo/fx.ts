/**
 * Action-movie effects for the scripted promo scenes (scenes.tsx): camera
 * punch-zooms and screen shake on the real app (#root), flash frames, smash
 * cuts to black, cinematic letterbox bars, fullscreen "slam" typography, and
 * synthesized impact audio (boom / whoosh / riser) via WebAudio — no assets.
 *
 * Visual layers are created inside a host element the overlay provides (its
 * portal), so unmounting the overlay tears them down. The one thing that
 * outlives the portal is the transform applied to #root — dispose() resets it.
 *
 * Layer stack (host is pointer-events: none):
 *   58 flash · 57 letterbox · 56 slam text · 54 black · 39 vignette
 * (card 50, cursor 60, captions 40 — defined by the overlay itself)
 */

export class Fx {
  private zoom = '';
  private shakeTimer: number | null = null;
  private audio: AudioContext | null = null;
  private blackEl: HTMLElement | null = null;
  private vigEl: HTMLElement | null = null;
  private bars: HTMLElement[] = [];

  constructor(private host: () => HTMLElement | null) {}

  /**
   * The element camera moves transform: the app under the overlay — or, when
   * the iOS scene wraps the app in a device body (scenes.tsx), the whole
   * phone, so zooms and shakes read as camera moves on the device.
   */
  private stage(): HTMLElement | null {
    return document.getElementById('tc-phone') ?? document.getElementById('root');
  }

  private layer(cls: string): HTMLElement | null {
    const host = this.host();
    if (!host) return null;
    const el = document.createElement('div');
    el.className = cls;
    host.appendChild(el);
    return el;
  }

  // ── audio ──────────────────────────────────────────────────────────────

  private ac(): AudioContext | null {
    try {
      this.audio ??= new AudioContext();
      return this.audio;
    } catch {
      return null; // no audio device — the show goes on silent
    }
  }

  /** Deep impact thud — text slams, reveals, the buy landing. */
  boom(intensity = 1): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6 * intensity, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
    // Punch: a short low-passed noise transient on top of the sub drop.
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g2 = ctx.createGain();
    g2.gain.value = 0.7 * intensity;
    src.connect(lp);
    lp.connect(g2);
    g2.connect(ctx.destination);
    src.start(t);
  }

  /** Tiny blip — one per chart candle as they print. */
  tick(): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1050, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** Air swipe — camera zooms and pane reveals. */
  whoosh(): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 0.38;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.55);
    bp.frequency.exponentialRampToValueAtTime(300, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
  }

  /** Rising tension into a reveal. */
  riser(sec = 1): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + sec);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + sec);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + sec * 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + sec + 0.05);
    osc.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + sec + 0.1);
  }

  // ── visual layers ──────────────────────────────────────────────────────

  flash(color = 'rgba(255,255,255,.9)', ms = 260): void {
    const el = this.layer('fx-flash');
    if (!el) return;
    el.style.background = color;
    el.style.opacity = '0.85';
    requestAnimationFrame(() => {
      el.style.transition = `opacity ${ms}ms ease-out`;
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), ms + 80);
  }

  blackOn(fadeMs = 0): void {
    if (this.blackEl) return;
    this.blackEl = this.layer('fx-black');
    if (!this.blackEl || fadeMs <= 0) return;
    this.blackEl.style.opacity = '0';
    this.blackEl.style.transition = `opacity ${fadeMs}ms ease-in`;
    requestAnimationFrame(() => {
      if (this.blackEl) this.blackEl.style.opacity = '1';
    });
  }

  blackOff(fadeMs = 0): void {
    const el = this.blackEl;
    this.blackEl = null;
    if (!el) return;
    if (fadeMs > 0) {
      el.style.transition = `opacity ${fadeMs}ms ease`;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), fadeMs + 60);
    } else {
      el.remove();
    }
  }

  letterbox(on: boolean): void {
    if (on) {
      if (this.bars.length > 0) return;
      for (const pos of ['top', 'bottom'] as const) {
        const el = this.layer('fx-bar');
        if (!el) continue;
        el.style[pos] = '0';
        this.bars.push(el);
        requestAnimationFrame(() => {
          el.style.height = '9vh';
        });
      }
    } else {
      for (const el of this.bars) {
        el.style.height = '0px';
        setTimeout(() => el.remove(), 500);
      }
      this.bars = [];
    }
  }

  vignette(on: boolean): void {
    if (on) {
      this.vigEl ??= this.layer('fx-vignette');
    } else {
      this.vigEl?.remove();
      this.vigEl = null;
    }
  }

  /** Fullscreen kinetic-typography slam; resolves after the text exits. */
  slam(text: string, opts: { hold?: number; intensity?: number } = {}): Promise<void> {
    return new Promise((resolve) => {
      const host = this.host();
      if (!host) return resolve();
      const wrap = document.createElement('div');
      wrap.className = 'fx-slam';
      const span = document.createElement('span');
      span.textContent = text;
      wrap.appendChild(span);
      host.appendChild(wrap);
      // Impact lands where the in-animation settles.
      setTimeout(() => {
        this.boom(opts.intensity ?? 1);
        this.shake(7 * (opts.intensity ?? 1), 300);
      }, 300);
      const hold = opts.hold ?? 620;
      setTimeout(() => {
        wrap.classList.add('out');
        setTimeout(() => {
          wrap.remove();
          resolve();
        }, 220);
      }, 380 + hold);
    });
  }

  // ── camera (transforms the real app under the overlay) ─────────────────

  shake(amp = 6, ms = 350): void {
    const el = this.stage();
    if (!el) return;
    if (this.shakeTimer) clearInterval(this.shakeTimer);
    const prevTransition = el.style.transition;
    el.style.transition = 'none';
    const end = Date.now() + ms;
    this.shakeTimer = window.setInterval(() => {
      if (Date.now() >= end) {
        clearInterval(this.shakeTimer!);
        this.shakeTimer = null;
        el.style.transform = this.zoom;
        el.style.transition = prevTransition;
        return;
      }
      const falloff = (end - Date.now()) / ms;
      const dx = (Math.random() * 2 - 1) * amp * falloff;
      const dy = (Math.random() * 2 - 1) * amp * falloff;
      el.style.transform = `${this.zoom} translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }, 28);
  }

  /**
   * Punch-zoom the app toward an element. getBoundingClientRect is
   * post-transform while transform-origin wants stage-local layout
   * coordinates, so only call this from the unzoomed state (zoomOut() first)
   * — the scripts do.
   */
  zoomTo(target: HTMLElement, scale = 1.3, ms = 550): void {
    const el = this.stage();
    if (!el) return;
    const r = target.getBoundingClientRect();
    const stageR = el.getBoundingClientRect();
    el.style.transformOrigin = `${r.left + r.width / 2 - stageR.left}px ${r.top + r.height / 2 - stageR.top}px`;
    el.style.transition = `transform ${ms}ms cubic-bezier(.22,.9,.24,1)`;
    this.zoom = `scale(${scale})`;
    el.style.transform = this.zoom;
  }

  zoomOut(ms = 500): void {
    const el = this.stage();
    if (!el) return;
    el.style.transition = `transform ${ms}ms cubic-bezier(.3,.7,.2,1)`;
    this.zoom = '';
    el.style.transform = '';
  }

  /** The overlay's unmount hook: undo everything that outlives the portal. */
  dispose(): void {
    if (this.shakeTimer) clearInterval(this.shakeTimer);
    const el = this.stage();
    if (el) {
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.transition = '';
    }
    void this.audio?.close().catch(() => {});
    this.audio = null;
  }
}

export const FX_CSS = `
  .fx-flash { position: absolute; inset: 0; z-index: 58; pointer-events: none; }
  .fx-black { position: absolute; inset: 0; z-index: 54; background: #000; }
  .fx-bar { position: absolute; left: 0; right: 0; height: 0; background: #000; z-index: 57;
    transition: height .45s cubic-bezier(.2,.8,.2,1); }
  .fx-vignette { position: absolute; inset: 0; z-index: 39; pointer-events: none;
    box-shadow: inset 0 0 240px rgba(0,0,0,.62); }
  .fx-slam { position: absolute; inset: 0; z-index: 56; display: flex; align-items: center;
    justify-content: center; pointer-events: none; text-align: center; padding: 0 4vw; }
  .fx-slam span { font-size: clamp(44px, 7.6vw, 138px); font-weight: 900; letter-spacing: -.03em;
    line-height: 1.04; color: #fff;
    text-shadow: 0 0 46px rgba(88,101,242,.6), 3px 0 0 rgba(255,0,80,.32), -3px 0 0 rgba(0,200,255,.32);
    animation: fx-slam-in .38s cubic-bezier(.16,1.2,.3,1) both; }
  @keyframes fx-slam-in {
    0% { transform: scale(2.5); opacity: 0; filter: blur(10px); }
    55% { opacity: 1; }
    100% { transform: scale(1); filter: blur(0); }
  }
  .fx-slam.out span { animation: fx-slam-out .22s ease-in both; }
  @keyframes fx-slam-out { to { transform: scale(.9); opacity: 0; } }
`;
