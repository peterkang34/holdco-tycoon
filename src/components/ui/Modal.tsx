import { ReactNode, useEffect, useRef, useCallback } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Custom header content (replaces title/subtitle). Close button is always rendered. */
  header?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl',
} as const;

export function Modal({ isOpen, onClose, title, subtitle, header, children, size = 'md' }: ModalProps) {
  // Prevent background scroll when modal is open (mobile scroll-through fix)
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  // Drag-to-dismiss for mobile bottom sheet
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    // Only start drag if at top of scroll or touching the drag handle area
    if (sheet.scrollTop <= 0) {
      dragStartY.current = e.touches[0].clientY;
      dragCurrentY.current = 0;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // Only allow downward drag
    if (dy > 0) {
      dragCurrentY.current = dy;
      sheet.style.transform = `translateY(${dy}px)`;
      sheet.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragStartY.current === null) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragStartY.current = null;
    // Dismiss if dragged more than 100px down
    if (dragCurrentY.current > 100) {
      sheet.style.transform = 'translateY(100%)';
      sheet.style.transition = 'transform 0.2s ease-out';
      setTimeout(onClose, 200);
    } else {
      sheet.style.transform = '';
      sheet.style.transition = 'transform 0.2s ease-out';
    }
    dragCurrentY.current = 0;
  }, [onClose]);

  if (!isOpen) return null;

  const closeButton = (
    <button
      onClick={onClose}
      className="text-text-muted hover:text-text-primary transition-colors text-2xl min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95"
    >
      ×
    </button>
  );

  const headerContent = header ? (
    <div className="flex items-start justify-between mb-6">
      <div>{header}</div>
      {closeButton}
    </div>
  ) : (title || subtitle) ? (
    <div className="flex items-start justify-between mb-6">
      <div>
        {title && <h3 className="text-xl font-bold">{title}</h3>}
        {subtitle && <p className="text-text-muted text-sm">{subtitle}</p>}
      </div>
      {closeButton}
    </div>
  ) : (
    <div className="flex items-center justify-between mb-4">
      <div />
      {closeButton}
    </div>
  );

  return (
    <>
      {/* Mobile bottom sheet */}
      <div className="fixed inset-0 bg-black/80 z-50 md:hidden" onClick={onClose}>
        <div
          ref={sheetRef}
          className="fixed bottom-0 left-0 right-0 bg-bg-primary border-t border-white/10 rounded-t-2xl max-h-[90dvh] overflow-y-auto p-4 pb-[env(safe-area-inset-bottom,16px)] animate-slide-up z-50"
          onClick={e => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag handle — tap to dismiss */}
          <div className="flex justify-center mb-3" onClick={onClose}>
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          {/* Sticky header so close button is always reachable */}
          <div className="sticky top-0 z-10 bg-bg-primary pb-1">
            {headerContent}
          </div>
          {children}
        </div>
      </div>

      {/* Desktop centered dialog */}
      <div className="fixed inset-0 bg-black/80 hidden md:flex items-center justify-center p-4 z-50" onClick={onClose}>
        <div
          className={`bg-bg-primary border border-white/10 rounded-xl ${SIZE_CLASSES[size]} w-full max-h-[90vh] overflow-y-auto p-6`}
          onClick={e => e.stopPropagation()}
        >
          {headerContent}
          {children}
        </div>
      </div>
    </>
  );
}
