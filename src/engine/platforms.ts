import { Business, GameDifficulty, GameDuration, IntegratedPlatform, PlatformBonuses, PlatformRecipe, SectorId } from './types';
import { PLATFORM_RECIPES, getRecipeById } from '../data/platformRecipes';
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
  // Exclude businesses already part of a platform, pro sports, and Q1/Q2 (must stabilize before platform integration)
  const availableBusinesses = activeBusinesses.filter(b => !b.integratedPlatformId && b.sectorId !== 'proSports' && b.qualityRating >= 3);

  const eligible: { recipe: PlatformRecipe; eligibleBusinesses: Business[]; sectorEbitda: number; scaledThreshold: number }[] = [];

  for (const recipe of PLATFORM_RECIPES) {
    // Skip already forged (unless allowMultipleForges — e.g., one per vertical)
    if (alreadyForgedIds.has(recipe.id) && !recipe.allowMultipleForges) continue;

    // Find businesses that match this recipe's required sub-types
    let matchingBusinesses: Business[];

    if (recipe.sectorId) {
      // Within-sector: businesses must be in the recipe's sector
      matchingBusinesses = availableBusinesses.filter(
        b => b.sectorId === recipe.sectorId && recipe.requiredSubTypes.includes(b.subType)
      );
    } else if (recipe.crossSectorIds) {
      if (recipe.skipCrossSectorCheck) {
        // Custom-validated: match ANY business with a qualifying sub-type (not restricted to crossSectorIds)
        matchingBusinesses = availableBusinesses.filter(
          b => recipe.requiredSubTypes.includes(b.subType)
        );
      } else {
        // Standard cross-sector: businesses must be in one of the cross-sector IDs
        matchingBusinesses = availableBusinesses.filter(
          b => recipe.crossSectorIds!.includes(b.sectorId) && recipe.requiredSubTypes.includes(b.subType)
        );
      }
    } else {
      continue;
    }

    // Check distinct sub-type count
    const distinctSubTypes = new Set(matchingBusinesses.map(b => b.subType));
    if (distinctSubTypes.size < recipe.minSubTypes) continue;

    // For cross-sector, require at least 1 business from each sector (unless skipCrossSectorCheck)
    if (recipe.crossSectorIds && !recipe.skipCrossSectorCheck) {
      const sectorsRepresented = new Set(matchingBusinesses.map(b => b.sectorId));
      const allSectorsPresent = recipe.crossSectorIds.every(s => sectorsRepresented.has(s));
      if (!allSectorsPresent) continue;
    }

    // Custom validator for complex constraints (e.g., cross-sector SaaS+Services)
    if (recipe.customValidator && !recipe.customValidator(matchingBusinesses, existingPlatforms)) continue;

    // Calculate sector EBITDA (all active businesses in relevant sectors, not just matching ones)
    let sectorEbitda: number;
    if (recipe.sectorId) {
      sectorEbitda = activeBusinesses
        .filter(b => b.sectorId === recipe.sectorId)
        .reduce((sum, b) => sum + b.ebitda, 0);
    } else if (recipe.skipCrossSectorCheck) {
      // Custom-validated: sum EBITDA from all sectors represented by matching businesses
      const matchingSectors = new Set(matchingBusinesses.map(b => b.sectorId));
      sectorEbitda = activeBusinesses
        .filter(b => matchingSectors.has(b.sectorId))
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
 * Check which platform recipes a player is CLOSE to being eligible for.
 * Returns recipes where:
 * 1. Sub-type requirements ARE met (enough matching businesses with distinct sub-types)
 * 2. EBITDA threshold is NOT yet met
 * 3. The recipe hasn't already been forged
 *
 * This lets the UI show a "progress toward unlock" indicator so players
 * understand why a platform isn't available yet.
 */
export function checkNearEligiblePlatforms(
  businesses: Business[],
  existingPlatforms: IntegratedPlatform[],
  difficulty: GameDifficulty,
  duration: GameDuration
): { recipe: PlatformRecipe; matchingBusinesses: Business[]; sectorEbitda: number; scaledThreshold: number; qualityBlockers: Business[] }[] {
  const activeBusinesses = businesses.filter(b => b.status === 'active' || b.status === 'integrated');
  const alreadyForgedIds = new Set(existingPlatforms.map(p => p.recipeId));
  // Exclude businesses already part of a platform, and pro sports (ineligible for platforms)
  // NOTE: Do NOT filter by quality here — we want to show Q1/Q2 businesses as quality blockers
  const availableBusinesses = activeBusinesses.filter(b => !b.integratedPlatformId && b.sectorId !== 'proSports');

  const nearEligible: { recipe: PlatformRecipe; matchingBusinesses: Business[]; sectorEbitda: number; scaledThreshold: number; qualityBlockers: Business[] }[] = [];

  for (const recipe of PLATFORM_RECIPES) {
    // Skip already forged (unless allowMultipleForges)
    if (alreadyForgedIds.has(recipe.id) && !recipe.allowMultipleForges) continue;

    // Find businesses that match this recipe's required sub-types (including Q1/Q2)
    let matchingBusinesses: Business[];

    if (recipe.sectorId) {
      matchingBusinesses = availableBusinesses.filter(
        b => b.sectorId === recipe.sectorId && recipe.requiredSubTypes.includes(b.subType)
      );
    } else if (recipe.crossSectorIds) {
      if (recipe.skipCrossSectorCheck) {
        matchingBusinesses = availableBusinesses.filter(
          b => recipe.requiredSubTypes.includes(b.subType)
        );
      } else {
        matchingBusinesses = availableBusinesses.filter(
          b => recipe.crossSectorIds!.includes(b.sectorId) && recipe.requiredSubTypes.includes(b.subType)
        );
      }
    } else {
      continue;
    }

    // Check distinct sub-type count — must pass for near-eligible
    const distinctSubTypes = new Set(matchingBusinesses.map(b => b.subType));
    if (distinctSubTypes.size < recipe.minSubTypes) continue;

    // For cross-sector, require at least 1 business from each sector (unless skipCrossSectorCheck)
    if (recipe.crossSectorIds && !recipe.skipCrossSectorCheck) {
      const sectorsRepresented = new Set(matchingBusinesses.map(b => b.sectorId));
      const allSectorsPresent = recipe.crossSectorIds.every(s => sectorsRepresented.has(s));
      if (!allSectorsPresent) continue;
    }

    // Custom validator for complex constraints
    if (recipe.customValidator && !recipe.customValidator(matchingBusinesses, existingPlatforms)) continue;

    // Calculate sector EBITDA (all active businesses in relevant sectors)
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

    const scaledThreshold = getScaledThreshold(recipe.baseEbitdaThreshold, difficulty, duration);
    const qualityBlockers = matchingBusinesses.filter(b => b.qualityRating < 3);
    const ebitdaMet = sectorEbitda >= scaledThreshold;
    const qualityMet = qualityBlockers.length === 0;

    // Near-eligible if sub-types match but EBITDA or quality (or both) isn't met
    if (ebitdaMet && qualityMet) continue; // Already fully eligible — skip

    nearEligible.push({
      recipe,
      matchingBusinesses,
      sectorEbitda,
      scaledThreshold,
      qualityBlockers,
    });
  }

  return nearEligible;
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
  round: number,
  selectedBusinesses?: Business[],
): IntegratedPlatform {
  // For multi-forge recipes, derive sectorIds from actual selected businesses
  let sectorIds: SectorId[];
  if (recipe.allowMultipleForges && selectedBusinesses) {
    sectorIds = [...new Set(selectedBusinesses.map(b => b.sectorId))] as SectorId[];
  } else {
    sectorIds = recipe.sectorId ? [recipe.sectorId] : (recipe.crossSectorIds || []);
  }

  // Unique ID: include sector list for multi-forge to avoid collisions
  const idSuffix = recipe.allowMultipleForges ? `_${sectorIds.sort().join('-')}` : '';
  const id = `platform_${recipe.id}_r${round}${idSuffix}`;

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

/**
 * Find active businesses eligible to join an existing forged platform.
 * A business can join if:
 * 1. Not already in any integrated platform
 * 2. In the right sector(s) for the platform's recipe
 * 3. Has a sub-type that matches the recipe's requiredSubTypes
 */
export function getEligibleBusinessesForExistingPlatform(
  platform: IntegratedPlatform,
  businesses: Business[]
): Business[] {
  const recipe = getRecipeById(platform.recipeId);
  if (!recipe) return [];

  return businesses.filter(b => {
    if (b.status !== 'active') return false;
    if (b.integratedPlatformId) return false;
    if (b.qualityRating < 3) return false; // Q3+ required to join platforms
    if (!recipe.requiredSubTypes.includes(b.subType)) return false;
    if (recipe.sectorId) return b.sectorId === recipe.sectorId;
    if (recipe.crossSectorIds) return recipe.crossSectorIds.includes(b.sectorId);
    return false;
  });
}

/**
 * Calculate the integration cost for adding a single business to an existing platform.
 * Cost = recipe.integrationCostFraction × business EBITDA
 */
export function calculateAddToPlatformCost(
  platform: IntegratedPlatform,
  business: Business
): number {
  const recipe = getRecipeById(platform.recipeId);
  if (!recipe) return 0;
  return Math.round(Math.abs(business.ebitda) * recipe.integrationCostFraction);
}

/**
 * Check whether a platform should dissolve after a constituent is removed.
 * Returns true (should dissolve) if the remaining active constituents
 * no longer meet the recipe's minSubTypes requirement, OR if a cross-sector
 * recipe no longer has representation from all required sectors.
 */
export function checkPlatformDissolution(
  platform: IntegratedPlatform,
  remainingBusinesses: Business[]
): boolean {
  const recipe = getRecipeById(platform.recipeId);
  if (!recipe) return true; // Unknown recipe — dissolve

  // Only count active/integrated constituents that are still in the platform
  const constituents = remainingBusinesses.filter(
    b => platform.constituentBusinessIds.includes(b.id) &&
         (b.status === 'active' || b.status === 'integrated')
  );

  const distinctSubTypes = new Set(constituents.map(b => b.subType));
  if (distinctSubTypes.size < recipe.minSubTypes) return true;

  // Cross-sector recipes: verify all required sectors still represented (unless skipCrossSectorCheck)
  if (recipe.crossSectorIds && !recipe.skipCrossSectorCheck) {
    const sectorsRepresented = new Set(constituents.map(b => b.sectorId));
    if (!recipe.crossSectorIds.every(s => sectorsRepresented.has(s))) return true;
  }

  // Custom validator — re-check complex constraints after constituent change
  if (recipe.customValidator && !recipe.customValidator(constituents)) return true;

  return false;
}
