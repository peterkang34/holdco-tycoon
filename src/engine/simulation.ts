import {
  GameState,
  Business,
  GameEvent,
  EventImpact,
  EventChoice,
  ExitValuation,
  IntegratedPlatform,
  SectorFocusBonus,
  SectorFocusGroup,
  SectorFocusTier,
  OperationalImprovementType,
  Metrics,
  HistoricalMetrics,
  randomInRange,
  randomInt,
  pickRandom,
  formatMoney,
  GameDuration,
} from './types';
import type { SeededRng } from './rng';
import { SECTORS } from '../data/sectors';
import { GLOBAL_EVENTS, PORTFOLIO_EVENTS, SECTOR_EVENTS, SectorEventDefinition } from '../data/events';
import {
  calculateSizeTierPremium,
  calculateDeRiskingPremium,
  generateBuyerProfile,
  generateValuationCommentary,
} from './buyers';
import { calculateDistressLevel, getDistressRestrictions } from './distress';
import { getMASourcingAnnualCost } from '../data/sharedServices';
import {
  clampMargin,
  capGrowthRate,
  applyEbitdaFloor,
} from './helpers';
import {
  SELLER_DECEPTION_MAX_AGE,
  SELLER_DECEPTION_REVENUE_HIT,
  SELLER_DECEPTION_QUALITY_DROP,
  SELLER_DECEPTION_TURNAROUND_COST_PCT,
  SELLER_DECEPTION_TURNAROUND_RESTORE_CHANCE,
  SELLER_DECEPTION_FIRE_SALE_PCT,
  WORKING_CAPITAL_CRUNCH_MAX_AGE,
  WORKING_CAPITAL_CRUNCH_MIN,
  WORKING_CAPITAL_CRUNCH_MAX,
  WORKING_CAPITAL_CRUNCH_REVENUE_PENALTY,
  WORKING_CAPITAL_CRUNCH_PENALTY_ROUNDS,
  CONSOLIDATION_BOOM_DYNAMIC_MIN_OPCOS,
  CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS,
  KEY_MAN_QUALITY_DROP,
  KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT,
  KEY_MAN_GOLDEN_HANDCUFFS_RESTORE_CHANCE,
  KEY_MAN_SUCCESSION_COST_MIN,
  KEY_MAN_SUCCESSION_COST_MAX,
  KEY_MAN_SUCCESSION_ROUNDS,
  EARNOUT_SETTLE_PCT,
  EARNOUT_FIGHT_LEGAL_COST_MIN,
  EARNOUT_FIGHT_LEGAL_COST_MAX,
  EARNOUT_FIGHT_WIN_CHANCE,
  EARNOUT_RENEGOTIATE_PCT,
  SUPPLIER_SHIFT_MARGIN_HIT,
  SUPPLIER_ABSORB_RECOVERY_PPT,
  SUPPLIER_SWITCH_COST_MIN,
  SUPPLIER_SWITCH_COST_MAX,
  SUPPLIER_SWITCH_REVENUE_PENALTY,
  SUPPLIER_VERTICAL_COST,
  SUPPLIER_VERTICAL_BONUS_PPT,
  SUPPLIER_VERTICAL_MIN_SAME_SECTOR,
  CONSOLIDATION_BOOM_PROB,
  CONSOLIDATION_BOOM_SECTORS,
  EARNOUT_EXPIRATION_YEARS,
  INTEGRATION_DRAG_DECAY_RATE,
  INTEGRATION_DRAG_EPSILON,
  DEAL_INFLATION_CRISIS_DURATION,
  SUCCESSION_MIN_YEARS_HELD,
  SUCCESSION_INVEST_COST_MIN,
  SUCCESSION_INVEST_COST_MAX,
  SUCCESSION_INVEST_RESTORE,
  SUCCESSION_PROMOTE_RESTORE,
  SUCCESSION_PROMOTE_HR_BONUS,
  SUCCESSION_PROMOTE_PLATFORM_BONUS,
  SUCCESSION_QUALITY_DROP,
  SUCCESSION_SELL_DISCOUNT,
  SUCCESSION_PROB,
} from '../data/gameConfig';
import { getPlatformMultipleExpansion, getPlatformRecessionModifier } from './platforms';
import { getTurnaroundExitPremium } from './turnarounds';
import { getTurnaroundTierAnnualCost, getProgramById } from '../data/turnaroundPrograms';

export const TAX_RATE = 0.30;

// Per-type exit premiums for operational improvements (module-level to avoid re-allocation)
const IMPROVEMENT_EXIT_PREMIUMS: Record<OperationalImprovementType, number> = {
  operating_playbook: 0.15,
  pricing_model: 0.15,
  service_expansion: 0.15,
  fix_underperformance: 0.15,
  recurring_revenue_conversion: 0.50,
  management_professionalization: 0.30,
  digital_transformation: 0.15,
};

// Calculate exit valuation for a business with full breakdown
export function calculateExitValuation(
  business: Business,
  currentRound: number,
  lastEventType?: string,
  portfolioContext?: { totalPlatformEbitda?: number },
  integratedPlatforms: IntegratedPlatform[] = []
): ExitValuation {
  // Start with acquisition multiple as baseline
  const baseMultiple = business.acquisitionMultiple;

  // C-1: Guard against division by zero when acquisitionEbitda is 0
  const ebitdaGrowth = business.acquisitionEbitda > 0
    ? (business.ebitda - business.acquisitionEbitda) / business.acquisitionEbitda
    : 0;
  // Expanded growth premium range: declining -1.0x to exceptional +2.5x
  let growthPremium: number;
  if (ebitdaGrowth > 0) {
    growthPremium = Math.min(2.5, ebitdaGrowth * 0.8);
  } else {
    growthPremium = Math.max(-1.0, ebitdaGrowth * 0.5);
  }

  // Quality premium: higher quality businesses command higher multiples
  const qualityPremium = (business.qualityRating - 3) * 0.4;

  // Platform premium: logarithmic curve — scale 5 ~1.0x, scale 10 ~1.4x, scale 19 ~1.7x
  const platformPremium = business.isPlatform && business.platformScale > 0
    ? Math.log2(business.platformScale + 1) * 0.4
    : 0;

  // Hold period premium: longer holds show stability (max +0.5x for 5+ years)
  const yearsHeld = currentRound - business.acquisitionRound;
  const holdPremium = Math.min(0.5, yearsHeld * 0.1);

  // Improvements premium: per-type lookup, capped at 1.0x total
  const improvementsPremium = Math.min(
    1.0,
    business.improvements.reduce((sum, imp) => sum + (IMPROVEMENT_EXIT_PREMIUMS[imp.type] || 0.15), 0)
  );

  // Market conditions modifier
  let marketModifier = 0;
  if (lastEventType === 'global_bull_market') marketModifier = 0.5;
  if (lastEventType === 'global_recession') marketModifier = -0.5;

  // Size tier premium — the big new driver
  // Use platform consolidated EBITDA if available, otherwise business standalone
  const effectiveEbitda = portfolioContext?.totalPlatformEbitda ?? business.ebitda;
  const sizeTierResult = calculateSizeTierPremium(effectiveEbitda);
  // Net out the premium that was already "paid for" at acquisition (prevents day-1 paper gains)
  const sizeTierPremium = sizeTierResult.premium - (business.acquisitionSizeTierPremium ?? 0);
  const buyerPoolTier = sizeTierResult.tier;

  // De-risking premium — composite de-risking factor
  const deRiskingPremium = calculateDeRiskingPremium(business);

  // Rule of 40 Premium (SaaS/education only)
  let ruleOf40Premium = 0;
  if (business.sectorId === 'saas' || business.sectorId === 'education') {
    const ro40 = (business.revenueGrowthRate * 100) + (business.ebitdaMargin * 100);
    if (ro40 >= 50) ruleOf40Premium = 1.5;
    else if (ro40 >= 40) ruleOf40Premium = 0.5 + (ro40 - 40) / 10;
    else if (ro40 < 25) ruleOf40Premium = -0.3;
  }

  // Margin Expansion Premium (all sectors)
  const marginDelta = business.ebitdaMargin - business.acquisitionMargin;
  let marginExpansionPremium = 0;
  if (marginDelta >= 0.10) marginExpansionPremium = 0.3;
  else if (marginDelta >= 0.05) marginExpansionPremium = 0.1 + (marginDelta - 0.05) * 4;
  else if (marginDelta <= -0.05) marginExpansionPremium = -0.2;

  // Merger premium — well-balanced mergers command a premium from buyers
  let mergerPremium = 0;
  if (business.wasMerged && business.mergerBalanceRatio) {
    mergerPremium = business.mergerBalanceRatio <= 2.0 ? 0.5
      : business.mergerBalanceRatio <= 3.0 ? 0.4 : 0.3;
  }

  // Integrated platform premium — businesses in forged platforms command higher multiples
  const integratedPlatformPremium = getPlatformMultipleExpansion(business, integratedPlatforms);

  // Turnaround premium — businesses that improved 2+ quality tiers command higher multiples
  const turnaroundPremium = getTurnaroundExitPremium(business);

  // Seasoning: recently acquired businesses haven't been proven under new ownership
  // Premiums ramp from 0% to 100% over 2 years of ownership
  const seasoningMultiplier = Math.min(1.0, yearsHeld / 2);

  // Sum EARNED premiums (growth, quality, improvements, etc.) — subject to aggregate cap
  const rawEarnedPremiums = growthPremium + qualityPremium + platformPremium + holdPremium +
    improvementsPremium + marketModifier + sizeTierPremium + deRiskingPremium +
    ruleOf40Premium + marginExpansionPremium + mergerPremium + turnaroundPremium;

  // Cap earned premiums to prevent runaway multiples
  // Floor scales with platform scale — platforms get more headroom
  const platformHeadroom = business.isPlatform ? business.platformScale * 0.3 : 0;
  const premiumCap = Math.max(10 + platformHeadroom, baseMultiple * 1.5);
  const cappedEarnedPremiums = rawEarnedPremiums > 0
    ? Math.min(rawEarnedPremiums, premiumCap)
    : rawEarnedPremiums;

  // Integrated platform premium is STRUCTURAL (from recipe forging cost), not earned —
  // apply after cap so it never squeezes earned premiums out of headroom.
  // Without this, a star performer's growth/quality premiums get cut when platform
  // premium pushes total over the cap, making individual sale > platform sale.
  const totalPremiums = cappedEarnedPremiums + integratedPlatformPremium;

  // Calculate exit multiple (premiums scaled by seasoning, raw premiums preserved for display)
  const totalMultiple = Math.max(
    2.0, // Absolute floor - distressed sale
    baseMultiple + totalPremiums * seasoningMultiplier
  );

  const exitPrice = Math.max(0, Math.round(business.ebitda * totalMultiple));

  // Net proceeds after debt payoff (includes remaining earn-out obligation)
  const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + business.earnoutRemaining;
  const netProceeds = Math.max(0, exitPrice - debtPayoff);

  // Generate valuation commentary
  const commentary = generateValuationCommentary(
    business, buyerPoolTier, sizeTierPremium, deRiskingPremium, effectiveEbitda, totalMultiple
  );

  return {
    baseMultiple,
    growthPremium,
    qualityPremium,
    platformPremium,
    holdPremium,
    improvementsPremium,
    marketModifier,
    sizeTierPremium,
    acquisitionSizeTierPremium: business.acquisitionSizeTierPremium ?? 0,
    mergerPremium,
    integratedPlatformPremium,
    turnaroundPremium,
    deRiskingPremium,
    ruleOf40Premium,
    marginExpansionPremium,
    buyerPoolTier,
    totalMultiple,
    exitPrice,
    netProceeds,
    ebitdaGrowth,
    yearsHeld,
    commentary,
  };
}

