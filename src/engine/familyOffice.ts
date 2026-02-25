/**
 * Family Office Endgame engine — 20-year mode only.
 * Post-game 5-round mini-game for players with $1B+ distributions.
 * New mechanics: reputation, philanthropy, succession, legacy scoring.
 */

import type {
  GameState,
  FamilyOfficeState,
  FOSuccessionChoice,
  LegacyScore,
  ScoreBreakdown,
} from './types';
import {
  FAMILY_OFFICE_MIN_DISTRIBUTIONS,
  FAMILY_OFFICE_MIN_COMPOSITE_GRADE,
  FAMILY_OFFICE_MIN_Q4_BUSINESSES,
  FAMILY_OFFICE_MIN_LONG_HELD,
  FAMILY_OFFICE_ROUNDS,
  FAMILY_OFFICE_SUCCESSION_ROUND,
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
 * Initialize the Family Office state for the 5-round mini-game.
 */
export function initializeFamilyOffice(): FamilyOfficeState {
  return {
    isActive: true,
    foRound: 1,
    reputation: 50, // starts at neutral
    philanthropyCommitted: 0,
    investments: [],
    irrevocableCommitments: [],
  };
}

/**
 * Process a Family Office round — advance to the next round.
 */
export function advanceFamilyOfficeRound(
  foState: FamilyOfficeState,
): FamilyOfficeState {
  if (foState.legacyScore) return foState; // already complete
  // Block advancement past succession round without a choice
  if (foState.foRound === FAMILY_OFFICE_SUCCESSION_ROUND && !foState.generationalSuccessionChoice) {
    return foState;
  }
  if (foState.foRound >= FAMILY_OFFICE_ROUNDS) {
    // Final round — compute legacy score
    return {
      ...foState,
      legacyScore: calculateLegacyScore(foState),
    };
  }

  return {
    ...foState,
    foRound: foState.foRound + 1,
  };
}

/**
 * Preview reputation gain for a philanthropy amount.
 */
export function philanthropyRepGain(amount: number): number {
  return Math.round(amount / 5000);
}

/**
 * Make a philanthropy commitment (irrevocable).
 */
export function commitPhilanthropy(
  foState: FamilyOfficeState,
  amount: number,
): FamilyOfficeState {
  return {
    ...foState,
    philanthropyCommitted: foState.philanthropyCommitted + amount,
    reputation: Math.min(100, foState.reputation + philanthropyRepGain(amount)),
    irrevocableCommitments: [
      ...foState.irrevocableCommitments,
      { type: 'philanthropy', amount, round: foState.foRound, irrevocable: true },
    ],
  };
}

/**
 * Make an investment allocation.
 */
export function makeInvestment(
  foState: FamilyOfficeState,
  type: string,
  amount: number,
): FamilyOfficeState {
  return {
    ...foState,
    investments: [
      ...foState.investments,
      { type, amount, round: foState.foRound },
    ],
  };
}

/**
 * Get succession choices available at round 3.
 */
export function getSuccessionChoices(): {
  choice: FOSuccessionChoice;
  label: string;
  description: string;
  riskDescription: string;
}[] {
  return [
    {
      choice: 'heir_apparent',
      label: 'Heir Apparent',
      description: 'Groom your eldest to take the reins.',
      riskDescription: '40% chance of competence shortfall — reputation -20 if it happens.',
    },
    {
      choice: 'professional_ceo',
      label: 'Professional CEO',
      description: 'Hire external professional management.',
      riskDescription: '5% FCF ongoing cost, 15% cultural drift risk — reputation -10 if drift occurs.',
    },
    {
      choice: 'family_council',
      label: 'Family Council',
      description: 'Establish a family governance council.',
      riskDescription: 'Governance friction slows decisions, 25% family dispute risk — reputation -15 if dispute.',
    },
  ];
}

/**
 * Apply the generational succession choice.
 */
export function applySuccessionChoice(
  foState: FamilyOfficeState,
  choice: FOSuccessionChoice,
): FamilyOfficeState {
  return {
    ...foState,
    generationalSuccessionChoice: choice,
    // Reputation adjustments applied in legacy scoring
  };
}

/**
 * Is this the succession round?
 */
export function isSuccessionRound(foState: FamilyOfficeState): boolean {
  return foState.foRound === FAMILY_OFFICE_SUCCESSION_ROUND;
}

/**
 * Is the Family Office mini-game complete?
 */
export function isFamilyOfficeComplete(foState: FamilyOfficeState): boolean {
  return foState.foRound >= FAMILY_OFFICE_ROUNDS && foState.legacyScore !== undefined;
}

/**
 * Calculate the final Legacy Score (5 components, 20% each).
 */
export function calculateLegacyScore(foState: FamilyOfficeState): LegacyScore {
  // 1. Wealth Preservation (20%) — based on investment diversification
  const investmentCount = foState.investments.length;
  const uniqueTypes = new Set(foState.investments.map(i => i.type)).size;
  const wealthPreservation = Math.min(20, investmentCount * 3 + uniqueTypes * 5);

  // 2. Reputation (20%) — direct from reputation score
  const reputationScore = Math.min(20, Math.round(foState.reputation / 5));

  // 3. Philanthropy (20%) — based on total committed
  const philanthropyScore = Math.min(20, Math.round(foState.philanthropyCommitted / 25000));

  // 4. Succession Quality (20%) — based on choice and execution
  let successionQuality = 10; // baseline
  if (foState.generationalSuccessionChoice === 'professional_ceo') {
    successionQuality = 16; // safest choice
  } else if (foState.generationalSuccessionChoice === 'family_council') {
    successionQuality = 14; // moderate
  } else if (foState.generationalSuccessionChoice === 'heir_apparent') {
    successionQuality = 12; // riskiest but highest upside
  }

  // 5. Permanent Hold Performance (20%) — based on commitment count
  const commitmentCount = foState.irrevocableCommitments.length;
  const permanentHoldPerformance = Math.min(20, commitmentCount * 4 + 8);

  const total = wealthPreservation + reputationScore + philanthropyScore +
    successionQuality + permanentHoldPerformance;

  let grade: LegacyScore['grade'];
  if (total >= 80) grade = 'Enduring';
  else if (total >= 60) grade = 'Influential';
  else if (total >= 40) grade = 'Established';
  else grade = 'Fragile';

  return {
    total,
    grade,
    wealthPreservation,
    reputationScore,
    philanthropyScore,
    successionQuality,
    permanentHoldPerformance,
  };
}
