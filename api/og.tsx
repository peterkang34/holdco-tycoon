import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // Debug mode: return plain text to verify function works
  if (url.searchParams.has('debug')) {
    return new Response('OG function is working', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const isChallenge = url.searchParams.get('type') === 'challenge';

  const title = 'Holdco Tycoon';
  const subtitle = isChallenge ? 'Challenge Mode' : 'Build Your Empire';
  const description = isChallenge
    ? 'Same deals. Same events. Who builds the best holdco?'
    : 'A strategy game about holding company capital allocation.';
  const accentColor = isChallenge ? '#eab308' : '#6366f1';
  const subtitleColor = isChallenge ? '#eab308' : '#94a3b8';

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
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: 6,
            backgroundColor: accentColor,
            display: 'flex',
          }}
        />
        <div style={{ fontSize: 52, fontWeight: 700, color: '#f1f5f9', marginBottom: 12, display: 'flex' }}>
          {title}
        </div>
        <div style={{ fontSize: 32, color: subtitleColor, fontWeight: 600, marginBottom: 28, display: 'flex' }}>
          {subtitle}
        </div>
        <div style={{ fontSize: 24, color: '#64748b', textAlign: 'center', maxWidth: 640, display: 'flex' }}>
          {description}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
