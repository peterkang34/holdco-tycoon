import { useToastStore, Toast } from '../../hooks/useToast';

const TYPE_STYLES: Record<Toast['type'], string> = {
  success: 'border-accent/60 bg-accent/10',
  info: 'border-blue-400/60 bg-blue-400/10',
  warning: 'border-warning/60 bg-warning/10',
  danger: 'border-red-500/60 bg-red-500/10',
};

const TYPE_ICONS: Record<Toast['type'], string> = {
  success: '✓',
  info: 'ℹ',
  warning: '⚠',
  danger: '🚨',
};

const ICON_COLORS: Record<Toast['type'], string> = {
  success: 'text-accent',
  info: 'text-blue-400',
  warning: 'text-warning',
  danger: 'text-red-400',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 sm:top-14 right-4 z-[60] flex flex-col gap-2 pointer-events-none max-w-[22rem] sm:max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto border rounded-lg px-3 py-2.5 shadow-lg backdrop-blur-sm animate-slide-in-right ${TYPE_STYLES[toast.type]}`}
        >
          <div className="flex items-start gap-2">
            <span className={`text-sm mt-0.5 ${ICON_COLORS[toast.type]}`}>{TYPE_ICONS[toast.type]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">{toast.message}</p>
              {toast.detail && (
                <p className="text-xs text-text-muted mt-0.5">{toast.detail}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-text-muted hover:text-text-primary text-xs ml-1 mt-0.5"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
