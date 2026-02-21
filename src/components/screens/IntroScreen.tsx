import { useState, useEffect } from 'react';
import { SectorId, GameDifficulty, GameDuration } from '../../engine/types';
import { SECTOR_LIST } from '../../data/sectors';
import { LeaderboardModal } from '../ui/LeaderboardModal';
import { ChangelogModal } from '../ui/ChangelogModal';
import { UserManualModal } from '../ui/UserManualModal';
import { DIFFICULTY_CONFIG, DURATION_CONFIG } from '../../data/gameConfig';
import type { ChallengeParams } from '../../utils/challenge';
import { generateRandomSeed } from '../../engine/rng';
import { buildChallengeUrl, shareChallenge, encodeChallengeParams, generateToken, setHostToken } from '../../utils/challenge';
import { trackChallengeCreate, trackChallengeShare } from '../../services/telemetry';

interface IntroScreenProps {
  onStart: (holdcoName: string, startingSector: SectorId, difficulty: GameDifficulty, duration: GameDuration, seed?: number) => void;
  challengeData?: ChallengeParams | null;
}

export function IntroScreen({ onStart, challengeData }: IntroScreenProps) {
  const isChallenge = !!challengeData;
  const [step, setStep] = useState<'mode' | 'setup'>(isChallenge ? 'setup' : 'mode');
  const [holdcoName, setHoldcoName] = useState('');
  const [selectedSector, setSelectedSector] = useState<SectorId | 'random'>('random');
  const [selectedDifficulty, setSelectedDifficulty] = useState<GameDifficulty>(challengeData?.difficulty ?? 'easy');
  const [selectedDuration, setSelectedDuration] = useState<GameDuration>(challengeData?.duration ?? 'quick');
  const [showNameError, setShowNameError] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showUserManual, setShowUserManual] = useState(false);
  const [showChallengeCreator, setShowChallengeCreator] = useState(false);
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [challengeDifficulty, setChallengeDifficulty] = useState<GameDifficulty>('easy');
  const [challengeDuration, setChallengeDuration] = useState<GameDuration>('quick');
  // After creating a challenge, store the seed so the creator can play it too
  const [createdChallengeSeed, setCreatedChallengeSeed] = useState<number | null>(null);

  // Sync challenge settings when challengeData arrives (it's null on first render,
  // populated asynchronously via useEffect in App.tsx)
  useEffect(() => {
    if (challengeData) {
      setSelectedDifficulty(challengeData.difficulty);
      setSelectedDuration(challengeData.duration);
    }
  }, [challengeData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (holdcoName.trim().length < 2) {
      setShowNameError(true);
      return;
    }
    const sector = selectedSector === 'random'
      ? SECTOR_LIST[challengeData?.seed != null
          ? Math.abs(challengeData.seed) % SECTOR_LIST.length
          : Math.floor(Math.random() * SECTOR_LIST.length)].id
      : selectedSector;
    onStart(holdcoName.trim(), sector, selectedDifficulty, selectedDuration, challengeData?.seed);
  };

  const handleChallengeStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (holdcoName.trim().length < 2) {
      setShowNameError(true);
      return;
    }
    const sector = selectedSector === 'random'
      ? SECTOR_LIST[Math.abs(createdChallengeSeed!) % SECTOR_LIST.length].id
      : selectedSector;
    // Start with the created challenge seed
    onStart(holdcoName.trim(), sector, challengeDifficulty, challengeDuration, createdChallengeSeed!);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHoldcoName(e.target.value);
    if (showNameError && e.target.value.trim().length >= 2) {
      setShowNameError(false);
    }
  };

  const handleCreateChallenge = async () => {
    const seed = generateRandomSeed();
    setCreatedChallengeSeed(seed);
    const params = { seed, difficulty: challengeDifficulty, duration: challengeDuration };
    const code = encodeChallengeParams(params);
    const url = buildChallengeUrl(params);
    // Save host token so this browser can reveal scores later
    const hostToken = generateToken();
    setHostToken(code, hostToken);
    trackChallengeCreate(code);
    const shared = await shareChallenge(url, 'Challenge me in Holdco Tycoon!');
    if (shared) {
      trackChallengeShare(code, 'share' in navigator ? 'native_share' : 'clipboard');
      setChallengeCopied(true);
      setTimeout(() => setChallengeCopied(false), 2500);
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

        {/* ═══ CHALLENGE RECIPIENT FLOW ═══ */}
        {isChallenge ? (
          <form onSubmit={handleSubmit} className="card p-6 border-yellow-500/30 bg-gradient-to-b from-yellow-500/5 to-transparent">
            <div className="flex items-center gap-2 justify-center mb-2">
              <span className="text-lg">🏆</span>
              <span className="font-bold text-yellow-400">Challenge Mode</span>
            </div>
            <p className="text-xs text-text-muted text-center mb-4">
              Same deals, same events, same market — compete under identical conditions.
            </p>
            <div className="flex justify-center gap-2 mb-5">
              <span className={`text-xs px-2 py-0.5 rounded ${selectedDifficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
                {DIFFICULTY_CONFIG[selectedDifficulty].label.split(' — ')[0]}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-secondary">
                {DURATION_CONFIG[selectedDuration].label}
              </span>
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

            <button
              type="submit"
              disabled={!holdcoName.trim()}
              className="btn-primary w-full text-lg"
            >
              Start Challenge →
            </button>
          </form>
        ) : step === 'mode' ? (
          <>
            {/* ═══ NORMAL: Mode Selection ═══ */}
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
            {/* ═══ NORMAL: Setup (Name + Sector) ═══ */}
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

        {/* Challenge a Friend (only in normal flow) */}
        {!isChallenge && (
          <div className="mt-4">
            <button
              onClick={() => setShowChallengeCreator(!showChallengeCreator)}
              className="min-h-[44px] text-sm text-yellow-400 hover:text-yellow-300 transition-colors font-medium inline-flex items-center justify-center"
            >
              🏆 Challenge a Friend
            </button>
            {showChallengeCreator && (
              <div className="card p-4 mt-2 border-yellow-500/20 bg-yellow-500/5 text-left">
                {!createdChallengeSeed ? (
                  <>
                    <p className="text-xs text-text-muted mb-3 leading-relaxed">
                      Race your friends under identical conditions — same deals, events, and market. Share the link, play separately, compare results.
                    </p>
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setChallengeDifficulty(challengeDifficulty === 'easy' ? 'normal' : 'easy')}
                        className={`min-h-[44px] text-xs px-4 rounded border transition-colors ${
                          challengeDifficulty === 'normal' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-accent/20 text-accent border-accent/30'
                        }`}
                      >
                        {challengeDifficulty === 'normal' ? 'Hard' : 'Easy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChallengeDuration(challengeDuration === 'quick' ? 'standard' : 'quick')}
                        className="min-h-[44px] text-xs px-4 rounded border border-white/20 bg-white/5 text-text-secondary hover:border-white/40 transition-colors"
                      >
                        {DURATION_CONFIG[challengeDuration].label}
                      </button>
                    </div>
                    <button
                      onClick={handleCreateChallenge}
                      className="btn-primary w-full text-sm"
                    >
                      {challengeCopied ? 'Link Copied!' : 'Share Challenge Link'}
                    </button>
                  </>
                ) : (
                  <>
                    {/* After sharing — CTA to play this challenge */}
                    <div className="text-center mb-3">
                      <span className="text-accent text-sm font-medium">Challenge link shared!</span>
                      <p className="text-xs text-text-muted mt-1">Now play the same challenge yourself.</p>
                    </div>
                    <form onSubmit={handleChallengeStart}>
                      <input
                        type="text"
                        value={holdcoName}
                        onChange={handleNameChange}
                        placeholder="Name your holdco"
                        className={`w-full bg-white/5 border rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none transition-colors mb-3 ${
                          showNameError ? 'border-danger focus:border-danger' : 'border-white/10 focus:border-accent'
                        }`}
                        maxLength={30}
                        autoFocus
                        required
                      />
                      {showNameError && (
                        <p className="text-danger text-sm mt-1 mb-2">Please enter a name</p>
                      )}
                      <button
                        type="submit"
                        disabled={!holdcoName.trim()}
                        className="btn-primary w-full text-sm"
                      >
                        Play This Challenge →
                      </button>
                    </form>
                    <button
                      onClick={() => { setCreatedChallengeSeed(null); setChallengeCopied(false); }}
                      className="mt-2 min-h-[44px] text-xs text-text-muted hover:text-text-secondary transition-colors w-full text-center inline-flex items-center justify-center"
                    >
                      Create a different challenge
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Global Leaderboard + Changelog + Manual */}
        <div className="mt-3 flex flex-col items-center gap-2">
          <button
            onClick={() => setShowLeaderboard(true)}
            className="text-sm text-text-muted hover:text-accent transition-colors"
          >
            🌍 Global Leaderboard
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowChangelog(true)}
              className="text-sm text-text-muted hover:text-accent transition-colors"
            >
              📋 What's New
            </button>
            <span className="text-text-muted/40">·</span>
            <button
              onClick={() => setShowUserManual(true)}
              className="text-sm text-text-muted hover:text-accent transition-colors"
            >
              📖 User Manual
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 text-sm text-text-muted">
          <p className="mb-2">{DURATION_CONFIG[isChallenge ? selectedDuration : selectedDuration].label.match(/\d+/)?.[0] || '20'} years. Build a long-term compounder.</p>
          <p>Based on <a href="https://holdcoguide.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">The Holdco Guide</a> by Peter Kang</p>
        </div>
      </div>

      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}
      {showChangelog && (
        <ChangelogModal onClose={() => setShowChangelog(false)} />
      )}
      {showUserManual && (
        <UserManualModal onClose={() => setShowUserManual(false)} />
      )}
    </div>
  );
}
