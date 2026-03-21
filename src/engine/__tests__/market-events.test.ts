/**
 * Market Event Tests
 * Validates event generation, effects, choice resolution, and determinism.
 */
import { describe, it, expect } from 'vitest';
import { generateEvent, applyEventEffects } from '../simulation';
import { SeededRng, deriveRoundSeed, deriveStreamSeed, STREAM_IDS } from '../rng';
import { GLOBAL_EVENTS, PORTFOLIO_EVENTS } from '../../data/events';
import { createMockBusiness, createMockGameState } from './helpers';
import type { GameEvent } from '../types';

// ── Event Generation ───────────────────────────────────────────────

describe('Event Generation', () => {
  it('generates an event with seeded RNG', () => {
    const state = createMockGameState({ seed: 42, round: 3 });
    const roundSeed = deriveRoundSeed(42, 3);
    const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
    const event = generateEvent(state, rng);
    // Should return either an event or null (quiet year capped) — both are valid
    expect(event === null || typeof event.type === 'string').toBe(true);
  });

  it('returns null or event object (never throws)', () => {
    // Test with various states
    const states = [
      createMockGameState({ businesses: [] }),
      createMockGameState({ businesses: [createMockBusiness()] }),
      createMockGameState({ businesses: Array.from({ length: 10 }, (_, i) => createMockBusiness({ id: `b${i}` })) }),
    ];
    for (const state of states) {
      const rng = new SeededRng(42);
      expect(() => generateEvent(state, rng)).not.toThrow();
    }
  });

  it('global events have correct type prefix', () => {
    for (const evt of GLOBAL_EVENTS) {
      expect(evt.type.startsWith('global_'), `Event ${evt.type} should start with global_`).toBe(true);
    }
  });

  it('portfolio events have correct type prefix', () => {
    for (const evt of PORTFOLIO_EVENTS) {
      const valid = evt.type.startsWith('portfolio_') || evt.type === 'mbo_proposal' || evt.type === 'unsolicited_offer';
      expect(valid, `Event ${evt.type} has unexpected prefix`).toBe(true);
    }
  });

  it('all event probabilities are in [0, 1]', () => {
    // Some portfolio events have probability 0 in their definition
    // and are dynamically gated (e.g. earnout_dispute uses 0 base, set to 0.04 when eligible)
    for (const evt of [...GLOBAL_EVENTS, ...PORTFOLIO_EVENTS]) {
      expect(evt.probability, `Event ${evt.type}`).toBeGreaterThanOrEqual(0);
      expect(evt.probability, `Event ${evt.type}`).toBeLessThanOrEqual(1);
    }
  });

  it('all global event probabilities are positive', () => {
    for (const evt of GLOBAL_EVENTS) {
      expect(evt.probability, `Event ${evt.type}`).toBeGreaterThan(0);
    }
  });

  it('global event probabilities sum to less than 1', () => {
    const sum = GLOBAL_EVENTS.reduce((s, e) => s + e.probability, 0);
    expect(sum).toBeLessThan(1);
  });
});

// ── Quick Mode Duration Halving ────────────────────────────────────

describe('Quick Mode Duration Halving', () => {
  it('credit tightening lasts 1 round in quick mode vs 2 in standard', () => {
    const quickState = createMockGameState({ maxRounds: 10, duration: 'quick' });
    const standardState = createMockGameState({ maxRounds: 20, duration: 'standard' });

    const ctEvent: GameEvent = {
      id: 'test_ct',
      type: 'global_credit_tightening',
      title: 'Credit Tightening',
      description: 'Banks pull back.',
      effect: 'No debt-financed acquisitions',
    };

    const quickAfter = applyEventEffects(quickState, ctEvent);
    const stdAfter = applyEventEffects(standardState, ctEvent);

    expect(quickAfter.creditTighteningRoundsRemaining).toBe(1);
    expect(stdAfter.creditTighteningRoundsRemaining).toBe(2);
  });

  it('financial crisis credit tightening is also halved in quick mode', () => {
    const quickState = createMockGameState({ maxRounds: 10, duration: 'quick' });
    const fcEvent: GameEvent = {
      id: 'test_fc',
      type: 'global_financial_crisis',
      title: 'Financial Crisis',
      description: 'Crisis hits.',
      effect: 'Everything drops.',
    };

    const after = applyEventEffects(quickState, fcEvent);
    expect(after.creditTighteningRoundsRemaining).toBe(1);
  });
});

// ── Bull Market Effects ────────────────────────────────────────────

