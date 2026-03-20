/**
 * Playtest Simulator — Core Game Loop Replication
 *
 * Faithfully replicates the real waterfall from useGame.ts using pure engine functions.
 * No Zustand, no React, no async — just deterministic game simulation.
 */

import type {
  GameState,
  GamePhase,
  Business,
  SectorId,
  GameDifficulty,
  GameDuration,
  QualityRating,
  RoundHistoryEntry,
  ActiveTurnaround,
  OperationalImprovementType,
} from '../../types';

// Engine functions
import {
  calculatePortfolioFcf,
  calculateSharedServicesBenefits,
  calculateSectorFocusBonus,
  getSectorFocusEbitdaBonus,
  applyOrganicGrowth,
  generateEvent,
  applyEventEffects,
  calculateMetrics,
  recordHistoricalMetrics,
  calculateExitValuation,
  calculateComplexityCost,
} from '../../simulation';
import {
  generateDealPipeline,
  createStartingBusiness,
  resetBusinessIdCounter,
  generateDealWithSize,
  pickWeightedSector,
  calculateDealInflation,
  determineIntegrationOutcome,
  calculateSynergies,
  getSubTypeAffinity,
  getSizeRatioTier,
  calculateIntegrationGrowthPenalty,
} from '../../businesses';
import { generateDealStructures, executeDealStructure, calculateLendingSynergyDiscount } from '../../deals';
import { calculateFinalScore, calculateEnterpriseValue, calculateFounderEquityValue, calculatePEFundScore } from '../../scoring';
import { getDistressRestrictions } from '../../distress';
import { createRngStreams } from '../../rng';
import { resolveTurnaround, calculateTurnaroundCost, getTurnaroundDuration } from '../../turnarounds';
import { checkPlatformEligibility, calculateIntegrationCost, forgePlatform } from '../../platforms';
import { processEarningsResult, calculateStockPrice } from '../../ipo';

// Data imports
import {
  DIFFICULTY_CONFIG, DURATION_CONFIG, EARNOUT_EXPIRATION_YEARS, COVENANT_BREACH_ROUNDS_THRESHOLD,
  KEY_MAN_SUCCESSION_ROUNDS, EQUITY_DILUTION_STEP, EQUITY_DILUTION_FLOOR, EQUITY_BUYBACK_COOLDOWN,
  MIN_FOUNDER_OWNERSHIP, TURNAROUND_CEILING_BONUS, IMPROVEMENT_COST_FLOOR,
  STABILIZATION_TYPES, GROWTH_TYPES, STABILIZATION_EFFICACY_MULTIPLIER, QUALITY_IMPROVEMENT_MULTIPLIER,
  PE_FUND_CONFIG, FUND_MANAGER_CONFIG,
} from '../../../data/gameConfig';
import { getQualityImprovementChance } from '../../turnarounds';
import { initializeSharedServices, getMASourcingAnnualCost } from '../../../data/sharedServices';
import { getTurnaroundTierAnnualCost, getProgramById, getQualityCeiling } from '../../../data/turnaroundPrograms';
import { SECTORS } from '../../../data/sectors';
import { resetUsedNames } from '../../../data/names';
import { clampMargin, capGrowthRate } from '../../helpers';

// Playtest types
import type { PlaytestStrategy } from './strategies';
import { PlaytestCoverage } from './coverage';
import type { PlaytestResult } from './assertions';

// ── Constants ──

const STARTING_INTEREST_RATE = 0.07;

// ── Helper: computeTotalDebt ──

function computeTotalDebt(businesses: Business[], holdcoLoanBalance: number): number {
  return holdcoLoanBalance + businesses
    .filter(b => b.status === 'active' || b.status === 'integrated')
    .reduce((sum, b) => sum + b.bankDebtBalance, 0);
}

// ── Helper: runFinalCollection ──

function runFinalCollection(state: GameState): { cash: number; businesses: Business[]; holdcoLoanBalance: number } {
  let cash = state.cash;
  let holdcoLoanBalance = state.holdcoLoanBalance;

  if (holdcoLoanBalance > 0) {
    const holdcoInterest = Math.round(holdcoLoanBalance * (state.holdcoLoanRate || 0));
    const holdcoOwed = holdcoInterest + holdcoLoanBalance;
    const holdcoPaid = Math.min(holdcoOwed, Math.max(0, cash));
    cash -= holdcoPaid;
    holdcoLoanBalance = Math.max(0, holdcoOwed - holdcoPaid);
  }

  const businesses = state.businesses.map(b => {
    if (b.status !== 'active' && b.status !== 'integrated') return b;
    const updated = { ...b };

    if (b.sellerNoteBalance > 0) {
      const interest = Math.round(b.sellerNoteBalance * b.sellerNoteRate);
      const owed = interest + b.sellerNoteBalance;
      const paid = Math.min(owed, Math.max(0, cash));
      cash -= paid;
      updated.sellerNoteBalance = Math.max(0, owed - paid);
      if (updated.sellerNoteBalance === 0) updated.sellerNoteRoundsRemaining = 0;
    }

    if (b.bankDebtBalance > 0) {
      const interest = Math.round(b.bankDebtBalance * (b.bankDebtRate || 0));
      const owed = interest + b.bankDebtBalance;
      const paid = Math.min(owed, Math.max(0, cash));
      cash -= paid;
      updated.bankDebtBalance = Math.max(0, owed - paid);
      if (updated.bankDebtBalance === 0) updated.bankDebtRoundsRemaining = 0;
    }

    if (b.earnoutRemaining > 0) {
      const paid = Math.min(b.earnoutRemaining, Math.max(0, cash));
      cash -= paid;
      updated.earnoutRemaining = b.earnoutRemaining - paid;
      if (updated.earnoutRemaining === 0) updated.earnoutTarget = 0;
    }

    return updated;
  });

  return { cash, businesses, holdcoLoanBalance };
}

// ── Core: Initialize Game State ──

