/**
 * Shared test helpers and mock factories for Holdco Tycoon engine tests
 */
import {
  GameState,
  Business,
  Deal,
  DealStructure,
  SharedService,
  QualityRating,
  SectorId,
  GamePhase,
  DueDiligenceSignals,
  Metrics,
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
    improvements: [],
    sellerNoteBalance: 0,
    sellerNoteRate: 0,
    sellerNoteRoundsRemaining: 0,
    bankDebtBalance: 0,
    earnoutRemaining: 0,
    earnoutTarget: 0,
    status: 'active',
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: 4000,
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
      sellerNoteBalance: business.sellerNoteBalance,
      sellerNoteRate: business.sellerNoteRate,
      sellerNoteRoundsRemaining: business.sellerNoteRoundsRemaining,
      bankDebtBalance: business.bankDebtBalance,
      earnoutRemaining: business.earnoutRemaining,
      earnoutTarget: business.earnoutTarget,
      isPlatform: business.isPlatform,
      platformScale: business.platformScale,
      boltOnIds: business.boltOnIds,
      synergiesRealized: business.synergiesRealized,
      totalAcquisitionCost: business.totalAcquisitionCost,
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
    sharedServices: initializeSharedServices(),
    dealPipeline: [],
    maFocus: { sectorId: null, sizePreference: 'any', subType: null },
    maSourcing: { tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 },
    currentEvent: null,
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
    difficulty: 'easy',
    duration: 'standard',
    maxRounds: 20,
    founderDistributionsReceived: 0,
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