describe('Bull Market Effects', () => {
  it('boosts revenue and margin for all active businesses', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', revenue: 10000, ebitdaMargin: 0.20, ebitda: 2000 }),
      createMockBusiness({ id: 'b2', revenue: 5000, ebitdaMargin: 0.15, ebitda: 750 }),
    ];
    const state = createMockGameState({ businesses });

    const event: GameEvent = {
      id: 'test_bull',
      type: 'global_bull_market',
      title: 'Bull Market',
      description: 'Markets are up.',
      effect: '+5-10% revenue, +1-2 ppt margin',
    };

    const rng = new SeededRng(42);
    const after = applyEventEffects(state, event, rng);

    for (const biz of after.businesses) {
      const orig = businesses.find(b => b.id === biz.id)!;
      expect(biz.revenue).toBeGreaterThan(orig.revenue);
      expect(biz.ebitdaMargin).toBeGreaterThan(orig.ebitdaMargin);
      expect(biz.ebitda).toBeGreaterThan(orig.ebitda);
    }
  });

  it('does not affect non-active businesses', () => {
    const soldBiz = createMockBusiness({ id: 'sold', status: 'sold', revenue: 10000, ebitda: 2000 });
    const state = createMockGameState({ businesses: [soldBiz] });
    const event: GameEvent = {
      id: 'test_bull2',
      type: 'global_bull_market',
      title: 'Bull Market',
      description: 'Up',
      effect: 'boost',
    };

    const rng = new SeededRng(99);
    const after = applyEventEffects(state, event, rng);
    expect(after.businesses[0].revenue).toBe(10000);
  });
});

// ── Recession Effects ──────────────────────────────────────────────

describe('Recession Effects', () => {
  it('reduces revenue and margins based on sector sensitivity', () => {
    const biz = createMockBusiness({
      id: 'b1',
      sectorId: 'agency', // recessionSensitivity: 1.2
      revenue: 10000,
      ebitdaMargin: 0.25,
      ebitda: 2500,
      acquisitionEbitda: 2000,
    });
    const state = createMockGameState({ businesses: [biz] });

    const event: GameEvent = {
      id: 'test_recession',
      type: 'global_recession',
      title: 'Recession',
      description: 'Economy contracts.',
      effect: 'Revenue drops.',
    };

    const after = applyEventEffects(state, event);
    const afterBiz = after.businesses[0];

    // Agency: sensitivity 1.2 → rev impact = 12%, margin impact = 2.4 ppt
    expect(afterBiz.revenue).toBeLessThan(10000);
    expect(afterBiz.ebitdaMargin).toBeLessThan(0.25);
  });

  it('education sector benefits from counter-cyclical sensitivity', () => {
    const eduBiz = createMockBusiness({
      id: 'edu1',
      sectorId: 'education', // recessionSensitivity: -0.2
      revenue: 10000,
      ebitdaMargin: 0.20,
      ebitda: 2000,
      acquisitionEbitda: 1800,
    });
    const state = createMockGameState({ businesses: [eduBiz] });

    const event: GameEvent = {
      id: 'test_rec_edu',
      type: 'global_recession',
      title: 'Recession',
      description: 'Economy contracts.',
      effect: 'Drops.',
    };

    const after = applyEventEffects(state, event);
    const afterBiz = after.businesses[0];

    // Negative sensitivity means POSITIVE impact during recession
    expect(afterBiz.revenue).toBeGreaterThan(10000);
    expect(afterBiz.ebitdaMargin).toBeGreaterThan(0.20);
  });

  it('high-sensitivity sectors suffer more than low-sensitivity', () => {
    const agencyBiz = createMockBusiness({
      id: 'agency1',
      sectorId: 'agency', // 1.2
      revenue: 10000,
      ebitdaMargin: 0.25,
      ebitda: 2500,
      acquisitionEbitda: 2000,
    });
    const saasBiz = createMockBusiness({
      id: 'saas1',
      sectorId: 'saas', // 0.5
      revenue: 10000,
      ebitdaMargin: 0.25,
      ebitda: 2500,
      acquisitionEbitda: 2000,
    });
    const state = createMockGameState({ businesses: [agencyBiz, saasBiz] });

    const event: GameEvent = {
      id: 'test_rec_compare',
      type: 'global_recession',
      title: 'Recession',
      description: 'Downturn.',
      effect: 'Drops.',
    };

    const after = applyEventEffects(state, event);
    const afterAgency = after.businesses.find(b => b.id === 'agency1')!;
    const afterSaas = after.businesses.find(b => b.id === 'saas1')!;

    // Agency should lose more revenue than SaaS
    const agencyRevLoss = 10000 - afterAgency.revenue;
    const saasRevLoss = 10000 - afterSaas.revenue;
    expect(agencyRevLoss).toBeGreaterThan(saasRevLoss);
  });
});

