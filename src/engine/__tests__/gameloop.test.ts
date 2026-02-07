import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateAnnualFcf,
  calculatePortfolioFcf,
  calculateSharedServicesBenefits,
  calculateSectorFocusBonus,
  getSectorFocusEbitdaBonus,
  applyOrganicGrowth,
  generateEvent,
  applyEventEffects,
  calculateMetrics,
  recordHistoricalMetrics,
} from '../simulation';
import {
  generateBusiness,
  generateDealPipeline,
  createStartingBusiness,
  resetBusinessIdCounter,
  determineIntegrationOutcome,
  calculateSynergies,
} from '../businesses';
import { generateDealStructures, executeDealStructure } from '../deals';
import { calculateFinalScore, calculateEnterpriseValue } from '../scoring';
import { createMockBusiness, createMockGameState } from './helpers';
import { initializeSharedServices } from '../../data/sharedServices';
import { Business, GameState, SectorId, GamePhase } from '../types';

/**
 * Full game loop simulation tests
 *
 * These tests simulate complete 20-round game playthroughs to verify:
 * - No NaN/Infinity/undefined values propagate through the game state
 * - Game state remains consistent across all phases
 * - Edge cases don't cause crashes
 * - Financial math stays reasonable over 20 rounds
 */

function simulateCollectPhase(state: GameState): GameState {
  // Process opco-level debt payments
  const updatedBusinesses = state.businesses.map(b => {
    if (b.status !== 'active') return b;
    let updated = { ...b };
    if (b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining > 0) {
      const payment = Math.round(b.sellerNoteBalance / b.sellerNoteRoundsRemaining);
      updated.sellerNoteBalance = Math.max(0, b.sellerNoteBalance - payment);
      updated.sellerNoteRoundsRemaining = b.sellerNoteRoundsRemaining - 1;
    }
    return updated;
  });

  return { ...state, businesses: updatedBusinesses, phase: 'collect' as GamePhase };
}

function simulateEventPhase(state: GameState): GameState {
  const sharedBenefits = calculateSharedServicesBenefits(state);
  const annualFcf = calculatePortfolioFcf(
    state.businesses.filter(b => b.status === 'active'),
    sharedBenefits.capexReduction,
    sharedBenefits.cashConversionBonus
  );

  const annualInterest = Math.round(state.totalDebt * state.interestRate);
  const sharedServicesCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);

  const newCash = state.cash + annualFcf - annualInterest - sharedServicesCost;
  const event = generateEvent(state);

  let gameState: GameState = {
    ...state,
    cash: Math.round(newCash),
    currentEvent: event,
    phase: 'event' as GamePhase,
  };

  if (event && event.type !== 'unsolicited_offer') {
    gameState = applyEventEffects(gameState, event);
  }

  if (gameState.creditTighteningRoundsRemaining > 0) {
    gameState.creditTighteningRoundsRemaining--;
  }
  if (gameState.inflationRoundsRemaining > 0) {
    gameState.inflationRoundsRemaining--;
  }

  return {
    ...gameState,
    eventHistory: event ? [...state.eventHistory, event] : state.eventHistory,
  };
}

function simulateEndRound(state: GameState): GameState {
  const sharedBenefits = calculateSharedServicesBenefits(state);
  const focusBonus = calculateSectorFocusBonus(state.businesses);
  const focusEbitdaBonus = focusBonus ? getSectorFocusEbitdaBonus(focusBonus.tier) : 0;

  const updatedBusinesses = state.businesses.map(b => {
    if (b.status !== 'active') return b;
    return applyOrganicGrowth(
      b,
      sharedBenefits.growthBonus,
      focusEbitdaBonus,
      state.inflationRoundsRemaining > 0
    );
  });

  const historyEntry = recordHistoricalMetrics({ ...state, businesses: updatedBusinesses });
  const newRound = state.round + 1;

  return {
    ...state,
    businesses: updatedBusinesses,
    round: newRound,
    metricsHistory: [...state.metricsHistory, historyEntry],
    gameOver: newRound > 20,
    phase: 'collect' as GamePhase,
    currentEvent: null,
  };
}

