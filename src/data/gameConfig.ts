import type { GameDifficulty, GameDuration, DealSizeTier } from '../engine/types';

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

// ── Integration Failure Growth Drag ──

export const INTEGRATION_DRAG_BASE_RATE = 0.030;       // 3.0ppt at 1:1 EBITDA ratio
export const INTEGRATION_DRAG_FLOOR = -0.005;          // -0.5ppt min (tiny tuck-ins)
export const INTEGRATION_DRAG_CAP = -0.030;            // -3.0ppt max
export const INTEGRATION_DRAG_MERGER_FACTOR = 0.67;    // mergers get 67% of tuck-in penalty
export const INTEGRATION_DRAG_DECAY_RATE = { standard: 0.50, quick: 0.65 } as const;
export const INTEGRATION_DRAG_EPSILON = 0.0005;        // below this, zero out
export const INTEGRATION_RESTRUCTURING_PCT = 0.15;     // bumped from 0.07
export const INTEGRATION_RESTRUCTURING_MERGER_PCT = 0.12; // mergers gentler

// ── Covenant / Bankruptcy Constants ──

export const COVENANT_BREACH_ROUNDS_THRESHOLD = 2; // breach years before restructuring/bankruptcy

// ── Restructuring Constants ──

export const RESTRUCTURING_FEV_PENALTY = 0.80; // 20% FEV haircut for restructured games

// ── Equity Constants ──

export const EQUITY_DILUTION_STEP = 0.10;   // 10% discount per prior raise
export const EQUITY_DILUTION_FLOOR = 0.10;  // minimum 10% of intrinsic value
export const EQUITY_BUYBACK_COOLDOWN = 2;   // rounds between raise↔buyback
export const EQUITY_ISSUANCE_SENTIMENT_PENALTY = 0.01; // -1% market sentiment per public equity issuance
export const MIN_FOUNDER_OWNERSHIP = 0.51;  // 51% floor — must maintain majority control
export const MIN_PUBLIC_FOUNDER_OWNERSHIP = 0.10;  // 10% floor after IPO — public companies can dilute further

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

/** Tiered platform sale bonus — scales inversely with multipleExpansion to prevent stacking */
export function getPlatformSaleBonus(multipleExpansion: number): number {
  if (multipleExpansion >= 2.0) return 0.3;
  return 0.5;
}
// Legacy constant kept for display-proofreader backward compat — max possible bonus
export const PLATFORM_SALE_BONUS = 0.5;

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

// Seller Deception
export const SELLER_DECEPTION_PROB = 0.05;
export const SELLER_DECEPTION_REVENUE_HIT = 0.25;        // -25% revenue
export const SELLER_DECEPTION_QUALITY_DROP = 1;           // -1 quality tier
export const SELLER_DECEPTION_TURNAROUND_COST_PCT = 0.20; // 20% of EBITDA to fix
export const SELLER_DECEPTION_TURNAROUND_RESTORE_CHANCE = 0.65;
export const SELLER_DECEPTION_FIRE_SALE_PCT = 0.60;       // sell at 60% of fair value
export const SELLER_DECEPTION_MAX_AGE = 2;                // only businesses acquired within 2 rounds

// Working Capital Crunch
export const WORKING_CAPITAL_CRUNCH_PROB = 0.08;
export const WORKING_CAPITAL_CRUNCH_MIN = 200;            // $200K min
export const WORKING_CAPITAL_CRUNCH_MAX = 600;            // $600K max
export const WORKING_CAPITAL_CRUNCH_REVENUE_PENALTY = 0.10;  // -10% revenue for 2 rounds if not paid
export const WORKING_CAPITAL_CRUNCH_PENALTY_ROUNDS = 2;
export const WORKING_CAPITAL_CRUNCH_MAX_AGE = 1;          // only businesses acquired previous round

// Industry Consolidation Boom
export const CONSOLIDATION_BOOM_PROB = 0.03;
export const CONSOLIDATION_BOOM_PRICE_PREMIUM = 0.20;       // +20% price premium on deals
export const CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS = 2;     // need 2+ in sector for exclusive tuck-in
export const CONSOLIDATION_BOOM_SECTORS = ['environmental', 'homeServices', 'autoServices', 'industrial'] as const;
export const CONSOLIDATION_BOOM_DYNAMIC_MIN_OPCOS = 3;

