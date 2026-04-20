export const LEADERBOARD_KEY = 'leaderboard:v2';
export const COMPLETIONS_KEY = 'game-completions:v1';
export const MAX_COMPLETIONS = 1000;
export const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  easy: 0.9,
  normal: 1.35,
};

// ── Scenario Challenge KV keys ────────────────────────────────────────────
//
// Per `plans/backlog/scenario-challenges.md` v3.1 Section 2.
// Config + leaderboard entries TTL at `endDate + 180d` (enforced when keys are
// written by admin CRUD in Phase 3B). After TTL, a scheduled job snapshots
// survivors to `scenarios_archive` (Postgres) for permanent history.

/** Config blob (JSON-stringified `ScenarioChallengeConfig`) keyed by scenario id. */
export function scenarioConfigKey(scenarioId: string): string {
  return `scenario:${scenarioId}:config`;
}

/** Per-scenario leaderboard sorted set (score = ranking metric value, member = entry JSON). */
export function scenarioLeaderboardKey(scenarioId: string): string {
  return `scenario:${scenarioId}:leaderboard`;
}

/** String (JSON array of ids) — featured scenarios shown on the home banner. */
export const SCENARIOS_ACTIVE_KEY = 'scenarios:active';

/** String (JSON array of ids) — ended scenarios available in the leaderboard archive tab. */
export const SCENARIOS_ARCHIVE_KEY = 'scenarios:archive';

/** Per-scenario leaderboard entry cap — matches global leaderboard. */
export const MAX_SCENARIO_ENTRIES = 500;

/** TTL extension past scenario endDate before KV entries expire (in seconds — 180 days). */
export const SCENARIO_KV_TTL_PAST_END_SECONDS = 180 * 24 * 60 * 60;

/**
 * Compute the TTL (in seconds from now) a scenario's KV keys should live for.
 * Returns `endDate + 180 days - now`. Clamps to minimum 60s so setting on a
 * just-ended scenario still writes a valid (short) TTL rather than 0/negative.
 */
export function computeScenarioKvTtl(endDateIso: string, now: Date = new Date()): number {
  const end = Date.parse(endDateIso);
  if (Number.isNaN(end)) return SCENARIO_KV_TTL_PAST_END_SECONDS; // fallback — treat as full TTL
  const expiryMs = end + SCENARIO_KV_TTL_PAST_END_SECONDS * 1000;
  const remainingSeconds = Math.floor((expiryMs - now.getTime()) / 1000);
  return Math.max(60, remainingSeconds);
}
