/**
 * Operator's Playbook — Builder
 *
 * Pure function that transforms game-over state into a PlaybookData object.
 * Called once at game-over time. The result is displayed in the ephemeral
 * playbook view AND submitted to the API for persistence.
 */

import type {
  PlaybookData,
  Business,
  Metrics,
  HistoricalMetrics,
  ScoreBreakdown,
  IntegratedPlatform,
  IPOState,
  FamilyOfficeState,
  PEScoreBreakdown,
  CarryWaterfall,
  DistressLevel,
  GameDifficulty,
  GameDuration,
} from '../engine/types';
import { calculatePublicCompanyBonus } from '../engine/ipo';
import { DIFFICULTY_CONFIG, RESTRUCTURING_FEV_PENALTY } from '../data/gameConfig';
// generateThesis is used by consumers, not internally

// ── Reality Check caveats ──────────────────────────────────────────

const REALITY_CAVEATS: Array<{ id: string; condition: (ctx: CaveatContext) => boolean; text: string }> = [
  {
    id: 'leverage_forgiving',
    condition: (ctx) => ctx.peakLeverage > 3.0,
    text: 'The game\'s leverage thresholds are more forgiving than reality. Real covenant breaches trigger lender intervention, board changes, or forced asset sales — not just margin penalties.',
  },
  {
    id: 'turnaround_people',
    condition: (ctx) => ctx.turnaroundsStarted > 0,
    text: 'Real turnarounds are deeply people-dependent. The game abstracts away the hardest part: finding, hiring, and retaining the operators who actually fix broken businesses.',
  },
  {
    id: 'deal_flow',
    condition: () => true,
    text: 'Deal flow in reality is sparse, competitive, and relationship-dependent. You do not get a curated menu of businesses to choose from each year.',
  },
  {
    id: 'time_compression',
    condition: () => true,
    text: 'The game compresses 10-20 years into 30 minutes. The single biggest abstraction: patience in a game is not patience in life.',
  },
  {
    id: 'integration_timeline',
    condition: (ctx) => ctx.platformsForged > 0,
    text: 'Real integrations take 12-36 months minimum and "success" is a spectrum. Post-merger integration is the #1 value destroyer in M&A.',
  },
  {
    id: 'perfect_information',
    condition: (ctx) => ctx.totalSells > 0,
    text: 'The game shows exact exit valuations. In reality, valuations are negotiated, contingent, and uncertain until close.',
  },
  {
    id: 'recession_timing',
    condition: (ctx) => ctx.recessionAcquisitions > 0,
    text: 'Buying during recessions sounds obvious in hindsight. In reality, credit freezes, deal flow dries up, and your existing portfolio demands all your attention.',
  },
];

interface CaveatContext {
  peakLeverage: number;
  turnaroundsStarted: number;
  platformsForged: number;
  totalSells: number;
  recessionAcquisitions: number;
}

function selectRealityCaveats(ctx: CaveatContext): string[] {
  const matching = REALITY_CAVEATS.filter(c => c.condition(ctx));
  // Always include time_compression and deal_flow, then pick up to 3 more
  const alwaysShow = matching.filter(c => c.id === 'time_compression' || c.id === 'deal_flow');
  const conditional = matching.filter(c => c.id !== 'time_compression' && c.id !== 'deal_flow');
  const selected = [...alwaysShow, ...conditional.slice(0, 3)];
  return selected.map(c => c.text);
}

// ── Anti-pattern explanations ──────────────────────────────────────

const ANTI_PATTERN_TEXT: Record<string, string> = {
  over_leveraged: 'Portfolio reached dangerous leverage levels. In reality, covenant breaches trigger lender intervention, board changes, or forced asset sales.',
  serial_restructurer: 'Multiple restructurings signal chronic over-leverage rather than bad luck. Real creditors impose increasingly punitive terms on repeat restructurers.',
  dilution_spiral: 'Repeated equity raises diluted founder ownership significantly. Real investors would demand board control and governance rights.',
  spray_and_pray: 'Acquisitions spread across many sectors with no integration thesis. Real operators build value through sector expertise and operational playbooks.',
  turnaround_graveyard: 'Multiple failed turnarounds consumed capital and management attention. Repeated failure suggests a capabilities gap, not bad luck.',
  no_distributions: 'No capital returned despite a long hold period. Real investors and boards expect capital returns when reinvestment opportunities thin.',
};

// ── Builder input type ─────────────────────────────────────────────

export interface PlaybookBuilderInput {
  // Core game state
  holdcoName: string;
  difficulty: GameDifficulty;
  duration: GameDuration;
  seed: number;
  maxRounds: number;

