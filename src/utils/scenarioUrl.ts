/**
 * Scenario Challenge URL parser.
 *
 * Consolidates three URL shapes into one parser so IntroScreen, LeaderboardModal,
 * and App don't each invent their own scheme (plan Section 5.4 / M5):
 *
 *   ?se={id}              → intent: 'play'         (IntroScreen picks it up, opens se_setup)
 *   ?se={id}&preview=1    → intent: 'preview'      (admin-only; routed via #/se-preview)
 *   ?tab=scenarios        → intent: 'leaderboard'  (opens LeaderboardModal on Scenarios tab)
 *   ?tab=scenarios&scenario={id} → leaderboard intent with specific scenario focused
 *
 * Returns `null` when no scenario-relevant params present — callers can ignore
 * and proceed with their normal URL handling.
 */

export type ScenarioUrlIntent = 'play' | 'preview' | 'leaderboard';

export interface ScenarioUrlParams {
  intent: ScenarioUrlIntent;
  /** Scenario slug — present for `play` and `preview`; optional for `leaderboard`. */
  scenarioId: string | null;
}

// Lowercase-only slug, matches the admin CRUD + public submit regexes.
const SLUG_REGEX = /^[a-z0-9-]{1,60}$/;

function validateSlug(raw: string | null): string | null {
  if (!raw) return null;
  return SLUG_REGEX.test(raw) ? raw : null;
}

/**
 * Parse scenario-relevant URL params from a URLSearchParams-compatible source.
 * Accepts a string (typically `window.location.search`) or a URLSearchParams.
 *
 * Returns null when no scenario intent is present — don't treat as an error.
 */
export function parseScenarioUrl(source: string | URLSearchParams): ScenarioUrlParams | null {
  const params = typeof source === 'string' ? new URLSearchParams(source) : source;

  const seId = validateSlug(params.get('se'));
  const isPreview = params.get('preview') === '1';
  const tab = params.get('tab');

  // Play / preview intent — `?se={id}` with optional `preview=1`.
  if (seId) {
    return {
      intent: isPreview ? 'preview' : 'play',
      scenarioId: seId,
    };
  }

  // Leaderboard intent — `?tab=scenarios[&scenario={id}]`.
  if (tab === 'scenarios') {
    return {
      intent: 'leaderboard',
      scenarioId: validateSlug(params.get('scenario')),
    };
  }

  return null;
}

/**
 * Build a shareable URL for a scenario (play intent). Used by the admin when
 * generating a link to send to playtesters, and by the home banner when
 * producing deep-links to specific scenarios.
 *
 * `origin` defaults to the current window's origin — override for tests.
 */
export function buildScenarioPlayUrl(scenarioId: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/?se=${encodeURIComponent(scenarioId)}`;
}

/**
 * Build a URL that opens the Scenarios tab in LeaderboardModal, optionally
 * focused on a specific scenario's archive view.
 */
export function buildScenarioLeaderboardUrl(scenarioId: string | null, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const qs = scenarioId
    ? `?tab=scenarios&scenario=${encodeURIComponent(scenarioId)}`
    : '?tab=scenarios';
  return `${base}/${qs}`;
}

/**
 * Remove scenario-related params from the URL without triggering a reload.
 * Used after the scenario has been consumed (player clicked through or config
 * expired) so the URL bar reflects normal-game state.
 *
 * Strips play + leaderboard params together (se, preview, tab, scenario).
 * Callers should only invoke after BOTH intents are consumed — if the URL
 * carried `?tab=scenarios` and we clean on `?se=` resolve, we'd eat the
 * leaderboard intent before LeaderboardModal gets a chance to see it.
 * Unrelated params (utm_*, analytics, etc.) survive since we delete by name.
 */
export function cleanScenarioUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('se');
  url.searchParams.delete('preview');
  url.searchParams.delete('tab');
  url.searchParams.delete('scenario');
  window.history.replaceState({}, '', url.toString());
}
