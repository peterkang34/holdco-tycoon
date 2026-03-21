/**
 * Shared test helpers and mock factories for Holdco Tycoon engine tests
 */
import {
  GameState,
  Business,
  Deal,
  DealStructure,
  QualityRating,
  SectorId,
  GamePhase,
  DueDiligenceSignals,
} from '../types';
import { initializeSharedServices } from '../../data/sharedServices';

export function createMockBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz_test_1',
    name: 'Test Agency Co',
    sectorId: 'agency',
    subType: 'Digital/Ecommerce Agency',
    ebitda: 1000,
    peakEbitda: 1000,
    acquisitionEbitda: 1000,
    acquisitionPrice: 4000,
    acquisitionRound: 1,
    acquisitionMultiple: 4.0,
    acquisitionSizeTierPremium: 0,
    organicGrowthRate: 0.05,
    revenue: 5000,
    ebitdaMargin: 0.20,
    acquisitionRevenue: 5000,
    acquisitionMargin: 0.20,
    peakRevenue: 5000,
    revenueGrowthRate: 0.05,
    marginDriftRate: -0.005,
    qualityRating: 3,
    dueDiligence: createMockDueDiligence(),
    integrationRoundsRemaining: 0,
    integrationGrowthDrag: 0,
    improvements: [],
    sellerNoteBalance: 0,
    sellerNoteRate: 0,
    sellerNoteRoundsRemaining: 0,
    bankDebtBalance: 0,
    bankDebtRate: 0,
    bankDebtRoundsRemaining: 0,
    earnoutRemaining: 0,
    earnoutTarget: 0,
    status: 'active',
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: 4000,
    cashEquityInvested: 4000,
    qualityImprovedTiers: 0,
    rolloverEquityPct: 0,
    priorOwnershipCount: 0,
    ...overrides,
  };
}

export function createMockDueDiligence(overrides: Partial<DueDiligenceSignals> = {}): DueDiligenceSignals {
  return {
    revenueConcentration: 'medium',
    revenueConcentrationText: 'Some customer concentration',
    operatorQuality: 'moderate',
    operatorQualityText: 'Decent team, some gaps',
    trend: 'flat',
    trendText: 'Stable but not growing',
    customerRetention: 85,
    customerRetentionText: '85% annual retention',
    competitivePosition: 'competitive',
    competitivePositionText: 'Solid competitive position',
    ...overrides,
  };
}

export function createMockDeal(overrides: Partial<Deal> = {}): Deal {
  const business = createMockBusiness();
  return {
    id: 'deal_test_1',
    business: {
      name: business.name,
      sectorId: business.sectorId,
      subType: business.subType,
      ebitda: business.ebitda,
      peakEbitda: business.peakEbitda,
      acquisitionEbitda: business.acquisitionEbitda,
      acquisitionPrice: business.acquisitionPrice,
      acquisitionMultiple: business.acquisitionMultiple,
      acquisitionSizeTierPremium: business.acquisitionSizeTierPremium,
      organicGrowthRate: business.organicGrowthRate,
      revenue: business.revenue,
      ebitdaMargin: business.ebitdaMargin,
      acquisitionRevenue: business.acquisitionRevenue,
      acquisitionMargin: business.acquisitionMargin,
      peakRevenue: business.peakRevenue,
      revenueGrowthRate: business.revenueGrowthRate,
      marginDriftRate: business.marginDriftRate,
      qualityRating: business.qualityRating,
      dueDiligence: business.dueDiligence,
      integrationRoundsRemaining: business.integrationRoundsRemaining,
      integrationGrowthDrag: business.integrationGrowthDrag,
      sellerNoteBalance: business.sellerNoteBalance,
      sellerNoteRate: business.sellerNoteRate,
      sellerNoteRoundsRemaining: business.sellerNoteRoundsRemaining,
      bankDebtBalance: business.bankDebtBalance,
      bankDebtRate: business.bankDebtRate,
      bankDebtRoundsRemaining: business.bankDebtRoundsRemaining,
      earnoutRemaining: business.earnoutRemaining,
      earnoutTarget: business.earnoutTarget,
      isPlatform: business.isPlatform,
      platformScale: business.platformScale,
      boltOnIds: business.boltOnIds,
      synergiesRealized: business.synergiesRealized,
      totalAcquisitionCost: business.totalAcquisitionCost,
      cashEquityInvested: business.cashEquityInvested,
      rolloverEquityPct: business.rolloverEquityPct,
      priorOwnershipCount: business.priorOwnershipCount,
    },
    askingPrice: 4000,
    freshness: 2,
    roundAppeared: 1,
    source: 'inbound',
    acquisitionType: 'standalone',
    heat: 'warm',
    effectivePrice: 4000,
    ...overrides,
  };
}

