import { Suspense, lazy, useState, useEffect, useMemo } from 'react';
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
import { useGameStore, getFinalScore, getPostGameInsights, getEnterpriseValue, getFounderEquityValue, getFounderPersonalWealth } from './hooks/useGame';
import { IntroScreen, writeBestGrade } from './components/screens/IntroScreen';
import { GameScreen } from './components/screens/GameScreen';
import { GameOverScreen } from './components/screens/GameOverScreen';
import { BusinessSchoolGraduation } from './components/tutorial/BusinessSchoolGraduation';
import { FamilyOfficeScreen } from './components/screens/FamilyOfficeScreen';
import { ScoreboardScreen } from './components/screens/ScoreboardScreen';
import { PlaybookScreen } from './components/screens/PlaybookScreen';
import { SectorId, GameDifficulty, GameDuration, formatMoney } from './engine/types';
import { parseChallengeFromUrl, parseScoreboardFromUrl, cleanChallengeUrl, replaceUrlWithChallenge, type ChallengeParams, type PlayerResult } from './utils/challenge';
import { parsePlaybookFromUrl, cleanPlaybookUrl } from './utils/playbookShare';
import { checkFamilyOfficeEligibility } from './engine/familyOffice';
import { calculateFinalScore, calculatePEFundScore, calculateCarryWaterfall } from './engine/scoring';
import { trackPageView } from './services/telemetry';
import { initAnonymousAuth, initAuthListener } from './lib/supabase';
import { useAuthStore } from './hooks/useAuth';
import { AccountModal } from './components/ui/AccountModal';
import { StatsModal } from './components/ui/StatsModal';
import { ClaimGamesModal } from './components/ui/ClaimGamesModal';
import { PrivacyPolicyModal } from './components/ui/PrivacyPolicyModal';
import { TermsOfServiceModal } from './components/ui/TermsOfServiceModal';
import { DeleteAccountModal } from './components/ui/DeleteAccountModal';
import { StrategyLibraryModal } from './components/ui/StrategyLibraryModal';
import { CelebrationModal } from './components/ui/CelebrationModal';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { setupGoTest, getGoTestVariant } from './utils/goTestSetup';
import { syncAchievementsFromServer } from './hooks/useUnlocks';
// B-School test shortcut uses startBusinessSchool from the store (no direct data imports needed)

type Screen = 'intro' | 'game' | 'gameOver' | 'graduation' | 'familyOffice' | 'familyOfficeBridge' | 'familyOfficeResults' | 'scoreboard' | 'playbook';

