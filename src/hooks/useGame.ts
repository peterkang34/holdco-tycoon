import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  GameState,
  GamePhase,
  Business,
  Deal,
  DealStructure,
  SharedServiceType,
  OperationalImprovementType,
  Metrics,
  SectorId,
  DealSizePreference,
  RoundHistoryEntry,
  MASourcingTier,
  MASourcingState,
  TurnaroundTier,
  ActiveTurnaround,
  formatMoney,
  randomInt,
} from '../engine/types';
import {
  createStartingBusiness,
  generateDealPipeline,
  resetBusinessIdCounter,
  restoreBusinessIdCounter,
  generateBusinessId,
  determineIntegrationOutcome,
  calculateSynergies,
  getSubTypeAffinity,
  getSizeRatioTier,
  calculateMultipleExpansion,
  enhanceDealsWithAI,
  generateSourcedDeals,
  generateProactiveOutreachDeals,
  getMaxAcquisitions,
  generateDealWithSize,
  pickWeightedSector,
  generateDistressedDeals,
} from '../engine/businesses';
import { generateBuyerProfile, calculateSizeTierPremium } from '../engine/buyers';
import {
  generateEventNarrative,
  getFallbackEventNarrative,
  getFallbackBusinessStory,
  generateBusinessUpdate,
  generateYearChronicle,
} from '../services/aiGeneration';
import { resetUsedNames } from '../data/names';
import { trackGameStart, trackGameAbandon } from '../services/telemetry';
import { initializeSharedServices, MIN_OPCOS_FOR_SHARED_SERVICES, getMASourcingAnnualCost, MA_SOURCING_CONFIG } from '../data/sharedServices';
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
} from '../engine/simulation';
import { executeDealStructure } from '../engine/deals';
import { calculateFinalScore, generatePostGameInsights, calculateEnterpriseValue, calculateFounderEquityValue, calculateFounderPersonalWealth } from '../engine/scoring';
import { getDistressRestrictions } from '../engine/distress';
import { SECTORS } from '../data/sectors';

import type { GameDifficulty, GameDuration } from '../engine/types';
import { generateRandomSeed, createRngStreams } from '../engine/rng';

/** Recompute totalDebt from holdco loan + per-business bank debt */
function computeTotalDebt(businesses: Business[], holdcoLoanBalance: number): number {
  return holdcoLoanBalance + businesses
    .filter(b => b.status === 'active' || b.status === 'integrated')
    .reduce((sum, b) => sum + b.bankDebtBalance, 0);
}

/**
 * Run a final collection pass (debt P&I, seller notes, bank debt, earnouts)
 * to deduct all outstanding obligations from cash before scoring.
 * This prevents year-10 leverage exploits where debt is never repaid.
 */
function runFinalCollection(state: GameState): { cash: number; businesses: Business[]; holdcoLoanBalance: number } {
  let cash = state.cash;
  let holdcoLoanBalance = state.holdcoLoanBalance;

  // Holdco loan: pay all remaining principal + one round of interest
  if (holdcoLoanBalance > 0) {
    const holdcoInterest = Math.round(holdcoLoanBalance * (state.holdcoLoanRate || 0));
    cash -= holdcoInterest + holdcoLoanBalance;
    holdcoLoanBalance = 0;
  }

  // OpCo-level debt: pay all remaining seller notes, bank debt, and earnouts
  const businesses = state.businesses.map(b => {
    if (b.status !== 'active' && b.status !== 'integrated') return b;
    const updated = { ...b };

    // Seller note: pay remaining balance + one round of interest
    if (b.sellerNoteBalance > 0) {
      const interest = Math.round(b.sellerNoteBalance * b.sellerNoteRate);
      cash -= interest + b.sellerNoteBalance;
      updated.sellerNoteBalance = 0;
      updated.sellerNoteRoundsRemaining = 0;
    }

    // Bank debt: pay remaining balance + one round of interest
    if (b.bankDebtBalance > 0) {
      const interest = Math.round(b.bankDebtBalance * (b.bankDebtRate || 0));
      cash -= interest + b.bankDebtBalance;
      updated.bankDebtBalance = 0;
      updated.bankDebtRoundsRemaining = 0;
    }

    // Earnout: pay all remaining
    if (b.earnoutRemaining > 0) {
      cash -= b.earnoutRemaining;
      updated.earnoutRemaining = 0;
      updated.earnoutTarget = 0;
    }

    return updated;
  });

  return { cash, businesses, holdcoLoanBalance };
}

// Capital structure constants (defaults for Easy mode — overridden by DIFFICULTY_CONFIG)
const INITIAL_RAISE = 20000;
const FOUNDER_OWNERSHIP = 0.80;
const STARTING_SHARES = 1000;
const FOUNDER_SHARES = 800;
const STARTING_INTEREST_RATE = 0.07;
import { DIFFICULTY_CONFIG, DURATION_CONFIG, EQUITY_DILUTION_STEP, EQUITY_DILUTION_FLOOR, EQUITY_BUYBACK_COOLDOWN, IMPROVEMENT_COST_FLOOR, QUALITY_IMPROVEMENT_MULTIPLIER, MIN_FOUNDER_OWNERSHIP } from '../data/gameConfig';
import { clampMargin } from '../engine/helpers';
import { runAllMigrations } from './migrations';
import { buildChronicleContext } from '../services/chronicleContext';
import { useToastStore } from './useToast';
import { calculateIntegrationCost, forgePlatform, checkPlatformDissolution, calculateAddToPlatformCost } from '../engine/platforms';
import { getRecipeById } from '../data/platformRecipes';
import {
  PLATFORM_SALE_BONUS, COVENANT_BREACH_ROUNDS_THRESHOLD, EARNOUT_EXPIRATION_YEARS,
  KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT, KEY_MAN_GOLDEN_HANDCUFFS_RESTORE_CHANCE,
  KEY_MAN_SUCCESSION_COST_MIN, KEY_MAN_SUCCESSION_COST_MAX, KEY_MAN_SUCCESSION_ROUNDS,
  EARNOUT_SETTLE_PCT, EARNOUT_FIGHT_LEGAL_COST_MIN, EARNOUT_FIGHT_LEGAL_COST_MAX,
  EARNOUT_FIGHT_WIN_CHANCE, EARNOUT_RENEGOTIATE_PCT,
  SUPPLIER_ABSORB_RECOVERY_PPT, SUPPLIER_SWITCH_COST_MIN, SUPPLIER_SWITCH_COST_MAX,
  SUPPLIER_SWITCH_REVENUE_PENALTY, SUPPLIER_VERTICAL_COST, SUPPLIER_VERTICAL_BONUS_PPT,
  SUPPLIER_VERTICAL_MIN_SAME_SECTOR, SUPPLIER_SHIFT_MARGIN_HIT,
  CONSOLIDATION_BOOM_PRICE_PREMIUM, CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS,
} from '../data/gameConfig';
import {
  canUnlockTier,
  calculateTurnaroundCost,
  getTurnaroundDuration,
  resolveTurnaround,
  getQualityImprovementChance,
} from '../engine/turnarounds';
import { getProgramById, getTurnaroundTierAnnualCost, TURNAROUND_TIER_CONFIG, getQualityCeiling } from '../data/turnaroundPrograms';
import type { QualityRating } from '../engine/types';

interface GameStore extends GameState {
  // Computed
  metrics: Metrics;
  focusBonus: ReturnType<typeof calculateSectorFocusBonus>;

  // Actions
  startGame: (holdcoName: string, startingSector: SectorId, difficulty?: GameDifficulty, duration?: GameDuration, seed?: number) => void;
  resetGame: () => void;

  // Phase transitions
  advanceToEvent: () => void;
  advanceToAllocate: () => void;
  endRound: () => void;

  // Allocate phase actions
  acquireBusiness: (deal: Deal, structure: DealStructure) => void;
  acquireTuckIn: (deal: Deal, structure: DealStructure, targetPlatformId: string) => void;
  passDeal: (dealId: string) => void;
  mergeBusinesses: (businessId1: string, businessId2: string, newName: string) => void;
  designatePlatform: (businessId: string) => void;
  improveBusiness: (businessId: string, improvementType: OperationalImprovementType) => void;
  unlockSharedService: (serviceType: SharedServiceType) => void;
  deactivateSharedService: (serviceType: SharedServiceType) => void;
  payDownDebt: (amount: number) => void;
  payDownBankDebt: (businessId: string, amount: number) => void;
  issueEquity: (amount: number) => void;
  buybackShares: (amount: number) => void;
  distributeToOwners: (amount: number) => void;
  sellBusiness: (businessId: string) => void;

  acceptOffer: () => void;
  declineOffer: () => void;
  acceptMBOOffer: () => void;
  declineMBOOffer: () => void;
  grantEquityDemand: () => void;
  declineEquityDemand: () => void;
  acceptSellerNoteRenego: () => void;
  declineSellerNoteRenego: () => void;

  // New choice-based event actions
  keyManGoldenHandcuffs: () => void;
  keyManSuccessionPlan: () => void;
  keyManAcceptHit: () => void;
  earnoutSettle: () => void;
  earnoutFight: () => void;
  earnoutRenegotiate: () => void;
  supplierAbsorb: () => void;
  supplierSwitch: () => void;
  supplierVerticalIntegration: () => void;

  setMAFocus: (sectorId: SectorId | null, sizePreference: DealSizePreference, subType?: string | null) => void;

  // MA Sourcing
  upgradeMASourcing: () => void;
  toggleMASourcing: () => void;
  proactiveOutreach: () => void;

  // Integrated Platforms
  forgeIntegratedPlatform: (recipeId: string, businessIds: string[]) => void;
  addToIntegratedPlatform: (platformId: string, businessId: string) => void;
  sellPlatform: (platformId: string) => void;

  // Turnaround capability
  unlockTurnaroundTier: () => void;
  startTurnaroundProgram: (businessId: string, programId: string) => void;

  // Restructuring actions
  distressedSale: (businessId: string) => void;
  emergencyEquityRaise: (amount: number) => void;
  declareBankruptcy: () => void;
  advanceFromRestructure: () => void;

  // Deal sourcing
  sourceDealFlow: () => void;

  // AI enhancement
  triggerAIEnhancement: () => Promise<void>;
  fetchEventNarrative: () => Promise<void>;
  generateBusinessStories: () => Promise<void>;
  generateYearChronicle: () => Promise<void>;

  // Year chronicle
  yearChronicle: string | null;

  // Platform helpers
  getPlatforms: () => Business[];
  canTuckIn: (deal: Deal) => boolean;

  // Helpers
  getAvailableDeals: () => Deal[];
  canAfford: (amount: number) => boolean;
}

const DEAL_SOURCING_COST_BASE = 500; // $500k base cost
const DEAL_SOURCING_COST_TIER1 = 300; // $300k with MA Sourcing Tier 1+
const PROACTIVE_OUTREACH_COST = 400; // $400k (Tier 3 only)

// Run all save-version migrations (v9→v10→...→v14) before store creation
runAllMigrations();

