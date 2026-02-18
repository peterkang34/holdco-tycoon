import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // Debug: return plain text to verify function runs
  if (url.searchParams.get('mode') === 'text') {
    return new Response('OG function is alive!', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Debug: return a 1x1 red pixel PNG to test binary response
  if (url.searchParams.get('mode') === 'pixel') {
    const pixel = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0,
      0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 0,
      3, 0, 1, 24, 216, 95, 168, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66,
      96, 130,
    ]);
    return new Response(pixel, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
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
          Holdco Tycoon
        </div>
        <div style={{ fontSize: 32, color: subtitleColor, fontWeight: 600, marginBottom: 28, display: 'flex' }}>
          {subtitle}
        </div>
        <div style={{ fontSize: 24, color: '#64748b', textAlign: 'center', maxWidth: 640, display: 'flex' }}>
          {description}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    },
  );
}
