import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const isChallenge = url.searchParams.get('type') === 'challenge';

  // Debug: return plain text to verify function runs
  if (url.searchParams.get('mode') === 'text') {
    return new Response('OG function is alive – v3', {
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  }

  const subtitle = isChallenge ? 'Challenge Mode' : 'Build Your Empire';
  const description = isChallenge
    ? 'Same deals. Same events. Who builds the best holdco?'
    : 'A strategy game about holding company capital allocation.';
  const subtitleColor = isChallenge ? '#eab308' : '#94a3b8';

  try {
    const imgResponse = new ImageResponse(
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
                style: { fontSize: 52, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 },
                children: 'Holdco Tycoon',
              },
            },
            {
              type: 'div',
              props: {
                style: { fontSize: 32, color: subtitleColor, fontWeight: 600, marginBottom: 28 },
                children: subtitle,
              },
            },
            {
              type: 'div',
              props: {
                style: { fontSize: 24, color: '#64748b' },
                children: description,
              },
            },
          ],
        },
      } as any,
      { width: 1200, height: 630 },
    );

    // Read the response body to check if it's actually rendered
    const body = await imgResponse.arrayBuffer();

    if (body.byteLength === 0) {
      return new Response(
        `ImageResponse produced 0 bytes. Headers: ${JSON.stringify(Object.fromEntries(imgResponse.headers.entries()))}`,
        { status: 500, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } },
      );
    }

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    return new Response(
      `OG image error: ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}`,
      { status: 500, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } },
    );
  }
}
