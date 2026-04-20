/**
 * Fund Structure — reader helpers that bridge legacy `PE_FUND_CONFIG` constants
 * and the new per-state `state.fundStructure` field.
 *
 * Why this exists:
 *   - Phase 1.5 of Scenario Challenges parameterizes PE economics so scenarios
 *     can override committed capital, fees, hurdle, carry, and forced-exit terms
 *   - Engine runtime code previously read constants like `PE_FUND_CONFIG.carryRate`
 *     directly; those call sites now go through these helpers
 *   - Helpers fall back to `PE_FUND_CONFIG` defaults so pre-Step-1.5 saves and
 *     code paths not yet refactored continue to produce identical behavior
 *
 * Contract:
 *   - If `state.fundStructure` is populated (post-migration or new PE game),
 *     helpers return that structure's values
 *   - Otherwise helpers return the legacy `PE_FUND_CONFIG` values
 *   - For non-PE games (`isFundManagerMode === false`), these helpers are not
 *     called — callers gate on `state.isFundManagerMode` first
 *
 * Test coverage: `src/engine/__tests__/fund-structure.test.ts` (added in Step 1.5)
 * plus the PE Fund Manager regression test that pins behavioral equivalence.
 */

import type { FundStructure, GameState } from '../engine/types';
import { PE_FUND_CONFIG } from './gameConfig';
import { FUND_STRUCTURE_PRESETS } from './scenarioChallenges';

/** Minimal state slice these helpers actually read — exported for test reuse. */
export type FundState = Pick<GameState, 'fundStructure' | 'fundSize' | 'maxRounds'>;

/**
 * Returns the fund's committed capital (in $K). Prefers `fundStructure.committedCapital`,
 * falls back to the legacy `state.fundSize` field, then to `PE_FUND_CONFIG.fundSize`.
 */
export function getCommittedCapital(state: FundState): number {
  return state.fundStructure?.committedCapital ?? state.fundSize ?? PE_FUND_CONFIG.fundSize;
}

/** Returns the annual management fee as a decimal (e.g., 0.02 for 2%). */
export function getMgmtFeePercent(state: FundState): number {
  return state.fundStructure?.mgmtFeePercent ?? PE_FUND_CONFIG.managementFeeRate;
}

/**
 * Returns the absolute annual management fee in $K — computed as
 * `committedCapital * mgmtFeePercent`.
 *
 * For the default traditional_pe structure this evaluates to 100_000 * 0.02 = 2_000,
 * matching the legacy `PE_FUND_CONFIG.annualManagementFee` precomputed value.
 */
export function getAnnualMgmtFee(state: FundState): number {
  return getCommittedCapital(state) * getMgmtFeePercent(state);
}

/** Returns the hurdle rate (preferred return to LPs) as a decimal. */
export function getHurdleRate(state: FundState): number {
  return state.fundStructure?.hurdleRate ?? PE_FUND_CONFIG.hurdleRate;
}

/**
 * Returns the hurdle return amount in $K — `committedCapital * (1 + hurdleRate) ^ years`.
 *
 * `years` defaults to `state.maxRounds`, which matches the legacy precomputed
 * `PE_FUND_CONFIG.hurdleReturn = 100_000 * 1.08^10 = 215_892` for the default
 * 10-year Fund Manager mode.
 */
export function getHurdleReturn(state: FundState, years?: number): number {
  const capital = getCommittedCapital(state);
  const rate = getHurdleRate(state);
  const yr = years ?? state.maxRounds ?? 10;
  return Math.round(capital * Math.pow(1 + rate, yr));
}

/** Returns the GP carry rate above the hurdle as a decimal. */
export function getCarryRate(state: FundState): number {
  return state.fundStructure?.carryRate ?? PE_FUND_CONFIG.carryRate;
}

/**
 * Returns the forced-liquidation sale-price multiplier (e.g., 0.90 = 10% haircut).
 * Lower values = harsher forced exit; 1.00 = no haircut.
 */
export function getForcedLiquidationDiscount(state: FundState): number {
  return state.fundStructure?.forcedLiquidationDiscount ?? PE_FUND_CONFIG.forcedLiquidationDiscount;
}

/**
 * Returns the round at which forced liquidation triggers. Defaults to `state.maxRounds`
 * when the fund structure doesn't specify an earlier year. A scenario can set
 * `forcedLiquidationYear: 7` on a 10-round game to force exits at Y7.
 */
export function getForcedLiquidationYear(state: FundState): number {
  return state.fundStructure?.forcedLiquidationYear ?? state.maxRounds ?? 10;
}

/**
 * Returns the default fund structure (traditional_pe preset cloned).
 * Used by `startFundManagerMode` and the v44 migration as the backfill source.
 *
 * Returned object is a fresh copy — callers may mutate safely.
 */
export function getDefaultFundStructure(): FundStructure {
  return { ...FUND_STRUCTURE_PRESETS.traditional_pe };
}
