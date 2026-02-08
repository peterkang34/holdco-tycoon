import { useEffect, useState, useMemo } from 'react';
import { useGameStore } from '../../hooks/useGame';
import { getDistressRestrictions } from '../../engine/distress';
import { getMASourcingAnnualCost } from '../../data/sharedServices';
import { SECTORS } from '../../data/sectors';
import { Dashboard } from '../dashboard/Dashboard';
import { CollectPhase } from '../phases/CollectPhase';
import { EventPhase } from '../phases/EventPhase';
import { AllocatePhase } from '../phases/AllocatePhase';
import { RestructurePhase } from '../phases/RestructurePhase';
import { InstructionsModal } from '../ui/InstructionsModal';
import { AnnualReportModal } from '../ui/AnnualReportModal';
import { LeaderboardModal } from '../ui/LeaderboardModal';
import { calculateEnterpriseValue } from '../../engine/scoring';

const TUTORIAL_SEEN_KEY = 'holdco-tycoon-tutorial-seen-v3';

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
    requiresRestructuring,
    hasRestructured,
    bankruptRound,
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
  } = useGameStore();

  const founderOwnership = founderShares / sharesOutstanding;

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

  // Generate business stories at key milestones (every 5 years)
  useEffect(() => {
    if (phase === 'collect' && (round === 1 || round % 5 === 0)) {
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
            onAcceptOffer={acceptOffer}
            onDeclineOffer={declineOffer}
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
            lastEventType={lastEventType}
            equityRaisesUsed={equityRaisesUsed}
            sharesOutstanding={sharesOutstanding}
            founderShares={founderShares}
            totalBuybacks={totalBuybacks}
            totalDistributions={totalDistributions}
            intrinsicValuePerShare={metrics.intrinsicValuePerShare}
            onAcquire={acquireBusiness}
            onAcquireTuckIn={acquireTuckIn}
            onMergeBusinesses={mergeBusinesses}
            onDesignatePlatform={designatePlatform}
            onUnlockSharedService={unlockSharedService}
            onDeactivateSharedService={deactivateSharedService}
            onPayDebt={payDownDebt}
            onIssueEquity={issueEquity}
            onBuyback={buybackShares}
            onDistribute={distributeToOwners}
            onSell={sellBusiness}
            onWindDown={windDownBusiness}
            onImprove={improveBusiness}
            onEndRound={endRound}
            onSourceDeals={sourceDealFlow}
            maFocus={maFocus}
            onSetMAFocus={setMAFocus}
            actionsThisRound={actionsThisRound}
            maSourcing={maSourcing}
            onUpgradeMASourcing={upgradeMASourcing}
            onToggleMASourcing={toggleMASourcing}
            onProactiveOutreach={proactiveOutreach}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Instructions Modal */}
      {showInstructions && (
        <InstructionsModal
          holdcoName={holdcoName}
          initialRaise={initialRaiseAmount}
          founderOwnership={founderOwnership}
          firstBusinessName={businesses.length > 0 ? businesses[0].name : undefined}
          firstBusinessPrice={businesses.length > 0 ? businesses[0].acquisitionPrice : undefined}
          startingCash={cash}
          onClose={handleCloseTutorial}
        />
      )}

      {/* Top Bar */}
      <div className="bg-bg-card border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏛️</span>
          <h1 className="text-xl font-bold">{holdcoName}</h1>
          {roundHistory && roundHistory.length > 0 && (
            <button
              onClick={() => setShowAnnualReports(true)}
              className="text-text-muted hover:text-text-secondary transition-colors text-sm px-2 py-1 rounded hover:bg-white/5"
              title="Annual Reports"
            >
              Reports
            </button>
          )}
          <button
            onClick={() => {
              setShowLeaderboard(true);
            }}
            className="text-text-muted hover:text-text-secondary transition-colors text-sm px-2 py-1 rounded hover:bg-white/5"
            title="High Scores"
          >
            🏆
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            className="text-text-muted hover:text-text-secondary transition-colors text-sm px-2 py-1 rounded hover:bg-white/5"
            title="View Tutorial"
          >
            ?
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="text-text-muted hover:text-danger transition-colors text-sm px-2 py-1 rounded hover:bg-white/5"
            title="Start Over"
          >
            Reset
          </button>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className={`px-3 py-1 rounded-full ${
            phase === 'collect' ? 'bg-accent text-bg-primary' :
            'bg-white/10 text-text-muted'
          }`}>
            1. Collect
          </span>
          {phase === 'restructure' && (
            <span className="px-3 py-1 rounded-full bg-red-600 text-white animate-pulse">
              Restructure
            </span>
          )}
          <span className={`px-3 py-1 rounded-full ${
            phase === 'event' ? 'bg-accent text-bg-primary' :
            'bg-white/10 text-text-muted'
          }`}>
            2. Event
          </span>
          <span className={`px-3 py-1 rounded-full ${
            phase === 'allocate' ? 'bg-accent text-bg-primary' :
            'bg-white/10 text-text-muted'
          }`}>
            3. Allocate
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
        totalRounds={20}
        sharedServicesCount={activeServicesCount}
        focusTier={focusBonus?.tier}
        focusSector={focusBonus?.focusGroup}
        distressLevel={metrics.distressLevel}
        concentrationCount={concentrationCount}
        diversificationBonus={diversificationBonus}
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
          hypotheticalEV={calculateEnterpriseValue(useGameStore.getState())}
          onClose={() => setShowLeaderboard(false)}
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
