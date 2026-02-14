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

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className={`bg-bg-primary border border-white/10 rounded-xl ${SIZE_CLASSES[size]} w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6`}
        onClick={e => e.stopPropagation()}
      >
        {header ? (
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
        )}
        {children}
      </div>
    </div>
  );
}
