import { useRef, useState, useEffect, useCallback, type RefObject } from 'react';

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  disabled?: boolean;
}

interface UseSwipeReturn {
  ref: RefObject<HTMLDivElement | null>;
  offset: number;
  swiping: boolean;
  recentlySwiped: boolean;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold: thresholdProp,
  disabled = false,
}: UseSwipeOptions): UseSwipeReturn {
  const ref = useRef<HTMLDivElement>(null);
  const [swiping, setSwiping] = useState(false);
  const [offset, setOffset] = useState(0);
  const [recentlySwiped, setRecentlySwiped] = useState(false);

  // Refs for drag state (avoid re-renders during drag)
  const startX = useRef(0);
  const startY = useRef(0);
  const currentOffset = useRef(0);
  const axisLocked = useRef<'horizontal' | 'vertical' | null>(null);
  const swipingRef = useRef(false);
  const recentlySwipedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reducedMotion = useRef(false);

  const threshold = thresholdProp ?? Math.min(80, window.innerWidth * 0.2);

  // Check prefers-reduced-motion (live-updated)
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = mql.matches;
    const onChange = (e: MediaQueryListEvent) => { reducedMotion.current = e.matches; };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resetDrag = useCallback(() => {
    const el = ref.current;
    if (el) {
      if (reducedMotion.current) {
        el.style.transform = '';
        el.style.opacity = '';
      } else {
        el.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
        const onEnd = (e?: TransitionEvent) => {
          if (e && e.propertyName !== 'transform') return;
          el.style.transition = '';
          el.style.transform = '';
          el.style.opacity = '';
          el.removeEventListener('transitionend', onEnd as EventListener);
        };
        el.addEventListener('transitionend', onEnd as EventListener);
        setTimeout(() => onEnd(), 250);
      }
      el.style.willChange = '';
    }
    currentOffset.current = 0;
    axisLocked.current = null;
    swipingRef.current = false;
    setSwiping(false);
    setOffset(0);
  }, []);

  const triggerRecentlySwiped = useCallback(() => {
    setRecentlySwiped(true);
    clearTimeout(recentlySwipedTimer.current);
    recentlySwipedTimer.current = setTimeout(() => setRecentlySwiped(false), 400);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    // Set touch-action for native vertical scroll + no click delay
    el.style.touchAction = 'pan-y';

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      currentOffset.current = 0;
      axisLocked.current = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;

      // Axis lock after 10px of movement
      if (!axisLocked.current) {
        const totalDist = Math.abs(deltaX) + Math.abs(deltaY);
        if (totalDist < 10) return;
        // 2:1 ratio for horizontal lock
        if (Math.abs(deltaX) > 2 * Math.abs(deltaY)) {
          axisLocked.current = 'horizontal';
        } else {
          axisLocked.current = 'vertical';
          return;
        }
      }

      if (axisLocked.current !== 'horizontal') return;

      // Suppress vertical scroll during horizontal swipe
      e.preventDefault();

      currentOffset.current = deltaX;

      if (!swipingRef.current) {
        swipingRef.current = true;
        setSwiping(true);
        el.style.willChange = 'transform';
      }

      // Direct DOM mutation for performance
      el.style.transform = `translateX(${deltaX}px)`;
      // Progressive opacity: 1 → 0.6 over 200px
      el.style.opacity = String(1 - Math.min(0.4, Math.abs(deltaX) / 200));
      // Update offset state for reveal layer
      setOffset(deltaX);
    };

    const handleTouchEnd = () => {
      if (!swipingRef.current) {
        axisLocked.current = null;
        return;
      }

      triggerRecentlySwiped();

      const absOffset = Math.abs(currentOffset.current);
      const direction = currentOffset.current < 0 ? 'left' : 'right';
      const handler = direction === 'left' ? onSwipeLeft : onSwipeRight;

      if (absOffset >= threshold && handler) {
        // Exceeded threshold — animate off-screen then fire callback
        const screenWidth = window.innerWidth;
        const targetX = direction === 'left' ? -screenWidth : screenWidth;

        if (reducedMotion.current) {
          // Instant pass for reduced motion
          el.style.transform = '';
          el.style.opacity = '';
          el.style.willChange = '';
          currentOffset.current = 0;
          axisLocked.current = null;
          swipingRef.current = false;
          setSwiping(false);
          setOffset(0);
          handler();
          return;
        }

        // Step 1: Slide card off-screen
        el.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        el.style.transform = `translateX(${targetX}px)`;
        el.style.opacity = '0';

        const parentEl = el.parentElement;

        const finishSwipe = () => {
          // Clean up card styles
          el.style.transition = '';
          el.style.transform = '';
          el.style.opacity = '';
          el.style.willChange = '';
          currentOffset.current = 0;
          axisLocked.current = null;
          swipingRef.current = false;
          setSwiping(false);
          setOffset(0);
        };

        let slideOffFired = false;
        const slideOffDone = (e?: TransitionEvent) => {
          if (e && e.propertyName !== 'transform') return;
          if (slideOffFired) return;
          slideOffFired = true;
          clearTimeout(slideOffFallback);
          el.removeEventListener('transitionend', slideOffDone);

          if (parentEl) {
            // Step 2: Collapse container height
            const currentHeight = parentEl.getBoundingClientRect().height;
            parentEl.style.height = `${currentHeight}px`;
            parentEl.style.overflow = 'hidden';
            parentEl.style.transition = 'height 0.15s ease-out, margin 0.15s ease-out';

            // Force reflow
            parentEl.offsetHeight;

            parentEl.style.height = '0px';
            parentEl.style.marginTop = '0px';
            parentEl.style.marginBottom = '0px';

            let collapseFired = false;
            const collapseDone = (e2?: TransitionEvent) => {
              if (e2 && e2.propertyName !== 'height') return;
              if (collapseFired) return;
              collapseFired = true;
              clearTimeout(collapseFallback);
              parentEl.removeEventListener('transitionend', collapseDone);
              // Clean up parent
              parentEl.style.height = '';
              parentEl.style.overflow = '';
              parentEl.style.transition = '';
              parentEl.style.marginTop = '';
              parentEl.style.marginBottom = '';
              finishSwipe();
              handler();
            };
            parentEl.addEventListener('transitionend', collapseDone as EventListener);
            const collapseFallback = setTimeout(() => collapseDone(), 200);
          } else {
            finishSwipe();
            handler();
          }
        };
        el.addEventListener('transitionend', slideOffDone as EventListener);
        const slideOffFallback = setTimeout(() => slideOffDone(), 250);
      } else {
        // Below threshold — snap back
        resetDrag();
      }
    };

    const handleTouchCancel = () => {
      if (swipingRef.current) {
        resetDrag();
        triggerRecentlySwiped();
      } else {
        axisLocked.current = null;
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    // Non-passive touchmove for preventDefault on iOS Safari
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
      el.style.touchAction = '';
    };
  }, [disabled, threshold, onSwipeLeft, onSwipeRight, resetDrag, triggerRecentlySwiped]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(recentlySwipedTimer.current);
  }, []);

  return { ref, offset, swiping, recentlySwiped };
}
