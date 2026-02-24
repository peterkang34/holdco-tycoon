import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useGameStore } from '../../hooks/useGame';
import { useToastStore } from '../../hooks/useToast';
import { getDistressRestrictions } from '../../engine/distress';
import { getMASourcingAnnualCost, MA_SOURCING_CONFIG } from '../../data/sharedServices';
import { getTurnaroundTierAnnualCost, getProgramById } from '../../data/turnaroundPrograms';
import { SECTORS } from '../../data/sectors';
import { Deal, DealStructure, SharedServiceType, OperationalImprovementType, formatMoney } from '../../engine/types';
import { getStructureLabel } from '../../engine/deals';
import { Dashboard } from '../dashboard/Dashboard';
import { CollectPhase } from '../phases/CollectPhase';
import { EventPhase } from '../phases/EventPhase';
import { AllocatePhase } from '../phases/AllocatePhase';
import { RestructurePhase } from '../phases/RestructurePhase';
import { InstructionsModal } from '../ui/InstructionsModal';
import { AnnualReportModal } from '../ui/AnnualReportModal';
import { LeaderboardModal } from '../ui/LeaderboardModal';
import { UserManualModal } from '../ui/UserManualModal';
import { MetricDrilldownModal } from '../ui/MetricDrilldownModal';
import { ToastContainer } from '../ui/ToastContainer';
import { calculateFounderEquityValue, calculateFounderPersonalWealth } from '../../engine/scoring';
import { DIFFICULTY_CONFIG } from '../../data/gameConfig';
import { updateSessionRound, trackEventChoice } from '../../services/telemetry';
import { hasSeenNudge, dismissNudge } from '../../hooks/useNudges';
import { MIN_OPCOS_FOR_SHARED_SERVICES } from '../../data/sharedServices';
import { buildChallengeUrl, copyToClipboard } from '../../utils/challenge';

const TUTORIAL_SEEN_KEY = 'holdco-tycoon-tutorial-seen-v3';

const IMPROVEMENT_LABELS: Record<string, string> = {
  operating_playbook: 'Operating Playbook',
  pricing_model: 'Pricing Model',
  service_expansion: 'Service Expansion',
  fix_underperformance: 'Fix Underperformance',
  recurring_revenue_conversion: 'Recurring Revenue',
  management_professionalization: 'Professionalize Mgmt',
  digital_transformation: 'Digital Transformation',
};

interface GameScreenProps {
  onGameOver: () => void;
  onResetGame: () => void;
  showTutorial?: boolean;
  isChallenge?: boolean;
}

