/**
 * Feature flags — evaluated at build time via Vite env vars. See plan Section 12.
 *
 * `VITE_SCENARIO_CHALLENGES_ENABLED`:
 *   - `'true'`          → feature fully live (banner, scenarios tab, public deep links)
 *   - `'false'`         → player-facing surfaces hidden; equivalent to admin-only in practice
 *   - Unset OR `'admin-only'` → SAFE DEFAULT. Admin surfaces + admin preview
 *                         (`?se={id}&preview=1`) still work, but banner + scenarios tab
 *                         hidden from regular players, and public `?se=`/`?tab=scenarios`
 *                         deep links are ignored.
 *
 * Admin surfaces (ScenarioChallengesTab, `/api/admin/scenario-challenges/*`) NEVER
 * gate on this flag — admins always need to author, regardless of rollout phase.
 * Admin preview path (`?se={id}&preview=1`) also stays functional in all modes so
 * authors can test without flipping a flag.
 *
 * Flip to 'true' (Vercel env var) when ready for general availability (plan §12 rollout).
 */

type ScenarioChallengesFlag = 'true' | 'false' | 'admin-only';

function readFlag(): ScenarioChallengesFlag {
  const raw = (import.meta.env.VITE_SCENARIO_CHALLENGES_ENABLED ?? 'admin-only') as string;
  if (raw === 'true') return 'true';
  if (raw === 'false') return 'false';
  return 'admin-only';
}

/** True when the home-screen banner + LeaderboardModal scenarios tab should render. */
export function isScenarioChallengesPlayerFacingEnabled(): boolean {
  return readFlag() === 'true';
}

/** True when non-preview `?se={id}` deep links should resolve. Admin preview always works. */
export function isScenarioChallengesPublicEntryEnabled(): boolean {
  return readFlag() === 'true';
}
