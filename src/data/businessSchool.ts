/**
 * Business School Mode — configuration, curated businesses, and curated deals.
 *
 * All B-School-specific data and logic lives here to keep useGame.ts clean.
 * The engine runs unchanged — this is purely a data + UI layer.
 */

import type {
  Business,
  BusinessSchoolChecklist,
  BusinessSchoolChecklistItemId,
  BusinessSchoolState,
  Deal,
  DueDiligenceSignals,
  GameDifficulty,
  GameDuration,
  GameEvent,
  SectorId,
} from '../engine/types';

// ── Constants ──

export const BS_STARTING_CASH = 6000; // $6M — tight enough to force sell + equity raise
export const BS_MAX_ROUNDS = 2;
export const BS_DIFFICULTY: GameDifficulty = 'easy';
export const BS_DURATION: GameDuration = 'quick';
export const BS_TOTAL_CHECKLIST_ITEMS = 15;

// ── Checklist ──

const ALL_CHECKLIST_ITEMS: BusinessSchoolChecklistItemId[] = [
  // Year 1
  'bs_collect_1',
  'bs_improve',
  'bs_sell',
  'bs_acquire_sn',
  'bs_acquire_bd',
  'bs_ma_sourcing',
  'bs_forge_platform',
  'bs_end_year_1',
  // Year 2
  'bs_collect_2',
  'bs_equity',
  'bs_acquire_lbo',
  'bs_shared_service',
  'bs_pay_debt',
  'bs_distribute',
  'bs_sell_platform',
];

export function createInitialChecklist(): BusinessSchoolChecklist {
  const items = {} as Record<BusinessSchoolChecklistItemId, boolean>;
  for (const id of ALL_CHECKLIST_ITEMS) {
    items[id] = false;
  }
  return { items, completedCount: 0 };
}

export function createInitialBSState(r1Deals: Deal[], r2Deals: Deal[]): BusinessSchoolState {
  return {
    isActive: true,
    checklist: createInitialChecklist(),
    curatedDealsR1: r1Deals,
    curatedDealsR2: r2Deals,
  };
}

/** Mark a checklist item complete. Returns updated state (or null if already complete). */
export function markChecklistItem(
  state: BusinessSchoolState,
  itemId: BusinessSchoolChecklistItemId,
): BusinessSchoolState | null {
  if (state.checklist.items[itemId]) return null; // already complete
  return {
    ...state,
    checklist: {
      items: { ...state.checklist.items, [itemId]: true },
      completedCount: state.checklist.completedCount + 1,
    },
  };
}

/** Check if all checklist items are complete. */
export function isChecklistComplete(checklist: BusinessSchoolChecklist): boolean {
  return checklist.completedCount >= BS_TOTAL_CHECKLIST_ITEMS;
}

// ── Shared Due Diligence (used by starting businesses and curated deals) ──

const STANDARD_DD: DueDiligenceSignals = {
  revenueConcentration: 'medium',
  revenueConcentrationText: 'Diversified client base',
  operatorQuality: 'moderate',
  operatorQualityText: 'Competent management team in place',
  trend: 'flat',
  trendText: 'Stable performance',
  customerRetention: 85,
  customerRetentionText: 'Good retention rates',
  competitivePosition: 'competitive',
  competitivePositionText: 'Well-positioned in local market',
};

const GROWING_DD: DueDiligenceSignals = {
  ...STANDARD_DD,
  trend: 'growing',
  trendText: 'Revenue trending upward',
  customerRetention: 90,
  customerRetentionText: 'Strong customer loyalty',
};

const WEAK_DD: DueDiligenceSignals = {
  ...STANDARD_DD,
  operatorQuality: 'weak',
  operatorQualityText: 'Owner-dependent operations',
  trend: 'declining',
  trendText: 'Revenue declining year-over-year',
  customerRetention: 72,
  customerRetentionText: 'Below-average retention',
  competitivePosition: 'commoditized',
  competitivePositionText: 'Struggling against larger competitors',
};

// ── Starting Businesses ──

