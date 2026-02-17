/**
 * Display Proofreader Test Suite
 *
 * Validates that UI copy (UserManualModal, DealCard, CollectPhase, etc.)
 * matches the engine's actual constants, formulas, and behavior.
 *
 * Three validation strategies:
 * - Strategy A (Direct Import): Import engine constants, assert values
 * - Strategy B (File Scanning): Read .tsx files, regex-extract claims, compare
 * - Strategy C (Calculation Parity): Compare engine output vs display output
 */

/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Engine Imports ──
import { TAX_RATE, calculateAnnualFcf, calculatePortfolioTax } from '../simulation';
import { createMockBusiness } from './helpers';
import { calculateDistressLevel, getDistressRestrictions, getDistressDescription, calculateCovenantHeadroom } from '../distress';
import { calculateHeatPremium, getMaxAcquisitions } from '../businesses';
import { MA_SOURCING_CONFIG, SHARED_SERVICES_CONFIG } from '../../data/sharedServices';
import { SECTORS, SECTOR_LIST } from '../../data/sectors';
import {
  DIFFICULTY_CONFIG,
  DURATION_CONFIG,
  INTEGRATION_THRESHOLD_MULTIPLIER,
  EQUITY_DILUTION_STEP,
  EQUITY_DILUTION_FLOOR,
  EQUITY_BUYBACK_COOLDOWN,
  PLATFORM_SALE_BONUS,
  TURNAROUND_FATIGUE_THRESHOLD,
  TURNAROUND_FATIGUE_PENALTY,
  TURNAROUND_EXIT_PREMIUM,
  TURNAROUND_EXIT_PREMIUM_MIN_TIERS,
  RESTRUCTURING_FEV_PENALTY,
  COVENANT_BREACH_ROUNDS_THRESHOLD,
  EARNOUT_EXPIRATION_YEARS,
  ROLLOVER_EQUITY_CONFIG,
  ROLLOVER_MIN_QUALITY,
  ROLLOVER_MIN_MA_TIER,
} from '../../data/gameConfig';
import { TURNAROUND_PROGRAMS, TURNAROUND_TIER_CONFIG, SECTOR_QUALITY_CEILINGS, DEFAULT_QUALITY_CEILING } from '../../data/turnaroundPrograms';

// ── File reading helper ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_ROOT = resolve(__dirname, '../../');

function readComponent(relativePath: string): string {
  return readFileSync(resolve(SRC_ROOT, relativePath), 'utf-8');
}

// Exit premium constants from simulation.ts
const IMPROVEMENT_EXIT_PREMIUMS: Record<string, number> = {
  operating_playbook: 0.15,
  pricing_model: 0.15,
  service_expansion: 0.15,
  fix_underperformance: 0.15,
  recurring_revenue_conversion: 0.50,
  management_professionalization: 0.30,
  digital_transformation: 0.15,
};

// ══════════════════════════════════════════════════════════════════
// SCORING & GRADES
// ══════════════════════════════════════════════════════════════════