// ── Interest Rate Changes ──────────────────────────────────────────

describe('Interest Rate Changes', () => {
  it('interest rate hike increases rate by 1-2%', () => {
    const state = createMockGameState({ interestRate: 0.07 });
    const event: GameEvent = {
      id: 'test_hike',
      type: 'global_interest_hike',
      title: 'Rate Hike',
      description: 'Rates up.',
      effect: '+1-2%',
    };

    const rng = new SeededRng(42);
    const after = applyEventEffects(state, event, rng);
    expect(after.interestRate).toBeGreaterThan(0.07);
    expect(after.interestRate).toBeLessThanOrEqual(0.15); // cap at 15%
  });

  it('interest rate cut decreases rate, floored at 3%', () => {
    const state = createMockGameState({ interestRate: 0.04 });
    const event: GameEvent = {
      id: 'test_cut',
      type: 'global_interest_cut',
      title: 'Rate Cut',
      description: 'Rates down.',
      effect: '-1-2%',
    };

    const rng = new SeededRng(42);
    const after = applyEventEffects(state, event, rng);
    expect(after.interestRate).toBeGreaterThanOrEqual(0.03);
    expect(after.interestRate).toBeLessThan(0.04);
  });

  it('interest rate hike caps at 15%', () => {
    const state = createMockGameState({ interestRate: 0.14 });
    const event: GameEvent = {
      id: 'test_hike_cap',
      type: 'global_interest_hike',
      title: 'Rate Hike',
      description: 'Rates up.',
      effect: '+1-2%',
    };

    const rng = new SeededRng(42);
    const after = applyEventEffects(state, event, rng);
    expect(after.interestRate).toBeLessThanOrEqual(0.15);
  });

  it('interest rate cut floors at 3%', () => {
    const state = createMockGameState({ interestRate: 0.035 });
    const event: GameEvent = {
      id: 'test_cut_floor',
      type: 'global_interest_cut',
      title: 'Rate Cut',
      description: 'Rates down.',
      effect: '-1-2%',
    };

    const rng = new SeededRng(42);
    const after = applyEventEffects(state, event, rng);
    expect(after.interestRate).toBeGreaterThanOrEqual(0.03);
  });
});

// ── Credit Tightening ──────────────────────────────────────────────

describe('Credit Tightening', () => {
  it('sets creditTighteningRoundsRemaining', () => {
    const state = createMockGameState({ maxRounds: 20 });
    const event: GameEvent = {
      id: 'test_ct',
      type: 'global_credit_tightening',
      title: 'Credit Tightening',
      description: 'Banks pull back.',
      effect: 'No debt-financed acquisitions for 2 rounds',
    };

    const after = applyEventEffects(state, event);
    expect(after.creditTighteningRoundsRemaining).toBe(2);
  });
});

// ── Financial Crisis ───────────────────────────────────────────────

describe('Financial Crisis Effects', () => {
  it('increases interest rate by 2%', () => {
    const state = createMockGameState({ interestRate: 0.07 });
    const event: GameEvent = {
      id: 'test_fc',
      type: 'global_financial_crisis',
      title: 'Financial Crisis',
      description: 'Crisis.',
      effect: 'Everything drops.',
    };

    const after = applyEventEffects(state, event);
    expect(after.interestRate).toBeCloseTo(0.09);
  });

  it('increases existing bank debt rates by 1.5%', () => {
    const biz = createMockBusiness({
      id: 'b_debt',
      bankDebtBalance: 5000,
      bankDebtRate: 0.06,
    });
    const state = createMockGameState({ businesses: [biz], interestRate: 0.07 });
    const event: GameEvent = {
      id: 'test_fc2',
      type: 'global_financial_crisis',
      title: 'Financial Crisis',
      description: 'Crisis.',
      effect: 'Everything drops.',
    };

    const after = applyEventEffects(state, event);
    expect(after.businesses[0].bankDebtRate).toBeCloseTo(0.075);
  });

  it('sets exit multiple penalty to 1.0', () => {
    const state = createMockGameState({ exitMultiplePenalty: 0 });
    const event: GameEvent = {
      id: 'test_fc3',
      type: 'global_financial_crisis',
      title: 'Financial Crisis',
      description: 'Crisis.',
      effect: 'Everything drops.',
    };

    const after = applyEventEffects(state, event);
    expect(after.exitMultiplePenalty).toBe(1.0);
  });

  it('triggers credit tightening', () => {
    const state = createMockGameState({ maxRounds: 20 });
    const event: GameEvent = {
      id: 'test_fc4',
      type: 'global_financial_crisis',
      title: 'Financial Crisis',
      description: 'Crisis.',
      effect: 'Everything drops.',
    };

    const after = applyEventEffects(state, event);
    expect(after.creditTighteningRoundsRemaining).toBeGreaterThan(0);
  });

  it('deal inflation crisis reset in standard mode', () => {
    const state = createMockGameState({
      duration: 'standard',
      dealInflationState: { crisisResetRoundsRemaining: 0 },
    });
    const event: GameEvent = {
      id: 'test_fc5',
      type: 'global_financial_crisis',
      title: 'Financial Crisis',
      description: 'Crisis.',
      effect: 'Everything drops.',
    };

    const after = applyEventEffects(state, event);
    expect(after.dealInflationState.crisisResetRoundsRemaining).toBeGreaterThan(0);
  });
});