function makeBusinessBase(params: {
  id: string; name: string; sectorId: SectorId; subType: string;
  ebitda: number; revenue: number; ebitdaMargin: number;
  acquisitionMultiple: number; acquisitionPrice: number;
  organicGrowthRate: number; revenueGrowthRate: number;
  qualityRating: 1 | 2 | 3 | 4 | 5;
  dueDiligence: DueDiligenceSignals;
}): Business {
  return {
    id: params.id,
    name: params.name,
    sectorId: params.sectorId,
    subType: params.subType,
    ebitda: params.ebitda,
    peakEbitda: params.ebitda,
    acquisitionEbitda: params.ebitda,
    acquisitionPrice: params.acquisitionPrice,
    acquisitionRound: 0,
    acquisitionMultiple: params.acquisitionMultiple,
    acquisitionSizeTierPremium: 0,
    organicGrowthRate: params.organicGrowthRate,
    revenue: params.revenue,
    ebitdaMargin: params.ebitdaMargin,
    acquisitionRevenue: params.revenue,
    acquisitionMargin: params.ebitdaMargin,
    peakRevenue: params.revenue,
    revenueGrowthRate: params.revenueGrowthRate,
    marginDriftRate: 0,
    qualityRating: params.qualityRating,
    dueDiligence: params.dueDiligence,
    integrationRoundsRemaining: 0,
    integrationGrowthDrag: 0,
    improvements: [],
    sellerNoteBalance: 0,
    sellerNoteRate: 0,
    sellerNoteRoundsRemaining: 0,
    bankDebtBalance: 0,
    bankDebtRate: 0,
    bankDebtRoundsRemaining: 0,
    earnoutRemaining: 0,
    earnoutTarget: 0,
    status: 'active',
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: params.acquisitionPrice,
    cashEquityInvested: params.acquisitionPrice,
    rolloverEquityPct: 0,
    priorOwnershipCount: 0,
  };
}

/**
 * Business A: "Metro Staffing Solutions" — B2B Services, the sell candidate.
 * Different sector from the Home Services core. Slow growth. Player sells this
 * in Year 1 to recycle capital into HVAC acquisitions.
 */
const BIZ_A_STAFFING: Business = makeBusinessBase({
  id: 'bs_biz_a',
  name: 'Metro Staffing Solutions',
  sectorId: 'b2bServices',
  subType: 'IT Staffing / Recruiting',
  ebitda: 1000,
  revenue: 5000,
  ebitdaMargin: 0.20,
  qualityRating: 3,
  acquisitionMultiple: 4.0,
  acquisitionPrice: 4000,
  organicGrowthRate: 0.03,
  revenueGrowthRate: 0.03,
  dueDiligence: STANDARD_DD,
});

/**
 * Business B: "Heritage Plumbing Co" — Home Services, platform seed #1.
 * Plumbing Services sub-type matches the home_multi_trade recipe.
 * Solid earner, good growth. The foundation of the platform.
 */
const BIZ_B_PLUMBING: Business = makeBusinessBase({
  id: 'bs_biz_b',
  name: 'Heritage Plumbing Co',
  sectorId: 'homeServices',
  subType: 'Plumbing Services',
  ebitda: 1200,
  revenue: 6000,
  ebitdaMargin: 0.20,
  qualityRating: 3,
  acquisitionMultiple: 3.5,
  acquisitionPrice: 4200,
  organicGrowthRate: 0.04,
  revenueGrowthRate: 0.04,
  dueDiligence: GROWING_DD,
});

/**
 * Business C: "BrightSpark Electrical" — Home Services, platform seed #2.
 * Electrical Services sub-type. Lower margin (15%) = improvement candidate.
 * Player improves this in Year 1 with fix_underperformance.
 */
const BIZ_C_ELECTRICAL: Business = makeBusinessBase({
  id: 'bs_biz_c',
  name: 'BrightSpark Electrical',
  sectorId: 'homeServices',
  subType: 'Electrical Services',
  ebitda: 800,
  revenue: 5333,
  ebitdaMargin: 0.15,
  qualityRating: 3,
  acquisitionMultiple: 3.0,
  acquisitionPrice: 2400,
  organicGrowthRate: 0.02,
  revenueGrowthRate: 0.02,
  dueDiligence: STANDARD_DD,
});

