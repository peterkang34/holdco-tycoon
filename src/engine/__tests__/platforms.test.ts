import { describe, it, expect } from 'vitest';
import {
  getIntegrationThresholdMultiplier,
  getScaledThreshold,
  checkPlatformEligibility,
  calculateIntegrationCost,
  forgePlatform,
  getPlatformBonuses,
  getPlatformMultipleExpansion,
  getPlatformRecessionModifier,
  checkPlatformDissolution,
  getEligibleBusinessesForExistingPlatform,
  calculateAddToPlatformCost,
} from '../platforms';
import { PLATFORM_RECIPES } from '../../data/platformRecipes';
import { SECTORS } from '../../data/sectors';
import { createMockBusiness } from './helpers';
import type { IntegratedPlatform, PlatformRecipe, Business } from '../types';

// A minimal recipe for testing
const testRecipe: PlatformRecipe = {
  id: 'test_recipe',
  name: 'Test Platform',
  sectorId: 'agency',
  requiredSubTypes: ['Digital/Ecommerce Agency', 'Performance Media Agency', 'SEO/Content Agency'],
  minSubTypes: 2,
  baseEbitdaThreshold: 5000,
  bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 },
  integrationCostFraction: 0.20,
  description: 'Test platform',
};

const crossSectorRecipe: PlatformRecipe = {
  id: 'test_cross',
  name: 'Cross-Sector Test',
  sectorId: null,
  crossSectorIds: ['insurance', 'wealthManagement'],
  requiredSubTypes: ['P&C Agency', 'Employee Benefits Brokerage', 'Independent RIA', 'Insurance-Based Advisory'],
  minSubTypes: 2,
  baseEbitdaThreshold: 8000,
  bonuses: { marginBoost: 0.05, growthBoost: 0.03, multipleExpansion: 2.0, recessionResistanceReduction: 0.75 },
  integrationCostFraction: 0.25,
  description: 'Cross-sector test',
};

describe('getIntegrationThresholdMultiplier', () => {
  it('returns 1.0 for easy-standard', () => {
    expect(getIntegrationThresholdMultiplier('easy', 'standard')).toBe(1.0);
  });

  it('returns 0.7 for easy-quick', () => {
    expect(getIntegrationThresholdMultiplier('easy', 'quick')).toBe(0.7);
  });

  it('returns 0.7 for normal-standard', () => {
    expect(getIntegrationThresholdMultiplier('normal', 'standard')).toBe(0.7);
  });

  it('returns 0.5 for normal-quick (most accessible)', () => {
    expect(getIntegrationThresholdMultiplier('normal', 'quick')).toBe(0.5);
  });
});

describe('getScaledThreshold', () => {
  it('returns base threshold for easy-standard', () => {
    expect(getScaledThreshold(5000, 'easy', 'standard')).toBe(5000);
  });

  it('scales down for normal-quick', () => {
    expect(getScaledThreshold(5000, 'normal', 'quick')).toBe(2500);
  });

  it('rounds to integer', () => {
    expect(getScaledThreshold(5000, 'easy', 'quick')).toBe(3500);
  });
});

describe('calculateIntegrationCost', () => {
  it('calculates cost as fraction of combined EBITDA', () => {
    const businesses = [
      createMockBusiness({ ebitda: 2000 }),
      createMockBusiness({ id: 'biz_2', ebitda: 3000 }),
    ];
    const cost = calculateIntegrationCost(testRecipe, businesses);
    // 5000 * 0.20 = 1000
    expect(cost).toBe(1000);
  });

  it('rounds to nearest integer', () => {
    const businesses = [
      createMockBusiness({ ebitda: 1333 }),
    ];
    const cost = calculateIntegrationCost(testRecipe, businesses);
    // 1333 * 0.20 = 266.6 → 267
    expect(cost).toBe(267);
  });
});