function initializeGameState(config: {
  seed: number;
  difficulty: GameDifficulty;
  duration: GameDuration;
  startingSector?: SectorId;
  isFundManagerMode?: boolean;
}): GameState {
  resetBusinessIdCounter();
  resetUsedNames();

  const { seed, difficulty, duration, startingSector = 'agency', isFundManagerMode = false } = config;

  // PE Fund Mode: separate initialization path
  if (isFundManagerMode) {
    const maxRounds = DURATION_CONFIG.quick.rounds; // PE fund is always 10yr
    const state: GameState = {
      holdcoName: 'Playtest PE Fund',
      seed,
      difficulty: 'easy', // PE fund uses easy difficulty base
      duration: 'quick',
      maxRounds,
      round: 1,
      phase: 'collect' as GamePhase,
      gameOver: false,
      businesses: [],
      exitedBusinesses: [],
      cash: PE_FUND_CONFIG.fundSize, // $100M
      totalDebt: 0,
      holdcoLoanBalance: 0,
      holdcoLoanRate: 0,
      holdcoLoanRoundsRemaining: 0,
      interestRate: STARTING_INTEREST_RATE,
      sharesOutstanding: FUND_MANAGER_CONFIG.totalShares,
      founderShares: 1, // GP needs > 0 for invariant checks
      initialRaiseAmount: PE_FUND_CONFIG.fundSize,
      initialOwnershipPct: 0,
      totalInvestedCapital: 0,
      totalDistributions: 0,
      totalBuybacks: 0,
      totalExitProceeds: 0,
      equityRaisesUsed: 0,
      lastEquityRaiseRound: 0,
      lastBuybackRound: 0,
      sharedServices: initializeSharedServices(),
      dealPipeline: [],
      passedDealIds: [],
      maFocus: { sectorId: null, sizePreference: 'any', subType: null },
      maSourcing: { tier: PE_FUND_CONFIG.startingMaSourcingTier, active: true, unlockedRound: 0, lastUpgradeRound: 0 },
      currentEvent: null,
      pendingProSportsEvent: null,
      eventHistory: [],
      creditTighteningRoundsRemaining: 0,
      inflationRoundsRemaining: 0,
      metricsHistory: [],
      roundHistory: [],
      actionsThisRound: [],
      debtPaymentThisRound: 0,
      cashBeforeDebtPayments: 0,
      holdcoDebtStartRound: 0,
      requiresRestructuring: false,
      covenantBreachRounds: 0,
      hasRestructured: false,
      acquisitionsThisRound: 0,
      maxAcquisitionsPerRound: 3,
      lastAcquisitionResult: null,
      lastIntegrationOutcome: null,
      exitMultiplePenalty: 0,
      integratedPlatforms: [],
      turnaroundTier: 0 as any,
      activeTurnarounds: [],
      founderDistributionsReceived: 0,
      isChallenge: false,
      dealInflationState: { crisisResetRoundsRemaining: 0 },
      ipoState: null,
      familyOfficeState: null,
      // PE Fund Mode fields
      isFundManagerMode: true,
      fundName: 'Playtest Capital Partners',
      fundSize: PE_FUND_CONFIG.fundSize,
      managementFeesCollected: 0,
      lpSatisfactionScore: PE_FUND_CONFIG.lpSatisfactionStart,
      lpDistributions: 0,
      totalCapitalDeployed: 0,
    };
    return {
      ...state,
      metrics: calculateMetrics(state),
      focusBonus: null,
    } as GameState;
  }

  const diffConfig = DIFFICULTY_CONFIG[difficulty];
  const durConfig = DURATION_CONFIG[duration];
  const maxRounds = durConfig.rounds;

  const round1Streams = createRngStreams(seed, 1);
  const startingBusiness = createStartingBusiness(
    startingSector,
    diffConfig.startingEbitda,
    diffConfig.startingMultipleCap,
    round1Streams.cosmetic,
  );

  const holdcoLoanBalance = diffConfig.startingDebt;
  const holdcoLoanRate = holdcoLoanBalance > 0 ? STARTING_INTEREST_RATE : 0;
  const holdcoLoanRoundsRemaining = holdcoLoanBalance > 0
    ? (duration === 'quick' ? maxRounds : Math.max(4, Math.ceil(maxRounds * 0.50)))
    : 0;

  const state: GameState = {
    holdcoName: 'Playtest Holdco',
    seed,
    difficulty,
    duration,
    maxRounds,
    round: 1,
    phase: 'collect' as GamePhase,
    gameOver: false,
    businesses: [startingBusiness],
    exitedBusinesses: [],
    cash: diffConfig.initialCash - startingBusiness.acquisitionPrice,
    totalDebt: diffConfig.startingDebt,
    holdcoLoanBalance,
    holdcoLoanRate,
    holdcoLoanRoundsRemaining,
    interestRate: STARTING_INTEREST_RATE,
    sharesOutstanding: diffConfig.totalShares,
    founderShares: diffConfig.founderShares,
    initialRaiseAmount: diffConfig.initialCash,
    initialOwnershipPct: diffConfig.founderShares / diffConfig.totalShares,
    totalInvestedCapital: startingBusiness.acquisitionPrice,
    totalDistributions: 0,
    totalBuybacks: 0,
    totalExitProceeds: 0,
    equityRaisesUsed: 0,
    lastEquityRaiseRound: 0,
    lastBuybackRound: 0,
    sharedServices: initializeSharedServices(),
    dealPipeline: [],
    passedDealIds: [],
    maFocus: { sectorId: null, sizePreference: 'any', subType: null },
    maSourcing: { tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 },
    currentEvent: null,
    pendingProSportsEvent: null,
    eventHistory: [],
    creditTighteningRoundsRemaining: 0,
    inflationRoundsRemaining: 0,
    metricsHistory: [],
    roundHistory: [],
    actionsThisRound: [],
    debtPaymentThisRound: 0,
    cashBeforeDebtPayments: 0,
    holdcoDebtStartRound: diffConfig.holdcoDebtStartRound,
    requiresRestructuring: false,
    covenantBreachRounds: 0,
    hasRestructured: false,
    acquisitionsThisRound: 0,
    maxAcquisitionsPerRound: 2,
    lastAcquisitionResult: null,
    lastIntegrationOutcome: null,
    exitMultiplePenalty: 0,
    integratedPlatforms: [],
    turnaroundTier: 0 as any,
    activeTurnarounds: [],
    founderDistributionsReceived: 0,
    isChallenge: false,
    dealInflationState: { crisisResetRoundsRemaining: 0 },
    ipoState: null,
    familyOfficeState: null,
  };

  return {
    ...state,
    metrics: calculateMetrics(state),
    focusBonus: calculateSectorFocusBonus(state.businesses),
  } as GameState;
}

// ── Phase 1: Collect → Event (advanceToEvent) ──

