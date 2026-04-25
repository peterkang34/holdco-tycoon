/**
 * Unit tests for the scenario rule resolver (Phase 4).
 *
 * Pure function tests — no store, no engine integration. Verify the layer
 * precedence + sparse-key inheritance + trigger overlay composition rules
 * documented in scenarioRules.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveAllowedSectors,
  resolveAllowedSubTypes,
  resolveDisabledFeatures,
  resolveFevMultiplier,
  listFiredFevMultipliers,
  evaluateTriggers,
  MAX_FEV_MULTIPLIER,
} from '../scenarioRules';
import type { GameState, ScenarioChallengeConfig, Metrics, Business, ScenarioTrigger } from '../types';

type ScenarioState = Pick<
  GameState,
  'isScenarioChallengeMode' | 'scenarioChallengeConfig'
> & Partial<Pick<GameState, 'round' | 'triggeredTriggerIds'>>;

function makeConfig(overrides: Partial<ScenarioChallengeConfig> = {}): ScenarioChallengeConfig {
  return {
    id: 's', name: 's', tagline: '', description: '', configVersion: 1,
    theme: { emoji: '🧪', color: '#000' },
    startDate: '2026-01-01', endDate: '2026-12-31',
    isActive: true, isFeatured: false,
    seed: 1, difficulty: 'easy', duration: 'standard', maxRounds: 10,
    startingCash: 1000, startingDebt: 0, founderShares: 800, sharesOutstanding: 1000,
    startingBusinesses: [],
    rankingMetric: 'fev',
    ...overrides,
  };
}

function makeState(round: number, config: ScenarioChallengeConfig, triggeredTriggerIds: string[] = []): ScenarioState {
  return {
    isScenarioChallengeMode: true,
    scenarioChallengeConfig: config,
    round,
    triggeredTriggerIds,
  };
}

// ── Round-map resolution (Feature A) ──────────────────────────────────────

describe('resolveAllowedSectors — sparse-key inheritance + replace semantics', () => {
  it('returns null when scenario mode off', () => {
    expect(resolveAllowedSectors({ isScenarioChallengeMode: false })).toBeNull();
  });

  it('falls back to static allowedSectors when no byRound map', () => {
    const cfg = makeConfig({ allowedSectors: ['agency'] });
    expect(resolveAllowedSectors(makeState(3, cfg))).toEqual(['agency']);
  });

  it('returns null when no restrictions at all (unrestricted scenario)', () => {
    expect(resolveAllowedSectors(makeState(3, makeConfig()))).toBeNull();
  });

  it('round 1 explicit entry replaces static', () => {
    const cfg = makeConfig({
      allowedSectors: ['agency'],
      allowedSectorsByRound: { 1: ['saas'] },
    });
    expect(resolveAllowedSectors(makeState(1, cfg))).toEqual(['saas']);
  });

  it('inherits from most recent prior key when round has no own entry', () => {
    const cfg = makeConfig({
      allowedSectorsByRound: { 1: ['agency'], 5: ['saas'], 9: ['healthcare'] },
    });
    expect(resolveAllowedSectors(makeState(3, cfg))).toEqual(['agency']);
    expect(resolveAllowedSectors(makeState(5, cfg))).toEqual(['saas']);
    expect(resolveAllowedSectors(makeState(7, cfg))).toEqual(['saas']);
    expect(resolveAllowedSectors(makeState(9, cfg))).toEqual(['healthcare']);
    expect(resolveAllowedSectors(makeState(10, cfg))).toEqual(['healthcare']);
  });

  it('REPLACES (does not union) at round transitions', () => {
    const cfg = makeConfig({
      allowedSectorsByRound: { 1: ['agency'], 5: ['saas'] },
    });
    // Round 5 transitions from agency → saas. Agency is GONE, not unioned.
    const round5 = resolveAllowedSectors(makeState(5, cfg));
    expect(round5).toEqual(['saas']);
    expect(round5).not.toContain('agency');
  });

  it('falls back to static for rounds before any byRound key fires', () => {
    const cfg = makeConfig({
      allowedSectors: ['agency'],
      allowedSectorsByRound: { 5: ['saas'] }, // first key at round 5
    });
    expect(resolveAllowedSectors(makeState(1, cfg))).toEqual(['agency']);
    expect(resolveAllowedSectors(makeState(4, cfg))).toEqual(['agency']);
    expect(resolveAllowedSectors(makeState(5, cfg))).toEqual(['saas']);
  });
});

describe('resolveAllowedSectors — trigger overlay composition', () => {
  it('addAllowedSectors trigger unions on top of base round map', () => {
    const cfg = makeConfig({
      allowedSectorsByRound: { 1: ['agency'] },
      triggers: [{
        id: 'unlock-saas',
        when: { metric: 'cash', op: '>=', value: 1 },
        actions: [{ type: 'addAllowedSectors', sectors: ['saas'] }],
        narrative: { title: 'A', detail: 'A' },
      }],
    });
    expect(resolveAllowedSectors(makeState(2, cfg, []))).toEqual(['agency']);
    // After trigger fires (id in triggeredTriggerIds), saas is unioned in.
    expect(resolveAllowedSectors(makeState(2, cfg, ['unlock-saas']))).toEqual(['agency', 'saas']);
  });

  it('setAllowedSectors trigger HARD-REPLACES the base list', () => {
    const cfg = makeConfig({
      allowedSectorsByRound: { 1: ['agency', 'b2bServices'] },
      triggers: [{
        id: 'pivot-to-saas',
        when: { metric: 'round', op: '>=', value: 5 },
        actions: [{ type: 'setAllowedSectors', sectors: ['saas'] }],
        narrative: { title: 'A', detail: 'A' },
      }],
    });
    expect(resolveAllowedSectors(makeState(3, cfg, []))).toEqual(['agency', 'b2bServices']);
    // After fire, saas REPLACES (not unions with) agency + b2bServices.
    expect(resolveAllowedSectors(makeState(5, cfg, ['pivot-to-saas']))).toEqual(['saas']);
  });

  it('setAllowedSectors + concurrent addAllowedSectors: set wins, adds layer on top', () => {
    const cfg = makeConfig({
      allowedSectorsByRound: { 1: ['agency'] },
      triggers: [
        { id: 'pivot', when: { metric: 'round', op: '>=', value: 1 }, actions: [{ type: 'setAllowedSectors', sectors: ['saas'] }], narrative: { title: 'A', detail: 'A' } },
        { id: 'unlock-fin', when: { metric: 'round', op: '>=', value: 1 }, actions: [{ type: 'addAllowedSectors', sectors: ['fintech'] }], narrative: { title: 'B', detail: 'B' } },
      ],
    });
    const sectors = resolveAllowedSectors(makeState(2, cfg, ['pivot', 'unlock-fin']));
    expect(sectors).toEqual(['saas', 'fintech']);
    expect(sectors).not.toContain('agency'); // base wiped by setAllowedSectors
  });

  it('untriggered triggers do not affect resolution', () => {
    const cfg = makeConfig({
      allowedSectors: ['agency'],
      triggers: [{
        id: 'unlock-saas',
        when: { metric: 'cash', op: '>=', value: 999_999 },
        actions: [{ type: 'addAllowedSectors', sectors: ['saas'] }],
        narrative: { title: 'A', detail: 'A' },
      }],
    });
    // Trigger NOT in triggeredTriggerIds, so saas is not added.
    expect(resolveAllowedSectors(makeState(2, cfg, []))).toEqual(['agency']);
  });
});

// ── Sub-type resolution ───────────────────────────────────────────────────

describe('resolveAllowedSubTypes — same semantics as sectors', () => {
  it('inherits from prior key', () => {
    const cfg = makeConfig({
      allowedSubTypesByRound: { 1: ['Creative/Brand Agency'], 5: ['Performance Media Agency'] },
    });
    expect(resolveAllowedSubTypes(makeState(3, cfg))).toEqual(['Creative/Brand Agency']);
    expect(resolveAllowedSubTypes(makeState(5, cfg))).toEqual(['Performance Media Agency']);
  });

  it('addAllowedSubTypes trigger unions on top', () => {
    const cfg = makeConfig({
      allowedSubTypes: ['Creative/Brand Agency'],
      triggers: [{
        id: 'sub-unlock',
        when: { metric: 'cash', op: '>=', value: 1 },
        actions: [{ type: 'addAllowedSubTypes', subTypes: ['SEO/Content Agency'] }],
        narrative: { title: 'A', detail: 'A' },
      }],
    });
    expect(resolveAllowedSubTypes(makeState(2, cfg, ['sub-unlock'])))
      .toEqual(['Creative/Brand Agency', 'SEO/Content Agency']);
  });
});

// ── Disabled-features resolution ──────────────────────────────────────────

describe('resolveDisabledFeatures — trigger enableFeature unlocks', () => {
  it('returns base disabledFeatures when no triggers fired', () => {
    const cfg = makeConfig({ disabledFeatures: { ipo: true, equityRaise: true } });
    expect(resolveDisabledFeatures(makeState(2, cfg, [])))
      .toEqual({ ipo: true, equityRaise: true });
  });

  it('enableFeature trigger clears the flag (sets to false)', () => {
    const cfg = makeConfig({
      disabledFeatures: { ipo: true, equityRaise: true },
      triggers: [{
        id: 'unlock-ipo',
        when: { metric: 'portfolioEbitda', op: '>=', value: 10000 },
        actions: [{ type: 'enableFeature', feature: 'ipo' }],
        narrative: { title: 'A', detail: 'A' },
      }],
    });
    const result = resolveDisabledFeatures(makeState(5, cfg, ['unlock-ipo']));
    expect(result?.ipo).toBe(false);
    expect(result?.equityRaise).toBe(true); // still disabled
  });
});

// ── Trigger evaluation ────────────────────────────────────────────────────

function makeBiz(overrides: Partial<Business> = {}): Business {
  // Test fixture — many engine-only fields are irrelevant here. Cast at end to
  // satisfy the structural type without enumerating every default. Tests below
  // exercise resolver logic, not Business invariants.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ({
    id: 'b1', name: 'B', sectorId: 'agency', subType: 'Creative/Brand Agency',
    ebitda: 1000, peakEbitda: 1000, acquisitionEbitda: 1000,
    acquisitionPrice: 5000, acquisitionRound: 0, acquisitionMultiple: 5,
    acquisitionSizeTierPremium: 0, organicGrowthRate: 0.05,
    revenue: 5000, ebitdaMargin: 0.20, acquisitionRevenue: 5000, acquisitionMargin: 0.20,
    peakRevenue: 5000, revenueGrowthRate: 0.05, marginDriftRate: -0.005,
    qualityRating: 3, dueDiligence: {} as never,
    integrationRoundsRemaining: 0, integrationGrowthDrag: 0, improvements: [],
    sellerNoteBalance: 0, sellerNoteRate: 0, sellerNoteRoundsRemaining: 0,
    bankDebtBalance: 0, bankDebtRate: 0, bankDebtRoundsRemaining: 0,
    earnoutRemaining: 0, earnoutTarget: 0,
    status: 'active',
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    ...overrides,
  } as unknown) as Business;
}

function makeFullState(overrides: { round?: number; cash?: number; businesses?: Business[]; exitedBusinesses?: Business[]; totalDistributions?: number } = {}) {
  return {
    round: overrides.round ?? 3,
    cash: overrides.cash ?? 5000,
    businesses: overrides.businesses ?? [makeBiz()],
    exitedBusinesses: overrides.exitedBusinesses ?? [],
    totalDistributions: overrides.totalDistributions ?? 0,
  };
}

const FAKE_METRICS: Pick<Metrics, 'totalEbitda' | 'totalRevenue' | 'avgEbitdaMargin' | 'netDebtToEbitda'> = {
  totalEbitda: 5000,
  totalRevenue: 25000,
  avgEbitdaMargin: 0.20,
  netDebtToEbitda: 1.5,
};

function makeTrigger(overrides: Partial<ScenarioTrigger>): ScenarioTrigger {
  return {
    id: 't1',
    when: { metric: 'cash', op: '>=', value: 1000 },
    actions: [{ type: 'addAllowedSectors', sectors: ['saas'] }],
    narrative: { title: 'A', detail: 'A' },
    ...overrides,
  };
}

describe('evaluateTriggers — sticky, condition logic, composites', () => {
  it('fires a trigger when its condition is true and not yet fired', () => {
    const cfg = makeConfig({
      triggers: [makeTrigger({ when: { metric: 'cash', op: '>=', value: 1000 } })],
    });
    const fired = evaluateTriggers(makeState(3, cfg, []), FAKE_METRICS, makeFullState({ cash: 5000 }));
    expect(fired.map(t => t.id)).toEqual(['t1']);
  });

  it('does not re-fire a trigger already in triggeredTriggerIds (sticky)', () => {
    const cfg = makeConfig({ triggers: [makeTrigger({})] });
    const fired = evaluateTriggers(makeState(3, cfg, ['t1']), FAKE_METRICS, makeFullState());
    expect(fired).toEqual([]);
  });

  it('respects minRound short-circuit', () => {
    const cfg = makeConfig({ triggers: [makeTrigger({ minRound: 5 })] });
    const fired = evaluateTriggers(makeState(3, cfg, []), FAKE_METRICS, makeFullState({ round: 3 }));
    expect(fired).toEqual([]);
  });

  it('all/any composites work', () => {
    const cfgAll = makeConfig({
      triggers: [makeTrigger({
        id: 'all-pass',
        when: { all: [
          { metric: 'cash', op: '>=', value: 1000 },
          { metric: 'portfolioEbitda', op: '>=', value: 4000 },
        ]},
      })],
    });
    expect(evaluateTriggers(makeState(3, cfgAll, []), FAKE_METRICS, makeFullState({ cash: 5000 }))).toHaveLength(1);

    const cfgAllFail = makeConfig({
      triggers: [makeTrigger({
        id: 'all-fail',
        when: { all: [
          { metric: 'cash', op: '>=', value: 1000 },
          { metric: 'portfolioEbitda', op: '>=', value: 99_999 }, // fails
        ]},
      })],
    });
    expect(evaluateTriggers(makeState(3, cfgAllFail, []), FAKE_METRICS, makeFullState({ cash: 5000 }))).toHaveLength(0);

    const cfgAny = makeConfig({
      triggers: [makeTrigger({
        id: 'any-pass',
        when: { any: [
          { metric: 'cash', op: '>=', value: 99_999 }, // fails
          { metric: 'portfolioEbitda', op: '>=', value: 4000 }, // passes
        ]},
      })],
    });
    expect(evaluateTriggers(makeState(3, cfgAny, []), FAKE_METRICS, makeFullState({ cash: 5000 }))).toHaveLength(1);
  });

  it('hasBusinessInSector evaluates correctly', () => {
    const cfg = makeConfig({
      triggers: [makeTrigger({
        when: { metric: 'hasBusinessInSector', sectorId: 'agency' },
      })],
    });
    expect(evaluateTriggers(makeState(3, cfg, []), FAKE_METRICS, makeFullState({ businesses: [makeBiz({ sectorId: 'agency' })] }))).toHaveLength(1);
    expect(evaluateTriggers(makeState(3, cfg, []), FAKE_METRICS, makeFullState({ businesses: [makeBiz({ sectorId: 'saas' })] }))).toHaveLength(0);
  });

  it('hasBusinessWithQuality reads max active-business quality', () => {
    const cfg = makeConfig({
      triggers: [makeTrigger({
        when: { metric: 'hasBusinessWithQuality', op: '>=', value: 4 },
      })],
    });
    expect(evaluateTriggers(makeState(3, cfg, []), FAKE_METRICS, makeFullState({ businesses: [makeBiz({ qualityRating: 3 })] }))).toHaveLength(0);
    expect(evaluateTriggers(makeState(3, cfg, []), FAKE_METRICS, makeFullState({ businesses: [makeBiz({ qualityRating: 5 })] }))).toHaveLength(1);
  });

  it('determinism: same state → same firing sequence', () => {
    const cfg = makeConfig({
      triggers: [
        makeTrigger({ id: 'a', when: { metric: 'cash', op: '>=', value: 1000 } }),
        makeTrigger({ id: 'b', when: { metric: 'portfolioEbitda', op: '>=', value: 4000 } }),
      ],
    });
    const fullState = makeFullState({ cash: 5000 });
    const r1 = evaluateTriggers(makeState(3, cfg, []), FAKE_METRICS, fullState);
    const r2 = evaluateTriggers(makeState(3, cfg, []), FAKE_METRICS, fullState);
    expect(r1.map(t => t.id)).toEqual(r2.map(t => t.id));
    expect(r1.map(t => t.id)).toEqual(['a', 'b']);
  });
});

// ── Phase 5: FEV multiplier resolver ──────────────────────────────────────

describe('resolveFevMultiplier — milestone-based FEV bonuses', () => {
  it('returns 1.0 when scenario mode off', () => {
    expect(resolveFevMultiplier({ isScenarioChallengeMode: false })).toBe(1);
  });

  it('returns 1.0 when no triggers fired', () => {
    const cfg = makeConfig({
      triggers: [{
        id: 'm1',
        when: { metric: 'cash', op: '>=', value: 10000 },
        actions: [{ type: 'applyFevMultiplier', value: 1.5 }],
        narrative: { title: 'A', detail: 'A' },
      }],
    });
    expect(resolveFevMultiplier(makeState(3, cfg, []))).toBe(1);
  });

  it('applies a single fired multiplier', () => {
    const cfg = makeConfig({
      triggers: [{
        id: 'm1',
        when: { metric: 'cash', op: '>=', value: 1 },
        actions: [{ type: 'applyFevMultiplier', value: 1.5 }],
        narrative: { title: 'A', detail: 'A' },
      }],
    });
    expect(resolveFevMultiplier(makeState(3, cfg, ['m1']))).toBe(1.5);
  });

  it('stacks multiple fired multipliers multiplicatively', () => {
    const cfg = makeConfig({
      triggers: [
        { id: 'm1', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 1.5 }], narrative: { title: 'A', detail: 'A' } },
        { id: 'm2', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 1.2 }], narrative: { title: 'B', detail: 'B' } },
      ],
    });
    expect(resolveFevMultiplier(makeState(3, cfg, ['m1', 'm2']))).toBeCloseTo(1.8); // 1.5 × 1.2
  });

  it('caps stacked multipliers at MAX_FEV_MULTIPLIER (5×)', () => {
    const cfg = makeConfig({
      triggers: [
        { id: 'm1', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 5 }], narrative: { title: 'A', detail: 'A' } },
        { id: 'm2', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 5 }], narrative: { title: 'B', detail: 'B' } },
      ],
    });
    // 5 × 5 = 25 → capped at 5
    expect(resolveFevMultiplier(makeState(3, cfg, ['m1', 'm2']))).toBe(MAX_FEV_MULTIPLIER);
  });

  it('ignores untriggered multiplier triggers', () => {
    const cfg = makeConfig({
      triggers: [
        { id: 'fired', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 1.5 }], narrative: { title: 'A', detail: 'A' } },
        { id: 'unfired', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 2.0 }], narrative: { title: 'B', detail: 'B' } },
      ],
    });
    expect(resolveFevMultiplier(makeState(3, cfg, ['fired']))).toBe(1.5);
  });

  it('listFiredFevMultipliers returns triggers in config order with their values', () => {
    const cfg = makeConfig({
      triggers: [
        { id: 'm1', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 1.5 }], narrative: { title: 'Alpha', detail: 'A' } },
        { id: 'm2', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 1.2 }], narrative: { title: 'Beta', detail: 'B' } },
      ],
    });
    const fired = listFiredFevMultipliers(makeState(3, cfg, ['m1', 'm2']));
    expect(fired.map(f => f.trigger.id)).toEqual(['m1', 'm2']);
    expect(fired.map(f => f.value)).toEqual([1.5, 1.2]);
  });
});

// ── Phase 5: parameterized platformsAboveEbitda condition ─────────────────

describe('platformsAboveEbitda — parameterized condition', () => {
  function makePlatform(id: string, businessIds: string[]) {
    return {
      id, recipeId: 'r', name: 'P', sectorIds: ['agency'] as const,
      constituentBusinessIds: businessIds, forgedInRound: 1, bonuses: {} as never,
    };
  }

  it('counts integrated platforms whose summed EBITDA ≥ threshold', () => {
    const cfg = makeConfig({
      triggers: [makeTrigger({
        id: 't1',
        when: { metric: 'platformsAboveEbitda', op: '>=', value: 2, threshold: 3000 },
      })],
    });
    // 3 active businesses, 2 platforms: P1=[b1,b2] sums to 4000, P2=[b3] sums to 2000
    const businesses = [
      makeBiz({ id: 'b1', ebitda: 2500 }),
      makeBiz({ id: 'b2', ebitda: 1500 }),
      makeBiz({ id: 'b3', ebitda: 2000 }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const integratedPlatforms = [makePlatform('P1', ['b1', 'b2']), makePlatform('P2', ['b3'])] as any;
    // Only 1 platform meets the 3000 threshold (P1=4000, P2=2000) — condition needs >=2.
    expect(evaluateTriggers(makeState(3, cfg, []), FAKE_METRICS, { ...makeFullState({ businesses }), integratedPlatforms })).toHaveLength(0);
    // Bump P2 to 3500 by changing threshold to 1500 instead. Both qualify now.
    const cfgLower = makeConfig({
      triggers: [makeTrigger({
        id: 't2',
        when: { metric: 'platformsAboveEbitda', op: '>=', value: 2, threshold: 1500 },
      })],
    });
    expect(evaluateTriggers(makeState(3, cfgLower, []), FAKE_METRICS, { ...makeFullState({ businesses }), integratedPlatforms })).toHaveLength(1);
  });
});
