import { Business, RouteDensityBonus, SubTypeSpecBonus } from './types';
import { SECTORS } from '../data/sectors';
import {
  ROUTE_DENSITY_MARGIN_BOOST,
  ROUTE_DENSITY_CAPEX_REDUCTION,
  ROUTE_DENSITY_MIN_ADJACENT,
  SUBTYPE_SPEC_BASE_MARGIN,
  SUBTYPE_SPEC_BASE_INTEGRATION,
  SUBTYPE_SPEC_BASE_MIN_COUNT,
  SUBTYPE_SPEC_ENHANCED_T1_MARGIN,
  SUBTYPE_SPEC_ENHANCED_T1_GROWTH,
  SUBTYPE_SPEC_ENHANCED_T1_INTEGRATION,
  SUBTYPE_SPEC_ENHANCED_T1_MIN_COUNT,
  SUBTYPE_SPEC_ENHANCED_T2_MARGIN,
  SUBTYPE_SPEC_ENHANCED_T2_GROWTH,
  SUBTYPE_SPEC_ENHANCED_T2_INTEGRATION,
  SUBTYPE_SPEC_ENHANCED_T2_MIN_COUNT,
  SUBTYPE_SPEC_COUNT_CAP,
  SUBTYPE_SPEC_MARGIN_CAP,
} from '../data/gameConfig';

/**
 * Distribution Route Density — +2% margin, -15% capex when owning 2+ distribution
 * businesses with adjacent sub-types (same subTypeGroup).
 */
export function calculateRouteDensityBonus(businesses: Business[]): RouteDensityBonus | null {
  const distSector = SECTORS['distribution'];
  if (!distSector) return null;

  const activeDistribution = businesses.filter(
    b => b.status === 'active' && b.sectorId === 'distribution'
  );
  if (activeDistribution.length < ROUTE_DENSITY_MIN_ADJACENT) return null;

  // Count businesses per subTypeGroup
  const groupCounts: Record<number, number> = {};
  for (const b of activeDistribution) {
    const idx = distSector.subTypes.indexOf(b.subType);
    if (idx === -1) continue;
    const group = distSector.subTypeGroups[idx];
    groupCounts[group] = (groupCounts[group] || 0) + 1;
  }

  // Find max adjacent count (businesses sharing a group)
  const maxAdjacent = Math.max(0, ...Object.values(groupCounts));
  if (maxAdjacent < ROUTE_DENSITY_MIN_ADJACENT) return null;

  return {
    marginBoost: ROUTE_DENSITY_MARGIN_BOOST,
    capexReduction: ROUTE_DENSITY_CAPEX_REDUCTION,
    adjacentCount: maxAdjacent,
  };
}

/**
 * Sub-Type Specialization — tiered bonuses for owning multiple businesses of the same sub-type.
 * Base tier available to everyone (3+), enhanced tiers require Sector Specialist achievement.
 */
export function calculateSubTypeSpecBonus(
  businesses: Business[],
  hasEnhancedUnlock: boolean,
): SubTypeSpecBonus | null {
  const active = businesses.filter(b => b.status === 'active');
  if (active.length === 0) return null;

  // Count businesses by exact sub-type
  const subTypeCounts: Record<string, number> = {};
  for (const b of active) {
    subTypeCounts[b.subType] = (subTypeCounts[b.subType] || 0) + 1;
  }

  // Find the sub-type with the most businesses
  let bestSubType = '';
  let bestCount = 0;
  for (const [subType, count] of Object.entries(subTypeCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestSubType = subType;
    }
  }

  // Hard cap at 5
  const effectiveCount = Math.min(bestCount, SUBTYPE_SPEC_COUNT_CAP);

  // Determine tier
  if (hasEnhancedUnlock && effectiveCount >= SUBTYPE_SPEC_ENHANCED_T2_MIN_COUNT) {
    return {
      tier: 'enhanced_t2',
      subType: bestSubType,
      count: effectiveCount,
      marginBoost: Math.min(SUBTYPE_SPEC_ENHANCED_T2_MARGIN, SUBTYPE_SPEC_MARGIN_CAP),
      growthBoost: SUBTYPE_SPEC_ENHANCED_T2_GROWTH,
      integrationBoost: SUBTYPE_SPEC_ENHANCED_T2_INTEGRATION,
    };
  }
  if (hasEnhancedUnlock && effectiveCount >= SUBTYPE_SPEC_ENHANCED_T1_MIN_COUNT) {
    return {
      tier: 'enhanced_t1',
      subType: bestSubType,
      count: effectiveCount,
      marginBoost: Math.min(SUBTYPE_SPEC_ENHANCED_T1_MARGIN, SUBTYPE_SPEC_MARGIN_CAP),
      growthBoost: SUBTYPE_SPEC_ENHANCED_T1_GROWTH,
      integrationBoost: SUBTYPE_SPEC_ENHANCED_T1_INTEGRATION,
    };
  }
  if (effectiveCount >= SUBTYPE_SPEC_BASE_MIN_COUNT) {
    return {
      tier: 'base',
      subType: bestSubType,
      count: effectiveCount,
      marginBoost: Math.min(SUBTYPE_SPEC_BASE_MARGIN, SUBTYPE_SPEC_MARGIN_CAP),
      growthBoost: 0,
      integrationBoost: SUBTYPE_SPEC_BASE_INTEGRATION,
    };
  }

  return null;
}

/**
 * Integration success boost for acquiring a business with the same sub-type as existing portfolio.
 * Used by determineIntegrationOutcome.
 */
export function getSubTypeSpecIntegrationBoost(
  targetSubType: string,
  businesses: Business[],
  hasEnhancedUnlock: boolean,
): number {
  const activeMatchCount = businesses.filter(
    b => b.status === 'active' && b.subType === targetSubType
  ).length;

  const effectiveCount = Math.min(activeMatchCount, SUBTYPE_SPEC_COUNT_CAP);

  if (hasEnhancedUnlock && effectiveCount >= SUBTYPE_SPEC_ENHANCED_T2_MIN_COUNT) {
    return SUBTYPE_SPEC_ENHANCED_T2_INTEGRATION;
  }
  if (hasEnhancedUnlock && effectiveCount >= SUBTYPE_SPEC_ENHANCED_T1_MIN_COUNT) {
    return SUBTYPE_SPEC_ENHANCED_T1_INTEGRATION;
  }
  if (effectiveCount >= SUBTYPE_SPEC_BASE_MIN_COUNT) {
    return SUBTYPE_SPEC_BASE_INTEGRATION;
  }

  return 0;
}
