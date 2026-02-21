import { useState, useEffect, RefObject } from 'react';

interface ScrollToTopProps {
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

export function ScrollToTop({ scrollContainerRef }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = scrollContainerRef?.current ?? window;
    const getScrollTop = () =>
      scrollContainerRef?.current
        ? scrollContainerRef.current.scrollTop
        : window.scrollY;

    const handleScroll = () => setVisible(getScrollTop() > 300);

    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  const scrollToTop = () => {
    const target = scrollContainerRef?.current ?? window;
    target.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      className={`md:hidden fixed bottom-24 right-4 z-50 w-11 h-11 rounded-full bg-bg-card border border-white/10 text-text-primary flex items-center justify-center shadow-lg transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      aria-label="Scroll to top"
    >
      ▲
    </button>
  );
}
