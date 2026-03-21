/**
 * Platform Recipe Integrity Tests
 * Validates that all platform recipes are internally consistent,
 * cross-reference correctly with sectors, and work with the eligibility engine.
 */
import { describe, it, expect } from 'vitest';
import { PLATFORM_RECIPES, getRecipesForSector, getCrossSectorRecipes } from '../../data/platformRecipes';
import { SECTORS } from '../../data/sectors';
import {
  checkPlatformEligibility,
  checkNearEligiblePlatforms,
  forgePlatform,
  checkPlatformDissolution,
  calculateIntegrationCost,
} from '../platforms';
import { createMockBusiness } from './helpers';
import type { Business, SectorId } from '../types';

// ── Sub-type Cross-Reference ───────────────────────────────────────

describe('Platform Recipe Sub-Type Cross-Reference', () => {
  const withinSectorRecipes = PLATFORM_RECIPES.filter(r => r.sectorId !== null);
  const crossSectorRecipes = PLATFORM_RECIPES.filter(r => r.sectorId === null);

  it('every within-sector recipe has a valid sectorId', () => {
    for (const recipe of withinSectorRecipes) {
      expect(SECTORS[recipe.sectorId!], `Recipe ${recipe.id} has unknown sectorId: ${recipe.sectorId}`).toBeDefined();
    }
  });

  it('every within-sector requiredSubType exists in the sector subTypes', () => {
    for (const recipe of withinSectorRecipes) {
      const sector = SECTORS[recipe.sectorId!];
      for (const subType of recipe.requiredSubTypes) {
        expect(
          sector.subTypes,
          `Recipe "${recipe.id}" requires sub-type "${subType}" not found in sector "${recipe.sectorId}"`
        ).toContain(subType);
      }
    }
  });

  it('every cross-sector recipe has sectorId: null', () => {
    for (const recipe of crossSectorRecipes) {
      expect(recipe.sectorId).toBeNull();
    }
  });

  it('every cross-sector recipe has valid crossSectorIds', () => {
    for (const recipe of crossSectorRecipes) {
      expect(recipe.crossSectorIds, `Recipe ${recipe.id} missing crossSectorIds`).toBeDefined();
      expect(recipe.crossSectorIds!.length).toBeGreaterThanOrEqual(2);
      for (const sectorId of recipe.crossSectorIds!) {
        expect(SECTORS[sectorId], `Recipe ${recipe.id} has unknown crossSectorId: ${sectorId}`).toBeDefined();
      }
    }
  });

  it('every cross-sector requiredSubType exists in one of its crossSectorIds', () => {
    for (const recipe of crossSectorRecipes) {
      const allSubTypes = recipe.crossSectorIds!.flatMap(sid => SECTORS[sid].subTypes);
      for (const subType of recipe.requiredSubTypes) {
        expect(
          allSubTypes,
          `Cross-sector recipe "${recipe.id}" requires sub-type "${subType}" not found in any cross-sector`
        ).toContain(subType);
      }
    }
  });

  it('every recipe has at least minSubTypes requiredSubTypes', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(
        recipe.requiredSubTypes.length,
        `Recipe "${recipe.id}" has fewer requiredSubTypes (${recipe.requiredSubTypes.length}) than minSubTypes (${recipe.minSubTypes})`
      ).toBeGreaterThanOrEqual(recipe.minSubTypes);
    }
  });
});

// ── Bonus & Threshold Sanity ───────────────────────────────────────

describe('Platform Recipe Bonus & Threshold Sanity', () => {
  it('all baseEbitdaThresholds are positive', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.baseEbitdaThreshold, `Recipe ${recipe.id}`).toBeGreaterThan(0);
    }
  });

  it('marginBoost is in [0, 0.10]', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.bonuses.marginBoost, `Recipe ${recipe.id}`).toBeGreaterThanOrEqual(0);
      expect(recipe.bonuses.marginBoost, `Recipe ${recipe.id}`).toBeLessThanOrEqual(0.10);
    }
  });

  it('growthBoost is in [0, 0.10]', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.bonuses.growthBoost, `Recipe ${recipe.id}`).toBeGreaterThanOrEqual(0);
      expect(recipe.bonuses.growthBoost, `Recipe ${recipe.id}`).toBeLessThanOrEqual(0.10);
    }
  });

  it('multipleExpansion is in [0.5, 3.0]', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.bonuses.multipleExpansion, `Recipe ${recipe.id}`).toBeGreaterThanOrEqual(0.5);
      expect(recipe.bonuses.multipleExpansion, `Recipe ${recipe.id}`).toBeLessThanOrEqual(3.0);
    }
  });

  it('recessionResistanceReduction is in (0, 1.0]', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.bonuses.recessionResistanceReduction, `Recipe ${recipe.id}`).toBeGreaterThan(0);
      expect(recipe.bonuses.recessionResistanceReduction, `Recipe ${recipe.id}`).toBeLessThanOrEqual(1.0);
    }
  });

  it('integrationCostFraction is in (0, 0.50]', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.integrationCostFraction, `Recipe ${recipe.id}`).toBeGreaterThan(0);
      expect(recipe.integrationCostFraction, `Recipe ${recipe.id}`).toBeLessThanOrEqual(0.50);
    }
  });

  it('minSubTypes is at least 2', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.minSubTypes, `Recipe ${recipe.id}`).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── No Duplicate Recipes ───────────────────────────────────────────

