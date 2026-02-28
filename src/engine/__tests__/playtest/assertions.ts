/**
 * Invariant validators for playtest system
 *
 * Three-tier assertion system:
 * Tier 1 — Invariants (must always pass)
 * Tier 2 — Feature-exercised (pass if strategy works)
 * Tier 3 — Range-based (wide tolerance)
 */

import { expect } from 'vitest';
import type { GameState, Business, ScoreBreakdown } from '../../types';
import { calculateMetrics } from '../../simulation';

// ── Tier 1: Invariants ──

function assertNoNaN(value: number, label: string, context: string): void {
  expect(Number.isNaN(value), `${label} is NaN at ${context}`).toBe(false);
}

function assertFinite(value: number, label: string, context: string): void {
  expect(Number.isFinite(value), `${label} is not finite at ${context}`).toBe(true);
}

function assertNumericField(value: number, label: string, context: string): void {
  assertNoNaN(value, label, context);
  assertFinite(value, label, context);
}

function validateBusiness(b: Business, context: string): void {
  const ctx = `biz ${b.id} at ${context}`;
  assertNumericField(b.ebitda, 'ebitda', ctx);
  assertNumericField(b.revenue, 'revenue', ctx);
  assertNumericField(b.ebitdaMargin, 'ebitdaMargin', ctx);
  assertNumericField(b.acquisitionMultiple, 'acquisitionMultiple', ctx);
  assertNumericField(b.organicGrowthRate, 'organicGrowthRate', ctx);
  assertNumericField(b.acquisitionPrice, 'acquisitionPrice', ctx);
  assertNumericField(b.bankDebtBalance, 'bankDebtBalance', ctx);
  assertNumericField(b.sellerNoteBalance, 'sellerNoteBalance', ctx);
  assertNumericField(b.earnoutRemaining, 'earnoutRemaining', ctx);

  // Quality rating must be 1-5
  if (b.status === 'active' || b.status === 'integrated') {
    expect(b.qualityRating, `qualityRating out of range at ${ctx}`)
      .toBeGreaterThanOrEqual(1);
    expect(b.qualityRating, `qualityRating out of range at ${ctx}`)
      .toBeLessThanOrEqual(5);
  }

  // Sector must be defined
  expect(b.sectorId, `sectorId undefined at ${ctx}`).toBeDefined();
}

/**
 * Validate game state invariants (Tier 1 — must always pass).
 * Called after every phase transition.
 */
export function validateGameState(state: GameState, context: string): void {
  // Core financial fields
  assertNumericField(state.cash, 'cash', context);
  assertNumericField(state.totalDebt, 'totalDebt', context);
  assertNumericField(state.interestRate, 'interestRate', context);
  assertNumericField(state.sharesOutstanding, 'sharesOutstanding', context);
  assertNumericField(state.holdcoLoanBalance, 'holdcoLoanBalance', context);

  // Shares invariant
  expect(state.sharesOutstanding, `sharesOutstanding <= 0 at ${context}`)
    .toBeGreaterThan(0);
  expect(state.founderShares, `founderShares <= 0 at ${context}`)
    .toBeGreaterThan(0);
  expect(state.sharesOutstanding, `sharesOutstanding < founderShares at ${context}`)
    .toBeGreaterThanOrEqual(state.founderShares);

  // Validate all businesses
  for (const b of state.businesses) {
    validateBusiness(b, context);
  }

  // totalDebt should match holdcoLoanBalance + sum of bank debt
  const computedDebt = state.holdcoLoanBalance + state.businesses
    .filter(b => b.status === 'active' || b.status === 'integrated')
    .reduce((sum, b) => sum + b.bankDebtBalance, 0);
  // Allow small rounding differences
  expect(
    Math.abs(state.totalDebt - computedDebt),
    `totalDebt mismatch at ${context}: state=${state.totalDebt}, computed=${computedDebt}`
  ).toBeLessThanOrEqual(1);

  // Metrics should compute without errors
  const metrics = calculateMetrics(state);
  assertNumericField(metrics.totalEbitda, 'totalEbitda', context);
  assertNumericField(metrics.totalFcf, 'totalFcf', context);
  assertNumericField(metrics.portfolioRoic, 'portfolioRoic', context);
  assertNumericField(metrics.fcfPerShare, 'fcfPerShare', context);
}

// ── Tier 3: Range-based ──

export interface PlaytestResult {
  finalState: GameState;
  score: ScoreBreakdown;
  enterpriseValue: number;
  founderEquityValue: number;
  roundsCompleted: number;
  bankrupted: boolean;
}

/**
 * Validate the final result of a playtest run.
 * Uses wide tolerances for RNG-dependent outcomes.
 */
export function validateFinalResult(result: PlaytestResult): void {
  const { finalState, score } = result;

  // Score should be valid
  assertNumericField(score.total, 'score.total', 'final');
  expect(score.total, 'score.total out of range').toBeGreaterThanOrEqual(0);
  expect(score.total, 'score.total out of range').toBeLessThanOrEqual(100);

  // Grade should be valid
  const validGrades = ['S', 'A', 'B', 'C', 'D', 'F'];
  expect(validGrades, 'invalid grade').toContain(score.grade);

  // Enterprise value should be finite
  assertNumericField(result.enterpriseValue, 'enterpriseValue', 'final');

  // For non-bankruptcy runs, EV should be > 0
  if (!result.bankrupted) {
    expect(result.enterpriseValue, 'EV should be positive for non-bankrupt run')
      .toBeGreaterThan(0);
  }

  // Metrics history should have correct number of entries
  expect(
    finalState.metricsHistory.length,
    'metricsHistory length mismatch'
  ).toBe(result.roundsCompleted);
}
