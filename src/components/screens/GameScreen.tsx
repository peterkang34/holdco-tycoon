import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useGameStore } from '../../hooks/useGame';
import { useToastStore } from '../../hooks/useToast';
import { takeSnapshot, showUndoToast } from '../../hooks/useUndo';
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
import { FamilyOfficeTutorialModal } from '../ui/FamilyOfficeTutorialModal';
import { FundManagerTutorialModal } from '../ui/FundManagerTutorialModal';
import { AnnualReportModal } from '../ui/AnnualReportModal';
import { LeaderboardModal } from '../ui/LeaderboardModal';
import { UserManualModal } from '../ui/UserManualModal';
import { FeedbackModal } from '../ui/FeedbackModal';
import { MetricDrilldownModal } from '../ui/MetricDrilldownModal';
import { ToastContainer } from '../ui/ToastContainer';
import { calculateFounderEquityValue, calculateFounderPersonalWealth, calculateEnterpriseValue } from '../../engine/scoring';
import { calculateComplexityCost, getMarketCycleIndicator, calculateMetrics } from '../../engine/simulation';
import { DIFFICULTY_CONFIG, PE_FUND_CONFIG } from '../../data/gameConfig';
import { MARKET_CYCLE_LABELS } from '../../data/mechanicsCopy';
import { Tooltip } from '../ui/Tooltip';
import { updateSessionRound, trackEventChoice } from '../../services/telemetry';
import { hasSeenNudge, dismissNudge } from '../../hooks/useNudges';
import { MIN_OPCOS_FOR_SHARED_SERVICES } from '../../data/sharedServices';
import { buildChallengeUrl, copyToClipboard } from '../../utils/challenge';
import { AccountBadge } from '../ui/AccountBadge';
import { VideoModal, TUTORIAL_VIDEO_ID } from '../ui/VideoModal';
import { BusinessSchoolChecklist } from '../tutorial/BusinessSchoolChecklist';

// ── Mobile Nav Overflow Menu ──────────────────────────────────────
function NavOverflowMenu({ hasReports, onReports, onManual, onVideo, onFeedback, onTutorial, onReset }: {
  hasReports: boolean;
  onReports: () => void;
  onManual: () => void;
  onVideo: () => void;
  onFeedback: () => void;
  onTutorial: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handle);
    return () => document.removeEventListener('pointerdown', handle);
  }, [open]);

  const item = (label: string, icon: string, onClick: () => void, danger = false) => (
    <button
      key={label}
      role="menuitem"
      onClick={() => { setOpen(false); onClick(); }}
      className={`w-full text-left px-3 min-h-[44px] flex items-center gap-2.5 text-sm transition-colors hover:bg-white/5 ${danger ? 'text-text-muted hover:text-danger' : 'text-text-secondary'}`}
    >
      <span className="w-5 text-center">{icon}</span>{label}
    </button>
  );

  return (
    <div className="relative sm:hidden" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/5"
        title="More"
        aria-haspopup="true"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-11 w-48 border border-white/15 rounded-lg shadow-xl py-1 z-50"
          style={{ backgroundColor: 'rgba(20, 25, 35, 0.95)', backdropFilter: 'blur(8px)' }}
          role="menu"
        >
          {hasReports && item('Annual Reports', '📊', onReports)}
          {item('How to Play', '📖', onManual)}
          {item('Watch Video', '▶', onVideo)}
          {item('Send Feedback', '💬', onFeedback)}
          {item('Tutorial', '?', onTutorial)}
          <div className="border-t border-white/10 my-0.5" />
          {item('Start Over', '↺', onReset, true)}
        </div>
      )}
    </div>
  );
}

