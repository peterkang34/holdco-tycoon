import { describe, it, expect } from 'vitest';
import { generateThesis, getArchetypeDisplayName } from '../../utils/playbookThesis';
import { ARCHETYPE_DISPLAY_NAMES } from '../../data/archetypeNames';
import type { PlaybookData } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────

function makePlaybook(overrides: Partial<{
  archetype: string;
  isBankrupt: boolean;
  isFundManager: boolean;
  totalRounds: number;
  fev: number;
  seed: number;
  holdcoName: string;
  duration: string;
  totalAcquisitions: number;
  totalSells: number;
  platformsForged: number;
  platformCount: number;
  activeCount: number;
  turnaroundsStarted: number;
  turnaroundsSucceeded: number;
  neverSoldCount: number;
  tuckInCount: number;
  totalDistributions: number;
  recessionAcquisitionCount: number;
  rolloverEquityCount: number;
  hasRestructured: boolean;
  peakLeverage: number;
  grossMoic: number;
  carryEarned: number;
  totalFundSize: number;
  fundName: string;
}> = {}): PlaybookData {
  const o = {
    archetype: 'focused_operator',
    isBankrupt: false,
    isFundManager: false,
    totalRounds: 20,
    fev: 45000,
    seed: 12345,
    holdcoName: 'Test Holdings',
    duration: 'standard',
    totalAcquisitions: 4,
    totalSells: 1,
    platformsForged: 0,
    platformCount: 0,
    activeCount: 3,
    turnaroundsStarted: 0,
    turnaroundsSucceeded: 0,
    neverSoldCount: 3,
    tuckInCount: 0,
    totalDistributions: 5000,
    recessionAcquisitionCount: 0,
    rolloverEquityCount: 0,
    hasRestructured: false,
    peakLeverage: 2.0,
    grossMoic: 0,
    carryEarned: 0,
    totalFundSize: 0,
    fundName: 'PE Fund',
    ...overrides,
  };

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    thesis: {
      archetype: o.archetype,
      holdcoName: o.holdcoName,
      grade: 'B', score: 72, fev: o.fev, adjustedFev: o.fev,
      difficulty: 'normal', duration: o.duration, seed: o.seed,
      sophisticationScore: 50, sectorFocus: ['businessServices'],
      isFundManager: o.isFundManager, isBankrupt: o.isBankrupt,
      totalRounds: o.totalRounds,
      ...(o.isFundManager ? { fundName: o.fundName, carryEarned: o.carryEarned } : {}),
    },
    sectors: {
      endingSectorIds: ['businessServices'], allTimeSectorIds: ['businessServices'],
      endingSubTypes: ['businessServices:IT Staffing'], businessesPerSector: { businessServices: 3 },
      platformSectors: [],
    },
    capital: {
      dealStructureTypes: { cash: 3 }, peakLeverage: o.peakLeverage, endingLeverage: 1.5,
      peakDistressLevel: 'comfortable', totalDistributions: o.totalDistributions,
      totalBuybacks: 0, equityRaisesUsed: 0, rolloverEquityCount: o.rolloverEquityCount,
      hasRestructured: o.hasRestructured, antiPatterns: [],
      holdcoLoanUsed: false, sellerNotePercentage: 0, avgMultiplePaid: 5.0,
    },
    portfolio: {
      totalAcquisitions: o.totalAcquisitions, totalSells: o.totalSells,
      activeCount: o.activeCount, peakActiveCount: o.activeCount + 1,
      platformsForged: o.platformsForged, platformCount: o.platformCount,
      endingConstruction: { standalone: o.activeCount }, tuckInCount: o.tuckInCount,
      neverSoldCount: o.neverSoldCount, avgHoldYears: 8, avgAcquisitionQuality: 3.5,
      ownershipPercentage: 1.0,
    },
    operations: {
      turnaroundsStarted: o.turnaroundsStarted, turnaroundsSucceeded: o.turnaroundsSucceeded,
      turnaroundsFailed: 0, sharedServicesActive: 2, maSourcingTier: 1,
      sourceDealUses: 2, proactiveOutreachUses: 1, smbBrokerUses: 0,
      recessionAcquisitionCount: o.recessionAcquisitionCount,
    },
    exits: {
      exitedBusinesses: [], totalExitProceeds: 10000, blendedMultiple: 5.5, portfolioMoic: 2.5,
    },
    performance: {
      metricsTimeline: [], totalInvestedCapital: 20000,
      totalShareholderReturn: o.fev + o.totalDistributions,
      roiic: 0.20, fcfConversionRate: 0.85,
      scoreBreakdown: { valueCreation: 14, fcfShareGrowth: 12, portfolioRoic: 10, capitalDeployment: 12, balanceSheetHealth: 12, strategicDiscipline: 12 },
    },
    ...(o.isFundManager ? {
      peFund: {
        grossMoic: o.grossMoic, netIrr: 0.12, dpi: 1.2, tvpi: 1.5, rvpi: 0.3,
        carryEarned: o.carryEarned, managementFees: 20000, lpSatisfaction: 75,
        hurdleClearance: true, irrMultiplier: 1.0, totalFundSize: o.totalFundSize,
        totalLpDistributions: 120000,
        peScoreBreakdown: { returnGeneration: 20, capitalEfficiency: 15, valueCreation: 12, deployment: 10, riskManagement: 12, lpSatisfaction: 8 },
      },
    } : {}),
    realityCheck: { gameToRealityGaps: [] },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('generateThesis', () => {
  describe('standard archetypes', () => {
    const archetypes = Object.keys(ARCHETYPE_DISPLAY_NAMES);

    for (const archetype of archetypes) {
      it(`generates a thesis for ${archetype}`, () => {
        const pb = makePlaybook({
          archetype,
          platformsForged: archetype === 'platform_builder' ? 3 : 0,
          platformCount: archetype === 'platform_builder' ? 3 : 0,
          turnaroundsStarted: archetype === 'turnaround_specialist' ? 4 : 0,
          turnaroundsSucceeded: archetype === 'turnaround_specialist' ? 3 : 0,
          totalAcquisitions: archetype === 'serial_acquirer' ? 10 : 4,
          activeCount: archetype === 'conglomerate' ? 7 : 3,
          totalSells: archetype === 'dividend_cow' ? 4 : 1,
        });
        const thesis = generateThesis(pb);
        expect(thesis.length).toBeGreaterThan(50);
        expect(thesis).toContain('Test Holdings');
      });
    }

    it('uses seed for deterministic template selection', () => {
      const pb1 = makePlaybook({ seed: 1 });
      const pb2 = makePlaybook({ seed: 1 });
      expect(generateThesis(pb1)).toBe(generateThesis(pb2));
    });
  });

  describe('bankruptcy', () => {
    it('generates post-mortem for bankrupt games', () => {
      const thesis = generateThesis(makePlaybook({ archetype: 'bankrupt', isBankrupt: true, totalRounds: 12 }));
      expect(thesis).toContain('bankrupt');
      expect(thesis).toContain('year 12');
    });

    it('generates minimal post-mortem for early bankruptcy', () => {
      const thesis = generateThesis(makePlaybook({ archetype: 'bankrupt', isBankrupt: true, totalRounds: 2 }));
      expect(thesis).toContain('year 2');
      expect(thesis).toContain('early');
    });
  });

  describe('PE fund mode', () => {
    it('generates PE thesis for fund manager', () => {
      const thesis = generateThesis(makePlaybook({
        isFundManager: true, archetype: 'focused_operator',
        totalAcquisitions: 5, grossMoic: 1.8, carryEarned: 15000,
        totalFundSize: 100000, fundName: 'Alpha Capital',
      }));
      expect(thesis).toContain('Alpha Capital');
      expect(thesis).toContain('1.8x');
    });

    it('generates inactive GP thesis for 0-acquisition PE fund', () => {
      const thesis = generateThesis(makePlaybook({
        isFundManager: true, archetype: 'inactive_gp',
        totalAcquisitions: 0, fundName: 'Dead Fund',
      }));
      expect(thesis).toContain('Zero acquisitions');
    });
  });

  describe('conditional clauses', () => {
    it('adds never-sold clause for permanent capital approach', () => {
      const thesis = generateThesis(makePlaybook({ neverSoldCount: 5, activeCount: 5, totalSells: 0 }));
      expect(thesis).toContain('Never sold');
    });

    it('adds recession acquisition clause', () => {
      const thesis = generateThesis(makePlaybook({ recessionAcquisitionCount: 3, neverSoldCount: 0, totalSells: 2 }));
      expect(thesis).toContain('recession');
    });

    it('adds rollover equity clause', () => {
      const thesis = generateThesis(makePlaybook({ rolloverEquityCount: 3, neverSoldCount: 0, totalSells: 2 }));
      expect(thesis).toContain('rollover equity');
    });

    it('adds restructuring clause', () => {
      const thesis = generateThesis(makePlaybook({ hasRestructured: true, neverSoldCount: 0, totalSells: 2, recessionAcquisitionCount: 0, rolloverEquityCount: 0 }));
      expect(thesis).toContain('restructuring');
    });
  });
});

describe('getArchetypeDisplayName', () => {
  it('returns display name for standard archetypes', () => {
    expect(getArchetypeDisplayName('platform_builder')).toBe('The Platform Architect');
    expect(getArchetypeDisplayName('focused_operator')).toBe('The Focused Operator');
  });

  it('returns special names for bankrupt and inactive_gp', () => {
    expect(getArchetypeDisplayName('bankrupt')).toBe('Bankrupt');
    expect(getArchetypeDisplayName('inactive_gp')).toBe('Inactive GP');
  });

  it('returns fallback for unknown archetypes', () => {
    expect(getArchetypeDisplayName('unknown_thing')).toBe('The Operator');
  });
});
