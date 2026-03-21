import { describe, it, expect } from 'vitest';
import { ACHIEVEMENT_PREVIEW, AchievementContext } from '../../data/achievementPreview';
import type { Business } from '../types';

// ── Helper ──────────────────────────────────────────────────────────────────

function createBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz-1',
    name: 'Test Biz',
    sectorId: 'saas',
    subType: 'Vertical-Market SaaS',
    ebitda: 2000,
    peakEbitda: 2000,
    acquisitionEbitda: 1500,
    acquisitionPrice: 6000,
    acquisitionRound: 1,
    acquisitionMultiple: 4.0,
    acquisitionSizeTierPremium: 0,
    organicGrowthRate: 0.05,
    revenue: 10000,
    ebitdaMargin: 0.20,
    acquisitionRevenue: 8000,
    acquisitionMargin: 0.19,
    peakRevenue: 10000,
    revenueGrowthRate: 0.05,
    marginDriftRate: -0.003,
    qualityRating: 3,
    dueDiligence: { financial: 'neutral', operational: 'neutral', market: 'neutral' },
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
    totalAcquisitionCost: 6000,
    cashEquityInvested: 6000,
    rolloverEquityPct: 0,
    priorOwnershipCount: 0,
    ...overrides,
  } as Business;
}

function createCtx(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    strategyData: {
      totalAcquisitions: 0,
      totalSells: 0,
      turnaroundsStarted: 0,
      turnaroundsSucceeded: 0,
      turnaroundsFailed: 0,
      peakLeverage: 0,
      peakDistressLevel: 0,
      sectorIds: [],
      dealStructureTypes: {},
      rolloverEquityCount: 0,
      activeCount: 0,
      peakActiveCount: 0,
      platformCount: 0,
      platformsForged: 0,
      archetype: 'balanced',
      antiPatterns: [],
      sophisticationScore: 50,
      sharedServicesActive: 0,
      allTimeSectorCount: 0,
      recessionAcquisitionCount: 0,
      ...(overrides.strategyData ?? {}),
    },
    score: {
      total: 60,
      grade: 'C',
      valueCreation: 8,
      fcfShareGrowth: 8,
      portfolioRoic: 8,
      capitalDeployment: 8,
      balanceSheetHealth: 8,
      strategicDiscipline: 8,
      ...(overrides.score ?? {}),
    },
    businesses: overrides.businesses ?? [],
    exitedBusinesses: overrides.exitedBusinesses ?? [],
    totalDebt: overrides.totalDebt ?? 0,
    totalDistributions: overrides.totalDistributions ?? 0,
    founderEquityValue: overrides.founderEquityValue ?? 10000,
    difficulty: overrides.difficulty ?? 'easy',
    duration: overrides.duration ?? 'standard',
    bankruptRound: overrides.bankruptRound,
    hasRestructured: overrides.hasRestructured ?? false,
    isFundManagerMode: overrides.isFundManagerMode ?? false,
    carryEarned: overrides.carryEarned,
    lpSatisfaction: overrides.lpSatisfaction,
    initialCapital: overrides.initialCapital ?? 5000,
    endingCashConversion: overrides.endingCashConversion ?? 0,
  };
}