describe('forgePlatform', () => {
  it('creates a platform with correct properties', () => {
    const businessIds = ['biz_1', 'biz_2'];
    const platform = forgePlatform(testRecipe, businessIds, 5);

    expect(platform.id).toBe('platform_test_recipe_r5');
    expect(platform.recipeId).toBe('test_recipe');
    expect(platform.name).toBe('Test Platform');
    expect(platform.sectorIds).toEqual(['agency']);
    expect(platform.constituentBusinessIds).toEqual(businessIds);
    expect(platform.forgedInRound).toBe(5);
    expect(platform.bonuses).toEqual(testRecipe.bonuses);
  });

  it('uses crossSectorIds for cross-sector recipes', () => {
    const platform = forgePlatform(crossSectorRecipe, ['biz_1', 'biz_2'], 3);
    expect(platform.sectorIds).toEqual(['insurance', 'wealthManagement']);
  });

  it('does not share a reference with the recipe bonuses', () => {
    const platform = forgePlatform(testRecipe, ['biz_1'], 1);
    platform.bonuses.marginBoost = 999;
    expect(testRecipe.bonuses.marginBoost).toBe(0.04);
  });
});

describe('getPlatformBonuses', () => {
  const platform: IntegratedPlatform = {
    id: 'plat_1',
    recipeId: 'test',
    name: 'Test',
    sectorIds: ['agency'],
    constituentBusinessIds: ['biz_1'],
    forgedInRound: 3,
    bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 },
  };

  it('returns bonuses for business with matching platform', () => {
    const biz = createMockBusiness({ integratedPlatformId: 'plat_1' });
    const bonuses = getPlatformBonuses(biz, [platform]);
    expect(bonuses).toEqual(platform.bonuses);
  });

  it('returns null for business without platform', () => {
    const biz = createMockBusiness();
    expect(getPlatformBonuses(biz, [platform])).toBeNull();
  });

  it('returns null when platform ID does not match any platform', () => {
    const biz = createMockBusiness({ integratedPlatformId: 'nonexistent' });
    expect(getPlatformBonuses(biz, [platform])).toBeNull();
  });
});

describe('getPlatformMultipleExpansion', () => {
  const platform: IntegratedPlatform = {
    id: 'plat_1',
    recipeId: 'test',
    name: 'Test',
    sectorIds: ['agency'],
    constituentBusinessIds: ['biz_1'],
    forgedInRound: 3,
    bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 },
  };

  it('returns multipleExpansion for platform business', () => {
    const biz = createMockBusiness({ integratedPlatformId: 'plat_1' });
    expect(getPlatformMultipleExpansion(biz, [platform])).toBe(1.5);
  });

  it('returns 0 for non-platform business', () => {
    const biz = createMockBusiness();
    expect(getPlatformMultipleExpansion(biz, [platform])).toBe(0);
  });
});

describe('getPlatformRecessionModifier', () => {
  const platform: IntegratedPlatform = {
    id: 'plat_1',
    recipeId: 'test',
    name: 'Test',
    sectorIds: ['agency'],
    constituentBusinessIds: ['biz_1'],
    forgedInRound: 3,
    bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 },
  };

  it('returns recession reduction for platform business', () => {
    const biz = createMockBusiness({ integratedPlatformId: 'plat_1' });
    expect(getPlatformRecessionModifier(biz, [platform])).toBe(0.8);
  });

  it('returns 1.0 for non-platform business', () => {
    const biz = createMockBusiness();
    expect(getPlatformRecessionModifier(biz, [platform])).toBe(1.0);
  });
});

