import { describe, it, expect, beforeEach } from 'vitest';
import { createRngStreams } from '../rng';
import {
  generateSourcedDeals,
  generateProactiveOutreachDeals,
  generateDealPipeline,
  generateBusiness,
  resetBusinessIdCounter,
} from '../businesses';
import { resetUsedNames } from '../../data/names';
import type { MAFocus, Deal } from '../types';
import { SECTOR_LIST } from '../../data/sectors';

/**
 * Source-deals dedup tests.
 *
 * Validates the fix for duplicate deal generation when players source
 * additional deals (via sourceDealFlow / proactiveOutreach) after leveling
 * up M&A and narrowing into a sub-sector.
 *
 * Root cause: sourceDealFlow used a static fork key ('source') so every call
 * in the same round produced the same RNG state → identical financial
 * characteristics. Fix: fork key now includes prior action count
 * (`source-${priorSourceCount}`).
 */

// ── Helpers ─────────────────────────────────────────────────────────

const SEED = 42;
const ROUND = 5;
const AGENCY_SECTOR = 'agency';
const AGENCY_SUBTYPE = 'Digital/Ecommerce Agency';

function makeMAFocus(overrides: Partial<MAFocus> = {}): MAFocus {
  return {
    sectorId: AGENCY_SECTOR,
    sizePreference: 'any',
    subType: null,
    ...overrides,
  };
}

/** Simulate what useGame.sourceDealFlow does: fork the deals stream with a count-based key */
function simulateSourceDealFlow(
  seed: number,
  round: number,
  priorSourceCount: number,
  maFocus: MAFocus,
  maSourcingTier: number = 1,
): Deal[] {
  const streams = createRngStreams(seed, round);
  return generateSourcedDeals(
    round,
    maFocus,
    undefined,      // portfolioFocusSector
    5000,            // portfolioEbitda ($5M)
    maSourcingTier,
    20,              // maxRounds
    false,           // creditTighteningActive
    streams.deals.fork(`source-${priorSourceCount}`)
  );
}

/** Simulate what useGame.proactiveOutreach does: fork the deals stream with a count-based key */
function simulateProactiveOutreach(
  seed: number,
  round: number,
  priorOutreachCount: number,
  maFocus: MAFocus,
): Deal[] {
  const streams = createRngStreams(seed, round);
  return generateProactiveOutreachDeals(
    round,
    maFocus,
    5000,            // portfolioEbitda
    20,              // maxRounds
    false,           // creditTighteningActive
    streams.deals.fork(`outreach-${priorOutreachCount}`)
  );
}

/** Extract financial fingerprint from a deal for comparison */
function financialFingerprint(deal: Deal) {
  return {
    ebitda: deal.business.ebitda,
    margin: deal.business.ebitdaMargin,
    askingPrice: deal.askingPrice,
    multiple: deal.business.acquisitionMultiple,
    revenue: deal.business.revenue,
    quality: deal.business.qualityRating,
  };
}

/** Check if two deal arrays have at least one financial difference */
function dealsFinanciallyDiffer(dealsA: Deal[], dealsB: Deal[]): boolean {
  for (let i = 0; i < Math.min(dealsA.length, dealsB.length); i++) {
    const a = financialFingerprint(dealsA[i]);
    const b = financialFingerprint(dealsB[i]);
    if (
      a.ebitda !== b.ebitda ||
      a.margin !== b.margin ||
      a.askingPrice !== b.askingPrice ||
      a.multiple !== b.multiple ||
      a.revenue !== b.revenue
    ) {
      return true;
    }
  }
  return false;
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  resetBusinessIdCounter();
  resetUsedNames();
});

