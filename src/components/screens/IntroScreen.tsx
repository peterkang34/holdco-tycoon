import { useState, useEffect } from 'react';
import { SectorId, GameDifficulty, GameDuration, ScenarioChallengeConfig } from '../../engine/types';
import { SECTOR_LIST_STANDARD, SECTORS, UNLOCKABLE_SECTORS, getAvailableSectors } from '../../data/sectors';
import { getUnlockedSectorIds, getEarnedAchievementIds } from '../../hooks/useUnlocks';
import { LeaderboardModal } from '../ui/LeaderboardModal';
import { parseScenarioUrl, cleanScenarioUrl } from '../../utils/scenarioUrl';
import { isScenarioChallengesPlayerFacingEnabled, isScenarioChallengesPublicEntryEnabled } from '../../utils/featureFlags';
import { ChangelogModal } from '../ui/ChangelogModal';
import { UserManualModal } from '../ui/UserManualModal';
import { FeedbackModal } from '../ui/FeedbackModal';
import { AccountBadge } from '../ui/AccountBadge';
import { DIFFICULTY_CONFIG, DURATION_CONFIG, DURATION_SUBTITLE, PE_FUND_CONFIG } from '../../data/gameConfig';
import type { ChallengeParams } from '../../utils/challenge';
import { generateRandomSeed } from '../../engine/rng';
import { buildChallengeUrl, shareChallenge, encodeChallengeParams, generateToken, setHostToken } from '../../utils/challenge';
import { trackChallengeCreate, trackChallengeShare } from '../../services/telemetry';
import { useIsLoggedIn } from '../../hooks/useAuth';
import { useAuthStore } from '../../hooks/useAuth';
import { VideoModal } from '../ui/VideoModal';

const BEST_GRADE_KEY = 'holdco-tycoon-best-grade';
const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'S'] as const;

export function getBestGrade(): string | null {
  try { return localStorage.getItem(BEST_GRADE_KEY); } catch { return null; }
}

export function writeBestGrade(grade: string): void {
  try {
    const current = getBestGrade();
    const currentIdx = current ? GRADE_ORDER.indexOf(current as typeof GRADE_ORDER[number]) : -1;
    const newIdx = GRADE_ORDER.indexOf(grade as typeof GRADE_ORDER[number]);
    if (newIdx > currentIdx) {
      localStorage.setItem(BEST_GRADE_KEY, grade);
    }
  } catch {}
}

// Fund name randomizer
const FUND_PREFIXES = ['Granite', 'Summit', 'Cedar', 'Harbor', 'Ridge', 'Iron', 'Stone', 'Pine', 'Aspen', 'Falcon', 'Eagle', 'Meridian', 'Anchor', 'Beacon', 'Sterling'];
const FUND_GEO = ['Peak', 'Valley', 'River', 'Coast', 'Canyon', 'Mesa', 'Bay', 'Crest', 'Point', 'Bridge'];
const FUND_SUFFIX = ['Capital', 'Partners', 'Advisors', 'Equity'];

function randomFundName(): string {
  const prefix = FUND_PREFIXES[Math.floor(Math.random() * FUND_PREFIXES.length)];
  const geo = FUND_GEO[Math.floor(Math.random() * FUND_GEO.length)];
  const suffix = FUND_SUFFIX[Math.floor(Math.random() * FUND_SUFFIX.length)];
  return `${prefix} ${geo} ${suffix} Fund I`;
}

import { BSCHOOL_COMPLETED_KEY } from '../tutorial/BusinessSchoolGraduation';

function hasBSchoolCompleted(): boolean {
  try { return localStorage.getItem(BSCHOOL_COMPLETED_KEY) === 'true'; } catch { return false; }
}

interface IntroScreenProps {
  onStart: (holdcoName: string, startingSector: SectorId, difficulty: GameDifficulty, duration: GameDuration, seed?: number) => void;
  onStartFund: (fundName: string) => void;
  onStartBusinessSchool?: (holdcoName: string) => void;
  onStartScenarioChallenge?: (holdcoName: string, config: ScenarioChallengeConfig) => void;
  challengeData?: ChallengeParams | null;
  /** True when the player has an active game in progress that would be replaced by a new start. */
  hasGameInProgress?: boolean;
}

// ── Scenario Banner ────────────────────────────────────────────────────

interface ScenarioBannerSummary {
  id: string;
  name: string;
  tagline: string;
  description: string;
  theme: { emoji: string; color: string };
  startDate: string;
  endDate: string;
  difficulty: string;
  duration: string;
  maxRounds: number;
  rankingMetric: string;
  isPE: boolean;
  entryCount: number;
  topScore: number | null;
}

/** Compute a human-readable countdown to `endDate` (e.g. "5d left", "3h left"). */
function formatCountdown(endDate: string): string {
  const endMs = Date.parse(endDate);
  if (!Number.isFinite(endMs)) return '';
  const diffMs = endMs - Date.now();
  if (diffMs <= 0) return 'Ended';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days >= 2) return `${days}d left`;
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 2) return `${hours}h left`;
  const mins = Math.floor(diffMs / (60 * 1000));
  return `${mins}m left`;
}