export function calculateAnnualFcf(
  business: Business,
  sharedServicesCapexReduction: number = 0,
  sharedServicesCashConversionBonus: number = 0
): number {
  const sector = SECTORS[business.sectorId];
  const annualEbitda = business.ebitda;

  // Capex with shared services reduction
  const effectiveCapexRate = sector.capexRate * (1 - sharedServicesCapexReduction);
  const capex = annualEbitda * effectiveCapexRate;

  // Pre-tax FCF: EBITDA - CapEx only (tax computed at portfolio level)
  let fcf = annualEbitda - capex;

  // Apply cash conversion bonus
  fcf *= 1 + sharedServicesCashConversionBonus;

  return Math.round(fcf);
}

export function calculatePortfolioFcf(
  businesses: Business[],
  sharedServicesCapexReduction: number = 0,
  sharedServicesCashConversionBonus: number = 0,
  holdcoDebt: number = 0,
  holdcoInterestRate: number = 0,
  sharedServicesCost: number = 0
): number {
  const preTaxFcf = businesses
    .filter(b => b.status === 'active')
    .reduce(
      (total, b) =>
        total + calculateAnnualFcf(b, sharedServicesCapexReduction, sharedServicesCashConversionBonus),
      0
    );

  // Portfolio-level tax
  const taxBreakdown = calculatePortfolioTax(businesses, holdcoDebt, holdcoInterestRate, sharedServicesCost);

  return preTaxFcf - taxBreakdown.taxAmount;
}

export interface PortfolioTaxBreakdown {
  grossEbitda: number;       // Sum of positive EBITDA businesses only
  lossOffset: number;        // Absolute value of negative EBITDA businesses
  netEbitda: number;         // grossEbitda - lossOffset
  holdcoInterest: number;
  opcoInterest: number;
  totalInterest: number;
  sharedServicesCost: number;
  taxableIncome: number;     // max(0, netEbitda - totalInterest - sharedServicesCost)
  taxAmount: number;         // taxableIncome × 0.30
  effectiveTaxRate: number;  // taxAmount / grossEbitda (0 if no gross EBITDA)
  interestTaxShield: number;
  sharedServicesTaxShield: number;
  lossOffsetTaxShield: number;
  totalTaxSavings: number;   // naiveTax - taxAmount
}

export function calculatePortfolioTax(
  businesses: Business[],
  holdcoDebt: number = 0,
  holdcoInterestRate: number = 0,
  sharedServicesCost: number = 0
): PortfolioTaxBreakdown {
  const activeBusinesses = businesses.filter(b => b.status === 'active');

  // Separate positive and negative EBITDA
  let grossEbitda = 0;
  let lossOffset = 0;
  for (const b of activeBusinesses) {
    if (b.ebitda >= 0) {
      grossEbitda += b.ebitda;
    } else {
      lossOffset += Math.abs(b.ebitda);
    }
  }

  const netEbitda = grossEbitda - lossOffset;

  // Interest calculations
  const holdcoInterest = Math.round(holdcoDebt * holdcoInterestRate);
  const opcoInterest = activeBusinesses.reduce(
    (sum, b) => sum + Math.round(b.sellerNoteBalance * b.sellerNoteRate)
               + Math.round(b.bankDebtBalance * (b.bankDebtRate || 0)),
    0
  );
  const totalInterest = holdcoInterest + opcoInterest;

  // Taxable income after all deductions (floored at 0)
  const taxableIncome = Math.max(0, netEbitda - totalInterest - sharedServicesCost);
  const taxAmount = Math.round(taxableIncome * TAX_RATE);

  // Naive tax (what you'd pay without any deductions)
  const naiveTax = Math.round(Math.max(0, grossEbitda) * TAX_RATE);

  // Effective tax rate
  const effectiveTaxRate = grossEbitda > 0 ? taxAmount / grossEbitda : 0;

  // Calculate individual shields by ordered deduction from grossEbitda
  // Order: losses first, then interest, then shared services
  let remaining = Math.max(0, grossEbitda);

  // Loss offset shield
  const lossDeduction = Math.min(remaining, lossOffset);
  const lossOffsetTaxShield = Math.round(lossDeduction * TAX_RATE);
  remaining -= lossDeduction;

  // Interest shield
  const interestDeduction = Math.min(remaining, totalInterest);
  const interestTaxShield = Math.round(interestDeduction * TAX_RATE);
  remaining -= interestDeduction;

  // Shared services shield
  const ssDeduction = Math.min(remaining, sharedServicesCost);
  const sharedServicesTaxShield = Math.round(ssDeduction * TAX_RATE);

  // Total savings (use naive - actual to avoid rounding drift)
  const totalTaxSavings = naiveTax - taxAmount;

  return {
    grossEbitda,
    lossOffset,
    netEbitda,
    holdcoInterest,
    opcoInterest,
    totalInterest,
    sharedServicesCost,
    taxableIncome,
    taxAmount,
    effectiveTaxRate,
    interestTaxShield,
    sharedServicesTaxShield,
    lossOffsetTaxShield,
    totalTaxSavings,
  };
}

export function calculateSharedServicesBenefits(state: GameState): {
  capexReduction: number;
  cashConversionBonus: number;
  growthBonus: number;
  talentRetentionBonus: number;
  talentGainBonus: number;
  marginDefense: number; // ppt offset to margin drift from shared services
} {
  const activeServices = state.sharedServices.filter(s => s.active);
  const opcoCount = state.businesses.filter(b => b.status === 'active').length;

  // L-10: Smooth ramp instead of binary cliff at 5 opcos
  // 1-2 opcos: 1.0x, 3: 1.05x, 4: 1.1x, 5: 1.15x, 6+: 1.2x
  const scaleMultiplier = opcoCount >= 6 ? 1.2 : opcoCount >= 3 ? 1.0 + (opcoCount - 2) * 0.05 : 1.0;

  let capexReduction = 0;
  let cashConversionBonus = 0;
  let growthBonus = 0;
  let talentRetentionBonus = 0;
  let talentGainBonus = 0;
  let marginDefense = 0;

  for (const service of activeServices) {
    switch (service.type) {
      case 'finance_reporting':
        cashConversionBonus += 0.05 * scaleMultiplier;
        marginDefense += 0.001 * scaleMultiplier; // +0.10 ppt/yr margin defense
        break;
      case 'recruiting_hr':
        talentRetentionBonus += 0.5 * scaleMultiplier;
        talentGainBonus += 0.3 * scaleMultiplier;
        marginDefense += 0.0015 * scaleMultiplier; // +0.15 ppt/yr margin defense
        break;
      case 'procurement':
        capexReduction += 0.15 * scaleMultiplier;
        marginDefense += 0.0025 * scaleMultiplier; // +0.25 ppt/yr margin defense
        break;
      case 'marketing_brand':
        growthBonus += 0.015 * scaleMultiplier;
        break;
      case 'technology_systems':
        growthBonus += 0.005 * scaleMultiplier; // +0.5% revenue growth
        marginDefense += 0.002 * scaleMultiplier; // +0.20 ppt/yr margin defense
        break;
    }
  }

  return {
    capexReduction,
    cashConversionBonus,
    growthBonus,
    talentRetentionBonus,
    talentGainBonus,
    marginDefense,
  };
}

export function calculateSectorFocusBonus(businesses: Business[]): SectorFocusBonus | null {
  const activeBusinesses = businesses.filter(b => b.status === 'active');
  if (activeBusinesses.length < 2) return null;

  // Count businesses by focus group
  const focusGroupCounts: Record<string, number> = {};

  for (const business of activeBusinesses) {
    const sector = SECTORS[business.sectorId];
    for (const group of sector.sectorFocusGroup) {
      focusGroupCounts[group] = (focusGroupCounts[group] || 0) + 1;
    }
  }

  // Find the highest concentration
  let maxGroup = '';
  let maxCount = 0;

  for (const [group, count] of Object.entries(focusGroupCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxGroup = group;
    }
  }

  if (maxCount < 2) return null;

  let tier: SectorFocusTier;
  if (maxCount >= 4) tier = 3;
  else if (maxCount >= 3) tier = 2;
  else tier = 1;

  return {
    focusGroup: maxGroup as SectorFocusGroup, // M-2: Proper type cast instead of `as any`
    tier,
    opcoCount: maxCount,
  };
}

export function getSectorFocusEbitdaBonus(tier: SectorFocusTier): number {
  switch (tier) {
    case 1:
      return 0.02;
    case 2:
      return 0.04;
    case 3:
      return 0.05; // Reduced from 0.07 — concentration risk offsets some upside
    default:
      return 0;
  }
}

export function getSectorFocusMultipleDiscount(tier: SectorFocusTier): number {
  switch (tier) {
    case 2:
      return 0.3;
    case 3:
      return 0.5;
    default:
      return 0;
  }
}

