import { ReactNode } from 'react';

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
          className="fixed bottom-0 left-0 right-0 bg-bg-primary border-t border-white/10 rounded-t-2xl max-h-[90dvh] overflow-y-auto p-4 pb-[env(safe-area-inset-bottom,16px)] animate-slide-up z-50"
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          {headerContent}
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