describe('checkPlatformEligibility', () => {
  it('returns eligible recipe when businesses meet all criteria', () => {
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', ebitda: 3000 }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Performance Media Agency', ebitda: 3000 }),
    ];

    const results = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const agencyResult = results.find(r => r.recipe.id === 'agency_full_service_digital');
    expect(agencyResult).toBeDefined();
    expect(agencyResult!.eligibleBusinesses).toHaveLength(2);
    expect(agencyResult!.sectorEbitda).toBe(6000);
    expect(agencyResult!.scaledThreshold).toBe(5000);
  });

  it('returns empty when EBITDA threshold not met', () => {
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', ebitda: 1000 }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Performance Media Agency', ebitda: 1000 }),
    ];

    const results = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const agencyResult = results.find(r => r.recipe.id === 'agency_full_service_digital');
    expect(agencyResult).toBeUndefined();
  });

  it('returns empty when not enough distinct sub-types', () => {
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', ebitda: 3000 }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', ebitda: 3000 }),
    ];

    const results = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const agencyResult = results.find(r => r.recipe.id === 'agency_full_service_digital');
    expect(agencyResult).toBeUndefined();
  });

  it('excludes already-forged recipes', () => {
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', ebitda: 3000 }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Performance Media Agency', ebitda: 3000 }),
    ];

    const existingPlatform: IntegratedPlatform = {
      id: 'plat_1',
      recipeId: 'agency_full_service_digital',
      name: 'Full-Service Digital Agency',
      sectorIds: ['agency'],
      constituentBusinessIds: ['biz_old_1', 'biz_old_2'],
      forgedInRound: 2,
      bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 },
    };

    const results = checkPlatformEligibility(businesses, [existingPlatform], 'easy', 'standard');
    const agencyResult = results.find(r => r.recipe.id === 'agency_full_service_digital');
    expect(agencyResult).toBeUndefined();
  });

  it('excludes businesses already part of a platform', () => {
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', ebitda: 3000, integratedPlatformId: 'existing_plat' }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Performance Media Agency', ebitda: 3000 }),
    ];

    const results = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const agencyResult = results.find(r => r.recipe.id === 'agency_full_service_digital');
    // Only 1 distinct sub-type available (biz_1 excluded), so not eligible
    expect(agencyResult).toBeUndefined();
  });

  it('ignores non-active businesses', () => {
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', ebitda: 3000, status: 'sold' }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Performance Media Agency', ebitda: 3000 }),
    ];

    const results = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const agencyResult = results.find(r => r.recipe.id === 'agency_full_service_digital');
    expect(agencyResult).toBeUndefined();
  });

  it('includes integrated (tuck-in) businesses as eligible', () => {
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', ebitda: 3000, status: 'integrated' }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Performance Media Agency', ebitda: 3000, status: 'active' }),
    ];

    const results = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const agencyResult = results.find(r => r.recipe.id === 'agency_full_service_digital');
    expect(agencyResult).toBeDefined();
    expect(agencyResult!.eligibleBusinesses).toHaveLength(2);
  });

  it('uses scaled threshold for normal-quick', () => {
    // Normal-quick = 0.5x multiplier, so 5000 * 0.5 = 2500
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', ebitda: 1500 }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Performance Media Agency', ebitda: 1500 }),
    ];

    // 3000 total > 2500 threshold for normal-quick
    const results = checkPlatformEligibility(businesses, [], 'normal', 'quick');
    const agencyResult = results.find(r => r.recipe.id === 'agency_full_service_digital');
    expect(agencyResult).toBeDefined();
    expect(agencyResult!.scaledThreshold).toBe(2500);
  });

  it('handles cross-sector recipe eligibility', () => {
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'insurance', subType: 'P&C Agency', ebitda: 5000 }),
      createMockBusiness({ id: 'biz_2', sectorId: 'wealthManagement', subType: 'Independent RIA', ebitda: 4000 }),
    ];

    // Easy-standard threshold = 8000, combined sector EBITDA = 9000
    const results = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const crossResult = results.find(r => r.recipe.id === 'cross_financial_services');
    expect(crossResult).toBeDefined();
    expect(crossResult!.eligibleBusinesses).toHaveLength(2);
  });

  it('requires all sectors represented for cross-sector recipes', () => {
    // Both businesses in insurance only — wealthManagement not represented
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'insurance', subType: 'P&C Agency', ebitda: 5000 }),
      createMockBusiness({ id: 'biz_2', sectorId: 'insurance', subType: 'Employee Benefits Brokerage', ebitda: 4000 }),
    ];

    const results = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const crossResult = results.find(r => r.recipe.id === 'cross_financial_services');
    expect(crossResult).toBeUndefined();
  });

  it('sector EBITDA includes all active businesses in sector, not just matching ones', () => {
    // Pest Control doesn't match home_multi_trade, but its EBITDA should count toward sector total
    const businesses: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'homeServices', subType: 'HVAC Services', ebitda: 2000 }),
      createMockBusiness({ id: 'biz_2', sectorId: 'homeServices', subType: 'Plumbing Services', ebitda: 1500 }),
      createMockBusiness({ id: 'biz_3', sectorId: 'homeServices', subType: 'Pest Control', ebitda: 2000 }),
    ];

    const results = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const homeResult = results.find(r => r.recipe.id === 'home_multi_trade');
    expect(homeResult).toBeDefined();
    // Sector EBITDA = 2000 + 1500 + 2000 = 5500 (includes pest control)
    expect(homeResult!.sectorEbitda).toBe(5500);
    // Only HVAC and Plumbing are eligible businesses for the recipe
    expect(homeResult!.eligibleBusinesses).toHaveLength(2);
  });

  it('returns empty when no businesses exist', () => {
    const results = checkPlatformEligibility([], [], 'easy', 'standard');
    expect(results).toEqual([]);
  });
});