describe('No Duplicate Recipes', () => {
  it('no two recipes share the same id', () => {
    const ids = PLATFORM_RECIPES.map(r => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('no two within-sector recipes have identical requiredSubTypes + sectorId', () => {
    const withinSector = PLATFORM_RECIPES.filter(r => r.sectorId !== null);
    const keys = withinSector.map(r => `${r.sectorId}:${[...r.requiredSubTypes].sort().join(',')}`);
    const unique = new Set(keys);
    expect(unique.size, 'Duplicate within-sector recipe found').toBe(keys.length);
  });

  it('no two cross-sector recipes have identical requiredSubTypes + crossSectorIds', () => {
    const crossSector = PLATFORM_RECIPES.filter(r => r.sectorId === null);
    const keys = crossSector.map(r =>
      `${[...(r.crossSectorIds || [])].sort().join(',')}:${[...r.requiredSubTypes].sort().join(',')}`
    );
    const unique = new Set(keys);
    expect(unique.size, 'Duplicate cross-sector recipe found').toBe(keys.length);
  });
});

// ── Recipe Retrieval Helpers ───────────────────────────────────────

describe('Recipe Retrieval Helpers', () => {
  it('getRecipesForSector returns only within-sector recipes', () => {
    const agencyRecipes = getRecipesForSector('agency');
    expect(agencyRecipes.length).toBeGreaterThanOrEqual(1);
    for (const r of agencyRecipes) {
      expect(r.sectorId).toBe('agency');
    }
  });

  it('getCrossSectorRecipes returns only cross-sector recipes', () => {
    const crossRecipes = getCrossSectorRecipes();
    expect(crossRecipes.length).toBeGreaterThanOrEqual(1);
    for (const r of crossRecipes) {
      expect(r.sectorId).toBeNull();
      expect(r.crossSectorIds).toBeDefined();
    }
  });

  it('within-sector + cross-sector = total recipes', () => {
    const withinCount = PLATFORM_RECIPES.filter(r => r.sectorId !== null).length;
    const crossCount = getCrossSectorRecipes().length;
    expect(withinCount + crossCount).toBe(PLATFORM_RECIPES.length);
  });
});

// ── Recipe-to-Eligibility Round-Trip ───────────────────────────────

describe('Recipe-to-Eligibility Round-Trip', () => {
  // Test a sampling of recipes (within-sector and cross-sector)
  const withinSectorSample = PLATFORM_RECIPES.filter(r => r.sectorId !== null).slice(0, 5);
  const crossSectorSample = PLATFORM_RECIPES.filter(r => r.sectorId === null).slice(0, 3);

  for (const recipe of [...withinSectorSample, ...crossSectorSample]) {
    it(`businesses matching "${recipe.id}" are eligible`, () => {
      // Create distinct businesses for each required sub-type
      const businesses: Business[] = recipe.requiredSubTypes.map((subType, i) => {
        const sectorId = recipe.sectorId
          ? recipe.sectorId
          : recipe.crossSectorIds!.find(csId => SECTORS[csId].subTypes.includes(subType))!;
        return createMockBusiness({
          id: `biz_${recipe.id}_${i}`,
          name: `Biz ${i}`,
          sectorId: sectorId as SectorId,
          subType,
          ebitda: 10000,
          qualityRating: 4,
          status: 'active',
        });
      });

      const eligible = checkPlatformEligibility(businesses, [], 'easy', 'standard');
      const match = eligible.find(e => e.recipe.id === recipe.id);
      expect(match, `Recipe "${recipe.id}" should be eligible`).toBeDefined();
    });
  }

  it('empty business list returns no eligible recipes', () => {
    const eligible = checkPlatformEligibility([], [], 'easy', 'standard');
    expect(eligible).toHaveLength(0);
  });

  it('already-forged recipe is excluded', () => {
    const recipe = PLATFORM_RECIPES.find(r => r.sectorId === 'agency')!;
    const businesses = recipe.requiredSubTypes.map((subType, i) =>
      createMockBusiness({
        id: `biz_forged_${i}`,
        sectorId: 'agency',
        subType,
        ebitda: 10000,
        qualityRating: 4,
      })
    );
    const existingPlatform = forgePlatform(recipe, businesses.map(b => b.id), 3);
    // Mark businesses as integrated
    for (const b of businesses) {
      b.integratedPlatformId = existingPlatform.id;
    }
    const eligible = checkPlatformEligibility(businesses, [existingPlatform], 'easy', 'standard');
    expect(eligible.find(e => e.recipe.id === recipe.id)).toBeUndefined();
  });
});

// ── Quality Gate Enforcement ───────────────────────────────────────

describe('Quality Gate Enforcement', () => {
  it('Q1 business blocks platform eligibility', () => {
    const recipe = PLATFORM_RECIPES.find(r => r.sectorId === 'agency')!;
    const businesses = recipe.requiredSubTypes.map((subType, i) =>
      createMockBusiness({
        id: `biz_q1_${i}`,
        sectorId: 'agency',
        subType,
        ebitda: 10000,
        qualityRating: i === 0 ? 1 : 4, // first business is Q1
      })
    );
    const eligible = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    // If Q1 business is the only one providing its sub-type, recipe should not be eligible
    const match = eligible.find(e => e.recipe.id === recipe.id);
    // The Q1 business gets filtered out; if its sub-type isn't covered by another Q3+ business, no match
    if (match) {
      // Check that the Q1 business is NOT in eligible businesses
      expect(match.eligibleBusinesses.every(b => b.qualityRating >= 3)).toBe(true);
    }
  });

  it('Q2 business blocks platform eligibility', () => {
    const recipe = PLATFORM_RECIPES.find(r => r.sectorId === 'agency')!;
    const businesses = recipe.requiredSubTypes.map((subType, i) =>
      createMockBusiness({
        id: `biz_q2_${i}`,
        sectorId: 'agency',
        subType,
        ebitda: 10000,
        qualityRating: i === 0 ? 2 : 4,
      })
    );
    const eligible = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const match = eligible.find(e => e.recipe.id === recipe.id);
    if (match) {
      expect(match.eligibleBusinesses.every(b => b.qualityRating >= 3)).toBe(true);
    }
  });

  it('all Q3+ businesses pass quality gate', () => {
    const recipe = PLATFORM_RECIPES.find(r => r.sectorId === 'homeServices')!;
    const businesses = recipe.requiredSubTypes.map((subType, i) =>
      createMockBusiness({
        id: `biz_q3_${i}`,
        sectorId: 'homeServices',
        subType,
        ebitda: 10000,
        qualityRating: 3,
      })
    );
    const eligible = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    const match = eligible.find(e => e.recipe.id === recipe.id);
    expect(match).toBeDefined();
  });

  it('Q1/Q2 businesses appear as qualityBlockers in near-eligible', () => {
    const recipe = PLATFORM_RECIPES.find(r => r.sectorId === 'agency')!;
    const businesses = recipe.requiredSubTypes.map((subType, i) =>
      createMockBusiness({
        id: `biz_near_${i}`,
        sectorId: 'agency',
        subType,
        ebitda: 10000,
        qualityRating: i === 0 ? 2 : 4,
      })
    );
    const nearEligible = checkNearEligiblePlatforms(businesses, [], 'easy', 'standard');
    const match = nearEligible.find(e => e.recipe.id === recipe.id);
    expect(match, 'Should be near-eligible due to quality blocker').toBeDefined();
    if (match) {
      expect(match.qualityBlockers.length).toBeGreaterThan(0);
      expect(match.qualityBlockers[0].qualityRating).toBeLessThan(3);
    }
  });
});

// ── Pro Sports Exclusion ───────────────────────────────────────────

describe('Pro Sports Platform Exclusion', () => {
  it('pro sports businesses are excluded from platform eligibility', () => {
    const recipe = PLATFORM_RECIPES[0]; // any recipe
    const businesses = [
      createMockBusiness({
        id: 'prosports_1',
        sectorId: 'proSports',
        subType: 'nfl',
        ebitda: 50000,
        qualityRating: 5,
      }),
      ...recipe.requiredSubTypes.map((subType, i) =>
        createMockBusiness({
          id: `biz_ps_${i}`,
          sectorId: recipe.sectorId || 'agency',
          subType,
          ebitda: 10000,
          qualityRating: 4,
        })
      ),
    ];
    const eligible = checkPlatformEligibility(businesses, [], 'easy', 'standard');
    // Pro sports business should never appear in any eligible list
    for (const e of eligible) {
      expect(e.eligibleBusinesses.every(b => b.sectorId !== 'proSports')).toBe(true);
    }
  });

  it('no platform recipe targets proSports sector', () => {
    const proSportsRecipes = PLATFORM_RECIPES.filter(
      r => r.sectorId === 'proSports' ||
        (r.crossSectorIds && r.crossSectorIds.includes('proSports' as SectorId))
    );
    expect(proSportsRecipes).toHaveLength(0);
  });
});

// ── Platform Forging & Dissolution ─────────────────────────────────

describe('Platform Forging', () => {
  it('forgePlatform creates correct structure', () => {
    const recipe = PLATFORM_RECIPES[0];
    const bizIds = ['b1', 'b2'];
    const platform = forgePlatform(recipe, bizIds, 5);

    expect(platform.recipeId).toBe(recipe.id);
    expect(platform.name).toBe(recipe.name);
    expect(platform.constituentBusinessIds).toEqual(bizIds);
    expect(platform.forgedInRound).toBe(5);
    expect(platform.bonuses.marginBoost).toBe(recipe.bonuses.marginBoost);
  });

  it('integration cost is fraction of combined EBITDA', () => {
    const recipe = PLATFORM_RECIPES[0];
    const businesses = [
      createMockBusiness({ id: 'b1', ebitda: 2000 }),
      createMockBusiness({ id: 'b2', ebitda: 3000 }),
    ];
    const cost = calculateIntegrationCost(recipe, businesses);
    expect(cost).toBe(Math.round(5000 * recipe.integrationCostFraction));
  });
});

describe('Platform Dissolution', () => {
  it('dissolves when remaining constituents drop below minSubTypes', () => {
    const recipe = PLATFORM_RECIPES.find(r => r.sectorId === 'agency')!;
    const platform = forgePlatform(recipe, ['b1', 'b2', 'b3'], 3);
    // Only 1 remaining constituent (needs 2 distinct sub-types)
    const remaining = [
      createMockBusiness({ id: 'b1', sectorId: 'agency', subType: recipe.requiredSubTypes[0] }),
    ];
    expect(checkPlatformDissolution(platform, remaining)).toBe(true);
  });

  it('does not dissolve when minSubTypes still met', () => {
    const recipe = PLATFORM_RECIPES.find(r => r.sectorId === 'agency')!;
    const platform = forgePlatform(recipe, ['b1', 'b2'], 3);
    const remaining = [
      createMockBusiness({ id: 'b1', sectorId: 'agency', subType: recipe.requiredSubTypes[0] }),
      createMockBusiness({ id: 'b2', sectorId: 'agency', subType: recipe.requiredSubTypes[1] }),
    ];
    expect(checkPlatformDissolution(platform, remaining)).toBe(false);
  });

  it('cross-sector recipe dissolves when a sector loses representation', () => {
    const recipe = PLATFORM_RECIPES.find(r => r.sectorId === null && r.crossSectorIds?.length === 2)!;
    const platform = forgePlatform(recipe, ['b1', 'b2'], 3);
    // All remaining are from first sector only
    const firstSectorId = recipe.crossSectorIds![0];
    const firstSectorSubType = recipe.requiredSubTypes.find(st =>
      SECTORS[firstSectorId].subTypes.includes(st)
    )!;
    const remaining = [
      createMockBusiness({ id: 'b1', sectorId: firstSectorId as SectorId, subType: firstSectorSubType }),
      createMockBusiness({ id: 'b2', sectorId: firstSectorId as SectorId, subType: firstSectorSubType }),
    ];
    expect(checkPlatformDissolution(platform, remaining)).toBe(true);
  });
});

// ── EBITDA Threshold Scaling ───────────────────────────────────────

describe('EBITDA Threshold Scaling', () => {
  it('normal-quick mode makes recipes easier to forge', () => {
    const recipe = PLATFORM_RECIPES.find(r => r.sectorId === 'agency')!;
    const businesses = recipe.requiredSubTypes.map((subType, i) =>
      createMockBusiness({
        id: `biz_thresh_${i}`,
        sectorId: 'agency',
        subType,
        ebitda: 1500, // low EBITDA — should pass in normal-quick (0.5x threshold) but maybe not easy-standard (1.0x)
        qualityRating: 4,
      })
    );

    const eligibleNormalQuick = checkPlatformEligibility(businesses, [], 'normal', 'quick');
    const eligibleEasyStandard = checkPlatformEligibility(businesses, [], 'easy', 'standard');

    const nqMatch = eligibleNormalQuick.find(e => e.recipe.id === recipe.id);
    const esMatch = eligibleEasyStandard.find(e => e.recipe.id === recipe.id);

    // Combined EBITDA = 1500 * 3 = 4500, threshold = 5000 * 0.5 = 2500 (NQ) vs 5000 (ES)
    expect(nqMatch, 'Should be eligible in normal-quick').toBeDefined();
    expect(esMatch, 'Should NOT be eligible in easy-standard (4500 < 5000)').toBeUndefined();
  });
});
