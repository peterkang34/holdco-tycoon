import { useState, useRef, useMemo, useCallback } from 'react';
import {
  Business,
  Deal,
  DealStructure,
  SharedService,
  SharedServiceType,
  OperationalImprovementType,
  GameAction,
  MAFocus,
  SectorId,
  DealSizePreference,
  DistressLevel,
  MASourcingState,
  IntegratedPlatform,
  GameDifficulty,
  GameDuration,
  TurnaroundTier,
  ActiveTurnaround,
  formatMoney,
  formatPercent,
} from '../../engine/types';
import { getDistressRestrictions, calculateCovenantHeadroom } from '../../engine/distress';
import { EQUITY_DILUTION_STEP, EQUITY_DILUTION_FLOOR, EQUITY_BUYBACK_COOLDOWN, EQUITY_ISSUANCE_SENTIMENT_PENALTY, EARNOUT_EXPIRATION_YEARS, MIN_FOUNDER_OWNERSHIP, MIN_PUBLIC_FOUNDER_OWNERSHIP, IPO_MIN_EBITDA, IPO_MIN_BUSINESSES, IPO_MIN_AVG_QUALITY, IPO_MIN_PLATFORMS } from '../../data/gameConfig';
import { getAvailableSectors } from '../../data/sectors';
import { BusinessCard } from '../cards/BusinessCard';
import { DealCard } from '../cards/DealCard';
import { generateDealStructures, getStructureLabel, getStructureDescription, calculateLendingSynergyDiscount } from '../../engine/deals';
import { calculateExitValuation, calculateAnnualFcf, calculatePortfolioTax, calculateSectorFocusBonus, getSectorFocusEbitdaBonus } from '../../engine/simulation';
import { capGrowthRate } from '../../engine/helpers';
import { getSubTypeAffinity, getSizeRatioTier } from '../../engine/businesses';
import { SECTORS } from '../../data/sectors';
import { getUnlockedSectorIds } from '../../hooks/useUnlocks';
import { useAuthStore } from '../../hooks/useAuth';
import { useGameStore } from '../../hooks/useGame';
import { BS_YEAR_1_ITEMS, BS_YEAR_2_ITEMS, BS_CHECKLIST_INFO } from '../../data/businessSchool';
import { MIN_OPCOS_FOR_SHARED_SERVICES, MAX_ACTIVE_SHARED_SERVICES, MA_SOURCING_CONFIG, getMASourcingUpgradeCost, getMASourcingAnnualCost } from '../../data/sharedServices';
import { MarketGuideModal } from '../ui/MarketGuideModal';
import { RollUpGuideModal } from '../ui/RollUpGuideModal';
import { ImprovementModal } from '../modals/ImprovementModal';
import { TurnaroundModal } from '../modals/TurnaroundModal';
import { isAIEnabled } from '../../services/aiGeneration';
import { checkPlatformEligibility, checkNearEligiblePlatforms, calculateIntegrationCost, getEligibleBusinessesForExistingPlatform, calculateAddToPlatformCost } from '../../engine/platforms';
import { getPlatformSaleBonus } from '../../data/gameConfig';
import { getEligiblePrograms, canUnlockTier } from '../../engine/turnarounds';
import { TURNAROUND_TIER_CONFIG, getTurnaroundTierAnnualCost, getProgramById } from '../../data/turnaroundPrograms';
import { TURNAROUND_FATIGUE_THRESHOLD, IPO_MIN_ROUND, PE_FUND_CONFIG } from '../../data/gameConfig';
import { checkIPOEligibility } from '../../engine/ipo';
import type { IPOState } from '../../engine/types';
import { DEBT_LABELS, DEBT_EXPLAINER } from '../../data/mechanicsCopy';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { CardListControls } from '../ui/CardListControls';
import { Modal } from '../ui/Modal';

const STARTING_SHARES = 1000;

const DEAL_SOURCING_COST_BASE = 500; // $500k
const DEAL_SOURCING_COST_TIER1 = 300; // $300k with MA Sourcing Tier 1+
const PROACTIVE_OUTREACH_COST = 400; // $400k (Tier 3 only)
const SMB_BROKER_COST_LOCAL = 75; // $75k — Small Business Broker

interface AllocatePhaseProps {
  businesses: Business[];
  allBusinesses: Business[]; // Includes integrated bolt-ons for debt lookups
  cash: number;
  holdcoLoanBalance: number;
  interestRate: number;
  creditTightening: boolean;
  distressLevel: DistressLevel;
  totalDebt: number;
  totalEbitda: number;
  holdcoLoanRate: number;
  holdcoLoanRoundsRemaining: number;
  dealPipeline: Deal[];
  passedDealIds: string[];
  onPassDeal: (dealId: string) => void;
  sharedServices: SharedService[];
  round: number;
  maxRounds?: number;
  equityRaisesUsed: number;
  lastEquityRaiseRound: number;
  lastBuybackRound: number;
  sharesOutstanding: number;
  founderShares: number;
  totalBuybacks: number;
  totalDistributions: number;
  founderDistributionsReceived: number;
  avgRoiic: number;
  netDebtToEbitda: number;
  intrinsicValuePerShare: number;
  lastEventType?: string;
  onAcquire: (deal: Deal, structure: DealStructure) => void;
  onAcquireTuckIn?: (deal: Deal, structure: DealStructure, platformId: string) => void;
  onMergeBusinesses?: (businessId1: string, businessId2: string, newName: string) => void;
  onDesignatePlatform?: (businessId: string) => void;
  onUnlockSharedService: (serviceType: SharedServiceType) => void;
  onDeactivateSharedService: (serviceType: SharedServiceType) => void;
  onPayDebt: (amount: number) => void;
  onPayBankDebt: (businessId: string, amount: number) => void;
  onIssueEquity: (amount: number) => void;
  onBuyback: (amount: number) => void;
  onDistribute: (amount: number) => void;
  onSell: (businessId: string) => void;

  onImprove: (businessId: string, improvementType: OperationalImprovementType) => void;
  onEndRound: () => void;
  onSMBBroker: () => void;
  onSourceDeals: () => void;
  maFocus: MAFocus;
  onSetMAFocus: (sectorId: SectorId | null, sizePreference: DealSizePreference, subType?: string | null) => void;
  actionsThisRound?: GameAction[];
  maSourcing: MASourcingState;
  onUpgradeMASourcing: () => void;
  onToggleMASourcing: () => void;
  onProactiveOutreach: () => void;
  onForgePlatform: (recipeId: string, businessIds: string[], platformName: string, cost: number) => void;
  onAddToIntegratedPlatform: (platformId: string, businessId: string, businessName: string, cost: number) => void;
  onSellPlatform: (platformId: string) => void;
  integratedPlatforms: IntegratedPlatform[];
  difficulty: GameDifficulty;
  duration: GameDuration;
  covenantBreachRounds?: number; // kept for caller compat, not used internally
  acquisitionsThisRound: number;
  maxAcquisitionsPerRound: number;
  lastAcquisitionResult: 'success' | 'snatched' | 'blocked_same_league' | 'lpac_denied' | null;
  turnaroundTier: TurnaroundTier;
  activeTurnarounds: ActiveTurnaround[];
  onUnlockTurnaroundTier: () => void;
  onStartTurnaround: (businessId: string, programId: string) => void;
  ipoState?: IPOState | null;
  onExecuteIPO?: () => void;
  onDeclineIPO?: () => void;
  isFamilyOfficeMode?: boolean;
  isFundManagerMode?: boolean;
  onShowVideo?: () => void;
  fundSize?: number;
  totalCapitalDeployed?: number;
  lpDistributions?: number;
  managementFeesCollected?: number;
  onDistributeToLPs?: (amount: number) => void;
}

type AllocateTab = 'portfolio' | 'deals' | 'shared_services' | 'capital';