export function IntroScreen({ onStart, onStartFund, onStartBusinessSchool, onStartScenarioChallenge, challengeData, hasGameInProgress }: IntroScreenProps) {
  const isChallenge = !!challengeData;
  const isLoggedIn = useIsLoggedIn();
  const openStatsModal = useAuthStore((s) => s.openStatsModal);
  const [step, setStep] = useState<'mode' | 'setup' | 'fund_setup' | 'bschool_setup' | 'se_setup'>(isChallenge ? 'setup' : 'mode');
  // Active scenarios for the home banner. Loaded on mount; empty array shows nothing.
  const [activeScenarios, setActiveScenarios] = useState<ScenarioBannerSummary[]>([]);
  // The scenario the player is entering (after clicking a banner or arriving via ?se=id).
  const [scenarioSetup, setScenarioSetup] = useState<ScenarioChallengeConfig | null>(null);
  const [scenarioLoadError, setScenarioLoadError] = useState<string | null>(null);
  // Save-in-progress confirmation — stores the action to run if the player confirms.
  const [pendingStartAction, setPendingStartAction] = useState<(() => void) | null>(null);
  const [scenarioName, setScenarioName] = useState('');
  // Dara H1: when the URL carries `?se={id}`, defer rendering the banner until Effect B
  // resolves (success → se_setup, failure → error state). Otherwise Effect A's earlier
  // resolution would flash the banner for a paint on deep-link arrivals.
  const [scenarioLoading, setScenarioLoading] = useState(() => {
    if (typeof window === 'undefined') return false;
    const p = parseScenarioUrl(window.location.search);
    return !!(p && p.intent === 'play' && p.scenarioId);
  });
  // Dara M3: tick every 60s so banner + setup `formatCountdown` refreshes. Matters
  // most in the final hours of a scenario when the countdown is 15m / 5m etc.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const [holdcoName, setHoldcoName] = useState('');
  const [fundName, setFundName] = useState('');
  const [bschoolName, setBschoolName] = useState('My First Holdco');
  const bschoolCompleted = hasBSchoolCompleted();
  const [selectedSector, setSelectedSector] = useState<SectorId | 'random'>('random');
  const [selectedDifficulty, setSelectedDifficulty] = useState<GameDifficulty>(challengeData?.difficulty ?? 'easy');
  const [selectedDuration, setSelectedDuration] = useState<GameDuration>(challengeData?.duration ?? 'quick');
  const [showNameError, setShowNameError] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  // Deep-link plumbing: `?tab=scenarios[&scenario={id}]` arrives → open the modal on the
  // scenarios tab (optionally focused). Undefined for the normal "Global Leaderboard"
  // button path, which lets the modal default to 'overall'. Reset on modal close so the
  // next button click opens on default again. Dara M3.
  const [leaderboardDeepLink, setLeaderboardDeepLink] = useState<{ tab: 'scenarios'; scenarioId: string | null } | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showUserManual, setShowUserManual] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showChallengeCreator, setShowChallengeCreator] = useState(false);
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [challengeDifficulty, setChallengeDifficulty] = useState<GameDifficulty>('easy');
  const [challengeDuration, setChallengeDuration] = useState<GameDuration>('quick');
  const [createdChallengeSeed, setCreatedChallengeSeed] = useState<number | null>(null);
  const [showHurdleTooltip, setShowHurdleTooltip] = useState(false);
  const [showCarryTooltip, setShowCarryTooltip] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showLockedSectors, setShowLockedSectors] = useState(false);

  // Compute available sectors (includes unlocked prestige sectors for non-challenge)
  const isAnonymous = useAuthStore((s) => s.player?.isAnonymous ?? true);
  const [achievementTick, setAchievementTick] = useState(0);
  useEffect(() => {
    const handler = () => setAchievementTick(t => t + 1);
    window.addEventListener('achievements-updated', handler);
    return () => window.removeEventListener('achievements-updated', handler);
  }, []);
  const sectorPickerList = isChallenge
    ? SECTOR_LIST_STANDARD
    : getAvailableSectors(false, getUnlockedSectorIds(isAnonymous), false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- achievementTick triggers re-render to refresh sector list
  void achievementTick;

  // Compute locked prestige sectors (not available yet)
  const lockedSectors = isChallenge ? [] : Object.entries(UNLOCKABLE_SECTORS)
    .filter(([id]) => !sectorPickerList.some(s => s.id === id))
    .map(([id, gate]) => ({ sector: SECTORS[id as keyof typeof SECTORS], gate, id }))
    .filter((s): s is { sector: NonNullable<typeof s.sector>; gate: typeof s.gate; id: string } => s.sector != null);
  const earnedCount = getEarnedAchievementIds().length;

  // Sync challenge settings when challengeData arrives
  useEffect(() => {
    if (challengeData) {
      setSelectedDifficulty(challengeData.difficulty);
      setSelectedDuration(challengeData.duration);
    }
  }, [challengeData]);

  // Fetch active scenarios for the home banner. Runs once on mount.
  // Non-blocking — failures silently produce an empty banner.
  useEffect(() => {
    if (isChallenge) return; // Challenge recipients never see the scenario banner.
    if (!isScenarioChallengesPlayerFacingEnabled()) return; // Feature-flag gate (plan §12).
    let cancelled = false;
    fetch('/api/scenario-challenges/active')
      .then(res => res.ok ? res.json() : { scenarios: [] })
      .then(data => {
        if (cancelled) return;
        setActiveScenarios(Array.isArray(data?.scenarios) ? data.scenarios.slice(0, 3) : []);
      })
      .catch(() => { /* silent — banner just stays empty */ });
    return () => { cancelled = true; };
  }, [isChallenge]);

  // Handle `?tab=scenarios[&scenario={id}]` arrival — open LeaderboardModal on the
  // scenarios tab (optionally focused on a specific scenario). URL is cleaned after
  // the intent is consumed. Runs before the play/preview effect below since the
  // leaderboard intent has no overlap with `?se=` (parseScenarioUrl returns one or
  // the other, not both).
  useEffect(() => {
    if (isChallenge) return;
    if (!isScenarioChallengesPlayerFacingEnabled()) return; // Feature-flag gate.
    const parsed = parseScenarioUrl(window.location.search);
    if (!parsed || parsed.intent !== 'leaderboard') return;
    setLeaderboardDeepLink({ tab: 'scenarios', scenarioId: parsed.scenarioId });
    setShowLeaderboard(true);
    cleanScenarioUrl();
  }, [isChallenge]);

  // Handle `?se={id}` arrival — fetch the full config and open the se_setup screen.
  // Expired/missing configs fall through gracefully: URL is cleaned, error surfaced.
  // Public `?se=` entries gate on the feature flag; admin previews (`?se=X&preview=1`)
  // always work regardless so authors can test without flipping rollout state.
  useEffect(() => {
    if (isChallenge) return;
    const parsed = parseScenarioUrl(window.location.search);
    if (!parsed || parsed.intent !== 'play' || !parsed.scenarioId) return;
    if (!isScenarioChallengesPublicEntryEnabled()) {
      // Feature flag off — clean URL silently so the player lands on the normal home.
      cleanScenarioUrl();
      setScenarioLoading(false);
      return;
    }

    let cancelled = false;
    fetch(`/api/scenario-challenges/config?id=${encodeURIComponent(parsed.scenarioId)}`)
      .then(res => {
        if (res.status === 404 || res.status === 410) {
          throw new Error('ended');
        }
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        if (!data?.config) throw new Error('missing config');
        setScenarioSetup(data.config as ScenarioChallengeConfig);
        setScenarioName(data.config.name ?? '');
        setStep('se_setup');
      })
      .catch(err => {
        if (cancelled) return;
        const ended = err instanceof Error && err.message === 'ended';
        setScenarioLoadError(ended
          ? 'This scenario has ended or is no longer available.'
          : 'Failed to load scenario — please try again.');
        cleanScenarioUrl();
      })
      .finally(() => {
        // Dara H1: clear the loading flag in both branches so the banner can
        // render once we've either transitioned to se_setup or fallen back to mode.
        if (!cancelled) setScenarioLoading(false);
      });
    return () => { cancelled = true; };
  }, [isChallenge]);

  /**
   * Wrap any start action with the save-in-progress confirmation when a game
   * is already active. Dara H2: bidirectional coverage — wires to normal, fund,
   * B-School, scenario, AND challenge-creator submits (NOT challenge-recipient,
   * who arrived via an intentional share link and already passed the warning
   * moment). If there's no game in progress, the action runs immediately.
   */
  const guardedStart = (action: () => void) => {
    if (hasGameInProgress) setPendingStartAction(() => action);
    else action();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (holdcoName.trim().length < 2) {
      setShowNameError(true);
      return;
    }
    const sector = selectedSector === 'random'
      ? SECTOR_LIST_STANDARD[challengeData?.seed != null
          ? Math.abs(challengeData.seed) % SECTOR_LIST_STANDARD.length
          : Math.floor(Math.random() * SECTOR_LIST_STANDARD.length)].id
      : selectedSector;
    const seed = challengeData?.seed;
    const name = holdcoName.trim();
    // Challenge recipients (isChallenge=true) bypass the warning — they clicked a link.
    if (isChallenge) {
      onStart(name, sector, selectedDifficulty, selectedDuration, seed);
      return;
    }
    guardedStart(() => onStart(name, sector, selectedDifficulty, selectedDuration, seed));
  };

  const handleFundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fundName.trim().length < 2) {
      setShowNameError(true);
      return;
    }
    guardedStart(() => onStartFund(fundName.trim()));
  };

  const handleChallengeStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (holdcoName.trim().length < 2) {
      setShowNameError(true);
      return;
    }
    const sector = selectedSector === 'random'
      ? SECTOR_LIST_STANDARD[Math.abs(createdChallengeSeed!) % SECTOR_LIST_STANDARD.length].id
      : selectedSector;
    onStart(holdcoName.trim(), sector, challengeDifficulty, challengeDuration, createdChallengeSeed!);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHoldcoName(e.target.value);
    if (showNameError && e.target.value.trim().length >= 2) {
      setShowNameError(false);
    }
  };

  const handleFundNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFundName(e.target.value);
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

  const hurdleAmount = Math.round(PE_FUND_CONFIG.hurdleReturn);
  const fundSize = PE_FUND_CONFIG.fundSize;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-8 py-8 relative overflow-hidden">
      {/* Account Badge — top right */}
      <div className="absolute top-4 right-4 z-20">
        <AccountBadge />
      </div>

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

        {/* ═══ Scenario Banner (above mode card, hidden for challenge recipients) ═══ */}
        {/* Dara H1: `scenarioLoading` guards against banner flash on `?se=` deep-links. */}
        {!isChallenge && step === 'mode' && activeScenarios.length > 0 && !scenarioLoading && (
          <ScenarioBanner
            scenarios={activeScenarios}
            onEnter={(summary) => {
              // Fetch the full config and transition to se_setup. Errors swallow silently;
              // the banner click is a lightweight "tell me more" gesture, not a commit.
              fetch(`/api/scenario-challenges/config?id=${encodeURIComponent(summary.id)}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data?.config) {
                    setScenarioSetup(data.config as ScenarioChallengeConfig);
                    setScenarioName(data.config.name ?? '');
                    setStep('se_setup');
                  }
                })
                .catch(() => { /* silent */ });
            }}
          />
        )}

        {scenarioLoadError && (
          <div className="mb-4 p-3 rounded bg-warning/10 border border-warning/20 text-sm text-warning flex items-center justify-between gap-3">
            <span>{scenarioLoadError}</span>
            {/* Dara M4: retry affordance for transient failures. "Ended" errors are
                non-retryable — the scenario is genuinely gone. */}
            {!scenarioLoadError.includes('ended or is no longer available') && (
              <button
                onClick={() => window.location.reload()}
                className="text-xs px-2 py-1 rounded bg-warning/20 text-warning hover:bg-warning/30 shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        )}

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
                    <div className="text-xs text-text-muted mt-1 italic">{DURATION_SUBTITLE[key]}</div>
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

              {/* ═══ Business School — learn fundamentals ═══ */}
              {onStartBusinessSchool && (
                <>
                  <div className="relative my-5">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
                    <div className="relative flex justify-center"><span className="bg-bg-secondary px-3 text-xs text-text-muted">or learn the fundamentals first</span></div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowNameError(false);
                      setStep('bschool_setup');
                    }}
                    className="w-full p-4 rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 to-transparent hover:border-emerald-500/50 transition-all text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">🎓</span>
                          <span className="font-bold text-emerald-400">Business School</span>
                          {bschoolCompleted && (
                            <span className="text-emerald-400/80 text-sm">✓ Completed</span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">2yr Guided</span>
                        </div>
                        <p className="text-xs text-text-muted">Learn the playbook in 2 guided years. Buy, improve, sell, and forge a platform. Leave with a Holdco MBA.</p>
                      </div>
                      <span className="text-text-muted text-lg">→</span>
                    </div>
                  </button>
                </>
              )}

              {/* ═══ Fund Manager — separate mode ═══ */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
                <div className="relative flex justify-center"><span className="bg-bg-secondary px-3 text-xs text-text-muted">or try a different mode</span></div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowNameError(false);
                  if (!fundName) setFundName(randomFundName());
                  setStep('fund_setup');
                }}
                className="w-full p-4 rounded-lg border border-purple-500/30 bg-gradient-to-r from-purple-500/5 to-transparent hover:border-purple-500/50 transition-all text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🏦</span>
                      <span className="font-bold text-purple-400">PE Fund Manager</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">10yr Fixed</span>
                    </div>
                    <p className="text-xs text-text-muted">$100M from LPs. 10 years. Earn your carry.</p>
                  </div>
                  <span className="text-text-muted text-lg">→</span>
                </div>
              </button>
            </div>
          </>
        ) : step === 'bschool_setup' ? (
          <>
            {/* ═══ B-SCHOOL SETUP ═══ */}
            <div className="card p-6 border-emerald-500/20">
              <div className="flex items-center justify-between mb-5">
                <button
                  type="button"
                  onClick={() => setStep('mode')}
                  className="text-sm text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center"
                >
                  ← Back
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🎓</span>
                  <span className="text-sm font-medium text-emerald-400">Business School</span>
                </div>
              </div>

              {/* Intro copy */}
              <div className="text-center mb-5">
                <h2 className="text-xl font-bold text-text-primary mb-2">The Holdco Playbook in 2 Years</h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                  You inherit a 3-business portfolio and $6M in cash.
                </p>
              </div>

              {/* Starting portfolio summary */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 mb-4 text-left">
                <div className="text-xs font-bold text-text-muted tracking-wider mb-2">YOUR STARTING PORTFOLIO</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">🔧 Plumbing Services (Q3)</span>
                    <span className="text-text-primary font-medium">$1.2M EBITDA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">⚡ Electrical Services (Q3)</span>
                    <span className="text-text-primary font-medium">$800K EBITDA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">💼 IT Staffing (Q3)</span>
                    <span className="text-text-primary font-medium">$1.0M EBITDA</span>
                  </div>
                  <div className="border-t border-white/10 pt-1.5 mt-1.5 flex justify-between">
                    <span className="text-text-muted">Cash on hand</span>
                    <span className="text-emerald-400 font-medium">$6.0M</span>
                  </div>
                </div>
              </div>

              {/* Holdco name + CTA (above fold on mobile) */}
              <label className="block text-left mb-2 text-sm text-text-muted">
                Name your holding company
              </label>
              <input
                type="text"
                value={bschoolName}
                onChange={(e) => setBschoolName(e.target.value)}
                placeholder="My First Holdco"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-colors mb-4"
                maxLength={30}
              />

              <button
                type="button"
                onClick={() => {
                  const name = bschoolName.trim() || 'My First Holdco';
                  guardedStart(() => onStartBusinessSchool?.(name));
                }}
                disabled={!bschoolName.trim()}
                className="btn-primary w-full text-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 mb-5"
              >
                Start Business School →
              </button>

              {/* Curriculum preview (below the fold on mobile — supplementary) */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-left">
                <div className="text-xs font-bold text-text-muted tracking-wider mb-3">WHAT YOU'LL LEARN</div>
                <div className="mb-3">
                  <div className="text-xs font-bold text-emerald-400/80 tracking-wider mb-2">YEAR 1 — BUILD THE PLATFORM</div>
                  <div className="space-y-1.5 text-sm text-text-secondary">
                    <div className="flex items-start gap-2"><span className="text-emerald-400/40 mt-0.5">○</span> Collect cash flow from your businesses</div>
                    <div className="flex items-start gap-2"><span className="text-emerald-400/40 mt-0.5">○</span> Improve a business and sell a non-core one</div>
                    <div className="flex items-start gap-2"><span className="text-emerald-400/40 mt-0.5">○</span> Acquire two HVAC businesses using different debt structures</div>
                    <div className="flex items-start gap-2"><span className="text-emerald-400/40 mt-0.5">○</span> Activate M&A Sourcing for better deal flow</div>
                    <div className="flex items-start gap-2"><span className="text-emerald-400/40 mt-0.5">○</span> Forge an integrated Home Services platform</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-400/80 tracking-wider mb-2">YEAR 2 — OPTIMIZE & EXIT</div>
                  <div className="space-y-1.5 text-sm text-text-secondary">
                    <div className="flex items-start gap-2"><span className="text-emerald-400/40 mt-0.5">○</span> Raise equity and execute an LBO acquisition</div>
                    <div className="flex items-start gap-2"><span className="text-emerald-400/40 mt-0.5">○</span> Unlock a shared service and pay down debt</div>
                    <div className="flex items-start gap-2"><span className="text-emerald-400/40 mt-0.5">○</span> Make a shareholder distribution</div>
                    <div className="flex items-start gap-2"><span className="text-emerald-400/40 mt-0.5">○</span> Sell the platform for a massive exit</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : step === 'fund_setup' ? (
          <>
            {/* ═══ FUND SETUP ═══ */}
            <form onSubmit={handleFundSubmit} className="card p-6 border-purple-500/20">
              <div className="flex items-center justify-between mb-5">
                <button
                  type="button"
                  onClick={() => setStep('mode')}
                  className="text-sm text-text-muted hover:text-text-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center"
                >
                  ← Back
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏦</span>
                  <span className="text-sm font-medium text-purple-400">Fund Manager</span>
                </div>
              </div>

              {/* Fund Name */}
              <label className="block text-left mb-2 text-sm text-text-muted">
                Name your fund <span className="text-danger">*</span>
              </label>
              <div className="flex gap-2 mb-1">
                <input
                  type="text"
                  value={fundName}
                  onChange={handleFundNameChange}
                  placeholder="e.g. Granite Peak Capital Fund I"
                  className={`flex-1 bg-white/5 border rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none transition-colors ${
                    showNameError ? 'border-danger focus:border-danger' : 'border-white/10 focus:border-accent'
                  }`}
                  maxLength={40}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setFundName(randomFundName())}
                  className="min-h-[44px] min-w-[44px] px-3 rounded-lg border border-white/10 bg-white/5 hover:border-white/30 text-text-muted hover:text-text-secondary transition-colors text-sm"
                  title="Randomize"
                >
                  🎲
                </button>
              </div>
              {showNameError && (
                <p className="text-danger text-sm mt-1 mb-3">Please enter a name for your fund</p>
              )}
              {!showNameError && <div className="mb-4" />}

              {/* LP Roster */}
              <label className="block text-left mb-2 text-sm text-text-muted font-medium">
                Your Limited Partners
              </label>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-7 h-7 rounded-full bg-blue-500/30 text-blue-300 text-[10px] font-bold flex items-center justify-center">EM</span>
                    <div>
                      <div className="text-xs font-medium text-blue-300">"Steady Edna" Morrison</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-text-muted ml-9">State Pension Fund</div>
                  <div className="text-[11px] text-blue-300/80 ml-9 font-medium">$60M committed</div>
                  <div className="text-[10px] text-text-muted ml-9 mt-1 italic">Wants: stability, distributions</div>
                </div>
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-7 h-7 rounded-full bg-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center justify-center">CH</span>
                    <div>
                      <div className="text-xs font-medium text-amber-300">"Chip" Henderson</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-text-muted ml-9">Family Office</div>
                  <div className="text-[11px] text-amber-300/80 ml-9 font-medium">$40M committed</div>
                  <div className="text-[10px] text-text-muted ml-9 mt-1 italic">Wants: action, big returns</div>
                </div>
              </div>

              {/* Fund Terms */}
              <label className="block text-left mb-2 text-sm text-text-muted font-medium">
                Fund Terms
              </label>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 mb-5 text-left">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Committed Capital</span>
                    <span className="text-text-primary font-medium">${fundSize / 1000}M</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Management Fee</span>
                    <span className="text-text-primary">2%/year ($2M)</span>
                  </div>
                  <div className="flex justify-between items-center relative">
                    <button
                      type="button"
                      className="text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
                      onClick={() => { setShowHurdleTooltip(!showHurdleTooltip); setShowCarryTooltip(false); }}
                    >
                      Hurdle Rate <span className="text-[10px] text-accent/60">[?]</span>
                    </button>
                    <span className="text-text-primary">8% annual</span>
                    {showHurdleTooltip && (
                      <div className="absolute left-0 top-full mt-1 z-10 p-2 rounded-lg bg-bg-secondary border border-white/20 text-xs text-text-secondary max-w-xs shadow-lg">
                        Your LPs earn 8% per year before you see any carry. Over 10 years, you need to turn $100M into ~${Math.round(hurdleAmount / 1000)}M to earn carry.
                        <button type="button" onClick={() => setShowHurdleTooltip(false)} className="ml-2 text-accent">OK</button>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center relative">
                    <button
                      type="button"
                      className="text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
                      onClick={() => { setShowCarryTooltip(!showCarryTooltip); setShowHurdleTooltip(false); }}
                    >
                      Carried Interest <span className="text-[10px] text-accent/60">[?]</span>
                    </button>
                    <span className="text-text-primary">20% above hurdle</span>
                    {showCarryTooltip && (
                      <div className="absolute left-0 top-full mt-1 z-10 p-2 rounded-lg bg-bg-secondary border border-white/20 text-xs text-text-secondary max-w-xs shadow-lg">
                        Your share of profits above the hurdle. If your fund returns $300M, that's $84M above the ~$216M hurdle. Your carry: 20% of $84M = $16.8M.
                        <button type="button" onClick={() => setShowCarryTooltip(false)} className="ml-2 text-accent">OK</button>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Duration</span>
                    <span className="text-text-primary">10 years</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!fundName.trim()}
                className="btn-primary w-full text-lg bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400"
              >
                Launch Your Fund →
              </button>
            </form>
          </>
        ) : step === 'se_setup' && scenarioSetup ? (
          <>
            {/* ═══ SCENARIO CHALLENGE SETUP ═══ */}
            <ScenarioSetupView
              config={scenarioSetup}
              name={scenarioName}
              onNameChange={setScenarioName}
              onBack={() => {
                setStep('mode');
                setScenarioSetup(null);
                setScenarioLoadError(null);
                cleanScenarioUrl();
              }}
              onEnter={() => {
                if (!scenarioSetup || !scenarioName.trim() || !onStartScenarioChallenge) return;
                guardedStart(() => {
                  onStartScenarioChallenge(scenarioName.trim(), scenarioSetup);
                  cleanScenarioUrl();
                });
              }}
            />
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
                {sectorPickerList.map(sector => (
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

              {/* Locked prestige sectors */}
              {lockedSectors.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[10px] tracking-widest text-text-muted font-bold">UNLOCKABLE SECTORS</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  {/* Mobile collapse toggle — relative z-10 prevents submit button touch overlap */}
                  <button
                    onClick={(e) => { e.preventDefault(); setShowLockedSectors(!showLockedSectors); }}
                    className="sm:hidden text-xs text-text-muted mb-3 min-h-[44px] px-2 inline-flex items-center relative z-10"
                    type="button"
                  >
                    {showLockedSectors ? 'Hide' : 'Show'} locked sectors ({lockedSectors.length})
                  </button>
                  <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${showLockedSectors ? 'grid' : 'hidden sm:grid'}`}>
                    {lockedSectors.map(({ sector, gate, id }) => (
                      <div
                        key={id}
                        className="p-3 rounded-lg border border-white/5 bg-white/[0.02] opacity-60 cursor-default"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl grayscale opacity-50">🔒</span>
                          <span className="text-sm font-medium text-text-muted">{sector.name}</span>
                        </div>
                        <p className="text-[10px] text-text-muted/60 mt-1">
                          Earn {gate.gateAchievementCount} achievements to unlock ({earnedCount}/{gate.gateAchievementCount})
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

        {/* Challenge a Friend (only in normal flow, not fund setup) */}
        {!isChallenge && step !== 'fund_setup' && step !== 'bschool_setup' && (
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

        {/* Global Leaderboard + My Stats + Changelog + Manual */}
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLeaderboard(true)}
              className="text-sm text-text-muted hover:text-accent transition-colors"
            >
              🌍 Global Leaderboard
            </button>
            {isLoggedIn ? (
              <>
                <span className="text-text-muted/40">·</span>
                <button
                  onClick={openStatsModal}
                  className="text-sm text-text-muted hover:text-accent transition-colors"
                >
                  📊 My Stats
                </button>
              </>
            ) : (
              <>
                <span className="text-text-muted/40">·</span>
                <button
                  onClick={() => useAuthStore.getState().openAccountModal('signin')}
                  className="text-sm text-text-muted hover:text-accent transition-colors"
                >
                  Sign In
                </button>
              </>
            )}
          </div>
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
            <span className="text-text-muted/40">·</span>
            <button
              onClick={() => setShowFeedback(true)}
              className="text-sm text-text-muted hover:text-accent transition-colors"
            >
              💬 Feedback
            </button>
            <span className="text-text-muted/40">·</span>
            <button
              onClick={() => setShowVideo(true)}
              className="text-sm text-text-muted hover:text-accent transition-colors"
            >
              ▶ Watch Video
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 text-sm text-text-muted">
          <p className="mb-2">{DURATION_CONFIG[isChallenge ? selectedDuration : selectedDuration].label.match(/\d+/)?.[0] || '20'} years. Build a long-term compounder.</p>
          <p>Based on <a href="https://holdcoguide.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">The Holdco Guide</a> by Peter Kang</p>
          <div className="flex gap-3 mt-4 justify-center">
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-muted/50 hover:text-text-muted transition-colors"
            >
              Terms of Service
            </a>
            <span className="text-xs text-text-muted/30">&middot;</span>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-muted/50 hover:text-text-muted transition-colors"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </div>

      {showLeaderboard && (
        <LeaderboardModal
          onClose={() => {
            setShowLeaderboard(false);
            setLeaderboardDeepLink(null);
          }}
          initialTab={leaderboardDeepLink?.tab}
          initialScenarioId={leaderboardDeepLink?.scenarioId ?? null}
        />
      )}
      {showChangelog && (
        <ChangelogModal onClose={() => setShowChangelog(false)} />
      )}
      {showUserManual && (
        <UserManualModal onClose={() => setShowUserManual(false)} />
      )}
      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
        context={{ screen: 'intro' }}
      />
      <VideoModal isOpen={showVideo} onClose={() => setShowVideo(false)} />

      {/* Save-in-progress confirmation. Fires when player starts a new game
          while another is in progress. Bidirectional across all modes (plan §5.5). */}
      {pendingStartAction && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-bg-primary border border-white/10 rounded-lg max-w-md w-full p-5">
            <h3 className="text-sm font-semibold mb-2">Replace game in progress?</h3>
            <p className="text-xs text-text-muted mb-4">
              Starting this will replace your current game in progress. Your unfinished game will be lost.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingStartAction(null)}
                className="px-3 py-1.5 rounded text-xs bg-bg-secondary text-text-secondary hover:text-text-primary border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = pendingStartAction;
                  setPendingStartAction(null);
                  action?.();
                }}
                className="px-3 py-1.5 rounded text-xs font-medium bg-accent text-white hover:bg-accent/90"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scenario Banner ────────────────────────────────────────────────────

function ScenarioBanner({
  scenarios,
  onEnter,
}: {
  scenarios: ScenarioBannerSummary[];
  onEnter: (summary: ScenarioBannerSummary) => void;
}) {
  if (scenarios.length === 0) return null;
  const [featured, ...rest] = scenarios; // First = full banner, up to 2 more = compact rows.

  return (
    <div className="mb-6 space-y-2">
      {/* Full banner — first featured scenario */}
      <button
        onClick={() => onEnter(featured)}
        className="w-full text-left rounded-lg border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-amber-500/5 hover:border-amber-500/60 transition-all p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/20">LIVE</span>
              <span className="text-xs text-amber-400/80 font-mono">{formatCountdown(featured.endDate)}</span>
            </div>
            <h3 className="text-base font-bold text-text-primary">
              <span className="mr-2">{featured.theme?.emoji}</span>{featured.name}
            </h3>
            <p className="text-xs text-text-secondary mt-1">{featured.tagline}</p>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
              <span>{featured.entryCount} {featured.entryCount === 1 ? 'entry' : 'entries'}</span>
              <span>·</span>
              <span>{featured.difficulty} · {featured.duration} · {featured.maxRounds}yr</span>
              {featured.isPE && <><span>·</span><span className="text-amber-400">PE</span></>}
            </div>
          </div>
          <div className="text-amber-400 text-sm shrink-0">→</div>
        </div>
      </button>

      {/* Compact rows — scenarios 2 & 3 */}
      {rest.map(s => (
        <button
          key={s.id}
          onClick={() => onEnter(s)}
          className="w-full text-left rounded border border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 transition-all px-3 py-2 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="shrink-0">{s.theme?.emoji}</span>
            <span className="text-sm font-medium text-text-primary truncate">{s.name}</span>
            <span className="text-[10px] text-amber-400/70 font-mono shrink-0">{formatCountdown(s.endDate)}</span>
          </div>
          <span className="text-amber-400 text-xs shrink-0">→</span>
        </button>
      ))}
    </div>
  );
}

// ── Scenario Setup View ────────────────────────────────────────────────

function ScenarioSetupView({
  config,
  name,
  onNameChange,
  onBack,
  onEnter,
}: {
  config: ScenarioChallengeConfig;
  name: string;
  onNameChange: (name: string) => void;
  onBack: () => void;
  onEnter: () => void;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onEnter(); }} className="card p-6 border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          ← Back
        </button>
        <span className="text-xs font-bold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/20">LIVE · {formatCountdown(config.endDate)}</span>
      </div>

      <div className="text-center mb-4">
        <div className="text-5xl mb-2">{config.theme?.emoji}</div>
        <h2 className="text-xl font-bold text-text-primary mb-1">{config.name}</h2>
        <p className="text-sm text-text-secondary">{config.tagline}</p>
      </div>

      <div className="rounded bg-white/5 border border-white/10 p-3 mb-4 text-xs text-text-secondary whitespace-pre-wrap">
        {config.description}
      </div>

      {/* Locked config summary — admin-set parameters the player can't change. */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
        <div className="bg-white/5 rounded p-2">
          <div className="text-text-muted">Difficulty</div>
          <div className="font-medium text-text-primary capitalize">{config.difficulty}</div>
        </div>
        <div className="bg-white/5 rounded p-2">
          <div className="text-text-muted">Rounds</div>
          <div className="font-medium text-text-primary">{config.maxRounds} yr</div>
        </div>
        {config.fundStructure ? (
          <>
            <div className="bg-white/5 rounded p-2">
              <div className="text-text-muted">Fund Size</div>
              <div className="font-medium text-text-primary">${(config.fundStructure.committedCapital / 1000).toFixed(0)}M</div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-text-muted">Mode</div>
              <div className="font-medium text-amber-400">PE Fund</div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white/5 rounded p-2">
              <div className="text-text-muted">Starting Cash</div>
              <div className="font-medium text-text-primary">${(config.startingCash / 1000).toFixed(1)}M</div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-text-muted">Starting Debt</div>
              <div className="font-medium text-text-primary">${(config.startingDebt / 1000).toFixed(1)}M</div>
            </div>
          </>
        )}
      </div>

      {config.startingBusinesses.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] text-text-muted mb-1.5">Starting Portfolio</div>
          <div className="space-y-1">
            {config.startingBusinesses.map((b, i) => (
              <div key={i} className="text-[11px] bg-white/5 rounded px-2 py-1 flex items-center justify-between gap-2">
                <span className="text-text-primary">
                  {b.name}
                  {b.status === 'distressed' && <span className="ml-1.5 text-[9px] text-warning">DISTRESSED</span>}
                </span>
                <span className="text-text-muted font-mono">Q{b.quality} · ${(b.ebitda / 1000).toFixed(1)}M EBITDA</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="block text-left mb-2 text-sm text-text-muted">
        Name your {config.fundStructure ? 'fund' : 'holding company'} <span className="text-danger">*</span>
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={config.fundStructure ? 'e.g. Beacon Capital Fund' : 'e.g. Apex Holdings'}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-amber-500 transition-colors mb-4"
        maxLength={30}
        autoFocus
        required
      />

      <button
        type="submit"
        disabled={!name.trim()}
        className="btn-primary w-full text-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-amber-500/50 disabled:to-amber-600/50"
      >
        Enter {config.name} →
      </button>
    </form>
  );
}
