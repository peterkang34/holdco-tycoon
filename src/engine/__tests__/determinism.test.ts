import { describe, it, expect } from 'vitest';
import { createRngStreams } from '../rng';
import { generateBusiness, generateDealPipeline, createStartingBusiness } from '../businesses';
import { generateEvent, applyOrganicGrowth } from '../simulation';
import type { GameState, Business } from '../types';
import { SECTOR_LIST } from '../../data/sectors';

/**
 * Determinism tests for the seeded RNG system.
 *
 * These verify that the same seed + same decisions produce identical outcomes,
 * and that different rounds produce different outcomes.
 */

// Helper: create a minimal game state for event generation
function makeGameState(businesses: Business[], round: number = 1): GameState {
  return {
    holdcoName: 'Test Holdco',
    seed: 42,
    round,
    phase: 'collect',
    gameOver: false,
    difficulty: 'easy',
    duration: 'standard',
    maxRounds: 20,
    businesses,
    exitedBusinesses: [],
    cash: 10000,
    totalDebt: 0,
    interestRate: 0.07,
    sharesOutstanding: 1000,
    founderShares: 800,
    initialRaiseAmount: 20000,
    initialOwnershipPct: 0.80,
    totalInvestedCapital: 5000,
    totalDistributions: 0,
    totalBuybacks: 0,
    totalExitProceeds: 0,
    equityRaisesUsed: 0,
    lastEquityRaiseRound: 0,
    lastBuybackRound: 0,
    sharedServices: [],
    dealPipeline: [],
    maFocus: { sectorId: null, sizePreference: 'any', subType: null },
    maSourcing: { tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 },
    integratedPlatforms: [],
    turnaroundTier: 0,
    activeTurnarounds: [],
    currentEvent: null,
    eventHistory: [],
    creditTighteningRoundsRemaining: 0,
    inflationRoundsRemaining: 0,
    metricsHistory: [],
    roundHistory: [],
    actionsThisRound: [],
    debtPaymentThisRound: 0,
    cashBeforeDebtPayments: 0,
    holdcoLoanBalance: 0,
    holdcoLoanRate: 0,
    holdcoLoanRoundsRemaining: 0,
    holdcoDebtStartRound: 0,
    requiresRestructuring: false,
    covenantBreachRounds: 0,
    hasRestructured: false,
    exitMultiplePenalty: 0,
    acquisitionsThisRound: 0,
    maxAcquisitionsPerRound: 2,
    lastAcquisitionResult: null,
    lastIntegrationOutcome: null,
    founderDistributionsReceived: 0,
    bankruptRound: undefined,
    holdcoAmortizationThisRound: 0,
    consolidationBoomSectorId: undefined,
  } as GameState;
}

describe('Deal generation determinism', () => {
  it('same seed + round = identical deal pipeline', () => {
    const seed = 42;
    const round = 3;
    const streams1 = createRngStreams(seed, round);
    const streams2 = createRngStreams(seed, round);

    const pipeline1 = generateDealPipeline([], round, undefined, undefined, undefined, 0, 0, false, undefined, 20, false, streams1.deals);
    const pipeline2 = generateDealPipeline([], round, undefined, undefined, undefined, 0, 0, false, undefined, 20, false, streams2.deals);

    expect(pipeline1.length).toBe(pipeline2.length);
    for (let i = 0; i < pipeline1.length; i++) {
      expect(pipeline1[i].business.sectorId).toBe(pipeline2[i].business.sectorId);
      expect(pipeline1[i].askingPrice).toBe(pipeline2[i].askingPrice);
      expect(pipeline1[i].business.ebitda).toBe(pipeline2[i].business.ebitda);
      expect(pipeline1[i].business.qualityRating).toBe(pipeline2[i].business.qualityRating);
      expect(pipeline1[i].heat).toBe(pipeline2[i].heat);
    }
  });

  it('different rounds = different deal pipelines', () => {
    const seed = 42;
    const streams1 = createRngStreams(seed, 1);
    const streams2 = createRngStreams(seed, 5);

    const pipeline1 = generateDealPipeline([], 1, undefined, undefined, undefined, 0, 0, false, undefined, 20, false, streams1.deals);
    const pipeline2 = generateDealPipeline([], 5, undefined, undefined, undefined, 0, 0, false, undefined, 20, false, streams2.deals);

    // Pipelines should differ in at least some deals
    const sectors1 = pipeline1.map(d => d.business.sectorId).join(',');
    const sectors2 = pipeline2.map(d => d.business.sectorId).join(',');
    // Very unlikely to be identical given different seeds
    const prices1 = pipeline1.map(d => d.askingPrice);
    const prices2 = pipeline2.map(d => d.askingPrice);
    expect(prices1).not.toEqual(prices2);
  });
});

