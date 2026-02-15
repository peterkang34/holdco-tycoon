import { useState } from 'react';
import { SectorId, GameDifficulty, GameDuration } from '../../engine/types';
import { SECTOR_LIST } from '../../data/sectors';
import { LeaderboardModal } from '../ui/LeaderboardModal';
import { DIFFICULTY_CONFIG, DURATION_CONFIG } from '../../data/gameConfig';

interface IntroScreenProps {
  onStart: (holdcoName: string, startingSector: SectorId, difficulty: GameDifficulty, duration: GameDuration) => void;
}

export function IntroScreen({ onStart }: IntroScreenProps) {
  const [step, setStep] = useState<'mode' | 'setup'>('mode');
  const [holdcoName, setHoldcoName] = useState('');
  const [selectedSector, setSelectedSector] = useState<SectorId | 'random'>('random');
  const [selectedDifficulty, setSelectedDifficulty] = useState<GameDifficulty>('easy');
  const [selectedDuration, setSelectedDuration] = useState<GameDuration>('quick');
  const [showNameError, setShowNameError] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (holdcoName.trim().length < 2) {
      setShowNameError(true);
      return;
    }
    const sector = selectedSector === 'random'
      ? SECTOR_LIST[Math.floor(Math.random() * SECTOR_LIST.length)].id
      : selectedSector;
    onStart(holdcoName.trim(), sector, selectedDifficulty, selectedDuration);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHoldcoName(e.target.value);
    if (showNameError && e.target.value.trim().length >= 2) {
      setShowNameError(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-8 py-8 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 text-6xl opacity-10 animate-pulse">🏭</div>
        <div className="absolute top-1/3 right-1/4 text-5xl opacity-10 animate-pulse" style={{ animationDelay: '0.5s' }}>💻</div>
        <div className="absolute bottom-1/3 left-1/3 text-5xl opacity-10 animate-pulse" style={{ animationDelay: '1s' }}>🔧</div>
        <div className="absolute bottom-1/4 right-1/3 text-6xl opacity-10 animate-pulse" style={{ animationDelay: '1.5s' }}>📊</div>
        <div className="absolute top-1/2 left-1/5 text-5xl opacity-10 animate-pulse" style={{ animationDelay: '2s' }}>🏥</div>
        <div className="absolute bottom-1/2 right-1/5 text-5xl opacity-10 animate-pulse" style={{ animationDelay: '2.5s' }}>🍽️</div>
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center max-w-lg w-full">
        {/* Logo */}
        <div className="mb-8">
          <span className="text-8xl mb-4 block animate-glow rounded-full inline-block p-4">🏛️</span>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-accent to-accent-secondary bg-clip-text text-transparent">
            HOLDCO TYCOON
          </h1>
          <p className="text-text-secondary mt-3">
            Build a portfolio. Allocate capital. Compound value.
          </p>
        </div>

        {step === 'mode' ? (
          <>
            {/* Mode Selection */}
            <div className="card p-6">
              <label className="block text-left mb-3 text-sm text-text-muted font-medium">
                Difficulty
              </label>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {(Object.entries(DIFFICULTY_CONFIG) as [GameDifficulty, typeof DIFFICULTY_CONFIG.easy][]).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDifficulty(key)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      selectedDifficulty === key
                        ? 'border-accent bg-accent/10'
                        : 'border-white/10 bg-white/5 hover:border-white/30'
                    }`}
                  >
                    <div className="font-medium text-sm mb-1">{config.label.split(' — ')[0]}</div>
                    <div className="text-xs text-accent mb-2">{config.label.split(' — ')[1]}</div>
                    <p className="text-xs sm:text-[10px] text-text-muted leading-relaxed">{config.description}</p>
                  </button>
                ))}
              </div>

              <label className="block text-left mb-3 text-sm text-text-muted font-medium">
                Duration
              </label>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {(Object.entries(DURATION_CONFIG) as [GameDuration, typeof DURATION_CONFIG.standard][]).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDuration(key)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      selectedDuration === key
                        ? 'border-accent bg-accent/10'
                        : 'border-white/10 bg-white/5 hover:border-white/30'
                    }`}
                  >
                    <div className="font-medium text-sm">{config.label}</div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setStep('setup')}
                className="btn-primary w-full text-lg"
              >
                Continue →
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Setup: Name + Sector */}
            <form onSubmit={handleSubmit} className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => setStep('mode')}
                  className="text-sm text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center"
                >
                  ← Back
                </button>
                <div className="flex gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${selectedDifficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
                    {DIFFICULTY_CONFIG[selectedDifficulty].label.split(' — ')[0]}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-secondary">
                    {DURATION_CONFIG[selectedDuration].label}
                  </span>
                </div>
              </div>

              <label className="block text-left mb-2 text-sm text-text-muted">
                Name your holding company <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={holdcoName}
                onChange={handleNameChange}
                placeholder="e.g. Apex Holdings"
                className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none transition-colors ${
                  showNameError ? 'border-danger focus:border-danger' : 'border-white/10 focus:border-accent'
                }`}
                maxLength={30}
                autoFocus
                required
              />
              {showNameError && (
                <p className="text-danger text-sm mt-1 mb-3">Please enter a name for your holding company</p>
              )}
              {!showNameError && <div className="mb-4" />}

              <label className="block text-left mb-2 text-sm text-text-muted">
                Choose your first acquisition
              </label>
              <button
                type="button"
                onClick={() => setSelectedSector('random')}
                className={`w-full mb-2 p-3 rounded-lg border text-center transition-all border-dashed ${
                  selectedSector === 'random'
                    ? 'border-accent bg-accent/10'
                    : 'border-white/10 bg-white/5 hover:border-white/30'
                }`}
              >
                <span className="text-sm font-medium text-accent">🎲 Surprise Me</span>
                <span className="text-[11px] text-text-muted ml-2">— sector revealed on launch</span>
              </button>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {SECTOR_LIST.map(sector => (
                  <button
                    key={sector.id}
                    type="button"
                    onClick={() => setSelectedSector(sector.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedSector === sector.id
                        ? 'border-accent bg-accent/10'
                        : 'border-white/10 bg-white/5 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{sector.emoji}</span>
                      <span className="text-sm font-medium">{sector.name}</span>
                    </div>
                    <p className="text-[11px] sm:text-[10px] text-text-muted mt-1">
                      {sector.acquisitionMultiple[0]}–{sector.acquisitionMultiple[1]}x &middot; {Math.round(sector.organicGrowthRange[0] * 100)}–{Math.round(sector.organicGrowthRange[1] * 100)}% growth &middot; {Math.round(sector.capexRate * 100)}% capex
                    </p>
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={!holdcoName.trim()}
                className="btn-primary w-full text-lg"
              >
                Launch Your Holdco →
              </button>
            </form>
          </>
        )}

        {/* Global Leaderboard */}
        <button
          onClick={() => setShowLeaderboard(true)}
          className="mt-4 text-sm text-text-muted hover:text-accent transition-colors"
        >
          🌍 Global Leaderboard
        </button>

        {/* Info */}
        <div className="mt-8 text-sm text-text-muted">
          <p className="mb-2">{DURATION_CONFIG[selectedDuration].label.match(/\d+/)?.[0] || '20'} years. Build a long-term compounder.</p>
          <p>Based on <a href="https://holdcoguide.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">The Holdco Guide</a> by Peter Kang</p>
        </div>
      </div>

      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}
    </div>
  );
}
