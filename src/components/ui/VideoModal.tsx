import { useEffect, useState } from 'react';
import { YouTubeEmbed } from './YouTubeEmbed';

const VIDEOS = [
  {
    id: '7CqH_R69qDQ',
    title: 'Quick Tutorial',
    duration: '6 min',
    description: 'Learn the basics fast',
  },
  {
    id: 'jc92OfYMc0U',
    title: 'Full Playthrough',
    duration: '45 min',
    description: 'Watch a complete game start to finish',
  },
];

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VideoModal({ isOpen, onClose }: VideoModalProps) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) setSelectedVideoId(null);
  }, [isOpen]);

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

      <div
        className="w-[90%] max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {selectedVideoId ? (
          <>
            <button
              onClick={() => setSelectedVideoId(null)}
              className="text-sm text-text-muted hover:text-text-primary transition-colors mb-3 flex items-center gap-1"
            >
              ← Back to videos
            </button>
            <YouTubeEmbed videoId={selectedVideoId} />
          </>
        ) : (
          <div className="flex flex-col gap-3 max-w-md mx-auto">
            <h3 className="text-lg font-bold text-text-primary text-center mb-1">Watch & Learn</h3>
            {VIDEOS.map((video) => (
              <button
                key={video.id}
                onClick={() => setSelectedVideoId(video.id)}
                className="bg-white/5 border border-white/10 hover:border-accent/40 hover:bg-accent/5 rounded-lg p-4 text-left transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl text-accent group-hover:scale-110 transition-transform">▶</span>
                  <div>
                    <p className="font-semibold text-text-primary">{video.title} <span className="text-text-muted font-normal text-sm">({video.duration})</span></p>
                    <p className="text-sm text-text-muted">{video.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
