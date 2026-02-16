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
} from './types';
import { SECTORS } from '../data/sectors';
import { GLOBAL_EVENTS, PORTFOLIO_EVENTS, SECTOR_EVENTS, SectorEventDefinition } from '../data/events';
import {
  calculateSizeTierPremium,
  calculateDeRiskingPremium,
  generateBuyerProfile,
  generateValuationCommentary,
} from './buyers';
import { calculateDistressLevel } from './distress';
import { getMASourcingAnnualCost } from '../data/sharedServices';
import {
  clampMargin,
  capGrowthRate,
  applyEbitdaFloor,
} from './helpers';
import { getPlatformMultipleExpansion, getPlatformRecessionModifier } from './platforms';
import { getTurnaroundExitPremium } from './turnarounds';

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

  // Platform premium: reduced since size tier now does the heavy lifting
  const platformPremium = business.isPlatform ? (business.platformScale * 0.2) : 0;

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

  // Sum all premiums above base
  const rawTotalPremiums = growthPremium + qualityPremium + platformPremium + holdPremium +
    improvementsPremium + marketModifier + sizeTierPremium + deRiskingPremium +
    ruleOf40Premium + marginExpansionPremium + mergerPremium + integratedPlatformPremium +
    turnaroundPremium;

  // Cap aggregate premiums to prevent runaway multiples
  // Floor of 10x ensures well-built platforms still get rewarded;
  // 1.5× base keeps premium proportional to sector baseline
  const premiumCap = Math.max(10, baseMultiple * 1.5);
  const totalPremiums = rawTotalPremiums > 0
    ? Math.min(rawTotalPremiums, premiumCap)
    : rawTotalPremiums;

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
  reinvestmentBonus: number;
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
  let reinvestmentBonus = 0;
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
        reinvestmentBonus += 0.2 * scaleMultiplier;
        growthBonus += 0.005 * scaleMultiplier; // +0.5% revenue growth
        marginDefense += 0.002 * scaleMultiplier; // +0.20 ppt/yr margin defense
        break;
    }
  }

  return {
    capexReduction,
    cashConversionBonus,
    growthBonus,
    reinvestmentBonus,
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
  maxRounds?: number // 20 or 10 — scales margin drift start
): Business {
  const sector = SECTORS[business.sectorId];

  // --- Revenue Growth ---
  const cappedGrowthRate = capGrowthRate(business.revenueGrowthRate);

  let revenueGrowth = cappedGrowthRate;

  // Sector volatility with concentration risk
  const concentrationMultiplier = (concentrationCount && concentrationCount >= 4)
    ? 1 + (concentrationCount - 3) * 0.25
    : 1;
  revenueGrowth += sector.volatility * (Math.random() * 2 - 1) * concentrationMultiplier;

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
    revenueGrowth -= (0.03 + Math.random() * 0.05);
  }

  // Inflation drags revenue growth
  if (inflationActive) {
    revenueGrowth -= 0.03;
  }

  const newRevenue = Math.round(business.revenue * (1 + revenueGrowth));

  // --- Margin Drift ---
  // Progressive onboarding: margins are static early, drift begins at ~20% through the game
  const marginDriftStart = Math.max(2, Math.ceil((maxRounds ?? 20) * 0.20));
  let newMargin = business.ebitdaMargin;
  if (currentRound && currentRound >= marginDriftStart) {
    let marginChange = business.marginDriftRate;

    // Sector margin volatility (random noise)
    marginChange += sector.marginVolatility * (Math.random() * 2 - 1);

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
  };
}

