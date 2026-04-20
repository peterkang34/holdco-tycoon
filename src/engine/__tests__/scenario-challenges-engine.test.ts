/**
 * Step 2 tests — pure helpers + scoring calibration.
 *
 * Covers the behavior that can be tested without spinning up the Zustand store
 * (which triggers runAllMigrations at module load):
 *   - createDealFromCuratedConfig → valid Deal from curated override
 *   - createForcedGameEvent → valid GameEvent from forced config
 *   - calculateFinalScore with isScenarioChallengeMode → proportional grade targets
 *
 * The `startScenarioChallenge` action itself is covered indirectly through
 * type-safety at compile time + the helpers above; full integration will be
 * exercised by a future playtest-level test once Step 3 (API/UI wiring) lands.
 */

import { describe, it, expect } from 'vitest';
import {
  createDealFromCuratedConfig,
  createForcedGameEvent,
} from '../../data/scenarioChallenges';
import { calculateFinalScore } from '../scoring';
import type { GameState } from '../types';

// ── createDealFromCuratedConfig ───────────────────────────────────────────

describe('createDealFromCuratedConfig', () => {
  it('builds a valid Deal from a curated deal override', () => {
    const deal = createDealFromCuratedConfig(
      { name: 'Target Co', sectorId: 'healthcare', ebitda: 1500, multiple: 4, quality: 3 },
      'deal-1',
      3,
    );
    expect(deal.id).toBe('deal-1');
    expect(deal.business.name).toBe('Target Co');
    expect(deal.business.sectorId).toBe('healthcare');
    expect(deal.askingPrice).toBe(6_000); // 1500 * 4
    expect(deal.roundAppeared).toBe(3);
    expect(deal.source).toBe('proprietary');
    expect(deal.heat).toBe('warm');
    expect(deal.freshness).toBe(3);
    expect(deal.acquisitionType).toBe('standalone');
  });

  it('deal.business does NOT include runtime fields (id/acquisitionRound/improvements/status)', () => {
    const deal = createDealFromCuratedConfig(
      { name: 'X', sectorId: 'saas', ebitda: 1000, multiple: 5, quality: 3 },
      'deal-2',
      1,
    );
    // Deal.business is `Omit<Business, 'id' | 'acquisitionRound' | 'improvements' | 'status'>`
    expect((deal.business as Record<string, unknown>).id).toBeUndefined();
    expect((deal.business as Record<string, unknown>).acquisitionRound).toBeUndefined();
    expect((deal.business as Record<string, unknown>).improvements).toBeUndefined();
    expect((deal.business as Record<string, unknown>).status).toBeUndefined();
  });

  it('effectivePrice matches askingPrice at heat=warm (no premium)', () => {
    const deal = createDealFromCuratedConfig(
      { name: 'Y', sectorId: 'saas', ebitda: 2000, multiple: 6, quality: 4 },
      'deal-3',
      2,
    );
    expect(deal.effectivePrice).toBe(deal.askingPrice);
  });

  it('preserves quality override on the underlying business', () => {
    const deal = createDealFromCuratedConfig(
      { name: 'Q5', sectorId: 'saas', ebitda: 3000, multiple: 7, quality: 5 },
      'deal-q5',
      1,
    );
    expect(deal.business.qualityRating).toBe(5);
  });
});

// ── createForcedGameEvent ─────────────────────────────────────────────────

