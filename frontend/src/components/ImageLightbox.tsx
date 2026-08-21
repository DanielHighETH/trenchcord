import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Download, ExternalLink, X } from 'lucide-react';
import { saveImage } from '../utils/saveImage';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
/** Two pointer-ups closer than this (ms / px) count as a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 40;
/** Movement below this is still a tap, not a pan. */
const TAP_SLOP = 6;

/**
 * Full-screen image viewer with zoom. All input goes through pointer events so
 * one code path serves mouse (wheel zoom, drag pan, click-to-zoom) and touch
 * (pinch, one-finger pan, double-tap). The transform lives in a ref and is
 * written straight to the <img> style — a React state round-trip per
 * pointermove would stutter on the phone.
 */
export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const view = useRef({ scale: 1, tx: 0, ty: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startDist: number;
    startScale: number;
    startMid: { x: number; y: number };
    startTx: number;
    startTy: number;
    moved: boolean;
    onImage: boolean;
  } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  const [zoomed, setZoomed] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle');

  const apply = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const { scale, tx, ty } = view.current;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    setZoomed(scale > 1.001);
  }, []);

  /** Keep the image from being panned fully off screen. */
  const clampPan = useCallback(() => {
    const img = imgRef.current;
    const c = containerRef.current;
    if (!img || !c) return;
    const v = view.current;
    const maxX = Math.max(0, (img.offsetWidth * v.scale - c.clientWidth) / 2 + 24);
    const maxY = Math.max(0, (img.offsetHeight * v.scale - c.clientHeight) / 2 + 24);
    v.tx = Math.min(maxX, Math.max(-maxX, v.tx));
    v.ty = Math.min(maxY, Math.max(-maxY, v.ty));
  }, []);

  /** Zoom so the image point under (cx, cy) — container-center coords — stays put. */
  const zoomAt = useCallback(
    (cx: number, cy: number, nextScale: number) => {
      const v = view.current;
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
      const k = s / v.scale;
      v.tx = cx - k * (cx - v.tx);
      v.ty = cy - k * (cy - v.ty);
      v.scale = s;
      if (s <= MIN_SCALE + 0.001) {
        v.scale = 1;
        v.tx = 0;
        v.ty = 0;
      }
      clampPan();
      apply();
    },
    [apply, clampPan],
  );

  /** Ease the next transform change (double-tap toggle, snap back). Gestures clear it. */
  const animateNextChange = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    img.style.transition = 'transform 200ms cubic-bezier(0.25, 0.9, 0.3, 1)';
    setTimeout(() => {
      if (imgRef.current) imgRef.current.style.transition = '';
    }, 250);
  }, []);

  const toggleZoom = useCallback(
    (clientX: number, clientY: number) => {
      const c = containerRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      animateNextChange();
      if (view.current.scale > 1.001) {
        view.current = { scale: 1, tx: 0, ty: 0 };
        apply();
      } else {
        zoomAt(clientX - rect.left - rect.width / 2, clientY - rect.top - rect.height / 2, DOUBLE_TAP_SCALE);
      }
    },
    [animateNextChange, apply, zoomAt],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Wheel zoom needs preventDefault (browser zoom / scroll chaining), so it
  // must be a non-passive native listener rather than React's onWheel.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      if (imgRef.current) imgRef.current.style.transition = '';
      zoomAt(cx, cy, view.current.scale * Math.exp(-e.deltaY * 0.0022));
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /** (Re)snapshot the gesture for however many pointers are currently down. */
  const startGesture = useCallback(() => {
    const pts = [...pointers.current.values()];
    const v = view.current;
    const prev = gesture.current;
    if (pts.length === 1) {
      gesture.current = {
        startDist: 0,
        startScale: v.scale,
        startMid: pts[0],
        startTx: v.tx,
        startTy: v.ty,
        moved: prev?.moved ?? false,
        onImage: prev?.onImage ?? false,
      };
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = {
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        startScale: v.scale,
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        startTx: v.tx,
        startTy: v.ty,
        moved: true, // a pinch is never a tap
        onImage: prev?.onImage ?? false,
      };
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Let the save/close buttons behave like normal buttons: capturing their
      // pointer would retarget their click events onto this container.
      if ((e.target as Element).closest('button')) return;
      containerRef.current?.setPointerCapture(e.pointerId);
      if (imgRef.current) imgRef.current.style.transition = '';
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      startGesture();
      if (gesture.current && pointers.current.size === 1) {
        gesture.current.moved = false;
        gesture.current.onImage = e.target === imgRef.current;
      }
    },
    [startGesture],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      const c = containerRef.current;
      if (!g || !c) return;
      const pts = [...pointers.current.values()];
      const v = view.current;

      if (pts.length === 1) {
        const dx = pts[0].x - g.startMid.x;
        const dy = pts[0].y - g.startMid.y;
        if (Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
        if (v.scale > 1.001) {
          v.tx = g.startTx + dx;
          v.ty = g.startTy + dy;
          clampPan();
          apply();
        }
      } else {
        const [a, b] = pts;
        const rect = c.getBoundingClientRect();
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.startScale * (dist / Math.max(1, g.startDist))));
        const k = s / g.startScale;
        const cx = g.startMid.x - rect.left - rect.width / 2;
        const cy = g.startMid.y - rect.top - rect.height / 2;
        v.scale = s;
        // Zoom around the pinch origin, then follow the midpoint's travel.
        v.tx = cx - k * (cx - g.startTx) + (mid.x - g.startMid.x);
        v.ty = cy - k * (cy - g.startTy) + (mid.y - g.startMid.y);
        clampPan();
        apply();
      }
    },
    [apply, clampPan],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.delete(e.pointerId)) return;
      if (pointers.current.size > 0) {
        startGesture();
        return;
      }
      const g = gesture.current;
      gesture.current = null;

      if (view.current.scale < 1.05 && view.current.scale !== 1) {
        animateNextChange();
        view.current = { scale: 1, tx: 0, ty: 0 };
        apply();
      }
      if (!g || g.moved) return;

      // A clean tap. On the image: a mouse click toggles zoom straight away
      // (the cursor advertises it), touch needs a double-tap so a stray tap
      // doesn't zoom. On the backdrop: close, like before.
      if (g.onImage) {
        if (e.pointerType === 'mouse') {
          toggleZoom(e.clientX, e.clientY);
          return;
        }
        const now = Date.now();
        const t = lastTap.current;
        if (t && now - t.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - t.x, e.clientY - t.y) < DOUBLE_TAP_SLOP) {
          lastTap.current = null;
          toggleZoom(e.clientX, e.clientY);
        } else {
          lastTap.current = { time: now, x: e.clientX, y: e.clientY };
        }
      } else {
        onClose();
      }
    },
    [animateNextChange, apply, onClose, startGesture, toggleZoom],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  }, []);

  const handleSave = useCallback(async () => {
    if (saveState !== 'idle') return;
    setSaveState('saving');
    try {
      await saveImage(src);
      setSaveState('done');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      setSaveState('idle');
      alert(err instanceof Error && err.message ? err.message : 'Could not save the image.');
    }
  }, [saveState, src]);

  // Backend-served media (Telegram) needs the session cookie, which an outside
  // browser doesn't have — only offer "open externally" for public CDN URLs.
  const canOpenExternally = /^https:\/\//i.test(src);

  // Portaled to <body>: the viewer is logically a full-screen overlay, but it
  // is *rendered* from inside a message, and message styling would bleed into
  // it — most visibly the opacity-60 a deleted message puts on its container.
  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black/80 cursor-zoom-out select-none animate-fade-in"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      // Keep the app's global edge-swipe (open drawer) out of the viewer.
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="absolute top-[calc(1rem+var(--safe-top))] right-4 z-10 flex items-center gap-2">
        {canOpenExternally && (
          <button
            onClick={() => window.open(src, '_blank', 'noopener')}
            className="p-2.5 rounded-full bg-black/50 text-white/80 hover:text-white transition-colors"
            title="Open image in new window"
          >
            <ExternalLink size={22} />
          </button>
        )}
        <button
          onClick={handleSave}
          className="p-2.5 rounded-full bg-black/50 text-white/80 hover:text-white transition-colors disabled:opacity-60"
          disabled={saveState === 'saving'}
          title="Save image"
        >
          {saveState === 'done' ? (
            <Check size={22} className="text-green-400" />
          ) : (
            <Download size={22} className={saveState === 'saving' ? 'animate-pulse' : ''} />
          )}
        </button>
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-black/50 text-white/80 hover:text-white transition-colors"
          title="Close"
        >
          <X size={22} />
        </button>
      </div>
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? ''}
        draggable={false}
        className={`max-w-[90dvw] max-h-[85dvh] object-contain rounded-lg shadow-2xl will-change-transform ${
          zoomed ? 'cursor-zoom-out active:cursor-grabbing' : 'cursor-zoom-in'
        }`}
      />
    </div>,
    document.body,
  );
}