function validateGameState(state: GameState, context: string) {
  // Check for NaN
  expect(Number.isNaN(state.cash), `Cash is NaN at ${context}`).toBe(false);
  expect(Number.isNaN(state.totalDebt), `TotalDebt is NaN at ${context}`).toBe(false);
  expect(Number.isNaN(state.interestRate), `InterestRate is NaN at ${context}`).toBe(false);
  expect(Number.isNaN(state.sharesOutstanding), `Shares is NaN at ${context}`).toBe(false);

  // Check for Infinity
  expect(Number.isFinite(state.cash), `Cash is Infinite at ${context}`).toBe(true);
  expect(Number.isFinite(state.totalDebt), `TotalDebt is Infinite at ${context}`).toBe(true);

  // Check businesses
  for (const b of state.businesses) {
    expect(Number.isNaN(b.ebitda), `Biz ${b.id} EBITDA is NaN at ${context}`).toBe(false);
    expect(Number.isFinite(b.ebitda), `Biz ${b.id} EBITDA is Infinite at ${context}`).toBe(true);
    expect(Number.isNaN(b.acquisitionMultiple), `Biz ${b.id} multiple is NaN at ${context}`).toBe(false);
    expect(Number.isNaN(b.organicGrowthRate), `Biz ${b.id} growthRate is NaN at ${context}`).toBe(false);
  }

  // Check metrics
  const metrics = calculateMetrics(state);
  expect(Number.isNaN(metrics.totalEbitda), `totalEbitda is NaN at ${context}`).toBe(false);
  expect(Number.isNaN(metrics.totalFcf), `totalFcf is NaN at ${context}`).toBe(false);
  expect(Number.isNaN(metrics.portfolioRoic), `portfolioRoic is NaN at ${context}`).toBe(false);
}

describe('Full Game Simulation - No Acquisitions', () => {
  it('should complete 20 rounds with just the starting business', () => {
    resetBusinessIdCounter();
    let state = createMockGameState({ round: 1 });

    for (let round = 1; round <= 20; round++) {
      state = simulateCollectPhase(state);
      validateGameState(state, `collect round ${round}`);

      state = simulateEventPhase(state);
      validateGameState(state, `event round ${round}`);

      state = simulateEndRound(state);
      validateGameState(state, `end round ${round}`);
    }

    // Game should be over
    expect(state.gameOver).toBe(true);
    expect(state.round).toBe(21);

    // Cash should have grown from FCF collection
    expect(state.cash).toBeGreaterThan(0);

    // Should have 20 history entries
    expect(state.metricsHistory.length).toBe(20);

    // Final score should compute without errors
    const score = calculateFinalScore(state);
    expect(Number.isNaN(score.total)).toBe(false);
    expect(score.total).toBeGreaterThanOrEqual(0);

    const ev = calculateEnterpriseValue(state);
    expect(ev).toBeGreaterThan(0);
  });
});

describe('Full Game Simulation - Aggressive Acquirer', () => {
  it('should handle multiple acquisitions per round', () => {
    resetBusinessIdCounter();

    const startingBiz = createStartingBusiness('agency');
    let state: GameState = {
      ...createMockGameState(),
      round: 1,
      businesses: [startingBiz],
      cash: 20000 - startingBiz.acquisitionPrice,
      totalInvestedCapital: startingBiz.acquisitionPrice,
    };

    for (let round = 1; round <= 20; round++) {
      state = simulateCollectPhase(state);
      state = simulateEventPhase(state);

      // Generate deals
      const pipeline = generateDealPipeline(state.dealPipeline, round);
      state = { ...state, dealPipeline: pipeline };

      // Try to acquire 1-2 businesses per round if we can afford it
      const activeCount = state.businesses.filter(b => b.status === 'active').length;
      if (activeCount < 10) {
        for (const deal of pipeline.slice(0, 2)) {
          const structures = generateDealStructures(
            deal,
            state.cash,
            state.interestRate,
            state.creditTighteningRoundsRemaining > 0
          );

          if (structures.length > 0) {
            const struct = structures[0]; // Pick first available
            if (state.cash >= struct.cashRequired) {
              const newBiz = executeDealStructure(deal, struct, round);
              newBiz.isPlatform = deal.acquisitionType === 'platform';
              newBiz.platformScale = deal.acquisitionType === 'platform' ? 1 : 0;
              newBiz.boltOnIds = [];
              newBiz.synergiesRealized = 0;
              newBiz.totalAcquisitionCost = deal.askingPrice;

              state = {
                ...state,
                cash: state.cash - struct.cashRequired,
                totalDebt: state.totalDebt + (struct.bankDebt?.amount ?? 0),
                totalInvestedCapital: state.totalInvestedCapital + deal.askingPrice,
                businesses: [...state.businesses, newBiz],
                dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
              };
            }
          }
        }
      }

      validateGameState(state, `allocate round ${round}`);
      state = simulateEndRound(state);
      validateGameState(state, `end round ${round}`);
    }

    expect(state.gameOver).toBe(true);

    // Should have acquired at least some businesses
    const totalBiz = state.businesses.length;
    expect(totalBiz).toBeGreaterThan(1);

    const score = calculateFinalScore(state);
    expect(Number.isNaN(score.total)).toBe(false);

    const ev = calculateEnterpriseValue(state);
    expect(Number.isNaN(ev)).toBe(false);
    expect(ev).toBeGreaterThanOrEqual(0);
  });
});