export function AllocatePhase({
  businesses,
  allBusinesses,
  cash,
  holdcoLoanBalance,
  interestRate,
  creditTightening,
  distressLevel,
  totalDebt,
  totalEbitda,
  holdcoLoanRate,
  holdcoLoanRoundsRemaining,
  dealPipeline,
  passedDealIds,
  onPassDeal,
  sharedServices,
  round,
  maxRounds: maxRoundsFromStore,
  equityRaisesUsed,
  lastEquityRaiseRound,
  lastBuybackRound,
  sharesOutstanding,
  founderShares,
  totalBuybacks: _totalBuybacks,
  totalDistributions,
  founderDistributionsReceived,
  avgRoiic,
  netDebtToEbitda,
  intrinsicValuePerShare,
  lastEventType,
  onAcquire,
  onAcquireTuckIn,
  onMergeBusinesses,
  onDesignatePlatform,
  onUnlockSharedService,
  onDeactivateSharedService,
  onPayDebt,
  onPayBankDebt,
  onIssueEquity,
  onBuyback,
  onDistribute,
  onSell,

  onImprove,
  onEndRound,
  onSMBBroker,
  onSourceDeals,
  maFocus,
  onSetMAFocus,
  actionsThisRound = [],
  maSourcing,
  onUpgradeMASourcing,
  onToggleMASourcing,
  onProactiveOutreach,
  onForgePlatform,
  onAddToIntegratedPlatform,
  onSellPlatform,
  integratedPlatforms,
  difficulty,
  duration,
  covenantBreachRounds: _covenantBreachRounds,
  acquisitionsThisRound,
  maxAcquisitionsPerRound,
  lastAcquisitionResult,
  turnaroundTier,
  activeTurnarounds,
  onUnlockTurnaroundTier,
  onStartTurnaround,
  ipoState,
  onExecuteIPO,
  onDeclineIPO,
  isFamilyOfficeMode = false,
  isFundManagerMode = false,
  onShowVideo,
  fundSize = 0,
  totalCapitalDeployed = 0,
  lpDistributions = 0,
  managementFeesCollected = 0,
  onDistributeToLPs,
}: AllocatePhaseProps) {
  const isAnonymous = useAuthStore((s) => s.player?.isAnonymous ?? true);
  const isBusinessSchoolMode = useGameStore((s) => s.isBusinessSchoolMode);
  const businessSchoolState = useGameStore((s) => s.businessSchoolState);
  const isMobile = useIsMobile();
  const [videoBannerDismissed, setVideoBannerDismissed] = useState(() => localStorage.getItem('holdco-video-banner-dismissed') === 'true');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const swipeHintCount = useRef(parseInt(localStorage.getItem('holdco-swipe-hint-count') || '0'));
  const [activeTab, setActiveTab] = useState<AllocateTab>('portfolio');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedBusinessForImprovement, setSelectedBusinessForImprovement] = useState<Business | null>(null);
  const [payDebtAmount, setPayDebtAmount] = useState('');
  const [bankDebtAmounts, setBankDebtAmounts] = useState<Record<string, string>>({});
  const [equityAmount, setEquityAmount] = useState('');
  const [equityMode, setEquityMode] = useState<'dollars' | 'shares'>('dollars');
  const [buybackAmount, setBuybackAmount] = useState('');
  const [buybackMode, setBuybackMode] = useState<'dollars' | 'shares'>('dollars');
  const [distributeAmount, setDistributeAmount] = useState('');
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false);

  // B-School incomplete checklist items for current year
  const bsIncompleteItems = useMemo(() => {
    if (!isBusinessSchoolMode || !businessSchoolState) return [];
    const yearItems = round <= 1 ? BS_YEAR_1_ITEMS : BS_YEAR_2_ITEMS;
    // Exclude bs_end_year_1 — it completes automatically on confirm
    return yearItems
      .filter((id) => id !== 'bs_end_year_1' && !businessSchoolState.checklist.items[id])
      .map((id) => BS_CHECKLIST_INFO.find((info) => info.id === id)!)
      .filter(Boolean);
  }, [isBusinessSchoolMode, businessSchoolState, round]);

  // In-modal equity raise state
  const [modalEquityAmount, setModalEquityAmount] = useState('');
  const [showModalEquityRaise, setShowModalEquityRaise] = useState(false);
  // Deal pass state (persisted in game state)
  const passedDealIdSet = useMemo(() => new Set(passedDealIds), [passedDealIds]);
  const [showPassedDeals, setShowPassedDeals] = useState(false);
  // Tuck-in and merge state
  const [selectedTuckInPlatform, setSelectedTuckInPlatform] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<{ first: Business | null; second: Business | null }>({
    first: null,
    second: null,
  });
  const [mergeName, setMergeName] = useState('');
  const [showMarketGuide, setShowMarketGuide] = useState(false);
  const acquiringRef = useRef(false);
  const [showRollUpGuide, setShowRollUpGuide] = useState(false);
  const [sellConfirmBusiness, setSellConfirmBusiness] = useState<Business | null>(null);
  const [sellCelebration, setSellCelebration] = useState<{ name: string; moic: number } | null>(null);

  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [forgeConfirm, setForgeConfirm] = useState<{ recipeId: string; businessIds: string[] } | null>(null);
  const [sellPlatformConfirm, setSellPlatformConfirm] = useState<IntegratedPlatform | null>(null);
  const [turnaroundBusiness, setTurnaroundBusiness] = useState<Business | null>(null);
  const [showTurnaroundSummary, setShowTurnaroundSummary] = useState(false);
  // Fund manager mode: DPI distribution
  const [dpiAmount, setDpiAmount] = useState('');
  const [dpiConfirm, setDpiConfirm] = useState(false);

  // Portfolio sort + expand/collapse
  const [portfolioSort, setPortfolioSort] = useState('ebitda');
  const [expandedBusinessIds, setExpandedBusinessIds] = useState<Set<string>>(() => new Set());

  // Deal sort + filter + expand/collapse
  const [dealSort, setDealSort] = useState('freshness');
  const [dealFilters, setDealFilters] = useState<string[]>([]);
  const [expandedDealIds, setExpandedDealIds] = useState<Set<string>>(() => new Set());

  const maxRounds = maxRoundsFromStore ?? 20;
  const activeBusinesses = businesses.filter(b => b.status === 'active');

  // Owned pro sports league sub-types (for same-league blocking on deal cards)
  const ownedProSportsSubTypes = useMemo(() =>
    businesses
      .filter(b => b.sectorId === 'proSports' && (b.status === 'active' || b.status === 'integrated'))
      .map(b => b.subType),
    [businesses]
  );

  // Portfolio sort
  const sortedBusinesses = useMemo(() => {
    const standalone = activeBusinesses.filter(b => !b.parentPlatformId);
    // Pre-compute MOIC values to avoid O(n log n) calculateExitValuation calls in comparator
    let moicMap: Map<string, number> | undefined;
    if (portfolioSort === 'moic') {
      moicMap = new Map();
      for (const biz of standalone) {
        const ev = calculateExitValuation(biz, round, lastEventType, undefined, integratedPlatforms);
        const totalCost = biz.totalAcquisitionCost || biz.acquisitionPrice;
        moicMap.set(biz.id, totalCost > 0 ? ev.exitPrice / totalCost : 0);
      }
    }
    return [...standalone].sort((a, b) => {
      switch (portfolioSort) {
        case 'ebitda': return b.ebitda - a.ebitda;
        case 'fcf': {
          const sA = SECTORS[a.sectorId]; const sB = SECTORS[b.sectorId];
          return Math.round(b.ebitda * (1 - sB.capexRate)) - Math.round(a.ebitda * (1 - sA.capexRate));
        }
        case 'moic': return (moicMap!.get(b.id) ?? 0) - (moicMap!.get(a.id) ?? 0);
        case 'quality': return b.qualityRating - a.qualityRating;
        case 'growth': return b.organicGrowthRate - a.organicGrowthRate;
        case 'sector': return a.sectorId.localeCompare(b.sectorId);
        case 'name': return a.name.localeCompare(b.name);
        default: return 0;
      }
    });
  }, [activeBusinesses, portfolioSort, round, lastEventType, integratedPlatforms]);

  // Derive allExpanded from actual set sizes (not independent state)
  const allBusinessesExpanded = expandedBusinessIds.size >= sortedBusinesses.length && sortedBusinesses.length > 0;

  const toggleBusiness = useCallback((id: string) => {
    setExpandedBusinessIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAllBusinesses = useCallback(() => {
    const standalone = activeBusinesses.filter(b => !b.parentPlatformId);
    setExpandedBusinessIds(prev =>
      prev.size >= standalone.length ? new Set() : new Set(standalone.map(b => b.id))
    );
  }, [activeBusinesses]);

  // Fund mode: compute NAV + MOIC + hurdle progress
  const fundMetrics = useMemo(() => {
    if (!isFundManagerMode) return null;
    // Portfolio value: sum of exit valuations
    let portfolioValue = 0;
    let rolloverClaims = 0;
    for (const biz of activeBusinesses) {
      const val = calculateExitValuation(biz, maxRounds, lastEventType, undefined, integratedPlatforms);
      portfolioValue += val.exitPrice;
      if (biz.rolloverEquityPct && biz.rolloverEquityPct > 0) {
        const bizDebt = biz.sellerNoteBalance + biz.bankDebtBalance;
        const bizNet = Math.max(0, val.exitPrice - bizDebt);
        rolloverClaims += bizNet * biz.rolloverEquityPct;
      }
    }
    const opcoSellerNotes = businesses.reduce((s, b) => s + b.sellerNoteBalance, 0);
    const allDebt = totalDebt + opcoSellerNotes;
    const nav = Math.max(0, portfolioValue + cash - allDebt - rolloverClaims);
    const grossMoic = fundSize > 0 ? (nav + lpDistributions) / fundSize : 0;
    const dpi = fundSize > 0 ? lpDistributions / fundSize : 0;
    const deployPct = fundSize > 0 ? (totalCapitalDeployed / fundSize) * 100 : 0;
    const dryPowder = cash;
    const totalValue = nav + lpDistributions;
    const hurdlePct = PE_FUND_CONFIG.hurdleReturn > 0 ? (totalValue / PE_FUND_CONFIG.hurdleReturn) * 100 : 0;
    const estCarry = totalValue > PE_FUND_CONFIG.hurdleReturn
      ? (totalValue - PE_FUND_CONFIG.hurdleReturn) * PE_FUND_CONFIG.carryRate
      : 0;
    return { nav, grossMoic, dpi, deployPct, dryPowder, totalValue, hurdlePct, estCarry };
  }, [isFundManagerMode, activeBusinesses, businesses, cash, totalDebt, fundSize, lpDistributions, totalCapitalDeployed, maxRounds, lastEventType, integratedPlatforms]);

  // Deal sort + filter
  const dealFilterOptions = useMemo(() => {
    const opts: { value: string; label: string; group?: string }[] = [];
    const sectors = new Set(dealPipeline.map(d => d.business.sectorId));
    sectors.forEach(sid => {
      const s = SECTORS[sid];
      if (s) opts.push({ value: `sector:${sid}`, label: `${s.emoji} ${s.name}`, group: 'Sector' });
    });
    opts.push({ value: 'heat:cold', label: 'Cold', group: 'Heat' });
    opts.push({ value: 'heat:warm', label: 'Warm', group: 'Heat' });
    opts.push({ value: 'heat:hot', label: 'Hot', group: 'Heat' });
    opts.push({ value: 'heat:contested', label: 'Contested', group: 'Heat' });
    opts.push({ value: 'affordable', label: 'Can Afford', group: 'Budget' });
    opts.push({ value: 'quality:3+', label: 'Q3+', group: 'Quality' });
    opts.push({ value: 'quality:4+', label: 'Q4+', group: 'Quality' });
    return opts;
  }, [dealPipeline]);

  const filteredSortedDeals = useMemo(() => {
    let deals = dealPipeline.filter(deal => showPassedDeals || !passedDealIdSet.has(deal.id));

    // Apply filters
    if (dealFilters.length > 0) {
      deals = deals.filter(deal => {
        // Group filters by type, then OR within group, AND between groups
        const sectorFilters = dealFilters.filter(f => f.startsWith('sector:'));
        const heatFilters = dealFilters.filter(f => f.startsWith('heat:'));
        const qualityFilters = dealFilters.filter(f => f.startsWith('quality:'));
        const hasAffordable = dealFilters.includes('affordable');

        if (sectorFilters.length > 0 && !sectorFilters.some(f => deal.business.sectorId === f.slice(7))) return false;
        if (heatFilters.length > 0 && !heatFilters.some(f => deal.heat === f.slice(5))) return false;
        if (qualityFilters.length > 0 && !qualityFilters.some(f => {
          if (f === 'quality:3+') return deal.business.qualityRating >= 3;
          if (f === 'quality:4+') return deal.business.qualityRating >= 4;
          return false;
        })) return false;
        if (hasAffordable && cash < Math.round(deal.effectivePrice * 0.25)) return false;
        return true;
      });
    }

    // Sort
    return [...deals].sort((a, b) => {
      switch (dealSort) {
        case 'freshness': return a.freshness - b.freshness;
        case 'price_low': return a.effectivePrice - b.effectivePrice;
        case 'price_high': return b.effectivePrice - a.effectivePrice;
        case 'ebitda': return b.business.ebitda - a.business.ebitda;
        case 'quality': return b.business.qualityRating - a.business.qualityRating;
        case 'heat': {
          const heatOrder = { cold: 0, warm: 1, hot: 2, contested: 3 };
          return heatOrder[b.heat] - heatOrder[a.heat];
        }
        case 'multiple': {
          const aMultiple = a.effectivePrice / a.business.ebitda;
          const bMultiple = b.effectivePrice / b.business.ebitda;
          return aMultiple - bMultiple;
        }
        default: return 0;
      }
    });
  }, [dealPipeline, showPassedDeals, passedDealIdSet, dealFilters, dealSort, cash]);

  const allDealsExpanded = filteredSortedDeals.length > 0 && filteredSortedDeals.every(d => expandedDealIds.has(d.id));

  const toggleDeal = useCallback((id: string) => {
    setExpandedDealIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAllDeals = useCallback(() => {
    setExpandedDealIds(prev => {
      const allVisible = filteredSortedDeals.every(d => prev.has(d.id));
      return allVisible ? new Set<string>() : new Set(filteredSortedDeals.map(d => d.id));
    });
  }, [filteredSortedDeals]);

  const distressRestrictions = getDistressRestrictions(distressLevel);
  const dealSourcingCost = (maSourcing.active && maSourcing.tier >= 1) ? DEAL_SOURCING_COST_TIER1 : DEAL_SOURCING_COST_BASE;

  // Escalating dilution + cooldown derived values
  const isPublic = !!ipoState?.isPublic;
  const equityDiscount = isPublic ? 1 : Math.max(1 - EQUITY_DILUTION_STEP * equityRaisesUsed, EQUITY_DILUTION_FLOOR);
  const effectivePricePerShare = isPublic ? (ipoState?.stockPrice ?? 0) : intrinsicValuePerShare * equityDiscount;
  const buybackPricePerShare = isPublic ? (ipoState?.stockPrice ?? 0) : intrinsicValuePerShare;
  const raiseCooldownBlocked = lastBuybackRound > 0 && round - lastBuybackRound < EQUITY_BUYBACK_COOLDOWN;
  const buybackCooldownBlocked = lastEquityRaiseRound > 0 && round - lastEquityRaiseRound < EQUITY_BUYBACK_COOLDOWN;
  const negativeEquity = intrinsicValuePerShare <= 0;
  const raiseBlocked = raiseCooldownBlocked || negativeEquity;
  const raiseCooldownRemainder = raiseCooldownBlocked ? EQUITY_BUYBACK_COOLDOWN - (round - lastBuybackRound) : 0;
  // Max raise before hitting ownership floor: founderShares / (sharesOutstanding + maxNewShares) = effectiveOwnershipFloor
  const effectiveOwnershipFloor = ipoState?.isPublic ? MIN_PUBLIC_FOUNDER_OWNERSHIP : MIN_FOUNDER_OWNERSHIP;
  const maxNewShares = Math.max(0, (founderShares / effectiveOwnershipFloor) - sharesOutstanding);
  const maxRaiseAmount = negativeEquity ? 0 : Math.floor(maxNewShares * effectivePricePerShare); // in $k (internal)
  const atOwnershipFloor = !negativeEquity && maxRaiseAmount <= 0;
  const ownershipFloorPct = Math.round(effectiveOwnershipFloor * 100);
  const buybackCooldownRemainder = buybackCooldownBlocked ? EQUITY_BUYBACK_COOLDOWN - (round - lastEquityRaiseRound) : 0;
  const aiEnabled = isAIEnabled();
  const activeServicesCount = sharedServices.filter(s => s.active).length;
  const canUnlockSharedService =
    activeBusinesses.length >= MIN_OPCOS_FOR_SHARED_SERVICES &&
    activeServicesCount < MAX_ACTIVE_SHARED_SERVICES;

  // Estimate net FCF for covenant headroom projection
  const sharedServicesCostAnnual = sharedServices.filter(s => s.active).reduce((sum, s) => sum + s.annualCost, 0);
  const hasProcurement = sharedServices.some(s => s.type === 'procurement' && s.active);
  const hasFinance = sharedServices.some(s => s.type === 'finance_reporting' && s.active);
  const ssCapexReduction = hasProcurement ? 0.15 : 0;
  const ssCashConversionBonus = hasFinance ? 0.05 : 0;

  // Covenant headroom — updates in real-time as cash changes
  const covenantHeadroom = useMemo(() => {
    // --- Project next-year EBITDA using deterministic growth factors ---
    // endRound() applies organic growth BEFORE collect phase, so the forecast
    // should account for base growth rate + systematic bonuses.

    // Shared services growth bonus (marketing_brand: 1.5%, technology_systems: 0.5%)
    const activeServices = sharedServices.filter(s => s.active);
    const opcoCount = activeBusinesses.length;
    const ssScale = opcoCount >= 6 ? 1.2 : opcoCount >= 3 ? 1.0 + (opcoCount - 2) * 0.05 : 1.0;
    let ssGrowthBonus = 0;
    for (const s of activeServices) {
      if (s.type === 'marketing_brand') ssGrowthBonus += 0.015 * ssScale;
      else if (s.type === 'technology_systems') ssGrowthBonus += 0.005 * ssScale;
    }

    // Sector focus bonus
    const focusBonus = calculateSectorFocusBonus(allBusinesses);
    const focusEbitdaBonus = focusBonus ? getSectorFocusEbitdaBonus(focusBonus.tier) : 0;

    // Diversification bonus (4+ unique sectors: +4%, 6+: +6%)
    const uniqueSectors = new Set(activeBusinesses.map(b => b.sectorId)).size;
    const diversificationBonus = uniqueSectors >= 6 ? 0.06 : uniqueSectors >= 4 ? 0.04 : 0;

    // Project each business's next-year EBITDA
    const projectedBusinesses = activeBusinesses.map(b => {
      let growthRate = capGrowthRate(b.revenueGrowthRate);
      growthRate += ssGrowthBonus;
      growthRate += focusEbitdaBonus;
      growthRate += diversificationBonus;
      // Competitive position: leaders +1.5%, commoditized -1.5%
      if (b.dueDiligence?.competitivePosition === 'leader') growthRate += 0.015;
      else if (b.dueDiligence?.competitivePosition === 'commoditized') growthRate -= 0.015;
      // Integration penalty (midpoint of -3% to -8%)
      if (b.integrationRoundsRemaining > 0) growthRate -= 0.05;
      // Integration failure growth drag
      if (b.integrationGrowthDrag && b.integrationGrowthDrag < 0) growthRate += b.integrationGrowthDrag;
      // Sector-specific SS bonus (+1% for agency/consumer with active SS growth)
      if ((b.sectorId === 'agency' || b.sectorId === 'consumer') && ssGrowthBonus > 0) growthRate += 0.01;

      const projectedRevenue = Math.round(b.revenue * (1 + growthRate));
      const projectedEbitda = Math.round(projectedRevenue * b.ebitdaMargin);
      return { ...b, ebitda: projectedEbitda, revenue: projectedRevenue };
    });

    const preTaxFcf = projectedBusinesses.reduce(
      (sum, b) => sum + calculateAnnualFcf(b, ssCapexReduction, ssCashConversionBonus), 0
    );
    const projectedTotalEbitda = projectedBusinesses.reduce((sum, b) => sum + Math.max(0, b.ebitda), 0);

    // Operating costs
    const maCostAnnual = maSourcing.active ? getMASourcingAnnualCost(maSourcing.tier) : 0;
    const turnaroundCostAnnual = getTurnaroundTierAnnualCost(turnaroundTier)
      + activeTurnarounds.filter(t => t.status === 'active').reduce((sum, t) => {
          const prog = getProgramById(t.programId);
          return sum + (prog ? prog.annualCost : 0);
        }, 0);

    // Seller note P&I is computed inside calculateCovenantHeadroom — not included here

    // Earnout estimate (using projected growth as proxy)
    const earnoutEst = allBusinesses.reduce((sum, b) => {
      if (b.earnoutRemaining <= 0 || b.earnoutTarget <= 0) return sum;
      if (round > 0 && round - b.acquisitionRound > EARNOUT_EXPIRATION_YEARS) return sum;
      if (b.status === 'active' && b.acquisitionEbitda > 0) {
        const projected = projectedBusinesses.find(p => p.id === b.id);
        const ebitdaForGrowth = projected ? projected.ebitda : b.ebitda;
        const growth = (ebitdaForGrowth - b.acquisitionEbitda) / b.acquisitionEbitda;
        if (growth >= b.earnoutTarget) return sum + b.earnoutRemaining;
      } else if (b.status === 'integrated' && b.parentPlatformId) {
        const platform = allBusinesses.find(p => p.id === b.parentPlatformId && p.status === 'active');
        if (platform && platform.acquisitionEbitda > 0) {
          const projected = projectedBusinesses.find(p => p.id === platform.id);
          const ebitdaForGrowth = projected ? projected.ebitda : platform.ebitda;
          const growth = (ebitdaForGrowth - platform.acquisitionEbitda) / platform.acquisitionEbitda;
          if (growth >= b.earnoutTarget) return sum + b.earnoutRemaining;
        }
      }
      return sum;
    }, 0);

    // Tax with penalty included for holdco interest deduction
    const taxEst = calculatePortfolioTax(projectedBusinesses, holdcoLoanBalance, holdcoLoanRate + distressRestrictions.interestPenalty, sharedServicesCostAnnual + maCostAnnual);

    // Net FCF after tax, operating costs, and opco-level debt service
    // NOTE: holdco P&I, bank debt P&I, and seller note P&I are computed inside calculateCovenantHeadroom — do NOT include here
    const estimatedNetFcf = preTaxFcf - taxEst.taxAmount - sharedServicesCostAnnual - maCostAnnual - turnaroundCostAnnual - earnoutEst;

    return calculateCovenantHeadroom(
      cash,
      totalDebt,
      projectedTotalEbitda,
      holdcoLoanBalance,
      holdcoLoanRate,
      holdcoLoanRoundsRemaining,
      allBusinesses,
      interestRate,
      distressRestrictions.interestPenalty,
      estimatedNetFcf,
    );
  }, [cash, totalDebt, totalEbitda, holdcoLoanBalance, holdcoLoanRate, holdcoLoanRoundsRemaining, allBusinesses, interestRate, distressRestrictions.interestPenalty, activeBusinesses, ssCapexReduction, ssCashConversionBonus, sharedServicesCostAnnual, sharedServices, maSourcing, turnaroundTier, activeTurnarounds]);

  // Platform and tuck-in helpers
  const platforms = activeBusinesses.filter(b => b.isPlatform);
  // Forged integrated platforms: find the first active constituent as the "anchor" business
  const forgedPlatformAnchors = useMemo(() => {
    const anchors: Business[] = [];
    for (const ip of integratedPlatforms) {
      // Find the first active constituent that isn't already a manual platform
      const anchor = ip.constituentBusinessIds
        .map(id => activeBusinesses.find(b => b.id === id))
        .find(b => b && !b.isPlatform);
      if (anchor) {
        anchors.push(anchor);
      }
    }
    return anchors;
  }, [integratedPlatforms, activeBusinesses]);

  const getPlatformsForSector = (sectorId: string) => {
    // Manual platforms in this sector
    const manualPlatforms = platforms.filter(p => p.sectorId === sectorId);
    // Forged integrated platform anchors in this sector (or cross-sector platforms that include this sector)
    const forgedAnchors = forgedPlatformAnchors.filter(anchor => {
      // Direct sector match on the anchor business
      if (anchor.sectorId === sectorId) return true;
      // Cross-sector: check if the integrated platform covers this sector
      const ip = integratedPlatforms.find(p =>
        p.constituentBusinessIds.includes(anchor.id)
      );
      return ip ? ip.sectorIds.includes(sectorId as SectorId) : false;
    });
    // Deduplicate: don't include forged anchors that are already manual platforms
    const manualIds = new Set(manualPlatforms.map(p => p.id));
    const uniqueForged = forgedAnchors.filter(a => !manualIds.has(a.id));
    return [...manualPlatforms, ...uniqueForged];
  };

  // Merge eligibility: need 2+ businesses in same sector (pro sports excluded)
  const getMergeableSectors = () => {
    const sectorCounts: Record<string, Business[]> = {};
    activeBusinesses.forEach(b => {
      if (!b.parentPlatformId && b.sectorId !== 'proSports') { // Only standalone or platform businesses, not bolt-ons; exclude pro sports
        if (!sectorCounts[b.sectorId]) sectorCounts[b.sectorId] = [];
        sectorCounts[b.sectorId].push(b);
      }
    });
    return Object.entries(sectorCounts).filter(([_, businesses]) => businesses.length >= 2);
  };
  const mergeableSectors = getMergeableSectors();

  // Integrated Platform eligibility
  const eligiblePlatformRecipes = useMemo(
    () => checkPlatformEligibility(businesses, integratedPlatforms, difficulty, duration),
    [businesses, integratedPlatforms, difficulty, duration]
  );

  const nearEligibleRecipes = useMemo(
    () => checkNearEligiblePlatforms(businesses, integratedPlatforms, difficulty, duration),
    [businesses, integratedPlatforms, difficulty, duration]
  );

  const tabs: { id: AllocateTab; label: string; badge?: number }[] = [
    { id: 'portfolio', label: 'Portfolio', badge: activeBusinesses.length },
    { id: 'deals', label: 'Deals', badge: dealPipeline.length },
    { id: 'shared_services', label: 'Shared Services' },
    // FO mode: show "Debt" tab (debt management only); normal: full "Capital" tab
    { id: 'capital', label: isFamilyOfficeMode ? 'Debt' : 'Capital' },
  ];

  const renderDealStructuring = () => {
    if (!selectedDeal) return null;

    const lendingSynergy = calculateLendingSynergyDiscount(allBusinesses, creditTightening);
    const structures = generateDealStructures(selectedDeal, cash, interestRate, creditTightening, maxRoundsFromStore ?? 20, !distressRestrictions.canTakeDebt, maSourcing?.tier ?? 0, duration ?? 'standard', selectedDeal.sellerArchetype, ipoState ?? undefined, lendingSynergy);

    // Compute minimum cash required based on cheapest available deal structure
    // (pass full deal price as cash to see ALL structures that would be available)
    const hypotheticalStructures = generateDealStructures(selectedDeal, selectedDeal.effectivePrice, interestRate, creditTightening, maxRoundsFromStore ?? 20, !distressRestrictions.canTakeDebt, maSourcing?.tier ?? 0, duration ?? 'standard', selectedDeal.sellerArchetype, ipoState ?? undefined, lendingSynergy);
    const minCashForDeal = hypotheticalStructures.length > 0
      ? Math.min(...hypotheticalStructures.map(s => s.cashRequired))
      : selectedDeal.effectivePrice;
    const minCashPct = Math.round((minCashForDeal / selectedDeal.effectivePrice) * 100);

    const availablePlatformsForDeal = getPlatformsForSector(selectedDeal.business.sectorId);
    const canTuckIn = availablePlatformsForDeal.length > 0;

    return (
      <Modal
        isOpen={!!selectedDeal}
        onClose={() => {
          setSelectedDeal(null);
          setSelectedTuckInPlatform(null);
          setModalEquityAmount('');
          setShowModalEquityRaise(false);
        }}
        title={selectedDeal.business.name}
        subtitle={`${SECTORS[selectedDeal.business.sectorId].emoji} ${selectedDeal.business.subType}`}
        size="lg"
      >
          <div className="flex items-center gap-2 mb-3">
            <span className="relative group/modalheat">
              <span className={`text-xs px-2 py-1 rounded inline-block cursor-help ${
                selectedDeal.heat === 'cold' ? 'bg-blue-500/20 text-blue-400' :
                selectedDeal.heat === 'warm' ? 'bg-yellow-500/20 text-yellow-400' :
                selectedDeal.heat === 'hot' ? 'bg-orange-500/20 text-orange-400' :
                'bg-red-500/20 text-red-400 animate-pulse'
              }`}>
                {selectedDeal.heat.charAt(0).toUpperCase() + selectedDeal.heat.slice(1)}
              </span>
              <span className="absolute left-0 top-full mt-1 w-56 p-2 bg-bg-primary border border-white/20 rounded-lg shadow-xl text-xs text-text-secondary opacity-0 invisible group-hover/modalheat:opacity-100 group-hover/modalheat:visible transition-all z-50">
                {selectedDeal.heat === 'cold' && 'Low buyer interest. No premium over base price.'}
                {selectedDeal.heat === 'warm' && 'Moderate competition. 10-15% premium over base.'}
                {selectedDeal.heat === 'hot' && 'Multiple competing offers. 20-30% premium.'}
                {selectedDeal.heat === 'contested' && 'Bidding war. 30-50% premium and 40% chance a rival snatches it.'}
              </span>
            </span>
            <span className={`text-xs px-2 py-1 rounded inline-block ${
              selectedDeal.acquisitionType === 'tuck_in' ? 'bg-accent-secondary/20 text-accent-secondary' :
              selectedDeal.acquisitionType === 'platform' ? 'bg-accent/20 text-accent' :
              'bg-white/10 text-text-muted'
            }`}>
              {selectedDeal.acquisitionType === 'tuck_in' ? 'Tuck-In Opportunity' :
               selectedDeal.acquisitionType === 'platform' ? 'Platform Opportunity' : 'Standalone'}
            </span>
          </div>
          {selectedDeal.effectivePrice > selectedDeal.askingPrice && (
            <p className="text-xs text-text-muted mb-3">
              Base price {formatMoney(selectedDeal.askingPrice)} + {Math.round(((selectedDeal.effectivePrice / selectedDeal.askingPrice) - 1) * 100)}% competitive premium = <span className="font-bold text-text-primary">{formatMoney(selectedDeal.effectivePrice)}</span>
            </p>
          )}

          {/* Tuck-in / Platform Integration Selection */}
          {canTuckIn && (
            <div className="bg-accent-secondary/10 border border-accent-secondary/30 rounded-lg p-4 mb-6">
              <h4 className="font-bold text-accent-secondary mb-2">
                {selectedDeal.acquisitionType === 'tuck_in' ? 'Tuck-In Acquisition' : 'Platform Integration'}
              </h4>
              <p className="text-sm text-text-secondary mb-3">
                {selectedDeal.acquisitionType === 'tuck_in'
                  ? 'This business can be tucked into an existing platform for synergies and multiple expansion.'
                  : 'This business can be integrated into an existing platform in the same sector for synergies and multiple expansion.'}
              </p>
              <label className="block text-sm text-text-muted mb-2">Select Platform:</label>
              <select
                value={selectedTuckInPlatform || ''}
                onChange={(e) => setSelectedTuckInPlatform(e.target.value || null)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Acquire as Standalone</option>
                {availablePlatformsForDeal.map(platform => {
                  const { tier } = getSizeRatioTier(selectedDeal.business.ebitda, platform.ebitda);
                  const tierSuffix = tier === 'stretch' ? ' ⚠' : tier === 'strained' ? ' ⚠⚠' : tier === 'overreach' ? ' ⛔' : '';
                  const isForgedAnchor = !platform.isPlatform && platform.integratedPlatformId;
                  const forgedPlatformName = isForgedAnchor
                    ? integratedPlatforms.find(ip => ip.constituentBusinessIds.includes(platform.id))?.name
                    : null;
                  return (
                    <option key={platform.id} value={platform.id}>
                      {forgedPlatformName
                        ? `${forgedPlatformName} — ${platform.name} (EBITDA: ${formatMoney(platform.ebitda)})`
                        : `${platform.name} (Scale ${platform.platformScale}, EBITDA: ${formatMoney(platform.ebitda)})`
                      }{tierSuffix}
                    </option>
                  );
                })}
              </select>
              {selectedTuckInPlatform && (() => {
                const platform = availablePlatformsForDeal.find(p => p.id === selectedTuckInPlatform);
                const affinity = platform ? getSubTypeAffinity(platform.sectorId, platform.subType, selectedDeal.business.subType) : 'distant';
                const sizeInfo = platform ? getSizeRatioTier(selectedDeal.business.ebitda, platform.ebitda) : null;
                return (
                  <div className="mt-2 space-y-1">
                    {affinity === 'match' ? (
                      <p className="text-xs text-green-400 flex items-center gap-1">
                        <span>&#10003;</span> Same sub-type ({selectedDeal.business.subType}) — full synergies expected
                      </p>
                    ) : affinity === 'related' ? (
                      <p className="text-xs text-blue-400 flex items-center gap-1">
                        <span>&#8776;</span> Related sub-types ({platform?.subType} + {selectedDeal.business.subType}) — 75% synergies
                      </p>
                    ) : (
                      <p className="text-xs text-yellow-400 flex items-center gap-1">
                        <span>&#9888;</span> Distant sub-types ({platform?.subType} + {selectedDeal.business.subType}) — 45% synergies
                      </p>
                    )}
                    {sizeInfo && sizeInfo.tier === 'stretch' && (
                      <p className="text-xs text-yellow-400 flex items-center gap-1">
                        <span>&#9888;</span> Stretch fit ({(sizeInfo.ratio).toFixed(1)}x platform size) — reduced synergies, slightly harder integration
                      </p>
                    )}
                    {sizeInfo && sizeInfo.tier === 'strained' && (
                      <p className="text-xs text-orange-400 flex items-center gap-1">
                        <span>&#9888;</span> Strained fit ({(sizeInfo.ratio).toFixed(1)}x platform size) — 50% synergies, significantly harder integration
                      </p>
                    )}
                    {sizeInfo && sizeInfo.tier === 'overreach' && (
                      <p className="text-xs text-red-400 flex items-center gap-1">
                        <span>&#9888;</span> Overreach ({(sizeInfo.ratio).toFixed(1)}x platform size) — 25% synergies, very high integration failure risk
                      </p>
                    )}
                    <p className="text-xs text-accent">
                      Synergies and multiple expansion will be calculated upon acquisition.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
            <div className="card text-center px-2 sm:px-4">
              <p className="text-text-muted text-xs sm:text-sm">EBITDA</p>
              <p className="text-lg sm:text-2xl font-bold font-mono">{formatMoney(selectedDeal.business.ebitda)}</p>
            </div>
            <div className="card text-center px-2 sm:px-4">
              <p className="text-text-muted text-xs sm:text-sm">Price</p>
              <p className="text-lg sm:text-2xl font-bold font-mono">{formatMoney(selectedDeal.effectivePrice)}</p>
              {selectedDeal.effectivePrice > selectedDeal.askingPrice && (
                <p className="text-xs text-text-muted"><span className="line-through">{formatMoney(selectedDeal.askingPrice)}</span></p>
              )}
            </div>
            <div className="card text-center px-2 sm:px-4">
              <p className="text-text-muted text-xs sm:text-sm">Multiple</p>
              <p className="text-lg sm:text-2xl font-bold font-mono">{(selectedDeal.effectivePrice / selectedDeal.business.ebitda).toFixed(1)}x</p>
              {selectedDeal.effectivePrice > selectedDeal.askingPrice && (
                <p className="text-xs text-text-muted"><span className="line-through">{selectedDeal.business.acquisitionMultiple.toFixed(1)}x</span></p>
              )}
            </div>
          </div>

          {/* Cash Position Bar */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Your Cash:</span>
              <span className="font-mono font-bold text-sm">{formatMoney(cash)}</span>
            </div>
            <span className="text-xs text-text-muted">Min. down payment ({minCashPct}%): {formatMoney(minCashForDeal)}</span>
          </div>

          <h4 className="font-bold mb-4">Choose Deal Structure</h4>

          {structures.length === 0 ? (
            <div className="card text-text-muted py-6">
              <div className="text-center mb-6">
                <p className="text-warning font-medium text-base mb-2">Not enough cash for this deal</p>
                <p className="text-sm">
                  Need at least {formatMoney(minCashForDeal)} ({minCashPct}% of {formatMoney(selectedDeal.effectivePrice)})
                </p>
                <p className="text-sm">
                  You have {formatMoney(cash)} — shortfall: <span className="text-warning font-mono">{formatMoney(Math.max(0, minCashForDeal - cash))}</span>
                </p>
              </div>
              {/* In-modal equity raise (hidden in FO mode) */}
              {isFamilyOfficeMode ? (
                <div className="border border-white/10 bg-white/5 rounded-lg p-4">
                  <p className="text-sm text-text-secondary">
                    Not enough cash for this deal. Consider selling a business or choosing a smaller deal.
                  </p>
                </div>
              ) : (() => {
                const shortfall = Math.max(0, Math.round(minCashForDeal) - cash);
                const suggestedRaise = Math.ceil(shortfall / 100) * 100;
                const canRaise = !raiseBlocked && !atOwnershipFloor;
                const parsedAmount = parseInt(modalEquityAmount) || 0;
                const internalAmount = Math.round(parsedAmount / 1000);
                const newShares = effectivePricePerShare > 0 ? Math.round((internalAmount / effectivePricePerShare) * 1000) / 1000 : 0;
                const newTotal = sharesOutstanding + newShares;
                const newOwnership = newTotal > 0 ? founderShares / newTotal * 100 : 100;
                const wouldBreachFloor = newOwnership < ownershipFloorPct;
                return (
                  <div className="border border-accent/30 bg-accent/5 rounded-lg p-4">
                    <h5 className="font-bold text-text-primary mb-3">Raise Capital</h5>
                    {canRaise ? (
                      <>
                        <p className="text-sm text-text-secondary mb-3">
                          Raise equity to unlock deal structures.
                        </p>
                        <p className="text-xs text-text-muted mb-3">
                          Suggested: {formatMoney(suggestedRaise)} (covers shortfall)
                        </p>
                        <div className="flex gap-2 mb-2">
                          <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={modalEquityAmount}
                              onChange={(e) => setModalEquityAmount(e.target.value.replace(/[^0-9]/g, ''))}
                              placeholder={(suggestedRaise * 1000).toLocaleString()}
                              className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2.5 sm:py-2 text-base sm:text-sm"
                            />
                          </div>
                          <button
                            onClick={() => {
                              if (internalAmount > 0 && !wouldBreachFloor) {
                                onIssueEquity(internalAmount);
                                setModalEquityAmount('');
                              }
                            }}
                            disabled={parsedAmount < 1000 || wouldBreachFloor || !canRaise}
                            className="btn-primary text-sm min-h-[44px] whitespace-nowrap"
                          >
                            <span className="hidden sm:inline">Raise Capital</span>
                            <span className="sm:hidden">Raise</span>
                          </button>
                        </div>
                        {parsedAmount >= 1000 && effectivePricePerShare > 0 && (
                          <div className="text-xs space-y-1 mt-2">
                            <p className="text-text-muted">= {newShares.toFixed(1)} shares @ {formatMoney(effectivePricePerShare)}/share{isPublic ? ' (market)' : equityRaisesUsed > 0 ? ` (${Math.round((1 - equityDiscount) * 100)}% discount)` : ''}</p>
                            <p className={`font-medium ${wouldBreachFloor ? 'text-danger' : newOwnership < 55 ? 'text-warning' : 'text-text-secondary'}`}>
                              Ownership: {(founderShares / sharesOutstanding * 100).toFixed(1)}% → {newOwnership.toFixed(1)}%
                            </p>
                            {wouldBreachFloor && <p className="text-danger">Below {ownershipFloorPct}% — raise would be blocked</p>}
                            {isPublic && <p className="text-warning">-{(EQUITY_ISSUANCE_SENTIMENT_PENALTY * 100).toFixed(0)}% market sentiment</p>}
                          </div>
                        )}
                        <p className="text-xs text-text-muted mt-2">{isPublic ? `Sentiment: ${((ipoState?.marketSentiment ?? 0) * 100).toFixed(0)}% · -${(EQUITY_ISSUANCE_SENTIMENT_PENALTY * 100).toFixed(0)}% per issuance` : `Raise #${equityRaisesUsed + 1}${equityRaisesUsed > 0 ? ` — ${Math.round((1 - equityDiscount) * 100)}% investor discount` : ' — no discount'}`}</p>
                      </>
                    ) : (
                      <p className="text-sm text-warning">
                        {negativeEquity ? 'Portfolio equity is negative — pay down debt to enable equity raises.' : atOwnershipFloor ? `At ${ownershipFloorPct}% ownership floor — must maintain majority control.` : raiseCooldownBlocked ? `Cooldown: buyback in Y${lastBuybackRound} — wait ${raiseCooldownRemainder} more yr` : 'Cannot raise equity at this time.'}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {structures.map((structure, index) => (
                <div
                  key={index}
                  className={`card transition-all ${
                    !distressRestrictions.canAcquire || acquisitionsThisRound >= maxAcquisitionsPerRound
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer hover:border-accent'
                  } ${
                    structure.type === 'share_funded' ? 'border-purple-500/30' :
                    structure.risk === 'low' ? 'border-green-500/30' :
                    structure.risk === 'medium' ? 'border-yellow-500/30' :
                    'border-red-500/30'
                  }`}
                  onClick={() => {
                    if (!distressRestrictions.canAcquire || acquisitionsThisRound >= maxAcquisitionsPerRound) return;
                    if (acquiringRef.current) return;
                    acquiringRef.current = true;
                    if (selectedTuckInPlatform) {
                      onAcquireTuckIn?.(selectedDeal, structure, selectedTuckInPlatform);
                    } else {
                      onAcquire(selectedDeal, structure);
                    }
                    setSelectedDeal(null);
                    setSelectedTuckInPlatform(null);
                    setTimeout(() => { acquiringRef.current = false; }, 300);
                  }}
                >
                  <h5 className="font-bold mb-2">{getStructureLabel(structure.type)}</h5>
                  <p className="text-sm text-text-secondary mb-4">{getStructureDescription(structure)}</p>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Cash Required</span>
                      <span className="font-mono">{formatMoney(structure.cashRequired)}</span>
                    </div>
                    {structure.type === 'share_funded' && structure.shareTerms ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Shares to Issue</span>
                          <span className="font-mono text-purple-400">{structure.shareTerms.sharesToIssue.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Dilution</span>
                          <span className="font-mono text-purple-400">{(structure.shareTerms.dilutionPct * 100).toFixed(1)}%</span>
                        </div>
                        <div className="text-xs text-purple-400/70 mt-1">
                          Issues {structure.shareTerms.sharesToIssue.toLocaleString()} shares at {formatMoney(Math.round(ipoState?.stockPrice ?? 0))}/share
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Cash After</span>
                        <span className={`font-mono font-bold ${
                          (cash - structure.cashRequired) >= 5000 ? 'text-green-400' :
                          (cash - structure.cashRequired) >= 2000 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {formatMoney(cash - structure.cashRequired)}
                        </span>
                      </div>
                    )}
                    {structure.sellerNote && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Seller Note</span>
                        <span className="font-mono">{formatMoney(structure.sellerNote.amount)} @ {formatPercent(structure.sellerNote.rate)}</span>
                      </div>
                    )}
                    {structure.bankDebt && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Bank Debt</span>
                        <span className="font-mono">
                          {formatMoney(structure.bankDebt.amount)} @ {formatPercent(structure.bankDebt.rate)}
                          {lendingSynergy > 0 && structure.bankDebt.rate < interestRate && (
                            <span className="ml-1.5 text-[11px] text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded" title={`Private credit synergy: -${(lendingSynergy * 100).toFixed(2)}% on bank debt`} aria-label={`Private credit synergy: ${(lendingSynergy * 100).toFixed(2)} percent discount on bank debt`}>-{(lendingSynergy * 100).toFixed(1)}%</span>
                          )}
                        </span>
                      </div>
                    )}
                    {structure.earnout && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Earnout (if {Math.round(structure.earnout.targetEbitdaGrowth * 100)}%+ growth, 4yr window)</span>
                        <span className="font-mono">{formatMoney(structure.earnout.amount)}</span>
                      </div>
                    )}
                    {structure.rolloverEquityPct != null && structure.rolloverEquityPct > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Seller Rollover</span>
                          <span className="font-mono text-accent">{Math.round(structure.rolloverEquityPct * 100)}% of proceeds</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Your Exit Share</span>
                          <span className="font-mono text-green-400">{Math.round((1 - structure.rolloverEquityPct) * 100)}%</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between pt-2 border-t border-white/10">
                      <span className="text-text-muted">Leverage</span>
                      <span className="font-mono">{structure.leverage.toFixed(1)}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Risk</span>
                      <span className={`font-medium ${
                        structure.risk === 'low' ? 'text-green-400' :
                        structure.risk === 'medium' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {structure.risk.charAt(0).toUpperCase() + structure.risk.slice(1)}
                      </span>
                    </div>
                  </div>

                  <button
                    className={`w-full mt-4 text-sm ${!distressRestrictions.canAcquire || acquisitionsThisRound >= maxAcquisitionsPerRound ? 'btn-primary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
                    disabled={!distressRestrictions.canAcquire || acquisitionsThisRound >= maxAcquisitionsPerRound}
                  >
                    {!distressRestrictions.canAcquire ? 'Blocked — Covenant Breach' : acquisitionsThisRound >= maxAcquisitionsPerRound ? 'Max Acquisitions Reached' : 'Acquire'}
                  </button>
                </div>
              ))}
            </div>

            {/* Scenario B: Collapsible equity raise (hidden in FO mode — no equity raises) */}
            {!isFamilyOfficeMode && (() => {
              if (raiseBlocked || atOwnershipFloor) return null;
              const parsedAmount = parseInt(modalEquityAmount) || 0;
              const internalAmount = Math.round(parsedAmount / 1000);
              const newShares = effectivePricePerShare > 0 ? Math.round((internalAmount / effectivePricePerShare) * 1000) / 1000 : 0;
              const newTotal = sharesOutstanding + newShares;
              const newOwnership = newTotal > 0 ? founderShares / newTotal * 100 : 100;
              const wouldBreachFloor = newOwnership < ownershipFloorPct;
              return (
                <div className="mt-4">
                  <button
                    onClick={() => setShowModalEquityRaise(!showModalEquityRaise)}
                    className="text-sm text-accent hover:text-accent/80 transition-colors flex items-center gap-1 py-2"
                  >
                    {showModalEquityRaise ? '▼' : '▶'} Need more cash?
                  </button>
                  {showModalEquityRaise && (
                    <div className="border border-accent/30 bg-accent/5 rounded-lg p-4 mt-2">
                      <p className="text-sm text-text-secondary mb-3">Raise capital to unlock more deal structures.</p>
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={modalEquityAmount}
                            onChange={(e) => setModalEquityAmount(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="e.g. 5000000"
                            className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2.5 sm:py-2 text-base sm:text-sm"
                          />
                        </div>
                        <button
                          onClick={() => {
                            if (internalAmount > 0 && !wouldBreachFloor) {
                              onIssueEquity(internalAmount);
                              setModalEquityAmount('');
                              setShowModalEquityRaise(false);
                            }
                          }}
                          disabled={parsedAmount < 1000 || wouldBreachFloor}
                          className="btn-primary text-sm min-h-[44px]"
                        >
                          Raise
                        </button>
                      </div>
                      {parsedAmount >= 1000 && effectivePricePerShare > 0 && (
                        <div className="text-xs space-y-1">
                          <p className="text-text-muted">= {newShares.toFixed(1)} shares @ {formatMoney(effectivePricePerShare)}/share{isPublic ? ' (market)' : equityRaisesUsed > 0 ? ` (${Math.round((1 - equityDiscount) * 100)}% discount)` : ''}</p>
                          <p className={`font-medium ${wouldBreachFloor ? 'text-danger' : newOwnership < 55 ? 'text-warning' : 'text-text-secondary'}`}>
                            Ownership: {(founderShares / sharesOutstanding * 100).toFixed(1)}% → {newOwnership.toFixed(1)}%
                          </p>
                          {wouldBreachFloor && <p className="text-danger">Below {ownershipFloorPct}% — raise would be blocked</p>}
                          {isPublic && <p className="text-warning">-{(EQUITY_ISSUANCE_SENTIMENT_PENALTY * 100).toFixed(0)}% market sentiment</p>}
                        </div>
                      )}
                      <p className="text-xs text-text-muted mt-2">{isPublic ? `Sentiment: ${((ipoState?.marketSentiment ?? 0) * 100).toFixed(0)}% · -${(EQUITY_ISSUANCE_SENTIMENT_PENALTY * 100).toFixed(0)}% per issuance` : `Raise #${equityRaisesUsed + 1}${equityRaisesUsed > 0 ? ` — ${Math.round((1 - equityDiscount) * 100)}% investor discount` : ' — no discount'}`}</p>
                    </div>
                  )}
                </div>
              );
            })()}
            </>
          )}

          <div className="mt-6 p-4 bg-white/5 rounded-lg text-sm text-text-muted">
            <p className="font-medium text-text-secondary mb-1">Deal Structuring Tip</p>
            <p>The best holdcos push debt as close to the asset as possible, avoiding parent guarantees unless necessary. Seller notes align incentives; bank debt amplifies returns but amplifies risk too.</p>
          </div>
      </Modal>
    );
  };

  const renderImprovementModal = () => {
    if (!selectedBusinessForImprovement) return null;

    // Look up fresh business from props so applied improvements are reflected
    const business = businesses.find(b => b.id === selectedBusinessForImprovement.id) ?? selectedBusinessForImprovement;

    return (
      <ImprovementModal
        business={business}
        cash={cash}
        round={round}
        maxRounds={maxRoundsFromStore ?? 20}
        onImprove={onImprove}
        onClose={() => setSelectedBusinessForImprovement(null)}
      />
    );
  };

  return (
    <div ref={scrollContainerRef} className="px-4 sm:px-6 py-6 pb-20 md:pb-16" style={{ overscrollBehavior: 'none' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Capital Allocation</h2>
          <p className="text-text-muted text-sm sm:text-base hidden sm:block">Deploy your cash across portfolio companies, new acquisitions, or return it to owners</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-text-muted text-sm">Available Cash</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono text-accent">{formatMoney(cash)}</p>
        </div>
      </div>

      {/* Video tutorial banner — shown early rounds, dismissible */}
      {!videoBannerDismissed && !isFundManagerMode && round <= 4 && onShowVideo && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-accent/5 border border-accent/20 rounded-lg text-sm">
          <button
            onClick={onShowVideo}
            className="flex items-center gap-1.5 text-accent hover:text-accent/80 transition-colors font-medium whitespace-nowrap"
          >
            <span className="text-base">▶</span>
            <span className="hidden sm:inline">New to Holdco Tycoon?</span> Watch the 6-min tutorial
          </button>
          <button
            onClick={() => {
              setVideoBannerDismissed(true);
              localStorage.setItem('holdco-video-banner-dismissed', 'true');
            }}
            className="ml-auto text-text-muted hover:text-text-primary transition-colors text-lg leading-none min-w-[28px] min-h-[28px] flex items-center justify-center"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-2 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg transition-colors whitespace-nowrap text-sm sm:text-base min-h-[44px] flex items-center ${
              activeTab === tab.id
                ? 'bg-accent text-bg-primary font-medium'
                : 'text-text-muted hover:text-text-primary hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-1.5 text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mb-6">
        {activeTab === 'portfolio' && (
          <div>
            {/* Active Turnarounds Summary */}
            {activeTurnarounds.filter(t => t.status === 'active').length > 0 && (
              <div className="card bg-amber-500/5 border-amber-500/30 mb-6">
                <button
                  onClick={() => setShowTurnaroundSummary(!showTurnaroundSummary)}
                  className="flex items-center justify-between w-full text-left min-h-[44px]"
                >
                  <span className="font-bold text-amber-400">
                    Active Turnarounds ({activeTurnarounds.filter(t => t.status === 'active').length})
                  </span>
                  <span className="text-text-muted text-sm">{showTurnaroundSummary ? '▲' : '▼'}</span>
                </button>
                {showTurnaroundSummary && (
                  <div className="mt-3 space-y-2">
                    {activeTurnarounds.filter(t => t.status === 'active').length >= TURNAROUND_FATIGUE_THRESHOLD && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-xs text-amber-400">
                        Portfolio fatigue: {activeTurnarounds.filter(t => t.status === 'active').length} active turnarounds. Success rates reduced by 10ppt.
                      </div>
                    )}
                    {activeTurnarounds.filter(t => t.status === 'active').map(ta => {
                      const prog = getProgramById(ta.programId);
                      const biz = activeBusinesses.find(b => b.id === ta.businessId);
                      if (!prog || !biz) return null;
                      const roundsLeft = ta.endRound - round;
                      const totalDuration = ta.endRound - ta.startRound;
                      const progress = totalDuration > 0 ? Math.round(((totalDuration - roundsLeft) / totalDuration) * 100) : 100;
                      return (
                        <div key={ta.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-2">
                          <span className="text-sm">{SECTORS[biz.sectorId]?.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-medium truncate">{biz.name}</span>
                              <span className="text-xs text-amber-400 whitespace-nowrap">{prog.displayName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Turnaround progress: ${progress}%`}>
                                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                              </div>
                              <span className="text-xs text-text-muted whitespace-nowrap">{roundsLeft > 0 ? `${roundsLeft}yr left` : 'Resolving...'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Completed turnarounds badges */}
                    {activeTurnarounds.filter(t => t.status !== 'active').length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-2">
                        {activeTurnarounds.filter(t => t.status !== 'active').map(ta => {
                          const biz = [...activeBusinesses, ...(allBusinesses || [])].find(b => b.id === ta.businessId);
                          return (
                            <span key={ta.id} className={`text-xs px-2 py-1 rounded ${
                              ta.status === 'completed' ? 'bg-green-500/15 text-green-400' :
                              ta.status === 'partial' ? 'bg-yellow-500/15 text-yellow-400' :
                              'bg-red-500/15 text-red-400'
                            }`}>
                              {biz?.name ?? 'Unknown'}: {ta.status}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Roll-up Strategy Actions */}
            {activeBusinesses.length >= 2 && (
              <div className="card bg-accent/5 border-accent/30 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold flex items-center gap-2">
                      Roll-Up Strategy
                      <button
                        onClick={() => setShowRollUpGuide(true)}
                        className="text-text-muted hover:text-accent text-sm font-normal"
                        title="Learn about roll-up strategy"
                      >
                        (?)
                      </button>
                    </h3>
                    <p className="text-sm text-text-muted">
                      {platforms.length > 0
                        ? `${platforms.length} platform${platforms.length > 1 ? 's' : ''} active. Acquire tuck-ins to grow scale.`
                        : 'Designate a platform or merge businesses to unlock roll-up strategy.'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {mergeableSectors.length > 0 && (
                      <button
                        onClick={() => setShowMergeModal(true)}
                        className="btn-secondary text-sm"
                      >
                        Merge Businesses
                      </button>
                    )}
                  </div>
                </div>
                {platforms.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs text-text-muted mb-2">Active Platforms:</p>
                    <div className="flex flex-wrap gap-2">
                      {platforms.map(p => (
                        <span key={p.id} className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">
                          {SECTORS[p.sectorId].emoji} {p.name} (Scale {p.platformScale}, {p.boltOnIds.length} bolt-ons)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Integration outcome warnings (partial = rocky, failure = troubled) */}
            {actionsThisRound
              .filter(a =>
                (a.type === 'acquire_tuck_in' || a.type === 'merge_businesses') &&
                (a.details?.integrationOutcome === 'failure' || a.details?.integrationOutcome === 'partial') &&
                !dismissedWarnings.has(`${a.type}-${a.details?.businessId ?? a.details?.newName}`)
              )
              .map((a, i) => {
                const d = a.details;
                const outcome = d.integrationOutcome as string;
                const dismissKey = `${a.type}-${d.businessId ?? d.newName}`;
                const isTroubled = outcome === 'failure';
                let description: string;
                if (isTroubled) {
                  const cost = d.restructuringCost as number;
                  const drag = Math.abs(d.growthDragPenalty as number) * 100;
                  if (a.type === 'acquire_tuck_in') {
                    const platform = businesses.find(b => b.id === d.platformId);
                    const boltOn = businesses.find(b => b.id === d.businessId);
                    description = `Tuck-in of ${boltOn?.name ?? 'bolt-on'} into ${platform?.name ?? 'platform'} was troubled. ${formatMoney(cost)} restructuring cost deducted and ${platform?.name ?? 'platform'}'s growth reduced by ${drag.toFixed(1)}% (decays over ~3 years).`;
                  } else {
                    description = `Merger into ${d.newName as string} was troubled. ${formatMoney(cost)} restructuring cost deducted and growth reduced by ${drag.toFixed(1)}% (decays over ~3 years).`;
                  }
                } else {
                  // partial = rocky
                  if (a.type === 'acquire_tuck_in') {
                    const platform = businesses.find(b => b.id === d.platformId);
                    const boltOn = businesses.find(b => b.id === d.businessId);
                    description = `Tuck-in of ${boltOn?.name ?? 'bolt-on'} into ${platform?.name ?? 'platform'} hit integration friction. Synergies reduced.`;
                  } else {
                    description = `Merger into ${d.newName as string} hit integration friction. Synergies reduced.`;
                  }
                }
                return (
                  <div key={i} className={`${isTroubled ? 'bg-red-900/20 border-red-500/30' : 'bg-amber-900/20 border-amber-500/30'} border rounded-xl p-4 mb-4`}>
                    <div className="flex items-start gap-3">
                      <span className="text-lg">{isTroubled ? '⚠️' : '⚡'}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-bold text-sm ${isTroubled ? 'text-red-400' : 'text-amber-400'}`}>{isTroubled ? 'Troubled Integration' : 'Rocky Integration'}</h4>
                        <p className="text-xs text-text-secondary mt-1">{description}</p>
                      </div>
                      <button
                        onClick={() => setDismissedWarnings(prev => new Set(prev).add(dismissKey))}
                        className="text-text-muted hover:text-text-primary text-lg leading-none"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* Active Integrated Platforms */}
            {integratedPlatforms.length > 0 && (
              <div className="card bg-purple-500/5 border-purple-500/30 mb-6">
                <h3 className="font-bold text-purple-400 mb-3">Integrated Platforms</h3>
                <div className="space-y-3">
                  {integratedPlatforms.map(ip => {
                    const constituentNames = ip.constituentBusinessIds
                      .map(id => businesses.find(b => b.id === id)?.name)
                      .filter(Boolean);
                    const sectorEmojis = ip.sectorIds
                      .map(sid => SECTORS[sid]?.emoji)
                      .filter(Boolean)
                      .join(' ');
                    const eligibleToAdd = getEligibleBusinessesForExistingPlatform(ip, businesses);
                    return (
                      <div key={ip.id} className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-medium text-sm truncate min-w-0">{sectorEmojis} {ip.name}</span>
                          <span className="text-xs text-text-muted whitespace-nowrap flex-shrink-0">Forged Year {ip.forgedInRound}</span>
                        </div>
                        <p className="text-xs text-text-muted mb-2 break-words">
                          {constituentNames.join(', ')}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="bg-green-500/15 text-green-400 px-2 py-0.5 rounded">
                            +{formatPercent(ip.bonuses.marginBoost)} margin
                          </span>
                          <span className="bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded">
                            +{formatPercent(ip.bonuses.growthBoost)} growth
                          </span>
                          <span className="bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded">
                            +{ip.bonuses.multipleExpansion.toFixed(1)}x exit multiple
                          </span>
                          {ip.bonuses.recessionResistanceReduction < 1.0 && (
                            <span className="bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded">
                              {Math.round((1 - ip.bonuses.recessionResistanceReduction) * 100)}% recession shield
                            </span>
                          )}
                        </div>
                        {eligibleToAdd.length > 0 && (
                          <div className="mt-3 border-t border-white/10 pt-2">
                            <p className="text-xs text-purple-300 mb-2">Add to platform:</p>
                            <div className="space-y-1">
                              {eligibleToAdd.map(biz => {
                                const addCost = calculateAddToPlatformCost(ip, biz);
                                const canAfford = cash >= addCost;
                                return (
                                  <div key={biz.id} className="flex items-center justify-between gap-2 text-xs bg-white/5 rounded px-2 py-1.5">
                                    <span className="truncate min-w-0">{SECTORS[biz.sectorId].emoji} {biz.name}</span>
                                    <button
                                      onClick={() => onAddToIntegratedPlatform(ip.id, biz.id, biz.name, addCost)}
                                      disabled={!canAfford}
                                      className={`whitespace-nowrap flex-shrink-0 px-2 py-1 rounded font-medium transition-colors ${
                                        canAfford
                                          ? 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer'
                                          : 'bg-white/5 text-text-muted cursor-not-allowed'
                                      }`}
                                    >
                                      Add ({formatMoney(addCost)})
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => setSellPlatformConfirm(ip)}
                          className="mt-3 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg border border-purple-500/50 hover:border-purple-400 shadow-sm hover:shadow-md hover:shadow-purple-500/20 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
                        >
                          Sell Platform (+{getPlatformSaleBonus(ip.bonuses.multipleExpansion).toFixed(1)}x bonus)
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Eligible Platform Integrations */}
            {eligiblePlatformRecipes.length > 0 && (
              <div className="card bg-purple-500/5 border-purple-500/30 mb-6">
                <h3 className="font-bold text-purple-400 mb-1">Available Integrations</h3>
                <p className="text-sm text-text-muted mb-4">
                  Combine complementary businesses into an integrated platform for permanent bonuses.
                </p>
                <div className="space-y-4">
                  {eligiblePlatformRecipes.map(({ recipe, eligibleBusinesses: eligible }) => {
                    const cost = calculateIntegrationCost(recipe, eligible);
                    const canAfford = cash >= cost;
                    const sectorEmojis = recipe.sectorId
                      ? SECTORS[recipe.sectorId]?.emoji ?? ''
                      : (recipe.crossSectorIds ?? []).map(sid => SECTORS[sid]?.emoji).filter(Boolean).join(' ');
                    return (
                      <div key={recipe.id} className="bg-white/5 rounded-lg p-4">
                        <div className="mb-2">
                          <h4 className="font-bold text-sm break-words">{sectorEmojis} {recipe.name}</h4>
                          <p className="text-xs text-text-secondary mt-1 break-words">{recipe.description}</p>
                          {recipe.realWorldExample && (
                            <p className="text-xs text-text-muted mt-1 italic break-words">e.g. {recipe.realWorldExample}</p>
                          )}
                        </div>
                        <div className="mt-3 mb-3">
                          <p className="text-xs text-text-muted mb-1">Qualifying businesses:</p>
                          <div className="flex flex-wrap gap-1">
                            {eligible.map(b => (
                              <span key={b.id} className="text-xs bg-white/10 px-2 py-1 rounded truncate max-w-full inline-block">
                                {SECTORS[b.sectorId].emoji} {b.name} ({b.subType})
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                          <div className="bg-green-500/10 rounded p-2 text-center">
                            <p className="text-text-muted">Margin</p>
                            <p className="font-bold text-green-400">+{formatPercent(recipe.bonuses.marginBoost)}</p>
                          </div>
                          <div className="bg-blue-500/10 rounded p-2 text-center">
                            <p className="text-text-muted">Growth</p>
                            <p className="font-bold text-blue-400">+{formatPercent(recipe.bonuses.growthBoost)}</p>
                          </div>
                          <div className="bg-purple-500/10 rounded p-2 text-center">
                            <p className="text-text-muted">Exit Multiple</p>
                            <p className="font-bold text-purple-400">+{recipe.bonuses.multipleExpansion.toFixed(1)}x</p>
                          </div>
                          <div className="bg-yellow-500/10 rounded p-2 text-center">
                            <p className="text-text-muted">Recession</p>
                            <p className="font-bold text-yellow-400">-{Math.round((1 - recipe.bonuses.recessionResistanceReduction) * 100)}%</p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <span className="text-sm font-mono">
                            Cost: <span className={canAfford ? 'text-text-primary' : 'text-danger'}>{formatMoney(cost)}</span>
                          </span>
                          <button
                            onClick={() => setForgeConfirm({
                              recipeId: recipe.id,
                              businessIds: eligible.map(b => b.id),
                            })}
                            disabled={!canAfford}
                            className={`btn-primary text-sm px-4 py-3 min-h-[44px] w-full sm:w-auto ${!canAfford ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            Forge Platform
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Near-Eligible Platform Integrations (sub-types met, EBITDA not yet) */}
            {nearEligibleRecipes.length > 0 && (
              <div className="card bg-white/5 border border-white/10 mb-6">
                <h3 className="font-bold text-text-secondary mb-1">Platforms in Progress</h3>
                <p className="text-sm text-text-muted mb-4">
                  You have the right business mix — {nearEligibleRecipes.some(r => r.qualityBlockers.length > 0 && r.sectorEbitda >= r.scaledThreshold)
                    ? 'stabilize Q1/Q2 businesses and grow sector EBITDA to unlock these integrations.'
                    : 'grow your sector EBITDA to unlock these integrations.'}
                </p>
                <div className="space-y-3">
                  {nearEligibleRecipes.map(({ recipe, matchingBusinesses, sectorEbitda, scaledThreshold, qualityBlockers }) => {
                    const progress = Math.min(sectorEbitda / scaledThreshold, 0.99);
                    const progressPct = Math.round(progress * 100);
                    const ebitdaMet = sectorEbitda >= scaledThreshold;
                    const sectorEmojis = recipe.sectorId
                      ? SECTORS[recipe.sectorId]?.emoji ?? ''
                      : (recipe.crossSectorIds ?? []).map(sid => SECTORS[sid]?.emoji).filter(Boolean).join(' ');
                    return (
                      <div key={recipe.id} className="bg-white/5 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="font-bold text-sm text-text-secondary break-words">{sectorEmojis} {recipe.name}</h4>
                          <span className="text-xs text-text-muted whitespace-nowrap flex-shrink-0">Almost Ready</span>
                        </div>
                        <p className="text-xs text-text-muted mb-2 break-words">{recipe.description}</p>
                        <p className="text-xs text-text-muted mb-1">Matching businesses:</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {matchingBusinesses.map(b => (
                            <span key={b.id} className={`text-xs px-2 py-1 rounded truncate max-w-full inline-block ${b.qualityRating < 3 ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10'}`}>
                              {SECTORS[b.sectorId].emoji} {b.name} ({b.subType}){b.qualityRating < 3 ? ` · Q${b.qualityRating}` : ''}
                            </span>
                          ))}
                        </div>
                        {qualityBlockers.length > 0 && (
                          <div className="text-xs text-amber-400 mb-2">
                            Platform requires Q3+ quality — {qualityBlockers.map(b => b.name).join(', ')} {qualityBlockers.length === 1 ? 'is' : 'are'} Q{Math.min(...qualityBlockers.map(b => b.qualityRating))}
                          </div>
                        )}
                        {!ebitdaMet && (
                          <>
                            <div className="text-xs text-text-muted mb-1">
                              Sector EBITDA: <span className="font-mono text-text-secondary">{formatMoney(sectorEbitda)}</span> / <span className="font-mono">{formatMoney(scaledThreshold)}</span> required
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-2 mt-1">
                              <div
                                className="bg-purple-500/60 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <p className="text-xs text-text-muted mt-1 text-right font-mono">{progressPct}%</p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeBusinesses.length > 0 && (
              <div className="mb-3">
                <CardListControls
                  count={sortedBusinesses.length}
                  itemLabel="businesses"
                  sortOptions={[
                    { value: 'ebitda', label: 'EBITDA' },
                    { value: 'fcf', label: 'FCF' },
                    { value: 'moic', label: 'MOIC' },
                    { value: 'quality', label: 'Quality' },
                    { value: 'growth', label: 'Growth' },
                    { value: 'sector', label: 'Sector' },
                    { value: 'name', label: 'Name' },
                  ]}
                  currentSort={portfolioSort}
                  onSortChange={setPortfolioSort}
                  allExpanded={allBusinessesExpanded}
                  onToggleExpand={toggleAllBusinesses}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedBusinesses.map(business => (
                <BusinessCard
                  key={business.id}
                  business={business}
                  onSell={() => setSellConfirmBusiness(business)}
                  onImprove={() => setSelectedBusinessForImprovement(business)}
                  onDesignatePlatform={!business.isPlatform && onDesignatePlatform ? () => onDesignatePlatform(business.id) : undefined}

                  onShowRollUpGuide={() => setShowRollUpGuide(true)}
                  isPlatform={business.isPlatform}
                  platformScale={business.platformScale}
                  boltOnCount={business.boltOnIds?.length || 0}
                  canAffordPlatform={cash >= business.ebitda * 0.05}
                  currentRound={round}
                  lastEventType={lastEventType}
                  integratedPlatforms={integratedPlatforms}
                  activeTurnaround={activeTurnarounds.find(t => t.businessId === business.id && t.status === 'active') ?? null}
                  turnaroundEligible={turnaroundTier > 0 && getEligiblePrograms(business, turnaroundTier, activeTurnarounds).length > 0}
                  onStartTurnaround={turnaroundTier > 0 ? () => setTurnaroundBusiness(business) : undefined}
                  collapsible={isMobile}
                  isExpanded={!isMobile || expandedBusinessIds.has(business.id)}
                  onToggle={() => toggleBusiness(business.id)}
                />
              ))}
              {activeBusinesses.length === 0 && (
                <div className="col-span-full card text-center text-text-muted py-12">
                  <p>No businesses in your portfolio yet.</p>
                  <p className="text-sm mt-2">Check the Deals tab to acquire your first company.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'deals' && (
          <div>
            {/* Fund Mode: Year 9 warning + Year 10 block */}
            {isFundManagerMode && round === maxRounds && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                <p className="font-bold text-red-300 mb-1">Fund Closes This Year</p>
                <p className="text-sm text-text-muted">Unsold businesses will be liquidated at a 10% discount. Tuck-ins are still permitted. Consider distributing cash to lock in your DPI.</p>
              </div>
            )}
            {isFundManagerMode && round === maxRounds - 1 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
                <p className="font-bold text-amber-300 mb-1">Final Year Next Round</p>
                <p className="text-sm text-text-muted">All remaining businesses will be liquidated at <strong className="text-amber-300">90% of market value</strong>. Sell businesses now for full value or distribute cash to lock in your DPI.</p>
              </div>
            )}
            {/* M&A Focus Settings */}
            <div className="card mb-6">
              <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold flex items-center gap-2">
                    M&A Focus
                    {aiEnabled && (
                      <span className="text-[10px] text-accent px-1.5 py-0.5 bg-accent/10 rounded sm:hidden">AI</span>
                    )}
                  </h3>
                  <p className="text-sm text-text-muted hidden sm:block">Set your acquisition preferences to see more relevant deals</p>
                </div>
                <div className="flex gap-2 items-center shrink-0">
                  <button
                    onClick={() => setShowMarketGuide(true)}
                    className="btn-secondary text-xs sm:text-sm flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-0 px-2 sm:px-3"
                  >
                    <span>📊</span><span className="hidden sm:inline"> Market Guide</span>
                  </button>
                  {aiEnabled && (
                    <span className="text-xs text-accent items-center gap-1 px-2 py-1 bg-accent/10 rounded hidden sm:flex">
                      <span>🤖</span> AI Enhanced
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm text-text-muted mb-1 sm:mb-2 hidden sm:block">Target Sector</label>
                  <select
                    aria-label="Target Sector"
                    value={maFocus.sectorId || ''}
                    onChange={(e) => onSetMAFocus(
                      e.target.value ? e.target.value as SectorId : null,
                      maFocus.sizePreference
                    )}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">Any Sector</option>
                    {getAvailableSectors(isFamilyOfficeMode, getUnlockedSectorIds(isAnonymous)).map(sector => (
                      <option key={sector.id} value={sector.id}>
                        {sector.emoji} {sector.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1 sm:mb-2 hidden sm:block">Target Size</label>
                  <select
                    aria-label="Target Size"
                    value={maFocus.sectorId === 'proSports' ? 'trophy' : maFocus.sizePreference}
                    onChange={(e) => onSetMAFocus(
                      maFocus.sectorId,
                      e.target.value as DealSizePreference
                    )}
                    disabled={maFocus.sectorId === 'proSports'}
                    className={`w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent${maFocus.sectorId === 'proSports' ? ' opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <option value="any">Any Size</option>
                    <option value="micro">Micro ($500K-$1.5M)</option>
                    <option value="small">Small ($1.5M-$4M)</option>
                    <option value="mid_market">Mid-Market ($4M-$10M)</option>
                    <option value="upper_mid">Upper-Mid ($10M-$25M)</option>
                    <option value="institutional">Institutional ($25M-$50M)</option>
                    <option value="marquee">Marquee ($50M-$75M)</option>
                    <option value="trophy">Trophy ($75M+)</option>
                  </select>
                </div>
              </div>
              {/* Sub-type targeting (Tier 2+, active, sector selected) */}
              {maSourcing.active && maSourcing.tier >= 2 && maFocus.sectorId && (
                <div className="mt-4">
                  <label className="block text-sm text-text-muted mb-2">Target Sub-Type</label>
                  <select
                    value={maFocus.subType || ''}
                    onChange={(e) => onSetMAFocus(
                      maFocus.sectorId,
                      maFocus.sizePreference,
                      e.target.value || null
                    )}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">Any Sub-Type</option>
                    {SECTORS[maFocus.sectorId].subTypes.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                  <p className="text-xs text-accent mt-1">
                    Industry Specialists will source {maFocus.subType ? `"${maFocus.subType}"` : 'targeted'} deals each round
                  </p>
                </div>
              )}

              {maFocus.sectorId && !maSourcing.active && (
                <p className="text-xs text-accent mt-3">
                  Your M&A focus will generate more {SECTORS[maFocus.sectorId].name} deals next year.
                </p>
              )}

              {/* Small Business Broker — available before MA Sourcing Tier 1 */}
              {!(maSourcing.active && maSourcing.tier >= 1) && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Hire Small Biz Broker</p>
                      <p className="text-xs text-text-muted">
                        Source 1 affordable micro deal from a Main Street broker
                      </p>
                    </div>
                    <button
                      onClick={onSMBBroker}
                      disabled={cash < SMB_BROKER_COST_LOCAL}
                      aria-label="Hire Small Business Broker for $75K"
                      className={`btn-secondary text-sm whitespace-nowrap ${
                        cash >= SMB_BROKER_COST_LOCAL ? 'border-green-500' : ''
                      }`}
                    >
                      Broker ({formatMoney(SMB_BROKER_COST_LOCAL)})
                    </button>
                  </div>
                </div>
              )}

              {/* Source Additional Deals */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Need more deal flow?</p>
                    <p className="text-xs text-text-muted">
                      Hire an investment banker to source 3 additional deals
                      {maFocus.sectorId && ` (weighted toward ${SECTORS[maFocus.sectorId].name})`}
                      {maSourcing.active && maSourcing.tier >= 1 && ' — discounted rate'}
                    </p>
                  </div>
                  <button
                    onClick={onSourceDeals}
                    disabled={cash < dealSourcingCost}
                    className={`btn-secondary text-sm whitespace-nowrap ${
                      cash >= dealSourcingCost ? 'border-accent' : ''
                    }`}
                  >
                    Source Deals ({formatMoney(dealSourcingCost)})
                  </button>
                </div>

                {/* Proactive Outreach (Tier 3 only) */}
                {maSourcing.active && maSourcing.tier >= 3 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                    <div>
                      <p className="text-sm font-medium">Proactive Outreach</p>
                      <p className="text-xs text-text-muted">
                        2 targeted quality-3+ deals
                        {maFocus.subType && ` in ${maFocus.subType}`}
                      </p>
                    </div>
                    <button
                      onClick={onProactiveOutreach}
                      disabled={cash < PROACTIVE_OUTREACH_COST}
                      className={`btn-secondary text-sm whitespace-nowrap ${
                        cash >= PROACTIVE_OUTREACH_COST ? 'border-purple-500' : ''
                      }`}
                    >
                      Outreach ({formatMoney(PROACTIVE_OUTREACH_COST)})
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Snatched banner */}
            {lastAcquisitionResult === 'snatched' && (
              <div className="bg-red-500/15 border border-red-500/30 rounded-lg p-3 mb-4 flex items-center justify-between">
                <p className="text-sm text-red-400 font-medium">
                  Another buyer outbid you! The deal is off the table.
                </p>
              </div>
            )}

            {/* Acquisition counter */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 relative group/acqlimit">
                <span className={`text-sm font-medium cursor-help ${acquisitionsThisRound >= maxAcquisitionsPerRound ? 'text-warning' : 'text-text-secondary'}`}>
                  Acquisitions: {maxAcquisitionsPerRound - acquisitionsThisRound}/{maxAcquisitionsPerRound} remaining
                </span>
                {acquisitionsThisRound >= maxAcquisitionsPerRound && (
                  <span className="text-xs bg-warning/20 text-warning px-2 py-1 rounded">Limit reached</span>
                )}
                <div className="absolute left-0 top-full mt-1 w-64 p-3 bg-bg-primary border border-white/10 rounded-lg shadow-xl text-xs text-text-secondary opacity-0 invisible group-hover/acqlimit:opacity-100 group-hover/acqlimit:visible transition-all z-50">
                  <p className="font-medium text-text-primary mb-1">Acquisition Attempts</p>
                  <p>You can attempt {maxAcquisitionsPerRound} acquisitions per year{maSourcing.tier >= 1 ? ` (boosted by M&A Sourcing Tier ${maSourcing.tier})` : ''}. Tuck-ins count toward this limit. Contested deals may be snatched by competing buyers, consuming your attempt without spending cash.</p>
                </div>
              </div>
              {passedDealIdSet.size > 0 && (
                <button
                  onClick={() => setShowPassedDeals(!showPassedDeals)}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassedDeals ? 'Hide' : 'Show'} {passedDealIdSet.size} passed deal{passedDealIdSet.size !== 1 ? 's' : ''}
                </button>
              )}
            </div>

            {/* Cash Context Bar */}
            {dealPipeline.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 sm:px-4 py-2 mb-4 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="text-text-muted">Available:</span>
                  <span className="font-mono font-bold">{formatMoney(cash)}</span>
                </span>
                <span className="hidden sm:inline text-white/20">|</span>
                <span className="text-text-muted text-xs sm:text-sm">
                  {dealPipeline.filter(d => cash >= Math.round(d.effectivePrice * 0.25)).length} of {dealPipeline.length} deals affordable
                </span>
                <span className="hidden sm:inline text-white/20">|</span>
                <span className="text-text-muted text-xs sm:text-sm">
                  {negativeEquity ? 'Negative equity' : atOwnershipFloor ? `At ${ownershipFloorPct}% ownership floor` : isPublic ? `Market price${raiseCooldownBlocked ? ` (cooldown: ${raiseCooldownRemainder}yr)` : ''}` : `Next raise: ${equityRaisesUsed > 0 ? `${Math.round((1 - equityDiscount) * 100)}% discount` : 'no discount'}${raiseCooldownBlocked ? ` (cooldown: ${raiseCooldownRemainder}yr)` : ''}`}
                </span>
              </div>
            )}

            {/* Deal sort/filter controls */}
            {dealPipeline.length > 0 && (
              <div className="mb-3">
                <CardListControls
                  count={filteredSortedDeals.length}
                  itemLabel="deals"
                  sortOptions={[
                    { value: 'freshness', label: 'Freshness' },
                    { value: 'price_low', label: 'Price Low→High' },
                    { value: 'price_high', label: 'Price High→Low' },
                    { value: 'ebitda', label: 'EBITDA' },
                    { value: 'quality', label: 'Quality' },
                    { value: 'heat', label: 'Heat' },
                    { value: 'multiple', label: 'Multiple' },
                  ]}
                  currentSort={dealSort}
                  onSortChange={setDealSort}
                  filterOptions={dealFilterOptions}
                  activeFilters={dealFilters}
                  onFilterChange={setDealFilters}
                  allExpanded={allDealsExpanded}
                  onToggleExpand={toggleAllDeals}
                />
              </div>
            )}

            {/* Deals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSortedDeals.map((deal, index) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onSelect={() => setSelectedDeal(deal)}
                  disabled={!distressRestrictions.canAcquire || acquisitionsThisRound >= maxAcquisitionsPerRound}
                  unaffordable={cash < Math.round(deal.effectivePrice * 0.25)}
                  leagueBlocked={deal.business.sectorId === 'proSports' && ownedProSportsSubTypes.includes(deal.business.subType)}
                  availablePlatforms={getPlatformsForSector(deal.business.sectorId)}
                  isPassed={passedDealIdSet.has(deal.id)}
                  onPass={() => onPassDeal(deal.id)}
                  collapsible={isMobile}
                  isExpanded={!isMobile || expandedDealIds.has(deal.id)}
                  onToggle={() => toggleDeal(deal.id)}
                  showSwipeHint={index === 0 && isMobile && swipeHintCount.current < 3}
                  onSwipeUsed={() => {
                    if (swipeHintCount.current < 3) {
                      swipeHintCount.current++;
                      localStorage.setItem('holdco-swipe-hint-count', String(swipeHintCount.current));
                    }
                  }}
                />
              ))}
              {dealPipeline.length === 0 && (
                <div className="col-span-full card text-center text-text-muted py-12">
                  <p>No deals available this year.</p>
                  <p className="text-sm mt-2">New opportunities will appear next year.</p>
                </div>
              )}
              {dealPipeline.length > 0 && filteredSortedDeals.length === 0 && !showPassedDeals && (
                <div className="col-span-full card text-center text-text-muted py-12">
                  <p>{dealFilters.length > 0 ? 'No deals match your filters.' : 'All deals passed on.'}</p>
                  <p className="text-sm mt-2">
                    {dealFilters.length > 0 ? (
                      <button
                        onClick={() => setDealFilters([])}
                        className="text-accent hover:underline"
                      >
                        Clear filters
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowPassedDeals(true)}
                        className="text-accent hover:underline"
                      >
                        Show passed deals
                      </button>
                    )}
                    {' '}or source new ones above.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'shared_services' && (
          <div>
            {/* M&A Infrastructure (separate from operational shared services) */}
            <div className="card mb-6 border-purple-500/30 bg-purple-500/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    M&A Infrastructure
                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">Separate from Shared Services</span>
                  </h3>
                  <p className="text-sm text-text-muted">
                    Unlock extra acquisitions per round and build proprietary deal flow
                  </p>
                </div>
                {maSourcing.tier > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">Annual: {formatMoney(getMASourcingAnnualCost(maSourcing.tier))}</span>
                    <button
                      onClick={onToggleMASourcing}
                      className={`text-xs px-3 py-1 rounded transition-colors ${
                        maSourcing.active
                          ? 'bg-purple-500/20 text-purple-400 hover:bg-red-500/20 hover:text-red-400'
                          : 'bg-white/10 text-text-muted hover:bg-purple-500/20 hover:text-purple-400'
                      }`}
                    >
                      {maSourcing.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                )}
              </div>

              {/* Tier Progress */}
              <div className="flex items-center gap-3 mb-4">
                {[1, 2, 3].map(tier => {
                  const config = MA_SOURCING_CONFIG[tier as 1 | 2 | 3];
                  const isUnlocked = maSourcing.tier >= tier;
                  const isCurrent = maSourcing.tier === tier;
                  const isNext = maSourcing.tier === tier - 1;
                  return (
                    <div
                      key={tier}
                      className={`flex-1 rounded-lg p-3 border transition-colors ${
                        isUnlocked
                          ? isCurrent && maSourcing.active
                            ? 'border-purple-500/50 bg-purple-500/10'
                            : 'border-white/20 bg-white/5'
                          : isNext
                            ? 'border-dashed border-purple-500/30'
                            : 'border-white/5 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">Tier {tier}</span>
                        {isUnlocked && (
                          <span className="text-xs text-purple-400">&#10003;</span>
                        )}
                      </div>
                      <p className="text-xs font-medium mb-1">{config.name}</p>
                      <p className="text-xs text-text-muted">{formatMoney(config.annualCost)}/yr</p>
                    </div>
                  );
                })}
              </div>

              {/* Current tier effects */}
              {maSourcing.tier > 0 && maSourcing.active && (
                <div className="bg-white/5 rounded-lg p-3 mb-4">
                  <p className="text-xs font-medium text-purple-400 mb-2">
                    Active: {MA_SOURCING_CONFIG[maSourcing.tier as 1 | 2 | 3].name}
                  </p>
                  <ul className="space-y-1">
                    {MA_SOURCING_CONFIG[maSourcing.tier as 1 | 2 | 3].effects.map((effect, i) => (
                      <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                        <span className="text-purple-400 mt-0.5">&#8226;</span>
                        {effect}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Upgrade button */}
              {maSourcing.tier < 3 && (() => {
                const nextTier = (maSourcing.tier + 1) as 1 | 2 | 3;
                const config = MA_SOURCING_CONFIG[nextTier];
                const upgradeCost = getMASourcingUpgradeCost(maSourcing.tier);
                const opcoCount = activeBusinesses.length;
                const hasEnoughOpcos = opcoCount >= config.requiredOpcos;
                const canAffordUpgrade = cash >= upgradeCost;
                const disabled = !hasEnoughOpcos || !canAffordUpgrade;

                return (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {maSourcing.tier === 0 ? 'Build' : 'Upgrade to'} {config.name}
                      </p>
                      <p className="text-xs text-text-muted">
                        {!hasEnoughOpcos
                          ? `Requires ${config.requiredOpcos}+ opcos (you have ${opcoCount})`
                          : `${formatMoney(upgradeCost)} one-time + ${formatMoney(config.annualCost)}/yr`
                        }
                      </p>
                    </div>
                    <button
                      onClick={onUpgradeMASourcing}
                      disabled={disabled}
                      className={`btn-primary text-sm ${disabled ? 'opacity-50' : 'bg-purple-600 hover:bg-purple-500'}`}
                    >
                      {!hasEnoughOpcos
                        ? `Need ${config.requiredOpcos} Opcos`
                        : !canAffordUpgrade
                          ? 'Not Enough Cash'
                          : `${maSourcing.tier === 0 ? 'Build' : 'Upgrade'} (${formatMoney(upgradeCost)})`
                      }
                    </button>
                  </div>
                );
              })()}

              {maSourcing.tier >= 3 && (
                <p className="text-xs text-purple-400 text-center">Fully upgraded — Proprietary Network active</p>
              )}
            </div>

            {/* Turnaround Operations */}
            {activeBusinesses.length >= 2 && (
              <div className="card mb-6 border-amber-500/30 bg-amber-500/5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2 flex-wrap">
                      Turnaround Operations
                      {turnaroundTier > 0 && (
                        <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                          Tier {turnaroundTier}: {TURNAROUND_TIER_CONFIG[turnaroundTier as 1 | 2 | 3].name}
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-text-muted">
                      {turnaroundTier > 0
                        ? `Deploy turnaround programs to improve struggling businesses (${formatMoney(getTurnaroundTierAnnualCost(turnaroundTier))}/yr)`
                        : 'Unlock structured turnaround capabilities for your portfolio'}
                    </p>
                  </div>
                  {turnaroundTier > 0 && activeTurnarounds.filter(t => t.status === 'active').length > 0 && (
                    <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded whitespace-nowrap">
                      {activeTurnarounds.filter(t => t.status === 'active').length} active
                    </span>
                  )}
                </div>

                {/* Tier Progress — 3-tier horizontal bar */}
                <div className="flex items-center gap-3 mb-4">
                  {([1, 2, 3] as const).map(tier => {
                    const config = TURNAROUND_TIER_CONFIG[tier];
                    const isUnlocked = turnaroundTier >= tier;
                    const isCurrent = turnaroundTier === tier;
                    const isNext = turnaroundTier === tier - 1;
                    return (
                      <div
                        key={tier}
                        className={`flex-1 rounded-lg p-3 border transition-colors ${
                          isUnlocked
                            ? isCurrent
                              ? 'border-amber-500/50 bg-amber-500/10'
                              : 'border-white/20 bg-white/5'
                            : isNext
                              ? 'border-dashed border-amber-500/30'
                              : 'border-white/5 opacity-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold">Tier {tier}</span>
                          {isUnlocked && <span className="text-xs text-amber-400">&#10003;</span>}
                        </div>
                        <p className="text-xs font-medium mb-1">{config.name}</p>
                        <p className="text-xs text-text-muted">{formatMoney(config.annualCost)}/yr</p>
                      </div>
                    );
                  })}
                </div>

                {/* Current tier effects */}
                {turnaroundTier > 0 && (
                  <div className="bg-white/5 rounded-lg p-3 mb-4">
                    <p className="text-xs font-medium text-amber-400 mb-2">
                      Active: {TURNAROUND_TIER_CONFIG[turnaroundTier as 1 | 2 | 3].name}
                    </p>
                    <ul className="space-y-1">
                      {TURNAROUND_TIER_CONFIG[turnaroundTier as 1 | 2 | 3].effects.map((effect, i) => (
                        <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                          <span className="text-amber-400 mt-0.5">&#8226;</span>
                          {effect}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fatigue warning */}
                {activeTurnarounds.filter(t => t.status === 'active').length >= TURNAROUND_FATIGUE_THRESHOLD && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-4 text-xs text-amber-400">
                    Portfolio fatigue: {activeTurnarounds.filter(t => t.status === 'active').length} active turnarounds. Success rates reduced by 10ppt.
                  </div>
                )}

                {/* Upgrade button */}
                {turnaroundTier < 3 && (() => {
                  const nextTier = (turnaroundTier + 1) as 1 | 2 | 3;
                  const config = TURNAROUND_TIER_CONFIG[nextTier];
                  const tierCheck = canUnlockTier(turnaroundTier, cash, activeBusinesses.length);
                  return (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {turnaroundTier === 0 ? 'Build' : 'Upgrade to'} {config.name}
                        </p>
                        <p className="text-xs text-text-muted">
                          {!tierCheck.canUnlock && tierCheck.reason
                            ? tierCheck.reason
                            : `${formatMoney(config.unlockCost)} one-time + ${formatMoney(config.annualCost)}/yr`
                          }
                        </p>
                      </div>
                      <button
                        onClick={onUnlockTurnaroundTier}
                        disabled={!tierCheck.canUnlock}
                        className={`btn-primary text-sm min-h-[44px] shrink-0 ${!tierCheck.canUnlock ? 'opacity-50' : 'bg-amber-600 hover:bg-amber-500'}`}
                      >
                        {!tierCheck.canUnlock
                          ? tierCheck.reason?.startsWith('Need') ? tierCheck.reason.split('(')[0].trim() : 'Locked'
                          : `${turnaroundTier === 0 ? 'Build' : 'Upgrade'} (${formatMoney(config.unlockCost)})`
                        }
                      </button>
                    </div>
                  );
                })()}

                {turnaroundTier >= 3 && (
                  <p className="text-xs text-amber-400 text-center">Fully upgraded — Interim Management active</p>
                )}
              </div>
            )}

            {/* Operational Shared Services */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sharedServices.map(service => (
              <div
                key={service.type}
                className={`card ${service.active ? 'border-accent' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-bold">{service.name}</h4>
                  {service.active && (
                    <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">Active</span>
                  )}
                </div>
                <p className="text-sm text-text-secondary mb-3">{service.description}</p>
                <p className="text-sm text-accent mb-4">{service.effect}</p>

                <div className="flex justify-between text-sm text-text-muted mb-4">
                  <span>Unlock: {formatMoney(service.unlockCost)}</span>
                  <span>Annual: {formatMoney(service.annualCost)}</span>
                </div>

                {service.active ? (
                  <button
                    onClick={() => onDeactivateSharedService(service.type)}
                    className="btn-secondary w-full text-sm"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => onUnlockSharedService(service.type)}
                    disabled={!canUnlockSharedService || cash < service.unlockCost}
                    className="btn-primary w-full text-sm"
                  >
                    {!canUnlockSharedService
                      ? activeServicesCount >= MAX_ACTIVE_SHARED_SERVICES
                        ? 'Max 3 Active'
                        : `Need ${MIN_OPCOS_FOR_SHARED_SERVICES}+ Opcos`
                      : cash < service.unlockCost
                      ? 'Not Enough Cash'
                      : 'Unlock'}
                  </button>
                )}
              </div>
            ))}
            </div>
          </div>
        )}

        {activeTab === 'capital' && (
          <div className="space-y-6">
            {/* Fund Mode: Year 10 standalone block reminder */}
            {isFundManagerMode && round === maxRounds && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                <p className="font-bold text-purple-300 mb-1">Final Year</p>
                <p className="text-sm text-text-muted">Your fund closes this year. Distribute cash now to lock in DPI timing, or leave it for the terminal liquidation.</p>
              </div>
            )}
            {/* Debt Summary — includes integrated (tuck-in) businesses for complete picture */}
            {(() => {
              const debtBusinesses = allBusinesses.filter(b => b.status === 'active' || b.status === 'integrated');
              const opcoSellerNotes = debtBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
              const opcoBankDebt = debtBusinesses.reduce((sum, b) => sum + b.bankDebtBalance, 0);
              const totalAllDebt = holdcoLoanBalance + opcoBankDebt + opcoSellerNotes;
              return (
                <div className="card bg-white/5">
                  <h4 className="font-bold mb-3">Debt Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-text-muted">Holdco Debt</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(holdcoLoanBalance)}</p>
                      <p className="text-xs text-text-muted">{DEBT_LABELS.holdco.summaryShort}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Opco Seller Notes</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(opcoSellerNotes)}</p>
                      <p className="text-xs text-text-muted">{DEBT_LABELS.sellerNote.summaryShort}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Opco Bank Debt</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(opcoBankDebt)}</p>
                      <p className="text-xs text-text-muted">{DEBT_LABELS.bankDebt.summaryShort}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Total Debt</p>
                      <p className="font-mono font-bold text-lg text-warning">{formatMoney(totalAllDebt)}</p>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-white/5 rounded text-xs text-text-muted">
                    <strong>How debt works:</strong> {DEBT_EXPLAINER}
                  </div>
                </div>
              );
            })()}

            {/* Cap Table / Equity Summary (hidden in FO + Fund Manager mode) */}
            {!isFamilyOfficeMode && !isFundManagerMode && (() => {
              const founderOwnership = founderShares / sharesOutstanding;
              const outsideShares = sharesOutstanding - founderShares;
              const isEasyMode = difficulty === 'easy';
              const initialOutsideShares = isEasyMode ? STARTING_SHARES * 0.2 : 0;
              return (
                <div className="card bg-white/5">
                  <h4 className="font-bold mb-3">Cap Table & Equity</h4>

                  {/* Ownership bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>You: {(founderOwnership * 100).toFixed(1)}%</span>
                      <span>Investors: {((1 - founderOwnership) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full transition-all ${founderOwnership > 0.6 ? 'bg-accent' : founderOwnership > effectiveOwnershipFloor ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${founderOwnership * 100}%` }}
                      />
                    </div>
                    {founderOwnership < effectiveOwnershipFloor + 0.04 && (
                      <p className="text-xs text-warning mt-1">Control at risk — you must stay above {ownershipFloorPct}%</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-text-muted">Your Shares</p>
                      <p className="font-mono font-bold text-lg">{founderShares.toFixed(0)}</p>
                      <p className="text-xs text-text-muted">Fixed — never diluted</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Outside Shares</p>
                      <p className="font-mono font-bold text-lg">{outsideShares.toFixed(0)}</p>
                      <p className="text-xs text-text-muted">
                        {outsideShares > initialOutsideShares
                          ? `+${(outsideShares - initialOutsideShares).toFixed(0)} since start`
                          : outsideShares < initialOutsideShares
                          ? `${(initialOutsideShares - outsideShares).toFixed(0)} bought back`
                          : isEasyMode ? 'Initial 200 from raise' : 'No outside shareholders'}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted">Total Outstanding</p>
                      <p className="font-mono font-bold text-lg">{sharesOutstanding.toFixed(0)}</p>
                      <p className={`text-xs ${sharesOutstanding > STARTING_SHARES ? 'text-warning' : sharesOutstanding < STARTING_SHARES ? 'text-accent' : 'text-text-muted'}`}>
                        {sharesOutstanding > STARTING_SHARES
                          ? `+${((sharesOutstanding / STARTING_SHARES - 1) * 100).toFixed(0)}% since start`
                          : sharesOutstanding < STARTING_SHARES
                          ? `-${((1 - sharesOutstanding / STARTING_SHARES) * 100).toFixed(0)}% accretive`
                          : 'No change'}
                      </p>
                    </div>
                    <div>
                      <p className="text-text-muted">Value/Share</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(intrinsicValuePerShare)}</p>
                      <p className="text-xs text-text-muted">Intrinsic value</p>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-white/5 rounded text-xs text-text-muted">
                    <strong>How equity works:</strong>{' '}
                    {isEasyMode
                      ? <>You started with 1,000 total shares — 800 yours (80%), 200 sold to investors for {formatMoney(20000)}.</>
                      : <>You started with 1,000 shares and 100% ownership.</>
                    }{' '}
                    Issuing new shares raises cash but dilutes your ownership %. Buybacks retire outside shares, increasing your % back.
                    You must always hold &gt;{ownershipFloorPct}% to keep control.
                  </div>
                </div>
              );
            })()}

            {/* IPO Pathway — 20-year mode only (hidden in FO + Fund Manager mode) */}
            {!isFamilyOfficeMode && !isFundManagerMode && (() => {
              if (duration !== 'standard') return null;
              if (ipoState?.isPublic) {
                // Post-IPO: Public Company Dashboard
                const sentimentPct = ipoState.marketSentiment * 100;
                const sentimentColor = sentimentPct >= 10 ? 'text-green-400' : sentimentPct >= 0 ? 'text-green-400/70' : sentimentPct >= -10 ? 'text-yellow-400' : 'text-red-400';
                const sentimentBarColor = sentimentPct >= 10 ? 'bg-green-400' : sentimentPct >= 0 ? 'bg-green-400/70' : sentimentPct >= -10 ? 'bg-yellow-400' : 'bg-red-400';
                const sentimentBarWidth = Math.abs(sentimentPct) / 30 * 100; // max sentiment is ±0.3
                const totalEbitdaForTarget = businesses.filter(b => b.status === 'active').reduce((s, b) => s + b.ebitda, 0);
                const shareFundedThisRound = ipoState.shareFundedDealsThisRound;

                return (
                  <div className="card">
                    <h4 className="font-bold mb-3 flex items-center gap-2">
                      <span className="text-accent">📈</span> Public Company Dashboard
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center mb-4">
                      <div>
                        <p className="text-text-muted text-xs">Stock Price</p>
                        <p className="font-mono font-bold text-lg">{formatMoney(Math.round(ipoState.stockPrice))}/sh</p>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs">Market Cap</p>
                        <p className="font-mono font-bold text-lg">{formatMoney(Math.round(ipoState.stockPrice * ipoState.sharesOutstanding))}</p>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs">Market Sentiment</p>
                        <p className={`font-mono font-bold text-lg ${sentimentColor}`}>
                          {sentimentPct >= 0 ? '+' : ''}{sentimentPct.toFixed(0)}%
                        </p>
                        <div className="w-full h-1.5 bg-white/10 rounded-full mt-1 overflow-hidden" role="progressbar" aria-valuenow={sentimentPct} aria-valuemin={-30} aria-valuemax={30} aria-label={`Market sentiment: ${sentimentPct >= 0 ? '+' : ''}${sentimentPct.toFixed(0)}%`}>
                          <div className={`h-full rounded-full ${sentimentBarColor}`} style={{ width: `${Math.min(100, sentimentBarWidth)}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs">Earnings Target</p>
                        <p className="font-mono font-bold text-lg">{formatMoney(ipoState.earningsExpectations)}</p>
                        <p className="text-xs text-text-muted">Actual: {formatMoney(totalEbitdaForTarget)}</p>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs">Share-Funded Deals</p>
                        <p className="font-mono font-bold text-lg">{shareFundedThisRound}</p>
                        <p className="text-xs text-text-muted">this round</p>
                      </div>
                    </div>
                    {ipoState.consecutiveMisses >= 1 && (
                      <div className={`p-2 rounded text-xs ${ipoState.consecutiveMisses >= 2 ? 'bg-red-900/20 text-red-400' : 'bg-yellow-900/20 text-yellow-400'}`}>
                        {ipoState.consecutiveMisses >= 2
                          ? `⚠️ Analyst downgrade — ${ipoState.consecutiveMisses} consecutive misses. Stock under heavy pressure.`
                          : `⚠️ ${ipoState.consecutiveMisses} consecutive miss${ipoState.consecutiveMisses !== 1 ? 'es' : ''} — another will trigger analyst downgrade.`}
                      </div>
                    )}
                  </div>
                );
              }

              if (duration !== 'standard') return null;

              if (round < IPO_MIN_ROUND) {
                // Teaser card — show gates with current progress
                const teaserActive = businesses.filter(b => b.status === 'active');
                const teaserEbitda = teaserActive.reduce((s, b) => s + b.ebitda, 0);
                const teaserAvgQ = teaserActive.length > 0 ? teaserActive.reduce((s, b) => s + b.qualityRating, 0) / teaserActive.length : 0;
                const teaserPlatforms = teaserActive.filter(b => b.isPlatform).length;
                const teaserGates = [
                  { label: `Round ${IPO_MIN_ROUND}+`, current: `Round ${round}`, met: round >= IPO_MIN_ROUND },
                  { label: `$${(IPO_MIN_EBITDA / 1000).toFixed(0)}M+ EBITDA`, current: `$${(teaserEbitda / 1000).toFixed(1)}M`, met: teaserEbitda >= IPO_MIN_EBITDA },
                  { label: `${IPO_MIN_BUSINESSES}+ businesses`, current: `${teaserActive.length}`, met: teaserActive.length >= IPO_MIN_BUSINESSES },
                  { label: `${IPO_MIN_AVG_QUALITY}+ avg quality`, current: `${teaserAvgQ.toFixed(1)}`, met: teaserAvgQ >= IPO_MIN_AVG_QUALITY },
                  { label: `${IPO_MIN_PLATFORMS}+ platform${IPO_MIN_PLATFORMS !== 1 ? 's' : ''}`, current: `${teaserPlatforms}`, met: teaserPlatforms >= IPO_MIN_PLATFORMS },
                ];
                return (
                  <div className="card opacity-60">
                    <h4 className="font-bold mb-2 flex items-center gap-2 text-text-muted">
                      <span>🔒</span> IPO Pathway
                      <span className="text-xs font-normal ml-auto">Unlocks Round {IPO_MIN_ROUND}</span>
                    </h4>
                    <div className="space-y-1">
                      {teaserGates.map((g, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className={g.met ? 'text-green-400' : 'text-white/30'}>{g.met ? '✓' : '○'}</span>
                            <span className="text-text-muted">{g.label}</span>
                          </span>
                          <span className={`font-mono ${g.met ? 'text-green-400/70' : 'text-white/30'}`}>{g.current}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              // Pre-IPO: Eligibility checklist
              const partialState = { businesses, duration, round, cash, totalDebt, sharesOutstanding, interestRate, ipoState } as any;
              const { eligible, reasons } = checkIPOEligibility(partialState);

              // Build gate items — if eligible, no reasons; show all-pass
              const gates = eligible
                ? [
                    { label: 'EBITDA threshold', pass: true },
                    { label: 'Business count', pass: true },
                    { label: 'Average quality', pass: true },
                    { label: 'Platform count', pass: true },
                  ]
                : reasons.map(r => ({ label: r, pass: false }));

              return (
                <div className="card">
                  <h4 className="font-bold mb-3 flex items-center gap-2">
                    <span className="text-accent">🔔</span> IPO Pathway
                  </h4>
                  <div className="space-y-1.5 mb-4">
                    {gates.map((g, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={g.pass ? 'text-green-400' : 'text-red-400'}>{g.pass ? '✓' : '✗'}</span>
                        <span className={g.pass ? 'text-text-secondary' : 'text-text-muted'}>{g.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={onExecuteIPO}
                      disabled={!eligible}
                      className="btn-primary flex-1 text-sm min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Go Public
                    </button>
                    <button
                      onClick={onDeclineIPO}
                      disabled={!eligible}
                      className="btn-secondary flex-1 text-sm min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Stay Private
                    </button>
                  </div>
                  <p className="text-xs text-text-muted mt-2">
                    Going public raises cash and earns a performance bonus. Staying private avoids earnings pressure.
                  </p>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pay Down Holdco Debt (hidden in fund mode — no holdco loans) */}
            {!isFundManagerMode && <div className="card">
              <h4 className="font-bold mb-3">Pay Down Holdco Debt</h4>
              <p className="text-sm text-text-muted mb-4">
                Holdco debt: {formatMoney(holdcoLoanBalance)} @ {formatPercent(interestRate)}
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={payDebtAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setPayDebtAmount(raw);
                    }}
                    placeholder="1,000,000"
                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2.5 sm:py-2 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    const dollars = parseInt(payDebtAmount) || 0;
                    const internalAmount = Math.round(dollars / 1000);
                    if (internalAmount > 0) {
                      onPayDebt(internalAmount);
                      setPayDebtAmount('');
                    }
                  }}
                  disabled={!payDebtAmount || (parseInt(payDebtAmount) || 0) < 1000 || holdcoLoanBalance === 0}
                  className="btn-primary text-sm min-h-[44px]"
                >
                  Pay
                </button>
              </div>
              {payDebtAmount && parseInt(payDebtAmount) >= 1000 && (
                <p className="text-xs text-text-muted mt-1">= {formatMoney(Math.round(parseInt(payDebtAmount) / 1000))}</p>
              )}
              <p className="text-xs text-text-muted mt-2">Interest charged annually on remaining balance</p>
            </div>}

            {/* Pay Down Bank Debt (per-business) */}
            {(() => {
              const bizWithBankDebt = allBusinesses.filter(b => b.status === 'active' && b.bankDebtBalance > 0);
              if (bizWithBankDebt.length === 0) return null;
              return (
                <div className="card">
                  <h4 className="font-bold mb-3">Pay Down Bank Debt</h4>
                  <p className="text-sm text-text-muted mb-4">
                    Per-business bank debt — voluntary prepayment reduces interest costs.
                  </p>
                  <div className="space-y-3">
                    {bizWithBankDebt.map(biz => {
                      const sector = SECTORS[biz.sectorId];
                      const inputVal = bankDebtAmounts[biz.id] || '';
                      return (
                        <div key={biz.id} className="p-3 bg-white/5 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span>{sector.emoji}</span>
                            <span className="font-medium text-sm truncate">{biz.name}</span>
                            <span className="text-xs text-text-muted ml-auto font-mono">{formatMoney(biz.bankDebtBalance)} @ {formatPercent(biz.bankDebtRate || interestRate)}</span>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={inputVal}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  setBankDebtAmounts(prev => ({ ...prev, [biz.id]: raw }));
                                }}
                                placeholder="1,000,000"
                                className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2 text-sm"
                              />
                            </div>
                            <button
                              onClick={() => {
                                const dollars = parseInt(inputVal) || 0;
                                const internalAmount = Math.round(dollars / 1000);
                                if (internalAmount > 0) {
                                  onPayBankDebt(biz.id, internalAmount);
                                  setBankDebtAmounts(prev => ({ ...prev, [biz.id]: '' }));
                                }
                              }}
                              disabled={!inputVal || (parseInt(inputVal) || 0) < 1000}
                              className="btn-primary text-sm min-h-[40px]"
                            >
                              Pay
                            </button>
                          </div>
                          {inputVal && parseInt(inputVal) >= 1000 && (
                            <p className="text-xs text-text-muted mt-1">= {formatMoney(Math.round(parseInt(inputVal) / 1000))}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Fund Overview Card — Fund Manager mode only */}
            {isFundManagerMode && fundMetrics && (() => {
              const hasBusinesses = activeBusinesses.length > 0;
              const hurdleColor = fundMetrics.hurdlePct < 50 ? 'bg-red-400' : fundMetrics.hurdlePct < 90 ? 'bg-yellow-400' : fundMetrics.hurdlePct < 100 ? 'bg-amber-400' : 'bg-green-400';
              return (
                <div className="card bg-white/5 border border-purple-500/20">
                  <h4 className="font-bold mb-4 text-purple-300">Fund Overview</h4>

                  {!hasBusinesses ? (
                    // Year 1 progressive disclosure
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">Committed</span>
                        <span className="font-mono font-bold">{formatMoney(fundSize)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">Cash</span>
                        <span className="font-mono font-bold">{formatMoney(cash)}</span>
                      </div>
                      <p className="text-sm text-text-muted italic mt-2">
                        Your fund metrics will populate as you deploy capital.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Hero: NAV */}
                      <div className="text-center pb-3 border-b border-white/10">
                        <p className="text-xs text-text-muted uppercase tracking-wide">Net Asset Value</p>
                        <p className="text-3xl font-mono font-bold text-purple-300">{formatMoney(fundMetrics.nav)}</p>
                        <p className="text-sm text-text-muted">Gross MOIC: <span className="font-mono font-bold text-text-primary">{fundMetrics.grossMoic.toFixed(2)}x</span></p>
                      </div>

                      {/* Fund details */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-text-muted">Committed</p>
                          <p className="font-mono font-bold">{formatMoney(fundSize)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Deployed</p>
                          <p className="font-mono font-bold">{formatMoney(totalCapitalDeployed)} <span className="text-xs text-text-muted">({fundMetrics.deployPct.toFixed(0)}%)</span></p>
                        </div>
                        <div>
                          <p className="text-text-muted">Dry Powder</p>
                          <p className="font-mono font-bold">{formatMoney(fundMetrics.dryPowder)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">LP Distributions</p>
                          <p className="font-mono font-bold">{formatMoney(lpDistributions)} <span className="text-xs text-text-muted">(DPI: {fundMetrics.dpi.toFixed(2)}x)</span></p>
                        </div>
                        <div>
                          <p className="text-text-muted">Mgmt Fees Paid</p>
                          <p className="font-mono font-bold">{formatMoney(managementFeesCollected)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Est. Carry</p>
                          <p className="font-mono font-bold text-purple-300">
                            {fundMetrics.estCarry > 0 ? `~${formatMoney(Math.round(fundMetrics.estCarry))}` : 'Below hurdle'}
                          </p>
                        </div>
                      </div>

                      {/* Hurdle progress bar */}
                      <div className="pt-2 border-t border-white/10">
                        <div className="flex justify-between text-xs text-text-muted mb-1">
                          <span>Hurdle Progress</span>
                          <span>{formatMoney(Math.round(fundMetrics.totalValue))} of {formatMoney(Math.round(PE_FUND_CONFIG.hurdleReturn))}</span>
                        </div>
                        <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${hurdleColor} rounded-full transition-all`}
                            style={{ width: `${Math.min(100, fundMetrics.hurdlePct)}%` }}
                          />
                        </div>
                        <p className="text-xs text-text-muted mt-1">
                          {fundMetrics.hurdlePct >= 100
                            ? 'Hurdle cleared — you\'re earning carry!'
                            : `${formatMoney(Math.round(PE_FUND_CONFIG.hurdleReturn - fundMetrics.totalValue))} more needed to earn carry`
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Distribute to LPs — Fund Manager mode only */}
            {isFundManagerMode && cash > 0 && (() => {
              const dpi = fundSize > 0 ? lpDistributions / fundSize : 0;
              const canDistribute = totalCapitalDeployed >= PE_FUND_CONFIG.minDeploymentForDistribution;
              const parsedDpiDollars = parseInt(dpiAmount) || 0;
              const parsedDpiInternal = Math.round(parsedDpiDollars / 1000);
              const validAmount = parsedDpiInternal >= PE_FUND_CONFIG.minDistribution && parsedDpiInternal <= cash;
              // Upcoming obligations estimate
              const mgmtFee = PE_FUND_CONFIG.annualManagementFee;
              const turnaroundCost = activeTurnarounds.reduce((sum, t) => {
                const prog = getProgramById(t.programId);
                return sum + (prog ? getTurnaroundTierAnnualCost(prog.tierId) : 0);
              }, 0);
              const estDebtService = allBusinesses
                .filter(b => b.status === 'active')
                .reduce((s, b) => {
                  let ds = 0;
                  if (b.sellerNoteBalance > 0 && b.sellerNoteRoundsRemaining > 0) {
                    ds += b.sellerNoteBalance / b.sellerNoteRoundsRemaining + b.sellerNoteBalance * (b.sellerNoteRate || 0.05);
                  }
                  if (b.bankDebtBalance > 0 && b.bankDebtRoundsRemaining > 0) {
                    ds += b.bankDebtBalance / b.bankDebtRoundsRemaining + b.bankDebtBalance * (b.bankDebtRate || interestRate);
                  }
                  return s + ds;
                }, 0);
              return (
                <div className="card bg-white/5 border border-purple-500/20">
                  <h4 className="font-bold mb-1 text-purple-300">Distribute to LPs</h4>
                  <p className="text-sm text-text-muted mb-4">Return capital to your investors (permanent)</p>

                  {/* DPI progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-text-muted">Cumulative DPI: <span className="font-mono font-bold text-text-primary">{dpi.toFixed(2)}x</span></span>
                      <span className="text-text-muted text-xs">{formatMoney(lpDistributions)} of {formatMoney(fundSize)}</span>
                    </div>
                    <div className="relative w-full h-3 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${dpi >= 1.0 ? 'bg-green-400' : dpi >= 0.5 ? 'bg-yellow-400' : 'bg-purple-400'}`}
                        style={{ width: `${Math.min(100, dpi * 100)}%` }}
                      />
                      {/* 0.5x marker */}
                      <div className="absolute top-0 bottom-0 w-px bg-yellow-400/50" style={{ left: '50%' }} />
                      {/* 1.0x marker */}
                      <div className="absolute top-0 bottom-0 w-px bg-green-400/50" style={{ left: '100%' }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                      <span>0x</span>
                      <span>0.5x</span>
                      <span>1.0x</span>
                    </div>
                  </div>

                  {!canDistribute ? (
                    <p className="text-sm text-warning">Deploy at least 20% of committed capital ({formatMoney(PE_FUND_CONFIG.minDeploymentForDistribution)}) before making distributions.</p>
                  ) : dpiConfirm ? (
                    // Confirmation step
                    <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                      <p className="text-sm font-medium mb-1">Distribute {formatMoney(parsedDpiInternal)} to LPs?</p>
                      <p className="text-xs text-text-muted mb-3">This is permanent. Cash cannot be recalled.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setDpiConfirm(false); setDpiAmount(''); }}
                          className="btn-secondary flex-1 text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            onDistributeToLPs?.(parsedDpiInternal);
                            setDpiConfirm(false);
                            setDpiAmount('');
                          }}
                          className="flex-1 px-4 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors text-sm"
                        >
                          Confirm Distribution
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2 mb-3">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={dpiAmount}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              setDpiAmount(raw);
                            }}
                            placeholder="1,000,000"
                            className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2.5 text-sm"
                          />
                        </div>
                        <button
                          onClick={() => setDpiConfirm(true)}
                          disabled={!validAmount}
                          className="px-4 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                        >
                          Distribute
                        </button>
                      </div>
                      {dpiAmount && parsedDpiDollars >= 1000 && (
                        <p className="text-xs text-text-muted mb-3">= {formatMoney(parsedDpiInternal)}</p>
                      )}
                      <div className="text-xs text-text-muted space-y-1">
                        <p className="font-medium">Upcoming obligations:</p>
                        <div className="flex flex-wrap gap-x-3">
                          <span>Mgmt fee: {formatMoney(mgmtFee)}</span>
                          {turnaroundCost > 0 && <span>Turnarounds: {formatMoney(turnaroundCost)}</span>}
                          {estDebtService > 0 && <span>Debt service: ~{formatMoney(Math.round(estDebtService))}</span>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Equity / Buyback / Distribute — hidden in FO + Fund Manager mode */}
            {!isFamilyOfficeMode && !isFundManagerMode && <>
            {/* Issue Equity */}
            <div className={`card ${raiseBlocked ? 'opacity-50' : ''}`}>
              <h4 className="font-bold mb-3">Issue Equity</h4>
              <p className="text-sm text-text-muted mb-2">
                {isPublic
                  ? `Issue new shares at market price (${formatMoney(effectivePricePerShare)}/share). Each issuance applies -${(EQUITY_ISSUANCE_SENTIMENT_PENALTY * 100).toFixed(0)}% market sentiment.`
                  : `Raise capital by selling new shares at ${formatMoney(effectivePricePerShare)}/share${equityRaisesUsed > 0 ? ` (${Math.round((1 - equityDiscount) * 100)}% discount)` : ''}.`
                }
              </p>
              <div className="text-xs text-text-muted mb-4 flex flex-wrap gap-x-2 gap-y-0.5">
                <span>Your ownership: {(founderShares / sharesOutstanding * 100).toFixed(1)}%</span>
                <span className="hidden sm:inline text-white/20">|</span>
                {isPublic ? (
                  <span>Sentiment: {((ipoState?.marketSentiment ?? 0) * 100).toFixed(0)}% · -{(EQUITY_ISSUANCE_SENTIMENT_PENALTY * 100).toFixed(0)}% per issuance</span>
                ) : (
                  <span>Raise #{equityRaisesUsed + 1}</span>
                )}
                {!atOwnershipFloor && maxRaiseAmount > 0 && (
                  <>
                    <span className="hidden sm:inline text-white/20">|</span>
                    <span>Max raise: {formatMoney(maxRaiseAmount)}</span>
                  </>
                )}
              </div>
              {negativeEquity && (
                <p className="text-xs text-warning mb-4">Portfolio equity is negative — pay down debt to enable equity raises.</p>
              )}
              {atOwnershipFloor && (
                <p className="text-xs text-warning mb-4">At {ownershipFloorPct}% ownership floor — must maintain majority control. Buy back shares to raise more equity later.</p>
              )}
              {raiseCooldownBlocked && (
                <p className="text-xs text-warning mb-4">Cooldown: buyback in Y{lastBuybackRound} — wait {raiseCooldownRemainder} more yr</p>
              )}
              {/* Mode toggle */}
              <div className="flex gap-1 mb-3 bg-white/5 rounded p-0.5 w-fit">
                <button
                  onClick={() => { setEquityMode('dollars'); setEquityAmount(''); }}
                  className={`text-xs px-3 py-2.5 min-h-[44px] rounded transition-colors flex items-center ${equityMode === 'dollars' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
                >
                  $ Amount
                </button>
                <button
                  onClick={() => { setEquityMode('shares'); setEquityAmount(''); }}
                  className={`text-xs px-3 py-2.5 min-h-[44px] rounded transition-colors flex items-center ${equityMode === 'shares' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
                >
                  # Shares
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  {equityMode === 'dollars' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  )}
                  {equityMode === 'shares' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">#</span>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={equityAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setEquityAmount(raw);
                    }}
                    placeholder={equityMode === 'dollars' ? '5,000,000' : `e.g. ${Math.max(1, Math.floor(sharesOutstanding))}`}
                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2.5 sm:py-2 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    if (equityMode === 'dollars') {
                      const dollars = parseInt(equityAmount) || 0;
                      const internalAmount = Math.round(dollars / 1000);
                      if (internalAmount > 0) {
                        onIssueEquity(internalAmount);
                        setEquityAmount('');
                      }
                    } else {
                      const shareCount = parseInt(equityAmount) || 0;
                      if (shareCount > 0 && effectivePricePerShare > 0) {
                        const internalAmount = Math.floor(shareCount * effectivePricePerShare);
                        if (internalAmount > 0) {
                          onIssueEquity(internalAmount);
                          setEquityAmount('');
                        }
                      }
                    }
                  }}
                  disabled={(() => {
                    if (raiseBlocked || atOwnershipFloor) return true;
                    if (!equityAmount || effectivePricePerShare <= 0) return true;
                    let internalAmt: number;
                    if (equityMode === 'dollars') {
                      const dollars = parseInt(equityAmount) || 0;
                      if (dollars < 1000) return true;
                      internalAmt = Math.round(dollars / 1000);
                    } else {
                      const shareCount = parseInt(equityAmount) || 0;
                      if (shareCount < 1) return true;
                      internalAmt = Math.floor(shareCount * effectivePricePerShare);
                    }
                    // Check if this amount would breach ownership floor
                    const newShares_ = Math.round((internalAmt / effectivePricePerShare) * 1000) / 1000;
                    const newOwnership_ = founderShares / (sharesOutstanding + newShares_);
                    return newOwnership_ < effectiveOwnershipFloor;
                  })()}
                  className="btn-primary text-sm min-h-[44px]"
                >
                  Issue
                </button>
              </div>
              {/* Preview for dollar mode */}
              {equityMode === 'dollars' && equityAmount && parseInt(equityAmount) >= 1000 && (
                <p className="text-xs text-text-muted mt-1">= {formatMoney(Math.round(parseInt(equityAmount) / 1000))}</p>
              )}
              {/* Preview for shares mode */}
              {equityMode === 'shares' && equityAmount && parseInt(equityAmount) >= 1 && effectivePricePerShare > 0 && (() => {
                const shareCount = parseInt(equityAmount) || 0;
                const cost = Math.floor(shareCount * effectivePricePerShare);
                return (
                  <p className="text-xs text-text-muted mt-1">= {formatMoney(cost)} ({shareCount} shares @ {formatMoney(effectivePricePerShare)}/share)</p>
                );
              })()}
              {/* Detail preview */}
              {equityAmount && effectivePricePerShare > 0 && (() => {
                let internalAmt: number;
                if (equityMode === 'dollars') {
                  const dollars = parseInt(equityAmount) || 0;
                  if (dollars < 1000) return null;
                  internalAmt = Math.round(dollars / 1000);
                } else {
                  const shareCount = parseInt(equityAmount) || 0;
                  if (shareCount < 1) return null;
                  internalAmt = Math.floor(shareCount * effectivePricePerShare);
                }
                const newShares = Math.round((internalAmt / effectivePricePerShare) * 1000) / 1000;
                const newTotal = sharesOutstanding + newShares;
                const newOwnership = founderShares / newTotal * 100;
                return (
                  <div className="mt-3 p-3 bg-white/5 rounded text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-text-muted">New shares issued</span>
                      <span className="font-mono">{newShares.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">At price per share</span>
                      <span className="font-mono">{formatMoney(effectivePricePerShare)}{isPublic ? ' (market)' : equityRaisesUsed > 0 ? ` (${Math.round((1 - equityDiscount) * 100)}% off)` : ''}</span>
                    </div>
                    {isPublic && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Sentiment impact</span>
                        <span className="font-mono text-warning">-{(EQUITY_ISSUANCE_SENTIMENT_PENALTY * 100).toFixed(0)}%</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-text-muted">Your new ownership</span>
                      <span className={`font-mono font-bold ${newOwnership < ownershipFloorPct ? 'text-danger' : newOwnership < 55 ? 'text-warning' : ''}`}>
                        {newOwnership.toFixed(1)}%
                      </span>
                    </div>
                    {newOwnership < ownershipFloorPct && (
                      <p className="text-danger mt-1">Below {ownershipFloorPct}% — this raise would be blocked</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Buyback Shares */}
            <div className={`card ${buybackCooldownBlocked || activeBusinesses.length === 0 ? 'opacity-50' : ''}`}>
              <h4 className="font-bold mb-3">Buyback Shares</h4>
              <p className="text-sm text-text-muted mb-2">
                Repurchase outside investor shares at {formatMoney(buybackPricePerShare)}/share{isPublic ? ' (market price)' : ''}.
              </p>
              <p className="text-xs text-text-muted mb-4">
                Outstanding: {sharesOutstanding.toFixed(0)} total | {(sharesOutstanding - founderShares).toFixed(0)} outside shares
              </p>
              {activeBusinesses.length === 0 && (
                <p className="text-xs text-warning mb-4">Buybacks require at least one active business</p>
              )}
              {buybackCooldownBlocked && (
                <p className="text-xs text-warning mb-4">Cooldown: equity raised in Y{lastEquityRaiseRound} — wait {buybackCooldownRemainder} more yr</p>
              )}
              {/* Mode toggle */}
              <div className="flex gap-1 mb-3 bg-white/5 rounded p-0.5 w-fit">
                <button
                  onClick={() => { setBuybackMode('dollars'); setBuybackAmount(''); }}
                  className={`text-xs px-3 py-1 rounded transition-colors ${buybackMode === 'dollars' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
                >
                  $ Amount
                </button>
                <button
                  onClick={() => { setBuybackMode('shares'); setBuybackAmount(''); }}
                  className={`text-xs px-3 py-1 rounded transition-colors ${buybackMode === 'shares' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
                >
                  # Shares
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  {buybackMode === 'dollars' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  )}
                  {buybackMode === 'shares' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">#</span>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={buybackAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setBuybackAmount(raw);
                    }}
                    placeholder={buybackMode === 'dollars' ? '2,000,000' : `e.g. ${Math.max(1, Math.floor(sharesOutstanding - founderShares))}`}
                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2.5 sm:py-2 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    if (buybackMode === 'dollars') {
                      const dollars = parseInt(buybackAmount) || 0;
                      const internalAmount = Math.round(dollars / 1000);
                      if (internalAmount > 0) {
                        onBuyback(internalAmount);
                        setBuybackAmount('');
                      }
                    } else {
                      const shareCount = parseInt(buybackAmount) || 0;
                      if (shareCount > 0 && buybackPricePerShare > 0) {
                        const internalAmount = Math.floor(shareCount * buybackPricePerShare);
                        if (internalAmount > 0) {
                          onBuyback(internalAmount);
                          setBuybackAmount('');
                        }
                      }
                    }
                  }}
                  disabled={(() => {
                    if (!buybackAmount || !distressRestrictions.canBuyback || buybackCooldownBlocked || activeBusinesses.length === 0) return true;
                    if (buybackMode === 'dollars') {
                      const dollars = parseInt(buybackAmount) || 0;
                      return dollars < 1000 || Math.round(dollars / 1000) > cash;
                    } else {
                      const shareCount = parseInt(buybackAmount) || 0;
                      const outsideShares = sharesOutstanding - founderShares;
                      const cost = Math.floor(shareCount * buybackPricePerShare);
                      return shareCount < 1 || shareCount > Math.ceil(outsideShares) || cost > cash || buybackPricePerShare <= 0;
                    }
                  })()}
                  className="btn-primary text-sm min-h-[44px]"
                >
                  {buybackCooldownBlocked ? 'Cooldown' : activeBusinesses.length === 0 ? 'No Businesses' : !distressRestrictions.canBuyback ? 'Blocked' : 'Buyback'}
                </button>
              </div>
              {/* Preview for dollar mode */}
              {buybackMode === 'dollars' && buybackAmount && parseInt(buybackAmount) >= 1000 && (
                <p className="text-xs text-text-muted mt-1">= {formatMoney(Math.round(parseInt(buybackAmount) / 1000))}</p>
              )}
              {/* Preview for shares mode */}
              {buybackMode === 'shares' && buybackAmount && parseInt(buybackAmount) >= 1 && buybackPricePerShare > 0 && (() => {
                const shareCount = parseInt(buybackAmount) || 0;
                const cost = Math.floor(shareCount * buybackPricePerShare);
                return (
                  <p className="text-xs text-text-muted mt-1">= {formatMoney(cost)} ({shareCount} shares @ {formatMoney(buybackPricePerShare)}/share)</p>
                );
              })()}
              {/* Detail preview */}
              {buybackAmount && buybackPricePerShare > 0 && (() => {
                let internalAmt: number;
                if (buybackMode === 'dollars') {
                  const dollars = parseInt(buybackAmount) || 0;
                  if (dollars < 1000) return null;
                  internalAmt = Math.round(dollars / 1000);
                } else {
                  const shareCount = parseInt(buybackAmount) || 0;
                  if (shareCount < 1) return null;
                  internalAmt = Math.floor(shareCount * buybackPricePerShare);
                }
                const sharesRepurchased = Math.round((internalAmt / buybackPricePerShare) * 1000) / 1000;
                const outsideShares = sharesOutstanding - founderShares;
                const newTotal = sharesOutstanding - Math.min(sharesRepurchased, outsideShares);
                const newOwnership = founderShares / newTotal * 100;
                return (
                  <div className="mt-3 p-3 bg-white/5 rounded text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Shares repurchased</span>
                      <span className="font-mono">{Math.min(sharesRepurchased, outsideShares).toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Your new ownership</span>
                      <span className="font-mono font-bold text-accent">{newOwnership.toFixed(1)}%</span>
                    </div>
                    {sharesRepurchased > outsideShares && (
                      <p className="text-warning mt-1">Exceeds outside shares — capped at {outsideShares.toFixed(0)}</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Distribute */}
            {(() => {
              const ownershipPct = Math.floor((founderShares / sharesOutstanding) * 100);
              const hasOutsideOwners = founderShares < sharesOutstanding;
              const isStandard = duration === 'standard';
              const showFOHints = isStandard && !isFamilyOfficeMode;
              const founderDist = founderDistributionsReceived;

              // Card border warmth based on founder distributions
              const cardBorderClass = showFOHints && founderDist >= 1000000
                ? 'border-amber-500/30'
                : showFOHints && founderDist >= 800000
                ? 'border-amber-500/20'
                : showFOHints && founderDist >= 500000
                ? 'border-amber-500/10'
                : '';

              // Dynamic scoring guidance (uses game-average ROIIC to match scoring.ts)
              const defaultGuidance = { text: 'Hierarchy: reinvest at high returns → deleverage → buyback → distribute.', color: 'text-text-muted' };
              const scoringGuidance = totalEbitda === 0 ? defaultGuidance
                : avgRoiic < 0.15 && netDebtToEbitda < 2.0
                ? { text: 'ROIIC is low and leverage is healthy — good time to distribute.', color: 'text-emerald-400' }
                : avgRoiic >= 0.20
                ? { text: 'ROIIC is strong — reinvesting may create more value.', color: 'text-amber-400' }
                : netDebtToEbitda > 2.5
                ? { text: 'Leverage is elevated — consider deleveraging first.', color: 'text-red-400' }
                : defaultGuidance;

              // FO Whisper tiers
              const foWhisper = !showFOHints ? null
                : founderDist >= 1000000 ? { text: `${formatMoney(founderDist)} in founder wealth. This changes the endgame.`, bg: 'bg-amber-500/15' }
                : founderDist >= 800000 ? { text: `${formatMoney(founderDist)} accumulated. A fortune like this opens doors that didn't exist before.`, bg: 'bg-amber-500/10' }
                : founderDist >= 500000 ? { text: `${formatMoney(founderDist)} in founder wealth. Founders who build real capital find new opportunities waiting.`, bg: 'bg-amber-500/5' }
                : founderDist >= 100000 ? { text: `${formatMoney(founderDist)} in personal wealth and counting.`, bg: '' }
                : null;

              // Progress bar
              const showProgressBar = showFOHints && founderDist > 0 && founderDist < 1000000;
              const progressPct = showProgressBar
                ? Math.min(100, (founderDist / 1000000) * 100)
                : 0;

              // Input preview values
              const parsedInput = parseInt(distributeAmount) || 0;
              const internalPreview = Math.round(parsedInput / 1000);
              const founderPreview = hasOutsideOwners ? Math.round(internalPreview * ownershipPct / 100) : internalPreview;

              return (
                <div className={`card ${cardBorderClass}`}>
                  <h4 className="font-bold mb-3">Shareholder Distributions</h4>

                  {/* Hero totals */}
                  <div className="mb-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-text-muted text-sm">Total distributed</span>
                      <span className="text-lg font-mono font-semibold">{formatMoney(totalDistributions)}</span>
                    </div>
                    {hasOutsideOwners && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm text-text-muted">Your share ({ownershipPct}%)</span>
                        <span className="text-sm font-mono">{formatMoney(founderDist)}</span>
                      </div>
                    )}
                  </div>

                  {/* Input + Button */}
                  <div className="flex gap-2 mb-3">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={distributeAmount}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setDistributeAmount(raw);
                        }}
                        placeholder="1,000,000"
                        className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-2.5 sm:py-2 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const dollars = parseInt(distributeAmount) || 0;
                        const internalAmount = Math.round(dollars / 1000);
                        if (internalAmount > 0) {
                          onDistribute(internalAmount);
                          setDistributeAmount('');
                        }
                      }}
                      disabled={!distributeAmount || parsedInput < 1000 || internalPreview > cash || !distressRestrictions.canDistribute}
                      className="btn-primary text-sm min-h-[44px]"
                    >
                      {!distressRestrictions.canDistribute ? 'Blocked' : 'Distribute'}
                    </button>
                  </div>

                  {/* Conversion preview + founder preview */}
                  {distributeAmount && parsedInput >= 1000 && (
                    <p className="text-xs text-text-muted mt-1 mb-2">
                      = {formatMoney(internalPreview)}
                      {hasOutsideOwners && isStandard && (
                        <span> total → {formatMoney(founderPreview)} to you ({ownershipPct}%)</span>
                      )}
                    </p>
                  )}

                  {/* Dynamic scoring guidance */}
                  <p className={`text-xs ${scoringGuidance.color} mb-2`}>
                    {scoringGuidance.text}
                  </p>

                  {/* FO Whisper (20yr only) */}
                  {foWhisper && (
                    <p className={`text-xs italic text-amber-300/80 ${foWhisper.bg ? `${foWhisper.bg} rounded px-2 py-1.5` : ''} mb-2`}>
                      {foWhisper.text}
                    </p>
                  )}

                  {/* Progress bar (20yr only, < $1B) */}
                  {showProgressBar && (
                    <div
                      className="h-1 bg-white/5 rounded-full overflow-hidden mb-1"
                      role="progressbar"
                      aria-valuenow={Math.round(progressPct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Founder distributions progress: ${formatMoney(founderDist)}`}
                    >
                      <div
                        className="h-full bg-amber-400/30 rounded-full transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
            </>}
          </div>
          </div>
        )}
      </div>

      {/* Next Year Forecast */}
      {activeBusinesses.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-3 sm:p-4 mb-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Next Year Forecast</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm font-mono">
            <div className="flex items-center gap-1">
              <span className="text-text-muted text-xs">Cash</span>
              <span className="text-text-primary font-medium">{formatMoney(cash)}</span>
            </div>
            <span className="hidden sm:inline text-text-muted">→</span>
            <div className="flex items-center gap-1">
              <span className="text-text-muted text-xs">+ Est. FCF</span>
              <span className={`font-medium ${covenantHeadroom.estimatedNetFcf < 0 ? 'text-red-400' : 'text-text-primary'}`}>
                ~{formatMoney(covenantHeadroom.estimatedNetFcf)}
              </span>
            </div>
            {totalDebt > 0 && (
              <>
                <span className="hidden sm:inline text-text-muted">→</span>
                <div className="flex items-center gap-1">
                  <span className="text-text-muted text-xs">− Debt Service</span>
                  <span className="text-text-primary font-medium">~{formatMoney(covenantHeadroom.nextYearDebtService)}</span>
                </div>
              </>
            )}
            <span className="hidden sm:inline text-text-muted">→</span>
            <div className="flex items-center gap-1">
              <span className="text-text-muted text-xs">= Projected</span>
              <span className={`font-medium ${covenantHeadroom.cashWillGoNegative ? 'text-red-400 font-bold' : 'text-text-primary'}`}>
                ~{formatMoney(covenantHeadroom.projectedCashAfterDebt)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom bar (mobile) */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-bg-primary/95 backdrop-blur-sm border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-between" style={{ touchAction: 'none' }}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              // Scroll the overflow container (flex-1 overflow-auto parent) or window
              const scrollParent = document.querySelector('.flex-1.overflow-auto');
              if (scrollParent) scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
              else window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary transition-colors rounded-lg bg-white/5"
            aria-label="Scroll to top"
          >
            ▲
          </button>
          <span className="text-sm font-mono text-text-secondary">Cash: <span className="text-accent font-bold">{formatMoney(cash)}</span></span>
        </div>
        <button onClick={() => setShowEndTurnConfirm(true)} className="btn-primary text-sm px-4 py-2 relative">
          End Year {round} →
          {bsIncompleteItems.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-[10px] font-bold text-white flex items-center justify-center">{bsIncompleteItems.length}</span>
          )}
        </button>
      </div>

      {/* Sticky bottom bar (desktop) */}
      <div className="hidden md:flex fixed bottom-0 left-0 right-0 bg-bg-primary/95 backdrop-blur-sm border-t border-white/10 px-6 py-2.5 z-40 items-center justify-between">
        <span className="text-sm font-mono text-text-secondary">Cash: <span className="text-accent font-bold">{formatMoney(cash)}</span></span>
        <div className="flex gap-1.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); const sp = document.querySelector('.flex-1.overflow-auto'); if (sp) sp.scrollTo({ top: 0, behavior: 'smooth' }); else window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`px-3 py-1.5 rounded-md transition-colors text-xs font-medium ${
                activeTab === tab.id
                  ? 'bg-accent text-bg-primary'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 text-[10px] bg-white/20 px-1 py-0.5 rounded-full">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>
        <button onClick={() => setShowEndTurnConfirm(true)} className="btn-primary text-sm px-5 py-1.5 relative">
          End Year {round} →
          {bsIncompleteItems.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-[10px] font-bold text-white flex items-center justify-center">{bsIncompleteItems.length}</span>
          )}
        </button>
      </div>

      {/* Deal Structuring Modal */}
      {selectedDeal && renderDealStructuring()}

      {/* Improvement Modal */}
      {selectedBusinessForImprovement && renderImprovementModal()}

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-primary border border-white/10 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold">Merge Businesses</h3>
                <p className="text-text-muted">Combine two businesses in the same sector into a larger platform</p>
              </div>
              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setMergeSelection({ first: null, second: null });
                  setMergeName('');
                }}
                className="text-text-muted hover:text-text-primary text-2xl"
              >
                ×
              </button>
            </div>

            {mergeableSectors.length === 0 ? (
              <div className="card text-center text-text-muted py-8">
                <p>No businesses eligible for merger.</p>
                <p className="text-sm mt-2">Need 2+ businesses in the same sector to merge.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm text-text-muted mb-2">First Business</label>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto rounded-lg border border-white/10 p-1">
                      {activeBusinesses.filter(b => !b.parentPlatformId && b.sectorId !== 'proSports').map(biz => (
                        <button
                          key={biz.id}
                          type="button"
                          onClick={() => {
                            setMergeSelection(prev => ({
                              ...prev,
                              first: biz,
                              second: biz.sectorId !== prev.second?.sectorId ? null : prev.second
                            }));
                          }}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                            mergeSelection.first?.id === biz.id
                              ? 'bg-accent/20 border border-accent/50 text-accent'
                              : 'bg-white/5 hover:bg-white/10 border border-transparent'
                          }`}
                        >
                          <span className="font-medium">{SECTORS[biz.sectorId].emoji} {biz.name}</span>
                          <span className="block text-xs text-text-muted">{biz.subType} — {formatMoney(biz.ebitda)} EBITDA</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-text-muted mb-2">Second Business</label>
                    <div className={`space-y-1 max-h-[200px] overflow-y-auto rounded-lg border border-white/10 p-1 ${!mergeSelection.first ? 'opacity-50' : ''}`}>
                      {!mergeSelection.first ? (
                        <p className="text-xs text-text-muted px-3 py-2">Select first business</p>
                      ) : (
                        activeBusinesses
                          .filter(b => b.sectorId === mergeSelection.first?.sectorId && b.id !== mergeSelection.first?.id && !b.parentPlatformId && b.sectorId !== 'proSports')
                          .map(biz => (
                            <button
                              key={biz.id}
                              type="button"
                              onClick={() => {
                                setMergeSelection(prev => ({ ...prev, second: biz }));
                              }}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                mergeSelection.second?.id === biz.id
                                  ? 'bg-accent/20 border border-accent/50 text-accent'
                                  : 'bg-white/5 hover:bg-white/10 border border-transparent'
                              }`}
                            >
                              <span className="font-medium">{biz.name}</span>
                              <span className="block text-xs text-text-muted">{biz.subType} — {formatMoney(biz.ebitda)} EBITDA</span>
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                </div>

                {mergeSelection.first && mergeSelection.second && (() => {
                  const mergeCost = Math.max(100, Math.round(Math.min(Math.abs(mergeSelection.first.ebitda), Math.abs(mergeSelection.second.ebitda)) * 0.15));
                  return (
                  <>
                    <div className="card bg-white/5 mb-6">
                      <h4 className="font-bold mb-3">Merger Preview</h4>

                      {/* Sub-type match indicator */}
                      {(() => {
                        const mergeAffinity = getSubTypeAffinity(mergeSelection.first.sectorId, mergeSelection.first.subType, mergeSelection.second.subType);
                        return mergeAffinity === 'match' ? (
                          <div className="bg-green-900/20 border border-green-500/30 rounded-lg px-3 py-2 mb-4 text-sm text-green-400 flex items-center gap-2">
                            <span>&#10003;</span> Same sub-type ({mergeSelection.first.subType}) — full synergies expected
                          </div>
                        ) : mergeAffinity === 'related' ? (
                          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg px-3 py-2 mb-4 text-sm text-blue-400 flex items-center gap-2">
                            <span>&#8776;</span> Related sub-types ({mergeSelection.first.subType} + {mergeSelection.second.subType}) — 75% synergies
                          </div>
                        ) : (
                          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg px-3 py-2 mb-4 text-sm text-yellow-400 flex items-center gap-2">
                            <span>&#9888;</span> Distant sub-types ({mergeSelection.first.subType} + {mergeSelection.second.subType}) — 45% synergies
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
                        <div>
                          <p className="text-text-muted">Combined EBITDA</p>
                          <p className="font-mono font-bold text-lg text-accent">
                            {formatMoney(mergeSelection.first.ebitda + mergeSelection.second.ebitda)}
                          </p>
                          <p className="text-xs text-text-muted">+ potential synergies</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Merge Cost</p>
                          <p className="font-mono font-bold text-lg">
                            {formatMoney(mergeCost)}
                          </p>
                          <p className="text-xs text-text-muted">15% of smaller business</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Platform Scale</p>
                          <p className="font-mono font-bold text-lg">
                            {(mergeSelection.first.platformScale || 0) + (mergeSelection.second.platformScale || 0) + 2}
                          </p>
                          <p className="text-xs text-text-muted">Multiple expansion</p>
                        </div>
                        <div>
                          <p className="text-text-muted">Blended Multiple</p>
                          <p className="font-mono font-bold text-lg">
                            {((mergeSelection.first.acquisitionMultiple + mergeSelection.second.acquisitionMultiple) / 2).toFixed(1)}x
                          </p>
                          <p className="text-xs text-text-muted">Avg of both companies</p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm text-text-muted mb-2">New Company Name</label>
                      <input
                        type="text"
                        value={mergeName}
                        onChange={(e) => setMergeName(e.target.value)}
                        placeholder="e.g., Combined Holdings"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                        maxLength={40}
                      />
                    </div>

                    <button
                      onClick={() => {
                        if (mergeSelection.first && mergeSelection.second && mergeName.trim()) {
                          onMergeBusinesses?.(mergeSelection.first.id, mergeSelection.second.id, mergeName.trim());
                          setShowMergeModal(false);
                          setMergeSelection({ first: null, second: null });
                          setMergeName('');
                        }
                      }}
                      disabled={!mergeName.trim() || cash < mergeCost}
                      className="btn-primary w-full"
                    >
                      {cash < mergeCost
                        ? 'Not Enough Cash'
                        : 'Complete Merger'}
                    </button>
                  </>
                  );
                })()}

                <div className="mt-6 p-4 bg-white/5 rounded-lg text-sm text-text-muted">
                  <p className="font-medium text-text-secondary mb-1">Roll-Up Strategy Tip</p>
                  <p>Merging automatically creates a platform — no need to designate first. If one business is already a platform, the merged entity starts at a higher scale. Only designate separately if you plan to do tuck-in acquisitions before merging.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Market Guide Modal */}
      {showMarketGuide && (
        <MarketGuideModal onClose={() => setShowMarketGuide(false)} />
      )}

      {/* Roll-Up Guide Modal */}
      {showRollUpGuide && (
        <RollUpGuideModal onClose={() => setShowRollUpGuide(false)} />
      )}

      {/* Sell Confirmation Modal */}
      {sellConfirmBusiness && (() => {
        const biz = sellConfirmBusiness;
        const valuation = calculateExitValuation(biz, round, lastEventType, undefined, integratedPlatforms);
        const totalInvested = biz.totalAcquisitionCost || biz.acquisitionPrice;
        const cashInvested = biz.cashEquityInvested ?? totalInvested;
        const sellMoic = cashInvested > 0 ? valuation.netProceeds / cashInvested : 0; // Equity MOIC
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-bg-primary border border-white/10 rounded-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold mb-4">Confirm Sale</h3>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Business</span>
                  <span className="font-bold">{biz.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Est. Exit Price</span>
                  <span className="font-mono font-bold text-accent">{formatMoney(valuation.exitPrice)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Net Proceeds</span>
                  <span className="font-mono font-bold">{formatMoney(valuation.netProceeds)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                  <span className="text-text-muted">Cash Invested</span>
                  <span className="font-mono">{formatMoney(cashInvested)}</span>
                </div>
                {cashInvested < totalInvested && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Total Cost</span>
                    <span className="font-mono text-text-secondary">{formatMoney(totalInvested)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">MOIC</span>
                  <span className={`font-mono font-bold ${sellMoic >= 2 ? 'text-accent' : sellMoic < 1 ? 'text-danger' : ''}`}>
                    {sellMoic.toFixed(1)}x
                  </span>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setSellConfirmBusiness(null)} className="btn-secondary px-6">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSell(biz.id);
                    setSellConfirmBusiness(null);
                    if (sellMoic >= 1.5) {
                      setSellCelebration({ name: biz.name, moic: sellMoic });
                      setTimeout(() => setSellCelebration(null), 4000);
                    }
                  }}
                  className="btn-primary px-6"
                >
                  Sell
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sell Celebration Overlay */}
      {sellCelebration && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] pointer-events-none">
          <div className="text-center animate-bounce">
            <p className="text-6xl mb-4">
              {sellCelebration.moic >= 3 ? '🎆' : sellCelebration.moic >= 2 ? '🎉' : '✨'}
            </p>
            <p className="text-3xl font-bold text-accent mb-2">
              {sellCelebration.moic >= 3 ? 'Incredible Exit!' :
               sellCelebration.moic >= 2 ? 'Great Exit!' :
               'Solid Exit!'}
            </p>
            <p className="text-xl text-text-secondary">
              {sellCelebration.name} — {sellCelebration.moic.toFixed(1)}x MOIC
            </p>
          </div>
        </div>
      )}

      {/* Forge Platform Confirmation Modal */}
      {forgeConfirm && (() => {
        const entry = eligiblePlatformRecipes.find(e => e.recipe.id === forgeConfirm.recipeId);
        if (!entry) return null;
        const { recipe, eligibleBusinesses: eligible } = entry;
        const cost = calculateIntegrationCost(recipe, eligible);
        const sectorEmojis = recipe.sectorId
          ? SECTORS[recipe.sectorId]?.emoji ?? ''
          : (recipe.crossSectorIds ?? []).map(sid => SECTORS[sid]?.emoji).filter(Boolean).join(' ');
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-bg-primary border border-purple-500/30 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h3 className="text-lg sm:text-xl font-bold text-purple-400 mb-2 break-words">{sectorEmojis} Forge {recipe.name}?</h3>
              <p className="text-sm text-text-secondary mb-4 break-words">{recipe.description}</p>

              <div className="mb-4">
                <p className="text-xs text-text-muted mb-2">Businesses to integrate:</p>
                <div className="space-y-1">
                  {eligible.map(b => (
                    <div key={b.id} className="flex justify-between gap-2 text-sm bg-white/5 rounded px-3 py-2">
                      <span className="truncate min-w-0">{SECTORS[b.sectorId].emoji} {b.name}</span>
                      <span className="text-text-muted font-mono whitespace-nowrap flex-shrink-0">{b.subType}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Integration Cost</span>
                  <span className="font-mono text-danger">-{formatMoney(cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Margin Boost (permanent)</span>
                  <span className="font-mono text-green-400">+{formatPercent(recipe.bonuses.marginBoost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Growth Boost (permanent)</span>
                  <span className="font-mono text-blue-400">+{formatPercent(recipe.bonuses.growthBoost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Exit Multiple Premium</span>
                  <span className="font-mono text-purple-400">+{recipe.bonuses.multipleExpansion.toFixed(1)}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Recession Resistance</span>
                  <span className="font-mono text-yellow-400">-{Math.round((1 - recipe.bonuses.recessionResistanceReduction) * 100)}% sensitivity</span>
                </div>
              </div>

              <p className="text-xs text-warning mb-4">
                This action is irreversible. Once forged, these businesses are permanently linked.
              </p>

              <div className="flex gap-3 justify-end">
                <button onClick={() => setForgeConfirm(null)} className="btn-secondary px-6 min-h-[44px]">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onForgePlatform(recipe.id, forgeConfirm.businessIds, recipe.name, cost);
                    setForgeConfirm(null);
                  }}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors"
                >
                  Forge Platform
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sell Platform Confirmation Modal */}
      {sellPlatformConfirm && (() => {
        const ip = sellPlatformConfirm;
        const constituents = ip.constituentBusinessIds
          .map(id => activeBusinesses.find(b => b.id === id))
          .filter((b): b is Business => b != null);
        if (constituents.length === 0) return null;

        const saleBonus = getPlatformSaleBonus(ip.bonuses.multipleExpansion);
        const constituentDetails = constituents.map(biz => {
          const val = calculateExitValuation(biz, round, lastEventType, undefined, integratedPlatforms);
          const baseExitMultiple = val.totalMultiple;
          const withBonus = baseExitMultiple + saleBonus;
          const exitPrice = Math.round(biz.ebitda * Math.max(2.0, withBonus));
          const boltOnDebt = (biz.boltOnIds || [])
            .map(id => allBusinesses.find(b => b.id === id))
            .filter(Boolean)
            .reduce((sum, b) => sum + (b!.sellerNoteBalance + b!.earnoutRemaining), 0);
          const debt = biz.sellerNoteBalance + biz.bankDebtBalance + biz.earnoutRemaining + boltOnDebt;
          return { biz, exitPrice, debt, multiple: withBonus };
        });

        const totalExit = constituentDetails.reduce((s, d) => s + d.exitPrice, 0);
        const totalDebt = constituentDetails.reduce((s, d) => s + d.debt, 0);
        const totalNet = Math.max(0, totalExit - totalDebt);
        const totalInvested = constituents.reduce((s, b) => s + (b.totalAcquisitionCost || b.acquisitionPrice), 0);
        const combinedMoic = totalInvested > 0 ? totalExit / totalInvested : 0; // EV MOIC
        const sectorEmojis = ip.sectorIds.map(sid => SECTORS[sid]?.emoji).filter(Boolean).join(' ');

        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-bg-primary border border-purple-500/30 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h3 className="text-lg sm:text-xl font-bold text-purple-400 mb-2">Sell {sectorEmojis} {ip.name}?</h3>
              <p className="text-xs text-text-muted mb-4">Sell all constituent businesses as a single platform. Includes a +{saleBonus.toFixed(1)}x multiple bonus for selling as a unit.</p>

              <div className="mb-4 space-y-1">
                {constituentDetails.map(({ biz, exitPrice, multiple }) => (
                  <div key={biz.id} className="flex justify-between gap-2 text-sm bg-white/5 rounded px-3 py-2">
                    <span className="truncate min-w-0">{SECTORS[biz.sectorId].emoji} {biz.name}</span>
                    <span className="font-mono whitespace-nowrap flex-shrink-0 text-accent">{formatMoney(exitPrice)} <span className="text-text-muted">({multiple.toFixed(1)}x)</span></span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Platform Sale Bonus</span>
                  <span className="font-mono text-purple-400">+{saleBonus.toFixed(1)}x per business</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total Exit Price</span>
                  <span className="font-mono text-accent">{formatMoney(totalExit)}</span>
                </div>
                {totalDebt > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>Total Debt Payoff</span>
                    <span className="font-mono">-{formatMoney(totalDebt)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t border-white/10 pt-2">
                  <span>Net Proceeds</span>
                  <span className="font-mono text-accent">{formatMoney(totalNet)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Combined MOIC</span>
                  <span className={`font-mono font-bold ${combinedMoic >= 2 ? 'text-accent' : combinedMoic < 1 ? 'text-danger' : ''}`}>
                    {combinedMoic.toFixed(1)}x
                  </span>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button onClick={() => setSellPlatformConfirm(null)} className="btn-secondary px-6 min-h-[44px]">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSellPlatform(ip.id);
                    setSellPlatformConfirm(null);
                    if (combinedMoic >= 1.5) {
                      setSellCelebration({ name: ip.name, moic: combinedMoic });
                      setTimeout(() => setSellCelebration(null), 4000);
                    }
                  }}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors"
                >
                  Sell Platform
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Turnaround Modal */}
      {turnaroundBusiness && (
        <TurnaroundModal
          business={turnaroundBusiness}
          cash={cash}
          turnaroundTier={turnaroundTier}
          activeTurnarounds={activeTurnarounds}
          duration={duration}
          onStartTurnaround={(businessId, programId) => {
            onStartTurnaround(businessId, programId);
            setTurnaroundBusiness(null);
          }}
          onClose={() => setTurnaroundBusiness(null)}
        />
      )}

      {/* End Turn Confirmation Modal */}
      {showEndTurnConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className={`bg-bg-primary border rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto ${
            isBusinessSchoolMode && bsIncompleteItems.length > 0 ? 'border-amber-500/30' : 'border-white/10'
          }`}>
            {/* B-School incomplete warning header */}
            {isBusinessSchoolMode && bsIncompleteItems.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🎓</span>
                  <h3 className="text-lg font-bold text-amber-300">Unfinished coursework</h3>
                </div>
                <p className="text-sm text-text-secondary mb-4">
                  {round <= 1
                    ? "These Year 1 skills won't be available once you advance. Complete them now for the full experience."
                    : "Once you end Year 2, Business School is over. Anything you skip, you skip for good."
                  }
                </p>
                <div className="bg-amber-950/30 border border-amber-500/15 rounded-lg p-3 mb-4">
                  <p className="text-[10px] font-bold text-amber-400/60 tracking-wider uppercase mb-2">
                    {bsIncompleteItems.length} item{bsIncompleteItems.length > 1 ? 's' : ''} remaining
                  </p>
                  <div className="space-y-2">
                    {bsIncompleteItems.map((item) => (
                      <div key={item.id} className="flex items-start gap-2">
                        <span className="text-amber-400/40 text-xs mt-0.5">○</span>
                        <div>
                          <p className="text-sm text-amber-200/80">{item.title}</p>
                          <p className="text-[11px] text-amber-200/40 leading-snug">{item.subtitle}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setShowEndTurnConfirm(false)}
                    className="btn-primary w-full px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500"
                  >
                    Go Back &amp; Complete Coursework
                  </button>
                  <button
                    onClick={() => { setShowEndTurnConfirm(false); onEndRound(); }}
                    className="w-full py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Skip anyway — end Year {round}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold mb-4">End Year {round}?</h3>
                <p className="text-text-secondary mb-2">
                  Are you sure you want to end Year {round}?
                </p>
                {isBusinessSchoolMode && bsIncompleteItems.length === 0 && (
                  <p className="text-sm text-emerald-400/80 mb-3">All coursework complete — nice work!</p>
                )}
                <p className="text-sm text-text-muted mb-4">
                  You have <span className="text-accent font-mono">{formatMoney(cash)}</span> unallocated cash.
                  {(() => {
                    const expiring = dealPipeline.filter(d => d.freshness === 1).length;
                    const carrying = dealPipeline.filter(d => d.freshness > 1).length;
                    return (
                      <>
                        {expiring > 0 && <span className="text-warning"> {expiring} deal{expiring > 1 ? 's' : ''} will expire.</span>}
                        {carrying > 0 && <span className="text-text-muted"> {carrying} will carry over.</span>}
                      </>
                    );
                  })()}
                </p>
                {/* Year-End Forecast */}
                {totalDebt > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
                    <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Year-End Forecast</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-text-muted text-xs">Leverage</span>
                        <p className={`font-mono font-medium ${
                          covenantHeadroom.currentLeverage >= 4.0 ? 'text-red-400' :
                          covenantHeadroom.currentLeverage >= 3.5 ? 'text-orange-400' :
                          covenantHeadroom.currentLeverage >= 2.5 ? 'text-yellow-400' :
                          'text-green-400'
                        }`}>
                          {covenantHeadroom.currentLeverage === Infinity ? '∞' : covenantHeadroom.currentLeverage.toFixed(1)}x / 4.5x
                        </p>
                      </div>
                      <div>
                        <span className="text-text-muted text-xs">Debt service (next yr)</span>
                        <p className="font-mono font-medium text-text-primary">~{formatMoney(covenantHeadroom.nextYearDebtService)}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-text-muted text-xs">Projected yr-end cash (incl. FCF)</span>
                        <p className={`font-mono font-medium ${covenantHeadroom.cashWillGoNegative ? 'text-red-400' : 'text-text-primary'}`}>
                          ~{formatMoney(covenantHeadroom.projectedCashAfterDebt)}
                        </p>
                      </div>
                    </div>
                    {(covenantHeadroom.currentLeverage >= 4.0 || covenantHeadroom.cashWillGoNegative) && (
                      <div className="mt-2 space-y-1">
                        {covenantHeadroom.currentLeverage >= 4.0 && covenantHeadroom.currentLeverage < 4.5 && (
                          <p className="text-xs text-yellow-400">⚠ Close to 4.5x covenant breach</p>
                        )}
                        {covenantHeadroom.cashWillGoNegative && (
                          <p className="text-xs text-red-400">⚠ Cash may go negative after debt service</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowEndTurnConfirm(false)} className="btn-secondary px-6">Cancel</button>
                  <button onClick={() => { setShowEndTurnConfirm(false); onEndRound(); }} className="btn-primary px-6">End Year</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
