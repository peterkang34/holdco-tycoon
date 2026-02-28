/**
 * Family Office V2 engine — 20-year mode only.
 * Post-game 5-round holdco gameplay using real game mechanics.
 * Player uses accumulated distributions to build a new portfolio,
 * earning a 1.0-1.5x multiplier on their main-game Adjusted FEV.
 */

import type {
  GameState,
  LegacyScore,
  ScoreBreakdown,
} from './types';
import {
  FAMILY_OFFICE_MIN_DISTRIBUTIONS,
  FAMILY_OFFICE_MIN_COMPOSITE_GRADE,
  FAMILY_OFFICE_MIN_Q4_BUSINESSES,
  FAMILY_OFFICE_MIN_LONG_HELD,
  FO_MULTIPLIER_CAP,
  FO_MULTIPLIER_MOIC_SCALE,
} from '../data/gameConfig';

const PASSING_GRADES = ['S', 'A', 'B'];

/**
 * Check if the player qualifies for the Family Office endgame.
 */
export function checkFamilyOfficeEligibility(
  state: GameState,
  score: ScoreBreakdown,
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const active = state.businesses.filter(b => b.status === 'active');

  if (state.duration !== 'standard') {
    reasons.push('Only available in Full Game (20-year) mode');
  }

  if (state.founderDistributionsReceived < FAMILY_OFFICE_MIN_DISTRIBUTIONS) {
    reasons.push(`Requires $${(FAMILY_OFFICE_MIN_DISTRIBUTIONS / 1000).toFixed(0)}M+ founder distributions (currently $${(state.founderDistributionsReceived / 1000).toFixed(1)}M)`);
  }

  // Composite grade must be B or better
  const gradeIndex = PASSING_GRADES.indexOf(score.grade);
  if (gradeIndex === -1) {
    reasons.push(`Requires ${FAMILY_OFFICE_MIN_COMPOSITE_GRADE}+ composite grade (currently ${score.grade})`);
  }

  // Need 3+ businesses at Q4+
  const q4Plus = active.filter(b => b.qualityRating >= 4);
  if (q4Plus.length < FAMILY_OFFICE_MIN_Q4_BUSINESSES) {
    reasons.push(`Requires ${FAMILY_OFFICE_MIN_Q4_BUSINESSES}+ businesses at Q4+ (currently ${q4Plus.length})`);
  }

  // Need 2+ businesses held 10+ years
  const longHeld = active.filter(b => (state.round - b.acquisitionRound) >= 10);
  if (longHeld.length < FAMILY_OFFICE_MIN_LONG_HELD) {
    reasons.push(`Requires ${FAMILY_OFFICE_MIN_LONG_HELD}+ businesses held 10+ years (currently ${longHeld.length})`);
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Calculate the FO multiplier from MOIC.
 * Formula: 1.0 + min(0.50, max(0, MOIC) × 0.10)
 */
export function calculateFOMultiplier(foFEV: number, foStartingCash: number): number {
  if (foStartingCash <= 0) return 1.0;
  const moic = foFEV / foStartingCash;
  return Math.min(1.0 + FO_MULTIPLIER_CAP, 1.0 + Math.max(0, moic) * FO_MULTIPLIER_MOIC_SCALE);
}

/**
 * Calculate the FO legacy score from ending FEV and starting cash.
 */
export function calculateFOLegacyScore(foFEV: number, foStartingCash: number): LegacyScore {
  const moic = foStartingCash > 0 ? foFEV / foStartingCash : 0;
  const multiplier = calculateFOMultiplier(foFEV, foStartingCash);

  let grade: LegacyScore['grade'];
  if (moic >= 3.5) grade = 'Enduring';
  else if (moic >= 2.0) grade = 'Influential';
  else if (moic >= 1.0) grade = 'Established';
  else grade = 'Fragile';

  return {
    total: Math.round(moic * 100),
    grade,
    foFEV,
    foStartingCash,
    foMOIC: moic,
    foMultiplier: multiplier,
  };
}
