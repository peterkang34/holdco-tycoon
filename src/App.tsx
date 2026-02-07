import { useState, useEffect, useMemo } from 'react';
import { useGameStore, getFinalScore, getPostGameInsights, getEnterpriseValue } from './hooks/useGame';
import { IntroScreen } from './components/screens/IntroScreen';
import { GameScreen } from './components/screens/GameScreen';
import { GameOverScreen } from './components/screens/GameOverScreen';
import { SectorId } from './engine/types';

type Screen = 'intro' | 'game' | 'gameOver';

function App() {
  const [screen, setScreen] = useState<Screen>('intro');

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

  const handleStart = (name: string, startingSector: SectorId) => {
    startGame(name, startingSector);
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

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {screen === 'intro' && <IntroScreen onStart={handleStart} />}
      {screen === 'game' && <GameScreen onGameOver={handleGameOver} onResetGame={handlePlayAgain} />}
      {screen === 'gameOver' && (
        <GameOverScreen
          holdcoName={holdcoName}
          score={score!}
          insights={insights!}
          businesses={businesses}
          exitedBusinesses={exitedBusinesses}
          metrics={metrics}
          enterpriseValue={enterpriseValue!}
          metricsHistory={metricsHistory}
          totalDistributions={totalDistributions}
          totalBuybacks={totalBuybacks}
          totalInvestedCapital={totalInvestedCapital}
          equityRaisesUsed={equityRaisesUsed}
          sharedServicesActive={sharedServices.filter(s => s.active).length}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}

export default App;
