import { describe, it, expect } from 'vitest';
import { buildPlaybook, type PlaybookBuilderInput } from '../../utils/playbookBuilder';
import type { Business, HistoricalMetrics, Metrics, ScoreBreakdown } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    cash: 5000, totalDebt: 10000, totalEbitda: 8000, totalFcf: 3000,
    fcfPerShare: 30, portfolioRoic: 0.15, roiic: 0.20, portfolioMoic: 2.5,
    netDebtToEbitda: 1.25, distressLevel: 'comfortable',
    cashConversion: 0.85, interestRate: 0.06, sharesOutstanding: 100,
    intrinsicValuePerShare: 500, totalInvestedCapital: 20000,
    totalDistributions: 5000, totalBuybacks: 0, totalExitProceeds: 10000,
    totalRevenue: 40000, avgEbitdaMargin: 0.20,
    ...overrides,
  };
}

function makeScore(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    total: 72, grade: 'B',
    valueCreation: 14, fcfShareGrowth: 12, portfolioRoic: 10,
    capitalDeployment: 12, balanceSheetHealth: 12, strategicDiscipline: 12,
    ...overrides,
  } as ScoreBreakdown;
}

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz-1', name: 'Test Co', sectorId: 'businessServices' as any,
    subType: 'IT Staffing', ebitda: 2000, peakEbitda: 2500,
    acquisitionEbitda: 1500, acquisitionPrice: 7500, acquisitionRound: 2,
    acquisitionMultiple: 5.0, acquisitionSizeTierPremium: 0,
    organicGrowthRate: 0.05, revenue: 10000, ebitdaMargin: 0.20,
    acquisitionRevenue: 7500, acquisitionMargin: 0.20,
    peakRevenue: 12000, revenueGrowthRate: 0.05, marginDriftRate: 0,
    qualityRating: 3 as any, dueDiligence: {} as any,
    integrationRoundsRemaining: 0, integrationGrowthDrag: 0,
    improvements: [], sellerNoteBalance: 0, sellerNoteRate: 0,
    sellerNoteRoundsRemaining: 0, bankDebtBalance: 0, bankDebtRate: 0,
    bankDebtRoundsRemaining: 0, earnoutRemaining: 0, earnoutTarget: 0,
    status: 'active', isPlatform: false, platformScale: 0, boltOnIds: [],
    ...overrides,
  } as Business;
}

function makeHistoricalMetrics(round: number): HistoricalMetrics {
  return {
    round,
    metrics: makeMetrics(),
    fcf: 3000,
    nopat: 6000,
    investedCapital: 20000,
  };
}