function simulateCollectToEvent(state: GameState, coverage: PlaytestCoverage): GameState {
  coverage.record('collect_phase', state.round);

  const roundStreams = createRngStreams(state.seed, state.round);
  const sharedBenefits = calculateSharedServicesBenefits(state);

  const sharedServicesCost = state.sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);

  const maSourcingCost = state.maSourcing.active
    ? getMASourcingAnnualCost(state.maSourcing.tier)
    : 0;

  const turnaroundTierCost = getTurnaroundTierAnnualCost(state.turnaroundTier);

  const turnaroundProgramCosts = state.activeTurnarounds
    .filter(t => t.status === 'active')
    .reduce((sum, t) => {
      const prog = getProgramById(t.programId);
      return sum + (prog ? prog.annualCost : 0);
    }, 0);

  // Distress interest penalty
  const currentMetrics = calculateMetrics(state);
  const distressRestrictions = getDistressRestrictions(currentMetrics.distressLevel);

  if (currentMetrics.distressLevel === 'breach') {
    coverage.record('covenant_breach', state.round);
  }

  // Portfolio FCF
  const totalDeductibleCosts = sharedServicesCost + maSourcingCost;
  const annualFcf = calculatePortfolioFcf(
    state.businesses.filter(b => b.status === 'active'),
    sharedBenefits.capexReduction,
    sharedBenefits.cashConversionBonus,
    state.holdcoLoanBalance,
    state.holdcoLoanRate + distressRestrictions.interestPenalty,
    totalDeductibleCosts,
  );

  // Holdco loan P&I
  let holdcoLoanPayment = 0;
  let updatedHoldcoLoanBalance = state.holdcoLoanBalance;
  let updatedHoldcoLoanRoundsRemaining = state.holdcoLoanRoundsRemaining;
  if (state.holdcoLoanBalance > 0 && state.holdcoLoanRoundsRemaining > 0) {
    const holdcoInterest = Math.round(state.holdcoLoanBalance * (state.holdcoLoanRate + distressRestrictions.interestPenalty));
    const holdcoPrincipal = Math.round(state.holdcoLoanBalance / state.holdcoLoanRoundsRemaining);
    holdcoLoanPayment = holdcoInterest + holdcoPrincipal;
    updatedHoldcoLoanBalance = Math.max(0, state.holdcoLoanBalance - holdcoPrincipal);
    updatedHoldcoLoanRoundsRemaining = state.holdcoLoanRoundsRemaining - 1;
  }

  // Complexity cost
  const totalRevenue = state.businesses
    .filter(b => b.status === 'active')
    .reduce((sum, b) => sum + b.revenue, 0);
  const complexityCost = calculateComplexityCost(
    state.businesses,
    state.sharedServices,
    totalRevenue,
    state.duration,
    state.integratedPlatforms,
  );
  if (complexityCost.netCost > 0) {
    coverage.record('complexity_cost_triggered', state.round);
  }

  let newCash = state.cash + annualFcf - holdcoLoanPayment - sharedServicesCost - maSourcingCost - turnaroundTierCost - turnaroundProgramCosts - complexityCost.netCost;

  // Opco-level debt waterfall
  let opcoDebtAdjustment = 0;
  const updatedBusinesses = state.businesses.map(b => {
    if (b.status !== 'active' && b.status !== 'integrated') return b;
    let updated = { ...b };

    // Seller note P&I
    if (b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining > 0) {
      const interest = Math.round(b.sellerNoteBalance * b.sellerNoteRate);
      const principal = Math.round(b.sellerNoteBalance / b.sellerNoteRoundsRemaining);
      const totalPayment = interest + principal;
      const availableForPayment = Math.max(0, newCash + opcoDebtAdjustment);
      const actualPayment = Math.min(totalPayment, availableForPayment);
      opcoDebtAdjustment -= actualPayment;
      const principalPaid = Math.max(0, actualPayment - interest);
      updated.sellerNoteBalance = Math.max(0, b.sellerNoteBalance - principalPaid);
      if (actualPayment >= totalPayment) {
        updated.sellerNoteRoundsRemaining = b.sellerNoteRoundsRemaining - 1;
      }
    }
    // Final balance when rounds expire
    if (updated.sellerNoteRoundsRemaining <= 0 && updated.sellerNoteBalance > 0) {
      const availableForFinal = Math.max(0, newCash + opcoDebtAdjustment);
      const finalPayment = Math.min(updated.sellerNoteBalance, availableForFinal);
      opcoDebtAdjustment -= finalPayment;
      updated.sellerNoteBalance = updated.sellerNoteBalance - finalPayment;
    }

    // Earn-out expiration
    if (b.earnoutRemaining > 0 && state.round - b.acquisitionRound > EARNOUT_EXPIRATION_YEARS) {
      updated.earnoutRemaining = 0;
      updated.earnoutTarget = 0;
    }

    // Earnout payments (conditional on growth)
    if (updated.earnoutRemaining > 0 && updated.earnoutTarget > 0) {
      let actualGrowth = 0;
      if (b.status === 'integrated' && b.parentPlatformId) {
        const platform = state.businesses.find(p => p.id === b.parentPlatformId && p.status === 'active');
        if (platform && platform.acquisitionEbitda > 0) {
          actualGrowth = (platform.ebitda - platform.acquisitionEbitda) / platform.acquisitionEbitda;
        }
      } else if (b.acquisitionEbitda > 0) {
        actualGrowth = (b.ebitda - b.acquisitionEbitda) / b.acquisitionEbitda;
      }
      if (actualGrowth >= b.earnoutTarget) {
        const availableForEarnout = Math.max(0, newCash + opcoDebtAdjustment);
        const earnoutPayment = Math.min(b.earnoutRemaining, availableForEarnout);
        if (earnoutPayment > 0) {
          opcoDebtAdjustment -= earnoutPayment;
          updated.earnoutRemaining = b.earnoutRemaining - earnoutPayment;
          if (updated.earnoutRemaining <= 0) {
            updated.earnoutTarget = 0;
          }
          coverage.record('acquisition_earnout', state.round);
        }
      }
    }

    // Bank debt P&I
    if (b.bankDebtBalance > 0 && b.bankDebtRoundsRemaining > 0) {
      const bankInterest = Math.round(b.bankDebtBalance * (b.bankDebtRate || state.interestRate));
      const bankPrincipal = Math.round(b.bankDebtBalance / b.bankDebtRoundsRemaining);
      const totalBankPayment = bankInterest + bankPrincipal;
      const availableForBank = Math.max(0, newCash + opcoDebtAdjustment);
      const actualBankPayment = Math.min(totalBankPayment, availableForBank);
      opcoDebtAdjustment -= actualBankPayment;
      const bankPrincipalPaid = Math.max(0, actualBankPayment - bankInterest);
      updated.bankDebtBalance = Math.max(0, b.bankDebtBalance - bankPrincipalPaid);
      if (actualBankPayment >= totalBankPayment) {
        updated.bankDebtRoundsRemaining = b.bankDebtRoundsRemaining - 1;
      }
    }
    // Final bank debt when rounds expire
    if (updated.bankDebtRoundsRemaining !== undefined && updated.bankDebtRoundsRemaining <= 0 && (updated.bankDebtBalance ?? b.bankDebtBalance) > 0) {
      const remainingBalance = updated.bankDebtBalance ?? b.bankDebtBalance;
      const availableForFinal = Math.max(0, newCash + opcoDebtAdjustment);
      const finalPayment = Math.min(remainingBalance, availableForFinal);
      opcoDebtAdjustment -= finalPayment;
      updated.bankDebtBalance = remainingBalance - finalPayment;
    }

    return updated;
  });

  newCash = newCash + opcoDebtAdjustment;

  // PE Fund Mode: management fee deduction
  if (state.isFundManagerMode) {
    const mgmtFee = PE_FUND_CONFIG.annualManagementFee;
    newCash -= mgmtFee;
    coverage.record('management_fee_deducted', state.round);
  }

  // Negative cash handling
  let requiresRestructuring = state.requiresRestructuring;
  let gameOverFromNegativeCash = false;
  let negativeCashBankruptRound: number | undefined;
  if (newCash < 0) {
    if (state.hasRestructured) {
      gameOverFromNegativeCash = true;
      negativeCashBankruptRound = state.round;
    } else {
      requiresRestructuring = true;
      coverage.record('restructuring', state.round);
    }
    newCash = 0;
  }

  // Generate event
  const event = generateEvent(state, roundStreams.events);
  const newTotalDebt = computeTotalDebt(updatedBusinesses, updatedHoldcoLoanBalance);

  // Bankruptcy from negative cash
  if (gameOverFromNegativeCash) {
    const bankruptState: GameState = {
      ...state,
      businesses: updatedBusinesses,
      cash: 0,
      totalDebt: newTotalDebt,
      holdcoLoanBalance: updatedHoldcoLoanBalance,
      holdcoLoanRoundsRemaining: updatedHoldcoLoanRoundsRemaining,
      gameOver: true,
      bankruptRound: negativeCashBankruptRound,
      requiresRestructuring: false,
    };
    return {
      ...bankruptState,
      metrics: calculateMetrics(bankruptState),
    } as GameState;
  }

  let gameState: GameState = {
    ...state,
    businesses: updatedBusinesses,
    cash: Math.round(newCash),
    totalDebt: newTotalDebt,
    holdcoLoanBalance: updatedHoldcoLoanBalance,
    holdcoLoanRoundsRemaining: updatedHoldcoLoanRoundsRemaining,
    currentEvent: event,
    requiresRestructuring,
    phase: requiresRestructuring ? 'restructure' as GamePhase : 'event' as GamePhase,
  };

  // Apply event effects for non-choice events
  const skipEffects = event && (
    event.type === 'unsolicited_offer' ||
    event.type === 'portfolio_equity_demand' ||
    event.type === 'portfolio_seller_note_renego' ||
    event.type === 'portfolio_earnout_dispute' ||
    event.type === 'mbo_proposal'
  );

  if (event && !skipEffects && !requiresRestructuring) {
    gameState = applyEventEffects(gameState, event, roundStreams.events);
  }

  // Track event types for coverage
  if (event) {
    coverage.record('event_phase', state.round);
    if (event.type.startsWith('global_')) {
      coverage.record('event_economic', state.round);
    } else if (event.type.startsWith('portfolio_')) {
      coverage.record('event_portfolio', state.round);
    } else if (event.type === 'sector_event' || event.type === 'sector_consolidation_boom') {
      coverage.record('event_sector', state.round);
    }
    if (event.type.startsWith('filler_')) {
      coverage.record('quiet_year_capped', state.round);
      coverage.record('filler_event_choice', state.round);
    }
  }

  // Referral deal injection
  if (event && event.type === 'portfolio_referral_deal') {
    const referralSector = pickWeightedSector(state.round, state.maxRounds, roundStreams.deals);
    const referralDeal = generateDealWithSize(referralSector, state.round, 'any', 0, {
      qualityFloor: 3 as QualityRating,
      source: 'sourced',
      maxRounds: state.maxRounds,
    }, roundStreams.deals);
    gameState.dealPipeline = [...gameState.dealPipeline, referralDeal];
  }

  // Decrement counters
  if (gameState.creditTighteningRoundsRemaining > 0) {
    gameState.creditTighteningRoundsRemaining--;
  }
  if (gameState.inflationRoundsRemaining > 0) {
    gameState.inflationRoundsRemaining--;
  }
  if (gameState.dealInflationState?.crisisResetRoundsRemaining > 0) {
    gameState.dealInflationState = {
      ...gameState.dealInflationState,
      crisisResetRoundsRemaining: gameState.dealInflationState.crisisResetRoundsRemaining - 1,
    };
  }

  // Resolve turnarounds
  let resolvedTurnarounds = [...(gameState.activeTurnarounds || state.activeTurnarounds)];
  let businessesAfterTurnarounds = [...gameState.businesses];
  const activeCount = resolvedTurnarounds.filter(t => t.status === 'active').length;

  for (let i = 0; i < resolvedTurnarounds.length; i++) {
    const ta = resolvedTurnarounds[i];
    if (ta.status !== 'active') continue;
    if (state.round < ta.endRound) continue;

    const prog = getProgramById(ta.programId);
    const biz = businessesAfterTurnarounds.find(b => b.id === ta.businessId);
    if (!prog || !biz) continue;

    const result = resolveTurnaround(prog, activeCount, roundStreams.market.fork(ta.businessId).next());
    const newStatus = result.result === 'success' ? 'completed' as const
      : result.result === 'partial' ? 'partial' as const
      : 'failed' as const;

    resolvedTurnarounds[i] = { ...ta, status: newStatus };

    businessesAfterTurnarounds = businessesAfterTurnarounds.map(b => {
      if (b.id !== ta.businessId) return b;
      const newEbitda = Math.round(b.ebitda * result.ebitdaMultiplier);

      // Failure branch: only apply EBITDA damage, no quality changes (matches useGame.ts)
      if (result.result === 'failure') {
        return {
          ...b,
          ebitda: newEbitda,
          peakEbitda: Math.max(b.peakEbitda, newEbitda),
        };
      }

      const ceiling = getQualityCeiling(b.sectorId);
      const newQuality = Math.min(result.targetQuality, ceiling) as QualityRating;
      const actualTiersGained = Math.max(0, newQuality - b.qualityRating);

      // Ceiling mastery bonus: one-time bonus when turnaround reaches sector ceiling
      const reachedCeiling = newQuality === ceiling && actualTiersGained > 0 && !b.ceilingMasteryBonus;

      return {
        ...b,
        qualityRating: newQuality,
        ebitda: newEbitda,
        peakEbitda: Math.max(b.peakEbitda, newEbitda),
        qualityImprovedTiers: (b.qualityImprovedTiers ?? 0) + actualTiersGained,
        ...(reachedCeiling && {
          ceilingMasteryBonus: true,
          ebitdaMargin: clampMargin(b.ebitdaMargin + TURNAROUND_CEILING_BONUS.marginBoost),
          organicGrowthRate: capGrowthRate(b.organicGrowthRate + TURNAROUND_CEILING_BONUS.growthBoost),
          revenueGrowthRate: capGrowthRate(b.revenueGrowthRate + TURNAROUND_CEILING_BONUS.growthBoost),
        }),
      };
    });

    coverage.record('turnaround_resolved', state.round);
    if (result.qualityChange > 0) {
      coverage.record('quality_improvement', state.round);
    }
    // Check if ceiling mastery was just awarded
    const updatedBiz = businessesAfterTurnarounds.find(b2 => b2.id === ta.businessId);
    if (updatedBiz?.ceilingMasteryBonus && !biz?.ceilingMasteryBonus) {
      coverage.record('ceiling_mastery_bonus', state.round);
    }
  }

  gameState.businesses = businessesAfterTurnarounds;
  gameState.activeTurnarounds = resolvedTurnarounds;

  // Succession plan countdown
  gameState.businesses = gameState.businesses.map(b => {
    if (b.status !== 'active' || !b.successionPlanRound) return b;
    if (state.round - b.successionPlanRound >= KEY_MAN_SUCCESSION_ROUNDS) {
      const restoredQuality = Math.min(5, b.qualityRating + 1) as QualityRating;
      const newMargin = clampMargin(b.ebitdaMargin + 0.015);
      return { ...b, qualityRating: restoredQuality, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin), successionPlanRound: undefined };
    }
    return b;
  });

  return {
    ...gameState,
    eventHistory: event ? [...state.eventHistory, event] : state.eventHistory,
    actionsThisRound: [],
    metrics: calculateMetrics(gameState),
  } as GameState;
}

