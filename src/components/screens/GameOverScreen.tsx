import { useState, useEffect, useMemo } from 'react';
import { ScoreBreakdown, PostGameInsight, Business, Metrics, LeaderboardEntry, formatMoney, formatMultiple, HistoricalMetrics, GameDifficulty, GameDuration, IntegratedPlatform, PEScoreBreakdown, CarryWaterfall, LPComment } from '../../engine/types';
import type { IPOState } from '../../engine/types';
import { calculatePublicCompanyBonus } from '../../engine/ipo';
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
import { FeedbackModal } from '../ui/FeedbackModal';
import { useAuthStore, useIsLoggedIn } from '../../hooks/useAuth';

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
  ipoState?: IPOState | null;
  challengeData?: ChallengeParams | null;
  incomingResult?: PlayerResult | null;
  isFundManagerMode?: boolean;
  fundName?: string;
  peScore?: PEScoreBreakdown | null;
  carryWaterfall?: CarryWaterfall | null;
  lpCommentary?: LPComment[];
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
  ipoState,
  challengeData,
  incomingResult,
  isFundManagerMode = false,
  fundName,
  peScore,
  carryWaterfall: carryWaterfallData,
  lpCommentary,
  onPlayAgain,
}: GameOverScreenProps) {
  const familyOfficeState = useGameStore(s => s.familyOfficeState);
  const isLoggedIn = useIsLoggedIn();
  const { signupNudgeDismissals, incrementNudgeDismissals, openAccountModal } = useAuthStore();
  const [nudgeDismissedThisSession, setNudgeDismissedThisSession] = useState(false);

  const [initials, setInitials] = useState('');
  const [hasSaved, setHasSaved] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>(isFundManagerMode ? 'pe' : 'overall');
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [scoreboardLinkCopied, setScoreboardLinkCopied] = useState(false);
  const [showComparison, setShowComparison] = useState(!!incomingResult);
  const [scoreboardFailed, setScoreboardFailed] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  // Carry waterfall step progression (fund mode)
  const [waterfallStep, setWaterfallStep] = useState(0);
  const maxWaterfallSteps = carryWaterfallData?.hurdleCleared ? 6 : 4; // Skip carry + what-if if below hurdle

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

  // foEligibility removed — FO unlock/in-progress cards moved to App.tsx bridge screen

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

  // Strategy data — shared by telemetry + leaderboard save
  const strategyData = useMemo(() => {
    const state = useGameStore.getState();
    const allActions = state.roundHistory.flatMap(r => r.actions);

    const acquireTypes = new Set(['acquire', 'acquire_tuck_in']);
    const sellTypes = new Set(['sell', 'sell_platform', 'accept_offer']);
    const totalAcquisitions = allActions.filter(a => acquireTypes.has(a.type)).length;
    const totalSells = allActions.filter(a => sellTypes.has(a.type)).length;
    const turnaroundsStarted = allActions.filter(a => a.type === 'start_turnaround').length;

    const resolvedTurnarounds = allActions.filter(a => a.type === 'turnaround_resolved');
    const turnaroundsSucceeded = resolvedTurnarounds.filter(a => (a.details as any)?.outcome === 'success').length;
    const turnaroundsFailed = resolvedTurnarounds.filter(a => (a.details as any)?.outcome !== 'success').length;

    const peakLeverage = metricsHistory.length > 0
      ? Math.max(...metricsHistory.map(m => m.metrics.netDebtToEbitda))
      : 0;

    const distressMap: Record<string, number> = { comfortable: 0, elevated: 1, stressed: 2, breach: 3 };
    const peakDistressLevel = metricsHistory.length > 0
      ? Math.max(...metricsHistory.map(m => distressMap[m.metrics.distressLevel] ?? 0))
      : 0;

    const allBiz = [...businesses, ...exitedBusinesses];
    const sectorIds = [...new Set(allBiz.map(b => b.sectorId))];

    const dealStructureTypes: Record<string, number> = {};
    for (const a of allActions) {
      if (acquireTypes.has(a.type) && (a.details as any)?.dealStructure) {
        const st = String((a.details as any).dealStructure);
        dealStructureTypes[st] = (dealStructureTypes[st] || 0) + 1;
      }
    }

    const rolloverEquityCount = allActions.filter(a =>
      acquireTypes.has(a.type) && (a.details as any)?.dealStructure === 'rollover_equity'
    ).length;

    const activeCount = businesses.filter(b => b.status === 'active').length;
    const platformCount = integratedPlatforms.length;
    const archetype = computeArchetype(activeCount, platformCount, totalAcquisitions, totalSells, turnaroundsStarted, totalDistributions, equityRaisesUsed);

    const antiPatterns: string[] = [];
    if (peakLeverage > 6) antiPatterns.push('over_leveraged');
    if (hasRestructured) antiPatterns.push('serial_restructurer');
    if (equityRaisesUsed >= 4) antiPatterns.push('dilution_spiral');
    if (totalDistributions === 0 && maxRounds >= 10) antiPatterns.push('no_distributions');
    if (turnaroundsFailed >= 3) antiPatterns.push('turnaround_graveyard');
    if (totalAcquisitions >= 8 && sectorIds.length >= 5) antiPatterns.push('spray_and_pray');

    let sophisticationScore = 0;
    if (platformCount > 0) sophisticationScore += 15;
    if (turnaroundsStarted > 0) sophisticationScore += 10;
    if (state.maSourcing.tier >= 2) sophisticationScore += 10;
    if (sharedServicesActive >= 2) sophisticationScore += 10;
    if (rolloverEquityCount > 0) sophisticationScore += 10;
    if (totalSells >= 2) sophisticationScore += 10;
    if (totalDistributions > 0) sophisticationScore += 10;
    if (equityRaisesUsed > 0 && equityRaisesUsed <= 2) sophisticationScore += 5;
    if (activeCount >= 3 && sectorIds.length <= 2) sophisticationScore += 10;
    if (score.total >= 60) sophisticationScore += 10;
    sophisticationScore = Math.min(100, sophisticationScore);

    const activeBiz = businesses.filter(b => b.status === 'active');
    const endingSubTypes: Record<string, number> = {};
    for (const b of activeBiz) {
      const key = `${b.sectorId}:${b.subType}`;
      endingSubTypes[key] = (endingSubTypes[key] || 0) + 1;
    }
    const avgEndingEbitda = activeBiz.length > 0
      ? Math.round(activeBiz.reduce((s, b) => s + b.ebitda, 0) / activeBiz.length)
      : 0;
    const endingConstruction: Record<string, number> = {};
    for (const b of activeBiz) {
      if (b.isPlatform) {
        endingConstruction['roll_up'] = (endingConstruction['roll_up'] || 0) + 1;
      } else {
        endingConstruction['standalone'] = (endingConstruction['standalone'] || 0) + 1;
      }
    }
    if (integratedPlatforms.length > 0) {
      endingConstruction['integrated_platform'] = integratedPlatforms.length;
    }

    const sourceDealUses = allActions.filter(a => a.type === 'source_deals').length;
    const proactiveOutreachUses = allActions.filter(a => a.type === 'proactive_outreach').length;
    const smbBrokerUses = allActions.filter(a => a.type === 'smb_broker').length;

    return {
      totalAcquisitions, totalSells, turnaroundsStarted, turnaroundsSucceeded, turnaroundsFailed,
      peakLeverage, peakDistressLevel, sectorIds, dealStructureTypes, rolloverEquityCount,
      activeCount, platformCount, archetype, antiPatterns, sophisticationScore,
      endingSubTypes, avgEndingEbitda, endingConstruction,
      maSourcingTier: state.maSourcing.tier,
      sourceDealUses, proactiveOutreachUses, smbBrokerUses,
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire telemetry on game completion — full snapshot
  useEffect(() => {
    const sector = businesses[0]?.sectorId || exitedBusinesses[0]?.sectorId || 'agency';

    const snapshot: GameCompleteSnapshot = {
      round: maxRounds,
      maxRounds,
      difficulty,
      duration,
      sector,
      grade: isFundManagerMode ? (peScore?.grade ?? 'F') : score.grade,
      fev: Math.round(founderEquityValue),
      isChallenge: !!challengeData,
      score: isFundManagerMode ? (peScore?.total ?? 0) : score.total,
      scoreBreakdown: {
        valueCreation: score.valueCreation,
        fcfShareGrowth: score.fcfShareGrowth,
        portfolioRoic: score.portfolioRoic,
        capitalDeployment: score.capitalDeployment,
        balanceSheetHealth: score.balanceSheetHealth,
        strategicDiscipline: score.strategicDiscipline,
      },
      businessCount: strategyData.activeCount,
      totalAcquisitions: strategyData.totalAcquisitions,
      totalSells: strategyData.totalSells,
      totalDistributions,
      totalBuybacks,
      equityRaisesUsed,
      peakLeverage: Math.round(strategyData.peakLeverage * 10) / 10,
      hasRestructured,
      peakDistressLevel: strategyData.peakDistressLevel,
      platformsForged: strategyData.platformCount,
      turnaroundsStarted: strategyData.turnaroundsStarted,
      turnaroundsSucceeded: strategyData.turnaroundsSucceeded,
      turnaroundsFailed: strategyData.turnaroundsFailed,
      sharedServicesActive,
      maSourcingTier: strategyData.maSourcingTier,
      sectorIds: strategyData.sectorIds,
      dealStructureTypes: Object.keys(strategyData.dealStructureTypes).length > 0 ? strategyData.dealStructureTypes : undefined,
      rolloverEquityCount: strategyData.rolloverEquityCount,
      strategyArchetype: strategyData.archetype,
      antiPatterns: strategyData.antiPatterns.length > 0 ? strategyData.antiPatterns : undefined,
      sophisticationScore: strategyData.sophisticationScore,
      endingSubTypes: Object.keys(strategyData.endingSubTypes).length > 0 ? strategyData.endingSubTypes : undefined,
      avgEndingEbitda: strategyData.avgEndingEbitda > 0 ? strategyData.avgEndingEbitda : undefined,
      endingConstruction: Object.keys(strategyData.endingConstruction).length > 0 ? strategyData.endingConstruction : undefined,
      sourceDealUses: strategyData.sourceDealUses || undefined,
      proactiveOutreachUses: strategyData.proactiveOutreachUses || undefined,
      smbBrokerUses: strategyData.smbBrokerUses || undefined,
      // PE Fund Mode fields
      ...(isFundManagerMode ? {
        gameMode: 'fund_manager',
        isFundManager: true,
        netIrr: carryWaterfallData?.netIrr,
        grossMoic: carryWaterfallData?.grossMoic,
        carryEarned: carryWaterfallData?.carry,
        dpi: carryWaterfallData?.dpi,
      } : {}),
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
  const foMultiplier = familyOfficeState?.foMultiplier ?? 1.0;
  const adjustedFEV = Math.round(founderEquityValue * difficultyMultiplier * restructuringMultiplier * foMultiplier);
  const peEntries = leaderboard.filter(e => e.isFundManager);
  const myCarry = carryWaterfallData?.carry ?? 0;
  const canMakeLeaderboard = isFundManagerMode
    ? (peEntries.length < 50 || myCarry > Math.min(...peEntries.map(e => e.carryEarned ?? 0)))
    : wouldMakeLeaderboardFromList(leaderboard, adjustedFEV);
  const potentialRank = isFundManagerMode
    ? peEntries.filter(e => (e.carryEarned ?? 0) > myCarry).length + 1
    : getLeaderboardRankFromList(leaderboard, adjustedFEV);

  // Memoize per-business exit valuations — each calls calculateExitValuation with premium/buyer-pool logic
  const fevBreakdown = useMemo(() => {
    const currentOwnership = sharesOutstanding > 0 ? founderShares / sharesOutstanding : 1;
    const opcoDebt = activeBusinesses.reduce((sum, b) => sum + b.sellerNoteBalance, 0);
    const businessValues = activeBusinesses.map(business => {
      const valuation = calculateExitValuation(business, maxRounds, undefined, undefined, integratedPlatforms);
      const value = Math.round(business.ebitda * valuation.totalMultiple);
      const totalInvested = business.totalAcquisitionCost || business.acquisitionPrice;
      const moic = totalInvested > 0 ? value / totalInvested : 0; // EV MOIC (gross/gross)
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
    setSaveError(false);
    try {
      const entry = await saveToLeaderboard(
        {
          holdcoName: isFundManagerMode ? (fundName || 'PE Fund') : holdcoName,
          initials: initials.toUpperCase(),
          enterpriseValue,
          score: isFundManagerMode ? (peScore?.total ?? 0) : score.total,
          grade: isFundManagerMode ? (peScore?.grade ?? 'F') : score.grade,
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
          familyOfficeCompleted: !!familyOfficeState?.legacyScore,
          legacyGrade: familyOfficeState?.legacyScore?.grade,
          foMultiplier: foMultiplier > 1.0 ? foMultiplier : undefined,
          // PE Fund Manager fields
          isFundManager: isFundManagerMode || undefined,
          fundName: isFundManagerMode ? (fundName || 'PE Fund') : undefined,
          netIrr: isFundManagerMode ? carryWaterfallData?.netIrr : undefined,
          grossMoic: isFundManagerMode ? carryWaterfallData?.grossMoic : undefined,
          carryEarned: isFundManagerMode ? carryWaterfallData?.carry : undefined,
          strategy: {
            ...(isFundManagerMode ? { isFundManager: true, fundName: fundName || 'PE Fund' } : {}),
            scoreBreakdown: isFundManagerMode
              ? { valueCreation: 0, fcfShareGrowth: 0, portfolioRoic: 0, capitalDeployment: 0, balanceSheetHealth: 0, strategicDiscipline: 0 }
              : {
                  valueCreation: score.valueCreation,
                  fcfShareGrowth: score.fcfShareGrowth,
                  portfolioRoic: score.portfolioRoic,
                  capitalDeployment: score.capitalDeployment,
                  balanceSheetHealth: score.balanceSheetHealth,
                  strategicDiscipline: score.strategicDiscipline,
                },
            archetype: strategyData.archetype,
            sophisticationScore: strategyData.sophisticationScore,
            antiPatterns: strategyData.antiPatterns.length > 0 ? strategyData.antiPatterns : undefined,
            sectorIds: strategyData.sectorIds,
            dealStructureTypes: strategyData.dealStructureTypes,
            platformsForged: strategyData.platformCount,
            totalAcquisitions: strategyData.totalAcquisitions,
            totalSells: strategyData.totalSells,
            totalDistributions: Math.round(totalDistributions),
            totalBuybacks: Math.round(totalBuybacks),
            equityRaisesUsed,
            peakLeverage: Math.round(strategyData.peakLeverage * 10) / 10,
            turnaroundsStarted: strategyData.turnaroundsStarted,
            turnaroundsSucceeded: strategyData.turnaroundsSucceeded,
            turnaroundsFailed: strategyData.turnaroundsFailed,
            maSourcingTier: strategyData.maSourcingTier,
            sharedServicesActive,
            rolloverEquityCount: strategyData.rolloverEquityCount,
            sourceDealUses: strategyData.sourceDealUses || undefined,
            proactiveOutreachUses: strategyData.proactiveOutreachUses || undefined,
            smbBrokerUses: strategyData.smbBrokerUses || undefined,
          },
        }
      );

      if (entry._submitFailed) {
        setSaveError(true);
        setHasSaved(false);
        return;
      }

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
        familyOfficeCompleted: !!familyOfficeState?.legacyScore,
        legacyGrade: familyOfficeState?.legacyScore?.grade,
        foMultiplier: foMultiplier > 1.0 ? foMultiplier : undefined,
        ...(isFundManagerMode ? {
          isFundManager: true,
          fundName: fundName || 'PE Fund',
          netIrr: carryWaterfallData?.netIrr,
          grossMoic: carryWaterfallData?.grossMoic,
          carryEarned: carryWaterfallData?.carry,
        } : {}),
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
      {/* Fund Manager Mode: Bankruptcy */}
      {isFundManagerMode && bankruptRound ? (
        <div className="text-center mb-8">
          <span className="text-6xl mb-4 block">💀</span>
          <h1 className="text-3xl font-bold mb-2">{fundName || 'PE Fund'}</h1>
          <div className="text-7xl font-bold mb-2 text-red-500">FUND COLLAPSE</div>
          <p className="text-xl text-red-400">Your fund failed in Year {bankruptRound}</p>
          <div className="card mt-6 bg-red-900/20 border-red-500/30">
            <p className="text-text-secondary mb-4">Your fund couldn't meet its obligations. All LP capital is at risk.</p>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-text-muted text-sm">LP Capital Lost</p>
                <p className="text-2xl font-bold font-mono text-red-400">{formatMoney(100_000 - (cash > 0 ? cash : 0))}</p>
              </div>
              <div>
                <p className="text-text-muted text-sm">Gross MOIC</p>
                <p className="text-2xl font-bold font-mono text-red-400">{((cash > 0 ? cash : 0) / 100_000).toFixed(2)}x</p>
              </div>
            </div>
          </div>
          <button onClick={onPlayAgain} className="btn-primary text-lg py-3 mt-6 w-full">Play Again</button>
        </div>

      ) : isFundManagerMode && peScore && carryWaterfallData ? (
        /* Fund Manager Mode: Normal completion */
        <div className="mb-8">
          {/* Grade header */}
          <div className="text-center mb-6">
            <span className="text-6xl mb-4 block">{getGradeEmoji()}</span>
            <h1 className="text-3xl font-bold mb-2">{fundName || 'PE Fund'}</h1>
            <div className={`text-7xl font-bold mb-2 ${getGradeColor(peScore.grade)}`}>{peScore.grade}</div>
            <p className="text-xl text-text-secondary">{peScore.gradeTitle}</p>
            <div className="flex justify-center gap-2 mt-3">
              <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">Fund Manager</span>
              <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-secondary">10yr</span>
            </div>
          </div>

          {/* Carry Hero Number */}
          <div className="card mb-6 bg-gradient-to-r from-purple-500/10 to-purple-500/5 border-purple-500/30">
            <div className="text-center">
              <p className="text-text-muted text-sm mb-1">Carried Interest Earned</p>
              <p className="text-5xl font-bold font-mono text-purple-300">
                {carryWaterfallData.carry > 0 ? formatMoney(Math.round(carryWaterfallData.carry)) : '$0'}
              </p>
              {carryWaterfallData.carry > 0 && (
                <p className="text-sm text-text-muted mt-2">
                  Total GP Economics: {formatMoney(Math.round(carryWaterfallData.totalGpEconomics))} (carry + mgmt fees)
                </p>
              )}
              <div className="grid grid-cols-3 gap-4 mt-4 text-center">
                <div>
                  <p className="text-xs text-text-muted">Net IRR</p>
                  <p className="font-mono font-bold text-lg">{(carryWaterfallData.netIrr * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Gross MOIC</p>
                  <p className="font-mono font-bold text-lg">{carryWaterfallData.grossMoic.toFixed(2)}x</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">DPI</p>
                  <p className="font-mono font-bold text-lg">{carryWaterfallData.dpi.toFixed(2)}x</p>
                </div>
              </div>
            </div>
          </div>

          {/* Carry Waterfall Click-Through */}
          <div className="card mb-6 border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-purple-300">Carry Waterfall</h2>
              {waterfallStep < maxWaterfallSteps && (
                <button
                  onClick={() => setWaterfallStep(maxWaterfallSteps)}
                  className="text-xs text-text-muted hover:text-text-secondary"
                >
                  Show All
                </button>
              )}
            </div>
            <div className="space-y-3">
              {/* Step 1: Total Fund Value */}
              {waterfallStep >= 1 && (
                <div className="bg-white/5 rounded-lg p-3 border-l-2 border-purple-400">
                  <p className="text-sm font-medium mb-1">Step 1: Total Fund Value</p>
                  <p className="text-xs text-text-muted">Your fund generated {formatMoney(Math.round(carryWaterfallData.grossTotalReturns))} in total value over 10 years.</p>
                  <p className="text-xs text-text-muted">Distributed to LPs: {formatMoney(Math.round(carryWaterfallData.lpDistributions))} | At liquidation: {formatMoney(Math.round(carryWaterfallData.liquidationProceeds))}</p>
                </div>
              )}
              {/* Step 2: Return of Capital */}
              {waterfallStep >= 2 && (
                <div className="bg-white/5 rounded-lg p-3 border-l-2 border-purple-400">
                  <p className="text-sm font-medium mb-1">Step 2: Return of Capital</p>
                  <p className="text-xs text-text-muted">LPs get their {formatMoney(carryWaterfallData.returnOfCapital)} back first.</p>
                  <p className="text-xs text-text-muted">Profits: {formatMoney(Math.round(Math.max(0, carryWaterfallData.grossTotalReturns - carryWaterfallData.returnOfCapital)))}</p>
                </div>
              )}
              {/* Step 3: Preferred Return */}
              {waterfallStep >= 3 && (
                <div className={`bg-white/5 rounded-lg p-3 border-l-2 ${carryWaterfallData.hurdleCleared ? 'border-green-400' : 'border-red-400'}`}>
                  <p className="text-sm font-medium mb-1">Step 3: Preferred Return (The Hurdle)</p>
                  <p className="text-xs text-text-muted">LPs are entitled to 8% annually for 10 years = {formatMoney(Math.round(carryWaterfallData.hurdleAmount))}.</p>
                  {carryWaterfallData.hurdleCleared ? (
                    <p className="text-xs font-bold text-green-400">You CLEARED the hurdle by {formatMoney(Math.round(carryWaterfallData.aboveHurdle))}!</p>
                  ) : (
                    <p className="text-xs font-bold text-red-400">You did not clear the hurdle. Carried interest: $0.</p>
                  )}
                </div>
              )}
              {/* Step 4: Your Carry (only if hurdle cleared) */}
              {waterfallStep >= 4 && carryWaterfallData.hurdleCleared && (
                <div className="bg-purple-500/10 rounded-lg p-3 border-l-2 border-purple-400">
                  <p className="text-sm font-medium mb-1 text-purple-300">Step 4: Your Carry</p>
                  <p className="text-xs text-text-muted">20% of above-hurdle profits: {formatMoney(Math.round(carryWaterfallData.aboveHurdle))} x 20% = <span className="font-bold text-purple-300">{formatMoney(Math.round(carryWaterfallData.carry))}</span></p>
                  <p className="text-xs text-text-muted">Management fees earned: {formatMoney(Math.round(carryWaterfallData.managementFees))}</p>
                  <p className="text-xs font-bold text-purple-300">Total GP Economics: {formatMoney(Math.round(carryWaterfallData.totalGpEconomics))}</p>
                </div>
              )}
              {/* Step 5: What If? (only if hurdle cleared) */}
              {waterfallStep >= 5 && carryWaterfallData.hurdleCleared && (
                <div className="bg-white/5 rounded-lg p-3 border-l-2 border-white/20">
                  <p className="text-sm font-medium mb-1">Step 5: What If?</p>
                  <p className="text-xs text-text-muted">At 3.5x MOIC: Carry = {formatMoney(Math.round(Math.max(0, (350_000 - carryWaterfallData.hurdleAmount) * 0.20)))}</p>
                  <p className="text-xs text-text-muted">At 2.0x MOIC: Carry = {200_000 > carryWaterfallData.hurdleAmount ? formatMoney(Math.round((200_000 - carryWaterfallData.hurdleAmount) * 0.20)) : '$0 (below hurdle)'}</p>
                  <p className="text-xs text-text-muted">Net MOIC to LPs: {((carryWaterfallData.grossTotalReturns - carryWaterfallData.carry) / carryWaterfallData.returnOfCapital).toFixed(2)}x</p>
                </div>
              )}
              {/* Step 6: LP Reactions */}
              {waterfallStep >= (carryWaterfallData.hurdleCleared ? 6 : 4) && lpCommentary && lpCommentary.length > 0 && (
                <div className="bg-white/5 rounded-lg p-3 border-l-2 border-blue-400">
                  <p className="text-sm font-medium mb-2">LP Reactions</p>
                  {lpCommentary.slice(-2).map((lp, i) => (
                    <div key={i} className="flex items-start gap-2 mb-2">
                      <span className={`w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 ${lp.speaker === 'edna' ? 'bg-blue-500/30 text-blue-300' : 'bg-amber-500/30 text-amber-300'}`}>
                        {lp.speaker === 'edna' ? 'EM' : 'CH'}
                      </span>
                      <p className="text-xs text-text-muted italic">"{lp.text}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Step progression button */}
            {waterfallStep < maxWaterfallSteps && (
              <button
                onClick={() => setWaterfallStep(s => s + 1)}
                className="w-full mt-4 px-4 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors text-sm"
              >
                {waterfallStep === 0 ? 'Reveal Waterfall' : 'Next Step'} ({waterfallStep + 1}/{maxWaterfallSteps})
              </button>
            )}
          </div>

          {/* PE Score Breakdown */}
          <div className="card mb-6">
            <h2 className="text-lg font-bold mb-4">Score Breakdown</h2>
            <ScoreBar label="Return Generation (Net IRR)" value={peScore.returnGeneration} max={25} />
            <ScoreBar label="Capital Efficiency (Gross MOIC)" value={peScore.capitalEfficiency} max={20} />
            <ScoreBar label="Value Creation (EBITDA Growth)" value={peScore.valueCreation} max={15} />
            <ScoreBar label="Deployment Discipline" value={peScore.deploymentDiscipline} max={15} />
            <ScoreBar label="Risk Management" value={peScore.riskManagement} max={15} />
            <ScoreBar label="LP Satisfaction" value={peScore.lpSatisfaction} max={10} />
            <div className="mt-4 pt-4 border-t border-white/10 text-center">
              <span className="text-2xl font-bold font-mono">{peScore.total} / 100</span>
            </div>
          </div>

          {/* Play Again at bottom */}
          <button onClick={onPlayAgain} className="btn-primary text-lg py-3 w-full mb-6">
            Play Again
          </button>
        </div>

      ) :

      /* Holdco Modes — Bankruptcy Header (replaces normal header) */
      bankruptRound ? (
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

      {/* Family Office — Completed (hidden in fund mode) */}
      {!isFundManagerMode && familyOfficeState?.legacyScore && (
        <div className="card mb-6 border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-yellow-500/5">
          <div className="text-center">
            <span className="text-3xl block mb-1">🦅</span>
            <p className="font-bold text-lg">{familyOfficeState.legacyScore.grade} Legacy</p>
            <div className="grid grid-cols-3 gap-4 mt-3 text-center">
              <div>
                <p className="text-xs text-text-muted">Starting Capital</p>
                <p className="font-mono text-sm">{formatMoney(familyOfficeState.legacyScore.foStartingCash)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">MOIC</p>
                <p className="font-mono text-sm font-bold">{familyOfficeState.legacyScore.foMOIC.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">FEV Multiplier</p>
                <p className="font-mono text-sm font-bold text-amber-400">{familyOfficeState.legacyScore.foMultiplier.toFixed(2)}x</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Founder Equity Value - Hero Display (hidden in fund mode) */}
      {!isFundManagerMode && <div className={`card mb-6 bg-gradient-to-r ${hasRestructured ? 'from-red-900/20 to-orange-900/20 border-red-500/30' : foMultiplier > 1.0 ? 'from-amber-500/10 to-yellow-500/10 border-amber-500/30' : 'from-accent/20 to-accent-secondary/20 border-accent/30'}`}>
        <div className="text-center">
          <p className="text-text-muted text-sm mb-1">
            Founder Equity Value
            {hasRestructured && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 border border-red-500/50 text-red-400" title="Your FEV has been reduced by 20% due to financial restructuring.">
                -20% Restructuring
              </span>
            )}
            {foMultiplier > 1.0 && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-500/50 text-amber-400" title={`Your FEV has been boosted by ${((foMultiplier - 1) * 100).toFixed(0)}% from Family Office performance.`}>
                +{((foMultiplier - 1) * 100).toFixed(0)}% Family Office
              </span>
            )}
          </p>
          {hasRestructured || foMultiplier > 1.0 ? (
            <div className="mb-2">
              <p className="text-lg font-mono text-text-muted line-through">{formatMoney(founderEquityValue)}</p>
              <p className={`text-3xl sm:text-5xl font-bold font-mono ${hasRestructured ? 'text-red-400' : 'text-amber-400'}`}>
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
      </div>}

      {/* FEV / EV Breakdown (hidden in fund mode) */}
      {!isFundManagerMode && !bankruptRound && (() => {
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
              {(() => {
                const gameState = useGameStore.getState();
                const publicBonus = calculatePublicCompanyBonus(gameState);
                return (
                  <>
                    {publicBonus > 0 && (
                      <div className="text-xs text-green-400/70 -mt-0.5">
                        Includes +{(publicBonus * 100).toFixed(0)}% public company bonus
                      </div>
                    )}
                  </>
                );
              })()}
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
                  <span className="font-mono text-red-400">-{formatMoney(Math.round(founderEquityValue * difficultyMultiplier) - Math.round(founderEquityValue * difficultyMultiplier * restructuringMultiplier))}</span>
                </div>
              )}
              {foMultiplier > 1.0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-amber-400">x FO Multiplier ({foMultiplier.toFixed(2)}x)</span>
                  <span className="font-mono text-amber-400">{formatMoney(Math.round(founderEquityValue * difficultyMultiplier * restructuringMultiplier * foMultiplier))}</span>
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

      {/* IPO Summary (hidden in fund mode) */}
      {!isFundManagerMode && ipoState?.isPublic && (
        <div className="card mb-6">
          <h2 className="text-lg font-bold mb-4">IPO Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-text-muted text-sm">IPO Round</p>
              <p className="text-lg sm:text-xl font-bold font-mono">Year {ipoState.ipoRound}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Final Stock Price</p>
              <p className="text-lg sm:text-xl font-bold font-mono text-accent">{formatMoney(Math.round(ipoState.stockPrice))}/sh</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Market Sentiment</p>
              <p className={`text-lg sm:text-xl font-bold font-mono ${ipoState.marketSentiment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {ipoState.marketSentiment >= 0 ? '+' : ''}{(ipoState.marketSentiment * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Shares Outstanding</p>
              <p className="text-lg sm:text-xl font-bold font-mono">{ipoState.sharesOutstanding.toLocaleString()}</p>
              <p className="text-xs text-text-muted">Pre-IPO: {ipoState.preIPOShares.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

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
                {saving ? 'Saving...' : saveError ? 'Retry' : 'Save Score'}
              </button>
            </div>
            {saveError && (
              <p className="text-red-400 text-sm mt-2">
                Failed to save to global leaderboard. Your score was saved locally — please try again.
              </p>
            )}
          </div>
        </div>
      )}

      {hasSaved && (
        <div className="card mb-6 border-accent/30 text-center">
          <p className="text-accent font-bold">Score saved to global leaderboard!</p>
        </div>
      )}

      {/* Signup Nudge (hidden in fund mode) */}
      {!isFundManagerMode && (() => {
        const gameNumber = parseInt(localStorage.getItem('holdco-game-number') ?? '0', 10);
        const showNudge = gameNumber >= 2 && !isLoggedIn && signupNudgeDismissals < 3 && !nudgeDismissedThisSession;
        if (!showNudge) return null;

        const nudgeCopy = score.grade === 'S' || score.grade === 'A'
          ? 'Your stats deserve a home'
          : canMakeLeaderboard
            ? 'Claim your leaderboard spot'
            : 'Track your progress across games';

        return (
          <div className="card mb-6 border-accent/20 bg-gradient-to-r from-accent/5 to-accent-secondary/5">
            <div className="text-center">
              <p className="font-bold mb-1">{nudgeCopy}</p>
              <p className="text-text-muted text-sm mb-4">
                Create a free account to track your stats, claim your games, and get a verified badge on the leaderboard.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <button onClick={() => openAccountModal()} className="btn-primary text-sm">
                  Create Account
                </button>
                <button
                  onClick={() => { incrementNudgeDismissals(); setNudgeDismissedThisSession(true); }}
                  className="btn-secondary text-sm"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Global Leaderboard */}
      {<GameOverLeaderboard
        allEntries={leaderboard}
        loading={leaderboardLoading}
        error={leaderboardError}
        onRetry={handleRetryLeaderboard}
        savedEntryId={savedEntryId}
        activeTab={leaderboardTab}
        onTabChange={setLeaderboardTab}
        showWealth={leaderboardTab === 'distributions' || leaderboardTab === 'pe'}
      />}

      {/* Challenge Scoreboard (hidden in fund mode) */}
      {!isFundManagerMode && challengeData && !scoreboardFailed && (
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

      {/* Challenge Friends (hidden in fund mode) */}
      {!isFundManagerMode && (!challengeData || scoreboardFailed) && (
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

      {/* Score Breakdown (holdco only — PE score rendered in fund mode header) */}
      {!isFundManagerMode && <div className="card mb-6">
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
      </div>}

      {/* Final Metrics */}
      {isFundManagerMode && carryWaterfallData ? (
        <div className="card mb-6">
          <h2 className="text-lg font-bold mb-4">Fund Performance Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
            <div>
              <p className="text-text-muted text-sm">Capital Deployed</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(totalInvestedCapital)}</p>
              <p className="text-xs text-text-muted">{Math.round(totalInvestedCapital / (carryWaterfallData.returnOfCapital || 1) * 100)}% of {formatMoney(carryWaterfallData.returnOfCapital)}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Fund Value Generated</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(Math.round(carryWaterfallData.grossTotalReturns))}</p>
              <p className="text-xs text-text-muted">Gross MOIC: {carryWaterfallData.grossMoic.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">LP Distributions</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(Math.round(carryWaterfallData.lpDistributions))}</p>
              <p className="text-xs text-text-muted">DPI: {carryWaterfallData.dpi.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Net IRR</p>
              <p className={`text-xl sm:text-2xl font-bold font-mono ${carryWaterfallData.netIrr >= 0.08 ? 'text-accent' : carryWaterfallData.netIrr < 0 ? 'text-danger' : ''}`}>
                {(carryWaterfallData.netIrr * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-text-muted">Hurdle: 8.0%</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Liquidation Value</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(Math.round(carryWaterfallData.liquidationProceeds))}</p>
              <p className="text-xs text-text-muted">At fund close</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Management Fees</p>
              <p className="text-xl sm:text-2xl font-bold font-mono">{formatMoney(Math.round(carryWaterfallData.managementFees))}</p>
              <p className="text-xs text-text-muted">2% × {maxRounds} years</p>
            </div>
          </div>
        </div>
      ) : (
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
      )}

      {/* Portfolio */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-1">{isFundManagerMode ? 'Fund Portfolio' : 'Portfolio Companies'}</h2>
        <p className="text-xs text-text-muted mb-4">{isFundManagerMode ? 'Investment outcomes by portfolio company.' : 'Platforms and standalone companies. Bolt-ons are consolidated into their parent platform.'}</p>
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
        <button
          onClick={() => setShowFeedback(true)}
          className="text-sm text-text-muted hover:text-accent transition-colors min-h-[44px] inline-flex items-center justify-center"
        >
          💬 Send Feedback
        </button>
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

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
        context={{ screen: 'gameover', round: maxRounds, difficulty, duration, holdcoName }}
      />

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
  const currentPlayerId = useAuthStore((s) => s.player?.id);

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
            const isPE = activeTab === 'pe';
            const displayLabel = isPE ? 'Carry' : showWealth ? 'Wealth' : (entry.founderEquityValue ? 'FEV' : 'EV');
            const isYou = !!(currentPlayerId && entry.playerId && currentPlayerId === entry.playerId);
            const isVerified = entry.isVerified || !!entry.playerId;
            return (
              <div
                key={entry.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  isYou ? 'bg-accent/15 border border-accent/30'
                    : entry.id === savedEntryId ? 'bg-accent/20 border border-accent/40'
                    : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className={`text-lg font-bold tabular-nums w-10 text-center inline-block ${getRankColor(index + 1)}`}>
                    #{index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold">
                      {entry.initials}
                      {isVerified && <span className="text-blue-300 ml-1 text-sm" role="img" aria-label="Verified account" title="Verified account">✓</span>}
                      {entry.familyOfficeCompleted && <span className="ml-1" title="Family Office Legacy">🦅</span>}
                      {isPE && <span className="ml-1" title="PE Fund Manager">🏦</span>}
                      {isYou && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">You</span>}
                    </p>
                    <p className="text-xs text-text-muted truncate">{isPE ? (entry.fundName || entry.holdcoName) : entry.holdcoName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:gap-6 text-right shrink-0">
                  <div className="min-w-[4.5rem]">
                    <p className="text-xs text-text-muted">{displayLabel}</p>
                    <p className="font-mono tabular-nums font-bold text-accent">
                      {formatMoney(displayValue)}
                      {!isPE && entry.hasRestructured && <span className="text-red-400 text-[10px] ml-1" title="Restructured — 20% FEV penalty">(R)</span>}
                    </p>
                  </div>
                  <div className="min-w-[3.5rem]">
                    <p className="text-xs text-text-muted">Score</p>
                    <p className={`font-mono tabular-nums ${getGradeColor(entry.grade)}`}>{entry.score} ({entry.grade})</p>
                  </div>
                  <div className="w-8 flex justify-center">
                    {isPE ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">PE</span>
                    ) : entry.difficulty ? (
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