function App() {
  const [isAdmin, setIsAdmin] = useState(window.location.hash === '#/admin');
  const [isFoTest, setIsFoTest] = useState(window.location.hash === '#/fo-test');
  const [isGoTest, setIsGoTest] = useState(window.location.hash.startsWith('#/go-test'));
  const [isBsTest, setIsBsTest] = useState(window.location.hash === '#/bs-test');

  // Open legal modals if URL hash matches
  useEffect(() => {
    if (window.location.hash === '#/privacy') useAuthStore.getState().openPrivacyModal();
    if (window.location.hash === '#/terms') useAuthStore.getState().openTermsModal();
  }, []);

  useEffect(() => {
    const onHash = () => {
      setIsAdmin(window.location.hash === '#/admin');
      setIsFoTest(window.location.hash === '#/fo-test');
      setIsGoTest(window.location.hash.startsWith('#/go-test'));
      setIsBsTest(window.location.hash === '#/bs-test');
      if (window.location.hash === '#/privacy') useAuthStore.getState().openPrivacyModal();
      if (window.location.hash === '#/terms') useAuthStore.getState().openTermsModal();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Fire page view telemetry once on mount
  useEffect(() => { trackPageView(); }, []);

  // Initialize anonymous Supabase auth + auth state listener (silent, no UI impact)
  useEffect(() => { initAnonymousAuth(); const unsub = initAuthListener(); return () => unsub?.(); }, []);

  // Sync achievements from server on load (merges server-computed achievements into localStorage)
  // Always sync for logged-in users to ensure prestige unlocks are current
  useEffect(() => {
    // Small delay to let auth initialize first
    const timer = setTimeout(() => {
      syncAchievementsFromServer();
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const [screen, setScreen] = useState<Screen>('intro');
  const [isNewGame, setIsNewGame] = useState(false);
  const [challengeData, setChallengeData] = useState<ChallengeParams | null>(null);
  const [incomingResult, setIncomingResult] = useState<PlayerResult | null>(null);
  const [scoreboardParams, setScoreboardParams] = useState<ChallengeParams | null>(null);
  const [playbookShareId, setPlaybookShareId] = useState<string | null>(null);
  const [foTestAmount, setFoTestAmount] = useState(2000000); // $2B default

  const {
    holdcoName,
    round,
    gameOver,
    businesses,
    exitedBusinesses,
    metrics,
    metricsHistory,
    totalDistributions,
    totalBuybacks,
    totalInvestedCapital,
    equityRaisesUsed,
    sharedServices,
    bankruptRound,
    difficulty,
    duration,
    maxRounds,
    cash,
    seed,
    founderShares,
    sharesOutstanding,
    initialOwnershipPct,
    totalDebt,
    hasRestructured,
    integratedPlatforms,
    isChallenge,
    ipoState,
    familyOfficeState: _familyOfficeState,
    founderDistributionsReceived,
    isFamilyOfficeMode,
    isFundManagerMode,
    fundName,
    lpCommentary,
    startFamilyOffice,
    completeFamilyOffice,
    startGame,
    startBusinessSchool,
    resetGame,
  } = useGameStore();

  // Parse challenge/scoreboard URL on mount (?s= takes precedence over ?c=)
  // URL params are kept in the browser bar for bookmarking/sharing — cleaned only on explicit navigation
  useEffect(() => {
    const pbShareId = parsePlaybookFromUrl();
    if (pbShareId) {
      setPlaybookShareId(pbShareId);
      setScreen('playbook');
      return;
    }

    const scoreboard = parseScoreboardFromUrl();
    if (scoreboard) {
      setScoreboardParams(scoreboard);
      setScreen('scoreboard');
      return;
    }

    const { challenge, result } = parseChallengeFromUrl();
    if (challenge) {
      // If a game is actively IN PROGRESS with a DIFFERENT seed, ignore the challenge
      // to prevent seed mismatch poisoning the GameOverScreen.
      // Completed games (gameOver) don't count — stale save data shouldn't block new challenge links.
      const hasActiveGame = holdcoName && round > 0 && !gameOver;
      const seedMatches = hasActiveGame && seed === challenge.seed;

      if (hasActiveGame && !seedMatches) {
        // Active game has different seed — clean challenge URL and keep the game
        cleanChallengeUrl();
        return;
      }

      setChallengeData(challenge);
      if (result) {
        setIncomingResult(result);
      }
    } else if (isChallenge && seed && !gameOver) {
      // No URL params, active challenge game — reconstruct challenge context from persisted store
      setChallengeData({ seed, difficulty, duration });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if there's a saved game on mount (skip if scoreboard URL already set screen)
  useEffect(() => {
    if (scoreboardParams || playbookShareId) return;
    // #/fo-test shortcut — set up mock FO-eligible state and show bridge
    if (isFoTest) {
      return; // handled in render
    }
    // #/go-test shortcut — set up mock game state and show game over screen
    if (isGoTest) {
      setupGoTest(getGoTestVariant());
      setScreen('gameOver');
      return;
    }
    // #/bs-test shortcut — mock B-School completion and show graduation screen
    if (isBsTest) {
      // Use startBusinessSchool to set up proper state, then override to game-over
      startBusinessSchool('Apex Holdings');
      const state = useGameStore.getState();
      // Mark all checklist items complete
      if (state.businessSchoolState) {
        const items = { ...state.businessSchoolState.checklist.items };
        for (const key of Object.keys(items)) items[key as keyof typeof items] = true;
        useGameStore.setState({
          round: 2,
          gameOver: true,
          founderShares: 920,
          sharesOutstanding: 1000,
          businessSchoolState: {
            ...state.businessSchoolState,
            checklist: { items, completedCount: 15 },
          },
          integratedPlatforms: [{ id: 'test', name: 'Multi-Trade Home Services', recipeId: 'home_multi_trade', constituentBusinessIds: ['bs_biz_b', 'bs_biz_c'], forgedInRound: 1, sectorIds: ['homeServices'], bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 } }],
        });
      }
      setScreen('graduation');
      return;
    }
    const currentState = useGameStore.getState();
    if (holdcoName && round > 0 && !gameOver) {
      // Both normal games and FO-mode games resume at GameScreen
      setScreen('game');
    } else if (gameOver && currentState.familyOfficeState?.isActive && !currentState.familyOfficeState?.legacyScore) {
      // Mid-FO reload (legacy — shouldn't happen with V2, but safe fallback)
      setScreen('familyOfficeResults');
    } else if (gameOver && isChallenge && challengeData) {
      // Challenge game over WITH active challenge URL — route to GameOverScreen so scoreboard can mount and auto-submit
      setScreen('gameOver');
    } else if (gameOver) {
      // Non-challenge game over — show intro instead of trapping on dead GameOver screen.
      // Game data stays in localStorage and is overwritten cleanly on next startGame().
      setScreen('intro');
    }
  }, [isGoTest]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = (name: string, startingSector: SectorId, difficulty: GameDifficulty = 'easy', duration: GameDuration = 'standard', seed?: number) => {
    startGame(name, startingSector, difficulty, duration, seed);
    // If starting with a seed (from challenge URL or creator), mark as challenge
    if (seed != null && !challengeData) {
      const params = { seed, difficulty, duration };
      setChallengeData(params);
      replaceUrlWithChallenge(params);
    }
    setIsNewGame(true);
    setScreen('game');
  };

  const handleStartFund = (fundName: string) => {
    startGame(fundName, undefined, 'easy', 'quick', undefined, true, fundName);
    setIsNewGame(true);
    setScreen('game');
  };

  const handleStartBusinessSchool = (holdcoName: string) => {
    startBusinessSchool(holdcoName);
    setIsNewGame(true);
    setScreen('game');
  };

  const handleGameOver = () => {
    window.scrollTo(0, 0);
    const state = useGameStore.getState();

    // Write best grade for unlock gate
    if (!state.isFundManagerMode && !state.isFamilyOfficeMode && !state.isBusinessSchoolMode) {
      try {
        const score = state.isFundManagerMode ? calculatePEFundScore(state) : calculateFinalScore(state);
        writeBestGrade(score.grade);
      } catch {}
    }

    // FO mode game over — calculate FO results and show results screen
    if (state.isFamilyOfficeMode) {
      completeFamilyOffice();
      setScreen('familyOfficeResults');
      return;
    }

    // Business School mode — route to graduation screen
    if (state.isBusinessSchoolMode) {
      setScreen('graduation');
      return;
    }

    // Fund mode — skip FO eligibility check, go straight to gameOver
    if (state.isFundManagerMode) {
      setScreen('gameOver');
      return;
    }

    // Check FO eligibility — intercept before game over if qualified
    if (!state.familyOfficeState && state.duration === 'standard' && !state.bankruptRound) {
      const score = calculateFinalScore(state);
      const { eligible } = checkFamilyOfficeEligibility(state, score);
      if (eligible) {
        setScreen('familyOfficeBridge');
        return;
      }
    }
    setScreen('gameOver');
  };

  const handlePlayAgain = () => {
    resetGame();
    setChallengeData(null);
    setIncomingResult(null);
    cleanChallengeUrl();
    setScreen('intro');
  };

  const handleQuickRematch = () => {
    // Read current settings before reset
    const state = useGameStore.getState();
    const prevName = state.holdcoName;
    const prevDifficulty = state.difficulty;
    const prevDuration = state.duration;
    const prevSector = state.businesses[0]?.sectorId;
    // Reset and start fresh with same settings
    resetGame();
    setChallengeData(null);
    setIncomingResult(null);
    cleanChallengeUrl();
    if (prevName && prevSector) {
      startGame(prevName, prevSector, prevDifficulty, prevDuration);
      setIsNewGame(false); // skip tutorial on rematch
      setScreen('game');
    } else {
      setScreen('intro');
    }
  };

  const handleFamilyOfficeResultsComplete = () => {
    window.scrollTo(0, 0);
    setScreen('gameOver');
  };

  // Compute game-over values only when needed (non-reactive to avoid infinite re-renders)
  const needsScoring = screen === 'gameOver' || screen === 'familyOfficeBridge' || screen === 'familyOfficeResults';
  const score = useMemo(() => {
    if (!needsScoring) return undefined;
    // Fund mode uses PE scorer; holdco mode uses standard scorer
    if (isFundManagerMode) return calculatePEFundScore(useGameStore.getState());
    return getFinalScore();
  }, [needsScoring, isFundManagerMode]);
  const insights = useMemo(() => screen === 'gameOver' ? getPostGameInsights() : undefined, [screen]);
  const enterpriseValue = useMemo(() => needsScoring ? getEnterpriseValue() : undefined, [needsScoring]);
  const founderEquityValue = useMemo(() => needsScoring ? getFounderEquityValue() : undefined, [needsScoring]);
  const founderPersonalWealth = useMemo(() => needsScoring ? getFounderPersonalWealth() : undefined, [needsScoring]);
  const carryWaterfall = useMemo(() => {
    if (!needsScoring || !isFundManagerMode) return undefined;
    return calculateCarryWaterfall(useGameStore.getState());
  }, [needsScoring, isFundManagerMode]);

  if (isAdmin) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-bg-primary flex items-center justify-center"><p className="text-text-muted animate-pulse">Loading admin...</p></div>}>
        <AdminDashboard />
      </Suspense>
    );
  }

  // #/fo-test — quick test shortcut for FO V2 flow
  // Sets up a minimal qualifying state, calls startFamilyOffice, and enters GameScreen in FO mode
  if (isFoTest) {
    return (
      <div className="min-h-screen bg-bg-primary text-text-primary overflow-x-hidden">
        {screen === 'familyOfficeResults' ? (
          <FamilyOfficeScreen isTestMode onComplete={() => {
            window.scrollTo(0, 0);
            setIsFoTest(false);
            window.location.hash = '';
            setScreen('intro');
          }} />
        ) : screen === 'game' ? (
          <GameScreen onGameOver={handleGameOver} onResetGame={handlePlayAgain} showTutorial={false} isChallenge={false} />
        ) : (
          <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-2xl mx-auto flex flex-col items-center justify-center">
            <span className="text-6xl block mb-6">🦅</span>
            <h1 className="text-3xl font-bold mb-2 text-center">Family Office V2 Test</h1>
            <p className="text-text-secondary text-center mb-2">
              Founder Distributions: {formatMoney(founderDistributionsReceived)}
            </p>
            {isFamilyOfficeMode ? (
              <>
                <p className="text-text-muted text-sm text-center mb-8">
                  FO game in progress.
                </p>
                <button
                  onClick={() => { window.scrollTo(0, 0); setScreen('game'); }}
                  className="btn-primary text-lg py-3 px-8"
                >
                  Resume Family Office Game
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <p className="text-text-muted text-sm text-center mb-4">
                  Select injection amount (pre-philanthropy):
                </p>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {([2000000, 5000000, 10000000, 20000000] as const).map(amount => (
                    <button
                      key={amount}
                      onClick={() => setFoTestAmount(amount)}
                      className={`py-3 px-1 rounded text-sm font-medium transition-colors ${
                        foTestAmount === amount
                          ? 'bg-accent text-white'
                          : 'bg-white/10 text-text-secondary hover:bg-white/15'
                      }`}
                    >
                      ${amount / 1000000}B
                    </button>
                  ))}
                </div>
                <p className="text-text-muted text-xs text-center mb-2">
                  After 25% philanthropy: {formatMoney(foTestAmount * 0.75)} starting cash
                </p>
                <button
                  onClick={() => {
                    useGameStore.setState({ founderDistributionsReceived: foTestAmount });
                    startFamilyOffice(true); // force=true bypasses eligibility for testing
                    window.scrollTo(0, 0);
                    setScreen('game');
                  }}
                  className="btn-primary text-lg py-3"
                >
                  Enter Family Office
                </button>
                <button
                  onClick={() => { setIsFoTest(false); window.location.hash = ''; setScreen('intro'); }}
                  className="btn-secondary text-sm py-2"
                >
                  Back to Menu
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary overflow-x-hidden">
      {screen === 'intro' && (
        <IntroScreen
          onStart={handleStart}
          onStartFund={handleStartFund}
          onStartBusinessSchool={handleStartBusinessSchool}
          challengeData={challengeData}
        />
      )}
      {screen === 'game' && <ErrorBoundary><GameScreen onGameOver={handleGameOver} onResetGame={handlePlayAgain} showTutorial={isNewGame} isChallenge={!!challengeData} /></ErrorBoundary>}
      {screen === 'familyOfficeBridge' && (
        <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-2xl mx-auto flex flex-col items-center justify-center">
          <span className="text-6xl block mb-6">🦅</span>
          <h1 className="text-3xl font-bold mb-2 text-center">Family Office Unlocked</h1>
          <p className="text-text-secondary text-center mb-2">{holdcoName}</p>
          <p className="text-text-muted text-sm text-center mb-8 max-w-md">
            Your holding company has grown into a legacy institution.
            Before seeing your final results, you can enter the Family Office — 5 rounds of real holdco gameplay
            using your accumulated wealth, earning up to a 1.5x multiplier on your Adjusted FEV.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => {
                startFamilyOffice();
                window.scrollTo(0, 0);
                setScreen('game');
              }}
              className="btn-primary text-lg py-3"
            >
              Enter Family Office
            </button>
            <button
              onClick={() => {
                window.scrollTo(0, 0);
                setScreen('gameOver');
              }}
              className="btn-secondary text-sm py-2"
            >
              Skip to Results
            </button>
          </div>
        </div>
      )}
      {screen === 'gameOver' && (
        <ErrorBoundary><GameOverScreen
          holdcoName={holdcoName}
          score={score as any}
          insights={insights!}
          businesses={businesses}
          exitedBusinesses={exitedBusinesses}
          metrics={metrics}
          enterpriseValue={enterpriseValue!}
          founderEquityValue={founderEquityValue!}
          founderPersonalWealth={founderPersonalWealth!}
          difficulty={difficulty}
          duration={duration}
          maxRounds={maxRounds}
          metricsHistory={metricsHistory}
          totalDistributions={totalDistributions}
          totalBuybacks={totalBuybacks}
          totalInvestedCapital={totalInvestedCapital}
          equityRaisesUsed={equityRaisesUsed}
          sharedServicesActive={sharedServices.filter(s => s.active).length}
          bankruptRound={bankruptRound}
          cash={cash}
          seed={seed}
          founderShares={founderShares}
          sharesOutstanding={sharesOutstanding}
          initialOwnershipPct={initialOwnershipPct}
          totalDebt={totalDebt}
          hasRestructured={hasRestructured}
          integratedPlatforms={integratedPlatforms}
          ipoState={ipoState}
          challengeData={challengeData}
          incomingResult={incomingResult}
          isFundManagerMode={isFundManagerMode}
          fundName={fundName}
          peScore={isFundManagerMode ? (score as any) : null}
          carryWaterfall={carryWaterfall}
          lpCommentary={lpCommentary}
          onPlayAgain={handlePlayAgain}
          onQuickRematch={handleQuickRematch}
        /></ErrorBoundary>
      )}
      {screen === 'graduation' && (
        <BusinessSchoolGraduation
          onStartRealGame={() => {
            resetGame();
            setChallengeData(null);
            setIncomingResult(null);
            setScreen('intro');
          }}
          onReplay={() => {
            const prevName = useGameStore.getState().holdcoName || 'My First Holdco';
            resetGame();
            setChallengeData(null);
            setIncomingResult(null);
            startBusinessSchool(prevName);
            setIsNewGame(true);
            setScreen('game');
          }}
        />
      )}
      {screen === 'familyOfficeResults' && (
        <FamilyOfficeScreen onComplete={handleFamilyOfficeResultsComplete} />
      )}
      {screen === 'playbook' && playbookShareId && (
        <PlaybookScreen
          shareId={playbookShareId}
          onBack={() => {
            setPlaybookShareId(null);
            cleanPlaybookUrl();
            setScreen('intro');
          }}
        />
      )}
      {screen === 'scoreboard' && scoreboardParams && (
        <ScoreboardScreen
          challengeParams={scoreboardParams}
          onPlayChallenge={(params) => {
            setChallengeData(params);
            setScoreboardParams(null);
            replaceUrlWithChallenge(params);
            setScreen('intro');
          }}
          onPlayAgain={() => {
            setScoreboardParams(null);
            handlePlayAgain();
          }}
        />
      )}

      {/* Global auth modals (controlled by useAuthStore) */}
      <AccountModal />
      <StatsModal />
      <ClaimGamesModal />
      <PrivacyPolicyModal />
      <TermsOfServiceModal />
      <DeleteAccountModal />
      <StrategyLibraryModal />
      <CelebrationModal />
    </div>
  );
}

export default App;
