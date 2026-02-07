import { useEffect, useState } from 'react';
import { useGameStore } from '../../hooks/useGame';
import { Dashboard } from '../dashboard/Dashboard';
import { CollectPhase } from '../phases/CollectPhase';
import { EventPhase } from '../phases/EventPhase';
import { AllocatePhase } from '../phases/AllocatePhase';
import { InstructionsModal } from '../ui/InstructionsModal';

const TUTORIAL_SEEN_KEY = 'holdco-tycoon-tutorial-seen-v3';

interface GameScreenProps {
  onGameOver: () => void;
  onResetGame: () => void;
  showTutorial?: boolean;
}

export function GameScreen({ onGameOver, onResetGame, showTutorial = false }: GameScreenProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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
    triggerAIEnhancement,
  } = useGameStore();

  const founderOwnership = founderShares / sharesOutstanding;

  // Show tutorial on first load or when explicitly requested
  useEffect(() => {
    if (showTutorial) {
      setShowInstructions(true);
    } else {
      const hasSeenTutorial = localStorage.getItem(TUTORIAL_SEEN_KEY);
      if (!hasSeenTutorial && round === 1) {
        setShowInstructions(true);
      }
    }
  }, [showTutorial, round]);

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

  const activeBusinesses = businesses.filter(b => b.status === 'active');
  const lastEventType = eventHistory.length > 0 ? eventHistory[eventHistory.length - 1].type : undefined;
  const activeServicesCount = sharedServices.filter(s => s.active).length;
  const sharedServicesCost = sharedServices
    .filter(s => s.active)
    .reduce((sum, s) => sum + s.annualCost, 0);

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
            onContinue={advanceToEvent}
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
            cash={cash}
            totalDebt={totalDebt}
            interestRate={interestRate}
            creditTightening={creditTighteningRoundsRemaining > 0}
            dealPipeline={dealPipeline}
            sharedServices={sharedServices}
            round={round}
            lastEventType={lastEventType}
            equityRaisesUsed={equityRaisesUsed}
            sharesOutstanding={sharesOutstanding}
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
            maFocus={maFocus}
            onSetMAFocus={setMAFocus}
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
          onClose={handleCloseTutorial}
        />
      )}

      {/* Top Bar */}
      <div className="bg-bg-card border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏛️</span>
          <h1 className="text-xl font-bold">{holdcoName}</h1>
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
      />

      {/* Phase Content */}
      <div className="flex-1 overflow-auto">
        {renderPhase()}
      </div>

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
