/**
 * M&A Infrastructure tests — verifies that M&A sourcing tiers
 * actually produce the effects described in their UI copy.
 *
 * Covers: deal duration/freshness, deal quality floors, deal volume,
 * heat reduction, acquisition capacity, and proactive outreach.
 */
import { describe, it, expect } from 'vitest';
import {
  generateDealPipeline,
  generateSourcedDeals,
  generateProactiveOutreachDeals,
  getMaxAcquisitions,
  calculateDealHeat,
} from '../businesses';
import { MA_SOURCING_CONFIG } from '../../data/sharedServices';
import { SeededRng } from '../rng';
import type { MAFocus, MASourcingTier } from '../types';

// Deterministic RNG for reproducible tests
function rng(seed: number = 42) {
  return new SeededRng(seed);
}

// Helper to create a well-typed MAFocus
function focus(sectorId: string, subType?: string): MAFocus {
  return { sectorId: sectorId as MAFocus['sectorId'], sizePreference: 'any', subType: subType ?? null };
}

// ── Acquisition Capacity ──

describe('M&A Infrastructure: Acquisition Capacity', () => {
  it('baseline (tier 0) allows 2 acquisitions per round', () => {
    expect(getMaxAcquisitions(0)).toBe(2);
  });

  it('tier 1 allows 3 acquisitions per round', () => {
    expect(getMaxAcquisitions(1)).toBe(3);
  });

  it('tier 2 allows 4 acquisitions per round', () => {
    expect(getMaxAcquisitions(2)).toBe(4);
  });

  it('tier 3 allows 4 acquisitions per round (same as tier 2)', () => {
    expect(getMaxAcquisitions(3 as MASourcingTier)).toBe(4);
  });
});

// ── Deal Duration / Freshness ──

describe('M&A Infrastructure: Deal Duration (Freshness)', () => {
  it('baseline deals have freshness of 2 (last 2 rounds)', () => {
    const pipeline = generateDealPipeline(
      [], 1, undefined, undefined, undefined, 0,
      0, false, undefined, 20, false, rng(), 0, 5000,
    );
    // All new deals should have freshness = 2
    for (const deal of pipeline) {
      expect(deal.freshness).toBe(2);
    }
  });

  it('M&A sourcing tier 1+ sourced deals have freshness of 3 (last 3 rounds)', () => {
    const pipeline = generateDealPipeline(
      [], 3,
      focus('agency'),
      undefined, undefined, 1000,
      1, true, // tier 1, active
      undefined, 20, false, rng(), 0, 5000,
    );
    // Sourced deals (from M&A infrastructure) should have freshness = 3
    const sourcedDeals = pipeline.filter(d => d.source === 'sourced' || d.source === 'proprietary');
    expect(sourcedDeals.length).toBeGreaterThan(0);
    for (const deal of sourcedDeals) {
      expect(deal.freshness).toBe(3);
    }
  });

  it('non-sourced deals remain at freshness 2 even with M&A tier active', () => {
    const pipeline = generateDealPipeline(
      [], 3,
      focus('agency'),
      undefined, undefined, 1000,
      1, true,
      undefined, 20, false, rng(), 0, 5000,
    );
    const inboundOrBrokered = pipeline.filter(d => d.source === 'inbound' || d.source === 'brokered');
    for (const deal of inboundOrBrokered) {
      expect(deal.freshness).toBe(2);
    }
  });

  it('deals age by 1 freshness per round and expire at 0', () => {
    // Generate deals with freshness 2
    const initial = generateDealPipeline(
      [], 1, undefined, undefined, undefined, 0,
      0, false, undefined, 20, false, rng(1), 0, 5000,
    );
    expect(initial.length).toBeGreaterThan(0);

    // Simulate next round — freshness decrements
    const afterOneRound = generateDealPipeline(
      initial, 2, undefined, undefined, undefined, 0,
      0, false, undefined, 20, false, rng(2), 0, 5000,
    );

    // Original deals should have freshness 1 (decremented from 2)
    const surviving = afterOneRound.filter(d =>
      initial.some(orig => orig.id === d.id)
    );
    for (const deal of surviving) {
      expect(deal.freshness).toBe(1);
    }
  });
});

