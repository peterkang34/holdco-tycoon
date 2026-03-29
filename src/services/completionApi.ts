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

/**
 * Auto-save game to game_history for authenticated players.
 * Fire-and-forget with keepalive (survives tab close + Play Again navigation).
 * Dedup handled server-side via completion_id UNIQUE index.
 *
 * Step 1: Core game data (keepalive, <64KB)
 * Step 2: Playbook attachment (normal fetch, best-effort)
 */
export async function saveGameHistory(data: Record<string, unknown>, playbook?: Record<string, unknown>): Promise<void> {
  try {
    // Lazy import to avoid circular dependency
    const { getAccessToken } = await import('../lib/supabase');
    const token = await getAccessToken();
    if (!token) return; // Not authenticated — silent no-op

    // Step 1: Core game data (keepalive — survives navigation)
    const corePayload: Record<string, unknown> = { ...data, device: getDeviceType() };
    // Remove playbook from keepalive payload (too large for 64KB keepalive limit)
    delete corePayload.playbook;
    delete corePayload.playbookShareId;

    fetch('/api/game-history/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(corePayload),
      keepalive: true,
    }).catch(() => {});

    // Step 2: Attach playbook if available (normal fetch, best-effort)
    if (playbook && data.seed != null) {
      setTimeout(() => {
        getAccessToken().then(t => {
          if (!t) return;
          fetch('/api/game-history/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify({ ...data, playbook, device: getDeviceType() }),
          }).catch(() => {});
        }).catch(() => {});
      }, 500); // Small delay to let step 1 complete first
    }
  } catch {
    // Fire-and-forget — never block the game
  }
}
