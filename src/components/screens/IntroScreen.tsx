import { useState } from 'react';
import { SectorId } from '../../engine/types';
import { SECTOR_LIST } from '../../data/sectors';
import { loadLeaderboard } from '../../engine/scoring';
import { LeaderboardModal } from '../ui/LeaderboardModal';

interface IntroScreenProps {
  onStart: (holdcoName: string, startingSector: SectorId) => void;
}

export function IntroScreen({ onStart }: IntroScreenProps) {
  const [holdcoName, setHoldcoName] = useState('');
  const [selectedSector, setSelectedSector] = useState<SectorId>('agency');
  const [showNameError, setShowNameError] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (holdcoName.trim().length < 2) {
      setShowNameError(true);
      return;
    }
    onStart(holdcoName.trim(), selectedSector);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHoldcoName(e.target.value);
    if (showNameError && e.target.value.trim().length >= 2) {
      setShowNameError(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden">
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
      <div className="relative z-10 text-center max-w-lg">
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6">
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
          <div className="grid grid-cols-2 gap-2 mb-4">
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

        {/* High Scores */}
        {loadLeaderboard().length > 0 && (
          <button
            onClick={() => setShowLeaderboard(true)}
            className="mt-4 text-sm text-text-muted hover:text-accent transition-colors"
          >
            🏆 High Scores
          </button>
        )}

        {/* Info */}
        <div className="mt-8 text-sm text-text-muted">
          <p className="mb-2">20 years. Build a long-term compounder.</p>
          <p>Based on <a href="https://holdcoguide.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">The Holdco Guide</a> by Peter Kang</p>
        </div>
      </div>

      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}
    </div>
  );
}
