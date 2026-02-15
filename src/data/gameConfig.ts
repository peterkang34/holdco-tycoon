import type { GameDifficulty, GameDuration } from '../engine/types';

export const DIFFICULTY_CONFIG = {
  easy: {
    initialCash: 20000,          // $20M
    founderShares: 800,
    totalShares: 1000,           // 80% ownership
    startingDebt: 0,
    startingEbitda: 1000,        // $1M
    startingMultipleCap: undefined as number | undefined,
    startingQuality: 3 as const,
    holdcoDebtStartRound: 0,
    leaderboardMultiplier: 1.0,
    label: 'Easy — Institutional Capital',
    description: '$20M from patient LPs. 80% ownership. Clean balance sheet.',
  },
  normal: {
    initialCash: 5000,           // $5M ($2M equity + $3M bank debt)
    founderShares: 1000,
    totalShares: 1000,           // 100% ownership
    startingDebt: 3000,          // $3M conventional bank debt at holdco level
    startingEbitda: 800,         // $800K
    startingMultipleCap: 4.0 as number | undefined,    // Cap at 4x to prevent cash trap in premium sectors
    startingQuality: 3 as const,
    holdcoDebtStartRound: 1,
    leaderboardMultiplier: 1.15, // Compensates for harder start without double-rewarding 100% ownership
    label: 'Hard — Self-Funded',
    description: '$2M personal equity + $3M bank debt. 100% ownership. Real leverage from day one.',
  },
} as const;

export const DURATION_CONFIG = {
  quick: { rounds: 10, label: 'Quick Play (10 Years)' },
  standard: { rounds: 20, label: 'Full Game (20 Years)' },
} as const;

export const INTEGRATION_THRESHOLD_MULTIPLIER = {
  easy: { standard: 1.0, quick: 0.7 },
  normal: { standard: 0.7, quick: 0.5 },
} as const;

// ── Equity Constants ──

export const EQUITY_DILUTION_STEP = 0.10;   // 10% discount per prior raise
export const EQUITY_DILUTION_FLOOR = 0.10;  // minimum 10% of intrinsic value
export const EQUITY_BUYBACK_COOLDOWN = 2;   // rounds between raise↔buyback

// ── Turnaround Constants ──

// ── Platform Sale Constants ──

export const PLATFORM_SALE_BONUS = 0.5;  // +0.5x multiple for selling entire platform as a unit

// ── Turnaround Constants ──

export const TURNAROUND_FATIGUE_THRESHOLD = 4;   // 4+ simultaneous turnarounds = penalty
export const TURNAROUND_FATIGUE_PENALTY = 0.10;  // -10ppt to all success rates
export const TURNAROUND_EXIT_PREMIUM = 0.25;     // +0.25x exit multiple
export const TURNAROUND_EXIT_PREMIUM_MIN_TIERS = 2; // need 2+ quality tiers improved

// ── Improvement Constants ──

export const IMPROVEMENT_COST_FLOOR = 200; // $200K minimum improvement cost

export const QUALITY_IMPROVEMENT_MULTIPLIER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0.6, 2: 0.8, 3: 1.0, 4: 1.1, 5: 1.2,
};

export const BASE_QUALITY_IMPROVEMENT_CHANCE = 0.30; // 30% base chance on op improvement
export const QUALITY_IMPROVEMENT_TIER_BONUS: Record<1 | 2 | 3, number> = {
  1: 0.15, // total 45%
  2: 0.20, // total 50%
  3: 0.25, // total 55%
};

// Type helpers for consumers
export type DifficultyConfig = typeof DIFFICULTY_CONFIG;
export type DurationConfig = typeof DURATION_CONFIG;
export type { GameDifficulty, GameDuration };
