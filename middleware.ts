/**
 * Vercel Edge Middleware — modifies OG meta tags for challenge URLs.
 *
 * When a request comes in with ?c= (challenge link), we fetch the
 * static index.html (without the query param, so middleware passes through)
 * and replace the OG tags with challenge-specific values.
 *
 * This makes iMessage, Slack, Twitter, etc. show a rich "Challenge Mode" preview.
 */

export const config = { matcher: '/' };

export default async function middleware(request: Request) {
  const url = new URL(request.url);

  // Only modify challenge URLs (those with ?c= param)
  if (!url.searchParams.has('c')) return;

  // Fetch the original static HTML from origin (without ?c= to avoid re-triggering)
  const originUrl = new URL('/', url.origin);
  let response: Response;
  try {
    response = await fetch(originUrl.toString());
  } catch {
    return; // On any error, fall through to default static serving
  }

  if (!response.ok) return;

  let html = await response.text();

  // Replace default OG tags with challenge-specific ones
  html = html
    .replace(
      '<meta property="og:title" content="Holdco Tycoon - Build Your Empire" />',
      '<meta property="og:title" content="Challenge me in Holdco Tycoon!" />',
    )
    .replace(
      '<meta property="og:description" content="A strategy game that teaches holding company capital allocation through turn-based gameplay." />',
      '<meta property="og:description" content="Same deals. Same events. Who builds the best holdco?" />',
    )
    .replace(
      '<meta property="og:url" content="https://game.holdcoguide.com" />',
      `<meta property="og:url" content="${url.toString()}" />`,
    )
    .replace(
      '<meta property="og:image" content="https://game.holdcoguide.com/api/og" />',
      '<meta property="og:image" content="https://game.holdcoguide.com/api/og?type=challenge" />',
    )
    .replace(
      '<title>Holdco Tycoon - Build Your Empire</title>',
      '<title>Challenge me in Holdco Tycoon!</title>',
    );

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