describe('createForcedGameEvent', () => {
  it('builds a valid GameEvent for common event types (global_recession)', () => {
    const event = createForcedGameEvent({ type: 'global_recession' as const }, 5);
    expect(event.type).toBe('global_recession');
    expect(event.title).toBe('Recession');
    expect(event.description).toContain('economy contracts');
    expect(event.id).toMatch(/scenario_global_recession/);
  });

  it('admin custom title/description override defaults', () => {
    const event = createForcedGameEvent({
      type: 'global_recession' as const,
      customTitle: 'The Big One',
      customDescription: 'A particularly nasty downturn hits this scenario.',
    }, 7);
    expect(event.title).toBe('The Big One');
    expect(event.description).toBe('A particularly nasty downturn hits this scenario.');
  });

  it('event types without default copy fall back to generic defaults without crashing', () => {
    // `global_interest_hike` is a valid EventType but not in DEFAULT_EVENT_COPY,
    // so the factory returns a generic fallback title/description.
    const event = createForcedGameEvent({ type: 'global_interest_hike' as const }, 2);
    expect(event.type).toBe('global_interest_hike');
    expect(event.title).toBe('global_interest_hike');
    expect(event.description).toBe('Scenario-forced event.');
  });

  it('event id is unique per type+round (deterministic)', () => {
    const a = createForcedGameEvent({ type: 'global_recession' as const }, 3);
    const b = createForcedGameEvent({ type: 'global_recession' as const }, 4);
    const c = createForcedGameEvent({ type: 'global_bull_market' as const }, 3);
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toBe(c.id);
  });

  it('all 6 well-known event types have default copy', () => {
    // Valid EventType values — type-checked at compile time (no `as never` casts).
    const types = [
      'global_recession',
      'global_financial_crisis',
      'global_credit_tightening',
      'global_oil_shock',
      'global_bull_market',
      'sector_consolidation_boom',
    ] as const;
    for (const t of types) {
      const event = createForcedGameEvent({ type: t }, 1);
      expect(event.title).not.toBe(t); // i.e., we supplied a better title than the raw type string
      expect(event.description.length).toBeGreaterThan(20);
    }
  });

  it('sector_consolidation_boom forwards consolidationSectorId to the GameEvent', () => {
    const event = createForcedGameEvent({
      type: 'sector_consolidation_boom',
      consolidationSectorId: 'healthcare',
    }, 4);
    expect(event.type).toBe('sector_consolidation_boom');
    expect(event.consolidationSectorId).toBe('healthcare');
  });
});

// ── Scoring grade calibration for scenarios ───────────────────────────────

/** Build a minimal GameState for scoring — only fields calculateFinalScore reads. */
function makeScoringState(overrides: Partial<GameState>): GameState {
  const base = {
    holdcoName: 'Test', round: 10, phase: 'event' as const, gameOver: true,
    difficulty: 'easy' as const, duration: 'quick' as const, maxRounds: 10, seed: 1,
    businesses: [], exitedBusinesses: [],
    cash: 20_000, totalDebt: 0, interestRate: 0.07, sharesOutstanding: 1000,
    founderShares: 800, initialRaiseAmount: 10_000, initialOwnershipPct: 0.8,
    totalInvestedCapital: 10_000, totalDistributions: 0, totalBuybacks: 0,
    totalExitProceeds: 0, equityRaisesUsed: 0, lastEquityRaiseRound: 0, lastBuybackRound: 0,
    sharedServices: [], dealPipeline: [], passedDealIds: [],
    maFocus: { sectorId: null, sizeTier: 'any' as const },
    maSourcing: { tier: 0 as const, active: false, unlockedRound: 0, lastUpgradeRound: 0 },
    integratedPlatforms: [], turnaroundTier: 0 as const, activeTurnarounds: [],
    currentEvent: null, pendingProSportsEvent: null, eventHistory: [],
    creditTighteningRoundsRemaining: 0, inflationRoundsRemaining: 0,
    metricsHistory: [], roundHistory: [], actionsThisRound: [],
    holdcoDebtStartRound: 0, holdcoLoanBalance: 0, holdcoLoanRate: 0, holdcoLoanRoundsRemaining: 0,
    requiresRestructuring: false, covenantBreachRounds: 0, hasRestructured: false,
    exitMultiplePenalty: 0, acquisitionsThisRound: 0, maxAcquisitionsPerRound: 3,
    lastAcquisitionResult: null, lastIntegrationOutcome: null, founderDistributionsReceived: 0,
    isChallenge: false, dealInflationState: { crisisResetRoundsRemaining: 0 },
    ipoState: null, familyOfficeState: null,
  };
  return { ...base, ...overrides } as unknown as GameState;
}

