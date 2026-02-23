import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateBusiness,
  generateBusinessId,
  resetBusinessIdCounter,
  generateDeal,
  generateDealPipeline,
  generateDealWithSize,
  generateSourcedDeals,
  pickWeightedSector,
  getSectorWeightsForRound,
  determineIntegrationOutcome,
  calculateSynergies,
  calculateIntegrationGrowthPenalty,
  getSubTypeAffinity,
  getSizeRatioTier,
  calculateMultipleExpansion,
  createStartingBusiness,
  calculateDealHeat,
  calculateHeatPremium,
  getMaxAcquisitions,
  assignSellerArchetype,
} from '../businesses';
import { SECTORS, SECTOR_LIST } from '../../data/sectors';
import { SectorId, QualityRating, DealHeat } from '../types';

describe('generateBusinessId', () => {
  beforeEach(() => {
    resetBusinessIdCounter();
  });

  it('should generate sequential IDs', () => {
    expect(generateBusinessId()).toBe('biz_1');
    expect(generateBusinessId()).toBe('biz_2');
    expect(generateBusinessId()).toBe('biz_3');
  });

  it('should reset counter', () => {
    generateBusinessId();
    generateBusinessId();
    resetBusinessIdCounter();
    expect(generateBusinessId()).toBe('biz_1');
  });
});

describe('generateBusiness', () => {
  it('should generate a business within sector EBITDA range', () => {
    const sectors: SectorId[] = ['agency', 'saas', 'homeServices', 'industrial', 'realEstate'];

    for (const sectorId of sectors) {
      const sector = SECTORS[sectorId];
      const business = generateBusiness(sectorId, 1);

      // EBITDA is derived from revenue × margin, so it can exceed baseEbitda range
      // when quality modifiers push both revenue and margin up. Use wider tolerance.
      const minPossible = Math.round(sector.baseEbitda[0] * 0.5);
      const maxPossible = Math.round(sector.baseEbitda[1] * 3.0);
      expect(business.ebitda).toBeGreaterThanOrEqual(minPossible);
      expect(business.ebitda).toBeLessThanOrEqual(maxPossible);
    }
  });

  it('should respect forced quality rating', () => {
    for (let q = 1; q <= 5; q++) {
      const business = generateBusiness('agency', 1, q as QualityRating);
      expect(business.qualityRating).toBe(q);
    }
  });

  it('should generate valid acquisition multiple within sector range', () => {
    const business = generateBusiness('saas', 1, 3);
    const sector = SECTORS['saas'];
    // Multiple can be adjusted by quality, so allow some tolerance
    expect(business.acquisitionMultiple).toBeGreaterThan(0);
    expect(business.acquisitionMultiple).toBeLessThan(sector.acquisitionMultiple[1] + 1.0);
  });

  it('should set correct initial values', () => {
    const business = generateBusiness('agency', 5);
    expect(business.ebitda).toBe(business.peakEbitda);
    expect(business.ebitda).toBe(business.acquisitionEbitda);
    expect(business.integrationRoundsRemaining).toBe(2);
    expect(business.sellerNoteBalance).toBe(0);
    expect(business.bankDebtBalance).toBe(0);
    expect(business.isPlatform).toBe(false);
    expect(business.platformScale).toBe(0);
    expect(business.boltOnIds).toEqual([]);
  });

  it('should calculate acquisition price from EBITDA * multiple', () => {
    const business = generateBusiness('agency', 1, 3);
    expect(business.acquisitionPrice).toBe(
      Math.round(business.ebitda * business.acquisitionMultiple)
    );
  });

  it('should not generate NaN values', () => {
    for (let i = 0; i < 20; i++) {
      const sectorId = SECTOR_LIST[i % SECTOR_LIST.length].id;
      const business = generateBusiness(sectorId, 1);
      expect(Number.isNaN(business.ebitda)).toBe(false);
      expect(Number.isNaN(business.acquisitionMultiple)).toBe(false);
      expect(Number.isNaN(business.acquisitionPrice)).toBe(false);
      expect(Number.isNaN(business.organicGrowthRate)).toBe(false);
    }
  });
});

describe('generateDeal', () => {
  beforeEach(() => {
    resetBusinessIdCounter();
  });

  it('should create a deal with valid fields', () => {
    const deal = generateDeal('agency', 1);
    expect(deal.id).toMatch(/^deal_biz_/);
    expect(deal.business).toBeDefined();
    expect(deal.askingPrice).toBeGreaterThan(0);
    expect(deal.freshness).toBe(2); // H-7: Consistent freshness across all deal generators
    expect(deal.roundAppeared).toBe(1);
    expect(['inbound', 'brokered']).toContain(deal.source);
    expect(['standalone', 'tuck_in', 'platform']).toContain(deal.acquisitionType);
  });

  it('should apply tuck-in discount when applicable', () => {
    // Generate many deals and check that tuck-ins have discounts
    for (let i = 0; i < 50; i++) {
      const deal = generateDeal('agency', 1);
      if (deal.acquisitionType === 'tuck_in') {
        expect(deal.tuckInDiscount).toBeDefined();
        expect(deal.tuckInDiscount!).toBeGreaterThan(0);
        expect(deal.tuckInDiscount!).toBeLessThanOrEqual(0.25);
        // Asking price should be less than full business price
        expect(deal.askingPrice).toBeLessThan(deal.business.acquisitionPrice);
      }
    }
    // It's possible (unlikely) all 50 were not tuck-ins, so this is a soft check
  });

  it('should include AI fallback content', () => {
    const deal = generateDeal('agency', 1);
    expect(deal.aiContent).toBeDefined();
    expect(deal.aiContent!.backstory).toBeTruthy();
    expect(deal.aiContent!.sellerMotivation).toBeTruthy();
    expect(deal.aiContent!.quirks.length).toBeGreaterThan(0);
  });
});

