import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // Debug: return plain text to verify function runs
  if (url.searchParams.get('mode') === 'text') {
    return new Response('OG function is alive – v2', {
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  }

  const isChallenge = url.searchParams.get('type') === 'challenge';
  const subtitle = isChallenge ? 'Challenge Mode' : 'Build Your Empire';
  const description = isChallenge
    ? 'Same deals. Same events. Who builds the best holdco?'
    : 'A strategy game about holding company capital allocation.';
  const accentColor = isChallenge ? '#eab308' : '#6366f1';
  const subtitleColor = isChallenge ? '#eab308' : '#94a3b8';

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
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                fontSize: 52,
                fontWeight: 700,
                color: '#f1f5f9',
                marginBottom: 12,
              },
              children: 'Holdco Tycoon',
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: 32,
                color: subtitleColor,
                fontWeight: 600,
                marginBottom: 28,
              },
              children: subtitle,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: 24,
                color: '#64748b',
                textAlign: 'center' as const,
                maxWidth: 640,
              },
              children: description,
            },
          },
        ],
      },
    } as any,
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    },
  );
}
