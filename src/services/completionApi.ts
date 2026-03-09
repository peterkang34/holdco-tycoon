/**
 * Fire-and-forget game completion submission for admin analytics.
 * Independent of leaderboard — captures ALL completed games.
 */

function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export function submitGameCompletion(data: Record<string, unknown>): void {
  try {
    fetch('/api/completions/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, device: getDeviceType() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Fire-and-forget — never block the game
  }
}
