import { useState, useEffect, useMemo } from 'react';
import { ScoreBreakdown, PostGameInsight, Business, Metrics, LeaderboardEntry, formatMoney, formatMultiple, HistoricalMetrics, GameDifficulty, GameDuration, IntegratedPlatform } from '../../engine/types';
import { useGameStore } from '../../hooks/useGame';
import { SECTORS } from '../../data/sectors';
import { loadLeaderboard, saveToLeaderboard, wouldMakeLeaderboardFromList, getLeaderboardRankFromList } from '../../engine/scoring';
import { calculateExitValuation } from '../../engine/simulation';
import { AIAnalysisSection } from '../ui/AIAnalysisSection';
import { DIFFICULTY_CONFIG, RESTRUCTURING_FEV_PENALTY } from '../../data/gameConfig';
import { EV_WATERFALL_LABELS } from '../../data/mechanicsCopy';
import { getGradeColor, getRankColor } from '../../utils/gradeColors';
import { TABS, filterAndSort, getDisplayValue } from '../ui/LeaderboardModal';
import type { LeaderboardTab } from '../ui/LeaderboardModal';
import { trackGameComplete, trackChallengeCreate, trackChallengeShare, type GameCompleteSnapshot } from '../../services/telemetry';
import {
  type ChallengeParams,
  type PlayerResult,
  buildChallengeUrl,
  buildResultUrl,
  buildScoreboardUrl,
  shareChallenge,
  encodeChallengeParams,
} from '../../utils/challenge';
import { ChallengeComparison } from '../ui/ChallengeComparison';
import { ChallengeScoreboard } from '../ui/ChallengeScoreboard';

/** Heuristic archetype classification based on game actions */
function computeArchetype(
  activeCount: number, platformCount: number, totalAcquisitions: number,
  totalSells: number, turnaroundsStarted: number, totalDistributions: number,
  _equityRaisesUsed: number,
): string {
  if (platformCount >= 3) return 'platform_builder';
  if (turnaroundsStarted >= 3) return 'turnaround_specialist';
  if (totalDistributions > 0 && totalSells >= 3) return 'dividend_cow';
  if (totalAcquisitions >= 8 && activeCount >= 5) return 'serial_acquirer';
  if (totalAcquisitions >= 6 && platformCount >= 1) return 'roll_up_machine';
  if (activeCount <= 3 && totalSells <= 1) return 'focused_operator';
  if (activeCount >= 6) return 'conglomerate';
  if (totalAcquisitions <= 3) return 'value_investor';
  return 'balanced';
}

interface GameOverScreenProps {
  holdcoName: string;
  score: ScoreBreakdown;
  insights: PostGameInsight[];
  businesses: Business[];
  exitedBusinesses: Business[];
  metrics: Metrics;
  enterpriseValue: number;
  founderEquityValue: number;
  founderPersonalWealth: number;
  difficulty?: GameDifficulty;
  duration?: GameDuration;
  maxRounds?: number;
  metricsHistory: HistoricalMetrics[];
  totalDistributions: number;
  totalBuybacks: number;
  totalInvestedCapital: number;
  equityRaisesUsed: number;
  sharedServicesActive: number;
  bankruptRound?: number;
  cash: number;
  seed: number;
  founderShares: number;
  sharesOutstanding: number;
  initialOwnershipPct: number;
  totalDebt: number;
  hasRestructured?: boolean;
  integratedPlatforms: IntegratedPlatform[];
  challengeData?: ChallengeParams | null;
  incomingResult?: PlayerResult | null;
  onPlayAgain: () => void;
}

