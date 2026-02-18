import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default function handler(req: Request) {
  const url = new URL(req.url);
  const isChallenge = url.searchParams.get('type') === 'challenge';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f1116',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: isChallenge
              ? 'linear-gradient(90deg, #eab308, #f59e0b, #eab308)'
              : 'linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)',
          }}
        />

        {/* Emoji */}
        <div style={{ fontSize: 80, marginBottom: 20 }}>
          {isChallenge ? '🏆' : '🏛️'}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: '#f1f5f9',
            marginBottom: 12,
          }}
        >
          Holdco Tycoon
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            color: isChallenge ? '#eab308' : '#94a3b8',
            fontWeight: 600,
            marginBottom: 28,
          }}
        >
          {isChallenge ? 'Challenge Mode' : 'Build Your Empire'}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 24,
            color: '#64748b',
            textAlign: 'center',
            maxWidth: 640,
            lineHeight: 1.5,
          }}
        >
          {isChallenge
            ? 'Same deals. Same events. Who builds the best holdco?'
            : 'A strategy game about holding company capital allocation.'}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