// ── Recipe Data Integrity ──

describe('Platform recipe data integrity', () => {
  it('should have exactly 35 recipes (29 within-sector + 6 cross-sector)', () => {
    expect(PLATFORM_RECIPES).toHaveLength(35);
  });

  it('every recipe should have a unique id', () => {
    const ids = PLATFORM_RECIPES.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every within-sector recipe requiredSubTypes should exist in the sector subTypes', () => {
    const withinSector = PLATFORM_RECIPES.filter(r => r.sectorId !== null);
    for (const recipe of withinSector) {
      const sector = SECTORS[recipe.sectorId!];
      expect(sector).toBeDefined();
      for (const subType of recipe.requiredSubTypes) {
        expect(
          sector.subTypes,
          `Recipe "${recipe.id}" requires subType "${subType}" not found in sector "${recipe.sectorId}"`
        ).toContain(subType);
      }
    }
  });

  it('every cross-sector recipe requiredSubTypes should exist in one of the cross-sector subTypes', () => {
    const crossSector = PLATFORM_RECIPES.filter(r => r.sectorId === null);
    for (const recipe of crossSector) {
      expect(recipe.crossSectorIds).toBeDefined();
      const allSubTypes = recipe.crossSectorIds!.flatMap(sid => SECTORS[sid].subTypes);
      for (const subType of recipe.requiredSubTypes) {
        expect(
          allSubTypes,
          `Cross-sector recipe "${recipe.id}" requires subType "${subType}" not found in sectors [${recipe.crossSectorIds}]`
        ).toContain(subType);
      }
    }
  });

  it('minSubTypes should be <= requiredSubTypes.length for every recipe', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(
        recipe.minSubTypes,
        `Recipe "${recipe.id}": minSubTypes (${recipe.minSubTypes}) > requiredSubTypes.length (${recipe.requiredSubTypes.length})`
      ).toBeLessThanOrEqual(recipe.requiredSubTypes.length);
    }
  });

  it('baseEbitdaThreshold should be positive for every recipe', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.baseEbitdaThreshold).toBeGreaterThan(0);
    }
  });

  it('integrationCostFraction should be between 0 and 1 for every recipe', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.integrationCostFraction).toBeGreaterThan(0);
      expect(recipe.integrationCostFraction).toBeLessThanOrEqual(1);
    }
  });

  it('bonus marginBoost should be in range 0-0.10', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.bonuses.marginBoost).toBeGreaterThanOrEqual(0);
      expect(recipe.bonuses.marginBoost).toBeLessThanOrEqual(0.10);
    }
  });

  it('bonus growthBoost should be in range 0-0.10', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.bonuses.growthBoost).toBeGreaterThanOrEqual(0);
      expect(recipe.bonuses.growthBoost).toBeLessThanOrEqual(0.10);
    }
  });

  it('bonus multipleExpansion should be in range 0-3.0', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.bonuses.multipleExpansion).toBeGreaterThanOrEqual(0);
      expect(recipe.bonuses.multipleExpansion).toBeLessThanOrEqual(3.0);
    }
  });

  it('bonus recessionResistanceReduction should be in range 0-1.0', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.bonuses.recessionResistanceReduction).toBeGreaterThan(0);
      expect(recipe.bonuses.recessionResistanceReduction).toBeLessThanOrEqual(1.0);
    }
  });

  it('cross-sector recipes (sectorId: null) must have crossSectorIds defined with >= 2 sectors', () => {
    const crossSector = PLATFORM_RECIPES.filter(r => r.sectorId === null);
    expect(crossSector).toHaveLength(6);
    for (const recipe of crossSector) {
      expect(recipe.crossSectorIds).toBeDefined();
      expect(recipe.crossSectorIds!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('within-sector recipes should have 29 total', () => {
    const withinSector = PLATFORM_RECIPES.filter(r => r.sectorId !== null);
    expect(withinSector).toHaveLength(29);
  });

  it('every recipe should have a non-empty name and description', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.name.length).toBeGreaterThan(0);
      expect(recipe.description.length).toBeGreaterThan(0);
    }
  });
});

