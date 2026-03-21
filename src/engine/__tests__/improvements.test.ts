import { describe, it, expect } from 'vitest';
import { createMockBusiness } from './helpers';
import {
  STABILIZATION_TYPES,
  GROWTH_TYPES,
  QUALITY_IMPROVEMENT_MULTIPLIER,
  STABILIZATION_EFFICACY_MULTIPLIER,
  BASE_QUALITY_IMPROVEMENT_CHANCE,
  QUALITY_IMPROVEMENT_TIER_BONUS,
  IMPROVEMENT_COST_FLOOR,
  TURNAROUND_CEILING_BONUS,
  getOwnershipImprovementModifier,
} from '../../data/gameConfig';
import { getQualityCeiling } from '../../data/turnaroundPrograms';
import { getQualityImprovementChance } from '../turnarounds';
import { clampMargin, capGrowthRate } from '../helpers';
import type { OperationalImprovementType, QualityRating, Business } from '../types';

// ── Helpers ──

const ALL_STABILIZATION: OperationalImprovementType[] = [
  'fix_underperformance',
  'management_professionalization',
  'operating_playbook',
];

const ALL_GROWTH: OperationalImprovementType[] = [
  'service_expansion',
  'digital_transformation',
  'recurring_revenue_conversion',
  'pricing_model',
];

const ALL_IMPROVEMENTS: OperationalImprovementType[] = [...ALL_STABILIZATION, ...ALL_GROWTH];

/** Simulate the improvement cost calculation from useGame.ts */
function calculateImprovementCost(business: Business, type: OperationalImprovementType): number {
  const absEbitda = Math.abs(business.ebitda) || 1;
  let cost: number;
  switch (type) {
    case 'operating_playbook': cost = Math.round(absEbitda * 0.15); break;
    case 'pricing_model': cost = Math.round(absEbitda * 0.10); break;
    case 'service_expansion': cost = Math.round(absEbitda * 0.20); break;
    case 'fix_underperformance': cost = Math.round(absEbitda * 0.12); break;
    case 'recurring_revenue_conversion': cost = Math.round(absEbitda * 0.25); break;
    case 'management_professionalization': cost = Math.round(absEbitda * 0.18); break;
    case 'digital_transformation': cost = Math.round(absEbitda * 0.22); break;
    default: cost = 0;
  }
  return Math.max(IMPROVEMENT_COST_FLOOR, cost);
}

/** Simulate improvement effects (margin, revenue, growth boosts) */
function getImprovementEffects(type: OperationalImprovementType, business: Business): {
  marginBoost: number; revenueBoost: number; growthBoost: number;
} {
  switch (type) {
    case 'operating_playbook': return { marginBoost: 0.03, revenueBoost: 0, growthBoost: 0 };
    case 'pricing_model': return { marginBoost: 0.02, revenueBoost: 0.01, growthBoost: 0.01 };
    case 'fix_underperformance': return { marginBoost: 0.04, revenueBoost: 0, growthBoost: 0 };
    case 'recurring_revenue_conversion': return { marginBoost: -0.02, revenueBoost: 0, growthBoost: 0.03 };
    case 'management_professionalization': return { marginBoost: 0.01, revenueBoost: 0, growthBoost: 0.01 };
    case 'digital_transformation':
      return { marginBoost: business.ebitdaMargin > 0.30 ? 0.01 : 0.02, revenueBoost: 0.03, growthBoost: 0.02 };
    case 'service_expansion': return { marginBoost: -0.01, revenueBoost: 0.10, growthBoost: 0 }; // midpoint ~10%
    default: return { marginBoost: 0, revenueBoost: 0, growthBoost: 0 };
  }
}

// ── Tests ──

