// Shared engine helper functions and constants

import type { Business } from './types';

// --- Constants ---

export const EBITDA_FLOOR_PCT = 0.30;
export const MIN_MARGIN = 0.03;
export const MAX_MARGIN = 0.80;
export const MAX_ORGANIC_GROWTH_RATE = 0.20; // M-4: Cap on growth rate accumulation

// --- Margin helpers ---

/** Clamp a margin value to the valid [MIN_MARGIN, MAX_MARGIN] range */
export function clampMargin(margin: number): number {
  return Math.max(MIN_MARGIN, Math.min(MAX_MARGIN, margin));
}

// --- Growth rate helpers ---

/** Cap a growth rate to the valid [-0.10, MAX_ORGANIC_GROWTH_RATE] range */
export function capGrowthRate(rate: number): number {
  return Math.min(MAX_ORGANIC_GROWTH_RATE, Math.max(-0.10, rate));
}

// --- EBITDA floor ---

/**
 * Floor EBITDA at EBITDA_FLOOR_PCT of acquisitionEbitda.
 * If floored, re-derives margin to maintain the EBITDA = Revenue x Margin invariant.
 */
export function applyEbitdaFloor(
  ebitda: number,
  revenue: number,
  margin: number,
  acquisitionEbitda: number
): { ebitda: number; margin: number } {
  const floor = Math.round(acquisitionEbitda * EBITDA_FLOOR_PCT);
  if (ebitda < floor) {
    const floored = floor;
    const fixedMargin = revenue > 0 ? Math.max(MIN_MARGIN, floored / revenue) : margin;
    return { ebitda: floored, margin: fixedMargin };
  }
  return { ebitda, margin };
}

// --- Business dedup ---

/**
 * Merge active + exited businesses into a single de-duplicated list.
 * Filters out integrated, merged, and bolt-on (parentPlatformId) businesses.
 * exitedBusinesses take priority when a business ID exists in both lists.
 */
export function getAllDedupedBusinesses(
  businesses: Business[],
  exitedBusinesses: Business[]
): Business[] {
  const exitedIds = new Set(exitedBusinesses.map(b => b.id));
  return [
    ...exitedBusinesses.filter(b => b.status !== 'integrated' && b.status !== 'merged' && !b.parentPlatformId),
    ...businesses.filter(b => !exitedIds.has(b.id) && b.status !== 'integrated' && b.status !== 'merged' && !b.parentPlatformId),
  ];
}
