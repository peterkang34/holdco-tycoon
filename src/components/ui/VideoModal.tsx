import { useEffect } from 'react';
import { YouTubeEmbed } from './YouTubeEmbed';

const VIDEO_ID = '7CqH_R69qDQ';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VideoModal({ isOpen, onClose }: VideoModalProps) {
  // Prevent background scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors text-3xl min-h-[44px] min-w-[44px] flex items-center justify-center z-50"
        title="Close"
      >
        &times;
      </button>

      {/* Video container */}
      <div
        className="w-[90%] max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <YouTubeEmbed videoId={VIDEO_ID} />
      </div>
    </div>
  );
}