export function GameScreen({ onGameOver, onResetGame, showTutorial = false, isChallenge = false }: GameScreenProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAnnualReports, setShowAnnualReports] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const {
    holdcoName,
    round,
    phase,
    gameOver,
    businesses,
    cash,
    totalDebt,
    holdcoLoanBalance,
    holdcoLoanRate,
    holdcoLoanRoundsRemaining,
    interestRate,
    creditTighteningRoundsRemaining,
    dealPipeline,
    passedDealIds,
    sharedServices,
    currentEvent,
    eventHistory,
    equityRaisesUsed,
    lastEquityRaiseRound,
    lastBuybackRound,
    sharesOutstanding,
    founderShares,
    initialRaiseAmount,
    totalBuybacks,
    totalDistributions,
    metrics,
    focusBonus,
    requiresRestructuring: _requiresRestructuring,
    covenantBreachRounds,
    hasRestructured,
    bankruptRound: _bankruptRound,
    holdcoAmortizationThisRound: _holdcoAmortizationThisRound,
    roundHistory,
    advanceToEvent,
    advanceToAllocate,
    endRound,
    acquireBusiness,
    acquireTuckIn,
    passDeal,
    mergeBusinesses,
    designatePlatform,
    unlockSharedService,
    deactivateSharedService,
    payDownDebt,
    payDownBankDebt,
    issueEquity,
    buybackShares,
    distributeToOwners,
    sellBusiness,

    improveBusiness,
    acceptOffer,
    declineOffer,
    acceptMBOOffer,
    declineMBOOffer,
    grantEquityDemand,
    declineEquityDemand,
    acceptSellerNoteRenego,
    declineSellerNoteRenego,
    keyManGoldenHandcuffs,
    keyManSuccessionPlan,
    keyManAcceptHit,
    earnoutSettle,
    earnoutFight,
    earnoutRenegotiate,
    supplierAbsorb,
    supplierSwitch,
    supplierVerticalIntegration,
    sellerDeceptionTurnaround,
    sellerDeceptionFireSale,
    sellerDeceptionAbsorb,
    workingCapitalInject,
    workingCapitalCredit,
    workingCapitalAbsorb,
    successionInvest,
    successionPromote,
    successionSell,
    maFocus,
    setMAFocus,
    maSourcing,
    upgradeMASourcing,
    toggleMASourcing,
    proactiveOutreach,
    forgeIntegratedPlatform,
    addToIntegratedPlatform,
    sellPlatform,
    integratedPlatforms,
    turnaroundTier,
    activeTurnarounds,
    unlockTurnaroundTier,
    startTurnaroundProgram,
    triggerAIEnhancement,
    sourceDealFlow,
    distressedSale,
    emergencyEquityRaise,
    declareBankruptcy,
    advanceFromRestructure,
    fetchEventNarrative,
    generateBusinessStories,
    yearChronicle,
    generateYearChronicle: generateYearChronicleAction,
    debtPaymentThisRound,
    cashBeforeDebtPayments,
    actionsThisRound,
    acquisitionsThisRound,
    maxAcquisitionsPerRound,
    maxRounds,
    difficulty,
    duration,
    seed,
    lastAcquisitionResult,
  } = useGameStore();

  const founderOwnership = founderShares / sharesOutstanding;

  const addToast = useToastStore((s) => s.addToast);

  const handleCopyChallenge = useCallback(async () => {
    if (!seed || !difficulty || !duration) return;
    const url = buildChallengeUrl({ seed, difficulty, duration });
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }, [seed, difficulty, duration]);

  const handleEventChoice = (action: string) => {
    // Locked choices are no-ops
    if (action.endsWith('Locked')) return;

    // Track event choice for analytics
    if (currentEvent) {
      trackEventChoice(currentEvent.type, action, round);
    }

    switch (action) {
      case 'acceptOffer': acceptOffer(); break;
      case 'declineOffer': declineOffer(); break;
      case 'acceptMBOOffer': acceptMBOOffer(); break;
      case 'declineMBOOffer': declineMBOOffer(); break;
      case 'grantEquityDemand': grantEquityDemand(); break;
      case 'declineEquityDemand': declineEquityDemand(); break;
      case 'acceptSellerNoteRenego': acceptSellerNoteRenego(); break;
      case 'declineSellerNoteRenego': declineSellerNoteRenego(); break;
      case 'keyManGoldenHandcuffs': keyManGoldenHandcuffs(); break;
      case 'keyManSuccessionPlan': keyManSuccessionPlan(); break;
      case 'keyManAcceptHit': keyManAcceptHit(); break;
      case 'earnoutSettle': earnoutSettle(); break;
      case 'earnoutFight': earnoutFight(); break;
      case 'earnoutRenegotiate': earnoutRenegotiate(); break;
      case 'supplierAbsorb': supplierAbsorb(); break;
      case 'supplierSwitch': supplierSwitch(); break;
      case 'supplierVerticalIntegration': supplierVerticalIntegration(); break;
      case 'sellerDeceptionTurnaround': sellerDeceptionTurnaround(); break;
      case 'sellerDeceptionFireSale': sellerDeceptionFireSale(); break;
      case 'sellerDeceptionAbsorb': sellerDeceptionAbsorb(); break;
      case 'workingCapitalInject': workingCapitalInject(); break;
      case 'workingCapitalCredit': workingCapitalCredit(); break;
      case 'workingCapitalAbsorb': workingCapitalAbsorb(); break;
      case 'successionInvest': successionInvest(); break;
      case 'successionPromote': successionPromote(); break;
      case 'successionSell': successionSell(); break;
    }
    // Only advance if the action succeeded (cleared currentEvent)
    // If it failed (e.g., insufficient cash), event stays on screen
    if (!useGameStore.getState().currentEvent) {
      advanceToAllocate();
    } else {
      addToast({ message: 'Insufficient cash for that choice', type: 'warning' });
    }
  };

  // Toast-wrapped action handlers
  const handleAcquire = useCallback((deal: Deal, structure: DealStructure) => {
    acquireBusiness(deal, structure);
    const result = useGameStore.getState().lastAcquisitionResult;
    if (result === 'snatched') {
      addToast({
        message: `Outbid on ${deal.business.name}`,
        detail: 'Another buyer snatched the deal',
        type: 'danger',
      });
    } else {
      addToast({
        message: `Acquired ${deal.business.name}`,
        detail: `${formatMoney(deal.askingPrice)} via ${getStructureLabel(structure.type)}`,
        type: 'success',
      });
    }
  }, [acquireBusiness, addToast]);

  const handleAcquireTuckIn = useCallback((deal: Deal, structure: DealStructure, platformId: string) => {
    const platform = businesses.find(b => b.id === platformId);
    acquireTuckIn(deal, structure, platformId);
    const state = useGameStore.getState();
    const result = state.lastAcquisitionResult;
    const integrationOutcome = state.lastIntegrationOutcome;
    if (result === 'snatched') {
      addToast({
        message: `Outbid on ${deal.business.name}`,
        detail: 'Another buyer snatched the deal',
        type: 'danger',
      });
    } else {
      const structureLabel = `${formatMoney(deal.askingPrice)} via ${getStructureLabel(structure.type)}`;
      const toastType = integrationOutcome === 'failure' ? 'danger' : integrationOutcome === 'partial' ? 'info' : 'success';
      const suffix = integrationOutcome === 'failure' ? ' — troubled integration'
        : integrationOutcome === 'partial' ? ' — rocky integration, reduced synergies'
        : ' — seamless integration';
      addToast({
        message: `Tucked ${deal.business.name} into ${platform?.name ?? 'platform'}`,
        detail: structureLabel + suffix,
        type: toastType,
      });
    }
  }, [acquireTuckIn, businesses, addToast]);

  const handleMerge = useCallback((id1: string, id2: string, newName: string) => {
    const b1 = businesses.find(b => b.id === id1);
    const b2 = businesses.find(b => b.id === id2);
    mergeBusinesses(id1, id2, newName);
    const integrationOutcome = useGameStore.getState().lastIntegrationOutcome;
    const names = b1 && b2 ? `${b1.name} + ${b2.name}` : undefined;
    const toastType = integrationOutcome === 'failure' ? 'danger' : integrationOutcome === 'partial' ? 'info' : 'success';
    const suffix = integrationOutcome === 'failure' ? ' — troubled integration'
      : integrationOutcome === 'partial' ? ' — rocky integration, reduced synergies'
      : ' — seamless integration';
    addToast({
      message: `Merged into ${newName}`,
      detail: names ? names + suffix : undefined,
      type: toastType,
    });
  }, [mergeBusinesses, businesses, addToast]);

  const handleDesignatePlatform = useCallback((businessId: string) => {
    const biz = businesses.find(b => b.id === businessId);
    designatePlatform(businessId);
    addToast({
      message: `${biz?.name ?? 'Business'} designated as platform`,
      detail: 'Can now receive tuck-in acquisitions',
      type: 'info',
    });
  }, [designatePlatform, businesses, addToast]);

  const handleUnlockSharedService = useCallback((serviceType: SharedServiceType) => {
    const svc = sharedServices.find(s => s.type === serviceType);
    unlockSharedService(serviceType);
    addToast({
      message: `Unlocked ${svc?.name ?? serviceType}`,
      detail: svc ? `${formatMoney(svc.unlockCost)} setup + ${formatMoney(svc.annualCost)}/yr` : undefined,
      type: 'success',
    });
  }, [unlockSharedService, sharedServices, addToast]);

  const handleDeactivateSharedService = useCallback((serviceType: SharedServiceType) => {
    const svc = sharedServices.find(s => s.type === serviceType);
    deactivateSharedService(serviceType);
    addToast({
      message: `Deactivated ${svc?.name ?? serviceType}`,
      type: 'warning',
    });
  }, [deactivateSharedService, sharedServices, addToast]);

  const handlePayDebt = useCallback((amount: number) => {
    payDownDebt(amount);
    const remaining = useGameStore.getState().holdcoLoanBalance;
    addToast({
      message: `Paid down ${formatMoney(amount)} holdco debt`,
      detail: remaining > 0 ? `${formatMoney(remaining)} remaining` : 'Holdco debt-free!',
      type: 'success',
    });
  }, [payDownDebt, addToast]);

  const handlePayBankDebt = useCallback((businessId: string, amount: number) => {
    const biz = businesses.find(b => b.id === businessId);
    payDownBankDebt(businessId, amount);
    const updatedBiz = useGameStore.getState().businesses.find(b => b.id === businessId);
    const remaining = updatedBiz?.bankDebtBalance ?? 0;
    addToast({
      message: `Paid down ${formatMoney(amount)} bank debt on ${biz?.name ?? 'business'}`,
      detail: remaining > 0 ? `${formatMoney(remaining)} remaining` : 'Bank debt cleared!',
      type: 'success',
    });
  }, [payDownBankDebt, businesses, addToast]);

  const handleIssueEquity = useCallback((amount: number) => {
    const prevShares = sharesOutstanding;
    issueEquity(amount);
    // Check if equity raise actually succeeded (sharesOutstanding would change)
    // We need to read from store directly since state update is synchronous in Zustand
    const newShares = useGameStore.getState().sharesOutstanding;
    if (newShares === prevShares) {
      addToast({
        message: 'Equity raise blocked',
        detail: 'Would breach 51% founder ownership floor',
        type: 'warning',
      });
    } else {
      const newOwnership = founderShares / newShares;
      addToast({
        message: `Raised ${formatMoney(amount)} equity`,
        detail: `Ownership: ${(newOwnership * 100).toFixed(1)}%`,
        type: 'info',
      });
    }
  }, [issueEquity, founderShares, sharesOutstanding, addToast]);

  const handleBuyback = useCallback((amount: number) => {
    buybackShares(amount);
    addToast({
      message: `Repurchased shares for ${formatMoney(amount)}`,
      detail: 'Ownership increased',
      type: 'success',
    });
  }, [buybackShares, addToast]);

  const handleDistribute = useCallback((amount: number) => {
    distributeToOwners(amount);
    addToast({
      message: `Distributed ${formatMoney(amount)}`,
      detail: 'Cash returned to shareholders',
      type: 'success',
    });
  }, [distributeToOwners, addToast]);

  const handleSell = useCallback((businessId: string) => {
    const biz = businesses.find(b => b.id === businessId);
    sellBusiness(businessId);
    addToast({
      message: `Sold ${biz?.name ?? 'business'}`,
      detail: 'Proceeds added to cash',
      type: 'success',
    });
  }, [sellBusiness, businesses, addToast]);

  const handleImprove = useCallback((businessId: string, improvementType: OperationalImprovementType) => {
    const biz = businesses.find(b => b.id === businessId);
    const cashBefore = useGameStore.getState().cash;
    improveBusiness(businessId, improvementType);
    const cashAfter = useGameStore.getState().cash;
    if (cashAfter < cashBefore) {
      addToast({
        message: `${IMPROVEMENT_LABELS[improvementType] ?? improvementType}`,
        detail: `Applied to ${biz?.name ?? 'business'}`,
        type: 'success',
      });
    } else {
      addToast({
        message: 'Improvement failed',
        detail: 'Insufficient cash or already applied',
        type: 'warning',
      });
    }
  }, [improveBusiness, businesses, addToast]);

  const handleSourceDeals = useCallback(() => {
    sourceDealFlow();
    addToast({
      message: 'Deal pipeline refreshed',
      detail: 'New opportunities sourced',
      type: 'info',
    });
  }, [sourceDealFlow, addToast]);

  const handleUpgradeMASourcing = useCallback(() => {
    const nextTier = Math.min(maSourcing.tier + 1, 3);
    upgradeMASourcing();
    addToast({
      message: `MA sourcing upgraded to Tier ${nextTier}`,
      detail: MA_SOURCING_CONFIG[nextTier as 1 | 2 | 3]?.name ?? '',
      type: 'success',
    });
  }, [upgradeMASourcing, maSourcing.tier, addToast]);

  const handleToggleMASourcing = useCallback(() => {
    const wasActive = maSourcing.active;
    toggleMASourcing();
    addToast({
      message: wasActive ? 'MA sourcing paused' : 'MA sourcing activated',
      type: wasActive ? 'warning' : 'success',
    });
  }, [toggleMASourcing, maSourcing.active, addToast]);

  const handleProactiveOutreach = useCallback(() => {
    proactiveOutreach();
    addToast({
      message: 'Proactive outreach launched',
      detail: 'Targeted deals incoming',
      type: 'info',
    });
  }, [proactiveOutreach, addToast]);

  const handleForgePlatform = useCallback((recipeId: string, businessIds: string[], platformName: string, cost: number) => {
    forgeIntegratedPlatform(recipeId, businessIds);
    addToast({
      message: `Forged ${platformName}`,
      detail: `${formatMoney(cost)} integration cost — margin and growth boosted`,
      type: 'success',
    });
  }, [forgeIntegratedPlatform, addToast]);

  const handleAddToIntegratedPlatform = useCallback((platformId: string, businessId: string, businessName: string, cost: number) => {
    const platform = integratedPlatforms.find(p => p.id === platformId);
    addToIntegratedPlatform(platformId, businessId);
    addToast({
      message: `${businessName} joined ${platform?.name ?? 'platform'}`,
      detail: `${formatMoney(cost)} integration cost — bonuses applied`,
      type: 'success',
    });
  }, [addToIntegratedPlatform, integratedPlatforms, addToast]);

  const handleSellPlatform = useCallback((platformId: string) => {
    const platform = integratedPlatforms.find(p => p.id === platformId);
    sellPlatform(platformId);
    addToast({
      message: `Sold platform ${platform?.name ?? ''}`,
      detail: 'All constituent businesses sold with platform bonus',
      type: 'success',
    });
  }, [sellPlatform, integratedPlatforms, addToast]);

  const handleUnlockTurnaroundTier = useCallback(() => {
    const nextTier = Math.min(turnaroundTier + 1, 3);
    unlockTurnaroundTier();
    addToast({
      message: `Turnaround capability unlocked: Tier ${nextTier}`,
      type: 'success',
    });
  }, [unlockTurnaroundTier, turnaroundTier, addToast]);

  const handleStartTurnaround = useCallback((businessId: string, programId: string) => {
    const biz = businesses.find(b => b.id === businessId);
    startTurnaroundProgram(businessId, programId);
    addToast({
      message: `Turnaround started for ${biz?.name ?? 'business'}`,
      detail: 'Program in progress — results at completion',
      type: 'info',
    });
  }, [startTurnaroundProgram, businesses, addToast]);

  // Show tutorial on new game start or first visit
  useEffect(() => {
    if (showTutorial) {
      setShowInstructions(true);
    } else {
      const hasSeenTutorial = localStorage.getItem(TUTORIAL_SEEN_KEY);
      if (!hasSeenTutorial && round === 1) {
        setShowInstructions(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  const handleCloseTutorial = () => {
    setShowInstructions(false);
    localStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
  };

  // Check for game over
  useEffect(() => {
    if (gameOver) {
      onGameOver();
    }
  }, [gameOver, onGameOver]);

  // Trigger AI enhancement when entering allocate phase
  useEffect(() => {
    if (phase === 'allocate') {
      triggerAIEnhancement();
    }
  }, [phase, round, triggerAIEnhancement]);

  // Fetch event narrative when entering event phase
  useEffect(() => {
    if (phase === 'event' && currentEvent) {
      fetchEventNarrative();
    }
  }, [phase, currentEvent, fetchEventNarrative]);

  // Generate business stories each year during collect phase
  useEffect(() => {
    if (phase === 'collect') {
      generateBusinessStories();
    }
  }, [phase, round, generateBusinessStories]);

  // Generate year chronicle when entering collect phase (for years 2+)
  useEffect(() => {
    if (phase === 'collect' && round > 1) {
      generateYearChronicleAction();
    }
  }, [phase, round, generateYearChronicleAction]);

  // Business anniversaries (20yr mode, milestones 5/10/15)
  useEffect(() => {
    if (phase !== 'collect' || maxRounds !== 20) return;
    const ANNIVERSARY_MILESTONES = [5, 10, 15] as const;
    const activeBusinesses = businesses.filter(b => b.status === 'active');
    for (const biz of activeBusinesses) {
      const yearsHeld = round - biz.acquisitionRound;
      if (ANNIVERSARY_MILESTONES.includes(yearsHeld as 5 | 10 | 15)) {
        addToast({
          message: `${biz.name} turns ${yearsHeld}. It was ${formatMoney(biz.acquisitionEbitda)} EBITDA — now ${formatMoney(biz.ebitda)}.`,
          type: 'info',
        });
      }
    }
  }, [phase, round, businesses, maxRounds, addToast]);

  // Update telemetry session meta with current round
  useEffect(() => {
    updateSessionRound(round);
  }, [round]);

  // Track which allocate phase entry we've shown a nudge for
  const lastNudgeRound = useRef(0);

  // Contextual nudges — fire once per mechanic, at most one per allocate phase entry
  useEffect(() => {
    if (phase !== 'allocate' || lastNudgeRound.current === round) return;
    const active = businesses.filter(b => b.status === 'active');

    // Priority 1: Improve your business (Round 1)
    if (round >= 1 && active.length >= 1 && !hasSeenNudge('improve')) {
      lastNudgeRound.current = round;
      dismissNudge('improve');
      addToast({ type: 'nudge', message: 'Tip: Improve Your Businesses', detail: 'Tap any business in the Portfolio tab, then hit "Improve" to boost margins or growth.' });
      return;
    }

    // Priority 2: Browse deals (still only 1 business)
    if (round >= 1 && active.length === 1 && dealPipeline.length > 0 && !hasSeenNudge('second-deal')) {
      lastNudgeRound.current = round;
      dismissNudge('second-deal');
      addToast({ type: 'nudge', message: 'Tip: Grow Your Portfolio', detail: 'Check the Deals tab — you have cash to acquire a second business.' });
      return;
    }

    // Priority 3: Shared Services (3+ businesses)
    if (active.length >= MIN_OPCOS_FOR_SHARED_SERVICES && !hasSeenNudge('shared-services')) {
      lastNudgeRound.current = round;
      dismissNudge('shared-services');
      addToast({ type: 'nudge', message: 'Tip: Shared Services Unlocked', detail: `With ${active.length} businesses, you can unlock shared services to cut costs across your whole portfolio.` });
      return;
    }

    // Priority 4: Roll-up / Platform designation (2+ in same sector)
    const sectorCounts = new Map<string, number>();
    for (const b of active) sectorCounts.set(b.sectorId, (sectorCounts.get(b.sectorId) || 0) + 1);
    const hasTwoInSameSector = [...sectorCounts.values()].some(c => c >= 2);
    if (hasTwoInSameSector && !active.some(b => b.isPlatform) && !hasSeenNudge('platform-designate')) {
      lastNudgeRound.current = round;
      dismissNudge('platform-designate');
      addToast({ type: 'nudge', message: 'Tip: Roll-Up Strategy Available', detail: 'You own 2+ businesses in the same sector. Designate one as a platform — smaller add-on deals become available and your valuation gets a boost.' });
      return;
    }

    // Priority 5: Sell at peak value (Round 4+, seasoned business)
    if (round >= 4 && active.some(b => round - b.acquisitionRound >= 2) && !hasSeenNudge('sell-seasoned')) {
      lastNudgeRound.current = round;
      dismissNudge('sell-seasoned');
      addToast({ type: 'nudge', message: 'Tip: Sell High, Buy Better', detail: 'Businesses held 2+ years sell for a bonus. Consider selling strong performers to free up cash for new deals.' });
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  const activeBusinesses = businesses.filter(b => b.status === 'active');
  const lastEventType = eventHistory.length > 0 ? eventHistory[eventHistory.length - 1].type : undefined;
  const activeServicesCount = sharedServices.filter(s => s.active).length;

  // Compute concentration count and diversification bonus for dashboard
  const { concentrationCount, diversificationBonus } = useMemo(() => {
    const focusGroupCounts: Record<string, number> = {};
    for (const b of activeBusinesses) {
      const sector = SECTORS[b.sectorId];
      if (sector) {
        for (const fg of sector.sectorFocusGroup) {
          focusGroupCounts[fg] = (focusGroupCounts[fg] || 0) + 1;
        }
      }
    }
    const maxCount = Object.values(focusGroupCounts).length > 0
      ? Math.max(...Object.values(focusGroupCounts)) : 0;
    const uniqueSectors = new Set(activeBusinesses.map(b => b.sectorId)).size;
    return {
      concentrationCount: maxCount,
      diversificationBonus: uniqueSectors >= 4 && activeBusinesses.length >= 4,
    };
  }, [activeBusinesses]);
  const sharedServicesCost = sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);
  const maSourcingCost = maSourcing.active ? getMASourcingAnnualCost(maSourcing.tier) : 0;
  const capexReduction = useMemo(() => {
    const hasProcurement = sharedServices.some(s => s.type === 'procurement' && s.active);
    if (!hasProcurement) return 0;
    const opcoCount = activeBusinesses.length;
    const scaleMultiplier = opcoCount >= 6 ? 1.2 : opcoCount >= 3 ? 1.0 + (opcoCount - 2) * 0.05 : 1.0;
    return 0.15 * scaleMultiplier;
  }, [sharedServices, activeBusinesses]);
  const turnaroundCost = useMemo(() => {
    const tierCost = getTurnaroundTierAnnualCost(turnaroundTier);
    const programCosts = activeTurnarounds
      .filter(t => t.status === 'active')
      .reduce((sum, t) => {
        const prog = getProgramById(t.programId);
        return sum + (prog ? prog.annualCost : 0);
      }, 0);
    return tierCost + programCosts;
  }, [turnaroundTier, activeTurnarounds]);
  const cashConversionBonus = useMemo(() => {
    const hasFinance = sharedServices.some(s => s.type === 'finance_reporting' && s.active);
    if (!hasFinance) return 0;
    const opcoCount = activeBusinesses.length;
    const scaleMultiplier = opcoCount >= 6 ? 1.2 : opcoCount >= 3 ? 1.0 + (opcoCount - 2) * 0.05 : 1.0;
    return 0.05 * scaleMultiplier;
  }, [sharedServices, activeBusinesses]);

  const renderPhase = () => {
    switch (phase) {
      case 'collect':
        return (
          <CollectPhase
            businesses={businesses}
            cash={cash}
            totalDebt={totalDebt}
            holdcoLoanBalance={holdcoLoanBalance}
            holdcoLoanRate={holdcoLoanRate}
            holdcoLoanRoundsRemaining={holdcoLoanRoundsRemaining}
            interestRate={interestRate}
            sharedServicesCost={sharedServicesCost}
            maSourcingCost={maSourcingCost}
            turnaroundCost={turnaroundCost}
            cashConversionBonus={cashConversionBonus}
            round={round}
            yearChronicle={yearChronicle}
            debtPaymentThisRound={debtPaymentThisRound}
            cashBeforeDebtPayments={cashBeforeDebtPayments}
            interestPenalty={getDistressRestrictions(metrics.distressLevel).interestPenalty}
            capexReduction={capexReduction}
            onContinue={advanceToEvent}
          />
        );
      case 'restructure':
        return (
          <RestructurePhase
            businesses={businesses}
            cash={cash}
            totalDebt={totalDebt}
            netDebtToEbitda={metrics.netDebtToEbitda}
            round={round}
            hasRestructured={hasRestructured}
            lastEventType={lastEventType}
            intrinsicValuePerShare={metrics.intrinsicValuePerShare}
            founderShares={founderShares}
            sharesOutstanding={sharesOutstanding}
            onDistressedSale={distressedSale}
            onEmergencyEquityRaise={emergencyEquityRaise}
            onDeclareBankruptcy={declareBankruptcy}
            onContinue={advanceFromRestructure}
          />
        );
      case 'event':
        return (
          <EventPhase
            event={currentEvent}
            businesses={businesses}
            currentRound={round}
            lastEventType={lastEventType}
            onChoice={handleEventChoice}
            onContinue={advanceToAllocate}
          />
        );
      case 'allocate':
        return (
          <AllocatePhase
            businesses={activeBusinesses}
            allBusinesses={businesses}
            cash={cash}
            holdcoLoanBalance={holdcoLoanBalance}
            interestRate={interestRate}
            creditTightening={creditTighteningRoundsRemaining > 0}
            distressLevel={metrics.distressLevel}
            totalDebt={totalDebt}
            totalEbitda={metrics.totalEbitda}
            holdcoLoanRate={holdcoLoanRate}
            holdcoLoanRoundsRemaining={holdcoLoanRoundsRemaining}
            dealPipeline={dealPipeline}
            passedDealIds={passedDealIds}
            onPassDeal={passDeal}
            sharedServices={sharedServices}
            round={round}
            maxRounds={maxRounds}
            lastEventType={lastEventType}
            equityRaisesUsed={equityRaisesUsed}
            lastEquityRaiseRound={lastEquityRaiseRound}
            lastBuybackRound={lastBuybackRound}
            sharesOutstanding={sharesOutstanding}
            founderShares={founderShares}
            totalBuybacks={totalBuybacks}
            totalDistributions={totalDistributions}
            intrinsicValuePerShare={metrics.intrinsicValuePerShare}
            onAcquire={handleAcquire}
            onAcquireTuckIn={handleAcquireTuckIn}
            onMergeBusinesses={handleMerge}
            onDesignatePlatform={handleDesignatePlatform}
            onUnlockSharedService={handleUnlockSharedService}
            onDeactivateSharedService={handleDeactivateSharedService}
            onPayDebt={handlePayDebt}
            onPayBankDebt={handlePayBankDebt}
            onIssueEquity={handleIssueEquity}
            onBuyback={handleBuyback}
            onDistribute={handleDistribute}
            onSell={handleSell}

            onImprove={handleImprove}
            onEndRound={endRound}
            onSourceDeals={handleSourceDeals}
            maFocus={maFocus}
            onSetMAFocus={setMAFocus}
            actionsThisRound={actionsThisRound}
            maSourcing={maSourcing}
            onUpgradeMASourcing={handleUpgradeMASourcing}
            onToggleMASourcing={handleToggleMASourcing}
            onProactiveOutreach={handleProactiveOutreach}
            onForgePlatform={handleForgePlatform}
            onAddToIntegratedPlatform={handleAddToIntegratedPlatform}
            onSellPlatform={handleSellPlatform}
            integratedPlatforms={integratedPlatforms}
            difficulty={difficulty}
            duration={duration}
            covenantBreachRounds={covenantBreachRounds}
            acquisitionsThisRound={acquisitionsThisRound}
            maxAcquisitionsPerRound={maxAcquisitionsPerRound}
            lastAcquisitionResult={lastAcquisitionResult}
            turnaroundTier={turnaroundTier}
            activeTurnarounds={activeTurnarounds}
            onUnlockTurnaroundTier={handleUnlockTurnaroundTier}
            onStartTurnaround={handleStartTurnaround}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <ToastContainer />

      {/* Instructions Modal */}
      {showInstructions && (
        <InstructionsModal
          holdcoName={holdcoName}
          initialRaise={initialRaiseAmount}
          founderOwnership={founderOwnership}
          firstBusinessName={businesses.length > 0 ? businesses[0].name : undefined}
          firstBusinessPrice={businesses.length > 0 ? businesses[0].acquisitionPrice : undefined}
          startingCash={cash}
          maxRounds={maxRounds}
          onClose={handleCloseTutorial}
        />
      )}

      {/* Challenge Mode Banner */}
      {isChallenge && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-3 py-1.5 flex items-center justify-center gap-3">
          <span className="text-xs text-yellow-400 font-medium">Challenge Mode<span className="hidden sm:inline"> — same deals, same events</span></span>
          <button
            onClick={handleCopyChallenge}
            className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition-colors font-medium"
          >
            {copiedLink ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-bg-card border-b border-white/10 px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xl sm:text-2xl">🏛️</span>
            <h1 className="text-base sm:text-xl font-bold truncate max-w-[120px] sm:max-w-none">{holdcoName}</h1>
            {difficulty && (
              <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap ${difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
                {difficulty === 'normal' ? 'H' : 'E'}{maxRounds && maxRounds < 20 ? `/${maxRounds}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {roundHistory && roundHistory.length > 0 && (
              <button
                onClick={() => setShowAnnualReports(true)}
                className="hidden sm:inline-flex text-text-muted hover:text-text-secondary transition-colors text-sm min-h-[44px] min-w-[44px] items-center justify-center rounded hover:bg-white/5"
                title="Annual Reports"
              >
                Reports
              </button>
            )}
            <button
              onClick={() => setShowLeaderboard(true)}
              className="text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/5"
              title="High Scores"
            >
              🏆
            </button>
            <button
              onClick={() => setShowManual(true)}
              className="text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/5"
              title="How to Play"
            >
              📖
            </button>
            <button
              onClick={() => setShowInstructions(true)}
              className="text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/5"
              title="View Tutorial"
            >
              ?
            </button>
            {roundHistory && roundHistory.length > 0 && (
              <button
                onClick={() => setShowAnnualReports(true)}
                className="sm:hidden text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/5"
                title="Annual Reports"
              >
                📊
              </button>
            )}
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-text-muted hover:text-danger transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/5"
              title="Start Over"
            >
              ↺
            </button>
          </div>
        </div>
        {/* Phase indicator — compact on mobile, full on desktop */}
        <div className="flex items-center gap-1.5 sm:gap-3 mt-1.5 sm:mt-2 text-xs sm:text-sm">
          <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full ${
            phase === 'collect' ? 'bg-accent text-bg-primary' :
            'bg-white/10 text-text-muted'
          }`}>
            <span className="sm:hidden">Collect</span>
            <span className="hidden sm:inline">1. Collect</span>
          </span>
          {phase === 'restructure' && (
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-red-600 text-white animate-pulse">
              Restructure
            </span>
          )}
          <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full ${
            phase === 'event' ? 'bg-accent text-bg-primary' :
            'bg-white/10 text-text-muted'
          }`}>
            <span className="sm:hidden">Event</span>
            <span className="hidden sm:inline">2. Event</span>
          </span>
          <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full ${
            phase === 'allocate' ? 'bg-accent text-bg-primary' :
            'bg-white/10 text-text-muted'
          }`}>
            <span className="sm:hidden">Allocate</span>
            <span className="hidden sm:inline">3. Allocate</span>
          </span>
        </div>
      </div>

      {/* Dashboard */}
      <Dashboard
        metrics={metrics}
        liveCash={cash}
        sharesOutstanding={sharesOutstanding}
        founderOwnership={founderOwnership}
        round={round}
        totalRounds={maxRounds || 20}
        sharedServicesCount={activeServicesCount}
        focusTier={focusBonus?.tier}
        focusSector={focusBonus?.focusGroup}
        distressLevel={metrics.distressLevel}
        concentrationCount={concentrationCount}
        diversificationBonus={diversificationBonus}
        covenantBreachRounds={covenantBreachRounds}
        onMetricClick={setDrilldownMetric}
      />

      {/* Phase Content */}
      <div className="flex-1 overflow-auto">
        {renderPhase()}
      </div>

      {/* Annual Reports Modal */}
      {showAnnualReports && (
        <AnnualReportModal
          roundHistory={roundHistory ?? []}
          onClose={() => setShowAnnualReports(false)}
        />
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (() => {
        const state = useGameStore.getState();
        const rawFEV = calculateFounderEquityValue(state);
        const adjustedFEV = Math.round(rawFEV * (DIFFICULTY_CONFIG[difficulty]?.leaderboardMultiplier ?? 1.0));
        const wealth = calculateFounderPersonalWealth(state);
        return (
          <LeaderboardModal
            hypotheticalEV={adjustedFEV}
            hypotheticalRawFEV={rawFEV}
            hypotheticalWealth={wealth}
            currentDifficulty={difficulty}
            currentDuration={duration}
            onClose={() => setShowLeaderboard(false)}
          />
        );
      })()}

      {/* User Manual Modal */}
      {showManual && (
        <UserManualModal onClose={() => setShowManual(false)} />
      )}

      {/* Metric Drilldown Modal */}
      {drilldownMetric && (
        <MetricDrilldownModal
          metricKey={drilldownMetric}
          onClose={() => setDrilldownMetric(null)}
        />
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-primary border border-white/10 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">Start Over?</h3>
            <p className="text-text-secondary mb-6">
              This will end your current game and start fresh with a new holding company. Your current progress will be lost.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetGame();
                }}
                className="btn-primary flex-1 bg-danger hover:bg-danger/80"
              >
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