// ── 20-Year Mode: Deal Inflation ──

export const DEAL_INFLATION_START_ROUND = 11;
export const DEAL_INFLATION_RATE = 0.5;       // +0.5x per year past start
export const DEAL_INFLATION_CAP = 3.0;        // max +3.0x
export const DEAL_INFLATION_CRISIS_RESET = 2.0; // Financial Crisis reduces by 2.0x
export const DEAL_INFLATION_CRISIS_DURATION = 2; // crisis reset lasts 2 rounds

// ── 7-Tier EBITDA System ──

export const DEAL_SIZE_TIERS: Record<DealSizeTier, { min: number; max: number | null; qualityFloor: number | undefined; multipleAdder: number }> = {
  micro:         { min: 500,    max: 1500,   qualityFloor: undefined, multipleAdder: 0   },
  small:         { min: 1500,   max: 4000,   qualityFloor: undefined, multipleAdder: 0   },
  mid_market:    { min: 4000,   max: 10000,  qualityFloor: undefined, multipleAdder: 0   },
  upper_mid:     { min: 10000,  max: 25000,  qualityFloor: 2,        multipleAdder: 0.5 },
  institutional: { min: 25000,  max: 50000,  qualityFloor: 3,        multipleAdder: 1.0 },
  marquee:       { min: 50000,  max: 75000,  qualityFloor: 3,        multipleAdder: 1.5 },
  trophy:        { min: 75000,  max: null,   qualityFloor: 4,        multipleAdder: 2.0 },
};

// Affordability
export const AFFORDABILITY_LBO_MULTIPLIER = 4;
export const STRETCH_FACTOR_MAX = 0.50;
export const IPO_AFFORDABILITY_DISCOUNT = 0.25;

// Pipeline concentration penalty
export const CONCENTRATION_CASH_THRESHOLD = 0.60;
export const CONCENTRATION_WEIGHT_PENALTY = 0.30;

// Trophy tier scaling
export const TROPHY_BASE_MIN = 75000;
export const TROPHY_BASE_MAX = 150000;
export const TROPHY_SCALE_ACTIVATION = 600000;
export const TROPHY_SCALE_CAP = 4.0;

// Buyer premium cap
export const BUYER_PREMIUM_EBITDA_CAP = 300000;
export const BUYER_PREMIUM_MAX = 5.5;

// Pipeline scarcity
export const TIER_PIPELINE_COUNTS: Record<DealSizeTier, { min: number; max: number }> = {
  micro:         { min: 4, max: 6 },
  small:         { min: 4, max: 6 },
  mid_market:    { min: 3, max: 5 },
  upper_mid:     { min: 3, max: 4 },
  institutional: { min: 2, max: 4 },
  marquee:       { min: 2, max: 3 },
  trophy:        { min: 1, max: 2 },
};

// Pipeline tier floor costs (min EBITDA * typical entry multiple)
export const TIER_FLOOR_COSTS: Record<DealSizeTier, number> = {
  micro:         2500,
  small:         7500,
  mid_market:    24000,
  upper_mid:     70000,
  institutional: 200000,
  marquee:       425000,
  trophy:        675000,
};

// ── 20-Year Mode: Final Countdown ──

export const FINAL_COUNTDOWN_START_ROUND = 18;

// ── 20-Year Mode: Business Anniversaries ──

export const ANNIVERSARY_MILESTONES = [5, 10, 15] as const;

// ── 20-Year Mode: Narrative Tone ──

export type NarrativePhaseId = 'scrappy_startup' | 'growing_operator' | 'seasoned_builder' | 'adapting_veteran' | 'legacy_architect';

export interface NarrativePhaseConfig {
  id: NarrativePhaseId;
  label: string;
  toneGuidance: string;
}

