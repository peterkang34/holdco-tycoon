import {
  GameState,
  Business,
  GameEvent,
  EventImpact,
  ExitValuation,
  SectorFocusBonus,
  SectorFocusTier,
  Metrics,
  HistoricalMetrics,
  randomInRange,
  randomInt,
  pickRandom,
} from './types';
import { SECTORS } from '../data/sectors';
import { GLOBAL_EVENTS, PORTFOLIO_EVENTS, SECTOR_EVENTS, SectorEventDefinition } from '../data/events';

const TAX_RATE = 0.30;

// Calculate exit valuation for a business with full breakdown
export function calculateExitValuation(
  business: Business,
  currentRound: number,
  lastEventType?: string
): ExitValuation {
  // Start with acquisition multiple as baseline
  const baseMultiple = business.acquisitionMultiple;

  // EBITDA growth premium: if EBITDA grew, you've created value
  const ebitdaGrowth = (business.ebitda - business.acquisitionEbitda) / business.acquisitionEbitda;
  const growthPremium = ebitdaGrowth > 0 ? Math.min(1.0, ebitdaGrowth * 0.5) : ebitdaGrowth * 0.3;

  // Quality premium: higher quality businesses command higher multiples
  const qualityPremium = (business.qualityRating - 3) * 0.3;

  // Platform premium: platforms with scale command roll-up premiums
  const platformPremium = business.isPlatform ? (business.platformScale * 0.3) : 0;

  // Hold period premium: longer holds show stability (max +0.5x for 5+ years)
  const yearsHeld = currentRound - business.acquisitionRound;
  const holdPremium = Math.min(0.5, yearsHeld * 0.1);

  // Improvements premium: investments in the business increase value
  const improvementsPremium = business.improvements.length * 0.15;

  // Market conditions modifier (deterministic for display, randomized on actual sale)
  let marketModifier = 0;
  if (lastEventType === 'global_bull_market') marketModifier = 0.5;
  if (lastEventType === 'global_recession') marketModifier = -0.5;

  // Calculate exit multiple
  const totalMultiple = Math.max(
    2.0, // Absolute floor - distressed sale
    baseMultiple + growthPremium + qualityPremium + platformPremium + holdPremium + improvementsPremium + marketModifier
  );

  const exitPrice = Math.round(business.ebitda * totalMultiple);

  // Net proceeds after debt payoff
  const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance;
  const netProceeds = Math.max(0, exitPrice - debtPayoff);

  return {
    baseMultiple,
    growthPremium,
    qualityPremium,
    platformPremium,
    holdPremium,
    improvementsPremium,
    marketModifier,
    totalMultiple,
    exitPrice,
    netProceeds,
    ebitdaGrowth,
    yearsHeld,
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

  // Tax
  const tax = annualEbitda * TAX_RATE;

  // FCF before cash conversion bonus
  let fcf = annualEbitda - capex - tax;

  // Apply cash conversion bonus
  fcf *= 1 + sharedServicesCashConversionBonus;

  return Math.round(fcf);
}

export function calculatePortfolioFcf(
  businesses: Business[],
  sharedServicesCapexReduction: number = 0,
  sharedServicesCashConversionBonus: number = 0
): number {
  return businesses
    .filter(b => b.status === 'active')
    .reduce(
      (total, b) =>
        total + calculateAnnualFcf(b, sharedServicesCapexReduction, sharedServicesCashConversionBonus),
      0
    );
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
  const scaleMultiplier = opcoCount >= 5 ? 1.2 : 1.0;

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
    focusGroup: maxGroup as any,
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

  // Base annual growth (each round = 1 year)
  let annualGrowth = business.organicGrowthRate;

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

  // Calculate new EBITDA
  let newEbitda = Math.round(business.ebitda * (1 + annualGrowth));

  // Floor at 30% of acquisition EBITDA
  const floor = Math.round(business.acquisitionEbitda * 0.3);
  newEbitda = Math.max(newEbitda, floor);

  // Update peak EBITDA
  const newPeak = Math.max(business.peakEbitda, newEbitda);

  // Decrease integration period (now in years)
  const newIntegration = Math.max(0, business.integrationRoundsRemaining - 1);

  return {
    ...business,
    ebitda: newEbitda,
    peakEbitda: newPeak,
    integrationRoundsRemaining: newIntegration,
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
      if (eventDef.type === 'portfolio_talent_leaves') {
        adjustedProb *= 1 - sharedServicesBenefits.talentRetentionBonus;
      } else if (eventDef.type === 'portfolio_star_joins') {
        adjustedProb *= 1 + sharedServicesBenefits.talentGainBonus;
      }

      cumulativeProb += adjustedProb;
      if (portfolioRoll < cumulativeProb) {
        const affectedBusiness = pickRandom(activeBusinesses);
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

  // Roll for unsolicited offer (5% per opco)
  for (const business of activeBusinesses) {
    if (Math.random() < 0.05) {
      const sector = SECTORS[business.sectorId];
      const baseMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
      const premiumMultiple = baseMultiple * (1.2 + Math.random() * 0.6); // 1.2x to 1.8x market
      const offerAmount = Math.round(business.ebitda * premiumMultiple);

      return {
        id: `event_${state.round}_unsolicited_${business.id}`,
        type: 'unsolicited_offer',
        title: 'Unsolicited Acquisition Offer',
        description: `A buyer has approached you with an offer to acquire ${business.name} for ${formatMoney(offerAmount)} (${premiumMultiple.toFixed(1)}x EBITDA).`,
        effect: 'Accept to sell immediately, or decline to keep the business',
        tip: "The best holdcos know when to sell. If the price is right and you can redeploy capital at higher returns, it's worth considering.",
        tipSource: 'Ch. IV',
        affectedBusinessId: business.id,
        offerAmount,
      };
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

function formatMoney(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}M`;
  }
  return `$${amount}k`;
}

export function applyEventEffects(state: GameState, event: GameEvent): GameState {
  let newState = { ...state };
  const activeBusinesses = newState.businesses.filter(b => b.status === 'active');
  const impacts: EventImpact[] = [];

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
        deltaPercent: (after - before) / before,
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
        deltaPercent: (after - before) / before,
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
            organicGrowthRate: b.organicGrowthRate + 0.02,
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
            organicGrowthRate: b.organicGrowthRate - 0.015,
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
        impacts.push({
          metric: 'cash',
          before: state.cash,
          after: state.cash - 500,
          delta: -500,
        });
        newState.cash -= 500; // $500k cost
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
              updated.organicGrowthRate += sectorEvent.growthEffect;
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
              updated.organicGrowthRate += sectorEvent.growthEffect;
            }
            return updated;
          });
        }

        // Apply cost if any
        if (sectorEvent.costAmount) {
          impacts.push({
            metric: 'cash',
            before: state.cash,
            after: state.cash - sectorEvent.costAmount,
            delta: -sectorEvent.costAmount,
          });
          newState.cash -= sectorEvent.costAmount;
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

  // Total FCF (annual - each round is now 1 year)
  const totalFcf = calculatePortfolioFcf(
    activeBusinesses,
    sharedServicesBenefits.capexReduction,
    sharedServicesBenefits.cashConversionBonus
  );

  // Total debt (holdco + opco level)
  const opcoDebt = activeBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance,
    0
  );
  const totalDebt = state.totalDebt + opcoDebt;

  // Interest expense
  const annualInterest = state.totalDebt * state.interestRate;
  const opcoInterest = activeBusinesses.reduce(
    (sum, b) => sum + b.sellerNoteBalance * b.sellerNoteRate + b.bankDebtBalance * state.interestRate,
    0
  );

  // Net FCF after interest
  const netFcf = totalFcf - annualInterest - opcoInterest;

  // Shared services annual cost
  const sharedServicesCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);

  // Portfolio value (using sector average multiples)
  const portfolioValue = activeBusinesses.reduce((sum, b) => {
    const sector = SECTORS[b.sectorId];
    const avgMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
    return sum + b.ebitda * avgMultiple;
  }, 0);

  // Intrinsic value per share
  const intrinsicValue = portfolioValue + state.cash - totalDebt;
  const intrinsicValuePerShare = intrinsicValue / state.sharesOutstanding;

  // FCF per share
  const fcfPerShare = netFcf / state.sharesOutstanding;

  // ROIC
  const nopat = totalEbitda * (1 - TAX_RATE);
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
  const nopat = totalEbitda * (1 - TAX_RATE);

  return {
    round: state.round,
    metrics,
    fcf: metrics.totalFcf,
    nopat,
    investedCapital: state.totalInvestedCapital,
  };
}