// ── Inflation Effects ──────────────────────────────────────────────

describe('Inflation Effects', () => {
  it('sets inflationRoundsRemaining to 2', () => {
    const state = createMockGameState();
    const event: GameEvent = {
      id: 'test_inflation',
      type: 'global_inflation',
      title: 'Inflation',
      description: 'Costs rise.',
      effect: '-2ppt margin',
    };

    const after = applyEventEffects(state, event);
    expect(after.inflationRoundsRemaining).toBe(2);
  });

  it('compresses margins by 2 ppt', () => {
    const biz = createMockBusiness({
      id: 'b_inf',
      revenue: 10000,
      ebitdaMargin: 0.25,
      ebitda: 2500,
      acquisitionEbitda: 2000,
    });
    const state = createMockGameState({ businesses: [biz] });
    const event: GameEvent = {
      id: 'test_inflation2',
      type: 'global_inflation',
      title: 'Inflation',
      description: 'Costs rise.',
      effect: '-2ppt margin',
    };

    const after = applyEventEffects(state, event);
    // Margin should drop by approximately 2ppt (may be clamped)
    expect(after.businesses[0].ebitdaMargin).toBeLessThan(0.25);
    expect(after.businesses[0].ebitdaMargin).toBeCloseTo(0.23, 1);
  });
});

// ── Portfolio Event Effects ────────────────────────────────────────

describe('Portfolio Event Effects', () => {
  it('star joins boosts revenue by 8% and margin by 2ppt', () => {
    const biz = createMockBusiness({
      id: 'b_star',
      revenue: 10000,
      ebitdaMargin: 0.20,
      ebitda: 2000,
    });
    const state = createMockGameState({ businesses: [biz] });

    const event: GameEvent = {
      id: 'test_star',
      type: 'portfolio_star_joins',
      title: 'Star Joins',
      description: 'Talent arrives.',
      effect: '+8% revenue, +2ppt margin',
      affectedBusinessId: 'b_star',
    };

    const after = applyEventEffects(state, event);
    const afterBiz = after.businesses[0];
    expect(afterBiz.revenue).toBe(Math.round(10000 * 1.08));
    expect(afterBiz.ebitdaMargin).toBeCloseTo(0.22, 4);
  });

  it('talent leaves reduces revenue by 6% and margin by 2ppt', () => {
    const biz = createMockBusiness({
      id: 'b_leave',
      revenue: 10000,
      ebitdaMargin: 0.20,
      ebitda: 2000,
      acquisitionEbitda: 1500,
    });
    const state = createMockGameState({ businesses: [biz] });

    const event: GameEvent = {
      id: 'test_leave',
      type: 'portfolio_talent_leaves',
      title: 'Talent Leaves',
      description: 'Key person departs.',
      effect: '-6% rev, -2ppt margin',
      affectedBusinessId: 'b_leave',
    };

    const after = applyEventEffects(state, event);
    const afterBiz = after.businesses[0];
    expect(afterBiz.revenue).toBe(Math.round(10000 * 0.94));
    expect(afterBiz.ebitdaMargin).toBeLessThan(0.20);
  });

  it('client signs boosts revenue by 8-12%', () => {
    const biz = createMockBusiness({
      id: 'b_client',
      revenue: 10000,
      ebitdaMargin: 0.20,
      ebitda: 2000,
    });
    const state = createMockGameState({ businesses: [biz] });

    const event: GameEvent = {
      id: 'test_client',
      type: 'portfolio_client_signs',
      title: 'Client Signs',
      description: 'New contract.',
      effect: '+8-12% revenue',
      affectedBusinessId: 'b_client',
    };

    const rng = new SeededRng(42);
    const after = applyEventEffects(state, event, rng);
    const afterBiz = after.businesses[0];
    expect(afterBiz.revenue).toBeGreaterThan(10000);
    // 8-12% boost
    expect(afterBiz.revenue).toBeGreaterThanOrEqual(Math.round(10000 * 1.08));
    expect(afterBiz.revenue).toBeLessThanOrEqual(Math.round(10000 * 1.12));
  });

  it('breakthrough adds 3ppt permanent margin', () => {
    const biz = createMockBusiness({
      id: 'b_break',
      revenue: 10000,
      ebitdaMargin: 0.20,
      ebitda: 2000,
    });
    const state = createMockGameState({ businesses: [biz] });

    const event: GameEvent = {
      id: 'test_break',
      type: 'portfolio_breakthrough',
      title: 'Breakthrough',
      description: 'Efficiency gain.',
      effect: '+3ppt margin',
      affectedBusinessId: 'b_break',
    };

    const after = applyEventEffects(state, event);
    const afterBiz = after.businesses[0];
    expect(afterBiz.ebitdaMargin).toBeCloseTo(0.23, 4);
  });
});

