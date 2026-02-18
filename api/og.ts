import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default function handler(req: Request) {
  const url = new URL(req.url);
  const isChallenge = url.searchParams.get('type') === 'challenge';

  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f1116',
          fontFamily: 'sans-serif',
        },
        children: [
          // Top accent line
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                background: isChallenge
                  ? 'linear-gradient(90deg, #eab308, #f59e0b, #eab308)'
                  : 'linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)',
              },
            },
          },
          // Emoji
          {
            type: 'div',
            props: {
              style: { fontSize: 72, marginBottom: 16 },
              children: isChallenge ? '🏆' : '🏛️',
            },
          },
          // Title
          {
            type: 'div',
            props: {
              style: {
                fontSize: 48,
                fontWeight: 700,
                color: '#f1f5f9',
                marginBottom: 12,
              },
              children: 'Holdco Tycoon',
            },
          },
          // Subtitle
          {
            type: 'div',
            props: {
              style: {
                fontSize: 28,
                color: isChallenge ? '#eab308' : '#94a3b8',
                fontWeight: 600,
                marginBottom: 24,
              },
              children: isChallenge
                ? 'Challenge Mode'
                : 'Build Your Empire',
            },
          },
          // Description
          {
            type: 'div',
            props: {
              style: {
                fontSize: 22,
                color: '#64748b',
                textAlign: 'center',
                maxWidth: 600,
                lineHeight: 1.4,
              },
              children: isChallenge
                ? 'Same deals. Same events. Who builds the best holdco?'
                : 'A strategy game about holding company capital allocation.',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
    },
  );
}
