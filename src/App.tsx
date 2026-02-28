import { Suspense, lazy, useState, useEffect, useMemo } from 'react';
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
import { useGameStore, getFinalScore, getPostGameInsights, getEnterpriseValue, getFounderEquityValue, getFounderPersonalWealth } from './hooks/useGame';
import { IntroScreen } from './components/screens/IntroScreen';
import { GameScreen } from './components/screens/GameScreen';
import { GameOverScreen } from './components/screens/GameOverScreen';
import { FamilyOfficeScreen } from './components/screens/FamilyOfficeScreen';
import { ScoreboardScreen } from './components/screens/ScoreboardScreen';
import { SectorId, GameDifficulty, GameDuration, formatMoney } from './engine/types';
import { parseChallengeFromUrl, parseScoreboardFromUrl, cleanChallengeUrl, replaceUrlWithChallenge, type ChallengeParams, type PlayerResult } from './utils/challenge';
import { checkFamilyOfficeEligibility } from './engine/familyOffice';
import { calculateFinalScore } from './engine/scoring';
import { FAMILY_OFFICE_MIN_DISTRIBUTIONS } from './data/gameConfig';
import { trackPageView } from './services/telemetry';

type Screen = 'intro' | 'game' | 'gameOver' | 'familyOffice' | 'familyOfficeBridge' | 'scoreboard';