describe('sourceDealFlow dedup — multiple calls in same round produce DIFFERENT deals', () => {
  it('first and second sourcing calls have different financial characteristics', () => {
    const focus = makeMAFocus();

    resetBusinessIdCounter(); resetUsedNames();
    const batch0 = simulateSourceDealFlow(SEED, ROUND, 0, focus);

    resetBusinessIdCounter(); resetUsedNames();
    const batch1 = simulateSourceDealFlow(SEED, ROUND, 1, focus);

    // Both batches should have deals
    expect(batch0.length).toBeGreaterThan(0);
    expect(batch1.length).toBeGreaterThan(0);

    // Financial characteristics must differ between the two batches
    expect(dealsFinanciallyDiffer(batch0, batch1)).toBe(true);
  });

  it('three consecutive sourcing calls all produce unique batches', () => {
    const focus = makeMAFocus();
    const batches: Deal[][] = [];

    for (let i = 0; i < 3; i++) {
      resetBusinessIdCounter(); resetUsedNames();
      batches.push(simulateSourceDealFlow(SEED, ROUND, i, focus));
    }

    // Each pair must differ financially
    expect(dealsFinanciallyDiffer(batches[0], batches[1])).toBe(true);
    expect(dealsFinanciallyDiffer(batches[1], batches[2])).toBe(true);
    expect(dealsFinanciallyDiffer(batches[0], batches[2])).toBe(true);
  });

  it('sourced deals within the same batch also differ from each other', () => {
    const focus = makeMAFocus();

    resetBusinessIdCounter(); resetUsedNames();
    const batch = simulateSourceDealFlow(SEED, ROUND, 0, focus);

    // With 3 deals in a batch, at least some financial values should differ
    expect(batch.length).toBeGreaterThanOrEqual(2);
    const fingerprints = batch.map(financialFingerprint);

    // At least one pair of deals within the batch should differ
    let foundDiff = false;
    for (let i = 0; i < fingerprints.length && !foundDiff; i++) {
      for (let j = i + 1; j < fingerprints.length && !foundDiff; j++) {
        if (
          fingerprints[i].ebitda !== fingerprints[j].ebitda ||
          fingerprints[i].margin !== fingerprints[j].margin ||
          fingerprints[i].askingPrice !== fingerprints[j].askingPrice
        ) {
          foundDiff = true;
        }
      }
    }
    expect(foundDiff).toBe(true);
  });
});

describe('proactiveOutreach dedup — multiple calls in same round produce DIFFERENT deals', () => {
  it('first and second outreach calls have different financial characteristics', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    resetBusinessIdCounter(); resetUsedNames();
    const batch0 = simulateProactiveOutreach(SEED, ROUND, 0, focus);

    resetBusinessIdCounter(); resetUsedNames();
    const batch1 = simulateProactiveOutreach(SEED, ROUND, 1, focus);

    expect(batch0.length).toBeGreaterThan(0);
    expect(batch1.length).toBeGreaterThan(0);

    expect(dealsFinanciallyDiffer(batch0, batch1)).toBe(true);
  });

  it('three consecutive outreach calls all produce unique batches', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });
    const batches: Deal[][] = [];

    for (let i = 0; i < 3; i++) {
      resetBusinessIdCounter(); resetUsedNames();
      batches.push(simulateProactiveOutreach(SEED, ROUND, i, focus));
    }

    expect(dealsFinanciallyDiffer(batches[0], batches[1])).toBe(true);
    expect(dealsFinanciallyDiffer(batches[1], batches[2])).toBe(true);
    expect(dealsFinanciallyDiffer(batches[0], batches[2])).toBe(true);
  });
});

describe('sourced deals maintain determinism — same seed + same action count = identical deals', () => {
  it('sourceDealFlow is deterministic for the same priorSourceCount', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    // Run A
    resetBusinessIdCounter(); resetUsedNames();
    const runA = simulateSourceDealFlow(SEED, ROUND, 0, focus, 2);

    // Run B (identical inputs)
    resetBusinessIdCounter(); resetUsedNames();
    const runB = simulateSourceDealFlow(SEED, ROUND, 0, focus, 2);

    expect(runA.length).toBe(runB.length);
    for (let i = 0; i < runA.length; i++) {
      expect(runA[i].business.ebitda).toBe(runB[i].business.ebitda);
      expect(runA[i].business.ebitdaMargin).toBe(runB[i].business.ebitdaMargin);
      expect(runA[i].askingPrice).toBe(runB[i].askingPrice);
      expect(runA[i].business.acquisitionMultiple).toBe(runB[i].business.acquisitionMultiple);
      expect(runA[i].business.revenue).toBe(runB[i].business.revenue);
      expect(runA[i].business.qualityRating).toBe(runB[i].business.qualityRating);
      expect(runA[i].business.sectorId).toBe(runB[i].business.sectorId);
      expect(runA[i].business.subType).toBe(runB[i].business.subType);
    }
  });

  it('proactiveOutreach is deterministic for the same priorOutreachCount', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    resetBusinessIdCounter(); resetUsedNames();
    const runA = simulateProactiveOutreach(SEED, ROUND, 0, focus);

    resetBusinessIdCounter(); resetUsedNames();
    const runB = simulateProactiveOutreach(SEED, ROUND, 0, focus);

    expect(runA.length).toBe(runB.length);
    for (let i = 0; i < runA.length; i++) {
      expect(runA[i].business.ebitda).toBe(runB[i].business.ebitda);
      expect(runA[i].business.ebitdaMargin).toBe(runB[i].business.ebitdaMargin);
      expect(runA[i].askingPrice).toBe(runB[i].askingPrice);
      expect(runA[i].business.acquisitionMultiple).toBe(runB[i].business.acquisitionMultiple);
    }
  });

  it('determinism holds across different seeds', () => {
    const focus = makeMAFocus();
    const seeds = [1, 999, 2147483647, -42];

    for (const seed of seeds) {
      resetBusinessIdCounter(); resetUsedNames();
      const runA = simulateSourceDealFlow(seed, ROUND, 2, focus);

      resetBusinessIdCounter(); resetUsedNames();
      const runB = simulateSourceDealFlow(seed, ROUND, 2, focus);

      expect(runA.length).toBe(runB.length);
      for (let i = 0; i < runA.length; i++) {
        expect(runA[i].business.ebitda).toBe(runB[i].business.ebitda);
        expect(runA[i].askingPrice).toBe(runB[i].askingPrice);
      }
    }
  });
});

