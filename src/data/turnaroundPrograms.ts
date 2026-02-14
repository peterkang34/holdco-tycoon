import type { TurnaroundProgram, TurnaroundTier, SectorId } from '../engine/types';

// ── Turnaround Tier Definitions ──
// All costs in thousands (600 = $600K, 250 = $250K annual)

export interface TurnaroundTierConfig {
  name: string;
  unlockCost: number;   // one-time cost in $k
  annualCost: number;   // recurring annual cost in $k
  requiredOpcos: number;
  description: string;
  effects: string[];
}

export const TURNAROUND_TIER_CONFIG: Record<1 | 2 | 3, TurnaroundTierConfig> = {
  1: {
    name: 'Portfolio Operations',
    unlockCost: 600,
    annualCost: 250,
    requiredOpcos: 2,
    description: 'Dedicated ops team to run structured turnaround playbooks',
    effects: [
      'T1 turnaround programs available',
      'Quality improvement chance +15ppt (total 45%)',
    ],
  },
  2: {
    name: 'Transformation Office',
    unlockCost: 1000,
    annualCost: 450,
    requiredOpcos: 3,
    description: 'Full transformation team with cross-functional expertise',
    effects: [
      'T2 turnaround programs available',
      'Quality improvement chance +20ppt (total 50%)',
    ],
  },
  3: {
    name: 'Interim Management',
    unlockCost: 1400,
    annualCost: 700,
    requiredOpcos: 4,
    description: 'Deploy interim C-suite operators into struggling businesses',
    effects: [
      'T3 turnaround programs available (including Quick option)',
      'Quality improvement chance +25ppt (total 55%)',
    ],
  },
};

// ── Turnaround Programs ──
// successRate + partialRate + failureRate = 1.0 for each program
// upfrontCostFraction is fraction of business EBITDA; annualCost in $k

export const TURNAROUND_PROGRAMS: TurnaroundProgram[] = [
  // Tier 1
  {
    id: 't1_plan_a',
    tierId: 1,
    sourceQuality: 1,
    targetQuality: 2,
    durationStandard: 4,
    durationQuick: 2,
    successRate: 0.65,
    partialRate: 0.30,
    failureRate: 0.05,
    ebitdaBoostOnSuccess: 0.07,
    ebitdaBoostOnPartial: 0.03,
    ebitdaDamageOnFailure: 0.04,
    upfrontCostFraction: 0.10,
    annualCost: 50,
  },
  {
    id: 't1_plan_b',
    tierId: 1,
    sourceQuality: 2,
    targetQuality: 3,
    durationStandard: 4,
    durationQuick: 2,
    successRate: 0.60,
    partialRate: 0.35,
    failureRate: 0.05,
    ebitdaBoostOnSuccess: 0.05,
    ebitdaBoostOnPartial: 0.02,
    ebitdaDamageOnFailure: 0.03,
    upfrontCostFraction: 0.12,
    annualCost: 75,
  },

  // Tier 2
  {
    id: 't2_plan_a',
    tierId: 2,
    sourceQuality: 1,
    targetQuality: 3,
    durationStandard: 5,
    durationQuick: 3,
    successRate: 0.68,
    partialRate: 0.27,
    failureRate: 0.05,
    ebitdaBoostOnSuccess: 0.11,
    ebitdaBoostOnPartial: 0.05,
    ebitdaDamageOnFailure: 0.05,
    upfrontCostFraction: 0.14,
    annualCost: 100,
  },
  {
    id: 't2_plan_b',
    tierId: 2,
    sourceQuality: 2,
    targetQuality: 4,
    durationStandard: 5,
    durationQuick: 3,
    successRate: 0.65,
    partialRate: 0.30,
    failureRate: 0.05,
    ebitdaBoostOnSuccess: 0.09,
    ebitdaBoostOnPartial: 0.04,
    ebitdaDamageOnFailure: 0.04,
    upfrontCostFraction: 0.16,
    annualCost: 125,
  },

  // Tier 3
  {
    id: 't3_plan_a',
    tierId: 3,
    sourceQuality: 1,
    targetQuality: 4,
    durationStandard: 6,
    durationQuick: 3,
    successRate: 0.73,
    partialRate: 0.22,
    failureRate: 0.05,
    ebitdaBoostOnSuccess: 0.15,
    ebitdaBoostOnPartial: 0.07,
    ebitdaDamageOnFailure: 0.06,
    upfrontCostFraction: 0.18,
    annualCost: 150,
  },
  {
    id: 't3_plan_b',
    tierId: 3,
    sourceQuality: 2,
    targetQuality: 5,
    durationStandard: 6,
    durationQuick: 3,
    successRate: 0.70,
    partialRate: 0.25,
    failureRate: 0.05,
    ebitdaBoostOnSuccess: 0.13,
    ebitdaBoostOnPartial: 0.06,
    ebitdaDamageOnFailure: 0.06,
    upfrontCostFraction: 0.20,
    annualCost: 200,
  },
  {
    id: 't3_quick',
    tierId: 3,
    sourceQuality: 1,
    targetQuality: 4,
    durationStandard: 3,
    durationQuick: 2,
    successRate: 0.63, // T3 Plan A (0.73) minus 10ppt
    partialRate: 0.32, // adjusted to sum to 1.0
    failureRate: 0.05,
    ebitdaBoostOnSuccess: 0.15,
    ebitdaBoostOnPartial: 0.07,
    ebitdaDamageOnFailure: 0.06,
    upfrontCostFraction: 0.27, // 1.5x of T3 Plan A (0.18)
    annualCost: 150,
  },
];

// ── Quality Ceilings by Sector ──
// Maximum quality rating a business in this sector can achieve

export const SECTOR_QUALITY_CEILINGS: Partial<Record<SectorId, number>> = {
  saas: 4,
  agency: 3,
  restaurant: 3,
  // healthcare: 5 (default)
  // industrial: 4 — manufacturing has practical ceiling
  industrial: 4,
};

export const DEFAULT_QUALITY_CEILING = 5;

export function getQualityCeiling(sectorId: SectorId): number {
  return SECTOR_QUALITY_CEILINGS[sectorId] ?? DEFAULT_QUALITY_CEILING;
}

// ── Helper Functions ──

export function getTurnaroundTierUnlockCost(currentTier: TurnaroundTier): number {
  const nextTier = (currentTier + 1) as 1 | 2 | 3;
  if (nextTier > 3) return 0;
  return TURNAROUND_TIER_CONFIG[nextTier].unlockCost;
}

export function getTurnaroundTierAnnualCost(tier: TurnaroundTier): number {
  if (tier === 0) return 0;
  return TURNAROUND_TIER_CONFIG[tier as 1 | 2 | 3].annualCost;
}

export function getProgramsForTier(tierId: 1 | 2 | 3): TurnaroundProgram[] {
  return TURNAROUND_PROGRAMS.filter(p => p.tierId === tierId);
}

export function getAvailablePrograms(turnaroundTier: TurnaroundTier): TurnaroundProgram[] {
  return TURNAROUND_PROGRAMS.filter(p => p.tierId <= turnaroundTier);
}

export function getProgramById(id: string): TurnaroundProgram | undefined {
  return TURNAROUND_PROGRAMS.find(p => p.id === id);
}