export function createBSStartingBusinesses(): Business[] {
  return [BIZ_A_STAFFING, BIZ_B_PLUMBING, BIZ_C_ELECTRICAL];
}

// ── Curated Deals ──

function makeDeal(overrides: {
  id: string; name: string; sectorId: SectorId; subType: string;
  ebitda: number; revenue: number; ebitdaMargin: number;
  qualityRating: 1 | 2 | 3 | 4 | 5;
  organicGrowthRate: number; revenueGrowthRate: number;
  askingMultiple: number; heat: 'cold' | 'warm' | 'hot' | 'contested';
  roundAppeared: number; source: 'inbound' | 'brokered' | 'sourced' | 'proprietary';
  dueDiligence: DueDiligenceSignals;
}): Deal {
  const askingPrice = Math.round(overrides.ebitda * overrides.askingMultiple);
  const heatMultiplier = overrides.heat === 'cold' ? 1.0 : overrides.heat === 'warm' ? 1.12 : overrides.heat === 'hot' ? 1.25 : 1.4;
  const effectivePrice = Math.round(askingPrice * heatMultiplier);

  return {
    id: overrides.id,
    business: {
      name: overrides.name,
      sectorId: overrides.sectorId,
      subType: overrides.subType,
      ebitda: overrides.ebitda,
      peakEbitda: overrides.ebitda,
      acquisitionEbitda: overrides.ebitda,
      acquisitionPrice: effectivePrice,
      acquisitionMultiple: overrides.askingMultiple,
      acquisitionSizeTierPremium: 0,
      organicGrowthRate: overrides.organicGrowthRate,
      revenue: overrides.revenue,
      ebitdaMargin: overrides.ebitdaMargin,
      acquisitionRevenue: overrides.revenue,
      acquisitionMargin: overrides.ebitdaMargin,
      peakRevenue: overrides.revenue,
      revenueGrowthRate: overrides.revenueGrowthRate,
      marginDriftRate: 0,
      qualityRating: overrides.qualityRating,
      dueDiligence: overrides.dueDiligence,
      integrationRoundsRemaining: 2,
      integrationGrowthDrag: 0,
      sellerNoteBalance: 0,
      sellerNoteRate: 0,
      sellerNoteRoundsRemaining: 0,
      bankDebtBalance: 0,
      bankDebtRate: 0,
      bankDebtRoundsRemaining: 0,
      earnoutRemaining: 0,
      earnoutTarget: 0,
      isPlatform: false,
      platformScale: 0,
      boltOnIds: [],
      synergiesRealized: 0,
      totalAcquisitionCost: effectivePrice,
      cashEquityInvested: effectivePrice,
      rolloverEquityPct: 0,
      priorOwnershipCount: 0,
    },
    askingPrice,
    freshness: 3,
    roundAppeared: overrides.roundAppeared,
    source: overrides.source,
    acquisitionType: 'standalone',
    heat: overrides.heat,
    effectivePrice,
  };
}

/**
 * Round 1 Deals:
 * D1: Comfort Zone HVAC — the intended seller-note acquisition (HVAC, good fit)
 * D2: Spark Electric & HVAC — the intended bank-debt acquisition (HVAC, good fit)
 * D3: CloudMetrics SaaS — the obvious pass (overpriced, wrong sector)
 * D4: Regional Staffing Group — reasonable alternative (but wrong sector)
 */