function App() {
  const [isAdmin, setIsAdmin] = useState(window.location.hash === '#/admin');
  const [isFoTest, setIsFoTest] = useState(window.location.hash === '#/fo-test');

  useEffect(() => {
    const onHash = () => {
      setIsAdmin(window.location.hash === '#/admin');
      setIsFoTest(window.location.hash === '#/fo-test');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Fire page view telemetry once on mount
  useEffect(() => { trackPageView(); }, []);

  const [screen, setScreen] = useState<Screen>('intro');
  const [isNewGame, setIsNewGame] = useState(false);
  const [challengeData, setChallengeData] = useState<ChallengeParams | null>(null);
  const [incomingResult, setIncomingResult] = useState<PlayerResult | null>(null);
  const [scoreboardParams, setScoreboardParams] = useState<ChallengeParams | null>(null);

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
    familyOfficeState,
    founderDistributionsReceived,
    startFamilyOffice,
    startGame,
    resetGame,
  } = useGameStore();

  // Parse challenge/scoreboard URL on mount (?s= takes precedence over ?c=)
  // URL params are kept in the browser bar for bookmarking/sharing — cleaned only on explicit navigation
  useEffect(() => {
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
    } else if (isChallenge && seed) {
      // No URL params — reconstruct challenge context from persisted store
      setChallengeData({ seed, difficulty, duration });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if there's a saved game on mount (skip if scoreboard URL already set screen)
  useEffect(() => {
    if (scoreboardParams) return;
    // #/fo-test shortcut — set up mock FO-eligible state and show bridge
    if (isFoTest) {
      return; // handled in render
    }
    const foState = useGameStore.getState().familyOfficeState;
    if (holdcoName && round > 0 && !gameOver) {
      setScreen('game');
    } else if (gameOver && foState?.isActive && !foState?.legacyScore) {
      // Mid-FO reload — resume at FO screen
      setScreen('familyOffice');
    } else if (gameOver && isChallenge) {
      // Challenge game over — route to GameOverScreen so scoreboard can mount and auto-submit
      setScreen('gameOver');
    } else if (gameOver) {
      // Non-challenge game over — show intro instead of trapping on dead GameOver screen.
      // Game data stays in localStorage and is overwritten cleanly on next startGame().
      setScreen('intro');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleGameOver = () => {
    window.scrollTo(0, 0);
    // Check FO eligibility — intercept before game over if qualified
    const state = useGameStore.getState();
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

  const handleFamilyOfficeComplete = () => {
    window.scrollTo(0, 0);
    setScreen('gameOver');
  };

  // Compute game-over values only when needed (non-reactive to avoid infinite re-renders)
  const needsScoring = screen === 'gameOver' || screen === 'familyOfficeBridge';
  const score = useMemo(() => needsScoring ? getFinalScore() : undefined, [needsScoring]);
  const insights = useMemo(() => screen === 'gameOver' ? getPostGameInsights() : undefined, [screen]);
  const enterpriseValue = useMemo(() => needsScoring ? getEnterpriseValue() : undefined, [needsScoring]);
  const founderEquityValue = useMemo(() => needsScoring ? getFounderEquityValue() : undefined, [needsScoring]);
  const founderPersonalWealth = useMemo(() => needsScoring ? getFounderPersonalWealth() : undefined, [needsScoring]);

  if (isAdmin) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-bg-primary flex items-center justify-center"><p className="text-text-muted animate-pulse">Loading admin...</p></div>}>
        <AdminDashboard />
      </Suspense>
    );
  }

  // #/fo-test — quick test shortcut for FO bridge flow
  if (isFoTest) {
    return (
      <div className="min-h-screen bg-bg-primary text-text-primary overflow-x-hidden">
        {screen === 'familyOffice' ? (
          <FamilyOfficeScreen onComplete={() => {
            window.scrollTo(0, 0);
            setIsFoTest(false);
            window.location.hash = '';
            setScreen('gameOver');
          }} />
        ) : (
          <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-2xl mx-auto flex flex-col items-center justify-center">
            <span className="text-6xl block mb-6">🦅</span>
            <h1 className="text-3xl font-bold mb-2 text-center">Family Office Test</h1>
            <p className="text-text-secondary text-center mb-2">
              Founder Distributions: {formatMoney(founderDistributionsReceived)}
            </p>
            <p className="text-text-muted text-sm text-center mb-8">
              {founderDistributionsReceived >= FAMILY_OFFICE_MIN_DISTRIBUTIONS
                ? 'Eligible — your distributions meet the $1B threshold.'
                : 'Your current save may not have enough distributions. Start a full game and distribute $1B+ to test properly.'}
            </p>
            {familyOfficeState?.isActive && !familyOfficeState?.legacyScore ? (
              <button
                onClick={() => { window.scrollTo(0, 0); setScreen('familyOffice'); }}
                className="btn-primary text-lg py-3 px-8"
              >
                Resume Family Office (Round {familyOfficeState.foRound})
              </button>
            ) : (
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => {
                    startFamilyOffice();
                    // Only navigate if startFamilyOffice succeeded (sets familyOfficeState)
                    if (useGameStore.getState().familyOfficeState?.isActive) {
                      window.scrollTo(0, 0);
                      setScreen('familyOffice');
                    }
                  }}
                  className="btn-primary text-lg py-3"
                  disabled={founderDistributionsReceived < FAMILY_OFFICE_MIN_DISTRIBUTIONS}
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
          challengeData={challengeData}
        />
      )}
      {screen === 'game' && <GameScreen onGameOver={handleGameOver} onResetGame={handlePlayAgain} showTutorial={isNewGame} isChallenge={!!challengeData} />}
      {screen === 'familyOfficeBridge' && (
        <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-2xl mx-auto flex flex-col items-center justify-center">
          <span className="text-6xl block mb-6">🦅</span>
          <h1 className="text-3xl font-bold mb-2 text-center">Family Office Unlocked</h1>
          <p className="text-text-secondary text-center mb-2">{holdcoName}</p>
          <p className="text-text-muted text-sm text-center mb-8 max-w-md">
            Your holding company has grown into a legacy institution.
            Before seeing your final results, you can enter the Family Office — a 5-round endgame of
            philanthropy, investments, and succession planning.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => {
                useGameStore.getState().startFamilyOffice();
                window.scrollTo(0, 0);
                setScreen('familyOffice');
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
        <GameOverScreen
          holdcoName={holdcoName}
          score={score!}
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
          onPlayAgain={handlePlayAgain}
        />
      )}
      {screen === 'familyOffice' && (
        <FamilyOfficeScreen onComplete={handleFamilyOfficeComplete} />
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
    </div>
  );
}

export default App;