// ── checkPlatformDissolution ──

describe('checkPlatformDissolution', () => {
  const platform: IntegratedPlatform = {
    id: 'plat_1',
    recipeId: 'agency_full_service_digital',
    name: 'Full-Service Digital Agency',
    sectorIds: ['agency'],
    constituentBusinessIds: ['biz_1', 'biz_2', 'biz_3'],
    forgedInRound: 3,
    bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 },
  };

  it('returns true (dissolve) when distinct sub-types drop below minSubTypes', () => {
    // agency_full_service_digital requires minSubTypes: 2
    // After selling one, only 1 distinct sub-type remains
    const remaining: Business[] = [
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', status: 'active' }),
      createMockBusiness({ id: 'biz_3', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', status: 'active' }),
    ];
    expect(checkPlatformDissolution(platform, remaining)).toBe(true);
  });

  it('returns false when enough distinct sub-types remain', () => {
    const remaining: Business[] = [
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', status: 'active' }),
      createMockBusiness({ id: 'biz_3', sectorId: 'agency', subType: 'Performance Media Agency', status: 'active' }),
    ];
    expect(checkPlatformDissolution(platform, remaining)).toBe(false);
  });

  it('ignores sold businesses when counting sub-types', () => {
    const remaining: Business[] = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', status: 'sold' }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Performance Media Agency', status: 'active' }),
      createMockBusiness({ id: 'biz_3', sectorId: 'agency', subType: 'SEO/Content Agency', status: 'active' }),
    ];
    // biz_1 is sold so ignored — still 2 active distinct sub-types
    expect(checkPlatformDissolution(platform, remaining)).toBe(false);
  });

  it('returns true when no remaining active constituents', () => {
    expect(checkPlatformDissolution(platform, [])).toBe(true);
  });

  it('returns true for unknown recipe', () => {
    const unknownPlatform: IntegratedPlatform = {
      ...platform,
      recipeId: 'nonexistent_recipe',
    };
    const remaining: Business[] = [
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', status: 'active' }),
    ];
    expect(checkPlatformDissolution(unknownPlatform, remaining)).toBe(true);
  });

  it('counts integrated (tuck-in) businesses as active for dissolution check', () => {
    const remaining: Business[] = [
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', status: 'integrated' }),
      createMockBusiness({ id: 'biz_3', sectorId: 'agency', subType: 'Performance Media Agency', status: 'active' }),
    ];
    expect(checkPlatformDissolution(platform, remaining)).toBe(false);
  });

  it('only counts businesses that are constituents of the platform', () => {
    const remaining: Business[] = [
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', status: 'active' }),
      // biz_99 is NOT in platform.constituentBusinessIds — should not count
      createMockBusiness({ id: 'biz_99', sectorId: 'agency', subType: 'Performance Media Agency', status: 'active' }),
    ];
    // Only biz_2 is a constituent, and it has 1 distinct sub-type < 2 minSubTypes
    expect(checkPlatformDissolution(platform, remaining)).toBe(true);
  });

  it('works with cross-sector platform dissolution', () => {
    const crossPlatform: IntegratedPlatform = {
      id: 'plat_cross',
      recipeId: 'cross_financial_services',
      name: 'Financial Services Hub',
      sectorIds: ['insurance', 'wealthManagement'],
      constituentBusinessIds: ['biz_ins', 'biz_wm'],
      forgedInRound: 5,
      bonuses: { marginBoost: 0.05, growthBoost: 0.03, multipleExpansion: 2.0, recessionResistanceReduction: 0.75 },
    };
    // After selling one, only 1 sub-type remains — below minSubTypes: 2
    const remaining: Business[] = [
      createMockBusiness({ id: 'biz_wm', sectorId: 'wealthManagement', subType: 'Independent RIA', status: 'active' }),
    ];
    expect(checkPlatformDissolution(crossPlatform, remaining)).toBe(true);
  });

  it('edge case: business that is both isPlatform (roll-up) and in integrated platform', () => {
    const remaining: Business[] = [
      createMockBusiness({
        id: 'biz_2',
        sectorId: 'agency',
        subType: 'Digital/Ecommerce Agency',
        status: 'active',
        isPlatform: true,
        platformScale: 2,
        integratedPlatformId: 'plat_1',
      }),
      createMockBusiness({
        id: 'biz_3',
        sectorId: 'agency',
        subType: 'Performance Media Agency',
        status: 'active',
        integratedPlatformId: 'plat_1',
      }),
    ];
    // Still 2 distinct sub-types — platform survives
    expect(checkPlatformDissolution(platform, remaining)).toBe(false);
  });
});

