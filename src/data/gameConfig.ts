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

// ── Private Credit Financing Synergy (Diminishing Returns) ──

export const LENDING_SYNERGY_SCHEDULE = [0.0075, 0.005, 0.0025] as const; // per PC business: -75bp, -50bp, -25bp
export const LENDING_SYNERGY_MAX_REDUCTION = 0.015;  // -150bp hard cap (3 businesses to reach)
export const LENDING_SYNERGY_MIN_RATE = 0.03;         // 3% floor — debt is never free
export const LENDING_SYNERGY_CRISIS_MULTIPLIER = 0.5;  // halved during credit tightening

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
export const TURNAROUND_EXIT_PREMIUM_PER_TIER = 0.15; // +0.15x per quality tier improved via turnaround
export const TURNAROUND_EXIT_PREMIUM_MIN_TIERS = 1;  // need 1+ quality tiers improved

// Ceiling mastery bonus — awarded when turnaround reaches sector quality ceiling
export const TURNAROUND_CEILING_BONUS = {
  marginBoost: 0.02,           // +2ppt margin
  growthBoost: 0.01,           // +1% growth
  improvementEfficacy: 1.1,    // 110% improvement efficacy
};

// ── Improvement Constants ──

export const IMPROVEMENT_COST_FLOOR = 200; // $200K minimum improvement cost

// Stabilization improvements — available at any quality, including during turnaround
export const STABILIZATION_TYPES: ReadonlySet<string> = new Set([
  'fix_underperformance',
  'management_professionalization',
  'operating_playbook',
]);

// Growth improvements — gated behind Q3+ quality
export const GROWTH_TYPES: ReadonlySet<string> = new Set([
  'service_expansion',
  'digital_transformation',
  'recurring_revenue_conversion',
  'pricing_model',
]);

export const QUALITY_IMPROVEMENT_MULTIPLIER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0.6, 2: 0.8, 3: 1.0, 4: 1.1, 5: 1.2,
};

// Relaxed efficacy for stabilization improvements on low-quality businesses
export const STABILIZATION_EFFICACY_MULTIPLIER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0.85, 2: 0.90, 3: 1.0, 4: 1.1, 5: 1.2,
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

// ── Oil Shock Event Constants ──

export const OIL_SHOCK_BASE_MARGIN_HIT = 0.02;
export const OIL_SHOCK_CONSUMER_REVENUE_HIT = 0.05;
export const OIL_SHOCK_INTEREST_HIKE = 0.01;
export const OIL_SHOCK_CREDIT_TIGHTENING_ROUNDS = 1;
export const OIL_SHOCK_DISTRESSED_DEAL_COUNT = 3;
export const OIL_SHOCK_DISTRESSED_DISCOUNT = 0.25;
export const OIL_SHOCK_AFTERSHOCK_DECAY = 0.60;
export const OIL_SHOCK_SENSITIVITY_REVENUE_THRESHOLD = 1.0;
export const OIL_SHOCK_HUNKER_REVENUE_CUT = 0.02;
export const OIL_SHOCK_HUNKER_MARGIN_HALVE = 0.50;
export const OIL_SHOCK_HUNKER_CASH_BONUS = 750;
export const OIL_SHOCK_HUNT_MARGIN_COST = 0.02;
export const OIL_SHOCK_PASSTHROUGH_REVENUE_HIT_HIGH = 0.06;
export const OIL_SHOCK_PASSTHROUGH_REVENUE_HIT_LOW = 0.02;
export const OIL_SHOCK_PASSTHROUGH_QUALITY_THRESHOLD = 4;

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

export type NarrativePhaseId = 'scrappy_startup' | 'growing_operator' | 'seasoned_builder' | 'adapting_veteran' | 'legacy_architect'
  | 'deploying_capital' | 'creating_value' | 'harvesting_returns';

