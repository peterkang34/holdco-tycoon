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
} from '../engine/types';
import {
  createStartingBusiness,
  generateDealPipeline,
  resetBusinessIdCounter,
  generateBusinessId,
  determineIntegrationOutcome,
  calculateSynergies,
  calculateMultipleExpansion,
  enhanceDealsWithAI,
  generateSourcedDeals,
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
import { initializeSharedServices, MIN_OPCOS_FOR_SHARED_SERVICES } from '../data/sharedServices';
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
  advanceToCollect: () => void;
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
  setMAFocus: (sectorId: SectorId | null, sizePreference: DealSizePreference) => void;

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

const DEAL_SOURCING_COST = 500; // $500k to hire investment banker for additional deal flow

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
  maFocus: { sectorId: null, sizePreference: 'any' as DealSizePreference },
  currentEvent: null,
  eventHistory: [],
  creditTighteningRoundsRemaining: 0,
  inflationRoundsRemaining: 0,
  metricsHistory: [],
  actionsThisRound: [],
  debtPaymentThisRound: 0,
  cashBeforeDebtPayments: 0,
  holdcoDebtStartRound: 0,
  requiresRestructuring: false,
  covenantBreachRounds: 0,
  hasRestructured: false,
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

      advanceToCollect: () => {
        const state = get();
        let cashAdjustment = 0;
        let holdcoAmortizationAmount = 0;

        // Process opco-level debt payments and earnouts
        const updatedBusinesses = state.businesses.map(b => {
          if (b.status !== 'active') return b;

          let updated = { ...b };

          // H-6: Seller note interest payment + principal amortization
          if (b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining > 0) {
            const interest = Math.round(b.sellerNoteBalance * b.sellerNoteRate);
            const principal = Math.round(b.sellerNoteBalance / b.sellerNoteRoundsRemaining);
            cashAdjustment -= (interest + principal); // Deduct both from holdco cash
            updated.sellerNoteBalance = Math.max(0, b.sellerNoteBalance - principal);
            updated.sellerNoteRoundsRemaining = b.sellerNoteRoundsRemaining - 1;
          }
          // Clean up residual balances when term is done
          if (updated.sellerNoteRoundsRemaining <= 0 && updated.sellerNoteBalance > 0) {
            cashAdjustment -= updated.sellerNoteBalance;
            updated.sellerNoteBalance = 0;
          }

          // L-12: Evaluate earnout - if EBITDA grew enough, pay the earnout
          if (b.earnoutRemaining > 0 && b.earnoutTarget > 0) {
            const actualGrowth = b.acquisitionEbitda > 0
              ? (b.ebitda - b.acquisitionEbitda) / b.acquisitionEbitda
              : 0;
            if (actualGrowth >= b.earnoutTarget) {
              // Target met - pay earnout
              cashAdjustment -= b.earnoutRemaining;
              updated.earnoutRemaining = 0;
              updated.earnoutTarget = 0;
            }
          }

          return updated;
        });

        // Holdco bank debt amortization (mandatory after grace period)
        let newTotalDebt = state.totalDebt;
        if (state.totalDebt > 0 && state.holdcoDebtStartRound > 0) {
          const yearsWithDebt = state.round - state.holdcoDebtStartRound;
          if (yearsWithDebt >= 2) {
            // After 2-year grace period: mandatory 10% principal payment
            const scheduledPayment = Math.round(state.totalDebt * 0.10);
            // Pay what we can — partial payment if cash is insufficient
            const availableCash = state.cash + cashAdjustment; // cash after opco payments
            const actualPayment = Math.min(scheduledPayment, Math.max(0, availableCash));
            if (actualPayment > 0) {
              cashAdjustment -= actualPayment;
              newTotalDebt = state.totalDebt - actualPayment;
              holdcoAmortizationAmount = actualPayment;
            }
          }
        }

        // C-3: Floor cash at 0 after debt payments
        const newCash = Math.max(0, state.cash + cashAdjustment);

        set({
          businesses: updatedBusinesses,
          cash: newCash,
          totalDebt: newTotalDebt,
          phase: 'collect',
          cashBeforeDebtPayments: state.cash,
          debtPaymentThisRound: Math.abs(cashAdjustment),
          holdcoAmortizationThisRound: holdcoAmortizationAmount,
        });
      },

      advanceToEvent: () => {
        const state = get();
        const sharedBenefits = calculateSharedServicesBenefits(state as GameState);

        const sharedServicesCost = state.sharedServices
          .filter(s => s.active)
          .reduce((sum, s) => sum + s.annualCost, 0);

        // Apply distress interest penalty
        const currentMetrics = calculateMetrics(state as GameState);
        const distressRestrictions = getDistressRestrictions(currentMetrics.distressLevel);
        const effectiveRate = state.interestRate + distressRestrictions.interestPenalty;

        // Collect FCF when transitioning from collect to event phase (annual)
        // Portfolio tax (with interest/SS deductions for tax shield) is computed inside
        const annualFcf = calculatePortfolioFcf(
          state.businesses.filter(b => b.status === 'active'),
          sharedBenefits.capexReduction,
          sharedBenefits.cashConversionBonus,
          state.totalDebt,
          effectiveRate,
          sharedServicesCost
        );

        // Interest and shared services are still cash costs (separate from tax)
        const annualInterest = Math.round(state.totalDebt * effectiveRate);

        let newCash = state.cash + annualFcf - annualInterest - sharedServicesCost;

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
          cash: Math.round(newCash),
          currentEvent: event,
          requiresRestructuring,
          phase: requiresRestructuring ? 'restructure' as GamePhase : 'event' as GamePhase,
        };

        if (event && event.type !== 'unsolicited_offer' && !requiresRestructuring) {
          gameState = applyEventEffects(gameState, event);
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

        // Generate new deals with M&A focus and portfolio synergies
        const newPipeline = generateDealPipeline(
          state.dealPipeline,
          state.round,
          state.maFocus,
          focusBonus?.focusGroup,
          focusBonus?.tier
        );

        set({
          phase: 'allocate',
          dealPipeline: newPipeline,
          actionsThisRound: [],
          focusBonus,
        });
      },

      endRound: () => {
        const state = get();
        const sharedBenefits = calculateSharedServicesBenefits(state);
        const focusBonus = calculateSectorFocusBonus(state.businesses);
        const focusEbitdaBonus = focusBonus ? getSectorFocusEbitdaBonus(focusBonus.tier) : 0;

        // Apply organic growth to all businesses
        const updatedBusinesses = state.businesses.map(b => {
          if (b.status !== 'active') return b;
          return applyOrganicGrowth(
            b,
            sharedBenefits.growthBonus,
            focusEbitdaBonus,
            state.inflationRoundsRemaining > 0
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

        set({
          businesses: updatedBusinesses,
          round: newRound,
          metricsHistory: [...state.metricsHistory, historyEntry],
          gameOver,
          bankruptRound,
          covenantBreachRounds: newCovenantBreachRounds,
          requiresRestructuring,
          phase: 'collect', // L-4: Removed redundant ternary (both branches were identical)
          currentEvent: null,
          metrics: endMetrics,
          focusBonus: calculateSectorFocusBonus(updatedBusinesses),
        });

        // If not game over, advance to collect phase for next round
        if (!gameOver) {
          get().advanceToCollect();
        }
      },

      acquireBusiness: (deal: Deal, structure: DealStructure) => {
        const state = get();

        if (state.cash < structure.cashRequired) return;

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
          totalAcquisitionCost: deal.askingPrice,
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
          totalInvestedCapital: state.totalInvestedCapital + deal.askingPrice,
          businesses: [...state.businesses, businessWithPlatformFields],
          dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'acquire',
              round: state.round,
              details: { businessId: newBusiness.id, structure: structure.type, price: deal.askingPrice },
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

        if (state.cash < structure.cashRequired) return;

        const platform = state.businesses.find(b => b.id === targetPlatformId && b.status === 'active');
        if (!platform) return;

        // Must be same sector
        if (platform.sectorId !== deal.business.sectorId) return;

        // Check if shared services are active (helps integration)
        const hasSharedServices = state.sharedServices.filter(s => s.active).length > 0;

        // Determine integration outcome
        const outcome = determineIntegrationOutcome(deal.business, platform, hasSharedServices);
        const synergies = calculateSynergies(outcome, deal.business.ebitda, true);

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
          acquisitionPrice: deal.askingPrice,
          acquisitionRound: state.round,
          acquisitionMultiple: deal.business.acquisitionMultiple,
          organicGrowthRate: deal.business.organicGrowthRate,
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
          totalAcquisitionCost: deal.askingPrice,
        };

        // Update the platform with new bolt-on
        const newPlatformScale = Math.min(3, platform.platformScale + 1);
        const multipleExpansion = calculateMultipleExpansion(
          newPlatformScale,
          platform.ebitda + deal.business.ebitda + synergies
        );

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id === targetPlatformId) {
            return {
              ...b,
              isPlatform: true,
              platformScale: newPlatformScale,
              boltOnIds: [...b.boltOnIds, boltOnId],
              ebitda: b.ebitda + deal.business.ebitda + synergies, // Consolidate EBITDA
              synergiesRealized: b.synergiesRealized + synergies,
              totalAcquisitionCost: b.totalAcquisitionCost + deal.askingPrice,
              acquisitionMultiple: b.acquisitionMultiple + multipleExpansion, // Multiple expansion!
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

        set({
          cash: state.cash - structure.cashRequired,
          totalDebt: newTotalDebt,
          holdcoDebtStartRound,
          totalInvestedCapital: state.totalInvestedCapital + deal.askingPrice,
          businesses: [...updatedBusinesses, boltOnBusiness],
          dealPipeline: state.dealPipeline.filter(d => d.id !== deal.id),
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'acquire_tuck_in',
              round: state.round,
              details: {
                businessId: boltOnId,
                platformId: targetPlatformId,
                structure: structure.type,
                price: deal.askingPrice,
                integrationOutcome: outcome,
                synergies,
              },
            },
          ],
          metrics: calculateMetrics({
            ...state,
            cash: state.cash - structure.cashRequired,
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

        // Merge cost (restructuring, legal, integration)
        const mergeCost = Math.round((biz1.ebitda + biz2.ebitda) * 0.1);
        if (state.cash < mergeCost) return;

        // Check if shared services help
        const hasSharedServices = state.sharedServices.filter(s => s.active).length > 0;

        // Integration outcome for merger
        const outcome = determineIntegrationOutcome(biz2, biz1, hasSharedServices);
        const synergies = calculateSynergies(outcome, biz1.ebitda + biz2.ebitda, false);

        // Combined entity
        const combinedEbitda = biz1.ebitda + biz2.ebitda + synergies;
        const combinedTotalCost = biz1.totalAcquisitionCost + biz2.totalAcquisitionCost + mergeCost;
        const newPlatformScale = Math.min(3, Math.max(biz1.platformScale, biz2.platformScale) + 1);
        const multipleExpansion = calculateMultipleExpansion(newPlatformScale, combinedEbitda);

        // Use higher quality rating
        const bestQuality = Math.max(biz1.qualityRating, biz2.qualityRating) as 1 | 2 | 3 | 4 | 5;

        // Create merged business
        const mergedBusiness: Business = {
          id: generateBusinessId(),
          name: newName,
          sectorId: biz1.sectorId,
          subType: biz1.subType,
          ebitda: combinedEbitda,
          peakEbitda: combinedEbitda, // C-4: Start tracking peak from combined value (was incorrectly adding both)
          acquisitionEbitda: biz1.acquisitionEbitda + biz2.acquisitionEbitda,
          acquisitionPrice: combinedTotalCost,
          acquisitionRound: Math.min(biz1.acquisitionRound, biz2.acquisitionRound),
          acquisitionMultiple: ((biz1.acquisitionMultiple + biz2.acquisitionMultiple) / 2) + multipleExpansion,
          organicGrowthRate: (biz1.organicGrowthRate + biz2.organicGrowthRate) / 2 + 0.01, // Slight growth bonus
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
          sellerNoteRate: Math.max(biz1.sellerNoteRate, biz2.sellerNoteRate),
          sellerNoteRoundsRemaining: Math.max(biz1.sellerNoteRoundsRemaining, biz2.sellerNoteRoundsRemaining),
          bankDebtBalance: biz1.bankDebtBalance + biz2.bankDebtBalance,
          earnoutRemaining: 0,
          earnoutTarget: 0,
          status: 'active',
          isPlatform: true,
          platformScale: newPlatformScale,
          boltOnIds: [...biz1.boltOnIds, ...biz2.boltOnIds],
          integrationOutcome: outcome,
          synergiesRealized: (biz1.synergiesRealized || 0) + (biz2.synergiesRealized || 0) + synergies,
          totalAcquisitionCost: combinedTotalCost,
        };

        // Remove old businesses and add merged one
        const updatedBusinesses = state.businesses.filter(
          b => b.id !== businessId1 && b.id !== businessId2
        );

        set({
          cash: state.cash - mergeCost,
          totalInvestedCapital: state.totalInvestedCapital + mergeCost,
          businesses: [...updatedBusinesses, mergedBusiness],
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
                mergeCost,
                integrationOutcome: outcome,
                synergies,
                combinedEbitda,
              },
            },
          ],
          metrics: calculateMetrics({
            ...state,
            cash: state.cash - mergeCost,
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
        const setupCost = Math.round(business.ebitda * 0.05);
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

        set({
          cash: state.cash - setupCost,
          totalInvestedCapital: state.totalInvestedCapital + setupCost,
          businesses: updatedBusinesses,
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'designate_platform',
              round: state.round,
              details: { businessId, setupCost },
            },
          ],
        });
      },

      improveBusiness: (businessId: string, improvementType: OperationalImprovementType) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') return;

        // M-3: Prevent applying the same improvement type twice to the same business
        if (business.improvements.some(i => i.type === improvementType)) return;

        // Calculate cost based on improvement type
        let cost: number;
        let ebitdaBoost: number;
        let growthBoost = 0;
        let volatilityReduction = 0;

        switch (improvementType) {
          case 'operating_playbook':
            cost = Math.round(business.ebitda * 0.15);
            ebitdaBoost = 0.08;
            volatilityReduction = 0.02;
            break;
          case 'pricing_model':
            cost = Math.round(business.ebitda * 0.10);
            ebitdaBoost = 0.05 + Math.random() * 0.07;
            growthBoost = 0.01;
            break;
          case 'service_expansion':
            cost = Math.round(business.ebitda * 0.20);
            ebitdaBoost = 0.10 + Math.random() * 0.08;
            break;
          case 'fix_underperformance':
            cost = Math.round(business.ebitda * 0.12);
            // C-5: Clamp to 0 minimum — if business is already near peak, no boost
            ebitdaBoost = Math.max(0, (business.peakEbitda * 0.8 - business.ebitda) / business.ebitda);
            break;
          default:
            return;
        }

        if (state.cash < cost) return;

        const updatedBusinesses = state.businesses.map(b => {
          if (b.id !== businessId) return b;
          return {
            ...b,
            ebitda: Math.round(b.ebitda * (1 + ebitdaBoost)),
            organicGrowthRate: b.organicGrowthRate + growthBoost,
            improvements: [
              ...b.improvements,
              { type: improvementType, appliedRound: state.round, effect: ebitdaBoost },
            ],
          };
        });

        set({
          cash: state.cash - cost,
          totalInvestedCapital: state.totalInvestedCapital + cost,
          businesses: updatedBusinesses,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'improve', round: state.round, details: { businessId, improvementType, cost } },
          ],
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

        set({
          cash: state.cash - service.unlockCost,
          totalInvestedCapital: state.totalInvestedCapital + service.unlockCost,
          sharedServices: updatedServices,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'unlock_shared_service', round: state.round, details: { serviceType } },
          ],
        });
      },

      deactivateSharedService: (serviceType: SharedServiceType) => {
        const state = get();
        const updatedServices = state.sharedServices.map(s =>
          s.type === serviceType ? { ...s, active: false } : s
        );

        set({
          sharedServices: updatedServices,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'deactivate_shared_service', round: state.round, details: { serviceType } },
          ],
        });
      },

      payDownDebt: (amount: number) => {
        const state = get();
        const actualPayment = Math.min(amount, state.totalDebt, state.cash);
        if (actualPayment <= 0) return;

        set({
          cash: state.cash - actualPayment,
          totalDebt: state.totalDebt - actualPayment,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'pay_debt', round: state.round, details: { amount: actualPayment } },
          ],
        });
      },

      issueEquity: (amount: number) => {
        const state = get();

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

        set({
          cash: state.cash + amount,
          sharesOutstanding: newTotalShares,
          equityRaisesUsed: state.equityRaisesUsed + 1,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'issue_equity', round: state.round, details: { amount, newShares, newOwnership: newFounderOwnership } },
          ],
        });
      },

      buybackShares: (amount: number) => {
        const state = get();
        if (state.cash < amount) return;

        const metrics = calculateMetrics(state);
        // M-5: Guard against division by zero or negative intrinsic value
        if (metrics.intrinsicValuePerShare <= 0) return;
        const sharesRepurchased = Math.round((amount / metrics.intrinsicValuePerShare) * 1000) / 1000;

        // Can only buy back non-founder shares (outside investors' shares)
        const outsideShares = state.sharesOutstanding - state.founderShares;
        if (sharesRepurchased > outsideShares) return; // Can't buy more than outside investors own

        const newTotalShares = state.sharesOutstanding - sharesRepurchased;
        const newFounderOwnership = state.founderShares / newTotalShares;

        set({
          cash: state.cash - amount,
          sharesOutstanding: newTotalShares,
          totalBuybacks: state.totalBuybacks + amount,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'buyback', round: state.round, details: { amount, sharesRepurchased, newOwnership: newFounderOwnership } },
          ],
        });
      },

      distributeToOwners: (amount: number) => {
        const state = get();
        if (state.cash < amount) return;

        set({
          cash: state.cash - amount,
          totalDistributions: state.totalDistributions + amount,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'distribute', round: state.round, details: { amount } },
          ],
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
        const exitPrice = Math.round(business.ebitda * Math.max(2.0, effectiveMultiple + marketVariance));
        const netProceeds = Math.max(0, exitPrice - business.sellerNoteBalance);

        const updatedBusinesses = state.businesses.map(b =>
          b.id === businessId
            ? { ...b, status: 'sold' as const, exitPrice, exitRound: state.round }
            : b
        );

        // M-7: Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        set({
          cash: state.cash + netProceeds,
          totalExitProceeds: state.totalExitProceeds + netProceeds,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'sold' as const, exitPrice, exitRound: state.round },
          ],
          actionsThisRound: [
            ...state.actionsThisRound,
            {
              type: 'sell', round: state.round,
              details: { businessId, exitPrice, netProceeds, buyerName: buyerProfile.name, buyerType: buyerProfile.type },
            },
          ],
        });
      },

      windDownBusiness: (businessId: string) => {
        const state = get();
        const business = state.businesses.find(b => b.id === businessId);
        if (!business || business.status !== 'active') return;

        const windDownCost = 250; // $250k
        const debtWriteOff = business.sellerNoteBalance; // L-13: Only seller note on opco

        const updatedBusinesses = state.businesses.map(b =>
          b.id === businessId ? { ...b, status: 'wound_down' as const, exitRound: state.round } : b
        );

        // C-3: Floor cash at 0
        const newCash = Math.max(0, state.cash - windDownCost - debtWriteOff);

        // M-7: Auto-deactivate shared services if opco count drops below minimum
        const activeOpcoCount = updatedBusinesses.filter(b => b.status === 'active').length;
        const updatedServices = activeOpcoCount < MIN_OPCOS_FOR_SHARED_SERVICES
          ? state.sharedServices.map(s => s.active ? { ...s, active: false } : s)
          : state.sharedServices;

        set({
          cash: newCash,
          businesses: updatedBusinesses,
          sharedServices: updatedServices,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'wound_down' as const, exitRound: state.round },
          ],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'wind_down', round: state.round, details: { businessId, cost: windDownCost + debtWriteOff } },
          ],
        });
      },

      acceptOffer: () => {
        const state = get();
        const event = state.currentEvent;
        if (!event || event.type !== 'unsolicited_offer' || !event.affectedBusinessId || !event.offerAmount) return;

        const business = state.businesses.find(b => b.id === event.affectedBusinessId);
        if (!business) return;

        const debtPayoff = business.sellerNoteBalance + business.bankDebtBalance;
        const netProceeds = Math.max(0, event.offerAmount - debtPayoff);

        const updatedBusinesses = state.businesses.map(b =>
          b.id === event.affectedBusinessId
            ? { ...b, status: 'sold' as const, exitPrice: event.offerAmount, exitRound: state.round }
            : b
        );

        set({
          cash: state.cash + netProceeds,
          totalExitProceeds: state.totalExitProceeds + netProceeds,
          businesses: updatedBusinesses,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'sold' as const, exitPrice: event.offerAmount, exitRound: state.round },
          ],
          currentEvent: null,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'accept_offer', round: state.round, details: { businessId: event.affectedBusinessId, price: event.offerAmount } },
          ],
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
        const netProceeds = Math.max(0, exitPrice - business.sellerNoteBalance);

        const updatedBusinesses = state.businesses.map(b =>
          b.id === businessId
            ? { ...b, status: 'sold' as const, exitPrice, exitRound: state.round }
            : b
        );

        set({
          cash: state.cash + netProceeds,
          totalExitProceeds: state.totalExitProceeds + netProceeds,
          businesses: updatedBusinesses,
          exitedBusinesses: [
            ...state.exitedBusinesses,
            { ...business, status: 'sold' as const, exitPrice, exitRound: state.round },
          ],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'sell', round: state.round, details: { businessId, exitPrice, netProceeds, distressedSale: true } },
          ],
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
        set({
          cash: state.cash + amount,
          sharesOutstanding: state.sharesOutstanding + newShares,
          equityRaisesUsed: state.equityRaisesUsed + 1,
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'issue_equity', round: state.round, details: { amount, newShares, emergency: true } },
          ],
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

      setMAFocus: (sectorId: SectorId | null, sizePreference: DealSizePreference) => {
        set({
          maFocus: { sectorId, sizePreference },
        });
      },

      sourceDealFlow: () => {
        const state = get();

        // Check if player can afford
        if (state.cash < DEAL_SOURCING_COST) return;

        const focusBonus = calculateSectorFocusBonus(state.businesses);
        const newDeals = generateSourcedDeals(
          state.round,
          state.maFocus,
          focusBonus?.focusGroup
        );

        set({
          cash: state.cash - DEAL_SOURCING_COST,
          dealPipeline: [...state.dealPipeline, ...newDeals],
          actionsThisRound: [
            ...state.actionsThisRound,
            { type: 'source_deals', round: state.round, details: { cost: DEAL_SOURCING_COST, dealsGenerated: newDeals.length } },
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
          // Try AI generation first
          const narrative = await generateEventNarrative(
            event.type,
            event.effect,
            `Holdco with ${state.businesses.filter(b => b.status === 'active').length} portfolio companies`
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

            // Only generate stories every few years or on significant events
            const yearsOwned = state.round - b.acquisitionRound;
            const hasRecentImprovement = b.improvements.some(i => i.appliedRound === state.round - 1);
            // L-3: Removed unused significantGrowth variable
            const shouldGenerateStory = yearsOwned === 1 || yearsOwned === 5 || yearsOwned === 10 || hasRecentImprovement;

            if (!shouldGenerateStory) return b;

            const sector = SECTORS[b.sectorId];
            const ebitdaChange = b.ebitda > b.acquisitionEbitda
              ? `+${((b.ebitda / b.acquisitionEbitda - 1) * 100).toFixed(0)}% since acquisition`
              : `${((b.ebitda / b.acquisitionEbitda - 1) * 100).toFixed(0)}% since acquisition`;

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
              b.boltOnIds.length
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

        if (acquisitions.length > 0) {
          const totalSpent = acquisitions.reduce((sum, a) => sum + ((a.details?.cost as number) || (a.details?.askingPrice as number) || 0), 0);
          actionParts.push(`Acquired ${acquisitions.length} business${acquisitions.length > 1 ? 'es' : ''}${totalSpent > 0 ? ` for ${formatMoney(totalSpent)} total` : ''}`);
        }
        if (sales.length > 0) {
          actionParts.push(`Sold ${sales.length} business${sales.length > 1 ? 'es' : ''}`);
        }
        if (improvements.length > 0) {
          actionParts.push(`Made ${improvements.length} operational improvement${improvements.length > 1 ? 's' : ''}`);
        }
        if (debtPaydowns.length > 0) {
          const totalPaid = debtPaydowns.reduce((sum, a) => sum + ((a.details?.amount as number) || 0), 0);
          if (totalPaid > 0) actionParts.push(`Paid down ${formatMoney(totalPaid)} in debt`);
        }
        if (equityRaises.length > 0) {
          actionParts.push('Raised equity capital');
        }
        if (distributions.length > 0) {
          actionParts.push('Made distributions to owners');
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

        // Build concerns and positives for balanced commentary
        const concerns: string[] = [];
        const positives: string[] = [];

        if (fcf < 0) concerns.push(`Negative free cash flow of ${formatMoney(fcf)}`);
        if (metrics.netDebtToEbitda > 3) concerns.push(`High leverage at ${metrics.netDebtToEbitda.toFixed(1)}x net debt/EBITDA`);
        if (interestExpense > metrics.totalEbitda * 0.3) concerns.push(`Interest expense (${formatMoney(interestExpense)}) consuming ${Math.round(interestExpense / metrics.totalEbitda * 100)}% of EBITDA`);
        if (state.cash < metrics.totalEbitda * 0.5 && totalDebt > 0) concerns.push('Thin cash cushion relative to obligations');

        if (fcf > 0 && metrics.totalEbitda > 0) positives.push(`Generating ${formatMoney(fcf)} in free cash flow`);
        if (metrics.netDebtToEbitda < 1 && metrics.netDebtToEbitda >= 0) positives.push('Conservative balance sheet');
        if (metrics.portfolioRoic > 0.15) positives.push(`Strong ${Math.round(metrics.portfolioRoic * 100)}% ROIC`);

        // Get previous year EBITDA for comparison
        const prevMetrics = state.metricsHistory.length > 0
          ? state.metricsHistory[state.metricsHistory.length - 1]
          : null;
        const prevTotalEbitda = prevMetrics ? formatMoney(prevMetrics.metrics.totalEbitda) : undefined;

        try {
          const chronicle = await generateYearChronicle({
            holdcoName: state.holdcoName,
            year: state.round,
            totalEbitda: formatMoney(metrics.totalEbitda),
            prevTotalEbitda,
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
      name: 'holdco-tycoon-save-v8', // v8: financial distress & insolvency system
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
        currentEvent: state.currentEvent, // L-2: Persist current event across page refreshes
        eventHistory: state.eventHistory,
        creditTighteningRoundsRemaining: state.creditTighteningRoundsRemaining,
        inflationRoundsRemaining: state.inflationRoundsRemaining,
        metricsHistory: state.metricsHistory,
        actionsThisRound: state.actionsThisRound, // M-14: Persist actions for acquisition limit tracking
        debtPaymentThisRound: state.debtPaymentThisRound,
        cashBeforeDebtPayments: state.cashBeforeDebtPayments,
        holdcoDebtStartRound: state.holdcoDebtStartRound,
        holdcoAmortizationThisRound: state.holdcoAmortizationThisRound,
        requiresRestructuring: state.requiresRestructuring,
        covenantBreachRounds: state.covenantBreachRounds,
        hasRestructured: state.hasRestructured,
        bankruptRound: state.bankruptRound,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.holdcoName) {
          try {
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