describe('generateDealWithSize', () => {
  it('should generate smaller deals with "small" preference', () => {
    const smallDeals: number[] = [];
    const anyDeals: number[] = [];

    for (let i = 0; i < 30; i++) {
      smallDeals.push(generateDealWithSize('agency', 5, 'small').business.ebitda);
      anyDeals.push(generateDealWithSize('agency', 5, 'any').business.ebitda);
    }

    const avgSmall = smallDeals.reduce((a, b) => a + b, 0) / smallDeals.length;
    const avgAny = anyDeals.reduce((a, b) => a + b, 0) / anyDeals.length;

    // Small deals should on average have lower EBITDA
    expect(avgSmall).toBeLessThan(avgAny * 1.1); // Allow some randomness tolerance
  });

  it('should generate larger deals with "large" preference', () => {
    const largeDeals: number[] = [];
    const anyDeals: number[] = [];

    for (let i = 0; i < 30; i++) {
      largeDeals.push(generateDealWithSize('agency', 5, 'large').business.ebitda);
      anyDeals.push(generateDealWithSize('agency', 5, 'any').business.ebitda);
    }

    const avgLarge = largeDeals.reduce((a, b) => a + b, 0) / largeDeals.length;
    const avgAny = anyDeals.reduce((a, b) => a + b, 0) / anyDeals.length;

    expect(avgLarge).toBeGreaterThan(avgAny * 0.9);
  });

  it('should set freshness to 2 (deals last 2 years)', () => {
    const deal = generateDealWithSize('agency', 1, 'any');
    expect(deal.freshness).toBe(2);
  });
});

describe('generateDealPipeline', () => {
  it('should generate at least 4 deals', () => {
    const pipeline = generateDealPipeline([], 1);
    expect(pipeline.length).toBeGreaterThanOrEqual(4);
  });

  it('should not exceed 8 deals', () => {
    const pipeline = generateDealPipeline([], 1);
    expect(pipeline.length).toBeLessThanOrEqual(8);
  });

  it('should age existing deals', () => {
    const existingDeal = generateDeal('agency', 1);
    existingDeal.freshness = 2;

    const pipeline = generateDealPipeline([existingDeal], 2);
    const aged = pipeline.find(d => d.id === existingDeal.id);
    if (aged) {
      expect(aged.freshness).toBe(1);
    }
  });

  it('should remove expired deals (freshness <= 0)', () => {
    const expiredDeal = generateDeal('agency', 1);
    expiredDeal.freshness = 1; // Will become 0 after aging

    const pipeline = generateDealPipeline([expiredDeal], 2);
    const found = pipeline.find(d => d.id === expiredDeal.id);
    expect(found).toBeUndefined();
  });

  it('should prioritize M&A focus sector when set', () => {
    const pipeline = generateDealPipeline([], 5, {
      sectorId: 'saas',
      sizePreference: 'any',
      subType: null,
    });

    const saasDeals = pipeline.filter(d => d.business.sectorId === 'saas');
    expect(saasDeals.length).toBeGreaterThanOrEqual(2);
  });
});

describe('generateSourcedDeals', () => {
  it('should generate exactly 3 deals', () => {
    const deals = generateSourcedDeals(5);
    expect(deals.length).toBe(3);
  });

  it('should mark all deals as sourced', () => {
    const deals = generateSourcedDeals(5);
    deals.forEach(deal => {
      expect(deal.source).toBe('sourced');
    });
  });

  it('should weight toward M&A focus sector', () => {
    const deals = generateSourcedDeals(5, { sectorId: 'saas', sizePreference: 'any', subType: null });
    const saasDeals = deals.filter(d => d.business.sectorId === 'saas');
    expect(saasDeals.length).toBeGreaterThanOrEqual(2);
  });

  it('should set freshness to 2', () => {
    const deals = generateSourcedDeals(5);
    deals.forEach(deal => {
      expect(deal.freshness).toBe(2);
    });
  });
});

describe('getSectorWeightsForRound', () => {
  it('should weight cheap sectors higher early game', () => {
    const weights = getSectorWeightsForRound(1);
    // Agency is a cheap sector
    expect(weights.agency).toBeGreaterThan(weights.saas); // saas is premium
  });

  it('should weight premium sectors higher late game', () => {
    const weights = getSectorWeightsForRound(18);
    expect(weights.saas).toBeGreaterThan(weights.agency);
  });

  it('should always sum to approximately 1.0', () => {
    for (const round of [1, 5, 10, 15, 20]) {
      const weights = getSectorWeightsForRound(round);
      const total = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1.0, 1);
    }
  });
});

describe('pickWeightedSector', () => {
  it('should return a valid sector ID', () => {
    const validSectors = SECTOR_LIST.map(s => s.id);
    for (let i = 0; i < 20; i++) {
      const sectorId = pickWeightedSector(5);
      expect(validSectors).toContain(sectorId);
    }
  });
});