function makeBaseInput(overrides: Partial<PlaybookBuilderInput> = {}): PlaybookBuilderInput {
  return {
    holdcoName: 'Test Holdings',
    difficulty: 'normal',
    duration: 'standard',
    seed: 12345,
    maxRounds: 20,
    score: makeScore(),
    enterpriseValue: 50000,
    founderEquityValue: 45000,
    founderPersonalWealth: 10000,
    cash: 5000,
    totalDebt: 10000,
    totalDistributions: 5000,
    totalBuybacks: 0,
    totalInvestedCapital: 20000,
    equityRaisesUsed: 0,
    sharedServicesActive: 2,
    founderShares: 100,
    sharesOutstanding: 100,
    initialOwnershipPct: 1.0,
    hasRestructured: false,
    businesses: [makeBusiness()],
    exitedBusinesses: [makeBusiness({ id: 'biz-2', status: 'sold', exitPrice: 12000, exitRound: 15 })],
    metricsHistory: [makeHistoricalMetrics(1), makeHistoricalMetrics(5), makeHistoricalMetrics(10), makeHistoricalMetrics(20)],
    integratedPlatforms: [],
    metrics: makeMetrics(),
    strategyData: {
      archetype: 'focused_operator',
      totalAcquisitions: 3,
      totalSells: 1,
      turnaroundsStarted: 0,
      turnaroundsSucceeded: 0,
      turnaroundsFailed: 0,
      peakLeverage: 2.1,
      peakDistressLevel: 1,
      sectorIds: ['businessServices'],
      allTimeSectorCount: 1,
      dealStructureTypes: { cash: 2, seller_note: 1 },
      rolloverEquityCount: 0,
      activeCount: 2,
      peakActiveCount: 3,
      platformCount: 0,
      platformsForged: 0,
      antiPatterns: [],
      sophisticationScore: 45,
      endingSubTypes: { 'businessServices:IT Staffing': 1 },
      endingConstruction: { standalone: 2 },
      maSourcingTier: 1,
      sourceDealUses: 2,
      proactiveOutreachUses: 1,
      smbBrokerUses: 0,
      recessionAcquisitionCount: 0,
    },
    isFundManagerMode: false,
    roundHistory: [
      { round: 1, event: null, actions: [{ type: 'acquire' }] },
      { round: 5, event: { type: 'global_recession' }, actions: [{ type: 'acquire' }] },
      { round: 10, event: null, actions: [{ type: 'sell' }] },
    ],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('buildPlaybook', () => {
  it('returns a valid PlaybookData for a standard game', () => {
    const result = buildPlaybook(makeBaseInput());
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.thesis.holdcoName).toBe('Test Holdings');
    expect(result!.thesis.archetype).toBe('focused_operator');
    expect(result!.thesis.isBankrupt).toBe(false);
    expect(result!.thesis.isFundManager).toBe(false);
    expect(result!.thesis.seed).toBe(12345);
  });

  it('populates all 7 sections + reality check', () => {
    const result = buildPlaybook(makeBaseInput())!;
    expect(result.thesis).toBeDefined();
    expect(result.sectors).toBeDefined();
    expect(result.capital).toBeDefined();
    expect(result.portfolio).toBeDefined();
    expect(result.operations).toBeDefined();
    expect(result.exits).toBeDefined();
    expect(result.performance).toBeDefined();
    expect(result.realityCheck).toBeDefined();
    expect(result.realityCheck.gameToRealityGaps.length).toBeGreaterThanOrEqual(2);
  });

  it('computes adjusted FEV correctly', () => {
    const result = buildPlaybook(makeBaseInput())!;
    // Normal difficulty, no restructuring, no FO → multiplier from DIFFICULTY_CONFIG
    expect(result.thesis.adjustedFev).toBeDefined();
    expect(typeof result.thesis.adjustedFev).toBe('number');
  });

  it('forces archetype to bankrupt for bankrupt games', () => {
    const result = buildPlaybook(makeBaseInput({ bankruptRound: 8 }))!;
    expect(result.thesis.archetype).toBe('bankrupt');
    expect(result.thesis.isBankrupt).toBe(true);
  });

  it('marks early bankruptcy as minimal', () => {
    const result = buildPlaybook(makeBaseInput({ bankruptRound: 2 }))!;
    expect(result.isMinimal).toBe(true);
    expect(result.thesis.archetype).toBe('bankrupt');
    expect(result.thesis.totalRounds).toBe(2);
  });

  it('forces inactive_gp for PE fund with 0 acquisitions', () => {
    const result = buildPlaybook(makeBaseInput({
      isFundManagerMode: true,
      fundName: 'Dead Fund',
      strategyData: {
        ...makeBaseInput().strategyData,
        archetype: 'value_investor',
        totalAcquisitions: 0,
      },
    }))!;
    expect(result.thesis.archetype).toBe('inactive_gp');
    expect(result.thesis.isFundManager).toBe(true);
  });

  it('includes PE fund data when in fund manager mode', () => {
    const result = buildPlaybook(makeBaseInput({
      isFundManagerMode: true,
      fundName: 'Alpha Fund',
      fundSize: 100000,
      peScore: {
        returnGeneration: 20, capitalEfficiency: 15, valueCreation: 12,
        deploymentDiscipline: 10, riskManagement: 12, lpSatisfaction: 8,
        total: 77, grade: 'B', gradeTitle: 'Competent GP',
      },
      carryWaterfall: {
        grossTotalReturns: 150000, returnOfCapital: 100000, hurdleAmount: 8000,
        hurdleCleared: true, aboveHurdle: 42000, carry: 8400, baseCarry: 8400,
        irrMultiplier: 1.0, managementFees: 20000, totalGpEconomics: 28400,
        grossMoic: 1.5, netIrr: 0.12, dpi: 1.2, lpDistributions: 120000,
        liquidationProceeds: 30000,
      },
      lpSatisfactionScore: 75,
      strategyData: {
        ...makeBaseInput().strategyData,
        totalAcquisitions: 5,
      },
    }))!;
    expect(result.peFund).toBeDefined();
    expect(result.peFund!.grossMoic).toBe(1.5);
    expect(result.peFund!.carryEarned).toBe(8400);
    expect(result.peFund!.totalFundSize).toBe(100000);
    expect(result.peFund!.peScoreBreakdown.returnGeneration).toBe(20);
  });

  it('includes family office data when FO completed', () => {
    const result = buildPlaybook(makeBaseInput({
      familyOfficeState: {
        isActive: false,
        foStartingCash: 50000,
        philanthropyDeduction: 12500,
        foMultiplier: 1.3,
        legacyScore: {
          total: 130, grade: 'Influential', foFEV: 65000, foStartingCash: 50000,
          foMOIC: 1.3, foMultiplier: 1.3,
        },
      },
    }))!;
    expect(result.familyOffice).toBeDefined();
    expect(result.familyOffice!.legacyGrade).toBe('Influential');
    expect(result.familyOffice!.foMoic).toBe(1.3);
  });

  it('includes IPO data when player went public', () => {
    const result = buildPlaybook(makeBaseInput({
      ipoState: {
        isPublic: true, stockPrice: 25.50, sharesOutstanding: 1000,
        preIPOShares: 800, marketSentiment: 0.15, earningsExpectations: 3000,
        ipoRound: 12, initialStockPrice: 20, consecutiveMisses: 0,
        shareFundedDealsThisRound: 1, totalShareFundedDeals: 3,
      },
    }))!;
    expect(result.ipo).toBeDefined();
    expect(result.ipo!.wentPublic).toBe(true);
    expect(result.ipo!.ipoRound).toBe(12);
    expect(result.ipo!.totalShareFundedDeals).toBe(3);
    expect(result.ipo!.publicCompanyBonus).toBeGreaterThan(0);
    expect(result.ipo!.stockPriceChangePct).toBeCloseTo(0.275, 2);
    expect(result.ipo!.roundsAsPublic).toBe(8); // 20 - 12
  });

  it('includes challenge seed when in challenge mode', () => {
    const result = buildPlaybook(makeBaseInput({
      challengeData: { seed: 99999 },
    }))!;
    expect(result.thesis.challengeSeed).toBe('99999');
  });

  it('computes capital structure metrics', () => {
    const result = buildPlaybook(makeBaseInput())!;
    expect(result.capital.sellerNotePercentage).toBeCloseTo(0.33, 1);
    expect(result.capital.avgMultiplePaid).toBeGreaterThan(0);
    expect(typeof result.capital.holdcoLoanUsed).toBe('boolean');
  });

  it('computes portfolio metrics', () => {
    const result = buildPlaybook(makeBaseInput())!;
    expect(result.portfolio.ownershipPercentage).toBe(1);
    expect(result.portfolio.avgAcquisitionQuality).toBeGreaterThan(0);
    expect(result.portfolio.neverSoldCount).toBeGreaterThan(0);
  });

  it('builds metrics timeline from metricsHistory', () => {
    const result = buildPlaybook(makeBaseInput())!;
    expect(result.performance.metricsTimeline.length).toBe(4);
    expect(result.performance.metricsTimeline[0].round).toBe(1);
    expect(result.performance.metricsTimeline[0].distressLevel).toBe('comfortable');
  });

  it('includes anti-pattern explanations', () => {
    const result = buildPlaybook(makeBaseInput({
      strategyData: {
        ...makeBaseInput().strategyData,
        antiPatterns: ['over_leveraged', 'spray_and_pray'],
      },
    }))!;
    expect(result.capital.antiPatterns).toContain('over_leveraged');
    expect(result.capital.antiPatterns).toContain('spray_and_pray');
  });

  it('returns null (not throws) on invalid input', () => {
    const result = buildPlaybook({} as any);
    expect(result).toBeNull();
  });

  it('does not include peFund for holdco mode', () => {
    const result = buildPlaybook(makeBaseInput())!;
    expect(result.peFund).toBeUndefined();
  });

  it('does not include familyOffice when not completed', () => {
    const result = buildPlaybook(makeBaseInput())!;
    expect(result.familyOffice).toBeUndefined();
  });

  it('does not include ipo when not public', () => {
    const result = buildPlaybook(makeBaseInput())!;
    expect(result.ipo).toBeUndefined();
  });

  it('selects reality check caveats based on game state', () => {
    const result = buildPlaybook(makeBaseInput({
      strategyData: {
        ...makeBaseInput().strategyData,
        turnaroundsStarted: 3,
        platformsForged: 2,
      },
    }))!;
    // Should always have time_compression and deal_flow, plus turnaround and integration
    expect(result.realityCheck.gameToRealityGaps.length).toBeGreaterThanOrEqual(3);
  });
});
