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
  enhanceDealWithAI,
  generateSourcedDeals,
  generateProactiveOutreachDeals,
  generateSMBBrokerDeal,
  getMaxAcquisitions,
  generateDealWithSize,
  pickWeightedSector,
  generateDistressedDeals,
  generateRecessionDeals,
  calculateIntegrationGrowthPenalty,
  calculateDealInflation,
} from '../engine/businesses';
import { generateBuyerProfile, calculateSizeTierPremium } from '../engine/buyers';
import {
  getFallbackEventNarrative,
  getFallbackBusinessStory,
  generateBusinessUpdate,
  generateYearChronicle,
} from '../services/aiGeneration';
import { resetUsedNames } from '../data/names';
import { trackGameStart, trackGameAbandon, trackFeatureUsed } from '../services/telemetry';
import { initializeSharedServices, MIN_OPCOS_FOR_SHARED_SERVICES, getMASourcingAnnualCost, MA_SOURCING_CONFIG } from '../data/sharedServices';
import {
  calculatePortfolioFcf,
  calculateSharedServicesBenefits,
  calculateSectorFocusBonus,
  getSectorFocusEbitdaBonus,
  applyOrganicGrowth,
  generateEvent,
  generateGuaranteedProSportsEvent,
  applyEventEffects,
  calculateMetrics,
  recordHistoricalMetrics,
  calculateExitValuation,
  calculateComplexityCost,
} from '../engine/simulation';
import { executeDealStructure } from '../engine/deals';
import { getUnlockedSectorIds } from './useUnlocks';
import { useAuthStore } from './useAuth';
import { calculateFinalScore, generatePostGameInsights, calculateEnterpriseValue, calculateFounderEquityValue, calculateFounderPersonalWealth } from '../engine/scoring';
import { getDistressRestrictions } from '../engine/distress';
import { SECTORS } from '../data/sectors';

import type { GameDifficulty, GameDuration, GameActionType, DealHeat, LPComment } from '../engine/types';
import { selectLPQuote } from '../data/lpCommentary';
import type { LPTriggerId, LPSpeaker } from '../data/lpCommentary';
import { generateRandomSeed, createRngStreams } from '../engine/rng';
import { checkIPOEligibility, executeIPO as executeIPOEngine, processEarningsResult } from '../engine/ipo';
import {
  checkFamilyOfficeEligibility,
  calculateFOLegacyScore,
} from '../engine/familyOffice';
import {
  FO_PHILANTHROPY_RATE,
  FO_DEAL_INFLATION,
  FO_MA_SOURCING_TIER,
  FO_MAX_ROUNDS,
  SMB_BROKER_COST,
  FILLER_TAX_STRATEGY_COST_MIN,
  FILLER_TAX_STRATEGY_COST_MAX,
  FILLER_TAX_STRATEGY_MARGIN_BOOST,
  FILLER_TAX_STRATEGY_WRITEOFF,
  FILLER_CONFERENCE_COST_MIN,
  FILLER_CONFERENCE_COST_MAX,
  FILLER_CONFERENCE_FREE_DEAL_CHANCE,
  FILLER_AUDIT_COST_MIN,
  FILLER_AUDIT_COST_MAX,
  FILLER_AUDIT_SUCCESS_CHANCE,
  FILLER_AUDIT_MARGIN_BOOST,
  FILLER_AUDIT_ISSUE_CHANCE,
  FILLER_AUDIT_ISSUE_COST,
  FILLER_AUDIT_ISSUE_MARGIN_HIT,
  FILLER_AUDIT_LIGHT_CHANCE,
  FILLER_AUDIT_LIGHT_MARGIN_BOOST,
  FILLER_REPUTATION_COST_MIN,
  FILLER_REPUTATION_COST_MAX,
  FILLER_REPUTATION_HEAT_REDUCTION,
  PE_FUND_CONFIG,
  FUND_MANAGER_CONFIG,
  TURNAROUND_CEILING_BONUS,
} from '../data/gameConfig';

/**
 * Check if a deal requires LPAC approval (cumulative deal value in platform exceeds 25% of committed capital).
 * Returns { required: boolean, platformName: string, cumulativeValue: number }
 */
export function checkLPACRequired(
  deal: Deal,
  state: GameState,
  targetPlatformId?: string,
): { required: boolean; platformName: string; cumulativeValue: number } {
  if (!state.isFundManagerMode) return { required: false, platformName: '', cumulativeValue: 0 };
  const fundSize = state.fundSize || PE_FUND_CONFIG.fundSize;
  const threshold = fundSize * PE_FUND_CONFIG.maxConcentration; // $25M

  // For tuck-ins: check if target platform already exceeds threshold
  if (targetPlatformId) {
    const platform = state.integratedPlatforms.find(p => p.id === targetPlatformId);
    if (!platform) return { required: false, platformName: '', cumulativeValue: 0 };
    // Sum acquisition prices of all businesses in this platform
    const allBiz = [...state.businesses, ...state.exitedBusinesses];
    const platformBizIds = platform.constituentBusinessIds;
    const cumulative = platformBizIds.reduce((sum, id) => {
      const biz = allBiz.find(b => b.id === id);
      return sum + (biz ? biz.acquisitionPrice : 0);
    }, 0);
    // Only trigger if platform already over threshold (tuck-ins to sub-threshold platforms exempt)
    if (cumulative < threshold) return { required: false, platformName: platform.name, cumulativeValue: cumulative };
    return { required: true, platformName: platform.name, cumulativeValue: cumulative + deal.askingPrice };
  }

  // For standalone deals: check if deal + existing businesses in same sector would create concentration
  // Standalone deals themselves can trigger LPAC if their asking price alone exceeds threshold
  if (deal.askingPrice >= threshold) {
    return { required: true, platformName: deal.business.name, cumulativeValue: deal.askingPrice };
  }

  return { required: false, platformName: '', cumulativeValue: 0 };
}

/**
 * Roll LPAC approval based on LP satisfaction tier. Uses seeded RNG.
 */
export function rollLPACApproval(
  state: GameState,
  rng: { next(): number },
): boolean {
  const satisfaction = state.lpSatisfactionScore ?? 75;
  if (satisfaction >= PE_FUND_CONFIG.lpacAutoApproveThreshold) return true; // Auto-approved at 70+
  const prob = satisfaction >= 50 ? PE_FUND_CONFIG.lpacHighApproval  // 85%
    : satisfaction >= 30 ? PE_FUND_CONFIG.lpacMidApproval             // 50%
    : PE_FUND_CONFIG.lpacLowApproval;                                  // 25%
  return rng.next() < prob;
}

/** Recompute totalDebt from holdco loan + per-business bank debt */
function computeTotalDebt(businesses: Business[], holdcoLoanBalance: number): number {
  return holdcoLoanBalance + businesses
    .filter(b => b.status === 'active' || b.status === 'integrated')
    .reduce((sum, b) => sum + b.bankDebtBalance, 0);
}

/** Remove active turnarounds for sold businesses. */
function cleanupTurnaroundsForSoldBusinesses(
  activeTurnarounds: ActiveTurnaround[],
  soldIds: Set<string>,
): ActiveTurnaround[] {
  return activeTurnarounds.filter(t => !soldIds.has(t.businessId));
}

/**
 * Generate LP commentary in reaction to a deal (PE Fund mode only).
 * Returns updated commentary array or null if no comment generated.
 */
function generateDealLPComment(
  state: GameState,
  deal: Deal,
  structure: DealStructure,
): LPComment | null {
  if (!state.isFundManagerMode) return null;
  const streams = createRngStreams(state.seed, state.round);
  const rng = streams.cosmetic.fork(`deal_reaction:${deal.id}`);

  // Only comment ~60% of the time to avoid fatigue
  if (rng.next() > 0.60) return null;

  const activeCount = state.businesses.filter(b => b.status === 'active').length;
  const round = state.round;

  let triggerId: LPTriggerId;
  let speaker: LPSpeaker;

  // Calculate entry multiple (askingPrice / EBITDA)
  const entryMultiple = deal.business.ebitda > 0 ? deal.effectivePrice / deal.business.ebitda : 0;

  // Priority: first deal > harvest period > expensive > leveraged > good value
  if (activeCount === 0) {
    triggerId = 'deal_first';
    speaker = 'chip';
  } else if (round > PE_FUND_CONFIG.investmentPeriodEnd) {
    triggerId = 'deal_harvest_period';
    speaker = 'edna';
  } else if (entryMultiple >= 8.0) {
    triggerId = 'deal_expensive';
    speaker = rng.next() > 0.5 ? 'edna' : 'chip';
  } else if (structure.bankDebt && structure.bankDebt.amount > deal.effectivePrice * 0.55) {
    triggerId = 'deal_leveraged';
    speaker = rng.next() > 0.5 ? 'edna' : 'chip';
  } else if (entryMultiple <= 4.5 && entryMultiple > 0) {
    triggerId = 'deal_good_value';
    speaker = rng.next() > 0.5 ? 'edna' : 'chip';
  } else {
    return null; // Nothing noteworthy
  }

  const text = selectLPQuote(triggerId, speaker, rng);
  if (!text) return null;
  return { round, speaker, text };
}

/**
 * Run a final collection pass (debt P&I, seller notes, bank debt, earnouts)
 * to deduct all outstanding obligations from cash before scoring.
 * This prevents year-10 leverage exploits where debt is never repaid.
 */