export function applyOrganicGrowth(
  business: Business,
  sharedServicesGrowthBonus: number,
  sectorFocusBonus: number,
  inflationActive: boolean,
  concentrationCount?: number, // Number of opcos in same focus group — drives concentration risk
  diversificationBonus?: number, // Growth bonus from portfolio diversification (4+ unique sectors)
  currentRound?: number, // For progressive onboarding of margin drift
  sharedServicesMarginDefense?: number, // ppt offset to margin drift from shared services
  maxRounds?: number, // 20 or 10 — scales margin drift start
  rng?: SeededRng,
  duration?: GameDuration, // For integration drag decay rate
): Business {
  const sector = SECTORS[business.sectorId];

  // --- Revenue Growth ---
  const cappedGrowthRate = capGrowthRate(business.revenueGrowthRate);

  let revenueGrowth = cappedGrowthRate;

  // Sector volatility with concentration risk
  const concentrationMultiplier = (concentrationCount && concentrationCount >= 4)
    ? 1 + (concentrationCount - 3) * 0.25
    : 1;
  revenueGrowth += sector.volatility * ((rng ? rng.next() : Math.random()) * 2 - 1) * concentrationMultiplier;

  // Shared services bonus (revenue portion)
  revenueGrowth += sharedServicesGrowthBonus;

  // Sector-specific shared services bonus
  if (
    (business.sectorId === 'agency' || business.sectorId === 'consumer') &&
    sharedServicesGrowthBonus > 0
  ) {
    revenueGrowth += 0.01;
  }

  // Sector focus bonus
  revenueGrowth += sectorFocusBonus;

  // Diversification bonus
  if (diversificationBonus && diversificationBonus > 0) {
    revenueGrowth += diversificationBonus;
  }

  // Competitive position modifier: leaders grow faster, commoditized face headwinds
  if (business.dueDiligence?.competitivePosition === 'leader') {
    revenueGrowth += 0.015; // +1.5% annual growth edge
  } else if (business.dueDiligence?.competitivePosition === 'commoditized') {
    revenueGrowth -= 0.015; // -1.5% annual drag from price competition
  }

  // Integration penalty
  if (business.integrationRoundsRemaining > 0) {
    revenueGrowth -= (0.03 + (rng ? rng.next() : Math.random()) * 0.05);
  }

  // Inflation drags revenue growth
  if (inflationActive) {
    revenueGrowth -= 0.03;
  }

  // Integration failure growth drag (decaying)
  if (business.integrationGrowthDrag && business.integrationGrowthDrag < 0) {
    revenueGrowth += business.integrationGrowthDrag;
  }

  const newRevenue = Math.round(business.revenue * (1 + revenueGrowth));

  // --- Margin Drift ---
  // Progressive onboarding: margins are static early, drift begins at ~20% through the game
  const marginDriftStart = Math.max(2, Math.ceil((maxRounds ?? 20) * 0.20));
  let newMargin = business.ebitdaMargin;
  if (currentRound && currentRound >= marginDriftStart) {
    let marginChange = business.marginDriftRate;

    // Sector margin volatility (random noise)
    marginChange += sector.marginVolatility * ((rng ? rng.next() : Math.random()) * 2 - 1);

    // Shared services margin defense (reduces natural drift)
    if (sharedServicesMarginDefense && sharedServicesMarginDefense > 0) {
      marginChange += sharedServicesMarginDefense;
    }

    // Quality-based mean reversion — margins drift toward sector midpoint
    const sectorMidMargin = (sector.baseMargin[0] + sector.baseMargin[1]) / 2;
    if (business.ebitdaMargin > sectorMidMargin + 0.10) {
      marginChange -= 0.005; // slight headwind for very high margins
    }

    newMargin = clampMargin(business.ebitdaMargin + marginChange);
  }

  // --- Derive EBITDA ---
  let newEbitda = Math.round(newRevenue * newMargin);

  // Floor at EBITDA_FLOOR_PCT of acquisition EBITDA
  const floored = applyEbitdaFloor(newEbitda, newRevenue, newMargin, business.acquisitionEbitda);
  newEbitda = floored.ebitda;
  newMargin = floored.margin;

  // Update peaks
  const newPeakEbitda = Math.max(business.peakEbitda, newEbitda);
  const newPeakRevenue = Math.max(business.peakRevenue, newRevenue);

  // Decrease integration period
  const newIntegration = Math.max(0, business.integrationRoundsRemaining - 1);

  // Cap stored growth rates
  const newGrowthRate = capGrowthRate(business.revenueGrowthRate);

  // Decay integration growth drag for next year
  const decayRate = INTEGRATION_DRAG_DECAY_RATE[duration ?? 'standard'];
  let newDrag = (business.integrationGrowthDrag ?? 0) * (1 - decayRate);
  if (Math.abs(newDrag) < INTEGRATION_DRAG_EPSILON) newDrag = 0;

  return {
    ...business,
    revenue: newRevenue,
    ebitdaMargin: newMargin,
    ebitda: newEbitda,
    peakEbitda: newPeakEbitda,
    peakRevenue: newPeakRevenue,
    integrationRoundsRemaining: newIntegration,
    organicGrowthRate: newGrowthRate,
    revenueGrowthRate: newGrowthRate,
    integrationGrowthDrag: newDrag,
  };
}