export function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    holdcoName: 'Test Holdco',
    round: 1,
    phase: 'allocate' as GamePhase,
    gameOver: false,
    businesses: [createMockBusiness()],
    exitedBusinesses: [],
    cash: 16000, // $16M after first acquisition
    totalDebt: 0,
    holdcoLoanBalance: 0,
    holdcoLoanRate: 0,
    holdcoLoanRoundsRemaining: 0,
    interestRate: 0.07,
    sharesOutstanding: 1000,
    founderShares: 800,
    initialRaiseAmount: 20000,
    initialOwnershipPct: 0.80,
    totalInvestedCapital: 4000,
    totalDistributions: 0,
    totalBuybacks: 0,
    totalExitProceeds: 0,
    equityRaisesUsed: 0,
    lastEquityRaiseRound: 0,
    lastBuybackRound: 0,
    sharedServices: initializeSharedServices(),
    dealPipeline: [],
    passedDealIds: [],
    maFocus: { sectorId: null, sizePreference: 'any', subType: null },
    maSourcing: { tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 },
    currentEvent: null,
    pendingProSportsEvent: null,
    eventHistory: [],
    creditTighteningRoundsRemaining: 0,
    inflationRoundsRemaining: 0,
    metricsHistory: [],
    roundHistory: [],
    actionsThisRound: [],
    debtPaymentThisRound: 0,
    cashBeforeDebtPayments: 0,
    holdcoDebtStartRound: 0,
    requiresRestructuring: false,
    covenantBreachRounds: 0,
    hasRestructured: false,
    acquisitionsThisRound: 0,
    maxAcquisitionsPerRound: 2,
    lastAcquisitionResult: null,
    lastIntegrationOutcome: null,
    exitMultiplePenalty: 0,
    difficulty: 'easy',
    duration: 'standard',
    maxRounds: 20,
    integratedPlatforms: [],
    turnaroundTier: 0,
    activeTurnarounds: [],
    founderDistributionsReceived: 0,
    isChallenge: false,
    seed: 42,
    dealInflationState: { crisisResetRoundsRemaining: 0 },
    ipoState: null,
    familyOfficeState: null,
    ...overrides,
  };
}

export function createMockDealStructure(overrides: Partial<DealStructure> = {}): DealStructure {
  return {
    type: 'all_cash',
    cashRequired: 4000,
    leverage: 0,
    risk: 'low',
    ...overrides,
  };
}

/** Create a PE Fund Mode game state with LP distributions, fund metrics, etc. */
export function createPEFundState(overrides: Partial<GameState> = {}): GameState {
  const businesses = [
    createMockBusiness({
      id: 'pe_biz_1',
      name: 'PE Portfolio Co 1',
      sectorId: 'b2bServices',
      ebitda: 3000,
      peakEbitda: 3000,
      acquisitionEbitda: 2500,
      acquisitionPrice: 12000,
      revenue: 15000,
      ebitdaMargin: 0.20,
      acquisitionRevenue: 12500,
      acquisitionMargin: 0.20,
      peakRevenue: 15000,
      totalAcquisitionCost: 12000,
      cashEquityInvested: 8000,
      bankDebtBalance: 4000,
      bankDebtRate: 0.06,
      bankDebtRoundsRemaining: 5,
      qualityRating: 4 as QualityRating,
    }),
    createMockBusiness({
      id: 'pe_biz_2',
      name: 'PE Portfolio Co 2',
      sectorId: 'healthcare',
      ebitda: 5000,
      peakEbitda: 5000,
      acquisitionEbitda: 4000,
      acquisitionPrice: 25000,
      revenue: 25000,
      ebitdaMargin: 0.20,
      acquisitionRevenue: 20000,
      acquisitionMargin: 0.20,
      peakRevenue: 25000,
      totalAcquisitionCost: 25000,
      cashEquityInvested: 15000,
      bankDebtBalance: 10000,
      bankDebtRate: 0.055,
      bankDebtRoundsRemaining: 7,
      qualityRating: 3 as QualityRating,
    }),
  ];

  return createMockGameState({
    businesses,
    isFundManagerMode: true,
    fundName: 'Test Fund I',
    fundSize: 100000,
    cash: 60000,
    totalDebt: 14000, // holdco + bank debt
    totalInvestedCapital: 23000,
    totalCapitalDeployed: 23000,
    lpDistributions: 15000,
    lpSatisfactionScore: 70,
    managementFeesCollected: 4000,
    fundCashFlows: [
      { round: 1, amount: -23000 },
      { round: 3, amount: 15000 },
    ],
    dpiMilestones: { half: false, full: false },
    lpCommentary: [],
    round: 5,
    maxRounds: 10,
    duration: 'quick',
    difficulty: 'normal',
    initialRaiseAmount: 100000,
    initialOwnershipPct: 1.0,
    founderShares: 1000,
    sharesOutstanding: 1000,
    ...overrides,
  });
}

