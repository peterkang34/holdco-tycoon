/**
 * Shared helpers and constants for telemetry endpoints.
 */

export const VALID_EVENTS = [
  'game_start', 'game_complete', 'game_abandon', 'page_view',
  'challenge_create', 'challenge_share', 'scoreboard_view',
  'feature_used', 'event_choice',
] as const;
export const VALID_DIFFICULTIES = ['easy', 'normal'] as const;
export const VALID_DURATIONS = ['standard', 'quick'] as const;
export const VALID_SECTORS = [
  'agency', 'saas', 'homeServices', 'consumer', 'industrial', 'b2bServices',
  'healthcare', 'restaurant', 'realEstate', 'education', 'insurance',
  'autoServices', 'distribution', 'wealthManagement', 'environmental',
] as const;
export const VALID_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
export const VALID_DEVICES = ['mobile', 'tablet', 'desktop'] as const;
export const VALID_SHARE_METHODS = ['clipboard', 'native_share'] as const;

export const VALID_FEATURES = [
  'platform_forge', 'turnaround', 'equity_raise', 'distribution',
  'ma_sourcing', 'shared_service', 'sell_business', 'chronicle_view', 'manual_view',
  'rollover_equity', 'buyback',
] as const;

export const VALID_ARCHETYPES = [
  'roll_up_machine', 'platform_builder', 'value_investor', 'serial_acquirer',
  'turnaround_specialist', 'dividend_cow', 'conglomerate', 'focused_operator',
  'balanced', 'unknown',
] as const;

export const VALID_ANTIPATTERNS = [
  'over_leveraged', 'serial_restructurer', 'dilution_spiral', 'no_distributions',
  'turnaround_graveyard', 'spray_and_pray', 'analysis_paralysis', 'empire_builder',
] as const;

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
 * Returns YYYY-Www string for ISO week.
 */