// ── Phase 2: Event choices ──

function simulateEventChoices(
  state: GameState,
  strategy: PlaytestStrategy,
  coverage: PlaytestCoverage
): GameState {
  if (!state.currentEvent?.choices || state.currentEvent.choices.length === 0) {
    return state;
  }

  const decision = strategy.decideEvent(state, state.currentEvent);
  if (!decision) return state;

  coverage.record('event_choice_made', state.round);

  // Apply event effects after choice
  const roundStreams = createRngStreams(state.seed, state.round);
  let gameState = applyEventEffects(state, state.currentEvent, roundStreams.events);
  return {
    ...gameState,
    metrics: calculateMetrics(gameState),
  } as GameState;
}

// ── Phase 3: Restructuring (simplified) ──

function simulateRestructuring(state: GameState, coverage: PlaytestCoverage): GameState {
  if (!state.requiresRestructuring) return state;

  coverage.record('restructuring', state.round);

  // Simplified: emergency equity raise to cover shortfall
  const metrics = calculateMetrics(state);
  const intrinsicValue = metrics.intrinsicValuePerShare * state.sharesOutstanding;
  const raiseAmount = Math.max(2000, Math.round(intrinsicValue * 0.5 * 0.5)); // 50% of 50% value
  const newShares = Math.round(raiseAmount / Math.max(1, metrics.intrinsicValuePerShare * 0.5));

  coverage.record('emergency_equity', state.round);

  return {
    ...state,
    cash: state.cash + raiseAmount,
    sharesOutstanding: state.sharesOutstanding + newShares,
    requiresRestructuring: false,
    hasRestructured: true,
    covenantBreachRounds: 0,
    phase: 'event' as GamePhase,
    metrics: calculateMetrics({
      ...state,
      cash: state.cash + raiseAmount,
      sharesOutstanding: state.sharesOutstanding + newShares,
    }),
  } as GameState;
}

// ── Phase 4: Allocate ──