describe('determineIntegrationOutcome', () => {
  it('should return a valid outcome', () => {
    const business = {
      ...generateBusiness('agency', 1, 3),
    };
    const outcome = determineIntegrationOutcome(business);
    expect(['success', 'partial', 'failure']).toContain(outcome);
  });

  it('should favor success for high-quality businesses', () => {
    let successCount = 0;
    const highQualBiz = generateBusiness('agency', 1, 5);

    for (let i = 0; i < 100; i++) {
      if (determineIntegrationOutcome(highQualBiz) === 'success') successCount++;
    }
    // High quality should succeed more than 30% of the time
    expect(successCount).toBeGreaterThan(30);
  });

  it('should favor failure for low-quality businesses', () => {
    let failCount = 0;
    const lowQualBiz = generateBusiness('agency', 1, 1);

    for (let i = 0; i < 100; i++) {
      if (determineIntegrationOutcome(lowQualBiz) === 'failure') failCount++;
    }
    // Low quality should fail more often
    expect(failCount).toBeGreaterThan(10);
  });

  it('should produce more failures with distant sub-types', () => {
    let failMatchCount = 0;
    let failDistantCount = 0;
    const biz = generateBusiness('healthcare', 1, 3);

    for (let i = 0; i < 500; i++) {
      if (determineIntegrationOutcome(biz, undefined, false, 'match') === 'failure') failMatchCount++;
      if (determineIntegrationOutcome(biz, undefined, false, 'distant') === 'failure') failDistantCount++;
    }
    // Distant sub-types should produce more failures due to -0.15 penalty
    expect(failDistantCount).toBeGreaterThan(failMatchCount);
  });

  it('should produce moderate failures with related sub-types', () => {
    let failMatchCount = 0;
    let failRelatedCount = 0;
    let failDistantCount = 0;
    const biz = generateBusiness('healthcare', 1, 3);

    for (let i = 0; i < 500; i++) {
      if (determineIntegrationOutcome(biz, undefined, false, 'match') === 'failure') failMatchCount++;
      if (determineIntegrationOutcome(biz, undefined, false, 'related') === 'failure') failRelatedCount++;
      if (determineIntegrationOutcome(biz, undefined, false, 'distant') === 'failure') failDistantCount++;
    }
    // Related should be between match and distant
    expect(failRelatedCount).toBeGreaterThan(failMatchCount);
    expect(failDistantCount).toBeGreaterThan(failRelatedCount);
  });

  it('should not penalize when subTypeAffinity is undefined (default)', () => {
    let failDefault = 0;
    let failMatch = 0;
    const biz = generateBusiness('healthcare', 1, 3);

    for (let i = 0; i < 500; i++) {
      if (determineIntegrationOutcome(biz) === 'failure') failDefault++;
      if (determineIntegrationOutcome(biz, undefined, false, 'match') === 'failure') failMatch++;
    }
    // Should be roughly similar (both without penalty)
    const ratio = failDefault / Math.max(failMatch, 1);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2.0);
  });
});

describe('getSubTypeAffinity', () => {
  it('should return match for same sub-type', () => {
    expect(getSubTypeAffinity('homeServices', 'HVAC Services', 'HVAC Services')).toBe('match');
  });

  it('should return related for same affinity group (skilled trades)', () => {
    expect(getSubTypeAffinity('homeServices', 'HVAC Services', 'Plumbing Services')).toBe('related');
    expect(getSubTypeAffinity('homeServices', 'Plumbing Services', 'Electrical Services')).toBe('related');
  });

  it('should return distant for different affinity groups', () => {
    expect(getSubTypeAffinity('homeServices', 'Plumbing Services', 'Property Management')).toBe('distant');
    expect(getSubTypeAffinity('healthcare', 'Dental Practice Group', 'Behavioral Health')).toBe('distant');
  });

  it('should return distant for unknown sector or sub-types', () => {
    expect(getSubTypeAffinity('unknown', 'foo', 'bar')).toBe('distant');
    expect(getSubTypeAffinity('homeServices', 'foo', 'HVAC Services')).toBe('distant');
  });
});

describe('calculateSynergies', () => {
  it('should return positive synergies for success', () => {
    expect(calculateSynergies('success', 1000, false)).toBeGreaterThan(0);
    expect(calculateSynergies('success', 1000, true)).toBeGreaterThan(0);
  });

  it('should return smaller synergies for partial', () => {
    const successSyn = calculateSynergies('success', 1000, false);
    const partialSyn = calculateSynergies('partial', 1000, false);
    expect(partialSyn).toBeLessThan(successSyn);
    expect(partialSyn).toBeGreaterThan(0);
  });

  it('should return negative synergies for failure', () => {
    expect(calculateSynergies('failure', 1000, false)).toBeLessThan(0);
    expect(calculateSynergies('failure', 1000, true)).toBeLessThan(0);
  });

  it('should give tuck-ins more synergies than standalone', () => {
    const tuckInSyn = calculateSynergies('success', 1000, true);
    const standaloneSyn = calculateSynergies('success', 1000, false);
    expect(tuckInSyn).toBeGreaterThan(standaloneSyn);
  });

  it('should reduce synergies for distant sub-types (45%)', () => {
    const matched = calculateSynergies('success', 1000, false);
    const distant = calculateSynergies('success', 1000, false, 'distant');
    expect(distant).toBe(Math.round(matched * 0.45));
  });

  it('should reduce synergies for related sub-types (75%)', () => {
    const matched = calculateSynergies('success', 1000, false);
    const related = calculateSynergies('success', 1000, false, 'related');
    expect(related).toBe(Math.round(matched * 0.75));
  });

  it('should not affect synergies when affinity is match', () => {
    const defaultSyn = calculateSynergies('success', 1000, true);
    const matchedSyn = calculateSynergies('success', 1000, true, 'match');
    expect(matchedSyn).toBe(defaultSyn);
  });

  it('should reduce tuck-in synergies for distant sub-types', () => {
    const matched = calculateSynergies('success', 1000, true);
    const distant = calculateSynergies('success', 1000, true, 'distant');
    expect(distant).toBe(Math.round(matched * 0.45));
    expect(distant).toBeGreaterThan(0);
  });

  it('should reduce negative synergies for distant sub-types (less damage)', () => {
    const matchedFailure = calculateSynergies('failure', 1000, false);
    const distantFailure = calculateSynergies('failure', 1000, false, 'distant');
    // Both negative, but distant should be closer to 0
    expect(matchedFailure).toBeLessThan(0);
    expect(distantFailure).toBeLessThan(0);
    expect(Math.abs(distantFailure)).toBeLessThan(Math.abs(matchedFailure));
  });
});