/** Create a state heavy on debt — holdco loan + bank debt + seller notes + earnouts */
export function createDebtHeavyState(overrides: Partial<GameState> = {}): GameState {
  const businesses = [
    createMockBusiness({
      id: 'debt_biz_1',
      name: 'Leveraged Co 1',
      sectorId: 'industrial',
      ebitda: 2000,
      peakEbitda: 2000,
      acquisitionEbitda: 1800,
      acquisitionPrice: 8000,
      revenue: 10000,
      ebitdaMargin: 0.20,
      acquisitionRevenue: 9000,
      acquisitionMargin: 0.20,
      peakRevenue: 10000,
      totalAcquisitionCost: 8000,
      cashEquityInvested: 4000,
      bankDebtBalance: 2000,
      bankDebtRate: 0.065,
      bankDebtRoundsRemaining: 5,
      sellerNoteBalance: 1500,
      sellerNoteRate: 0.08,
      sellerNoteRoundsRemaining: 4,
      earnoutRemaining: 500,
      earnoutTarget: 0.10,
      qualityRating: 3 as QualityRating,
    }),
    createMockBusiness({
      id: 'debt_biz_2',
      name: 'Leveraged Co 2',
      sectorId: 'consumer',
      ebitda: 1500,
      peakEbitda: 1500,
      acquisitionEbitda: 1500,
      acquisitionPrice: 6000,
      revenue: 7500,
      ebitdaMargin: 0.20,
      acquisitionRevenue: 7500,
      acquisitionMargin: 0.20,
      peakRevenue: 7500,
      totalAcquisitionCost: 6000,
      cashEquityInvested: 3500,
      bankDebtBalance: 1500,
      bankDebtRate: 0.07,
      bankDebtRoundsRemaining: 4,
      sellerNoteBalance: 1000,
      sellerNoteRate: 0.09,
      sellerNoteRoundsRemaining: 3,
      qualityRating: 3 as QualityRating,
    }),
  ];

  return createMockGameState({
    businesses,
    cash: 3000,
    totalDebt: 3500 + 2000 + 1500, // holdcoLoan + bankDebt1 + bankDebt2
    holdcoLoanBalance: 3500,
    holdcoLoanRate: 0.07,
    holdcoLoanRoundsRemaining: 5,
    totalInvestedCapital: 7500,
    round: 3,
    interestRate: 0.07,
    ...overrides,
  });
}

/** Create a complex portfolio state — 6+ businesses triggering complexity cost + shared services */
export function createComplexPortfolioState(overrides: Partial<GameState> = {}): GameState {
  const sectors: SectorId[] = ['agency', 'saas', 'homeServices', 'consumer', 'industrial', 'b2bServices', 'healthcare'];
  const businesses: Business[] = [];

  for (let i = 0; i < 7; i++) {
    const ebitda = 800 + i * 300;
    const margin = 0.18 + (i % 3) * 0.02;
    const rev = Math.round(ebitda / margin);
    businesses.push(
      createMockBusiness({
        id: `complex_biz_${i + 1}`,
        name: `Complex Co ${i + 1}`,
        sectorId: sectors[i],
        ebitda,
        peakEbitda: ebitda,
        acquisitionEbitda: ebitda,
        acquisitionPrice: ebitda * 4,
        revenue: rev,
        ebitdaMargin: margin,
        acquisitionRevenue: rev,
        acquisitionMargin: margin,
        peakRevenue: rev,
        totalAcquisitionCost: ebitda * 4,
        cashEquityInvested: ebitda * 4,
        qualityRating: (3 + (i % 3)) as QualityRating,
      })
    );
  }

  const totalInvested = businesses.reduce((sum, b) => sum + b.acquisitionPrice, 0);

  // Activate 2 shared services to test complexity offset
  const ss = initializeSharedServices();
  ss[0].active = true; // finance_reporting
  ss[2].active = true; // procurement

  return createMockGameState({
    businesses,
    sharedServices: ss,
    cash: 50000 - totalInvested,
    totalInvestedCapital: totalInvested,
    initialRaiseAmount: 50000,
    round: 5,
    ...overrides,
  });
}

/** Create a game state with multiple businesses for testing portfolio-level calculations */
export function createMultiBusinessState(count: number = 3): GameState {
  const businesses: Business[] = [];
  const sectors: SectorId[] = ['agency', 'saas', 'homeServices', 'consumer', 'industrial'];

  for (let i = 0; i < count; i++) {
    const ebitda = 1000 + i * 500;
    const margin = 0.20;
    const rev = Math.round(ebitda / margin);
    businesses.push(
      createMockBusiness({
        id: `biz_${i + 1}`,
        name: `Business ${i + 1}`,
        sectorId: sectors[i % sectors.length],
        ebitda,
        peakEbitda: ebitda,
        acquisitionEbitda: ebitda,
        acquisitionPrice: ebitda * 4,
        qualityRating: (3 + (i % 3)) as QualityRating,
        revenue: rev,
        ebitdaMargin: margin,
        acquisitionRevenue: rev,
        acquisitionMargin: margin,
        peakRevenue: rev,
        revenueGrowthRate: 0.05,
        marginDriftRate: -0.005,
      })
    );
  }

  const totalInvested = businesses.reduce((sum, b) => sum + b.acquisitionPrice, 0);

  return createMockGameState({
    businesses,
    cash: 20000 - totalInvested,
    totalInvestedCapital: totalInvested,
  });
}
