import { useEffect, useRef } from 'react';

interface YouTubeEmbedProps {
  videoId: string;
  className?: string;
}

// Extend Window to include YouTube IFrame API types
declare global {
  interface Window {
    YT: {
      Player: new (
        element: HTMLElement | string,
        config: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
          };
        },
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface YTPlayer {
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
}

let apiLoaded = false;
let apiReady = false;
const readyCallbacks: (() => void)[] = [];

function ensureYTApi(): Promise<void> {
  if (apiReady) return Promise.resolve();
  return new Promise<void>((resolve) => {
    readyCallbacks.push(resolve);
    if (!apiLoaded) {
      apiLoaded = true;
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => {
        apiReady = true;
        readyCallbacks.forEach((cb) => cb());
        readyCallbacks.length = 0;
      };
    }
  });
}

let idCounter = 0;

export function YouTubeEmbed({ videoId, className = '' }: YouTubeEmbedProps) {
  const playerRef = useRef<YTPlayer | null>(null);
  const idRef = useRef(`yt-player-${++idCounter}`);

  useEffect(() => {
    let cancelled = false;

    ensureYTApi().then(() => {
      if (cancelled) return;
      const el = document.getElementById(idRef.current);
      if (!el) return;
      playerRef.current = new window.YT.Player(idRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          enablejsapi: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            event.target.setPlaybackRate(1.5);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Player may already be destroyed
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: '16/9' }}>
      <div id={idRef.current} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