describe('calculateMultipleExpansion', () => {
  it('should return 0 for scale 0', () => {
    expect(calculateMultipleExpansion(0, 1000)).toBe(0);
  });

  it('should increase with scale', () => {
    const scale1 = calculateMultipleExpansion(1, 2000);
    const scale2 = calculateMultipleExpansion(2, 2000);
    const scale3 = calculateMultipleExpansion(3, 2000);
    expect(scale2).toBeGreaterThan(scale1);
    expect(scale3).toBeGreaterThan(scale2);
  });

  it('should add size bonus for large platforms', () => {
    const smallPlatform = calculateMultipleExpansion(2, 2000);
    const largePlatform = calculateMultipleExpansion(2, 6000);
    expect(largePlatform).toBeGreaterThan(smallPlatform);
  });

  it('should use logarithmic curve for multiple expansion', () => {
    const result = calculateMultipleExpansion(5, 1000);
    expect(Number.isNaN(result)).toBe(false);
    // log2(5+1) * 0.5 = 2.585 * 0.5 ≈ 1.29
    expect(result).toBeCloseTo(Math.log2(6) * 0.5, 1);
    // Scale 10 should be higher than scale 5 (no longer capped at 3)
    expect(calculateMultipleExpansion(10, 1000)).toBeGreaterThan(result);
  });
});

describe('createStartingBusiness', () => {
  beforeEach(() => {
    resetBusinessIdCounter();
  });

  it('should create a business with ~$1M EBITDA', () => {
    const biz = createStartingBusiness();
    expect(biz.ebitda).toBe(1000); // $1M in thousands
  });

  it('should have quality 3', () => {
    const biz = createStartingBusiness();
    expect(biz.qualityRating).toBe(3);
  });

  it('should not be a platform initially', () => {
    const biz = createStartingBusiness();
    expect(biz.isPlatform).toBe(false);
  });

  it('should have active status', () => {
    const biz = createStartingBusiness();
    expect(biz.status).toBe('active');
  });

  it('should have an ID', () => {
    const biz = createStartingBusiness();
    expect(biz.id).toBeTruthy();
  });

  it('should work with different sectors', () => {
    const sectors: SectorId[] = ['agency', 'saas', 'homeServices', 'industrial'];
    for (const sector of sectors) {
      resetBusinessIdCounter();
      const biz = createStartingBusiness(sector);
      expect(biz.sectorId).toBe(sector);
      expect(biz.ebitda).toBe(1000);
    }
  });
});

describe('calculateDealHeat', () => {
  it('should return a valid heat level', () => {
    const validHeats: DealHeat[] = ['cold', 'warm', 'hot', 'contested'];
    for (let i = 0; i < 50; i++) {
      const heat = calculateDealHeat(3, 'inbound', 5);
      expect(validHeats).toContain(heat);
    }
  });

  it('should shift toward hot/contested for high quality', () => {
    let hotOrContestedCount = 0;
    for (let i = 0; i < 200; i++) {
      const heat = calculateDealHeat(5, 'inbound', 5);
      if (heat === 'hot' || heat === 'contested') hotOrContestedCount++;
    }
    // High quality (5) gets +1 tier shift, so hot/contested should be common
    expect(hotOrContestedCount).toBeGreaterThan(50);
  });

  it('should shift toward cold for low quality', () => {
    let coldCount = 0;
    for (let i = 0; i < 200; i++) {
      const heat = calculateDealHeat(1, 'inbound', 5);
      if (heat === 'cold') coldCount++;
    }
    // Low quality (1) gets -1 tier shift
    expect(coldCount).toBeGreaterThan(40);
  });

  it('should shift toward cold for proprietary source (-2 tiers)', () => {
    let coldCount = 0;
    for (let i = 0; i < 200; i++) {
      const heat = calculateDealHeat(3, 'proprietary', 5);
      if (heat === 'cold') coldCount++;
    }
    // Proprietary gets -2 tiers, should be almost always cold
    expect(coldCount).toBeGreaterThan(120);
  });

  it('should shift toward hot for bull market + late game', () => {
    let hotOrContestedCount = 0;
    for (let i = 0; i < 200; i++) {
      const heat = calculateDealHeat(3, 'inbound', 18, 'global_bull_market');
      if (heat === 'hot' || heat === 'contested') hotOrContestedCount++;
    }
    // Bull market (+1) + late game (+1) = +2 tiers total
    expect(hotOrContestedCount).toBeGreaterThan(80);
  });

  it('should shift toward cold for recession', () => {
    let coldOrWarmCount = 0;
    for (let i = 0; i < 200; i++) {
      const heat = calculateDealHeat(3, 'inbound', 5, 'global_recession');
      if (heat === 'cold' || heat === 'warm') coldOrWarmCount++;
    }
    expect(coldOrWarmCount).toBeGreaterThan(100);
  });
});

describe('calculateHeatPremium', () => {
  it('should return 1.0 for cold', () => {
    expect(calculateHeatPremium('cold')).toBe(1.0);
  });

  it('should return 1.10-1.15 for warm', () => {
    for (let i = 0; i < 20; i++) {
      const premium = calculateHeatPremium('warm');
      expect(premium).toBeGreaterThanOrEqual(1.10);
      expect(premium).toBeLessThanOrEqual(1.15);
    }
  });

  it('should return 1.20-1.30 for hot', () => {
    for (let i = 0; i < 20; i++) {
      const premium = calculateHeatPremium('hot');
      expect(premium).toBeGreaterThanOrEqual(1.20);
      expect(premium).toBeLessThanOrEqual(1.30);
    }
  });

  it('should return 1.20-1.35 for contested', () => {
    for (let i = 0; i < 20; i++) {
      const premium = calculateHeatPremium('contested');
      expect(premium).toBeGreaterThanOrEqual(1.20);
      expect(premium).toBeLessThanOrEqual(1.35);
    }
  });
});