function runFinalCollection(state: GameState): { cash: number; businesses: Business[]; holdcoLoanBalance: number } {
  let cash = state.cash;
  let holdcoLoanBalance = state.holdcoLoanBalance;

  // Holdco loan: pay what we can of remaining principal + one round of interest
  if (holdcoLoanBalance > 0) {
    const holdcoInterest = Math.round(holdcoLoanBalance * (state.holdcoLoanRate || 0));
    const holdcoOwed = holdcoInterest + holdcoLoanBalance;
    const holdcoPaid = Math.min(holdcoOwed, Math.max(0, cash));
    cash -= holdcoPaid;
    holdcoLoanBalance = Math.max(0, holdcoOwed - holdcoPaid);
  }

  // OpCo-level debt: pay what we can of seller notes, bank debt, and earnouts
  const businesses = state.businesses.map(b => {
    if (b.status !== 'active' && b.status !== 'integrated') return b;
    const updated = { ...b };

    // Seller note: pay what we can of remaining balance + one round of interest
    if (b.sellerNoteBalance > 0) {
      const interest = Math.round(b.sellerNoteBalance * b.sellerNoteRate);
      const owed = interest + b.sellerNoteBalance;
      const paid = Math.min(owed, Math.max(0, cash));
      cash -= paid;
      updated.sellerNoteBalance = Math.max(0, owed - paid);
      if (updated.sellerNoteBalance === 0) updated.sellerNoteRoundsRemaining = 0;
    }

    // Bank debt: pay what we can of remaining balance + one round of interest
    if (b.bankDebtBalance > 0) {
      const interest = Math.round(b.bankDebtBalance * (b.bankDebtRate || 0));
      const owed = interest + b.bankDebtBalance;
      const paid = Math.min(owed, Math.max(0, cash));
      cash -= paid;
      updated.bankDebtBalance = Math.max(0, owed - paid);
      if (updated.bankDebtBalance === 0) updated.bankDebtRoundsRemaining = 0;
    }

    // Earnout: pay what we can
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

// Capital structure constants (defaults for Easy mode — overridden by DIFFICULTY_CONFIG)
const INITIAL_RAISE = 20000;
const FOUNDER_OWNERSHIP = 0.80;
const STARTING_SHARES = 1000;
const FOUNDER_SHARES = 800;
const STARTING_INTEREST_RATE = 0.07;
import { DIFFICULTY_CONFIG, DURATION_CONFIG, EQUITY_DILUTION_STEP, EQUITY_DILUTION_FLOOR, EQUITY_BUYBACK_COOLDOWN, EQUITY_ISSUANCE_SENTIMENT_PENALTY, IMPROVEMENT_COST_FLOOR, QUALITY_IMPROVEMENT_MULTIPLIER, STABILIZATION_EFFICACY_MULTIPLIER, STABILIZATION_TYPES, GROWTH_TYPES, MIN_FOUNDER_OWNERSHIP, MIN_PUBLIC_FOUNDER_OWNERSHIP, getOwnershipImprovementModifier } from '../data/gameConfig';
import { calculateStockPrice } from '../engine/ipo';
import { clampMargin, capGrowthRate, applyEbitdaFloor } from '../engine/helpers';
import { runAllMigrations } from './migrations';
import { buildChronicleContext } from '../services/chronicleContext';
import { useToastStore } from './useToast';
import { calculateIntegrationCost, forgePlatform, checkPlatformDissolution, calculateAddToPlatformCost } from '../engine/platforms';
import { getRecipeById } from '../data/platformRecipes';
import {
  getPlatformSaleBonus, COVENANT_BREACH_ROUNDS_THRESHOLD, EARNOUT_EXPIRATION_YEARS,
  KEY_MAN_GOLDEN_HANDCUFFS_COST_PCT, KEY_MAN_GOLDEN_HANDCUFFS_RESTORE_CHANCE,
  KEY_MAN_SUCCESSION_COST_MIN, KEY_MAN_SUCCESSION_COST_MAX, KEY_MAN_SUCCESSION_ROUNDS,
  EARNOUT_SETTLE_PCT, EARNOUT_FIGHT_LEGAL_COST_MIN, EARNOUT_FIGHT_LEGAL_COST_MAX,
  EARNOUT_FIGHT_WIN_CHANCE, EARNOUT_RENEGOTIATE_PCT,
  SUPPLIER_ABSORB_RECOVERY_PPT, SUPPLIER_SWITCH_COST_MIN, SUPPLIER_SWITCH_COST_MAX,
  SUPPLIER_SWITCH_REVENUE_PENALTY, SUPPLIER_VERTICAL_COST, SUPPLIER_VERTICAL_BONUS_PPT,
  SUPPLIER_VERTICAL_MIN_SAME_SECTOR, SUPPLIER_SHIFT_MARGIN_HIT,
  CONSOLIDATION_BOOM_PRICE_PREMIUM, CONSOLIDATION_BOOM_EXCLUSIVE_MIN_OPCOS,
  SELLER_DECEPTION_TURNAROUND_COST_PCT, SELLER_DECEPTION_TURNAROUND_RESTORE_CHANCE,
  SELLER_DECEPTION_FIRE_SALE_PCT, SELLER_DECEPTION_QUALITY_DROP,
  WORKING_CAPITAL_CRUNCH_REVENUE_PENALTY, WORKING_CAPITAL_CRUNCH_PENALTY_ROUNDS,
  INTEGRATION_RESTRUCTURING_PCT, INTEGRATION_RESTRUCTURING_MERGER_PCT,
  SUCCESSION_INVEST_COST_MIN, SUCCESSION_INVEST_COST_MAX, SUCCESSION_INVEST_RESTORE,
  SUCCESSION_PROMOTE_RESTORE, SUCCESSION_PROMOTE_HR_BONUS, SUCCESSION_PROMOTE_PLATFORM_BONUS,
  SUCCESSION_QUALITY_DROP, SUCCESSION_SELL_DISCOUNT,
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
  startGame: (holdcoName: string, startingSector: SectorId | undefined, difficulty?: GameDifficulty, duration?: GameDuration, seed?: number, isFundManagerMode?: boolean, fundName?: string) => void;
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
  distributeToLPs: (amount: number) => void;
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
  sellerDeceptionTurnaround: () => void;
  sellerDeceptionFireSale: () => void;
  sellerDeceptionAbsorb: () => void;
  workingCapitalInject: () => void;
  workingCapitalCredit: () => void;
  workingCapitalAbsorb: () => void;
  successionInvest: () => void;
  successionPromote: () => void;
  successionSell: () => void;

  setMAFocus: (sectorId: SectorId | null, sizePreference: DealSizePreference, subType?: string | null) => void;

  // Small Business Broker (early-game deal sourcing)
  smbBrokerDealFlow: () => void;

  // Filler event choices
  fillerTaxInvest: () => void;
  fillerTaxWriteoff: () => void;
  fillerConferenceAttend: () => void;
  fillerConferenceFree: () => void;
  fillerAuditFull: () => void;
  fillerAuditLight: () => void;
  fillerReputationInvest: () => void;
  fillerReputationFree: () => void;
  fillerPass: () => void;

  // New event choice handlers
  cyberBreachUpgrade: () => void;
  cyberBreachSettle: () => void;
  cyberBreachAbsorb: () => void;
  antitrustDivest: () => void;
  antitrustFight: () => void;
  antitrustRestructure: () => void;
  competitorAccelerate: () => void;
  competitorDifferentiate: () => void;
  competitorAbsorb: () => void;

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

  // IPO Pathway (20-year mode)
  executeIPO: () => void;
  declineIPO: () => void;

  // Family Office (20-year mode endgame)
  startFamilyOffice: (force?: boolean) => void;
  completeFamilyOffice: () => void;

  // AI enhancement
  triggerAIEnhancement: () => Promise<void>;
  enhanceSingleDeal: (dealId: string) => Promise<void>;
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
  pendingProSportsEvent: null,
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
  dealInflationState: { crisisResetRoundsRemaining: 0 },
  ipoState: null,
  familyOfficeState: null,
  isFamilyOfficeMode: false,
  nextAcquisitionHeatReduction: 0,
  // PE Fund Manager Mode defaults
  isFundManagerMode: false,
  fundName: '',
  fundSize: 0,
  managementFeesCollected: 0,
  lpSatisfactionScore: 75,
  lpCommentary: [],
  fundCashFlows: [],
  totalCapitalDeployed: 0,
  lpDistributions: 0,
  dpiMilestones: { half: false, full: false },
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      metrics: calculateMetrics(initialState as GameState),
      focusBonus: null,

      startGame: (holdcoName: string, startingSector: SectorId | undefined, difficulty: GameDifficulty = 'easy', duration: GameDuration = 'standard', seed?: number, isFundManagerMode?: boolean, fundName?: string) => {
        resetBusinessIdCounter();
        resetUsedNames();

        const gameSeed = seed ?? generateRandomSeed();
        const diffConfig = DIFFICULTY_CONFIG[difficulty];
        const durConfig = DURATION_CONFIG[duration];
        const maxRounds = durConfig.rounds;

        const round1Streams = createRngStreams(gameSeed, 1);

        // Fund mode: empty portfolio, $100M cash, pre-unlocked M&A
        if (isFundManagerMode) {
          const initialDealPipeline = generateDealPipeline([], 1, undefined, undefined, undefined, 0, 0, false, undefined, maxRounds, false, round1Streams.deals, 0, PE_FUND_CONFIG.fundSize, null, false, false, 'easy', [], [], false);

          const newState: GameState = {
            ...initialState,
            holdcoName: fundName || holdcoName,
            seed: gameSeed,
            difficulty: 'easy',
            duration: 'quick',
            maxRounds: 10,
            round: 1,
            phase: 'collect',
            businesses: [],
            cash: PE_FUND_CONFIG.fundSize,
            totalDebt: 0,
            totalInvestedCapital: 0,
            founderShares: FUND_MANAGER_CONFIG.founderShares,
            sharesOutstanding: FUND_MANAGER_CONFIG.totalShares,
            initialRaiseAmount: PE_FUND_CONFIG.fundSize,
            initialOwnershipPct: 0,
            holdcoDebtStartRound: 0,
            holdcoLoanBalance: 0,
            holdcoLoanRate: 0,
            holdcoLoanRoundsRemaining: 0,
            sharedServices: initializeSharedServices(),
            dealPipeline: initialDealPipeline,
            maSourcing: { tier: PE_FUND_CONFIG.startingMaSourcingTier as MASourcingTier, active: true, unlockedRound: 1, lastUpgradeRound: 0 },
            maxAcquisitionsPerRound: 3,
            turnaroundTier: 0 as any,
            activeTurnarounds: [],
            founderDistributionsReceived: 0,
            isChallenge: false, // Force off for fund mode
            dealInflationState: { crisisResetRoundsRemaining: 0 },
            ipoState: null,
            familyOfficeState: null,
            // PE Fund Mode fields
            isFundManagerMode: true,
            fundName: fundName || holdcoName,
            fundSize: PE_FUND_CONFIG.fundSize,
            managementFeesCollected: 0,
            lpSatisfactionScore: PE_FUND_CONFIG.lpSatisfactionStart,
            lpCommentary: [],
            fundCashFlows: [],
            totalCapitalDeployed: 0,
            lpDistributions: 0,
            dpiMilestones: { half: false, full: false },
          };

          set({
            ...newState,
            metrics: calculateMetrics(newState),
            focusBonus: null,
            yearChronicle: null,
          });

          trackGameStart('easy', 'quick', undefined, 10, false, 'fund_manager');
          return;
        }

        const startingBusiness = createStartingBusiness(startingSector!, diffConfig.startingEbitda, diffConfig.startingMultipleCap, round1Streams.cosmetic);
        const isChallenge = seed != null;
        const isAnonymous = useAuthStore.getState().player?.isAnonymous ?? true;
        const unlockedSectorIds = isChallenge ? [] : getUnlockedSectorIds(isAnonymous);
        const initialDealPipeline = generateDealPipeline([], 1, undefined, undefined, undefined, 0, 0, false, undefined, maxRounds, false, round1Streams.deals, 0, diffConfig.initialCash, null, false, false, difficulty, [], unlockedSectorIds, isChallenge);

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
          dealInflationState: { crisisResetRoundsRemaining: 0 },
          ipoState: null,
          familyOfficeState: null,
        };

        set({
          ...newState,
          metrics: calculateMetrics(newState),
          focusBonus: calculateSectorFocusBonus(newState.businesses),
          yearChronicle: null,
        });

        // Fire telemetry (fire-and-forget)
        trackGameStart(difficulty, duration, startingSector, maxRounds, seed != null);
      },

      resetGame: () => {
        // Send abandon telemetry if mid-game
        const state = get();
        if (state.round > 0 && !state.gameOver) {
          trackGameAbandon(state.round, state.maxRounds, state.difficulty, state.duration, state.businesses[0]?.sectorId || 'agency', state.isChallenge, calculateFounderEquityValue(state));
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
        if (state.phase !== 'collect') return; // Guard: waterfall must only run once per round
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
        // PE Fund Manager: management fee deducted from cash, tax-deductible
        // Fee is contractual (2% of committed capital) — not capped by pre-FCF cash
        const managementFee = state.isFundManagerMode ? PE_FUND_CONFIG.annualManagementFee : 0;

        // Use holdcoLoanRate + penalty for tax deduction (matches actual interest paid)
        const totalDeductibleCosts = sharedServicesCost + maSourcingCost + managementFee;
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

        // Calculate portfolio complexity cost
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

        let newCash = state.cash + annualFcf - holdcoLoanPayment - sharedServicesCost - maSourcingCost - turnaroundTierCost - turnaroundProgramCosts - complexityCost.netCost - managementFee;

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

        // Generate guaranteed proSports event if player owns a franchise
        // Uses cosmetic stream fork to avoid disturbing the event RNG
        const proSportsEvent = generateGuaranteedProSportsEvent(
          state as GameState,
          roundStreams.cosmetic.fork('proSportsGuaranteed'),
        );

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

        // Skip pending proSports event if primary event already IS a proSports event
        // (sector events embed sectorId in their id: event_{round}_{sectorId}_{title})
        const primaryIsProSports = event?.type === 'sector_event'
          && event.id.includes('_proSports_');

        let gameState: GameState = {
          ...state,
          businesses: updatedBusinesses,
          cash: Math.round(newCash),
          totalDebt: newTotalDebt,
          holdcoLoanBalance: updatedHoldcoLoanBalance,
          holdcoLoanRoundsRemaining: updatedHoldcoLoanRoundsRemaining,
          currentEvent: event,
          pendingProSportsEvent: primaryIsProSports ? null : (proSportsEvent ?? null),
          requiresRestructuring,
          phase: requiresRestructuring ? 'restructure' as GamePhase : 'event' as GamePhase,
          // PE Fund Manager: track cumulative management fees
          ...(state.isFundManagerMode ? { managementFeesCollected: (state.managementFeesCollected || 0) + managementFee } : {}),
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
        // Reset yield curve inversion multiplier (consumed this round)
        if ((gameState.recessionProbMultiplier ?? 1) > 1) {
          gameState.recessionProbMultiplier = 1;
        }
        // Decrement talent market shift (margin hit applied once in applyEventEffects; counter is for UI/future use)
        if ((gameState.talentMarketShiftRoundsRemaining ?? 0) > 0) {
          gameState.talentMarketShiftRoundsRemaining = gameState.talentMarketShiftRoundsRemaining! - 1;
        }
        // Decrement private credit boom (rate reduction applied once in applyEventEffects; counter is for UI/future use)
        if ((gameState.privateCreditRoundsRemaining ?? 0) > 0) {
          gameState.privateCreditRoundsRemaining = gameState.privateCreditRoundsRemaining! - 1;
        }
        // Decrement deal inflation crisis reset counter
        if (gameState.dealInflationState?.crisisResetRoundsRemaining > 0) {
          gameState.dealInflationState = {
            ...gameState.dealInflationState,
            crisisResetRoundsRemaining: gameState.dealInflationState.crisisResetRoundsRemaining - 1,
          };
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
          const ceiling = getQualityCeiling(biz.sectorId);
          businessesAfterTurnarounds = businessesAfterTurnarounds.map(b => {
            if (b.id !== ta.businessId) return b;
            const newEbitda = Math.round(b.ebitda * result.ebitdaMultiplier);

            if (result.result === 'failure') {
              // Failure: apply EBITDA damage only, no quality change
              return {
                ...b,
                ebitda: newEbitda,
                peakEbitda: Math.max(b.peakEbitda, newEbitda),
              };
            }

            // Success or partial: apply quality change
            const newQuality = Math.min(result.targetQuality, ceiling) as QualityRating;
            const actualTiersGained = Math.max(0, newQuality - b.qualityRating);

            // Ceiling mastery bonus: business reached sector ceiling via turnaround
            const reachedCeiling = newQuality === ceiling && actualTiersGained > 0 && !b.ceilingMasteryBonus;
            const ceilingMarginBoost = reachedCeiling ? TURNAROUND_CEILING_BONUS.marginBoost : 0;
            const ceilingGrowthBoost = reachedCeiling ? TURNAROUND_CEILING_BONUS.growthBoost : 0;

            return {
              ...b,
              qualityRating: newQuality,
              ebitda: newEbitda,
              peakEbitda: Math.max(b.peakEbitda, newEbitda),
              qualityImprovedTiers: (b.qualityImprovedTiers ?? 0) + actualTiersGained,
              ...(reachedCeiling && {
                ceilingMasteryBonus: true,
                ebitdaMargin: clampMargin(b.ebitdaMargin + ceilingMarginBoost),
                organicGrowthRate: capGrowthRate(b.organicGrowthRate + ceilingGrowthBoost),
                revenueGrowthRate: capGrowthRate(b.revenueGrowthRate + ceilingGrowthBoost),
              }),
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
            details: { businessId: ta.businessId, businessName: bizName, programId: ta.programId, outcome: result.result, newQuality: displayQuality, qualityTiersImproved: result.qualityChange },
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

        // PE Fund: generate LP reaction to market event
        if (state.isFundManagerMode && event) {
          const eventRng = roundStreams.cosmetic.fork('eventLPReaction');
          // Only comment ~50% of the time to avoid fatigue
          if (eventRng.next() < 0.50) {
            const isNegativeEvent = ['global_recession', 'global_financial_crisis', 'global_interest_hike',
              'global_credit_tightening', 'global_yield_curve_inversion', 'global_talent_market_shift',
              'portfolio_cyber_breach', 'portfolio_antitrust_scrutiny'].includes(event.type);
            const isPositiveEvent = ['global_bull_market', 'global_interest_cut', 'global_private_credit_boom',
              'portfolio_referral_deal', 'portfolio_breakthrough'].includes(event.type);
            const isRecession = event.type === 'global_recession' || event.type === 'global_financial_crisis';
            const isBoom = event.type === 'global_bull_market';

            let triggerId: LPTriggerId;
            if (isRecession) triggerId = 'event_recession';
            else if (isBoom) triggerId = 'event_boom';
            else if (isNegativeEvent) triggerId = 'event_negative';
            else if (isPositiveEvent) triggerId = 'event_positive';
            else triggerId = 'event_negative'; // fallback (shouldn't hit due to 50% gate)

            // Only generate for noteworthy events (positive or negative)
            if (isNegativeEvent || isPositiveEvent || isRecession || isBoom) {
              const speaker: LPSpeaker = eventRng.next() > 0.5 ? 'edna' : 'chip';
              const text = selectLPQuote(triggerId, speaker, eventRng);
              if (text) {
                gameState.lpCommentary = [...(gameState.lpCommentary || []), { round: state.round, speaker, text }];
              }
            }
          }
        }

        set({
          ...gameState,
          eventHistory: event ? [...state.eventHistory, event] : state.eventHistory,
          actionsThisRound: [...state.actionsThisRound, ...turnaroundActions],
          metrics: calculateMetrics(gameState),
        });
      },

      advanceToAllocate: () => {
        const state = get();
        if (state.phase !== 'event') return; // Guard: must be in event phase

        // If there's a pending proSports event, show it before advancing to allocate
        if (state.pendingProSportsEvent) {
          const proEvent = state.pendingProSportsEvent;
          let updatedState: GameState = {
            ...state,
            currentEvent: proEvent,
            pendingProSportsEvent: null,
            eventHistory: [...state.eventHistory, proEvent],
          };
          // Apply effects with seeded RNG for challenge mode determinism
          const proSportsRng = createRngStreams(state.seed, state.round).cosmetic.fork('proSportsEffects');
          updatedState = applyEventEffects(updatedState, proEvent, proSportsRng);
          set({
            ...updatedState,
            metrics: calculateMetrics(updatedState),
          });
          return; // Stay in event phase — next advanceToAllocate will proceed normally
        }

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

        // Calculate deal inflation for 20yr mode (FO mode uses fixed inflation)
        const dealInflationAdder = state.isFamilyOfficeMode
          ? FO_DEAL_INFLATION
          : calculateDealInflation(state.round, state.duration, state.dealInflationState);

        // Generate new deals with M&A focus, portfolio synergies, and affordability
        // Collect owned pro sports sub-types for uniqueness filtering
        const ownedProSportsSubTypes = state.businesses
          .filter(b => b.sectorId === 'proSports' && (b.status === 'active' || b.status === 'integrated'))
          .map(b => b.subType);

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
          roundStreams.deals,
          dealInflationAdder,
          state.cash,
          state.ipoState ?? null,
          state.requiresRestructuring || state.covenantBreachRounds >= 1,
          state.isFamilyOfficeMode ?? false,
          state.difficulty,
          ownedProSportsSubTypes,
          state.isChallenge ? [] : getUnlockedSectorIds(useAuthStore.getState().player?.isAnonymous ?? true),
          state.isChallenge,
        );

        // Inject distressed deals during Financial Crisis (bypass MAX_DEALS cap)
        let finalPipeline = newPipeline;
        if (state.currentEvent?.type === 'global_financial_crisis') {
          const distressedDeals = generateDistressedDeals(state.round, state.maxRounds, roundStreams.deals, state.cash);
          finalPipeline = [...finalPipeline, ...distressedDeals];
        }

        // Inject lighter discounted deals during Recession (1-2 at 15-25% off)
        if (state.currentEvent?.type === 'global_recession') {
          const recessionDeals = generateRecessionDeals(state.round, state.maxRounds, roundStreams.deals, state.cash);
          finalPipeline = [...finalPipeline, ...recessionDeals];
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

        const allocateState = {
          ...state,
          phase: 'allocate' as const,
          dealPipeline: finalPipeline,
          passedDealIds: cleanedPassedIds,
          consolidationBoomSectorId: clearedBoomSectorId,
          actionsThisRound: [] as typeof state.actionsThisRound,
          focusBonus,
          lastAcquisitionResult: null,
          lastIntegrationOutcome: null,
        };
        set({
          ...allocateState,
          metrics: calculateMetrics(allocateState),
        });
      },

      endRound: () => {
        const state = get();
        if (state.phase !== 'allocate') return; // Guard: must be in allocate phase
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
            roundStreams.simulation,
            state.duration,
            sharedBenefits.hasMarketingBrand,
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

        // ── PE Fund Manager: LP Satisfaction Annual Update ──
        let updatedLPSatisfaction = state.lpSatisfactionScore ?? 75;
        let updatedLPCommentary = [...(state.lpCommentary || [])];
        if (state.isFundManagerMode) {
          const round = state.round;
          const fundSize = state.fundSize || PE_FUND_CONFIG.fundSize;
          const dpi = (state.lpDistributions || 0) / fundSize;
          const activeCount = updatedBusinesses.filter(b => b.status === 'active').length;
          const totalEbitda = updatedBusinesses.filter(b => b.status === 'active').reduce((s, b) => s + b.ebitda, 0);
          const prevTotalEbitda = state.businesses.filter(b => b.status === 'active').reduce((s, b) => s + b.ebitda, 0);
          const ebitdaGrowthPct = prevTotalEbitda > 0 ? (totalEbitda - prevTotalEbitda) / prevTotalEbitda : 0;
          const ev = calculateEnterpriseValue({ ...state, businesses: updatedBusinesses } as GameState);
          const grossMoic = ev / fundSize;

          // Year's DPI change (sum of distributions made this round)
          const yearDistributions = (state.fundCashFlows || []).filter(cf => cf.round === round).reduce((s, cf) => s + cf.amount, 0);
          const yearDpiChange = yearDistributions / fundSize;

          // Distress check
          const anyBreach = updatedBusinesses.some(b => b.status === 'active' && endMetrics.distressLevel === 'breach');
          const hasRestructured = state.hasRestructured;

          // Count exits this round
          const exitActions = state.actionsThisRound.filter(a => a.type === 'sell' || a.type === 'sell_platform');
          const strongExits = exitActions.filter(a => {
            const moic = (a.details?.exitMoic as number) ?? 0;
            return moic >= 3.0;
          }).length;
          const weakExits = exitActions.filter(a => {
            const moic = (a.details?.exitMoic as number) ?? 0;
            return moic < 1.0;
          }).length;
          const platformSales = exitActions.filter(a => a.type === 'sell_platform').length;

          // Late acquisitions (standalone after Y5)
          const lateStandaloneAcquisitions = round > PE_FUND_CONFIG.investmentPeriodEnd
            ? state.actionsThisRound.filter(a => a.type === 'acquire').length : 0;

          // Sum adjustments
          let adjustment = 0;

          // MOIC-conditional bonus
          if (grossMoic >= 2.0) {
            if (round <= 3) adjustment += 5;
            else if (round <= 6) adjustment += 3;
            else if (dpi > 0) adjustment += 0; // No bonus without distributions in harvest
          }

          // DPI adjustments
          if (yearDpiChange > 0.1) adjustment += 8;
          else if (yearDpiChange > 0.02) adjustment += 5;
          else if (yearDpiChange > 0) adjustment += 2;

          // One-time DPI milestones
          const prevDpi = ((state.lpDistributions || 0) - yearDistributions) / fundSize;
          if (prevDpi < 0.5 && dpi >= 0.5) adjustment += 3;

          // No distress bonus
          if (!anyBreach && !hasRestructured) adjustment += 3;

          // Strong exits
          adjustment += strongExits * 3;

          // Platform sales
          adjustment += platformSales * 5;

          // Exceptional growth
          if (ebitdaGrowthPct > 0.20) adjustment += 3;

          // ── Negative adjustments ──
          if (anyBreach) adjustment -= 10;
          if (hasRestructured) adjustment -= 15;
          adjustment -= weakExits * 5;

          // No deployment for 2+ consecutive years AND <70% deployed
          const deployed = (state.totalCapitalDeployed || 0) / fundSize;
          const hadAcquisitions = state.actionsThisRound.some(a => a.type === 'acquire' || a.type === 'acquire_tuck_in');
          const prevRoundHadAcquisitions = (state.roundHistory ?? []).length > 0
            && (state.roundHistory[state.roundHistory.length - 1]?.actions ?? []).some(a => a.type === 'acquire' || a.type === 'acquire_tuck_in');
          if (!hadAcquisitions && !prevRoundHadAcquisitions && deployed < 0.70 && round >= 3) adjustment -= 10;

          // MOIC below 1.0x
          if (grossMoic < 1.0) adjustment -= 5;

          // DPI = 0 escalation
          if (dpi === 0) {
            if (round >= 8) adjustment -= 12;
            else if (round >= 6) adjustment -= 8;
            else if (round >= 4) adjustment -= 5;
          }

          // 0 businesses for 2+ years, Year 3+, DPI < 0.5x
          if (activeCount === 0 && round >= 3 && dpi < 0.5) {
            const prevActiveCount = state.businesses.filter(b => b.status === 'active').length;
            if (prevActiveCount === 0) adjustment -= 10;
          }

          // Management fee shortfall
          if (state.cash < PE_FUND_CONFIG.annualManagementFee) adjustment -= 8;

          // Earn-out skipped (if any earnout payments were skipped this round due to cash)
          const skippedEarnouts = updatedBusinesses.some(b =>
            b.earnoutRemaining > 0 && b.earnoutTarget > 0 && state.cash <= 0
          );
          if (skippedEarnouts) adjustment -= 3;

          // Over-deployed
          if (deployed > 0.90 && round < PE_FUND_CONFIG.investmentPeriodEnd) adjustment -= 3;

          // Late acquisitions
          adjustment -= lateStandaloneAcquisitions * 3;

          // Clamp
          updatedLPSatisfaction = Math.max(
            PE_FUND_CONFIG.lpSatisfactionFloor,
            Math.min(PE_FUND_CONFIG.lpSatisfactionCeiling, updatedLPSatisfaction + adjustment),
          );

          // ── Generate LP Commentary (max 2/year, highest priority) ──
          const cosmeticRng = roundStreams.cosmetic.fork('lpCommentary');
          let commentsThisYear = 0;

          const addComment = (triggerId: LPTriggerId, speaker: LPSpeaker): boolean => {
            if (commentsThisYear >= 2) return false;
            const text = selectLPQuote(triggerId, speaker, cosmeticRng);
            if (!text) return false;
            updatedLPCommentary.push({ round, speaker, text });
            commentsThisYear++;
            return true;
          };

          // Priority order (most important first)
          if (updatedLPSatisfaction < PE_FUND_CONFIG.lpTerminationThreatThreshold) {
            addComment('termination_threat', 'edna');
          }
          if (anyBreach) { addComment('business_distress', 'edna'); addComment('business_distress', 'chip'); }
          if (dpi === 0 && round === 9) addComment('no_distributions_y9', 'edna');
          else if (dpi === 0 && round === 7) addComment('no_distributions_y7', 'edna');
          else if (dpi === 0 && round === 5) addComment('no_distributions_y5', 'edna');
          else if (dpi === 0 && round === 3) addComment('no_distributions_y3', 'edna');
          if (round === 10) { addComment('final_year', 'edna'); addComment('final_year', 'chip'); }
          if (round === 6) { addComment('harvest_period', 'edna'); addComment('harvest_period', 'chip'); }
          if (round === 1) addComment('year_1_start', 'chip');
          if (lateStandaloneAcquisitions > 0) { addComment('late_acquisition', 'edna'); addComment('late_acquisition', 'chip'); }
          if (yearDpiChange > 0.2) { addComment('large_distribution', 'edna'); addComment('large_distribution', 'chip'); }
          else if (yearDpiChange > 0) { addComment('distribution_made', 'edna'); addComment('distribution_made', 'chip'); }
          if (strongExits > 0) { addComment('strong_exit', 'edna'); addComment('strong_exit', 'chip'); }
          if (weakExits > 0) { addComment('weak_exit', 'edna'); addComment('weak_exit', 'chip'); }
          if (ebitdaGrowthPct > 0.20) addComment('exceptional_growth', 'chip');
        }

        // Process IPO earnings result (if public) — skip in FO mode
        let updatedIPOState = state.ipoState;
        if (!state.isFamilyOfficeMode && state.ipoState?.isPublic) {
          const actualEbitda = updatedBusinesses
            .filter(b => b.status === 'active')
            .reduce((sum, b) => sum + b.ebitda, 0);
          updatedIPOState = processEarningsResult(
            { ...state, businesses: updatedBusinesses },
            actualEbitda,
          );
        }

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
            ipoState: updatedIPOState,
            // PE Fund Manager LP state
            ...(state.isFundManagerMode ? {
              lpSatisfactionScore: updatedLPSatisfaction,
              lpCommentary: updatedLPCommentary,
            } : {}),
          });
        } else {
          // ── PE Fund Manager: Forced Liquidation ──
          let liquidationCash = state.cash;
          let liquidationBusinesses = updatedBusinesses;
          if (state.isFundManagerMode && !gameOverFromBankruptcy) {
            // Force-sell all remaining active businesses
            const lastEvent = state.eventHistory[state.eventHistory.length - 1];
            for (const biz of updatedBusinesses.filter(b => b.status === 'active')) {
              const valuation = calculateExitValuation(biz, state.round, lastEvent?.type, undefined, state.integratedPlatforms);
              let grossEV = biz.ebitda * valuation.totalMultiple * PE_FUND_CONFIG.forcedLiquidationDiscount;

              // Distress discount for forced sellers
              const bizMetrics = endMetrics; // Use portfolio-level distress
              if (bizMetrics.distressLevel === 'breach') grossEV *= 0.70;
              else if (bizMetrics.distressLevel === 'stressed') grossEV *= 0.85;

              // Pay off per-business debt
              const debtPayoff = biz.bankDebtBalance + biz.sellerNoteBalance;

              // Earn-out verification (shared logic)
              let earnoutDue = 0;
              if (biz.earnoutRemaining > 0 && biz.earnoutTarget > 0) {
                let growth = 0;
                if (biz.status === 'integrated' && biz.parentPlatformId) {
                  const parent = updatedBusinesses.find(b => b.id === biz.parentPlatformId);
                  growth = parent && parent.acquisitionEbitda > 0
                    ? (parent.ebitda - parent.acquisitionEbitda) / parent.acquisitionEbitda : 0;
                } else if (biz.acquisitionEbitda > 0) {
                  growth = (biz.ebitda - biz.acquisitionEbitda) / biz.acquisitionEbitda;
                }
                if (growth >= biz.earnoutTarget) earnoutDue = biz.earnoutRemaining;
              }

              let netProceeds = Math.max(0, grossEV - debtPayoff - earnoutDue);

              // Rollover equity split
              if (biz.rolloverEquityPct && biz.rolloverEquityPct > 0) {
                netProceeds = netProceeds * (1 - biz.rolloverEquityPct);
              }

              liquidationCash += Math.round(netProceeds);
            }

            // Mark all businesses as sold
            liquidationBusinesses = updatedBusinesses.map(b =>
              b.status === 'active' ? { ...b, status: 'sold' as const, bankDebtBalance: 0, sellerNoteBalance: 0, earnoutRemaining: 0 } : b
            );
          }

          // Game over — run final collection to settle all remaining debt before scoring
          const preCollectionState = state.isFundManagerMode && !gameOverFromBankruptcy
            ? { ...state, businesses: liquidationBusinesses, cash: liquidationCash, holdcoLoanBalance: 0 } as GameState
            : { ...state, businesses: updatedBusinesses } as GameState;
          const finalState = runFinalCollection(preCollectionState);
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
            ipoState: updatedIPOState,
            // PE Fund Manager LP state
            ...(state.isFundManagerMode ? {
              lpSatisfactionScore: updatedLPSatisfaction,
              lpCommentary: updatedLPCommentary,
            } : {}),
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

        // Guard: only one of each pro sports franchise sub-type allowed
        if (deal.business.sectorId === 'proSports') {
          const ownedSubTypes = state.businesses
            .filter(b => b.sectorId === 'proSports' && (b.status === 'active' || b.status === 'integrated'))
            .map(b => b.subType);
          if (ownedSubTypes.includes(deal.business.subType)) {
            set({ lastAcquisitionResult: 'blocked_same_league' });
            return;
          }
        }

        // Enforce distress restrictions — covenant breach blocks new acquisitions
        const restrictions = getDistressRestrictions(calculateMetrics(state).distressLevel);
        if (!restrictions.canAcquire) return;

        // Acquisition limit check
        if (state.acquisitionsThisRound >= state.maxAcquisitionsPerRound) return;

        if (state.cash < structure.cashRequired) return;

        // PE Fund: LPAC gate check
        if (state.isFundManagerMode) {
          const lpacCheck = checkLPACRequired(deal, state);
          if (lpacCheck.required) {
            const lpacStreams = createRngStreams(state.seed, state.round);
            const approved = rollLPACApproval(state, lpacStreams.market.fork(`lpac:${deal.id}`));
            const cosmeticRng = lpacStreams.cosmetic.fork(`lpac:${deal.id}`);
            const triggerId: LPTriggerId = approved ? 'lpac_approved' : 'lpac_denied';
            const speaker: LPSpeaker = approved ? (cosmeticRng.next() > 0.5 ? 'edna' : 'chip') : 'edna';
            const text = selectLPQuote(triggerId, speaker, cosmeticRng);
            const updatedCommentary = [...(state.lpCommentary || [])];
            if (text) {
              updatedCommentary.push({ round: state.round, speaker, text });
            }
            if (!approved) {
              set({
                lastAcquisitionResult: 'lpac_denied',
                lpCommentary: updatedCommentary,
              });
              return;
            }
            // Approved — continue with acquisition, but store the comment
            set({ lpCommentary: updatedCommentary });
          }
        }

        // Apply reputation building heat reduction if active
        let effectiveDeal = deal;
        let consumeHeatReduction = false;
        if (state.nextAcquisitionHeatReduction && state.nextAcquisitionHeatReduction > 0) {
          const heatTiers: DealHeat[] = ['cold', 'warm', 'hot', 'contested'];
          const currentIdx = heatTiers.indexOf(deal.heat);
          if (currentIdx > 0) {
            const newIdx = Math.max(0, currentIdx - state.nextAcquisitionHeatReduction);
            effectiveDeal = { ...deal, heat: heatTiers[newIdx] };
          }
          consumeHeatReduction = true;
        }

        // Contested deal snatch check — 40% chance another buyer outbids you
        const acqStreams = createRngStreams(state.seed, state.round);
        if (effectiveDeal.heat === 'contested' && acqStreams.market.fork(deal.id).next() < 0.40) {
          set({
            dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
            acquisitionsThisRound: state.acquisitionsThisRound + 1,
            lastAcquisitionResult: 'snatched',
          });
          return;
        }

        // Share-funded: no cash, issue new shares
        if (structure.type === 'share_funded') {
          if (!state.ipoState?.isPublic || !structure.shareTerms) return;
          const newBusiness = executeDealStructure(deal, structure, state.round, state.maxRounds);
          const businessWithPlatformFields: Business = { ...newBusiness, isPlatform: false, platformScale: 0, boltOnIds: [], synergiesRealized: 0, totalAcquisitionCost: deal.effectivePrice, cashEquityInvested: 0, acquisitionSizeTierPremium: deal.business.acquisitionSizeTierPremium ?? 0 };
          const newBusinesses = [...state.businesses, businessWithPlatformFields];
          const updatedIPO = {
            ...state.ipoState,
            sharesOutstanding: structure.shareTerms.newTotalShares,
            shareFundedDealsThisRound: state.ipoState.shareFundedDealsThisRound + 1,
          };
          set({
            ipoState: updatedIPO,
            sharesOutstanding: updatedIPO.sharesOutstanding,
            businesses: newBusinesses,
            totalDebt: computeTotalDebt(newBusinesses, state.holdcoLoanBalance),
            totalInvestedCapital: state.totalInvestedCapital + deal.effectivePrice,
            // PE Fund: share-funded = $0 equity capital deployed from fund
            ...(state.isFundManagerMode ? { totalCapitalDeployed: state.totalCapitalDeployed || 0 } : {}),
            dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
            acquisitionsThisRound: state.acquisitionsThisRound + 1,
            lastAcquisitionResult: 'success',
            nextAcquisitionHeatReduction: consumeHeatReduction ? 0 : state.nextAcquisitionHeatReduction,
            actionsThisRound: [...state.actionsThisRound, {
              type: 'acquire', round: state.round,
              details: { businessId: newBusiness.id, businessName: deal.business.name, sector: SECTORS[deal.business.sectorId].name, structure: 'share_funded', price: deal.effectivePrice, askingPrice: deal.effectivePrice, heat: deal.heat, cashDeployed: 0 },
            }],
            metrics: calculateMetrics({ ...state, businesses: newBusinesses, ipoState: updatedIPO, sharesOutstanding: updatedIPO.sharesOutstanding }),
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
          cashEquityInvested: structure.cashRequired,
          acquisitionSizeTierPremium: deal.business.acquisitionSizeTierPremium ?? 0,
        };

        // Bank debt now tracked per-business (set on businessWithPlatformFields via executeDealStructure)
        // Recompute totalDebt from holdco loan + all per-business bank debt
        const newBusinesses = [...state.businesses, businessWithPlatformFields];
        const newTotalDebt = computeTotalDebt(newBusinesses, state.holdcoLoanBalance);

        // PE Fund: generate LP reaction to deal
        const dealComment = generateDealLPComment(state, deal, structure);
        const dealCommentary = dealComment
          ? { lpCommentary: [...(state.lpCommentary || []), dealComment] }
          : {};

        set({
          cash: state.cash - structure.cashRequired,
          totalDebt: newTotalDebt,
          totalInvestedCapital: state.totalInvestedCapital + deal.effectivePrice,
          businesses: newBusinesses,
          dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
          acquisitionsThisRound: state.acquisitionsThisRound + 1,
          lastAcquisitionResult: 'success',
          nextAcquisitionHeatReduction: consumeHeatReduction ? 0 : state.nextAcquisitionHeatReduction,
          // PE Fund: track equity capital deployed from fund (cash check, not total EV)
          ...(state.isFundManagerMode ? { totalCapitalDeployed: (state.totalCapitalDeployed || 0) + structure.cashRequired } : {}),
          ...dealCommentary,
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'acquire',
              round: state.round,
              details: { businessId: newBusiness.id, businessName: deal.business.name, sector: SECTORS[deal.business.sectorId].name, structure: structure.type, price: deal.effectivePrice, askingPrice: deal.effectivePrice, heat: deal.heat, cashDeployed: structure.cashRequired },
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

        // Guard: pro sports teams cannot be tuck-ins or tucked into
        if (deal.business.sectorId === 'proSports') return;
        const targetBiz = state.businesses.find(b => b.id === targetPlatformId);
        if (targetBiz?.sectorId === 'proSports') return;

        // Guard: no acquisitions during restructuring
        if (state.requiresRestructuring) return;

        // Enforce distress restrictions — covenant breach blocks new acquisitions
        const restrictions = getDistressRestrictions(calculateMetrics(state).distressLevel);
        if (!restrictions.canAcquire) return;

        // Acquisition limit check
        if (state.acquisitionsThisRound >= state.maxAcquisitionsPerRound) return;

        if (state.cash < structure.cashRequired) return;

        // PE Fund: LPAC gate check for tuck-ins into concentrated platforms
        if (state.isFundManagerMode) {
          const lpacCheck = checkLPACRequired(deal, state, targetPlatformId);
          if (lpacCheck.required) {
            const lpacStreams = createRngStreams(state.seed, state.round);
            const approved = rollLPACApproval(state, lpacStreams.market.fork(`lpac:tuckin:${deal.id}`));
            const cosmeticRng = lpacStreams.cosmetic.fork(`lpac:tuckin:${deal.id}`);
            const triggerId: LPTriggerId = approved ? 'lpac_approved' : 'lpac_denied';
            const speaker: LPSpeaker = approved ? (cosmeticRng.next() > 0.5 ? 'edna' : 'chip') : 'edna';
            const text = selectLPQuote(triggerId, speaker, cosmeticRng);
            const updatedCommentary = [...(state.lpCommentary || [])];
            if (text) {
              updatedCommentary.push({ round: state.round, speaker, text });
            }
            if (!approved) {
              set({
                lastAcquisitionResult: 'lpac_denied',
                lpCommentary: updatedCommentary,
              });
              return;
            }
            set({ lpCommentary: updatedCommentary });
          }
        }

        // Apply reputation building heat reduction if active
        let effectiveDeal = deal;
        let consumeHeatReduction = false;
        if (state.nextAcquisitionHeatReduction && state.nextAcquisitionHeatReduction > 0) {
          const heatTiers: DealHeat[] = ['cold', 'warm', 'hot', 'contested'];
          const currentIdx = heatTiers.indexOf(deal.heat);
          if (currentIdx > 0) {
            const newIdx = Math.max(0, currentIdx - state.nextAcquisitionHeatReduction);
            effectiveDeal = { ...deal, heat: heatTiers[newIdx] };
          }
          consumeHeatReduction = true;
        }

        // Contested deal snatch check — 40% chance another buyer outbids you
        const tuckInStreams = createRngStreams(state.seed, state.round);
        if (effectiveDeal.heat === 'contested' && tuckInStreams.market.fork(deal.id).next() < 0.40) {
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

        // Share-funded tuck-in: no cash, issue new shares, then proceed with normal tuck-in integration
        if (structure.type === 'share_funded') {
          if (!state.ipoState?.isPublic || !structure.shareTerms) return;
          const updatedIPO = {
            ...state.ipoState,
            sharesOutstanding: structure.shareTerms.newTotalShares,
            shareFundedDealsThisRound: state.ipoState.shareFundedDealsThisRound + 1,
          };
          // Swap state references so the rest of the tuck-in logic uses updated IPO
          // We'll re-enter the function with a modified state snapshot
          const hasSharedServicesSF = state.sharedServices.filter(s => s.active).length > 0;
          const subTypeAffinitySF = getSubTypeAffinity(platform.sectorId, platform.subType, deal.business.subType);
          const { tier: sizeRatioTierSF, ratio: sizeRatioSF } = getSizeRatioTier(deal.business.ebitda, platform.ebitda);
          const outcomeSF = determineIntegrationOutcome(deal.business, platform, hasSharedServicesSF, subTypeAffinitySF, sizeRatioTierSF);
          const synergiesSF = calculateSynergies(outcomeSF, deal.business.ebitda, true, subTypeAffinitySF, sizeRatioTierSF);
          const boltOnIdSF = generateBusinessId();
          const boltOnBusinessSF: Business = {
            id: boltOnIdSF, name: deal.business.name, sectorId: deal.business.sectorId, subType: deal.business.subType,
            ebitda: deal.business.ebitda, peakEbitda: deal.business.peakEbitda, acquisitionEbitda: deal.business.acquisitionEbitda,
            acquisitionPrice: deal.effectivePrice, acquisitionRound: state.round, acquisitionMultiple: deal.business.acquisitionMultiple,
            organicGrowthRate: deal.business.organicGrowthRate, revenue: deal.business.revenue, ebitdaMargin: deal.business.ebitdaMargin,
            acquisitionRevenue: deal.business.acquisitionRevenue, acquisitionMargin: deal.business.acquisitionMargin,
            peakRevenue: deal.business.peakRevenue, revenueGrowthRate: deal.business.revenueGrowthRate, marginDriftRate: deal.business.marginDriftRate,
            qualityRating: deal.business.qualityRating, dueDiligence: deal.business.dueDiligence,
            integrationRoundsRemaining: 1, integrationGrowthDrag: 0, improvements: [],
            sellerNoteBalance: 0, sellerNoteRate: 0, sellerNoteRoundsRemaining: 0,
            bankDebtBalance: 0, bankDebtRate: 0, bankDebtRoundsRemaining: 0,
            earnoutRemaining: 0, earnoutTarget: 0,
            status: 'integrated', isPlatform: false, platformScale: 0, boltOnIds: [],
            parentPlatformId: targetPlatformId, integrationOutcome: outcomeSF, synergiesRealized: synergiesSF,
            totalAcquisitionCost: deal.effectivePrice, cashEquityInvested: 0, acquisitionSizeTierPremium: deal.business.acquisitionSizeTierPremium ?? 0,
            rolloverEquityPct: 0, integratedPlatformId: deal.business.qualityRating >= 3 ? platform.integratedPlatformId : undefined,
            priorOwnershipCount: deal.business.priorOwnershipCount ?? 0,
          };
          const restructuringCostSF = outcomeSF === 'failure' ? Math.round(Math.abs(deal.business.ebitda) * INTEGRATION_RESTRUCTURING_PCT) : 0;
          const growthDragPenaltySF = outcomeSF === 'failure' ? calculateIntegrationGrowthPenalty(deal.business.ebitda, platform.ebitda, false) : 0;
          const newPlatformScaleSF = platform.platformScale + 1;
          const combinedEbitdaSF = platform.ebitda + deal.business.ebitda + synergiesSF;
          const multipleExpansionSF = calculateMultipleExpansion(newPlatformScaleSF, combinedEbitdaSF) - calculateMultipleExpansion(platform.platformScale, platform.ebitda);
          const combinedRevenueSF = platform.revenue + deal.business.revenue;
          const blendedMarginSF = combinedRevenueSF > 0 ? combinedEbitdaSF / combinedRevenueSF : platform.ebitdaMargin;
          const updatedBusinessesSF = state.businesses.map(b => {
            if (b.id === targetPlatformId) {
              return { ...b, isPlatform: true, platformScale: newPlatformScaleSF, boltOnIds: [...b.boltOnIds, boltOnIdSF],
                ebitda: b.ebitda + deal.business.ebitda + synergiesSF, revenue: combinedRevenueSF,
                ebitdaMargin: clampMargin(blendedMarginSF), peakRevenue: Math.max(b.peakRevenue, combinedRevenueSF),
                synergiesRealized: b.synergiesRealized + synergiesSF, totalAcquisitionCost: b.totalAcquisitionCost + deal.effectivePrice, cashEquityInvested: (b.cashEquityInvested ?? b.totalAcquisitionCost),
                acquisitionMultiple: b.acquisitionMultiple + multipleExpansionSF, organicGrowthRate: b.organicGrowthRate,
                revenueGrowthRate: b.revenueGrowthRate, integrationGrowthDrag: (b.integrationGrowthDrag ?? 0) + growthDragPenaltySF,
              };
            }
            return b;
          });
          const tuckInBusinessesSF = [...updatedBusinessesSF, boltOnBusinessSF];
          const newTotalDebtSF = computeTotalDebt(tuckInBusinessesSF, state.holdcoLoanBalance);
          const tuckInCashSF = Math.max(0, state.cash - restructuringCostSF);
          const updatedIntegratedPlatformsSF = (platform.integratedPlatformId && deal.business.qualityRating >= 3)
            ? state.integratedPlatforms.map(ip => ip.id === platform.integratedPlatformId ? { ...ip, constituentBusinessIds: [...ip.constituentBusinessIds, boltOnIdSF] } : ip)
            : state.integratedPlatforms;
          set({
            cash: tuckInCashSF,
            ipoState: updatedIPO,
            sharesOutstanding: updatedIPO.sharesOutstanding,
            totalDebt: newTotalDebtSF,
            totalInvestedCapital: state.totalInvestedCapital + deal.effectivePrice + restructuringCostSF,
            // PE Fund: share-funded tuck-in = $0 equity capital deployed from fund
            ...(state.isFundManagerMode ? { totalCapitalDeployed: state.totalCapitalDeployed || 0 } : {}),
            businesses: tuckInBusinessesSF,
            dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
            acquisitionsThisRound: state.acquisitionsThisRound + 1,
            lastAcquisitionResult: 'success',
            lastIntegrationOutcome: outcomeSF,
            integratedPlatforms: updatedIntegratedPlatformsSF,
            actionsThisRound: [...state.actionsThisRound, {
              type: 'acquire_tuck_in', round: state.round,
              details: { businessId: boltOnIdSF, businessName: deal.business.name, sector: SECTORS[deal.business.sectorId].name,
                platformId: targetPlatformId, structure: 'share_funded', price: deal.effectivePrice, askingPrice: deal.effectivePrice,
                integrationOutcome: outcomeSF, synergies: synergiesSF, restructuringCost: restructuringCostSF,
                growthDragPenalty: growthDragPenaltySF, heat: deal.heat, sizeRatio: sizeRatioSF, sizeRatioTier: sizeRatioTierSF, cashDeployed: 0 },
            }],
            metrics: calculateMetrics({ ...state, cash: tuckInCashSF, totalDebt: newTotalDebtSF, businesses: tuckInBusinessesSF, ipoState: updatedIPO, sharesOutstanding: updatedIPO.sharesOutstanding }),
          });
          return;
        }

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
          integrationGrowthDrag: 0,
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
          cashEquityInvested: structure.cashRequired,
          acquisitionSizeTierPremium: deal.business.acquisitionSizeTierPremium ?? 0,
          rolloverEquityPct: 0, // Tuck-ins: bolt-on has 0 rollover; parent's pct applies at exit
          // Propagate integratedPlatformId if the target platform belongs to a forged integrated platform
          integratedPlatformId: platform.integratedPlatformId,
          priorOwnershipCount: deal.business.priorOwnershipCount ?? 0,
        };

        // Failed integration: restructuring cost + proportional decaying growth drag on platform
        const restructuringCost = outcome === 'failure'
          ? Math.round(Math.abs(deal.business.ebitda) * INTEGRATION_RESTRUCTURING_PCT) : 0;
        const growthDragPenalty = outcome === 'failure'
          ? calculateIntegrationGrowthPenalty(deal.business.ebitda, platform.ebitda, false) : 0;

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
              cashEquityInvested: (b.cashEquityInvested ?? b.totalAcquisitionCost) + structure.cashRequired,
              acquisitionMultiple: b.acquisitionMultiple + multipleExpansion, // Multiple expansion!
              organicGrowthRate: b.organicGrowthRate, // no longer mutated — drag is on separate field
              revenueGrowthRate: b.revenueGrowthRate,
              integrationGrowthDrag: (b.integrationGrowthDrag ?? 0) + growthDragPenalty,
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
          // PE Fund: track equity capital deployed from fund (cash check, not total EV)
          ...(state.isFundManagerMode ? { totalCapitalDeployed: (state.totalCapitalDeployed || 0) + structure.cashRequired } : {}),
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
                heat: effectiveDeal.heat,
                sizeRatio,
                sizeRatioTier,
                cashDeployed: structure.cashRequired,
              },
            },
          ],
          ...(consumeHeatReduction ? { nextAcquisitionHeatReduction: 0 } : {}),
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

        // Guard: pro sports teams cannot be merged
        if (biz1.sectorId === 'proSports' || biz2.sectorId === 'proSports') {
          useToastStore.getState().addToast({ message: 'Pro sports franchises cannot be merged', type: 'danger' });
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

        // Failed integration: restructuring cost + proportional decaying growth drag
        const mergeRestructuringCost = outcome === 'failure'
          ? Math.round(smallerEbitda * INTEGRATION_RESTRUCTURING_MERGER_PCT) : 0;
        const mergeGrowthDrag = outcome === 'failure'
          ? calculateIntegrationGrowthPenalty(smallerEbitda, largerEbitda, true) : 0;

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
          organicGrowthRate: (biz1.organicGrowthRate + biz2.organicGrowthRate) / 2 + (subTypeAffinity === 'match' ? 0.015 : subTypeAffinity === 'related' ? 0.010 : 0.005),
          revenue: combinedRevenue,
          ebitdaMargin: clampMargin(mergedMargin),
          acquisitionRevenue: biz1.acquisitionRevenue + biz2.acquisitionRevenue,
          acquisitionMargin: (biz1.acquisitionRevenue + biz2.acquisitionRevenue) > 0
            ? (biz1.acquisitionEbitda + biz2.acquisitionEbitda) / (biz1.acquisitionRevenue + biz2.acquisitionRevenue)
            : mergedMargin,
          peakRevenue: combinedRevenue,
          revenueGrowthRate: (biz1.revenueGrowthRate + biz2.revenueGrowthRate) / 2 + (subTypeAffinity === 'match' ? 0.015 : subTypeAffinity === 'related' ? 0.010 : 0.005),
          marginDriftRate: (biz1.marginDriftRate + biz2.marginDriftRate) / 2,
          qualityRating: bestQuality,
          dueDiligence: biz1.dueDiligence, // Keep first business's DD
          integrationRoundsRemaining: 2, // Mergers take longer to fully integrate
          integrationGrowthDrag: ((biz1.integrationGrowthDrag ?? 0) + (biz2.integrationGrowthDrag ?? 0)) + mergeGrowthDrag,
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
          cashEquityInvested: (biz1.cashEquityInvested ?? biz1.totalAcquisitionCost) + (biz2.cashEquityInvested ?? biz2.totalAcquisitionCost) + totalMergeCost,
          // Recalculate size tier for merged EBITDA (not Math.max of originals)
          acquisitionSizeTierPremium: calculateSizeTierPremium(combinedEbitda).premium,
          wasMerged: true,
          mergerBalanceRatio: mergerBalanceRatio,
          priorOwnershipCount: Math.max(biz1.priorOwnershipCount ?? 0, biz2.priorOwnershipCount ?? 0),
          qualityImprovedTiers: Math.max(biz1.qualityImprovedTiers ?? 0, biz2.qualityImprovedTiers ?? 0),
          ceilingMasteryBonus: biz1.ceilingMasteryBonus || biz2.ceilingMasteryBonus,
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
            // Dissolve: remove platform, clear integratedPlatformId.
            // Margin/growth mutations are intentionally preserved — they were one-time boosts paid
            // for via integration cost. Dynamic bonuses (multipleExpansion, recessionResistance)
            // DO disappear since they rely on integratedPlatformId lookup at runtime.
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

        // Growth improvements gated behind Q3+ quality
        if (GROWTH_TYPES.has(improvementType) && business.qualityRating < 3) {
          useToastStore.getState().addToast({
            message: 'This business needs to reach Q3 quality before growth investments can take hold. Apply stabilization improvements or complete a turnaround program first.',
            type: 'warning',
          });
          return;
        }

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
        // Stabilization improvements use relaxed efficacy on Q1/Q2 (they ARE the turnaround)
        const isStabilization = STABILIZATION_TYPES.has(improvementType);
        const qualityMult = (isStabilization && business.qualityRating <= 2)
          ? STABILIZATION_EFFICACY_MULTIPLIER[business.qualityRating as 1|2|3|4|5] ?? 1.0
          : QUALITY_IMPROVEMENT_MULTIPLIER[business.qualityRating as 1|2|3|4|5] ?? 1.0;
        // Ownership modifier: founder-owned businesses have more low-hanging fruit
        const ownershipMult = getOwnershipImprovementModifier(business.priorOwnershipCount ?? 0);
        const combinedMult = qualityMult * ownershipMult;
        if (marginBoost > 0) marginBoost *= combinedMult;
        if (revenueBoost > 0) revenueBoost *= combinedMult;
        if (growthBoost > 0) growthBoost *= combinedMult;

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
            organicGrowthRate: capGrowthRate(b.organicGrowthRate + growthBoost),
            revenueGrowthRate: capGrowthRate(b.revenueGrowthRate + growthBoost),
            totalAcquisitionCost: b.totalAcquisitionCost + cost,
            cashEquityInvested: (b.cashEquityInvested ?? b.totalAcquisitionCost) + cost,
            dueDiligence: updatedDueDiligence,
            marginDriftRate: updatedMarginDriftRate,
            improvements: [
              ...b.improvements,
              { type: improvementType, appliedRound: state.round, effect: ebitdaBoost },
            ],
          };
        });

        // Roll for quality improvement from operational improvement
        // No quality rolls for Q1/Q2 businesses receiving stabilization — must use turnaround system
        const improvedBusiness = updatedBusinesses.find(b => b.id === businessId);
        const skipQualityRoll = isStabilization && business.qualityRating <= 2;
        if (improvedBusiness && !skipQualityRoll) {
          const ceiling = getQualityCeiling(improvedBusiness.sectorId);
          if (improvedBusiness.qualityRating < ceiling) {
            const chance = getQualityImprovementChance(state.turnaroundTier);
            const qualStreams = createRngStreams(state.seed, state.round);
            if (qualStreams.market.fork(businessId + '_quality_' + improvementType).next() < chance) {
              const newQuality = Math.min(improvedBusiness.qualityRating + 1, ceiling) as QualityRating;
              const idx = updatedBusinesses.findIndex(b => b.id === businessId);
              updatedBusinesses[idx] = {
                ...improvedBusiness,
                qualityRating: newQuality,
                // Note: qualityImprovedTiers NOT incremented from ops quality rolls — only turnaround-sourced
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

        trackFeatureUsed('shared_service', state.round);

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
        if (state.isFamilyOfficeMode) return; // No equity raises in FO mode
        if (state.isFundManagerMode) return; // Fund size fixed; GP can't demand more capital
        if (amount <= 0) return;

        // Guard: no normal equity raises during restructuring (use emergencyEquityRaise instead)
        if (state.requiresRestructuring) return;

        // Cooldown: blocked if buyback was done within EQUITY_BUYBACK_COOLDOWN rounds
        if (state.lastBuybackRound > 0 && state.round - state.lastBuybackRound < EQUITY_BUYBACK_COOLDOWN) return;

        const isPublic = !!state.ipoState?.isPublic;

        const metrics = calculateMetrics(state);
        // M-5: Guard against division by zero or negative intrinsic value
        if (metrics.intrinsicValuePerShare <= 0) return;

        // Branch pricing: public → stock price, private → escalating discount
        let effectivePrice: number;
        let discount: number;
        if (isPublic) {
          const stockPrice = calculateStockPrice(state);
          if (stockPrice <= 0) return;
          effectivePrice = stockPrice;
          discount = 0; // no discount for public
        } else {
          // Escalating dilution: each prior raise discounts the price by EQUITY_DILUTION_STEP
          discount = 1 - Math.max(1 - EQUITY_DILUTION_STEP * state.equityRaisesUsed, EQUITY_DILUTION_FLOOR);
          effectivePrice = metrics.intrinsicValuePerShare * (1 - discount);
        }
        const newShares = Math.round((amount / effectivePrice) * 1000) / 1000;
        if (newShares <= 0) return;

        // Calculate what ownership would be after issuance
        const newTotalShares = state.sharesOutstanding + newShares;
        const newFounderOwnership = state.founderShares / newTotalShares;

        // Must maintain control — 51% if private, 10% if public
        const effectiveFloor = isPublic ? MIN_PUBLIC_FOUNDER_OWNERSHIP : MIN_FOUNDER_OWNERSHIP;
        if (newFounderOwnership < effectiveFloor) return;

        trackFeatureUsed('equity_raise', state.round);

        let sentimentPenalty = 0;
        const issueState: typeof state = {
          ...state,
          cash: state.cash + amount,
          sharesOutstanding: newTotalShares,
          equityRaisesUsed: state.equityRaisesUsed + 1,
          lastEquityRaiseRound: state.round,
        };

        // Post-IPO: apply sentiment penalty and sync IPO state
        if (isPublic && issueState.ipoState) {
          sentimentPenalty = EQUITY_ISSUANCE_SENTIMENT_PENALTY;
          const newSentiment = Math.max(issueState.ipoState.marketSentiment - sentimentPenalty, -0.30);
          issueState.ipoState = {
            ...issueState.ipoState,
            marketSentiment: newSentiment,
            sharesOutstanding: newTotalShares,
          };
          issueState.ipoState.stockPrice = calculateStockPrice(issueState);
        }

        set({
          ...issueState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'issue_equity', round: state.round, details: { amount, newShares, newOwnership: newFounderOwnership, discount, sentimentPenalty } },
          ],
          metrics: calculateMetrics(issueState),
        });
      },

      buybackShares: (amount: number) => {
        const state = get();
        if (state.isFamilyOfficeMode) return; // No buybacks in FO mode
        if (state.isFundManagerMode) return; // No public shares in fund mode
        if (state.cash < amount) return;

        // Block buybacks when no active businesses — prevents sell-all-then-buyback FEV exploit
        const activeCount = state.businesses.filter(b => b.status === 'active').length;
        if (activeCount === 0) return;

        // Cooldown: blocked if equity was raised within EQUITY_BUYBACK_COOLDOWN rounds
        if (state.lastEquityRaiseRound > 0 && state.round - state.lastEquityRaiseRound < EQUITY_BUYBACK_COOLDOWN) return;

        trackFeatureUsed('buyback', state.round);

        const isPublic = !!state.ipoState?.isPublic;

        const metrics = calculateMetrics(state);
        // Enforce distress restrictions — covenant breach blocks buybacks
        const restrictions = getDistressRestrictions(metrics.distressLevel);
        if (!restrictions.canBuyback) return;
        // M-5: Guard against division by zero or negative intrinsic value
        if (metrics.intrinsicValuePerShare <= 0) return;

        // Branch pricing: public → stock price, private → intrinsic value (mirrors issueEquity)
        let effectivePrice: number;
        if (isPublic) {
          const stockPrice = calculateStockPrice(state);
          if (stockPrice <= 0) return;
          effectivePrice = stockPrice;
        } else {
          effectivePrice = metrics.intrinsicValuePerShare;
        }

        let sharesRepurchased = Math.round((amount / effectivePrice) * 1000) / 1000;

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

        const buybackState: typeof state = {
          ...state,
          cash: state.cash - amount,
          sharesOutstanding: newTotalShares,
          totalBuybacks: state.totalBuybacks + amount,
          lastBuybackRound: state.round,
        };

        // Post-IPO: sync IPO state shares and recalculate stock price
        if (isPublic && buybackState.ipoState) {
          buybackState.ipoState = {
            ...buybackState.ipoState,
            sharesOutstanding: newTotalShares,
          };
          buybackState.ipoState.stockPrice = calculateStockPrice(buybackState);
        }

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
        if (state.isFamilyOfficeMode) return; // No distributions in FO mode
        if (state.isFundManagerMode) return; // Replaced by LP distributions (DPI)
        if (state.cash < amount) return;

        // Enforce distress restrictions — covenant breach blocks distributions
        const restrictions = getDistressRestrictions(calculateMetrics(state).distressLevel);
        if (!restrictions.canDistribute) return;

        trackFeatureUsed('distribution', state.round);

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

      distributeToLPs: (amount: number) => {
        const state = get();
        if (!state.isFundManagerMode) return;
        if (state.phase !== 'allocate') return;
        if (amount < PE_FUND_CONFIG.minDistribution) return; // $1M minimum
        if (amount > state.cash) return;
        // Must have deployed at least 20% before distributing
        if ((state.totalCapitalDeployed || 0) < PE_FUND_CONFIG.minDeploymentForDistribution) return;

        const addToast = useToastStore.getState().addToast;
        const newLpDistributions = (state.lpDistributions || 0) + amount;
        const newDpi = newLpDistributions / (state.fundSize || PE_FUND_CONFIG.fundSize);
        const dpiMilestones = { ...(state.dpiMilestones || { half: false, full: false }) };

        // Check DPI milestones — DPI = distributions / fund size (capital return metric)
        // Check full (1.0x) first so a large distribution doesn't show "halfway" then "full" back-to-back
        if (!dpiMilestones.full && newDpi >= 1.0) {
          dpiMilestones.full = true;
          dpiMilestones.half = true;
          addToast({ message: `DPI ${newDpi.toFixed(2)}x — LPs have been made whole! Every dollar from here builds carry.`, type: 'success' });
        } else if (!dpiMilestones.half && newDpi >= 0.5) {
          dpiMilestones.half = true;
          addToast({ message: `DPI ${newDpi.toFixed(2)}x — halfway to returning LP capital (1.0x)`, type: 'success' });
        } else {
          addToast({ message: `Distributed ${formatMoney(amount)} to LPs (DPI: ${newDpi.toFixed(2)}x)`, type: 'info' });
        }

        trackFeatureUsed('lp_distribution', state.round);

        const newState = {
          ...state,
          cash: state.cash - amount,
          lpDistributions: newLpDistributions,
          dpiMilestones,
          fundCashFlows: [...(state.fundCashFlows || []), { round: state.round, amount }],
        };
        set({
          ...newState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'distribute_to_lps' as GameActionType, round: state.round, details: { amount, dpi: newDpi } },
          ],
          metrics: calculateMetrics(newState),
        });
      },

      sellBusiness: (businessId: string) => {
        const state = get();
        if (state.phase !== 'allocate') return; // Guard: sales only during allocate
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') {
          useToastStore.getState().addToast({ message: 'Action failed: business no longer available', type: 'warning' });
          return;
        }

        trackFeatureUsed('sell_business', state.round);

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
              // Dissolve: remove platform, clear integratedPlatformId from remaining constituents.
              // Margin/growth mutations are intentionally preserved — they were one-time boosts paid
              // for via integration cost. Dynamic bonuses (multipleExpansion, recessionResistance)
              // DO disappear since they rely on integratedPlatformId lookup at runtime.
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

        // Clean up turnarounds for sold businesses
        const soldIdsForTurnarounds = new Set([businessId, ...boltOnIds]);
        const updatedTurnarounds = cleanupTurnaroundsForSoldBusinesses(state.activeTurnarounds, soldIdsForTurnarounds);

        const sellState = {
          ...state,
          cash: state.cash + playerProceeds,
          totalDebt: newTotalDebt,
          totalExitProceeds: state.totalExitProceeds + playerProceeds,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
          integratedPlatforms: updatedPlatforms,
          activeTurnarounds: updatedTurnarounds,
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

        let updatedBusinesses = state.businesses.map(b => {
          if (b.id === event.affectedBusinessId) return { ...b, status: 'sold' as const, exitPrice: event.offerAmount, exitRound: state.round, earnoutRemaining: 0 };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 };
          return b;
        });
        const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);

        // Platform dissolution check: if sold business was part of an integrated platform
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

        // Clean up turnarounds for sold businesses
        const soldIdsOffer = new Set([event.affectedBusinessId!, ...boltOnIds]);
        const updatedTurnaroundsOffer = cleanupTurnaroundsForSoldBusinesses(state.activeTurnarounds, soldIdsOffer);

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
          integratedPlatforms: updatedPlatforms,
          activeTurnarounds: updatedTurnaroundsOffer,
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
            return { ...b, qualityRating: newQuality, ebitdaMargin: newMargin, ebitda: newEbitda, qualityImprovedTiers: 0 };
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
        const newTotalShares = state.sharesOutstanding + dilution;
        const grantState = {
          ...state,
          sharesOutstanding: newTotalShares,
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
        // Sync IPO state if public — keep ipoState.sharesOutstanding consistent
        if (grantState.ipoState?.isPublic) {
          grantState.ipoState = {
            ...grantState.ipoState,
            sharesOutstanding: newTotalShares,
          };
          grantState.ipoState.stockPrice = calculateStockPrice(grantState);
        }
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

      // ── Seller Deception choices ──
      sellerDeceptionTurnaround: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_seller_deception' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        const cost = event.choices?.find(c => c.action === 'sellerDeceptionTurnaround')?.cost ?? Math.round(business.ebitda * SELLER_DECEPTION_TURNAROUND_COST_PCT);
        if (state.cash < cost) return;
        const sdStreams = createRngStreams(state.seed, state.round);
        const restored = sdStreams.events.fork('seller_deception_turnaround').next() < SELLER_DECEPTION_TURNAROUND_RESTORE_CHANCE;
        const newState = {
          ...state,
          cash: state.cash - cost,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            if (restored) {
              const restoredQuality = Math.min(5, b.qualityRating + SELLER_DECEPTION_QUALITY_DROP) as 1 | 2 | 3 | 4 | 5;
              return { ...b, qualityRating: restoredQuality };
            }
            return b;
          }),
          currentEvent: null,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'event_choice' as GameActionType, round: state.round, details: { eventType: 'portfolio_seller_deception', choice: 'turnaround', businessId: event.affectedBusinessId, cost, restored } },
          ],
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        const addToast = useToastStore.getState().addToast;
        if (restored) {
          addToast({ message: `Turnaround investment worked — ${business.name} quality restored`, type: 'success' });
        } else {
          addToast({ message: `Turnaround invested but ${business.name} quality stays dropped`, type: 'warning' });
        }
      },

      sellerDeceptionFireSale: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_seller_deception' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        const valuation = calculateExitValuation(business, state.round, undefined, undefined, state.integratedPlatforms);
        const fireSalePrice = Math.round(business.ebitda * valuation.totalMultiple * SELLER_DECEPTION_FIRE_SALE_PCT);
        // Deduct debt obligations
        const boltOnIds = new Set(business.boltOnIds || []);
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0);
        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + business.earnoutRemaining + boltOnDebt;
        const netProceeds = Math.max(0, fireSalePrice - debtPayoff);
        const rolloverPct = business.rolloverEquityPct || 0;
        const playerProceeds = rolloverPct > 0 ? Math.round(netProceeds * (1 - rolloverPct)) : netProceeds;
        let updatedBusinesses = state.businesses.map(b => {
          if (b.id === event.affectedBusinessId) return { ...b, status: 'sold' as const, exitPrice: fireSalePrice, exitRound: state.round, earnoutRemaining: 0 };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 };
          return b;
        });
        // Platform dissolution check: if sold business was part of an integrated platform
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
        // Clean up turnarounds for sold businesses
        const soldIdsFireSale = new Set([event.affectedBusinessId!, ...boltOnIds]);
        const updatedTurnaroundsFireSale = cleanupTurnaroundsForSoldBusinesses(state.activeTurnarounds, soldIdsFireSale);
        // Collect bolt-on businesses for exitedBusinesses
        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 }));
        const newState = {
          ...state,
          cash: state.cash + playerProceeds,
          businesses: updatedBusinesses,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'sold' as const, exitPrice: fireSalePrice, exitRound: state.round, earnoutRemaining: 0 },
            ...exitedBoltOns,
          ],
          totalExitProceeds: state.totalExitProceeds + playerProceeds,
          totalDebt: computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance),
          integratedPlatforms: updatedPlatforms,
          sharedServices: updatedServices,
          activeTurnarounds: updatedTurnaroundsFireSale,
          currentEvent: null,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'event_choice' as GameActionType, round: state.round, details: { eventType: 'portfolio_seller_deception', choice: 'fire_sale', businessId: event.affectedBusinessId, fireSalePrice, netProceeds: playerProceeds } },
          ],
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Fire-sold ${business.name} for ${formatMoney(playerProceeds)} net proceeds`, type: 'warning' });
      },

      sellerDeceptionAbsorb: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_seller_deception' || !event.affectedBusinessId) return;
        // No additional action — damage already applied in applyEventEffects
        const newState = {
          ...state,
          currentEvent: null,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'event_choice' as GameActionType, round: state.round, details: { eventType: 'portfolio_seller_deception', choice: 'absorb', businessId: event.affectedBusinessId } },
          ],
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: 'Absorbed the hit — revenue and quality stay dropped', type: 'warning' });
      },

      // ── Working Capital Crunch choices ──
      workingCapitalInject: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_working_capital_crunch' || !event.affectedBusinessId) return;
        const cost = event.choices?.find(c => c.action === 'workingCapitalInject')?.cost ?? 0;
        if (state.cash < cost) return;
        const newState = {
          ...state,
          cash: state.cash - cost,
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Injected ${formatMoney(cost)} working capital — business continues normally`, type: 'success' });
      },

      workingCapitalCredit: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_working_capital_crunch' || !event.affectedBusinessId) return;
        const cost = event.choices?.find(c => c.action === 'workingCapitalCredit')?.cost ?? 0;
        if (state.cash < cost) return;
        // The remaining 50% (same as upfront cost) becomes bank debt on the business
        const remainingDebt = cost;
        const updatedBusinesses = state.businesses.map(b => {
          if (b.id !== event.affectedBusinessId) return b;
          return {
            ...b,
            bankDebtBalance: (b.bankDebtBalance || 0) + remainingDebt,
            bankDebtRate: Math.max((b.bankDebtRate || state.interestRate), state.interestRate) + 0.01,
            bankDebtRoundsRemaining: Math.max(b.bankDebtRoundsRemaining || 0, 5),
          };
        });
        const newState = {
          ...state,
          cash: state.cash - cost,
          businesses: updatedBusinesses,
          totalDebt: computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance),
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Emergency credit line — paid ${formatMoney(cost)} upfront, ${formatMoney(remainingDebt)} added as bank debt (+1% rate)`, type: 'warning' });
      },

      workingCapitalAbsorb: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_working_capital_crunch' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        // Apply -10% revenue immediately (the "2 rounds" effect is simplified to a one-time larger hit)
        const totalPenalty = WORKING_CAPITAL_CRUNCH_REVENUE_PENALTY * WORKING_CAPITAL_CRUNCH_PENALTY_ROUNDS;
        const newState = {
          ...state,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            const newRevenue = Math.round(b.revenue * (1 - totalPenalty));
            const floored = applyEbitdaFloor(
              Math.round(newRevenue * b.ebitdaMargin), newRevenue, b.ebitdaMargin, b.acquisitionEbitda
            );
            return { ...b, revenue: newRevenue, ebitdaMargin: floored.margin, ebitda: floored.ebitda };
          }),
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Absorbed working capital hit — ${Math.round(totalPenalty * 100)}% revenue penalty`, type: 'warning' });
      },

      // ── Management Succession event actions ──

      successionInvest: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_management_succession' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        const cost = event.choices?.find(c => c.action === 'successionInvest')?.cost ?? randomInt(SUCCESSION_INVEST_COST_MIN, SUCCESSION_INVEST_COST_MAX);
        if (state.cash < cost) return;
        const streams = createRngStreams(state.seed, state.round);
        const restored = streams.events.fork('succession_invest').next() < SUCCESSION_INVEST_RESTORE;
        const newState = {
          ...state,
          cash: state.cash - cost,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            if (restored) {
              const restoredQuality = Math.min(5, b.qualityRating + SUCCESSION_QUALITY_DROP) as 1 | 2 | 3 | 4 | 5;
              const newMargin = clampMargin(b.ebitdaMargin + 0.015 * SUCCESSION_QUALITY_DROP);
              return { ...b, qualityRating: restoredQuality, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin), successionResolved: true };
            }
            return { ...b, successionResolved: true };
          }),
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'improve' as GameActionType, round: state.round, details: { businessId: event.affectedBusinessId, action: 'successionInvest', cost, restored } },
          ],
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        const addToast = useToastStore.getState().addToast;
        if (restored) {
          addToast({ message: `External hire succeeded — ${business.name} quality restored`, type: 'success' });
        } else {
          addToast({ message: `External hire didn't work out — ${business.name} quality stays dropped`, type: 'warning' });
        }
      },

      successionPromote: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_management_succession' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        // Calculate promote chance with shared services bonuses
        const hrActive = state.sharedServices?.some(s => s.type === 'recruiting_hr' && s.active) ?? false;
        let promoteChance = SUCCESSION_PROMOTE_RESTORE;
        if (hrActive) promoteChance += SUCCESSION_PROMOTE_HR_BONUS;
        if (business.isPlatform) promoteChance += SUCCESSION_PROMOTE_PLATFORM_BONUS;
        promoteChance = Math.min(0.95, promoteChance);
        const streams = createRngStreams(state.seed, state.round);
        const restored = streams.events.fork('succession_promote').next() < promoteChance;
        const newState = {
          ...state,
          businesses: state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            if (restored) {
              const restoredQuality = Math.min(5, b.qualityRating + SUCCESSION_QUALITY_DROP) as 1 | 2 | 3 | 4 | 5;
              const newMargin = clampMargin(b.ebitdaMargin + 0.015 * SUCCESSION_QUALITY_DROP);
              return { ...b, qualityRating: restoredQuality, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin), successionResolved: true };
            }
            return { ...b, successionResolved: true };
          }),
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'improve' as GameActionType, round: state.round, details: { businessId: event.affectedBusinessId, action: 'successionPromote', restored } },
          ],
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        const addToast = useToastStore.getState().addToast;
        if (restored) {
          addToast({ message: `Internal promotion succeeded — ${business.name} quality restored`, type: 'success' });
        } else {
          addToast({ message: `Internal promotion struggled — ${business.name} quality stays dropped`, type: 'warning' });
        }
      },

      successionSell: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'portfolio_management_succession' || !event.affectedBusinessId) return;
        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;
        const valuation = calculateExitValuation(business, state.round, undefined, undefined, state.integratedPlatforms);
        const fairValue = Math.round(business.ebitda * valuation.totalMultiple);
        const sellPrice = Math.round(fairValue * (1 - SUCCESSION_SELL_DISCOUNT));
        // Remove business (and handle bolt-ons if platform)
        const boltOnIds = business.boltOnIds || [];
        // Include bolt-on debt + earn-out obligations in total debt payoff
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.includes(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0);
        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + business.earnoutRemaining + boltOnDebt;
        const netProceeds = Math.max(0, sellPrice - debtPayoff);
        // Apply rollover equity split if applicable
        const playerProceeds = business.rolloverEquityPct > 0
          ? Math.round(netProceeds * (1 - business.rolloverEquityPct))
          : netProceeds;
        const removedIds = new Set([business.id, ...boltOnIds]);
        let updatedBusinessesSucc = state.businesses.filter(b => !removedIds.has(b.id));

        // Platform dissolution check: if sold business was part of an integrated platform
        let updatedPlatformsSucc = state.integratedPlatforms;
        if (business.integratedPlatformId) {
          const platform = state.integratedPlatforms.find(p => p.id === business.integratedPlatformId);
          if (platform) {
            if (checkPlatformDissolution(platform, updatedBusinessesSucc)) {
              updatedPlatformsSucc = updatedPlatformsSucc.filter(p => p.id !== platform.id);
              updatedBusinessesSucc = updatedBusinessesSucc.map(b =>
                b.integratedPlatformId === platform.id ? { ...b, integratedPlatformId: undefined } : b
              );
            } else {
              updatedPlatformsSucc = updatedPlatformsSucc.map(p =>
                p.id === platform.id
                  ? { ...p, constituentBusinessIds: p.constituentBusinessIds.filter(id => id !== business.id) }
                  : p
              );
            }
          }
        }

        // Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCountSucc = updatedBusinessesSucc.filter(b => b.status === 'active').length;
        const updatedServicesSucc = activeOpcoCountSucc < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Clean up turnarounds for sold businesses
        const updatedTurnaroundsSucc = cleanupTurnaroundsForSoldBusinesses(state.activeTurnarounds, removedIds);

        const newState = {
          ...state,
          cash: state.cash + playerProceeds,
          totalExitProceeds: state.totalExitProceeds + playerProceeds,
          businesses: updatedBusinessesSucc,
          integratedPlatforms: updatedPlatformsSucc,
          sharedServices: updatedServicesSucc,
          activeTurnarounds: updatedTurnaroundsSucc,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            ...state.businesses.filter(b => removedIds.has(b.id)).map(b => ({
              ...b,
              status: 'sold' as const,
              successionResolved: true,
              exitPrice: b.id === business.id ? sellPrice : 0,
              exitRound: state.round,
              earnoutRemaining: 0,
            })),
          ],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'sell' as GameActionType, round: state.round, details: { businessId: business.id, proceeds: playerProceeds } },
          ],
          currentEvent: null,
        };
        newState.totalDebt = computeTotalDebt(newState.businesses, newState.holdcoLoanBalance);
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Sold ${business.name} for ${formatMoney(playerProceeds)} net proceeds`, type: 'info' });
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

        let updatedBusinesses = state.businesses.map(b => {
          if (b.id === businessId) return { ...b, status: 'sold' as const, exitPrice, exitRound: state.round, earnoutRemaining: 0 };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 };
          return b;
        });
        const newTotalDebt = computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance);

        // Platform dissolution check: if sold business was part of an integrated platform
        let updatedPlatformsDistress = state.integratedPlatforms;
        if (business.integratedPlatformId) {
          const platform = state.integratedPlatforms.find(p => p.id === business.integratedPlatformId);
          if (platform) {
            if (checkPlatformDissolution(platform, updatedBusinesses)) {
              updatedPlatformsDistress = updatedPlatformsDistress.filter(p => p.id !== platform.id);
              updatedBusinesses = updatedBusinesses.map(b =>
                b.integratedPlatformId === platform.id ? { ...b, integratedPlatformId: undefined } : b
              );
            } else {
              updatedPlatformsDistress = updatedPlatformsDistress.map(p =>
                p.id === platform.id
                  ? { ...p, constituentBusinessIds: p.constituentBusinessIds.filter(id => id !== businessId) }
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

        // Clean up turnarounds for sold businesses
        const soldIdsDistress = new Set([businessId, ...boltOnIds]);
        const updatedTurnaroundsDistress = cleanupTurnaroundsForSoldBusinesses(state.activeTurnarounds, soldIdsDistress);

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
          integratedPlatforms: updatedPlatformsDistress,
          activeTurnarounds: updatedTurnaroundsDistress,
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
        if (state.isFamilyOfficeMode) return; // No emergency equity in FO mode
        if (state.isFundManagerMode) return; // GP can't call capital beyond commitments
        const metrics = calculateMetrics(state);
        if (metrics.intrinsicValuePerShare <= 0) return;

        // Emergency: shares issued at flat 50% of intrinsic value (2x dilution)
        // No escalating discount — emergency is already punitive
        const emergencyPrice = metrics.intrinsicValuePerShare * 0.5;
        const newShares = Math.round((amount / emergencyPrice) * 1000) / 1000;

        // No ownership floor during emergency (neither 51% nor 10%)
        const emergencyState: typeof state = {
          ...state,
          cash: state.cash + amount,
          sharesOutstanding: state.sharesOutstanding + newShares,
          equityRaisesUsed: state.equityRaisesUsed + 1,
          lastEquityRaiseRound: state.round,
        };

        // Sync IPO state if public — keep sharesOutstanding and stock price consistent
        if (emergencyState.ipoState?.isPublic) {
          emergencyState.ipoState = {
            ...emergencyState.ipoState,
            sharesOutstanding: emergencyState.sharesOutstanding,
          };
          emergencyState.ipoState.stockPrice = calculateStockPrice(emergencyState);
        }

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
        // Pro Sports are always trophy-tier — force size preference
        const effectiveSize = sectorId === 'proSports' ? 'trophy' as DealSizePreference : sizePreference;
        set({
          maFocus: { sectorId, sizePreference: effectiveSize, subType: effectiveSubType },
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
        const srcInflation = calculateDealInflation(state.round, state.duration, state.dealInflationState);
        let newDeals = generateSourcedDeals(
          state.round,
          state.maFocus,
          focusBonus?.focusGroup,
          totalPortfolioEbitda,
          state.maSourcing.active ? state.maSourcing.tier : 0,
          state.maxRounds,
          state.creditTighteningRoundsRemaining > 0,
          srcStreams.deals.fork(`source-${priorSourceCount}`),
          srcInflation,
          state.cash,
          state.ipoState ?? null,
          state.requiresRestructuring || state.covenantBreachRounds >= 1,
        );

        // Filter out pro sports deals for sub-types the player already owns
        const srcOwnedProSports = state.businesses
          .filter(b => b.sectorId === 'proSports' && (b.status === 'active' || b.status === 'integrated'))
          .map(b => b.subType);
        if (srcOwnedProSports.length > 0) {
          newDeals = newDeals.filter(d =>
            d.business.sectorId !== 'proSports' ||
            !srcOwnedProSports.includes(d.business.subType)
          );
        }

        const srcState = { ...state, cash: state.cash - cost };
        set({
          ...srcState,
          dealPipeline: [...state.dealPipeline, ...newDeals],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'source_deals', round: state.round, details: { cost, dealsGenerated: newDeals.length } },
          ],
          metrics: calculateMetrics(srcState),
        });
      },

      // ── IPO Pathway actions (20-year mode) ──

      executeIPO: () => {
        const state = get();
        if (state.isFamilyOfficeMode) return; // No IPO in FO mode
        const { eligible, reasons } = checkIPOEligibility(state);
        if (!eligible) {
          useToastStore.getState().addToast({ message: `Cannot IPO: ${reasons[0]}`, type: 'warning' });
          return;
        }
        const result = executeIPOEngine(state);
        const newState = {
          ...state,
          cash: state.cash + result.cashRaised,
          ipoState: result.ipoState,
          sharesOutstanding: result.ipoState.sharesOutstanding,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'ipo' as const, round: state.round, details: { cashRaised: result.cashRaised, sharesIssued: result.newSharesIssued } },
          ],
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({
          message: `IPO successful! Raised ${formatMoney(result.cashRaised)}`,
          type: 'success',
        });
      },

      declineIPO: () => {
        useToastStore.getState().addToast({
          message: 'Staying private — no IPO this round',
          type: 'info',
        });
      },

      // ── Family Office V2 actions (real holdco mechanics) ──

      startFamilyOffice: (force?: boolean) => {
        const state = get();
        if (state.isFamilyOfficeMode) return; // prevent double-invocation
        if (!force) {
          const score = calculateFinalScore(state);
          const { eligible, reasons } = checkFamilyOfficeEligibility(state, score);
          if (!eligible) {
            useToastStore.getState().addToast({
              message: `Cannot start Family Office: ${reasons[0]}`,
              type: 'warning',
            });
            return;
          }
        }

        // 1. Snapshot all persisted fields
        const partialState: Record<string, unknown> = {};
        const partializeKeys = [
          'holdcoName', 'round', 'phase', 'gameOver', 'difficulty', 'duration', 'maxRounds',
          'businesses', 'exitedBusinesses', 'cash', 'totalDebt', 'interestRate',
          'sharesOutstanding', 'founderShares', 'initialRaiseAmount', 'initialOwnershipPct',
          'totalInvestedCapital', 'totalDistributions', 'totalBuybacks', 'totalExitProceeds',
          'equityRaisesUsed', 'lastEquityRaiseRound', 'lastBuybackRound',
          'sharedServices', 'dealPipeline', 'passedDealIds', 'maFocus', 'maSourcing',
          'integratedPlatforms', 'turnaroundTier', 'activeTurnarounds',
          'currentEvent', 'eventHistory', 'creditTighteningRoundsRemaining', 'inflationRoundsRemaining',
          'metricsHistory', 'roundHistory', 'actionsThisRound',
          'debtPaymentThisRound', 'cashBeforeDebtPayments',
          'holdcoDebtStartRound', 'holdcoAmortizationThisRound',
          'requiresRestructuring', 'covenantBreachRounds', 'hasRestructured', 'bankruptRound',
          'exitMultiplePenalty', 'holdcoLoanBalance', 'holdcoLoanRate', 'holdcoLoanRoundsRemaining',
          'acquisitionsThisRound', 'maxAcquisitionsPerRound', 'lastAcquisitionResult', 'lastIntegrationOutcome',
          'founderDistributionsReceived', 'isChallenge', 'metrics', 'focusBonus',
          'consolidationBoomSectorId', 'seed', 'dealInflationState', 'ipoState', 'familyOfficeState',
          'isFamilyOfficeMode',
        ];
        for (const key of partializeKeys) {
          partialState[key] = (state as any)[key];
        }
        const mainGameSnapshot = JSON.stringify(partialState);

        // 2. Calculate FO cash (75% of distributions after 25% philanthropy)
        const philanthropyDeduction = Math.round(state.founderDistributionsReceived * FO_PHILANTHROPY_RATE);
        const foStartingCash = state.founderDistributionsReceived - philanthropyDeduction;

        // 3. Reset state for FO play
        resetBusinessIdCounter();
        resetUsedNames();
        const gameSeed = state.seed || generateRandomSeed();
        const round1Streams = createRngStreams(gameSeed, 1);
        const foInitialPipeline = generateDealPipeline(
          [], 1, undefined, undefined, undefined, 0,
          FO_MA_SOURCING_TIER, true, undefined, FO_MAX_ROUNDS,
          false, round1Streams.deals, FO_DEAL_INFLATION, foStartingCash, null, false, true, state.difficulty,
          [], // no owned pro sports yet at FO start
          [], // FO mode includes all sectors via isFamilyOfficeMode=true
          false,
        );

        set({
          // Core reset
          businesses: [],
          exitedBusinesses: [],
          cash: foStartingCash,
          totalDebt: 0,
          holdcoLoanBalance: 0,
          holdcoLoanRate: 0,
          holdcoLoanRoundsRemaining: 0,
          holdcoDebtStartRound: 0,
          holdcoAmortizationThisRound: 0,
          round: 1,
          phase: 'collect' as GamePhase,
          gameOver: false,
          maxRounds: FO_MAX_ROUNDS,
          isFamilyOfficeMode: true,
          interestRate: STARTING_INTEREST_RATE,
          sharesOutstanding: 1000,
          founderShares: 1000,
          initialRaiseAmount: foStartingCash,
          initialOwnershipPct: 1.0,
          totalInvestedCapital: 0,
          totalDistributions: 0,
          totalBuybacks: 0,
          totalExitProceeds: 0,
          equityRaisesUsed: 0,
          lastEquityRaiseRound: 0,
          lastBuybackRound: 0,
          dealPipeline: foInitialPipeline,
          passedDealIds: [],
          maFocus: { sectorId: null, sizePreference: 'any' as DealSizePreference, subType: null },
          maSourcing: { tier: FO_MA_SOURCING_TIER as MASourcingTier, active: true, unlockedRound: 0, lastUpgradeRound: 0 },
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
          cashBeforeDebtPayments: foStartingCash,
          requiresRestructuring: false,
          covenantBreachRounds: 0,
          hasRestructured: false,
          bankruptRound: undefined,
          exitMultiplePenalty: 0,
          acquisitionsThisRound: 0,
          maxAcquisitionsPerRound: 3,
          lastAcquisitionResult: null,
          lastIntegrationOutcome: null,
          consolidationBoomSectorId: undefined,
          dealInflationState: { crisisResetRoundsRemaining: 0 },
          ipoState: null,
          sharedServices: initializeSharedServices(),
          founderDistributionsReceived: 0,
          // FO state
          familyOfficeState: {
            isActive: true,
            mainGameSnapshot,
            foStartingCash,
            philanthropyDeduction,
          },
          metrics: calculateMetrics({
            ...initialState,
            cash: foStartingCash,
            businesses: [],
            totalDebt: 0,
            holdcoLoanBalance: 0,
            sharesOutstanding: 1000,
            founderShares: 1000,
          } as GameState),
          focusBonus: null,
        });

        useToastStore.getState().addToast({
          message: `Family Office started — ${formatMoney(philanthropyDeduction)} committed to philanthropy`,
          type: 'success',
        });
      },

      completeFamilyOffice: () => {
        const state = get();
        if (!state.isFamilyOfficeMode || !state.familyOfficeState?.isActive) return;

        // 1. Calculate FO FEV from current (FO) state
        const foFEV = calculateFounderEquityValue(state);
        const foStartingCash = state.familyOfficeState.foStartingCash;
        const legacyScore = calculateFOLegacyScore(foFEV, foStartingCash, state.hasRestructured);
        const foMultiplier = legacyScore.foMultiplier;

        // 2. Restore main game state from snapshot
        const snapshot = state.familyOfficeState.mainGameSnapshot;
        if (!snapshot) return;

        try {
          const restored = JSON.parse(snapshot);

          // Merge FO-mode round history into main game history so strategy
          // analytics (source_deals, acquisitions, etc.) include FO actions
          const foRoundHistory = state.roundHistory ?? [];
          const mergedRoundHistory = [...(restored.roundHistory ?? []), ...foRoundHistory];

          // 3. Merge restored state with FO results
          set({
            ...restored,
            roundHistory: mergedRoundHistory,
            // Override FO state with results
            familyOfficeState: {
              isActive: false,
              foStartingCash,
              philanthropyDeduction: state.familyOfficeState.philanthropyDeduction,
              foMultiplier,
              legacyScore,
              // Clear snapshot to save space
            },
            isFamilyOfficeMode: false,
          });
        } catch (e) {
          console.error('Failed to restore main game state:', e);
          // Fallback: just end FO mode with base multiplier, keep current state
          set({
            isFamilyOfficeMode: false,
            familyOfficeState: {
              isActive: false,
              foStartingCash,
              philanthropyDeduction: state.familyOfficeState.philanthropyDeduction,
              foMultiplier: 1.0,
              legacyScore,
            },
          });
          useToastStore.getState().addToast({
            message: 'Could not restore main game — FO multiplier applied to current state.',
            type: 'warning',
          });
        }
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

        trackFeatureUsed('ma_sourcing', state.round);

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
        const outInflation = calculateDealInflation(state.round, state.duration, state.dealInflationState);
        let newDeals = generateProactiveOutreachDeals(
          state.round,
          state.maFocus,
          totalPortfolioEbitda,
          state.maxRounds,
          state.creditTighteningRoundsRemaining > 0,
          outStreams.deals.fork(`outreach-${priorOutreachCount}`),
          outInflation,
          state.cash,
          state.ipoState ?? null,
          state.requiresRestructuring || state.covenantBreachRounds >= 1,
        );

        // Filter out pro sports deals for sub-types the player already owns
        const outOwnedProSports = state.businesses
          .filter(b => b.sectorId === 'proSports' && (b.status === 'active' || b.status === 'integrated'))
          .map(b => b.subType);
        if (outOwnedProSports.length > 0) {
          newDeals = newDeals.filter(d =>
            d.business.sectorId !== 'proSports' ||
            !outOwnedProSports.includes(d.business.subType)
          );
        }

        const outState = { ...state, cash: state.cash - PROACTIVE_OUTREACH_COST };
        set({
          ...outState,
          dealPipeline: [...state.dealPipeline, ...newDeals],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'proactive_outreach' as const, round: state.round, details: { cost: PROACTIVE_OUTREACH_COST, dealsGenerated: newDeals.length } },
          ],
          metrics: calculateMetrics(outState),
        });
      },

      smbBrokerDealFlow: () => {
        const state = get();
        // Guard: disabled when MA Sourcing Tier 1+ is active
        if (state.maSourcing.active && state.maSourcing.tier >= 1) return;
        if (state.cash < SMB_BROKER_COST) return;

        const priorBrokerCount = state.actionsThisRound.filter(a => a.type === 'smb_broker').length;
        const brokerStreams = createRngStreams(state.seed, state.round);
        const brokerInflation = calculateDealInflation(state.round, state.duration, state.dealInflationState);
        const newDeal = generateSMBBrokerDeal(
          state.round,
          state.maxRounds,
          brokerStreams.deals.fork(`smb-broker-${priorBrokerCount}`),
          brokerInflation,
        );

        const smbState = { ...state, cash: state.cash - SMB_BROKER_COST };
        set({
          ...smbState,
          dealPipeline: [...state.dealPipeline, newDeal],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'smb_broker' as const, round: state.round, details: { cost: SMB_BROKER_COST } },
          ],
          metrics: calculateMetrics(smbState),
        });
      },

      // ── Filler Event Choice Handlers ──

      fillerTaxInvest: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'filler_tax_strategy') return;
        const activeBusinesses = state.businesses.filter(b => b.status === 'active');
        if (activeBusinesses.length === 0) return;
        const cost = state.currentEvent.choices?.[0]?.cost ?? randomInt(FILLER_TAX_STRATEGY_COST_MIN, FILLER_TAX_STRATEGY_COST_MAX);
        if (state.cash < cost) return;
        const targetId = state.currentEvent.affectedBusinessId;
        const businesses = state.businesses.map(b => {
          if (b.id === targetId && b.status === 'active') {
            const newMargin = clampMargin(b.ebitdaMargin + FILLER_TAX_STRATEGY_MARGIN_BOOST);
            return { ...b, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin) };
          }
          return b;
        });
        set({
          cash: state.cash - cost,
          businesses,
          currentEvent: null,
          eventHistory: [...state.eventHistory, state.currentEvent],
        });
      },

      fillerTaxWriteoff: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'filler_tax_strategy') return;
        set({
          cash: state.cash + FILLER_TAX_STRATEGY_WRITEOFF,
          currentEvent: null,
          eventHistory: [...state.eventHistory, state.currentEvent],
        });
      },

      fillerConferenceAttend: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'filler_industry_conference') return;
        const cost = state.currentEvent.choices?.[0]?.cost ?? randomInt(FILLER_CONFERENCE_COST_MIN, FILLER_CONFERENCE_COST_MAX);
        if (state.cash < cost) return;
        const confStreams = createRngStreams(state.seed, state.round);
        const confInflation = calculateDealInflation(state.round, state.duration, state.dealInflationState);
        const deal = generateSMBBrokerDeal(state.round, state.maxRounds, confStreams.deals.fork('conf-attend'), confInflation);
        // Conference deal is warm heat
        const warmDeal = { ...deal, heat: 'warm' as const, source: 'brokered' as const };
        set({
          cash: state.cash - cost,
          dealPipeline: [...state.dealPipeline, warmDeal],
          currentEvent: null,
          eventHistory: [...state.eventHistory, state.currentEvent],
        });
      },

      fillerConferenceFree: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'filler_industry_conference') return;
        const confStreams = createRngStreams(state.seed, state.round);
        const roll = confStreams.events.fork('conf-free').next();
        if (roll < FILLER_CONFERENCE_FREE_DEAL_CHANCE) {
          const confInflation = calculateDealInflation(state.round, state.duration, state.dealInflationState);
          const deal = generateSMBBrokerDeal(state.round, state.maxRounds, confStreams.deals.fork('conf-free-deal'), confInflation);
          set({
            dealPipeline: [...state.dealPipeline, { ...deal, heat: 'warm' as const }],
            currentEvent: null,
            eventHistory: [...state.eventHistory, state.currentEvent],
          });
        } else {
          set({
            currentEvent: null,
            eventHistory: [...state.eventHistory, state.currentEvent],
          });
        }
      },

      fillerAuditFull: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'filler_operational_audit') return;
        const cost = state.currentEvent.choices?.[0]?.cost ?? randomInt(FILLER_AUDIT_COST_MIN, FILLER_AUDIT_COST_MAX);
        if (state.cash < cost) return;
        const auditStreams = createRngStreams(state.seed, state.round);
        const auditRng = auditStreams.events.fork('audit-full');
        const roll = auditRng.next();
        const activeBusinesses = state.businesses.filter(b => b.status === 'active');
        if (activeBusinesses.length === 0) {
          set({ cash: state.cash - cost, currentEvent: null, eventHistory: [...state.eventHistory, state.currentEvent] });
          return;
        }
        const targetBiz = activeBusinesses[Math.floor(auditRng.next() * activeBusinesses.length)];
        let businesses = state.businesses;
        let cashAdjust = -cost;
        if (roll < FILLER_AUDIT_SUCCESS_CHANCE) {
          // Success: +1.5ppt permanent margin
          businesses = businesses.map(b => {
            if (b.id !== targetBiz.id) return b;
            const newMargin = clampMargin(b.ebitdaMargin + FILLER_AUDIT_MARGIN_BOOST);
            return { ...b, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin) };
          });
        } else if (roll < FILLER_AUDIT_SUCCESS_CHANCE + FILLER_AUDIT_ISSUE_CHANCE) {
          // Compliance issue: -$100K, -1ppt
          cashAdjust -= FILLER_AUDIT_ISSUE_COST;
          businesses = businesses.map(b => {
            if (b.id !== targetBiz.id) return b;
            const newMargin = clampMargin(b.ebitdaMargin - FILLER_AUDIT_ISSUE_MARGIN_HIT);
            return { ...b, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin) };
          });
        }
        // Remaining probability: nothing extra happens (just the cost)
        set({
          cash: state.cash + cashAdjust,
          businesses,
          currentEvent: null,
          eventHistory: [...state.eventHistory, state.currentEvent],
        });
      },

      fillerAuditLight: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'filler_operational_audit') return;
        const auditStreams = createRngStreams(state.seed, state.round);
        const roll = auditStreams.events.fork('audit-light').next();
        const activeBusinesses = state.businesses.filter(b => b.status === 'active');
        if (roll < FILLER_AUDIT_LIGHT_CHANCE && activeBusinesses.length > 0) {
          const rngPick = auditStreams.events.fork('audit-light-pick');
          const targetBiz = activeBusinesses[Math.floor(rngPick.next() * activeBusinesses.length)];
          const businesses = state.businesses.map(b => {
            if (b.id !== targetBiz.id) return b;
            const newMargin = clampMargin(b.ebitdaMargin + FILLER_AUDIT_LIGHT_MARGIN_BOOST);
            return { ...b, ebitdaMargin: newMargin, ebitda: Math.round(b.revenue * newMargin) };
          });
          set({ businesses, currentEvent: null, eventHistory: [...state.eventHistory, state.currentEvent] });
        } else {
          set({ currentEvent: null, eventHistory: [...state.eventHistory, state.currentEvent] });
        }
      },

      fillerReputationInvest: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'filler_reputation_building') return;
        const cost = state.currentEvent.choices?.[0]?.cost ?? randomInt(FILLER_REPUTATION_COST_MIN, FILLER_REPUTATION_COST_MAX);
        if (state.cash < cost) return;
        set({
          cash: state.cash - cost,
          nextAcquisitionHeatReduction: FILLER_REPUTATION_HEAT_REDUCTION,
          currentEvent: null,
          eventHistory: [...state.eventHistory, state.currentEvent],
        });
      },

      fillerReputationFree: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'filler_reputation_building') return;
        const repStreams = createRngStreams(state.seed, state.round);
        const repInflation = calculateDealInflation(state.round, state.duration, state.dealInflationState);
        const deal = generateSMBBrokerDeal(state.round, state.maxRounds, repStreams.deals.fork('rep-free'), repInflation);
        set({
          dealPipeline: [...state.dealPipeline, { ...deal, heat: 'warm' as const }],
          currentEvent: null,
          eventHistory: [...state.eventHistory, state.currentEvent],
        });
      },

      fillerPass: () => {
        const state = get();
        if (!state.currentEvent) return;
        set({
          currentEvent: null,
          eventHistory: [...state.eventHistory, state.currentEvent],
        });
      },

      // ── New Event Choice Handlers ──

      cyberBreachUpgrade: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'portfolio_cyber_breach') return;
        const cost = state.currentEvent.choices?.[0]?.cost ?? 750;
        if (state.cash < cost) return;
        const targetId = state.currentEvent.affectedBusinessId;
        const businesses = state.businesses.map(b => {
          if (b.id !== targetId || b.status !== 'active') return b;
          const restoredQuality = Math.min(5, b.qualityRating + 1) as 1 | 2 | 3 | 4 | 5;
          const newRevenue = Math.round(b.revenue * 1.08);
          const newEbitda = Math.round(newRevenue * b.ebitdaMargin);
          return { ...b, qualityRating: restoredQuality, revenue: newRevenue, ebitda: newEbitda, peakRevenue: Math.max(b.peakRevenue, newRevenue) };
        });
        const newState = { ...state, cash: state.cash - cost, businesses, currentEvent: null };
        set({ ...newState, metrics: calculateMetrics(newState) });
      },

      cyberBreachSettle: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'portfolio_cyber_breach') return;
        const cost = state.currentEvent.choices?.[1]?.cost ?? 400;
        if (state.cash < cost) return;
        const targetId = state.currentEvent.affectedBusinessId;
        const businesses = state.businesses.map(b => {
          if (b.id !== targetId || b.status !== 'active') return b;
          const restoredQuality = Math.min(5, b.qualityRating + 1) as 1 | 2 | 3 | 4 | 5;
          const newRevenue = Math.round(b.revenue * 0.95);
          const newEbitda = Math.round(newRevenue * b.ebitdaMargin);
          return { ...b, qualityRating: restoredQuality, revenue: newRevenue, ebitda: newEbitda };
        });
        const newState = { ...state, cash: state.cash - cost, businesses, currentEvent: null };
        set({ ...newState, metrics: calculateMetrics(newState) });
      },

      cyberBreachAbsorb: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'portfolio_cyber_breach') return;
        const targetId = state.currentEvent.affectedBusinessId;
        const businesses = state.businesses.map(b => {
          if (b.id !== targetId || b.status !== 'active') return b;
          const newRevenue = Math.round(b.revenue * 0.90);
          const newEbitda = Math.round(newRevenue * b.ebitdaMargin);
          return { ...b, revenue: newRevenue, ebitda: newEbitda };
        });
        const newState = { ...state, businesses, currentEvent: null };
        set({ ...newState, metrics: calculateMetrics(newState) });
      },

      antitrustDivest: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'portfolio_antitrust_scrutiny') return;
        const targetId = state.currentEvent.affectedBusinessId;
        if (!targetId) return;
        const biz = state.businesses.find(b => b.id === targetId);
        if (!biz) return;
        const valuation = calculateExitValuation(biz, state.round, undefined, undefined, state.integratedPlatforms);
        const salePrice = Math.round(biz.ebitda * valuation.totalMultiple);
        // Full debt payoff including bolt-ons, earnouts, rollover
        const boltOnIds = new Set(biz.boltOnIds || []);
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0);
        const debtPayoff = biz.sellerNoteBalance + biz.bankDebtBalance + biz.earnoutRemaining + boltOnDebt;
        const netProceeds = Math.max(0, salePrice - debtPayoff);
        const rolloverPct = biz.rolloverEquityPct || 0;
        const playerProceeds = rolloverPct > 0 ? Math.round(netProceeds * (1 - rolloverPct)) : netProceeds;
        let updatedBusinesses = state.businesses.map(b => {
          if (b.id === targetId) return { ...b, status: 'sold' as const, exitPrice: salePrice, exitRound: state.round, earnoutRemaining: 0 };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 };
          return b;
        });
        // Platform dissolution check
        let updatedPlatforms = state.integratedPlatforms;
        if (biz.integratedPlatformId) {
          const platform = state.integratedPlatforms.find(p => p.id === biz.integratedPlatformId);
          if (platform) {
            if (checkPlatformDissolution(platform, updatedBusinesses)) {
              updatedPlatforms = updatedPlatforms.filter(p => p.id !== platform.id);
              updatedBusinesses = updatedBusinesses.map(b =>
                b.integratedPlatformId === platform.id ? { ...b, integratedPlatformId: undefined } : b
              );
            } else {
              updatedPlatforms = updatedPlatforms.map(p =>
                p.id === platform.id
                  ? { ...p, constituentBusinessIds: p.constituentBusinessIds.filter(id => id !== biz.id) }
                  : p
              );
            }
          }
        }
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;
        // Clean up turnarounds for sold businesses
        const soldIdsDivest = new Set([targetId, ...boltOnIds]);
        const updatedTurnaroundsDivest = cleanupTurnaroundsForSoldBusinesses(state.activeTurnarounds, soldIdsDivest);
        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 }));
        const newState = {
          ...state,
          cash: state.cash + playerProceeds, // $500K legal costs already deducted by applyEventEffects
          businesses: updatedBusinesses,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...biz, status: 'sold' as const, exitPrice: salePrice, exitRound: state.round, earnoutRemaining: 0 },
            ...exitedBoltOns,
          ],
          totalExitProceeds: state.totalExitProceeds + playerProceeds,
          totalDebt: computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance),
          integratedPlatforms: updatedPlatforms,
          sharedServices: updatedServices,
          activeTurnarounds: updatedTurnaroundsDivest,
          currentEvent: null,
        };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Divested ${biz.name} for ${formatMoney(playerProceeds)} net proceeds (antitrust)`, type: 'warning' });
      },

      antitrustFight: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'portfolio_antitrust_scrutiny') return;
        const cost = state.currentEvent.choices?.[1]?.cost ?? 500;
        if (state.cash < cost) return;
        const fightStreams = createRngStreams(state.seed, state.round);
        const roll = fightStreams.events.fork('antitrust-fight').next();
        if (roll < 0.60) {
          // Clearance — just pay legal costs
          const newState = { ...state, cash: state.cash - cost, currentEvent: null };
          set({ ...newState, metrics: calculateMetrics(newState) });
          useToastStore.getState().addToast({ message: 'Antitrust clearance granted! Legal costs only.', type: 'success' });
        } else {
          // Forced divestiture at 80%
          const targetId = state.currentEvent.affectedBusinessId;
          const biz = state.businesses.find(b => b.id === targetId);
          if (!biz) return;
          const valuation = calculateExitValuation(biz, state.round, undefined, undefined, state.integratedPlatforms);
          const salePrice = Math.round(biz.ebitda * valuation.totalMultiple * 0.80);
          const boltOnIds = new Set(biz.boltOnIds || []);
          const boltOnDebt = state.businesses
            .filter(b => boltOnIds.has(b.id))
            .reduce((sum, b) => sum + b.sellerNoteBalance + b.bankDebtBalance + b.earnoutRemaining, 0);
          const debtPayoff = biz.sellerNoteBalance + biz.bankDebtBalance + biz.earnoutRemaining + boltOnDebt;
          const netProceeds = Math.max(0, salePrice - debtPayoff);
          const rolloverPct = biz.rolloverEquityPct || 0;
          const playerProceeds = rolloverPct > 0 ? Math.round(netProceeds * (1 - rolloverPct)) : netProceeds;
          let updatedBusinesses = state.businesses.map(b => {
            if (b.id === targetId) return { ...b, status: 'sold' as const, exitPrice: salePrice, exitRound: state.round, earnoutRemaining: 0 };
            if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 };
            return b;
          });
          let updatedPlatforms = state.integratedPlatforms;
          if (biz.integratedPlatformId) {
            const platform = state.integratedPlatforms.find(p => p.id === biz.integratedPlatformId);
            if (platform) {
              if (checkPlatformDissolution(platform, updatedBusinesses)) {
                updatedPlatforms = updatedPlatforms.filter(p => p.id !== platform.id);
                updatedBusinesses = updatedBusinesses.map(b =>
                  b.integratedPlatformId === platform.id ? { ...b, integratedPlatformId: undefined } : b
                );
              } else {
                updatedPlatforms = updatedPlatforms.map(p =>
                  p.id === platform.id
                    ? { ...p, constituentBusinessIds: p.constituentBusinessIds.filter(id => id !== biz.id) }
                    : p
                );
              }
            }
          }
          const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
          const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
            ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
            : state.sharedServices;
          // Clean up turnarounds for sold businesses
          const soldIdsFight = new Set([targetId!, ...boltOnIds]);
          const updatedTurnaroundsFight = cleanupTurnaroundsForSoldBusinesses(state.activeTurnarounds, soldIdsFight);
          const exitedBoltOns = state.businesses
            .filter(b => boltOnIds.has(b.id))
            .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round, earnoutRemaining: 0 }));
          const newState = {
            ...state,
            cash: Math.max(0, state.cash + playerProceeds - cost),
            businesses: updatedBusinesses,
            exitedBusinesses: [
              ...state.exitedBusinesses,
              { ...biz, status: 'sold' as const, exitPrice: salePrice, exitRound: state.round, earnoutRemaining: 0 },
              ...exitedBoltOns,
            ],
            totalExitProceeds: state.totalExitProceeds + playerProceeds,
            totalDebt: computeTotalDebt(updatedBusinesses, state.holdcoLoanBalance),
            integratedPlatforms: updatedPlatforms,
            sharedServices: updatedServices,
            activeTurnarounds: updatedTurnaroundsFight,
            currentEvent: null,
          };
          set({ ...newState, metrics: calculateMetrics(newState) });
          useToastStore.getState().addToast({ message: `Court ruled against you — forced sale of ${biz.name} at 80% value`, type: 'danger' });
        }
      },

      antitrustRestructure: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'portfolio_antitrust_scrutiny') return;
        const cost = state.currentEvent.choices?.[2]?.cost ?? 750;
        if (state.cash < cost) return;
        const targetId = state.currentEvent.affectedBusinessId;
        const biz = state.businesses.find(b => b.id === targetId);
        if (!biz) return;
        // Dissolve any integrated platform in this sector
        const sectorPlatforms = state.integratedPlatforms.filter(p => p.sectorIds.includes(biz.sectorId));
        const dissolvedPlatformIds = new Set(sectorPlatforms.map(p => p.id));
        const integratedPlatforms = state.integratedPlatforms.filter(p => !dissolvedPlatformIds.has(p.id));
        const businesses = state.businesses.map(b => {
          if (b.integratedPlatformId && dissolvedPlatformIds.has(b.integratedPlatformId)) {
            return { ...b, integratedPlatformId: undefined, isPlatform: false, platformScale: 0 };
          }
          return b;
        });
        const newState = { ...state, cash: state.cash - cost, businesses, integratedPlatforms, currentEvent: null };
        set({ ...newState, metrics: calculateMetrics(newState) });
        useToastStore.getState().addToast({ message: `Restructured operations — ${dissolvedPlatformIds.size > 0 ? 'platform dissolved' : 'no platform impact'}`, type: 'warning' });
      },

      competitorAccelerate: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'portfolio_competitor_acquisition') return;
        const targetId = state.currentEvent.affectedBusinessId;
        const businesses = state.businesses.map(b => {
          if (b.id !== targetId || b.status !== 'active') return b;
          const newGrowth = b.revenueGrowthRate - 0.05;
          const newRevenue = Math.round(b.revenue * 0.97);
          const newEbitda = Math.round(newRevenue * b.ebitdaMargin);
          return { ...b, revenueGrowthRate: newGrowth, revenue: newRevenue, ebitda: newEbitda };
        });
        const newState = { ...state, businesses, nextAcquisitionHeatReduction: 1, currentEvent: null };
        set({ ...newState, metrics: calculateMetrics(newState) });
      },

      competitorDifferentiate: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'portfolio_competitor_acquisition') return;
        const cost = state.currentEvent.choices?.[1]?.cost ?? 300;
        if (state.cash < cost) return;
        const targetId = state.currentEvent.affectedBusinessId;
        const businesses = state.businesses.map(b => {
          if (b.id !== targetId || b.status !== 'active') return b;
          const newGrowth = b.revenueGrowthRate - 0.05;
          const newRevenue = Math.round(b.revenue * 0.97);
          const newMargin = clampMargin(b.ebitdaMargin + 0.02);
          const newEbitda = Math.round(newRevenue * newMargin);
          return { ...b, revenueGrowthRate: newGrowth, revenue: newRevenue, ebitdaMargin: newMargin, ebitda: newEbitda };
        });
        const newState = { ...state, cash: state.cash - cost, businesses, currentEvent: null };
        set({ ...newState, metrics: calculateMetrics(newState) });
      },

      competitorAbsorb: () => {
        const state = get();
        if (!state.currentEvent || state.currentEvent.type !== 'portfolio_competitor_acquisition') return;
        const targetId = state.currentEvent.affectedBusinessId;
        const businesses = state.businesses.map(b => {
          if (b.id !== targetId || b.status !== 'active') return b;
          const newGrowth = b.revenueGrowthRate - 0.05;
          const newRevenue = Math.round(b.revenue * 0.97);
          const newEbitda = Math.round(newRevenue * b.ebitdaMargin);
          return { ...b, revenueGrowthRate: newGrowth, revenue: newRevenue, ebitda: newEbitda };
        });
        const newState = { ...state, businesses, currentEvent: null };
        set({ ...newState, metrics: calculateMetrics(newState) });
      },

      forgeIntegratedPlatform: (recipeId: string, businessIds: string[]) => {
        const state = get();
        if (state.phase !== 'allocate') return;

        const recipe = getRecipeById(recipeId);
        if (!recipe) return;

        const selectedBusinesses = state.businesses.filter(b => businessIds.includes(b.id));
        if (selectedBusinesses.length === 0) return;

        // Q3+ quality gate — all constituents must be stabilized before platform integration
        if (selectedBusinesses.some(b => b.qualityRating < 3)) return;

        const integrationCost = calculateIntegrationCost(recipe, selectedBusinesses);
        if (state.cash < integrationCost) return;

        trackFeatureUsed('platform_forge', state.round);

        const platform = forgePlatform(recipe, businessIds, state.round);

        const updatedBusinesses = state.businesses.map(b => {
          if (!businessIds.includes(b.id)) return b;
          const newMargin = clampMargin(b.ebitdaMargin + recipe.bonuses.marginBoost);
          return {
            ...b,
            integratedPlatformId: platform.id,
            ebitdaMargin: newMargin,
            revenueGrowthRate: capGrowthRate(b.revenueGrowthRate + recipe.bonuses.growthBoost),
            organicGrowthRate: capGrowthRate(b.organicGrowthRate + recipe.bonuses.growthBoost),
            // Growth boost is forward-looking only — EBITDA recalc uses new margin but current revenue
            ebitda: Math.round(b.revenue * newMargin),
          };
        });

        set({
          businesses: updatedBusinesses,
          integratedPlatforms: [...state.integratedPlatforms, platform],
          cash: state.cash - integrationCost,
          totalInvestedCapital: state.totalInvestedCapital + integrationCost,
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

        // Guard: pro sports teams cannot be added to platforms
        if (business.sectorId === 'proSports') return;

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
          const newMargin = clampMargin(b.ebitdaMargin + recipe.bonuses.marginBoost);
          return {
            ...b,
            integratedPlatformId: platform.id,
            ebitdaMargin: newMargin,
            revenueGrowthRate: capGrowthRate(b.revenueGrowthRate + recipe.bonuses.growthBoost),
            organicGrowthRate: capGrowthRate(b.organicGrowthRate + recipe.bonuses.growthBoost),
            // Growth boost is forward-looking only — EBITDA recalc uses new margin but current revenue
            ebitda: Math.round(b.revenue * newMargin),
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
          // Apply tiered platform sale bonus + strategic premium + market variance
          const platformSaleBonus = getPlatformSaleBonus(platform.bonuses.multipleExpansion);
          let effectiveMultiple = valuation.totalMultiple + platformSaleBonus;
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

        // Clean up turnarounds for sold businesses
        const updatedTurnaroundsPlatSale = cleanupTurnaroundsForSoldBusinesses(state.activeTurnarounds, allSoldIds);

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
          activeTurnarounds: updatedTurnaroundsPlatSale,
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
                platformSaleBonus: getPlatformSaleBonus(platform.bonuses.multipleExpansion),
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
        if (state.isFamilyOfficeMode) return; // No turnaround unlocks in FO mode
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
        if (state.isFamilyOfficeMode) return; // No turnarounds in FO mode
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

        // PE Fund: block turnaround if it would complete after fund closes
        const duration = getTurnaroundDuration(program, state.duration);
        if (state.isFundManagerMode && duration > (state.maxRounds - state.round)) {
          useToastStore.getState().addToast({
            message: `Not enough time remaining — this turnaround would complete in Year ${state.round + duration}, but the fund closes in Year ${state.maxRounds}.`,
            type: 'warning',
          });
          return;
        }

        trackFeatureUsed('turnaround', state.round);
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
        const { dealPipeline, round: snapshotRound } = get();
        try {
          const enhancedDeals = await enhanceDealsWithAI(dealPipeline);
          // Guard: discard stale results if round changed during async AI call
          const current = get();
          if (current.round !== snapshotRound) return;
          // Merge AI results into the current pipeline (not the stale snapshot)
          // to avoid overwriting deals added while AI was running
          const enhancedById = new Map(enhancedDeals.map(d => [d.id, d]));
          const merged = current.dealPipeline.map(d => enhancedById.get(d.id) ?? d);
          set({ dealPipeline: merged });
        } catch (error) {
          console.error('AI enhancement failed:', error);
        }
      },

      enhanceSingleDeal: async (dealId: string) => {
        const { dealPipeline, round: snapshotRound } = get();
        const deal = dealPipeline.find(d => d.id === dealId);
        if (!deal || deal.aiContent?.aiEnhanced) return; // Already enhanced or not found
        try {
          const enhanced = await enhanceDealWithAI(deal);
          // Guard: discard stale results if round changed
          const current = get();
          if (current.round !== snapshotRound) return;
          // Mark as AI-enhanced
          if (enhanced.aiContent) {
            enhanced.aiContent.aiEnhanced = true;
          }
          set({
            dealPipeline: current.dealPipeline.map(d => d.id === dealId ? enhanced : d),
          });
        } catch (error) {
          console.error('Single deal AI enhancement failed:', error);
        }
      },

      fetchEventNarrative: async () => {
        const state = get();
        const event = state.currentEvent;

        if (!event || event.narrative) return; // Already has narrative or no event

        // Skip quiet years
        if (event.type === 'global_quiet') return;

        // Use high-quality handwritten fallbacks directly (no AI call needed)
        const narrative = getFallbackEventNarrative(event.type);
        const current = get().currentEvent;
        if (current && current.type === event.type && current.affectedBusinessId === event.affectedBusinessId) {
          set({ currentEvent: { ...current, narrative } });
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

            const yearsOwned = state.round - b.acquisitionRound;
            if (yearsOwned < 1) return b; // Skip businesses acquired this round
            const hasRecentImprovement = b.improvements.some(i => i.appliedRound === state.round - 1);

            // Only call AI for businesses with meaningful changes
            const hasMeaningfulChange =
              hasRecentImprovement ||
              state.currentEvent?.affectedBusinessId === b.id ||
              yearsOwned <= 2 ||
              b.isPlatform ||
              yearsOwned % 5 === 0;

            let storyText: string;
            if (hasMeaningfulChange) {
              const sector = SECTORS[b.sectorId];
              const ebitdaChange = b.ebitda > b.acquisitionEbitda
                ? `+${((b.ebitda / b.acquisitionEbitda - 1) * 100).toFixed(0)}% since acquisition`
                : `${((b.ebitda / b.acquisitionEbitda - 1) * 100).toFixed(0)}% since acquisition`;

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
              storyText = narrative || getFallbackBusinessStory(b.ebitda, b.acquisitionEbitda, yearsOwned);
            } else {
              storyText = getFallbackBusinessStory(b.ebitda, b.acquisitionEbitda, yearsOwned);
            }
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

        // Guard: discard stale stories if round changed during async AI calls
        const freshState = get();
        if (freshState.round !== state.round) return;

        // Merge storyBeats into current state (avoids overwriting concurrent mutations)
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
      name: 'holdco-tycoon-save-v38', // v38: Turnaround System Overhaul
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
        dealInflationState: state.dealInflationState,
        ipoState: state.ipoState,
        familyOfficeState: state.familyOfficeState,
        isFamilyOfficeMode: state.isFamilyOfficeMode,
        nextAcquisitionHeatReduction: state.nextAcquisitionHeatReduction,
        // PE Fund Manager Mode
        isFundManagerMode: state.isFundManagerMode,
        fundName: state.fundName,
        fundSize: state.fundSize,
        managementFeesCollected: state.managementFeesCollected,
        lpSatisfactionScore: state.lpSatisfactionScore,
        lpCommentary: state.lpCommentary,
        fundCashFlows: state.fundCashFlows,
        totalCapitalDeployed: state.totalCapitalDeployed,
        lpDistributions: state.lpDistributions,
        dpiMilestones: state.dpiMilestones,
      }),
      // Debounced storage to coalesce rapid mutations (game is turn-based, 500ms delay is safe)
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (() => {
          let timeout: ReturnType<typeof setTimeout> | null = null;
          return (name: string, value: unknown) => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
              localStorage.setItem(name, JSON.stringify(value));
            }, 500);
          };
        })(),
        removeItem: (name) => localStorage.removeItem(name),
      },
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
            // Backfill isFamilyOfficeMode
            if ((state as any).isFamilyOfficeMode === undefined) (state as any).isFamilyOfficeMode = false;
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
            // Backwards compat: 20-year mode fields
            if (!(state as any).dealInflationState) {
              (state as any).dealInflationState = { crisisResetRoundsRemaining: 0 };
            }
            if ((state as any).ipoState === undefined) (state as any).ipoState = null;
            if ((state as any).familyOfficeState === undefined) (state as any).familyOfficeState = null;
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
