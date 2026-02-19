import { describe, it, expect } from 'vitest';
import { createRngStreams, SeededRng, deriveRoundSeed, deriveStreamSeed } from '../rng';
import { generateBusiness, generateDealPipeline, createStartingBusiness, resetBusinessIdCounter } from '../businesses';
import { generateEvent, applyOrganicGrowth, applyEventEffects } from '../simulation';
import { resolveTurnaround } from '../turnarounds';
import { getAvailablePrograms } from '../../data/turnaroundPrograms';
import type { GameState, Business } from '../types';
import { SECTOR_LIST } from '../../data/sectors';

/**
 * Determinism tests for the seeded RNG system.
 *
 * These verify that the same seed + same decisions produce identical outcomes,
 * and that different rounds produce different outcomes.
 *
 * Critical for challenge mode: two players with the same seed MUST get
 * identical starting businesses, events, deals, and growth outcomes.
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
    isChallenge: false,
    bankruptRound: undefined,
    holdcoAmortizationThisRound: 0,
    consolidationBoomSectorId: undefined,
  } as GameState;
}

// ── Existing Tests (preserved) ─────────────────────────────────────

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

// ── NEW: Challenge-Mode Determinism (catches the seeded RNG bugs) ──

describe('createStartingBusiness determinism (challenge-mode critical)', () => {
  it('same seed produces identical starting businesses', () => {
    // THE BUG: createStartingBusiness was called WITHOUT rng, so
    // margin/subType/dueDiligence used Math.random() and differed per player.
    // FIX: pass rng from round1Streams.cosmetic
    const seed = 42;

    resetBusinessIdCounter();
    const streams1 = createRngStreams(seed, 1);
    const biz1 = createStartingBusiness('agency', 1000, 8, streams1.cosmetic);

    resetBusinessIdCounter();
    const streams2 = createRngStreams(seed, 1);
    const biz2 = createStartingBusiness('agency', 1000, 8, streams2.cosmetic);

    // Every field that depends on RNG must match
    expect(biz1.ebitdaMargin).toBe(biz2.ebitdaMargin);
    expect(biz1.revenue).toBe(biz2.revenue);
    expect(biz1.ebitda).toBe(biz2.ebitda);
    expect(biz1.subType).toBe(biz2.subType);
    expect(biz1.organicGrowthRate).toBe(biz2.organicGrowthRate);
    expect(biz1.revenueGrowthRate).toBe(biz2.revenueGrowthRate);
    expect(biz1.marginDriftRate).toBe(biz2.marginDriftRate);
    expect(biz1.acquisitionMultiple).toBe(biz2.acquisitionMultiple);
    expect(biz1.acquisitionPrice).toBe(biz2.acquisitionPrice);
    expect(biz1.qualityRating).toBe(biz2.qualityRating);
    // Due diligence signals must also match
    expect(biz1.dueDiligence.operatorQuality).toBe(biz2.dueDiligence.operatorQuality);
    expect(biz1.dueDiligence.revenueConcentration).toBe(biz2.dueDiligence.revenueConcentration);
    expect(biz1.dueDiligence.trend).toBe(biz2.dueDiligence.trend);
    expect(biz1.dueDiligence.competitivePosition).toBe(biz2.dueDiligence.competitivePosition);
    expect(biz1.dueDiligence.customerRetention).toBe(biz2.dueDiligence.customerRetention);
  });

  it('different seeds produce different starting businesses', () => {
    resetBusinessIdCounter();
    const streams1 = createRngStreams(42, 1);
    const biz1 = createStartingBusiness('agency', 1000, 8, streams1.cosmetic);

    resetBusinessIdCounter();
    const streams2 = createRngStreams(99, 1);
    const biz2 = createStartingBusiness('agency', 1000, 8, streams2.cosmetic);

    // At least some field should differ (extremely likely with different seeds)
    const allSame = (
      biz1.ebitdaMargin === biz2.ebitdaMargin &&
      biz1.subType === biz2.subType &&
      biz1.organicGrowthRate === biz2.organicGrowthRate &&
      biz1.dueDiligence.customerRetention === biz2.dueDiligence.customerRetention
    );
    expect(allSame).toBe(false);
  });

  it('works across all sectors', () => {
    // Verify determinism holds for every sector, not just agency
    for (const sector of SECTOR_LIST) {
      resetBusinessIdCounter();
      const streams1 = createRngStreams(42, 1);
      const biz1 = createStartingBusiness(sector.id, 1000, undefined, streams1.cosmetic);

      resetBusinessIdCounter();
      const streams2 = createRngStreams(42, 1);
      const biz2 = createStartingBusiness(sector.id, 1000, undefined, streams2.cosmetic);

      expect(biz1.ebitdaMargin).toBe(biz2.ebitdaMargin);
      expect(biz1.subType).toBe(biz2.subType);
      expect(biz1.revenue).toBe(biz2.revenue);
    }
  });
});

describe('generateEvent determinism with seeded starting business', () => {
  it('same seed produces identical event when business is also seeded', () => {
    // THE BUG: even if generateEvent was seeded, the starting business
    // was created without rng, so the game state differed between players.
    // This test ensures the FULL pipeline is deterministic.
    const seed = 42;

    resetBusinessIdCounter();
    const streams1 = createRngStreams(seed, 1);
    const biz1 = createStartingBusiness('agency', 1000, 8, streams1.cosmetic);
    const state1 = makeGameState([biz1], 5);

    resetBusinessIdCounter();
    const streams2 = createRngStreams(seed, 1);
    const biz2 = createStartingBusiness('agency', 1000, 8, streams2.cosmetic);
    const state2 = makeGameState([biz2], 5);

    // Events use round 5 streams
    const eventStreams1 = createRngStreams(seed, 5);
    const eventStreams2 = createRngStreams(seed, 5);

    const event1 = generateEvent(state1, eventStreams1.events);
    const event2 = generateEvent(state2, eventStreams2.events);

    // Both must produce the same event
    expect(event1?.type).toBe(event2?.type);
    expect(event1?.title).toBe(event2?.title);
    if (event1?.affectedBusinessId && event2?.affectedBusinessId) {
      expect(event1.affectedBusinessId).toBe(event2.affectedBusinessId);
    }
  });
});

describe('applyOrganicGrowth determinism with seeded business', () => {
  it('same seeded business + same RNG produces identical growth', () => {
    const seed = 42;

    resetBusinessIdCounter();
    const streams1 = createRngStreams(seed, 1);
    const biz1 = createStartingBusiness('agency', 1000, 8, streams1.cosmetic);

    resetBusinessIdCounter();
    const streams2 = createRngStreams(seed, 1);
    const biz2 = createStartingBusiness('agency', 1000, 8, streams2.cosmetic);

    // Growth uses round 3 simulation stream
    const growStreams1 = createRngStreams(seed, 3);
    const growStreams2 = createRngStreams(seed, 3);

    const grown1 = applyOrganicGrowth(biz1, 0, 0, false, undefined, undefined, 3, 0, 20, growStreams1.simulation);
    const grown2 = applyOrganicGrowth(biz2, 0, 0, false, undefined, undefined, 3, 0, 20, growStreams2.simulation);

    expect(grown1.ebitda).toBe(grown2.ebitda);
    expect(grown1.revenue).toBe(grown2.revenue);
    expect(grown1.ebitdaMargin).toBe(grown2.ebitdaMargin);
    expect(grown1.organicGrowthRate).toBe(grown2.organicGrowthRate);
  });

  it('growth with margin drift active is deterministic', () => {
    const seed = 42;

    resetBusinessIdCounter();
    const streams1 = createRngStreams(seed, 1);
    const biz1 = createStartingBusiness('agency', 1000, 8, streams1.cosmetic);

    resetBusinessIdCounter();
    const streams2 = createRngStreams(seed, 1);
    const biz2 = createStartingBusiness('agency', 1000, 8, streams2.cosmetic);

    // Round 6 (past marginDriftStart of 4 for 20-round game)
    const growStreams1 = createRngStreams(seed, 6);
    const growStreams2 = createRngStreams(seed, 6);

    const grown1 = applyOrganicGrowth(biz1, 0, 0, false, undefined, undefined, 6, 0, 20, growStreams1.simulation);
    const grown2 = applyOrganicGrowth(biz2, 0, 0, false, undefined, undefined, 6, 0, 20, growStreams2.simulation);

    expect(grown1.ebitda).toBe(grown2.ebitda);
    expect(grown1.ebitdaMargin).toBe(grown2.ebitdaMargin);
  });
});

describe('resolveTurnaround determinism', () => {
  it('same random value produces identical outcomes', () => {
    // THE BUG: resolveTurnaround was called with Math.random() default
    // instead of a pre-rolled value from the seeded RNG.
    const programs = getAvailablePrograms(1);
    // Skip if no programs available at tier 1
    if (programs.length === 0) return;
    const program = programs[0];

    // Same roll value = same outcome
    const outcome1 = resolveTurnaround(program, 0, 0.35);
    const outcome2 = resolveTurnaround(program, 0, 0.35);

    expect(outcome1.result).toBe(outcome2.result);
    expect(outcome1.qualityChange).toBe(outcome2.qualityChange);
    expect(outcome1.ebitdaMultiplier).toBe(outcome2.ebitdaMultiplier);
    expect(outcome1.targetQuality).toBe(outcome2.targetQuality);
  });

  it('different roll values produce different outcomes (boundary test)', () => {
    const programs = getAvailablePrograms(1);
    if (programs.length === 0) return;
    const program = programs[0];

    // Roll at 0 should be success (below successRate)
    const success = resolveTurnaround(program, 0, 0);
    expect(success.result).toBe('success');

    // Roll at 0.999 should be failure (above successRate + partialRate)
    const failure = resolveTurnaround(program, 0, 0.999);
    expect(failure.result).toBe('failure');
  });

  it('pre-rolled values from seeded RNG are deterministic', () => {
    const seed = 42;
    const streams1 = createRngStreams(seed, 5);
    const streams2 = createRngStreams(seed, 5);

    // Simulate pre-rolling from market stream (as the game does)
    const roll1 = streams1.market.next();
    const roll2 = streams2.market.next();

    expect(roll1).toBe(roll2);

    const programs = getAvailablePrograms(1);
    if (programs.length === 0) return;
    const program = programs[0];

    const outcome1 = resolveTurnaround(program, 0, roll1);
    const outcome2 = resolveTurnaround(program, 0, roll2);

    expect(outcome1.result).toBe(outcome2.result);
  });
});

describe('Challenge sector selection determinism', () => {
  it('same seed always maps to same sector (modulo approach)', () => {
    // THE BUG: in challenge mode, if selectedSector === 'random', the sector
    // was derived as SECTOR_LIST[Math.abs(seed) % SECTOR_LIST.length].id
    // This is purely deterministic (no RNG call), so just verify it.
    const seed = 12345;
    const sectorIndex1 = Math.abs(seed) % SECTOR_LIST.length;
    const sectorIndex2 = Math.abs(seed) % SECTOR_LIST.length;

    expect(sectorIndex1).toBe(sectorIndex2);
    expect(SECTOR_LIST[sectorIndex1].id).toBe(SECTOR_LIST[sectorIndex2].id);
  });

  it('different seeds produce different sectors (most of the time)', () => {
    // With 15 sectors and many seeds, different seeds should usually pick different sectors
    const sectors = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      sectors.add(SECTOR_LIST[Math.abs(seed) % SECTOR_LIST.length].id);
    }
    // Should hit most sectors with 100 different seeds
    expect(sectors.size).toBeGreaterThanOrEqual(10);
  });

  it('modulo approach handles any SECTOR_LIST length', () => {
    // The modulo approach always produces a valid index regardless of list size
    const testSeeds = [0, 1, -1, 42, 999999, -999999, 2147483647, -2147483648];
    for (const seed of testSeeds) {
      const idx = Math.abs(seed) % SECTOR_LIST.length;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(SECTOR_LIST.length);
      expect(SECTOR_LIST[idx]).toBeDefined();
    }
  });
});

describe('Edge cases: seed values', () => {
  it('seed = 0 produces valid, deterministic output', () => {
    const streams1 = createRngStreams(0, 1);
    const streams2 = createRngStreams(0, 1);

    const val1 = streams1.deals.next();
    const val2 = streams2.deals.next();

    expect(val1).toBe(val2);
    expect(val1).toBeGreaterThanOrEqual(0);
    expect(val1).toBeLessThan(1);
  });

  it('negative seed produces valid, deterministic output', () => {
    const streams1 = createRngStreams(-42, 1);
    const streams2 = createRngStreams(-42, 1);

    const val1 = streams1.deals.next();
    const val2 = streams2.deals.next();

    expect(val1).toBe(val2);
    expect(val1).toBeGreaterThanOrEqual(0);
    expect(val1).toBeLessThan(1);
  });

  it('negative seed differs from positive seed', () => {
    const streams1 = createRngStreams(42, 1);
    const streams2 = createRngStreams(-42, 1);

    const val1 = streams1.deals.next();
    const val2 = streams2.deals.next();

    expect(val1).not.toBe(val2);
  });

  it('very large seed (near 32-bit max) is deterministic', () => {
    const largeSeed = 0x7ffffffe; // near MAX_SAFE_INT32
    const streams1 = createRngStreams(largeSeed, 1);
    const streams2 = createRngStreams(largeSeed, 1);

    const val1 = streams1.deals.next();
    const val2 = streams2.deals.next();

    expect(val1).toBe(val2);
  });

  it('seed = 0 still produces varied output across rounds', () => {
    const vals = new Set<number>();
    for (let round = 1; round <= 10; round++) {
      const streams = createRngStreams(0, round);
      vals.add(streams.deals.next());
    }
    // 10 rounds should produce at least 8 different values
    expect(vals.size).toBeGreaterThanOrEqual(8);
  });
});

describe('Full round determinism (challenge-mode end-to-end)', () => {
  it('same seed produces identical round 1 outcomes', () => {
    // Simulates what happens in startGame: create starting business,
    // generate deal pipeline, advance to event phase
    const seed = 12345;

    // --- Player A ---
    resetBusinessIdCounter();
    const streamsA = createRngStreams(seed, 1);
    const sectorIdx = Math.abs(seed) % SECTOR_LIST.length;
    const sectorId = SECTOR_LIST[sectorIdx].id;
    const bizA = createStartingBusiness(sectorId, 1000, 8, streamsA.cosmetic);
    const dealsA = generateDealPipeline([], 1, undefined, undefined, undefined, 0, 0, false, undefined, 20, false, streamsA.deals);
    const stateA = makeGameState([bizA], 1);
    const eventA = generateEvent(stateA, streamsA.events);

    // --- Player B (same seed, fresh state) ---
    resetBusinessIdCounter();
    const streamsB = createRngStreams(seed, 1);
    const bizB = createStartingBusiness(sectorId, 1000, 8, streamsB.cosmetic);
    const dealsB = generateDealPipeline([], 1, undefined, undefined, undefined, 0, 0, false, undefined, 20, false, streamsB.deals);
    const stateB = makeGameState([bizB], 1);
    const eventB = generateEvent(stateB, streamsB.events);

    // Starting businesses must be identical
    expect(bizA.ebitdaMargin).toBe(bizB.ebitdaMargin);
    expect(bizA.revenue).toBe(bizB.revenue);
    expect(bizA.subType).toBe(bizB.subType);
    expect(bizA.qualityRating).toBe(bizB.qualityRating);
    expect(bizA.organicGrowthRate).toBe(bizB.organicGrowthRate);

    // Deal pipelines must be identical
    expect(dealsA.length).toBe(dealsB.length);
    for (let i = 0; i < dealsA.length; i++) {
      expect(dealsA[i].business.sectorId).toBe(dealsB[i].business.sectorId);
      expect(dealsA[i].askingPrice).toBe(dealsB[i].askingPrice);
      expect(dealsA[i].business.ebitda).toBe(dealsB[i].business.ebitda);
      expect(dealsA[i].heat).toBe(dealsB[i].heat);
    }

    // Events must be identical
    expect(eventA?.type).toBe(eventB?.type);
    expect(eventA?.title).toBe(eventB?.title);
  });

  it('same seed produces identical multi-round simulation', () => {
    // Simulate 3 rounds of organic growth to verify determinism compounds correctly
    const seed = 7777;

    function simulateRounds(gameSeed: number): Business {
      resetBusinessIdCounter();
      const startStreams = createRngStreams(gameSeed, 1);
      let biz = createStartingBusiness('agency', 1000, 8, startStreams.cosmetic);

      for (let round = 1; round <= 3; round++) {
        const roundStreams = createRngStreams(gameSeed, round);
        biz = applyOrganicGrowth(biz, 0, 0, false, undefined, undefined, round, 0, 20, roundStreams.simulation);
      }
      return biz;
    }

    const result1 = simulateRounds(seed);
    const result2 = simulateRounds(seed);

    expect(result1.ebitda).toBe(result2.ebitda);
    expect(result1.revenue).toBe(result2.revenue);
    expect(result1.ebitdaMargin).toBe(result2.ebitdaMargin);
    expect(result1.peakEbitda).toBe(result2.peakEbitda);
    expect(result1.peakRevenue).toBe(result2.peakRevenue);
  });

  it('same seed but different player choices lead to divergence', () => {
    // This validates that determinism is about same-decisions-same-outcome,
    // not that the RNG locks everything. Different consumption patterns
    // within the same stream will produce different values.
    const seed = 42;

    const streams1 = createRngStreams(seed, 1);
    const streams2 = createRngStreams(seed, 1);

    // Player 1: consumes 3 values from deals
    streams1.deals.next();
    streams1.deals.next();
    streams1.deals.next();
    const next1 = streams1.deals.next();

    // Player 2: consumes 1 value from deals (made different choice)
    streams2.deals.next();
    const next2 = streams2.deals.next();

    // 4th value of stream 1 != 2nd value of stream 2
    expect(next1).not.toBe(next2);
  });
});

describe('applyEventEffects determinism', () => {
  it('same event + same RNG produces identical state changes', () => {
    const seed = 42;

    resetBusinessIdCounter();
    const startStreams = createRngStreams(seed, 1);
    const biz = createStartingBusiness('agency', 1000, 8, startStreams.cosmetic);
    const state = makeGameState([biz], 3);

    // Create a simple event to apply
    const event = {
      id: 'event_3_global_bull_market',
      type: 'global_bull_market' as const,
      title: 'Bull Market',
      description: 'Markets are up',
      effect: 'Revenue +5-10%',
    };

    const rng1 = createRngStreams(seed, 3);
    const rng2 = createRngStreams(seed, 3);

    const result1 = applyEventEffects(state, event, rng1.events);
    const result2 = applyEventEffects(state, event, rng2.events);

    // Both must produce identical state changes
    expect(result1.businesses[0].revenue).toBe(result2.businesses[0].revenue);
    expect(result1.businesses[0].ebitda).toBe(result2.businesses[0].ebitda);
    expect(result1.businesses[0].ebitdaMargin).toBe(result2.businesses[0].ebitdaMargin);
  });
});

describe('SeededRng properties', () => {
  it('produces values in [0, 1) range', () => {
    const rng = new SeededRng(42);
    for (let i = 0; i < 1000; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('nextInt produces values in [min, max] range', () => {
    const rng = new SeededRng(42);
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(3, 7);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(7);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('pick always returns an element from the array', () => {
    const rng = new SeededRng(42);
    const items = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < 50; i++) {
      const picked = rng.pick(items);
      expect(items).toContain(picked);
    }
  });

  it('pick returns undefined for empty array', () => {
    const rng = new SeededRng(42);
    expect(rng.pick([])).toBeUndefined();
  });

  it('shuffle is deterministic', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);

    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    rng1.shuffle(arr1);
    rng2.shuffle(arr2);

    expect(arr1).toEqual(arr2);
  });

  it('fork produces deterministic sub-RNG', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);

    const forked1 = rng1.fork('business_0');
    const forked2 = rng2.fork('business_0');

    expect(forked1.next()).toBe(forked2.next());
    expect(forked1.next()).toBe(forked2.next());
  });

  it('deriveRoundSeed is deterministic', () => {
    expect(deriveRoundSeed(42, 1)).toBe(deriveRoundSeed(42, 1));
    expect(deriveRoundSeed(42, 1)).not.toBe(deriveRoundSeed(42, 2));
    expect(deriveRoundSeed(42, 1)).not.toBe(deriveRoundSeed(43, 1));
  });

  it('deriveStreamSeed is deterministic', () => {
    const roundSeed = deriveRoundSeed(42, 1);
    expect(deriveStreamSeed(roundSeed, 'deals')).toBe(deriveStreamSeed(roundSeed, 'deals'));
    expect(deriveStreamSeed(roundSeed, 'deals')).not.toBe(deriveStreamSeed(roundSeed, 'events'));
  });
});
