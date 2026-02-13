import { useEffect, useState, useMemo, useCallback } from 'react';
import { useGameStore } from '../../hooks/useGame';
import { useToastStore } from '../../hooks/useToast';
import { getDistressRestrictions } from '../../engine/distress';
import { getMASourcingAnnualCost, MA_SOURCING_CONFIG } from '../../data/sharedServices';
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
import { MetricDrilldownModal } from '../ui/MetricDrilldownModal';
import { ToastContainer } from '../ui/ToastContainer';
import { calculateFounderEquityValue } from '../../engine/scoring';
import { DIFFICULTY_CONFIG } from '../../data/gameConfig';

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
}

export function GameScreen({ onGameOver, onResetGame, showTutorial = false }: GameScreenProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAnnualReports, setShowAnnualReports] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);

  const {
    holdcoName,
    round,
    phase,
    gameOver,
    businesses,
    cash,
    totalDebt,
    interestRate,
    creditTighteningRoundsRemaining,
    dealPipeline,
    sharedServices,
    currentEvent,
    eventHistory,
    equityRaisesUsed,
    sharesOutstanding,
    founderShares,
    initialRaiseAmount,
    totalBuybacks,
    totalDistributions,
    metrics,
    focusBonus,
    requiresRestructuring: _requiresRestructuring,
    hasRestructured,
    bankruptRound: _bankruptRound,
    holdcoAmortizationThisRound,
    roundHistory,
    advanceToEvent,
    advanceToAllocate,
    endRound,
    acquireBusiness,
    acquireTuckIn,
    mergeBusinesses,
    designatePlatform,
    unlockSharedService,
    deactivateSharedService,
    payDownDebt,
    issueEquity,
    buybackShares,
    distributeToOwners,
    sellBusiness,
    windDownBusiness,
    improveBusiness,
    acceptOffer,
    declineOffer,
    grantEquityDemand,
    declineEquityDemand,
    acceptSellerNoteRenego,
    declineSellerNoteRenego,
    maFocus,
    setMAFocus,
    maSourcing,
    upgradeMASourcing,
    toggleMASourcing,
    proactiveOutreach,
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
    lastAcquisitionResult,
  } = useGameStore();

  const founderOwnership = founderShares / sharesOutstanding;

  const addToast = useToastStore((s) => s.addToast);

  const handleEventChoice = (action: string) => {
    switch (action) {
      case 'acceptOffer': acceptOffer(); break;
      case 'declineOffer': declineOffer(); break;
      case 'grantEquityDemand': grantEquityDemand(); break;
      case 'declineEquityDemand': declineEquityDemand(); break;
      case 'acceptSellerNoteRenego': acceptSellerNoteRenego(); break;
      case 'declineSellerNoteRenego': declineSellerNoteRenego(); break;
    }
    advanceToAllocate();
  };

  // Toast-wrapped action handlers
  const handleAcquire = useCallback((deal: Deal, structure: DealStructure) => {
    acquireBusiness(deal, structure);
    addToast({
      message: `Acquired ${deal.business.name}`,
      detail: `${formatMoney(deal.askingPrice)} via ${getStructureLabel(structure.type)}`,
      type: 'success',
    });
  }, [acquireBusiness, addToast]);

  const handleAcquireTuckIn = useCallback((deal: Deal, structure: DealStructure, platformId: string) => {
    const platform = businesses.find(b => b.id === platformId);
    acquireTuckIn(deal, structure, platformId);
    addToast({
      message: `Tucked ${deal.business.name} into ${platform?.name ?? 'platform'}`,
      detail: `${formatMoney(deal.askingPrice)} via ${getStructureLabel(structure.type)}`,
      type: 'success',
    });
  }, [acquireTuckIn, businesses, addToast]);

  const handleMerge = useCallback((id1: string, id2: string, newName: string) => {
    const b1 = businesses.find(b => b.id === id1);
    const b2 = businesses.find(b => b.id === id2);
    mergeBusinesses(id1, id2, newName);
    addToast({
      message: `Merged into ${newName}`,
      detail: b1 && b2 ? `${b1.name} + ${b2.name} combined` : undefined,
      type: 'success',
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
    const remaining = totalDebt - amount;
    addToast({
      message: `Paid down ${formatMoney(amount)} debt`,
      detail: remaining > 0 ? `${formatMoney(remaining)} remaining` : 'Debt-free!',
      type: 'success',
    });
  }, [payDownDebt, totalDebt, addToast]);

  const handleIssueEquity = useCallback((amount: number) => {
    const prevOwnership = founderShares / sharesOutstanding;
    issueEquity(amount);
    addToast({
      message: `Raised ${formatMoney(amount)} equity`,
      detail: `Ownership: ${(prevOwnership * 100).toFixed(1)}% → diluted`,
      type: 'info',
    });
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

  const handleWindDown = useCallback((businessId: string) => {
    const biz = businesses.find(b => b.id === businessId);
    windDownBusiness(businessId);
    addToast({
      message: `Winding down ${biz?.name ?? 'business'}`,
      detail: 'Business will be closed',
      type: 'warning',
    });
  }, [windDownBusiness, businesses, addToast]);

  const handleImprove = useCallback((businessId: string, improvementType: OperationalImprovementType) => {
    const biz = businesses.find(b => b.id === businessId);
    improveBusiness(businessId, improvementType);
    addToast({
      message: `${IMPROVEMENT_LABELS[improvementType] ?? improvementType}`,
      detail: `Applied to ${biz?.name ?? 'business'}`,
      type: 'success',
    });
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

  const renderPhase = () => {
    switch (phase) {
      case 'collect':
        return (
          <CollectPhase
            businesses={activeBusinesses}
            cash={cash}
            totalDebt={totalDebt}
            interestRate={interestRate}
            sharedServicesCost={sharedServicesCost}
            maSourcingCost={maSourcingCost}
            round={round}
            yearChronicle={yearChronicle}
            debtPaymentThisRound={debtPaymentThisRound}
            cashBeforeDebtPayments={cashBeforeDebtPayments}
            holdcoAmortization={holdcoAmortizationThisRound}
            interestPenalty={getDistressRestrictions(metrics.distressLevel).interestPenalty}
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
            totalDebt={totalDebt}
            interestRate={interestRate}
            creditTightening={creditTighteningRoundsRemaining > 0}
            distressLevel={metrics.distressLevel}
            dealPipeline={dealPipeline}
            sharedServices={sharedServices}
            round={round}
            maxRounds={maxRounds}
            lastEventType={lastEventType}
            equityRaisesUsed={equityRaisesUsed}
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
            onIssueEquity={handleIssueEquity}
            onBuyback={handleBuyback}
            onDistribute={handleDistribute}
            onSell={handleSell}
            onWindDown={handleWindDown}
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
            acquisitionsThisRound={acquisitionsThisRound}
            maxAcquisitionsPerRound={maxAcquisitionsPerRound}
            lastAcquisitionResult={lastAcquisitionResult}
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
          <div className="flex items-center gap-1 sm:gap-2">
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
      {showLeaderboard && (
        <LeaderboardModal
          hypotheticalEV={Math.round(calculateFounderEquityValue(useGameStore.getState()) * (DIFFICULTY_CONFIG[difficulty]?.leaderboardMultiplier ?? 1.0))}
          onClose={() => setShowLeaderboard(false)}
        />
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