function simulateAllocatePhase(
  state: GameState,
  strategy: PlaytestStrategy,
  coverage: PlaytestCoverage,
): GameState {
  coverage.record('allocate_phase', state.round);

  const roundStreams = createRngStreams(state.seed, state.round);

  // Generate deal pipeline
  const focusBonus = calculateSectorFocusBonus(state.businesses);
  const totalPortfolioEbitda = state.businesses
    .filter(b => b.status === 'active')
    .reduce((sum, b) => sum + b.ebitda, 0);
  const lastEvt = state.eventHistory.length > 0
    ? state.eventHistory[state.eventHistory.length - 1].type
    : undefined;
  const dealInflationAdder = calculateDealInflation(state.round, state.duration, state.dealInflationState);
  if (dealInflationAdder > 0) {
    coverage.record('deal_inflation', state.round);
  }

  const pipeline = generateDealPipeline(
    state.dealPipeline,
    state.round,
    state.maFocus,
    focusBonus?.focusGroup,
    focusBonus?.tier,
    totalPortfolioEbitda,
    state.maSourcing.tier,
    state.maSourcing.active,
    lastEvt,
    state.maxRounds,
    state.creditTighteningRoundsRemaining > 0,
    roundStreams.deals,
    dealInflationAdder,
    state.cash,
    state.ipoState ?? null,
    state.requiresRestructuring || state.covenantBreachRounds >= 1,
  );

  // Check for prestige sector deals in pipeline
  if (pipeline.some(d => d.business.sectorId === 'privateCredit')) {
    coverage.record('prestige_sector_in_pipeline', state.round);
  }

  // Calculate lending synergy for deal structures
  const lendingSynergy = calculateLendingSynergyDiscount(
    state.businesses,
    state.creditTighteningRoundsRemaining > 0,
  );
  if (lendingSynergy > 0) {
    coverage.record('lending_synergy_applied', state.round);
  }

  // Early-game safety net: Normal mode, rounds 1-3, check for brokered micro deals
  if (
    state.difficulty === 'normal' &&
    state.round <= 3 &&
    pipeline.some(d => d.source === 'brokered' && d.business.ebitda <= 500)
  ) {
    coverage.record('early_game_safety_net', state.round);
  }

  let gameState = {
    ...state,
    phase: 'allocate' as GamePhase,
    dealPipeline: pipeline,
    actionsThisRound: [] as GameState['actionsThisRound'],
    focusBonus,
    acquisitionsThisRound: 0,
    lastAcquisitionResult: null as GameState['lastAcquisitionResult'],
    lastIntegrationOutcome: null as GameState['lastIntegrationOutcome'],
  } as GameState;

  // Get strategy decisions
  const decisions = strategy.decideAllocations(gameState, pipeline, coverage);

  // Execute shared service unlocks
  for (const svcType of decisions.sharedServicesToUnlock) {
    const svc = gameState.sharedServices.find(s => s.type === svcType && !s.active);
    if (svc && gameState.cash >= svc.unlockCost) {
      gameState = {
        ...gameState,
        cash: gameState.cash - svc.unlockCost,
        sharedServices: gameState.sharedServices.map(s =>
          s.type === svcType ? { ...s, active: true, unlockedRound: gameState.round } : s
        ),
      };
      coverage.record('shared_service_unlocked', state.round);
    }
  }

  // Execute MA sourcing upgrade
  if (decisions.upgradeMASourcing && gameState.maSourcing.tier < 3) {
    const nextTier = (gameState.maSourcing.tier + 1) as 1 | 2 | 3;
    gameState = {
      ...gameState,
      maSourcing: {
        ...gameState.maSourcing,
        tier: nextTier,
        active: true,
        unlockedRound: gameState.maSourcing.unlockedRound || gameState.round,
        lastUpgradeRound: gameState.round,
      },
    };
    coverage.record('ma_sourcing_upgraded', state.round);
  }

  // Execute turnaround tier unlock
  if (decisions.unlockTurnaroundTier && gameState.turnaroundTier < 3) {
    const nextTier = (gameState.turnaroundTier + 1) as 1 | 2 | 3;
    gameState = {
      ...gameState,
      turnaroundTier: nextTier,
    };
  }

  // Execute platform designations
  for (const bizId of decisions.platformDesignations) {
    gameState = {
      ...gameState,
      businesses: gameState.businesses.map(b =>
        b.id === bizId ? { ...b, isPlatform: true, platformScale: 1 } : b
      ),
    };
    coverage.record('platform_designation', state.round);
  }

  // Execute acquisitions
  for (const acq of decisions.acquisitions) {
    if (gameState.acquisitionsThisRound >= gameState.maxAcquisitionsPerRound) break;
    const deal = pipeline.find(d => d.id === acq.deal.id);
    if (!deal) continue;

    const structures = generateDealStructures(
      deal,
      gameState.cash,
      gameState.interestRate,
      gameState.creditTighteningRoundsRemaining > 0,
      gameState.maxRounds,
      gameState.requiresRestructuring || gameState.covenantBreachRounds >= 1,
      gameState.maSourcing.tier,
      gameState.duration,
      deal.sellerArchetype,
      gameState.ipoState ?? undefined,
      lendingSynergy,
    );

    // Find preferred structure or fall back to first affordable
    let structure = structures.find(s => s.type === acq.structurePreference && gameState.cash >= s.cashRequired);
    if (!structure) {
      structure = structures.find(s => gameState.cash >= s.cashRequired);
    }
    if (!structure) continue;

    const newBusiness = executeDealStructure(deal, structure, gameState.round, gameState.maxRounds);
    const newBusinesses = [...gameState.businesses, newBusiness];
    const newTotalDebt = computeTotalDebt(newBusinesses, gameState.holdcoLoanBalance);

    gameState = {
      ...gameState,
      cash: gameState.cash - structure.cashRequired,
      totalDebt: newTotalDebt,
      totalInvestedCapital: gameState.totalInvestedCapital + deal.effectivePrice,
      businesses: newBusinesses,
      dealPipeline: gameState.dealPipeline.filter(d => d.id !== deal.id),
      acquisitionsThisRound: gameState.acquisitionsThisRound + 1,
    };

    // Track coverage by structure type
    if (structure.type === 'all_cash') coverage.record('acquisition_cash', state.round);
    if (structure.type === 'bank_debt' || structure.type === 'seller_note_bank_debt') coverage.record('acquisition_leveraged', state.round);
    if (structure.type === 'seller_note' || structure.type === 'seller_note_bank_debt') coverage.record('acquisition_seller_note', state.round);
    if (structure.type === 'earnout') coverage.record('acquisition_earnout', state.round);
    if (structure.type === 'rollover_equity') coverage.record('acquisition_rollover', state.round);
    if (structure.type === 'share_funded') coverage.record('acquisition_share_funded', state.round);
  }

  // Execute tuck-ins
  for (const tuckIn of decisions.tuckIns) {
    if (gameState.acquisitionsThisRound >= gameState.maxAcquisitionsPerRound) break;
    const deal = pipeline.find(d => d.id === tuckIn.deal.id);
    const platform = gameState.businesses.find(b => b.id === tuckIn.platformId && b.isPlatform);
    if (!deal || !platform) continue;

    const structures = generateDealStructures(
      deal, gameState.cash, gameState.interestRate,
      gameState.creditTighteningRoundsRemaining > 0,
      gameState.maxRounds,
      gameState.requiresRestructuring || gameState.covenantBreachRounds >= 1,
      gameState.maSourcing.tier, gameState.duration, deal.sellerArchetype,
      gameState.ipoState ?? undefined,
      lendingSynergy,
    );
    const structure = structures.find(s => gameState.cash >= s.cashRequired);
    if (!structure) continue;

    const newBiz = executeDealStructure(deal, structure, gameState.round, gameState.maxRounds);
    const boltOnId = newBiz.id;

    // Integration outcome
    const affinity = getSubTypeAffinity(platform.sectorId, platform.subType, newBiz.subType);
    const sizeRatio = getSizeRatioTier(newBiz.ebitda, platform.ebitda);
    const hasSharedServices = gameState.sharedServices.some(s => s.active);
    const outcome = determineIntegrationOutcome(newBiz, platform, hasSharedServices, affinity, sizeRatio.tier);
    const synergies = calculateSynergies(outcome, newBiz.ebitda, true, affinity, sizeRatio.tier);

    // Apply integration results
    const integratedBiz: Business = {
      ...newBiz,
      status: 'integrated',
      parentPlatformId: platform.id,
      integrationOutcome: outcome,
    };

    let updatedPlatform = {
      ...platform,
      ebitda: platform.ebitda + newBiz.ebitda + synergies,
      peakEbitda: Math.max(platform.peakEbitda, platform.ebitda + newBiz.ebitda + synergies),
      platformScale: platform.platformScale + 1,
      boltOnIds: [...platform.boltOnIds, boltOnId],
      synergiesRealized: platform.synergiesRealized + synergies,
      totalAcquisitionCost: platform.totalAcquisitionCost + deal.effectivePrice,
      cashEquityInvested: (platform.cashEquityInvested ?? platform.totalAcquisitionCost) + structure.cashRequired,
    };

    // Integration failure drag
    if (outcome === 'failure') {
      const drag = calculateIntegrationGrowthPenalty(newBiz.ebitda, platform.ebitda, false);
      updatedPlatform = { ...updatedPlatform, integrationGrowthDrag: updatedPlatform.integrationGrowthDrag + drag };
      coverage.record('integration_drag', state.round);
    }

    const newBusinesses = gameState.businesses.map(b =>
      b.id === platform.id ? updatedPlatform : b
    ).concat(integratedBiz);
    const newTotalDebt = computeTotalDebt(newBusinesses, gameState.holdcoLoanBalance);

    gameState = {
      ...gameState,
      cash: gameState.cash - structure.cashRequired,
      totalDebt: newTotalDebt,
      totalInvestedCapital: gameState.totalInvestedCapital + deal.effectivePrice,
      businesses: newBusinesses,
      dealPipeline: gameState.dealPipeline.filter(d => d.id !== deal.id),
      acquisitionsThisRound: gameState.acquisitionsThisRound + 1,
    };
    coverage.record('tuck_in', state.round);
  }

  // Execute turnaround starts
  for (const ta of decisions.turnarounds) {
    const biz = gameState.businesses.find(b => b.id === ta.businessId && b.status === 'active');
    const prog = getProgramById(ta.programId);
    if (!biz || !prog) continue;

    const cost = calculateTurnaroundCost(prog, biz);
    if (gameState.cash < cost) continue;

    // Check if business already has an active turnaround
    const alreadyActive = gameState.activeTurnarounds.some(
      t => t.businessId === ta.businessId && t.status === 'active'
    );
    if (alreadyActive) continue;

    const duration = getTurnaroundDuration(prog, gameState.duration);
    const newTurnaround: ActiveTurnaround = {
      id: `ta_${gameState.round}_${ta.businessId}`,
      businessId: ta.businessId,
      programId: ta.programId,
      startRound: gameState.round,
      endRound: gameState.round + duration,
      status: 'active',
    };

    gameState = {
      ...gameState,
      cash: gameState.cash - cost,
      activeTurnarounds: [...gameState.activeTurnarounds, newTurnaround],
    };
    coverage.record('turnaround_started', state.round);

    // Track fatigue
    const activeTA = gameState.activeTurnarounds.filter(t => t.status === 'active').length;
    if (activeTA >= 4) {
      coverage.record('turnaround_fatigue', state.round);
    }
  }

  // Execute operational improvements
  for (const imp of decisions.improvements) {
    const biz = gameState.businesses.find(b => b.id === imp.businessId && b.status === 'active');
    if (!biz) continue;

    // Prevent applying same improvement twice
    if (biz.improvements.some(i => i.type === imp.improvementType)) continue;

    // Growth improvements gated behind Q3+
    if (GROWTH_TYPES.has(imp.improvementType) && biz.qualityRating < 3) {
      coverage.record('growth_improvement_gated', state.round);
      continue;
    }

    // Calculate cost (simplified — matches useGame.ts switch)
    const absEbitda = Math.abs(biz.ebitda) || 1;
    let cost: number;
    let marginBoost = 0;
    let revenueBoost = 0;
    let growthBoost = 0;
    const impStreams = createRngStreams(state.seed, state.round);

    switch (imp.improvementType) {
      case 'operating_playbook': cost = Math.round(absEbitda * 0.15); marginBoost = 0.03; break;
      case 'pricing_model': cost = Math.round(absEbitda * 0.10); marginBoost = 0.02; revenueBoost = 0.01; growthBoost = 0.01; break;
      case 'service_expansion': cost = Math.round(absEbitda * 0.20); revenueBoost = 0.08 + impStreams.market.fork(imp.businessId + '_improve').next() * 0.04; marginBoost = -0.01; break;
      case 'fix_underperformance': cost = Math.round(absEbitda * 0.12); marginBoost = 0.04; break;
      case 'recurring_revenue_conversion': cost = Math.round(absEbitda * 0.25); marginBoost = -0.02; growthBoost = 0.03; break;
      case 'management_professionalization': cost = Math.round(absEbitda * 0.18); marginBoost = 0.01; growthBoost = 0.01; break;
      case 'digital_transformation': cost = Math.round(absEbitda * 0.22); revenueBoost = 0.03; marginBoost = biz.ebitdaMargin > 0.30 ? 0.01 : 0.02; growthBoost = 0.02; break;
      default: continue;
    }

    cost = Math.max(IMPROVEMENT_COST_FLOOR, cost);
    if (gameState.cash < cost) continue;

    // Apply efficacy multipliers
    const isStabilization = STABILIZATION_TYPES.has(imp.improvementType);
    const qualityMult = (isStabilization && biz.qualityRating <= 2)
      ? STABILIZATION_EFFICACY_MULTIPLIER[biz.qualityRating as 1|2|3|4|5] ?? 1.0
      : QUALITY_IMPROVEMENT_MULTIPLIER[biz.qualityRating as 1|2|3|4|5] ?? 1.0;
    if (marginBoost > 0) marginBoost *= qualityMult;
    if (revenueBoost > 0) revenueBoost *= qualityMult;
    if (growthBoost > 0) growthBoost *= qualityMult;

    // Apply improvement to business
    gameState = {
      ...gameState,
      cash: gameState.cash - cost,
      businesses: gameState.businesses.map(b => {
        if (b.id !== imp.businessId) return b;
        const newRevenue = Math.round(b.revenue * (1 + revenueBoost));
        const newMargin = clampMargin(b.ebitdaMargin + marginBoost);
        const newEbitda = Math.round(newRevenue * newMargin);
        return {
          ...b,
          revenue: newRevenue,
          ebitdaMargin: newMargin,
          ebitda: newEbitda,
          peakEbitda: Math.max(b.peakEbitda, newEbitda),
          peakRevenue: Math.max(b.peakRevenue, newRevenue),
          organicGrowthRate: capGrowthRate(b.organicGrowthRate + growthBoost),
          revenueGrowthRate: capGrowthRate(b.revenueGrowthRate + growthBoost),
          totalAcquisitionCost: b.totalAcquisitionCost + cost,
          improvements: [...b.improvements, { type: imp.improvementType as OperationalImprovementType, appliedRound: state.round, effect: 0 }],
        };
      }),
    };

    coverage.record('operational_improvement', state.round);
    if (isStabilization && biz.qualityRating <= 2) {
      coverage.record('stabilization_improvement', state.round);
    }

    // Quality improvement roll (skip for Q1/Q2 stabilization — must use turnaround system)
    const skipQualityRoll = isStabilization && biz.qualityRating <= 2;
    if (!skipQualityRoll) {
      const updatedBiz = gameState.businesses.find(b => b.id === imp.businessId);
      if (updatedBiz) {
        const ceiling = getQualityCeiling(updatedBiz.sectorId);
        if (updatedBiz.qualityRating < ceiling) {
          const chance = getQualityImprovementChance(gameState.turnaroundTier);
          const qualStreams = createRngStreams(state.seed, state.round);
          if (qualStreams.market.fork(imp.businessId + '_quality_' + imp.improvementType).next() < chance) {
            const newQuality = Math.min(updatedBiz.qualityRating + 1, ceiling) as QualityRating;
            gameState = {
              ...gameState,
              businesses: gameState.businesses.map(b =>
                b.id === imp.businessId ? { ...b, qualityRating: newQuality } : b
              ),
            };
            coverage.record('quality_improvement', state.round);
          }
        }
      }
    }
  }

  // Forge integrated platforms
  if (decisions.forgePlatforms) {
    const eligible = checkPlatformEligibility(
      gameState.businesses,
      gameState.integratedPlatforms,
      gameState.difficulty,
      gameState.duration,
    );
    for (const recipe of eligible) {
      if (recipe.eligibleBusinesses.length >= recipe.recipe.minSubTypes) {
        const selectedIds = recipe.eligibleBusinesses.slice(0, recipe.recipe.minSubTypes).map(b => b.id);
        const integrationCost = calculateIntegrationCost(recipe.recipe, recipe.eligibleBusinesses.slice(0, recipe.recipe.minSubTypes));
        if (gameState.cash >= integrationCost) {
          const platform = forgePlatform(recipe.recipe, selectedIds, gameState.round);
          gameState = {
            ...gameState,
            cash: gameState.cash - integrationCost,
            integratedPlatforms: [...gameState.integratedPlatforms, platform],
            businesses: gameState.businesses.map(b =>
              selectedIds.includes(b.id) ? { ...b, integratedPlatformId: platform.id } : b
            ),
          };
          coverage.record('forge_platform', state.round);
          break; // One per round
        }
      }
    }
  }

  // Equity raise
  if (decisions.raiseEquity) {
    const blocked = gameState.lastBuybackRound > 0 && gameState.round - gameState.lastBuybackRound < EQUITY_BUYBACK_COOLDOWN;
    if (!blocked) {
      const metrics = calculateMetrics(gameState);
      const intrinsicValue = metrics.intrinsicValuePerShare;
      const discount = Math.max(1 - EQUITY_DILUTION_STEP * gameState.equityRaisesUsed, EQUITY_DILUTION_FLOOR);
      const pricePerShare = intrinsicValue * discount;
      if (pricePerShare > 0) {
        const newShares = 200; // Raise ~200 shares worth
        const raiseAmount = Math.round(newShares * pricePerShare);
        const ownershipAfter = gameState.founderShares / (gameState.sharesOutstanding + newShares);
        if (ownershipAfter >= MIN_FOUNDER_OWNERSHIP || (gameState.ipoState?.isPublic && ownershipAfter >= 0.10)) {
          gameState = {
            ...gameState,
            cash: gameState.cash + raiseAmount,
            sharesOutstanding: gameState.sharesOutstanding + newShares,
            equityRaisesUsed: gameState.equityRaisesUsed + 1,
            lastEquityRaiseRound: gameState.round,
          };
          coverage.record('equity_raise', state.round);
        }
      }
    }
  }

  // Distributions
  if (decisions.distributionAmount > 0 && gameState.cash >= decisions.distributionAmount) {
    const amount = decisions.distributionAmount;
    const founderPct = gameState.founderShares / gameState.sharesOutstanding;
    const founderShare = Math.round(amount * founderPct);
    gameState = {
      ...gameState,
      cash: gameState.cash - amount,
      totalDistributions: gameState.totalDistributions + amount,
      founderDistributionsReceived: gameState.founderDistributionsReceived + founderShare,
    };
    coverage.record('distribution', state.round);
  }

  // Buybacks
  if (decisions.doBuyback) {
    const blocked = gameState.lastEquityRaiseRound > 0 && gameState.round - gameState.lastEquityRaiseRound < EQUITY_BUYBACK_COOLDOWN;
    if (!blocked && gameState.cash > 2000) {
      const buybackAmount = Math.round(gameState.cash * 0.1);
      const metrics = calculateMetrics(gameState);
      // Branch pricing: public → stock price, private → intrinsic value (mirrors useGame.buybackShares)
      const isPublicCo = !!gameState.ipoState?.isPublic;
      const pricePerShare = isPublicCo ? calculateStockPrice(gameState) : metrics.intrinsicValuePerShare;
      if (pricePerShare > 0) {
        const sharesToBuy = Math.min(
          Math.round(buybackAmount / pricePerShare),
          gameState.sharesOutstanding - gameState.founderShares - 1, // Keep at least 1 non-founder share
        );
        if (sharesToBuy > 0) {
          gameState = {
            ...gameState,
            cash: gameState.cash - Math.round(sharesToBuy * pricePerShare),
            sharesOutstanding: gameState.sharesOutstanding - sharesToBuy,
            totalBuybacks: gameState.totalBuybacks + Math.round(sharesToBuy * pricePerShare),
            lastBuybackRound: gameState.round,
          };
          // Sync IPO state shares after buyback
          if (isPublicCo && gameState.ipoState) {
            gameState.ipoState = {
              ...gameState.ipoState,
              sharesOutstanding: gameState.sharesOutstanding,
            };
          }
          coverage.record('buyback', state.round);
        }
      }
    }
  }

  // Sell businesses
  for (const bizId of decisions.businessesToSell) {
    const biz = gameState.businesses.find(b => b.id === bizId && b.status === 'active');
    if (!biz) continue;

    // Simple exit: use exit valuation
    const valuation = calculateExitValuation(biz, gameState.round);
    const netProceeds = Math.max(0, valuation.netProceeds);
    const playerProceeds = Math.round(netProceeds * (1 - biz.rolloverEquityPct));

    gameState = {
      ...gameState,
      cash: gameState.cash + playerProceeds,
      totalExitProceeds: gameState.totalExitProceeds + playerProceeds,
      businesses: gameState.businesses.map(b =>
        b.id === bizId ? { ...b, status: 'sold' as const, exitPrice: valuation.exitPrice, exitRound: gameState.round } : b
      ),
      exitedBusinesses: [
        ...gameState.exitedBusinesses,
        { ...biz, status: 'sold' as const, exitPrice: valuation.exitPrice, exitRound: gameState.round },
      ],
    };
    gameState.totalDebt = computeTotalDebt(gameState.businesses, gameState.holdcoLoanBalance);

    // Track turnaround exit premium coverage
    if ((biz.qualityImprovedTiers ?? 0) >= 1) {
      coverage.record('turnaround_exit_premium', state.round);
    }
  }

  // Track SMB broker usage
  if (gameState.actionsThisRound.some(a => a.type === 'smb_broker')) {
    coverage.record('smb_broker_used', state.round);
  }

  // PE Fund Mode: LP distributions + LPAC + fund mode tracking
  if (gameState.isFundManagerMode) {
    coverage.record('fund_mode_started', state.round);

    // LP distribution: distribute excess cash above deployment needs
    const deployed = gameState.totalCapitalDeployed ?? 0;
    const minDeployForDist = PE_FUND_CONFIG.minDeploymentForDistribution;
    if (deployed >= minDeployForDist && gameState.cash > PE_FUND_CONFIG.minDistribution * 2) {
      const distAmount = Math.round(gameState.cash * 0.3);
      if (distAmount >= PE_FUND_CONFIG.minDistribution) {
        gameState = {
          ...gameState,
          cash: gameState.cash - distAmount,
          lpDistributions: (gameState.lpDistributions ?? 0) + distAmount,
        };
        coverage.record('lp_distribution', state.round);
      }
    }

    // LPAC gate: check if any acquisition exceeded concentration limit
    const activeAfter = gameState.businesses.filter(b => b.status === 'active');
    const fundSize = gameState.fundSize ?? PE_FUND_CONFIG.fundSize;
    const maxConcentration = fundSize * PE_FUND_CONFIG.maxConcentration;
    for (const b of activeAfter) {
      if (b.acquisitionPrice > maxConcentration) {
        coverage.record('lpac_triggered', state.round);
        const satisfaction = gameState.lpSatisfactionScore ?? 50;
        if (satisfaction >= PE_FUND_CONFIG.lpacAutoApproveThreshold) {
          coverage.record('lpac_approved', state.round);
        } else {
          coverage.record('lpac_denied', state.round);
        }
        break;
      }
    }

    // Track capital deployed
    const newDeployed = activeAfter.reduce((sum, b) => sum + b.acquisitionPrice, 0);
    gameState = { ...gameState, totalCapitalDeployed: newDeployed };

    // Update management fees collected
    gameState = {
      ...gameState,
      managementFeesCollected: (gameState.managementFeesCollected ?? 0) + PE_FUND_CONFIG.annualManagementFee,
    };
  }

  return {
    ...gameState,
    metrics: calculateMetrics(gameState),
  } as GameState;
}

