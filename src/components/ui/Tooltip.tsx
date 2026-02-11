import { ReactNode, useState, useRef, useEffect } from 'react';

interface TooltipProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

export function Tooltip({ trigger, children, align = 'left', width = 'w-48 sm:w-64' }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <span
      ref={ref}
      className="relative group/tip inline-flex"
      onClick={(e) => { e.stopPropagation(); setIsOpen((v) => !v); }}
    >
      <span className="cursor-help">{trigger}</span>
      <span
        className={`absolute top-full ${align === 'left' ? 'left-0' : 'right-0'} mt-2 ${width} p-3 bg-bg-primary border border-white/10 rounded-lg shadow-xl text-xs text-text-secondary z-50 transition-all ${
          isOpen
            ? 'opacity-100 visible'
            : 'opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible'
        }`}
      >
        {children}
      </span>
    </span>
  );
}
