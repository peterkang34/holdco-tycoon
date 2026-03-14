import { useState, useEffect, useMemo, useRef } from 'react';
import { ScoreBreakdown, PostGameInsight, Business, Metrics, LeaderboardEntry, HistoricalMetrics, GameDifficulty, GameDuration, IntegratedPlatform, PEScoreBreakdown, CarryWaterfall, LPComment } from '../../engine/types';
import type { IPOState } from '../../engine/types';
import { useGameStore } from '../../hooks/useGame';
import { loadLeaderboard, saveToLeaderboard, wouldMakeLeaderboardFromList, getLeaderboardRankFromList } from '../../engine/scoring';
import { calculateExitValuation } from '../../engine/simulation';
import { AIAnalysisSection } from '../ui/AIAnalysisSection';
import { DIFFICULTY_CONFIG, RESTRUCTURING_FEV_PENALTY } from '../../data/gameConfig';
import { getOutcomeReactions } from '../../data/lpCommentary';
import { createRngStreams } from '../../engine/rng';
import { trackGameComplete, trackChallengeCreate, trackChallengeShare, type GameCompleteSnapshot } from '../../services/telemetry';
import { submitGameCompletion } from '../../services/completionApi';
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
import { FeedbackModal } from '../ui/FeedbackModal';
import { useAuthStore, useIsLoggedIn } from '../../hooks/useAuth';
import { ACHIEVEMENT_PREVIEW, type AchievementContext } from '../../data/achievementPreview';
import { HOLDCO_GRADE_TIPS, PE_GRADE_TIPS } from '../../data/gradeTips';