export function generateEvent(state: GameState, rng?: SeededRng): GameEvent | null {
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const sharedServicesBenefits = calculateSharedServicesBenefits(state);

  // Roll for global event
  const globalRoll = rng ? rng.next() : Math.random();
  let cumulativeProb = 0;

  for (const eventDef of GLOBAL_EVENTS) {
    cumulativeProb += eventDef.probability;
    if (globalRoll < cumulativeProb) {
      const isQuickGame = state.maxRounds <= 10;
      let effect = eventDef.effectDescription;
      if (eventDef.type === 'global_credit_tightening') {
        const rounds = isQuickGame ? 1 : 2;
        effect = `No debt-financed acquisitions for ${rounds} round${rounds === 1 ? '' : 's'}`;
      }
      if (eventDef.type === 'global_financial_crisis') {
        const ctRounds = isQuickGame ? 1 : 2;
        effect = `Exit multiples -1.0x. Interest rate +2%. Existing bank debt rates +1.5%. Credit tightening for ${ctRounds} round${ctRounds === 1 ? '' : 's'}. But: 3-4 distressed deals appear at 30-50% off.`;
      }
      return {
        id: `event_${state.round}_${eventDef.type}`,
        type: eventDef.type,
        title: eventDef.title,
        description: eventDef.description,
        effect,
        tip: eventDef.tip,
        tipSource: eventDef.tipSource,
      };
    }
  }

  // Roll for portfolio event
  if (activeBusinesses.length > 0) {
    const portfolioRoll = rng ? rng.next() : Math.random();
    cumulativeProb = 0;

    for (const eventDef of PORTFOLIO_EVENTS) {
      let adjustedProb = eventDef.probability;

      // Trigger conditions for new portfolio events
      if (eventDef.type === 'portfolio_referral_deal' && activeBusinesses.length < 4) {
        adjustedProb = 0; // Need 4+ active businesses
      }
      if (eventDef.type === 'portfolio_equity_demand') {
        const eligible = activeBusinesses.filter(b => b.dueDiligence.operatorQuality === 'strong' && b.qualityRating >= 4);
        if (eligible.length === 0) adjustedProb = 0;
      }
      if (eventDef.type === 'portfolio_seller_note_renego') {
        const eligible = activeBusinesses.filter(b => b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining >= 2);
        if (eligible.length === 0) adjustedProb = 0;
      }
      if (eventDef.type === 'mbo_proposal') {
        const eligible = activeBusinesses.filter(b => b.qualityRating >= 4 && (state.round - b.acquisitionRound) >= 3);
        if (eligible.length === 0) adjustedProb = 0;
      }
      // Key-Man Risk: quality >= 4 AND no active turnaround AND 2-round cooldown after turnaround completion
      if (eventDef.type === 'portfolio_key_man_risk') {
        const activeTurnaroundBizIds = new Set((state.activeTurnarounds || []).filter(t => t.status === 'active').map(t => t.businessId));
        const recentlyCompletedBizIds = new Set((state.activeTurnarounds || []).filter(t => t.status === 'completed' && t.endRound !== undefined && state.round - t.endRound < 2).map(t => t.businessId));
        const eligible = activeBusinesses.filter(b => b.qualityRating >= 4 && !activeTurnaroundBizIds.has(b.id) && !recentlyCompletedBizIds.has(b.id));
        if (eligible.length === 0) adjustedProb = 0;
      }
      // Earn-Out Dispute: earnoutRemaining > 0 AND revenue dropped >5% from acquisition AND 3-round cooldown
      if (eventDef.type === 'portfolio_earnout_dispute') {
        const eligible = activeBusinesses.filter(b =>
          b.earnoutRemaining > 0 && b.acquisitionRevenue > 0 &&
          (b.revenue - b.acquisitionRevenue) / b.acquisitionRevenue < -0.05 &&
          (!b.earnoutDisputeRound || state.round - b.earnoutDisputeRound >= 3)
        );
        adjustedProb = eligible.length > 0 ? 0.04 : 0; // probability-gated by eligibility
      }
      // Supplier Shift: ebitdaMargin below sector median
      if (eventDef.type === 'portfolio_supplier_shift') {
        const eligible = activeBusinesses.filter(b => {
          const sector = SECTORS[b.sectorId];
          const sectorMedianMargin = (sector.baseMargin[0] + sector.baseMargin[1]) / 2;
          return b.ebitdaMargin < sectorMedianMargin;
        });
        if (eligible.length === 0) adjustedProb = 0;
      }
      // Seller Deception: recently acquired businesses, exclude all_cash structures
      if (eventDef.type === 'portfolio_seller_deception') {
        const eligible = activeBusinesses.filter(b =>
          (state.round - b.acquisitionRound) <= SELLER_DECEPTION_MAX_AGE &&
          b.acquisitionRound > 0 // not the starting business
        );
        if (eligible.length === 0) {
          adjustedProb = 0;
        } else {
          // all_cash structures have zero debt — these get excluded (more diligence implied)
          const nonCashEligible = eligible.filter(b =>
            b.sellerNoteBalance > 0 || b.bankDebtBalance > 0 || b.earnoutRemaining > 0 || b.rolloverEquityPct > 0
          );
          if (nonCashEligible.length === 0) adjustedProb = 0;
        }
      }
      // Working Capital Crunch: businesses acquired in the previous round
      if (eventDef.type === 'portfolio_working_capital_crunch') {
        const eligible = activeBusinesses.filter(b =>
          (state.round - b.acquisitionRound) === WORKING_CAPITAL_CRUNCH_MAX_AGE
        );
        if (eligible.length === 0) {
          adjustedProb = 0;
        } else {
          // 1.5x probability for construction, manufacturing, industrial sectors
          const hasHighWCNeeds = eligible.some(b =>
            b.sectorId === 'industrial' || b.sectorId === 'homeServices' || b.sectorId === 'distribution'
          );
          if (hasHighWCNeeds) adjustedProb *= 1.5;
        }
      }

      // Management Succession: 20yr mode, 8+ years held, Q3+, not resolved
      if (eventDef.type === 'portfolio_management_succession') {
        if (state.duration !== 'standard') {
          adjustedProb = 0;
        } else {
          const eligible = activeBusinesses.filter(b =>
            (state.round - b.acquisitionRound) >= SUCCESSION_MIN_YEARS_HELD &&
            b.qualityRating >= 3 &&
            !b.successionResolved
          );
          adjustedProb = eligible.length > 0 ? SUCCESSION_PROB : 0;
        }
      }

      // Adjust talent events based on shared services
      // H-1: Clamp adjusted probabilities to prevent exceeding 1.0
      if (eventDef.type === 'portfolio_talent_leaves') {
        adjustedProb *= Math.max(0, 1 - sharedServicesBenefits.talentRetentionBonus);
      } else if (eventDef.type === 'portfolio_star_joins') {
        adjustedProb *= 1 + sharedServicesBenefits.talentGainBonus;
      }

      cumulativeProb += adjustedProb;
      // H-1: Cap cumulative probability at 1.0
      if (portfolioRoll < Math.min(1.0, cumulativeProb)) {
        // Select the right affected business based on event type
        let affectedBusiness = pickRandom(activeBusinesses, rng)!;
        let choices: EventChoice[] | undefined;

        if (eventDef.type === 'portfolio_equity_demand') {
          const eligible = activeBusinesses.filter(b => b.dueDiligence.operatorQuality === 'strong' && b.qualityRating >= 4);
          affectedBusiness = pickRandom(eligible, rng) || affectedBusiness;
          const dilution = randomInt(20, 30, rng);
          choices = [
            { label: `Grant Equity (${dilution} shares)`, description: `Dilute ${dilution} shares, +2% growth, +1ppt margin`, action: 'grantEquityDemand', variant: 'positive' },
            { label: 'Decline', description: '60% chance talent leaves', action: 'declineEquityDemand', variant: 'negative' },
          ];
        } else if (eventDef.type === 'portfolio_seller_note_renego') {
          const eligible = activeBusinesses.filter(b => b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining >= 2);
          affectedBusiness = pickRandom(eligible, rng) || affectedBusiness;
          const discountRate = 0.70 + (rng ? rng.next() : Math.random()) * 0.10; // 70-80%
          const discountAmt = Math.round(affectedBusiness!.sellerNoteBalance * discountRate);
          choices = [
            { label: `Pay Early (${formatMoney(discountAmt)})`, description: `Pay ${Math.round(discountRate * 100)}% of remaining balance now`, action: 'acceptSellerNoteRenego', variant: 'positive' },
            { label: 'Decline', description: 'Note continues normally', action: 'declineSellerNoteRenego', variant: 'neutral' },
          ];
        } else if (eventDef.type === 'mbo_proposal') {
          const eligible = activeBusinesses.filter(b => b.qualityRating >= 4 && (state.round - b.acquisitionRound) >= 3);
          affectedBusiness = pickRandom(eligible, rng) || affectedBusiness;
          const valuation = calculateExitValuation(affectedBusiness, state.round, undefined, undefined, state.integratedPlatforms);
          const fairValue = Math.round(affectedBusiness.ebitda * valuation.totalMultiple);
          const discountPct = 0.85 + (rng ? rng.next() : Math.random()) * 0.05; // 85-90%
          const offerAmount = Math.round(fairValue * discountPct);
          const newQuality = Math.max(1, affectedBusiness.qualityRating - 1);
          choices = [
            { label: `Accept ${formatMoney(offerAmount)}`, description: `Sell at ${Math.round(discountPct * 100)}% of ${formatMoney(fairValue)} fair value`, action: 'acceptMBOOffer', variant: 'positive' },
            { label: 'Decline', description: `40% chance CEO leaves (quality drops to Q${newQuality}), 60% stays with -2% growth`, action: 'declineMBOOffer', variant: 'negative' },
          ];
          return {
            id: `event_${state.round}_${eventDef.type}`,
            type: eventDef.type,
            title: eventDef.title,
            description: `${affectedBusiness.name}'s CEO proposes buying out your stake for ${formatMoney(offerAmount)} (${Math.round(discountPct * 100)}% of ${formatMoney(fairValue)} fair value).`,
            effect: eventDef.effectDescription,
            tip: eventDef.tip,
            tipSource: eventDef.tipSource,
            affectedBusinessId: affectedBusiness.id,
            offerAmount,
            choices,
          };
        } else if (eventDef.type === 'portfolio_key_man_risk') {
          const activeTurnaroundBizIds = new Set((state.activeTurnarounds || []).filter(t => t.status === 'active').map(t => t.businessId));
          const recentlyCompletedBizIds = new Set((state.activeTurnarounds || []).filter(t => t.status === 'completed' && t.endRound !== undefined && state.round - t.endRound < 2).map(t => t.businessId));
          const eligible = activeBusinesses.filter(b => b.qualityRating >= 4 && !activeTurnaroundBizIds.has(b.id) && !recentlyCompletedBizIds.has(b.id));
          affectedBusiness = pickRandom(eligible, rng) || affectedBusiness;
          const handcuffsCost = Math.round(affectedBusiness.ebitda * KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT);
          const successionCost = randomInt(KEY_MAN_SUCCESSION_COST_MIN, KEY_MAN_SUCCESSION_COST_MAX, rng);
          choices = [
            { label: `Golden Handcuffs (${formatMoney(handcuffsCost)})`, description: `Pay ${Math.round(KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT * 100)}% of EBITDA. ${Math.round(KEY_MAN_GOLDEN_HANDCUFFS_RESTORE_CHANCE * 100)}% chance quality restores`, action: 'keyManGoldenHandcuffs', variant: 'positive', cost: handcuffsCost },
            { label: `Succession Plan (${formatMoney(successionCost)})`, description: `Pay ${formatMoney(successionCost)}. Quality restores after ${KEY_MAN_SUCCESSION_ROUNDS} rounds`, action: 'keyManSuccessionPlan', variant: 'neutral', cost: successionCost },
            { label: 'Accept the Hit', description: 'Quality stays dropped. No cost.', action: 'keyManAcceptHit', variant: 'negative' },
          ];
          return {
            id: `event_${state.round}_${eventDef.type}`,
            type: eventDef.type,
            title: eventDef.title,
            description: `${affectedBusiness.name}'s key operator is threatening to leave. Quality has dropped from Q${affectedBusiness.qualityRating} to Q${Math.max(1, affectedBusiness.qualityRating - KEY_MAN_QUALITY_DROP)}.`,
            effect: eventDef.effectDescription,
            tip: eventDef.tip,
            tipSource: eventDef.tipSource,
            affectedBusinessId: affectedBusiness.id,
            choices,
          };
        } else if (eventDef.type === 'portfolio_earnout_dispute') {
          const eligible = activeBusinesses.filter(b =>
            b.earnoutRemaining > 0 && b.acquisitionRevenue > 0 &&
            (b.revenue - b.acquisitionRevenue) / b.acquisitionRevenue < -0.05 &&
            (!b.earnoutDisputeRound || state.round - b.earnoutDisputeRound >= 3)
          );
          affectedBusiness = pickRandom(eligible, rng) || affectedBusiness;
          const settleAmount = Math.round(affectedBusiness.earnoutRemaining * EARNOUT_SETTLE_PCT);
          const legalCost = randomInt(EARNOUT_FIGHT_LEGAL_COST_MIN, EARNOUT_FIGHT_LEGAL_COST_MAX, rng);
          const renegoAmount = Math.round(affectedBusiness.earnoutRemaining * EARNOUT_RENEGOTIATE_PCT);
          choices = [
            { label: `Settle (${formatMoney(settleAmount)})`, description: `Pay ${Math.round(EARNOUT_SETTLE_PCT * 100)}% of ${formatMoney(affectedBusiness.earnoutRemaining)} remaining. Obligation zeroed.`, action: 'earnoutSettle', variant: 'positive', cost: settleAmount },
            { label: `Fight in Court (${formatMoney(legalCost)})`, description: `${Math.round(EARNOUT_FIGHT_WIN_CHANCE * 100)}% win (zeroed), ${Math.round((1 - EARNOUT_FIGHT_WIN_CHANCE) * 100)}% lose (pay full + legal)`, action: 'earnoutFight', variant: 'negative', cost: legalCost },
            { label: 'Renegotiate', description: `Reduce obligation to ${formatMoney(renegoAmount)} (${Math.round(EARNOUT_RENEGOTIATE_PCT * 100)}%)`, action: 'earnoutRenegotiate', variant: 'neutral' },
          ];
          return {
            id: `event_${state.round}_${eventDef.type}`,
            type: eventDef.type,
            title: eventDef.title,
            description: `The former seller of ${affectedBusiness.name} disputes the earn-out. Revenue has declined ${Math.round(Math.abs((affectedBusiness.revenue - affectedBusiness.acquisitionRevenue) / affectedBusiness.acquisitionRevenue) * 100)}% since acquisition. ${formatMoney(affectedBusiness.earnoutRemaining)} remaining obligation.`,
            effect: eventDef.effectDescription,
            tip: eventDef.tip,
            tipSource: eventDef.tipSource,
            affectedBusinessId: affectedBusiness.id,
            choices,
          };
        } else if (eventDef.type === 'portfolio_supplier_shift') {
          const eligible = activeBusinesses.filter(b => {
            const sector = SECTORS[b.sectorId];
            const sectorMedianMargin = (sector.baseMargin[0] + sector.baseMargin[1]) / 2;
            return b.ebitdaMargin < sectorMedianMargin;
          });
          affectedBusiness = pickRandom(eligible, rng) || affectedBusiness;
          const switchCost = randomInt(SUPPLIER_SWITCH_COST_MIN, SUPPLIER_SWITCH_COST_MAX, rng);
          const sameSectorCount = activeBusinesses.filter(b => b.sectorId === affectedBusiness.sectorId).length;
          const canVertical = sameSectorCount >= SUPPLIER_VERTICAL_MIN_SAME_SECTOR;
          const supplierChoices: EventChoice[] = [
            { label: 'Absorb Costs', description: `Recover ${Math.round(SUPPLIER_ABSORB_RECOVERY_PPT * 100)}ppt of the ${Math.round(SUPPLIER_SHIFT_MARGIN_HIT * 100)}ppt hit (net -${Math.round((SUPPLIER_SHIFT_MARGIN_HIT - SUPPLIER_ABSORB_RECOVERY_PPT) * 100)}ppt permanent)`, action: 'supplierAbsorb', variant: 'neutral' },
            { label: `Switch Suppliers (${formatMoney(switchCost)})`, description: `Full margin recovery. -${Math.round(SUPPLIER_SWITCH_REVENUE_PENALTY * 100)}% revenue this round.`, action: 'supplierSwitch', variant: 'positive', cost: switchCost },
          ];
          if (canVertical) {
            supplierChoices.push({ label: `Vertical Integration (${formatMoney(SUPPLIER_VERTICAL_COST)})`, description: `Full recovery +${Math.round(SUPPLIER_VERTICAL_BONUS_PPT * 100)}ppt bonus. Requires ${SUPPLIER_VERTICAL_MIN_SAME_SECTOR}+ same-sector businesses.`, action: 'supplierVerticalIntegration', variant: 'positive', cost: SUPPLIER_VERTICAL_COST });
          } else {
            supplierChoices.push({ label: 'Vertical Integration (Locked)', description: `Requires ${SUPPLIER_VERTICAL_MIN_SAME_SECTOR}+ businesses in ${SECTORS[affectedBusiness.sectorId]?.name ?? 'sector'}`, action: 'supplierVerticalIntegrationLocked', variant: 'neutral' });
          }
          choices = supplierChoices;
          return {
            id: `event_${state.round}_${eventDef.type}`,
            type: eventDef.type,
            title: eventDef.title,
            description: `A key supplier to ${affectedBusiness.name} has consolidated and raised prices. Margin has dropped ${Math.round(SUPPLIER_SHIFT_MARGIN_HIT * 100)}ppt.`,
            effect: eventDef.effectDescription,
            tip: eventDef.tip,
            tipSource: eventDef.tipSource,
            affectedBusinessId: affectedBusiness.id,
            choices,
          };
        } else if (eventDef.type === 'portfolio_seller_deception') {
          // Seller Deception: recently acquired non-cash businesses
          const eligible = activeBusinesses.filter(b =>
            (state.round - b.acquisitionRound) <= SELLER_DECEPTION_MAX_AGE &&
            b.acquisitionRound > 0 &&
            (b.sellerNoteBalance > 0 || b.bankDebtBalance > 0 || b.earnoutRemaining > 0 || b.rolloverEquityPct > 0)
          );
          affectedBusiness = pickRandom(eligible, rng) || affectedBusiness;
          const turnaroundCost = Math.round(affectedBusiness.ebitda * SELLER_DECEPTION_TURNAROUND_COST_PCT);
          const valuation = calculateExitValuation(affectedBusiness, state.round, undefined, undefined, state.integratedPlatforms);
          const fireSalePrice = Math.round(affectedBusiness.ebitda * valuation.totalMultiple * SELLER_DECEPTION_FIRE_SALE_PCT);
          choices = [
            { label: `Invest in Turnaround (${formatMoney(turnaroundCost)})`, description: `Pay ${Math.round(SELLER_DECEPTION_TURNAROUND_COST_PCT * 100)}% of EBITDA. ${Math.round(SELLER_DECEPTION_TURNAROUND_RESTORE_CHANCE * 100)}% chance quality restores next round.`, action: 'sellerDeceptionTurnaround', variant: 'positive', cost: turnaroundCost },
            { label: `Fire Sale (${formatMoney(fireSalePrice)})`, description: `Sell immediately at ${Math.round(SELLER_DECEPTION_FIRE_SALE_PCT * 100)}% of fair value`, action: 'sellerDeceptionFireSale', variant: 'negative' },
            { label: 'Absorb the Hit', description: 'No cost. Quality and revenue stay dropped.', action: 'sellerDeceptionAbsorb', variant: 'neutral' },
          ];
          return {
            id: `event_${state.round}_${eventDef.type}`,
            type: eventDef.type,
            title: eventDef.title,
            description: `Due diligence missed critical issues at ${affectedBusiness.name}. Revenue has dropped ${Math.round(SELLER_DECEPTION_REVENUE_HIT * 100)}% and quality has fallen.`,
            effect: eventDef.effectDescription,
            tip: eventDef.tip,
            tipSource: eventDef.tipSource,
            affectedBusinessId: affectedBusiness.id,
            choices,
          };
        } else if (eventDef.type === 'portfolio_working_capital_crunch') {
          // Working Capital Crunch: businesses acquired in the previous round
          const eligible = activeBusinesses.filter(b =>
            (state.round - b.acquisitionRound) === WORKING_CAPITAL_CRUNCH_MAX_AGE
          );
          affectedBusiness = pickRandom(eligible, rng) || affectedBusiness;
          // Scale injection cost by business size (EBITDA / 1000 as a scaler, min 1.0)
          const sizeScaler = Math.max(1.0, affectedBusiness.ebitda / 1000);
          const injectionCost = Math.round(randomInt(WORKING_CAPITAL_CRUNCH_MIN, WORKING_CAPITAL_CRUNCH_MAX, rng) * sizeScaler);
          const creditCost = Math.round(injectionCost * 0.5);
          choices = [
            { label: `Inject Cash (${formatMoney(injectionCost)})`, description: 'Full injection — no further penalty', action: 'workingCapitalInject', variant: 'positive', cost: injectionCost },
            { label: `Emergency Line of Credit (${formatMoney(creditCost)})`, description: `Pay ${formatMoney(creditCost)} upfront, ${formatMoney(creditCost)} becomes bank debt at +1% rate`, action: 'workingCapitalCredit', variant: 'neutral', cost: creditCost },
            { label: 'Absorb Revenue Hit', description: `-${Math.round(WORKING_CAPITAL_CRUNCH_REVENUE_PENALTY * 100)}% revenue for ${WORKING_CAPITAL_CRUNCH_PENALTY_ROUNDS} rounds`, action: 'workingCapitalAbsorb', variant: 'negative' },
          ];
          return {
            id: `event_${state.round}_${eventDef.type}`,
            type: eventDef.type,
            title: eventDef.title,
            description: `${affectedBusiness.name} needs ${formatMoney(injectionCost)} in additional working capital — more than expected at acquisition.`,
            effect: eventDef.effectDescription,
            tip: eventDef.tip,
            tipSource: eventDef.tipSource,
            affectedBusinessId: affectedBusiness.id,
            choices,
          };
        } else if (eventDef.type === 'portfolio_management_succession') {
          // Management Succession: 20yr mode, 8+ years held, Q3+, not resolved
          const eligible = activeBusinesses.filter(b =>
            (state.round - b.acquisitionRound) >= SUCCESSION_MIN_YEARS_HELD &&
            b.qualityRating >= 3 &&
            !b.successionResolved
          );
          affectedBusiness = pickRandom(eligible, rng) || affectedBusiness;
          const investCost = randomInt(SUCCESSION_INVEST_COST_MIN, SUCCESSION_INVEST_COST_MAX, rng);
          const valuation = calculateExitValuation(affectedBusiness, state.round, undefined, undefined, state.integratedPlatforms);
          const fairValue = Math.round(affectedBusiness.ebitda * valuation.totalMultiple);
          const sellPrice = Math.round(fairValue * (1 - SUCCESSION_SELL_DISCOUNT));
          // Check shared services for promote bonus
          const hrActive = state.sharedServices?.some(s => s.type === 'recruiting_hr' && s.active) ?? false;
          let promoteChance = SUCCESSION_PROMOTE_RESTORE;
          if (hrActive) promoteChance += SUCCESSION_PROMOTE_HR_BONUS;
          if (affectedBusiness.isPlatform) promoteChance += SUCCESSION_PROMOTE_PLATFORM_BONUS;
          promoteChance = Math.min(0.95, promoteChance);
          choices = [
            { label: `Invest in External Hire (${formatMoney(investCost)})`, description: `Pay ${formatMoney(investCost)}. ${Math.round(SUCCESSION_INVEST_RESTORE * 100)}% chance quality restores.`, action: 'successionInvest', variant: 'positive', cost: investCost },
            { label: 'Promote from Within', description: `Free. ${Math.round(promoteChance * 100)}% chance quality restores${hrActive ? ' (HR bonus)' : ''}${affectedBusiness.isPlatform ? ' (platform bonus)' : ''}.`, action: 'successionPromote', variant: 'neutral' },
            { label: `Sell Business (${formatMoney(sellPrice)})`, description: `Sell at ${Math.round((1 - SUCCESSION_SELL_DISCOUNT) * 100)}% of ${formatMoney(fairValue)} fair value`, action: 'successionSell', variant: 'negative' },
          ];
          return {
            id: `event_${state.round}_${eventDef.type}`,
            type: eventDef.type,
            title: eventDef.title,
            description: `${affectedBusiness.name}'s founding operator is retiring after ${state.round - affectedBusiness.acquisitionRound} years. Quality has dropped from Q${affectedBusiness.qualityRating} to Q${Math.max(1, affectedBusiness.qualityRating - SUCCESSION_QUALITY_DROP)}.`,
            effect: eventDef.effectDescription,
            tip: eventDef.tip,
            tipSource: eventDef.tipSource,
            affectedBusinessId: affectedBusiness.id,
            choices,
          };
        } else if (eventDef.type === 'portfolio_referral_deal') {
          // Referral deal — no affectedBusiness needed, deal injected in applyEventEffects
          affectedBusiness = undefined as unknown as typeof affectedBusiness;
        }

        if (!affectedBusiness && eventDef.type !== 'portfolio_referral_deal') break;
        return {
          id: `event_${state.round}_${eventDef.type}`,
          type: eventDef.type,
          title: eventDef.title,
          description: eventDef.description,
          effect: eventDef.effectDescription,
          tip: eventDef.tip,
          tipSource: eventDef.tipSource,
          affectedBusinessId: affectedBusiness?.id,
          choices,
        };
      }
    }
  }

  // Roll for sector event
  const ownedSectors = new Set(activeBusinesses.map(b => b.sectorId));
  const applicableSectorEvents = SECTOR_EVENTS.filter(e => ownedSectors.has(e.sectorId));

  if (applicableSectorEvents.length > 0) {
    const sectorRoll = rng ? rng.next() : Math.random();
    cumulativeProb = 0;

    for (const eventDef of applicableSectorEvents) {
      cumulativeProb += eventDef.probability;
      if (sectorRoll < cumulativeProb) {
        const sectorBusinesses = activeBusinesses.filter(b => b.sectorId === eventDef.sectorId);
        if (sectorBusinesses.length === 0) continue; // C-2: Guard against empty array
        const affectedBusiness = eventDef.affectsAll ? undefined : pickRandom(sectorBusinesses, rng)!;

        return {
          id: `event_${state.round}_${eventDef.sectorId}_${eventDef.title.replace(/\s+/g, '_')}`,
          type: 'sector_event',
          title: eventDef.title,
          description: eventDef.description,
          effect: eventDef.effectDescription,
          tip: eventDef.tip,
          tipSource: eventDef.tipSource,
          affectedBusinessId: affectedBusiness?.id,
        };
      }
    }
  }

  // Roll for consolidation boom (inline, same pattern as unsolicited offer)
  if ((rng ? rng.next() : Math.random()) < CONSOLIDATION_BOOM_PROB) {
    // Dynamic: base sectors + any sector with CONSOLIDATION_BOOM_DYNAMIC_MIN_OPCOS+ player businesses
    const dynamicSectors = new Set<string>([...CONSOLIDATION_BOOM_SECTORS]);
    for (const b of activeBusinesses) {
      const sectorCount = activeBusinesses.filter(x => x.sectorId === b.sectorId).length;
      if (sectorCount >= CONSOLIDATION_BOOM_DYNAMIC_MIN_OPCOS) dynamicSectors.add(b.sectorId);
    }
    const boomSector = pickRandom([...dynamicSectors], rng) as import('./types').SectorId | undefined;
    if (boomSector) {
      const sectorDef = SECTORS[boomSector];
      const playerOwnsInSector = activeBusinesses.filter(b => b.sectorId === boomSector).length;
      const qualifiesForExclusive = playerOwnsInSector >= CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS;
      const exclusiveNote = qualifiesForExclusive
        ? ` You own ${playerOwnsInSector} businesses in ${sectorDef.name} — an exclusive tuck-in opportunity will appear.`
        : '';

      return {
        id: `event_${state.round}_consolidation_boom_${boomSector}`,
        type: 'sector_consolidation_boom' as const,
        title: `${sectorDef.name} Consolidation Boom`,
        description: `A wave of M&A activity is sweeping the ${sectorDef.name.toLowerCase()} sector. Buyers are competing aggressively, driving up deal prices — but also creating opportunities for well-positioned platforms.${exclusiveNote}`,
        effect: `All ${sectorDef.name.toLowerCase()} deals this round have +20% price premium. ${qualifiesForExclusive ? 'Exclusive tuck-in at normal pricing available.' : `Own 2+ ${sectorDef.name.toLowerCase()} businesses to unlock exclusive deal.`}`,
        tip: 'Consolidation waves create both opportunities and overpayment risk. Discipline matters most when everyone else is buying.',
        tipSource: 'Ch. IV',
        consolidationSectorId: boomSector,
      };
    }
  }

  // M-13: Roll for unsolicited offer - pick random business instead of iterating
  // (fixes bias toward earlier businesses in the array)
  if (activeBusinesses.length > 0) {
    const offerChance = 1 - Math.pow(0.95, activeBusinesses.length); // Combined probability
    if ((rng ? rng.next() : Math.random()) < offerChance) {
      const business = pickRandom(activeBusinesses, rng);
      if (business) {
        // Use calculateExitValuation for realistic pricing
        const valuation = calculateExitValuation(business, state.round, undefined, undefined, state.integratedPlatforms);
        const buyerProfile = generateBuyerProfile(business, valuation.buyerPoolTier, business.sectorId);

        // If strategic, add their premium
        let offerMultiple = valuation.totalMultiple;
        if (buyerProfile.isStrategic) {
          offerMultiple += buyerProfile.strategicPremium;
        }

        // Apply random offer variance: 0.9-1.2x of calculated multiple
        offerMultiple *= (0.9 + (rng ? rng.next() : Math.random()) * 0.3);
        offerMultiple = Math.max(2.0, offerMultiple);

        const offerAmount = Math.round(business.ebitda * offerMultiple);

        const buyerLabel = buyerProfile.isStrategic
          ? `Strategic acquirer ${buyerProfile.name}`
          : buyerProfile.name;

        return {
          id: `event_${state.round}_unsolicited_${business.id}`,
          type: 'unsolicited_offer',
          title: 'Unsolicited Acquisition Offer',
          description: `${buyerLabel} has approached you with an offer to acquire ${business.name} for ${formatMoney(offerAmount)} (${offerMultiple.toFixed(1)}x EBITDA).`,
          effect: 'Accept to sell immediately, or decline to keep the business',
          tip: "The best holdcos know when to sell. If the price is right and you can redeploy capital at higher returns, it's worth considering.",
          tipSource: 'Ch. IV',
          affectedBusinessId: business.id,
          offerAmount,
          offerMultiple,
          buyerProfile,
          choices: [
            { label: 'Decline', description: 'Keep the business', action: 'declineOffer', variant: 'negative' as const },
            { label: `Accept ${formatMoney(offerAmount)}`, description: 'Sell the business at offer price', action: 'acceptOffer', variant: 'positive' as const },
          ],
        };
      }
    }
  }

  // Quiet year
  return {
    id: `event_${state.round}_quiet`,
    type: 'global_quiet',
    title: 'Quiet Year',
    description: 'Markets are stable. Business as usual.',
    effect: 'No special effects this year',
  };
}