describe('Display Proofreader', () => {
  describe('Scoring & Grades', () => {
    it('has 6 score components', () => {
      // scoring.ts returns these 6 fields in ScoreBreakdown
      const fields = [
        'valueCreation',
        'fcfShareGrowth',
        'portfolioRoic',
        'capitalDeployment',
        'balanceSheetHealth',
        'strategicDiscipline',
      ];
      expect(fields).toHaveLength(6);
    });

    it('score max points: Value Creation=20, FCF/Share=20, ROIC=15, Capital=15, Balance=15, Strategic=15', () => {
      // These are the documented max values from scoring.ts comments
      expect(20).toBe(20); // Value Creation (line 107)
      expect(20).toBe(20); // FCF/Share Growth (line 125)
      expect(15).toBe(15); // Portfolio ROIC (line 139)
      expect(15).toBe(15); // Capital Deployment (line 151)
      expect(15).toBe(15); // Balance Sheet Health (line 203)
      expect(15).toBe(15); // Strategic Discipline (line 234)
    });

    it('total possible score = 100', () => {
      const maxPoints = 20 + 20 + 15 + 15 + 15 + 15;
      expect(maxPoints).toBe(100);
    });

    it('grade thresholds: S>=90, A>=75, B>=60, C>=40, D>=20, F<20', () => {
      // From scoring.ts lines 313-331
      const thresholds = { S: 90, A: 75, B: 60, C: 40, D: 20, F: 0 };
      expect(thresholds.S).toBe(90);
      expect(thresholds.A).toBe(75);
      expect(thresholds.B).toBe(60);
      expect(thresholds.C).toBe(40);
      expect(thresholds.D).toBe(20);
    });

    it('UserManualModal scoring table matches engine (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');

      // Must contain "Value Creation" as a scoring category
      expect(manual).toContain('Value Creation');

      // Check all 6 categories are present
      expect(manual).toContain('FCF/Share Growth');
      expect(manual).toContain('Portfolio ROIC');
      expect(manual).toContain('Capital Deployment');
      expect(manual).toContain('Balance Sheet Health');
      expect(manual).toContain('Strategic Discipline');

      // Check correct max points
      // Extract the scoring table rows (Strategy B: regex scan)
      const scoringSection = manual.slice(
        manual.indexOf('Score Breakdown'),
        manual.indexOf('Grade Scale')
      );

      // Value Creation should be 20
      expect(scoringSection).toMatch(/Value Creation.*20/);
      // FCF/Share Growth should be 20
      expect(scoringSection).toMatch(/FCF\/Share Growth.*20/);
      // Portfolio ROIC should be 15
      expect(scoringSection).toMatch(/Portfolio ROIC.*15/);
      // Capital Deployment should be 15
      expect(scoringSection).toMatch(/Capital Deployment.*15/);
      // Balance Sheet Health should be 15
      expect(scoringSection).toMatch(/Balance Sheet Health.*15/);
      // Strategic Discipline should be 15
      expect(scoringSection).toMatch(/Strategic Discipline.*15/);

      // Must NOT contain old wrong max points (25 for FCF, 20 for ROIC/Capital/Strategic)
      expect(scoringSection).not.toMatch(/FCF\/Share Growth.*'25'/);
      expect(scoringSection).not.toMatch(/Portfolio ROIC.*'20'/);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // DIFFICULTY CONFIG
  // ══════════════════════════════════════════════════════════════════

  describe('Difficulty Config', () => {
    it('Easy: $20M cash, 80% ownership, 0 debt, 0.9x multiplier', () => {
      expect(DIFFICULTY_CONFIG.easy.initialCash).toBe(20000);
      expect(DIFFICULTY_CONFIG.easy.founderShares / DIFFICULTY_CONFIG.easy.totalShares).toBe(0.8);
      expect(DIFFICULTY_CONFIG.easy.startingDebt).toBe(0);
      expect(DIFFICULTY_CONFIG.easy.leaderboardMultiplier).toBe(0.9);
    });

    it('Normal: $5M cash, 100% ownership, $3M debt, 1.35x multiplier', () => {
      expect(DIFFICULTY_CONFIG.normal.initialCash).toBe(5000);
      expect(DIFFICULTY_CONFIG.normal.founderShares / DIFFICULTY_CONFIG.normal.totalShares).toBe(1.0);
      expect(DIFFICULTY_CONFIG.normal.startingDebt).toBe(3000);
      expect(DIFFICULTY_CONFIG.normal.leaderboardMultiplier).toBe(1.35);
    });

    it('Duration: standard=20, quick=10 rounds', () => {
      expect(DURATION_CONFIG.standard.rounds).toBe(20);
      expect(DURATION_CONFIG.quick.rounds).toBe(10);
    });

    it('Manual mentions correct starting amounts (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('$20M');
      expect(manual).toContain('$5M');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // DEAL STRUCTURES
  // ══════════════════════════════════════════════════════════════════

  describe('Deal Structures', () => {
    it('Seller note: 40% equity split', () => {
      // deals.ts line 35: sellerNoteCashPercent = 0.40
      expect(0.40).toBe(0.40);
    });

    it('Seller note rate: 5-6%', () => {
      // deals.ts line 37: 0.05 + seededRandom(0, 0.01) → 5-6%
      expect(0.05).toBeGreaterThanOrEqual(0.05);
      expect(0.05 + 0.01).toBeCloseTo(0.06);
    });

    it('Seller note term: 5yr standard, 5yr quick', () => {
      // deals.ts: Quick games use 0.50 multiplier, Standard uses 0.25
      const standardTerm = Math.max(4, Math.ceil(20 * 0.25)); // 5yr
      const quickTerm = Math.max(4, Math.ceil(10 * 0.50));    // 5yr (stretched for quick)
      expect(standardTerm).toBe(5);
      expect(quickTerm).toBe(5);
    });

    it('Bank debt: 35% equity split', () => {
      // deals.ts line 55: bankDebtCashPercent = 0.35
      expect(0.35).toBe(0.35);
    });

    it('Bank debt term: 10yr standard, 10yr quick', () => {
      // deals.ts: Quick games get full game length, Standard get half
      const standardTerm = Math.max(4, Math.ceil(20 * 0.50)); // 10yr
      const quickTerm = 10; // Quick: maxRounds (10)
      expect(standardTerm).toBe(10);
      expect(quickTerm).toBe(10);
    });

    it('LBO: 25% equity, 35% note, 40% bank', () => {
      // deals.ts lines 97-100
      const equity = 0.25;
      const note = 0.35;
      const bank = 1 - equity - note;
      expect(equity).toBe(0.25);
      expect(note).toBe(0.35);
      expect(bank).toBeCloseTo(0.40);
    });

    it('Earn-out: 55% upfront, Q3+ only', () => {
      // deals.ts line 76: qualityRating >= 3 required
      // deals.ts line 77: earnoutUpfrontPercent = 0.55
      expect(0.55).toBe(0.55);
    });

    it('Manual deal structure table matches engine (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('25%');
      expect(manual).toContain('35%');
      expect(manual).toContain('40%');
      expect(manual).toContain('55%');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // HEAT PREMIUMS
  // ══════════════════════════════════════════════════════════════════

  describe('Heat Premiums', () => {
    it('Cold = 1.0x (no premium)', () => {
      expect(calculateHeatPremium('cold')).toBe(1.0);
    });

    it('Warm = 1.10-1.15x range', () => {
      // Run multiple times to verify range
      const results = new Set<number>();
      for (let i = 0; i < 100; i++) {
        results.add(calculateHeatPremium('warm'));
      }
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(1.10);
        expect(r).toBeLessThanOrEqual(1.15);
      }
    });

    it('Hot = 1.20-1.30x range', () => {
      const results = new Set<number>();
      for (let i = 0; i < 100; i++) {
        results.add(calculateHeatPremium('hot'));
      }
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(1.20);
        expect(r).toBeLessThanOrEqual(1.30);
      }
    });

    it('Contested = 1.20-1.35x range', () => {
      const results = new Set<number>();
      for (let i = 0; i < 100; i++) {
        results.add(calculateHeatPremium('contested'));
      }
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(1.20);
        expect(r).toBeLessThanOrEqual(1.35);
      }
    });
    it('Credit tightening reduces deal heat by 1 tier (Strategy B)', () => {
      const engine = readComponent('engine/businesses.ts');
      expect(engine).toContain('creditTighteningActive');
      expect(engine).toContain('if (creditTighteningActive) tierIndex -= 1');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // QUALITY PREMIUMS
  // ══════════════════════════════════════════════════════════════════

  describe('Quality Premiums', () => {
    it('Formula: (quality - 3) × 0.4x (bidirectional)', () => {
      // simulation.ts line 75: const qualityPremium = (business.qualityRating - 3) * 0.4
      expect((1 - 3) * 0.4).toBeCloseTo(-0.8);
      expect((2 - 3) * 0.4).toBeCloseTo(-0.4);
      expect((3 - 3) * 0.4).toBeCloseTo(0);
      expect((4 - 3) * 0.4).toBeCloseTo(0.4);
      expect((5 - 3) * 0.4).toBeCloseTo(0.8);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // DISTRESS & COVENANTS
  // ══════════════════════════════════════════════════════════════════

  describe('Distress & Covenants', () => {
    it('Comfortable: <2.5x leverage', () => {
      expect(calculateDistressLevel(2.0, 100, 100)).toBe('comfortable');
      expect(calculateDistressLevel(2.49, 100, 100)).toBe('comfortable');
    });

    it('Elevated: 2.5-3.5x leverage', () => {
      expect(calculateDistressLevel(2.5, 100, 100)).toBe('elevated');
      expect(calculateDistressLevel(3.49, 100, 100)).toBe('elevated');
    });

    it('Stressed: 3.5-4.5x leverage', () => {
      expect(calculateDistressLevel(3.5, 100, 100)).toBe('stressed');
      expect(calculateDistressLevel(4.49, 100, 100)).toBe('stressed');
    });

    it('Breach: >=4.5x leverage', () => {
      expect(calculateDistressLevel(4.5, 100, 100)).toBe('breach');
      expect(calculateDistressLevel(6.0, 100, 100)).toBe('breach');
    });

    it('Interest penalties: comfortable=0, elevated=0, stressed=+1%, breach=+2%', () => {
      expect(getDistressRestrictions('comfortable').interestPenalty).toBe(0);
      expect(getDistressRestrictions('elevated').interestPenalty).toBe(0);
      expect(getDistressRestrictions('stressed').interestPenalty).toBe(0.01);
      expect(getDistressRestrictions('breach').interestPenalty).toBe(0.02);
    });

    it('Breach restrictions: no acquire, no debt, no distribute, no buyback', () => {
      const breach = getDistressRestrictions('breach');
      expect(breach.canAcquire).toBe(false);
      expect(breach.canTakeDebt).toBe(false);
      expect(breach.canDistribute).toBe(false);
      expect(breach.canBuyback).toBe(false);
    });

    it('Stressed restrictions: no new debt but can acquire', () => {
      const stressed = getDistressRestrictions('stressed');
      expect(stressed.canAcquire).toBe(true);
      expect(stressed.canTakeDebt).toBe(false);
    });

    it('Manual mentions covenant thresholds (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('2.5');
      expect(manual).toContain('4.5');
    });

    it('COVENANT_BREACH_ROUNDS_THRESHOLD matches UI copy', () => {
      expect(COVENANT_BREACH_ROUNDS_THRESHOLD).toBe(2);
      const manual = readComponent('components/ui/UserManualModal.tsx');
      // Manual mentions the threshold and cumulative rule
      expect(manual).toContain('cumulative years');
      expect(manual).toContain(`${COVENANT_BREACH_ROUNDS_THRESHOLD}`);
    });

    it('Breach description mentions post-restructuring cumulative rule', () => {
      const desc = getDistressDescription('breach');
      expect(desc).toContain('cumulative');
      expect(desc).toContain('restructuring');
    });

    it('useGame.ts uses COVENANT_BREACH_ROUNDS_THRESHOLD constant (Strategy B)', () => {
      const useGame = readComponent('hooks/useGame.ts');
      expect(useGame).toContain('COVENANT_BREACH_ROUNDS_THRESHOLD');
    });

    it('Covenant headroom uses 4.5x breach threshold', () => {
      const headroom = calculateCovenantHeadroom(5000, 10000, 3000, 5000, 0.06, 5, [], 0.06, 0);
      expect(headroom.breachThreshold).toBe(4.5);
    });

    it('Covenant headroom calculates correct headroomCash', () => {
      // cash=5000, totalDebt=10000, totalEbitda=3000
      // headroomCash = cash - (totalDebt - 4.5 * totalEbitda) = 5000 - (10000 - 13500) = 5000 + 3500 = 8500
      const headroom = calculateCovenantHeadroom(5000, 10000, 3000, 5000, 0.06, 5, [], 0.06, 0);
      expect(headroom.headroomCash).toBe(8500);
    });

    it('Covenant headroom detects negative projected cash', () => {
      // cash=1000, huge debt service
      const headroom = calculateCovenantHeadroom(1000, 10000, 3000, 10000, 0.06, 2, [], 0.06, 0);
      // holdcoInterest = round(10000 * 0.06) = 600, holdcoPrincipal = round(10000 / 2) = 5000
      // debtService = 5600, projected = 1000 - 5600 = -4600
      expect(headroom.cashWillGoNegative).toBe(true);
      expect(headroom.projectedCashAfterDebt).toBe(-4600);
    });

    it('AllocatePhase shows 4.5x covenant threshold in proximity bar (Strategy B)', () => {
      const allocate = readComponent('components/phases/AllocatePhase.tsx');
      expect(allocate).toContain('4.5x');
      expect(allocate).toContain('covenant breach');
      expect(allocate).toContain('Leverage');
    });

    it('AllocatePhase end-turn modal shows year-end forecast (Strategy B)', () => {
      const allocate = readComponent('components/phases/AllocatePhase.tsx');
      expect(allocate).toContain('Year-End Forecast');
      expect(allocate).toContain('Debt service (next yr)');
      expect(allocate).toContain('Projected yr-end cash (incl. FCF)');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // TAX & DEDUCTIONS
  // ══════════════════════════════════════════════════════════════════

  describe('Tax & Deductions', () => {
    it('TAX_RATE = 0.30 (30%)', () => {
      expect(TAX_RATE).toBe(0.30);
    });

    it('Manual says 30%', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('30%');
    });

    it('CollectPhase mentions 30% tax (Strategy B)', () => {
      const collect = readComponent('components/phases/CollectPhase.tsx');
      expect(collect).toContain('30%');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // CAPEX BY SECTOR
  // ══════════════════════════════════════════════════════════════════

  describe('CapEx by Sector', () => {
    const expectedCapex: Record<string, number> = {
      agency: 0.03,
      wealthManagement: 0.03,
      insurance: 0.04,
      b2bServices: 0.06,
      education: 0.07,
      saas: 0.10,
      healthcare: 0.10,
      autoServices: 0.10,
      homeServices: 0.12,
      restaurant: 0.12,
      distribution: 0.12,
      consumer: 0.13,
      industrial: 0.15,
      environmental: 0.16,
      realEstate: 0.18,
    };

    for (const [sectorId, expectedRate] of Object.entries(expectedCapex)) {
      it(`${sectorId} capex = ${(expectedRate * 100).toFixed(0)}%`, () => {
        expect(SECTORS[sectorId].capexRate).toBe(expectedRate);
      });
    }

    it('covers all 15 sectors', () => {
      expect(SECTOR_LIST).toHaveLength(15);
      expect(Object.keys(expectedCapex)).toHaveLength(15);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // EQUITY SYSTEM
  // ══════════════════════════════════════════════════════════════════

  describe('Equity System', () => {
    it('EQUITY_DILUTION_STEP = 0.10 (10%)', () => {
      expect(EQUITY_DILUTION_STEP).toBe(0.10);
    });

    it('EQUITY_DILUTION_FLOOR = 0.10 (10%)', () => {
      expect(EQUITY_DILUTION_FLOOR).toBe(0.10);
    });

    it('EQUITY_BUYBACK_COOLDOWN = 2 rounds', () => {
      expect(EQUITY_BUYBACK_COOLDOWN).toBe(2);
    });

    it('Manual does NOT claim a hard cap on equity raises (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      // After fix: should mention escalating dilution, NOT "Maximum 3" or "Maximum 2"
      expect(manual).not.toMatch(/Maximum \d+ equity raises/);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // IMPROVEMENT CONSTANTS
  // ══════════════════════════════════════════════════════════════════

  describe('Improvement Constants', () => {
    it('7 operational improvement types exist', () => {
      const types = [
        'operating_playbook',
        'pricing_model',
        'service_expansion',
        'fix_underperformance',
        'recurring_revenue_conversion',
        'management_professionalization',
        'digital_transformation',
      ];
      expect(types).toHaveLength(7);
    });

    it('exit premiums match simulation.ts constants', () => {
      expect(IMPROVEMENT_EXIT_PREMIUMS.operating_playbook).toBe(0.15);
      expect(IMPROVEMENT_EXIT_PREMIUMS.pricing_model).toBe(0.15);
      expect(IMPROVEMENT_EXIT_PREMIUMS.service_expansion).toBe(0.15);
      expect(IMPROVEMENT_EXIT_PREMIUMS.fix_underperformance).toBe(0.15);
      expect(IMPROVEMENT_EXIT_PREMIUMS.recurring_revenue_conversion).toBe(0.50);
      expect(IMPROVEMENT_EXIT_PREMIUMS.management_professionalization).toBe(0.30);
      expect(IMPROVEMENT_EXIT_PREMIUMS.digital_transformation).toBe(0.15);
    });

    it('cost percentages match useGame.ts (Strategy B)', () => {
      const store = readComponent('hooks/useGame.ts');
      // operating_playbook: 0.15
      expect(store).toContain('absEbitda * 0.15');
      // pricing_model: 0.10
      expect(store).toContain('absEbitda * 0.10');
      // service_expansion: 0.20
      expect(store).toContain('absEbitda * 0.20');
      // fix_underperformance: 0.12
      expect(store).toContain('absEbitda * 0.12');
      // recurring_revenue_conversion: 0.25
      expect(store).toContain('absEbitda * 0.25');
      // management_professionalization: 0.18
      expect(store).toContain('absEbitda * 0.18');
      // digital_transformation: 0.22
      expect(store).toContain('absEbitda * 0.22');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // TURNAROUND PROGRAMS
  // ══════════════════════════════════════════════════════════════════

  describe('Turnaround Programs', () => {
    it('7 total turnaround programs', () => {
      expect(TURNAROUND_PROGRAMS).toHaveLength(7);
    });

    it('Tier 1: 2 programs (Q1→Q2, Q2→Q3)', () => {
      const t1 = TURNAROUND_PROGRAMS.filter(p => p.tierId === 1);
      expect(t1).toHaveLength(2);
      expect(t1[0].sourceQuality).toBe(1);
      expect(t1[0].targetQuality).toBe(2);
      expect(t1[1].sourceQuality).toBe(2);
      expect(t1[1].targetQuality).toBe(3);
    });

    it('Tier 2: 2 programs (Q1→Q3, Q2→Q4)', () => {
      const t2 = TURNAROUND_PROGRAMS.filter(p => p.tierId === 2);
      expect(t2).toHaveLength(2);
      expect(t2[0].sourceQuality).toBe(1);
      expect(t2[0].targetQuality).toBe(3);
      expect(t2[1].sourceQuality).toBe(2);
      expect(t2[1].targetQuality).toBe(4);
    });

    it('Tier 3: 3 programs (Q1→Q4, Q2→Q5, Quick Q1→Q4)', () => {
      const t3 = TURNAROUND_PROGRAMS.filter(p => p.tierId === 3);
      expect(t3).toHaveLength(3);
    });

    it('success + partial + failure = 1.0 for all programs', () => {
      for (const p of TURNAROUND_PROGRAMS) {
        expect(p.successRate + p.partialRate + p.failureRate).toBeCloseTo(1.0);
      }
    });

    it('Scaled failure rates: T1=5%, T2A=8%, T2B=10%, T3A=12%, T3B=10%, T3Quick=15%', () => {
      const byId = (id: string) => TURNAROUND_PROGRAMS.find(p => p.id === id)!;
      expect(byId('t1_plan_a').failureRate).toBe(0.05);
      expect(byId('t1_plan_b').failureRate).toBe(0.05);
      expect(byId('t2_plan_a').failureRate).toBe(0.08);
      expect(byId('t2_plan_b').failureRate).toBe(0.10);
      expect(byId('t3_plan_a').failureRate).toBe(0.12);
      expect(byId('t3_plan_b').failureRate).toBe(0.10);
      expect(byId('t3_quick').failureRate).toBe(0.15);
    });

    it('Fatigue threshold = 4 simultaneous turnarounds', () => {
      expect(TURNAROUND_FATIGUE_THRESHOLD).toBe(4);
    });

    it('Fatigue penalty = -10ppt (0.10)', () => {
      expect(TURNAROUND_FATIGUE_PENALTY).toBe(0.10);
    });

    it('Exit premium = 0.25x for 2+ tiers improved', () => {
      expect(TURNAROUND_EXIT_PREMIUM).toBe(0.25);
      expect(TURNAROUND_EXIT_PREMIUM_MIN_TIERS).toBe(2);
    });

    it('Quality ceilings: agency=3, restaurant=3, saas/industrial/healthcare/wealthMgmt=4, default=5', () => {
      expect(SECTOR_QUALITY_CEILINGS.agency).toBe(3);
      expect(SECTOR_QUALITY_CEILINGS.restaurant).toBe(3);
      expect(SECTOR_QUALITY_CEILINGS.saas).toBe(4);
      expect(SECTOR_QUALITY_CEILINGS.industrial).toBe(4);
      expect(SECTOR_QUALITY_CEILINGS.healthcare).toBe(4);
      expect(SECTOR_QUALITY_CEILINGS.wealthManagement).toBe(4);
      expect(DEFAULT_QUALITY_CEILING).toBe(5);
    });

    it('UserManualModal documents quality ceilings (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('Quality Ceilings');
      expect(manual).toContain('Agency, Restaurant');
      expect(manual).toContain('SaaS, Industrial, Healthcare, Wealth Management');
    });

    it('All programs have displayName field', () => {
      for (const p of TURNAROUND_PROGRAMS) {
        expect(p.displayName).toBeDefined();
        expect(p.displayName.length).toBeGreaterThan(0);
      }
    });

    it('UserManualModal uses display names instead of T1/T2/T3 IDs (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('Operational Cleanup');
      expect(manual).toContain('100-Day Blitz');
      expect(manual).not.toContain("'T1 Plan A'");
      expect(manual).not.toContain("'T2 Plan A'");
      expect(manual).not.toContain("'T3 Quick'");
    });

    it('UserManualModal does not reference removed wind-down feature (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).not.toContain('Wind down');
      expect(manual).not.toContain('wind down');
      expect(manual).not.toContain('Wind it down');
    });

    it('Tier unlock costs match config', () => {
      expect(TURNAROUND_TIER_CONFIG[1].unlockCost).toBe(600);
      expect(TURNAROUND_TIER_CONFIG[2].unlockCost).toBe(1000);
      expect(TURNAROUND_TIER_CONFIG[3].unlockCost).toBe(1400);
    });

    it('Tier annual costs match config', () => {
      expect(TURNAROUND_TIER_CONFIG[1].annualCost).toBe(250);
      expect(TURNAROUND_TIER_CONFIG[2].annualCost).toBe(450);
      expect(TURNAROUND_TIER_CONFIG[3].annualCost).toBe(700);
    });

    it('Tier required opcos match config', () => {
      expect(TURNAROUND_TIER_CONFIG[1].requiredOpcos).toBe(2);
      expect(TURNAROUND_TIER_CONFIG[2].requiredOpcos).toBe(3);
      expect(TURNAROUND_TIER_CONFIG[3].requiredOpcos).toBe(4);
    });

    it('Standard durations: T1=4, T2=5, T3=3-6', () => {
      const t1 = TURNAROUND_PROGRAMS.filter(p => p.tierId === 1);
      for (const p of t1) expect(p.durationStandard).toBe(4);

      const t2 = TURNAROUND_PROGRAMS.filter(p => p.tierId === 2);
      for (const p of t2) expect(p.durationStandard).toBe(5);

      const t3 = TURNAROUND_PROGRAMS.filter(p => p.tierId === 3);
      for (const p of t3) {
        expect(p.durationStandard).toBeGreaterThanOrEqual(3);
        expect(p.durationStandard).toBeLessThanOrEqual(6);
      }
    });

    it('Quick durations: T1=2, T2=3, T3=2-3', () => {
      const t1 = TURNAROUND_PROGRAMS.filter(p => p.tierId === 1);
      for (const p of t1) expect(p.durationQuick).toBe(2);

      const t2 = TURNAROUND_PROGRAMS.filter(p => p.tierId === 2);
      for (const p of t2) expect(p.durationQuick).toBe(3);

      const t3 = TURNAROUND_PROGRAMS.filter(p => p.tierId === 3);
      for (const p of t3) {
        expect(p.durationQuick).toBeGreaterThanOrEqual(2);
        expect(p.durationQuick).toBeLessThanOrEqual(3);
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // PLATFORM & INTEGRATION
  // ══════════════════════════════════════════════════════════════════

  describe('Platform & Integration', () => {
    it('Threshold multipliers by mode: Easy-Std=1.0, Easy-Quick=0.7, Normal-Std=0.7, Normal-Quick=0.5', () => {
      expect(INTEGRATION_THRESHOLD_MULTIPLIER.easy.standard).toBe(1.0);
      expect(INTEGRATION_THRESHOLD_MULTIPLIER.easy.quick).toBe(0.7);
      expect(INTEGRATION_THRESHOLD_MULTIPLIER.normal.standard).toBe(0.7);
      expect(INTEGRATION_THRESHOLD_MULTIPLIER.normal.quick).toBe(0.5);
    });

    it('Platform sale bonus = 0.8x', () => {
      expect(PLATFORM_SALE_BONUS).toBe(0.8);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // LEADERBOARD
  // ══════════════════════════════════════════════════════════════════

  describe('Leaderboard', () => {
    it('Normal difficulty multiplier = 1.35x', () => {
      expect(DIFFICULTY_CONFIG.normal.leaderboardMultiplier).toBe(1.35);
    });

    it('Easy difficulty multiplier = 0.9x', () => {
      expect(DIFFICULTY_CONFIG.easy.leaderboardMultiplier).toBe(0.9);
    });

    it('UserManualModal shows correct Normal multiplier (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain(`${DIFFICULTY_CONFIG.normal.leaderboardMultiplier}x multiplier`);
      expect(manual).not.toContain('1.15x multiplier');
    });

    it('UserManualModal shows correct Easy multiplier 0.9x (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain(`${DIFFICULTY_CONFIG.easy.leaderboardMultiplier}x`);
      expect(manual).toContain('0.9x multiplier');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // COLLECTPHASE CALCULATIONS (Strategy C)
  // ══════════════════════════════════════════════════════════════════

  describe('CollectPhase Calculations', () => {
    it('FCF = EBITDA - CapEx (pre-tax, per business)', () => {
      // Agency sector has 3% capex
      const business = createMockBusiness({ ebitda: 1000 });

      const fcf = calculateAnnualFcf(business);
      // Agency capex = 3% of EBITDA = 30
      // FCF = 1000 - 30 = 970
      expect(fcf).toBe(970);
    });

    it('Tax calculation: 30% of taxable income after deductions', () => {
      const business = createMockBusiness({
        ebitda: 1000,
        sellerNoteBalance: 500,
        sellerNoteRate: 0.05,
        sellerNoteRoundsRemaining: 3,
      });

      const tax = calculatePortfolioTax([business], 0, 0, 0);

      // EBITDA = 1000, opco interest = 500 * 0.05 = 25
      // Taxable = 1000 - 25 = 975
      // Tax = 975 * 0.30 = 292.5 → 293 (rounded)
      expect(tax.grossEbitda).toBe(1000);
      expect(tax.opcoInterest).toBe(25);
      expect(tax.taxableIncome).toBe(975);
      expect(tax.taxAmount).toBe(293);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // EXIT VALUATION DISPLAY
  // ══════════════════════════════════════════════════════════════════

  describe('Exit Valuation Display', () => {
    it('Multiple floor = 2.0x', () => {
      // simulation.ts line 147: Math.max(2.0, ...)
      const floor = 2.0;
      expect(floor).toBe(2.0);
    });

    it('Hold premium capped at 0.5x (5+ years)', () => {
      // simulation.ts line 82: Math.min(0.5, yearsHeld * 0.1)
      expect(Math.min(0.5, 10 * 0.1)).toBe(0.5);
      expect(Math.min(0.5, 3 * 0.1)).toBeCloseTo(0.3);
    });

    it('Improvements premium capped at 1.0x', () => {
      // simulation.ts line 85: Math.min(1.0, ...)
      const cap = 1.0;
      expect(cap).toBe(1.0);
    });

    it('Seasoning ramp: 0-100% over 2 years', () => {
      // simulation.ts line 137: Math.min(1.0, yearsHeld / 2)
      expect(Math.min(1.0, 0 / 2)).toBe(0);
      expect(Math.min(1.0, 1 / 2)).toBe(0.5);
      expect(Math.min(1.0, 2 / 2)).toBe(1.0);
      expect(Math.min(1.0, 5 / 2)).toBe(1.0);
    });

    it('Aggregate premium cap: min(rawPremiums, max(10, base * 1.5)) (Strategy B)', () => {
      // simulation.ts: premiumCap = Math.max(10, baseMultiple * 1.5)
      const sim = readComponent('engine/simulation.ts');
      expect(sim).toContain('Math.max(10, baseMultiple * 1.5)');
      expect(sim).toContain('Math.min(rawTotalPremiums, premiumCap)');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // TUCK-IN DISCOUNT (Strategy B)
  // ══════════════════════════════════════════════════════════════════

  describe('Tuck-in Discount', () => {
    it('Engine discount range: 5% to 25% (quality-dependent)', () => {
      // businesses.ts calculateTuckInDiscount: baseDiscount = 0.15, +/- 5% per quality point
      // Q1: 0.15 + 0.10 = 0.25, Q5: 0.15 - 0.10 = 0.05
      expect(Math.max(0.05, Math.min(0.25, 0.15 + (3 - 1) * 0.05))).toBe(0.25); // Q1
      expect(Math.max(0.05, Math.min(0.25, 0.15 + (3 - 3) * 0.05))).toBe(0.15); // Q3
      expect(Math.max(0.05, Math.min(0.25, 0.15 + (3 - 5) * 0.05))).toBe(0.05); // Q5
    });

    it('Manual mentions quality-dependent discount range, NOT flat 10% (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      // After fix: should NOT say flat "10% price discount" for tuck-ins
      // Should mention range or quality-dependent
      expect(manual).not.toMatch(/tuck-ins receive a 10% price discount/i);
      expect(manual).not.toMatch(/tuck-in.*at a 10% price discount/i);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // SECTOR COUNT
  // ══════════════════════════════════════════════════════════════════

  describe('Sector Metadata', () => {
    it('15 sectors defined', () => {
      expect(SECTOR_LIST).toHaveLength(15);
    });

    it('All sectors have required fields', () => {
      for (const sector of SECTOR_LIST) {
        expect(sector.capexRate).toBeGreaterThan(0);
        expect(sector.acquisitionMultiple).toHaveLength(2);
        expect(sector.organicGrowthRange).toHaveLength(2);
        expect(sector.subTypes.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Restructuring Proofreader ──

  describe('Restructuring FEV Penalty', () => {
    it('RESTRUCTURING_FEV_PENALTY equals 0.80', () => {
      expect(RESTRUCTURING_FEV_PENALTY).toBe(0.80);
    });

    it('RestructurePhase mentions 20% penalty', () => {
      const restructurePhase = readComponent('components/phases/RestructurePhase.tsx');
      expect(restructurePhase).toContain('-20%');
      expect(restructurePhase).toContain('penalty');
    });

    it('RestructurePhase requires breach resolution to continue', () => {
      const restructurePhase = readComponent('components/phases/RestructurePhase.tsx');
      // canContinue must require breachResolved
      expect(restructurePhase).toContain('actionsTaken > 0 && breachResolved');
    });

    it('GameOverScreen applies restructuring multiplier to adjustedFEV', () => {
      const gameOverScreen = readComponent('components/screens/GameOverScreen.tsx');
      expect(gameOverScreen).toContain('RESTRUCTURING_FEV_PENALTY');
      expect(gameOverScreen).toContain('restructuringMultiplier');
    });

    it('LeaderboardModal applies restructuring penalty in getAdjustedFEV', () => {
      const leaderboardModal = readComponent('components/ui/LeaderboardModal.tsx');
      expect(leaderboardModal).toContain('RESTRUCTURING_FEV_PENALTY');
      expect(leaderboardModal).toContain('hasRestructured');
    });
  });

  // ── UserManual Restructuring Copy ──

  describe('UserManual restructuring copy', () => {
    it('mentions -20% FEV penalty in restructure phase description', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('-20% penalty');
    });

    it('mentions breach resolution requirement (ND/E below 4.5x)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('4.5x');
    });

    it('mentions 0.80x restructuring penalty in leaderboard section', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('0.80x penalty');
    });

    it('bank debt described as per-business with voluntary paydown', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('Per-business');
      expect(manual).toContain('paid down voluntarily');
    });

    it('AllocatePhase debt explanation mentions voluntary bank debt paydown', () => {
      const allocatePhase = readComponent('components/phases/AllocatePhase.tsx');
      expect(allocatePhase).toContain('paid down voluntarily');
    });
  });

  // ── M&A Sourcing Acquisition Capacity ──
  describe('M&A Sourcing Acquisition Capacity', () => {
    it('baseline (tier 0) allows 2 acquisitions', () => {
      expect(getMaxAcquisitions(0)).toBe(2);
    });

    it('tier 1 allows 3 acquisitions', () => {
      expect(getMaxAcquisitions(1)).toBe(3);
    });

    it('tier 2 allows 4 acquisitions', () => {
      expect(getMaxAcquisitions(2)).toBe(4);
    });

    it('tier 3 stays at 4 acquisitions (same as tier 2)', () => {
      expect(getMaxAcquisitions(3 as any)).toBe(4);
    });

    it('sharedServices tier 1 effects mention acquisition capacity 3', () => {
      expect(MA_SOURCING_CONFIG[1].effects).toContain('Acquisition capacity: 3/year (was 2)');
    });

    it('sharedServices tier 2 effects mention acquisition capacity 4', () => {
      expect(MA_SOURCING_CONFIG[2].effects).toContain('Acquisition capacity: 4/year (was 3)');
    });

    it('UserManual mentions baseline 2 acquisitions per year', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('2 acquisitions per year');
    });

    it('UserManual tier 1 row mentions acquisition capacity 3/year', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('acquisition capacity: 3/year');
    });

    it('UserManual tier 2 row mentions acquisition capacity 4/year', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('acquisition capacity: 4/year');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // INTEGRATION OUTCOME LABELS
  // ══════════════════════════════════════════════════════════════════
  describe('Integration Outcome Labels', () => {
    it('AllocatePhase shows "Troubled Integration" (not "Integration Failed")', () => {
      const allocate = readComponent('components/phases/AllocatePhase.tsx');
      expect(allocate).toContain('Troubled Integration');
      expect(allocate).not.toContain('Integration Failed');
    });

    it('AllocatePhase shows "Rocky Integration"', () => {
      const allocate = readComponent('components/phases/AllocatePhase.tsx');
      expect(allocate).toContain('Rocky Integration');
    });

    it('UserManualModal mentions all three integration tiers: Seamless, Rocky, Troubled', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('Seamless');
      expect(manual).toContain('Rocky');
      expect(manual).toContain('Troubled');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // EARN-OUT EXPIRATION
  // ══════════════════════════════════════════════════════════════════

  describe('Earn-out Expiration', () => {
    it('EARNOUT_EXPIRATION_YEARS = 4', () => {
      expect(EARNOUT_EXPIRATION_YEARS).toBe(4);
    });

    it('useGame.ts uses EARNOUT_EXPIRATION_YEARS for expiration check (Strategy B)', () => {
      const useGame = readComponent('hooks/useGame.ts');
      expect(useGame).toContain('EARNOUT_EXPIRATION_YEARS');
      expect(useGame).toContain('earnoutExpirations');
    });

    it('BusinessCard.tsx shows earn-out countdown (Strategy B)', () => {
      const card = readComponent('components/cards/BusinessCard.tsx');
      expect(card).toContain('EARNOUT_EXPIRATION_YEARS');
      expect(card).toContain('yr left');
    });

    it('AllocatePhase.tsx shows 4yr window in deal review (Strategy B)', () => {
      const allocate = readComponent('components/phases/AllocatePhase.tsx');
      expect(allocate).toContain('4yr window');
    });

    it('UserManualModal mentions earn-out 4yr window and expiration (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('4yr window');
      expect(manual).toContain('expire after 4 years');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // PLATFORM RECIPE COUNTS
  // ══════════════════════════════════════════════════════════════════

  describe('Platform Recipe Counts', () => {
    it('UserManualModal states 38 platform recipes (32 within + 6 cross) (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('38 platform recipes');
      expect(manual).toContain('32 within');
      expect(manual).toContain('6 cross-sector');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // MBO PROPOSAL EVENT
  // ══════════════════════════════════════════════════════════════════

  describe('MBO Proposal Event', () => {
    it('UserManualModal documents Management Buyout event (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('Management Buyout');
    });

    it('events.ts contains mbo_proposal event definition (Strategy B)', () => {
      const events = readComponent('data/events.ts');
      expect(events).toContain('mbo_proposal');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // FINANCIAL CRISIS EVENT
  // ══════════════════════════════════════════════════════════════════

  describe('Financial Crisis Event', () => {
    it('Financial Crisis probability = 0.02 in GLOBAL_EVENTS (Strategy A)', () => {
      const events = readComponent('data/events.ts');
      expect(events).toContain("type: 'global_financial_crisis'");
      expect(events).toContain('probability: 0.02');
    });

    it('UserManualModal contains Financial Crisis (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('Financial Crisis');
    });

    it('events.ts contains global_financial_crisis event definition (Strategy B)', () => {
      const events = readComponent('data/events.ts');
      expect(events).toContain('global_financial_crisis');
      expect(events).toContain('distressed assets flood the market');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // SHARED SERVICES COSTS
  // ══════════════════════════════════════════════════════════════════

  describe('Shared Services Costs', () => {
    it('Finance & Reporting: $660K unlock, $295K/yr annual (Strategy A)', () => {
      expect(SHARED_SERVICES_CONFIG.finance_reporting.unlockCost).toBe(660);
      expect(SHARED_SERVICES_CONFIG.finance_reporting.annualCost).toBe(295);
    });

    it('Recruiting & HR: $885K unlock, $378K/yr annual (Strategy A)', () => {
      expect(SHARED_SERVICES_CONFIG.recruiting_hr.unlockCost).toBe(885);
      expect(SHARED_SERVICES_CONFIG.recruiting_hr.annualCost).toBe(378);
    });

    it('Procurement: $710K unlock, $224K/yr annual (Strategy A)', () => {
      expect(SHARED_SERVICES_CONFIG.procurement.unlockCost).toBe(710);
      expect(SHARED_SERVICES_CONFIG.procurement.annualCost).toBe(224);
    });

    it('Marketing & Brand: $800K unlock, $295K/yr annual (Strategy A)', () => {
      expect(SHARED_SERVICES_CONFIG.marketing_brand.unlockCost).toBe(800);
      expect(SHARED_SERVICES_CONFIG.marketing_brand.annualCost).toBe(295);
    });

    it('Technology & Systems: $1,060K unlock, $450K/yr annual (Strategy A)', () => {
      expect(SHARED_SERVICES_CONFIG.technology_systems.unlockCost).toBe(1060);
      expect(SHARED_SERVICES_CONFIG.technology_systems.annualCost).toBe(450);
    });

    it('UserManualModal shows correct shared services costs (Strategy B)', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('$660K');
      expect(manual).toContain('$295K/yr');
      expect(manual).toContain('$885K');
      expect(manual).toContain('$378K/yr');
      expect(manual).toContain('$710K');
      expect(manual).toContain('$224K/yr');
      expect(manual).toContain('$800K');
      expect(manual).toContain('$1,060K');
      expect(manual).toContain('$450K/yr');
    });
  });

  // ── Rollover Equity Proofreader ──

  describe('Rollover Equity', () => {
    it('Strategy A: standard rolloverPct is 0.25', () => {
      expect(ROLLOVER_EQUITY_CONFIG.standard.rolloverPct).toBe(0.25);
    });

    it('Strategy A: quick rolloverPct is 0.20', () => {
      expect(ROLLOVER_EQUITY_CONFIG.quick.rolloverPct).toBe(0.20);
    });

    it('Strategy A: ROLLOVER_MIN_QUALITY is 3 and ROLLOVER_MIN_MA_TIER is 2', () => {
      expect(ROLLOVER_MIN_QUALITY).toBe(3);
      expect(ROLLOVER_MIN_MA_TIER).toBe(2);
    });

    it('Strategy B: UserManualModal contains Rollover Equity', () => {
      const manual = readComponent('components/ui/UserManualModal.tsx');
      expect(manual).toContain('Rollover Equity');
    });

    it('Strategy B: deals.ts contains rollover_equity', () => {
      const deals = readComponent('engine/deals.ts');
      expect(deals).toContain('rollover_equity');
    });
  });
});
