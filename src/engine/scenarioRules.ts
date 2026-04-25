/**
 * Scenario Rule Engine — projection layer over scenario config + game state.
 *
 * Single source of truth for "what restrictions/unlocks apply right now?" The
 * UI + engine call these resolvers instead of reading scenarioChallengeConfig
 * directly, so all dynamic restriction layers (round-based maps, metric-fired
 * triggers) compose in one place.
 *
 * Pure functions — no RNG, no side effects. Determinism matters here:
 * scenario challenges share a fixed seed across all players for leaderboard
 * fairness, so the resolved restriction set must be identical for any two
 * players whose state is identical.
 *
 * Layer precedence (highest wins):
 *   1. setAllowedSectors trigger action (most recent fired)         — hard pivot
 *   2. allowedSectorsByRound[lastKey ≤ currentRound]                — round-based
 *   3. static allowedSectors                                        — baseline
 *   4. (no restriction — all sectors)                               — default
 *   + accumulated addAllowedSectors trigger actions                 — additive
 *
 * Plan ref: comprehensive Phase 4 plan §3.
 */

import type {
  GameState,
  SectorId,
  DisabledFeatures,
  DisabledFeatureKey,
  ScenarioTrigger,
  TriggerCondition,
  TriggerAction,
  Metrics,
} from './types';

type NumericMetric =
  | 'round' | 'cash' | 'portfolioEbitda' | 'activeBusinessCount'
  | 'totalDistributions' | 'netDebtToEbitda' | 'totalRevenue'
  | 'avgEbitdaMargin' | 'exitedBusinessCount' | 'totalExitProceeds';

type ScenarioState =
  & Pick<GameState, 'isScenarioChallengeMode' | 'scenarioChallengeConfig'>
  & Partial<Pick<GameState, 'round' | 'triggeredTriggerIds'>>;

/** Effective round for resolution. Defaults to 1 when state.round is unset
 * (e.g., callers passing partial state in tests / pre-game contexts). */
function effectiveRound(state: ScenarioState): number {
  return typeof state.round === 'number' ? state.round : 1;
}

// ── Round-based sector resolution (Feature A) ─────────────────────────────

/**
 * Resolve the effective allowed-sectors list for the current round.
 *
 * Returns null when no restrictions apply (all sectors allowed). Returns an
 * array when restricted — empty array would mean "no sectors allowed" but the
 * validator rejects that, so consumers can treat array.length===0 as a bug.
 */
export function resolveAllowedSectors(state: ScenarioState): SectorId[] | null {
  if (!state.isScenarioChallengeMode || !state.scenarioChallengeConfig) return null;
  const cfg = state.scenarioChallengeConfig;

  // Layer 1 + 2: round-based map with sparse-key inheritance.
  const baseSectors =
    resolveByRoundMap(cfg.allowedSectorsByRound, effectiveRound(state))
    ?? cfg.allowedSectors
    ?? null;

  // Trigger overlay (commit 3 — feature B):
  //   - setAllowedSectors fires last → wins over base
  //   - addAllowedSectors fires accumulate → unioned on top
  const triggers = collectFiredTriggerActions(state);
  const setAction = triggers.find(a => a.type === 'setAllowedSectors');
  const adds = triggers.flatMap(a => a.type === 'addAllowedSectors' ? a.sectors : []);

  if (setAction && setAction.type === 'setAllowedSectors') {
    return uniq([...setAction.sectors, ...adds]);
  }
  if (baseSectors) {
    return uniq([...baseSectors, ...adds]);
  }
  // No base restriction. If triggers added sectors, the player previously had
  // unrestricted access — adding more is a no-op. Stay null (unrestricted).
  return adds.length > 0 ? null : null;
}

export function resolveAllowedSubTypes(state: ScenarioState): string[] | null {
  if (!state.isScenarioChallengeMode || !state.scenarioChallengeConfig) return null;
  const cfg = state.scenarioChallengeConfig;
  const baseSubTypes =
    resolveByRoundMap(cfg.allowedSubTypesByRound, effectiveRound(state))
    ?? cfg.allowedSubTypes
    ?? null;
  const triggers = collectFiredTriggerActions(state);
  const adds = triggers.flatMap(a => a.type === 'addAllowedSubTypes' ? a.subTypes : []);
  if (baseSubTypes) return uniq([...baseSubTypes, ...adds]);
  return null;
}

/**
 * Resolve effective disabled features. Triggers can ENABLE (clear) a disabled
 * feature flag — never disable. Add-only by design (Plan §11 Q3 / Q5).
 */
export function resolveDisabledFeatures(state: ScenarioState): DisabledFeatures | undefined {
  if (!state.isScenarioChallengeMode || !state.scenarioChallengeConfig) return undefined;
  const base = state.scenarioChallengeConfig.disabledFeatures;
  if (!base) return undefined;
  const triggers = collectFiredTriggerActions(state);
  const enabled = triggers
    .filter((a): a is { type: 'enableFeature'; feature: DisabledFeatureKey } => a.type === 'enableFeature')
    .map(a => a.feature);
  if (enabled.length === 0) return base;
  const result: DisabledFeatures = { ...base };
  for (const feat of enabled) {
    result[feat] = false;
  }
  return result;
}

// ── Trigger evaluation (Feature B) ────────────────────────────────────────

/**
 * Pure trigger evaluator. Given current state + metrics, returns which triggers
 * should fire NOW (i.e., haven't fired yet AND their condition evaluates true).
 *
 * Caller is responsible for committing the result to state (push id to
 * triggeredTriggerIds, record fire round in triggerFireRounds, surface
 * narrative toast). See useGame.ts:advanceToAllocate.
 */