describe('pipeline MA Sourcing bonus deals differ from manually sourced deals', () => {
  it('generateDealPipeline sourcing bonus deals are not identical to generateSourcedDeals', () => {
    // generateDealPipeline at Tier 2+ with MA focus produces sourcing bonus
    // deals using the same base RNG stream (deals). These should differ from
    // player-triggered generateSourcedDeals because the latter uses a forked
    // stream (source-N) while the pipeline uses the unforked deals stream.
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    // Pipeline deals: uses unforked deals stream
    resetBusinessIdCounter(); resetUsedNames();
    const pipelineStreams = createRngStreams(SEED, ROUND);
    const pipelineDeals = generateDealPipeline(
      [],          // currentPipeline
      ROUND,
      focus,
      undefined,   // portfolioFocusSector
      undefined,   // portfolioFocusTier
      5000,        // portfolioEbitda
      2,           // maSourcingTier
      true,        // maSourcingActive
      undefined,   // lastEventType
      20,          // maxRounds
      false,       // creditTighteningActive
      pipelineStreams.deals
    );

    // Manually sourced deals: uses forked stream (source-0)
    resetBusinessIdCounter(); resetUsedNames();
    const sourcedDeals = simulateSourceDealFlow(SEED, ROUND, 0, focus, 2);

    // Both should produce deals
    expect(pipelineDeals.length).toBeGreaterThan(0);
    expect(sourcedDeals.length).toBeGreaterThan(0);

    // Financial characteristics should differ (different RNG consumption paths)
    // Compare first deal from each
    const pipelineFp = financialFingerprint(pipelineDeals[0]);
    const sourcedFp = financialFingerprint(sourcedDeals[0]);

    const allSame = (
      pipelineFp.ebitda === sourcedFp.ebitda &&
      pipelineFp.margin === sourcedFp.margin &&
      pipelineFp.askingPrice === sourcedFp.askingPrice &&
      pipelineFp.multiple === sourcedFp.multiple &&
      pipelineFp.revenue === sourcedFp.revenue
    );
    expect(allSame).toBe(false);
  });
});