  // Scoring
  score: ScoreBreakdown;
  peScore?: PEScoreBreakdown | null;

  // Financials
  enterpriseValue: number;
  founderEquityValue: number;
  founderPersonalWealth: number;
  cash: number;
  totalDebt: number;
  totalDistributions: number;
  totalBuybacks: number;
  totalInvestedCapital: number;
  equityRaisesUsed: number;
  sharedServicesActive: number;
  founderShares: number;
  sharesOutstanding: number;
  initialOwnershipPct: number;
  hasRestructured: boolean;
  bankruptRound?: number;

  // Portfolio
  businesses: Business[];
  exitedBusinesses: Business[];
  metricsHistory: HistoricalMetrics[];
  integratedPlatforms: IntegratedPlatform[];
  metrics: Metrics;

  // Strategy (pre-computed from GameOverScreen)
  strategyData: {
    archetype: string;
    totalAcquisitions: number;
    totalSells: number;
    turnaroundsStarted: number;
    turnaroundsSucceeded: number;
    turnaroundsFailed: number;
    peakLeverage: number;
    peakDistressLevel: number;
    sectorIds: string[];
    allTimeSectorCount: number;
    dealStructureTypes: Record<string, number>;
    rolloverEquityCount: number;
    activeCount: number;
    peakActiveCount: number;
    platformCount: number;
    platformsForged: number;
    antiPatterns: string[];
    sophisticationScore: number;
    endingSubTypes: Record<string, number>;
    endingConstruction: Record<string, number>;
    maSourcingTier: number;
    sourceDealUses: number;
    proactiveOutreachUses: number;
    smbBrokerUses: number;
    recessionAcquisitionCount: number;
  };

  // Mode-specific
  isFundManagerMode: boolean;
  fundName?: string;
  carryWaterfall?: CarryWaterfall | null;
  ipoState?: IPOState | null;
  familyOfficeState?: FamilyOfficeState | null;
  lpSatisfactionScore?: number | null;
  lpDistributions?: number | null;
  fundSize?: number | null;

  // Challenge
  challengeData?: { seed: number } | null;

  // Round history for event extraction
  roundHistory: Array<{
    round: number;
    event: { type: string } | null;
    actions: Array<{ type: string; details?: unknown }>;
  }>;
}

// ── Main builder ───────────────────────────────────────────────────

export function buildPlaybook(input: PlaybookBuilderInput): PlaybookData | null {
  try {
    return buildPlaybookUnsafe(input);
  } catch (err) {
    console.error('[Playbook] Builder failed:', err);
    return null;
  }
}