export const NARRATIVE_PHASE_CONFIG: NarrativePhaseConfig[] = [
  {
    id: 'scrappy_startup',
    label: 'Scrappy Startup',
    toneGuidance: 'Write with hungry, uncertain energy. The founder is new to this — excited but unproven. Use language that conveys ambition mixed with naivety. Short sentences, forward momentum.',
  },
  {
    id: 'growing_operator',
    label: 'Growing Operator',
    toneGuidance: 'Write with growing confidence. The operator is learning what works, expanding their playbook. Reference pattern recognition and early wins. Optimistic but grounded.',
  },
  {
    id: 'seasoned_builder',
    label: 'Seasoned Builder',
    toneGuidance: 'Write with commanding authority. The builder has earned their reputation. Strategic, measured language. Reference institutional knowledge, system-level thinking.',
  },
  {
    id: 'adapting_veteran',
    label: 'Adapting Veteran',
    toneGuidance: 'Write with reflective wisdom. The veteran has seen cycles come and go. More selective, philosophical. Reference lessons learned, trade-offs understood.',
  },
  {
    id: 'legacy_architect',
    label: 'Legacy Architect',
    toneGuidance: 'Write with contemplative gravitas. The architect is thinking about permanence. Philosophical, weighing what endures. Reference legacy, institutional durability, what outlasts the founder.',
  },
];

/** Returns the narrative phase for a given round and maxRounds. */
export function getNarrativePhase(round: number, maxRounds: number): NarrativePhaseConfig {
  if (maxRounds <= 10) {
    // 10-year mode: compressed 3 phases
    if (round <= 3) return NARRATIVE_PHASE_CONFIG[0];
    if (round <= 6) return NARRATIVE_PHASE_CONFIG[1];
    return NARRATIVE_PHASE_CONFIG[2];
  }
  // 20-year mode: 5 phases
  if (round <= 4) return NARRATIVE_PHASE_CONFIG[0];
  if (round <= 8) return NARRATIVE_PHASE_CONFIG[1];
  if (round <= 12) return NARRATIVE_PHASE_CONFIG[2];
  if (round <= 16) return NARRATIVE_PHASE_CONFIG[3];
  return NARRATIVE_PHASE_CONFIG[4];
}

// ── 20-Year Mode: Management Succession ──

export const SUCCESSION_MIN_YEARS_HELD = 8;
export const SUCCESSION_INVEST_COST_MIN = 300;   // $K
export const SUCCESSION_INVEST_COST_MAX = 500;   // $K
export const SUCCESSION_INVEST_RESTORE = 0.75;
export const SUCCESSION_PROMOTE_RESTORE = 0.50;
export const SUCCESSION_PROMOTE_HR_BONUS = 0.20;
export const SUCCESSION_PROMOTE_PLATFORM_BONUS = 0.15;
export const SUCCESSION_QUALITY_DROP = 1;
export const SUCCESSION_SELL_DISCOUNT = 0.15;
export const SUCCESSION_PROB = 0.06;

// ── 20-Year Mode: IPO Pathway ──

export const IPO_MIN_EBITDA = 75000;       // $75M
export const IPO_MIN_BUSINESSES = 6;
export const IPO_MIN_AVG_QUALITY = 4.0;
export const IPO_MIN_PLATFORMS = 1;
export const IPO_MIN_ROUND = 16;
export const IPO_EARNINGS_MISS_PENALTY = 0.15;
export const IPO_EARNINGS_BEAT_BONUS = 0.08;
export const IPO_CONSECUTIVE_MISS_THRESHOLD = 2;
export const IPO_SHARE_FUNDED_DEALS_PER_ROUND = 1;
export const IPO_FEV_BONUS_BASE = 0.05;
export const IPO_FEV_BONUS_MAX = 0.18;

// ── 20-Year Mode: Family Office Endgame ──

export const FAMILY_OFFICE_MIN_DISTRIBUTIONS = 1000000; // $1B
export const FAMILY_OFFICE_MIN_COMPOSITE_GRADE = 'B';
export const FAMILY_OFFICE_MIN_Q4_BUSINESSES = 3;
export const FAMILY_OFFICE_MIN_LONG_HELD = 2;
export const FAMILY_OFFICE_ROUNDS = 5;
export const FAMILY_OFFICE_SUCCESSION_ROUND = 3;

// ── Mode Selection Copy ──

export const DURATION_SUBTITLE = {
  quick: 'Make your fortune',
  standard: 'Build your legacy',
} as const;

// Type helpers for consumers
export type DifficultyConfig = typeof DIFFICULTY_CONFIG;
export type DurationConfig = typeof DURATION_CONFIG;
export type { GameDifficulty, GameDuration };