describe('getEligibleBusinessesForExistingPlatform', () => {
  const platform: IntegratedPlatform = {
    id: 'platform_agency_full_service_digital_r3',
    recipeId: 'agency_full_service_digital',
    name: 'Full-Service Digital Agency',
    sectorIds: ['agency'],
    constituentBusinessIds: ['biz_1', 'biz_2'],
    forgedInRound: 3,
    bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 },
  };

  it('returns businesses with matching sector and sub-type that are not already in a platform', () => {
    const businesses = [
      createMockBusiness({ id: 'biz_1', sectorId: 'agency', subType: 'Digital/Ecommerce Agency', integratedPlatformId: platform.id }),
      createMockBusiness({ id: 'biz_2', sectorId: 'agency', subType: 'Performance Media Agency', integratedPlatformId: platform.id }),
      createMockBusiness({ id: 'biz_3', sectorId: 'agency', subType: 'SEO/Content Agency' }),
    ];
    const eligible = getEligibleBusinessesForExistingPlatform(platform, businesses);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('biz_3');
  });

  it('excludes non-active businesses', () => {
    const businesses = [
      createMockBusiness({ id: 'biz_3', sectorId: 'agency', subType: 'SEO/Content Agency', status: 'sold' }),
    ];
    expect(getEligibleBusinessesForExistingPlatform(platform, businesses)).toHaveLength(0);
  });

  it('excludes businesses already in another platform', () => {
    const businesses = [
      createMockBusiness({ id: 'biz_3', sectorId: 'agency', subType: 'SEO/Content Agency', integratedPlatformId: 'other_platform' }),
    ];
    expect(getEligibleBusinessesForExistingPlatform(platform, businesses)).toHaveLength(0);
  });

  it('excludes businesses with non-matching sub-types', () => {
    const businesses = [
      createMockBusiness({ id: 'biz_3', sectorId: 'agency', subType: 'Staffing/Recruiting Agency' }),
    ];
    expect(getEligibleBusinessesForExistingPlatform(platform, businesses)).toHaveLength(0);
  });

  it('excludes businesses from wrong sector', () => {
    const businesses = [
      createMockBusiness({ id: 'biz_3', sectorId: 'saas', subType: 'Digital/Ecommerce Agency' }),
    ];
    expect(getEligibleBusinessesForExistingPlatform(platform, businesses)).toHaveLength(0);
  });
});