function getAchievement(id: string) {
  const a = ACHIEVEMENT_PREVIEW.find(a => a.id === id);
  if (!a) throw new Error(`Achievement "${id}" not found`);
  return a;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Achievement Predicates', () => {
  it('should have 31 achievement definitions', () => {
    expect(ACHIEVEMENT_PREVIEW.length).toBe(31);
  });

  // ── Milestones ──

  describe('first_acquisition', () => {
    const ach = getAchievement('first_acquisition');
    it('triggers with 1+ acquisitions', () => {
      expect(ach.check(createCtx({ strategyData: { totalAcquisitions: 1 } } as any))).toBe(true);
    });
    it('fails with 0 acquisitions', () => {
      expect(ach.check(createCtx({ strategyData: { totalAcquisitions: 0 } } as any))).toBe(false);
    });
  });

  describe('portfolio_builder', () => {
    const ach = getAchievement('portfolio_builder');
    it('triggers at peakActiveCount = 5', () => {
      expect(ach.check(createCtx({ strategyData: { peakActiveCount: 5 } } as any))).toBe(true);
    });
    it('fails at peakActiveCount = 4', () => {
      expect(ach.check(createCtx({ strategyData: { peakActiveCount: 4 } } as any))).toBe(false);
    });
  });

  describe('exit_strategist', () => {
    const ach = getAchievement('exit_strategist');
    it('triggers with 1+ sells', () => {
      expect(ach.check(createCtx({ strategyData: { totalSells: 1 } } as any))).toBe(true);
    });
    it('fails with 0 sells', () => {
      expect(ach.check(createCtx({ strategyData: { totalSells: 0 } } as any))).toBe(false);
    });
  });

  describe('platform_architect', () => {
    const ach = getAchievement('platform_architect');
    it('triggers with 1+ platforms forged', () => {
      expect(ach.check(createCtx({ strategyData: { platformsForged: 1 } } as any))).toBe(true);
    });
    it('fails with 0 platforms', () => {
      expect(ach.check(createCtx({ strategyData: { platformsForged: 0 } } as any))).toBe(false);
    });
  });

  describe('debt_free', () => {
    const ach = getAchievement('debt_free');
    it('triggers with zero debt, no bankruptcy, no seller notes', () => {
      const biz = createBusiness({ sellerNoteBalance: 0 });
      expect(ach.check(createCtx({ totalDebt: 0, businesses: [biz] }))).toBe(true);
    });
    it('fails with debt > 0', () => {
      expect(ach.check(createCtx({ totalDebt: 1000, businesses: [createBusiness()] }))).toBe(false);
    });
    it('fails with bankruptcy', () => {
      expect(ach.check(createCtx({ totalDebt: 0, bankruptRound: 5, businesses: [createBusiness()] }))).toBe(false);
    });
    it('fails with seller note remaining', () => {
      const biz = createBusiness({ sellerNoteBalance: 500 });
      expect(ach.check(createCtx({ totalDebt: 0, businesses: [biz] }))).toBe(false);
    });
  });

  describe('first_distribution', () => {
    const ach = getAchievement('first_distribution');
    it('triggers with distributions > 0', () => {
      expect(ach.check(createCtx({ totalDistributions: 1 }))).toBe(true);
    });
    it('fails with 0 distributions', () => {
      expect(ach.check(createCtx({ totalDistributions: 0 }))).toBe(false);
    });
  });

  // ── Feats ──

  describe('turnaround_artist', () => {
    const ach = getAchievement('turnaround_artist');
    it('triggers with 3+ turnarounds started', () => {
      expect(ach.check(createCtx({ strategyData: { turnaroundsStarted: 3 } } as any))).toBe(true);
    });
    it('fails with 2 turnarounds started', () => {
      expect(ach.check(createCtx({ strategyData: { turnaroundsStarted: 2 } } as any))).toBe(false);
    });
  });

  describe('deal_architect', () => {
    const ach = getAchievement('deal_architect');
    it('triggers with 4+ unique deal types', () => {
      const ctx = createCtx({
        strategyData: {
          dealStructureTypes: { all_cash: 1, bank_debt: 2, seller_note: 1, earn_out: 1 },
        },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with 3 deal types', () => {
      const ctx = createCtx({
        strategyData: {
          dealStructureTypes: { all_cash: 1, bank_debt: 2, seller_note: 1 },
        },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('roll_up_machine', () => {
    const ach = getAchievement('roll_up_machine');
    it('triggers with 3+ platforms forged', () => {
      expect(ach.check(createCtx({ strategyData: { platformsForged: 3 } } as any))).toBe(true);
    });
    it('fails with 2 platforms', () => {
      expect(ach.check(createCtx({ strategyData: { platformsForged: 2 } } as any))).toBe(false);
    });
  });

  describe('sector_specialist', () => {
    const ach = getAchievement('sector_specialist');
    it('triggers with 1 sector and 3+ active', () => {
      const ctx = createCtx({
        strategyData: { sectorIds: ['saas'], activeCount: 3 },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with 2 sectors', () => {
      const ctx = createCtx({
        strategyData: { sectorIds: ['saas', 'agency'], activeCount: 3 },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with < 3 active', () => {
      const ctx = createCtx({
        strategyData: { sectorIds: ['saas'], activeCount: 2 },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('smart_exit', () => {
    const ach = getAchievement('smart_exit');
    it('triggers at exactly 3.0x MOIC', () => {
      const biz = createBusiness({ status: 'sold', exitPrice: 18000, acquisitionPrice: 6000 });
      expect(ach.check(createCtx({ exitedBusinesses: [biz] }))).toBe(true);
    });
    it('fails at 2.99x MOIC', () => {
      const biz = createBusiness({ status: 'sold', exitPrice: 17940, acquisitionPrice: 6000 });
      expect(ach.check(createCtx({ exitedBusinesses: [biz] }))).toBe(false);
    });
    it('fails if business not sold status', () => {
      const biz = createBusiness({ status: 'active', exitPrice: 30000, acquisitionPrice: 6000 });
      expect(ach.check(createCtx({ exitedBusinesses: [biz] }))).toBe(false);
    });
  });

  describe('shared_services_maven', () => {
    const ach = getAchievement('shared_services_maven');
    it('triggers with 3 shared services and 5+ active', () => {
      const ctx = createCtx({
        strategyData: { sharedServicesActive: 3, activeCount: 5 },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with 2 shared services', () => {
      const ctx = createCtx({
        strategyData: { sharedServicesActive: 2, activeCount: 5 },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with < 5 active', () => {
      const ctx = createCtx({
        strategyData: { sharedServicesActive: 3, activeCount: 4 },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('ceiling_master', () => {
    const ach = getAchievement('ceiling_master');
    it('triggers when any business has ceiling mastery bonus', () => {
      const biz = createBusiness({ ceilingMasteryBonus: true });
      expect(ach.check(createCtx({ businesses: [biz] }))).toBe(true);
    });
    it('triggers when exited business has ceiling mastery bonus', () => {
      const biz = createBusiness({ ceilingMasteryBonus: true, status: 'sold' });
      expect(ach.check(createCtx({ exitedBusinesses: [biz] }))).toBe(true);
    });
    it('fails with no ceiling mastery', () => {
      const biz = createBusiness({ ceilingMasteryBonus: false });
      expect(ach.check(createCtx({ businesses: [biz], exitedBusinesses: [] }))).toBe(false);
    });
  });

  describe('distressed_investor', () => {
    const ach = getAchievement('distressed_investor');
    it('triggers with 3+ Q1 acquisitions and B+ grade', () => {
      const bizzes = [
        createBusiness({ id: '1', qualityRating: 1, qualityImprovedTiers: 0 }),
        createBusiness({ id: '2', qualityRating: 2, qualityImprovedTiers: 1 }),
        createBusiness({ id: '3', qualityRating: 1, qualityImprovedTiers: 0 }),
      ];
      const ctx = createCtx({ businesses: bizzes, score: { grade: 'B' } } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with only 2 Q1 acquisitions', () => {
      const bizzes = [
        createBusiness({ id: '1', qualityRating: 1, qualityImprovedTiers: 0 }),
        createBusiness({ id: '2', qualityRating: 3, qualityImprovedTiers: 0 }),
      ];
      const ctx = createCtx({ businesses: bizzes, score: { grade: 'B' } } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with C grade', () => {
      const bizzes = [
        createBusiness({ id: '1', qualityRating: 1, qualityImprovedTiers: 0 }),
        createBusiness({ id: '2', qualityRating: 1, qualityImprovedTiers: 0 }),
        createBusiness({ id: '3', qualityRating: 1, qualityImprovedTiers: 0 }),
      ];
      const ctx = createCtx({ businesses: bizzes, score: { grade: 'C' } } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  // ── Mastery ──

  describe('the_compounder', () => {
    const ach = getAchievement('the_compounder');
    it('triggers at portfolioRoic = 12', () => {
      expect(ach.check(createCtx({ score: { portfolioRoic: 12 } } as any))).toBe(true);
    });
    it('fails at portfolioRoic = 11.99', () => {
      expect(ach.check(createCtx({ score: { portfolioRoic: 11.99 } } as any))).toBe(false);
    });
  });

  describe('s_tier', () => {
    const ach = getAchievement('s_tier');
    it('triggers with S grade', () => {
      expect(ach.check(createCtx({ score: { grade: 'S' } } as any))).toBe(true);
    });
    it('fails with A grade', () => {
      expect(ach.check(createCtx({ score: { grade: 'A' } } as any))).toBe(false);
    });
  });

  describe('balanced_allocator', () => {
    const ach = getAchievement('balanced_allocator');
    it('triggers with all dimensions >= 10', () => {
      const ctx = createCtx({
        score: {
          total: 70, grade: 'A',
          valueCreation: 10, fcfShareGrowth: 10, portfolioRoic: 10,
          capitalDeployment: 10, balanceSheetHealth: 10, strategicDiscipline: 10,
        },
      });
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails when one dimension is 9', () => {
      const ctx = createCtx({
        score: {
          total: 70, grade: 'A',
          valueCreation: 9, fcfShareGrowth: 10, portfolioRoic: 10,
          capitalDeployment: 10, balanceSheetHealth: 10, strategicDiscipline: 10,
        },
      });
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('value_creation_machine', () => {
    const ach = getAchievement('value_creation_machine');
    it('triggers at exactly 10x initial capital', () => {
      expect(ach.check(createCtx({ initialCapital: 5000, founderEquityValue: 50000 }))).toBe(true);
    });
    it('fails at 9.99x', () => {
      expect(ach.check(createCtx({ initialCapital: 5000, founderEquityValue: 49950 }))).toBe(false);
    });
    it('fails with zero initial capital', () => {
      expect(ach.check(createCtx({ initialCapital: 0, founderEquityValue: 50000 }))).toBe(false);
    });
  });

  describe('clean_sheet', () => {
    const ach = getAchievement('clean_sheet');
    it('triggers with no anti-patterns and B grade', () => {
      const ctx = createCtx({
        strategyData: { antiPatterns: [] },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('triggers with S grade', () => {
      const ctx = createCtx({
        strategyData: { antiPatterns: [] },
        score: { grade: 'S' },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with anti-patterns', () => {
      const ctx = createCtx({
        strategyData: { antiPatterns: ['over_leveraged'] },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with C grade', () => {
      const ctx = createCtx({
        strategyData: { antiPatterns: [] },
        score: { grade: 'C' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('sophistication_100', () => {
    const ach = getAchievement('sophistication_100');
    it('triggers at exactly 100', () => {
      expect(ach.check(createCtx({ strategyData: { sophisticationScore: 100 } } as any))).toBe(true);
    });
    it('fails at 99', () => {
      expect(ach.check(createCtx({ strategyData: { sophisticationScore: 99 } } as any))).toBe(false);
    });
  });

  describe('turnaround_master', () => {
    const ach = getAchievement('turnaround_master');
    it('triggers with 3+ successful turnarounds', () => {
      expect(ach.check(createCtx({ strategyData: { turnaroundsSucceeded: 3 } } as any))).toBe(true);
    });
    it('fails with 2 successes', () => {
      expect(ach.check(createCtx({ strategyData: { turnaroundsSucceeded: 2 } } as any))).toBe(false);
    });
  });

  // ── Creative Play ──

  describe('the_contrarian', () => {
    const ach = getAchievement('the_contrarian');
    it('triggers with 3+ acquisitions and B grade', () => {
      const ctx = createCtx({
        strategyData: { totalAcquisitions: 3 },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with C grade', () => {
      const ctx = createCtx({
        strategyData: { totalAcquisitions: 3 },
        score: { grade: 'C' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('recession_buyer', () => {
    const ach = getAchievement('recession_buyer');
    it('triggers with 2+ recession acquisitions and B grade', () => {
      const ctx = createCtx({
        strategyData: { recessionAcquisitionCount: 2 },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with 1 recession acquisition', () => {
      const ctx = createCtx({
        strategyData: { recessionAcquisitionCount: 1 },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('the_minimalist', () => {
    const ach = getAchievement('the_minimalist');
    it('triggers with exactly 3 acquisitions and B grade', () => {
      const ctx = createCtx({
        strategyData: { totalAcquisitions: 3 },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('triggers with exactly 1 acquisition and A grade', () => {
      const ctx = createCtx({
        strategyData: { totalAcquisitions: 1 },
        score: { grade: 'A' },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with 4 acquisitions', () => {
      const ctx = createCtx({
        strategyData: { totalAcquisitions: 4 },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with 0 acquisitions', () => {
      const ctx = createCtx({
        strategyData: { totalAcquisitions: 0 },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('diversification_play', () => {
    const ach = getAchievement('diversification_play');
    it('triggers with 6+ sectors and B grade', () => {
      const ctx = createCtx({
        strategyData: { sectorIds: ['a', 'b', 'c', 'd', 'e', 'f'] },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with 5 sectors', () => {
      const ctx = createCtx({
        strategyData: { sectorIds: ['a', 'b', 'c', 'd', 'e'] },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('phoenix_rising', () => {
    const ach = getAchievement('phoenix_rising');
    it('triggers with restructure and C grade', () => {
      const ctx = createCtx({
        hasRestructured: true,
        score: { grade: 'C' },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails without restructure', () => {
      const ctx = createCtx({
        hasRestructured: false,
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with D grade', () => {
      const ctx = createCtx({
        hasRestructured: true,
        score: { grade: 'D' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  describe('no_leverage', () => {
    const ach = getAchievement('no_leverage');
    it('triggers with only all_cash deals and C grade', () => {
      const ctx = createCtx({
        strategyData: { dealStructureTypes: { all_cash: 3, earn_out: 1 } },
        score: { grade: 'C' },
      } as any);
      expect(ach.check(ctx)).toBe(true);
    });
    it('fails with bank_debt usage', () => {
      const ctx = createCtx({
        strategyData: { dealStructureTypes: { all_cash: 2, bank_debt: 1 } },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with seller_note usage', () => {
      const ctx = createCtx({
        strategyData: { dealStructureTypes: { all_cash: 2, seller_note: 1 } },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with rollover_equity usage', () => {
      const ctx = createCtx({
        strategyData: { dealStructureTypes: { all_cash: 2, rollover_equity: 1 } },
        score: { grade: 'B' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with bankruptcy even if no leverage', () => {
      const ctx = createCtx({
        strategyData: { dealStructureTypes: { all_cash: 3 } },
        score: { grade: 'B' },
        bankruptRound: 5,
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
    it('fails with D grade', () => {
      const ctx = createCtx({
        strategyData: { dealStructureTypes: { all_cash: 3 } },
        score: { grade: 'D' },
      } as any);
      expect(ach.check(ctx)).toBe(false);
    });
  });

  // ── Mode-Specific ──

  describe('carry_king', () => {
    const ach = getAchievement('carry_king');
    it('triggers in fund manager mode with 20M+ carry', () => {
      expect(ach.check(createCtx({ isFundManagerMode: true, carryEarned: 20000 }))).toBe(true);
    });
    it('fails at 19999 carry', () => {
      expect(ach.check(createCtx({ isFundManagerMode: true, carryEarned: 19999 }))).toBe(false);
    });
    it('fails outside fund manager mode', () => {
      expect(ach.check(createCtx({ isFundManagerMode: false, carryEarned: 30000 }))).toBe(false);
    });
  });

  describe('lp_whisperer', () => {
    const ach = getAchievement('lp_whisperer');
    it('triggers at exactly 90 LP satisfaction', () => {
      expect(ach.check(createCtx({ isFundManagerMode: true, lpSatisfaction: 90 }))).toBe(true);
    });
    it('fails at 89', () => {
      expect(ach.check(createCtx({ isFundManagerMode: true, lpSatisfaction: 89 }))).toBe(false);
    });
    it('fails outside fund manager mode', () => {
      expect(ach.check(createCtx({ isFundManagerMode: false, lpSatisfaction: 95 }))).toBe(false);
    });
  });

  describe('hard_mode_hero', () => {
    const ach = getAchievement('hard_mode_hero');
    it('triggers on normal difficulty with A grade', () => {
      expect(ach.check(createCtx({ difficulty: 'normal', score: { grade: 'A' } } as any))).toBe(true);
    });
    it('triggers on normal difficulty with S grade', () => {
      expect(ach.check(createCtx({ difficulty: 'normal', score: { grade: 'S' } } as any))).toBe(true);
    });
    it('fails on easy difficulty', () => {
      expect(ach.check(createCtx({ difficulty: 'easy', score: { grade: 'S' } } as any))).toBe(false);
    });
    it('fails with B grade', () => {
      expect(ach.check(createCtx({ difficulty: 'normal', score: { grade: 'B' } } as any))).toBe(false);
    });
  });

  describe('speed_run', () => {
    const ach = getAchievement('speed_run');
    it('triggers on quick play with B grade', () => {
      expect(ach.check(createCtx({ duration: 'quick', score: { grade: 'B' } } as any))).toBe(true);
    });
    it('fails on standard duration', () => {
      expect(ach.check(createCtx({ duration: 'standard', score: { grade: 'B' } } as any))).toBe(false);
    });
    it('fails with C grade', () => {
      expect(ach.check(createCtx({ duration: 'quick', score: { grade: 'C' } } as any))).toBe(false);
    });
  });
});
