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
    label: 'Easy — Institutional Fund',
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
    label: 'Hard — Self-Funded Search',
    description: '$2M personal equity + $3M bank debt. 100% ownership. Real leverage from day one.',
  },
} as const;

export const DURATION_CONFIG = {
  standard: { rounds: 20, label: 'Full Game (20 Years)' },
  quick: { rounds: 10, label: 'Quick Play (10 Years)' },
} as const;

// Type helpers for consumers
export type DifficultyConfig = typeof DIFFICULTY_CONFIG;
export type DurationConfig = typeof DURATION_CONFIG;
export type { GameDifficulty, GameDuration };