import {
  BankruptcyHeader,
  FEVHeroSection,
  CarryHeroSection,
  CarryWaterfallSection,
  ProfileAchievementSection,
  LeaderboardSaveInput,
  GameOverLeaderboard,
  ChallengeShareSection,
  PortfolioSummary,
  ScoreBreakdownSection,
  PlayAgainSection,
} from '../gameover';

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
  lpCommentary: _lpCommentary,
  onPlayAgain,
}: GameOverScreenProps) {
  // ── Stores & Auth ──
  const familyOfficeState = useGameStore(s => s.familyOfficeState);
  const lpSatisfactionScore = useGameStore(s => s.lpSatisfactionScore);
  const isReallyLoggedIn = useIsLoggedIn();
  // Force anonymous mode on test pages so signup CTAs are visible
  const isTestMode = window.location.hash.includes('go-test') || window.location.hash.includes('fo-test');
  const isLoggedIn = isTestMode ? false : isReallyLoggedIn;
  const { openAccountModal } = useAuthStore();


  // ── Leaderboard State ──
  const [initials, setInitials] = useState('');
  const [hasSaved, setHasSaved] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<import('../ui/LeaderboardModal').LeaderboardTab>(isFundManagerMode ? 'pe' : 'overall');

  // ── Challenge State ──
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [scoreboardLinkCopied, setScoreboardLinkCopied] = useState(false);
  const [showComparison, setShowComparison] = useState(!!incomingResult);
  const [scoreboardFailed, setScoreboardFailed] = useState(false);

  // ── UI State ──
  const [showFeedback, setShowFeedback] = useState(false);

  // ── Outcome Reactions (PE) ──
  const outcomeReactions = useMemo(() => {
    if (!isFundManagerMode || !carryWaterfallData) return null;
    const rng = createRngStreams(seed, maxRounds);
    return getOutcomeReactions(
      carryWaterfallData.grossMoic,
      carryWaterfallData.hurdleCleared,
      carryWaterfallData.netIrr,
      rng.cosmetic,
    );
  }, [isFundManagerMode, carryWaterfallData, seed, maxRounds]);

  // ── Challenge Params ──
  const currentChallengeParams: ChallengeParams = useMemo(() => (
    challengeData ?? { seed, difficulty: difficulty ?? 'easy', duration: duration ?? 'standard' }
  ), [challengeData, seed, difficulty, duration]);

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

  // ── Challenge Handlers ──
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

  // ── Strategy Data ──
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

  // ── Telemetry ──
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
      ...(isFundManagerMode ? {
        gameMode: 'fund_manager',
        isFundManager: true,
        netIrr: carryWaterfallData?.netIrr,
        grossMoic: carryWaterfallData?.grossMoic,
        carryEarned: carryWaterfallData?.carry,
        dpi: carryWaterfallData?.dpi,
        irrMultiplier: carryWaterfallData?.irrMultiplier,
      } : {}),
    };
    trackGameComplete(snapshot);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-submit Completion ──
  const completionSubmittedRef = useRef(false);
  useEffect(() => {
    if (completionSubmittedRef.current) return;
    completionSubmittedRef.current = true;
    if (window.location.hash.includes('fo-test') || window.location.hash.includes('go-test')) return;

    const gameScore = isFundManagerMode ? (peScore?.total ?? 0) : score.total;
    const gameGrade = isFundManagerMode ? (peScore?.grade ?? 'F') : score.grade;
    const completionId = `${seed}-${difficulty}-${duration}-${isFundManagerMode ? 'pe' : 'hc'}-${gameScore}-${gameGrade}`;

    submitGameCompletion({
      completionId,
      holdcoName: isFundManagerMode ? (fundName || 'PE Fund') : holdcoName,
      enterpriseValue: Math.round(enterpriseValue),
      founderEquityValue: Math.round(founderEquityValue),
      score: gameScore,
      grade: gameGrade,
      businessCount: businesses.filter(b => b.status === 'active').length,
      difficulty,
      duration,
      totalRounds: maxRounds,
      hasRestructured,
      isFundManager: isFundManagerMode || undefined,
      fundName: isFundManagerMode ? fundName : undefined,
      netIrr: isFundManagerMode ? carryWaterfallData?.netIrr : undefined,
      grossMoic: isFundManagerMode ? carryWaterfallData?.grossMoic : undefined,
      carryEarned: isFundManagerMode ? carryWaterfallData?.carry : undefined,
      archetype: strategyData.archetype,
      sophisticationScore: strategyData.sophisticationScore,
      isChallenge: !!challengeData,
      strategy: {
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
        sectorIds: strategyData.sectorIds,
        dealStructureTypes: strategyData.dealStructureTypes,
        platformsForged: strategyData.platformCount,
        totalAcquisitions: strategyData.totalAcquisitions,
        totalSells: strategyData.totalSells,
        antiPatterns: strategyData.antiPatterns.length > 0 ? strategyData.antiPatterns : undefined,
        peakLeverage: Math.round(strategyData.peakLeverage * 10) / 10,
        turnaroundsStarted: strategyData.turnaroundsStarted,
        turnaroundsSucceeded: strategyData.turnaroundsSucceeded,
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed Values ──
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
  }, [activeBusinesses, sharesOutstanding, founderShares, maxRounds, enterpriseValue, initialOwnershipPct, integratedPlatforms]);

  // ── Leaderboard ──
  useEffect(() => {
    let cancelled = false;
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    loadLeaderboard()
      .then(entries => { if (!cancelled) { setLeaderboard(entries); setLeaderboardLoading(false); } })
      .catch(() => { if (!cancelled) { setLeaderboardError(true); setLeaderboardLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const handleRetryLeaderboard = () => {
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    loadLeaderboard()
      .then(entries => { setLeaderboard(entries); setLeaderboardLoading(false); })
      .catch(() => { setLeaderboardError(true); setLeaderboardLoading(false); });
  };

  const handleSaveScore = async () => {
    if (initials.length < 2 || hasSaved || saving) return;
    setSaving(true);
    setSaveError(false);

    // Test mode: simulate successful save without hitting real API
    if (isTestMode) {
      setSavedEntryId('test-entry');
      setHasSaved(true);
      setSaving(false);
      return;
    }

    try {
      const gameScore = isFundManagerMode ? (peScore?.total ?? 0) : score.total;
      const gameGrade = isFundManagerMode ? (peScore?.grade ?? 'F') : score.grade;
      const completionId = `${seed}-${difficulty}-${duration}-${isFundManagerMode ? 'pe' : 'hc'}-${gameScore}-${gameGrade}`;
      const entry = await saveToLeaderboard(
        {
          holdcoName: isFundManagerMode ? (fundName || 'PE Fund') : holdcoName,
          initials: initials.toUpperCase(),
          enterpriseValue,
          score: gameScore,
          grade: gameGrade,
          businessCount: activeBusinesses.length,
        },
        {
          completionId,
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
          isFundManager: isFundManagerMode || undefined,
          fundName: isFundManagerMode ? (fundName || 'PE Fund') : undefined,
          netIrr: isFundManagerMode ? carryWaterfallData?.netIrr : undefined,
          grossMoic: isFundManagerMode ? carryWaterfallData?.grossMoic : undefined,
          carryEarned: isFundManagerMode ? carryWaterfallData?.carry : undefined,
          strategy: {
            ...(isFundManagerMode ? {
              isFundManager: true,
              fundName: fundName || 'PE Fund',
              carryEarned: carryWaterfallData?.carry,
              netIrr: carryWaterfallData?.netIrr,
              grossMoic: carryWaterfallData?.grossMoic,
            } : {}),
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
        const without = prev.filter(e => e.id !== entry.id);
        return [...without, fullEntry];
      });

      loadLeaderboard().then(updated => {
        const hasEntry = updated.some(e => e.id === entry.id);
        setLeaderboard(hasEntry ? updated : [...updated, fullEntry]);
      }).catch(() => { /* keep optimistic state */ });
    } finally {
      setSaving(false);
    }
  };

  // ── Achievement Preview ──
  const earnedAchievements = useMemo(() => {
    const initialCapital = DIFFICULTY_CONFIG[difficulty]?.initialCash ?? 20000;
    const ctx: AchievementContext = {
      strategyData,
      score,
      businesses,
      exitedBusinesses,
      totalDebt,
      totalDistributions,
      founderEquityValue,
      difficulty,
      duration,
      bankruptRound,
      isFundManagerMode,
      carryEarned: carryWaterfallData?.carry,
      lpSatisfaction: lpSatisfactionScore ?? undefined,
      initialCapital,
    };
    return ACHIEVEMENT_PREVIEW.filter(a => a.check(ctx));
  }, [strategyData, score, businesses, exitedBusinesses, totalDebt, totalDistributions, founderEquityValue, difficulty, duration, bankruptRound, isFundManagerMode, carryWaterfallData]);

  // ── Derived ──
  const isBankruptcy = !!bankruptRound;
  const gradeTips = isFundManagerMode ? PE_GRADE_TIPS : HOLDCO_GRADE_TIPS;

  // ════════════════════════════════════════════════════════════════
  // ██ V2 RENDER — FEV-First, Account-Driven Layout
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 pb-16 max-w-4xl mx-auto">

      {/* ── Section 1: Hero ── */}
      {isBankruptcy ? (
        <BankruptcyHeader
          holdcoName={holdcoName}
          fundName={fundName}
          isFundManagerMode={isFundManagerMode}
          bankruptRound={bankruptRound!}
          cash={cash}
          metrics={metrics}
          metricsHistory={metricsHistory}
          businesses={businesses}
          sharesOutstanding={sharesOutstanding}
          hasRestructured={hasRestructured}
          difficulty={difficulty}
          maxRounds={maxRounds}
        />
      ) : isFundManagerMode && peScore && carryWaterfallData ? (
        <CarryHeroSection
          fundName={fundName || 'PE Fund'}
          peScore={peScore}
          carryWaterfallData={carryWaterfallData}
          difficulty={difficulty}
          archetype={strategyData.archetype}
        />
      ) : (
        <FEVHeroSection
          holdcoName={holdcoName}
          founderEquityValue={founderEquityValue}
          adjustedFEV={adjustedFEV}
          enterpriseValue={enterpriseValue}
          founderPersonalWealth={founderPersonalWealth}
          difficulty={difficulty}
          duration={duration}
          maxRounds={maxRounds}
          hasRestructured={hasRestructured}
          difficultyMultiplier={difficultyMultiplier}
          restructuringMultiplier={restructuringMultiplier}
          foMultiplier={foMultiplier}
          archetype={strategyData.archetype}
          familyOfficeLegacy={familyOfficeState?.legacyScore ? {
            grade: familyOfficeState.legacyScore.grade,
            foStartingCash: familyOfficeState.legacyScore.foStartingCash,
            foMOIC: familyOfficeState.legacyScore.foMOIC,
            foMultiplier: familyOfficeState.legacyScore.foMultiplier,
          } : null}
          fevBreakdown={fevBreakdown}
          cash={cash}
          totalDebt={totalDebt}
          initialOwnershipPct={initialOwnershipPct}
        />
      )}

      {/* ── Section 1.5: Leaderboard Save (immediately after hero, high visibility) ── */}
      {!isBankruptcy && (
        <LeaderboardSaveInput
          canMakeLeaderboard={canMakeLeaderboard}
          potentialRank={potentialRank}
          initials={initials}
          onInitialsChange={setInitials}
          hasSaved={hasSaved}
          saving={saving}
          saveError={saveError}
          onSave={handleSaveScore}
          leaderboardLoading={leaderboardLoading}
          isLoggedIn={isLoggedIn}
          onSignUp={() => openAccountModal()}
        />
      )}

      {/* ── Section 2: Achievements + Profile (merged section) ── */}
      <ProfileAchievementSection
        earnedAchievements={earnedAchievements}
        allAchievements={ACHIEVEMENT_PREVIEW}
        isLoggedIn={isLoggedIn}
        onSignUp={() => openAccountModal()}
      />

      {/* ── Sections 4+ only for non-bankruptcy ── */}
      {!isBankruptcy && (
        <>
          {/* Section 4a: Carry Waterfall (PE only) */}
          {isFundManagerMode && carryWaterfallData && (
            <CarryWaterfallSection
              carryWaterfallData={carryWaterfallData}
              outcomeReactions={outcomeReactions}
            />
          )}

          {/* Section 4b: Global Leaderboard */}
          <GameOverLeaderboard
            allEntries={leaderboard}
            loading={leaderboardLoading}
            error={leaderboardError}
            onRetry={handleRetryLeaderboard}
            savedEntryId={savedEntryId}
            activeTab={leaderboardTab}
            onTabChange={setLeaderboardTab}
            showWealth={leaderboardTab === 'distributions' || leaderboardTab === 'pe'}
          />

          {/* Section 5: Challenge Share (holdco only) */}
          {!isFundManagerMode && (
            <ChallengeShareSection
              challengeData={challengeData ?? null}
              currentChallengeParams={currentChallengeParams}
              myResult={myResult}
              onChallengeShare={handleChallengeShare}
              onShareResult={handleShareResult}
              onShareScoreboardLink={handleShareScoreboardLink}
              challengeCopied={challengeCopied}
              scoreboardLinkCopied={scoreboardLinkCopied}
              scoreboardFailed={scoreboardFailed}
              onScoreboardFailed={() => setScoreboardFailed(true)}
              onShowComparison={() => setShowComparison(true)}
            />
          )}

          {/* Section 6: Portfolio Summary */}
          <PortfolioSummary
            isFundManagerMode={isFundManagerMode}
            metrics={metrics}
            carryWaterfallData={carryWaterfallData ?? null}
            totalInvestedCapital={totalInvestedCapital}
            maxRounds={maxRounds}
            allBusinesses={allBusinesses}
            integratedPlatforms={integratedPlatforms}
            ipoState={ipoState}
            fundName={fundName}
          />

          {/* Section 7: AI Analysis (not shown in bankruptcy — saves API cost) */}
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

          {/* Section 8: Score Breakdown + Grade (demoted) */}
          <ScoreBreakdownSection
            isFundManagerMode={isFundManagerMode}
            score={score}
            peScore={peScore ?? undefined}
            gradeTips={gradeTips}
          />
        </>
      )}

      {/* ── Section 9: Play Again with Intent (always shown) ── */}
      <PlayAgainSection
        onPlayAgain={onPlayAgain}
        onShowFeedback={() => setShowFeedback(true)}
      />

      {/* ── Modals ── */}
      {showComparison && (
        <ChallengeComparison
          challengeParams={currentChallengeParams}
          myResult={myResult}
          initialOpponentResult={incomingResult}
          onClose={() => setShowComparison(false)}
        />
      )}
      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
        context={{ screen: 'gameover', round: maxRounds, difficulty, duration, holdcoName }}
      />

      {/* ── Footer ── */}
      <p className="text-center text-text-muted text-sm mt-8">
        Holdco Tycoon - Based on <em>The Holdco Guide</em> by Peter Kang
      </p>
    </div>
  );
}
