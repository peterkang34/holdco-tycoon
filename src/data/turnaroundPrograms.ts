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
    annualCost: 300,
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
    annualCost: 500,
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
  // Tier 1 — reduced durations (-1 standard), increased success rates
  {
    id: 't1_plan_a',
    displayName: 'Operational Cleanup',
    tierId: 1,
    sourceQuality: 1,
    targetQuality: 2,
    durationStandard: 3,   // was 4
    durationQuick: 2,
    successRate: 0.75,     // was 0.65
    partialRate: 0.20,     // was 0.30
    failureRate: 0.05,
    ebitdaBoostOnSuccess: 0.07,
    ebitdaBoostOnPartial: 0.03,
    ebitdaDamageOnFailure: 0.08, // was 0.04 — increased failure damage
    upfrontCostFraction: 0.10,
    annualCost: 50,
  },
  {
    id: 't1_plan_b',
    displayName: 'Performance Acceleration',
    tierId: 1,
    sourceQuality: 2,
    targetQuality: 3,
    durationStandard: 3,   // was 4
    durationQuick: 2,
    successRate: 0.72,     // was 0.60
    partialRate: 0.23,     // was 0.35
    failureRate: 0.05,
    ebitdaBoostOnSuccess: 0.05,
    ebitdaBoostOnPartial: 0.02,
    ebitdaDamageOnFailure: 0.08, // was 0.03 — increased failure damage
    upfrontCostFraction: 0.12,
    annualCost: 75,
  },

  // Tier 2 — reduced durations, increased success rates, reduced annual costs
  {
    id: 't2_plan_a',
    displayName: 'Full Restructuring',
    tierId: 2,
    sourceQuality: 1,
    targetQuality: 3,
    durationStandard: 4,   // was 5
    durationQuick: 3,
    successRate: 0.76,     // was 0.68
    partialRate: 0.17,     // was 0.24
    failureRate: 0.07,     // was 0.08
    ebitdaBoostOnSuccess: 0.11,
    ebitdaBoostOnPartial: 0.05,
    ebitdaDamageOnFailure: 0.12, // was 0.05 — increased failure damage
    upfrontCostFraction: 0.14,
    annualCost: 100,
  },
  {
    id: 't2_plan_b',
    displayName: 'Strategic Repositioning',
    tierId: 2,
    sourceQuality: 2,
    targetQuality: 4,
    durationStandard: 4,   // was 5
    durationQuick: 3,
    successRate: 0.73,     // was 0.65
    partialRate: 0.18,     // was 0.25
    failureRate: 0.09,     // was 0.10
    ebitdaBoostOnSuccess: 0.09,
    ebitdaBoostOnPartial: 0.04,
    ebitdaDamageOnFailure: 0.12, // was 0.04 — increased failure damage
    upfrontCostFraction: 0.16,
    annualCost: 125,
  },

  // Tier 3 — reduced durations, increased success rates, reduced annual costs
  {
    id: 't3_plan_a',
    displayName: 'Enterprise Turnaround',
    tierId: 3,
    sourceQuality: 1,
    targetQuality: 4,
    durationStandard: 5,   // was 6
    durationQuick: 3,
    successRate: 0.80,     // was 0.73
    partialRate: 0.10,     // was 0.15
    failureRate: 0.10,     // was 0.12
    ebitdaBoostOnSuccess: 0.15,
    ebitdaBoostOnPartial: 0.07,
    ebitdaDamageOnFailure: 0.15, // was 0.06 — increased failure damage
    upfrontCostFraction: 0.18,
    annualCost: 150,
  },
  {
    id: 't3_plan_b',
    displayName: 'Total Transformation',
    tierId: 3,
    sourceQuality: 2,
    targetQuality: 5,
    durationStandard: 5,   // was 6
    durationQuick: 3,
    successRate: 0.78,     // was 0.70
    partialRate: 0.13,     // was 0.20
    failureRate: 0.09,     // was 0.10
    ebitdaBoostOnSuccess: 0.13,
    ebitdaBoostOnPartial: 0.06,
    ebitdaDamageOnFailure: 0.15, // was 0.06 — increased failure damage
    upfrontCostFraction: 0.20,
    annualCost: 200,
  },
  {
    id: 't3_quick',
    displayName: '100-Day Blitz',
    tierId: 3,
    sourceQuality: 1,
    targetQuality: 4,
    durationStandard: 3,   // stays 3
    durationQuick: 2,
    successRate: 0.70,     // was 0.63
    partialRate: 0.17,     // was 0.22
    failureRate: 0.13,     // was 0.15
    ebitdaBoostOnSuccess: 0.15,
    ebitdaBoostOnPartial: 0.07,
    ebitdaDamageOnFailure: 0.15, // was 0.06 — increased failure damage
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
  industrial: 4,
  healthcare: 4,
  wealthManagement: 4,
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