const TUTORIAL_SEEN_KEY = 'holdco-tycoon-tutorial-seen-v3';
const FO_TUTORIAL_SEEN_KEY = 'holdco-tycoon-fo-tutorial-seen-v1';
const FM_TUTORIAL_SEEN_KEY = 'holdco-tycoon-fm-tutorial-seen-v1';

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
  const [showFeedback, setShowFeedback] = useState(false);
  const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showFOTutorial, setShowFOTutorial] = useState(false);
  const [showFMTutorial, setShowFMTutorial] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [videoInitialId, setVideoInitialId] = useState<string | undefined>(undefined);

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
    founderDistributionsReceived,
    metricsHistory,
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
    smbBrokerDealFlow,
    fillerTaxInvest,
    fillerTaxWriteoff,
    fillerConferenceAttend,
    fillerConferenceFree,
    fillerAuditFull,
    fillerAuditLight,
    fillerReputationInvest,
    fillerReputationFree,
    fillerPass,
    cyberBreachUpgrade,
    cyberBreachSettle,
    cyberBreachAbsorb,
    antitrustDivest,
    antitrustFight,
    antitrustRestructure,
    competitorAccelerate,
    competitorDifferentiate,
    competitorAbsorb,
    oilShockHunkerDown,
    oilShockGoHunting,
    oilShockPassThrough,
    forgeIntegratedPlatform,
    addToIntegratedPlatform,
    sellPlatform,
    integratedPlatforms,
    turnaroundTier,
    activeTurnarounds,
    unlockTurnaroundTier,
    startTurnaroundProgram,
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
    ipoState,
    executeIPO,
    declineIPO,
    isFamilyOfficeMode,
    isFundManagerMode,
    isBusinessSchoolMode,
    fundName,
    familyOfficeState,
    distributeToLPs,
    lpCommentary,
    lpDistributions,
    lpSatisfactionScore,
    fundSize,
    totalCapitalDeployed,
    managementFeesCollected,
  } = useGameStore();

  const founderOwnership = founderShares / sharesOutstanding;

  // Fund mode: compute dashboard metrics from full state
  const fundDashMetrics = useMemo(() => {
    if (!isFundManagerMode) return null;
    const state = useGameStore.getState();
    const nav = calculateEnterpriseValue(state);
    const totalValue = nav + (lpDistributions ?? 0);
    const fs = fundSize ?? PE_FUND_CONFIG.fundSize;
    const grossMoic = fs > 0 ? totalValue / fs : 0;
    const dpi = fs > 0 ? (lpDistributions ?? 0) / fs : 0;
    const deployPct = fs > 0 ? ((totalCapitalDeployed ?? 0) / fs) * 100 : 0;
    const estCarry = totalValue > PE_FUND_CONFIG.hurdleReturn
      ? (totalValue - PE_FUND_CONFIG.hurdleReturn) * PE_FUND_CONFIG.carryRate
      : 0;
    return { nav, grossMoic, dpi, deployPct, estCarry };
  }, [isFundManagerMode, cash, businesses, totalDebt, lpDistributions, fundSize, totalCapitalDeployed]);

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
      // Filler event choices
      case 'fillerTaxInvest': fillerTaxInvest(); break;
      case 'fillerTaxWriteoff': fillerTaxWriteoff(); break;
      case 'fillerConferenceAttend': fillerConferenceAttend(); break;
      case 'fillerConferenceFree': fillerConferenceFree(); break;
      case 'fillerAuditFull': fillerAuditFull(); break;
      case 'fillerAuditLight': fillerAuditLight(); break;
      case 'fillerReputationInvest': fillerReputationInvest(); break;
      case 'fillerReputationFree': fillerReputationFree(); break;
      case 'fillerPass': fillerPass(); break;
      // New event choices
      case 'cyberBreachUpgrade': cyberBreachUpgrade(); break;
      case 'cyberBreachSettle': cyberBreachSettle(); break;
      case 'cyberBreachAbsorb': cyberBreachAbsorb(); break;
      case 'antitrustDivest': antitrustDivest(); break;
      case 'antitrustFight': antitrustFight(); break;
      case 'antitrustRestructure': antitrustRestructure(); break;
      case 'competitorAccelerate': competitorAccelerate(); break;
      case 'competitorDifferentiate': competitorDifferentiate(); break;
      case 'competitorAbsorb': competitorAbsorb(); break;
      // Oil shock choices
      case 'oilShockHunkerDown': oilShockHunkerDown(); break;
      case 'oilShockGoHunting': oilShockGoHunting(); break;
      case 'oilShockPassThrough': oilShockPassThrough(); break;
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
    const snap = takeSnapshot();
    acquireBusiness(deal, structure);
    const result = useGameStore.getState().lastAcquisitionResult;
    if (result === 'lpac_denied') {
      addToast({
        message: `LPAC Blocked: ${deal.business.name}`,
        detail: 'LP Advisory Committee denied this deal due to concentration risk',
        type: 'danger',
      });
    } else if (result === 'blocked_same_league') {
      addToast({
        message: `Cannot acquire ${deal.business.name}`,
        detail: 'You already own a team in this league — one per league allowed',
        type: 'warning',
      });
    } else if (result === 'snatched') {
      addToast({
        message: `Outbid on ${deal.business.name}`,
        detail: 'Another buyer snatched the deal',
        type: 'danger',
      });
    } else if (result === 'success' && deal.heat !== 'contested') {
      // Undo for cold/warm/hot — only contested has snatch risk (40%),
      // allowing undo there would let players scout if the deal goes through
      if (structure.type === 'share_funded') {
        showUndoToast(
          `Acquired ${deal.business.name} via stock`,
          snap,
          `${structure.shareTerms?.sharesToIssue?.toLocaleString() ?? 0} shares issued — ${((structure.shareTerms?.dilutionPct ?? 0) * 100).toFixed(1)}% dilution`,
        );
      } else {
        showUndoToast(
          `Acquired ${deal.business.name}`,
          snap,
          `${formatMoney(deal.askingPrice)} via ${getStructureLabel(structure.type)}`,
        );
      }
    } else if (result === 'success') {
      // Contested deals: no undo — 40% snatch risk means undo lets you scout
      addToast({
        message: `Acquired ${deal.business.name}`,
        detail: structure.type === 'share_funded'
          ? `${structure.shareTerms?.sharesToIssue?.toLocaleString() ?? 0} shares issued — ${((structure.shareTerms?.dilutionPct ?? 0) * 100).toFixed(1)}% dilution`
          : `${formatMoney(deal.askingPrice)} via ${getStructureLabel(structure.type)}`,
        type: 'success',
      });
    }
    // Show LP deal reaction toast if one was generated
    if (result === 'success' && isFundManagerMode) {
      const updatedCommentary = useGameStore.getState().lpCommentary || [];
      const lastComment = updatedCommentary[updatedCommentary.length - 1];
      if (lastComment && lastComment.round === round) {
        const name = lastComment.speaker === 'edna' ? 'Edna Morrison' : 'Chip Henderson';
        addToast({
          message: `${name}:`,
          detail: `"${lastComment.text}"`,
          type: 'info',
        });
      }
    }
  }, [acquireBusiness, addToast, isFundManagerMode, round]);

  const handleAcquireTuckIn = useCallback((deal: Deal, structure: DealStructure, platformId: string) => {
    const platform = businesses.find(b => b.id === platformId);
    acquireTuckIn(deal, structure, platformId);
    const state = useGameStore.getState();
    const result = state.lastAcquisitionResult;
    const integrationOutcome = state.lastIntegrationOutcome;
    if (result === 'lpac_denied') {
      addToast({
        message: `LPAC Blocked: ${deal.business.name}`,
        detail: 'LP Advisory Committee denied this tuck-in due to concentration risk',
        type: 'danger',
      });
      return;
    }
    if (result === 'snatched') {
      addToast({
        message: `Outbid on ${deal.business.name}`,
        detail: 'Another buyer snatched the deal',
        type: 'danger',
      });
    } else if (structure.type === 'share_funded') {
      const suffix = integrationOutcome === 'failure' ? ' — troubled integration'
        : integrationOutcome === 'partial' ? ' — rocky integration, reduced synergies'
        : ' — seamless integration';
      addToast({
        message: `Tucked ${deal.business.name} into ${platform?.name ?? 'platform'} via stock`,
        detail: `${structure.shareTerms?.sharesToIssue?.toLocaleString() ?? 0} shares issued — ${((structure.shareTerms?.dilutionPct ?? 0) * 100).toFixed(1)}% dilution${suffix}`,
        type: integrationOutcome === 'failure' ? 'danger' : 'info',
      });
    } else {
      const structureLabel = `${formatMoney(deal.askingPrice)} via ${getStructureLabel(structure.type)}`;
      const suffix = integrationOutcome === 'failure' ? ' — troubled integration'
        : integrationOutcome === 'partial' ? ' — rocky integration, reduced synergies'
        : ' — seamless integration';
      addToast({
        message: `Tucked ${deal.business.name} into ${platform?.name ?? 'platform'}`,
        detail: structureLabel + suffix,
        type: integrationOutcome === 'failure' ? 'danger' : integrationOutcome === 'partial' ? 'info' : 'success',
      });
    }
  }, [acquireTuckIn, businesses, addToast]);

  const handleMerge = useCallback((id1: string, id2: string, newName: string) => {
    const b1 = businesses.find(b => b.id === id1);
    const b2 = businesses.find(b => b.id === id2);
    mergeBusinesses(id1, id2, newName);
    const integrationOutcome = useGameStore.getState().lastIntegrationOutcome;
    const names = b1 && b2 ? `${b1.name} + ${b2.name}` : undefined;
    const suffix = integrationOutcome === 'failure' ? ' — troubled integration'
      : integrationOutcome === 'partial' ? ' — rocky integration, reduced synergies'
      : ' — seamless integration';
    addToast({
      message: `Merged into ${newName}`,
      detail: names ? names + suffix : undefined,
      type: integrationOutcome === 'failure' ? 'danger' : integrationOutcome === 'partial' ? 'info' : 'success',
    });
  }, [mergeBusinesses, businesses, addToast]);

  const handleDesignatePlatform = useCallback((businessId: string) => {
    const biz = businesses.find(b => b.id === businessId);
    const snap = takeSnapshot();
    designatePlatform(businessId);
    showUndoToast(`${biz?.name ?? 'Business'} designated as platform`, snap, 'Can now receive tuck-in acquisitions');
  }, [designatePlatform, businesses]);

  const handleUnlockSharedService = useCallback((serviceType: SharedServiceType) => {
    const svc = sharedServices.find(s => s.type === serviceType);
    const snap = takeSnapshot();
    unlockSharedService(serviceType);
    showUndoToast(`Unlocked ${svc?.name ?? serviceType}`, snap, svc ? `${formatMoney(svc.unlockCost)} setup + ${formatMoney(svc.annualCost)}/yr` : undefined);
  }, [unlockSharedService, sharedServices]);

  const handleDeactivateSharedService = useCallback((serviceType: SharedServiceType) => {
    const svc = sharedServices.find(s => s.type === serviceType);
    const snap = takeSnapshot();
    deactivateSharedService(serviceType);
    showUndoToast(`Deactivated ${svc?.name ?? serviceType}`, snap);
  }, [deactivateSharedService, sharedServices]);

  const handlePayDebt = useCallback((amount: number) => {
    const snap = takeSnapshot();
    payDownDebt(amount);
    const remaining = useGameStore.getState().holdcoLoanBalance;
    showUndoToast(`Paid down ${formatMoney(amount)} holdco debt`, snap, remaining > 0 ? `${formatMoney(remaining)} remaining` : 'Holdco debt-free!');
  }, [payDownDebt]);

  const handlePayBankDebt = useCallback((businessId: string, amount: number) => {
    const biz = businesses.find(b => b.id === businessId);
    const snap = takeSnapshot();
    payDownBankDebt(businessId, amount);
    const updatedBiz = useGameStore.getState().businesses.find(b => b.id === businessId);
    const remaining = updatedBiz?.bankDebtBalance ?? 0;
    showUndoToast(`Paid down ${formatMoney(amount)} bank debt on ${biz?.name ?? 'business'}`, snap, remaining > 0 ? `${formatMoney(remaining)} remaining` : 'Bank debt cleared!');
  }, [payDownBankDebt, businesses]);

  const handleIssueEquity = useCallback((amount: number) => {
    const snap = takeSnapshot();
    const prevShares = sharesOutstanding;
    const prevSentiment = useGameStore.getState().ipoState?.marketSentiment;
    issueEquity(amount);
    const newState = useGameStore.getState();
    const newShares = newState.sharesOutstanding;
    if (newShares === prevShares) {
      const freshMetrics = calculateMetrics(newState);
      let detail: string;
      if (freshMetrics.intrinsicValuePerShare <= 0) {
        detail = 'Portfolio equity is negative — pay down debt first';
      } else {
        const ipoPublic = newState.ipoState?.isPublic;
        detail = `Would breach ${ipoPublic ? '10' : '51'}% founder ownership floor`;
      }
      addToast({
        message: 'Equity raise blocked',
        detail,
        type: 'warning',
      });
    } else {
      const newOwnership = founderShares / newShares;
      const isPublic = !!newState.ipoState?.isPublic;
      const sentimentDelta = isPublic && prevSentiment != null ? (newState.ipoState!.marketSentiment - prevSentiment) : 0;
      showUndoToast(
        `Raised ${formatMoney(amount)} equity${isPublic ? ' at market price' : ''}`,
        snap,
        `Ownership: ${(newOwnership * 100).toFixed(1)}%${sentimentDelta !== 0 ? ` | Sentiment: ${(sentimentDelta * 100).toFixed(0)}%` : ''}`,
      );
    }
  }, [issueEquity, founderShares, sharesOutstanding, addToast]);

  const handleBuyback = useCallback((amount: number) => {
    const snap = takeSnapshot();
    const prevShares = sharesOutstanding;
    buybackShares(amount);
    const newState = useGameStore.getState();
    const newShares = newState.sharesOutstanding;
    if (newShares === prevShares) {
      const freshMetrics = calculateMetrics(newState);
      let detail: string;
      if (freshMetrics.intrinsicValuePerShare <= 0) {
        detail = 'Portfolio equity is negative — pay down debt first';
      } else if (newState.sharesOutstanding <= newState.founderShares) {
        detail = 'No outside shares available to buy back';
      } else {
        detail = 'Buyback could not be completed at this time';
      }
      addToast({
        message: 'Buyback blocked',
        detail,
        type: 'warning',
      });
    } else {
      const newOwnership = founderShares / newShares;
      showUndoToast(`Repurchased shares for ${formatMoney(amount)}`, snap, `Ownership: ${(newOwnership * 100).toFixed(1)}%`);
    }
  }, [buybackShares, founderShares, sharesOutstanding, addToast]);

  const handleDistribute = useCallback((amount: number) => {
    const snap = takeSnapshot();
    const prevCash = cash;
    distributeToOwners(amount);
    const newCash = useGameStore.getState().cash;
    if (newCash === prevCash) {
      addToast({
        message: 'Distribution blocked',
        detail: 'Cannot distribute at this time — check debt covenants',
        type: 'warning',
      });
    } else {
      showUndoToast(`Distributed ${formatMoney(amount)}`, snap, 'Cash returned to shareholders');
    }
  }, [distributeToOwners, cash, addToast]);

  const handleSell = useCallback((businessId: string) => {
    const biz = businesses.find(b => b.id === businessId);
    const snap = takeSnapshot();
    sellBusiness(businessId);
    showUndoToast(`Sold ${biz?.name ?? 'business'}`, snap, 'Proceeds added to cash');
  }, [sellBusiness, businesses]);

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
    const snap = takeSnapshot();
    sourceDealFlow();
    showUndoToast('Deal pipeline refreshed', snap, 'New opportunities sourced');
  }, [sourceDealFlow]);

  const handleUpgradeMASourcing = useCallback(() => {
    const nextTier = Math.min(maSourcing.tier + 1, 3);
    const snap = takeSnapshot();
    upgradeMASourcing();
    showUndoToast(`MA sourcing upgraded to Tier ${nextTier}`, snap, MA_SOURCING_CONFIG[nextTier as 1 | 2 | 3]?.name ?? '');
  }, [upgradeMASourcing, maSourcing.tier]);

  const handleToggleMASourcing = useCallback(() => {
    const wasActive = maSourcing.active;
    const snap = takeSnapshot();
    toggleMASourcing();
    showUndoToast(wasActive ? 'MA sourcing paused' : 'MA sourcing activated', snap);
  }, [toggleMASourcing, maSourcing.active]);

  const handleProactiveOutreach = useCallback(() => {
    const snap = takeSnapshot();
    proactiveOutreach();
    showUndoToast('Proactive outreach launched', snap, 'Targeted deals incoming');
  }, [proactiveOutreach]);

  const handleSMBBroker = useCallback(() => {
    const snap = takeSnapshot();
    smbBrokerDealFlow();
    showUndoToast('Small biz broker hired', snap, '1 micro deal sourced — $75K');
  }, [smbBrokerDealFlow]);

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
    const snap = takeSnapshot();
    unlockTurnaroundTier();
    showUndoToast(`Turnaround capability unlocked: Tier ${nextTier}`, snap);
  }, [unlockTurnaroundTier, turnaroundTier]);

  const handleStartTurnaround = useCallback((businessId: string, programId: string) => {
    const biz = businesses.find(b => b.id === businessId);
    const snap = takeSnapshot();
    startTurnaroundProgram(businessId, programId);
    showUndoToast(`Turnaround started for ${biz?.name ?? 'business'}`, snap, 'Program in progress — results at completion');
  }, [startTurnaroundProgram, businesses]);

  // Show tutorial on new game start or first visit (skip in Business School — the mode IS the tutorial)
  useEffect(() => {
    if (isBusinessSchoolMode) return;
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

  // Show FO tutorial on first FO game start
  useEffect(() => {
    if (isFamilyOfficeMode && round === 1) {
      const hasSeenFOTutorial = localStorage.getItem(FO_TUTORIAL_SEEN_KEY);
      if (!hasSeenFOTutorial) {
        setShowFOTutorial(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  const handleCloseFOTutorial = () => {
    setShowFOTutorial(false);
    localStorage.setItem(FO_TUTORIAL_SEEN_KEY, 'true');
  };

  // Show Fund Manager tutorial on first fund mode game start
  useEffect(() => {
    if (isFundManagerMode && round === 1) {
      const hasSeenFMTutorial = localStorage.getItem(FM_TUTORIAL_SEEN_KEY);
      if (!hasSeenFMTutorial) {
        setShowFMTutorial(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  const handleCloseFMTutorial = () => {
    setShowFMTutorial(false);
    localStorage.setItem(FM_TUTORIAL_SEEN_KEY, 'true');
  };

  // Check for game over
  useEffect(() => {
    if (gameOver) {
      onGameOver();
    }
  }, [gameOver, onGameOver]);

  // Deal AI enhancement is now lazy-loaded on "Company Story" click in DealCard

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

  // IPO earnings toasts — fire on round change when public
  const prevIPOStateRef = useRef(ipoState);
  useEffect(() => {
    const prev = prevIPOStateRef.current;
    prevIPOStateRef.current = ipoState;
    if (!ipoState?.isPublic || !prev?.isPublic) return;

    if (ipoState.marketSentiment > prev.marketSentiment) {
      addToast({ message: 'Beat earnings expectations', detail: 'Market sentiment improved', type: 'success' });
    } else if (ipoState.marketSentiment < prev.marketSentiment) {
      addToast({ message: 'Missed earnings expectations', detail: 'Market sentiment declined', type: 'warning' });
    }
    if (ipoState.consecutiveMisses >= 2 && prev.consecutiveMisses < 2) {
      addToast({ message: 'Analyst downgrade', detail: 'Consecutive earnings misses — stock under pressure', type: 'danger' });
    }
  }, [round, ipoState, addToast]);

  // Update telemetry session meta with current round + FEV snapshot
  useEffect(() => {
    const fev = calculateFounderEquityValue(useGameStore.getState());
    updateSessionRound(round, fev);
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

  // Compute complexity cost for CollectPhase display
  const complexityCost = useMemo(() => {
    const totalRevenue = activeBusinesses.reduce((sum, b) => sum + b.revenue, 0);
    return calculateComplexityCost(businesses, sharedServices, totalRevenue, duration, integratedPlatforms);
  }, [businesses, sharedServices, activeBusinesses, duration, integratedPlatforms]);

  // Market cycle indicator — derived from trailing global events
  const marketCyclePhase = useMemo(() => {
    return getMarketCycleIndicator(eventHistory);
  }, [eventHistory]);

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
            complexityCost={complexityCost}
            isFundManagerMode={isFundManagerMode}
            managementFee={isFundManagerMode ? PE_FUND_CONFIG.annualManagementFee : 0}
            lpCommentary={isFundManagerMode ? lpCommentary : undefined}
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
            isFundManagerMode={isFundManagerMode}
            lpCommentary={lpCommentary}
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
            founderDistributionsReceived={founderDistributionsReceived}
            avgRoiic={metricsHistory.length > 0 ? metricsHistory.reduce((sum, h) => sum + h.metrics.roiic, 0) / metricsHistory.length : 0}
            netDebtToEbitda={metrics.netDebtToEbitda}
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
            onSMBBroker={handleSMBBroker}
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
            ipoState={ipoState}
            onExecuteIPO={executeIPO}
            onDeclineIPO={declineIPO}
            isFamilyOfficeMode={isFamilyOfficeMode}
            isFundManagerMode={isFundManagerMode}
            onShowVideo={() => { setVideoInitialId(TUTORIAL_VIDEO_ID); setShowVideo(true); }}
            fundSize={fundSize}
            totalCapitalDeployed={totalCapitalDeployed}
            lpDistributions={lpDistributions}
            managementFeesCollected={managementFeesCollected}
            onDistributeToLPs={distributeToLPs}
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

      {/* FO Tutorial Modal */}
      {showFOTutorial && familyOfficeState && (
        <FamilyOfficeTutorialModal
          foStartingCash={familyOfficeState.foStartingCash}
          philanthropyDeduction={familyOfficeState.philanthropyDeduction}
          onClose={handleCloseFOTutorial}
        />
      )}

      {/* Fund Manager Tutorial Modal */}
      {showFMTutorial && isFundManagerMode && (
        <FundManagerTutorialModal
          fundName={fundName || holdcoName}
          onClose={handleCloseFMTutorial}
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
            <span className="text-xl sm:text-2xl">{isFamilyOfficeMode ? '🦅' : '🏛️'}</span>
            <h1 className="text-base sm:text-xl font-bold truncate max-w-[120px] sm:max-w-none">
              {isFamilyOfficeMode ? `${holdcoName} Family Office` : holdcoName}
            </h1>
            {isBusinessSchoolMode ? (
              <span className="text-xs px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap bg-emerald-500/20 text-emerald-400">
                🎓 B-School
              </span>
            ) : isFamilyOfficeMode ? (
              <span className="text-xs px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap bg-amber-500/20 text-amber-400">
                FO {round}/{maxRounds}
              </span>
            ) : isFundManagerMode ? (
              <span className="text-xs px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap bg-purple-500/20 text-purple-400">
                PE/{maxRounds}
              </span>
            ) : difficulty && (
              <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap ${difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
                {difficulty === 'normal' ? 'H' : 'E'}{maxRounds && maxRounds < 20 ? `/${maxRounds}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <AccountBadge />
            {/* Desktop: show all buttons inline */}
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
              onClick={() => setShowFeedback(true)}
              className="hidden sm:flex text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] items-center justify-center rounded hover:bg-white/5"
              title="Send Feedback"
            >
              💬
            </button>
            <button
              onClick={() => setShowLeaderboard(true)}
              className="text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-white/5"
              title="High Scores"
            >
              🏆
            </button>
            <button
              onClick={() => setShowManual(true)}
              className="hidden sm:flex text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] items-center justify-center rounded hover:bg-white/5"
              title="How to Play"
            >
              📖
            </button>
            <button
              onClick={() => setShowVideo(true)}
              className="hidden sm:flex text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] items-center justify-center rounded hover:bg-white/5"
              title="Watch Video"
            >
              ▶
            </button>
            <button
              onClick={() => setShowInstructions(true)}
              className="hidden sm:flex text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] items-center justify-center rounded hover:bg-white/5"
              title="View Tutorial"
            >
              ?
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="hidden sm:flex text-text-muted hover:text-danger transition-colors min-h-[44px] min-w-[44px] items-center justify-center rounded hover:bg-white/5"
              title="Start Over"
            >
              ↺
            </button>
            {/* Mobile: overflow menu for secondary actions */}
            <NavOverflowMenu
              hasReports={!!roundHistory && roundHistory.length > 0}
              onReports={() => setShowAnnualReports(true)}
              onManual={() => setShowManual(true)}
              onVideo={() => setShowVideo(true)}
              onFeedback={() => setShowFeedback(true)}
              onTutorial={() => setShowInstructions(true)}
              onReset={() => setShowResetConfirm(true)}
            />
          </div>
        </div>
        {/* Phase indicator + Market Cycle — compact on mobile, full on desktop */}
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
          {/* Market Cycle Indicator */}
          {eventHistory.length > 0 && (() => {
            const cycleLabel = MARKET_CYCLE_LABELS[marketCyclePhase];
            // Last 4 global events for history dots
            const EVENT_DOT_WEIGHTS: Record<string, number> = {
              global_bull_market: 2, global_interest_cut: 1, global_quiet: 0,
              global_inflation: -1, global_interest_hike: -1, global_credit_tightening: -1,
              global_recession: -2, global_financial_crisis: -3,
            };
            const EVENT_SHORT_NAMES: Record<string, string> = {
              global_bull_market: 'Bull Market', global_interest_cut: 'Rate Cut', global_quiet: 'Quiet Period',
              global_inflation: 'Inflation', global_interest_hike: 'Rate Hike', global_credit_tightening: 'Credit Tightening',
              global_recession: 'Recession', global_financial_crisis: 'Financial Crisis',
            };
            const recentGlobalEvents = eventHistory
              .filter(e => e.type.startsWith('global_'))
              .slice(-4);
            return (
              <Tooltip
                trigger={
                  <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full ml-auto flex items-center gap-1.5 ${cycleLabel.bg} ${cycleLabel.color}`}>
                    {marketCyclePhase}
                    {recentGlobalEvents.length > 0 && (
                      <span className="flex gap-0.5">
                        {recentGlobalEvents.map((e, i) => {
                          const w = EVENT_DOT_WEIGHTS[e.type] ?? 0;
                          const dotColor = w >= 2 ? 'bg-green-400' : w >= 1 ? 'bg-blue-400' : w === 0 ? 'bg-gray-400' : w >= -1 ? 'bg-orange-400' : 'bg-red-400';
                          return <span key={i} className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />;
                        })}
                      </span>
                    )}
                  </span>
                }
                align="right"
                width="w-64"
              >
                <p className="text-sm text-text-secondary font-normal">{cycleLabel.tip}</p>
                {recentGlobalEvents.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                    <p className="text-xs text-text-muted font-normal">Recent events:</p>
                    {recentGlobalEvents.map((e, i) => {
                      const w = EVENT_DOT_WEIGHTS[e.type] ?? 0;
                      const dotColor = w >= 2 ? 'bg-green-400' : w >= 1 ? 'bg-blue-400' : w === 0 ? 'bg-gray-400' : w >= -1 ? 'bg-orange-400' : 'bg-red-400';
                      const sign = w > 0 ? '+' : '';
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs font-normal">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                          <span className="text-text-secondary">{EVENT_SHORT_NAMES[e.type] ?? e.type}</span>
                          <span className="text-text-muted ml-auto">({sign}{w})</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-text-muted mt-2 font-normal">Based on the last 4 global events. Informational only — does not affect engine behavior.</p>
              </Tooltip>
            );
          })()}
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
        isPublic={ipoState?.isPublic}
        isFamilyOfficeMode={isFamilyOfficeMode}
        isFundManagerMode={isFundManagerMode}
        fundNav={fundDashMetrics?.nav}
        fundGrossMoic={fundDashMetrics?.grossMoic}
        fundDpi={fundDashMetrics?.dpi}
        fundDeployPct={fundDashMetrics?.deployPct}
        fundEstCarry={fundDashMetrics?.estCarry}
        totalCapitalDeployed={totalCapitalDeployed}
        lpSatisfactionScore={lpSatisfactionScore}
        onMetricClick={setDrilldownMetric}
      />

      {/* Business School mobile checklist bar (below 768px) */}
      {isBusinessSchoolMode && (
        <div className="md:hidden">
          <BusinessSchoolChecklist />
        </div>
      )}

      {/* Phase Content */}
      <div className="flex-1 overflow-auto flex">
        <div className="flex-1 min-w-0">
          {renderPhase()}
        </div>
        {/* Business School desktop checklist sidebar (768px+) */}
        {isBusinessSchoolMode && (
          <div className="hidden md:block">
            <BusinessSchoolChecklist />
          </div>
        )}
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

      {/* Video Modal */}
      <VideoModal isOpen={showVideo} onClose={() => { setShowVideo(false); setVideoInitialId(undefined); }} initialVideoId={videoInitialId} />

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
        context={{ screen: 'game', round, difficulty, duration, holdcoName }}
      />

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
