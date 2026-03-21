/**
 * #/go-test — Game Over test shortcut
 * Sets up mock game state and navigates to the game over screen for visual testing.
 * Variants: ?v=holdco (default), ?v=pe, ?v=bankrupt, ?v=pe-bankrupt
 */
import { useGameStore } from '../hooks/useGame';
import { calculateMetrics } from '../engine/simulation';
import { calculateFinalScore, calculatePEFundScore, calculateCarryWaterfall } from '../engine/scoring';
import type { Business, GameState, Metrics, HistoricalMetrics, RoundHistoryEntry, GameAction } from '../engine/types';

function makeBusiness(overrides: Partial<Business> & { id: string; name: string; sectorId: string }): Business {
  return {
    subType: 'General',
    ebitda: 2000,
    peakEbitda: 2500,
    acquisitionEbitda: 1000,
    acquisitionPrice: 5000,
    acquisitionRound: 2,
    acquisitionMultiple: 5.0,
    acquisitionSizeTierPremium: 0,
    organicGrowthRate: 0.05,
    revenue: 10000,
    ebitdaMargin: 0.20,
    acquisitionRevenue: 5000,
    acquisitionMargin: 0.20,
    peakRevenue: 12000,
    revenueGrowthRate: 0.06,
    marginDriftRate: -0.005,
    qualityRating: 4,
    dueDiligence: {
      revenueConcentration: 'low', revenueConcentrationText: 'Diversified client base',
      operatorQuality: 'strong', operatorQualityText: 'Experienced management team',
      trend: 'growing', trendText: 'Revenue growing steadily',
      customerRetention: 90, customerRetentionText: '90% annual retention rate',
      competitivePosition: 'leader', competitivePositionText: 'Market leader in region',
    },
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
    totalAcquisitionCost: 5000,
    cashEquityInvested: 3000,
    rolloverEquityPct: 0,
    priorOwnershipCount: 0,
    ...overrides,
  };
}

function makeHistory(rounds: number, metrics: Metrics): HistoricalMetrics[] {
  return Array.from({ length: rounds }, (_, i) => ({
    round: i + 1,
    metrics: { ...metrics, totalEbitda: metrics.totalEbitda * (0.5 + 0.5 * (i / rounds)) },
    fcf: metrics.totalFcf * (0.5 + 0.5 * (i / rounds)),
    nopat: metrics.totalEbitda * 0.75 * (0.5 + 0.5 * (i / rounds)),
    investedCapital: 15000,
  }));
}

function makeRoundHistory(rounds: number, isBankrupt: boolean, metrics: Metrics): RoundHistoryEntry[] {
  const actions: GameAction[] = isBankrupt ? [] : [
    { type: 'acquire', round: 1, details: { businessId: 'test-1', dealStructure: 'cash' } },
    { type: 'acquire', round: 3, details: { businessId: 'test-2', dealStructure: 'bank_debt' } },
    { type: 'acquire', round: 5, details: { businessId: 'test-3', dealStructure: 'seller_note' } },
    { type: 'acquire', round: 7, details: { businessId: 'test-sold', dealStructure: 'rollover_equity' } },
    { type: 'sell', round: 12, details: { businessId: 'test-sold' } },
    { type: 'start_turnaround', round: 4, details: { businessId: 'test-3', program: 'operational_excellence' } },
    { type: 'start_turnaround', round: 6, details: { businessId: 'test-2', program: 'revenue_acceleration' } },
    { type: 'start_turnaround', round: 8, details: { businessId: 'test-1', program: 'margin_recovery' } },
    { type: 'turnaround_resolved', round: 7, details: { businessId: 'test-3', outcome: 'success' } },
    { type: 'turnaround_resolved', round: 9, details: { businessId: 'test-2', outcome: 'success' } },
    { type: 'distribute', round: 10, details: { amount: 5000 } },
  ];

  return Array.from({ length: rounds }, (_, i) => ({
    round: i + 1,
    actions: actions.filter(a => a.round === i + 1),
    chronicle: null,
    event: null,
    metrics: { ...metrics, totalEbitda: metrics.totalEbitda * (0.5 + 0.5 * (i / rounds)) },
    businessCount: isBankrupt ? 0 : 3,
    cash: isBankrupt ? -500 : 8000,
    totalDebt: isBankrupt ? 15000 : 7000,
  }));
}

export type GoTestVariant = 'holdco' | 'pe' | 'bankrupt' | 'pe-bankrupt';

export function getGoTestVariant(): GoTestVariant {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('v');
  if (v === 'pe' || v === 'bankrupt' || v === 'pe-bankrupt') return v;
  return 'holdco';
}

