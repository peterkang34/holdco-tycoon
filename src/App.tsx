import { useState, useEffect, useMemo } from 'react';
import { useGameStore, getFinalScore, getPostGameInsights, getEnterpriseValue, getFounderEquityValue, getFounderPersonalWealth } from './hooks/useGame';
import { IntroScreen } from './components/screens/IntroScreen';
import { GameScreen } from './components/screens/GameScreen';
import { GameOverScreen } from './components/screens/GameOverScreen';
import { SectorId, GameDifficulty, GameDuration } from './engine/types';

type Screen = 'intro' | 'game' | 'gameOver';

function App() {
  const [screen, setScreen] = useState<Screen>('intro');
  const [isNewGame, setIsNewGame] = useState(false);

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
    founderShares,
    sharesOutstanding,
    initialOwnershipPct,
    totalDebt,
    startGame,
    resetGame,
  } = useGameStore();

  // Check if there's a saved game on mount
  useEffect(() => {
    if (holdcoName && round > 0 && !gameOver) {
      setScreen('game');
    } else if (gameOver) {
      setScreen('gameOver');
    }
  }, []);

  const handleStart = (name: string, startingSector: SectorId, difficulty: GameDifficulty = 'easy', duration: GameDuration = 'standard') => {
    startGame(name, startingSector, difficulty, duration);
    setIsNewGame(true);
    setScreen('game');
  };

  const handleGameOver = () => {
    setScreen('gameOver');
  };

  const handlePlayAgain = () => {
    resetGame();
    setScreen('intro');
  };

  // Compute game-over values only when needed (non-reactive to avoid infinite re-renders)
  const score = useMemo(() => screen === 'gameOver' ? getFinalScore() : undefined, [screen]);
  const insights = useMemo(() => screen === 'gameOver' ? getPostGameInsights() : undefined, [screen]);
  const enterpriseValue = useMemo(() => screen === 'gameOver' ? getEnterpriseValue() : undefined, [screen]);
  const founderEquityValue = useMemo(() => screen === 'gameOver' ? getFounderEquityValue() : undefined, [screen]);
  const founderPersonalWealth = useMemo(() => screen === 'gameOver' ? getFounderPersonalWealth() : undefined, [screen]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary overflow-x-hidden">
      {screen === 'intro' && <IntroScreen onStart={handleStart} />}
      {screen === 'game' && <GameScreen onGameOver={handleGameOver} onResetGame={handlePlayAgain} showTutorial={isNewGame} />}
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
          founderShares={founderShares}
          sharesOutstanding={sharesOutstanding}
          initialOwnershipPct={initialOwnershipPct}
          totalDebt={totalDebt}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}

export default App;