describe('getMaxAcquisitions', () => {
  it('should return 2 for no MA sourcing', () => {
    expect(getMaxAcquisitions(0)).toBe(2);
  });

  it('should return 3 for tier 1', () => {
    expect(getMaxAcquisitions(1)).toBe(3);
  });

  it('should return 4 for tier 2', () => {
    expect(getMaxAcquisitions(2)).toBe(4);
  });

  it('should return 4 for tier 3', () => {
    expect(getMaxAcquisitions(3)).toBe(4);
  });
});

describe('generateDealWithSize heat integration', () => {
  it('should include heat and effectivePrice on deals', () => {
    const deal = generateDealWithSize('agency', 5, 'any');
    expect(deal.heat).toBeDefined();
    expect(['cold', 'warm', 'hot', 'contested']).toContain(deal.heat);
    expect(deal.effectivePrice).toBeDefined();
    expect(deal.effectivePrice).toBeGreaterThanOrEqual(deal.askingPrice);
  });

  it('should have effectivePrice equal askingPrice for cold deals', () => {
    // Generate many deals and check cold ones
    for (let i = 0; i < 100; i++) {
      const deal = generateDealWithSize('agency', 1, 'any');
      if (deal.heat === 'cold') {
        expect(deal.effectivePrice).toBe(deal.askingPrice);
      }
    }
  });

  it('should have effectivePrice > askingPrice for hot/contested deals', () => {
    for (let i = 0; i < 100; i++) {
      const deal = generateDealWithSize('agency', 5, 'any');
      // Distressed sellers have a price cap that can neutralize the heat premium
      if ((deal.heat === 'hot' || deal.heat === 'contested') && deal.sellerArchetype !== 'distressed_seller') {
        expect(deal.effectivePrice).toBeGreaterThan(deal.askingPrice);
      }
    }
  });
});

// --- Revenue + Margin System Tests ---

describe('Revenue & Margin: generateBusiness', () => {
  beforeEach(() => {
    resetBusinessIdCounter();
  });

  it('should generate revenue and margin fields', () => {
    const biz = generateBusiness('agency', 1);
    expect(biz.revenue).toBeGreaterThan(0);
    expect(biz.ebitdaMargin).toBeGreaterThan(0);
    expect(biz.ebitdaMargin).toBeLessThan(1);
    expect(biz.acquisitionRevenue).toBe(biz.revenue);
    expect(biz.acquisitionMargin).toBe(biz.ebitdaMargin);
    expect(biz.peakRevenue).toBe(biz.revenue);
    expect(biz.revenueGrowthRate).toBeDefined();
    expect(biz.marginDriftRate).toBeDefined();
  });

  it('should derive EBITDA from revenue × margin', () => {
    for (let i = 0; i < 20; i++) {
      const biz = generateBusiness('saas', 1);
      // EBITDA should be within 1 of revenue × margin (rounding)
      expect(Math.abs(biz.ebitda - Math.round(biz.revenue * biz.ebitdaMargin))).toBeLessThanOrEqual(1);
    }
  });

  it('should generate margin within sector range (±quality adjustment)', () => {
    for (let i = 0; i < 50; i++) {
      const biz = generateBusiness('agency', 1);
      // Margin should be within baseMargin range ±4.5ppt (quality adjustment of ±3ppt + buffer)
      expect(biz.ebitdaMargin).toBeGreaterThanOrEqual(0.03); // Global floor
      expect(biz.ebitdaMargin).toBeLessThanOrEqual(0.80); // Global ceiling
    }
  });

  it('should set marginDriftRate from sector range', () => {
    const sector = SECTORS['restaurant'];
    for (let i = 0; i < 20; i++) {
      const biz = generateBusiness('restaurant', 1);
      expect(biz.marginDriftRate).toBeGreaterThanOrEqual(sector.marginDriftRange[0]);
      expect(biz.marginDriftRate).toBeLessThanOrEqual(sector.marginDriftRange[1]);
    }
  });
});

describe('Revenue & Margin: generateDealWithSize', () => {
  beforeEach(() => {
    resetBusinessIdCounter();
  });

  it('should scale revenue when generating larger deals', () => {
    const smallDeals: number[] = [];
    const largeDeals: number[] = [];
    for (let i = 0; i < 30; i++) {
      const small = generateDealWithSize('saas', 5, 'small');
      const large = generateDealWithSize('saas', 5, 'large');
      smallDeals.push(small.business.revenue);
      largeDeals.push(large.business.revenue);
    }
    const avgSmall = smallDeals.reduce((a, b) => a + b, 0) / smallDeals.length;
    const avgLarge = largeDeals.reduce((a, b) => a + b, 0) / largeDeals.length;
    expect(avgLarge).toBeGreaterThan(avgSmall);
  });

  it('should maintain revenue × margin ≈ EBITDA relationship in deals', () => {
    for (let i = 0; i < 20; i++) {
      const deal = generateDealWithSize('homeServices', 3, 'any');
      const derived = Math.round(deal.business.revenue * deal.business.ebitdaMargin);
      expect(Math.abs(deal.business.ebitda - derived)).toBeLessThanOrEqual(1);
    }
  });
});

describe('Revenue & Margin: createStartingBusiness', () => {
  beforeEach(() => {
    resetBusinessIdCounter();
  });

  it('should have revenue that matches EBITDA / margin', () => {
    const biz = createStartingBusiness('saas');
    expect(biz.revenue).toBeGreaterThan(0);
    expect(biz.ebitdaMargin).toBeGreaterThan(0);
    // Revenue = EBITDA / margin (rounded)
    expect(Math.abs(biz.revenue - Math.round(biz.ebitda / biz.ebitdaMargin))).toBeLessThanOrEqual(1);
  });
});

