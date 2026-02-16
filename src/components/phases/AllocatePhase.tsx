import { useState, useRef, useMemo } from 'react';
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
import { EQUITY_DILUTION_STEP, EQUITY_DILUTION_FLOOR, EQUITY_BUYBACK_COOLDOWN } from '../../data/gameConfig';
import { SECTOR_LIST } from '../../data/sectors';
import { BusinessCard } from '../cards/BusinessCard';
import { DealCard } from '../cards/DealCard';
import { generateDealStructures, getStructureLabel, getStructureDescription } from '../../engine/deals';
import { calculateExitValuation } from '../../engine/simulation';
import { getSubTypeAffinity, getSizeRatioTier } from '../../engine/businesses';
import { SECTORS } from '../../data/sectors';
import { MIN_OPCOS_FOR_SHARED_SERVICES, MAX_ACTIVE_SHARED_SERVICES, MA_SOURCING_CONFIG, getMASourcingUpgradeCost, getMASourcingAnnualCost } from '../../data/sharedServices';
import { MarketGuideModal } from '../ui/MarketGuideModal';
import { RollUpGuideModal } from '../ui/RollUpGuideModal';
import { ImprovementModal } from '../modals/ImprovementModal';
import { isAIEnabled } from '../../services/aiGeneration';
import { checkPlatformEligibility, calculateIntegrationCost, getEligibleBusinessesForExistingPlatform, calculateAddToPlatformCost } from '../../engine/platforms';
import { PLATFORM_SALE_BONUS } from '../../data/gameConfig';
import { getEligiblePrograms, calculateTurnaroundCost, canUnlockTier } from '../../engine/turnarounds';
import { TURNAROUND_TIER_CONFIG, getTurnaroundTierAnnualCost, getProgramById } from '../../data/turnaroundPrograms';
import { TURNAROUND_FATIGUE_THRESHOLD } from '../../data/gameConfig';

const STARTING_SHARES = 1000;

