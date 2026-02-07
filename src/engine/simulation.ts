import {
  GameState,
  Business,
  GameEvent,
  EventImpact,
  ExitValuation,
  SectorFocusBonus,
  SectorFocusGroup,
  SectorFocusTier,
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

export const TAX_RATE = 0.30;
const MAX_ORGANIC_GROWTH_RATE = 0.20; // M-4: Cap on growth rate accumulation

// Calculate exit valuation for a business with full breakdown
export function calculateExitValuation(
  business: Business,
  currentRound: number,
  lastEventType?: string,
  portfolioContext?: { totalPlatformEbitda?: number }
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

  // Improvements premium: investments in the business increase value
  const improvementsPremium = business.improvements.length * 0.15;

  // Market conditions modifier
  let marketModifier = 0;
  if (lastEventType === 'global_bull_market') marketModifier = 0.5;
  if (lastEventType === 'global_recession') marketModifier = -0.5;

  // Size tier premium — the big new driver
  // Use platform consolidated EBITDA if available, otherwise business standalone
  const effectiveEbitda = portfolioContext?.totalPlatformEbitda ?? business.ebitda;
  const sizeTierResult = calculateSizeTierPremium(effectiveEbitda);
  const sizeTierPremium = sizeTierResult.premium;
  const buyerPoolTier = sizeTierResult.tier;

  // De-risking premium — composite de-risking factor
  const deRiskingPremium = calculateDeRiskingPremium(business);

  // Calculate exit multiple
  const totalMultiple = Math.max(
    2.0, // Absolute floor - distressed sale
    baseMultiple + growthPremium + qualityPremium + platformPremium + holdPremium +
    improvementsPremium + marketModifier + sizeTierPremium + deRiskingPremium
  );

  const exitPrice = Math.round(business.ebitda * totalMultiple);

  // Net proceeds after debt payoff
  const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance;
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
    deRiskingPremium,
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
    (sum, b) => sum + Math.round(b.sellerNoteBalance * b.sellerNoteRate),
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

  for (const service of activeServices) {
    switch (service.type) {
      case 'finance_reporting':
        cashConversionBonus += 0.05 * scaleMultiplier;
        break;
      case 'recruiting_hr':
        talentRetentionBonus += 0.5 * scaleMultiplier;
        talentGainBonus += 0.3 * scaleMultiplier;
        break;
      case 'procurement':
        capexReduction += 0.15 * scaleMultiplier;
        break;
      case 'marketing_brand':
        growthBonus += 0.015 * scaleMultiplier;
        break;
      case 'technology_systems':
        reinvestmentBonus += 0.2 * scaleMultiplier;
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
      return 0.07;
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
  inflationActive: boolean
): Business {
  const sector = SECTORS[business.sectorId];

  // M-4: Cap the organic growth rate before applying
  const cappedGrowthRate = Math.min(MAX_ORGANIC_GROWTH_RATE, Math.max(-0.10, business.organicGrowthRate));

  // Base annual growth (each round = 1 year)
  let annualGrowth = cappedGrowthRate;

  // Sector volatility (random variation within the year)
  annualGrowth += sector.volatility * (Math.random() * 2 - 1);

  // Shared services bonus
  annualGrowth += sharedServicesGrowthBonus;

  // Sector-specific shared services bonus for agencies and consumer brands
  if (
    (business.sectorId === 'agency' || business.sectorId === 'consumer') &&
    sharedServicesGrowthBonus > 0
  ) {
    annualGrowth += 0.01; // Extra 1% annual for these sectors
  }

  // Sector focus bonus
  annualGrowth += sectorFocusBonus;

  // Integration penalty (first year after acquisition)
  if (business.integrationRoundsRemaining > 0) {
    annualGrowth -= (0.03 + Math.random() * 0.05);
  }

  // H-2: Inflation increases effective capex, reducing growth
  if (inflationActive) {
    annualGrowth -= 0.03; // Inflation drags growth by 3% (higher costs)
  }

  // Calculate new EBITDA
  let newEbitda = Math.round(business.ebitda * (1 + annualGrowth));

  // Floor at 30% of acquisition EBITDA
  const floor = Math.round(business.acquisitionEbitda * 0.3);
  newEbitda = Math.max(newEbitda, floor);

  // Update peak EBITDA
  const newPeak = Math.max(business.peakEbitda, newEbitda);

  // Decrease integration period (now in years)
  const newIntegration = Math.max(0, business.integrationRoundsRemaining - 1);

  // M-4: Also cap the stored growth rate to prevent runaway accumulation
  const newGrowthRate = Math.min(MAX_ORGANIC_GROWTH_RATE, Math.max(-0.10, business.organicGrowthRate));

  return {
    ...business,
    ebitda: newEbitda,
    peakEbitda: newPeak,
    integrationRoundsRemaining: newIntegration,
    organicGrowthRate: newGrowthRate,
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
      return {
        id: `event_${state.round}_${eventDef.type}`,
        type: eventDef.type,
        title: eventDef.title,
        description: eventDef.description,
        effect: eventDef.effectDescription,
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
        const affectedBusiness = pickRandom(activeBusinesses);
        if (!affectedBusiness) break; // C-2: Guard against empty array
        return {
          id: `event_${state.round}_${eventDef.type}`,
          type: eventDef.type,
          title: eventDef.title,
          description: eventDef.description,
          effect: eventDef.effectDescription,
          tip: eventDef.tip,
          tipSource: eventDef.tipSource,
          affectedBusinessId: affectedBusiness.id,
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
        const affectedBusiness = eventDef.affectsAll ? undefined : pickRandom(sectorBusinesses);

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
        const valuation = calculateExitValuation(business, state.round);
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

  // M-4: Helper to cap growth rate changes
  const capGrowthRate = (rate: number) => Math.min(MAX_ORGANIC_GROWTH_RATE, Math.max(-0.10, rate));

  switch (event.type) {
    case 'global_bull_market': {
      // +5-15% EBITDA for all
      const boost = 0.05 + Math.random() * 0.10;
      newState.businesses = newState.businesses.map(b => {
        if (b.status !== 'active') return b;
        const before = b.ebitda;
        const after = Math.round(b.ebitda * (1 + boost));
        impacts.push({
          businessId: b.id,
          businessName: b.name,
          metric: 'ebitda',
          before,
          after,
          delta: after - before,
          deltaPercent: boost,
        });
        return { ...b, ebitda: after };
      });
      break;
    }

    case 'global_recession': {
      // Apply recession sensitivity
      newState.businesses = newState.businesses.map(b => {
        if (b.status !== 'active') return b;
        const sector = SECTORS[b.sectorId];
        const impact = sector.recessionSensitivity * 0.15;
        const before = b.ebitda;
        const after = Math.round(b.ebitda * (1 - impact));
        impacts.push({
          businessId: b.id,
          businessName: b.name,
          metric: 'ebitda',
          before,
          after,
          delta: after - before,
          deltaPercent: -impact,
        });
        return { ...b, ebitda: after };
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
      break;
    }

    case 'global_credit_tightening': {
      newState.creditTighteningRoundsRemaining = 2;
      break;
    }

    case 'portfolio_star_joins': {
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const before = b.ebitda;
          const after = Math.round(b.ebitda * 1.12);
          impacts.push({
            businessId: b.id,
            businessName: b.name,
            metric: 'ebitda',
            before,
            after,
            delta: after - before,
            deltaPercent: 0.12,
          });
          return {
            ...b,
            ebitda: after,
            organicGrowthRate: capGrowthRate(b.organicGrowthRate + 0.02), // M-4: Cap
          };
        });
      }
      break;
    }

    case 'portfolio_talent_leaves': {
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const before = b.ebitda;
          const after = Math.round(b.ebitda * 0.90);
          impacts.push({
            businessId: b.id,
            businessName: b.name,
            metric: 'ebitda',
            before,
            after,
            delta: after - before,
            deltaPercent: -0.10,
          });
          return {
            ...b,
            ebitda: after,
            organicGrowthRate: capGrowthRate(b.organicGrowthRate - 0.015), // M-4: Cap
          };
        });
      }
      break;
    }

    case 'portfolio_client_signs': {
      if (event.affectedBusinessId) {
        const boost = 0.08 + Math.random() * 0.04;
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const before = b.ebitda;
          const after = Math.round(b.ebitda * (1 + boost));
          impacts.push({
            businessId: b.id,
            businessName: b.name,
            metric: 'ebitda',
            before,
            after,
            delta: after - before,
            deltaPercent: boost,
          });
          return { ...b, ebitda: after };
        });
      }
      break;
    }

    case 'portfolio_client_churns': {
      if (event.affectedBusinessId) {
        const business = newState.businesses.find(b => b.id === event.affectedBusinessId);
        if (business) {
          const sector = SECTORS[business.sectorId];
          const baseImpact = 0.12 + Math.random() * 0.06;
          const concentrationMultiplier =
            sector.clientConcentration === 'high' ? 1.3 : sector.clientConcentration === 'medium' ? 1.0 : 0.7;
          const impact = baseImpact * concentrationMultiplier;
          newState.businesses = newState.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            const before = b.ebitda;
            const after = Math.round(b.ebitda * (1 - impact));
            impacts.push({
              businessId: b.id,
              businessName: b.name,
              metric: 'ebitda',
              before,
              after,
              delta: after - before,
              deltaPercent: -impact,
            });
            return { ...b, ebitda: after };
          });
        }
      }
      break;
    }

    case 'portfolio_breakthrough': {
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const before = b.ebitda;
          const after = Math.round(b.ebitda * 1.06);
          impacts.push({
            businessId: b.id,
            businessName: b.name,
            metric: 'ebitda',
            before,
            after,
            delta: after - before,
            deltaPercent: 0.06,
          });
          return { ...b, ebitda: after };
        });
      }
      break;
    }

    case 'portfolio_compliance': {
      if (event.affectedBusinessId) {
        newState.businesses = newState.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          const before = b.ebitda;
          const after = Math.round(b.ebitda * 0.92);
          impacts.push({
            businessId: b.id,
            businessName: b.name,
            metric: 'ebitda',
            before,
            after,
            delta: after - before,
            deltaPercent: -0.08,
          });
          return { ...b, ebitda: after };
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

        if (sectorEvent.affectsAll) {
          // Apply to all businesses in sector
          newState.businesses = newState.businesses.map(b => {
            if (b.status !== 'active' || b.sectorId !== sectorEvent.sectorId) return b;
            const before = b.ebitda;
            const after = Math.round(b.ebitda * (1 + ebitdaEffect));
            impacts.push({
              businessId: b.id,
              businessName: b.name,
              metric: 'ebitda',
              before,
              after,
              delta: after - before,
              deltaPercent: ebitdaEffect,
            });
            let updated = { ...b, ebitda: after };
            if (sectorEvent.growthEffect) {
              updated.organicGrowthRate = capGrowthRate(updated.organicGrowthRate + sectorEvent.growthEffect); // M-4
            }
            return updated;
          });
        } else if (event.affectedBusinessId) {
          // Apply to specific business
          newState.businesses = newState.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            const before = b.ebitda;
            const after = Math.round(b.ebitda * (1 + ebitdaEffect));
            impacts.push({
              businessId: b.id,
              businessName: b.name,
              metric: 'ebitda',
              before,
              after,
              delta: after - before,
              deltaPercent: ebitdaEffect,
            });
            let updated = { ...b, ebitda: after };
            if (sectorEvent.growthEffect) {
              updated.organicGrowthRate = capGrowthRate(updated.organicGrowthRate + sectorEvent.growthEffect); // M-4
            }
            return updated;
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

    // Unsolicited offer handling is done separately when player accepts/declines
    case 'unsolicited_offer':
      break;

    case 'global_quiet':
    default:
      break;
  }

  // Attach impacts to the event in state
  newState.currentEvent = event.type !== 'unsolicited_offer' && impacts.length > 0
    ? { ...event, impacts }
    : event;

  return newState;
}

export function calculateMetrics(state: GameState): Metrics {
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const sharedServicesBenefits = calculateSharedServicesBenefits(state);

  // Total EBITDA (annual)
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);

  // H-5: Shared services annual cost
  const sharedServicesCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);

  // Total FCF (annual - each round is now 1 year)
  // Portfolio-level tax is computed inside calculatePortfolioFcf
  const totalFcf = calculatePortfolioFcf(
    activeBusinesses,
    sharedServicesBenefits.capexReduction,
    sharedServicesBenefits.cashConversionBonus,
    state.totalDebt,
    state.interestRate,
    sharedServicesCost
  );

  // Portfolio tax breakdown for NOPAT calculation
  const taxBreakdown = calculatePortfolioTax(
    activeBusinesses, state.totalDebt, state.interestRate, sharedServicesCost
  );

  // Total debt (holdco + opco level seller notes only)
  // L-13: Bank debt is tracked at holdco level (state.totalDebt) only
  const opcoDebt = activeBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance,
    0
  );
  const totalDebt = state.totalDebt + opcoDebt;

  // Interest expense
  const annualInterest = state.totalDebt * state.interestRate;
  const opcoInterest = activeBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance * b.sellerNoteRate,
    0
  );

  // Net FCF after interest and shared services costs
  const netFcf = totalFcf - annualInterest - opcoInterest - sharedServicesCost;

  // Portfolio value (using sector average multiples)
  const portfolioValue = activeBusinesses.reduce((sum, b) => {
    const sector = SECTORS[b.sectorId];
    const avgMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
    return sum + b.ebitda * avgMultiple;
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

  // MOIC
  const totalReturns = state.totalDistributions + state.totalExitProceeds + portfolioValue + state.cash;
  const portfolioMoic = state.totalInvestedCapital > 0 ? totalReturns / state.totalInvestedCapital : 1;

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
  };
}

export function recordHistoricalMetrics(state: GameState): HistoricalMetrics {
  const metrics = calculateMetrics(state);
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);

  // Use portfolio-level tax for NOPAT (includes deductions)
  const sharedServicesCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);
  const taxBreakdown = calculatePortfolioTax(
    activeBusinesses, state.totalDebt, state.interestRate, sharedServicesCost
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