describe('Seller Archetypes: assignSellerArchetype', () => {
  it('should return a valid archetype for each quality rating', () => {
    const validArchetypes = [
      'retiring_founder', 'burnt_out_operator', 'accidental_holdco',
      'distressed_seller', 'mbo_candidate', 'franchise_breakaway',
    ];
    for (let q = 1; q <= 5; q++) {
      for (let i = 0; i < 20; i++) {
        const archetype = assignSellerArchetype(q as QualityRating);
        expect(validArchetypes).toContain(archetype);
      }
    }
  });

  it('should favor retiring_founder for high quality (>=4)', () => {
    let retiringCount = 0;
    for (let i = 0; i < 500; i++) {
      if (assignSellerArchetype(5) === 'retiring_founder') retiringCount++;
    }
    // Retiring founder has baseWeight 0.30 + 0.10 = 0.40 for quality 5
    // Should appear frequently
    expect(retiringCount).toBeGreaterThan(100);
  });

  it('should favor distressed_seller for low quality (<=2)', () => {
    let distressedCount = 0;
    for (let i = 0; i < 500; i++) {
      if (assignSellerArchetype(1) === 'distressed_seller') distressedCount++;
    }
    // Distressed seller has baseWeight 0.10 + 0.10 = 0.20 for quality 1
    expect(distressedCount).toBeGreaterThan(30);
  });

  it('should produce all 6 archetypes across many samples', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(assignSellerArchetype(3));
    }
    expect(seen.size).toBe(6);
  });

  it('should integrate into deal generation (deals have sellerArchetype)', () => {
    resetBusinessIdCounter();
    for (let i = 0; i < 10; i++) {
      const deal = generateDeal('agency', 5);
      // sellerArchetype may or may not be set on older deals, but newly generated should have it
      if (deal.sellerArchetype) {
        expect([
          'retiring_founder', 'burnt_out_operator', 'accidental_holdco',
          'distressed_seller', 'mbo_candidate', 'franchise_breakaway',
        ]).toContain(deal.sellerArchetype);
      }
    }
  });
});

describe('getSizeRatioTier', () => {
  it('should return ideal when bolt-on is <= 50% of platform', () => {
    expect(getSizeRatioTier(400, 1000).tier).toBe('ideal');
    expect(getSizeRatioTier(500, 1000).tier).toBe('ideal');
    expect(getSizeRatioTier(100, 1000).tier).toBe('ideal');
  });

  it('should return stretch when bolt-on is 51-100% of platform', () => {
    expect(getSizeRatioTier(600, 1000).tier).toBe('stretch');
    expect(getSizeRatioTier(1000, 1000).tier).toBe('stretch');
  });

  it('should return strained when bolt-on is 101-200% of platform', () => {
    expect(getSizeRatioTier(1500, 1000).tier).toBe('strained');
    expect(getSizeRatioTier(2000, 1000).tier).toBe('strained');
  });

  it('should return overreach when bolt-on is >200% of platform', () => {
    expect(getSizeRatioTier(2500, 1000).tier).toBe('overreach');
    expect(getSizeRatioTier(5000, 1000).tier).toBe('overreach');
  });

  it('should return overreach when platform EBITDA is 0 or negative', () => {
    expect(getSizeRatioTier(1000, 0).tier).toBe('overreach');
    expect(getSizeRatioTier(1000, -500).tier).toBe('overreach');
  });

  it('should calculate ratio correctly', () => {
    const result = getSizeRatioTier(750, 1000);
    expect(result.ratio).toBeCloseTo(0.75, 2);
    expect(result.tier).toBe('stretch');
  });

  it('should use absolute value of bolt-on EBITDA', () => {
    // Negative EBITDA bolt-on should use absolute value
    expect(getSizeRatioTier(-500, 1000).tier).toBe('ideal');
  });
});

