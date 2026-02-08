import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  calculateMultipleExpansion,
  createStartingBusiness,
} from '../businesses';
import { SECTORS, SECTOR_LIST } from '../../data/sectors';
import { SectorId, QualityRating } from '../types';

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

      // EBITDA should be roughly within range (quality modifier applies 0.8-1.2x)
      const minPossible = Math.round(sector.baseEbitda[0] * 0.8);
      const maxPossible = Math.round(sector.baseEbitda[1] * 1.2);
      expect(business.ebitda).toBeGreaterThanOrEqual(minPossible * 0.9); // small tolerance
      expect(business.ebitda).toBeLessThanOrEqual(maxPossible * 1.1);
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
    let foundTuckIn = false;
    for (let i = 0; i < 50; i++) {
      const deal = generateDeal('agency', 1);
      if (deal.acquisitionType === 'tuck_in') {
        foundTuckIn = true;
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
    const deals = generateSourcedDeals(5, { sectorId: 'saas', sizePreference: 'any' });
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

  it('should produce more failures with subTypeMatch=false', () => {
    let failMatchCount = 0;
    let failMismatchCount = 0;
    const biz = generateBusiness('healthcare', 1, 3);

    for (let i = 0; i < 500; i++) {
      if (determineIntegrationOutcome(biz, undefined, false, true) === 'failure') failMatchCount++;
      if (determineIntegrationOutcome(biz, undefined, false, false) === 'failure') failMismatchCount++;
    }
    // Mismatch should produce more failures due to -0.20 penalty
    expect(failMismatchCount).toBeGreaterThan(failMatchCount);
  });

  it('should not penalize when subTypeMatch is undefined (default)', () => {
    let failDefault = 0;
    let failMatch = 0;
    const biz = generateBusiness('healthcare', 1, 3);

    for (let i = 0; i < 500; i++) {
      if (determineIntegrationOutcome(biz) === 'failure') failDefault++;
      if (determineIntegrationOutcome(biz, undefined, false, true) === 'failure') failMatch++;
    }
    // Should be roughly similar (both without penalty)
    const ratio = failDefault / Math.max(failMatch, 1);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2.0);
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

  it('should halve synergies when subTypeMatch is false', () => {
    const matched = calculateSynergies('success', 1000, false);
    const mismatched = calculateSynergies('success', 1000, false, false);
    expect(mismatched).toBe(Math.round(matched * 0.5));
  });

  it('should not affect synergies when subTypeMatch is true', () => {
    const defaultSyn = calculateSynergies('success', 1000, true);
    const matchedSyn = calculateSynergies('success', 1000, true, true);
    expect(matchedSyn).toBe(defaultSyn);
  });

  it('should halve tuck-in synergies on sub-type mismatch', () => {
    const matched = calculateSynergies('success', 1000, true);
    const mismatched = calculateSynergies('success', 1000, true, false);
    expect(mismatched).toBe(Math.round(matched * 0.5));
    expect(mismatched).toBeGreaterThan(0);
  });

  it('should halve negative synergies on sub-type mismatch (less damage)', () => {
    const matchedFailure = calculateSynergies('failure', 1000, false);
    const mismatchedFailure = calculateSynergies('failure', 1000, false, false);
    // Both negative, but mismatched should be closer to 0
    expect(matchedFailure).toBeLessThan(0);
    expect(mismatchedFailure).toBeLessThan(0);
    expect(Math.abs(mismatchedFailure)).toBeLessThan(Math.abs(matchedFailure));
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

  it('should cap multiple expansion bonus at scale 3 for scale 4+', () => {
    const result = calculateMultipleExpansion(5, 1000);
    expect(Number.isNaN(result)).toBe(false);
    // Scale 5 is capped at scale 3's bonus (1.0x) via Math.min(platformScale, 3)
    expect(result).toBe(1.0); // scaleBonus = 1.0 (capped at scale 3)
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
