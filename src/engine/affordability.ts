import type { DealSizeTier, IPOState } from './types';
import type { SeededRng } from './rng';
import {
  AFFORDABILITY_LBO_MULTIPLIER,
  STRETCH_FACTOR_MAX,
  IPO_AFFORDABILITY_DISCOUNT,
  CONCENTRATION_CASH_THRESHOLD,
  CONCENTRATION_WEIGHT_PENALTY,
  TROPHY_BASE_MIN,
  TROPHY_BASE_MAX,
  TROPHY_SCALE_ACTIVATION,
  TROPHY_SCALE_CAP,
  TIER_FLOOR_COSTS,
} from '../data/gameConfig';

export const TIER_ORDER: DealSizeTier[] = [
  'micro', 'small', 'mid_market', 'upper_mid', 'institutional', 'marquee', 'trophy',
];

export interface AffordabilityResult {
  base: number;
  stretched: number;
  stretchFactor: number;
  ipoBonus: number;
}

/**
 * Calculate affordability (max deal purchasing power).
 * Base: cash * 4 (LBO at 25% equity), or just cash if credit-constrained.
 * Stretch: squared uniform (right-skewed), 0-50%.
 * IPO bonus: marketCap * 25% when public with stock >= $1.00.
 */
export function calculateAffordability(
  cash: number,
  creditTightening: boolean,
  noNewDebt: boolean,
  ipoState: IPOState | null,
  rng: SeededRng,
): AffordabilityResult {
  let base: number;
  if (creditTightening || noNewDebt) {
    base = cash; // all-cash only, no leverage
  } else {
    base = cash * AFFORDABILITY_LBO_MULTIPLIER; // cash * 4
  }

  // Squared uniform: weighted toward small stretches
  // Mean ~16.7%, median ~12.5%, 90th percentile ~34%
  const raw = rng.next();
  const stretchFactor = raw * raw * STRETCH_FACTOR_MAX; // 0 to 0.50

  const stretched = Math.round(base * (1 + stretchFactor));

  // Post-IPO: stock-as-currency adds purchasing power (additive, not multiplicative)
  let ipoBonus = 0;
  if (ipoState?.isPublic && ipoState.stockPrice >= 1.0) {
    const marketCap = ipoState.stockPrice * ipoState.sharesOutstanding;
    ipoBonus = Math.round(marketCap * IPO_AFFORDABILITY_DISCOUNT);
  }

  return { base, stretched: stretched + ipoBonus, stretchFactor, ipoBonus };
}

/**
 * Calculate per-tier weights for deal generation based on affordability.
 * Uses stretched affordability for tier access, raw cash for concentration penalty.
 * Returns normalized weights summing to 1.0.
 */
export function getAffordabilityWeights(
  stretchedAffordability: number,
  cash: number,
): Record<DealSizeTier, number> {
  const weights = {} as Record<DealSizeTier, number>;

  for (const tier of TIER_ORDER) {
    const floorCost = TIER_FLOOR_COSTS[tier];

    // Tier access via stretched affordability — 5-bracket weight curve
    if (stretchedAffordability < floorCost * 0.5) {
      weights[tier] = 0;           // can't see this tier
    } else if (stretchedAffordability < floorCost) {
      weights[tier] = 0.03;        // rare stretch deal
    } else if (stretchedAffordability < floorCost * 2) {
      weights[tier] = 0.15;        // in range
    } else if (stretchedAffordability < floorCost * 5) {
      weights[tier] = 0.25;        // sweet spot
    } else if (stretchedAffordability < floorCost * 15) {
      weights[tier] = 0.12;        // outgrowing
    } else {
      weights[tier] = 0.04;        // tuck-in remnant
    }

    // Concentration penalty: raw cash, not stretched
    const equityCheck = floorCost * 0.25; // LBO = 25% equity
    if (equityCheck > cash * CONCENTRATION_CASH_THRESHOLD) {
      weights[tier] *= CONCENTRATION_WEIGHT_PENALTY;
    }
  }

  // Normalize to 1.0
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  if (total > 0) {
    for (const tier of TIER_ORDER) {
      weights[tier] /= total;
    }
  } else {
    // Fallback: if all weights are 0, put everything on micro
    weights.micro = 1;
  }

  return weights;
}

/**
 * Generate Trophy tier EBITDA with sqrt scaling based on affordability.
 * Base: $75M-$150M random. Sqrt scaling above $600M affordability, capped at 4x.
 */
export function generateTrophyEbitda(affordability: number, rng: SeededRng): number {
  const base = TROPHY_BASE_MIN + rng.next() * (TROPHY_BASE_MAX - TROPHY_BASE_MIN);

  if (affordability > TROPHY_SCALE_ACTIVATION) {
    const scaleFactor = 1 + Math.sqrt(
      (affordability - TROPHY_SCALE_ACTIVATION) / TROPHY_SCALE_ACTIVATION
    ) * 0.5;
    return Math.round(base * Math.min(scaleFactor, TROPHY_SCALE_CAP));
  }

  return Math.round(base);
}

/**
 * Weighted random selection from tier weights.
 */
export function pickWeightedTier(
  weights: Record<DealSizeTier, number>,
  rng: SeededRng,
): DealSizeTier {
  let roll = rng.next();
  for (const tier of TIER_ORDER) {
    roll -= weights[tier];
    if (roll <= 0) return tier;
  }
  return 'micro'; // fallback
}

/**
 * Determine which tier a given EBITDA value falls into.
 */
export function getTierForEbitda(ebitda: number): DealSizeTier {
  if (ebitda >= 75000) return 'trophy';
  if (ebitda >= 50000) return 'marquee';
  if (ebitda >= 25000) return 'institutional';
  if (ebitda >= 10000) return 'upper_mid';
  if (ebitda >= 4000) return 'mid_market';
  if (ebitda >= 1500) return 'small';
  return 'micro';
}