describe('names are now deterministic — generateBusiness with same seed produces same name', () => {
  it('same RNG seed produces identical business name', () => {
    const sectorId = AGENCY_SECTOR;

    resetBusinessIdCounter(); resetUsedNames();
    const streams1 = createRngStreams(SEED, ROUND);
    const biz1 = generateBusiness(sectorId, ROUND, undefined, undefined, streams1.deals);

    resetBusinessIdCounter(); resetUsedNames();
    const streams2 = createRngStreams(SEED, ROUND);
    const biz2 = generateBusiness(sectorId, ROUND, undefined, undefined, streams2.deals);

    expect(biz1.name).toBe(biz2.name);
  });

  it('name determinism holds with forced sub-type', () => {
    resetBusinessIdCounter(); resetUsedNames();
    const streams1 = createRngStreams(SEED, ROUND);
    const biz1 = generateBusiness(AGENCY_SECTOR, ROUND, 3, AGENCY_SUBTYPE, streams1.deals);

    resetBusinessIdCounter(); resetUsedNames();
    const streams2 = createRngStreams(SEED, ROUND);
    const biz2 = generateBusiness(AGENCY_SECTOR, ROUND, 3, AGENCY_SUBTYPE, streams2.deals);

    expect(biz1.name).toBe(biz2.name);
  });

  it('name determinism holds across all sectors', () => {
    for (const sector of SECTOR_LIST) {
      resetBusinessIdCounter(); resetUsedNames();
      const streams1 = createRngStreams(SEED, ROUND);
      const biz1 = generateBusiness(sector.id, ROUND, undefined, undefined, streams1.deals);

      resetBusinessIdCounter(); resetUsedNames();
      const streams2 = createRngStreams(SEED, ROUND);
      const biz2 = generateBusiness(sector.id, ROUND, undefined, undefined, streams2.deals);

      expect(biz1.name).toBe(biz2.name);
    }
  });

  it('different seeds produce different names (most of the time)', () => {
    resetBusinessIdCounter(); resetUsedNames();
    const streams1 = createRngStreams(SEED, ROUND);
    const biz1 = generateBusiness(AGENCY_SECTOR, ROUND, undefined, undefined, streams1.deals);

    resetBusinessIdCounter(); resetUsedNames();
    const streams2 = createRngStreams(9999, ROUND);
    const biz2 = generateBusiness(AGENCY_SECTOR, ROUND, undefined, undefined, streams2.deals);

    // With different seeds, names should differ (not guaranteed but extremely likely)
    expect(biz1.name).not.toBe(biz2.name);
  });

  it('sourced deal names are deterministic across runs', () => {
    const focus = makeMAFocus();

    resetBusinessIdCounter(); resetUsedNames();
    const runA = simulateSourceDealFlow(SEED, ROUND, 0, focus);

    resetBusinessIdCounter(); resetUsedNames();
    const runB = simulateSourceDealFlow(SEED, ROUND, 0, focus);

    for (let i = 0; i < runA.length; i++) {
      expect(runA[i].business.name).toBe(runB[i].business.name);
    }
  });
});

describe('edge case: sourcing with sub-type targeting at Tier 2+', () => {
  it('Tier 2 sub-type targeted sourcing produces different deals across calls', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    resetBusinessIdCounter(); resetUsedNames();
    const batch0 = simulateSourceDealFlow(SEED, ROUND, 0, focus, 2);

    resetBusinessIdCounter(); resetUsedNames();
    const batch1 = simulateSourceDealFlow(SEED, ROUND, 1, focus, 2);

    expect(batch0.length).toBeGreaterThan(0);
    expect(batch1.length).toBeGreaterThan(0);
    expect(dealsFinanciallyDiffer(batch0, batch1)).toBe(true);
  });

  it('Tier 2 sub-type targeted deals within same batch have varied financials', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    resetBusinessIdCounter(); resetUsedNames();
    const batch = simulateSourceDealFlow(SEED, ROUND, 0, focus, 2);

    // All deals with same sub-type forced should still have different EBITDA/margin
    const sameSectorDeals = batch.filter(d => d.business.sectorId === AGENCY_SECTOR);
    expect(sameSectorDeals.length).toBeGreaterThanOrEqual(2);

    const ebitdas = sameSectorDeals.map(d => d.business.ebitda);
    const uniqueEbitdas = new Set(ebitdas);
    // With different RNG pulls per deal, EBITDA should vary
    expect(uniqueEbitdas.size).toBeGreaterThanOrEqual(2);
  });

  it('Tier 3 with sub-type targeting also deduplicates across calls', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    resetBusinessIdCounter(); resetUsedNames();
    const batch0 = simulateSourceDealFlow(SEED, ROUND, 0, focus, 3);

    resetBusinessIdCounter(); resetUsedNames();
    const batch1 = simulateSourceDealFlow(SEED, ROUND, 1, focus, 3);

    expect(dealsFinanciallyDiffer(batch0, batch1)).toBe(true);
  });

  it('sub-type targeting works across multiple sectors', () => {
    // Test with SaaS sector and a specific sub-type
    const focus = makeMAFocus({
      sectorId: 'saas',
      subType: 'Vertical-Market SaaS',
    });

    resetBusinessIdCounter(); resetUsedNames();
    const batch0 = simulateSourceDealFlow(SEED, ROUND, 0, focus, 2);

    resetBusinessIdCounter(); resetUsedNames();
    const batch1 = simulateSourceDealFlow(SEED, ROUND, 1, focus, 2);

    expect(dealsFinanciallyDiffer(batch0, batch1)).toBe(true);
  });
});