export function getWeekKey(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Bucket session duration into human-readable ranges.
 */
export function getDurationBucket(ms: number): string {
  const mins = ms / 60000;
  if (mins < 5) return '<5m';
  if (mins < 15) return '5-15m';
  if (mins < 30) return '15-30m';
  if (mins < 60) return '30-60m';
  return '60m+';
}

/**
 * Bucket sophistication score into ranges.
 */
export function getSophisticationBucket(score: number): string {
  if (score < 20) return '0-19';
  if (score < 40) return '20-39';
  if (score < 60) return '40-59';
  if (score < 80) return '60-79';
  return '80-100';
}

/**
 * Bucket FEV into distribution ranges.
 * All values in thousands (game convention: 1000 = $1M).
 */
export function getFevBucket(fev: number): string {
  if (fev < 10000) return '0-10000';
  if (fev < 50000) return '10000-50000';
  if (fev < 100000) return '50000-100000';
  if (fev < 250000) return '100000-250000';
  if (fev < 500000) return '250000-500000';
  if (fev < 1000000) return '500000-1000000';
  if (fev < 2500000) return '1000000-2500000';
  return '2500000+';
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
  // Phase 1 enrichments
  playerId?: string;
  gameNumber?: number;
  isChallenge?: boolean;
  device?: string;
  sessionDurationMs?: number;
  referrer?: string;
  isScoreboard?: boolean;
  // Phase 2 snapshot fields
  score?: number;
  scoreBreakdown?: Record<string, number>;
  businessCount?: number;
  totalAcquisitions?: number;
  totalSells?: number;
  totalDistributions?: number;
  totalBuybacks?: number;
  equityRaisesUsed?: number;
  peakLeverage?: number;
  hasRestructured?: boolean;
  peakDistressLevel?: number;
  platformsForged?: number;
  turnaroundsStarted?: number;
  turnaroundsSucceeded?: number;
  turnaroundsFailed?: number;
  sharedServicesActive?: number;
  maSourcingTier?: number;
  sectorIds?: string[];
  dealStructureTypes?: Record<string, number>;
  rolloverEquityCount?: number;
  strategyArchetype?: string;
  antiPatterns?: string[];
  sophisticationScore?: number;
  // Phase 5 ending business profile
  endingSubTypes?: Record<string, number>;
  avgEndingEbitda?: number;
  endingConstruction?: Record<string, number>;
  // Phase 3 challenge fields
  challengeCode?: string;
  shareMethod?: string;
  // Phase 4 feature/event fields
  feature?: string;
  eventType?: string;
  choiceAction?: string;
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

  // Validate optional enrichment fields
  const playerId = optionalString(body.playerId, 64);
  const device = optionalEnum(body.device, VALID_DEVICES);
  const gameNumber = optionalPositiveInt(body.gameNumber, 10000);
  const isChallenge = optionalBoolean(body.isChallenge);
  const sessionDurationMs = optionalPositiveNumber(body.sessionDurationMs, 86400000);
  const referrer = optionalString(body.referrer, 200);
  const isScoreboard = optionalBoolean(body.isScoreboard);

  // Phase 2 snapshot fields (all optional)
  const score = optionalPositiveNumber(body.score, 100);
  const scoreBreakdown = optionalRecord(body.scoreBreakdown);
  const businessCount = optionalPositiveInt(body.businessCount, 50);
  const totalAcquisitions = optionalPositiveInt(body.totalAcquisitions, 200);
  const totalSells = optionalPositiveInt(body.totalSells, 200);
  const totalDistributions = optionalPositiveNumber(body.totalDistributions, 500000000);
  const totalBuybacks = optionalPositiveNumber(body.totalBuybacks, 500000000);
  const equityRaisesUsed = optionalPositiveInt(body.equityRaisesUsed, 50);
  const peakLeverage = optionalPositiveNumber(body.peakLeverage, 100);
  const hasRestructured = optionalBoolean(body.hasRestructured);
  const peakDistressLevel = optionalPositiveInt(body.peakDistressLevel, 5);
  const platformsForged = optionalPositiveInt(body.platformsForged, 50);
  const turnaroundsStarted = optionalPositiveInt(body.turnaroundsStarted, 50);
  const turnaroundsSucceeded = optionalPositiveInt(body.turnaroundsSucceeded, 50);
  const turnaroundsFailed = optionalPositiveInt(body.turnaroundsFailed, 50);
  const sharedServicesActive = optionalPositiveInt(body.sharedServicesActive, 20);
  const maSourcingTier = optionalPositiveInt(body.maSourcingTier, 3);
  const sectorIds = optionalStringArray(body.sectorIds, 15);
  const dealStructureTypes = optionalRecord(body.dealStructureTypes);
  const rolloverEquityCount = optionalPositiveInt(body.rolloverEquityCount, 50);
  const strategyArchetype = optionalEnum(body.strategyArchetype, VALID_ARCHETYPES);
  const antiPatterns = optionalStringArray(body.antiPatterns, 10);
  const sophisticationScore = optionalPositiveNumber(body.sophisticationScore, 100);

  // Phase 5 ending business profile
  const endingSubTypes = optionalRecord(body.endingSubTypes);
  const avgEndingEbitda = optionalPositiveNumber(body.avgEndingEbitda, 500000000);
  const endingConstruction = optionalRecord(body.endingConstruction);

  // Phase 3 challenge fields
  const challengeCode = optionalString(body.challengeCode, 30);
  const shareMethod = optionalEnum(body.shareMethod, VALID_SHARE_METHODS);

  // Phase 4 feature/event fields
  const feature = optionalEnum(body.feature, VALID_FEATURES);
  const eventType = optionalString(body.eventType, 50);
  const choiceAction = optionalString(body.choiceAction, 50);

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
    playerId, gameNumber, isChallenge, device, sessionDurationMs, referrer, isScoreboard,
    score, scoreBreakdown, businessCount, totalAcquisitions, totalSells,
    totalDistributions, totalBuybacks, equityRaisesUsed, peakLeverage,
    hasRestructured, peakDistressLevel, platformsForged,
    turnaroundsStarted, turnaroundsSucceeded, turnaroundsFailed,
    sharedServicesActive, maSourcingTier, sectorIds, dealStructureTypes,
    rolloverEquityCount, strategyArchetype, antiPatterns, sophisticationScore,
    endingSubTypes, avgEndingEbitda, endingConstruction,
    challengeCode, shareMethod, feature, eventType, choiceAction,
  };
}

// ── Validation helpers ──────────────────────────────────────────

function optionalString(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  return val.length > 0 && val.length <= maxLen ? val : undefined;
}

function optionalEnum(val: unknown, allowed: readonly string[]): string | undefined {
  if (typeof val !== 'string') return undefined;
  return (allowed as readonly string[]).includes(val) ? val : undefined;
}

function optionalBoolean(val: unknown): boolean | undefined {
  return typeof val === 'boolean' ? val : undefined;
}

function optionalPositiveInt(val: unknown, max: number): number | undefined {
  if (typeof val !== 'number') return undefined;
  if (!Number.isInteger(val) || val < 0 || val > max) return undefined;
  return val;
}

function optionalPositiveNumber(val: unknown, max: number): number | undefined {
  if (typeof val !== 'number') return undefined;
  if (!Number.isFinite(val) || val < 0 || val > max) return undefined;
  return val;
}

function optionalRecord(val: unknown): Record<string, number> | undefined {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return undefined;
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (typeof k === 'string' && typeof v === 'number') result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function optionalStringArray(val: unknown, maxLen: number): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const arr = val.filter((v): v is string => typeof v === 'string').slice(0, maxLen);
  return arr.length > 0 ? arr : undefined;
}