export function createBSRound1Deals(): Deal[] {
  return [
    makeDeal({
      id: 'bs_d1',
      name: 'Comfort Zone HVAC',
      sectorId: 'homeServices',
      subType: 'HVAC Services',
      ebitda: 1200,
      revenue: 6000,
      ebitdaMargin: 0.20,
      qualityRating: 3,
      organicGrowthRate: 0.04,
      revenueGrowthRate: 0.04,
      askingMultiple: 3.5,
      heat: 'cold',
      roundAppeared: 1,
      source: 'inbound',
      dueDiligence: GROWING_DD,
    }),
    makeDeal({
      id: 'bs_d2',
      name: 'AllSeason Heating & Air',
      sectorId: 'homeServices',
      subType: 'HVAC Services',
      ebitda: 1000,
      revenue: 5714,
      ebitdaMargin: 0.175,
      qualityRating: 3,
      organicGrowthRate: 0.03,
      revenueGrowthRate: 0.03,
      askingMultiple: 3.5,
      heat: 'cold',
      roundAppeared: 1,
      source: 'inbound',
      dueDiligence: STANDARD_DD,
    }),
    makeDeal({
      id: 'bs_d3',
      name: 'CloudMetrics SaaS',
      sectorId: 'saas',
      subType: 'Vertical-Market SaaS',
      ebitda: 1500,
      revenue: 6000,
      ebitdaMargin: 0.25,
      qualityRating: 4,
      organicGrowthRate: 0.08,
      revenueGrowthRate: 0.08,
      askingMultiple: 7.0,
      heat: 'hot',
      roundAppeared: 1,
      source: 'brokered',
      dueDiligence: GROWING_DD,
    }),
    makeDeal({
      id: 'bs_d4',
      name: 'Regional Staffing Group',
      sectorId: 'b2bServices',
      subType: 'IT Staffing / Recruiting',
      ebitda: 900,
      revenue: 4500,
      ebitdaMargin: 0.20,
      qualityRating: 3,
      organicGrowthRate: 0.02,
      revenueGrowthRate: 0.02,
      askingMultiple: 4.0,
      heat: 'warm',
      roundAppeared: 1,
      source: 'brokered',
      dueDiligence: STANDARD_DD,
    }),
  ];
}

/**
 * Round 2 Deals:
 * F1: Premier Climate Systems — the intended LBO acquisition (premium HVAC, $1,500K EBITDA)
 * F2: Quick Bites Restaurant — the obvious pass (wrong sector, weak quality)
 * F3: Regional Plumbing Plus — reasonable alternative (home services, but not needed)
 */
export function createBSRound2Deals(): Deal[] {
  return [
    makeDeal({
      id: 'bs_f1',
      name: 'Premier Climate Systems',
      sectorId: 'homeServices',
      subType: 'HVAC Services',
      ebitda: 1500,
      revenue: 7500,
      ebitdaMargin: 0.20,
      qualityRating: 3,
      organicGrowthRate: 0.05,
      revenueGrowthRate: 0.05,
      askingMultiple: 3.67,
      heat: 'cold',
      roundAppeared: 2,
      source: 'sourced',
      dueDiligence: GROWING_DD,
    }),
    makeDeal({
      id: 'bs_f2',
      name: 'Quick Bites Restaurants',
      sectorId: 'restaurant',
      subType: 'Fast Casual Chain',
      ebitda: 700,
      revenue: 3889,
      ebitdaMargin: 0.18,
      qualityRating: 2,
      organicGrowthRate: -0.02,
      revenueGrowthRate: -0.02,
      askingMultiple: 5.0,
      heat: 'warm',
      roundAppeared: 2,
      source: 'brokered',
      dueDiligence: WEAK_DD,
    }),
    makeDeal({
      id: 'bs_f3',
      name: 'Regional Plumbing Plus',
      sectorId: 'homeServices',
      subType: 'Plumbing Services',
      ebitda: 1100,
      revenue: 5500,
      ebitdaMargin: 0.20,
      qualityRating: 3,
      organicGrowthRate: 0.03,
      revenueGrowthRate: 0.03,
      askingMultiple: 3.5,
      heat: 'cold',
      roundAppeared: 2,
      source: 'sourced',
      dueDiligence: STANDARD_DD,
    }),
  ];
}

// ── Feature Gating ──

/** Actions that are blocked in Business School mode. */
export const BS_BLOCKED_ACTIONS = new Set([
  'acquire_tuck_in',
  'merge_businesses',
  'designate_platform',
  'buyback',
  'distribute_to_lps',
  'unlock_turnaround_tier',
  'start_turnaround',
  'ipo',
  'add_to_integrated_platform',
]);