function buildPlaybookUnsafe(input: PlaybookBuilderInput): PlaybookData {
  const {
    holdcoName, difficulty, duration, seed, maxRounds,
    score, peScore,
    enterpriseValue, founderEquityValue, cash: _cash, totalDebt,
    totalDistributions, totalBuybacks, totalInvestedCapital,
    equityRaisesUsed, sharedServicesActive, founderShares, sharesOutstanding,
    hasRestructured, bankruptRound,
    businesses, exitedBusinesses, metricsHistory, integratedPlatforms, metrics,
    strategyData,
    isFundManagerMode, fundName, carryWaterfall, ipoState, familyOfficeState,
    lpSatisfactionScore, lpDistributions: _lpDistributions, fundSize,
    challengeData, roundHistory,
  } = input;

  const isBankrupt = !!bankruptRound;
  const actualRounds = bankruptRound ?? maxRounds;
  const isEarlyBankruptcy = isBankrupt && actualRounds <= 3;

  // Archetype guards
  let archetype = strategyData.archetype;
  if (isBankrupt) archetype = 'bankrupt';
  else if (isFundManagerMode && strategyData.totalAcquisitions === 0) archetype = 'inactive_gp';

  // Ownership
  const currentOwnership = sharesOutstanding > 0 ? founderShares / sharesOutstanding : 1;

  // Adjusted FEV
  const difficultyMultiplier = DIFFICULTY_CONFIG[difficulty]?.leaderboardMultiplier ?? 1.0;
  const restructuringMultiplier = hasRestructured ? RESTRUCTURING_FEV_PENALTY : 1.0;
  const foMultiplier = familyOfficeState?.foMultiplier ?? 1.0;
  const adjustedFev = Math.round(founderEquityValue * difficultyMultiplier * restructuringMultiplier * foMultiplier);

  // Active businesses
  const activeBiz = businesses.filter(b => b.status === 'active');

  // All businesses (active + exited)
  const allBiz = [...businesses, ...exitedBusinesses];
  const allTimeSectorIds = [...new Set(allBiz.map(b => b.sectorId))];

  // Distress level mapping
  const distressMap: Record<string, DistressLevel> = {
    '0': 'comfortable', '1': 'elevated', '2': 'stressed', '3': 'breach',
  };
  const peakDistressLevel = distressMap[String(strategyData.peakDistressLevel)] ?? 'comfortable';

  // Ending leverage
  const totalEbitda = activeBiz.reduce((sum, b) => sum + b.ebitda, 0);
  const endingLeverage = totalEbitda > 0 ? totalDebt / totalEbitda : 0;

  // Deal structure analysis
  const totalDeals = Object.values(strategyData.dealStructureTypes).reduce((s, n) => s + n, 0);
  const sellerNoteCount = (strategyData.dealStructureTypes['seller_note'] ?? 0) +
    (strategyData.dealStructureTypes['seller_financing'] ?? 0);
  const sellerNotePercentage = totalDeals > 0 ? sellerNoteCount / totalDeals : 0;

  // Avg multiple paid
  const acquiredBiz = allBiz.filter(b => b.acquisitionPrice > 0 && b.ebitda > 0);
  const avgMultiplePaid = acquiredBiz.length > 0
    ? acquiredBiz.reduce((sum, b) => sum + (b.acquisitionPrice / b.ebitda), 0) / acquiredBiz.length
    : 0;

  // Holdco loan usage
  const holdcoLoanUsed = roundHistory.some(r =>
    r.actions.some(a => a.type === 'take_holdco_loan')
  );

  // Tuck-in count
  const tuckInCount = roundHistory.flatMap(r => r.actions)
    .filter(a => a.type === 'acquire_tuck_in').length;

  // Never-sold count: businesses acquired but never exited
  // totalAcquisitions - totalSells = businesses still held (never sold)
  const neverSoldCount = Math.max(0, strategyData.totalAcquisitions - strategyData.totalSells);

  // Avg hold years for exited businesses
  const exitedWithHold = exitedBusinesses.filter(b => b.exitRound != null && b.acquisitionRound != null);
  const avgHoldYears = exitedWithHold.length > 0
    ? exitedWithHold.reduce((sum, b) => sum + ((b.exitRound ?? 0) - (b.acquisitionRound ?? 0)), 0) / exitedWithHold.length
    : 0;

  // Avg acquisition quality
  const avgAcquisitionQuality = allBiz.length > 0
    ? allBiz.reduce((sum, b) => sum + b.qualityRating, 0) / allBiz.length
    : 3;

  // Platform sectors
  const platformSectors = [...new Set(integratedPlatforms.flatMap(p => p.sectorIds))];

  // Businesses per sector
  const businessesPerSector: Record<string, number> = {};
  for (const b of activeBiz) {
    businessesPerSector[b.sectorId] = (businessesPerSector[b.sectorId] || 0) + 1;
  }

  // Ending sub-types as string array
  const endingSubTypes = activeBiz.map(b => `${b.sectorId}:${b.subType}`);

  // Exited businesses for Section 6
  const exitData = exitedBusinesses
    .filter(b => b.exitPrice != null)
    .map(b => ({
      name: b.name,
      sector: b.sectorId,
      acquisitionPrice: b.acquisitionPrice,
      exitPrice: b.exitPrice ?? 0,
      holdYears: (b.exitRound ?? 0) - (b.acquisitionRound ?? 0),
      moic: b.acquisitionPrice > 0 ? (b.exitPrice ?? 0) / b.acquisitionPrice : 0,
    }));

  // Total exit proceeds
  const totalExitProceeds = exitData.reduce((sum, b) => sum + b.exitPrice, 0);

  // Blended multiple
  const blendedMultiple = totalEbitda > 0 ? enterpriseValue / totalEbitda : 0;

  // Metrics timeline (main game rounds only, not FO)
  const metricsTimeline = metricsHistory.map((h, i) => {
    const roundEvent = roundHistory.find(r => r.round === h.round);
    return {
      round: h.round,
      fev: Math.round(h.metrics.totalEbitda > 0 ? enterpriseValue * currentOwnership : 0), // approximate per-round FEV
      totalEbitda: h.metrics.totalEbitda,
      totalDebt: h.metrics.totalDebt,
      cash: h.metrics.cash ?? 0,
      fcfPerShare: h.metrics.fcfPerShare,
      netDebtToEbitda: h.metrics.netDebtToEbitda,
      distressLevel: h.metrics.distressLevel,
      activeBusinessCount: i === metricsHistory.length - 1 ? activeBiz.length : 0, // only accurate for last round
      totalRevenue: h.metrics.totalRevenue,
      avgEbitdaMargin: h.metrics.avgEbitdaMargin,
      ownershipPct: currentOwnership, // approximate — exact per-round not stored
      eventType: roundEvent?.event?.type ?? null,
      totalDistributions: h.metrics.totalDistributions,
    };
  });

  // Score breakdown
  const scoreBreakdown = isFundManagerMode
    ? { valueCreation: 0, fcfShareGrowth: 0, portfolioRoic: 0, capitalDeployment: 0, balanceSheetHealth: 0, strategicDiscipline: 0 }
    : {
        valueCreation: score.valueCreation,
        fcfShareGrowth: score.fcfShareGrowth,
        portfolioRoic: score.portfolioRoic,
        capitalDeployment: score.capitalDeployment,
        balanceSheetHealth: score.balanceSheetHealth,
        strategicDiscipline: score.strategicDiscipline,
      };

  // ROIIC and FCF conversion
  const roiic = metrics.roiic ?? 0;
  const fcfConversionRate = metrics.cashConversion ?? 0;

  // Reality check caveats
  const realityGaps = selectRealityCaveats({
    peakLeverage: strategyData.peakLeverage,
    turnaroundsStarted: strategyData.turnaroundsStarted,
    platformsForged: strategyData.platformsForged,
    totalSells: strategyData.totalSells,
    recessionAcquisitions: strategyData.recessionAcquisitionCount,
  });

  // Build the playbook
  const playbook: PlaybookData = {
    version: 1,
    generatedAt: new Date().toISOString(),
    ...(isEarlyBankruptcy ? { isMinimal: true } : {}),

    thesis: {
      archetype,
      holdcoName,
      grade: isFundManagerMode ? (peScore?.grade ?? 'F') : score.grade,
      score: isFundManagerMode ? (peScore?.total ?? 0) : score.total,
      fev: Math.round(founderEquityValue),
      adjustedFev,
      difficulty,
      duration,
      seed,
      sophisticationScore: strategyData.sophisticationScore,
      sectorFocus: strategyData.sectorIds,
      isFundManager: isFundManagerMode,
      isBankrupt,
      totalRounds: actualRounds,
      ...(challengeData ? { challengeSeed: String(challengeData.seed) } : {}),
      ...(isFundManagerMode ? { fundName: fundName ?? 'PE Fund' } : {}),
      ...(isFundManagerMode && carryWaterfall ? { carryEarned: carryWaterfall.carry } : {}),
    },

    sectors: {
      endingSectorIds: strategyData.sectorIds,
      allTimeSectorIds,
      endingSubTypes,
      businessesPerSector,
      platformSectors,
    },

    capital: {
      dealStructureTypes: strategyData.dealStructureTypes,
      peakLeverage: Math.round(strategyData.peakLeverage * 10) / 10,
      endingLeverage: Math.round(endingLeverage * 10) / 10,
      peakDistressLevel,
      totalDistributions: Math.round(totalDistributions),
      totalBuybacks: Math.round(totalBuybacks),
      equityRaisesUsed,
      rolloverEquityCount: strategyData.rolloverEquityCount,
      hasRestructured,
      antiPatterns: strategyData.antiPatterns,
      holdcoLoanUsed,
      sellerNotePercentage: Math.round(sellerNotePercentage * 100) / 100,
      avgMultiplePaid: Math.round(avgMultiplePaid * 10) / 10,
    },

    portfolio: {
      totalAcquisitions: strategyData.totalAcquisitions,
      totalSells: strategyData.totalSells,
      activeCount: strategyData.activeCount,
      peakActiveCount: strategyData.peakActiveCount,
      platformsForged: strategyData.platformsForged,
      platformCount: strategyData.platformCount,
      endingConstruction: strategyData.endingConstruction,
      tuckInCount,
      neverSoldCount,
      avgHoldYears: Math.round(avgHoldYears * 10) / 10,
      avgAcquisitionQuality: Math.round(avgAcquisitionQuality * 10) / 10,
      ownershipPercentage: Math.round(currentOwnership * 1000) / 1000,
    },

    operations: {
      turnaroundsStarted: strategyData.turnaroundsStarted,
      turnaroundsSucceeded: strategyData.turnaroundsSucceeded,
      turnaroundsFailed: strategyData.turnaroundsFailed,
      sharedServicesActive,
      maSourcingTier: strategyData.maSourcingTier,
      sourceDealUses: strategyData.sourceDealUses,
      proactiveOutreachUses: strategyData.proactiveOutreachUses,
      smbBrokerUses: strategyData.smbBrokerUses,
      recessionAcquisitionCount: strategyData.recessionAcquisitionCount,
    },

    exits: {
      exitedBusinesses: exitData,
      totalExitProceeds: Math.round(totalExitProceeds),
      blendedMultiple: Math.round(blendedMultiple * 10) / 10,
      portfolioMoic: Math.round(metrics.portfolioMoic * 100) / 100,
    },

    performance: {
      metricsTimeline,
      totalInvestedCapital: Math.round(totalInvestedCapital),
      totalShareholderReturn: Math.round(founderEquityValue + totalDistributions),
      roiic: Math.round(roiic * 1000) / 1000,
      fcfConversionRate: Math.round(fcfConversionRate * 1000) / 1000,
      scoreBreakdown,
    },

    // PE Fund Mode
    ...(isFundManagerMode && carryWaterfall ? (() => {
      const committed = fundSize ?? 100000; // default $100M fund
      const nav = carryWaterfall.liquidationProceeds ?? 0;
      const lpDist = carryWaterfall.lpDistributions ?? 0;
      return {
        peFund: {
          grossMoic: Math.round(carryWaterfall.grossMoic * 100) / 100,
          netIrr: Math.round(carryWaterfall.netIrr * 10000) / 10000,
          dpi: Math.round(lpDist / committed * 100) / 100,
          tvpi: Math.round((lpDist + nav) / committed * 100) / 100,
          rvpi: Math.round(nav / committed * 100) / 100,
          carryEarned: Math.round(carryWaterfall.carry),
          managementFees: Math.round(carryWaterfall.managementFees ?? 0),
          lpSatisfaction: lpSatisfactionScore ?? 0,
          hurdleClearance: carryWaterfall.hurdleCleared ?? false,
          irrMultiplier: carryWaterfall.irrMultiplier ?? 1.0,
          totalFundSize: Math.round(committed),
          totalLpDistributions: Math.round(lpDist),
          peScoreBreakdown: peScore ? {
            returnGeneration: peScore.returnGeneration ?? 0,
            capitalEfficiency: peScore.capitalEfficiency ?? 0,
            valueCreation: peScore.valueCreation ?? 0,
            deployment: peScore.deploymentDiscipline ?? 0,
            riskManagement: peScore.riskManagement ?? 0,
            lpSatisfaction: peScore.lpSatisfaction ?? 0,
          } : {
            returnGeneration: 0, capitalEfficiency: 0, valueCreation: 0,
            deployment: 0, riskManagement: 0, lpSatisfaction: 0,
          },
        },
      };
    })() : {}),

    // Family Office
    ...(familyOfficeState?.legacyScore ? {
      familyOffice: {
        foFev: Math.round(familyOfficeState.legacyScore.foFEV),
        foMoic: Math.round(familyOfficeState.legacyScore.foMOIC * 100) / 100,
        foMultiplier: familyOfficeState.legacyScore.foMultiplier,
        legacyGrade: familyOfficeState.legacyScore.grade,
        philanthropyAmount: Math.round(familyOfficeState.philanthropyDeduction),
        foRounds: 5, // FO is always 5 rounds
        hasRestructuredDuringFo: false, // TODO: track this in FO state
      },
    } : {}),

    // IPO
    ...(ipoState?.isPublic ? {
      ipo: {
        wentPublic: true,
        ipoRound: ipoState.ipoRound,
        roundsAsPublic: actualRounds - ipoState.ipoRound,
        stockPrice: Math.round(ipoState.stockPrice * 100) / 100,
        initialStockPrice: Math.round(ipoState.initialStockPrice * 100) / 100,
        stockPriceChangePct: ipoState.initialStockPrice > 0
          ? Math.round(((ipoState.stockPrice - ipoState.initialStockPrice) / ipoState.initialStockPrice) * 1000) / 1000
          : 0,
        sharesOutstanding: ipoState.sharesOutstanding,
        preIPOShares: ipoState.preIPOShares,
        marketSentiment: Math.round(ipoState.marketSentiment * 1000) / 1000,
        publicCompanyBonus: Math.round(calculatePublicCompanyBonus({ ipoState, businesses } as any) * 1000) / 1000,
        totalShareFundedDeals: ipoState.totalShareFundedDeals ?? 0,
        consecutiveMisses: ipoState.consecutiveMisses,
      },
    } : {}),

    realityCheck: {
      gameToRealityGaps: realityGaps,
    },
  };

  return playbook;
}

/** Get explanatory text for an anti-pattern */
export function getAntiPatternText(pattern: string): string {
  return ANTI_PATTERN_TEXT[pattern] ?? '';
}
