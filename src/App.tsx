import { Suspense, lazy, useState, useEffect, useMemo } from 'react';
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
import { useGameStore, getFinalScore, getPostGameInsights, getEnterpriseValue, getFounderEquityValue, getFounderPersonalWealth } from './hooks/useGame';
import { IntroScreen } from './components/screens/IntroScreen';
import { GameScreen } from './components/screens/GameScreen';
import { GameOverScreen } from './components/screens/GameOverScreen';
import { ScoreboardScreen } from './components/screens/ScoreboardScreen';
import { SectorId, GameDifficulty, GameDuration } from './engine/types';
import { parseChallengeFromUrl, parseScoreboardFromUrl, cleanChallengeUrl, type ChallengeParams, type PlayerResult } from './utils/challenge';

type Screen = 'intro' | 'game' | 'gameOver' | 'scoreboard';

function App() {
  const [isAdmin, setIsAdmin] = useState(window.location.hash === '#/admin');

  useEffect(() => {
    const onHash = () => setIsAdmin(window.location.hash === '#/admin');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
    isChallenge,
    startGame,
    resetGame,
  } = useGameStore();

  // Parse challenge/scoreboard URL on mount (?s= takes precedence over ?c=)
  useEffect(() => {
    const scoreboard = parseScoreboardFromUrl();
    if (scoreboard) {
      cleanChallengeUrl();
      setScoreboardParams(scoreboard);
      setScreen('scoreboard');
      return;
    }

    const { challenge, result } = parseChallengeFromUrl();
    if (challenge) {
      cleanChallengeUrl();

      // If a saved game is in progress with a DIFFERENT seed, ignore the challenge
      // to prevent seed mismatch poisoning the GameOverScreen
      const hasSavedGame = holdcoName && round > 0;
      const seedMatches = hasSavedGame && seed === challenge.seed;

      if (hasSavedGame && !seedMatches) {
        // Saved game has different seed — don't overwrite with challenge data
        return;
      }

      setChallengeData(challenge);
      if (result) {
        setIncomingResult(result);
      }
    } else if (isChallenge && seed) {
      // Reconstruct challengeData from persisted store (survives browser refresh)
      setChallengeData({ seed, difficulty: difficulty ?? 'easy', duration: duration ?? 'standard' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if there's a saved game on mount (skip if scoreboard URL already set screen)
  useEffect(() => {
    if (scoreboardParams) return;
    if (holdcoName && round > 0 && !gameOver) {
      setScreen('game');
    } else if (gameOver) {
      setScreen('gameOver');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = (name: string, startingSector: SectorId, difficulty: GameDifficulty = 'easy', duration: GameDuration = 'standard', seed?: number) => {
    startGame(name, startingSector, difficulty, duration, seed);
    // If starting with a seed (from challenge URL or creator), mark as challenge
    if (seed != null && !challengeData) {
      setChallengeData({ seed, difficulty, duration });
    }
    setIsNewGame(true);
    setScreen('game');
  };

  const handleGameOver = () => {
    setScreen('gameOver');
  };

  const handlePlayAgain = () => {
    resetGame();
    setChallengeData(null);
    setIncomingResult(null);
    setScreen('intro');
  };

  // Compute game-over values only when needed (non-reactive to avoid infinite re-renders)
  const score = useMemo(() => screen === 'gameOver' ? getFinalScore() : undefined, [screen]);
  const insights = useMemo(() => screen === 'gameOver' ? getPostGameInsights() : undefined, [screen]);
  const enterpriseValue = useMemo(() => screen === 'gameOver' ? getEnterpriseValue() : undefined, [screen]);
  const founderEquityValue = useMemo(() => screen === 'gameOver' ? getFounderEquityValue() : undefined, [screen]);
  const founderPersonalWealth = useMemo(() => screen === 'gameOver' ? getFounderPersonalWealth() : undefined, [screen]);

  if (isAdmin) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-bg-primary flex items-center justify-center"><p className="text-text-muted animate-pulse">Loading admin...</p></div>}>
        <AdminDashboard />
      </Suspense>
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
          challengeData={challengeData}
          incomingResult={incomingResult}
          onPlayAgain={handlePlayAgain}
        />
      )}
      {screen === 'scoreboard' && scoreboardParams && (
        <ScoreboardScreen
          challengeParams={scoreboardParams}
          onPlayChallenge={(params) => {
            setChallengeData(params);
            setScoreboardParams(null);
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
