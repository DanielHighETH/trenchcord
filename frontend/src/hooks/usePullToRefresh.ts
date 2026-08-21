import { useEffect, useRef, useState, type RefObject } from 'react';

// Damped pull distance (px) at which releasing triggers a refresh.
const PULL_THRESHOLD = 64;
// The indicator stops descending past this, but the arrow keeps winding up.
const PULL_MAX = 88;
// Finger px → indicator px. Native pulls feel heavier than 1:1.
const DAMPING = 0.5;
// Keep the spinner visible at least this long so a fast refresh still reads
// as one instead of a flicker.
const MIN_SPIN_MS = 500;

/**
 * Native-style pull-to-refresh for a chat pane (iOS app, chat rooms only).
 *
 * Two surfaces, because a full room makes the classic gesture unreachable:
 *
 * - The scroll container engages only while it sits at its very top, so
 *   scrolling through history is untouched: keep pulling past the top and the
 *   indicator descends and winds up; release beyond the threshold to refresh.
 * - The pane header (optional `headerRef`) engages unconditionally — pulling
 *   the header down always means "refresh", never "scroll", so it works no
 *   matter how much history is behind the list.
 *
 * Returns whether a refresh is currently running (drives the indicator's
 * spin animation). The pull distance is painted straight onto the indicator
 * element instead of flowing through React state — a touchmove-frequency
 * re-render of a whole chat pane is exactly the jank this is meant to avoid.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLDivElement | null>,
  indicatorRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onRefresh: () => Promise<unknown>,
  headerRef?: RefObject<HTMLDivElement | null>,
): boolean {
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!enabled || !scrollEl) return;

    let engagedAtY = -1; // finger y where the pull began; -1 = not engaged
    let pull = 0;

    const paint = () => {
      const ind = indicatorRef.current;
      if (!ind) return;
      const progress = Math.min(1, pull / PULL_THRESHOLD);
      ind.style.opacity = pull > 6 ? String(progress) : '0';
      ind.style.transform =
        `translate(-50%, ${Math.min(pull, PULL_MAX)}px) rotate(${Math.round(progress * 270)}deg)`;
    };

    const reset = () => {
      engagedAtY = -1;
      pull = 0;
      const ind = indicatorRef.current;
      if (ind) {
        ind.style.opacity = '0';
        ind.style.transform = 'translate(-50%, 0px)';
      }
    };

    const onTouchStart = () => {
      engagedAtY = -1;
      pull = 0;
    };

    // requiresTop: the scroll container only turns a drag into a pull while it
    // has nothing left to scroll; the header always does.
    const makeTouchMove = (requiresTop: boolean) => (e: TouchEvent) => {
      if (refreshingRef.current) return;
      const y = e.touches[0].clientY;
      // Rubber-banding reports negative scrollTop on iOS; that still counts
      // as "at the top".
      if (requiresTop && scrollEl.scrollTop > 0) {
        if (engagedAtY !== -1) reset();
        return;
      }
      if (engagedAtY === -1) {
        // First eligible move — measure the pull from here, whether the touch
        // started here or scrolled its way up to the top first.
        engagedAtY = y;
        return;
      }
      pull = Math.max(0, (y - engagedAtY) * DAMPING);
      paint();
    };

    const onTouchEnd = () => {
      if (refreshingRef.current) return;
      if (pull < PULL_THRESHOLD) {
        reset();
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      const ind = indicatorRef.current;
      if (ind) {
        ind.style.opacity = '1';
        ind.style.transform = `translate(-50%, ${PULL_THRESHOLD}px)`;
      }
      const started = Date.now();
      void Promise.resolve(onRefreshRef.current())
        .catch(() => {})
        .then(() => {
          const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - started));
          setTimeout(() => {
            refreshingRef.current = false;
            setRefreshing(false);
            reset();
          }, wait);
        });
    };

    const surfaces: { el: HTMLElement; move: (e: TouchEvent) => void }[] = [
      { el: scrollEl, move: makeTouchMove(true) },
    ];
    const headerEl = headerRef?.current;
    if (headerEl) surfaces.push({ el: headerEl, move: makeTouchMove(false) });

    for (const { el, move } of surfaces) {
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', move, { passive: true });
      el.addEventListener('touchend', onTouchEnd, { passive: true });
      el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    }
    return () => {
      for (const { el, move } of surfaces) {
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', move);
        el.removeEventListener('touchend', onTouchEnd);
        el.removeEventListener('touchcancel', onTouchEnd);
      }
      reset();
    };
  }, [enabled, scrollRef, indicatorRef, headerRef]);

  return refreshing;
}