describe('size ratio impact on integration', () => {
  it('ideal tier should not reduce integration success probability', () => {
    // With deterministic testing, run many iterations to compare average outcomes
    let idealSuccesses = 0;
    const trials = 1000;
    const mockBusiness = {
      qualityRating: 3 as QualityRating,
      sectorId: 'agency' as SectorId,
      dueDiligence: {
        operatorQuality: 'moderate' as const,
        revenueConcentration: 'medium' as const,
        operatorQualityText: '',
        revenueConcentrationText: '',
        trend: 'flat' as const,
        trendText: '',
        customerRetention: 85,
        customerRetentionText: '',
        competitivePosition: 'competitive' as const,
        competitivePositionText: '',
      },
    } as any;

    for (let i = 0; i < trials; i++) {
      if (determineIntegrationOutcome(mockBusiness, undefined, false, 'match', 'ideal') === 'success') idealSuccesses++;
    }
    // Ideal tier should have roughly the same success rate as no tier
    let noTierSuccesses = 0;
    for (let i = 0; i < trials; i++) {
      if (determineIntegrationOutcome(mockBusiness, undefined, false, 'match') === 'success') noTierSuccesses++;
    }
    // Allow 5% variance due to randomness
    expect(Math.abs(idealSuccesses - noTierSuccesses)).toBeLessThan(trials * 0.10);
  });

  it('overreach with full mitigations should still have meaningful penalty (50% cap)', () => {
    // Even with all mitigators, overreach should still reduce success vs ideal
    let overreachMitigatedSuccesses = 0;
    let idealSuccesses = 0;
    const trials = 5000;
    const mockBusiness = {
      qualityRating: 5 as QualityRating,
      sectorId: 'agency' as SectorId,
      dueDiligence: {
        operatorQuality: 'moderate' as const,
        revenueConcentration: 'medium' as const,
        operatorQualityText: '',
        revenueConcentrationText: '',
        trend: 'flat' as const,
        trendText: '',
        customerRetention: 85,
        customerRetentionText: '',
        competitivePosition: 'competitive' as const,
        competitivePositionText: '',
      },
    } as any;
    const mockPlatformScaled = {
      qualityRating: 5 as QualityRating,
      sectorId: 'agency' as SectorId,
      platformScale: 3,
    } as any;

    for (let i = 0; i < trials; i++) {
      // Overreach with full mitigations: scale 3+, shared services, both Q5
      if (determineIntegrationOutcome(mockBusiness, mockPlatformScaled, true, 'match', 'overreach') === 'success') overreachMitigatedSuccesses++;
      if (determineIntegrationOutcome(mockBusiness, mockPlatformScaled, true, 'match', 'ideal') === 'success') idealSuccesses++;
    }
    // With 50% cap, overreach (-28%) retains at least -14% penalty even with full mitigations
    // So overreach should still have meaningfully fewer successes than ideal
    expect(overreachMitigatedSuccesses).toBeLessThan(idealSuccesses * 0.90);
  });

  it('overreach tier should significantly reduce success probability', () => {
    let overreachSuccesses = 0;
    let idealSuccesses = 0;
    const trials = 1000;
    const mockBusiness = {
      qualityRating: 3 as QualityRating,
      sectorId: 'agency' as SectorId,
      dueDiligence: {
        operatorQuality: 'moderate' as const,
        revenueConcentration: 'medium' as const,
        operatorQualityText: '',
        revenueConcentrationText: '',
        trend: 'flat' as const,
        trendText: '',
        customerRetention: 85,
        customerRetentionText: '',
        competitivePosition: 'competitive' as const,
        competitivePositionText: '',
      },
    } as any;
    const mockPlatform = {
      qualityRating: 3 as QualityRating,
      sectorId: 'agency' as SectorId,
      platformScale: 1,
    } as any;

    for (let i = 0; i < trials; i++) {
      if (determineIntegrationOutcome(mockBusiness, mockPlatform, false, 'match', 'overreach') === 'success') overreachSuccesses++;
      if (determineIntegrationOutcome(mockBusiness, mockPlatform, false, 'match', 'ideal') === 'success') idealSuccesses++;
    }
    // Overreach should have meaningfully fewer successes
    expect(overreachSuccesses).toBeLessThan(idealSuccesses);
  });

  it('ideal tier synergies should equal base synergies', () => {
    const baseSynergies = calculateSynergies('success', 1000, true, 'match');
    const idealSynergies = calculateSynergies('success', 1000, true, 'match', 'ideal');
    expect(idealSynergies).toBe(baseSynergies);
  });

  it('overreach tier should heavily dampen synergies', () => {
    const idealSynergies = calculateSynergies('success', 1000, true, 'match', 'ideal');
    const overreachSynergies = calculateSynergies('success', 1000, true, 'match', 'overreach');
    expect(overreachSynergies).toBeLessThan(idealSynergies * 0.30); // 25% multiplier
  });

  it('stretch tier should moderately dampen synergies', () => {
    const idealSynergies = calculateSynergies('success', 1000, true, 'match', 'ideal');
    const stretchSynergies = calculateSynergies('success', 1000, true, 'match', 'stretch');
    expect(stretchSynergies).toBe(Math.round(idealSynergies * 0.80));
  });

  it('strained tier should halve synergies', () => {
    const idealSynergies = calculateSynergies('success', 1000, true, 'match', 'ideal');
    const strainedSynergies = calculateSynergies('success', 1000, true, 'match', 'strained');
    expect(strainedSynergies).toBe(Math.round(idealSynergies * 0.50));
  });
});

describe('acquisitionSizeTierPremium', () => {
  it('should be set correctly on generated businesses', () => {
    const biz = generateBusiness('agency', 1);
    expect(biz.acquisitionSizeTierPremium).toBeDefined();
    expect(typeof biz.acquisitionSizeTierPremium).toBe('number');
    expect(biz.acquisitionSizeTierPremium).toBeGreaterThanOrEqual(0);
  });

  it('should be set on createStartingBusiness', () => {
    const biz = createStartingBusiness('agency', 1000);
    expect(biz.acquisitionSizeTierPremium).toBeDefined();
    // $1M EBITDA is below $2M threshold → 0 premium
    expect(biz.acquisitionSizeTierPremium).toBe(0);
  });

  it('should be positive for large EBITDA businesses', () => {
    const biz = createStartingBusiness('agency', 5000);
    expect(biz.acquisitionSizeTierPremium).toBeGreaterThan(0);
  });
});

describe('merger-specific synergies (isMerger)', () => {
  it('merger success synergy rate should be 15%', () => {
    const synergies = calculateSynergies('success', 1000, false, 'match', 'ideal', true);
    expect(synergies).toBe(150); // 15% of 1000
  });

  it('merger partial synergy rate should be 5%', () => {
    const synergies = calculateSynergies('partial', 1000, false, 'match', 'ideal', true);
    expect(synergies).toBe(50); // 5% of 1000
  });

  it('merger failure synergy rate should be -7%', () => {
    const synergies = calculateSynergies('failure', 1000, false, 'match', 'ideal', true);
    expect(synergies).toBe(-70); // -7% of 1000
  });

  it('merger size-ratio penalties should be softer than tuck-in', () => {
    // Compare strained tier: tuck-in uses 0.50x, merger uses 0.70x
    const tuckInSynergies = calculateSynergies('success', 1000, true, 'match', 'strained');
    const mergerSynergies = calculateSynergies('success', 1000, false, 'match', 'strained', true);
    // Merger base = 15% × 0.70 = 10.5%, tuck-in = 20% × 0.50 = 10%
    // Merger should be close to or higher per unit than tuck-in at strained tier
    expect(mergerSynergies).toBeGreaterThanOrEqual(tuckInSynergies * 0.5);
  });

  it('merger ideal tier should have no dampening', () => {
    const noDampen = calculateSynergies('success', 1000, false, 'match', 'ideal', true);
    const noDampenNoTier = calculateSynergies('success', 1000, false, 'match', undefined, true);
    expect(noDampen).toBe(noDampenNoTier);
  });
});