export function generateEvent(state: GameState): GameEvent | null {
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const sharedServicesBenefits = calculateSharedServicesBenefits(state);

  // Roll for global event
  const globalRoll = Math.random();
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
    const portfolioRoll = Math.random();
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
        let affectedBusiness = pickRandom(activeBusinesses)!;
        let choices: EventChoice[] | undefined;

        if (eventDef.type === 'portfolio_equity_demand') {
          const eligible = activeBusinesses.filter(b => b.dueDiligence.operatorQuality === 'strong' && b.qualityRating >= 4);
          affectedBusiness = pickRandom(eligible) || affectedBusiness;
          const dilution = randomInt(20, 30);
          choices = [
            { label: `Grant Equity (${dilution} shares)`, description: `Dilute ${dilution} shares, +2% growth, +1ppt margin`, action: 'grantEquityDemand', variant: 'positive' },
            { label: 'Decline', description: '60% chance talent leaves', action: 'declineEquityDemand', variant: 'negative' },
          ];
        } else if (eventDef.type === 'portfolio_seller_note_renego') {
          const eligible = activeBusinesses.filter(b => b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining >= 2);
          affectedBusiness = pickRandom(eligible) || affectedBusiness;
          const discountRate = 0.70 + Math.random() * 0.10; // 70-80%
          const discountAmt = Math.round(affectedBusiness!.sellerNoteBalance * discountRate);
          choices = [
            { label: `Pay Early (${formatMoney(discountAmt)})`, description: `Pay ${Math.round(discountRate * 100)}% of remaining balance now`, action: 'acceptSellerNoteRenego', variant: 'positive' },
            { label: 'Decline', description: 'Note continues normally', action: 'declineSellerNoteRenego', variant: 'neutral' },
          ];
        } else if (eventDef.type === 'mbo_proposal') {
          const eligible = activeBusinesses.filter(b => b.qualityRating >= 4 && (state.round - b.acquisitionRound) >= 3);
          affectedBusiness = pickRandom(eligible) || affectedBusiness;
          const valuation = calculateExitValuation(affectedBusiness, state.round, undefined, undefined, state.integratedPlatforms);
          const fairValue = Math.round(affectedBusiness.ebitda * valuation.totalMultiple);
          const discountPct = 0.85 + Math.random() * 0.05; // 85-90%
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
    const sectorRoll = Math.random();
    cumulativeProb = 0;

    for (const eventDef of applicableSectorEvents) {
      cumulativeProb += eventDef.probability;
      if (sectorRoll < cumulativeProb) {
        const sectorBusinesses = activeBusinesses.filter(b => b.sectorId === eventDef.sectorId);
        if (sectorBusinesses.length === 0) continue; // C-2: Guard against empty array
        const affectedBusiness = eventDef.affectsAll ? undefined : pickRandom(sectorBusinesses)!;

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

  // M-13: Roll for unsolicited offer - pick random business instead of iterating
  // (fixes bias toward earlier businesses in the array)
  if (activeBusinesses.length > 0) {
    const offerChance = 1 - Math.pow(0.95, activeBusinesses.length); // Combined probability
    if (Math.random() < offerChance) {
      const business = pickRandom(activeBusinesses);
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
        offerMultiple *= (0.9 + Math.random() * 0.3);
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

export function applyEventEffects(state: GameState, event: GameEvent): GameState {
  let newState = { ...state };
  const impacts: EventImpact[] = [];

  switch (event.type) {
    case 'global_bull_market': {
      // Revenue +5-10%, Margin +1-2 ppt
      const revBoost = 0.05 + Math.random() * 0.05;
      const marginBoost = 0.01 + Math.random() * 0.01;
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
      const hike = 0.01 + Math.random() * 0.01;
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
      const cut = 0.01 + Math.random() * 0.01;
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
        const revBoost = 0.08 + Math.random() * 0.04;
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
          const baseRevImpact = 0.12 + Math.random() * 0.06;
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
          ? randomInRange(sectorEvent.ebitdaEffect as [number, number])
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

    case 'global_quiet':
    default:
      break;
  }

  // Events with choices should pass through with choices preserved
  const hasChoices = event.type === 'unsolicited_offer' || event.type === 'portfolio_equity_demand' || event.type === 'portfolio_seller_note_renego';

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

  // Total FCF (annual - each round is now 1 year)
  // Portfolio-level tax is computed inside calculatePortfolioFcf
  // holdcoLoanBalance is the holdco-level loan; per-business bank debt is on each business
  const holdcoLoanBalance = state.holdcoLoanBalance ?? 0;
  const holdcoLoanRate = state.holdcoLoanRate ?? state.interestRate;

  const totalFcf = calculatePortfolioFcf(
    activeBusinesses,
    sharedServicesBenefits.capexReduction,
    sharedServicesBenefits.cashConversionBonus,
    holdcoLoanBalance,
    holdcoLoanRate,
    totalDeductibleCosts
  );

  // Portfolio tax breakdown for NOPAT calculation
  const taxBreakdown = calculatePortfolioTax(
    activeBusinesses, holdcoLoanBalance, holdcoLoanRate, totalDeductibleCosts
  );

  // Total debt = holdco loan + per-business bank debt + seller notes
  const opcoSellerNotes = activeBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance,
    0
  );
  const totalDebt = state.totalDebt + opcoSellerNotes;

  // Interest expense
  const annualInterest = holdcoLoanBalance * holdcoLoanRate;
  const opcoInterest = activeBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance * b.sellerNoteRate
               + b.bankDebtBalance * (b.bankDebtRate || 0),
    0
  );

  // Net FCF after interest and shared services costs
  const netFcf = totalFcf - annualInterest - opcoInterest - sharedServicesCost;

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
  const distressLevel = calculateDistressLevel(netDebtToEbitda, totalDebt, totalEbitda);

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