describe('edge case: sourcing at Tier 3 with quality floor 3', () => {
  it('Tier 3 quality-floor-3 deals still differ between sourcing calls', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    // Tier 3 forces qualityFloor = 3
    resetBusinessIdCounter(); resetUsedNames();
    const batch0 = simulateSourceDealFlow(SEED, ROUND, 0, focus, 3);

    resetBusinessIdCounter(); resetUsedNames();
    const batch1 = simulateSourceDealFlow(SEED, ROUND, 1, focus, 3);

    // All deals should have quality >= 3
    for (const deal of [...batch0, ...batch1]) {
      expect(deal.business.qualityRating).toBeGreaterThanOrEqual(3);
    }

    // But financials must still differ between batches
    expect(dealsFinanciallyDiffer(batch0, batch1)).toBe(true);
  });

  it('Tier 3 proactive outreach also produces quality 3+ deals that differ', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    resetBusinessIdCounter(); resetUsedNames();
    const batch0 = simulateProactiveOutreach(SEED, ROUND, 0, focus);

    resetBusinessIdCounter(); resetUsedNames();
    const batch1 = simulateProactiveOutreach(SEED, ROUND, 1, focus);

    // Proactive outreach forces qualityFloor: 3
    for (const deal of [...batch0, ...batch1]) {
      expect(deal.business.qualityRating).toBeGreaterThanOrEqual(3);
    }

    expect(dealsFinanciallyDiffer(batch0, batch1)).toBe(true);
  });

  it('five consecutive Tier 3 sourcing calls all produce unique financial profiles', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });
    const batches: Deal[][] = [];

    for (let i = 0; i < 5; i++) {
      resetBusinessIdCounter(); resetUsedNames();
      batches.push(simulateSourceDealFlow(SEED, ROUND, i, focus, 3));
    }

    // Every pair of batches should differ
    for (let i = 0; i < batches.length; i++) {
      for (let j = i + 1; j < batches.length; j++) {
        expect(dealsFinanciallyDiffer(batches[i], batches[j])).toBe(true);
      }
    }
  });

  it('Tier 3 sourcing with constrained quality still has margin/EBITDA variance within batch', () => {
    const focus = makeMAFocus({ subType: AGENCY_SUBTYPE });

    resetBusinessIdCounter(); resetUsedNames();
    const batch = simulateSourceDealFlow(SEED, ROUND, 0, focus, 3);

    // Even with quality floor, margin/EBITDA comes from continuous RNG draws
    // so deals within a batch should have some variance
    const margins = batch.map(d => d.business.ebitdaMargin);
    const ebitdas = batch.map(d => d.business.ebitda);

    const uniqueMargins = new Set(margins.map(m => m.toFixed(4)));
    const uniqueEbitdas = new Set(ebitdas);

    // At least 2 different margin values among the batch's deals
    expect(uniqueMargins.size).toBeGreaterThanOrEqual(2);
    expect(uniqueEbitdas.size).toBeGreaterThanOrEqual(2);
  });
});

describe('fork key isolation — different fork keys never collide', () => {
  it('source-0 and outreach-0 produce different RNG sequences', () => {
    const streams = createRngStreams(SEED, ROUND);

    const sourceRng = streams.deals.fork('source-0');
    // Re-create streams to get a fresh deals stream (fork consumes no state
    // but we want a pristine parent)
    const streams2 = createRngStreams(SEED, ROUND);
    const outreachRng = streams2.deals.fork('outreach-0');

    // The first values from each fork should differ
    const sourceVal = sourceRng.next();
    const outreachVal = outreachRng.next();

    expect(sourceVal).not.toBe(outreachVal);
  });

  it('source-0 and source-1 produce different RNG sequences', () => {
    const streams1 = createRngStreams(SEED, ROUND);
    const streams2 = createRngStreams(SEED, ROUND);

    const fork0 = streams1.deals.fork('source-0');
    const fork1 = streams2.deals.fork('source-1');

    // Collect 10 values from each to be thorough
    const vals0 = Array.from({ length: 10 }, () => fork0.next());
    const vals1 = Array.from({ length: 10 }, () => fork1.next());

    // At least the first value should differ (it's extremely unlikely
    // that two different fork keys produce identical sequences)
    expect(vals0[0]).not.toBe(vals1[0]);
    expect(vals0).not.toEqual(vals1);
  });
});
