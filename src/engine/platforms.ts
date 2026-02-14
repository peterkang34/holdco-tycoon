import { Business, GameDifficulty, GameDuration, IntegratedPlatform, PlatformBonuses, PlatformRecipe, SectorId } from './types';
import { PLATFORM_RECIPES } from '../data/platformRecipes';
import { INTEGRATION_THRESHOLD_MULTIPLIER } from '../data/gameConfig';

/**
 * Get the threshold multiplier for the current difficulty/duration combo.
 * Easy-Standard = 1.0 (base), Normal-Quick = 0.5 (most accessible)
 */
export function getIntegrationThresholdMultiplier(
  difficulty: GameDifficulty,
  duration: GameDuration
): number {
  return INTEGRATION_THRESHOLD_MULTIPLIER[difficulty][duration];
}

/**
 * Apply the difficulty/duration scaling to a base EBITDA threshold.
 */
export function getScaledThreshold(
  baseThreshold: number,
  difficulty: GameDifficulty,
  duration: GameDuration
): number {
  return Math.round(baseThreshold * getIntegrationThresholdMultiplier(difficulty, duration));
}

/**
 * Check which platform recipes a player is eligible to forge.
 * Returns recipes where:
 * 1. Player owns active businesses with the required sub-types
 * 2. Player meets the minSubTypes requirement
 * 3. Combined EBITDA in the relevant sector(s) meets the scaled threshold
 * 4. The recipe hasn't already been forged
 */
export function checkPlatformEligibility(
  businesses: Business[],
  existingPlatforms: IntegratedPlatform[],
  difficulty: GameDifficulty,
  duration: GameDuration
): { recipe: PlatformRecipe; eligibleBusinesses: Business[]; sectorEbitda: number; scaledThreshold: number }[] {
  const activeBusinesses = businesses.filter(b => b.status === 'active' || b.status === 'integrated');
  const alreadyForgedIds = new Set(existingPlatforms.map(p => p.recipeId));
  // Exclude businesses already part of a platform
  const availableBusinesses = activeBusinesses.filter(b => !b.integratedPlatformId);

  const eligible: { recipe: PlatformRecipe; eligibleBusinesses: Business[]; sectorEbitda: number; scaledThreshold: number }[] = [];

  for (const recipe of PLATFORM_RECIPES) {
    // Skip already forged
    if (alreadyForgedIds.has(recipe.id)) continue;

    // Find businesses that match this recipe's required sub-types
    let matchingBusinesses: Business[];

    if (recipe.sectorId) {
      // Within-sector: businesses must be in the recipe's sector
      matchingBusinesses = availableBusinesses.filter(
        b => b.sectorId === recipe.sectorId && recipe.requiredSubTypes.includes(b.subType)
      );
    } else if (recipe.crossSectorIds) {
      // Cross-sector: businesses must be in one of the cross-sector IDs
      matchingBusinesses = availableBusinesses.filter(
        b => recipe.crossSectorIds!.includes(b.sectorId) && recipe.requiredSubTypes.includes(b.subType)
      );
    } else {
      continue;
    }

    // Check distinct sub-type count
    const distinctSubTypes = new Set(matchingBusinesses.map(b => b.subType));
    if (distinctSubTypes.size < recipe.minSubTypes) continue;

    // For cross-sector, require at least 1 business from each sector
    if (recipe.crossSectorIds) {
      const sectorsRepresented = new Set(matchingBusinesses.map(b => b.sectorId));
      const allSectorsPresent = recipe.crossSectorIds.every(s => sectorsRepresented.has(s));
      if (!allSectorsPresent) continue;
    }

    // Calculate sector EBITDA (all active businesses in relevant sectors, not just matching ones)
    let sectorEbitda: number;
    if (recipe.sectorId) {
      sectorEbitda = activeBusinesses
        .filter(b => b.sectorId === recipe.sectorId)
        .reduce((sum, b) => sum + b.ebitda, 0);
    } else {
      sectorEbitda = activeBusinesses
        .filter(b => recipe.crossSectorIds!.includes(b.sectorId))
        .reduce((sum, b) => sum + b.ebitda, 0);
    }

    // Check EBITDA threshold (scaled by difficulty/duration)
    const scaledThreshold = getScaledThreshold(recipe.baseEbitdaThreshold, difficulty, duration);
    if (sectorEbitda < scaledThreshold) continue;

    eligible.push({
      recipe,
      eligibleBusinesses: matchingBusinesses,
      sectorEbitda,
      scaledThreshold,
    });
  }

  return eligible;
}

/**
 * Calculate the integration cost for forging a platform.
 * Cost = recipe.integrationCostFraction x combined EBITDA of selected businesses
 */
export function calculateIntegrationCost(
  recipe: PlatformRecipe,
  selectedBusinesses: Business[]
): number {
  const combinedEbitda = selectedBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
  return Math.round(combinedEbitda * recipe.integrationCostFraction);
}

/**
 * Forge an integrated platform from selected businesses.
 * Returns the new IntegratedPlatform object.
 * The caller (store) is responsible for:
 * - Deducting the integration cost from cash
 * - Setting integratedPlatformId on each constituent business
 * - Adding the platform to state.integratedPlatforms
 * - Applying one-time margin boost + permanent growth boost to constituent businesses
 */
export function forgePlatform(
  recipe: PlatformRecipe,
  selectedBusinessIds: string[],
  round: number
): IntegratedPlatform {
  const id = `platform_${recipe.id}_r${round}`;

  const sectorIds: SectorId[] = recipe.sectorId
    ? [recipe.sectorId]
    : (recipe.crossSectorIds || []);

  return {
    id,
    recipeId: recipe.id,
    name: recipe.name,
    sectorIds,
    constituentBusinessIds: selectedBusinessIds,
    forgedInRound: round,
    bonuses: { ...recipe.bonuses },
  };
}

/**
 * Get the platform bonuses that apply to a specific business.
 * Returns null if the business is not part of any platform.
 */
export function getPlatformBonuses(
  business: Business,
  platforms: IntegratedPlatform[]
): PlatformBonuses | null {
  if (!business.integratedPlatformId) return null;
  const platform = platforms.find(p => p.id === business.integratedPlatformId);
  if (!platform) return null;
  return platform.bonuses;
}

/**
 * Get the multiple expansion premium for a business that's part of an integrated platform.
 * Returns 0 if not part of a platform.
 */
export function getPlatformMultipleExpansion(
  business: Business,
  platforms: IntegratedPlatform[]
): number {
  const bonuses = getPlatformBonuses(business, platforms);
  return bonuses ? bonuses.multipleExpansion : 0;
}

/**
 * Get recession resistance modifier for a business in a platform.
 * Returns 1.0 (no change) if not part of a platform.
 */
export function getPlatformRecessionModifier(
  business: Business,
  platforms: IntegratedPlatform[]
): number {
  const bonuses = getPlatformBonuses(business, platforms);
  return bonuses ? bonuses.recessionResistanceReduction : 1.0;
}