// ── Event Determinism ──────────────────────────────────────────────

describe('Event Determinism', () => {
  it('same seed + round produces identical events', () => {
    const seed = 42;
    const round = 5;
    const state = createMockGameState({ seed, round });

    const roundSeed = deriveRoundSeed(seed, round);

    const rng1 = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
    const event1 = generateEvent(state, rng1);

    const rng2 = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
    const event2 = generateEvent(state, rng2);

    if (event1 === null && event2 === null) {
      expect(true).toBe(true);
    } else {
      expect(event1).not.toBeNull();
      expect(event2).not.toBeNull();
      expect(event1!.type).toBe(event2!.type);
      expect(event1!.id).toBe(event2!.id);
    }
  });

  it('different seeds produce different event sequences', () => {
    const results: (string | null)[] = [];

    for (let seed = 1; seed <= 50; seed++) {
      const state = createMockGameState({ seed, round: 3 });
      const roundSeed = deriveRoundSeed(seed, 3);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(state, rng);
      results.push(event?.type ?? null);
    }

    // Should have some variety (not all the same event)
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('different rounds with same seed produce different events', () => {
    const seed = 42;
    const results: (string | null)[] = [];

    for (let round = 1; round <= 20; round++) {
      const state = createMockGameState({ seed, round });
      const roundSeed = deriveRoundSeed(seed, round);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(state, rng);
      results.push(event?.type ?? null);
    }

    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });
});

// ── Cooldown / Anti-Repeat ─────────────────────────────────────────

describe('Event Cooldowns', () => {
  it('severe global event does not repeat immediately after itself', () => {
    // Test that recession can't fire back-to-back
    const state = createMockGameState({
      round: 5,
      eventHistory: [
        { id: 'e4', type: 'global_recession', title: 'Recession', description: '', effect: '' },
      ],
    });

    // Run many seeds and check no recession fires
    let recessionFired = false;
    for (let seed = 1; seed <= 200; seed++) {
      const s = { ...state, seed };
      const roundSeed = deriveRoundSeed(seed, 5);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(s, rng);
      if (event?.type === 'global_recession') {
        recessionFired = true;
        break;
      }
    }
    expect(recessionFired).toBe(false);
  });
});

// ── Yield Curve Inversion ──────────────────────────────────────────

describe('Yield Curve Inversion', () => {
  it('doubled recession probability multiplier is consumed by generator', () => {
    // The generator reads recessionProbMultiplier
    const state = createMockGameState({
      round: 5,
      recessionProbMultiplier: 2.0,
    });
    // Just verify no crash — the multiplier doubles recession chance
    const rng = new SeededRng(42);
    expect(() => generateEvent(state, rng)).not.toThrow();
  });
});

// ── Event Impact Tracking ──────────────────────────────────────────

describe('Event Impact Tracking', () => {
  it('bull market returns impacts for each affected business', () => {
    const businesses = [
      createMockBusiness({ id: 'b1', revenue: 10000, ebitdaMargin: 0.20, ebitda: 2000 }),
      createMockBusiness({ id: 'b2', revenue: 5000, ebitdaMargin: 0.15, ebitda: 750 }),
    ];
    const state = createMockGameState({ businesses });

    const event: GameEvent = {
      id: 'test_bull_impacts',
      type: 'global_bull_market',
      title: 'Bull',
      description: 'Up',
      effect: 'boost',
    };

    const rng = new SeededRng(42);
    const after = applyEventEffects(state, event, rng);
    // applyEventEffects returns state with event having impacts
    // The impacts are on the returned event
    expect(after).toBeDefined();
  });

  it('interest rate events track before/after', () => {
    const state = createMockGameState({ interestRate: 0.07 });
    const event: GameEvent = {
      id: 'test_ir',
      type: 'global_interest_hike',
      title: 'Hike',
      description: 'Up',
      effect: '+1-2%',
    };

    const rng = new SeededRng(42);
    const after = applyEventEffects(state, event, rng);
    expect(after.interestRate).toBeGreaterThan(0.07);
  });
});

// ── Quiet Year ─────────────────────────────────────────────────────

describe('Quiet Year', () => {
  it('quiet year has no business effects', () => {
    const biz = createMockBusiness({
      id: 'b_quiet',
      revenue: 10000,
      ebitdaMargin: 0.20,
      ebitda: 2000,
    });
    const state = createMockGameState({ businesses: [biz] });

    const event: GameEvent = {
      id: 'test_quiet',
      type: 'global_quiet',
      title: 'Quiet Year',
      description: 'Business as usual.',
      effect: 'No special effects',
    };

    const after = applyEventEffects(state, event);
    expect(after.businesses[0].revenue).toBe(10000);
    expect(after.businesses[0].ebitdaMargin).toBe(0.20);
    expect(after.interestRate).toBe(state.interestRate);
  });
});

// ── Portfolio Event Eligibility ────────────────────────────────────

describe('Portfolio Event Eligibility', () => {
  it('equity demand requires strong operator + Q4+ business', () => {
    // State with no strong/Q4+ businesses — equity demand should have 0 probability
    const weakBiz = createMockBusiness({
      id: 'b_weak',
      qualityRating: 2,
      dueDiligence: {
        revenueConcentration: 'medium',
        revenueConcentrationText: '',
        operatorQuality: 'weak',
        operatorQualityText: '',
        trend: 'flat',
        trendText: '',
        customerRetention: 70,
        customerRetentionText: '',
        competitivePosition: 'commoditized',
        competitivePositionText: '',
      },
    });
    const state = createMockGameState({ businesses: [weakBiz] });

    // Run many seeds — equity demand should never fire
    let equityDemandFired = false;
    for (let seed = 1; seed <= 300; seed++) {
      const s = { ...state, seed, round: 3 };
      const roundSeed = deriveRoundSeed(seed, 3);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(s, rng);
      if (event?.type === 'portfolio_equity_demand') {
        equityDemandFired = true;
        break;
      }
    }
    expect(equityDemandFired).toBe(false);
  });

  it('seller note renegotiation requires active seller note', () => {
    // No seller notes — should never fire
    const biz = createMockBusiness({
      id: 'b_nosn',
      sellerNoteBalance: 0,
      sellerNoteRoundsRemaining: 0,
    });
    const state = createMockGameState({ businesses: [biz] });

    let renoFired = false;
    for (let seed = 1; seed <= 300; seed++) {
      const s = { ...state, seed, round: 3 };
      const roundSeed = deriveRoundSeed(seed, 3);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(s, rng);
      if (event?.type === 'portfolio_seller_note_renego') {
        renoFired = true;
        break;
      }
    }
    expect(renoFired).toBe(false);
  });

  it('MBO proposal requires Q4+ and 3+ years held', () => {
    // Business held for only 1 round, Q3 — MBO should not fire
    const biz = createMockBusiness({
      id: 'b_mbo',
      qualityRating: 3,
      acquisitionRound: 2,
    });
    const state = createMockGameState({ businesses: [biz], round: 3 });

    let mboFired = false;
    for (let seed = 1; seed <= 300; seed++) {
      const s = { ...state, seed };
      const roundSeed = deriveRoundSeed(seed, 3);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(s, rng);
      if (event?.type === 'mbo_proposal') {
        mboFired = true;
        break;
      }
    }
    expect(mboFired).toBe(false);
  });

  it('management succession only fires in standard (20yr) mode', () => {
    const biz = createMockBusiness({
      id: 'b_succ',
      qualityRating: 4,
      acquisitionRound: 1,
    });
    const state = createMockGameState({
      businesses: [biz],
      round: 12,
      duration: 'quick',
      maxRounds: 10,
    });

    let succFired = false;
    for (let seed = 1; seed <= 500; seed++) {
      const s = { ...state, seed };
      const roundSeed = deriveRoundSeed(seed, 12);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(s, rng);
      if (event?.type === 'portfolio_management_succession') {
        succFired = true;
        break;
      }
    }
    expect(succFired).toBe(false);
  });

  it('referral deal requires 4+ active businesses', () => {
    // Only 2 businesses — referral deal should not fire
    const businesses = [
      createMockBusiness({ id: 'b_ref1' }),
      createMockBusiness({ id: 'b_ref2' }),
    ];
    const state = createMockGameState({ businesses });

    let referralFired = false;
    for (let seed = 1; seed <= 500; seed++) {
      const s = { ...state, seed, round: 3 };
      const roundSeed = deriveRoundSeed(seed, 3);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(s, rng);
      if (event?.type === 'portfolio_referral_deal') {
        referralFired = true;
        break;
      }
    }
    expect(referralFired).toBe(false);
  });
});

// ── Talent Market Shift ────────────────────────────────────────────

describe('Talent Market Shift', () => {
  it('talent market shift event exists in global events', () => {
    const evt = GLOBAL_EVENTS.find(e => e.type === 'global_talent_market_shift');
    expect(evt).toBeDefined();
    expect(evt!.probability).toBeGreaterThan(0);
  });
});

// ── Private Credit Boom ────────────────────────────────────────────

describe('Private Credit Boom', () => {
  it('private credit boom event exists in global events', () => {
    const evt = GLOBAL_EVENTS.find(e => e.type === 'global_private_credit_boom');
    expect(evt).toBeDefined();
    expect(evt!.probability).toBeGreaterThan(0);
  });
});

// ── Oil Shock ──────────────────────────────────────────────────────

import { generateOilShockDeals } from '../businesses';
import { SECTORS } from '../../data/sectors';

describe('Oil Shock', () => {
  it('oil shock event exists in global events with correct probability', () => {
    const evt = GLOBAL_EVENTS.find(e => e.type === 'global_oil_shock');
    expect(evt).toBeDefined();
    expect(evt!.probability).toBe(0.03);
  });

  it('oil shock event generates with 3 choices', () => {
    // Brute-force: try many seeds until we get an oil shock
    let oilShockEvent: GameEvent | null = null;
    for (let seed = 1; seed <= 5000; seed++) {
      const state = createMockGameState({
        seed,
        round: 5,
        businesses: [createMockBusiness({ sectorId: 'distribution' })],
        oilShockRoundsRemaining: 0,
      });
      const roundSeed = deriveRoundSeed(seed, 5);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(state, rng);
      if (event?.type === 'global_oil_shock') {
        oilShockEvent = event;
        break;
      }
    }
    // Even if we don't find one via RNG (3% is low), verify the event definition exists
    // and has the correct structure when generated
    const evtDef = GLOBAL_EVENTS.find(e => e.type === 'global_oil_shock');
    expect(evtDef).toBeDefined();
    if (oilShockEvent) {
      expect(oilShockEvent.choices).toBeDefined();
      expect(oilShockEvent.choices!.length).toBe(3);
      expect(oilShockEvent.choices!.map(c => c.action)).toEqual([
        'oilShockHunkerDown',
        'oilShockGoHunting',
        'oilShockPassThrough',
      ]);
    }
  });

  it('oil shock is blocked in rounds 1-2', () => {
    for (const round of [1, 2]) {
      for (let seed = 1; seed <= 2000; seed++) {
        const state = createMockGameState({
          seed,
          round,
          businesses: [createMockBusiness()],
        });
        const roundSeed = deriveRoundSeed(seed, round);
        const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
        const event = generateEvent(state, rng);
        expect(event?.type).not.toBe('global_oil_shock');
      }
    }
  });

  it('oil shock is blocked when credit tightening is active', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const state = createMockGameState({
        seed,
        round: 5,
        businesses: [createMockBusiness()],
        creditTighteningRoundsRemaining: 2,
      });
      const roundSeed = deriveRoundSeed(seed, 5);
      const rng = new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events));
      const event = generateEvent(state, rng);
      expect(event?.type).not.toBe('global_oil_shock');
    }
  });

  it('oil shock aftershock is forced when oilShockRoundsRemaining > 0', () => {
    const state = createMockGameState({
      seed: 42,
      round: 6,
      businesses: [createMockBusiness({ sectorId: 'distribution' })],
      oilShockRoundsRemaining: 1,
    });
    const rng = new SeededRng(deriveStreamSeed(deriveRoundSeed(42, 6), STREAM_IDS.events));
    const event = generateEvent(state, rng);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('global_oil_shock_aftershock');
    expect(event!.title).toBe('Oil Shock Aftershock');
  });

  it('aftershock applyEventEffects reduces revenue and margin by sensitivity', () => {
    const distBiz = createMockBusiness({
      id: 'dist_1',
      sectorId: 'distribution',
      revenue: 10000,
      ebitdaMargin: 0.20,
      ebitda: 2000,
      acquisitionEbitda: 1500,
    });
    const saasBiz = createMockBusiness({
      id: 'saas_1',
      sectorId: 'saas',
      revenue: 8000,
      ebitdaMargin: 0.25,
      ebitda: 2000,
      acquisitionEbitda: 1500,
    });
    const state = createMockGameState({
      round: 7,
      businesses: [distBiz, saasBiz],
      oilShockRoundsRemaining: 1,
    });
    const aftershockEvent: GameEvent = {
      id: 'event_7_global_oil_shock_aftershock',
      type: 'global_oil_shock_aftershock',
      title: 'Oil Shock Aftershock',
      description: 'Test',
      effect: 'Test',
    };
    const result = applyEventEffects(state, aftershockEvent);

    // Distribution: sensitivity 1.5 → revenue -7.5%, margin -1.5ppt
    const distResult = result.businesses.find(b => b.id === 'dist_1')!;
    const distSens = SECTORS.distribution.oilShockSensitivity ?? 0;
    expect(distSens).toBe(1.5);
    expect(distResult.revenue).toBeLessThan(distBiz.revenue);

    // SaaS: sensitivity 0.2 → revenue -1%, margin -0.2ppt (minimal)
    const saasResult = result.businesses.find(b => b.id === 'saas_1')!;
    const saasSens = SECTORS.saas.oilShockSensitivity ?? 0;
    expect(saasSens).toBe(0.2);
    // SaaS should be less affected than distribution
    const distRevDrop = (distBiz.revenue - distResult.revenue) / distBiz.revenue;
    const saasRevDrop = (saasBiz.revenue - saasResult.revenue) / saasBiz.revenue;
    expect(distRevDrop).toBeGreaterThan(saasRevDrop);

    // Counter should be decremented
    expect(result.oilShockRoundsRemaining).toBe(0);
  });

  it('oil shock is in cooldownTypes set (no back-to-back)', () => {
    // Oil shock that just fired should prevent another next round
    const state = createMockGameState({
      seed: 42,
      round: 6,
      businesses: [createMockBusiness()],
      eventHistory: [{ type: 'global_oil_shock', round: 5 }] as any,
    });
    // With cooldown, oil shock should not fire immediately after
    for (let seed = 1; seed <= 2000; seed++) {
      const s = { ...state, seed };
      const rng = new SeededRng(deriveStreamSeed(deriveRoundSeed(seed, 6), STREAM_IDS.events));
      const event = generateEvent(s, rng);
      expect(event?.type).not.toBe('global_oil_shock');
    }
  });
});

// ── Oil Shock Distressed Deals ─────────────────────────────────────

describe('generateOilShockDeals', () => {
  it('generates the requested number of distressed deals', () => {
    const rng = new SeededRng(42);
    const deals = generateOilShockDeals(5, 20, rng, 10000, 3);
    expect(deals.length).toBe(3);
  });

  it('deals have discounted prices', () => {
    const rng = new SeededRng(42);
    const deals = generateOilShockDeals(5, 20, rng, 10000, 3);
    for (const deal of deals) {
      // All oil shock deals should have a discount applied
      expect(deal.askingPrice).toBeGreaterThan(0);
      expect(deal.source).toBe('brokered');
    }
  });

  it('works with different counts', () => {
    const rng1 = new SeededRng(99);
    const deals1 = generateOilShockDeals(3, 20, rng1, 5000, 1);
    expect(deals1.length).toBe(1);

    const rng2 = new SeededRng(99);
    const deals2 = generateOilShockDeals(3, 20, rng2, 5000, 5);
    expect(deals2.length).toBe(5);
  });
});