describe('calculateAddToPlatformCost', () => {
  const platform: IntegratedPlatform = {
    id: 'platform_agency_full_service_digital_r3',
    recipeId: 'agency_full_service_digital',
    name: 'Full-Service Digital Agency',
    sectorIds: ['agency'],
    constituentBusinessIds: ['biz_1'],
    forgedInRound: 3,
    bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 },
  };

  it('calculates cost as integrationCostFraction × business EBITDA', () => {
    const biz = createMockBusiness({ ebitda: 1000 });
    // agency_full_service_digital has integrationCostFraction: 0.20
    expect(calculateAddToPlatformCost(platform, biz)).toBe(200);
  });

  it('uses absolute EBITDA for negative-EBITDA businesses', () => {
    const biz = createMockBusiness({ ebitda: -500 });
    expect(calculateAddToPlatformCost(platform, biz)).toBe(100);
  });
});

describe('Platform integrity through merge scenarios', () => {
  const platform: IntegratedPlatform = {
    id: 'platform_b2b_integrated_msp_r3',
    recipeId: 'b2b_integrated_msp',
    name: 'Integrated MSP & Cyber Platform',
    sectorIds: ['b2bServices'],
    constituentBusinessIds: ['msp_1', 'data_1'],
    forgedInRound: 3,
    bonuses: { marginBoost: 0.05, growthBoost: 0.03, multipleExpansion: 2.0, recessionResistanceReduction: 0.8 },
  };

  it('dissolution check: merged businesses (status merged) are not counted as valid constituents', () => {
    const remaining = [
      createMockBusiness({ id: 'msp_1', sectorId: 'b2bServices', subType: 'IT Managed Services (MSP)', status: 'merged' as Business['status'] }),
      createMockBusiness({ id: 'data_1', sectorId: 'b2bServices', subType: 'Data / Analytics Services', status: 'merged' as Business['status'] }),
    ];
    expect(checkPlatformDissolution(platform, remaining)).toBe(true);
  });

  it('dissolution check: platform survives when merged business replaces old IDs in constituent list', () => {
    const fixedPlatform = {
      ...platform,
      constituentBusinessIds: ['merged_biz', 'data_1'],
    };
    const remaining = [
      createMockBusiness({ id: 'merged_biz', sectorId: 'b2bServices', subType: 'IT Managed Services (MSP)', status: 'active' }),
      createMockBusiness({ id: 'data_1', sectorId: 'b2bServices', subType: 'Data / Analytics Services', status: 'active' }),
    ];
    expect(checkPlatformDissolution(fixedPlatform, remaining)).toBe(false);
  });

  it('dissolution occurs when merge reduces sub-type diversity below minimum', () => {
    // Both constituents have same sub-type after merge (lost diversity)
    const sameSubTypePlatform = {
      ...platform,
      constituentBusinessIds: ['merged_biz'],
    };
    const remaining = [
      createMockBusiness({ id: 'merged_biz', sectorId: 'b2bServices', subType: 'IT Managed Services (MSP)', status: 'active' }),
    ];
    // Only 1 sub-type, need 2 → dissolve
    expect(checkPlatformDissolution(sameSubTypePlatform, remaining)).toBe(true);
  });
});
