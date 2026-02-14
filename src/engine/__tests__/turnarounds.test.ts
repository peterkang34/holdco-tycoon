import { describe, it, expect } from 'vitest';
import {
  getEligiblePrograms,
  calculateTurnaroundCost,
  getTurnaroundDuration,
  canUnlockTier,
  resolveTurnaround,
  getQualityImprovementChance,
  getTurnaroundExitPremium,
} from '../turnarounds';
import {
  TURNAROUND_PROGRAMS,
  getAvailablePrograms,
  getProgramById,
  getQualityCeiling,
  SECTOR_QUALITY_CEILINGS,
  DEFAULT_QUALITY_CEILING,
  TURNAROUND_TIER_CONFIG,
  getTurnaroundTierAnnualCost,
} from '../../data/turnaroundPrograms';
import {
  TURNAROUND_FATIGUE_THRESHOLD,
  TURNAROUND_FATIGUE_PENALTY,
  TURNAROUND_EXIT_PREMIUM,
  TURNAROUND_EXIT_PREMIUM_MIN_TIERS,
  BASE_QUALITY_IMPROVEMENT_CHANCE,
  QUALITY_IMPROVEMENT_TIER_BONUS,
} from '../../data/gameConfig';
import { createMockBusiness, createMockGameState } from './helpers';
import type { ActiveTurnaround, QualityRating, TurnaroundTier } from '../types';

// ── Program Data Integrity ──

