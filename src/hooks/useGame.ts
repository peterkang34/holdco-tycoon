import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  GameState,
  GamePhase,
  Business,
  Deal,
  DealStructure,
  SharedServiceType,
  GameAction,
  OperationalImprovementType,
  Metrics,
  MAFocus,
  SectorId,
  DealSizePreference,
  IntegrationOutcome,
  RoundHistoryEntry,
  MASourcingTier,
  MASourcingState,
} from '../engine/types';
import {
  createStartingBusiness,
  generateDealPipeline,
  resetBusinessIdCounter,
  generateBusinessId,
  determineIntegrationOutcome,
  calculateSynergies,
  getSubTypeAffinity,
  calculateMultipleExpansion,
  enhanceDealsWithAI,
  generateSourcedDeals,
  generateProactiveOutreachDeals,
  getMaxAcquisitions,
  generateDealWithSize,
  pickWeightedSector,
} from '../engine/businesses';
import { generateBuyerProfile } from '../engine/buyers';
import {
  generateEventNarrative,
  getFallbackEventNarrative,
  isAIEnabled,
  generateBusinessUpdate,
  generateYearChronicle,
} from '../services/aiGeneration';
import { formatMoney } from '../engine/types';
import { resetUsedNames } from '../data/names';
import { initializeSharedServices, MIN_OPCOS_FOR_SHARED_SERVICES, getMASourcingUpgradeCost, getMASourcingAnnualCost, MA_SOURCING_CONFIG } from '../data/sharedServices';
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
import { calculateFinalScore, generatePostGameInsights, calculateEnterpriseValue } from '../engine/scoring';
import { calculateDistressLevel, getDistressRestrictions } from '../engine/distress';
import { SECTORS } from '../data/sectors';

// Capital structure constants
const INITIAL_RAISE = 20000; // $20M raised from investors (in thousands)
const FOUNDER_OWNERSHIP = 0.80; // Founder keeps 80% after initial raise
const STARTING_SHARES = 1000; // Total shares outstanding
const FOUNDER_SHARES = 800; // Founder owns 800 of 1000 shares (80%)
const STARTING_INTEREST_RATE = 0.07;
const TOTAL_ROUNDS = 20;
const MIN_FOUNDER_OWNERSHIP = 0.51; // Must maintain majority control

interface GameStore extends GameState {
  // Computed
  metrics: Metrics;
  focusBonus: ReturnType<typeof calculateSectorFocusBonus>;

  // Actions
  startGame: (holdcoName: string, startingSector: SectorId) => void;
  resetGame: () => void;

  // Phase transitions
  advanceToEvent: () => void;
  advanceToAllocate: () => void;
  endRound: () => void;

  // Allocate phase actions
  acquireBusiness: (deal: Deal, structure: DealStructure) => void;
  acquireTuckIn: (deal: Deal, structure: DealStructure, targetPlatformId: string) => void;
  mergeBusinesses: (businessId1: string, businessId2: string, newName: string) => void;
  designatePlatform: (businessId: string) => void;
  improveBusiness: (businessId: string, improvementType: OperationalImprovementType) => void;
  unlockSharedService: (serviceType: SharedServiceType) => void;
  deactivateSharedService: (serviceType: SharedServiceType) => void;
  payDownDebt: (amount: number) => void;
  issueEquity: (amount: number) => void;
  buybackShares: (amount: number) => void;
  distributeToOwners: (amount: number) => void;
  sellBusiness: (businessId: string) => void;
  windDownBusiness: (businessId: string) => void;
  acceptOffer: () => void;
  declineOffer: () => void;
  grantEquityDemand: () => void;
  declineEquityDemand: () => void;
  acceptSellerNoteRenego: () => void;
  declineSellerNoteRenego: () => void;
  setMAFocus: (sectorId: SectorId | null, sizePreference: DealSizePreference, subType?: string | null) => void;