describe('Business generation determinism', () => {
  it('same seed = identical business', () => {
    const sectorId = SECTOR_LIST[0].id;
    const streams1 = createRngStreams(42, 1);
    const streams2 = createRngStreams(42, 1);

    const biz1 = generateBusiness(sectorId, 1, undefined, undefined, streams1.deals);
    const biz2 = generateBusiness(sectorId, 1, undefined, undefined, streams2.deals);

    expect(biz1.ebitda).toBe(biz2.ebitda);
    expect(biz1.revenue).toBe(biz2.revenue);
    expect(biz1.qualityRating).toBe(biz2.qualityRating);
    expect(biz1.ebitdaMargin).toBe(biz2.ebitdaMargin);
    expect(biz1.acquisitionMultiple).toBe(biz2.acquisitionMultiple);
    expect(biz1.organicGrowthRate).toBe(biz2.organicGrowthRate);
    expect(biz1.subType).toBe(biz2.subType);
  });
});

describe('Event generation determinism', () => {
  it('same seed + state = identical event', () => {
    const biz = createStartingBusiness('agency', 1000, 8);
    const state = makeGameState([biz], 5);

    const streams1 = createRngStreams(42, 5);
    const streams2 = createRngStreams(42, 5);

    const event1 = generateEvent(state, streams1.events);
    const event2 = generateEvent(state, streams2.events);

    if (event1 && event2) {
      expect(event1.type).toBe(event2.type);
      expect(event1.title).toBe(event2.title);
    } else {
      // Both should be null or both non-null
      expect(event1).toBe(event2);
    }
  });
});

describe('Organic growth determinism', () => {
  it('same seed = identical growth outcomes', () => {
    const biz = createStartingBusiness('agency', 1000, 8);

    const streams1 = createRngStreams(42, 3);
    const streams2 = createRngStreams(42, 3);

    const grown1 = applyOrganicGrowth(biz, 0, 0, false, undefined, undefined, 3, 0, 20, streams1.simulation);
    const grown2 = applyOrganicGrowth(biz, 0, 0, false, undefined, undefined, 3, 0, 20, streams2.simulation);

    expect(grown1.ebitda).toBe(grown2.ebitda);
    expect(grown1.revenue).toBe(grown2.revenue);
    expect(grown1.ebitdaMargin).toBe(grown2.ebitdaMargin);
  });
});

describe('Stream isolation', () => {
  it('consuming deals stream does not affect events stream', () => {
    const seed = 42;
    const round = 3;

    // Scenario A: generate deals first, then events
    const streamsA = createRngStreams(seed, round);
    generateDealPipeline([], round, undefined, undefined, undefined, 0, 0, false, undefined, 20, false, streamsA.deals);
    const eventA = generateEvent(makeGameState([createStartingBusiness('agency', 1000, 8)], round), streamsA.events);

    // Scenario B: skip deals, go straight to events
    const streamsB = createRngStreams(seed, round);
    // Don't touch deals stream
    const eventB = generateEvent(makeGameState([createStartingBusiness('agency', 1000, 8)], round), streamsB.events);

    // Events should be identical regardless of deals stream usage
    if (eventA && eventB) {
      expect(eventA.type).toBe(eventB.type);
      expect(eventA.title).toBe(eventB.title);
    } else {
      expect(eventA).toBe(eventB);
    }
  });

  it('round isolation: different rounds produce independent streams', () => {
    const seed = 42;
    const streams1 = createRngStreams(seed, 1);
    const streams5 = createRngStreams(seed, 5);

    // These should produce different values
    const val1 = streams1.deals.next();
    const val5 = streams5.deals.next();
    expect(val1).not.toBe(val5);
  });
});