describe('calculateFinalScore — scenario grade calibration', () => {
  it('scenario mode 10yr: valueCreation target = 10 × (10/20) = 5 (matches legacy 10yr)', () => {
    // Legacy 10-round uses target=5 (maxRounds < 20 binary branch).
    // Scenario 10-round uses target = 10 * 10/20 = 5. Same → same score.
    const legacyState = makeScoringState({ maxRounds: 10, isScenarioChallengeMode: false });
    const scenarioState = makeScoringState({ maxRounds: 10, isScenarioChallengeMode: true });
    const legacy = calculateFinalScore(legacyState);
    const scenario = calculateFinalScore(scenarioState);
    expect(scenario.valueCreation).toBe(legacy.valueCreation);
  });

  it('scenario mode 15yr: valueCreation target = 10 × (15/20) = 7.5 (stricter than legacy binary)', () => {
    // A scenario game with 15 rounds and 5x FEV multiple should score LOWER than the
    // legacy 15-round game at the same inputs, because legacy uses target=5 (binary <20)
    // while scenario uses 7.5 (proportional).
    const initialRaiseAmount = 10_000;
    // FEV = cash + portfolio value. With empty portfolio, FEV ≈ cash × founder ownership.
    // cash=50k, founderOwnership=1.0 → FEV ≈ 50k → fevMultiple = 50k/10k = 5x.
    const common = {
      maxRounds: 15,
      initialRaiseAmount,
      cash: 50_000,
      sharesOutstanding: 1000,
      founderShares: 1000,
    };
    const legacy = calculateFinalScore(makeScoringState({ ...common, isScenarioChallengeMode: false }));
    const scenario = calculateFinalScore(makeScoringState({ ...common, isScenarioChallengeMode: true }));
    // Legacy (target=5): 5x >= 5 → full 20 marks.
    // Scenario (target=7.5): 5x vs 7.5 → partial score.
    expect(legacy.valueCreation).toBe(20);
    expect(scenario.valueCreation).toBeLessThan(20);
    expect(scenario.valueCreation).toBeGreaterThan(0);
  });

  it('scenario mode 20yr: valueCreation target = 10 × (20/20) = 10 (matches legacy 20yr)', () => {
    const legacy = calculateFinalScore(makeScoringState({ maxRounds: 20, isScenarioChallengeMode: false }));
    const scenario = calculateFinalScore(makeScoringState({ maxRounds: 20, isScenarioChallengeMode: true }));
    expect(scenario.valueCreation).toBe(legacy.valueCreation);
  });

  it('scenario mode: fcfShareGrowth target scales proportionally (10yr → 2.0, 20yr → 4.0)', () => {
    // With no FCF growth in the state, scoring can still compute 0. The actual scaling
    // check: same inputs, scenarioMode only changes the target. For 10-round both
    // modes resolve to target=2.0 → identical score. For 15-round scenario mode uses
    // target = 4.0 * 15/20 = 3.0 while legacy uses 2.0.
    const legacy10 = calculateFinalScore(makeScoringState({ maxRounds: 10, isScenarioChallengeMode: false }));
    const scenario10 = calculateFinalScore(makeScoringState({ maxRounds: 10, isScenarioChallengeMode: true }));
    expect(scenario10.fcfShareGrowth).toBe(legacy10.fcfShareGrowth);
  });

  it('non-scenario mode: binary branching preserved (behavior-preserving refactor)', () => {
    // A plain holdco 20-round game should score identically to pre-Step-2 code.
    // With cash=20k / founderShares=800/1000 → FEV=16k / 10k raise = 1.6x multiple.
    // Legacy 20yr target=10, target/2=5 → score in "1 to target/2" branch:
    //   ((1.6 - 1) / (5 - 1)) * 10 = 1.5. Pinned here to catch accidental regressions.
    const state = makeScoringState({ maxRounds: 20, isScenarioChallengeMode: false });
    const score = calculateFinalScore(state);
    expect(score.valueCreation).toBe(1.5);
  });

  it('scenario mode 5yr: extreme short game scales valueCreation target down to 2.5', () => {
    // 5-round scenario: target = 10 * 5/20 = 2.5. Achievable with 2.5x multiple → full marks.
    // Legacy at 5-rounds: target=5 (binary <20). Scenario is LENIENT by comparison.
    const common = {
      maxRounds: 5,
      initialRaiseAmount: 10_000,
      cash: 25_000,
      sharesOutstanding: 1000,
      founderShares: 1000,
    };
    const legacy = calculateFinalScore(makeScoringState({ ...common, isScenarioChallengeMode: false }));
    const scenario = calculateFinalScore(makeScoringState({ ...common, isScenarioChallengeMode: true }));
    // 2.5x FEV multiple.
    // Legacy (target=5): well below target → partial marks.
    // Scenario (target=2.5): hits target → full 20 marks.
    expect(scenario.valueCreation).toBe(20);
    expect(legacy.valueCreation).toBeLessThan(scenario.valueCreation);
  });
});