export function GameOverScreen({
  holdcoName,
  score,
  insights: _insights,
  businesses,
  exitedBusinesses,
  metrics,
  enterpriseValue,
  founderEquityValue,
  founderPersonalWealth,
  difficulty = 'easy',
  duration = 'standard',
  maxRounds = 20,
  metricsHistory,
  totalDistributions,
  totalBuybacks,
  totalInvestedCapital,
  equityRaisesUsed,
  sharedServicesActive,
  bankruptRound,
  cash,
  seed,
  founderShares,
  sharesOutstanding,
  initialOwnershipPct,
  totalDebt,
  hasRestructured = false,
  integratedPlatforms,
  challengeData,
  incomingResult,
  onPlayAgain,
}: GameOverScreenProps) {
  const [initials, setInitials] = useState('');
  const [hasSaved, setHasSaved] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>('overall');
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [scoreboardLinkCopied, setScoreboardLinkCopied] = useState(false);
  const [showComparison, setShowComparison] = useState(!!incomingResult);
  const [scoreboardFailed, setScoreboardFailed] = useState(false);

  // Build challenge params from current game (works for both challenge and solo games)
  const currentChallengeParams: ChallengeParams = useMemo(() => (
    challengeData ?? { seed, difficulty: difficulty ?? 'easy', duration: duration ?? 'standard' }
  ), [challengeData, seed, difficulty, duration]);

  // Build player result for sharing
  const myResult: PlayerResult = useMemo(() => ({
    name: holdcoName,
    fev: Math.round(founderEquityValue),
    score: score.total,
    grade: score.grade,
    businesses: businesses.filter(b => b.status === 'active').length,
    sectors: new Set(businesses.filter(b => b.status === 'active').map(b => b.sectorId)).size,
    peakLeverage: Math.max(...metricsHistory.map(h => h.metrics.netDebtToEbitda), 0),
    restructured: hasRestructured,
    totalDistributions: Math.round(totalDistributions),
  }), [holdcoName, founderEquityValue, score, businesses, metricsHistory, hasRestructured, totalDistributions]);

  const handleChallengeShare = async () => {
    const url = buildChallengeUrl(currentChallengeParams);
    const code = encodeChallengeParams(currentChallengeParams);
    trackChallengeCreate(code);
    const shared = await shareChallenge(url, `Challenge me in Holdco Tycoon!`);
    if (shared) {
      trackChallengeShare(code, 'share' in navigator ? 'native_share' : 'clipboard');
      setChallengeCopied(true);
      setTimeout(() => setChallengeCopied(false), 2000);
    }
  };

  const handleShareResult = async () => {
    const code = encodeChallengeParams(currentChallengeParams);
    const url = buildResultUrl(currentChallengeParams, myResult);
    const shared = await shareChallenge(url, 'My Holdco Tycoon result');
    if (shared) {
      trackChallengeShare(code, 'share' in navigator ? 'native_share' : 'clipboard');
      setChallengeCopied(true);
      setTimeout(() => setChallengeCopied(false), 2000);
    }
  };

  const handleShareScoreboardLink = async () => {
    const url = buildScoreboardUrl(currentChallengeParams);
    const shared = await shareChallenge(url, 'Holdco Tycoon Challenge Scoreboard');
    if (shared) {
      setScoreboardLinkCopied(true);
      setTimeout(() => setScoreboardLinkCopied(false), 2000);
    }
  };

  // Fire telemetry on game completion — full snapshot
  useEffect(() => {
    const sector = businesses[0]?.sectorId || exitedBusinesses[0]?.sectorId || 'agency';
    const state = useGameStore.getState();
    const allActions = state.roundHistory.flatMap(r => r.actions);

    // Count acquisitions, sells, turnarounds
    const acquireTypes = new Set(['acquire', 'acquire_tuck_in']);
    const sellTypes = new Set(['sell', 'sell_platform', 'accept_offer']);
    const totalAcquisitions = allActions.filter(a => acquireTypes.has(a.type)).length;
    const totalSells = allActions.filter(a => sellTypes.has(a.type)).length;
    const turnaroundsStarted = allActions.filter(a => a.type === 'start_turnaround').length;

    // Turnaround outcomes
    const resolvedTurnarounds = allActions.filter(a => a.type === 'turnaround_resolved');
    const turnaroundsSucceeded = resolvedTurnarounds.filter(a => (a.details as any)?.outcome === 'success').length;
    const turnaroundsFailed = resolvedTurnarounds.filter(a => (a.details as any)?.outcome !== 'success').length;

    // Peak leverage from metricsHistory
    const peakLeverage = metricsHistory.length > 0
      ? Math.max(...metricsHistory.map(m => m.metrics.netDebtToEbitda))
      : 0;

    // Peak distress level (map string to number)
    const distressMap: Record<string, number> = { comfortable: 0, elevated: 1, stressed: 2, breach: 3 };
    const peakDistressLevel = metricsHistory.length > 0
      ? Math.max(...metricsHistory.map(m => distressMap[m.metrics.distressLevel] ?? 0))
      : 0;

    // Unique sectors
    const allBiz = [...businesses, ...exitedBusinesses];
    const sectorIds = [...new Set(allBiz.map(b => b.sectorId))];

    // Deal structure histogram
    const dealStructureTypes: Record<string, number> = {};
    for (const a of allActions) {
      if (acquireTypes.has(a.type) && (a.details as any)?.dealStructure) {
        const st = String((a.details as any).dealStructure);
        dealStructureTypes[st] = (dealStructureTypes[st] || 0) + 1;
      }
    }

    // Rollover equity count
    const rolloverEquityCount = allActions.filter(a =>
      acquireTypes.has(a.type) && (a.details as any)?.dealStructure === 'rollover_equity'
    ).length;

    // Strategy archetype heuristic
    const activeCount = businesses.filter(b => b.status === 'active').length;
    const platformCount = integratedPlatforms.length;
    const archetype = computeArchetype(activeCount, platformCount, totalAcquisitions, totalSells, turnaroundsStarted, totalDistributions, equityRaisesUsed);

    // Anti-patterns
    const antiPatterns: string[] = [];
    if (peakLeverage > 6) antiPatterns.push('over_leveraged');
    if (hasRestructured) antiPatterns.push('serial_restructurer');
    if (equityRaisesUsed >= 4) antiPatterns.push('dilution_spiral');
    if (totalDistributions === 0 && maxRounds >= 10) antiPatterns.push('no_distributions');
    if (turnaroundsFailed >= 3) antiPatterns.push('turnaround_graveyard');
    if (totalAcquisitions >= 8 && sectorIds.length >= 5) antiPatterns.push('spray_and_pray');

    // Sophistication score (0-100)
    let sophisticationScore = 0;
    if (platformCount > 0) sophisticationScore += 15;
    if (turnaroundsStarted > 0) sophisticationScore += 10;
    if (state.maSourcing.tier >= 2) sophisticationScore += 10;
    if (sharedServicesActive >= 2) sophisticationScore += 10;
    if (rolloverEquityCount > 0) sophisticationScore += 10;
    if (totalSells >= 2) sophisticationScore += 10;
    if (totalDistributions > 0) sophisticationScore += 10;
    if (equityRaisesUsed > 0 && equityRaisesUsed <= 2) sophisticationScore += 5;
    if (activeCount >= 3 && sectorIds.length <= 2) sophisticationScore += 10; // sector focus
    if (score.total >= 60) sophisticationScore += 10;
    sophisticationScore = Math.min(100, sophisticationScore);

    const snapshot: GameCompleteSnapshot = {
      round: maxRounds,
      maxRounds,
      difficulty,
      duration,
      sector,
      grade: score.grade,
      fev: Math.round(founderEquityValue),
      isChallenge: !!challengeData,
      score: score.total,
      scoreBreakdown: {
        valueCreation: score.valueCreation,
        fcfShareGrowth: score.fcfShareGrowth,
        portfolioRoic: score.portfolioRoic,
        capitalDeployment: score.capitalDeployment,
        balanceSheetHealth: score.balanceSheetHealth,
        strategicDiscipline: score.strategicDiscipline,
      },
      businessCount: activeCount,
      totalAcquisitions,
      totalSells,
      totalDistributions,
      totalBuybacks,
      equityRaisesUsed,
      peakLeverage: Math.round(peakLeverage * 10) / 10,
      hasRestructured,
      peakDistressLevel,
      platformsForged: platformCount,
      turnaroundsStarted,
      turnaroundsSucceeded,
      turnaroundsFailed,
      sharedServicesActive,
      maSourcingTier: state.maSourcing.tier,
      sectorIds,
      dealStructureTypes: Object.keys(dealStructureTypes).length > 0 ? dealStructureTypes : undefined,
      rolloverEquityCount,
      strategyArchetype: archetype,
      antiPatterns: antiPatterns.length > 0 ? antiPatterns : undefined,
      sophisticationScore,
    };
    trackGameComplete(snapshot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deduplicate: exitedBusinesses wins over businesses (a sold biz exists in both)
  // Filter out 'integrated' status (bolt-ons are folded into platform EBITDA)
  const allBusinesses = useMemo(() => {
    const exitedIds = new Set(exitedBusinesses.map(b => b.id));
    return [
      ...exitedBusinesses.filter(b => b.status !== 'integrated' && b.status !== 'merged' && !b.parentPlatformId),
      ...businesses.filter(b => !exitedIds.has(b.id) && b.status !== 'integrated' && b.status !== 'merged' && !b.parentPlatformId),
    ];
  }, [businesses, exitedBusinesses]);
  const activeBusinesses = useMemo(
    () => businesses.filter(b => b.status === 'active'),
    [businesses]
  );
  const difficultyMultiplier = DIFFICULTY_CONFIG[difficulty]?.leaderboardMultiplier ?? 1.0;
  const restructuringMultiplier = hasRestructured ? RESTRUCTURING_FEV_PENALTY : 1.0;
  const adjustedFEV = Math.round(founderEquityValue * difficultyMultiplier * restructuringMultiplier);
  const canMakeLeaderboard = wouldMakeLeaderboardFromList(leaderboard, adjustedFEV);
  const potentialRank = getLeaderboardRankFromList(leaderboard, adjustedFEV);

  // Memoize per-business exit valuations — each calls calculateExitValuation with premium/buyer-pool logic
  const fevBreakdown = useMemo(() => {
    const currentOwnership = sharesOutstanding > 0 ? founderShares / sharesOutstanding : 1;
    const opcoDebt = activeBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
    const businessValues = activeBusinesses.map(business => {
      const valuation = calculateExitValuation(business, maxRounds, undefined, undefined, integratedPlatforms);
      const value = Math.round(business.ebitda * valuation.totalMultiple);
      const totalInvested = business.totalAcquisitionCost || business.acquisitionPrice;
      const moic = totalInvested > 0 ? value / totalInvested : 0;
      return { business, valuation, value, totalInvested, moic };
    }).sort((a, b) => b.value - a.value);
    const portfolioValue = businessValues.reduce((sum, bv) => sum + bv.value, 0);
    const totalEbitda = activeBusinesses.reduce((sum, b) => sum + b.ebitda, 0);
    const blendedMultiple = totalEbitda > 0 ? portfolioValue / totalEbitda : 0;
    const hypotheticalFEV = Math.round(enterpriseValue * initialOwnershipPct);
    return { currentOwnership, opcoDebt, portfolioValue, blendedMultiple, hypotheticalFEV };
  }, [activeBusinesses, sharesOutstanding, founderShares, maxRounds, enterpriseValue, initialOwnershipPct]);

  // Load global leaderboard on mount
  useEffect(() => {
    let cancelled = false;
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    loadLeaderboard()
      .then(entries => {
        if (!cancelled) {
          setLeaderboard(entries);
          setLeaderboardLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaderboardError(true);
          setLeaderboardLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const handleRetryLeaderboard = () => {
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    loadLeaderboard()
      .then(entries => {
        setLeaderboard(entries);
        setLeaderboardLoading(false);
      })
      .catch(() => {
        setLeaderboardError(true);
        setLeaderboardLoading(false);
      });
  };

  const handleSaveScore = async () => {
    if (initials.length < 2 || hasSaved || saving) return;

    setSaving(true);
    try {
      const entry = await saveToLeaderboard(
        {
          holdcoName,
          initials: initials.toUpperCase(),
          enterpriseValue,
          score: score.total,
          grade: score.grade,
          businessCount: activeBusinesses.length,
        },
        {
          totalRounds: maxRounds,
          totalInvestedCapital,
          totalRevenue: metrics.totalRevenue,
          avgEbitdaMargin: metrics.avgEbitdaMargin,
          difficulty,
          duration,
          founderEquityValue,
          founderPersonalWealth,
          hasRestructured,
          submittedMultiplier: difficultyMultiplier,
        }
      );

      setSavedEntryId(entry.id);
      setHasSaved(true);

      // Optimistically insert the new entry into the leaderboard so it shows
      // immediately, even if the GET endpoint returns cached (stale) data.
      const fullEntry: LeaderboardEntry = {
        ...entry,
        founderEquityValue,
        founderPersonalWealth,
        difficulty,
        duration,
        hasRestructured,
        submittedMultiplier: difficultyMultiplier,
      };
      setLeaderboard(prev => {
        // Avoid duplicates if the entry is somehow already present
        const without = prev.filter(e => e.id !== entry.id);
        return [...without, fullEntry];
      });

      // Background re-fetch with cache-bust to eventually get accurate server data
      loadLeaderboard().then(updated => {
        // Merge: ensure our new entry is present even if cache is stale
        const hasEntry = updated.some(e => e.id === entry.id);
        setLeaderboard(hasEntry ? updated : [...updated, fullEntry]);
      }).catch(() => { /* keep optimistic state */ });
    } finally {
      setSaving(false);
    }
  };

  const gradeColor = getGradeColor(score.grade);

  const getGradeEmoji = () => {
    switch (score.grade) {
      case 'S': return '🏆';
      case 'A': return '🥇';
      case 'B': return '🥈';
      case 'C': return '🥉';
      case 'D': return '📚';
      case 'F': return '💥';
      default: return '📊';
    }
  };

  const ScoreBar = ({ label, value, max }: { label: string; value: number; max: number }) => (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-3 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-secondary transition-all duration-1000"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-4xl mx-auto">
      {/* Bankruptcy Header (replaces normal header) */}
      {bankruptRound ? (
        <div className="text-center mb-8">
          <span className="text-6xl mb-4 block">💀</span>
          <h1 className="text-3xl font-bold mb-2">{holdcoName}</h1>
          <div className="text-7xl font-bold mb-2 text-red-500">
            BANKRUPT
          </div>
          <p className="text-xl text-red-400">
            Filed for bankruptcy in Year {bankruptRound}
          </p>
          {(difficulty || duration) && (
            <div className="flex justify-center gap-2 mt-3">
              <span className={`text-xs px-2 py-0.5 rounded ${difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
                {difficulty === 'normal' ? 'Hard' : 'Easy'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-secondary">
                {maxRounds}yr
              </span>
            </div>
          )}

          <div className="card mt-6 bg-red-900/20 border-red-500/30">
            <p className="text-text-secondary">
              {(() => {
                const activeCount = businesses.filter(b => b.status === 'active').length;
                const intrinsicValue = metrics.intrinsicValuePerShare * sharesOutstanding;
                if (activeCount === 0 && cash <= 0) {
                  return 'With no portfolio businesses and no capital to rebuild, your holding company was dissolved.';
                }
                if (intrinsicValue <= 0 && hasRestructured) {
                  return "Your holding company's equity value was completely wiped out. With no remaining value for shareholders, the company was declared insolvent.";
                }
                return "Your holding company couldn't service its debt obligations and was forced into bankruptcy. All equity value was wiped out.";
              })()}
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-text-muted text-sm">Final Debt</p>
                <p className="text-2xl font-bold font-mono text-red-400">{formatMoney(metrics.totalDebt)}</p>
              </div>
              <div>
                <p className="text-text-muted text-sm">Peak Leverage</p>
                <p className="text-2xl font-bold font-mono text-red-400">
                  {formatMultiple(Math.max(...metricsHistory.map(h => h.metrics.netDebtToEbitda), metrics.netDebtToEbitda))}
                </p>
              </div>
            </div>
          </div>

          <button onClick={onPlayAgain} className="btn-primary text-lg py-3 mt-6 w-full">
            Play Again
          </button>
        </div>
      ) : (
      /* Normal Header */
      <div className="text-center mb-8">
        <span className="text-6xl mb-4 block">{getGradeEmoji()}</span>
        <h1 className="text-3xl font-bold mb-2">{holdcoName}</h1>
        <div className={`text-7xl font-bold mb-2 ${gradeColor}`}>
          {score.grade}
        </div>
        <p className="text-xl text-text-secondary">{score.title}</p>
        {(difficulty || duration) && (
          <div className="flex justify-center gap-2 mt-3">
            <span className={`text-xs px-2 py-0.5 rounded ${difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
              {difficulty === 'normal' ? 'Hard' : 'Easy'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-secondary">
              {maxRounds}yr
            </span>
          </div>
        )}
        <button onClick={onPlayAgain} className="btn-primary text-lg py-3 mt-6 w-full">
          Play Again
        </button>
      </div>
      )}

      {/* Founder Equity Value - Hero Display */}
      <div className={`card mb-6 bg-gradient-to-r ${hasRestructured ? 'from-red-900/20 to-orange-900/20 border-red-500/30' : 'from-accent/20 to-accent-secondary/20 border-accent/30'}`}>
        <div className="text-center">
          <p className="text-text-muted text-sm mb-1">
            Founder Equity Value
            {hasRestructured && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 border border-red-500/50 text-red-400" title="Your FEV has been reduced by 20% due to financial restructuring.">
                -20% Restructuring
              </span>
            )}
          </p>
          {hasRestructured ? (
            <div className="mb-2">
              <p className="text-lg font-mono text-text-muted line-through">{formatMoney(founderEquityValue)}</p>
              <p className="text-3xl sm:text-5xl font-bold font-mono text-red-400">
                {formatMoney(adjustedFEV)}
              </p>
            </div>
          ) : (
            <p className="text-3xl sm:text-5xl font-bold font-mono text-accent mb-2">
              {formatMoney(founderEquityValue)}
            </p>
          )}
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-6 mt-3">
            <div>
              <p className="text-text-muted text-xs">Enterprise Value</p>
              <p className="font-mono text-text-secondary">{formatMoney(enterpriseValue)}</p>
            </div>
            {founderPersonalWealth > 0 && (
              <div>
                <p className="text-text-muted text-xs">Personal Wealth</p>
                <p className="font-mono text-text-secondary">{formatMoney(founderPersonalWealth)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FEV / EV Breakdown */}
      {!bankruptRound && (() => {
        const { currentOwnership, opcoDebt, portfolioValue, blendedMultiple, hypotheticalFEV } = fevBreakdown;

        return (
          <div className="card mb-6">
            <h2 className="text-lg font-bold mb-4">FEV / EV Breakdown</h2>

            {/* EV Waterfall */}
            <div className="space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Portfolio Value <span className="text-xs">({formatMultiple(blendedMultiple)} blended)</span></span>
                <span className="font-mono">{formatMoney(portfolioValue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">+ Cash</span>
                <span className="font-mono">{formatMoney(cash)}</span>
              </div>
              {totalDebt > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">- {EV_WATERFALL_LABELS.bankDebt}</span>
                  <span className="font-mono text-danger">({formatMoney(totalDebt)})</span>
                </div>
              )}
              {opcoDebt > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">- {EV_WATERFALL_LABELS.sellerNotes}</span>
                  <span className="font-mono text-danger">({formatMoney(opcoDebt)})</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
                <span>= Enterprise Value</span>
                <span className="font-mono">{formatMoney(enterpriseValue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">x Your Ownership ({(currentOwnership * 100).toFixed(1)}%)</span>
                <span className="font-mono"></span>
              </div>
              <div className="flex justify-between text-sm font-bold text-accent">
                <span>= Raw FEV</span>
                <span className="font-mono">{formatMoney(founderEquityValue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">x Difficulty ({formatMultiple(difficultyMultiplier)})</span>
                <span className="font-mono">{formatMoney(Math.round(founderEquityValue * difficultyMultiplier))}</span>
              </div>
              {hasRestructured && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-400">x Restructuring (-20%)</span>
                  <span className="font-mono text-red-400">-{formatMoney(Math.round(founderEquityValue * difficultyMultiplier) - adjustedFEV)}</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold">
                <span>= Adjusted FEV</span>
                <span className={`font-mono ${hasRestructured ? 'text-red-400' : 'text-accent'}`}>{formatMoney(adjustedFEV)}</span>
              </div>
            </div>

            {/* Ownership Impact */}
            {currentOwnership < initialOwnershipPct - 0.001 && (
              <div className="p-3 bg-white/5 rounded text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-text-muted">Initial Ownership</span>
                  <span className="font-mono">{(initialOwnershipPct * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-text-muted">Final Ownership</span>
                  <span className="font-mono">{(currentOwnership * 100).toFixed(1)}%</span>
                </div>
                <p className="text-xs text-text-muted">
                  At {(initialOwnershipPct * 100).toFixed(0)}% ownership, FEV would be {formatMoney(hypotheticalFEV)} ({hypotheticalFEV > founderEquityValue ? '+' : ''}{formatMoney(hypotheticalFEV - founderEquityValue)})
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Save to Leaderboard */}
      {!hasSaved && !leaderboardLoading && canMakeLeaderboard && (
        <div className="card mb-6 border-yellow-400/30">
          <div className="text-center">
            <p className="text-yellow-400 font-bold mb-2">
              You made the leaderboard! (Rank #{potentialRank})
            </p>
            <p className="text-text-secondary text-sm mb-4">
              Enter your initials to save your score
            </p>
            <div className="flex items-center justify-center gap-4">
              <input
                type="text"
                value={initials}
                onChange={(e) => setInitials(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase())}
                placeholder="AAA"
                maxLength={4}
                className="w-20 sm:w-28 text-center text-2xl font-bold bg-white/10 border border-white/20 rounded-lg py-2 px-4 focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleSaveScore}
                disabled={initials.length < 2 || saving}
                className="btn-primary text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Score'}
              </button>
            </div>
          </div>
        </div>
      )}

      {hasSaved && (
        <div className="card mb-6 border-accent/30 text-center">
          <p className="text-accent font-bold">Score saved to global leaderboard!</p>
        </div>
      )}

      {/* Global Leaderboard */}
      <GameOverLeaderboard
        allEntries={leaderboard}
        loading={leaderboardLoading}
        error={leaderboardError}
        onRetry={handleRetryLeaderboard}
        savedEntryId={savedEntryId}
        activeTab={leaderboardTab}
        onTabChange={setLeaderboardTab}
        showWealth={leaderboardTab === 'distributions'}
      />

      {/* Challenge Scoreboard (auto-submit + live scoreboard for challenge games) */}
      {challengeData && !scoreboardFailed && (
        <>
          <ChallengeScoreboard
            challengeParams={currentChallengeParams}
            myResult={myResult}
            onFallbackToManual={() => setScoreboardFailed(true)}
          />
          {/* Sharing buttons for challenge games */}
          <div className="card mb-6 border-accent/20">
            <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
              <span>🔗</span> Share
            </h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleShareScoreboardLink}
                className="btn-primary flex-1 text-sm min-h-[44px]"
              >
                {scoreboardLinkCopied ? 'Copied!' : 'Copy Scoreboard Link'}
              </button>
              <button
                onClick={handleChallengeShare}
                className="btn-secondary flex-1 text-sm min-h-[44px]"
              >
                {challengeCopied ? 'Copied!' : 'Invite More Players'}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-2 text-center">
              Share the scoreboard so others can see results, or invite more players to compete
            </p>
          </div>
        </>
      )}

      {/* Challenge Friends (manual flow — shown for solo games, or as fallback when scoreboard fails) */}
      {(!challengeData || scoreboardFailed) && (
      <div className="card mb-6 border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5">
        <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
          <span>🏆</span> Challenge Friends
        </h2>
        {challengeData ? (
          <p className="text-sm text-yellow-400/80 mb-3">
            Challenge Mode — you and your friends played under identical conditions.
          </p>
        ) : (
          <p className="text-sm text-text-muted mb-3">
            Think you played well? Share this exact game — same deals, events, and market conditions — and see who builds a better holdco.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleChallengeShare}
            className="btn-primary flex-1 text-sm min-h-[44px]"
          >
            {challengeCopied ? 'Copied!' : 'Share Challenge Link'}
          </button>
          <button
            onClick={handleShareResult}
            className="btn-secondary flex-1 text-sm min-h-[44px]"
          >
            Share My Result
          </button>
        </div>
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-xs text-text-muted mb-2">How it works:</p>
          <ol className="text-xs text-text-muted space-y-1 list-decimal list-inside">
            <li>Share the challenge link — everyone gets the same deals and events</li>
            <li>After finishing, each player shares their result</li>
            <li>Click "Compare" and paste your opponents' results to see who won</li>
          </ol>
        </div>
        <button
          onClick={() => setShowComparison(true)}
          className="mt-3 min-h-[44px] text-xs text-accent hover:text-accent/80 transition-colors w-full text-center flex items-center justify-center"
        >
          Compare Results
        </button>
      </div>
      )}

      {/* Score Breakdown */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-4">Score Breakdown</h2>
        <ScoreBar label="Value Creation (FEV / Capital)" value={score.valueCreation} max={20} />
        <ScoreBar label="FCF/Share Growth" value={score.fcfShareGrowth} max={20} />
        <ScoreBar label="Portfolio ROIC" value={score.portfolioRoic} max={15} />
        <ScoreBar label="Capital Deployment (MOIC + ROIIC)" value={score.capitalDeployment} max={15} />
        <ScoreBar label="Balance Sheet Health" value={score.balanceSheetHealth} max={15} />
        <ScoreBar label="Strategic Discipline" value={score.strategicDiscipline} max={15} />
        <div className="mt-4 pt-4 border-t border-white/10 text-center">
          <span className="text-2xl font-bold font-mono">{score.total} / 100</span>
        </div>
      </div>

      {/* Final Metrics */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-4">Final Portfolio Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 text-center">
          <div>
            <p className="text-text-muted text-sm">Total Revenue</p>
            <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(metrics.totalRevenue)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Final EBITDA <span className="text-xs">({(metrics.avgEbitdaMargin * 100).toFixed(0)}%)</span></p>
            <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(metrics.totalEbitda)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Portfolio MOIC</p>
            <p className="text-xl sm:text-2xl font-bold font-mono text-accent">{formatMultiple(metrics.portfolioMoic)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Total Distributed</p>
            <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(metrics.totalDistributions)}</p>
          </div>
          <div>
            <p className="text-text-muted text-sm">Exit Proceeds</p>
            <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(metrics.totalExitProceeds)}</p>
          </div>
        </div>
      </div>

      {/* Portfolio */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-1">Portfolio Companies</h2>
        <p className="text-xs text-text-muted mb-4">Platforms and standalone companies. Bolt-ons are consolidated into their parent platform.</p>
        <div className="space-y-2">
          {allBusinesses.map(business => {
            const sector = SECTORS[business.sectorId];
            const totalInvested = business.totalAcquisitionCost || business.acquisitionPrice;
            let exitValue: number;
            let exitMultiple: number | null = null;
            if (business.status === 'sold') {
              exitValue = business.exitPrice || 0;
            } else {
              const valuation = calculateExitValuation(business, maxRounds, undefined, undefined, integratedPlatforms);
              exitMultiple = valuation.totalMultiple;
              exitValue = Math.round(business.ebitda * valuation.totalMultiple);
            }
            const moic = totalInvested > 0 ? exitValue / totalInvested : 0;

            return (
              <div
                key={business.id}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xl shrink-0">{sector.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{business.name}</p>
                    <p className="text-xs text-text-muted">{sector.name}</p>
                  </div>
                </div>
                {/* Mobile: compact data */}
                <div className="flex sm:hidden items-center gap-3 text-right shrink-0">
                  <div>
                    <p className="font-mono tabular-nums text-sm">{formatMoney(exitValue)}</p>
                    <p className={`text-xs font-mono tabular-nums ${moic >= 2 ? 'text-accent' : moic < 1 ? 'text-danger' : 'text-text-muted'}`}>
                      {formatMultiple(moic)}
                    </p>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    business.status === 'active' ? 'bg-accent/20 text-accent' :
                    business.status === 'sold' ? 'bg-blue-500/20 text-blue-400' :
                    business.status === 'merged' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-danger/20 text-danger'
                  }`}>
                    {business.status === 'active' ? '●' :
                    business.status === 'sold' ? '✓' :
                    business.status === 'merged' ? '⇄' : '✕'}
                  </span>
                </div>
                {/* Desktop: full data */}
                <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
                  <div className="w-20">
                    <p className="text-xs text-text-muted">EBITDA</p>
                    <p className="font-mono tabular-nums">{formatMoney(business.ebitda)}</p>
                  </div>
                  <div className="w-24">
                    <p className="text-xs text-text-muted">Est. Exit Value</p>
                    <p className="font-mono tabular-nums font-bold">{formatMoney(exitValue)}</p>
                    {exitMultiple !== null && (
                      <p className="text-xs text-text-muted font-mono tabular-nums">({formatMultiple(exitMultiple)})</p>
                    )}
                  </div>
                  <div className="w-14">
                    <p className="text-xs text-text-muted">MOIC</p>
                    <p className={`font-mono tabular-nums ${moic >= 2 ? 'text-accent' : moic < 1 ? 'text-danger' : ''}`}>
                      {formatMultiple(moic)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded w-20 text-center ${
                    business.status === 'active' ? 'bg-accent/20 text-accent' :
                    business.status === 'sold' ? 'bg-blue-500/20 text-blue-400' :
                    business.status === 'merged' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-danger/20 text-danger'
                  }`}>
                    {business.status === 'active' ? 'Active' :
                     business.status === 'sold' ? 'Sold' :
                     business.status === 'merged' ? 'Merged' :
                     'Wound Down'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Analysis */}
      <AIAnalysisSection
        holdcoName={holdcoName}
        score={score}
        enterpriseValue={enterpriseValue}
        businesses={businesses}
        exitedBusinesses={exitedBusinesses}
        metricsHistory={metricsHistory}
        totalDistributions={totalDistributions}
        totalBuybacks={totalBuybacks}
        totalInvestedCapital={totalInvestedCapital}
        equityRaisesUsed={equityRaisesUsed}
        sharedServicesActive={sharedServicesActive}
        maxRounds={maxRounds}
        difficulty={difficulty}
        founderEquityValue={founderEquityValue}
        founderOwnership={enterpriseValue > 0 ? founderEquityValue / enterpriseValue : 1}
      />

      {/* Actions */}
      <div className="flex flex-col gap-4">
        <button onClick={onPlayAgain} className="btn-primary text-lg py-4">
          Play Again
        </button>
        <a
          href="https://holdcoguide.com"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-center text-lg py-4"
        >
          Get The Holdco Guide →
        </a>
      </div>

      {/* Challenge Comparison Modal */}
      {showComparison && (
        <ChallengeComparison
          challengeParams={currentChallengeParams}
          myResult={myResult}
          initialOpponentResult={incomingResult}
          onClose={() => setShowComparison(false)}
        />
      )}

      {/* Footer */}
      <p className="text-center text-text-muted text-sm mt-8">
        Holdco Tycoon - Based on <em>The Holdco Guide</em> by Peter Kang
      </p>
    </div>
  );
}

// --- Tabbed leaderboard for GameOverScreen ---

function GameOverLeaderboard({
  allEntries,
  loading,
  error,
  onRetry,
  savedEntryId,
  activeTab,
  onTabChange,
  showWealth,
}: {
  allEntries: LeaderboardEntry[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  savedEntryId: string | null;
  activeTab: LeaderboardTab;
  onTabChange: (tab: LeaderboardTab) => void;
  showWealth: boolean;
}) {
  const filtered = useMemo(() => filterAndSort(allEntries, activeTab), [allEntries, activeTab]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <span>🌍</span> Global Leaderboard
      </h2>

      {/* Tab Bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-3 -mx-1 px-1 scrollbar-hide">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap text-sm min-h-[36px] ${
              activeTab === tab.id
                ? 'bg-accent text-bg-primary font-medium'
                : 'text-text-muted hover:text-text-primary hover:bg-white/5'
            }`}
          >
            <span className="sm:hidden">{tab.mobileLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-6">
          <p className="text-text-muted mb-3">Failed to load leaderboard</p>
          <button onClick={onRetry} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center text-text-muted py-6">
          <p>No scores yet{activeTab !== 'overall' ? ' in this category' : ''}. Be the first!</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filtered.map((entry, index) => {
            const displayValue = getDisplayValue(entry, activeTab);
            const displayLabel = showWealth ? 'Wealth' : (entry.founderEquityValue ? 'FEV' : 'EV');
            return (
              <div
                key={entry.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  entry.id === savedEntryId
                    ? 'bg-accent/20 border border-accent/40'
                    : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className={`text-lg font-bold tabular-nums w-10 text-center inline-block ${getRankColor(index + 1)}`}>
                    #{index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold">{entry.initials}</p>
                    <p className="text-xs text-text-muted truncate">{entry.holdcoName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:gap-6 text-right shrink-0">
                  <div className="min-w-[4.5rem]">
                    <p className="text-xs text-text-muted">{displayLabel}</p>
                    <p className="font-mono tabular-nums font-bold text-accent">
                      {formatMoney(displayValue)}
                      {entry.hasRestructured && <span className="text-red-400 text-[10px] ml-1" title="Restructured — 20% FEV penalty">(R)</span>}
                    </p>
                  </div>
                  <div className="min-w-[3.5rem]">
                    <p className="text-xs text-text-muted">Score</p>
                    <p className={`font-mono tabular-nums ${getGradeColor(entry.grade)}`}>{entry.score} ({entry.grade})</p>
                  </div>
                  <div className="w-8 flex justify-center">
                    {entry.difficulty ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.difficulty === 'normal' ? 'bg-orange-500/20 text-orange-400' : 'bg-accent/20 text-accent'}`}>
                        {entry.difficulty === 'normal' ? 'H' : 'E'}{entry.duration === 'quick' ? '/10' : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-text-muted hidden sm:block w-20">
                    {formatDate(entry.date)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