/** Check if an action is blocked in Business School mode. */
export function isBSBlocked(action: string): boolean {
  return BS_BLOCKED_ACTIONS.has(action);
}

// ── Checklist Detection ──

/** Year 1 checklist items */
export const BS_YEAR_1_ITEMS: BusinessSchoolChecklistItemId[] = [
  'bs_collect_1', 'bs_improve', 'bs_sell', 'bs_acquire_sn', 'bs_acquire_bd', 'bs_ma_sourcing', 'bs_forge_platform', 'bs_end_year_1',
];

/** Year 2 checklist items */
export const BS_YEAR_2_ITEMS: BusinessSchoolChecklistItemId[] = [
  'bs_collect_2', 'bs_equity', 'bs_acquire_lbo', 'bs_shared_service', 'bs_pay_debt', 'bs_distribute', 'bs_sell_platform',
];

// ── Checklist Labels (for UI) ──

export interface BSChecklistItemInfo {
  id: BusinessSchoolChecklistItemId;
  year: 1 | 2;
  title: string;
  subtitle: string;
  tooltip: string;
}

export const BS_CHECKLIST_INFO: BSChecklistItemInfo[] = [
  // ── Year 1: Build the Platform ──
  {
    id: 'bs_collect_1',
    year: 1,
    title: 'Collect your first cash flow',
    subtitle: 'This happens automatically. Watch the waterfall to see how revenue becomes EBITDA, then gets reduced by capex and taxes. The cash that lands in your treasury is what you get to deploy.',
    tooltip: '',
  },
  {
    id: 'bs_improve',
    year: 1,
    title: 'Improve BrightSpark Electrical',
    subtitle: 'Go to the Portfolio tab and tap on BrightSpark Electrical (the one with 15% margins). Choose "Upgrade Pricing Model" to optimize pricing — it boosts both margins and revenue. Operational improvements are how you create value beyond just buying businesses.',
    tooltip: '',
  },
  {
    id: 'bs_sell',
    year: 1,
    title: 'Sell the IT Staffing business',
    subtitle: 'Go to the Portfolio tab and tap on Metro Staffing Solutions. Hit "Sell" to exit. It\'s in a different sector from your Home Services businesses, so selling it frees up ~$4M you can redeploy into HVAC acquisitions.',
    tooltip: '',
  },
  {
    id: 'bs_acquire_sn',
    year: 1,
    title: 'Acquire an HVAC business (seller note)',
    subtitle: 'Go to the Deals tab and pick one of the HVAC companies. When choosing a deal structure, select the Seller Note option — you pay 40% cash upfront and the seller finances the remaining 60% at ~5% interest.',
    tooltip: '',
  },
  {
    id: 'bs_acquire_bd',
    year: 1,
    title: 'Acquire another HVAC business (bank debt)',
    subtitle: 'Go to the Deals tab and buy the other HVAC company. This time, choose the Bank Debt structure — you put down 35% cash and the bank finances 65% of the purchase price. You\'ll see the debt service hit your cash flow next year.',
    tooltip: '',
  },
  {
    id: 'bs_ma_sourcing',
    year: 1,
    title: 'Activate M&A Sourcing',
    subtitle: 'Go to the Shared Services tab and upgrade to M&A Sourcing Tier 1. This costs $800K upfront plus $350K/year, but unlocks 3 acquisitions per round (up from 2) and improves your deal quality in future rounds.',
    tooltip: '',
  },
  {
    id: 'bs_forge_platform',
    year: 1,
    title: 'Forge the Home Services Platform',
    subtitle: 'In the Portfolio tab, scroll down to the "Available Integrations" section. Select the Multi-Trade Home Services Platform recipe and choose which businesses to include — you need at least 2 different sub-types (HVAC, Plumbing, Electrical). This triggers margin expansion, growth boosts, and a higher exit multiple. In the full game, you\'ll discover many different platform recipes based on real-world examples across every sector.',
    tooltip: '',
  },
  {
    id: 'bs_end_year_1',
    year: 1,
    title: 'End Year 1',
    subtitle: 'Click "End Round" to advance to Year 2. Your businesses will grow organically, and you\'ll collect cash flow again — this time with debt service payments coming off the top.',
    tooltip: '',
  },
  // ── Year 2: Optimize & Exit ──
  {
    id: 'bs_collect_2',
    year: 2,
    title: 'Collect Year 2 cash flow',
    subtitle: 'This happens automatically. Notice the debt service in the waterfall — your seller note and bank debt payments now come off the top before you get your cash. This is the real cost of leverage.',
    tooltip: '',
  },
  {
    id: 'bs_equity',
    year: 2,
    title: 'Issue equity to raise capital',
    subtitle: 'Go to the Capital tab and issue equity. Raise some capital to fund your next moves. This dilutes your ownership — the more you raise, the more you dilute — but gives you cash for the LBO, distributions, and more.',
    tooltip: '',
  },
  {
    id: 'bs_acquire_lbo',
    year: 2,
    title: 'Execute an LBO acquisition',
    subtitle: 'Go to the Deals tab and buy "Premier Climate Systems" (the HVAC company). Choose the LBO structure — you put down just 25% cash while 75% is financed through a mix of seller note and bank debt. Maximum leverage.',
    tooltip: '',
  },
  {
    id: 'bs_pay_debt',
    year: 2,
    title: 'Pay down debt early',
    subtitle: 'Go to the Capital tab and make an extra payment on one of your bank loans. Paying down debt early reduces your interest costs and improves your balance sheet health.',
    tooltip: '',
  },
  {
    id: 'bs_shared_service',
    year: 2,
    title: 'Unlock a shared service',
    subtitle: 'Go to the Shared Services tab and unlock Procurement ($710K). This centralizes purchasing across your portfolio and reduces capex rates by 15% — saving real money every year. In the full game, you can unlock up to 5 shared services including Finance, HR, Marketing, and Technology.',
    tooltip: '',
  },
  {
    id: 'bs_distribute',
    year: 2,
    title: 'Make a shareholder distribution',
    subtitle: 'Go to the Capital tab and make a distribution. This pays cash directly to shareholders (including you). It\'s how holdco owners take money off the table while continuing to grow the portfolio.',
    tooltip: '',
  },
  {
    id: 'bs_sell_platform',
    year: 2,
    title: 'Sell the platform',
    subtitle: 'Go to the Portfolio tab and sell your integrated Home Services platform. Watch how the platform\'s multiple expansion, margin improvements, and scale translate into a massive exit price. This is the payoff of everything you\'ve built.',
    tooltip: '',
  },
];

