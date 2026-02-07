import { useState, useEffect } from 'react';
import { useGameStore, useFinalScore, usePostGameInsights, useEnterpriseValue } from './hooks/useGame';
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

  // Get final score, insights, and enterprise value for game over screen
  const score = useFinalScore();
  const insights = usePostGameInsights();
  const enterpriseValue = useEnterpriseValue();

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {screen === 'intro' && <IntroScreen onStart={handleStart} />}
      {screen === 'game' && <GameScreen onGameOver={handleGameOver} onResetGame={handlePlayAgain} />}
      {screen === 'gameOver' && (
        <GameOverScreen
          holdcoName={holdcoName}
          score={score}
          insights={insights}
          businesses={businesses}
          exitedBusinesses={exitedBusinesses}
          metrics={metrics}
          enterpriseValue={enterpriseValue}
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
