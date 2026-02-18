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
    leaderboardMultiplier: 0.9,
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
    leaderboardMultiplier: 1.35, // Compensates for 4x capital disadvantage; aligns with 30-50% PE skill premium
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

// ── Covenant / Bankruptcy Constants ──

export const COVENANT_BREACH_ROUNDS_THRESHOLD = 2; // breach years before restructuring/bankruptcy

// ── Restructuring Constants ──

export const RESTRUCTURING_FEV_PENALTY = 0.80; // 20% FEV haircut for restructured games

// ── Equity Constants ──

export const EQUITY_DILUTION_STEP = 0.10;   // 10% discount per prior raise
export const EQUITY_DILUTION_FLOOR = 0.10;  // minimum 10% of intrinsic value
export const EQUITY_BUYBACK_COOLDOWN = 2;   // rounds between raise↔buyback

// ── Earn-out Constants ──

export const EARNOUT_EXPIRATION_YEARS = 4; // earn-outs expire after 4 years

// ── Rollover Equity Constants ──

export const ROLLOVER_EQUITY_CONFIG = {
  standard: { cashPct: 0.65, rolloverPct: 0.25, notePct: 0.10, growthBonus: 0.015, marginBonus: 0.005, noteRate: 0.05 },
  quick:    { cashPct: 0.70, rolloverPct: 0.20, notePct: 0.10, growthBonus: 0.020, marginBonus: 0.005, noteRate: 0.05 },
} as const;
export const ROLLOVER_MIN_QUALITY = 3;
export const ROLLOVER_MIN_MA_TIER = 2;
export const ROLLOVER_EXCLUDED_ARCHETYPES: string[] = ['distressed_seller', 'burnt_out_operator'];

// ── Platform Sale Constants ──

export const PLATFORM_SALE_BONUS = 0.8;  // +0.8x multiple for selling entire platform as a unit

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

// ── New Event Constants ──

// Key-Man Risk
export const KEY_MAN_RISK_PROB = 0.05;
export const KEY_MAN_QUALITY_DROP = 1;                 // quality tiers lost immediately
export const KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT = 0.15; // % of EBITDA
export const KEY_MAN_GOLDEN_HANDCUFFS_RESTORE_CHANCE = 0.55;
export const KEY_MAN_SUCCESSION_COST_MIN = 200;        // $K
export const KEY_MAN_SUCCESSION_COST_MAX = 400;        // $K
export const KEY_MAN_SUCCESSION_ROUNDS = 2;            // rounds until quality restores

// Earn-Out Dispute
export const EARNOUT_DISPUTE_PROB = 0;                 // eligibility-gated in generateEvent
export const EARNOUT_SETTLE_PCT = 0.50;                // pay 50% of remaining
export const EARNOUT_FIGHT_LEGAL_COST_MIN = 100;       // $K
export const EARNOUT_FIGHT_LEGAL_COST_MAX = 200;       // $K
export const EARNOUT_FIGHT_WIN_CHANCE = 0.70;
export const EARNOUT_RENEGOTIATE_PCT = 0.55;           // reduce to 55% of remaining (zero cash cost)

// Supplier Pricing Power Shift
export const SUPPLIER_SHIFT_PROB = 0.05;
export const SUPPLIER_SHIFT_MARGIN_HIT = 0.03;         // 3ppt margin loss immediately
export const SUPPLIER_ABSORB_RECOVERY_PPT = 0.02;      // recover 2ppt of the 3ppt
export const SUPPLIER_SWITCH_COST_MIN = 150;            // $K
export const SUPPLIER_SWITCH_COST_MAX = 300;            // $K
export const SUPPLIER_SWITCH_REVENUE_PENALTY = 0.05;    // -5% revenue this round
export const SUPPLIER_VERTICAL_COST = 400;              // $K
export const SUPPLIER_VERTICAL_BONUS_PPT = 0.01;        // +1ppt bonus above full recovery
export const SUPPLIER_VERTICAL_MIN_SAME_SECTOR = 2;     // need 2+ same-sector businesses

// Industry Consolidation Boom
export const CONSOLIDATION_BOOM_PROB = 0.03;
export const CONSOLIDATION_BOOM_PRICE_PREMIUM = 0.20;       // +20% price premium on deals
export const CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS = 2;     // need 2+ in sector for exclusive tuck-in
export const CONSOLIDATION_BOOM_SECTORS = ['environmental', 'homeServices', 'autoServices', 'industrial'] as const;

// Type helpers for consumers
export type DifficultyConfig = typeof DIFFICULTY_CONFIG;
export type DurationConfig = typeof DURATION_CONFIG;
export type { GameDifficulty, GameDuration };