const DEAL_SOURCING_COST_BASE = 500; // $500k
const DEAL_SOURCING_COST_TIER1 = 300; // $300k with MA Sourcing Tier 1+
const PROACTIVE_OUTREACH_COST = 400; // $400k (Tier 3 only)

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
  intrinsicValuePerShare: number;
  lastEventType?: string;
  onAcquire: (deal: Deal, structure: DealStructure) => void;
  onAcquireTuckIn: (deal: Deal, structure: DealStructure, platformId: string) => void;
  onMergeBusinesses: (businessId1: string, businessId2: string, newName: string) => void;
  onDesignatePlatform: (businessId: string) => void;
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
  lastAcquisitionResult: 'success' | 'snatched' | null;
  turnaroundTier: TurnaroundTier;
  activeTurnarounds: ActiveTurnaround[];
  onUnlockTurnaroundTier: () => void;
  onStartTurnaround: (businessId: string, programId: string) => void;
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
}: AllocatePhaseProps) {
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
  // In-modal equity raise state
  const [modalEquityAmount, setModalEquityAmount] = useState('');
  const [showModalEquityRaise, setShowModalEquityRaise] = useState(false);
  // Deal pass state
  const [passedDealIds, setPassedDealIds] = useState<Set<string>>(new Set());
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
  const [turnaroundConfirm, setTurnaroundConfirm] = useState<{ businessId: string; programId: string } | null>(null);

  const activeBusinesses = businesses.filter(b => b.status === 'active');
  const distressRestrictions = getDistressRestrictions(distressLevel);
  const dealSourcingCost = (maSourcing.active && maSourcing.tier >= 1) ? DEAL_SOURCING_COST_TIER1 : DEAL_SOURCING_COST_BASE;

  // Escalating dilution + cooldown derived values
  const equityDiscount = Math.max(1 - EQUITY_DILUTION_STEP * equityRaisesUsed, EQUITY_DILUTION_FLOOR);
  const effectivePricePerShare = intrinsicValuePerShare * equityDiscount;
  const raiseCooldownBlocked = lastBuybackRound > 0 && round - lastBuybackRound < EQUITY_BUYBACK_COOLDOWN;
  const buybackCooldownBlocked = lastEquityRaiseRound > 0 && round - lastEquityRaiseRound < EQUITY_BUYBACK_COOLDOWN;
  const raiseBlocked = raiseCooldownBlocked || intrinsicValuePerShare <= 0;
  const raiseCooldownRemainder = raiseCooldownBlocked ? EQUITY_BUYBACK_COOLDOWN - (round - lastBuybackRound) : 0;
  const buybackCooldownRemainder = buybackCooldownBlocked ? EQUITY_BUYBACK_COOLDOWN - (round - lastEquityRaiseRound) : 0;
  const aiEnabled = isAIEnabled();
  const activeServicesCount = sharedServices.filter(s => s.active).length;
  const canUnlockSharedService =
    activeBusinesses.length >= MIN_OPCOS_FOR_SHARED_SERVICES &&
    activeServicesCount < MAX_ACTIVE_SHARED_SERVICES;

  // Covenant headroom — updates in real-time as cash changes
  const covenantHeadroom = useMemo(() => calculateCovenantHeadroom(
    cash,
    totalDebt,
    totalEbitda,
    holdcoLoanBalance,
    holdcoLoanRate,
    holdcoLoanRoundsRemaining,
    allBusinesses,
    interestRate,
    distressRestrictions.interestPenalty,
  ), [cash, totalDebt, totalEbitda, holdcoLoanBalance, holdcoLoanRate, holdcoLoanRoundsRemaining, allBusinesses, interestRate, distressRestrictions.interestPenalty]);

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

  // Merge eligibility: need 2+ businesses in same sector
  const getMergeableSectors = () => {
    const sectorCounts: Record<string, Business[]> = {};
    activeBusinesses.forEach(b => {
      if (!b.parentPlatformId) { // Only standalone or platform businesses, not bolt-ons
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

  const tabs: { id: AllocateTab; label: string; badge?: number }[] = [
    { id: 'portfolio', label: 'Portfolio', badge: activeBusinesses.length },
    { id: 'deals', label: 'Deals', badge: dealPipeline.length },
    { id: 'shared_services', label: 'Shared Services' },
    { id: 'capital', label: 'Capital' },
  ];

  const renderDealStructuring = () => {
    if (!selectedDeal) return null;

    const structures = generateDealStructures(selectedDeal, cash, interestRate, creditTightening, maxRoundsFromStore ?? 20, !distressRestrictions.canTakeDebt);
    const availablePlatformsForDeal = getPlatformsForSector(selectedDeal.business.sectorId);
    const canTuckIn = availablePlatformsForDeal.length > 0;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4 z-50 overflow-y-auto">
        <div className="bg-bg-primary border border-white/10 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold">{selectedDeal.business.name}</h3>
              <p className="text-text-muted">
                {SECTORS[selectedDeal.business.sectorId].emoji} {selectedDeal.business.subType}
              </p>
              <div className="flex items-center gap-2 mt-2">
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
                <p className="text-xs text-text-muted mt-1">
                  Base price {formatMoney(selectedDeal.askingPrice)} + {Math.round(((selectedDeal.effectivePrice / selectedDeal.askingPrice) - 1) * 100)}% competitive premium = <span className="font-bold text-text-primary">{formatMoney(selectedDeal.effectivePrice)}</span>
                </p>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedDeal(null);
                setSelectedTuckInPlatform(null);
                setModalEquityAmount('');
                setShowModalEquityRaise(false);
              }}
              className="text-text-muted hover:text-text-primary text-2xl"
            >
              ×
            </button>
          </div>

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
              <p className="text-lg sm:text-2xl font-bold font-mono">{formatMoney(selectedDeal.askingPrice)}</p>
            </div>
            <div className="card text-center px-2 sm:px-4">
              <p className="text-text-muted text-xs sm:text-sm">Multiple</p>
              <p className="text-lg sm:text-2xl font-bold font-mono">{selectedDeal.business.acquisitionMultiple.toFixed(1)}x</p>
            </div>
          </div>

          {/* Cash Position Bar */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Your Cash:</span>
              <span className="font-mono font-bold text-sm">{formatMoney(cash)}</span>
            </div>
            <span className="text-xs text-text-muted">Min. down payment (25%): {formatMoney(selectedDeal.effectivePrice * 0.25)}</span>
          </div>

          <h4 className="font-bold mb-4">Choose Deal Structure</h4>

          {structures.length === 0 ? (
            <div className="card text-text-muted py-6">
              <div className="text-center mb-6">
                <p className="text-warning font-medium text-base mb-2">Not enough cash for this deal</p>
                <p className="text-sm">
                  Need at least {formatMoney(selectedDeal.effectivePrice * 0.25)} (25% of {formatMoney(selectedDeal.effectivePrice)})
                </p>
                <p className="text-sm">
                  You have {formatMoney(cash)} — shortfall: <span className="text-warning font-mono">{formatMoney(Math.max(0, selectedDeal.effectivePrice * 0.25 - cash))}</span>
                </p>
              </div>
              {/* In-modal equity raise for Scenario A */}
              {(() => {
                const shortfall = Math.max(0, Math.round(selectedDeal.effectivePrice * 0.25) - cash);
                const suggestedRaise = Math.ceil(shortfall / 100) * 100;
                const canRaise = !raiseBlocked;
                const parsedAmount = parseInt(modalEquityAmount) || 0;
                const internalAmount = Math.round(parsedAmount / 1000);
                const newShares = effectivePricePerShare > 0 ? Math.round((internalAmount / effectivePricePerShare) * 1000) / 1000 : 0;
                const newTotal = sharesOutstanding + newShares;
                const newOwnership = newTotal > 0 ? founderShares / newTotal * 100 : 100;
                const wouldBreachFloor = newOwnership < 51;
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
                            <p className="text-text-muted">= {newShares.toFixed(1)} shares @ {formatMoney(effectivePricePerShare)}/share{equityRaisesUsed > 0 ? ` (${Math.round((1 - equityDiscount) * 100)}% discount)` : ''}</p>
                            <p className={`font-medium ${wouldBreachFloor ? 'text-danger' : newOwnership < 55 ? 'text-warning' : 'text-text-secondary'}`}>
                              Ownership: {(founderShares / sharesOutstanding * 100).toFixed(1)}% → {newOwnership.toFixed(1)}%
                            </p>
                            {wouldBreachFloor && <p className="text-danger">Below 51% — raise would be blocked</p>}
                          </div>
                        )}
                        <p className="text-xs text-text-muted mt-2">Raise #{equityRaisesUsed + 1}{equityRaisesUsed > 0 ? ` — ${Math.round((1 - equityDiscount) * 100)}% investor discount` : ' — no discount'}</p>
                      </>
                    ) : (
                      <p className="text-sm text-warning">
                        {raiseCooldownBlocked ? `Cooldown: buyback in Y${lastBuybackRound} — wait ${raiseCooldownRemainder} more yr` : 'Cannot raise equity at this time.'}
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
                    structure.risk === 'low' ? 'border-green-500/30' :
                    structure.risk === 'medium' ? 'border-yellow-500/30' :
                    'border-red-500/30'
                  }`}
                  onClick={() => {
                    if (!distressRestrictions.canAcquire || acquisitionsThisRound >= maxAcquisitionsPerRound) return;
                    if (acquiringRef.current) return;
                    acquiringRef.current = true;
                    if (selectedTuckInPlatform) {
                      onAcquireTuckIn(selectedDeal, structure, selectedTuckInPlatform);
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
                    {structure.sellerNote && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Seller Note</span>
                        <span className="font-mono">{formatMoney(structure.sellerNote.amount)} @ {formatPercent(structure.sellerNote.rate)}</span>
                      </div>
                    )}
                    {structure.bankDebt && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Bank Debt</span>
                        <span className="font-mono">{formatMoney(structure.bankDebt.amount)} @ {formatPercent(structure.bankDebt.rate)}</span>
                      </div>
                    )}
                    {structure.earnout && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Earnout (if {Math.round(structure.earnout.targetEbitdaGrowth * 100)}%+ growth)</span>
                        <span className="font-mono">{formatMoney(structure.earnout.amount)}</span>
                      </div>
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

            {/* Scenario B: Collapsible equity raise for when you can afford some structures but want more options */}
            {(() => {
              if (raiseBlocked) return null;
              const parsedAmount = parseInt(modalEquityAmount) || 0;
              const internalAmount = Math.round(parsedAmount / 1000);
              const newShares = effectivePricePerShare > 0 ? Math.round((internalAmount / effectivePricePerShare) * 1000) / 1000 : 0;
              const newTotal = sharesOutstanding + newShares;
              const newOwnership = newTotal > 0 ? founderShares / newTotal * 100 : 100;
              const wouldBreachFloor = newOwnership < 51;
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
                          <p className={`font-medium ${wouldBreachFloor ? 'text-danger' : newOwnership < 55 ? 'text-warning' : 'text-text-secondary'}`}>
                            Ownership: {(founderShares / sharesOutstanding * 100).toFixed(1)}% → {newOwnership.toFixed(1)}%
                          </p>
                          {wouldBreachFloor && <p className="text-danger">Below 51% — raise would be blocked</p>}
                        </div>
                      )}
                      <p className="text-xs text-text-muted mt-2">Raise #{equityRaisesUsed + 1}{equityRaisesUsed > 0 ? ` — ${Math.round((1 - equityDiscount) * 100)}% investor discount` : ' — no discount'}</p>
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
        </div>
      </div>
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
    <div className="px-4 sm:px-6 py-6 pb-8">
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
                    description = `Tuck-in of ${boltOn?.name ?? 'bolt-on'} into ${platform?.name ?? 'platform'} was troubled. ${formatMoney(cost)} restructuring cost deducted and ${platform?.name ?? 'platform'}'s growth permanently reduced by ${drag.toFixed(1)}%.`;
                  } else {
                    description = `Merger into ${d.newName as string} was troubled. ${formatMoney(cost)} restructuring cost deducted and growth permanently reduced by ${drag.toFixed(1)}%.`;
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
                          Sell Platform (+{PLATFORM_SALE_BONUS.toFixed(1)}x bonus)
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

            {/* Turnaround Operations */}
            {(() => {
              const activeCount = activeTurnarounds.filter(t => t.status === 'active').length;
              const tierCheck = canUnlockTier(turnaroundTier, cash, activeBusinesses.length);
              const nextTier = (turnaroundTier + 1) as 1 | 2 | 3;
              const nextTierConfig = nextTier <= 3 ? TURNAROUND_TIER_CONFIG[nextTier] : null;
              const tierAnnualCost = getTurnaroundTierAnnualCost(turnaroundTier);

              // Get eligible businesses and their programs
              const eligibleForTurnaround = turnaroundTier > 0
                ? activeBusinesses
                    .filter(b => !activeTurnarounds.some(t => t.businessId === b.id && t.status === 'active'))
                    .filter(b => {
                      const programs = getEligiblePrograms(b, turnaroundTier, activeTurnarounds);
                      return programs.length > 0;
                    })
                : [];

              const showSection = turnaroundTier > 0 || (activeBusinesses.length >= 2 && nextTierConfig);

              if (!showSection) return null;

              return (
                <div className="card bg-amber-500/5 border-amber-500/30 mb-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-bold text-amber-400">Turnaround Operations</h3>
                      {turnaroundTier > 0 && (
                        <p className="text-xs text-text-muted mt-0.5">
                          Tier {turnaroundTier}: {TURNAROUND_TIER_CONFIG[turnaroundTier as 1 | 2 | 3].name}
                          {tierAnnualCost > 0 && <span className="ml-1">({formatMoney(tierAnnualCost)}/yr)</span>}
                        </p>
                      )}
                    </div>
                    {turnaroundTier < 3 && nextTierConfig && (
                      <button
                        onClick={onUnlockTurnaroundTier}
                        disabled={!tierCheck.canUnlock}
                        className={`btn-primary text-sm px-4 py-3 min-h-[44px] whitespace-nowrap ${!tierCheck.canUnlock ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={tierCheck.reason ?? ''}
                      >
                        {turnaroundTier === 0 ? 'Unlock' : 'Upgrade to'} T{nextTier} ({formatMoney(nextTierConfig.unlockCost)})
                      </button>
                    )}
                  </div>

                  {/* Tier unlock info for tier 0 */}
                  {turnaroundTier === 0 && nextTierConfig && (
                    <div className="bg-white/5 rounded-lg p-3 text-sm">
                      <p className="text-text-secondary mb-2">{nextTierConfig.description}</p>
                      <ul className="text-xs text-text-muted space-y-1">
                        {nextTierConfig.effects.map((e, i) => (
                          <li key={i}>- {e}</li>
                        ))}
                      </ul>
                      {!tierCheck.canUnlock && tierCheck.reason && (
                        <p className="text-xs text-amber-400 mt-2">{tierCheck.reason}</p>
                      )}
                    </div>
                  )}

                  {/* Active turnarounds */}
                  {activeTurnarounds.filter(t => t.status === 'active').length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-text-muted mb-2">Active Turnarounds</p>
                      {activeCount >= TURNAROUND_FATIGUE_THRESHOLD && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-2 text-xs text-amber-400">
                          Portfolio fatigue: {activeCount} active turnarounds. Success rates reduced by 10ppt.
                        </div>
                      )}
                      <div className="space-y-2">
                        {activeTurnarounds.filter(t => t.status === 'active').map(ta => {
                          const prog = getProgramById(ta.programId);
                          const biz = activeBusinesses.find(b => b.id === ta.businessId);
                          if (!prog || !biz) return null;
                          const roundsLeft = ta.endRound - round;
                          const totalDuration = ta.endRound - ta.startRound;
                          const progress = totalDuration > 0 ? Math.round(((totalDuration - roundsLeft) / totalDuration) * 100) : 100;
                          return (
                            <div key={ta.id} className="bg-white/5 rounded-lg p-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-medium text-sm truncate min-w-0">
                                  {SECTORS[biz.sectorId]?.emoji} {biz.name}
                                </span>
                                <span className="text-xs text-amber-400 whitespace-nowrap">
                                  Q{prog.sourceQuality} → Q{prog.targetQuality}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mb-1">
                                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-amber-400 rounded-full transition-all"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <span className="text-xs text-text-muted whitespace-nowrap">
                                  {roundsLeft > 0 ? `${roundsLeft}yr left` : 'Resolving...'}
                                </span>
                              </div>
                              <div className="flex gap-2 text-xs text-text-muted">
                                <span>{formatPercent(prog.successRate)} success</span>
                                <span>{formatMoney(prog.annualCost)}/yr</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Completed/failed turnarounds summary */}
                  {activeTurnarounds.filter(t => t.status !== 'active').length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-text-muted mb-2">Completed</p>
                      <div className="flex flex-wrap gap-1">
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
                    </div>
                  )}

                  {/* Start new turnaround */}
                  {turnaroundTier > 0 && eligibleForTurnaround.length > 0 && (
                    <div>
                      <p className="text-xs text-text-muted mb-2">Eligible Businesses</p>
                      <div className="space-y-3">
                        {eligibleForTurnaround.map(biz => {
                          const programs = getEligiblePrograms(biz, turnaroundTier, activeTurnarounds);
                          return (
                            <div key={biz.id} className="bg-white/5 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-medium text-sm truncate min-w-0">
                                  {SECTORS[biz.sectorId]?.emoji} {biz.name}
                                </span>
                                <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded">Q{biz.qualityRating}</span>
                              </div>
                              <div className="space-y-2">
                                {programs.map(prog => {
                                  const upfrontCost = calculateTurnaroundCost(prog, biz);
                                  const canAffordProg = cash >= upfrontCost;
                                  return (
                                    <div key={prog.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-white/5 rounded p-2">
                                      <div className="text-xs">
                                        <span className="text-amber-400 font-medium">Q{prog.sourceQuality} → Q{prog.targetQuality}</span>
                                        <span className="text-text-muted ml-2">
                                          {prog.durationStandard}yr &middot; {formatPercent(prog.successRate)} success
                                        </span>
                                        <span className="text-text-muted ml-2">
                                          {formatMoney(upfrontCost)} + {formatMoney(prog.annualCost)}/yr
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => setTurnaroundConfirm({ businessId: biz.id, programId: prog.id })}
                                        disabled={!canAffordProg}
                                        className={`btn-primary text-xs px-3 py-2 min-h-[44px] whitespace-nowrap ${!canAffordProg ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        Start ({formatMoney(upfrontCost)})
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {turnaroundTier > 0 && eligibleForTurnaround.length === 0 && activeTurnarounds.filter(t => t.status === 'active').length === 0 && (
                    <p className="text-xs text-text-muted">
                      No businesses currently eligible for turnaround programs. Businesses with Q1-Q2 quality ratings can be enrolled.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeBusinesses.filter(b => !b.parentPlatformId).map(business => (
                <BusinessCard
                  key={business.id}
                  business={business}
                  onSell={() => setSellConfirmBusiness(business)}
                  onImprove={() => setSelectedBusinessForImprovement(business)}
                  onDesignatePlatform={!business.isPlatform ? () => onDesignatePlatform(business.id) : undefined}

                  onShowRollUpGuide={() => setShowRollUpGuide(true)}
                  isPlatform={business.isPlatform}
                  platformScale={business.platformScale}
                  boltOnCount={business.boltOnIds?.length || 0}
                  canAffordPlatform={cash >= business.ebitda * 0.05}
                  currentRound={round}
                  lastEventType={lastEventType}
                  integratedPlatforms={integratedPlatforms}
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
            {/* M&A Focus Settings */}
            <div className="card mb-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2 sm:gap-0">
                <div>
                  <h3 className="font-bold">M&A Focus</h3>
                  <p className="text-sm text-text-muted">Set your acquisition preferences to see more relevant deals</p>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setShowMarketGuide(true)}
                    className="btn-secondary text-sm flex items-center gap-2"
                  >
                    <span>📊</span> Market Guide
                  </button>
                  {aiEnabled && (
                    <span className="text-xs text-accent flex items-center gap-1 px-2 py-1 bg-accent/10 rounded">
                      <span>🤖</span> AI Enhanced
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-muted mb-2">Target Sector</label>
                  <select
                    value={maFocus.sectorId || ''}
                    onChange={(e) => onSetMAFocus(
                      e.target.value ? e.target.value as SectorId : null,
                      maFocus.sizePreference
                    )}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">Any Sector</option>
                    {SECTOR_LIST.map(sector => (
                      <option key={sector.id} value={sector.id}>
                        {sector.emoji} {sector.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-2">Target Size</label>
                  <select
                    value={maFocus.sizePreference}
                    onChange={(e) => onSetMAFocus(
                      maFocus.sectorId,
                      e.target.value as DealSizePreference
                    )}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="any">Any Size</option>
                    <option value="small">Small ($500k-$1.5M EBITDA)</option>
                    <option value="medium">Medium ($1.5M-$3M EBITDA)</option>
                    <option value="large">Large ($3M+ EBITDA)</option>
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
              {passedDealIds.size > 0 && (
                <button
                  onClick={() => setShowPassedDeals(!showPassedDeals)}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassedDeals ? 'Hide' : 'Show'} {passedDealIds.size} passed deal{passedDealIds.size !== 1 ? 's' : ''}
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
                  Next raise: {equityRaisesUsed > 0 ? `${Math.round((1 - equityDiscount) * 100)}% discount` : 'no discount'}{raiseCooldownBlocked ? ` (cooldown: ${raiseCooldownRemainder}yr)` : ''}
                </span>
              </div>
            )}

            {/* Deals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dealPipeline
                .filter(deal => showPassedDeals || !passedDealIds.has(deal.id))
                .map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onSelect={() => setSelectedDeal(deal)}
                  disabled={!distressRestrictions.canAcquire || acquisitionsThisRound >= maxAcquisitionsPerRound}
                  unaffordable={cash < Math.round(deal.effectivePrice * 0.25)}
                  availablePlatforms={getPlatformsForSector(deal.business.sectorId)}
                  isPassed={passedDealIds.has(deal.id)}
                  onPass={() => {
                    setPassedDealIds(prev => {
                      const next = new Set(prev);
                      if (next.has(deal.id)) {
                        next.delete(deal.id);
                      } else {
                        next.add(deal.id);
                      }
                      return next;
                    });
                  }}
                />
              ))}
              {dealPipeline.length === 0 && (
                <div className="col-span-full card text-center text-text-muted py-12">
                  <p>No deals available this year.</p>
                  <p className="text-sm mt-2">New opportunities will appear next year.</p>
                </div>
              )}
              {dealPipeline.length > 0 && dealPipeline.every(d => passedDealIds.has(d.id)) && !showPassedDeals && (
                <div className="col-span-full card text-center text-text-muted py-12">
                  <p>All deals passed on.</p>
                  <p className="text-sm mt-2">
                    <button
                      onClick={() => setShowPassedDeals(true)}
                      className="text-accent hover:underline"
                    >
                      Show passed deals
                    </button>
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
            {/* Debt Summary */}
            {(() => {
              const opcoSellerNotes = businesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
              const opcoBankDebt = businesses.reduce((sum, b) => sum + b.bankDebtBalance, 0);
              const totalAllDebt = holdcoLoanBalance + opcoBankDebt + opcoSellerNotes;
              return (
                <div className="card bg-white/5">
                  <h4 className="font-bold mb-3">Debt Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-text-muted">Holdco Debt</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(holdcoLoanBalance)}</p>
                      <p className="text-xs text-text-muted">Auto-amortizes (10%/yr) + manual</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Opco Seller Notes</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(opcoSellerNotes)}</p>
                      <p className="text-xs text-text-muted">Auto-amortizing</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Opco Bank Debt</p>
                      <p className="font-mono font-bold text-lg">{formatMoney(opcoBankDebt)}</p>
                      <p className="text-xs text-text-muted">Paid on sale</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Total Debt</p>
                      <p className="font-mono font-bold text-lg text-warning">{formatMoney(totalAllDebt)}</p>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-white/5 rounded text-xs text-text-muted">
                    <strong>How debt works:</strong> Holdco debt has a 2-year grace period, then 10% of the balance amortizes automatically each year. You can also pay down extra here. Seller notes auto-amortize each year. Bank debt at the business level amortizes automatically and can also be paid down voluntarily below.
                  </div>
                </div>
              );
            })()}

            {/* Cap Table / Equity Summary */}
            {(() => {
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
                        className={`h-full transition-all ${founderOwnership > 0.6 ? 'bg-accent' : founderOwnership > 0.51 ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${founderOwnership * 100}%` }}
                      />
                    </div>
                    {founderOwnership < 0.55 && (
                      <p className="text-xs text-warning mt-1">Control at risk — you must stay above 51%</p>
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
                    You must always hold &gt;51% to keep control.
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pay Down Holdco Debt */}
            <div className="card">
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
            </div>

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

            {/* Issue Equity */}
            <div className={`card ${raiseBlocked ? 'opacity-50' : ''}`}>
              <h4 className="font-bold mb-3">Issue Equity</h4>
              <p className="text-sm text-text-muted mb-2">
                Raise capital by selling new shares at {formatMoney(effectivePricePerShare)}/share{equityRaisesUsed > 0 ? ` (${Math.round((1 - equityDiscount) * 100)}% discount)` : ''}.
              </p>
              <p className="text-xs text-text-muted mb-4">
                Your ownership: {(founderShares / sharesOutstanding * 100).toFixed(1)}% | Raise #{equityRaisesUsed + 1}
              </p>
              {raiseCooldownBlocked && (
                <p className="text-xs text-warning mb-4">Cooldown: buyback in Y{lastBuybackRound} — wait {raiseCooldownRemainder} more yr</p>
              )}
              {/* Mode toggle */}
              <div className="flex gap-1 mb-3 bg-white/5 rounded p-0.5 w-fit">
                <button
                  onClick={() => { setEquityMode('dollars'); setEquityAmount(''); }}
                  className={`text-xs px-3 py-1 rounded transition-colors ${equityMode === 'dollars' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
                >
                  $ Amount
                </button>
                <button
                  onClick={() => { setEquityMode('shares'); setEquityAmount(''); }}
                  className={`text-xs px-3 py-1 rounded transition-colors ${equityMode === 'shares' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}
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
                      if (shareCount > 0 && intrinsicValuePerShare > 0) {
                        const internalAmount = Math.floor(shareCount * intrinsicValuePerShare);
                        if (internalAmount > 0) {
                          onIssueEquity(internalAmount);
                          setEquityAmount('');
                        }
                      }
                    }
                  }}
                  disabled={(() => {
                    if (raiseBlocked) return true;
                    if (!equityAmount || effectivePricePerShare <= 0) return true;
                    if (equityMode === 'dollars') {
                      const dollars = parseInt(equityAmount) || 0;
                      return dollars < 1000;
                    } else {
                      const shareCount = parseInt(equityAmount) || 0;
                      return shareCount < 1;
                    }
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
                      <span className="font-mono">{formatMoney(effectivePricePerShare)}{equityRaisesUsed > 0 ? ` (${Math.round((1 - equityDiscount) * 100)}% off)` : ''}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Your new ownership</span>
                      <span className={`font-mono font-bold ${newOwnership < 51 ? 'text-danger' : newOwnership < 55 ? 'text-warning' : ''}`}>
                        {newOwnership.toFixed(1)}%
                      </span>
                    </div>
                    {newOwnership < 51 && (
                      <p className="text-danger mt-1">Below 51% — this raise would be blocked</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Buyback Shares */}
            <div className={`card ${buybackCooldownBlocked || activeBusinesses.length === 0 ? 'opacity-50' : ''}`}>
              <h4 className="font-bold mb-3">Buyback Shares</h4>
              <p className="text-sm text-text-muted mb-2">
                Repurchase outside investor shares at {formatMoney(intrinsicValuePerShare)}/share.
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
                      if (shareCount > 0 && intrinsicValuePerShare > 0) {
                        const internalAmount = Math.floor(shareCount * intrinsicValuePerShare);
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
                      const cost = Math.floor(shareCount * intrinsicValuePerShare);
                      return shareCount < 1 || shareCount > Math.ceil(outsideShares) || cost > cash || intrinsicValuePerShare <= 0;
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
              {buybackMode === 'shares' && buybackAmount && parseInt(buybackAmount) >= 1 && intrinsicValuePerShare > 0 && (() => {
                const shareCount = parseInt(buybackAmount) || 0;
                const cost = Math.floor(shareCount * intrinsicValuePerShare);
                return (
                  <p className="text-xs text-text-muted mt-1">= {formatMoney(cost)} ({shareCount} shares @ {formatMoney(intrinsicValuePerShare)}/share)</p>
                );
              })()}
              {/* Detail preview */}
              {buybackAmount && intrinsicValuePerShare > 0 && (() => {
                let internalAmt: number;
                if (buybackMode === 'dollars') {
                  const dollars = parseInt(buybackAmount) || 0;
                  if (dollars < 1000) return null;
                  internalAmt = Math.round(dollars / 1000);
                } else {
                  const shareCount = parseInt(buybackAmount) || 0;
                  if (shareCount < 1) return null;
                  internalAmt = Math.floor(shareCount * intrinsicValuePerShare);
                }
                const sharesRepurchased = Math.round((internalAmt / intrinsicValuePerShare) * 1000) / 1000;
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
            <div className="card">
              <h4 className="font-bold mb-3">Distribute to Owners</h4>
              <p className="text-sm text-text-muted mb-2">
                Returns cash to shareholders. Distributed: {formatMoney(totalDistributions)}
              </p>
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
                  disabled={!distributeAmount || (parseInt(distributeAmount) || 0) < 1000 || Math.round((parseInt(distributeAmount) || 0) / 1000) > cash || !distressRestrictions.canDistribute}
                  className="btn-primary text-sm min-h-[44px]"
                >
                  {!distressRestrictions.canDistribute ? 'Blocked' : 'Distribute'}
                </button>
              </div>
              {distributeAmount && parseInt(distributeAmount) >= 1000 && (
                <p className="text-xs text-text-muted mt-1 mb-2">= {formatMoney(Math.round(parseInt(distributeAmount) / 1000))}</p>
              )}
              <p className="text-xs text-text-muted">
                <strong>Scoring:</strong> Distributing when ROIIC is low and leverage is healthy earns points. But distributing while ROIIC is high (should reinvest) or leverage is high (should deleverage) costs points. Hoarding excess cash also hurts. Follow the hierarchy: reinvest → deleverage → buyback → distribute.
              </p>
            </div>
          </div>
          </div>
        )}
      </div>

      {/* End Round Button */}
      <div className="flex justify-end">
        <button onClick={() => setShowEndTurnConfirm(true)} className="btn-primary text-lg px-8">
          End Year →
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
                      {activeBusinesses.filter(b => !b.parentPlatformId).map(biz => (
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
                          .filter(b => b.sectorId === mergeSelection.first?.sectorId && b.id !== mergeSelection.first?.id && !b.parentPlatformId)
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
                  const mergeCost = Math.round(Math.min(mergeSelection.first.ebitda, mergeSelection.second.ebitda) * 0.15);
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

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
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
                            {Math.max(mergeSelection.first.platformScale || 0, mergeSelection.second.platformScale || 0) + 1}
                          </p>
                          <p className="text-xs text-text-muted">Multiple expansion</p>
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
                          onMergeBusinesses(mergeSelection.first.id, mergeSelection.second.id, mergeName.trim());
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
        const sellMoic = valuation.netProceeds / totalInvested;
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
                  <span className="text-text-muted">Total Invested</span>
                  <span className="font-mono">{formatMoney(totalInvested)}</span>
                </div>
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

        const constituentDetails = constituents.map(biz => {
          const val = calculateExitValuation(biz, round, lastEventType, undefined, integratedPlatforms);
          const baseExitMultiple = val.totalMultiple;
          const withBonus = baseExitMultiple + PLATFORM_SALE_BONUS;
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
        const combinedMoic = totalNet / totalInvested;
        const sectorEmojis = ip.sectorIds.map(sid => SECTORS[sid]?.emoji).filter(Boolean).join(' ');

        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-bg-primary border border-purple-500/30 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h3 className="text-lg sm:text-xl font-bold text-purple-400 mb-2">Sell {sectorEmojis} {ip.name}?</h3>
              <p className="text-xs text-text-muted mb-4">Sell all constituent businesses as a single platform. Includes a +{PLATFORM_SALE_BONUS.toFixed(1)}x multiple bonus for selling as a unit.</p>

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
                  <span className="font-mono text-purple-400">+{PLATFORM_SALE_BONUS.toFixed(1)}x per business</span>
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

      {/* Turnaround Confirmation Modal */}
      {turnaroundConfirm && (() => {
        const prog = getProgramById(turnaroundConfirm.programId);
        const biz = activeBusinesses.find(b => b.id === turnaroundConfirm.businessId);
        if (!prog || !biz) return null;
        const upfrontCost = calculateTurnaroundCost(prog, biz);
        const activeCount = activeTurnarounds.filter(t => t.status === 'active').length;
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-bg-primary border border-white/10 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h3 className="text-lg font-bold text-amber-400 mb-2">Start Turnaround Program?</h3>
              <div className="bg-white/5 rounded-lg p-3 mb-4">
                <p className="font-medium text-sm">{SECTORS[biz.sectorId]?.emoji} {biz.name}</p>
                <p className="text-xs text-text-muted mt-1">{biz.subType} &middot; Current Quality: Q{biz.qualityRating}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                <div className="bg-amber-500/10 rounded p-2 text-center">
                  <p className="text-text-muted">Target</p>
                  <p className="font-bold text-amber-400">Q{prog.sourceQuality} → Q{prog.targetQuality}</p>
                </div>
                <div className="bg-blue-500/10 rounded p-2 text-center">
                  <p className="text-text-muted">Duration</p>
                  <p className="font-bold text-blue-400">{prog.durationStandard} years</p>
                </div>
                <div className="bg-green-500/10 rounded p-2 text-center">
                  <p className="text-text-muted">Success Rate</p>
                  <p className="font-bold text-green-400">{formatPercent(prog.successRate)}</p>
                </div>
                <div className="bg-red-500/10 rounded p-2 text-center">
                  <p className="text-text-muted">Failure Rate</p>
                  <p className="font-bold text-red-400">{formatPercent(prog.failureRate)}</p>
                </div>
              </div>
              <div className="text-xs text-text-muted space-y-1 mb-4">
                <p>Upfront cost: <span className="text-text-primary font-mono">{formatMoney(upfrontCost)}</span></p>
                <p>Annual cost: <span className="text-text-primary font-mono">{formatMoney(prog.annualCost)}/yr</span></p>
                <p>On success: EBITDA +{formatPercent(prog.ebitdaBoostOnSuccess)}</p>
                <p>On partial: EBITDA +{formatPercent(prog.ebitdaBoostOnPartial)} (Q+1 instead of full target)</p>
                <p>On failure: EBITDA -{formatPercent(prog.ebitdaDamageOnFailure)}</p>
              </div>
              {activeCount >= TURNAROUND_FATIGUE_THRESHOLD - 1 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-4 text-xs text-amber-400">
                  Warning: This will bring you to {activeCount + 1} active turnarounds. At {TURNAROUND_FATIGUE_THRESHOLD}+ turnarounds, success rates are reduced by 10ppt.
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setTurnaroundConfirm(null)} className="btn-secondary px-6 min-h-[44px] flex-1">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onStartTurnaround(turnaroundConfirm.businessId, turnaroundConfirm.programId);
                    setTurnaroundConfirm(null);
                  }}
                  className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors flex-1"
                >
                  Start Program ({formatMoney(upfrontCost)})
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* End Turn Confirmation Modal */}
      {showEndTurnConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-primary border border-white/10 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">End Year {round}?</h3>
            <p className="text-text-secondary mb-2">
              Are you sure you want to end Year {round}?
            </p>
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
                    <span className="text-text-muted text-xs">Projected cash after debt service</span>
                    <p className={`font-mono font-medium ${covenantHeadroom.cashWillGoNegative ? 'text-red-400' : 'text-text-primary'}`}>
                      ~{formatMoney(covenantHeadroom.projectedCashAfterDebt)}
                    </p>
                  </div>
                </div>
                {/* Warnings */}
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
              <button
                onClick={() => setShowEndTurnConfirm(false)}
                className="btn-secondary px-6"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowEndTurnConfirm(false);
                  onEndRound();
                }}
                className="btn-primary px-6"
              >
                End Year
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