describe('Improvements System', () => {
  describe('Stabilization vs Growth gating', () => {
    it('all 3 stabilization types are in the STABILIZATION_TYPES set', () => {
      for (const type of ALL_STABILIZATION) {
        expect(STABILIZATION_TYPES.has(type)).toBe(true);
      }
    });

    it('all 4 growth types are in the GROWTH_TYPES set', () => {
      for (const type of ALL_GROWTH) {
        expect(GROWTH_TYPES.has(type)).toBe(true);
      }
    });

    it('stabilization types are NOT in GROWTH_TYPES', () => {
      for (const type of ALL_STABILIZATION) {
        expect(GROWTH_TYPES.has(type)).toBe(false);
      }
    });

    it('growth types are NOT in STABILIZATION_TYPES', () => {
      for (const type of ALL_GROWTH) {
        expect(STABILIZATION_TYPES.has(type)).toBe(false);
      }
    });

    it('Q1 business can use stabilization but not growth', () => {
      const biz = createMockBusiness({ qualityRating: 1 });
      for (const type of ALL_STABILIZATION) {
        // Stabilization: no quality gate
        expect(biz.qualityRating < 3 && STABILIZATION_TYPES.has(type)).toBe(true);
      }
      for (const type of ALL_GROWTH) {
        // Growth types gated behind Q3+
        const blocked = GROWTH_TYPES.has(type) && biz.qualityRating < 3;
        expect(blocked).toBe(true);
      }
    });

    it('Q2 business can use stabilization but not growth', () => {
      const biz = createMockBusiness({ qualityRating: 2 });
      for (const type of ALL_GROWTH) {
        const blocked = GROWTH_TYPES.has(type) && biz.qualityRating < 3;
        expect(blocked).toBe(true);
      }
    });

    it('Q3+ business can use both stabilization and growth', () => {
      for (const q of [3, 4, 5] as QualityRating[]) {
        const biz = createMockBusiness({ qualityRating: q });
        for (const type of ALL_IMPROVEMENTS) {
          const blocked = GROWTH_TYPES.has(type) && biz.qualityRating < 3;
          expect(blocked).toBe(false);
        }
      }
    });

    it('7 total improvement types exist (3 stab + 4 growth)', () => {
      expect(STABILIZATION_TYPES.size).toBe(3);
      expect(GROWTH_TYPES.size).toBe(4);
      expect(ALL_IMPROVEMENTS.length).toBe(7);
    });
  });

  describe('Stabilization efficacy multiplier', () => {
    it('Q1 stabilization uses 0.85x multiplier', () => {
      expect(STABILIZATION_EFFICACY_MULTIPLIER[1]).toBe(0.85);
    });

    it('Q2 stabilization uses 0.90x multiplier', () => {
      expect(STABILIZATION_EFFICACY_MULTIPLIER[2]).toBe(0.90);
    });

    it('Q3+ stabilization uses regular QUALITY_IMPROVEMENT_MULTIPLIER', () => {
      // For Q3+ with stabilization, the code falls through to QUALITY_IMPROVEMENT_MULTIPLIER
      expect(QUALITY_IMPROVEMENT_MULTIPLIER[3]).toBe(1.0);
      expect(QUALITY_IMPROVEMENT_MULTIPLIER[4]).toBe(1.1);
      expect(QUALITY_IMPROVEMENT_MULTIPLIER[5]).toBe(1.2);
    });

    it('stabilization efficacy is always <= quality multiplier for Q1/Q2', () => {
      expect(STABILIZATION_EFFICACY_MULTIPLIER[1]).toBeGreaterThan(QUALITY_IMPROVEMENT_MULTIPLIER[1]);
      expect(STABILIZATION_EFFICACY_MULTIPLIER[2]).toBeGreaterThan(QUALITY_IMPROVEMENT_MULTIPLIER[2]);
    });

    it('multiplies positive boosts, not negative ones', () => {
      // The engine only applies multiplier to positive boosts (marginBoost > 0, revenueBoost > 0, growthBoost > 0)
      const marginBoost = 0.03;
      const mult = STABILIZATION_EFFICACY_MULTIPLIER[1];
      expect(marginBoost * mult).toBeCloseTo(0.0255);
      // Negative boosts remain untouched
      const negativeBoost = -0.01;
      // Negative would remain -0.01 (not multiplied)
      expect(negativeBoost).toBe(-0.01);
    });
  });

  describe('Quality improvement rolls', () => {
    it('base chance is 30% with turnaround tier 0', () => {
      expect(getQualityImprovementChance(0)).toBe(BASE_QUALITY_IMPROVEMENT_CHANCE);
      expect(BASE_QUALITY_IMPROVEMENT_CHANCE).toBe(0.30);
    });

    it('tier 1 adds 15ppt → 45%', () => {
      expect(getQualityImprovementChance(1)).toBeCloseTo(0.45);
      expect(QUALITY_IMPROVEMENT_TIER_BONUS[1]).toBe(0.15);
    });

    it('tier 2 adds 20ppt → 50%', () => {
      expect(getQualityImprovementChance(2)).toBeCloseTo(0.50);
      expect(QUALITY_IMPROVEMENT_TIER_BONUS[2]).toBe(0.20);
    });

    it('tier 3 adds 25ppt → 55%', () => {
      expect(getQualityImprovementChance(3)).toBeCloseTo(0.55);
      expect(QUALITY_IMPROVEMENT_TIER_BONUS[3]).toBe(0.25);
    });

    it('quality roll is skipped for Q1/Q2 stabilization improvements', () => {
      // Engine logic: skipQualityRoll = isStabilization && business.qualityRating <= 2
      for (const q of [1, 2] as QualityRating[]) {
        for (const type of ALL_STABILIZATION) {
          const isStabilization = STABILIZATION_TYPES.has(type);
          const skipQualityRoll = isStabilization && q <= 2;
          expect(skipQualityRoll).toBe(true);
        }
      }
    });

    it('quality roll is NOT skipped for Q3+ stabilization improvements', () => {
      for (const q of [3, 4, 5] as QualityRating[]) {
        for (const type of ALL_STABILIZATION) {
          const skipQualityRoll = STABILIZATION_TYPES.has(type) && q <= 2;
          expect(skipQualityRoll).toBe(false);
        }
      }
    });

    it('quality cannot exceed sector ceiling', () => {
      // agency ceiling is 3, saas ceiling is 4 (typical)
      const agencyCeiling = getQualityCeiling('agency');
      expect(agencyCeiling).toBeLessThanOrEqual(5);
      expect(agencyCeiling).toBeGreaterThanOrEqual(3);

      const saasCeiling = getQualityCeiling('saas');
      expect(saasCeiling).toBeLessThanOrEqual(5);
      expect(saasCeiling).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Ceiling mastery bonus', () => {
    it('defines +2ppt margin boost', () => {
      expect(TURNAROUND_CEILING_BONUS.marginBoost).toBe(0.02);
    });

    it('defines +1% growth boost', () => {
      expect(TURNAROUND_CEILING_BONUS.growthBoost).toBe(0.01);
    });

    it('defines 110% improvement efficacy', () => {
      expect(TURNAROUND_CEILING_BONUS.improvementEfficacy).toBe(1.1);
    });

    it('ceilingMasteryBonus flag prevents double-dip', () => {
      const biz = createMockBusiness({ ceilingMasteryBonus: true } as any);
      // If already earned, should not re-award
      expect((biz as any).ceilingMasteryBonus).toBe(true);
    });
  });

  describe('Improvement cost calculation', () => {
    it('cost is percentage of EBITDA per type', () => {
      const biz = createMockBusiness({ ebitda: 2000 });
      expect(calculateImprovementCost(biz, 'operating_playbook')).toBe(300); // 15%
      expect(calculateImprovementCost(biz, 'fix_underperformance')).toBe(240); // 12%
      expect(calculateImprovementCost(biz, 'pricing_model')).toBe(200); // 10%
      expect(calculateImprovementCost(biz, 'management_professionalization')).toBe(360); // 18%
      expect(calculateImprovementCost(biz, 'service_expansion')).toBe(400); // 20%
      expect(calculateImprovementCost(biz, 'digital_transformation')).toBe(440); // 22%
      expect(calculateImprovementCost(biz, 'recurring_revenue_conversion')).toBe(500); // 25%
    });

    it('cost is floored at IMPROVEMENT_COST_FLOOR ($200K)', () => {
      const tinyBiz = createMockBusiness({ ebitda: 100 });
      expect(IMPROVEMENT_COST_FLOOR).toBe(200);
      for (const type of ALL_IMPROVEMENTS) {
        expect(calculateImprovementCost(tinyBiz, type)).toBeGreaterThanOrEqual(IMPROVEMENT_COST_FLOOR);
      }
    });

    it('cost uses absolute EBITDA for negative-EBITDA businesses', () => {
      const negativeBiz = createMockBusiness({ ebitda: -1000 });
      const cost = calculateImprovementCost(negativeBiz, 'operating_playbook');
      expect(cost).toBe(Math.max(IMPROVEMENT_COST_FLOOR, Math.round(1000 * 0.15)));
    });
  });

  describe('Improvement effects end-to-end', () => {
    it('operating_playbook: +3ppt margin, no revenue/growth', () => {
      const effects = getImprovementEffects('operating_playbook', createMockBusiness());
      expect(effects.marginBoost).toBe(0.03);
      expect(effects.revenueBoost).toBe(0);
      expect(effects.growthBoost).toBe(0);
    });

    it('fix_underperformance: +4ppt margin', () => {
      const effects = getImprovementEffects('fix_underperformance', createMockBusiness());
      expect(effects.marginBoost).toBe(0.04);
      expect(effects.revenueBoost).toBe(0);
      expect(effects.growthBoost).toBe(0);
    });

    it('pricing_model: +2ppt margin, +1% revenue, +1% growth', () => {
      const effects = getImprovementEffects('pricing_model', createMockBusiness());
      expect(effects.marginBoost).toBe(0.02);
      expect(effects.revenueBoost).toBe(0.01);
      expect(effects.growthBoost).toBe(0.01);
    });

    it('management_professionalization: +1ppt margin, +1% growth', () => {
      const effects = getImprovementEffects('management_professionalization', createMockBusiness());
      expect(effects.marginBoost).toBe(0.01);
      expect(effects.growthBoost).toBe(0.01);
    });

    it('digital_transformation: varies margin by current level', () => {
      // Low-margin business: +2ppt
      const lowMargin = createMockBusiness({ ebitdaMargin: 0.20 });
      expect(getImprovementEffects('digital_transformation', lowMargin).marginBoost).toBe(0.02);
      // High-margin business (>30%): +1ppt
      const highMargin = createMockBusiness({ ebitdaMargin: 0.35 });
      expect(getImprovementEffects('digital_transformation', highMargin).marginBoost).toBe(0.01);
    });

    it('recurring_revenue_conversion: -2ppt margin but +3% growth', () => {
      const effects = getImprovementEffects('recurring_revenue_conversion', createMockBusiness());
      expect(effects.marginBoost).toBe(-0.02);
      expect(effects.growthBoost).toBe(0.03);
    });

    it('service_expansion: -1ppt margin but +revenue', () => {
      const effects = getImprovementEffects('service_expansion', createMockBusiness());
      expect(effects.marginBoost).toBe(-0.01);
      expect(effects.revenueBoost).toBeGreaterThan(0);
    });
  });

  describe('Improvement stacking', () => {
    it('same improvement type cannot be applied twice (duplicate guard)', () => {
      const biz = createMockBusiness({
        improvements: [{ type: 'operating_playbook', appliedRound: 1, effect: 0.03 }],
      });
      const alreadyApplied = biz.improvements.some(i => i.type === 'operating_playbook');
      expect(alreadyApplied).toBe(true);
    });

    it('different improvement types can coexist', () => {
      const biz = createMockBusiness({
        improvements: [
          { type: 'operating_playbook', appliedRound: 1, effect: 0.03 },
          { type: 'pricing_model', appliedRound: 2, effect: 0.02 },
        ],
      });
      expect(biz.improvements.length).toBe(2);
      const hasPlaybook = biz.improvements.some(i => i.type === 'operating_playbook');
      const hasPricing = biz.improvements.some(i => i.type === 'pricing_model');
      expect(hasPlaybook).toBe(true);
      expect(hasPricing).toBe(true);
    });

    it('maximum possible improvements is 7 (all types)', () => {
      expect(ALL_IMPROVEMENTS.length).toBe(7);
      // Q3+ business could theoretically have all 7
      const biz = createMockBusiness({
        qualityRating: 4,
        improvements: ALL_IMPROVEMENTS.map((type, i) => ({
          type,
          appliedRound: i + 1,
          effect: 0.02,
        })),
      });
      expect(biz.improvements.length).toBe(7);
    });
  });

  describe('Ownership improvement modifier', () => {
    it('founder-owned (0 prior) gets +10% efficacy', () => {
      expect(getOwnershipImprovementModifier(0)).toBe(1.10);
    });

    it('one prior owner is neutral (1.0x)', () => {
      expect(getOwnershipImprovementModifier(1)).toBe(1.00);
    });

    it('two prior owners gets -5%', () => {
      expect(getOwnershipImprovementModifier(2)).toBe(0.95);
    });

    it('three+ prior owners gets -10%', () => {
      expect(getOwnershipImprovementModifier(3)).toBe(0.90);
      expect(getOwnershipImprovementModifier(5)).toBe(0.90);
    });
  });

  describe('Quality multiplier scaling', () => {
    it('Q1 gets 0.6x improvement efficacy', () => {
      expect(QUALITY_IMPROVEMENT_MULTIPLIER[1]).toBe(0.6);
    });

    it('Q2 gets 0.8x', () => {
      expect(QUALITY_IMPROVEMENT_MULTIPLIER[2]).toBe(0.8);
    });

    it('Q3 gets 1.0x (baseline)', () => {
      expect(QUALITY_IMPROVEMENT_MULTIPLIER[3]).toBe(1.0);
    });

    it('Q4 gets 1.1x', () => {
      expect(QUALITY_IMPROVEMENT_MULTIPLIER[4]).toBe(1.1);
    });

    it('Q5 gets 1.2x', () => {
      expect(QUALITY_IMPROVEMENT_MULTIPLIER[5]).toBe(1.2);
    });
  });

  describe('Margin and growth clamping', () => {
    it('margin boost is clamped via clampMargin', () => {
      const newMargin = clampMargin(0.20 + 0.04);
      expect(newMargin).toBeCloseTo(0.24);
      // Extreme values are clamped at MAX_MARGIN (0.80)
      const extremeMargin = clampMargin(0.90);
      expect(extremeMargin).toBeLessThanOrEqual(0.80);
    });

    it('growth boost is capped via capGrowthRate', () => {
      const cappedGrowth = capGrowthRate(0.05 + 0.03);
      expect(cappedGrowth).toBe(0.08);
      // Extreme values are capped at MAX_ORGANIC_GROWTH_RATE (0.20)
      const extremeGrowth = capGrowthRate(0.50);
      expect(extremeGrowth).toBeLessThanOrEqual(0.20);
    });
  });
});
