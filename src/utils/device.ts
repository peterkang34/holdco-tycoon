/**
 * Device detection, player identity, and game numbering utilities for telemetry.
 */

const PLAYER_TOKEN_KEY = 'holdco-challenge-player-token';
const GAME_NUMBER_KEY = 'holdco-game-number';

/** Classify device by viewport width + touch detection */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (width < 768 && hasTouch) return 'mobile';
  if (width < 1024 && hasTouch) return 'tablet';
  return 'desktop';
}

/**
 * Get persistent player ID. Reuses the same localStorage key as challenge mode
 * so challenge participants and regular players share a single identity.
 */
export function getPlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_TOKEN_KEY);
    if (existing) return existing;
    const token = crypto.randomUUID();
    localStorage.setItem(PLAYER_TOKEN_KEY, token);
    return token;
  } catch {
    // Fallback for environments without localStorage
    return crypto.randomUUID();
  }
}

/** Read and increment the game number counter. Returns the current game number (1-based). */
export function getGameNumber(): number {
  try {
    const raw = localStorage.getItem(GAME_NUMBER_KEY);
    const current = raw ? parseInt(raw, 10) : 0;
    const next = (Number.isFinite(current) ? current : 0) + 1;
    localStorage.setItem(GAME_NUMBER_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}
