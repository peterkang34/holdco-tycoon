import type { Business } from '../engine/types';

export interface AchievementContext {
  strategyData: {
    totalAcquisitions: number;
    totalSells: number;
    turnaroundsStarted: number;
    turnaroundsSucceeded: number;
    turnaroundsFailed: number;
    peakLeverage: number;
    peakDistressLevel: number;
    sectorIds: string[];
    dealStructureTypes: Record<string, number>;
    rolloverEquityCount: number;
    activeCount: number;
    platformCount: number;
    archetype: string;
    antiPatterns: string[];
    sophisticationScore: number;
  };
  score: {
    total: number;
    grade: string;
    valueCreation: number;
    fcfShareGrowth: number;
    portfolioRoic: number;
    capitalDeployment: number;
    balanceSheetHealth: number;
    strategicDiscipline: number;
  };
  businesses: Business[];
  exitedBusinesses: Business[];
  totalDebt: number;
  totalDistributions: number;
  founderEquityValue: number;
  difficulty: string;
  duration: string;
  bankruptRound?: number;
  isFundManagerMode: boolean;
  carryEarned?: number;
  lpSatisfaction?: number;
  initialCapital: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: 'milestone' | 'feat' | 'mastery' | 'creative' | 'mode';
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENT_PREVIEW: AchievementDef[] = [
  // ── Milestones ──
  {
    id: 'first_acquisition',
    name: 'First Deal',
    description: 'Complete your first acquisition.',
    category: 'milestone',
    check: (ctx) => ctx.strategyData.totalAcquisitions >= 1,
  },
  {
    id: 'portfolio_builder',
    name: 'Portfolio Builder',
    description: 'Hold 5 or more active businesses simultaneously.',
    category: 'milestone',
    check: (ctx) => ctx.strategyData.activeCount >= 5,
  },
  {
    id: 'exit_strategist',
    name: 'Exit Strategist',
    description: 'Successfully sell a business.',
    category: 'milestone',
    check: (ctx) => ctx.strategyData.totalSells >= 1,
  },
  {
    id: 'platform_architect',
    name: 'Platform Architect',
    description: 'Build at least one platform with integrated bolt-ons.',
    category: 'milestone',
    check: (ctx) => ctx.strategyData.platformCount >= 1,
  },
  {
    id: 'debt_free',
    name: 'Debt Free',
    description: 'End the game with zero debt and no bankruptcy.',
    category: 'milestone',
    check: (ctx) => ctx.totalDebt === 0 && !ctx.bankruptRound,
  },
  {
    id: 'first_distribution',
    name: 'First Distribution',
    description: 'Return cash to shareholders via distributions.',
    category: 'milestone',
    check: (ctx) => ctx.totalDistributions > 0,
  },

  // ── Feats ──
  {
    id: 'turnaround_artist',
    name: 'Turnaround Artist',
    description: 'Start 3 or more turnaround programs.',
    category: 'feat',
    check: (ctx) => ctx.strategyData.turnaroundsStarted >= 3,
  },
  {
    id: 'deal_architect',
    name: 'Deal Architect',
    description: 'Use 4 or more unique deal structure types.',
    category: 'feat',
    check: (ctx) => Object.keys(ctx.strategyData.dealStructureTypes).length >= 4,
  },
  {
    id: 'roll_up_machine',
    name: 'Roll-Up Machine',
    description: 'Build 3 or more platforms.',
    category: 'feat',
    check: (ctx) => ctx.strategyData.platformCount >= 3,
  },
  {
    id: 'sector_specialist',
    name: 'Sector Specialist',
    description: 'Own 3+ active businesses all in the same sector.',
    category: 'feat',
    check: (ctx) =>
      ctx.strategyData.sectorIds.length === 1 && ctx.strategyData.activeCount >= 3,
  },
  {
    id: 'smart_exit',
    name: 'Smart Exit',
    description: 'Sell a business at 3x+ MOIC.',
    category: 'feat',
    check: (ctx) =>
      ctx.exitedBusinesses.some(
        (b) =>
          b.status === 'sold' &&
          b.exitPrice != null &&
          b.acquisitionPrice > 0 &&
          b.exitPrice / b.acquisitionPrice >= 3,
      ),
  },
  {
    id: 'the_contrarian',
    name: 'The Contrarian',
    description: 'Make 3+ acquisitions and earn a B grade or better.',
    category: 'feat',
    check: (ctx) =>
      ctx.strategyData.totalAcquisitions >= 3 &&
      ['S', 'A', 'B'].includes(ctx.score.grade),
  },

  // ── Mastery ──
  {
    id: 'the_compounder',
    name: 'The Compounder',
    description: 'Score 12+ on Portfolio ROIC (80% of max).',
    category: 'mastery',
    check: (ctx) => ctx.score.portfolioRoic >= 12,
  },
  {
    id: 's_tier',
    name: 'S-Tier',
    description: 'Earn an S grade.',
    category: 'mastery',
    check: (ctx) => ctx.score.grade === 'S',
  },
  {
    id: 'balanced_allocator',
    name: 'Balanced Allocator',
    description: 'Score 10+ on all 6 scoring dimensions.',
    category: 'mastery',
    check: (ctx) =>
      ctx.score.valueCreation >= 10 &&
      ctx.score.fcfShareGrowth >= 10 &&
      ctx.score.portfolioRoic >= 10 &&
      ctx.score.capitalDeployment >= 10 &&
      ctx.score.balanceSheetHealth >= 10 &&
      ctx.score.strategicDiscipline >= 10,
  },
  {
    id: 'value_creation_machine',
    name: 'Value Creation Machine',
    description: 'Grow founder equity to 10x your initial capital.',
    category: 'mastery',
    check: (ctx) =>
      ctx.initialCapital > 0 && ctx.founderEquityValue >= ctx.initialCapital * 10,
  },

  // ── Mode-Specific ──
  {
    id: 'carry_king',
    name: 'Carry King',
    description: 'Earn $20M+ in carry as a PE fund manager.',
    category: 'mode',
    check: (ctx) =>
      ctx.isFundManagerMode && (ctx.carryEarned ?? 0) >= 20_000,
  },
  {
    id: 'lp_whisperer',
    name: 'LP Whisperer',
    description: 'End a PE fund with 90%+ LP satisfaction.',
    category: 'mode',
    check: (ctx) =>
      ctx.isFundManagerMode && (ctx.lpSatisfaction ?? 0) >= 90,
  },
  {
    id: 'hard_mode_hero',
    name: 'Hard Mode Hero',
    description: 'Earn an A or S grade on Hard difficulty.',
    category: 'mode',
    check: (ctx) =>
      ctx.difficulty === 'normal' && ['S', 'A'].includes(ctx.score.grade),
  },
  {
    id: 'speed_run',
    name: 'Speed Run',
    description: 'Earn a B grade or better on Quick Play.',
    category: 'mode',
    check: (ctx) =>
      ctx.duration === 'quick' && ['S', 'A', 'B'].includes(ctx.score.grade),
  },
];