export function evaluateTriggers(
  state: ScenarioState,
  metrics: Pick<Metrics, 'totalEbitda' | 'totalRevenue' | 'avgEbitdaMargin' | 'netDebtToEbitda'> & { exitedBusinessCount?: number; totalExitProceeds?: number },
  fullState: Pick<GameState, 'cash' | 'businesses' | 'exitedBusinesses' | 'totalDistributions' | 'round'>,
): ScenarioTrigger[] {
  if (!state.isScenarioChallengeMode || !state.scenarioChallengeConfig) return [];
  const cfg = state.scenarioChallengeConfig;
  if (!cfg.triggers || cfg.triggers.length === 0) return [];

  const fired = new Set(state.triggeredTriggerIds ?? []);
  const result: ScenarioTrigger[] = [];

  for (const trigger of cfg.triggers) {
    if (fired.has(trigger.id)) continue; // sticky — already fired
    if (trigger.minRound !== undefined && fullState.round < trigger.minRound) continue;
    if (evaluateCondition(trigger.when, metrics, fullState)) {
      result.push(trigger);
    }
  }
  return result;
}

function evaluateCondition(
  cond: TriggerCondition,
  metrics: Pick<Metrics, 'totalEbitda' | 'totalRevenue' | 'avgEbitdaMargin' | 'netDebtToEbitda'> & { exitedBusinessCount?: number; totalExitProceeds?: number },
  fullState: Pick<GameState, 'cash' | 'businesses' | 'exitedBusinesses' | 'totalDistributions' | 'round'>,
): boolean {
  if ('all' in cond) return cond.all.every(c => evaluateCondition(c, metrics, fullState));
  if ('any' in cond) return cond.any.some(c => evaluateCondition(c, metrics, fullState));

  // hasBusinessInSector — boolean check, not numeric op.
  if (cond.metric === 'hasBusinessInSector') {
    return fullState.businesses.some(b => b.status === 'active' && b.sectorId === cond.sectorId);
  }

  // hasBusinessWithQuality — special-case numeric comparison only checks max quality
  // in the active portfolio; "has any business with quality >= N".
  if (cond.metric === 'hasBusinessWithQuality') {
    const max = fullState.businesses
      .filter(b => b.status === 'active')
      .reduce((m, b) => Math.max(m, b.qualityRating), 0);
    return compare(max, cond.op, cond.value);
  }

  const lhs = readMetric(cond.metric as NumericMetric, metrics, fullState);
  return compare(lhs, cond.op, cond.value);
}

function readMetric(
  metric: NumericMetric,
  metrics: Pick<Metrics, 'totalEbitda' | 'totalRevenue' | 'avgEbitdaMargin' | 'netDebtToEbitda'> & { exitedBusinessCount?: number; totalExitProceeds?: number },
  fullState: Pick<GameState, 'cash' | 'businesses' | 'exitedBusinesses' | 'totalDistributions' | 'round'>,
): number {
  switch (metric) {
    case 'round':                  return fullState.round;
    case 'cash':                   return fullState.cash;
    case 'portfolioEbitda':        return metrics.totalEbitda ?? 0;
    case 'activeBusinessCount':    return fullState.businesses.filter(b => b.status === 'active').length;
    case 'totalDistributions':     return fullState.totalDistributions ?? 0;
    case 'netDebtToEbitda':        return metrics.netDebtToEbitda ?? 0;
    case 'totalRevenue':           return metrics.totalRevenue ?? 0;
    case 'avgEbitdaMargin':        return metrics.avgEbitdaMargin ?? 0;
    case 'exitedBusinessCount':    return fullState.exitedBusinesses?.length ?? 0;
    case 'totalExitProceeds':      return fullState.exitedBusinesses?.reduce((s, b) => s + (b.exitPrice ?? 0), 0) ?? 0;
    default:                        return 0;
  }
}

function compare(lhs: number, op: '>' | '>=' | '<' | '<=' | '==', rhs: number): boolean {
  switch (op) {
    case '>':  return lhs > rhs;
    case '>=': return lhs >= rhs;
    case '<':  return lhs < rhs;
    case '<=': return lhs <= rhs;
    case '==': return lhs === rhs;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Look up the most recent round-map entry whose key ≤ currentRound. Returns
 * the array as-is (no copy). Null when no key qualifies (round is before any
 * entry) — caller falls back to static `allowedSectors`.
 */
function resolveByRoundMap<T>(
  map: Record<number, T[]> | undefined,
  currentRound: number,
): T[] | null {
  if (!map) return null;
  let bestKey = -Infinity;
  for (const k of Object.keys(map)) {
    const round = Number(k);
    if (Number.isFinite(round) && round <= currentRound && round > bestKey) {
      bestKey = round;
    }
  }
  return bestKey === -Infinity ? null : map[bestKey];
}

/** Collect all action effects from currently-fired triggers, in fire order. */
function collectFiredTriggerActions(state: ScenarioState): TriggerAction[] {
  const cfg = state.scenarioChallengeConfig;
  const fired = new Set(state.triggeredTriggerIds ?? []);
  if (!cfg?.triggers || fired.size === 0) return [];
  const actions: TriggerAction[] = [];
  // Iterate in scenario-config trigger order (deterministic).
  for (const trigger of cfg.triggers) {
    if (fired.has(trigger.id)) actions.push(...trigger.actions);
  }
  return actions;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