describe('Full Game Simulation - Debt Heavy Strategy', () => {
  it('should handle high leverage without NaN', () => {
    resetBusinessIdCounter();
    let state = createMockGameState({
      totalDebt: 15000, // Very high leverage
      cash: 5000,
    });

    for (let round = 1; round <= 20; round++) {
      state = simulateCollectPhase(state);
      state = simulateEventPhase(state);
      state = simulateEndRound(state);
      validateGameState(state, `round ${round}`);
    }

    // Cash might go negative from interest, which is a potential issue
    // But game should still complete
    expect(state.gameOver).toBe(true);

    const score = calculateFinalScore(state);
    expect(Number.isNaN(score.total)).toBe(false);
  });
});

describe('Full Game Simulation - Empty Portfolio', () => {
  it('should handle selling all businesses', () => {
    let state = createMockGameState({
      businesses: [], // No businesses at all
      cash: 20000,
    });

    for (let round = 1; round <= 20; round++) {
      state = simulateCollectPhase(state);
      state = simulateEventPhase(state);
      state = simulateEndRound(state);
      validateGameState(state, `round ${round}`);
    }

    expect(state.gameOver).toBe(true);

    // Cash should be unchanged (no FCF, no costs)
    // Events might still affect interest rate or inflation
    expect(state.cash).toBeLessThanOrEqual(20000); // Events might cost cash

    const score = calculateFinalScore(state);
    expect(Number.isNaN(score.total)).toBe(false);
  });
});

describe('Edge Cases', () => {
  it('should handle EBITDA going to floor during severe recession chain', () => {
    const business = createMockBusiness({
      ebitda: 1000,
      acquisitionEbitda: 1000,
      organicGrowthRate: -0.05,
    });

    let current = business;
    // Simulate 10 years of decline
    for (let i = 0; i < 10; i++) {
      current = applyOrganicGrowth(current, 0, 0, false);
    }

    // Should never go below floor
    expect(current.ebitda).toBeGreaterThanOrEqual(Math.round(1000 * 0.3));
    expect(Number.isNaN(current.ebitda)).toBe(false);
  });

  it('should handle very large portfolio (20 businesses)', () => {
    const businesses = Array.from({ length: 20 }, (_, i) =>
      createMockBusiness({
        id: `biz_${i}`,
        ebitda: 1000 + i * 100,
        sectorId: (['agency', 'saas', 'homeServices', 'consumer', 'industrial'] as SectorId[])[i % 5],
      })
    );

    const state = createMockGameState({ businesses });
    const metrics = calculateMetrics(state);

    expect(Number.isNaN(metrics.totalEbitda)).toBe(false);
    expect(metrics.totalEbitda).toBeGreaterThan(0);
    expect(Number.isNaN(metrics.fcfPerShare)).toBe(false);
  });

  it('should handle all businesses having negative growth rate', () => {
    const businesses = Array.from({ length: 5 }, (_, i) =>
      createMockBusiness({
        id: `biz_${i}`,
        organicGrowthRate: -0.05,
        ebitda: 1000,
        acquisitionEbitda: 1000,
      })
    );

    let state = createMockGameState({ businesses });

    for (let round = 1; round <= 5; round++) {
      state = simulateCollectPhase(state);
      state = simulateEventPhase(state);
      state = simulateEndRound(state);
      validateGameState(state, `declining round ${round}`);
    }
  });

  it('should handle shared services with 0 opcos (should give 0 benefits)', () => {
    const state = createMockGameState({
      businesses: [],
      sharedServices: createMockGameState().sharedServices.map(s =>
        s.type === 'finance_reporting' ? { ...s, active: true } : s
      ),
    });

    // Benefits should still compute but with 0 scale
    const benefits = calculateSharedServicesBenefits(state);
    expect(Number.isNaN(benefits.cashConversionBonus)).toBe(false);
  });

  it('should handle metrics when totalInvestedCapital is 0', () => {
    const state = createMockGameState({
      totalInvestedCapital: 0,
      businesses: [createMockBusiness()],
    });

    const metrics = calculateMetrics(state);
    // ROIC = nopat / totalInvestedCapital - should be 0, not NaN
    expect(metrics.portfolioRoic).toBe(0);
    expect(Number.isNaN(metrics.portfolioRoic)).toBe(false);
  });

  it('should handle consecutive event effects without state corruption', () => {
    let state = createMockGameState();

    // Apply multiple events in sequence
    const events = [
      { id: 'e1', type: 'global_recession' as const, title: 'Recession', description: '', effect: '' },
      { id: 'e2', type: 'global_bull_market' as const, title: 'Bull Market', description: '', effect: '' },
      { id: 'e3', type: 'global_interest_hike' as const, title: 'Hike', description: '', effect: '' },
      { id: 'e4', type: 'global_interest_cut' as const, title: 'Cut', description: '', effect: '' },
    ];

    for (const event of events) {
      state = applyEventEffects(state, event);
      validateGameState(state, `after ${event.type}`);
    }
  });
});