const initialState: Omit<GameState, 'sharedServices'> & { sharedServices: ReturnType<typeof initializeSharedServices> } = {
  holdcoName: '',
  round: 0,
  phase: 'collect' as GamePhase,
  gameOver: false,
  difficulty: 'easy' as GameDifficulty,
  duration: 'standard' as GameDuration,
  maxRounds: 20,
  businesses: [],
  exitedBusinesses: [],
  cash: INITIAL_RAISE,
  totalDebt: 0,
  interestRate: STARTING_INTEREST_RATE,
  sharesOutstanding: STARTING_SHARES,
  founderShares: FOUNDER_SHARES,
  initialRaiseAmount: INITIAL_RAISE,
  initialOwnershipPct: FOUNDER_OWNERSHIP,
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
  maFocus: { sectorId: null, sizePreference: 'any' as DealSizePreference, subType: null },
  maSourcing: { tier: 0 as MASourcingTier, active: false, unlockedRound: 0, lastUpgradeRound: 0 },
  integratedPlatforms: [],
  turnaroundTier: 0 as TurnaroundTier,
  activeTurnarounds: [],
  currentEvent: null,
  eventHistory: [],
  creditTighteningRoundsRemaining: 0,
  inflationRoundsRemaining: 0,
  metricsHistory: [],
  roundHistory: [],
  actionsThisRound: [],
  debtPaymentThisRound: 0,
  cashBeforeDebtPayments: 0,
  holdcoLoanBalance: 0,
  holdcoLoanRate: 0,
  holdcoLoanRoundsRemaining: 0,
  holdcoDebtStartRound: 0,
  requiresRestructuring: false,
  covenantBreachRounds: 0,
  hasRestructured: false,
  exitMultiplePenalty: 0,
  acquisitionsThisRound: 0,
  maxAcquisitionsPerRound: 2,
  lastAcquisitionResult: null,
  lastIntegrationOutcome: null,
  founderDistributionsReceived: 0,
  isChallenge: false,
  bankruptRound: undefined,
  holdcoAmortizationThisRound: 0,
  consolidationBoomSectorId: undefined,
  seed: 0,
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      metrics: calculateMetrics(initialState as GameState),
      focusBonus: null,

      startGame: (holdcoName: string, startingSector: SectorId, difficulty: GameDifficulty = 'easy', duration: GameDuration = 'standard', seed?: number) => {
        resetBusinessIdCounter();
        resetUsedNames();

        const gameSeed = seed ?? generateRandomSeed();
        const diffConfig = DIFFICULTY_CONFIG[difficulty];
        const durConfig = DURATION_CONFIG[duration];
        const maxRounds = durConfig.rounds;

        const round1Streams = createRngStreams(gameSeed, 1);
        const startingBusiness = createStartingBusiness(startingSector, diffConfig.startingEbitda, diffConfig.startingMultipleCap, round1Streams.cosmetic);
        const initialDealPipeline = generateDealPipeline([], 1, undefined, undefined, undefined, 0, 0, false, undefined, maxRounds, false, round1Streams.deals);

        // Holdco loan setup: Normal mode gets a structured loan, Easy mode has none
        const holdcoLoanBalance = diffConfig.startingDebt;
        const holdcoLoanRate = holdcoLoanBalance > 0 ? STARTING_INTEREST_RATE : 0;
        // Quick games: full game length (10yr) so P&I isn't crushing; Standard: half (10yr of 20)
        const holdcoLoanRoundsRemaining = holdcoLoanBalance > 0
          ? (duration === 'quick' ? maxRounds : Math.max(4, Math.ceil(maxRounds * 0.50)))
          : 0;

        const newState: GameState = {
          ...initialState,
          holdcoName,
          seed: gameSeed,
          difficulty,
          duration,
          maxRounds,
          round: 1,
          phase: 'collect',
          businesses: [startingBusiness],
          cash: diffConfig.initialCash - startingBusiness.acquisitionPrice,
          totalDebt: diffConfig.startingDebt,
          totalInvestedCapital: startingBusiness.acquisitionPrice,
          founderShares: diffConfig.founderShares,
          sharesOutstanding: diffConfig.totalShares,
          initialRaiseAmount: diffConfig.initialCash,
          initialOwnershipPct: diffConfig.founderShares / diffConfig.totalShares,
          holdcoDebtStartRound: diffConfig.holdcoDebtStartRound,
          holdcoLoanBalance,
          holdcoLoanRate,
          holdcoLoanRoundsRemaining,
          sharedServices: initializeSharedServices(),
          dealPipeline: initialDealPipeline,
          maSourcing: { tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 },
          turnaroundTier: 0 as any,
          activeTurnarounds: [],
          founderDistributionsReceived: 0,
          isChallenge: seed != null,
        };

        set({
          ...newState,
          metrics: calculateMetrics(newState),
          focusBonus: calculateSectorFocusBonus(newState.businesses),
          yearChronicle: null,
        });

        // Fire telemetry (fire-and-forget)
        trackGameStart(difficulty, duration, startingSector, maxRounds);
      },

      resetGame: () => {
        // Send abandon telemetry if mid-game
        const state = get();
        if (state.round > 0 && !state.gameOver) {
          trackGameAbandon(state.round, state.maxRounds, state.difficulty, state.duration, state.businesses[0]?.sectorId || 'agency');
        }

        resetBusinessIdCounter();
        resetUsedNames();
        set({
          ...initialState,
          sharedServices: initializeSharedServices(),
          metrics: calculateMetrics(initialState as GameState),
          focusBonus: null,
          yearChronicle: null,
        });
      },

      advanceToEvent: () => {
        const state = get();
        const roundStreams = createRngStreams(state.seed, state.round);
        const sharedBenefits = calculateSharedServicesBenefits(state as GameState);

        const sharedServicesCost = state.sharedServices
          .filter(s => s.active)
          .reduce((sum, s) => sum + s.annualCost, 0);

        // MA Sourcing annual cost (separate from shared services)
        const maSourcingCost = state.maSourcing.active
          ? getMASourcingAnnualCost(state.maSourcing.tier)
          : 0;

        // Turnaround tier annual cost
        const turnaroundTierCost = getTurnaroundTierAnnualCost(state.turnaroundTier);

        // Turnaround per-program annual costs for active turnarounds
        const turnaroundProgramCosts = state.activeTurnarounds
          .filter(t => t.status === 'active')
          .reduce((sum, t) => {
            const prog = getProgramById(t.programId);
            return sum + (prog ? prog.annualCost : 0);
          }, 0);

        // Apply distress interest penalty
        const currentMetrics = calculateMetrics(state as GameState);
        const distressRestrictions = getDistressRestrictions(currentMetrics.distressLevel);

        // Collect FCF when transitioning from collect to event phase (annual)
        // Portfolio tax (with interest/SS+MA deductions for tax shield) is computed inside
        // Use holdcoLoanRate + penalty for tax deduction (matches actual interest paid)
        const totalDeductibleCosts = sharedServicesCost + maSourcingCost;
        const annualFcf = calculatePortfolioFcf(
          state.businesses.filter(b => b.status === 'active'),
          sharedBenefits.capexReduction,
          sharedBenefits.cashConversionBonus,
          state.holdcoLoanBalance,
          state.holdcoLoanRate + distressRestrictions.interestPenalty,
          totalDeductibleCosts
        );

        // Holdco loan P&I (replaces old holdco interest-only)
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

        let newCash = state.cash + annualFcf - holdcoLoanPayment - sharedServicesCost - maSourcingCost - turnaroundTierCost - turnaroundProgramCosts;

        // Pay opco-level debt (seller notes, earnouts, bank debt interest)
        // This aligns with the waterfall display — all deductions happen at collection time
        let opcoDebtAdjustment = 0;
        let hadSkippedPayments = false;
        const earnoutPayments: { name: string; amount: number }[] = [];
        const earnoutExpirations: { name: string; amount: number }[] = [];
        const updatedBusinesses = state.businesses.map(b => {
          // Active + integrated businesses have debt obligations (tuck-ins keep seller notes & earnouts)
          if (b.status !== 'active' && b.status !== 'integrated') return b;
          let updated = { ...b };

          // Seller note: interest + principal
          if (b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining > 0) {
            const interest = Math.round(b.sellerNoteBalance * b.sellerNoteRate);
            const principal = Math.round(b.sellerNoteBalance / b.sellerNoteRoundsRemaining);
            const totalPayment = interest + principal;
            const availableForPayment = Math.max(0, newCash + opcoDebtAdjustment);
            const actualPayment = Math.min(totalPayment, availableForPayment);
            opcoDebtAdjustment -= actualPayment;
            if (actualPayment < totalPayment) hadSkippedPayments = true;
            const principalPaid = Math.max(0, actualPayment - interest);
            updated.sellerNoteBalance = Math.max(0, b.sellerNoteBalance - principalPaid);
            if (actualPayment >= totalPayment) {
              updated.sellerNoteRoundsRemaining = b.sellerNoteRoundsRemaining - 1;
            }
          }
          // Final balance payment when rounds expire
          if (updated.sellerNoteRoundsRemaining <= 0 && updated.sellerNoteBalance > 0) {
            const availableForFinal = Math.max(0, newCash + opcoDebtAdjustment);
            const finalPayment = Math.min(updated.sellerNoteBalance, availableForFinal);
            opcoDebtAdjustment -= finalPayment;
            updated.sellerNoteBalance = updated.sellerNoteBalance - finalPayment;
          }

          // Earn-out expiration: 4 years from acquisition
          if (b.earnoutRemaining > 0 && state.round - b.acquisitionRound > EARNOUT_EXPIRATION_YEARS) {
            earnoutExpirations.push({ name: b.name, amount: b.earnoutRemaining });
            updated.earnoutRemaining = 0;
            updated.earnoutTarget = 0;
          }

          // Earnout payments (conditional on growth targets)
          if (updated.earnoutRemaining > 0 && updated.earnoutTarget > 0) {
            // For integrated (tuck-in) businesses, use parent platform's EBITDA growth as proxy
            // since the tuck-in's own EBITDA is folded into the platform and doesn't grow independently
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
                earnoutPayments.push({ name: b.name, amount: earnoutPayment });
                if (updated.earnoutRemaining <= 0) {
                  updated.earnoutTarget = 0;
                }
              }
            }
          }

          // Bank debt: interest + principal (mandatory, per-business amortization)
          if (b.bankDebtBalance > 0 && b.bankDebtRoundsRemaining > 0) {
            const bankInterest = Math.round(b.bankDebtBalance * (b.bankDebtRate || state.interestRate));
            const bankPrincipal = Math.round(b.bankDebtBalance / b.bankDebtRoundsRemaining);
            const totalBankPayment = bankInterest + bankPrincipal;
            const availableForBank = Math.max(0, newCash + opcoDebtAdjustment);
            const actualBankPayment = Math.min(totalBankPayment, availableForBank);
            opcoDebtAdjustment -= actualBankPayment;
            if (actualBankPayment < totalBankPayment) hadSkippedPayments = true;
            const bankPrincipalPaid = Math.max(0, actualBankPayment - bankInterest);
            updated.bankDebtBalance = Math.max(0, b.bankDebtBalance - bankPrincipalPaid);
            if (actualBankPayment >= totalBankPayment) {
              updated.bankDebtRoundsRemaining = b.bankDebtRoundsRemaining - 1;
            }
          }
          // Final bank debt balance payment when rounds expire
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

        // Fire earn-out toasts
        const addToast = useToastStore.getState().addToast;
        for (const ep of earnoutPayments) {
          addToast({
            message: `Earn-out paid: ${formatMoney(ep.amount)} for ${ep.name}`,
            detail: 'Growth target met — seller earn-out obligation fulfilled.',
            type: 'info',
          });
        }
        for (const ex of earnoutExpirations) {
          addToast({
            message: `Earn-out expired: ${ex.name} — ${formatMoney(ex.amount)} obligation removed`,
            detail: `Growth target not met within ${EARNOUT_EXPIRATION_YEARS} years. Earn-out window closed.`,
            type: 'success',
          });
        }

        // Fire financial stress toasts
        const cashChange = newCash - state.cash;

        // Negative cash triggers restructuring (or bankruptcy if already restructured)
        let requiresRestructuring = state.requiresRestructuring;
        let gameOverFromNegativeCash = false;
        let negativeCashBankruptRound: number | undefined;
        if (newCash < 0) {
          if (state.hasRestructured) {
            // Second distress event → immediate bankruptcy
            gameOverFromNegativeCash = true;
            negativeCashBankruptRound = state.round;
            addToast({ message: 'Cash depleted again — bankruptcy declared', type: 'danger' });
          } else {
            requiresRestructuring = true;
            addToast({ message: 'Cash depleted — forced restructuring triggered', type: 'danger' });
          }
          newCash = 0; // Floor at 0
        } else if (cashChange < 0) {
          addToast({
            message: `Negative cash flow: ${formatMoney(cashChange)}`,
            detail: 'Cash reserves absorbed the shortfall.',
            type: 'warning',
          });
        }

        if (hadSkippedPayments) {
          addToast({
            message: 'Debt payments partially skipped',
            detail: 'Insufficient cash to cover all obligations.',
            type: 'warning',
          });
        }

        // Generate event (seeded for challenge mode determinism)
        const event = generateEvent(state as GameState, roundStreams.events);

        // Recompute totalDebt from holdco loan + per-business bank debt
        const newTotalDebt = computeTotalDebt(updatedBusinesses, updatedHoldcoLoanBalance);

        // If negative-cash triggered bankruptcy, end game immediately
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
          set({
            ...bankruptState,
            metrics: calculateMetrics(bankruptState),
          });
          return;
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

        // Events with choices that have NO immediate effects — skip applyEventEffects entirely
        const skipEffects = event && (event.type === 'unsolicited_offer' || event.type === 'portfolio_equity_demand' || event.type === 'portfolio_seller_note_renego' || event.type === 'portfolio_earnout_dispute' || event.type === 'mbo_proposal');
        // Note: choice-based events (unsolicited_offer, equity_demand, seller_note_renego, key_man_risk, earnout_dispute, supplier_shift, mbo_proposal)
        // need player input before advancing — handled by EventPhase UI
        if (event && !skipEffects && !requiresRestructuring) {
          gameState = applyEventEffects(gameState, event);
        }

        // Referral deal: inject a quality-3+ cold/warm deal into pipeline
        if (event && event.type === 'portfolio_referral_deal') {
          const referralSector = pickWeightedSector(state.round, state.maxRounds, roundStreams.deals);
          const referralDeal = generateDealWithSize(referralSector, state.round, 'any', 0, {
            qualityFloor: 3 as 1 | 2 | 3 | 4 | 5,
            source: 'sourced',
            maxRounds: state.maxRounds,
          }, roundStreams.deals);
          gameState.dealPipeline = [...gameState.dealPipeline, referralDeal];
        }

        // Decrement tightening/inflation counters
        if (gameState.creditTighteningRoundsRemaining > 0) {
          gameState.creditTighteningRoundsRemaining--;
        }
        if (gameState.inflationRoundsRemaining > 0) {
          gameState.inflationRoundsRemaining--;
        }

        // Resolve turnarounds that have reached their end round
        let resolvedTurnarounds = [...(gameState.activeTurnarounds || state.activeTurnarounds)];
        let businessesAfterTurnarounds = [...gameState.businesses];
        const turnaroundActions: typeof state.actionsThisRound = [];

        const activeCount = resolvedTurnarounds.filter(t => t.status === 'active').length;

        for (let i = 0; i < resolvedTurnarounds.length; i++) {
          const ta = resolvedTurnarounds[i];
          if (ta.status !== 'active') continue;
          if (state.round < ta.endRound) continue;

          const prog = getProgramById(ta.programId);
          const biz = businessesAfterTurnarounds.find(b => b.id === ta.businessId);
          if (!prog || !biz) continue;

          const result = resolveTurnaround(prog, activeCount, roundStreams.market.fork(ta.businessId).next());

          // Map engine result to turnaround status
          const newStatus = result.result === 'success' ? 'completed' as const
            : result.result === 'partial' ? 'partial' as const
            : 'failed' as const;

          resolvedTurnarounds[i] = { ...ta, status: newStatus };

          // Update business quality and EBITDA
          const qualityTiersImproved = result.qualityChange;
          businessesAfterTurnarounds = businessesAfterTurnarounds.map(b => {
            if (b.id !== ta.businessId) return b;
            const newEbitda = Math.round(b.ebitda * result.ebitdaMultiplier);
            const ceiling = getQualityCeiling(b.sectorId);
            const newQuality = Math.min(result.targetQuality, ceiling) as QualityRating;
            return {
              ...b,
              qualityRating: newQuality,
              ebitda: newEbitda,
              peakEbitda: Math.max(b.peakEbitda, newEbitda),
              qualityImprovedTiers: (b.qualityImprovedTiers ?? 0) + Math.max(0, qualityTiersImproved),
            };
          });

          // Toast for turnaround result
          const bizName = biz.name;
          const displayQuality = Math.min(result.targetQuality, getQualityCeiling(biz.sectorId));
          if (result.result === 'success') {
            addToast({ message: `Turnaround succeeded: ${bizName} is now Q${displayQuality}`, type: 'success' });
          } else if (result.result === 'partial') {
            addToast({ message: `Turnaround partial success: ${bizName} improved to Q${displayQuality}`, type: 'info' });
          } else {
            addToast({ message: `Turnaround failed: ${bizName} — EBITDA took a hit`, type: 'danger' });
          }

          turnaroundActions.push({
            type: 'turnaround_resolved' as const,
            round: state.round,
            details: { businessId: ta.businessId, businessName: bizName, programId: ta.programId, outcome: result.result, newQuality: displayQuality, qualityTiersImproved },
          });
        }

        gameState.businesses = businessesAfterTurnarounds;
        gameState.activeTurnarounds = resolvedTurnarounds;

        // Succession plan countdown — restore quality after KEY_MAN_SUCCESSION_ROUNDS
        gameState.businesses = gameState.businesses.map(b => {
          if (b.status !== 'active' || !b.successionPlanRound) return b;
          if (state.round - b.successionPlanRound >= KEY_MAN_SUCCESSION_ROUNDS) {
            const restoredQuality = Math.min(5, b.qualityRating + 1) as 1 | 2 | 3 | 4 | 5;
            const newMargin = clampMargin(b.ebitdaMargin + 0.015);
            addToast({ message: `Succession plan complete — ${b.name} quality restored to Q${restoredQuality}`, type: 'success' });
            return { ...b, qualityRating: restoredQuality, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin), successionPlanRound: undefined };
          }
          return b;
        });

        set({
          ...gameState,
          eventHistory: event ? [...state.eventHistory, event] : state.eventHistory,
          actionsThisRound: [...state.actionsThisRound, ...turnaroundActions],
          metrics: calculateMetrics(gameState),
        });
      },

      advanceToAllocate: () => {
        const state = get();
        const focusBonus = calculateSectorFocusBonus(state.businesses);

        const totalPortfolioEbitda = state.businesses
          .filter(b => b.status === 'active')
          .reduce((sum, b) => sum + b.ebitda, 0);

        // Determine last event type for deal heat calculation
        const lastEvt = state.eventHistory.length > 0
          ? state.eventHistory[state.eventHistory.length - 1].type
          : undefined;

        // Create seeded RNG streams for this round's deal generation
        const roundStreams = createRngStreams(state.seed, state.round);

        // Generate new deals with M&A focus and portfolio synergies
        const newPipeline = generateDealPipeline(
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
          roundStreams.deals
        );

        // Inject distressed deals during Financial Crisis (bypass MAX_DEALS cap)
        let finalPipeline = newPipeline;
        if (state.currentEvent?.type === 'global_financial_crisis') {
          const distressedDeals = generateDistressedDeals(state.round, state.maxRounds, roundStreams.deals);
          finalPipeline = [...newPipeline, ...distressedDeals];
        }

        // Consolidation boom: apply price premium to sector deals + inject exclusive tuck-in
        let clearedBoomSectorId = state.consolidationBoomSectorId;
        if (state.consolidationBoomSectorId) {
          const boomSector = state.consolidationBoomSectorId;
          // Apply +20% price premium to all boom-sector deals
          finalPipeline = finalPipeline.map(d => {
            if (d.business.sectorId === boomSector) {
              const premiumPrice = Math.round(d.askingPrice * (1 + CONSOLIDATION_BOOM_PRICE_PREMIUM));
              return { ...d, askingPrice: premiumPrice, effectivePrice: Math.round(d.effectivePrice * (1 + CONSOLIDATION_BOOM_PRICE_PREMIUM)) };
            }
            return d;
          });
          // If player owns 2+ in boom sector, inject exclusive tuck-in at normal pricing
          const playerBoomOpcos = state.businesses.filter(b => b.status === 'active' && b.sectorId === boomSector);
          if (playerBoomOpcos.length >= CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS) {
            const exclusiveDeal = generateDealWithSize(boomSector, state.round, 'any', 0, {
              source: 'proprietary',
              qualityFloor: 3 as 1 | 2 | 3 | 4 | 5,
              maxRounds: state.maxRounds,
            }, roundStreams.deals);
            finalPipeline = [...finalPipeline, exclusiveDeal];
          }
          clearedBoomSectorId = undefined;
        }

        // Clean up passedDealIds — remove IDs for deals no longer in the pipeline
        const finalPipelineIds = new Set(finalPipeline.map(d => d.id));
        const cleanedPassedIds = state.passedDealIds.filter(id => finalPipelineIds.has(id));

        set({
          phase: 'allocate',
          dealPipeline: finalPipeline,
          passedDealIds: cleanedPassedIds,
          consolidationBoomSectorId: clearedBoomSectorId,
          actionsThisRound: [],
          focusBonus,
          lastAcquisitionResult: null,
          lastIntegrationOutcome: null,
        });
      },

      endRound: () => {
        const state = get();
        const roundStreams = createRngStreams(state.seed, state.round);
        const sharedBenefits = calculateSharedServicesBenefits(state);
        const focusBonus = calculateSectorFocusBonus(state.businesses);
        const focusEbitdaBonus = focusBonus ? getSectorFocusEbitdaBonus(focusBonus.tier) : 0;

        // Count opcos per focus group for concentration risk
        const activeBusinesses = state.businesses.filter(b => b.status === 'active');
        const focusGroupCounts: Record<string, number> = {};
        for (const b of activeBusinesses) {
          const sector = SECTORS[b.sectorId];
          for (const fg of sector.sectorFocusGroup) {
            focusGroupCounts[fg] = (focusGroupCounts[fg] || 0) + 1;
          }
        }

        // Calculate diversification bonus — 4+ unique sectors = +3% growth, 6+ = +4.5%
        // Rationale: focused gets +5% but with amplified volatility + correlated event risk
        // Diversified gets lower bonus but with uncorrelated risk + event protection
        const uniqueSectors = new Set(activeBusinesses.map(b => b.sectorId)).size;
        const diversificationGrowthBonus = uniqueSectors >= 6 ? 0.06
          : uniqueSectors >= 4 ? 0.04
          : 0;

        // Apply organic growth to all businesses
        const updatedBusinesses = state.businesses.map(b => {
          if (b.status !== 'active') return b;
          const sector = SECTORS[b.sectorId];
          const maxFocusCount = Math.max(...sector.sectorFocusGroup.map(fg => focusGroupCounts[fg] || 0));
          return applyOrganicGrowth(
            b,
            sharedBenefits.growthBonus,
            focusEbitdaBonus,
            state.inflationRoundsRemaining > 0,
            maxFocusCount,
            diversificationGrowthBonus,
            state.round,
            sharedBenefits.marginDefense,
            state.maxRounds,
            roundStreams.simulation
          );
        });

        // Record historical metrics
        const historyEntry = recordHistoricalMetrics({
          ...state,
          businesses: updatedBusinesses,
        });

        // Track covenant breach streaks
        const endMetrics = calculateMetrics({ ...state, businesses: updatedBusinesses });
        let newCovenantBreachRounds = state.covenantBreachRounds;
        if (endMetrics.distressLevel === 'breach') {
          newCovenantBreachRounds += 1;
        } else if (!state.hasRestructured) {
          newCovenantBreachRounds = 0; // pre-restructuring: forgiving reset
          // post-restructuring: counter never resets (strict monitoring)
        }

        // Check for forced restructuring from prolonged breach
        let requiresRestructuring = state.requiresRestructuring;
        let gameOverFromBankruptcy = false;
        let bankruptRound: number | undefined = state.bankruptRound;

        if (newCovenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD) {
          if (state.hasRestructured) {
            // Already used restructuring — bankruptcy
            gameOverFromBankruptcy = true;
            bankruptRound = state.round;
          } else {
            requiresRestructuring = true;
          }
        }

        // Insolvency check: equity value wiped out after restructuring → bankruptcy
        if (state.hasRestructured && !gameOverFromBankruptcy) {
          const intrinsicValue = endMetrics.intrinsicValuePerShare * state.sharesOutstanding;
          if (intrinsicValue <= 0) {
            gameOverFromBankruptcy = true;
            bankruptRound = state.round;
          }
        }

        // Empty portfolio insolvency: no businesses + no cash to recover
        if (state.hasRestructured && !gameOverFromBankruptcy) {
          const activeCount = updatedBusinesses.filter(b => b.status === 'active').length;
          if (activeCount === 0 && state.cash <= 0) {
            gameOverFromBankruptcy = true;
            bankruptRound = state.round;
          }
        }

        const newRound = state.round + 1;
        const gameOver = newRound > state.maxRounds || gameOverFromBankruptcy;

        // Persist round history snapshot
        const roundHistoryEntry: RoundHistoryEntry = {
          round: state.round,
          actions: state.actionsThisRound,
          chronicle: state.yearChronicle ?? null,
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
        const newRoundHistory = [...(state.roundHistory ?? []), roundHistoryEntry];

        if (!gameOver) {
          // Advance to collect phase — all debt P&I is now handled in advanceToEvent waterfall
          // Just recompute totalDebt for consistency
          const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);

          set({
            businesses: updatedBusinesses,
            round: newRound,
            metricsHistory: [...state.metricsHistory, historyEntry],
            roundHistory: newRoundHistory,
            gameOver: false,
            bankruptRound,
            covenantBreachRounds: newCovenantBreachRounds,
            requiresRestructuring,
            phase: 'collect' as GamePhase,
            currentEvent: null,
            yearChronicle: null,
            metrics: endMetrics,
            focusBonus: calculateSectorFocusBonus(updatedBusinesses),
            cash: state.cash,
            totalDebt: newTotalDebt,
            cashBeforeDebtPayments: state.cash,
            debtPaymentThisRound: 0,
            holdcoAmortizationThisRound: 0,
            exitMultiplePenalty: 0,
            acquisitionsThisRound: 0,
            lastAcquisitionResult: null,
            lastIntegrationOutcome: null,
          });
        } else {
          // Game over — run final collection to settle all remaining debt before scoring
          const finalState = runFinalCollection({ ...state, businesses: updatedBusinesses } as GameState);
          const gameOverDebt = computeTotalDebt(finalState.businesses, finalState.holdcoLoanBalance);
          const gameOverMetrics = calculateMetrics({ ...state, businesses: finalState.businesses, cash: finalState.cash, totalDebt: gameOverDebt, holdcoLoanBalance: finalState.holdcoLoanBalance });

          set({
            businesses: finalState.businesses,
            round: newRound,
            metricsHistory: [...state.metricsHistory, historyEntry],
            roundHistory: newRoundHistory,
            gameOver: true,
            bankruptRound,
            covenantBreachRounds: newCovenantBreachRounds,
            requiresRestructuring,
            phase: 'collect' as GamePhase,
            currentEvent: null,
            yearChronicle: null,
            cash: finalState.cash,
            holdcoLoanBalance: finalState.holdcoLoanBalance,
            totalDebt: gameOverDebt,
            metrics: gameOverMetrics,
            focusBonus: calculateSectorFocusBonus(finalState.businesses),
          });
        }
      },

      passDeal: (dealId: string) => {
        const state = get();
        const alreadyPassed = state.passedDealIds.includes(dealId);
        set({
          passedDealIds: alreadyPassed
            ? state.passedDealIds.filter(id => id !== dealId)
            : [...state.passedDealIds, dealId],
        });
      },

      acquireBusiness: (deal: Deal, structure: DealStructure) => {
        const state = get();

        // Guard: no acquisitions during restructuring
        if (state.requiresRestructuring) return;

        // Enforce distress restrictions — covenant breach blocks new acquisitions
        const restrictions = getDistressRestrictions(calculateMetrics(state).distressLevel);
        if (!restrictions.canAcquire) return;

        // Acquisition limit check
        if (state.acquisitionsThisRound >= state.maxAcquisitionsPerRound) return;

        if (state.cash < structure.cashRequired) return;

        // Contested deal snatch check — 40% chance another buyer outbids you
        const acqStreams = createRngStreams(state.seed, state.round);
        if (deal.heat === 'contested' && acqStreams.market.fork(deal.id).next() < 0.40) {
          set({
            dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
            acquisitionsThisRound: state.acquisitionsThisRound + 1,
            lastAcquisitionResult: 'snatched',
          });
          return;
        }

        const newBusiness = executeDealStructure(deal, structure, state.round, state.maxRounds);

        // Add platform fields to new business
        // Note: acquisitionType === 'platform' is just a deal label suggesting platform potential.
        // Players must explicitly designate a business as a platform (costs 5% EBITDA).
        const businessWithPlatformFields: Business = {
          ...newBusiness,
          isPlatform: false,
          platformScale: 0,
          boltOnIds: [],
          synergiesRealized: 0,
          totalAcquisitionCost: deal.effectivePrice,
          acquisitionSizeTierPremium: deal.business.acquisitionSizeTierPremium ?? 0,
        };

        // Bank debt now tracked per-business (set on businessWithPlatformFields via executeDealStructure)
        // Recompute totalDebt from holdco loan + all per-business bank debt
        const newBusinesses = [...state.businesses, businessWithPlatformFields];
        const newTotalDebt = computeTotalDebt(newBusinesses, state.holdcoLoanBalance);

        set({
          cash: state.cash - structure.cashRequired,
          totalDebt: newTotalDebt,
          totalInvestedCapital: state.totalInvestedCapital + deal.effectivePrice,
          businesses: newBusinesses,
          dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
          acquisitionsThisRound: state.acquisitionsThisRound + 1,
          lastAcquisitionResult: 'success',
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'acquire',
              round: state.round,
              details: { businessId: newBusiness.id, businessName: deal.business.name, sector: SECTORS[deal.business.sectorId].name, structure: structure.type, price: deal.effectivePrice, askingPrice: deal.effectivePrice, heat: deal.heat },
            },
          ],
          metrics: calculateMetrics({
            ...state,
            cash: state.cash - structure.cashRequired,
            totalDebt: newTotalDebt,
            businesses: newBusinesses,
          }),
        });
      },

      // Acquire a tuck-in and fold it into an existing platform
      acquireTuckIn: (deal: Deal, structure: DealStructure, targetPlatformId: string) => {
        const state = get();

        // Guard: no acquisitions during restructuring
        if (state.requiresRestructuring) return;

        // Enforce distress restrictions — covenant breach blocks new acquisitions
        const restrictions = getDistressRestrictions(calculateMetrics(state).distressLevel);
        if (!restrictions.canAcquire) return;

        // Acquisition limit check
        if (state.acquisitionsThisRound >= state.maxAcquisitionsPerRound) return;

        if (state.cash < structure.cashRequired) return;

        // Contested deal snatch check — 40% chance another buyer outbids you
        const tuckInStreams = createRngStreams(state.seed, state.round);
        if (deal.heat === 'contested' && tuckInStreams.market.fork(deal.id).next() < 0.40) {
          set({
            dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
            acquisitionsThisRound: state.acquisitionsThisRound + 1,
            lastAcquisitionResult: 'snatched',
          });
          return;
        }

        const platform = state.businesses.find(b => b.id === targetPlatformId && b.status === 'active');
        if (!platform) return;

        // Must be same sector
        if (platform.sectorId !== deal.business.sectorId) return;

        // Check if shared services are active (helps integration)
        const hasSharedServices = state.sharedServices.filter(s => s.active).length > 0;

        // Check sub-type compatibility (graduated affinity)
        const subTypeAffinity = getSubTypeAffinity(platform.sectorId, platform.subType, deal.business.subType);

        // Calculate size ratio tier (bolt-on EBITDA vs platform EBITDA)
        const { tier: sizeRatioTier, ratio: sizeRatio } = getSizeRatioTier(deal.business.ebitda, platform.ebitda);

        // Determine integration outcome
        const outcome = determineIntegrationOutcome(deal.business, platform, hasSharedServices, subTypeAffinity, sizeRatioTier);
        const synergies = calculateSynergies(outcome, deal.business.ebitda, true, subTypeAffinity, sizeRatioTier);

        // Create the bolt-on business record
        const boltOnId = generateBusinessId();
        const boltOnBusiness: Business = {
          id: boltOnId,
          name: deal.business.name,
          sectorId: deal.business.sectorId,
          subType: deal.business.subType,
          ebitda: deal.business.ebitda,
          peakEbitda: deal.business.peakEbitda,
          acquisitionEbitda: deal.business.acquisitionEbitda,
          acquisitionPrice: deal.effectivePrice,
          acquisitionRound: state.round,
          acquisitionMultiple: deal.business.acquisitionMultiple,
          organicGrowthRate: deal.business.organicGrowthRate,
          revenue: deal.business.revenue,
          ebitdaMargin: deal.business.ebitdaMargin,
          acquisitionRevenue: deal.business.acquisitionRevenue,
          acquisitionMargin: deal.business.acquisitionMargin,
          peakRevenue: deal.business.peakRevenue,
          revenueGrowthRate: deal.business.revenueGrowthRate,
          marginDriftRate: deal.business.marginDriftRate,
          qualityRating: deal.business.qualityRating,
          dueDiligence: deal.business.dueDiligence,
          integrationRoundsRemaining: 1, // Tuck-ins integrate faster
          improvements: [],
          sellerNoteBalance: structure.sellerNote?.amount ?? 0,
          sellerNoteRate: structure.sellerNote?.rate ?? 0,
          sellerNoteRoundsRemaining: structure.sellerNote?.termRounds ?? 0,
          bankDebtBalance: structure.bankDebt?.amount ?? 0,
          bankDebtRate: structure.bankDebt?.rate ?? 0,
          bankDebtRoundsRemaining: structure.bankDebt?.termRounds ?? 0,
          earnoutRemaining: structure.earnout?.amount ?? 0,
          earnoutTarget: structure.earnout?.targetEbitdaGrowth ?? 0,
          status: 'integrated', // H-3: Mark as integrated so EBITDA isn't double-counted (it's folded into platform)
          isPlatform: false,
          platformScale: 0,
          boltOnIds: [],
          parentPlatformId: targetPlatformId,
          integrationOutcome: outcome,
          synergiesRealized: synergies,
          totalAcquisitionCost: deal.effectivePrice,
          acquisitionSizeTierPremium: deal.business.acquisitionSizeTierPremium ?? 0,
          rolloverEquityPct: 0, // Tuck-ins: bolt-on has 0 rollover; parent's pct applies at exit
          // Propagate integratedPlatformId if the target platform belongs to a forged integrated platform
          integratedPlatformId: platform.integratedPlatformId,
        };

        // Failed integration: restructuring cost + growth drag on platform
        const restructuringCost = outcome === 'failure' ? Math.round(Math.abs(deal.business.ebitda) * 0.07) : 0;
        const growthDragPenalty = outcome === 'failure' ? -0.010 : 0;

        // Update the platform with new bolt-on (uncapped — multiple expansion bonus caps at scale 3)
        const newPlatformScale = platform.platformScale + 1;
        // Use INCREMENTAL expansion (new level minus old level) to prevent stacking
        const combinedEbitda = platform.ebitda + deal.business.ebitda + synergies;
        const multipleExpansion = calculateMultipleExpansion(newPlatformScale, combinedEbitda)
          - calculateMultipleExpansion(platform.platformScale, platform.ebitda);

        // Revenue + margin consolidation
        const combinedRevenue = platform.revenue + deal.business.revenue;
        const blendedMargin = combinedRevenue > 0
          ? combinedEbitda / combinedRevenue
          : platform.ebitdaMargin;

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id === targetPlatformId) {
            return {
              ...b,
              isPlatform: true,
              platformScale: newPlatformScale,
              boltOnIds: [...b.boltOnIds, boltOnId],
              ebitda: b.ebitda + deal.business.ebitda + synergies, // Consolidate EBITDA
              revenue: combinedRevenue,
              ebitdaMargin: clampMargin(blendedMargin),
              peakRevenue: Math.max(b.peakRevenue, combinedRevenue),
              synergiesRealized: b.synergiesRealized + synergies,
              totalAcquisitionCost: b.totalAcquisitionCost + deal.effectivePrice,
              acquisitionMultiple: b.acquisitionMultiple + multipleExpansion, // Multiple expansion!
              organicGrowthRate: b.organicGrowthRate + growthDragPenalty, // Growth drag on failure
              revenueGrowthRate: b.revenueGrowthRate + growthDragPenalty,
            };
          }
          return b;
        });

        // Bank debt tracked per-business; recompute totalDebt
        const tuckInBusinesses = [...updatedBusinesses, boltOnBusiness];
        const newTotalDebt = computeTotalDebt(tuckInBusinesses, state.holdcoLoanBalance);

        const tuckInCash = Math.max(0, state.cash - structure.cashRequired - restructuringCost);

        // If the target platform belongs to a forged integrated platform, update its constituent list
        const updatedIntegratedPlatforms = platform.integratedPlatformId
          ? state.integratedPlatforms.map(ip =>
              ip.id === platform.integratedPlatformId
                ? { ...ip, constituentBusinessIds: [...ip.constituentBusinessIds, boltOnId] }
                : ip
            )
          : state.integratedPlatforms;

        set({
          cash: tuckInCash,
          totalDebt: newTotalDebt,
          totalInvestedCapital: state.totalInvestedCapital + deal.effectivePrice + restructuringCost,
          businesses: [...updatedBusinesses, boltOnBusiness],
          dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
          acquisitionsThisRound: state.acquisitionsThisRound + 1,
          lastAcquisitionResult: 'success',
          lastIntegrationOutcome: outcome,
          integratedPlatforms: updatedIntegratedPlatforms,
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'acquire_tuck_in',
              round: state.round,
              details: {
                businessId: boltOnId,
                businessName: deal.business.name,
                sector: SECTORS[deal.business.sectorId].name,
                platformId: targetPlatformId,
                structure: structure.type,
                price: deal.effectivePrice,
                askingPrice: deal.effectivePrice,
                integrationOutcome: outcome,
                synergies,
                restructuringCost,
                growthDragPenalty,
                heat: deal.heat,
                sizeRatio,
                sizeRatioTier,
              },
            },
          ],
          metrics: calculateMetrics({
            ...state,
            cash: tuckInCash,
            totalDebt: newTotalDebt,
            businesses: [...updatedBusinesses, boltOnBusiness],
          }),
        });
      },

      // Merge two owned businesses into one larger platform
      mergeBusinesses: (businessId1: string, businessId2: string, newName: string) => {
        const state = get();

        const biz1 = state.businesses.find(b => b.id === businessId1 && b.status === 'active');
        const biz2 = state.businesses.find(b => b.id === businessId2 && b.status === 'active');

        if (!biz1 || !biz2) {
          useToastStore.getState().addToast({ message: 'Merge failed: one or both businesses not found', type: 'danger' });
          return;
        }

        // Must be same sector
        if (biz1.sectorId !== biz2.sectorId) {
          useToastStore.getState().addToast({ message: 'Merge failed: businesses must be in the same sector', type: 'danger' });
          return;
        }

        // Merge cost (restructuring, legal, integration) — 15% of smaller business (abs to prevent negative costs)
        const mergeCost = Math.max(100, Math.round(Math.min(Math.abs(biz1.ebitda), Math.abs(biz2.ebitda)) * 0.15));
        if (state.cash < mergeCost) {
          useToastStore.getState().addToast({ message: `Merge failed: need ${formatMoney(mergeCost)} but only have ${formatMoney(state.cash)}`, type: 'danger' });
          return;
        }

        // Check if shared services help
        const hasSharedServices = state.sharedServices.filter(s => s.active).length > 0;

        // Check sub-type compatibility (graduated affinity)
        const subTypeAffinity = getSubTypeAffinity(biz1.sectorId, biz1.subType, biz2.subType);

        // Compute size ratio between merging businesses (use larger/smaller)
        const largerEbitda = Math.max(Math.abs(biz1.ebitda), Math.abs(biz2.ebitda));
        const smallerEbitda = Math.min(Math.abs(biz1.ebitda), Math.abs(biz2.ebitda));
        const { tier: mergerSizeRatioTier, ratio: mergerSizeRatio } = getSizeRatioTier(smallerEbitda, largerEbitda);
        const mergerBalanceRatio = smallerEbitda > 0 ? largerEbitda / smallerEbitda : 99;

        // Integration outcome for merger (with isMerger flag for softer penalties)
        const outcome = determineIntegrationOutcome(biz2, biz1, hasSharedServices, subTypeAffinity, mergerSizeRatioTier, true);
        // Synergy base: smaller EBITDA (prevents combined-EBITDA exploit)
        const synergies = calculateSynergies(outcome, smallerEbitda, false, subTypeAffinity, mergerSizeRatioTier, true);

        // Failed integration: restructuring cost + growth drag
        const mergeRestructuringCost = outcome === 'failure' ? Math.round(smallerEbitda * 0.07) : 0;
        const mergeGrowthDrag = outcome === 'failure' ? -0.010 : 0;

        // Combined entity
        const combinedEbitda = biz1.ebitda + biz2.ebitda + synergies;
        const combinedRevenue = biz1.revenue + biz2.revenue;
        const mergedMargin = combinedRevenue > 0
          ? combinedEbitda / combinedRevenue
          : (biz1.ebitdaMargin + biz2.ebitdaMargin) / 2;
        const totalMergeCost = mergeCost + mergeRestructuringCost;
        const combinedTotalCost = biz1.totalAcquisitionCost + biz2.totalAcquisitionCost + totalMergeCost;
        // Merges are more impactful than tuck-ins: combine both scales + 2
        // Two standalones (0+0) → scale 2, platform+standalone (1+0) → scale 3, etc.
        const newPlatformScale = biz1.platformScale + biz2.platformScale + 2;
        const prevScale = Math.max(biz1.platformScale, biz2.platformScale);
        const prevEbitda = Math.max(biz1.ebitda, biz2.ebitda);
        const multipleExpansion = calculateMultipleExpansion(newPlatformScale, combinedEbitda)
          - calculateMultipleExpansion(prevScale, prevEbitda);

        if (state.cash < totalMergeCost) {
          useToastStore.getState().addToast({ message: `Merge failed: need ${formatMoney(totalMergeCost)} (incl. restructuring) but only have ${formatMoney(state.cash)}`, type: 'danger' });
          return;
        }

        // Use higher quality rating
        const bestQuality = Math.max(biz1.qualityRating, biz2.qualityRating) as 1 | 2 | 3 | 4 | 5;

        // Inherit integratedPlatformId from source businesses (prefer matching, fall back to either)
        const mergedIntegratedPlatformId = biz1.integratedPlatformId || biz2.integratedPlatformId;

        // Create merged business
        const mergedBusiness: Business = {
          id: generateBusinessId(),
          name: newName,
          sectorId: biz1.sectorId,
          subType: biz1.subType,
          ebitda: combinedEbitda,
          peakEbitda: combinedEbitda,
          acquisitionEbitda: biz1.acquisitionEbitda + biz2.acquisitionEbitda,
          acquisitionPrice: combinedTotalCost,
          acquisitionRound: (biz1.ebitda + biz2.ebitda) > 0
            ? Math.round((biz1.ebitda * biz1.acquisitionRound + biz2.ebitda * biz2.acquisitionRound) / (biz1.ebitda + biz2.ebitda))
            : Math.min(biz1.acquisitionRound, biz2.acquisitionRound),
          acquisitionMultiple: (biz1.ebitda + biz2.ebitda) > 0
            ? (biz1.ebitda * biz1.acquisitionMultiple + biz2.ebitda * biz2.acquisitionMultiple) / (biz1.ebitda + biz2.ebitda) + multipleExpansion
            : ((biz1.acquisitionMultiple + biz2.acquisitionMultiple) / 2) + multipleExpansion,
          organicGrowthRate: (biz1.organicGrowthRate + biz2.organicGrowthRate) / 2 + (subTypeAffinity === 'match' ? 0.015 : subTypeAffinity === 'related' ? 0.010 : 0.005) + mergeGrowthDrag,
          revenue: combinedRevenue,
          ebitdaMargin: clampMargin(mergedMargin),
          acquisitionRevenue: biz1.acquisitionRevenue + biz2.acquisitionRevenue,
          acquisitionMargin: (biz1.acquisitionRevenue + biz2.acquisitionRevenue) > 0
            ? (biz1.acquisitionEbitda + biz2.acquisitionEbitda) / (biz1.acquisitionRevenue + biz2.acquisitionRevenue)
            : mergedMargin,
          peakRevenue: combinedRevenue,
          revenueGrowthRate: (biz1.revenueGrowthRate + biz2.revenueGrowthRate) / 2 + (subTypeAffinity === 'match' ? 0.015 : subTypeAffinity === 'related' ? 0.010 : 0.005) + mergeGrowthDrag,
          marginDriftRate: (biz1.marginDriftRate + biz2.marginDriftRate) / 2,
          qualityRating: bestQuality,
          dueDiligence: biz1.dueDiligence, // Keep first business's DD
          integrationRoundsRemaining: 2, // Mergers take longer to fully integrate
          improvements: (() => {
            const all = [...biz1.improvements, ...biz2.improvements];
            const best = new Map<string, typeof all[0]>();
            for (const imp of all) {
              const existing = best.get(imp.type);
              if (!existing || imp.effect > existing.effect) best.set(imp.type, imp);
            }
            return Array.from(best.values());
          })(),
          sellerNoteBalance: biz1.sellerNoteBalance + biz2.sellerNoteBalance,
          sellerNoteRate: (biz1.sellerNoteBalance + biz2.sellerNoteBalance) > 0
            ? (biz1.sellerNoteBalance * biz1.sellerNoteRate + biz2.sellerNoteBalance * biz2.sellerNoteRate)
              / (biz1.sellerNoteBalance + biz2.sellerNoteBalance)
            : 0,
          sellerNoteRoundsRemaining: (biz1.sellerNoteBalance + biz2.sellerNoteBalance) > 0
            ? Math.ceil(
                (biz1.sellerNoteBalance * biz1.sellerNoteRoundsRemaining + biz2.sellerNoteBalance * biz2.sellerNoteRoundsRemaining)
                / (biz1.sellerNoteBalance + biz2.sellerNoteBalance)
              )
            : 0,
          bankDebtBalance: biz1.bankDebtBalance + biz2.bankDebtBalance,
          bankDebtRate: (biz1.bankDebtBalance + biz2.bankDebtBalance) > 0
            ? (biz1.bankDebtBalance * (biz1.bankDebtRate || 0) + biz2.bankDebtBalance * (biz2.bankDebtRate || 0))
              / (biz1.bankDebtBalance + biz2.bankDebtBalance)
            : 0,
          bankDebtRoundsRemaining: (biz1.bankDebtBalance + biz2.bankDebtBalance) > 0
            ? Math.ceil(
                (biz1.bankDebtBalance * (biz1.bankDebtRoundsRemaining || 0) + biz2.bankDebtBalance * (biz2.bankDebtRoundsRemaining || 0))
                / (biz1.bankDebtBalance + biz2.bankDebtBalance)
              )
            : 0,
          earnoutRemaining: biz1.earnoutRemaining + biz2.earnoutRemaining,
          earnoutTarget: Math.max(biz1.earnoutTarget, biz2.earnoutTarget),
          rolloverEquityPct: (Math.abs(biz1.ebitda) + Math.abs(biz2.ebitda)) > 0
            ? (Math.abs(biz1.ebitda) * (biz1.rolloverEquityPct || 0) + Math.abs(biz2.ebitda) * (biz2.rolloverEquityPct || 0))
              / (Math.abs(biz1.ebitda) + Math.abs(biz2.ebitda))
            : 0,
          status: 'active',
          isPlatform: true,
          platformScale: newPlatformScale,
          boltOnIds: [...biz1.boltOnIds, ...biz2.boltOnIds],
          integratedPlatformId: mergedIntegratedPlatformId,
          integrationOutcome: outcome,
          synergiesRealized: (biz1.synergiesRealized || 0) + (biz2.synergiesRealized || 0) + synergies,
          totalAcquisitionCost: combinedTotalCost,
          // Recalculate size tier for merged EBITDA (not Math.max of originals)
          acquisitionSizeTierPremium: calculateSizeTierPremium(combinedEbitda).premium,
          wasMerged: true,
          mergerBalanceRatio: mergerBalanceRatio,
        };

        // Remove old businesses, add merged one, and update bolt-on parent references
        const allBoltOnIds = new Set([...biz1.boltOnIds, ...biz2.boltOnIds]);
        let updatedBusinesses = state.businesses
          .filter(b => b.id !== businessId1 && b.id !== businessId2)
          .map(b => allBoltOnIds.has(b.id) ? { ...b, parentPlatformId: mergedBusiness.id } : b);

        // Update integrated platform constituent lists after merge
        let updatedIntegratedPlatforms = state.integratedPlatforms;
        if (mergedIntegratedPlatformId) {
          updatedIntegratedPlatforms = updatedIntegratedPlatforms.map(ip => {
            if (ip.id !== mergedIntegratedPlatformId) return ip;
            // Replace old business IDs with the merged business ID
            const newConstituents = ip.constituentBusinessIds
              .filter(id => id !== businessId1 && id !== businessId2);
            newConstituents.push(mergedBusiness.id);
            return { ...ip, constituentBusinessIds: newConstituents };
          });

          // Check dissolution: if merge reduces sub-type diversity below recipe minimum
          const platform = updatedIntegratedPlatforms.find(ip => ip.id === mergedIntegratedPlatformId);
          if (platform && checkPlatformDissolution(platform, [...updatedBusinesses, mergedBusiness])) {
            // Dissolve: remove platform, clear integratedPlatformId
            updatedIntegratedPlatforms = updatedIntegratedPlatforms.filter(ip => ip.id !== mergedIntegratedPlatformId);
            mergedBusiness.integratedPlatformId = undefined;
            updatedBusinesses = updatedBusinesses.map(b =>
              b.integratedPlatformId === mergedIntegratedPlatformId ? { ...b, integratedPlatformId: undefined } : b
            );
          }
        }

        // If both businesses were in different platforms, handle the second one too
        const secondPlatformId = biz1.integratedPlatformId && biz2.integratedPlatformId
          && biz1.integratedPlatformId !== biz2.integratedPlatformId
          ? biz2.integratedPlatformId : undefined;
        if (secondPlatformId) {
          updatedIntegratedPlatforms = updatedIntegratedPlatforms.map(ip => {
            if (ip.id !== secondPlatformId) return ip;
            return { ...ip, constituentBusinessIds: ip.constituentBusinessIds.filter(id => id !== businessId2) };
          });
          // Check dissolution for the second platform (lost a member)
          const secondPlatform = updatedIntegratedPlatforms.find(ip => ip.id === secondPlatformId);
          if (secondPlatform && checkPlatformDissolution(secondPlatform, [...updatedBusinesses, mergedBusiness])) {
            updatedIntegratedPlatforms = updatedIntegratedPlatforms.filter(ip => ip.id !== secondPlatformId);
            updatedBusinesses = updatedBusinesses.map(b =>
              b.integratedPlatformId === secondPlatformId ? { ...b, integratedPlatformId: undefined } : b
            );
          }
        }

        set({
          cash: state.cash - totalMergeCost,
          totalInvestedCapital: state.totalInvestedCapital + totalMergeCost,
          businesses: [...updatedBusinesses, mergedBusiness],
          integratedPlatforms: updatedIntegratedPlatforms,
          lastIntegrationOutcome: outcome,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...biz1, status: 'merged' as const, exitRound: state.round },
            { ...biz2, status: 'merged' as const, exitRound: state.round },
          ],
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'merge_businesses',
              round: state.round,
              details: {
                businessId1,
                businessId2,
                newBusinessId: mergedBusiness.id,
                newName,
                mergeCost: totalMergeCost,
                integrationOutcome: outcome,
                synergies,
                combinedEbitda,
                restructuringCost: mergeRestructuringCost,
                growthDragPenalty: mergeGrowthDrag,
                mergerSizeRatio,
                mergerSizeRatioTier,
                mergerBalanceRatio,
              },
            },
          ],
          metrics: calculateMetrics({
            ...state,
            cash: state.cash - totalMergeCost,
            businesses: [...updatedBusinesses, mergedBusiness],
            integratedPlatforms: updatedIntegratedPlatforms,
          }),
        });
      },

      // Designate an existing business as a platform
      designatePlatform: (businessId: string) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId && b.status === 'active');
        if (!business) {
          useToastStore.getState().addToast({ message: 'Action failed: business no longer available', type: 'warning' });
          return;
        }

        // Already a platform
        if (business.isPlatform) return;

        // Cost to set up platform infrastructure
        const setupCost = Math.max(50, Math.round(Math.abs(business.ebitda) * 0.05));
        if (state.cash < setupCost) return;

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id === businessId) {
            return {
              ...b,
              isPlatform: true,
              platformScale: 1,
            };
          }
          return b;
        });

        const designateState = {
          ...state,
          cash: state.cash - setupCost,
          totalInvestedCapital: state.totalInvestedCapital + setupCost,
          businesses: updatedBusinesses,
        };
        set({
          ...designateState,
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'designate_platform',
              round: state.round,
              details: { businessId, setupCost },
            },
          ],
          metrics: calculateMetrics(designateState),
        });
      },

      improveBusiness: (businessId: string, improvementType: OperationalImprovementType) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') {
          useToastStore.getState().addToast({ message: 'Action failed: business no longer available', type: 'warning' });
          return;
        }

        // M-3: Prevent applying the same improvement type twice to the same business
        if (business.improvements.some(i => i.type === improvementType)) return;

        // Calculate cost and revenue/margin effects based on improvement type
        let cost: number;
        let marginBoost = 0;    // ppt change to margin
        let revenueBoost = 0;   // % change to revenue
        let growthBoost = 0;

        const absEbitda = Math.abs(business.ebitda) || 1;
        switch (improvementType) {
          case 'operating_playbook':
            cost = Math.round(absEbitda * 0.15);
            marginBoost = 0.03; // +3 ppt margin
            break;
          case 'pricing_model':
            cost = Math.round(absEbitda * 0.10);
            marginBoost = 0.02; // +2 ppt margin
            revenueBoost = 0.01; // +1% revenue
            growthBoost = 0.01;
            break;
          case 'service_expansion': {
            cost = Math.round(absEbitda * 0.20);
            const impStreams = createRngStreams(state.seed, state.round);
            revenueBoost = 0.08 + impStreams.market.fork(businessId + '_improve').next() * 0.04; // +8-12% revenue
            marginBoost = -0.01; // -1 ppt margin initially (cost of expansion)
            break;
          }
          case 'fix_underperformance':
            cost = Math.round(absEbitda * 0.12);
            marginBoost = 0.04; // +4 ppt margin
            break;
          case 'recurring_revenue_conversion':
            cost = Math.round(absEbitda * 0.25);
            marginBoost = -0.02; // -2 ppt margin (upfront investment)
            growthBoost = 0.03; // +3% permanent growth
            break;
          case 'management_professionalization':
            cost = Math.round(absEbitda * 0.18);
            marginBoost = 0.01; // +1 ppt margin
            growthBoost = 0.01; // +1% growth
            break;
          case 'digital_transformation':
            cost = Math.round(absEbitda * 0.22);
            revenueBoost = 0.03; // +3% immediate revenue
            marginBoost = business.ebitdaMargin > 0.30 ? 0.01 : 0.02; // halved if >30%
            growthBoost = 0.02; // +2% permanent growth
            break;
          default:
            return;
        }

        // Cost floor: prevents mashing improvements on tiny businesses
        cost = Math.max(IMPROVEMENT_COST_FLOOR, cost);

        if (state.cash < cost) {
          useToastStore.getState().addToast({ message: `Improvement failed: need ${formatMoney(cost)} but only have ${formatMoney(state.cash)}`, type: 'danger' });
          return;
        }

        // Quality multiplier: higher quality businesses get more from improvements
        const qualityMult = QUALITY_IMPROVEMENT_MULTIPLIER[business.qualityRating as 1|2|3|4|5] ?? 1.0;
        if (marginBoost > 0) marginBoost *= qualityMult;
        if (revenueBoost > 0) revenueBoost *= qualityMult;
        if (growthBoost > 0) growthBoost *= qualityMult;

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id !== businessId) return b;
          const newRevenue = Math.round(b.revenue * (1 + revenueBoost));
          const newMargin = clampMargin(b.ebitdaMargin + marginBoost);
          const newEbitda = Math.round(newRevenue * newMargin);
          const ebitdaBoost = b.ebitda > 0 ? (newEbitda - b.ebitda) / b.ebitda : 0;

          // Special: management_professionalization upgrades operatorQuality
          let updatedDueDiligence = b.dueDiligence;
          if (improvementType === 'management_professionalization') {
            const upgraded = b.dueDiligence.operatorQuality === 'weak' ? 'moderate' as const
              : b.dueDiligence.operatorQuality === 'moderate' ? 'strong' as const
              : 'strong' as const;
            updatedDueDiligence = { ...b.dueDiligence, operatorQuality: upgraded };
          }

          // Special: digital_transformation increases marginDriftRate
          let updatedMarginDriftRate = b.marginDriftRate;
          if (improvementType === 'digital_transformation') {
            updatedMarginDriftRate += 0.002;
          }

          return {
            ...b,
            revenue: newRevenue,
            ebitdaMargin: newMargin,
            ebitda: newEbitda,
            peakRevenue: Math.max(b.peakRevenue, newRevenue),
            organicGrowthRate: b.organicGrowthRate + growthBoost,
            revenueGrowthRate: b.revenueGrowthRate + growthBoost,
            totalAcquisitionCost: b.totalAcquisitionCost + cost,
            dueDiligence: updatedDueDiligence,
            marginDriftRate: updatedMarginDriftRate,
            improvements: [
              ...b.improvements,
              { type: improvementType, appliedRound: state.round, effect: ebitdaBoost },
            ],
          };
        });

        // Roll for quality improvement from operational improvement
        const improvedBusiness = updatedBusinesses.find(b => b.id === businessId);
        if (improvedBusiness) {
          const ceiling = getQualityCeiling(improvedBusiness.sectorId);
          if (improvedBusiness.qualityRating < ceiling) {
            const chance = getQualityImprovementChance(state.turnaroundTier);
            const qualStreams = createRngStreams(state.seed, state.round);
            if (qualStreams.market.fork(businessId + '_quality').next() < chance) {
              const newQuality = Math.min(improvedBusiness.qualityRating + 1, ceiling) as QualityRating;
              const idx = updatedBusinesses.findIndex(b => b.id === businessId);
              updatedBusinesses[idx] = {
                ...improvedBusiness,
                qualityRating: newQuality,
                qualityImprovedTiers: (improvedBusiness.qualityImprovedTiers ?? 0) + 1,
              };
              const addToast = useToastStore.getState().addToast;
              addToast({ message: `Quality improved! ${improvedBusiness.name} is now Q${newQuality}`, type: 'success' });
            }
          }
        }

        const improveState = {
          ...state,
          cash: state.cash - cost,
          totalInvestedCapital: state.totalInvestedCapital + cost,
          businesses: updatedBusinesses,
        };
        set({
          ...improveState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'improve', round: state.round, details: { businessId, improvementType, cost } },
          ],
          metrics: calculateMetrics(improveState),
        });
      },

      unlockSharedService: (serviceType: SharedServiceType) => {
        const state = get();
        const service = state.sharedServices.find(s => s.type === serviceType);
        if (!service || service.active) return;

        const opcoCount = state.businesses.filter(b => b.status === 'active').length;

        // No cap on active shared services — annual cost is the natural limiter
        if (opcoCount < MIN_OPCOS_FOR_SHARED_SERVICES) return;
        if (state.cash < service.unlockCost) return;

        const updatedServices = state.sharedServices.map(s =>
          s.type === serviceType ? { ...s, active: true, unlockedRound: state.round } : s
        );

        const unlockState = {
          ...state,
          cash: state.cash - service.unlockCost,
          totalInvestedCapital: state.totalInvestedCapital + service.unlockCost,
          sharedServices: updatedServices,
        };
        set({
          ...unlockState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'unlock_shared_service', round: state.round, details: { serviceType } },
          ],
          metrics: calculateMetrics(unlockState),
        });
      },

      deactivateSharedService: (serviceType: SharedServiceType) => {
        const state = get();
        const updatedServices = state.sharedServices.map(s =>
          s.type === serviceType ? { ...s, active: false } : s
        );

        const deactivateState = {
          ...state,
          sharedServices: updatedServices,
        };
        set({
          ...deactivateState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'deactivate_shared_service', round: state.round, details: { serviceType } },
          ],
          metrics: calculateMetrics(deactivateState),
        });
      },

      payDownDebt: (amount: number) => {
        const state = get();
        // Pay down holdco loan balance (voluntary prepayment)
        const actualPayment = Math.min(amount, state.holdcoLoanBalance, state.cash);
        if (actualPayment <= 0) return;

        const newHoldcoLoanBalance = state.holdcoLoanBalance - actualPayment;
        const newTotalDebt = computeTotalDebt(state.businesses, newHoldcoLoanBalance);

        const payDebtState = {
          ...state,
          cash: state.cash - actualPayment,
          totalDebt: newTotalDebt,
          holdcoLoanBalance: newHoldcoLoanBalance,
        };
        set({
          ...payDebtState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'pay_debt', round: state.round, details: { amount: actualPayment } },
          ],
          metrics: calculateMetrics(payDebtState),
        });
      },

      payDownBankDebt: (businessId: string, amount: number) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') {
          useToastStore.getState().addToast({ message: 'Action failed: business no longer available', type: 'warning' });
          return;
        }
        if (business.bankDebtBalance <= 0) return;

        const actualPayment = Math.min(amount, business.bankDebtBalance, state.cash);
        if (actualPayment <= 0) return;

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id !== businessId) return b;
          return { ...b, bankDebtBalance: b.bankDebtBalance - actualPayment };
        });
        const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);

        const payBankDebtState = {
          ...state,
          cash: state.cash - actualPayment,
          totalDebt: newTotalDebt,
          businesses: updatedBusinesses,
        };
        set({
          ...payBankDebtState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'pay_debt', round: state.round, details: { amount: actualPayment, businessId, bankDebt: true } },
          ],
          metrics: calculateMetrics(payBankDebtState),
        });
      },

      issueEquity: (amount: number) => {
        const state = get();
        if (amount <= 0) return;

        // Guard: no normal equity raises during restructuring (use emergencyEquityRaise instead)
        if (state.requiresRestructuring) return;

        // Cooldown: blocked if buyback was done within EQUITY_BUYBACK_COOLDOWN rounds
        if (state.lastBuybackRound > 0 && state.round - state.lastBuybackRound < EQUITY_BUYBACK_COOLDOWN) return;

        const metrics = calculateMetrics(state);
        // M-5: Guard against division by zero or negative intrinsic value
        if (metrics.intrinsicValuePerShare <= 0) return;

        // Escalating dilution: each prior raise discounts the price by EQUITY_DILUTION_STEP
        const discount = Math.max(1 - EQUITY_DILUTION_STEP * state.equityRaisesUsed, EQUITY_DILUTION_FLOOR);
        const effectivePrice = metrics.intrinsicValuePerShare * discount;
        const newShares = Math.round((amount / effectivePrice) * 1000) / 1000;

        // Calculate what ownership would be after issuance
        const newTotalShares = state.sharesOutstanding + newShares;
        const newFounderOwnership = state.founderShares / newTotalShares;

        // Must maintain majority control (51%+)
        if (newFounderOwnership < MIN_FOUNDER_OWNERSHIP) return;

        const issueState = {
          ...state,
          cash: state.cash + amount,
          sharesOutstanding: newTotalShares,
          equityRaisesUsed: state.equityRaisesUsed + 1,
          lastEquityRaiseRound: state.round,
        };
        set({
          ...issueState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'issue_equity', round: state.round, details: { amount, newShares, newOwnership: newFounderOwnership, discount: 1 - discount } },
          ],
          metrics: calculateMetrics(issueState),
        });
      },

      buybackShares: (amount: number) => {
        const state = get();
        if (state.cash < amount) return;

        // Block buybacks when no active businesses — prevents sell-all-then-buyback FEV exploit
        const activeCount = state.businesses.filter(b => b.status === 'active').length;
        if (activeCount === 0) return;

        // Cooldown: blocked if equity was raised within EQUITY_BUYBACK_COOLDOWN rounds
        if (state.lastEquityRaiseRound > 0 && state.round - state.lastEquityRaiseRound < EQUITY_BUYBACK_COOLDOWN) return;

        const metrics = calculateMetrics(state);
        // Enforce distress restrictions — covenant breach blocks buybacks
        const restrictions = getDistressRestrictions(metrics.distressLevel);
        if (!restrictions.canBuyback) return;
        // M-5: Guard against division by zero or negative intrinsic value
        if (metrics.intrinsicValuePerShare <= 0) return;
        let sharesRepurchased = Math.round((amount / metrics.intrinsicValuePerShare) * 1000) / 1000;

        // Can only buy back non-founder shares (outside investors' shares)
        const outsideShares = state.sharesOutstanding - state.founderShares;
        if (outsideShares <= 0) return; // No outside shares to buy back
        // Cap to outside shares (prevents floating-point rounding from exceeding by a fraction)
        sharesRepurchased = Math.min(sharesRepurchased, outsideShares);

        // Snap to exact founder shares when buying all remaining outside shares
        // to avoid floating-point residue (e.g., 0.001 shares left)
        let newTotalShares = state.sharesOutstanding - sharesRepurchased;
        if (Math.abs(newTotalShares - state.founderShares) < 0.01) {
          newTotalShares = state.founderShares;
        }
        const newFounderOwnership = state.founderShares / newTotalShares;

        const buybackState = {
          ...state,
          cash: state.cash - amount,
          sharesOutstanding: newTotalShares,
          totalBuybacks: state.totalBuybacks + amount,
          lastBuybackRound: state.round,
        };
        set({
          ...buybackState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'buyback', round: state.round, details: { amount, sharesRepurchased, newOwnership: newFounderOwnership } },
          ],
          metrics: calculateMetrics(buybackState),
        });
      },

      distributeToOwners: (amount: number) => {
        const state = get();
        if (state.cash < amount) return;

        // Enforce distress restrictions — covenant breach blocks distributions
        const restrictions = getDistressRestrictions(calculateMetrics(state).distressLevel);
        if (!restrictions.canDistribute) return;

        // Track founder's portion of distribution incrementally (at current ownership %)
        const founderPortion = Math.round(amount * (state.founderShares / state.sharesOutstanding));

        const distributeState = {
          ...state,
          cash: state.cash - amount,
          totalDistributions: state.totalDistributions + amount,
          founderDistributionsReceived: (state.founderDistributionsReceived || 0) + founderPortion,
        };
        set({
          ...distributeState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'distribute', round: state.round, details: { amount, founderPortion } },
          ],
          metrics: calculateMetrics(distributeState),
        });
      },

      sellBusiness: (businessId: string) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') {
          useToastStore.getState().addToast({ message: 'Action failed: business no longer available', type: 'warning' });
          return;
        }

        // L-1: Use shared calculateExitValuation instead of duplicated logic
        const lastEvent = state.eventHistory[state.eventHistory.length - 1];
        const valuation = calculateExitValuation(business, state.round, lastEvent?.type, undefined, state.integratedPlatforms);

        // Generate buyer profile for the sale (seeded for challenge determinism)
        const sellStreams = createRngStreams(state.seed, state.round);
        const sellRng = sellStreams.market.fork(businessId + '_sell');
        const buyerProfile = generateBuyerProfile(business, valuation.buyerPoolTier, business.sectorId, sellRng);

        // If strategic buyer, add their premium
        let effectiveMultiple = valuation.totalMultiple;
        if (buyerProfile.isStrategic) {
          effectiveMultiple += buyerProfile.strategicPremium;
        }

        // Financial Crisis exit multiple penalty
        effectiveMultiple -= (state.exitMultiplePenalty || 0);

        // Add small random variance for actual sale (market conditions variation)
        const marketVariance = lastEvent?.type === 'global_bull_market' ? sellRng.next() * 0.3
          : lastEvent?.type === 'global_recession' ? -(sellRng.next() * 0.3)
          : (sellRng.next() * 0.2 - 0.1);
        const exitPrice = Math.max(0, Math.round(business.ebitda * Math.max(2.0, effectiveMultiple + marketVariance)));
        // Also mark bolt-ons as sold when selling a platform
        const boltOnIds = new Set(business.boltOnIds || []);

        // Include bolt-on debt + earn-out obligations in total debt payoff
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0);
        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + business.earnoutRemaining + boltOnDebt;
        const netProceeds = Math.max(0, exitPrice - debtPayoff);

        // Rollover equity split — seller receives their share of net proceeds
        const rolloverPct = business.rolloverEquityPct || 0;
        const playerProceeds = rolloverPct > 0 ? Math.round(netProceeds * (1 - rolloverPct)) : netProceeds;

        let updatedBusinesses = state.businesses.map(b => {
          if (b.id === businessId) return { ...b, status: 'sold' as const, exitPrice, exitRound: state.round, earnoutRemaining: 0 };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 };
          return b;
        });

        // Platform dissolution check: if sold business was part of an integrated platform
        let updatedPlatforms = state.integratedPlatforms;
        if (business.integratedPlatformId) {
          const platform = state.integratedPlatforms.find(p => p.id === business.integratedPlatformId);
          if (platform) {
            if (checkPlatformDissolution(platform, updatedBusinesses)) {
              // Dissolve: remove platform, clear integratedPlatformId from remaining constituents
              updatedPlatforms = updatedPlatforms.filter(p => p.id !== platform.id);
              updatedBusinesses = updatedBusinesses.map(b =>
                b.integratedPlatformId === platform.id ? { ...b, integratedPlatformId: undefined } : b
              );
            } else {
              // Still viable: just remove the sold business from constituentBusinessIds
              updatedPlatforms = updatedPlatforms.map(p =>
                p.id === platform.id
                  ? { ...p, constituentBusinessIds: p.constituentBusinessIds.filter(id => id !== businessId) }
                  : p
              );
            }
          }
        }

        // M-7: Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Collect bolt-on businesses for exitedBusinesses
        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round }));

        // Recompute totalDebt after sale (sold business bank debt removed)
        const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);

        const sellState = {
          ...state,
          cash: state.cash + playerProceeds,
          totalDebt: newTotalDebt,
          totalExitProceeds: state.totalExitProceeds + playerProceeds,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
          integratedPlatforms: updatedPlatforms,
        };
        set({
          ...sellState,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'sold' as const, exitPrice, exitRound: state.round },
            ...exitedBoltOns,
          ],
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'sell', round: state.round,
              details: { businessId, exitPrice, netProceeds: playerProceeds, rolloverDeduction: netProceeds - playerProceeds, buyerName: buyerProfile.name, buyerType: buyerProfile.type },
            },
          ],
          metrics: calculateMetrics(sellState),
        });
      },

      acceptOffer: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'unsolicited_offer' || !event.affectedBusinessId || !event.offerAmount) return;

        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;

        // Cascade to bolt-on businesses
        const boltOnIds = new Set(business.boltOnIds || []);

        // Include bolt-on debt + earn-out obligations in total debt payoff
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0);
        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + business.earnoutRemaining + boltOnDebt;
        const netProceeds = Math.max(0, event.offerAmount - debtPayoff);

        // Rollover equity split
        const rolloverPctOffer = business.rolloverEquityPct || 0;
        const playerProceedsOffer = rolloverPctOffer > 0 ? Math.round(netProceeds * (1 - rolloverPctOffer)) : netProceeds;

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id === event.affectedBusinessId) return { ...b, status: 'sold' as const, exitPrice: event.offerAmount, exitRound: state.round, earnoutRemaining: 0 };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 };
          return b;
        });
        const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);

        // Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Collect bolt-on businesses for exitedBusinesses
        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 }));

        const acceptState = {
          ...state,
          cash: state.cash + playerProceedsOffer,
          totalDebt: newTotalDebt,
          totalExitProceeds: state.totalExitProceeds + playerProceedsOffer,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
        };
        set({
          ...acceptState,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'sold' as const, exitPrice: event.offerAmount, exitRound: state.round },
            ...exitedBoltOns,
          ],
          currentEvent: null,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'accept_offer', round: state.round, details: { businessId: event.affectedBusinessId, price: event.offerAmount } },
          ],
          metrics: calculateMetrics(acceptState),
        });
      },

      declineOffer: () => {
        const state = get();
        set({
          currentEvent: null,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'decline_offer', round: state.round, details: {} },
          ],
          metrics: calculateMetrics(state),
        });
      },

      acceptMBOOffer: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'mbo_proposal' || !event.affectedBusinessId || !event.offerAmount) return;

        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;

        // Same sale flow as acceptOffer — mark sold, cascade bolt-ons, deduct debt, add net proceeds
        const boltOnIds = new Set(business.boltOnIds || []);
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0);
        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + business.earnoutRemaining + boltOnDebt;
        const netProceeds = Math.max(0, event.offerAmount - debtPayoff);

        // Rollover equity split
        const rolloverPctMBO = business.rolloverEquityPct || 0;
        const playerProceedsMBO = rolloverPctMBO > 0 ? Math.round(netProceeds * (1 - rolloverPctMBO)) : netProceeds;

        let updatedBusinesses = state.businesses.map(b => {
          if (b.id === event.affectedBusinessId) return { ...b, status: 'sold' as const, exitPrice: event.offerAmount, exitRound: state.round, earnoutRemaining: 0 };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 };
          return b;
        });
        const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);

        // Platform dissolution check
        let updatedPlatforms = state.integratedPlatforms;
        if (business.integratedPlatformId) {
          const platform = state.integratedPlatforms.find(p => p.id === business.integratedPlatformId);
          if (platform) {
            if (checkPlatformDissolution(platform, updatedBusinesses)) {
              updatedPlatforms = updatedPlatforms.filter(p => p.id !== platform.id);
              updatedBusinesses = updatedBusinesses.map(b =>
                b.integratedPlatformId === platform.id ? { ...b, integratedPlatformId: undefined } : b
              );
            } else {
              updatedPlatforms = updatedPlatforms.map(p =>
                p.id === platform.id
                  ? { ...p, constituentBusinessIds: p.constituentBusinessIds.filter(id => id !== business.id) }
                  : p
              );
            }
          }
        }

        // Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Remove active turnarounds for sold business
        const updatedTurnarounds = state.activeTurnarounds.filter(t => t.businessId !== business.id);

        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round }));

        const acceptState = {
          ...state,
          cash: state.cash + playerProceedsMBO,
          totalDebt: newTotalDebt,
          totalExitProceeds: state.totalExitProceeds + playerProceedsMBO,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
          integratedPlatforms: updatedPlatforms,
          activeTurnarounds: updatedTurnarounds,
        };
        set({
          ...acceptState,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'sold' as const, exitPrice: event.offerAmount, exitRound: state.round },
            ...exitedBoltOns,
          ],
          currentEvent: null,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'accept_offer', round: state.round, details: { businessId: event.affectedBusinessId, price: event.offerAmount } },
          ],
          metrics: calculateMetrics(acceptState),
        });
      },

      declineMBOOffer: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'mbo_proposal' || !event.affectedBusinessId) return;

        let declineState = { ...state, currentEvent: null as typeof state.currentEvent };
        const mboStreams = createRngStreams(state.seed, state.round);
        if (mboStreams.events.fork('mbo_decline').next() < 0.40) {
          // CEO leaves: quality -1 (floor Q1), recalculate EBITDA with adjusted margin
          declineState.businesses = state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            const newQuality = Math.max(1, b.qualityRating - 1) as 1 | 2 | 3 | 4 | 5;
            const marginDelta = -0.015; // -1.5ppt per quality tier
            const newMargin = clampMargin(b.ebitdaMargin + marginDelta);
            const newEbitda = Math.round(b.revenue * newMargin);
            return { ...b, qualityRating: newQuality, ebitdaMargin: newMargin, ebitda: newEbitda };
          });
        } else {
          // CEO stays but resentful: -2% growth penalty
          declineState.businesses = state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            return {
              ...b,
              organicGrowthRate: b.organicGrowthRate - 0.02,
              revenueGrowthRate: b.revenueGrowthRate - 0.02,
            };
          });
        }
        set({
          ...declineState,
          metrics: calculateMetrics(declineState),
        });
      },

      // Event choice actions
      grantEquityDemand: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_equity_demand' || !event.affectedBusinessId) return;
        // Parse dilution from choice label
        const dilutionMatch = event.choices?.[0]?.label.match(/(\d+)/);
        const dilution = dilutionMatch ? parseInt(dilutionMatch[1]) : 25;
        const grantState = {
          ...state,
          sharesOutstanding: state.sharesOutstanding + dilution,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            const newMargin = clampMargin(b.ebitdaMargin + 0.01);
            const newEbitda = Math.round(b.revenue * newMargin);
            return {
              ...b,
              ebitdaMargin: newMargin,
              ebitda: newEbitda,
              organicGrowthRate: b.organicGrowthRate + 0.02,
              revenueGrowthRate: b.revenueGrowthRate + 0.02,
            };
          }),
          currentEvent: null,
        };
        set({
          ...grantState,
          metrics: calculateMetrics(grantState),
        });
      },

      declineEquityDemand: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_equity_demand' || !event.affectedBusinessId) return;
        // 60% chance talent leaves
        let declineState = { ...state, currentEvent: null };
        const eqStreams = createRngStreams(state.seed, state.round);
        if (eqStreams.events.fork('equity_decline').next() < 0.60 && event.affectedBusinessId) {
          declineState.businesses = state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            const newRevenue = Math.round(b.revenue * 0.94);
            const newMargin = clampMargin(b.ebitdaMargin - 0.02);
            const newEbitda = Math.round(newRevenue * newMargin);
            return {
              ...b,
              revenue: newRevenue,
              ebitdaMargin: newMargin,
              ebitda: newEbitda,
              organicGrowthRate: b.organicGrowthRate - 0.015,
              revenueGrowthRate: b.revenueGrowthRate - 0.015,
            };
          });
        }
        set({
          ...declineState,
          metrics: calculateMetrics(declineState),
        });
      },

      acceptSellerNoteRenego: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_seller_note_renego' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        // Parse discount rate from choice label
        const pctMatch = event.choices?.[0]?.description.match(/(\d+)%/);
        const discountRate = pctMatch ? parseInt(pctMatch[1]) / 100 : 0.75;
        const payoffAmount = Math.round(business.sellerNoteBalance * discountRate);
        if (state.cash < payoffAmount) return; // Can't afford
        const renoState = {
          ...state,
          cash: state.cash - payoffAmount,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            return { ...b, sellerNoteBalance: 0, sellerNoteRoundsRemaining: 0 };
          }),
          currentEvent: null,
        };
        set({
          ...renoState,
          metrics: calculateMetrics(renoState),
        });
      },

      declineSellerNoteRenego: () => {
        const state = get();
        set({
          currentEvent: null,
          metrics: calculateMetrics(state),
        });
      },

      // ── New choice-based event actions ──

      keyManGoldenHandcuffs: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_key_man_risk' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        const cost = event.choices?.find(c => c.action === 'keyManGoldenHandcuffs')?.cost ?? Math.round(business.ebitda * KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT);
        if (state.cash < cost) return;
        const kmStreams = createRngStreams(state.seed, state.round);
        const restored = kmStreams.events.fork('golden_handcuffs').next() < KEY_MAN_GOLDEN_HANDCUFFS_RESTORE_CHANCE;
        const newState = {
          ...state,
          cash: state.cash - cost,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            if (restored) {
              // Quality already dropped in applyEventEffects — restore it
              const restoredQuality = Math.min(5, b.qualityRating + 1) as 1 | 2 | 3 | 4 | 5;
              const newMargin = clampMargin(b.ebitdaMargin + 0.015);
              return { ...b, qualityRating: restoredQuality, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin) };
            }
            return b; // Quality stays dropped
          }),
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        const addToast = useToastStore.getState().addToast;
        if (restored) {
          addToast({ message: `Golden handcuffs worked — ${business.name} quality restored`, type: 'success' });
        } else {
          addToast({ message: `Golden handcuffs paid but ${business.name} quality stays dropped`, type: 'warning' });
        }
      },

      keyManSuccessionPlan: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_key_man_risk' || !event.affectedBusinessId) return;
        const cost = event.choices?.find(c => c.action === 'keyManSuccessionPlan')?.cost ?? randomInt(KEY_MAN_SUCCESSION_COST_MIN, KEY_MAN_SUCCESSION_COST_MAX);
        if (state.cash < cost) return;
        const newState = {
          ...state,
          cash: state.cash - cost,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            return { ...b, successionPlanRound: state.round };
          }),
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Succession plan started — quality will restore in ${KEY_MAN_SUCCESSION_ROUNDS} rounds`, type: 'info' });
      },

      keyManAcceptHit: () => {
        const state = get();
        set({ currentEvent: null, metrics: calculateMetrics(state) });
        useToastStore.getState().addToast({ message: 'Accepted key-man quality drop', type: 'warning' });
      },

      earnoutSettle: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_earnout_dispute' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        const settleAmount = Math.round(business.earnoutRemaining * EARNOUT_SETTLE_PCT);
        if (state.cash < settleAmount) return;
        const newState = {
          ...state,
          cash: state.cash - settleAmount,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            return { ...b, earnoutRemaining: 0, earnoutTarget: 0 };
          }),
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Settled earn-out dispute for ${formatMoney(settleAmount)}`, type: 'success' });
      },

      earnoutFight: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_earnout_dispute' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        const legalCost = event.choices?.find(c => c.action === 'earnoutFight')?.cost ?? randomInt(EARNOUT_FIGHT_LEGAL_COST_MIN, EARNOUT_FIGHT_LEGAL_COST_MAX);
        if (state.cash < legalCost) return;
        const eoStreams = createRngStreams(state.seed, state.round);
        const won = eoStreams.events.fork('earnout_fight').next() < EARNOUT_FIGHT_WIN_CHANCE;
        const addToast = useToastStore.getState().addToast;
        if (won) {
          const newState = {
            ...state,
            cash: state.cash - legalCost,
            businesses: state.businesses.map(b => {
              if (b.id !== event.affectedBusinessId) return b;
              return { ...b, earnoutRemaining: 0, earnoutTarget: 0 };
            }),
            currentEvent: null,
          };
          set({ ...newState, metrics: calculateMetrics(newState) });
          addToast({ message: `Won earn-out dispute! Legal costs: ${formatMoney(legalCost)}`, type: 'success' });
        } else {
          // Lost: pay full earnout + legal costs
          const totalCost = legalCost + business.earnoutRemaining;
          const actualPay = Math.min(totalCost, state.cash);
          const remainingEarnout = Math.max(0, business.earnoutRemaining - (actualPay - legalCost));
          const newState = {
            ...state,
            cash: state.cash - actualPay,
            businesses: state.businesses.map(b => {
              if (b.id !== event.affectedBusinessId) return b;
              return { ...b, earnoutRemaining: remainingEarnout, earnoutTarget: remainingEarnout > 0 ? b.earnoutTarget : 0 };
            }),
            currentEvent: null,
          };
          set({ ...newState, metrics: calculateMetrics(newState) });
          addToast({ message: `Lost earn-out fight. Paid ${formatMoney(actualPay)} (legal + obligation)`, type: 'danger' });
        }
      },

      earnoutRenegotiate: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_earnout_dispute' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        const newAmount = Math.round(business.earnoutRemaining * EARNOUT_RENEGOTIATE_PCT);
        const newState = {
          ...state,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            return { ...b, earnoutRemaining: newAmount, earnoutDisputeRound: state.round };
          }),
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Renegotiated earn-out to ${formatMoney(newAmount)}`, type: 'info' });
      },

      supplierAbsorb: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_supplier_shift' || !event.affectedBusinessId) return;
        // Recover 2ppt of the 3ppt hit (net -1ppt permanent)
        const newState = {
          ...state,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            const newMargin = clampMargin(b.ebitdaMargin + SUPPLIER_ABSORB_RECOVERY_PPT);
            return { ...b, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin) };
          }),
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Absorbed supplier costs — net ${Math.round((SUPPLIER_SHIFT_MARGIN_HIT - SUPPLIER_ABSORB_RECOVERY_PPT) * 100)}ppt permanent margin loss`, type: 'warning' });
      },

      supplierSwitch: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_supplier_shift' || !event.affectedBusinessId) return;
        const cost = event.choices?.find(c => c.action === 'supplierSwitch')?.cost ?? randomInt(SUPPLIER_SWITCH_COST_MIN, SUPPLIER_SWITCH_COST_MAX);
        if (state.cash < cost) return;
        const newState = {
          ...state,
          cash: state.cash - cost,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            // Full margin recovery (restore the 3ppt hit)
            const newMargin = clampMargin(b.ebitdaMargin + SUPPLIER_SHIFT_MARGIN_HIT);
            // -5% revenue this round
            const newRevenue = Math.round(b.revenue * (1 - SUPPLIER_SWITCH_REVENUE_PENALTY));
            const newEbitda = Math.round(newRevenue * newMargin);
            return { ...b, ebitdaMargin: newMargin, revenue: newRevenue, ebitda: newEbitda };
          }),
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Switched suppliers — margin restored, -${Math.round(SUPPLIER_SWITCH_REVENUE_PENALTY * 100)}% revenue hit`, type: 'info' });
      },

      supplierVerticalIntegration: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_supplier_shift' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        // Verify eligibility
        const sameSectorCount = state.businesses.filter(b => b.status === 'active' && b.sectorId === business.sectorId).length;
        if (sameSectorCount < SUPPLIER_VERTICAL_MIN_SAME_SECTOR) return;
        if (state.cash < SUPPLIER_VERTICAL_COST) return;
        const newState = {
          ...state,
          cash: state.cash - SUPPLIER_VERTICAL_COST,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            // Full recovery + 1ppt bonus
            const newMargin = clampMargin(b.ebitdaMargin + SUPPLIER_SHIFT_MARGIN_HIT + SUPPLIER_VERTICAL_BONUS_PPT);
            return { ...b, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin) };
          }),
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Vertically integrated — margin restored +${Math.round(SUPPLIER_VERTICAL_BONUS_PPT * 100)}ppt bonus`, type: 'success' });
      },

      // Restructuring actions
      distressedSale: (businessId: string) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') {
          useToastStore.getState().addToast({ message: 'Action failed: business no longer available', type: 'warning' });
          return;
        }

        // Fire sale at 70% of normal exit valuation
        const lastEvent = state.eventHistory[state.eventHistory.length - 1];
        const valuation = calculateExitValuation(business, state.round, lastEvent?.type, undefined, state.integratedPlatforms);
        const exitPrice = Math.round(valuation.exitPrice * 0.70);

        // Cascade to bolt-on businesses
        const boltOnIds = new Set(business.boltOnIds || []);

        // Include bolt-on debt + earn-out obligations in total debt payoff
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0);
        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + business.earnoutRemaining + boltOnDebt;
        const netProceeds = Math.max(0, exitPrice - debtPayoff);

        // Rollover equity split — seller takes haircut too (realistic — they own equity)
        const rolloverPctDistress = business.rolloverEquityPct || 0;
        const playerProceedsDistress = rolloverPctDistress > 0 ? Math.round(netProceeds * (1 - rolloverPctDistress)) : netProceeds;

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id === businessId) return { ...b, status: 'sold' as const, exitPrice, exitRound: state.round, earnoutRemaining: 0 };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 };
          return b;
        });
        const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);

        // Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Collect bolt-on businesses for exitedBusinesses
        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 }));

        const distressState = {
          ...state,
          cash: state.cash + playerProceedsDistress,
          totalDebt: newTotalDebt,
          totalExitProceeds: state.totalExitProceeds + playerProceedsDistress,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
        };
        set({
          ...distressState,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'sold' as const, exitPrice, exitRound: state.round },
            ...exitedBoltOns,
          ],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'sell', round: state.round, details: { businessId, exitPrice, netProceeds, distressedSale: true } },
          ],
          metrics: calculateMetrics(distressState),
        });
      },

      emergencyEquityRaise: (amount: number) => {
        const state = get();
        const metrics = calculateMetrics(state);
        if (metrics.intrinsicValuePerShare <= 0) return;

        // Emergency: shares issued at flat 50% of intrinsic value (2x dilution)
        // No escalating discount — emergency is already punitive
        const emergencyPrice = metrics.intrinsicValuePerShare * 0.5;
        const newShares = Math.round((amount / emergencyPrice) * 1000) / 1000;

        // No 51% ownership floor during emergency
        const emergencyState = {
          ...state,
          cash: state.cash + amount,
          sharesOutstanding: state.sharesOutstanding + newShares,
          equityRaisesUsed: state.equityRaisesUsed + 1,
          lastEquityRaiseRound: state.round,
        };
        set({
          ...emergencyState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'issue_equity', round: state.round, details: { amount, newShares, emergency: true } },
          ],
          metrics: calculateMetrics(emergencyState),
        });
      },

      declareBankruptcy: () => {
        const state = get();
        set({
          gameOver: true,
          bankruptRound: state.round,
          requiresRestructuring: false,
        });
      },

      advanceFromRestructure: () => {
        // Must have taken some action (cash >= 0 is enforced by the floor)
        set({
          requiresRestructuring: false,
          hasRestructured: true,
          covenantBreachRounds: 0, // Reset breach counter after restructuring
          phase: 'event' as GamePhase,
        });

        // Now apply event effects if there was a pending event
        const updatedState = get();
        if (updatedState.currentEvent && updatedState.currentEvent.type !== 'unsolicited_offer') {
          const gameState = applyEventEffects(updatedState as GameState, updatedState.currentEvent);
          set({
            ...gameState,
            metrics: calculateMetrics(gameState),
          });
        }
      },

      setMAFocus: (sectorId: SectorId | null, sizePreference: DealSizePreference, subType?: string | null) => {
        const state = get();
        // Auto-clear subType if sector changed or tier < 2
        const currentSector = state.maFocus.sectorId;
        const effectiveSubType = (sectorId !== currentSector || state.maSourcing.tier < 2 || !state.maSourcing.active)
          ? null
          : (subType !== undefined ? subType : state.maFocus.subType);
        set({
          maFocus: { sectorId, sizePreference, subType: effectiveSubType },
        });
      },

      sourceDealFlow: () => {
        const state = get();

        // Dynamic cost based on MA Sourcing tier
        const cost = (state.maSourcing.active && state.maSourcing.tier >= 1)
          ? DEAL_SOURCING_COST_TIER1
          : DEAL_SOURCING_COST_BASE;

        // Check if player can afford
        if (state.cash < cost) return;

        const focusBonus = calculateSectorFocusBonus(state.businesses);
        const totalPortfolioEbitda = state.businesses
          .filter(b => b.status === 'active')
          .reduce((sum, b) => sum + b.ebitda, 0);

        // Count prior source_deals actions this round to vary the RNG fork key —
        // without this, every sourcing call in the same round gets the same seed
        const priorSourceCount = state.actionsThisRound.filter(a => a.type === 'source_deals').length;
        const srcStreams = createRngStreams(state.seed, state.round);
        const newDeals = generateSourcedDeals(
          state.round,
          state.maFocus,
          focusBonus?.focusGroup,
          totalPortfolioEbitda,
          state.maSourcing.active ? state.maSourcing.tier : 0,
          state.maxRounds,
          state.creditTighteningRoundsRemaining > 0,
          srcStreams.deals.fork(`source-${priorSourceCount}`)
        );

        set({
          cash: state.cash - cost,
          dealPipeline: [...state.dealPipeline, ...newDeals],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'source_deals', round: state.round, details: { cost, dealsGenerated: newDeals.length } },
          ],
        });
      },

      upgradeMASourcing: () => {
        const state = get();
        const currentTier = state.maSourcing.tier;
        if (currentTier >= 3) return; // Already maxed

        const nextTier = (currentTier + 1) as 1 | 2 | 3;
        const config = MA_SOURCING_CONFIG[nextTier];
        const cost = config.upgradeCost;
        if (state.cash < cost) return;

        // Check opco requirement
        const opcoCount = state.businesses.filter(b => b.status === 'active').length;
        if (opcoCount < config.requiredOpcos) return;

        const newMASourcing: MASourcingState = {
          tier: nextTier,
          active: true,
          unlockedRound: state.maSourcing.unlockedRound || state.round,
          lastUpgradeRound: state.round,
        };

        const upgradeState = {
          ...state,
          cash: state.cash - cost,
          totalInvestedCapital: state.totalInvestedCapital + cost,
          maSourcing: newMASourcing,
          maxAcquisitionsPerRound: getMaxAcquisitions(nextTier),
          // Clear subType if upgrading to tier below 2 (shouldn't happen but safety)
          maFocus: nextTier < 2 ? { ...state.maFocus, subType: null } : state.maFocus,
        };
        set({
          ...upgradeState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'upgrade_ma_sourcing' as const, round: state.round, details: { fromTier: currentTier, toTier: nextTier, cost } },
          ],
          metrics: calculateMetrics(upgradeState),
        });
      },

      toggleMASourcing: () => {
        const state = get();
        if (state.maSourcing.tier === 0) return; // Nothing to toggle

        const newActive = !state.maSourcing.active;
        const newMASourcing = { ...state.maSourcing, active: newActive };
        // Clear subType when deactivating
        const newMAFocus = !newActive ? { ...state.maFocus, subType: null } : state.maFocus;

        set({
          maSourcing: newMASourcing,
          maFocus: newMAFocus,
          maxAcquisitionsPerRound: getMaxAcquisitions(newActive ? state.maSourcing.tier : 0),
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'toggle_ma_sourcing' as const, round: state.round, details: { active: newActive } },
          ],
        });
      },

      proactiveOutreach: () => {
        const state = get();
        if (state.maSourcing.tier < 3 || !state.maSourcing.active) return;
        if (state.cash < PROACTIVE_OUTREACH_COST) return;

        const totalPortfolioEbitda = state.businesses
          .filter(b => b.status === 'active')
          .reduce((sum, b) => sum + b.ebitda, 0);

        const priorOutreachCount = state.actionsThisRound.filter(a => a.type === 'proactive_outreach').length;
        const outStreams = createRngStreams(state.seed, state.round);
        const newDeals = generateProactiveOutreachDeals(
          state.round,
          state.maFocus,
          totalPortfolioEbitda,
          state.maxRounds,
          state.creditTighteningRoundsRemaining > 0,
          outStreams.deals.fork(`outreach-${priorOutreachCount}`)
        );

        set({
          cash: state.cash - PROACTIVE_OUTREACH_COST,
          dealPipeline: [...state.dealPipeline, ...newDeals],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'proactive_outreach' as const, round: state.round, details: { cost: PROACTIVE_OUTREACH_COST, dealsGenerated: newDeals.length } },
          ],
        });
      },

      forgeIntegratedPlatform: (recipeId: string, businessIds: string[]) => {
        const state = get();
        if (state.phase !== 'allocate') return;

        const recipe = getRecipeById(recipeId);
        if (!recipe) return;

        const selectedBusinesses = state.businesses.filter(b => businessIds.includes(b.id));
        if (selectedBusinesses.length === 0) return;

        const integrationCost = calculateIntegrationCost(recipe, selectedBusinesses);
        if (state.cash < integrationCost) return;

        const platform = forgePlatform(recipe, businessIds, state.round);

        const updatedBusinesses = state.businesses.map(b => {
          if (!businessIds.includes(b.id)) return b;
          return {
            ...b,
            integratedPlatformId: platform.id,
            ebitdaMargin: b.ebitdaMargin + recipe.bonuses.marginBoost,
            revenueGrowthRate: b.revenueGrowthRate + recipe.bonuses.growthBoost,
            ebitda: Math.round(b.revenue * (b.ebitdaMargin + recipe.bonuses.marginBoost)),
          };
        });

        set({
          businesses: updatedBusinesses,
          integratedPlatforms: [...state.integratedPlatforms, platform],
          cash: state.cash - integrationCost,
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'forge_integrated_platform' as const,
              round: state.round,
              details: {
                recipeId,
                platformName: recipe.name,
                businessIds,
                integrationCost,
                marginBoost: recipe.bonuses.marginBoost,
                growthBoost: recipe.bonuses.growthBoost,
                multipleExpansion: recipe.bonuses.multipleExpansion,
              },
            },
          ],
        });
      },

      addToIntegratedPlatform: (platformId: string, businessId: string) => {
        const state = get();
        if (state.phase !== 'allocate') return;

        const platform = state.integratedPlatforms.find(p => p.id === platformId);
        if (!platform) return;

        const business = state.businesses.find(b => b.id === businessId && b.status === 'active');
        if (!business || business.integratedPlatformId) return;

        const recipe = getRecipeById(platform.recipeId);
        if (!recipe) return;

        // Validate sub-type and sector match
        if (!recipe.requiredSubTypes.includes(business.subType)) return;
        if (recipe.sectorId && business.sectorId !== recipe.sectorId) return;
        if (recipe.crossSectorIds && !recipe.crossSectorIds.includes(business.sectorId)) return;

        const integrationCost = calculateAddToPlatformCost(platform, business);
        if (state.cash < integrationCost) {
          useToastStore.getState().addToast({ message: `Integration failed: need ${formatMoney(integrationCost)} but only have ${formatMoney(state.cash)}`, type: 'danger' });
          return;
        }

        // Apply one-time bonuses (same as forge)
        const updatedBusinesses = state.businesses.map(b => {
          if (b.id !== businessId) return b;
          return {
            ...b,
            integratedPlatformId: platform.id,
            ebitdaMargin: b.ebitdaMargin + recipe.bonuses.marginBoost,
            revenueGrowthRate: b.revenueGrowthRate + recipe.bonuses.growthBoost,
            ebitda: Math.round(b.revenue * (b.ebitdaMargin + recipe.bonuses.marginBoost)),
          };
        });

        // Add to constituent list
        const updatedPlatforms = state.integratedPlatforms.map(p =>
          p.id === platformId
            ? { ...p, constituentBusinessIds: [...p.constituentBusinessIds, businessId] }
            : p
        );

        set({
          businesses: updatedBusinesses,
          integratedPlatforms: updatedPlatforms,
          cash: state.cash - integrationCost,
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'add_to_integrated_platform' as const,
              round: state.round,
              details: {
                platformId,
                platformName: platform.name,
                businessId,
                businessName: business.name,
                integrationCost,
                marginBoost: recipe.bonuses.marginBoost,
                growthBoost: recipe.bonuses.growthBoost,
              },
            },
          ],
        });
      },

      sellPlatform: (platformId: string) => {
        const state = get();
        if (state.phase !== 'allocate') return;

        const platform = state.integratedPlatforms.find(p => p.id === platformId);
        if (!platform) return;

        const lastEvent = state.eventHistory[state.eventHistory.length - 1];

        // Gather all active constituent businesses (including their bolt-ons)
        const constituents = state.businesses.filter(
          b => platform.constituentBusinessIds.includes(b.id) && b.status === 'active'
        );
        if (constituents.length === 0) return;

        // Find the largest constituent for buyer pool tier
        const platStreams = createRngStreams(state.seed, state.round);
        const platRng = platStreams.market.fork(platformId + '_sell');
        const largestConstituent = constituents.reduce((a, b) => a.ebitda > b.ebitda ? a : b);
        const buyerProfile = generateBuyerProfile(largestConstituent,
          calculateExitValuation(largestConstituent, state.round, lastEvent?.type, undefined, state.integratedPlatforms).buyerPoolTier,
          largestConstituent.sectorId,
          platRng
        );

        // Calculate total exit across all constituents with platform sale bonus
        let totalExitPrice = 0;
        let totalDebtPayoff = 0;
        let totalRolloverDeduction = 0;
        const allSoldIds = new Set<string>();

        for (const biz of constituents) {
          const valuation = calculateExitValuation(biz, state.round, lastEvent?.type, undefined, state.integratedPlatforms);
          // Apply platform sale bonus + strategic premium + market variance
          let effectiveMultiple = valuation.totalMultiple + PLATFORM_SALE_BONUS;
          if (buyerProfile.isStrategic) effectiveMultiple += buyerProfile.strategicPremium;
          const bizSellRng = platStreams.market.fork(biz.id + '_sell');
          const marketVariance = lastEvent?.type === 'global_bull_market' ? bizSellRng.next() * 0.3
            : lastEvent?.type === 'global_recession' ? -(bizSellRng.next() * 0.3)
            : (bizSellRng.next() * 0.2 - 0.1);
          const exitPrice = Math.max(0, Math.round(biz.ebitda * Math.max(2.0, effectiveMultiple + marketVariance)));
          totalExitPrice += exitPrice;

          // Debt: seller notes + bank debt + earn-outs for this biz and its bolt-ons
          const boltOnIds = new Set(biz.boltOnIds || []);
          const boltOnDebt = state.businesses
            .filter(b => boltOnIds.has(b.id))
            .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0);
          const bizDebt = biz.sellerNoteBalance + biz.bankDebtBalance + biz.earnoutRemaining + boltOnDebt;
          totalDebtPayoff += bizDebt;

          // Per-constituent rollover split
          const bizNetProceeds = Math.max(0, exitPrice - bizDebt);
          totalRolloverDeduction += Math.round(bizNetProceeds * (biz.rolloverEquityPct || 0));

          allSoldIds.add(biz.id);
          for (const boltOnId of biz.boltOnIds || []) allSoldIds.add(boltOnId);
        }

        const totalNetProceeds = Math.max(0, totalExitPrice - totalDebtPayoff);
        const totalPlayerProceeds = Math.max(0, totalNetProceeds - totalRolloverDeduction);

        // Mark all constituents + bolt-ons as sold
        const updatedBusinesses = state.businesses.map(b => {
          if (allSoldIds.has(b.id)) {
            return { ...b, status: 'sold' as const, exitPrice: constituents.find(c => c.id === b.id) ? Math.round(totalExitPrice / constituents.length) : 0, exitRound: state.round, integratedPlatformId: undefined, earnoutRemaining: 0 };
          }
          // Clear integratedPlatformId from any remaining references
          if (b.integratedPlatformId === platformId) return { ...b, integratedPlatformId: undefined };
          return b;
        });

        // Remove the platform
        const updatedPlatforms = state.integratedPlatforms.filter(p => p.id !== platformId);

        // Auto-deactivate shared services if needed
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Collect exited businesses
        const exitedEntries = state.businesses
          .filter(b => allSoldIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: constituents.find(c => c.id === b.id) ? Math.round(totalExitPrice / constituents.length) : 0, exitRound: state.round }));

        const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);
        const sellState = {
          ...state,
          cash: state.cash + totalPlayerProceeds,
          totalExitProceeds: state.totalExitProceeds + totalPlayerProceeds,
          totalDebt: newTotalDebt,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
          integratedPlatforms: updatedPlatforms,
        };
        set({
          ...sellState,
          exitedBusinesses: [...state.exitedBusinesses, ...exitedEntries],
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'sell_platform' as const,
              round: state.round,
              details: {
                platformId,
                platformName: platform.name,
                totalExitPrice,
                totalNetProceeds: totalPlayerProceeds,
                totalDebtPayoff,
                totalRolloverDeduction,
                businessCount: constituents.length,
                platformSaleBonus: PLATFORM_SALE_BONUS,
                buyerName: buyerProfile.name,
                buyerType: buyerProfile.type,
              },
            },
          ],
          metrics: calculateMetrics(sellState),
        });
      },

      unlockTurnaroundTier: () => {
        const state = get();
        if (state.phase !== 'allocate') return;

        const activeCount = state.businesses.filter(b => b.status === 'active').length;
        const check = canUnlockTier(state.turnaroundTier, state.cash, activeCount);
        if (!check.canUnlock) return;

        const nextTier = (state.turnaroundTier + 1) as 1 | 2 | 3;
        const unlockCost = TURNAROUND_TIER_CONFIG[nextTier].unlockCost;

        const newState = {
          ...state,
          turnaroundTier: nextTier as TurnaroundTier,
          cash: state.cash - unlockCost,
        };
        set({
          ...newState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'unlock_turnaround_tier' as const, round: state.round, details: { tier: nextTier, cost: unlockCost } },
          ],
          metrics: calculateMetrics(newState as GameState),
        });
      },

      startTurnaroundProgram: (businessId: string, programId: string) => {
        const state = get();
        if (state.phase !== 'allocate') return;

        const business = state.businesses.find(b => b.id === businessId && b.status === 'active');
        if (!business) {
          useToastStore.getState().addToast({ message: 'Action failed: business no longer available', type: 'warning' });
          return;
        }

        const program = getProgramById(programId);
        if (!program) return;

        // Validate: quality must match program source, tier must be sufficient
        if (business.qualityRating !== program.sourceQuality) return;
        if (program.tierId > state.turnaroundTier) return;

        // Can't start if business already has an active turnaround
        if (state.activeTurnarounds.some(t => t.businessId === businessId && t.status === 'active')) return;

        const upfrontCost = calculateTurnaroundCost(program, business);
        if (state.cash < upfrontCost) return;

        const duration = getTurnaroundDuration(program, state.duration);
        const turnaround: ActiveTurnaround = {
          id: `ta_${businessId}_${state.round}`,
          businessId,
          programId,
          startRound: state.round,
          endRound: state.round + duration,
          status: 'active',
        };

        const newState = {
          ...state,
          cash: state.cash - upfrontCost,
          activeTurnarounds: [...state.activeTurnarounds, turnaround],
        };
        set({
          ...newState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'start_turnaround' as const, round: state.round, details: { businessId, businessName: business.name, programId, upfrontCost, targetQuality: program.targetQuality } },
          ],
          metrics: calculateMetrics(newState as GameState),
        });
      },

      triggerAIEnhancement: async () => {
        const state = get();
        try {
          const enhancedDeals = await enhanceDealsWithAI(state.dealPipeline);
          set({ dealPipeline: enhancedDeals });
        } catch (error) {
          console.error('AI enhancement failed:', error);
        }
      },

      fetchEventNarrative: async () => {
        const state = get();
        const event = state.currentEvent;

        if (!event || event.narrative) return; // Already has narrative or no event

        // Skip quiet years
        if (event.type === 'global_quiet') return;

        try {
          // Build rich context for narrative generation
          const activeBusinesses = state.businesses.filter(b => b.status === 'active');
          const affectedBusiness = event.affectedBusinessId
            ? activeBusinesses.find(b => b.id === event.affectedBusinessId)
            : undefined;
          const affectedSector = affectedBusiness
            ? SECTORS[affectedBusiness.sectorId]?.name
            : undefined;

          // Try AI generation first
          const narrative = await generateEventNarrative(
            event.type,
            event.effect,
            `${state.holdcoName} with ${activeBusinesses.length} portfolio companies`,
            affectedBusiness?.name,
            affectedSector,
            state.holdcoName,
            activeBusinesses.map(b => b.name),
          );

          const finalNarrative = narrative || getFallbackEventNarrative(event.type);
          // Guard: only update if the event is still current (prevents resurrecting dismissed events)
          const current = get().currentEvent;
          if (current && current.type === event.type && current.affectedBusinessId === event.affectedBusinessId) {
            set({ currentEvent: { ...current, narrative: finalNarrative } });
          }
        } catch (error) {
          console.error('Failed to fetch event narrative:', error);
          const fallbackNarrative = getFallbackEventNarrative(event.type);
          const current = get().currentEvent;
          if (current && current.type === event.type && current.affectedBusinessId === event.affectedBusinessId) {
            set({ currentEvent: { ...current, narrative: fallbackNarrative } });
          }
        }
      },

      // Year chronicle (set when advancing to collect for a new year)
      yearChronicle: null,

      generateBusinessStories: async () => {
        const state = get();

        // Generate stories for businesses that had significant changes
        const updatedBusinesses = await Promise.all(
          state.businesses.map(async (b) => {
            if (b.status !== 'active') return b;

            // Generate a story for every active business each year
            const yearsOwned = state.round - b.acquisitionRound;
            if (yearsOwned < 1) return b; // Skip businesses acquired this round
            const hasRecentImprovement = b.improvements.some(i => i.appliedRound === state.round - 1);

            const sector = SECTORS[b.sectorId];
            const ebitdaChange = b.ebitda > b.acquisitionEbitda
              ? `+${((b.ebitda / b.acquisitionEbitda - 1) * 100).toFixed(0)}% since acquisition`
              : `${((b.ebitda / b.acquisitionEbitda - 1) * 100).toFixed(0)}% since acquisition`;

            // Revenue/margin context for richer narratives
            const revenueChange = b.acquisitionRevenue > 0
              ? `${b.revenue > b.acquisitionRevenue ? '+' : ''}${((b.revenue / b.acquisitionRevenue - 1) * 100).toFixed(0)}% since acquisition`
              : undefined;
            const marginDelta = b.ebitdaMargin - b.acquisitionMargin;
            const marginChange = Math.abs(marginDelta) >= 0.01
              ? `${marginDelta >= 0 ? '+' : ''}${(marginDelta * 100).toFixed(1)} ppt since acquisition (now ${(b.ebitdaMargin * 100).toFixed(0)}%)`
              : undefined;

            const narrative = await generateBusinessUpdate(
              b.name,
              sector.name,
              b.subType,
              yearsOwned,
              ebitdaChange,
              b.qualityRating,
              state.currentEvent?.type,
              b.improvements.length > 0 ? b.improvements.map(i => i.type).join(', ') : undefined,
              b.isPlatform,
              b.boltOnIds.length,
              revenueChange,
              marginChange,
            );

            const storyText = narrative || getFallbackBusinessStory(b.ebitda, b.acquisitionEbitda, yearsOwned);
            const newBeat = {
              round: state.round,
              narrative: storyText,
              type: hasRecentImprovement ? 'milestone' as const : 'update' as const,
            };
            return {
              ...b,
              storyBeats: [...(b.storyBeats || []), newBeat].slice(-5), // Keep last 5 beats
            };
          })
        );

        // Merge storyBeats into current state (avoids overwriting concurrent mutations)
        const freshState = get();
        const storyMap = new Map(updatedBusinesses.map(b => [b.id, b.storyBeats]));
        set({
          businesses: freshState.businesses.map(b => {
            const newBeats = storyMap.get(b.id);
            return newBeats ? { ...b, storyBeats: newBeats } : b;
          }),
        });
      },

      generateYearChronicle: async () => {
        const state = get();
        const context = buildChronicleContext(state);

        try {
          const chronicle = await generateYearChronicle(context);
          const fallbackChronicle = `Year ${state.round} saw ${state.holdcoName} continue to build its portfolio. ${context.actions}`;
          set({ yearChronicle: chronicle || fallbackChronicle });
        } catch (error) {
          console.error('Failed to generate year chronicle:', error);
          set({
            yearChronicle: `Year ${state.round} saw ${state.holdcoName} continue to build its portfolio. ${context.actions}`,
          });
        }
      },

      getAvailableDeals: () => {
        const state = get();
        return state.dealPipeline.filter(d => d.freshness > 0);
      },

      canAfford: (amount: number) => {
        return get().cash >= amount;
      },

      // Get all platform businesses that can receive bolt-ons
      getPlatforms: () => {
        const state = get();
        return state.businesses.filter(b => b.status === 'active' && b.isPlatform);
      },

      // Check if a deal can be tucked into an existing platform
      canTuckIn: (deal: Deal) => {
        const state = get();
        if (deal.acquisitionType !== 'tuck_in') return false;

        // Check if there's a platform in the same sector
        const platforms = state.businesses.filter(
          b => b.status === 'active' && b.isPlatform && b.sectorId === deal.business.sectorId
        );
        return platforms.length > 0;
      },
    }),
    {
      name: 'holdco-tycoon-save-v25', // v25: seeded RNG + challenge mode
      partialize: (state) => ({
        holdcoName: state.holdcoName,
        round: state.round,
        phase: state.phase,
        gameOver: state.gameOver,
        difficulty: state.difficulty,
        duration: state.duration,
        maxRounds: state.maxRounds,
        businesses: state.businesses,
        exitedBusinesses: state.exitedBusinesses,
        cash: state.cash,
        totalDebt: state.totalDebt,
        interestRate: state.interestRate,
        sharesOutstanding: state.sharesOutstanding,
        founderShares: state.founderShares,
        initialRaiseAmount: state.initialRaiseAmount,
        initialOwnershipPct: state.initialOwnershipPct,
        totalInvestedCapital: state.totalInvestedCapital,
        totalDistributions: state.totalDistributions,
        totalBuybacks: state.totalBuybacks,
        totalExitProceeds: state.totalExitProceeds,
        equityRaisesUsed: state.equityRaisesUsed,
        lastEquityRaiseRound: state.lastEquityRaiseRound,
        lastBuybackRound: state.lastBuybackRound,
        sharedServices: state.sharedServices,
        dealPipeline: state.dealPipeline,
        passedDealIds: state.passedDealIds,
        maFocus: state.maFocus,
        maSourcing: state.maSourcing,
        integratedPlatforms: state.integratedPlatforms,
        turnaroundTier: state.turnaroundTier,
        activeTurnarounds: state.activeTurnarounds,
        currentEvent: state.currentEvent,
        eventHistory: state.eventHistory,
        creditTighteningRoundsRemaining: state.creditTighteningRoundsRemaining,
        inflationRoundsRemaining: state.inflationRoundsRemaining,
        metricsHistory: state.metricsHistory,
        roundHistory: state.roundHistory,
        actionsThisRound: state.actionsThisRound,
        debtPaymentThisRound: state.debtPaymentThisRound,
        cashBeforeDebtPayments: state.cashBeforeDebtPayments,
        holdcoDebtStartRound: state.holdcoDebtStartRound,
        holdcoAmortizationThisRound: state.holdcoAmortizationThisRound,
        requiresRestructuring: state.requiresRestructuring,
        covenantBreachRounds: state.covenantBreachRounds,
        hasRestructured: state.hasRestructured,
        bankruptRound: state.bankruptRound,
        exitMultiplePenalty: state.exitMultiplePenalty,
        holdcoLoanBalance: state.holdcoLoanBalance,
        holdcoLoanRate: state.holdcoLoanRate,
        holdcoLoanRoundsRemaining: state.holdcoLoanRoundsRemaining,
        acquisitionsThisRound: state.acquisitionsThisRound,
        maxAcquisitionsPerRound: state.maxAcquisitionsPerRound,
        lastAcquisitionResult: state.lastAcquisitionResult,
        lastIntegrationOutcome: state.lastIntegrationOutcome,
        founderDistributionsReceived: state.founderDistributionsReceived,
        isChallenge: state.isChallenge,
        metrics: state.metrics,
        focusBonus: state.focusBonus,
        consolidationBoomSectorId: state.consolidationBoomSectorId,
        seed: state.seed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.holdcoName) {
          try {
            // Backwards compat: game mode fields
            if (!(state as any).difficulty) (state as any).difficulty = 'easy';
            if (!(state as any).duration) (state as any).duration = 'standard';
            if (!(state as any).maxRounds) (state as any).maxRounds = 20;
            // Backfill seed for pre-v25 saves
            if (!(state as any).seed) (state as any).seed = generateRandomSeed();
            // Backfill isChallenge for pre-existing saves
            if ((state as any).isChallenge === undefined) (state as any).isChallenge = false;
            if ((state as any).founderDistributionsReceived === undefined) {
              (state as any).founderDistributionsReceived = Math.round(
                (state.totalDistributions || 0) * (state.founderShares / (state.sharesOutstanding || 1))
              );
            }
            // Backfill integratedPlatforms
            if (!(state as any).integratedPlatforms) (state as any).integratedPlatforms = [];
            // Backfill turnaround fields
            if ((state as any).turnaroundTier === undefined) (state as any).turnaroundTier = 0;
            if (!(state as any).activeTurnarounds) (state as any).activeTurnarounds = [];
            // Cap table invariant enforcement
            if (!state.sharesOutstanding || state.sharesOutstanding <= 0) (state as any).sharesOutstanding = 1000;
            if (!state.founderShares || state.founderShares <= 0) (state as any).founderShares = state.sharesOutstanding;
            if (state.founderShares > state.sharesOutstanding) (state as any).founderShares = state.sharesOutstanding;
            // Backwards compat: initialize maSourcing if missing
            if (!state.maSourcing) {
              (state as any).maSourcing = { tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 };
            }
            // Backwards compat: initialize maFocus.subType if missing
            if (state.maFocus && state.maFocus.subType === undefined) {
              (state as any).maFocus = { ...state.maFocus, subType: null };
            }
            // Backwards compat: deal heat fields
            if (state.acquisitionsThisRound === undefined) {
              (state as any).acquisitionsThisRound = 0;
            }
            if (state.maxAcquisitionsPerRound === undefined) {
              const tier = state.maSourcing?.tier ?? 0;
              (state as any).maxAcquisitionsPerRound = getMaxAcquisitions(tier as any);
            }
            if (state.lastAcquisitionResult === undefined) {
              (state as any).lastAcquisitionResult = null;
            }
            if ((state as any).lastIntegrationOutcome === undefined) {
              (state as any).lastIntegrationOutcome = null;
            }
            // Backwards compat: initialize passedDealIds if missing
            if (!Array.isArray(state.passedDealIds)) {
              (state as any).passedDealIds = [];
            }
            // Restore business ID counter to avoid collisions after save/load
            if (Array.isArray(state.businesses)) {
              restoreBusinessIdCounter(state.businesses);
            }
            // Ensure pipeline deals have heat fields
            if (Array.isArray(state.dealPipeline)) {
              (state as any).dealPipeline = state.dealPipeline.map((d: any) => ({
                ...d,
                heat: d.heat ?? 'warm',
                effectivePrice: d.effectivePrice ?? d.askingPrice,
              }));
            }
            // Backwards compat: add revenue/margin fields if missing
            const ensureRevMargin = (b: any) => {
              if (b.revenue !== undefined && b.revenue > 0) return;
              const sectorDef = SECTORS[b.sectorId];
              if (!sectorDef) return;
              const midMargin = (sectorDef.baseMargin[0] + sectorDef.baseMargin[1]) / 2;
              b.ebitdaMargin = b.ebitdaMargin ?? midMargin;
              b.revenue = b.revenue ?? (Math.round(Math.abs(b.ebitda) / midMargin) || 1000);
              b.acquisitionRevenue = b.acquisitionRevenue ?? (Math.round(Math.abs(b.acquisitionEbitda || b.ebitda) / midMargin) || 1000);
              b.acquisitionMargin = b.acquisitionMargin ?? midMargin;
              b.peakRevenue = b.peakRevenue ?? (Math.round(Math.abs(b.peakEbitda || b.ebitda) / midMargin) || 1000);
              b.revenueGrowthRate = b.revenueGrowthRate ?? b.organicGrowthRate ?? 0.05;
              b.marginDriftRate = b.marginDriftRate ?? (sectorDef.marginDriftRange[0] + sectorDef.marginDriftRange[1]) / 2;
            };
            if (Array.isArray(state.businesses)) {
              state.businesses.forEach(ensureRevMargin);
            }
            if (Array.isArray(state.exitedBusinesses)) {
              state.exitedBusinesses.forEach(ensureRevMargin);
            }
            if (Array.isArray(state.dealPipeline)) {
              state.dealPipeline.forEach((d: any) => ensureRevMargin(d.business));
            }
            const metrics = calculateMetrics(state as GameState);
            const focusBonus = calculateSectorFocusBonus(state.businesses);
            useGameStore.setState({ metrics, focusBonus });
          } catch (e) {
            console.error('Failed to recalculate metrics on rehydration:', e);
          }
        }
      },
    }
  )
);

