interface YouTubeEmbedProps {
  videoId: string;
  className?: string;
}

export function YouTubeEmbed({ videoId, className = '' }: YouTubeEmbedProps) {
  // Simple iframe embed — works reliably on all browsers including Safari mobile.
  // Note: YouTube doesn't support setting playback speed via URL params,
  // but a working video beats a broken 1.5x player.
  const src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`;

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: '16/9' }}>
      <iframe
        src={src}
        className="absolute inset-0 w-full h-full rounded-lg"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Holdco Tycoon Playthrough"
      />
    </div>
  );
}