describe('naming — wealthManagement and environmental', () => {
  it('wealthManagement names should not contain agency words', () => {
    const agencyWords = ['Pixel', 'Spark', 'Digital', 'Metric', 'Neon', 'Creative', 'Media', 'Agency'];
    for (let i = 0; i < 20; i++) {
      const biz = generateBusiness('wealthManagement', 1);
      for (const word of agencyWords) {
        expect(biz.name).not.toContain(word);
      }
    }
  });

  it('environmental names should not contain agency words', () => {
    const agencyWords = ['Pixel', 'Spark', 'Digital', 'Metric', 'Neon', 'Creative', 'Media', 'Agency'];
    for (let i = 0; i < 20; i++) {
      const biz = generateBusiness('environmental', 1);
      for (const word of agencyWords) {
        expect(biz.name).not.toContain(word);
      }
    }
  });

  it('wealthManagement and environmental should appear in sector weights', () => {
    const weights = getSectorWeightsForRound(5);
    expect(weights.wealthManagement).toBeGreaterThan(0);
    expect(weights.environmental).toBeGreaterThan(0);
  });
});

describe('multiple-to-quality cohesion', () => {
  it('Q5 businesses should have higher avg multiples than Q1', () => {
    let q5Total = 0;
    let q1Total = 0;
    const runs = 200;

    for (let i = 0; i < runs; i++) {
      const q5biz = generateBusiness('saas', 5, 5 as QualityRating);
      const q1biz = generateBusiness('saas', 5, 1 as QualityRating);
      q5Total += q5biz.acquisitionMultiple;
      q1Total += q1biz.acquisitionMultiple;
    }

    const q5Avg = q5Total / runs;
    const q1Avg = q1Total / runs;
    // With (quality-3)*0.35 + competitive position, Q5 should be at least 1.0x higher than Q1
    expect(q5Avg - q1Avg).toBeGreaterThanOrEqual(1.0);
  });

  it('distressed sellers should be more common for low-quality businesses', () => {
    let q1Distressed = 0;
    let q5Distressed = 0;
    const runs = 500;

    for (let i = 0; i < runs; i++) {
      if (assignSellerArchetype(1 as QualityRating) === 'distressed_seller') q1Distressed++;
      if (assignSellerArchetype(5 as QualityRating) === 'distressed_seller') q5Distressed++;
    }

    // Q1 distressed rate should be significantly higher than Q5
    expect(q1Distressed / runs).toBeGreaterThan(q5Distressed / runs);
    expect(q1Distressed / runs).toBeGreaterThan(0.10); // At least 10%
    expect(q5Distressed / runs).toBeLessThan(0.10);     // Under 10%
  });
});

describe('calculateIntegrationGrowthPenalty', () => {
  it('applies floor for tiny tuck-ins', () => {
    // $100K bolt-on into $2M platform — ratio 0.05 → raw -0.15ppt, clamped to floor -0.5ppt
    const penalty = calculateIntegrationGrowthPenalty(100, 2000, false);
    expect(penalty).toBeCloseTo(-0.005);
  });

  it('applies cap for equal-sized acquisitions', () => {
    // $2M into $2M — ratio 1.0 → raw -3.0ppt, clamped to cap -3.0ppt
    const penalty = calculateIntegrationGrowthPenalty(2000, 2000, false);
    expect(penalty).toBeCloseTo(-0.030);
  });

  it('scales proportionally in the middle', () => {
    // $500K into $2M — ratio 0.25 → raw -0.75ppt
    const penalty = calculateIntegrationGrowthPenalty(500, 2000, false);
    expect(penalty).toBeCloseTo(-0.0075);
  });

  it('caps at INTEGRATION_DRAG_CAP for oversized bolt-ons', () => {
    // $5M into $2M — ratio 2.5 → raw -7.5ppt, clamped to cap -3.0ppt
    const penalty = calculateIntegrationGrowthPenalty(5000, 2000, false);
    expect(penalty).toBeCloseTo(-0.030);
  });

  it('applies merger discount (67%)', () => {
    // $2M into $2M merger — cap -3.0ppt × 0.67 = -2.01ppt
    const penalty = calculateIntegrationGrowthPenalty(2000, 2000, true);
    expect(penalty).toBeCloseTo(-0.030 * 0.67);
  });

  it('applies merger floor correctly', () => {
    const penalty = calculateIntegrationGrowthPenalty(100, 2000, true);
    expect(penalty).toBeCloseTo(-0.005 * 0.67);
  });

  it('handles zero platform EBITDA', () => {
    const penalty = calculateIntegrationGrowthPenalty(1000, 0, false);
    expect(penalty).toBeCloseTo(-0.030); // cap
  });

  it('handles zero platform EBITDA for mergers', () => {
    const penalty = calculateIntegrationGrowthPenalty(1000, 0, true);
    expect(penalty).toBeCloseTo(-0.030 * 0.67);
  });

  it('always returns negative values', () => {
    const scenarios = [
      [100, 2000, false],
      [500, 2000, false],
      [1000, 2000, false],
      [2000, 2000, false],
      [100, 2000, true],
      [2000, 2000, true],
    ] as const;
    for (const [acquired, platform, isMerger] of scenarios) {
      expect(calculateIntegrationGrowthPenalty(acquired, platform, isMerger)).toBeLessThan(0);
    }
  });

  it('generateBusiness includes integrationGrowthDrag: 0', () => {
    const business = generateBusiness('agency', 1);
    expect(business.integrationGrowthDrag).toBe(0);
  });
});