// ── Phase 5: End Round ──

function simulateEndRound(state: GameState, coverage: PlaytestCoverage): GameState {
  coverage.record('end_round', state.round);

  const roundStreams = createRngStreams(state.seed, state.round);
  const sharedBenefits = calculateSharedServicesBenefits(state);
  const focusBonus = calculateSectorFocusBonus(state.businesses);
  const focusEbitdaBonus = focusBonus ? getSectorFocusEbitdaBonus(focusBonus.tier) : 0;

  // Concentration & diversification
  const activeBusinesses = state.businesses.filter(b => b.status === 'active');
  const focusGroupCounts: Record<string, number> = {};
  for (const b of activeBusinesses) {
    const sector = SECTORS[b.sectorId];
    for (const fg of sector.sectorFocusGroup) {
      focusGroupCounts[fg] = (focusGroupCounts[fg] || 0) + 1;
    }
  }
  const uniqueSectors = new Set(activeBusinesses.map(b => b.sectorId)).size;
  const diversificationGrowthBonus = uniqueSectors >= 6 ? 0.06
    : uniqueSectors >= 4 ? 0.04
    : 0;

  // Apply organic growth with ALL 11 params
  const updatedBusinesses = state.businesses.map(b => {
    if (b.status !== 'active') return b;
    const sector = SECTORS[b.sectorId];
    const maxFocusCount = Math.max(...sector.sectorFocusGroup.map(fg => focusGroupCounts[fg] || 0));
    const updated = applyOrganicGrowth(
      b,
      sharedBenefits.growthBonus,
      focusEbitdaBonus,
      state.inflationRoundsRemaining > 0,
      maxFocusCount,
      diversificationGrowthBonus,
      state.round,
      sharedBenefits.marginDefense,
      state.maxRounds,
      roundStreams.simulation,
      state.duration,
      sharedBenefits.hasMarketingBrand,
    );
    // Track margin drift
    if (updated.ebitdaMargin !== b.ebitdaMargin) {
      coverage.record('margin_drift', state.round);
    }
    return updated;
  });

  // Record historical metrics
  const historyEntry = recordHistoricalMetrics({
    ...state,
    businesses: updatedBusinesses,
  });

  // Covenant breach tracking
  const endMetrics = calculateMetrics({ ...state, businesses: updatedBusinesses });
  let newCovenantBreachRounds = state.covenantBreachRounds;
  if (endMetrics.distressLevel === 'breach') {
    newCovenantBreachRounds += 1;
    coverage.record('covenant_breach', state.round);
  } else if (!state.hasRestructured) {
    newCovenantBreachRounds = 0;
  }

  // Forced restructuring from prolonged breach
  let requiresRestructuring = state.requiresRestructuring;
  let gameOverFromBankruptcy = false;
  let bankruptRound: number | undefined = state.bankruptRound;

  if (newCovenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD) {
    if (state.hasRestructured) {
      gameOverFromBankruptcy = true;
      bankruptRound = state.round;
    } else {
      requiresRestructuring = true;
      coverage.record('restructuring', state.round);
    }
  }

  // Insolvency check
  if (state.hasRestructured && !gameOverFromBankruptcy) {
    const intrinsicValue = endMetrics.intrinsicValuePerShare * state.sharesOutstanding;
    if (intrinsicValue <= 0) {
      gameOverFromBankruptcy = true;
      bankruptRound = state.round;
    }
  }

  // Empty portfolio insolvency
  if (state.hasRestructured && !gameOverFromBankruptcy) {
    const activeCount = updatedBusinesses.filter(b => b.status === 'active').length;
    if (activeCount === 0 && state.cash <= 0) {
      gameOverFromBankruptcy = true;
      bankruptRound = state.round;
    }
  }

  const newRound = state.round + 1;
  const gameOver = newRound > state.maxRounds || gameOverFromBankruptcy;

  // Round history
  const roundHistoryEntry: RoundHistoryEntry = {
    round: state.round,
    actions: state.actionsThisRound,
    chronicle: null,
    event: state.currentEvent ? {
      type: state.currentEvent.type,
      title: state.currentEvent.title,
      description: state.currentEvent.description,
    } : null,
    metrics: endMetrics,
    businessCount: updatedBusinesses.filter(b => b.status === 'active').length,
    cash: state.cash,
    totalDebt: state.totalDebt,
  };

  // IPO earnings processing
  let updatedIPOState = state.ipoState;
  if (state.ipoState?.isPublic) {
    const actualEbitda = updatedBusinesses
      .filter(b => b.status === 'active')
      .reduce((sum, b) => sum + b.ebitda, 0);
    updatedIPOState = processEarningsResult(
      { ...state, businesses: updatedBusinesses },
      actualEbitda,
    );
    if (updatedIPOState) {
      if (actualEbitda >= state.ipoState.earningsExpectations) {
        coverage.record('earnings_beat', state.round);
      } else {
        coverage.record('earnings_miss', state.round);
      }
    }
  }

  if (!gameOver) {
    const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);
    return {
      ...state,
      businesses: updatedBusinesses,
      round: newRound,
      metricsHistory: [...state.metricsHistory, historyEntry],
      roundHistory: [...(state.roundHistory ?? []), roundHistoryEntry],
      gameOver: false,
      bankruptRound,
      covenantBreachRounds: newCovenantBreachRounds,
      requiresRestructuring,
      phase: 'collect' as GamePhase,
      currentEvent: null,
      metrics: endMetrics,
      focusBonus: calculateSectorFocusBonus(updatedBusinesses),
      totalDebt: newTotalDebt,
      acquisitionsThisRound: 0,
      lastAcquisitionResult: null,
      lastIntegrationOutcome: null,
      ipoState: updatedIPOState,
      exitMultiplePenalty: 0,
    } as GameState;
  } else {
    // PE Fund Mode: forced liquidation — sell all businesses at 0.90x discount
    if (state.isFundManagerMode) {
      let liquidationCash = state.cash;
      const liquidatedBiz = updatedBusinesses.map(b => {
        if (b.status !== 'active') return b;
        const valuation = calculateExitValuation(b, state.round);
        const discountedProceeds = Math.round(valuation.netProceeds * PE_FUND_CONFIG.forcedLiquidationDiscount);
        liquidationCash += Math.max(0, discountedProceeds);
        return { ...b, status: 'sold' as const, exitPrice: discountedProceeds, exitRound: state.round };
      });
      coverage.record('forced_liquidation', state.round);

      // Calculate carry
      const totalReturned = (state.lpDistributions ?? 0) + liquidationCash;
      const hurdleReturn = PE_FUND_CONFIG.hurdleReturn;
      const carryEarned = totalReturned > hurdleReturn
        ? Math.round((totalReturned - hurdleReturn) * PE_FUND_CONFIG.carryRate)
        : 0;
      if (carryEarned > 0) {
        coverage.record('carry_earned', state.round);
      }
      coverage.record('pe_scoring_completed', state.round);

      return {
        ...state,
        businesses: liquidatedBiz,
        cash: liquidationCash,
        round: newRound,
        metricsHistory: [...state.metricsHistory, historyEntry],
        roundHistory: [...(state.roundHistory ?? []), roundHistoryEntry],
        gameOver: true,
        totalDebt: 0,
        holdcoLoanBalance: 0,
        phase: 'collect' as GamePhase,
        currentEvent: null,
        metrics: calculateMetrics({ ...state, businesses: liquidatedBiz, cash: liquidationCash }),
        lpDistributions: (state.lpDistributions ?? 0),
        totalExitProceeds: state.totalExitProceeds + liquidationCash - state.cash,
      } as GameState;
    }

    // Game over — run final collection
    const finalState = runFinalCollection({ ...state, businesses: updatedBusinesses });
    const gameOverDebt = computeTotalDebt(finalState.businesses, finalState.holdcoLoanBalance);
    const gameOverMetrics = calculateMetrics({
      ...state,
      businesses: finalState.businesses,
      cash: finalState.cash,
      totalDebt: gameOverDebt,
      holdcoLoanBalance: finalState.holdcoLoanBalance,
    });

    return {
      ...state,
      businesses: finalState.businesses,
      round: newRound,
      metricsHistory: [...state.metricsHistory, historyEntry],
      roundHistory: [...(state.roundHistory ?? []), roundHistoryEntry],
      gameOver: true,
      bankruptRound,
      covenantBreachRounds: newCovenantBreachRounds,
      requiresRestructuring,
      phase: 'collect' as GamePhase,
      currentEvent: null,
      cash: finalState.cash,
      holdcoLoanBalance: finalState.holdcoLoanBalance,
      totalDebt: gameOverDebt,
      metrics: gameOverMetrics,
      focusBonus: calculateSectorFocusBonus(finalState.businesses),
      ipoState: updatedIPOState,
    } as GameState;
  }
}