describe('Turnaround program data integrity', () => {
  it('should have exactly 7 programs', () => {
    expect(TURNAROUND_PROGRAMS).toHaveLength(7);
  });

  it('every program should have unique id', () => {
    const ids = TURNAROUND_PROGRAMS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every program rates should sum to 1.0', () => {
    for (const p of TURNAROUND_PROGRAMS) {
      const sum = p.successRate + p.partialRate + p.failureRate;
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('every program should have positive upfront cost fraction', () => {
    for (const p of TURNAROUND_PROGRAMS) {
      expect(p.upfrontCostFraction).toBeGreaterThan(0);
      expect(p.upfrontCostFraction).toBeLessThan(1);
    }
  });

  it('quick duration should be <= standard duration for every program', () => {
    for (const p of TURNAROUND_PROGRAMS) {
      expect(p.durationQuick).toBeLessThanOrEqual(p.durationStandard);
    }
  });

  it('targetQuality should be > sourceQuality for every program', () => {
    for (const p of TURNAROUND_PROGRAMS) {
      expect(p.targetQuality).toBeGreaterThan(p.sourceQuality);
    }
  });
});

// ── Program Eligibility ──

describe('getEligiblePrograms', () => {
  it('returns empty for turnaround tier 0', () => {
    const biz = createMockBusiness({ qualityRating: 1 });
    const result = getEligiblePrograms(biz, 0, []);
    expect(result).toEqual([]);
  });

  it('T1 only shows Q1→Q2 and Q2→Q3 programs', () => {
    // Q1 business at T1
    const bizQ1 = createMockBusiness({ qualityRating: 1, sectorId: 'healthcare' });
    const programsQ1 = getEligiblePrograms(bizQ1, 1, []);
    expect(programsQ1).toHaveLength(1);
    expect(programsQ1[0].id).toBe('t1_plan_a'); // Q1→Q2

    // Q2 business at T1
    const bizQ2 = createMockBusiness({ qualityRating: 2, sectorId: 'healthcare' });
    const programsQ2 = getEligiblePrograms(bizQ2, 1, []);
    expect(programsQ2).toHaveLength(1);
    expect(programsQ2[0].id).toBe('t1_plan_b'); // Q2→Q3
  });

  it('T2 adds Q1→Q3 and Q2→Q4 programs', () => {
    const bizQ1 = createMockBusiness({ qualityRating: 1, sectorId: 'healthcare' });
    const programsQ1 = getEligiblePrograms(bizQ1, 2, []);
    // T1: t1_plan_a (Q1→Q2) + T2: t2_plan_a (Q1→Q3)
    expect(programsQ1).toHaveLength(2);
    const ids = programsQ1.map(p => p.id);
    expect(ids).toContain('t1_plan_a');
    expect(ids).toContain('t2_plan_a');

    const bizQ2 = createMockBusiness({ qualityRating: 2, sectorId: 'healthcare' });
    const programsQ2 = getEligiblePrograms(bizQ2, 2, []);
    // T1: t1_plan_b (Q2→Q3) + T2: t2_plan_b (Q2→Q4)
    expect(programsQ2).toHaveLength(2);
    const idsQ2 = programsQ2.map(p => p.id);
    expect(idsQ2).toContain('t1_plan_b');
    expect(idsQ2).toContain('t2_plan_b');
  });

  it('T3 adds Q1→Q4, Q2→Q5, and quick variant programs', () => {
    const bizQ1 = createMockBusiness({ qualityRating: 1, sectorId: 'healthcare' });
    const programsQ1 = getEligiblePrograms(bizQ1, 3, []);
    // T1: t1_plan_a (Q1→Q2) + T2: t2_plan_a (Q1→Q3) + T3: t3_plan_a (Q1→Q4) + t3_quick (Q1→Q4)
    expect(programsQ1).toHaveLength(4);
    const ids = programsQ1.map(p => p.id);
    expect(ids).toContain('t1_plan_a');
    expect(ids).toContain('t2_plan_a');
    expect(ids).toContain('t3_plan_a');
    expect(ids).toContain('t3_quick');

    const bizQ2 = createMockBusiness({ qualityRating: 2, sectorId: 'healthcare' });
    const programsQ2 = getEligiblePrograms(bizQ2, 3, []);
    // T1: t1_plan_b (Q2→Q3) + T2: t2_plan_b (Q2→Q4) + T3: t3_plan_b (Q2→Q5)
    expect(programsQ2).toHaveLength(3);
    const idsQ2 = programsQ2.map(p => p.id);
    expect(idsQ2).toContain('t1_plan_b');
    expect(idsQ2).toContain('t2_plan_b');
    expect(idsQ2).toContain('t3_plan_b');
  });

  it('returns no programs for Q3+ businesses (no source matches)', () => {
    const bizQ3 = createMockBusiness({ qualityRating: 3, sectorId: 'healthcare' });
    const programs = getEligiblePrograms(bizQ3, 3, []);
    expect(programs).toEqual([]);
  });

  it('cannot start turnaround on business with active turnaround', () => {
    const biz = createMockBusiness({ id: 'biz_target', qualityRating: 1, sectorId: 'healthcare' });
    const activeTurnarounds: ActiveTurnaround[] = [{
      id: 'ta_1',
      businessId: 'biz_target',
      programId: 't1_plan_a',
      startRound: 1,
      endRound: 5,
      status: 'active',
    }];

    const programs = getEligiblePrograms(biz, 3, activeTurnarounds);
    expect(programs).toEqual([]);
  });

  it('allows turnaround if existing turnaround on same business is completed', () => {
    const biz = createMockBusiness({ id: 'biz_target', qualityRating: 2, sectorId: 'healthcare' });
    const activeTurnarounds: ActiveTurnaround[] = [{
      id: 'ta_1',
      businessId: 'biz_target',
      programId: 't1_plan_a',
      startRound: 1,
      endRound: 5,
      status: 'completed',
    }];

    const programs = getEligiblePrograms(biz, 1, activeTurnarounds);
    expect(programs.length).toBeGreaterThan(0);
  });

  it('cannot start turnaround if business quality does not match program source', () => {
    // Q3 business — no programs have sourceQuality=3
    const biz = createMockBusiness({ qualityRating: 3, sectorId: 'healthcare' });
    const programs = getEligiblePrograms(biz, 3, []);
    expect(programs).toEqual([]);
  });
});

// ── Quality Ceiling Enforcement ──

describe('Quality ceiling enforcement', () => {
  it('agency businesses cannot turnaround past Q3', () => {
    expect(getQualityCeiling('agency')).toBe(3);

    const biz = createMockBusiness({ qualityRating: 1, sectorId: 'agency' });
    const programs = getEligiblePrograms(biz, 3, []);
    // Should only allow programs targeting Q2 or Q3 (not Q4+)
    for (const p of programs) {
      expect(p.targetQuality).toBeLessThanOrEqual(3);
    }
  });

  it('SaaS businesses cannot turnaround past Q4', () => {
    expect(getQualityCeiling('saas')).toBe(4);

    const biz = createMockBusiness({ qualityRating: 2, sectorId: 'saas' });
    const programs = getEligiblePrograms(biz, 3, []);
    for (const p of programs) {
      expect(p.targetQuality).toBeLessThanOrEqual(4);
    }
    // t3_plan_b targets Q5 — should be excluded for SaaS
    const hasQ5 = programs.some(p => p.targetQuality === 5);
    expect(hasQ5).toBe(false);
  });

  it('healthcare can reach Q5 (default ceiling)', () => {
    expect(getQualityCeiling('healthcare')).toBe(DEFAULT_QUALITY_CEILING);
    expect(DEFAULT_QUALITY_CEILING).toBe(5);

    const biz = createMockBusiness({ qualityRating: 2, sectorId: 'healthcare' });
    const programs = getEligiblePrograms(biz, 3, []);
    const hasQ5 = programs.some(p => p.targetQuality === 5);
    expect(hasQ5).toBe(true);
  });

  it('industrial businesses cannot turnaround past Q4', () => {
    expect(getQualityCeiling('industrial')).toBe(4);
  });

  it('restaurant businesses cannot turnaround past Q3', () => {
    expect(getQualityCeiling('restaurant')).toBe(3);
  });

  it('sectors without explicit ceiling get default of 5', () => {
    expect(getQualityCeiling('homeServices')).toBe(5);
    expect(getQualityCeiling('b2bServices')).toBe(5);
    expect(getQualityCeiling('education')).toBe(5);
  });
});

// ── Cost Calculation ──

describe('calculateTurnaroundCost', () => {
  it('calculates upfront cost as fraction of EBITDA', () => {
    const program = getProgramById('t1_plan_a')!;
    const biz = createMockBusiness({ ebitda: 1000 });
    // t1_plan_a upfrontCostFraction = 0.10, so 1000 * 0.10 = 100
    const cost = calculateTurnaroundCost(program, biz);
    expect(cost).toBe(100);
  });

  it('uses absolute value of EBITDA for negative EBITDA businesses', () => {
    const program = getProgramById('t1_plan_a')!;
    const biz = createMockBusiness({ ebitda: -500 });
    // |−500| * 0.10 = 50
    const cost = calculateTurnaroundCost(program, biz);
    expect(cost).toBe(50);
  });

  it('rounds to nearest integer', () => {
    const program = getProgramById('t1_plan_b')!;
    // t1_plan_b upfrontCostFraction = 0.12
    const biz = createMockBusiness({ ebitda: 333 });
    // 333 * 0.12 = 39.96 → 40
    const cost = calculateTurnaroundCost(program, biz);
    expect(cost).toBe(40);
  });

  it('scales correctly for large EBITDA', () => {
    const program = getProgramById('t3_plan_a')!;
    // t3_plan_a upfrontCostFraction = 0.18
    const biz = createMockBusiness({ ebitda: 5000 });
    // 5000 * 0.18 = 900
    const cost = calculateTurnaroundCost(program, biz);
    expect(cost).toBe(900);
  });

  it('t3_quick costs 1.5x of t3_plan_a fraction', () => {
    const quick = getProgramById('t3_quick')!;
    const planA = getProgramById('t3_plan_a')!;
    expect(quick.upfrontCostFraction).toBeCloseTo(planA.upfrontCostFraction * 1.5, 2);
  });
});

// ── Duration Scaling ──

describe('getTurnaroundDuration', () => {
  it('returns standard duration for standard mode', () => {
    const program = getProgramById('t1_plan_a')!;
    expect(getTurnaroundDuration(program, 'standard')).toBe(4);
  });

  it('returns quick duration for quick mode', () => {
    const program = getProgramById('t1_plan_a')!;
    expect(getTurnaroundDuration(program, 'quick')).toBe(2);
  });

  it('standard durations match program definitions', () => {
    expect(getTurnaroundDuration(getProgramById('t1_plan_a')!, 'standard')).toBe(4);
    expect(getTurnaroundDuration(getProgramById('t1_plan_b')!, 'standard')).toBe(4);
    expect(getTurnaroundDuration(getProgramById('t2_plan_a')!, 'standard')).toBe(5);
    expect(getTurnaroundDuration(getProgramById('t2_plan_b')!, 'standard')).toBe(5);
    expect(getTurnaroundDuration(getProgramById('t3_plan_a')!, 'standard')).toBe(6);
    expect(getTurnaroundDuration(getProgramById('t3_plan_b')!, 'standard')).toBe(6);
    expect(getTurnaroundDuration(getProgramById('t3_quick')!, 'standard')).toBe(3);
  });

  it('quick durations match program definitions', () => {
    expect(getTurnaroundDuration(getProgramById('t1_plan_a')!, 'quick')).toBe(2);
    expect(getTurnaroundDuration(getProgramById('t1_plan_b')!, 'quick')).toBe(2);
    expect(getTurnaroundDuration(getProgramById('t2_plan_a')!, 'quick')).toBe(3);
    expect(getTurnaroundDuration(getProgramById('t2_plan_b')!, 'quick')).toBe(3);
    expect(getTurnaroundDuration(getProgramById('t3_plan_a')!, 'quick')).toBe(3);
    expect(getTurnaroundDuration(getProgramById('t3_plan_b')!, 'quick')).toBe(3);
    expect(getTurnaroundDuration(getProgramById('t3_quick')!, 'quick')).toBe(2);
  });
});

// ── Turnaround Resolution ──

describe('resolveTurnaround', () => {
  const program = getProgramById('t1_plan_a')!;
  // t1_plan_a: successRate=0.65, partialRate=0.30, failureRate=0.05, Q1→Q2

  it('returns success when roll < successRate', () => {
    const outcome = resolveTurnaround(program, 0, 0.30);
    expect(outcome.result).toBe('success');
    expect(outcome.qualityChange).toBe(1); // Q2 - Q1
    expect(outcome.ebitdaMultiplier).toBe(1 + program.ebitdaBoostOnSuccess);
    expect(outcome.targetQuality).toBe(2);
  });

  it('returns partial when roll between successRate and successRate+partialRate', () => {
    const outcome = resolveTurnaround(program, 0, 0.80);
    expect(outcome.result).toBe('partial');
    expect(outcome.qualityChange).toBe(1); // partial = +1 tier for 1-tier programs
    expect(outcome.ebitdaMultiplier).toBe(1 + program.ebitdaBoostOnPartial);
  });

  it('returns failure when roll > successRate+partialRate', () => {
    const outcome = resolveTurnaround(program, 0, 0.97);
    expect(outcome.result).toBe('failure');
    expect(outcome.qualityChange).toBe(0);
    expect(outcome.ebitdaMultiplier).toBe(1 - program.ebitdaDamageOnFailure);
    expect(outcome.targetQuality).toBe(program.sourceQuality);
  });

  it('success at boundary: roll exactly 0', () => {
    const outcome = resolveTurnaround(program, 0, 0);
    expect(outcome.result).toBe('success');
  });

  it('failure at boundary: roll = 0.999', () => {
    const outcome = resolveTurnaround(program, 0, 0.999);
    expect(outcome.result).toBe('failure');
  });

  it('multi-tier program success gives full quality jump', () => {
    const t2a = getProgramById('t2_plan_a')!; // Q1→Q3
    const outcome = resolveTurnaround(t2a, 0, 0.10);
    expect(outcome.result).toBe('success');
    expect(outcome.qualityChange).toBe(2); // Q3 - Q1
    expect(outcome.targetQuality).toBe(3);
  });

  it('multi-tier program partial gives only +1 tier', () => {
    const t2a = getProgramById('t2_plan_a')!; // Q1→Q3, successRate=0.68
    const outcome = resolveTurnaround(t2a, 0, 0.75); // > 0.68, < 0.68+0.27
    expect(outcome.result).toBe('partial');
    expect(outcome.qualityChange).toBe(1); // only +1, not +2
    expect(outcome.targetQuality).toBe(2); // Q1 + 1 = Q2
  });
});

// ── Portfolio Fatigue ──

describe('Portfolio fatigue', () => {
  it('no penalty with fewer than 4 active turnarounds', () => {
    const program = getProgramById('t1_plan_a')!;
    // 3 active turnarounds, below threshold (4)
    const outcome = resolveTurnaround(program, 3, 0.60);
    // 0.60 < 0.65 = success
    expect(outcome.result).toBe('success');
  });

  it('reduces success rate by 10ppt with 4+ active turnarounds', () => {
    const program = getProgramById('t1_plan_a')!;
    // successRate = 0.65, with fatigue: 0.65 - 0.10 = 0.55
    // Roll 0.57 would normally be success, but with fatigue it's partial
    const outcome = resolveTurnaround(program, 4, 0.57);
    expect(outcome.result).toBe('partial');
  });

  it('success still possible with fatigue for low rolls', () => {
    const program = getProgramById('t1_plan_a')!;
    // With fatigue: successRate = 0.55, roll 0.40 < 0.55
    const outcome = resolveTurnaround(program, 5, 0.40);
    expect(outcome.result).toBe('success');
  });

  it('fatigue threshold is 4', () => {
    expect(TURNAROUND_FATIGUE_THRESHOLD).toBe(4);
  });

  it('fatigue penalty is 10ppt', () => {
    expect(TURNAROUND_FATIGUE_PENALTY).toBe(0.10);
  });
});

// ── Turnaround Exit Premium ──

describe('getTurnaroundExitPremium', () => {
  it('returns +0.25x for business with 2+ quality tiers improved', () => {
    const biz = createMockBusiness({ qualityImprovedTiers: 2 });
    expect(getTurnaroundExitPremium(biz)).toBe(0.25);
  });

  it('returns +0.25x for business with 3 quality tiers improved', () => {
    const biz = createMockBusiness({ qualityImprovedTiers: 3 });
    expect(getTurnaroundExitPremium(biz)).toBe(0.25);
  });

  it('returns 0 for business with only 1 quality tier improved', () => {
    const biz = createMockBusiness({ qualityImprovedTiers: 1 });
    expect(getTurnaroundExitPremium(biz)).toBe(0);
  });

  it('returns 0 for business with 0 quality tiers improved', () => {
    const biz = createMockBusiness({ qualityImprovedTiers: 0 });
    expect(getTurnaroundExitPremium(biz)).toBe(0);
  });

  it('returns 0 for business with undefined qualityImprovedTiers', () => {
    const biz = createMockBusiness();
    // qualityImprovedTiers defaults to 0 in mock
    expect(getTurnaroundExitPremium(biz)).toBe(0);
  });

  it('exit premium constant is 0.25', () => {
    expect(TURNAROUND_EXIT_PREMIUM).toBe(0.25);
  });

  it('minimum tiers for premium is 2', () => {
    expect(TURNAROUND_EXIT_PREMIUM_MIN_TIERS).toBe(2);
  });
});

// ── Quality Improvement from Ops ──

describe('getQualityImprovementChance', () => {
  it('base chance is 30% with no turnaround tier', () => {
    expect(getQualityImprovementChance(0)).toBe(0.30);
  });

  it('T1 gives 45% (30% + 15ppt)', () => {
    expect(getQualityImprovementChance(1)).toBeCloseTo(0.45, 5);
  });

  it('T2 gives 50% (30% + 20ppt)', () => {
    expect(getQualityImprovementChance(2)).toBeCloseTo(0.50, 5);
  });

  it('T3 gives 55% (30% + 25ppt)', () => {
    expect(getQualityImprovementChance(3)).toBeCloseTo(0.55, 5);
  });

  it('base chance constant matches', () => {
    expect(BASE_QUALITY_IMPROVEMENT_CHANCE).toBe(0.30);
  });

  it('tier bonus constants match', () => {
    expect(QUALITY_IMPROVEMENT_TIER_BONUS[1]).toBe(0.15);
    expect(QUALITY_IMPROVEMENT_TIER_BONUS[2]).toBe(0.20);
    expect(QUALITY_IMPROVEMENT_TIER_BONUS[3]).toBe(0.25);
  });
});

// ── Tier Unlock Validation ──

describe('canUnlockTier', () => {
  it('can unlock T1 with enough opcos and cash', () => {
    const result = canUnlockTier(0, 1000, 2);
    expect(result.canUnlock).toBe(true);
  });

  it('cannot unlock T1 without enough opcos', () => {
    const result = canUnlockTier(0, 1000, 1);
    expect(result.canUnlock).toBe(false);
    expect(result.reason).toContain('2');
  });

  it('cannot unlock T1 without enough cash', () => {
    // T1 requires 600K
    const result = canUnlockTier(0, 500, 2);
    expect(result.canUnlock).toBe(false);
    expect(result.reason).toContain('cash');
  });

  it('can unlock T2 with 3 opcos and 1000K cash', () => {
    const result = canUnlockTier(1, 1000, 3);
    expect(result.canUnlock).toBe(true);
  });

  it('cannot unlock T2 with only 2 opcos', () => {
    const result = canUnlockTier(1, 2000, 2);
    expect(result.canUnlock).toBe(false);
  });

  it('can unlock T3 with 4 opcos and 1400K cash', () => {
    const result = canUnlockTier(2, 1400, 4);
    expect(result.canUnlock).toBe(true);
  });

  it('cannot unlock T3 with insufficient cash', () => {
    const result = canUnlockTier(2, 1200, 4);
    expect(result.canUnlock).toBe(false);
  });

  it('cannot unlock past T3', () => {
    const result = canUnlockTier(3, 99999, 99);
    expect(result.canUnlock).toBe(false);
    expect(result.reason).toContain('maximum');
  });

  it('tier unlock costs match config', () => {
    expect(TURNAROUND_TIER_CONFIG[1].unlockCost).toBe(600);
    expect(TURNAROUND_TIER_CONFIG[2].unlockCost).toBe(1000);
    expect(TURNAROUND_TIER_CONFIG[3].unlockCost).toBe(1400);
  });

  it('tier required opcos match config', () => {
    expect(TURNAROUND_TIER_CONFIG[1].requiredOpcos).toBe(2);
    expect(TURNAROUND_TIER_CONFIG[2].requiredOpcos).toBe(3);
    expect(TURNAROUND_TIER_CONFIG[3].requiredOpcos).toBe(4);
  });
});

// ── Annual Cost ──

describe('getTurnaroundTierAnnualCost', () => {
  it('T0 has no annual cost', () => {
    expect(getTurnaroundTierAnnualCost(0)).toBe(0);
  });

  it('T1 annual cost is 250K', () => {
    expect(getTurnaroundTierAnnualCost(1)).toBe(250);
  });

  it('T2 annual cost is 450K', () => {
    expect(getTurnaroundTierAnnualCost(2)).toBe(450);
  });

  it('T3 annual cost is 700K', () => {
    expect(getTurnaroundTierAnnualCost(3)).toBe(700);
  });
});

// ── Helper Functions ──

describe('getAvailablePrograms', () => {
  it('tier 1 returns only tier 1 programs', () => {
    const programs = getAvailablePrograms(1);
    expect(programs.every(p => p.tierId === 1)).toBe(true);
    expect(programs).toHaveLength(2);
  });

  it('tier 2 returns tier 1 + tier 2 programs', () => {
    const programs = getAvailablePrograms(2);
    expect(programs.every(p => p.tierId <= 2)).toBe(true);
    expect(programs).toHaveLength(4);
  });

  it('tier 3 returns all programs', () => {
    const programs = getAvailablePrograms(3);
    expect(programs).toHaveLength(7);
  });

  it('tier 0 returns no programs', () => {
    const programs = getAvailablePrograms(0);
    expect(programs).toEqual([]);
  });
});

describe('getProgramById', () => {
  it('returns correct program', () => {
    const p = getProgramById('t1_plan_a');
    expect(p).toBeDefined();
    expect(p!.tierId).toBe(1);
    expect(p!.sourceQuality).toBe(1);
    expect(p!.targetQuality).toBe(2);
  });

  it('returns undefined for nonexistent id', () => {
    expect(getProgramById('nonexistent')).toBeUndefined();
  });
});

// ── Mock State Helpers ──

describe('Mock state turnaround fields', () => {
  it('createMockGameState includes turnaround fields', () => {
    const state = createMockGameState();
    expect(state.turnaroundTier).toBe(0);
    expect(state.activeTurnarounds).toEqual([]);
  });

  it('createMockBusiness includes qualityImprovedTiers', () => {
    const biz = createMockBusiness();
    expect(biz.qualityImprovedTiers).toBe(0);
  });

  it('createMockGameState allows turnaround overrides', () => {
    const state = createMockGameState({
      turnaroundTier: 2,
      activeTurnarounds: [{
        id: 'ta_1', businessId: 'biz_1', programId: 't1_plan_a',
        startRound: 1, endRound: 5, status: 'active',
      }],
    });
    expect(state.turnaroundTier).toBe(2);
    expect(state.activeTurnarounds).toHaveLength(1);
  });
});