// ── Curated Events ──

/** Year 1: Bull market — positive event that teaches market conditions affect the portfolio */
export const BS_YEAR_1_EVENT: GameEvent = {
  id: 'bs_event_bull_market',
  type: 'global_bull_market',
  title: 'Bull Market',
  description: 'Investor optimism is running high. Valuations are up across the board — a great time to be building a portfolio.',
  effect: 'All businesses see +5-10% revenue growth and improved exit multiples this year.',
  tip: 'Bull markets are great for exits, but don\'t overpay for acquisitions when everyone is euphoric.',
  tipSource: 'Business School',
};

/** Year 2: Quiet year with educational framing */
export const BS_YEAR_2_EVENT: GameEvent = {
  id: 'bs_event_quiet_year',
  type: 'global_quiet',
  title: 'Quiet Year',
  description: 'The markets are calm this year — no major disruptions. In the real game, you won\'t always be this lucky.',
  effect: 'No market impact. Your businesses operate normally.',
  tip: 'In a full game, expect recessions, credit crunches, interest rate swings, and portfolio crises. Keeping cash reserves and avoiding excessive leverage is how holdco builders survive the downturns.',
  tipSource: 'Business School',
};

/** Get the curated B-School event for a given round */
export function getBSEvent(round: number): GameEvent {
  return round === 1 ? BS_YEAR_1_EVENT : BS_YEAR_2_EVENT;
}