export function setupGoTest(variant: GoTestVariant): {
  score: ReturnType<typeof calculateFinalScore> | ReturnType<typeof calculatePEFundScore>;
  carryWaterfall: ReturnType<typeof calculateCarryWaterfall> | undefined;
} {
  const isFundManager = variant === 'pe' || variant === 'pe-bankrupt';
  const isBankrupt = variant === 'bankrupt' || variant === 'pe-bankrupt';

  // Start a real game to initialize all state fields properly
  const store = useGameStore.getState();
  if (isFundManager) {
    store.startGame('Test PE Fund', undefined, 'easy', 'quick', 42, true, 'Blackrock Capital Partners II');
  } else {
    store.startGame('Apex Holdings', 'agency', 'normal', 'standard', 42);
  }

  const businesses: Business[] = isBankrupt ? [] : [
    makeBusiness({
      id: 'test-1',
      name: 'Meridian Digital',
      sectorId: 'agency',
      subType: 'Digital/Ecommerce Agency',
      ebitda: 3500,
      peakEbitda: 4000,
      revenue: 17500,
      ebitdaMargin: 0.20,
      acquisitionRound: 1,
      qualityRating: 4,
      isPlatform: true,
      platformScale: 2,
    }),
    makeBusiness({
      id: 'test-2',
      name: 'Summit Logistics',
      sectorId: 'distribution',
      subType: 'Regional Distributor',
      ebitda: 5000,
      peakEbitda: 5500,
      acquisitionEbitda: 75000,
      revenue: 25000,
      ebitdaMargin: 0.20,
      acquisitionRound: 3,
      acquisitionPrice: 20000,
      totalAcquisitionCost: 20000,
      cashEquityInvested: 12000,
      qualityRating: 5,
      bankDebtBalance: 5000,
      bankDebtRate: 0.06,
      bankDebtRoundsRemaining: 5,
    }),
    makeBusiness({
      id: 'test-3',
      name: 'Pacific Insurance Brokerage',
      sectorId: 'insurance',
      subType: 'Property & Casualty Broker',
      ebitda: 2000,
      peakEbitda: 2200,
      revenue: 8000,
      ebitdaMargin: 0.25,
      acquisitionRound: 5,
      acquisitionPrice: 12000,
      totalAcquisitionCost: 12000,
      cashEquityInvested: 7000,
      qualityRating: 3,
    }),
  ];

  const exitedBusinesses: Business[] = isBankrupt ? [] : [
    makeBusiness({
      id: 'test-sold',
      name: 'Coastal HVAC Supply',
      sectorId: 'homeServices',
      subType: 'HVAC Services',
      ebitda: 1800,
      status: 'sold',
      exitPrice: 12000,
      exitRound: 12,
      acquisitionPrice: 4000,
      totalAcquisitionCost: 4000,
      cashEquityInvested: 2500,
    }),
  ];

  const maxRounds = isFundManager ? 10 : 20;
  const round = isBankrupt ? (isFundManager ? 4 : 8) : maxRounds;

  // Build partial state update
  const stateUpdate: Partial<GameState> = {
    businesses,
    exitedBusinesses,
    round,
    gameOver: true,
    bankruptRound: isBankrupt ? round : undefined,
    cash: isBankrupt ? -500 : 8000,
    totalDebt: isBankrupt ? 15000 : 7000,
    holdcoLoanBalance: isBankrupt ? 10000 : 0,
    totalInvestedCapital: 37000,
    founderDistributionsReceived: isBankrupt ? 0 : 25000,
    totalBuybacks: isBankrupt ? 0 : 3000,
    equityRaisesUsed: 0,
    sharedServices: [
      {
        type: 'finance_reporting' as const,
        name: 'Finance & Reporting',
        unlockCost: 500,
        annualCost: 200,
        description: 'Centralized finance',
        effect: '+5% cash conversion',
        unlockedRound: 3,
        active: true,
      },
      {
        type: 'procurement' as const,
        name: 'Procurement',
        unlockCost: 400,
        annualCost: 150,
        description: 'Centralized procurement',
        effect: 'Reduce capex',
        unlockedRound: 5,
        active: true,
      },
    ],
    integratedPlatforms: [],
    hasRestructured: false,
    maxRounds,
    seed: 42,
    isChallenge: false,
  };

  if (isFundManager) {
    stateUpdate.isFundManagerMode = true;
    stateUpdate.fundName = 'Blackrock Capital Partners II';
    stateUpdate.fundSize = 100000;
    stateUpdate.managementFeesCollected = isBankrupt ? 8000 : 20000;
    stateUpdate.lpSatisfactionScore = isBankrupt ? 20 : 75;
    stateUpdate.totalCapitalDeployed = isBankrupt ? 30000 : 85000;
    stateUpdate.lpDistributions = isBankrupt ? 0 : 45000;
    stateUpdate.fundCashFlows = [
      { round: 0, amount: -100000 },
      ...(!isBankrupt ? [
        { round: 3, amount: 15000 },
        { round: 5, amount: 20000 },
        { round: 8, amount: 10000 },
      ] : []),
    ];
  }

  useGameStore.setState(stateUpdate);

  // Recalculate metrics from the new state
  const fullState = useGameStore.getState();
  const metrics = calculateMetrics(fullState);
  const metricsHistory = makeHistory(round, metrics);
  const roundHistory = makeRoundHistory(round, isBankrupt, metrics);

  useGameStore.setState({
    metrics,
    metricsHistory,
    roundHistory,
  });

  // Calculate scores
  const finalState = useGameStore.getState();
  const score = isFundManager
    ? calculatePEFundScore(finalState)
    : calculateFinalScore(finalState);

  const carryWaterfall = isFundManager
    ? calculateCarryWaterfall(finalState)
    : undefined;

  return { score, carryWaterfall };
}