  // MA Sourcing
  upgradeMASourcing: () => void;
  toggleMASourcing: () => void;
  proactiveOutreach: () => void;

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

// One-time migration from v9 → v10 (adds maSourcing + maFocus.subType)
function migrateV9ToV10() {
  try {
    const v10Key = 'holdco-tycoon-save-v10';
    const v9Key = 'holdco-tycoon-save-v9';
    if (localStorage.getItem(v10Key)) return;
    const v9Raw = localStorage.getItem(v9Key);
    if (!v9Raw) return;
    const v9Data = JSON.parse(v9Raw);
    if (!v9Data?.state) return;
    if (!v9Data.state.maSourcing) {
      v9Data.state.maSourcing = { tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 };
    }
    if (v9Data.state.maFocus && v9Data.state.maFocus.subType === undefined) {
      v9Data.state.maFocus.subType = null;
    }
    localStorage.setItem(v10Key, JSON.stringify(v9Data));
    localStorage.removeItem(v9Key);
  } catch (e) {
    console.error('v9→v10 migration failed:', e);
  }
}
migrateV9ToV10();

// One-time migration from v10 → v11 (adds deal heat + acquisition limits)
function migrateV10ToV11() {
  try {
    const v11Key = 'holdco-tycoon-save-v12';
    const v10Key = 'holdco-tycoon-save-v10';
    if (localStorage.getItem(v11Key)) return;
    const v10Raw = localStorage.getItem(v10Key);
    if (!v10Raw) return;
    const v10Data = JSON.parse(v10Raw);
    if (!v10Data?.state) return;
    // Add deal heat fields to state
    v10Data.state.acquisitionsThisRound = 0;
    const tier = v10Data.state.maSourcing?.tier ?? 0;
    v10Data.state.maxAcquisitionsPerRound = tier >= 2 ? 4 : tier >= 1 ? 3 : 2;
    v10Data.state.lastAcquisitionResult = null;
    // Add heat + effectivePrice to existing pipeline deals
    if (Array.isArray(v10Data.state.dealPipeline)) {
      v10Data.state.dealPipeline = v10Data.state.dealPipeline.map((d: any) => ({
        ...d,
        heat: d.heat ?? 'warm',
        effectivePrice: d.effectivePrice ?? d.askingPrice,
      }));
    }
    localStorage.setItem(v11Key, JSON.stringify(v10Data));
    localStorage.removeItem(v10Key);
  } catch (e) {
    console.error('v10→v11 migration failed:', e);
  }
}
migrateV10ToV11();

// One-time migration from v11 → v12 (adds revenue/margin decomposition)
function migrateV11ToV12() {
  try {
    const v12Key = 'holdco-tycoon-save-v12';
    const v11Key = 'holdco-tycoon-save-v12';
    if (localStorage.getItem(v12Key)) return;
    const v11Raw = localStorage.getItem(v11Key);
    if (!v11Raw) return;
    const v11Data = JSON.parse(v11Raw);
    if (!v11Data?.state) return;

    // Helper: back-compute revenue/margin from EBITDA using sector midpoint margin
    const addRevenueMargin = (b: any) => {
      if (b.revenue !== undefined && b.revenue > 0) return b; // Already has fields
      const sectorDef = SECTORS[b.sectorId];
      if (!sectorDef) return b;
      const midMargin = (sectorDef.baseMargin[0] + sectorDef.baseMargin[1]) / 2;
      const midDrift = (sectorDef.marginDriftRange[0] + sectorDef.marginDriftRange[1]) / 2;
      return {
        ...b,
        ebitdaMargin: midMargin,
        revenue: Math.round(Math.abs(b.ebitda) / midMargin) || 1000,
        acquisitionRevenue: Math.round(Math.abs(b.acquisitionEbitda || b.ebitda) / midMargin) || 1000,
        acquisitionMargin: midMargin,
        peakRevenue: Math.round(Math.abs(b.peakEbitda || b.ebitda) / midMargin) || 1000,
        revenueGrowthRate: b.organicGrowthRate || 0.05,
        marginDriftRate: midDrift,
      };
    };

    // Migrate businesses
    if (Array.isArray(v11Data.state.businesses)) {
      v11Data.state.businesses = v11Data.state.businesses.map(addRevenueMargin);
    }
    if (Array.isArray(v11Data.state.exitedBusinesses)) {
      v11Data.state.exitedBusinesses = v11Data.state.exitedBusinesses.map(addRevenueMargin);
    }

    // Migrate pipeline deals
    if (Array.isArray(v11Data.state.dealPipeline)) {
      v11Data.state.dealPipeline = v11Data.state.dealPipeline.map((d: any) => ({
        ...d,
        business: addRevenueMargin(d.business),
      }));
    }

    localStorage.setItem(v12Key, JSON.stringify(v11Data));
    localStorage.removeItem(v11Key);
  } catch (e) {
    console.error('v11→v12 migration failed:', e);
  }
}
migrateV11ToV12();

// One-time migration from v12 → v13 (adds seller archetypes to pipeline deals)
function migrateV12ToV13() {
  try {
    const v13Key = 'holdco-tycoon-save-v13';
    const v12Key = 'holdco-tycoon-save-v12';
    if (localStorage.getItem(v13Key)) return;
    const v12Raw = localStorage.getItem(v12Key);
    if (!v12Raw) return;
    const v12Data = JSON.parse(v12Raw);
    if (!v12Data?.state) return;

    // Pipeline deals get sellerArchetype: undefined (backwards compatible)
    if (Array.isArray(v12Data.state.dealPipeline)) {
      v12Data.state.dealPipeline = v12Data.state.dealPipeline.map((d: any) => ({
        ...d,
        sellerArchetype: d.sellerArchetype ?? undefined,
      }));
    }

    localStorage.setItem(v13Key, JSON.stringify(v12Data));
    localStorage.removeItem(v12Key);
  } catch (e) {
    console.error('v12→v13 migration failed:', e);
  }
}
migrateV12ToV13();

const initialState: Omit<GameState, 'sharedServices'> & { sharedServices: ReturnType<typeof initializeSharedServices> } = {
  holdcoName: '',
  round: 0,
  phase: 'collect' as GamePhase,
  gameOver: false,
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
  sharedServices: initializeSharedServices(),
  dealPipeline: [],
  maFocus: { sectorId: null, sizePreference: 'any' as DealSizePreference, subType: null },
  maSourcing: { tier: 0 as MASourcingTier, active: false, unlockedRound: 0, lastUpgradeRound: 0 },
  currentEvent: null,
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
  maxAcquisitionsPerRound: 2,
  lastAcquisitionResult: null,
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      metrics: calculateMetrics(initialState as GameState),
      focusBonus: null,

      startGame: (holdcoName: string, startingSector: SectorId) => {
        resetBusinessIdCounter();
        resetUsedNames();

        const startingBusiness = createStartingBusiness(startingSector);
        const initialDealPipeline = generateDealPipeline([], 1);

        const newState: GameState = {
          ...initialState,
          holdcoName,
          round: 1,
          phase: 'collect',
          businesses: [startingBusiness],
          cash: INITIAL_RAISE - startingBusiness.acquisitionPrice, // Cash remaining after first acquisition
          totalInvestedCapital: startingBusiness.acquisitionPrice,
          founderShares: FOUNDER_SHARES,
          initialRaiseAmount: INITIAL_RAISE,
          initialOwnershipPct: FOUNDER_OWNERSHIP,
          sharedServices: initializeSharedServices(),
          dealPipeline: initialDealPipeline,
          maSourcing: { tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 },
        };

        set({
          ...newState,
          metrics: calculateMetrics(newState),
          focusBonus: calculateSectorFocusBonus(newState.businesses),
        });
      },

      resetGame: () => {
        resetBusinessIdCounter();
        resetUsedNames();
        set({
          ...initialState,
          sharedServices: initializeSharedServices(),
          metrics: calculateMetrics(initialState as GameState),
          focusBonus: null,
        });
      },

      advanceToEvent: () => {
        const state = get();
        const sharedBenefits = calculateSharedServicesBenefits(state as GameState);

        const sharedServicesCost = state.sharedServices
          .filter(s => s.active)
          .reduce((sum, s) => sum + s.annualCost, 0);

        // MA Sourcing annual cost (separate from shared services)
        const maSourcingCost = state.maSourcing.active
          ? getMASourcingAnnualCost(state.maSourcing.tier)
          : 0;

        // Apply distress interest penalty
        const currentMetrics = calculateMetrics(state as GameState);
        const distressRestrictions = getDistressRestrictions(currentMetrics.distressLevel);
        const effectiveRate = state.interestRate + distressRestrictions.interestPenalty;

        // Collect FCF when transitioning from collect to event phase (annual)
        // Portfolio tax (with interest/SS+MA deductions for tax shield) is computed inside
        const totalDeductibleCosts = sharedServicesCost + maSourcingCost;
        const annualFcf = calculatePortfolioFcf(
          state.businesses.filter(b => b.status === 'active'),
          sharedBenefits.capexReduction,
          sharedBenefits.cashConversionBonus,
          state.totalDebt,
          effectiveRate,
          totalDeductibleCosts
        );

        // Interest and shared services are still cash costs (separate from tax)
        const annualInterest = Math.round(state.totalDebt * effectiveRate);

        let newCash = state.cash + annualFcf - annualInterest - sharedServicesCost - maSourcingCost;

        // Pay opco-level debt (seller notes, earnouts, bank debt interest)
        // This aligns with the waterfall display — all deductions happen at collection time
        let opcoDebtAdjustment = 0;
        const updatedBusinesses = state.businesses.map(b => {
          if (b.status !== 'active') return b;
          let updated = { ...b };

          // Seller note: interest + principal
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
          // Final balance payment when rounds expire
          if (updated.sellerNoteRoundsRemaining <= 0 && updated.sellerNoteBalance > 0) {
            const availableForFinal = Math.max(0, newCash + opcoDebtAdjustment);
            const finalPayment = Math.min(updated.sellerNoteBalance, availableForFinal);
            opcoDebtAdjustment -= finalPayment;
            updated.sellerNoteBalance = updated.sellerNoteBalance - finalPayment;
          }

          // Earnout payments (conditional on growth targets)
          if (b.earnoutRemaining > 0 && b.earnoutTarget > 0) {
            const actualGrowth = b.acquisitionEbitda > 0
              ? (b.ebitda - b.acquisitionEbitda) / b.acquisitionEbitda
              : 0;
            if (actualGrowth >= b.earnoutTarget) {
              const availableForEarnout = Math.max(0, newCash + opcoDebtAdjustment);
              const earnoutPayment = Math.min(b.earnoutRemaining, availableForEarnout);
              opcoDebtAdjustment -= earnoutPayment;
              updated.earnoutRemaining = b.earnoutRemaining - earnoutPayment;
              if (updated.earnoutRemaining <= 0) {
                updated.earnoutTarget = 0;
              }
            }
          }

          // Bank debt interest (opco-level, uses base rate — distress penalty is holdco only)
          if (b.bankDebtBalance > 0) {
            const bankInterest = Math.round(b.bankDebtBalance * state.interestRate);
            const availableForBank = Math.max(0, newCash + opcoDebtAdjustment);
            const actualBankPayment = Math.min(bankInterest, availableForBank);
            opcoDebtAdjustment -= actualBankPayment;
          }

          return updated;
        });

        newCash = newCash + opcoDebtAdjustment;

        // Negative cash triggers restructuring
        let requiresRestructuring = state.requiresRestructuring;
        if (newCash < 0) {
          requiresRestructuring = true;
          newCash = 0; // Floor at 0
        }

        // Generate event
        const event = generateEvent(state as GameState);

        let gameState: GameState = {
          ...state,
          businesses: updatedBusinesses,
          cash: Math.round(newCash),
          currentEvent: event,
          requiresRestructuring,
          phase: requiresRestructuring ? 'restructure' as GamePhase : 'event' as GamePhase,
        };

        const hasChoices = event && (event.type === 'unsolicited_offer' || event.type === 'portfolio_equity_demand' || event.type === 'portfolio_seller_note_renego');
        if (event && !hasChoices && !requiresRestructuring) {
          gameState = applyEventEffects(gameState, event);
        }

        // Referral deal: inject a quality-3+ cold/warm deal into pipeline
        if (event && event.type === 'portfolio_referral_deal') {
          const referralSector = pickWeightedSector(state.round);
          const referralDeal = generateDealWithSize(referralSector, state.round, 'any', 0, {
            qualityFloor: 3 as any,
            source: 'sourced' as any,
          });
          gameState.dealPipeline = [...gameState.dealPipeline, referralDeal];
        }

        // Decrement tightening/inflation counters
        if (gameState.creditTighteningRoundsRemaining > 0) {
          gameState.creditTighteningRoundsRemaining--;
        }
        if (gameState.inflationRoundsRemaining > 0) {
          gameState.inflationRoundsRemaining--;
        }

        set({
          ...gameState,
          eventHistory: event ? [...state.eventHistory, event] : state.eventHistory,
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
          lastEvt
        );

        set({
          phase: 'allocate',
          dealPipeline: newPipeline,
          actionsThisRound: [],
          focusBonus,
          lastAcquisitionResult: null,
        });
      },

      endRound: () => {
        const state = get();
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
            sharedBenefits.marginDefense
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
        } else {
          newCovenantBreachRounds = 0;
        }

        // Check for forced restructuring from prolonged breach
        let requiresRestructuring = state.requiresRestructuring;
        let gameOverFromBankruptcy = false;
        let bankruptRound: number | undefined = state.bankruptRound;

        if (newCovenantBreachRounds >= 2) {
          if (state.hasRestructured) {
            // Already used restructuring — bankruptcy
            gameOverFromBankruptcy = true;
            bankruptRound = state.round;
          } else {
            requiresRestructuring = true;
          }
        }

        const newRound = state.round + 1;
        const gameOver = newRound > TOTAL_ROUNDS || gameOverFromBankruptcy;

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
          // Advance to collect phase — opco debt is now paid in advanceToEvent (aligned with waterfall)
          // Only holdco bank debt amortization happens at year-end
          let cashAdjustment = 0;
          let holdcoAmortizationAmount = 0;

          let newTotalDebt = state.totalDebt;
          const holdcoDebtStartRound = state.holdcoDebtStartRound;
          if (state.totalDebt > 0 && holdcoDebtStartRound > 0) {
            const yearsWithDebt = newRound - holdcoDebtStartRound;
            if (yearsWithDebt >= 2) {
              const scheduledPayment = Math.round(state.totalDebt * 0.10);
              const availableCash = Math.max(0, state.cash + cashAdjustment);
              const actualPayment = Math.min(scheduledPayment, availableCash);
              if (actualPayment > 0) {
                cashAdjustment -= actualPayment;
                newTotalDebt = state.totalDebt - actualPayment;
                holdcoAmortizationAmount = actualPayment;
              }
            }
          }

          const newCash = Math.max(0, state.cash + cashAdjustment);

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
            cash: newCash,
            totalDebt: newTotalDebt,
            cashBeforeDebtPayments: state.cash,
            debtPaymentThisRound: holdcoAmortizationAmount,
            holdcoAmortizationThisRound: holdcoAmortizationAmount,
            acquisitionsThisRound: 0,
            lastAcquisitionResult: null,
          });
        } else {
          // Game over — opco debt already settled in last advanceToEvent
          // Only process holdco amortization for accurate final state
          let gameOverCashAdj = 0;
          let gameOverDebt = state.totalDebt;
          if (state.totalDebt > 0 && state.holdcoDebtStartRound > 0) {
            const yearsWithDebt = newRound - state.holdcoDebtStartRound;
            if (yearsWithDebt >= 2) {
              const scheduledPayment = Math.round(state.totalDebt * 0.10);
              const availableCash = Math.max(0, state.cash + gameOverCashAdj);
              const actualPayment = Math.min(scheduledPayment, availableCash);
              if (actualPayment > 0) {
                gameOverCashAdj -= actualPayment;
                gameOverDebt = state.totalDebt - actualPayment;
              }
            }
          }

          const gameOverCash = Math.max(0, state.cash + gameOverCashAdj);
          const gameOverMetrics = calculateMetrics({ ...state, businesses: updatedBusinesses, cash: gameOverCash, totalDebt: gameOverDebt });

          set({
            businesses: updatedBusinesses,
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
            cash: gameOverCash,
            totalDebt: gameOverDebt,
            metrics: gameOverMetrics,
            focusBonus: calculateSectorFocusBonus(updatedBusinesses),
          });
        }
      },

      acquireBusiness: (deal: Deal, structure: DealStructure) => {
        const state = get();

        // Enforce distress restrictions — covenant breach blocks new acquisitions
        const restrictions = getDistressRestrictions(calculateMetrics(state).distressLevel);
        if (!restrictions.canAcquire) return;

        // Acquisition limit check
        if (state.acquisitionsThisRound >= state.maxAcquisitionsPerRound) return;

        if (state.cash < structure.cashRequired) return;

        // Contested deal snatch check — 40% chance another buyer outbids you
        if (deal.heat === 'contested' && Math.random() < 0.40) {
          set({
            dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
            acquisitionsThisRound: state.acquisitionsThisRound + 1,
            lastAcquisitionResult: 'snatched',
          });
          return;
        }

        const newBusiness = executeDealStructure(deal, structure, state.round);

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
        };

        // Add bank debt to holdco if applicable
        const newTotalDebt = state.totalDebt + (structure.bankDebt?.amount ?? 0);

        // Track when first holdco debt was taken
        const holdcoDebtStartRound = (structure.bankDebt?.amount ?? 0) > 0 && state.holdcoDebtStartRound === 0
          ? state.round
          : state.holdcoDebtStartRound;

        set({
          cash: state.cash - structure.cashRequired,
          totalDebt: newTotalDebt,
          holdcoDebtStartRound,
          totalInvestedCapital: state.totalInvestedCapital + deal.effectivePrice,
          businesses: [...state.businesses, businessWithPlatformFields],
          dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
          acquisitionsThisRound: state.acquisitionsThisRound + 1,
          lastAcquisitionResult: 'success',
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'acquire',
              round: state.round,
              details: { businessId: newBusiness.id, structure: structure.type, price: deal.effectivePrice, heat: deal.heat },
            },
          ],
          metrics: calculateMetrics({
            ...state,
            cash: state.cash - structure.cashRequired,
            totalDebt: newTotalDebt,
            businesses: [...state.businesses, businessWithPlatformFields],
          }),
        });
      },

      // Acquire a tuck-in and fold it into an existing platform
      acquireTuckIn: (deal: Deal, structure: DealStructure, targetPlatformId: string) => {
        const state = get();

        // Enforce distress restrictions — covenant breach blocks new acquisitions
        const restrictions = getDistressRestrictions(calculateMetrics(state).distressLevel);
        if (!restrictions.canAcquire) return;

        // Acquisition limit check
        if (state.acquisitionsThisRound >= state.maxAcquisitionsPerRound) return;

        if (state.cash < structure.cashRequired) return;

        // Contested deal snatch check — 40% chance another buyer outbids you
        if (deal.heat === 'contested' && Math.random() < 0.40) {
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

        // Determine integration outcome
        const outcome = determineIntegrationOutcome(deal.business, platform, hasSharedServices, subTypeAffinity);
        const synergies = calculateSynergies(outcome, deal.business.ebitda, true, subTypeAffinity);

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
          bankDebtBalance: 0,
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
              ebitdaMargin: Math.max(0.03, Math.min(0.80, blendedMargin)),
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

        // Add bank debt to holdco if applicable
        const newTotalDebt = state.totalDebt + (structure.bankDebt?.amount ?? 0);

        // Track when first holdco debt was taken
        const holdcoDebtStartRound = (structure.bankDebt?.amount ?? 0) > 0 && state.holdcoDebtStartRound === 0
          ? state.round
          : state.holdcoDebtStartRound;

        const tuckInCash = Math.max(0, state.cash - structure.cashRequired - restructuringCost);

        set({
          cash: tuckInCash,
          totalDebt: newTotalDebt,
          holdcoDebtStartRound,
          totalInvestedCapital: state.totalInvestedCapital + deal.effectivePrice + restructuringCost,
          businesses: [...updatedBusinesses, boltOnBusiness],
          dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
          acquisitionsThisRound: state.acquisitionsThisRound + 1,
          lastAcquisitionResult: 'success',
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'acquire_tuck_in',
              round: state.round,
              details: {
                businessId: boltOnId,
                platformId: targetPlatformId,
                structure: structure.type,
                price: deal.effectivePrice,
                integrationOutcome: outcome,
                synergies,
                restructuringCost,
                growthDragPenalty,
                heat: deal.heat,
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

        if (!biz1 || !biz2) return;

        // Must be same sector
        if (biz1.sectorId !== biz2.sectorId) return;

        // Merge cost (restructuring, legal, integration) — 15% of smaller business (abs to prevent negative costs)
        const mergeCost = Math.max(100, Math.round(Math.min(Math.abs(biz1.ebitda), Math.abs(biz2.ebitda)) * 0.15));
        if (state.cash < mergeCost) return;

        // Check if shared services help
        const hasSharedServices = state.sharedServices.filter(s => s.active).length > 0;

        // Check sub-type compatibility (graduated affinity)
        const subTypeAffinity = getSubTypeAffinity(biz1.sectorId, biz1.subType, biz2.subType);

        // Integration outcome for merger
        const outcome = determineIntegrationOutcome(biz2, biz1, hasSharedServices, subTypeAffinity);
        const synergies = calculateSynergies(outcome, biz1.ebitda + biz2.ebitda, false, subTypeAffinity);

        // Failed integration: restructuring cost + growth drag
        const mergeRestructuringCost = outcome === 'failure' ? Math.round(Math.min(Math.abs(biz1.ebitda), Math.abs(biz2.ebitda)) * 0.07) : 0;
        const mergeGrowthDrag = outcome === 'failure' ? -0.010 : 0;

        // Combined entity
        const combinedEbitda = biz1.ebitda + biz2.ebitda + synergies;
        const combinedRevenue = biz1.revenue + biz2.revenue;
        const mergedMargin = combinedRevenue > 0
          ? combinedEbitda / combinedRevenue
          : (biz1.ebitdaMargin + biz2.ebitdaMargin) / 2;
        const totalMergeCost = mergeCost + mergeRestructuringCost;
        const combinedTotalCost = biz1.totalAcquisitionCost + biz2.totalAcquisitionCost + totalMergeCost;
        const newPlatformScale = Math.max(biz1.platformScale, biz2.platformScale) + 1;
        const prevScale = Math.max(biz1.platformScale, biz2.platformScale);
        const prevEbitda = Math.max(biz1.ebitda, biz2.ebitda);
        const multipleExpansion = calculateMultipleExpansion(newPlatformScale, combinedEbitda)
          - calculateMultipleExpansion(prevScale, prevEbitda);

        if (state.cash < totalMergeCost) return;

        // Use higher quality rating
        const bestQuality = Math.max(biz1.qualityRating, biz2.qualityRating) as 1 | 2 | 3 | 4 | 5;

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
          acquisitionRound: Math.min(biz1.acquisitionRound, biz2.acquisitionRound),
          acquisitionMultiple: ((biz1.acquisitionMultiple + biz2.acquisitionMultiple) / 2) + multipleExpansion,
          organicGrowthRate: (biz1.organicGrowthRate + biz2.organicGrowthRate) / 2 + 0.01 + mergeGrowthDrag,
          revenue: combinedRevenue,
          ebitdaMargin: Math.max(0.03, Math.min(0.80, mergedMargin)),
          acquisitionRevenue: biz1.acquisitionRevenue + biz2.acquisitionRevenue,
          acquisitionMargin: (biz1.acquisitionRevenue + biz2.acquisitionRevenue) > 0
            ? (biz1.acquisitionEbitda + biz2.acquisitionEbitda) / (biz1.acquisitionRevenue + biz2.acquisitionRevenue)
            : mergedMargin,
          peakRevenue: combinedRevenue,
          revenueGrowthRate: (biz1.revenueGrowthRate + biz2.revenueGrowthRate) / 2 + 0.01 + mergeGrowthDrag,
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
          bankDebtBalance: 0, // Bank debt tracked at holdco level, not opco
          earnoutRemaining: biz1.earnoutRemaining + biz2.earnoutRemaining,
          earnoutTarget: Math.max(biz1.earnoutTarget, biz2.earnoutTarget),
          status: 'active',
          isPlatform: true,
          platformScale: newPlatformScale,
          boltOnIds: [...biz1.boltOnIds, ...biz2.boltOnIds],
          integrationOutcome: outcome,
          synergiesRealized: (biz1.synergiesRealized || 0) + (biz2.synergiesRealized || 0) + synergies,
          totalAcquisitionCost: combinedTotalCost,
        };

        // Remove old businesses, add merged one, and update bolt-on parent references
        const allBoltOnIds = new Set([...biz1.boltOnIds, ...biz2.boltOnIds]);
        const updatedBusinesses = state.businesses
          .filter(b => b.id !== businessId1 && b.id !== businessId2)
          .map(b => allBoltOnIds.has(b.id) ? { ...b, parentPlatformId: mergedBusiness.id } : b);

        set({
          cash: state.cash - totalMergeCost,
          totalInvestedCapital: state.totalInvestedCapital + totalMergeCost,
          businesses: [...updatedBusinesses, mergedBusiness],
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
              },
            },
          ],
          metrics: calculateMetrics({
            ...state,
            cash: state.cash - totalMergeCost,
            businesses: [...updatedBusinesses, mergedBusiness],
          }),
        });
      },

      // Designate an existing business as a platform
      designatePlatform: (businessId: string) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId && b.status === 'active');
        if (!business) return;

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
        if (!business || business.status !== 'active') return;

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
          case 'service_expansion':
            cost = Math.round(absEbitda * 0.20);
            revenueBoost = 0.08 + Math.random() * 0.04; // +8-12% revenue
            marginBoost = -0.01; // -1 ppt margin initially (cost of expansion)
            break;
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

        if (state.cash < cost) return;

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id !== businessId) return b;
          const newRevenue = Math.round(b.revenue * (1 + revenueBoost));
          const newMargin = Math.max(0.03, Math.min(0.80, b.ebitdaMargin + marginBoost));
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

        const activeCount = state.sharedServices.filter(s => s.active).length;
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
        const actualPayment = Math.min(amount, state.totalDebt, state.cash);
        if (actualPayment <= 0) return;

        const payDebtState = {
          ...state,
          cash: state.cash - actualPayment,
          totalDebt: state.totalDebt - actualPayment,
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

      issueEquity: (amount: number) => {
        const state = get();
        if (amount <= 0) return;

        // Dilution is the natural consequence — no artificial caps on raises

        const metrics = calculateMetrics(state);
        // M-5: Guard against division by zero or negative intrinsic value
        if (metrics.intrinsicValuePerShare <= 0) return;
        const newShares = Math.round((amount / metrics.intrinsicValuePerShare) * 1000) / 1000;

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
        };
        set({
          ...issueState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'issue_equity', round: state.round, details: { amount, newShares, newOwnership: newFounderOwnership } },
          ],
          metrics: calculateMetrics(issueState),
        });
      },

      buybackShares: (amount: number) => {
        const state = get();
        if (state.cash < amount) return;

        const metrics = calculateMetrics(state);
        // Enforce distress restrictions — covenant breach blocks buybacks
        const restrictions = getDistressRestrictions(metrics.distressLevel);
        if (!restrictions.canBuyback) return;
        // M-5: Guard against division by zero or negative intrinsic value
        if (metrics.intrinsicValuePerShare <= 0) return;
        const sharesRepurchased = Math.round((amount / metrics.intrinsicValuePerShare) * 1000) / 1000;

        // Can only buy back non-founder shares (outside investors' shares)
        const outsideShares = state.sharesOutstanding - state.founderShares;
        if (sharesRepurchased > outsideShares) return; // Can't buy more than outside investors own

        const newTotalShares = state.sharesOutstanding - sharesRepurchased;
        const newFounderOwnership = state.founderShares / newTotalShares;

        const buybackState = {
          ...state,
          cash: state.cash - amount,
          sharesOutstanding: newTotalShares,
          totalBuybacks: state.totalBuybacks + amount,
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

        const distributeState = {
          ...state,
          cash: state.cash - amount,
          totalDistributions: state.totalDistributions + amount,
        };
        set({
          ...distributeState,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'distribute', round: state.round, details: { amount } },
          ],
          metrics: calculateMetrics(distributeState),
        });
      },

      sellBusiness: (businessId: string) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') return;

        // L-1: Use shared calculateExitValuation instead of duplicated logic
        const lastEvent = state.eventHistory[state.eventHistory.length - 1];
        const valuation = calculateExitValuation(business, state.round, lastEvent?.type);

        // Generate buyer profile for the sale
        const buyerProfile = generateBuyerProfile(business, valuation.buyerPoolTier, business.sectorId);

        // If strategic buyer, add their premium
        let effectiveMultiple = valuation.totalMultiple;
        if (buyerProfile.isStrategic) {
          effectiveMultiple += buyerProfile.strategicPremium;
        }

        // Add small random variance for actual sale (market conditions variation)
        const marketVariance = lastEvent?.type === 'global_bull_market' ? Math.random() * 0.3
          : lastEvent?.type === 'global_recession' ? -(Math.random() * 0.3)
          : (Math.random() * 0.2 - 0.1);
        const exitPrice = Math.max(0, Math.round(business.ebitda * Math.max(2.0, effectiveMultiple + marketVariance)));
        // Also mark bolt-ons as sold when selling a platform
        const boltOnIds = new Set(business.boltOnIds || []);

        // Include bolt-on seller note debt in total debt payoff
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance, 0);
        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + boltOnDebt;
        const netProceeds = Math.max(0, exitPrice - debtPayoff);

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id === businessId) return { ...b, status: 'sold' as const, exitPrice, exitRound: state.round };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round };
          return b;
        });

        // M-7: Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Collect bolt-on businesses for exitedBusinesses
        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round }));

        const sellState = {
          ...state,
          cash: state.cash + netProceeds,
          totalExitProceeds: state.totalExitProceeds + netProceeds,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
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
              details: { businessId, exitPrice, netProceeds, buyerName: buyerProfile.name, buyerType: buyerProfile.type },
            },
          ],
          metrics: calculateMetrics(sellState),
        });
      },

      windDownBusiness: (businessId: string) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') return;

        const windDownCost = 250; // $250k
        const debtWriteOff = business.sellerNoteBalance; // L-13: Only seller note on opco

        // Also mark bolt-ons as wound down when winding down a platform
        const boltOnIds = new Set(business.boltOnIds || []);
        const boltOnDebtWriteOff = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance, 0);

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id === businessId) return { ...b, status: 'wound_down' as const, exitRound: state.round };
          if (boltOnIds.has(b.id)) return { ...b, status: 'wound_down' as const, exitRound: state.round };
          return b;
        });

        // C-3: Floor cash at 0
        const newCash = Math.max(0, state.cash - windDownCost - debtWriteOff - boltOnDebtWriteOff);

        // M-7: Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Collect bolt-on businesses for exitedBusinesses
        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'wound_down' as const, exitRound: state.round }));

        const windDownState = {
          ...state,
          cash: newCash,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
        };
        set({
          ...windDownState,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'wound_down' as const, exitRound: state.round },
            ...exitedBoltOns,
          ],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'wind_down', round: state.round, details: { businessId, cost: windDownCost + debtWriteOff } },
          ],
          metrics: calculateMetrics(windDownState),
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

        // Include bolt-on seller note debt in total debt payoff
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance, 0);
        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + boltOnDebt;
        const netProceeds = Math.max(0, event.offerAmount - debtPayoff);
        const updatedBusinesses = state.businesses.map(b => {
          if (b.id === event.affectedBusinessId) return { ...b, status: 'sold' as const, exitPrice: event.offerAmount, exitRound: state.round };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round };
          return b;
        });

        // Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Collect bolt-on businesses for exitedBusinesses
        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round }));

        const acceptState = {
          ...state,
          cash: state.cash + netProceeds,
          totalExitProceeds: state.totalExitProceeds + netProceeds,
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
            const newMargin = Math.max(0.03, Math.min(0.80, b.ebitdaMargin + 0.01));
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
        if (Math.random() < 0.60 && event.affectedBusinessId) {
          declineState.businesses = state.businesses.map(b => {
            if (b.id !== event.affectedBusinessId) return b;
            const newRevenue = Math.round(b.revenue * 0.94);
            const newMargin = Math.max(0.03, b.ebitdaMargin - 0.02);
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

      // Restructuring actions
      distressedSale: (businessId: string) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') return;

        // Fire sale at 70% of normal exit valuation
        const lastEvent = state.eventHistory[state.eventHistory.length - 1];
        const valuation = calculateExitValuation(business, state.round, lastEvent?.type);
        const exitPrice = Math.round(valuation.exitPrice * 0.70);

        // Cascade to bolt-on businesses
        const boltOnIds = new Set(business.boltOnIds || []);

        // Include bolt-on seller note debt in total debt payoff
        const boltOnDebt = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .reduce((sum, b) => sum + b.sellerNoteBalance, 0);
        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance + boltOnDebt;
        const netProceeds = Math.max(0, exitPrice - debtPayoff);
        const updatedBusinesses = state.businesses.map(b => {
          if (b.id === businessId) return { ...b, status: 'sold' as const, exitPrice, exitRound: state.round };
          if (boltOnIds.has(b.id)) return { ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round };
          return b;
        });

        // Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        // Collect bolt-on businesses for exitedBusinesses
        const exitedBoltOns = state.businesses
          .filter(b => boltOnIds.has(b.id))
          .map(b => ({ ...b, status: 'sold' as const, exitPrice: 0, exitRound: state.round }));

        const distressState = {
          ...state,
          cash: state.cash + netProceeds,
          totalExitProceeds: state.totalExitProceeds + netProceeds,
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

        // Emergency: shares issued at 50% of intrinsic value (2x dilution)
        const emergencyPrice = metrics.intrinsicValuePerShare * 0.5;
        const newShares = Math.round((amount / emergencyPrice) * 1000) / 1000;

        // No 51% ownership floor during emergency
        const emergencyState = {
          ...state,
          cash: state.cash + amount,
          sharesOutstanding: state.sharesOutstanding + newShares,
          equityRaisesUsed: state.equityRaisesUsed + 1,
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
        const state = get();
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

        const newDeals = generateSourcedDeals(
          state.round,
          state.maFocus,
          focusBonus?.focusGroup,
          totalPortfolioEbitda,
          state.maSourcing.active ? state.maSourcing.tier : 0
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

        const newDeals = generateProactiveOutreachDeals(
          state.round,
          state.maFocus,
          totalPortfolioEbitda
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

          if (narrative) {
            set({
              currentEvent: { ...event, narrative },
            });
          } else {
            // Use fallback
            const fallbackNarrative = getFallbackEventNarrative(event.type);
            set({
              currentEvent: { ...event, narrative: fallbackNarrative },
            });
          }
        } catch (error) {
          console.error('Failed to fetch event narrative:', error);
          // Use fallback on error
          const fallbackNarrative = getFallbackEventNarrative(event.type);
          set({
            currentEvent: { ...event, narrative: fallbackNarrative },
          });
        }
      },

      // Year chronicle (set when advancing to collect for a new year)
      yearChronicle: null,

      generateBusinessStories: async () => {
        const state = get();
        const activeBusinesses = state.businesses.filter(b => b.status === 'active');

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

            if (narrative) {
              const newBeat = {
                round: state.round,
                narrative,
                type: hasRecentImprovement ? 'milestone' as const : 'update' as const,
              };
              return {
                ...b,
                storyBeats: [...(b.storyBeats || []), newBeat].slice(-5), // Keep last 5 beats
              };
            }

            return b;
          })
        );

        set({ businesses: updatedBusinesses });
      },

      generateYearChronicle: async () => {
        const state = get();
        const activeBusinesses = state.businesses.filter(b => b.status === 'active');
        const metrics = calculateMetrics(state);

        // Build detailed actions summary
        const actionsThisRound = state.actionsThisRound;
        const actionParts: string[] = [];

        const acquisitions = actionsThisRound.filter(a => a.type === 'acquire' || a.type === 'acquire_tuck_in');
        const sales = actionsThisRound.filter(a => a.type === 'sell');
        const improvements = actionsThisRound.filter(a => a.type === 'improve');
        const debtPaydowns = actionsThisRound.filter(a => a.type === 'pay_debt');
        const equityRaises = actionsThisRound.filter(a => a.type === 'issue_equity');
        const distributions = actionsThisRound.filter(a => a.type === 'distribute');
        const buybacks = actionsThisRound.filter(a => a.type === 'buyback');

        // Build detailed acquisition info
        const merges = actionsThisRound.filter(a => a.type === 'merge_businesses');
        const platformDesignations = actionsThisRound.filter(a => a.type === 'designate_platform');
        const sharedServiceUnlocks = actionsThisRound.filter(a => a.type === 'unlock_shared_service');
        const maSourcingUpgrades = actionsThisRound.filter(a => a.type === 'upgrade_ma_sourcing');

        if (acquisitions.length > 0) {
          const acqDetails = acquisitions.map(a => {
            const name = (a.details?.businessName as string) || 'a business';
            const sector = (a.details?.sector as string) || '';
            const isTuckIn = a.type === 'acquire_tuck_in';
            return isTuckIn ? `${name} (tuck-in, ${sector})` : `${name} (${sector})`;
          });
          const totalSpent = acquisitions.reduce((sum, a) => sum + ((a.details?.cost as number) || (a.details?.askingPrice as number) || 0), 0);
          actionParts.push(`Acquired ${acqDetails.join(', ')}${totalSpent > 0 ? ` for ${formatMoney(totalSpent)} total` : ''}`);
        }
        if (merges.length > 0) {
          actionParts.push(`Merged ${merges.length} business pair${merges.length > 1 ? 's' : ''} to create scale`);
        }
        if (platformDesignations.length > 0) {
          const names = platformDesignations.map(a => (a.details?.businessName as string) || 'a business');
          actionParts.push(`Designated ${names.join(', ')} as platform${names.length > 1 ? 's' : ''}`);
        }
        if (sales.length > 0) {
          const saleDetails = sales.map(a => {
            const name = (a.details?.businessName as string) || 'a business';
            const moic = a.details?.moic as number | undefined;
            return moic ? `${name} (${moic.toFixed(1)}x MOIC)` : name;
          });
          actionParts.push(`Sold ${saleDetails.join(', ')}`);
        }
        if (improvements.length > 0) {
          const improvTypes = improvements.map(a => (a.details?.improvementType as string) || 'operational').filter((v, i, a) => a.indexOf(v) === i);
          actionParts.push(`Made ${improvements.length} improvement${improvements.length > 1 ? 's' : ''} (${improvTypes.join(', ')})`);
        }
        if (sharedServiceUnlocks.length > 0) {
          actionParts.push('Invested in shared services infrastructure');
        }
        if (maSourcingUpgrades.length > 0) {
          actionParts.push('Upgraded M&A sourcing capabilities');
        }
        if (debtPaydowns.length > 0) {
          const totalPaid = debtPaydowns.reduce((sum, a) => sum + ((a.details?.amount as number) || 0), 0);
          if (totalPaid > 0) actionParts.push(`Paid down ${formatMoney(totalPaid)} in debt`);
        }
        if (equityRaises.length > 0) {
          actionParts.push('Raised equity capital');
        }
        if (distributions.length > 0) {
          const totalDist = distributions.reduce((sum, a) => sum + ((a.details?.amount as number) || 0), 0);
          actionParts.push(`Distributed ${totalDist > 0 ? formatMoney(totalDist) : 'cash'} to owners`);
        }
        if (buybacks.length > 0) {
          actionParts.push('Bought back shares');
        }

        const actionsSummary = actionParts.length > 0
          ? actionParts.join('. ') + '.'
          : 'Focused on organic growth and portfolio management.';

        // Get market conditions from last event
        const lastEvent = state.eventHistory[state.eventHistory.length - 1];
        let marketConditions = 'Normal market conditions';
        if (lastEvent) {
          if (lastEvent.type === 'global_recession') marketConditions = 'Recessionary environment';
          else if (lastEvent.type === 'global_bull_market') marketConditions = 'Bull market conditions';
          else if (lastEvent.type === 'global_inflation') marketConditions = 'Inflationary pressures';
          else if (lastEvent.type === 'global_credit_tightening') marketConditions = 'Tight credit markets';
          else if (lastEvent.type === 'global_interest_hike') marketConditions = 'Rising interest rates';
          else if (lastEvent.type === 'global_interest_cut') marketConditions = 'Falling interest rates';
        }

        // Calculate financial health signals
        const totalDebt = metrics.totalDebt;
        const interestExpense = Math.round(totalDebt * metrics.interestRate);
        const fcf = metrics.totalFcf;

        // Calculate organic EBITDA growth rate
        const prevMetrics = state.metricsHistory.length > 0
          ? state.metricsHistory[state.metricsHistory.length - 1]
          : null;
        const prevTotalEbitda = prevMetrics ? formatMoney(prevMetrics.metrics.totalEbitda) : undefined;
        const ebitdaGrowthPct = prevMetrics && prevMetrics.metrics.totalEbitda > 0
          ? Math.round(((metrics.totalEbitda - prevMetrics.metrics.totalEbitda) / prevMetrics.metrics.totalEbitda) * 100)
          : null;

        // Portfolio composition
        const platforms = activeBusinesses.filter(b => b.isPlatform);
        const totalBoltOns = platforms.reduce((sum, p) => sum + (p.boltOnIds?.length || 0), 0);
        const avgQuality = activeBusinesses.length > 0
          ? (activeBusinesses.reduce((sum, b) => sum + b.qualityRating, 0) / activeBusinesses.length).toFixed(1)
          : '0';
        const sectors = [...new Set(activeBusinesses.map(b => SECTORS[b.sectorId]?.name || b.sectorId))];
        const activeSharedServices = state.sharedServices.filter(s => s.active).map(s => s.name);

        // Build concerns and positives — balanced across financial, operational, strategic
        const concerns: string[] = [];
        const positives: string[] = [];

        // Financial concerns
        if (fcf < 0) concerns.push(`Negative free cash flow of ${formatMoney(fcf)}`);
        if (metrics.netDebtToEbitda > 3) concerns.push(`High leverage at ${metrics.netDebtToEbitda.toFixed(1)}x net debt/EBITDA`);
        if (interestExpense > metrics.totalEbitda * 0.3) concerns.push(`Interest consuming ${Math.round(interestExpense / metrics.totalEbitda * 100)}% of EBITDA`);

        // Operational concerns
        const lowQualityBiz = activeBusinesses.filter(b => b.qualityRating <= 2);
        if (lowQualityBiz.length > 0) concerns.push(`${lowQualityBiz.length} business${lowQualityBiz.length > 1 ? 'es' : ''} rated quality 2 or below`);
        if (ebitdaGrowthPct !== null && ebitdaGrowthPct < -5) concerns.push(`Portfolio EBITDA declined ${Math.abs(ebitdaGrowthPct)}% year-over-year`);

        // Margin concerns
        const marginCompressingBiz = activeBusinesses.filter(b => b.ebitdaMargin < b.acquisitionMargin - 0.03);
        if (marginCompressingBiz.length > 0) concerns.push(`${marginCompressingBiz.length} business${marginCompressingBiz.length > 1 ? 'es' : ''} with significant margin compression`);

        // Financial positives
        if (fcf > 0 && metrics.totalEbitda > 0) positives.push(`Generating ${formatMoney(fcf)} in free cash flow`);
        if (metrics.netDebtToEbitda < 1 && metrics.netDebtToEbitda >= 0) positives.push('Conservative balance sheet');
        if (metrics.portfolioRoic > 0.15) positives.push(`Strong ${Math.round(metrics.portfolioRoic * 100)}% ROIC`);

        // Operational/strategic positives
        if (ebitdaGrowthPct !== null && ebitdaGrowthPct > 10) positives.push(`Portfolio EBITDA grew ${ebitdaGrowthPct}% year-over-year`);
        if (platforms.length > 0 && totalBoltOns > 0) positives.push(`Roll-up strategy progressing: ${platforms.length} platform${platforms.length > 1 ? 's' : ''} with ${totalBoltOns} bolt-on${totalBoltOns > 1 ? 's' : ''}`);
        if (parseFloat(avgQuality) >= 4.0) positives.push(`High portfolio quality (avg ${avgQuality}/5)`);
        if (sectors.length >= 4) positives.push(`Well-diversified across ${sectors.length} sectors`);

        // Margin expansion positive
        const marginExpandingBiz = activeBusinesses.filter(b => b.ebitdaMargin > b.acquisitionMargin + 0.03);
        if (marginExpandingBiz.length > 0) positives.push(`${marginExpandingBiz.length} business${marginExpandingBiz.length > 1 ? 'es' : ''} with meaningful margin expansion`);

        try {
          const chronicle = await generateYearChronicle({
            holdcoName: state.holdcoName,
            year: state.round,
            totalEbitda: formatMoney(metrics.totalEbitda),
            prevTotalEbitda,
            ebitdaGrowth: ebitdaGrowthPct !== null ? `${ebitdaGrowthPct > 0 ? '+' : ''}${ebitdaGrowthPct}%` : undefined,
            cash: formatMoney(state.cash),
            portfolioCount: activeBusinesses.length,
            leverage: metrics.netDebtToEbitda < 0 ? 'Net cash position' : `${metrics.netDebtToEbitda.toFixed(1)}x`,
            totalDebt: formatMoney(totalDebt),
            fcf: formatMoney(fcf),
            interestExpense: formatMoney(interestExpense),
            actions: actionsSummary,
            marketConditions,
            concerns: concerns.length > 0 ? concerns.join('; ') : undefined,
            positives: positives.length > 0 ? positives.join('; ') : undefined,
            // Strategic context
            platformCount: platforms.length,
            totalBoltOns,
            avgQuality,
            sectors: sectors.join(', '),
            sharedServices: activeSharedServices.length > 0 ? activeSharedServices.join(', ') : undefined,
            fcfPerShare: formatMoney(metrics.fcfPerShare),
            enterpriseValue: formatMoney(calculateEnterpriseValue(state)),
            // Revenue/margin context
            totalRevenue: formatMoney(metrics.totalRevenue),
            avgMargin: `${(metrics.avgEbitdaMargin * 100).toFixed(0)}%`,
            revenueGrowth: prevMetrics && prevMetrics.metrics.totalRevenue > 0
              ? `${Math.round(((metrics.totalRevenue - prevMetrics.metrics.totalRevenue) / prevMetrics.metrics.totalRevenue) * 100)}%`
              : undefined,
            marginChange: prevMetrics
              ? `${((metrics.avgEbitdaMargin - prevMetrics.metrics.avgEbitdaMargin) * 100) >= 0 ? '+' : ''}${((metrics.avgEbitdaMargin - prevMetrics.metrics.avgEbitdaMargin) * 100).toFixed(1)} ppt`
              : undefined,
          });

          set({ yearChronicle: chronicle });
        } catch (error) {
          console.error('Failed to generate year chronicle:', error);
          set({
            yearChronicle: `Year ${state.round} saw ${state.holdcoName} continue to build its portfolio. ${actionsSummary}`,
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
      name: 'holdco-tycoon-save-v13', // v13: 3 new sectors, seller archetypes, 3 new improvements, 24 new events
      partialize: (state) => ({
        holdcoName: state.holdcoName,
        round: state.round,
        phase: state.phase,
        gameOver: state.gameOver,
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
        sharedServices: state.sharedServices,
        dealPipeline: state.dealPipeline,
        maFocus: state.maFocus,
        maSourcing: state.maSourcing,
        currentEvent: state.currentEvent, // L-2: Persist current event across page refreshes
        eventHistory: state.eventHistory,
        creditTighteningRoundsRemaining: state.creditTighteningRoundsRemaining,
        inflationRoundsRemaining: state.inflationRoundsRemaining,
        metricsHistory: state.metricsHistory,
        roundHistory: state.roundHistory,
        actionsThisRound: state.actionsThisRound, // M-14: Persist actions for acquisition limit tracking
        debtPaymentThisRound: state.debtPaymentThisRound,
        cashBeforeDebtPayments: state.cashBeforeDebtPayments,
        holdcoDebtStartRound: state.holdcoDebtStartRound,
        holdcoAmortizationThisRound: state.holdcoAmortizationThisRound,
        requiresRestructuring: state.requiresRestructuring,
        covenantBreachRounds: state.covenantBreachRounds,
        hasRestructured: state.hasRestructured,
        bankruptRound: state.bankruptRound,
        acquisitionsThisRound: state.acquisitionsThisRound,
        maxAcquisitionsPerRound: state.maxAcquisitionsPerRound,
        lastAcquisitionResult: state.lastAcquisitionResult,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.holdcoName) {
          try {
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
