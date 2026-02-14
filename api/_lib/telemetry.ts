/**
 * Shared helpers and constants for telemetry endpoints.
 */

export const VALID_EVENTS = ['game_start', 'game_complete', 'game_abandon'] as const;
export const VALID_DIFFICULTIES = ['easy', 'normal'] as const;
export const VALID_DURATIONS = ['standard', 'quick'] as const;
export const VALID_SECTORS = [
  'agency', 'saas', 'homeServices', 'consumer', 'industrial', 'b2bServices',
  'healthcare', 'restaurant', 'realEstate', 'education', 'insurance',
  'autoServices', 'distribution', 'wealthManagement', 'environmental',
] as const;
export const VALID_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;

/**
 * Returns YYYY-MM string for the current month.
 */
export function getMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Bucket FEV into distribution ranges.
 * All values in thousands (game convention: 1000 = $1M).
 */
export function getFevBucket(fev: number): string {
  if (fev < 5000) return '0-5000';
  if (fev < 10000) return '5000-10000';
  if (fev < 20000) return '10000-20000';
  if (fev < 50000) return '20000-50000';
  if (fev < 100000) return '50000-100000';
  return '100000+';
}

interface ValidatedPayload {
  valid: boolean;
  event?: string;
  difficulty?: string;
  duration?: string;
  sector?: string;
  round?: number;
  maxRounds?: number;
  grade?: string;
  fev?: number;
  sessionId?: string;
}

/**
 * Validates a telemetry event payload.
 * Returns { valid: true, ...fields } on success, { valid: false } on failure.
 */
export function validateTelemetryPayload(body: any): ValidatedPayload {
  if (!body || typeof body !== 'object') {
    return { valid: false };
  }

  const { event, difficulty, duration, sector, round, maxRounds, grade, fev, sessionId } = body;

  // Event type is always required
  if (typeof event !== 'string' || !(VALID_EVENTS as readonly string[]).includes(event)) {
    return { valid: false };
  }

  // Difficulty and duration: required for game_start and game_complete
  if (event === 'game_start' || event === 'game_complete') {
    if (typeof difficulty !== 'string' || !(VALID_DIFFICULTIES as readonly string[]).includes(difficulty)) {
      return { valid: false };
    }
    if (typeof duration !== 'string' || !(VALID_DURATIONS as readonly string[]).includes(duration)) {
      return { valid: false };
    }
  }

  // Sector: required for game_start
  if (event === 'game_start') {
    if (typeof sector !== 'string' || !(VALID_SECTORS as readonly string[]).includes(sector)) {
      return { valid: false };
    }
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 64) {
      return { valid: false };
    }
  }

  // Round: required for game_complete and game_abandon
  if (event === 'game_complete' || event === 'game_abandon') {
    if (typeof round !== 'number' || !Number.isInteger(round) || round < 1 || round > 20) {
      return { valid: false };
    }
  }

  // Grade and FEV: required for game_complete
  if (event === 'game_complete') {
    if (typeof grade !== 'string' || !(VALID_GRADES as readonly string[]).includes(grade)) {
      return { valid: false };
    }
    if (typeof fev !== 'number' || fev < 0 || fev > 500000000) {
      return { valid: false };
    }
  }

  return {
    valid: true,
    event,
    difficulty: typeof difficulty === 'string' ? difficulty : undefined,
    duration: typeof duration === 'string' ? duration : undefined,
    sector: typeof sector === 'string' ? sector : undefined,
    round: typeof round === 'number' ? round : undefined,
    maxRounds: typeof maxRounds === 'number' ? maxRounds : undefined,
    grade: typeof grade === 'string' ? grade : undefined,
    fev: typeof fev === 'number' ? fev : undefined,
    sessionId: typeof sessionId === 'string' ? sessionId : undefined,
  };
}