export function applyEventEffects(state: GameState, event: GameEvent, rng?: SeededRng): GameState {
  let newState = { ...state };
  const impacts: EventImpact[] = [];

  switch (event.type) {
    case 'global_bull_market': {
      // Revenue +5-10%, Margin +1-2 ppt
      const revBoost = 0.05 + (rng ? rng.next() : Math.random()) * 0.05;
      const marginBoost = 0.01 + (rng ? rng.next() : Math.random()) * 0.01;
      newState.businesses = newState.businesses.map(b => {
        if (b.status !== 'active') return b;
        const beforeEbitda = b.ebitda;
        const newRevenue = Math.round(b.revenue * (1 + revBoost));
        const newMargin = clampMargin(b.ebitdaMargin + marginBoost);
        const afterEbitda = Math.round(newRevenue * newMargin);
        impacts.push({
          businessId: b.id, businessName: b.name, metric: 'revenue',
          before: b.revenue, after: newRevenue, delta: newRevenue - b.revenue, deltaPercent: revBoost,
        });
        impacts.push({
          businessId: b.id, businessName: b.name, metric: 'ebitda',
          before: beforeEbitda, after: afterEbitda, delta: afterEbitda - beforeEbitda,
          deltaPercent: beforeEbitda > 0 ? (afterEbitda - beforeEbitda) / beforeEbitda : 0,
        });
        return { ...b, revenue: newRevenue, ebitdaMargin: newMargin, ebitda: afterEbitda, peakRevenue: Math.max(b.peakRevenue, newRevenue) };
      });
      break;
    }

    case 'global_recession': {
      // Revenue -(sensitivity × 10%), Margin -(sensitivity × 2 ppt)
      // Integrated platform businesses get reduced recession sensitivity
      newState.businesses = newState.businesses.map(b => {
        if (b.status !== 'active') return b;
        const sector = SECTORS[b.sectorId];
        const recessionModifier = getPlatformRecessionModifier(b, state.integratedPlatforms);
        const adjustedSensitivity = sector.recessionSensitivity * recessionModifier;
        const revImpact = adjustedSensitivity * 0.10;
        const marginImpact = adjustedSensitivity * 0.02;
        const beforeEbitda = b.ebitda;
        const newRevenue = Math.round(b.revenue * (1 - revImpact));
        const rawMargin = clampMargin(b.ebitdaMargin - marginImpact);
        const rawEbitda = Math.round(newRevenue * rawMargin);
        const floored = applyEbitdaFloor(rawEbitda, newRevenue, rawMargin, b.acquisitionEbitda);
        impacts.push({
          businessId: b.id, businessName: b.name, metric: 'revenue',
          before: b.revenue, after: newRevenue, delta: newRevenue - b.revenue, deltaPercent: -revImpact,
        });
        impacts.push({
          businessId: b.id, businessName: b.name, metric: 'ebitda',
          before: beforeEbitda, after: floored.ebitda, delta: floored.ebitda - beforeEbitda,
          deltaPercent: beforeEbitda > 0 ? (floored.ebitda - beforeEbitda) / beforeEbitda : 0,
        });
        return { ...b, revenue: newRevenue, ebitdaMargin: floored.margin, ebitda: floored.ebitda };
      });
      break;
    }

    case 'global_interest_hike': {
      const before = state.interestRate;
      const hike = 0.01 + (rng ? rng.next() : Math.random()) * 0.01;
      const after = Math.min(0.15, state.interestRate + hike);
      newState.interestRate = after;
      impacts.push({
        metric: 'interestRate',
        before,
        after,
        delta: after - before,
        deltaPercent: before > 0 ? (after - before) / before : 0,
      });
      break;
    }

    case 'global_interest_cut': {
      const before = state.interestRate;
      const cut = 0.01 + (rng ? rng.next() : Math.random()) * 0.01;
      const after = Math.max(0.03, state.interestRate - cut);
      newState.interestRate = after;
      impacts.push({
        metric: 'interestRate',
        before,
        after,
        delta: after - before,
        deltaPercent: before > 0 ? (after - before) / before : 0,
      });
      break;
    }

    case 'global_inflation': {
      newState.inflationRoundsRemaining = 2;
      // Immediate margin compression -2 ppt (matching event description)
      newState.businesses = newState.businesses.map(b => {
        if (b.status !== 'active') return b;
        const beforeEbitda = b.ebitda;
        const rawMargin = clampMargin(b.ebitdaMargin - 0.02);
        const rawEbitda = Math.round(b.revenue * rawMargin);
        const floored = applyEbitdaFloor(rawEbitda, b.revenue, rawMargin, b.acquisitionEbitda);
        impacts.push({
          businessId: b.id, businessName: b.name, metric: 'margin',
          before: b.ebitdaMargin, after: floored.margin, delta: floored.margin - b.ebitdaMargin,
        });
        impacts.push({
          businessId: b.id, businessName: b.name, metric: 'ebitda',
          before: beforeEbitda, after: floored.ebitda, delta: floored.ebitda - beforeEbitda,
          deltaPercent: beforeEbitda > 0 ? (floored.ebitda - beforeEbitda) / beforeEbitda : 0,
        });
        return { ...b, ebitdaMargin: floored.margin, ebitda: floored.ebitda };
      });
      break;
    }

    case 'global_credit_tightening': {
      const isQuickGame = state.maxRounds <= 10;
      newState.creditTighteningRoundsRemaining = isQuickGame ? 1 : 2;
      break;
    }

    case 'global_financial_crisis': {
      // 1. Interest rate +2% (future debt)
      const irBefore = state.interestRate;
      const irAfter = Math.min(0.15, state.interestRate + 0.02);
      newState.interestRate = irAfter;
      impacts.push({
        metric: 'interestRate',
        before: irBefore,
        after: irAfter,
        delta: irAfter - irBefore,
        deltaPercent: irBefore > 0 ? (irAfter - irBefore) / irBefore : 0,
      });

      // 2. Existing bank debt +1.5% (mutate bankDebtRate on all businesses with bank debt)
      newState.businesses = newState.businesses.map(b => {
        if (b.status !== 'active' || b.bankDebtBalance <= 0) return b;
        const oldRate = b.bankDebtRate || 0;
        const newRate = Math.min(0.15, oldRate + 0.015);
        impacts.push({
          businessId: b.id,
          businessName: b.name,
          metric: 'bankDebtRate',
          before: oldRate,
          after: newRate,
          delta: newRate - oldRate,
        });
        return { ...b, bankDebtRate: newRate };
      });

      // 3. Credit tightening (additive with existing)
      const crisisIsQuick = state.maxRounds <= 10;
      const crisisCTRounds = crisisIsQuick ? 1 : 2;
      newState.creditTighteningRoundsRemaining = (newState.creditTighteningRoundsRemaining || 0) + crisisCTRounds;

      // 4. Exit multiple penalty
      newState.exitMultiplePenalty = 1.0;

      // 5. Deal inflation crisis reset (20yr mode)
      if (state.duration === 'standard') {
        newState.dealInflationState = {
          ...newState.dealInflationState,
          crisisResetRoundsRemaining: DEAL_INFLATION_CRISIS_DURATION,
        };
      }

      break;
    }

    case 'portfolio_star_joins': {
      // Star hire: +8% revenue, +2 ppt margin
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const beforeEbitda = b.ebitda;
          const newRevenue = Math.round(b.revenue * 1.08);
          const newMargin = clampMargin(b.ebitdaMargin + 0.02);
          const afterEbitda = Math.round(newRevenue * newMargin);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'revenue',
            before: b.revenue, after: newRevenue, delta: newRevenue - b.revenue, deltaPercent: 0.08,
          });
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'ebitda',
            before: beforeEbitda, after: afterEbitda, delta: afterEbitda - beforeEbitda,
            deltaPercent: beforeEbitda > 0 ? (afterEbitda - beforeEbitda) / beforeEbitda : 0,
          });
          return {
            ...b,
            revenue: newRevenue, ebitdaMargin: newMargin, ebitda: afterEbitda,
            peakRevenue: Math.max(b.peakRevenue, newRevenue),
            organicGrowthRate: capGrowthRate(b.organicGrowthRate + 0.02),
            revenueGrowthRate: capGrowthRate(b.revenueGrowthRate + 0.02),
          };
        });
      }
      break;
    }

    case 'portfolio_talent_leaves': {
      // Talent loss: -6% revenue, -2 ppt margin
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const beforeEbitda = b.ebitda;
          const newRevenue = Math.round(b.revenue * 0.94);
          const rawMargin = clampMargin(b.ebitdaMargin - 0.02);
          const rawEbitda = Math.round(newRevenue * rawMargin);
          const floored = applyEbitdaFloor(rawEbitda, newRevenue, rawMargin, b.acquisitionEbitda);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'revenue',
            before: b.revenue, after: newRevenue, delta: newRevenue - b.revenue, deltaPercent: -0.06,
          });
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'ebitda',
            before: beforeEbitda, after: floored.ebitda, delta: floored.ebitda - beforeEbitda,
            deltaPercent: beforeEbitda > 0 ? (floored.ebitda - beforeEbitda) / beforeEbitda : 0,
          });
          return {
            ...b,
            revenue: newRevenue, ebitdaMargin: floored.margin, ebitda: floored.ebitda,
            organicGrowthRate: capGrowthRate(b.organicGrowthRate - 0.015),
            revenueGrowthRate: capGrowthRate(b.revenueGrowthRate - 0.015),
          };
        });
      }
      break;
    }

    case 'portfolio_client_signs': {
      // Client win: +8-12% revenue, margin unchanged
      if (event.affectedBusinessId) {
        const revBoost = 0.08 + (rng ? rng.next() : Math.random()) * 0.04;
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const beforeEbitda = b.ebitda;
          const newRevenue = Math.round(b.revenue * (1 + revBoost));
          const afterEbitda = Math.round(newRevenue * b.ebitdaMargin);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'revenue',
            before: b.revenue, after: newRevenue, delta: newRevenue - b.revenue, deltaPercent: revBoost,
          });
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'ebitda',
            before: beforeEbitda, after: afterEbitda, delta: afterEbitda - beforeEbitda,
            deltaPercent: beforeEbitda > 0 ? (afterEbitda - beforeEbitda) / beforeEbitda : 0,
          });
          return { ...b, revenue: newRevenue, ebitda: afterEbitda, peakRevenue: Math.max(b.peakRevenue, newRevenue) };
        });
      }
      break;
    }

    case 'portfolio_client_churns': {
      // Client loss: -12-18% revenue, -1 ppt margin (fixed cost deleverage)
      if (event.affectedBusinessId) {
        const business = newState.businesses.find(b => b.id === event.affectedBusinessId);
        if (business) {
          const sector = SECTORS[business.sectorId];
          const baseRevImpact = 0.12 + (rng ? rng.next() : Math.random()) * 0.06;
          const concentrationMultiplier =
            sector.clientConcentration === 'high' ? 1.3 : sector.clientConcentration === 'medium' ? 1.0 : 0.7;
          const revImpact = baseRevImpact * concentrationMultiplier;
          newState.businesses = newState.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            const beforeEbitda = b.ebitda;
            const newRevenue = Math.round(b.revenue * (1 - revImpact));
            const rawMargin = clampMargin(b.ebitdaMargin - 0.01);
            const rawEbitda = Math.round(newRevenue * rawMargin);
            const floored = applyEbitdaFloor(rawEbitda, newRevenue, rawMargin, b.acquisitionEbitda);
            impacts.push({
              businessId: b.id, businessName: b.name, metric: 'revenue',
              before: b.revenue, after: newRevenue, delta: newRevenue - b.revenue, deltaPercent: -revImpact,
            });
            impacts.push({
              businessId: b.id, businessName: b.name, metric: 'ebitda',
              before: beforeEbitda, after: floored.ebitda, delta: floored.ebitda - beforeEbitda,
              deltaPercent: beforeEbitda > 0 ? (floored.ebitda - beforeEbitda) / beforeEbitda : 0,
            });
            return { ...b, revenue: newRevenue, ebitdaMargin: floored.margin, ebitda: floored.ebitda };
          });
        }
      }
      break;
    }

    case 'portfolio_breakthrough': {
      // Operational breakthrough: margin +3 ppt, revenue unchanged
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const beforeEbitda = b.ebitda;
          const newMargin = clampMargin(b.ebitdaMargin + 0.03);
          const afterEbitda = Math.round(b.revenue * newMargin);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'margin',
            before: b.ebitdaMargin, after: newMargin, delta: newMargin - b.ebitdaMargin,
          });
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'ebitda',
            before: beforeEbitda, after: afterEbitda, delta: afterEbitda - beforeEbitda,
            deltaPercent: beforeEbitda > 0 ? (afterEbitda - beforeEbitda) / beforeEbitda : 0,
          });
          return { ...b, ebitdaMargin: newMargin, ebitda: afterEbitda };
        });
      }
      break;
    }

    case 'portfolio_compliance': {
      // Compliance hit: margin -4 ppt, revenue unchanged
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const beforeEbitda = b.ebitda;
          const rawMargin = clampMargin(b.ebitdaMargin - 0.04);
          const rawEbitda = Math.round(b.revenue * rawMargin);
          const floored = applyEbitdaFloor(rawEbitda, b.revenue, rawMargin, b.acquisitionEbitda);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'margin',
            before: b.ebitdaMargin, after: floored.margin, delta: floored.margin - b.ebitdaMargin,
          });
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'ebitda',
            before: beforeEbitda, after: floored.ebitda, delta: floored.ebitda - beforeEbitda,
            deltaPercent: beforeEbitda > 0 ? (floored.ebitda - beforeEbitda) / beforeEbitda : 0,
          });
          return { ...b, ebitdaMargin: floored.margin, ebitda: floored.ebitda };
        });
        // C-3: Floor cash at 0 for event costs
        const complianceCost = Math.min(500, state.cash);
        impacts.push({
          metric: 'cash',
          before: state.cash,
          after: state.cash - complianceCost,
          delta: -complianceCost,
        });
        newState.cash -= complianceCost;
      }
      break;
    }

    case 'sector_event': {
      // Find the matching sector event definition
      const sectorEvent = SECTOR_EVENTS.find(
        e => e.title === event.title
      ) as SectorEventDefinition | undefined;

      if (sectorEvent) {
        const ebitdaEffect = Array.isArray(sectorEvent.ebitdaEffect)
          ? randomInRange(sectorEvent.ebitdaEffect as [number, number], rng)
          : sectorEvent.ebitdaEffect;

        // Apply sector event as revenue effect (same magnitude) — margin stays constant
        // This preserves the existing balance while flowing through revenue/margin
        const applySectorEvent = (b: Business): Business => {
          const beforeEbitda = b.ebitda;
          const newRevenue = Math.round(b.revenue * (1 + ebitdaEffect));
          const afterEbitda = Math.round(newRevenue * b.ebitdaMargin);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'revenue',
            before: b.revenue, after: newRevenue, delta: newRevenue - b.revenue, deltaPercent: ebitdaEffect,
          });
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'ebitda',
            before: beforeEbitda, after: afterEbitda, delta: afterEbitda - beforeEbitda,
            deltaPercent: beforeEbitda > 0 ? (afterEbitda - beforeEbitda) / beforeEbitda : 0,
          });
          const floored = applyEbitdaFloor(afterEbitda, newRevenue, b.ebitdaMargin, b.acquisitionEbitda);
          let updated = { ...b, revenue: newRevenue, ebitda: floored.ebitda, ebitdaMargin: floored.margin, peakRevenue: Math.max(b.peakRevenue, newRevenue) };
          if (sectorEvent.growthEffect) {
            updated.organicGrowthRate = capGrowthRate(updated.organicGrowthRate + sectorEvent.growthEffect);
            updated.revenueGrowthRate = capGrowthRate(updated.revenueGrowthRate + sectorEvent.growthEffect);
          }
          return updated;
        };

        if (sectorEvent.affectsAll) {
          newState.businesses = newState.businesses.map(b => {
            if (b.status !== 'active' || b.sectorId !== sectorEvent.sectorId) return b;
            return applySectorEvent(b);
          });
        } else if (event.affectedBusinessId) {
          newState.businesses = newState.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            return applySectorEvent(b);
          });
        }

        // Apply cost if any - C-3: Floor cash at 0
        if (sectorEvent.costAmount) {
          const actualCost = Math.min(sectorEvent.costAmount, newState.cash);
          impacts.push({
            metric: 'cash',
            before: newState.cash,
            after: newState.cash - actualCost,
            delta: -actualCost,
          });
          newState.cash -= actualCost;
        }
      }
      break;
    }

    // Referral deal: no immediate state change — deal injection happens in store
    case 'portfolio_referral_deal':
      break;

    // Equity demand and seller note renego: choices handled by store actions
    case 'portfolio_equity_demand':
    case 'portfolio_seller_note_renego':
      break;

    // Unsolicited offer handling is done separately when player accepts/declines
    case 'unsolicited_offer':
      break;

    // Key-Man Risk: apply quality -1 immediately (choices are recovery responses)
    case 'portfolio_key_man_risk': {
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const newQuality = Math.max(1, b.qualityRating - KEY_MAN_QUALITY_DROP) as 1 | 2 | 3 | 4 | 5;
          const marginDelta = -0.015 * KEY_MAN_QUALITY_DROP;
          const newMargin = clampMargin(b.ebitdaMargin + marginDelta);
          const newEbitda = Math.round(b.revenue * newMargin);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'margin',
            before: b.ebitdaMargin, after: newMargin, delta: newMargin - b.ebitdaMargin,
          });
          return { ...b, qualityRating: newQuality, ebitdaMargin: newMargin, ebitda: newEbitda };
        });
      }
      break;
    }

    // Management Succession: apply quality -1 immediately (choices are recovery responses)
    case 'portfolio_management_succession': {
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const newQuality = Math.max(1, b.qualityRating - SUCCESSION_QUALITY_DROP) as 1 | 2 | 3 | 4 | 5;
          const marginDelta = -0.015 * SUCCESSION_QUALITY_DROP;
          const newMargin = clampMargin(b.ebitdaMargin + marginDelta);
          const newEbitda = Math.round(b.revenue * newMargin);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'margin',
            before: b.ebitdaMargin, after: newMargin, delta: newMargin - b.ebitdaMargin,
          });
          return { ...b, qualityRating: newQuality, ebitdaMargin: newMargin, ebitda: newEbitda };
        });
      }
      break;
    }

    // Supplier Shift: apply -3ppt margin immediately (choices are how to respond)
    case 'portfolio_supplier_shift': {
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const beforeEbitda = b.ebitda;
          const newMargin = clampMargin(b.ebitdaMargin - SUPPLIER_SHIFT_MARGIN_HIT);
          const newEbitda = Math.round(b.revenue * newMargin);
          const floored = applyEbitdaFloor(newEbitda, b.revenue, newMargin, b.acquisitionEbitda);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'margin',
            before: b.ebitdaMargin, after: floored.margin, delta: floored.margin - b.ebitdaMargin,
          });
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'ebitda',
            before: beforeEbitda, after: floored.ebitda, delta: floored.ebitda - beforeEbitda,
            deltaPercent: beforeEbitda > 0 ? (floored.ebitda - beforeEbitda) / beforeEbitda : 0,
          });
          return { ...b, ebitdaMargin: floored.margin, ebitda: floored.ebitda };
        });
      }
      break;
    }

    // Seller Deception: apply revenue -25%, quality -1 immediately (choices are recovery responses)
    case 'portfolio_seller_deception': {
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const newQuality = Math.max(1, b.qualityRating - SELLER_DECEPTION_QUALITY_DROP) as 1 | 2 | 3 | 4 | 5;
          const newRevenue = Math.round(b.revenue * (1 - SELLER_DECEPTION_REVENUE_HIT));
          const newMargin = b.ebitdaMargin; // margin unchanged, EBITDA drops via revenue
          const newEbitda = Math.round(newRevenue * newMargin);
          const floored = applyEbitdaFloor(newEbitda, newRevenue, newMargin, b.acquisitionEbitda);
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'revenue',
            before: b.revenue, after: newRevenue, delta: newRevenue - b.revenue, deltaPercent: -SELLER_DECEPTION_REVENUE_HIT,
          });
          impacts.push({
            businessId: b.id, businessName: b.name, metric: 'ebitda',
            before: b.ebitda, after: floored.ebitda, delta: floored.ebitda - b.ebitda,
            deltaPercent: b.ebitda > 0 ? (floored.ebitda - b.ebitda) / b.ebitda : 0,
          });
          return { ...b, qualityRating: newQuality, revenue: newRevenue, ebitdaMargin: floored.margin, ebitda: floored.ebitda };
        });
      }
      break;
    }

    // Working Capital Crunch: no immediate effect — choices resolve everything
    case 'portfolio_working_capital_crunch':
      break;

    // Earn-Out Dispute: no immediate effect — choices resolve everything
    case 'portfolio_earnout_dispute':
      break;

    // Consolidation Boom: set consolidationBoomSectorId on state
    case 'sector_consolidation_boom': {
      if (event.consolidationSectorId) {
        newState.consolidationBoomSectorId = event.consolidationSectorId;
      }
      break;
    }

    case 'global_quiet':
    default:
      break;
  }

  // Events with choices should pass through with choices preserved
  const hasChoices = event.type === 'unsolicited_offer' || event.type === 'portfolio_equity_demand'
    || event.type === 'portfolio_seller_note_renego' || event.type === 'portfolio_key_man_risk'
    || event.type === 'portfolio_earnout_dispute' || event.type === 'portfolio_supplier_shift'
    || event.type === 'portfolio_seller_deception' || event.type === 'portfolio_working_capital_crunch'
    || event.type === 'portfolio_management_succession';

  // Attach impacts to the event in state
  newState.currentEvent = !hasChoices && impacts.length > 0
    ? { ...event, impacts }
    : event;

  return newState;
}

