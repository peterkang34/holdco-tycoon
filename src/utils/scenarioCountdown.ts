/**
 * Shared countdown / end-date formatting for Scenario Challenge surfaces
 * (the home banner and the Scenarios landing page cards). Kept in one place so
 * the live-countdown and ended-state copy never drift between surfaces.
 */

/** Human-readable countdown to `endDate` (e.g. "5d left", "3h left", "Ended"). */
export function formatCountdown(endDate: string): string {
  const endMs = Date.parse(endDate);
  if (!Number.isFinite(endMs)) return '';
  const diffMs = endMs - Date.now();
  if (diffMs <= 0) return 'Ended';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days >= 2) return `${days}d left`;
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 2) return `${hours}h left`;
  const mins = Math.floor(diffMs / (60 * 1000));
  return `${mins}m left`;
}

/** Absolute end-date label for expired/archived scenarios (e.g. "Ended Jun 3, 2026"). */
export function formatEndedDate(endDate: string): string {
  const endMs = Date.parse(endDate);
  if (!Number.isFinite(endMs)) return 'Ended';
  return `Ended ${new Date(endMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** True when the scenario's submission window has closed. */
export function isScenarioEnded(endDate: string): boolean {
  const endMs = Date.parse(endDate);
  return Number.isFinite(endMs) && Date.now() > endMs;
}
