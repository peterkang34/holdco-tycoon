/**
 * Turnaround engine logic for Holdco Tycoon.
 *
 * Pure functions that handle turnaround eligibility, cost calculation,
 * resolution, and quality improvement mechanics.
 */

import type {
  Business,
  ActiveTurnaround,
  TurnaroundProgram,
  TurnaroundTier,
  QualityRating,
  GameDuration,
} from './types';
import {
  getAvailablePrograms,
  getQualityCeiling,
  TURNAROUND_TIER_CONFIG,
  getTurnaroundTierAnnualCost,
} from '../data/turnaroundPrograms';
import {
  TURNAROUND_FATIGUE_THRESHOLD,
  TURNAROUND_FATIGUE_PENALTY,
  TURNAROUND_EXIT_PREMIUM,
  TURNAROUND_EXIT_PREMIUM_MIN_TIERS,
  BASE_QUALITY_IMPROVEMENT_CHANCE,
  QUALITY_IMPROVEMENT_TIER_BONUS,
} from '../data/gameConfig';

// ── Eligibility ──

/** Get programs eligible for a specific business given current turnaround tier */
export function getEligiblePrograms(
  business: Business,
  turnaroundTier: TurnaroundTier,
  activeTurnarounds: ActiveTurnaround[],
): TurnaroundProgram[] {
  if (turnaroundTier === 0) return [];

  // Can't start if business already has an active turnaround
  const hasActive = activeTurnarounds.some(
    t => t.businessId === business.id && t.status === 'active'
  );
  if (hasActive) return [];

  const qualityCeiling = getQualityCeiling(business.sectorId);
  const available = getAvailablePrograms(turnaroundTier);

  return available.filter(p =>
    p.sourceQuality === business.qualityRating &&
    p.targetQuality <= qualityCeiling
  );
}

// ── Cost Calculation ──

/** Calculate the upfront cost of starting a turnaround program */
export function calculateTurnaroundCost(
  program: TurnaroundProgram,
  business: Business,
): number {
  return Math.round(Math.abs(business.ebitda) * program.upfrontCostFraction);
}

// ── Duration ──

/** Get the duration of a turnaround program based on game mode */
export function getTurnaroundDuration(
  program: TurnaroundProgram,
  duration: GameDuration,
): number {
  return duration === 'quick' ? program.durationQuick : program.durationStandard;
}

// ── Tier Unlock Validation ──

/** Check if the player can unlock the next turnaround tier */
export function canUnlockTier(
  currentTier: TurnaroundTier,
  cash: number,
  activeOpcoCount: number,
): { canUnlock: boolean; reason?: string } {
  const nextTier = (currentTier + 1) as 1 | 2 | 3;
  if (nextTier > 3) {
    return { canUnlock: false, reason: 'Already at maximum tier' };
  }

  const config = TURNAROUND_TIER_CONFIG[nextTier];

  if (activeOpcoCount < config.requiredOpcos) {
    return {
      canUnlock: false,
      reason: `Need ${config.requiredOpcos} active businesses (have ${activeOpcoCount})`,
    };
  }

  if (cash < config.unlockCost) {
    return {
      canUnlock: false,
      reason: `Need $${config.unlockCost}K cash (have $${cash}K)`,
    };
  }

  return { canUnlock: true };
}

// ── Resolution ──

export interface TurnaroundOutcome {
  result: 'success' | 'partial' | 'failure';
  qualityChange: number; // positive = improvement, 0 = no change, negative possible on failure
  ebitdaMultiplier: number; // 1.0 + boost or - damage
  targetQuality: QualityRating;
}

/** Resolve a turnaround program outcome using a random roll */
export function resolveTurnaround(
  program: TurnaroundProgram,
  activeTurnaroundCount: number,
  randomValue: number = Math.random(),
): TurnaroundOutcome {
  let { successRate, partialRate } = program;

  // Portfolio fatigue penalty
  if (activeTurnaroundCount >= TURNAROUND_FATIGUE_THRESHOLD) {
    successRate = Math.max(0, successRate - TURNAROUND_FATIGUE_PENALTY);
    // Redistribute to partial
    partialRate = Math.min(1 - successRate - program.failureRate, partialRate + TURNAROUND_FATIGUE_PENALTY);
  }

  if (randomValue < successRate) {
    return {
      result: 'success',
      qualityChange: program.targetQuality - program.sourceQuality,
      ebitdaMultiplier: 1 + program.ebitdaBoostOnSuccess,
      targetQuality: program.targetQuality,
    };
  } else if (randomValue < successRate + partialRate) {
    // Partial: one tier improvement instead of full
    const partialTarget = Math.min(
      program.targetQuality,
      program.sourceQuality + 1
    ) as QualityRating;
    return {
      result: 'partial',
      qualityChange: partialTarget - program.sourceQuality,
      ebitdaMultiplier: 1 + program.ebitdaBoostOnPartial,
      targetQuality: partialTarget,
    };
  } else {
    return {
      result: 'failure',
      qualityChange: 0,
      ebitdaMultiplier: 1 - program.ebitdaDamageOnFailure,
      targetQuality: program.sourceQuality,
    };
  }
}

// ── Quality Improvement from Ops ──

/** Calculate the chance of quality improvement when applying an operational improvement */
export function getQualityImprovementChance(turnaroundTier: TurnaroundTier): number {
  if (turnaroundTier === 0) return BASE_QUALITY_IMPROVEMENT_CHANCE;
  return BASE_QUALITY_IMPROVEMENT_CHANCE + QUALITY_IMPROVEMENT_TIER_BONUS[turnaroundTier as 1 | 2 | 3];
}

// ── Exit Premium ──

/** Calculate turnaround exit premium for a business */
export function getTurnaroundExitPremium(business: Business): number {
  const tiersImproved = business.qualityImprovedTiers ?? 0;
  if (tiersImproved >= TURNAROUND_EXIT_PREMIUM_MIN_TIERS) {
    return TURNAROUND_EXIT_PREMIUM;
  }
  return 0;
}

// ── Annual Cost ──

/** Get the total annual cost for the current turnaround tier */
export { getTurnaroundTierAnnualCost };