export interface NarrativePhaseConfig {
  id: NarrativePhaseId;
  label: string;
  toneGuidance: string;
  rounds?: number[];  // optional: explicit round mapping for PE phases
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

export const PE_NARRATIVE_PHASES: NarrativePhaseConfig[] = [
  {
    id: 'deploying_capital',
    label: 'Deploying Capital',
    rounds: [1, 2, 3, 4],
    toneGuidance: 'Early fund execution. The GP is building a portfolio from scratch. '
      + 'Reference deal pipeline quality, deployment pacing, thesis validation. '
      + 'Tone: disciplined optimism. The fund is taking shape.',
  },
  {
    id: 'creating_value',
    label: 'Creating Value',
    rounds: [5, 6, 7],
    toneGuidance: 'Mid-fund inflection. Portfolio companies are maturing. '
      + 'Reference operational improvements, margin expansion, platform integration. '
      + 'Tone: focused execution. The investment period is closing or closed. '
      + 'LPs are watching deployment discipline and early results.',
  },
  {
    id: 'harvesting_returns',
    label: 'Harvesting Returns',
    rounds: [8, 9, 10],
    toneGuidance: 'Fund wind-down. Exits are the priority. '
      + 'Reference DPI progress, carry proximity, LP distributions, portfolio cleanup. '
      + 'Tone: urgency mixed with reflection. Every decision now has finality. '
      + 'The hurdle cliff looms. The carry moment is approaching.',
  },
];

/** Returns the narrative phase for a given round and maxRounds. */
export function getNarrativePhase(round: number, maxRounds: number, isFundManagerMode?: boolean): NarrativePhaseConfig {
  if (isFundManagerMode) {
    if (round <= 4) return PE_NARRATIVE_PHASES[0];
    if (round <= 7) return PE_NARRATIVE_PHASES[1];
    return PE_NARRATIVE_PHASES[2];
  }
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
/** @deprecated No longer used as a gate — share-funded deals are uncapped. Kept for test/migration compat. */
export const IPO_SHARE_FUNDED_DEALS_PER_ROUND = 1;
export const IPO_FEV_BONUS_BASE = 0.05;
export const IPO_FEV_BONUS_MAX = 0.18;

// ── 20-Year Mode: Family Office Endgame ──

export const FAMILY_OFFICE_MIN_DISTRIBUTIONS = 1000000; // $1B
export const FAMILY_OFFICE_MIN_COMPOSITE_GRADE = 'B';
export const FAMILY_OFFICE_MIN_Q4_BUSINESSES = 3;
export const FAMILY_OFFICE_MIN_LONG_HELD = 2;
export const FAMILY_OFFICE_ROUNDS = 5;
export const FAMILY_OFFICE_SUCCESSION_ROUND = 3; // kept for migration compat

// FO V2 — Real holdco mechanics
export const FO_PHILANTHROPY_RATE = 0.25;
export const FO_MULTIPLIER_CAP = 0.50;
export const FO_MULTIPLIER_MOIC_SCALE = 0.10;
export const FO_DEAL_INFLATION = 2.5;
export const FO_MA_SOURCING_TIER = 1;
export const FO_MAX_ROUNDS = 5;
export const FO_QUALITY_FLOOR = 3;
export const FO_RESTRUCTURING_PENALTY = 0.80;

// ── PE Fund Manager Mode ──

export const PE_FUND_CONFIG = {
  fundSize: 100_000,                    // $100M committed capital
  managementFeeRate: 0.02,
  annualManagementFee: 2_000,           // $2M/year
  carryRate: 0.20,
  hurdleRate: 0.08,
  hurdleReturn: 215_892,               // precomputed: 100_000 * 1.08^10
  lpSatisfactionStart: 75,
  lpSatisfactionFloor: 0,
  lpSatisfactionCeiling: 100,
  lpSatisfactionGradeCap: 20,          // below this, grade ceiling at C
  maxConcentration: 0.25,              // LPAC gate: 25% of committed capital ($25M)
  lpacAutoApproveThreshold: 70,        // satisfaction 70+ = auto-approved
  lpacHighApproval: 0.85,             // satisfaction 50-69
  lpacMidApproval: 0.50,              // satisfaction 30-49
  lpacLowApproval: 0.25,              // satisfaction <30
  lpTerminationThreatThreshold: 15,
  investmentPeriodEnd: 5,
  minDistribution: 1_000,              // $1M minimum
  minDeploymentForDistribution: 20_000, // 20% of committed capital
  duration: 'quick' as const,
  startingMaSourcingTier: 1,           // pre-unlock 3 deals/round
  forcedLiquidationDiscount: 0.90,    // 10% haircut on Year 10 auto-sales
} as const;

export const PE_IRR_CARRY_TIERS = [
  { minIrr: 0.25, multiplier: 1.30 },  // Legendary (supercarry)
  { minIrr: 0.20, multiplier: 1.20 },  // Exceptional
  { minIrr: 0.15, multiplier: 1.10 },  // Top quartile
  { minIrr: 0.12, multiplier: 1.00 },  // Solid (baseline)
  { minIrr: 0.08, multiplier: 0.85 },  // Below median
  { minIrr: 0.00, multiplier: 0.70 },  // Capital preserved but poor
] as const;

export const FUND_MANAGER_CONFIG = {
  initialCash: 100_000,
  founderShares: 0,
  totalShares: 1000,
  startingDebt: 0,
  startingEbitda: 0,
  noStartingBusiness: true,
  leaderboardMultiplier: 1.0,
  label: 'Fund Manager',
  description: '$100M from LPs. 10 years. Earn your carry.',
  blockEquityRaises: true,
  blockEmergencyEquity: true,
  blockDistributions: true,             // founder distributions; LP distributions separate
  blockBuybacks: true,
  blockHoldcoLoan: true,
  blockIPO: true,
  blockFamilyOffice: true,
  forcedLiquidation: true,
  managementFee: true,
} as const;

// PE Fund Scoring Grade Thresholds
export const PE_GRADE_THRESHOLDS = {
  S: 90,
  A: 75,
  B: 60,
  C: 40,
  D: 20,
  F: 0,
} as const;

export const PE_GRADE_TITLES: Record<string, string> = {
  S: 'Legendary GP — LPs hand you blank checks',
  A: 'Top Quartile — Fund II is 3x oversubscribed',
  B: 'Solid Manager — LPs re-up with mild questions',
  C: 'Median Fund — Respectable, but Fund II will be a tough raise',
  D: 'Below Benchmark — Fund II won\'t happen',
  F: 'Fund Implosion — Your career in PE is over',
};

// ── Mode Selection Copy ──

export const DURATION_SUBTITLE = {
  quick: 'Make your fortune',
  standard: 'Build your legacy',
} as const;

// ── Small Business Broker (Early-Game Deal Sourcing) ──

export const SMB_BROKER_COST = 75; // $75K
export const SMB_BROKER_CHEAP_SECTORS = ['agency', 'homeServices', 'b2bServices', 'education', 'autoServices'] as const;
export const SMB_BROKER_QUALITY_WEIGHTS = { 1: 0.20, 2: 0.30, 3: 0.50 } as const;

// ── Quiet Year Frequency Cap ──

export const QUIET_YEAR_CAP_QUICK = 2;   // max 2 quiet years in 10yr game
export const QUIET_YEAR_CAP_STANDARD = 4; // max 4 quiet years in 20yr game

// ── Early-Game Pipeline Safety Net ──

export const EARLY_GAME_SAFETY_NET_MAX_ROUND = 3;
export const EARLY_GAME_AFFORDABLE_THRESHOLD = 2; // cash multiplier for affordability check

// ── Filler Event Constants ──

export const FILLER_TAX_STRATEGY_COST_MIN = 200;
export const FILLER_TAX_STRATEGY_COST_MAX = 350;
export const FILLER_TAX_STRATEGY_MARGIN_BOOST = 0.01; // +1ppt permanent
export const FILLER_TAX_STRATEGY_DURATION = 2; // kept for save compat — boost is actually permanent
export const FILLER_TAX_STRATEGY_WRITEOFF = 50; // $50K

export const FILLER_CONFERENCE_COST_MIN = 100;
export const FILLER_CONFERENCE_COST_MAX = 150;
export const FILLER_CONFERENCE_FREE_DEAL_CHANCE = 0.40; // 40% chance if sending team for free

export const FILLER_AUDIT_COST_MIN = 200;
export const FILLER_AUDIT_COST_MAX = 350;
export const FILLER_AUDIT_SUCCESS_CHANCE = 0.40;  // 40% chance +1.5ppt margin
export const FILLER_AUDIT_MARGIN_BOOST = 0.015;   // +1.5ppt
export const FILLER_AUDIT_ISSUE_CHANCE = 0.15;    // 15% chance compliance issue
export const FILLER_AUDIT_ISSUE_COST = 100;        // $100K
export const FILLER_AUDIT_ISSUE_MARGIN_HIT = 0.01; // -1ppt for 1 round
export const FILLER_AUDIT_LIGHT_CHANCE = 0.30;    // 30% chance on light review
export const FILLER_AUDIT_LIGHT_MARGIN_BOOST = 0.005; // +0.5ppt

export const FILLER_REPUTATION_COST_MIN = 100;
export const FILLER_REPUTATION_COST_MAX = 200;
export const FILLER_REPUTATION_HEAT_REDUCTION = 1; // -1 heat tier on next acquisition

// ── Portfolio Complexity Cost ──

export const COMPLEXITY_ACTIVATION_THRESHOLD = 5;        // Standard mode
export const COMPLEXITY_ACTIVATION_THRESHOLD_QUICK = 4;  // Quick mode
export const COMPLEXITY_COST_PER_OPCO = 0.003;           // 0.3% of total revenue per excess opco (base rate)
export const COMPLEXITY_COST_EXPONENT = 1.3;             // Standard mode: non-linear scaling (steeper at 5+)
export const COMPLEXITY_COST_EXPONENT_QUICK = 1.0;       // Quick mode: linear (preserves viability)
export const COMPLEXITY_SHARED_SERVICE_OFFSET = 1 / 3;   // Each active SS offsets ~33%
export const COMPLEXITY_MAX_MARGIN_COMPRESSION = 0.04;   // 4ppt cap
export const MAX_ACTIVE_SHARED_SERVICES = 3;             // Max SS that can be active simultaneously

// ── Ownership History Effects ──

/** Improvement efficacy modifier by prior ownership count: founder-owned gets a bonus, multi-PE gets a penalty */
export const OWNERSHIP_IMPROVEMENT_MODIFIER: Record<number, number> = {
  0: 1.10,   // founder-owned: +10% improvement efficacy
  1: 1.00,   // one prior backer: neutral
  2: 0.95,   // two backers: -5%
  3: 0.90,   // three+: -10%
};

/** Get the ownership-based improvement modifier (defaults to the 3+ value for high counts) */
export function getOwnershipImprovementModifier(priorOwnershipCount: number): number {
  return OWNERSHIP_IMPROVEMENT_MODIFIER[Math.min(priorOwnershipCount, 3)] ?? 0.90;
}

// ── Competitive Position Premium ──

export const COMPETITIVE_POSITION_PREMIUM = 0.2; // +0.2x exit multiple for market leaders

// Type helpers for consumers
export type DifficultyConfig = typeof DIFFICULTY_CONFIG;
export type DurationConfig = typeof DURATION_CONFIG;
export type { GameDifficulty, GameDuration };