// ── Deal Quality Floors ──

describe('M&A Infrastructure: Deal Quality', () => {
  it('tier 1 sourced deals have no special quality floor', () => {
    // Tier 1 does NOT specify a quality floor — all quality levels possible
    // We just verify deals generate without error
    const pipeline = generateDealPipeline(
      [], 3,
      focus('agency'),
      undefined, undefined, 1000,
      1, true,
      undefined, 20, false, rng(), 0, 5000,
    );
    expect(pipeline.length).toBeGreaterThan(0);
  });

  it('tier 2 sourced deals have quality floor of 2', () => {
    // Run multiple seeds to verify Q1 never appears in sourced deals
    for (let seed = 1; seed <= 20; seed++) {
      const pipeline = generateDealPipeline(
        [], 3,
        focus('agency', 'Digital/Ecommerce Agency'),
        undefined, undefined, 1000,
        2, true,
        undefined, 20, false, rng(seed), 0, 5000,
      );
      const sourcedDeals = pipeline.filter(d => d.source === 'sourced');
      for (const deal of sourcedDeals) {
        expect(deal.business.qualityRating).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('tier 3 sourced deals have quality floor of 3', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const pipeline = generateDealPipeline(
        [], 3,
        focus('agency', 'Digital/Ecommerce Agency'),
        undefined, undefined, 1000,
        3, true,
        undefined, 20, false, rng(seed), 0, 5000,
      );
      const sourcedDeals = pipeline.filter(d => d.source === 'sourced' || d.source === 'proprietary');
      for (const deal of sourcedDeals) {
        expect(deal.business.qualityRating).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('tier 3 off-market (proprietary) deals have quality floor of 3', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const pipeline = generateDealPipeline(
        [], 3,
        focus('agency', 'Digital/Ecommerce Agency'),
        undefined, undefined, 1000,
        3, true,
        undefined, 20, false, rng(seed), 0, 5000,
      );
      const proprietaryDeals = pipeline.filter(d => d.source === 'proprietary');
      for (const deal of proprietaryDeals) {
        expect(deal.business.qualityRating).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ── Deal Volume / Count ──

describe('M&A Infrastructure: Deal Volume', () => {
  it('tier 1 adds sourced deals to pipeline', () => {
    const withMA = generateDealPipeline(
      [], 3, focus('agency'),
      undefined, undefined, 1000,
      1, true,
      undefined, 20, false, rng(42), 0, 5000,
    );
    // M&A tier 1 should produce sourced deals
    const sourcedWithMA = withMA.filter(d => d.source === 'sourced');
    expect(sourcedWithMA.length).toBeGreaterThan(0);
  });

  it('tier 2 adds sub-type matched deals when sub-type is set', () => {
    const pipeline = generateDealPipeline(
      [], 3,
      focus('agency', 'Digital/Ecommerce Agency'),
      undefined, undefined, 1000,
      2, true,
      undefined, 20, false, rng(), 0, 5000,
    );
    // Should have some deals matching the target sub-type
    const matchedDeals = pipeline.filter(
      d => d.business.subType === 'Digital/Ecommerce Agency'
    );
    expect(matchedDeals.length).toBeGreaterThan(0);
  });

  it('tier 3 adds proprietary (off-market) deals', () => {
    const pipeline = generateDealPipeline(
      [], 3,
      focus('agency', 'Digital/Ecommerce Agency'),
      undefined, undefined, 1000,
      3, true,
      undefined, 20, false, rng(), 0, 5000,
    );
    const proprietaryDeals = pipeline.filter(d => d.source === 'proprietary');
    expect(proprietaryDeals.length).toBeGreaterThanOrEqual(1); // should get 2 but pipeline cap may limit
  });
});

// ── Heat Reduction ──

describe('M&A Infrastructure: Heat Reduction', () => {
  it('tier 2+ sourced deals get -1 heat tier vs tier 0', () => {
    // Run many trials and compare average heat levels
    let tier0HotCount = 0;
    let tier2HotCount = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const r = rng(i + 100);
      const heat0 = calculateDealHeat(3, 'sourced', 5, undefined, undefined, 20, false, r, 0);
      const r2 = rng(i + 100);
      const heat2 = calculateDealHeat(3, 'sourced', 5, undefined, undefined, 20, false, r2, 2);

      const heatToNum = (h: string) => ({ cold: 0, warm: 1, hot: 2, contested: 3 }[h] ?? 0);
      tier0HotCount += heatToNum(heat0);
      tier2HotCount += heatToNum(heat2);
    }

    // Tier 2 should have strictly cooler average heat than tier 0
    expect(tier2HotCount).toBeLessThan(tier0HotCount);
  });

  it('proprietary deals get -2 heat tier', () => {
    let propHeatSum = 0;
    let inboundHeatSum = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const r1 = rng(i + 200);
      const propHeat = calculateDealHeat(3, 'proprietary', 5, undefined, undefined, 20, false, r1);
      const r2 = rng(i + 200);
      const inboundHeat = calculateDealHeat(3, 'inbound', 5, undefined, undefined, 20, false, r2);

      const heatToNum = (h: string) => ({ cold: 0, warm: 1, hot: 2, contested: 3 }[h] ?? 0);
      propHeatSum += heatToNum(propHeat);
      inboundHeatSum += heatToNum(inboundHeat);
    }

    expect(propHeatSum).toBeLessThan(inboundHeatSum);
  });
});

// ── Source Deals Action ──

describe('M&A Infrastructure: Source Deals Action', () => {
  it('generateSourcedDeals produces 3 deals', () => {
    const deals = generateSourcedDeals(
      3,
      focus('agency'),
      'agency',
      1000,
      1,
      20,
      false,
      rng(),
      0,
      5000,
    );
    expect(deals.length).toBe(3);
  });

  it('sourced deals are marked as source "sourced"', () => {
    const deals = generateSourcedDeals(
      3, focus('agency'), 'agency', 1000, 1, 20, false, rng(), 0, 5000,
    );
    for (const deal of deals) {
      expect(deal.source).toBe('sourced');
    }
  });

  it('sourced deals have freshness 2 (separate from pipeline freshness bonus)', () => {
    const deals = generateSourcedDeals(
      3, focus('agency'), 'agency', 1000, 1, 20, false, rng(), 0, 5000,
    );
    for (const deal of deals) {
      expect(deal.freshness).toBe(2);
    }
  });

  it('tier 2 sourced deals enforce quality floor of 2', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deals = generateSourcedDeals(
        3, focus('agency', 'Digital/Ecommerce Agency'),
        'agency', 1000, 2, 20, false, rng(seed), 0, 5000,
      );
      for (const deal of deals) {
        expect(deal.business.qualityRating).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('tier 3 sourced deals enforce quality floor of 3', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deals = generateSourcedDeals(
        3, focus('agency', 'Digital/Ecommerce Agency'),
        'agency', 1000, 3, 20, false, rng(seed), 0, 5000,
      );
      for (const deal of deals) {
        expect(deal.business.qualityRating).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ── Proactive Outreach (Tier 3) ──

describe('M&A Infrastructure: Proactive Outreach (Tier 3)', () => {
  it('generates exactly 2 deals', () => {
    const deals = generateProactiveOutreachDeals(
      5,
      focus('agency', 'Digital/Ecommerce Agency'),
      1000, 20, false, rng(), 0, 5000,
    );
    expect(deals.length).toBe(2);
  });

  it('proactive deals are proprietary source', () => {
    const deals = generateProactiveOutreachDeals(
      5,
      focus('agency', 'Digital/Ecommerce Agency'),
      1000, 20, false, rng(), 0, 5000,
    );
    for (const deal of deals) {
      expect(deal.source).toBe('proprietary');
    }
  });

  it('proactive deals have quality floor of 3', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const deals = generateProactiveOutreachDeals(
        5,
        focus('agency', 'Digital/Ecommerce Agency'),
        1000, 20, false, rng(seed), 0, 5000,
      );
      for (const deal of deals) {
        expect(deal.business.qualityRating).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ── Off-Market Discount (Tier 3) ──

describe('M&A Infrastructure: Off-Market Discount', () => {
  it('proprietary deals from tier 3 pipeline have 15% discount applied', () => {
    // Generate many seeds and check that proprietary deals in pipeline
    // have lower effective prices relative to their EBITDA than inbound deals
    let propAvgMultiple = 0;
    let inboundAvgMultiple = 0;
    let propCount = 0;
    let inboundCount = 0;

    for (let seed = 1; seed <= 50; seed++) {
      const pipeline = generateDealPipeline(
        [], 5,
        focus('agency', 'Digital/Ecommerce Agency'),
        undefined, undefined, 5000,
        3, true,
        undefined, 20, false, rng(seed), 0, 10000,
      );

      for (const deal of pipeline) {
        if (deal.business.ebitda <= 0) continue;
        const multiple = deal.effectivePrice / deal.business.ebitda;
        if (deal.source === 'proprietary') {
          propAvgMultiple += multiple;
          propCount++;
        } else if (deal.source === 'inbound') {
          inboundAvgMultiple += multiple;
          inboundCount++;
        }
      }
    }

    if (propCount > 0 && inboundCount > 0) {
      propAvgMultiple /= propCount;
      inboundAvgMultiple /= inboundCount;
      // Proprietary deals should be cheaper on average (15% discount)
      expect(propAvgMultiple).toBeLessThan(inboundAvgMultiple);
    }
  });
});

// ── Config Accuracy ──

describe('M&A Infrastructure: Config matches code', () => {
  it('tier 1 effects list is accurate', () => {
    const effects = MA_SOURCING_CONFIG[1].effects;
    expect(effects).toContain('+2 sourced deals per round in focus sector');
    expect(effects).toContain('Source Deals costs $300k (was $500k)');
    expect(effects).toContain('Sourced deals last 3 rounds (was 2)');
    expect(effects).toContain('Acquisition capacity: 3/year (was 2)');
  });

  it('tier 2 effects list is accurate and cumulative', () => {
    const effects = MA_SOURCING_CONFIG[2].effects;
    // Tier 2 own effects
    expect(effects).toContain('Sub-type targeting unlocked');
    expect(effects).toContain('1-2 sub-type matched deals per round');
    expect(effects).toContain('Quality floor of 2 on sourced deals');
    expect(effects).toContain('Sourced deals get -1 heat tier (less competition)');
    expect(effects).toContain('Acquisition capacity: 4/year (was 2)');
    // Inherited from tier 1
    expect(effects).toContain('+2 sourced deals per round in focus sector');
    expect(effects).toContain('Sourced deals last 3 rounds (was 2)');
    expect(effects).toContain('Source Deals costs $300k (was $500k)');
  });

  it('tier 3 effects list is accurate and cumulative', () => {
    const effects = MA_SOURCING_CONFIG[3].effects;
    // Tier 3 own effects
    expect(effects).toContain('2 off-market deals per round (15% discount)');
    expect(effects).toContain('2-3 sub-type matched deals per round');
    expect(effects).toContain('Quality floor of 3 on sourced deals');
    expect(effects).toContain('Proactive Outreach: $400k for 2 targeted deals');
    // Inherited from tiers 1-2
    expect(effects).toContain('+2 sourced deals per round in focus sector');
    expect(effects).toContain('Sourced deals get -1 heat tier (less competition)');
    expect(effects).toContain('Sourced deals last 3 rounds (was 2)');
    expect(effects).toContain('Acquisition capacity: 4/year (was 2)');
  });

  it('tier configs have correct costs', () => {
    expect(MA_SOURCING_CONFIG[1].upgradeCost).toBe(800);
    expect(MA_SOURCING_CONFIG[1].annualCost).toBe(350);
    expect(MA_SOURCING_CONFIG[2].upgradeCost).toBe(1200);
    expect(MA_SOURCING_CONFIG[2].annualCost).toBe(550);
    expect(MA_SOURCING_CONFIG[3].upgradeCost).toBe(1500);
    expect(MA_SOURCING_CONFIG[3].annualCost).toBe(800);
  });

  it('tier configs have correct opco requirements', () => {
    expect(MA_SOURCING_CONFIG[1].requiredOpcos).toBe(2);
    expect(MA_SOURCING_CONFIG[2].requiredOpcos).toBe(3);
    expect(MA_SOURCING_CONFIG[3].requiredOpcos).toBe(4);
  });
});