// Selectors
export const useHoldcoName = () => useGameStore(state => state.holdcoName);
export const useRound = () => useGameStore(state => state.round);
export const usePhase = () => useGameStore(state => state.phase);
export const useGameOver = () => useGameStore(state => state.gameOver);
export const useBusinesses = () => useGameStore(state => state.businesses.filter(b => b.status === 'active'));
export const useCash = () => useGameStore(state => state.cash);
export const useMetrics = () => useGameStore(state => state.metrics);
export const useFocusBonus = () => useGameStore(state => state.focusBonus);
export const useCurrentEvent = () => useGameStore(state => state.currentEvent);
export const useFounderOwnership = () => useGameStore(state =>
  state.founderShares / state.sharesOutstanding
);
export const useCapTable = () => useGameStore(state => ({
  founderShares: state.founderShares,
  sharesOutstanding: state.sharesOutstanding,
  ownershipPct: state.founderShares / state.sharesOutstanding,
  initialRaiseAmount: state.initialRaiseAmount,
  initialOwnershipPct: state.initialOwnershipPct,
}));
export const useSharedServices = () => useGameStore(state => state.sharedServices);
export const useDealPipeline = () => useGameStore(state => state.dealPipeline);
export const usePlatforms = () => useGameStore(state =>
  state.businesses.filter(b => b.status === 'active' && b.isPlatform)
);

// Non-reactive getters for game-over computations (avoids infinite re-render from new object refs)
export const getFinalScore = () => calculateFinalScore(useGameStore.getState());
export const getPostGameInsights = () => generatePostGameInsights(useGameStore.getState());
export const getEnterpriseValue = () => calculateEnterpriseValue(useGameStore.getState());
export const getFounderEquityValue = () => calculateFounderEquityValue(useGameStore.getState());
export const getFounderPersonalWealth = () => calculateFounderPersonalWealth(useGameStore.getState());
// Re-export for backwards compatibility (imported from data/gameConfig.ts)
export { DIFFICULTY_CONFIG, DURATION_CONFIG } from '../data/gameConfig';