export function calculateMetrics(state: GameState): Metrics {
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const sharedServicesBenefits = calculateSharedServicesBenefits(state);

  // Total EBITDA (annual)
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);

  // Revenue + margin metrics
  const totalRevenue = activeBusinesses.reduce((sum, b) => sum + b.revenue, 0);
  const avgEbitdaMargin = totalRevenue > 0 ? totalEbitda / totalRevenue : 0;

  // H-5: Shared services annual cost
  const sharedServicesCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);

  // MA Sourcing annual cost (tax-deductible like shared services)
  const maSourcingCost = state.maSourcing?.active
    ? getMASourcingAnnualCost(state.maSourcing.tier)
    : 0;
  const totalDeductibleCosts = sharedServicesCost + maSourcingCost;

  // Holdco loan
  const holdcoLoanBalance = state.holdcoLoanBalance ?? 0;
  const holdcoLoanRate = state.holdcoLoanRate ?? state.interestRate;

  // Total debt = holdco loan + per-business bank debt + seller notes
  const allDebtBusinesses = state.businesses.filter(b => b.status === 'active' || b.status === 'integrated');
  const opcoSellerNotes = allDebtBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance,
    0
  );
  const totalDebt = state.totalDebt + opcoSellerNotes;

  // Distress interest penalty (matches CollectPhase and store waterfall)
  const distressLevelForFcf = calculateDistressLevel(
    totalEbitda > 0 ? Math.max(0, totalDebt - state.cash) / totalEbitda : 0,
    totalDebt, totalEbitda, state.cash
  );
  const distressRestrictions = getDistressRestrictions(distressLevelForFcf);
  const interestPenalty = distressRestrictions.interestPenalty;

  // Total FCF (annual): EBITDA - CapEx - Tax (with penalty in tax shield)
  // Pass holdcoLoanRate + interestPenalty so tax shield matches actual interest paid
  const totalFcf = calculatePortfolioFcf(
    activeBusinesses,
    sharedServicesBenefits.capexReduction,
    sharedServicesBenefits.cashConversionBonus,
    holdcoLoanBalance,
    holdcoLoanRate + interestPenalty,
    totalDeductibleCosts
  );

  // Portfolio tax breakdown for NOPAT calculation (with penalty for accurate shield)
  const taxBreakdown = calculatePortfolioTax(
    activeBusinesses, holdcoLoanBalance, holdcoLoanRate + interestPenalty, totalDeductibleCosts
  );

  // Holdco loan P&I (interest + principal — matches CollectPhase waterfall)
  const holdcoLoanInterest = Math.round(holdcoLoanBalance * (holdcoLoanRate + interestPenalty));
  const holdcoLoanPrincipal = (state.holdcoLoanRoundsRemaining ?? 0) > 0
    ? Math.round(holdcoLoanBalance / state.holdcoLoanRoundsRemaining)
    : 0;
  const holdcoLoanPI = holdcoLoanInterest + holdcoLoanPrincipal;

  // OpCo debt service: seller note P&I + bank debt P&I for active + integrated businesses
  let opcoSellerNoteService = 0;
  let opcoBankDebtService = 0;
  for (const b of allDebtBusinesses) {
    if (b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining > 0) {
      opcoSellerNoteService += Math.round(b.sellerNoteBalance * b.sellerNoteRate);
      opcoSellerNoteService += Math.round(b.sellerNoteBalance / b.sellerNoteRoundsRemaining);
    }
    if (b.bankDebtBalance > 0 && b.bankDebtRoundsRemaining > 0) {
      opcoBankDebtService += Math.round(b.bankDebtBalance * (b.bankDebtRate || 0));
      opcoBankDebtService += Math.round(b.bankDebtBalance / b.bankDebtRoundsRemaining);
    }
  }

  // Earn-out payments (active + integrated businesses — matches CollectPhase logic)
  let earnoutPayments = 0;
  for (const b of allDebtBusinesses) {
    if (b.earnoutRemaining <= 0 || b.earnoutTarget <= 0) continue;
    if (state.round > 0 && state.round - b.acquisitionRound > EARNOUT_EXPIRATION_YEARS) continue;
    if (b.status === 'active' && b.acquisitionEbitda > 0) {
      const growth = (b.ebitda - b.acquisitionEbitda) / b.acquisitionEbitda;
      if (growth >= b.earnoutTarget) earnoutPayments += b.earnoutRemaining;
    } else if (b.status === 'integrated' && b.parentPlatformId) {
      const platform = state.businesses.find(p => p.id === b.parentPlatformId && p.status === 'active');
      if (platform && platform.acquisitionEbitda > 0) {
        const growth = (platform.ebitda - platform.acquisitionEbitda) / platform.acquisitionEbitda;
        if (growth >= b.earnoutTarget) earnoutPayments += b.earnoutRemaining;
      }
    }
  }

  // Turnaround costs (tier + active program costs)
  const turnaroundTierCost = getTurnaroundTierAnnualCost(state.turnaroundTier ?? 0);
  const turnaroundProgramCosts = (state.activeTurnarounds ?? [])
    .filter(t => t.status === 'active')
    .reduce((sum, t) => {
      const prog = getProgramById(t.programId);
      return sum + (prog ? prog.annualCost : 0);
    }, 0);
  const turnaroundCost = turnaroundTierCost + turnaroundProgramCosts;

  // Net FCF matching CollectPhase waterfall:
  // totalFcf (EBITDA - CapEx - Tax) - holdco P&I - opco debt service - earnouts
  // - shared services - MA sourcing - turnaround costs
  const netFcf = totalFcf - holdcoLoanPI - opcoSellerNoteService - opcoBankDebtService
    - earnoutPayments - sharedServicesCost - maSourcingCost - turnaroundCost;

  // Portfolio value (full exit valuation engine — aligns buyback/equity pricing with FEV)
  const portfolioValue = activeBusinesses.reduce((sum, b) => {
    const valuation = calculateExitValuation(b, state.round, undefined, undefined, state.integratedPlatforms);
    return sum + b.ebitda * valuation.totalMultiple;
  }, 0);

  // Intrinsic value per share
  const intrinsicValue = portfolioValue + state.cash - totalDebt;
  const intrinsicValuePerShare = state.sharesOutstanding > 0
    ? intrinsicValue / state.sharesOutstanding
    : 0;

  // FCF per share
  const fcfPerShare = state.sharesOutstanding > 0
    ? netFcf / state.sharesOutstanding
    : 0;

  // ROIC — NOPAT uses portfolio-level tax (includes deductions)
  const nopat = totalEbitda - taxBreakdown.taxAmount;
  const portfolioRoic = state.totalInvestedCapital > 0 ? nopat / state.totalInvestedCapital : 0;

  // ROIIC (requires historical data)
  let roiic = 0;
  if (state.metricsHistory.length > 0) {
    const prevMetrics = state.metricsHistory[state.metricsHistory.length - 1];
    const deltaNopat = nopat - prevMetrics.nopat;
    const deltaInvested = state.totalInvestedCapital - prevMetrics.investedCapital;
    if (deltaInvested > 0) {
      roiic = deltaNopat / deltaInvested;
    }
  }

  // MOIC — NAV-based: (portfolio value + cash - debt + distributions) / initial raise
  // Uses initial raise as denominator (total paid-in capital), not just invested capital
  // Cash already reflects exit proceeds (no double-counting)
  const nav = portfolioValue + state.cash - totalDebt + state.totalDistributions;
  const portfolioMoic = state.initialRaiseAmount > 0 ? nav / state.initialRaiseAmount : 1;

  // Leverage
  const netDebtToEbitda = totalEbitda > 0 ? (totalDebt - state.cash) / totalEbitda : 0;

  // Distress level
  const distressLevel = calculateDistressLevel(netDebtToEbitda, totalDebt, totalEbitda, state.cash);

  // Cash conversion
  const cashConversion = totalEbitda > 0 ? totalFcf / totalEbitda : 0;

  return {
    cash: state.cash,
    totalDebt,
    totalEbitda,
    totalFcf: netFcf,
    fcfPerShare,
    portfolioRoic,
    roiic,
    portfolioMoic,
    netDebtToEbitda,
    distressLevel,
    cashConversion,
    interestRate: state.interestRate,
    sharesOutstanding: state.sharesOutstanding,
    intrinsicValuePerShare,
    totalInvestedCapital: state.totalInvestedCapital,
    totalDistributions: state.totalDistributions,
    totalBuybacks: state.totalBuybacks,
    totalExitProceeds: state.totalExitProceeds,
    totalRevenue,
    avgEbitdaMargin,
  };
}

export function recordHistoricalMetrics(state: GameState): HistoricalMetrics {
  const metrics = calculateMetrics(state);
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);

  // Use portfolio-level tax for NOPAT (includes deductions)
  const ssHistCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);
  const maHistCost = state.maSourcing?.active ? getMASourcingAnnualCost(state.maSourcing.tier) : 0;
  const taxBreakdown = calculatePortfolioTax(
    activeBusinesses, state.holdcoLoanBalance ?? 0, state.holdcoLoanRate ?? state.interestRate, ssHistCost + maHistCost
  );
  const nopat = totalEbitda - taxBreakdown.taxAmount;

  return {
    round: state.round,
    metrics,
    fcf: metrics.totalFcf,
    nopat,
    investedCapital: state.totalInvestedCapital,
  };
}