// ── Main: runPlaytest ──

export interface PlaytestConfig {
  seed: number;
  difficulty: GameDifficulty;
  duration: GameDuration;
  strategy: PlaytestStrategy;
  startingSector?: SectorId;
  isFundManagerMode?: boolean;
}

export function runPlaytest(config: PlaytestConfig): PlaytestResult & { coverage: PlaytestCoverage } {
  const { seed, difficulty, duration, strategy, startingSector, isFundManagerMode } = config;
  const coverage = new PlaytestCoverage();
  const maxRounds = isFundManagerMode ? DURATION_CONFIG.quick.rounds : DURATION_CONFIG[duration].rounds;

  let state = initializeGameState({ seed, difficulty, duration, startingSector, isFundManagerMode });

  for (let round = 1; round <= maxRounds; round++) {
    if (state.gameOver) break;

    // Phase 1: Collect → Event
    state = simulateCollectToEvent(state, coverage);
    if (state.gameOver) break;

    // Phase 2: Handle restructuring if needed
    if (state.requiresRestructuring) {
      state = simulateRestructuring(state, coverage);
    }

    // Phase 3: Handle event choices
    state = simulateEventChoices(state, strategy, coverage);

    // Phase 4: Allocate
    state = simulateAllocatePhase(state, strategy, coverage);

    // Phase 5: End Round
    state = simulateEndRound(state, coverage);
  }

  // Compute final score
  if (isFundManagerMode) {
    // PE Fund Mode uses separate scoring
    const peScore = calculatePEFundScore(state);
    coverage.record('scoring_completed', state.round - 1);
    return {
      finalState: state,
      score: { total: peScore.total, grade: peScore.grade } as any,
      enterpriseValue: 0,
      founderEquityValue: 0,
      roundsCompleted: state.metricsHistory.length,
      bankrupted: !!state.bankruptRound,
      coverage,
    };
  }

  const score = calculateFinalScore(state);
  const enterpriseValue = calculateEnterpriseValue(state);
  const founderEquityValue = calculateFounderEquityValue(state);
  coverage.record('scoring_completed', state.round - 1);

  return {
    finalState: state,
    score,
    enterpriseValue,
    founderEquityValue,
    roundsCompleted: state.metricsHistory.length,
    bankrupted: !!state.bankruptRound,
    coverage,
  };
}
