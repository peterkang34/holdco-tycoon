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
    peakActiveCount: number;
    platformCount: number;
    platformsForged: number;
    archetype: string;
    antiPatterns: string[];
    sophisticationScore: number;
    // Phase 2B additions
    sharedServicesActive: number;
    allTimeSectorCount: number;
    recessionAcquisitionCount: number;
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
  hasRestructured: boolean;
  isFundManagerMode: boolean;
  carryEarned?: number;
  lpSatisfaction?: number;
  initialCapital: number;
  endingCashConversion: number;
  bSchoolCompleted?: boolean;
}

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: 'milestone' | 'feat' | 'mastery' | 'creative' | 'mode';
  rarity: AchievementRarity;
  unlockHint?: string;
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENT_PREVIEW: AchievementDef[] = [
  // ── Milestones ──
  {
    id: 'first_acquisition',
    name: 'First Deal',
    description: 'Complete your first acquisition.',
    emoji: '🤝',
    category: 'milestone',
    rarity: 'common',
    check: (ctx) => ctx.strategyData.totalAcquisitions >= 1,
  },
  {
    id: 'portfolio_builder',
    name: 'Portfolio Builder',
    description: 'Hold 5 or more active businesses at any point during the game.',
    emoji: '🏢',
    category: 'milestone',
    rarity: 'common',
    check: (ctx) => ctx.strategyData.peakActiveCount >= 5,
  },
  {
    id: 'exit_strategist',
    name: 'Exit Strategist',
    description: 'Successfully sell a business.',
    emoji: '🚪',
    category: 'milestone',
    rarity: 'common',
    check: (ctx) => ctx.strategyData.totalSells >= 1,
  },
  {
    id: 'platform_architect',
    name: 'Platform Architect',
    description: 'Forge at least one integrated platform.',
    emoji: '🏗️',
    category: 'milestone',
    rarity: 'common',
    unlockHint: 'Progresses toward: Media & Entertainment',
    check: (ctx) => ctx.strategyData.platformsForged >= 1,
  },
  {
    id: 'debt_free',
    name: 'Debt Free',
    description: 'End the game with zero debt (including seller notes) and no bankruptcy.',
    emoji: '🕊️',
    category: 'milestone',
    rarity: 'common',
    check: (ctx) =>
      ctx.totalDebt === 0 &&
      !ctx.bankruptRound &&
      ctx.businesses.every(b => (b.sellerNoteBalance ?? 0) === 0),
  },
  {
    id: 'first_distribution',
    name: 'First Distribution',
    description: 'Return cash to shareholders via distributions.',
    emoji: '💸',
    category: 'milestone',
    rarity: 'common',
    check: (ctx) => ctx.totalDistributions > 0,
  },

  // ── Feats ──
  {
    id: 'turnaround_artist',
    name: 'Turnaround Artist',
    description: 'Start 3 or more turnaround programs.',
    emoji: '🔧',
    category: 'feat',
    rarity: 'uncommon',
    check: (ctx) => ctx.strategyData.turnaroundsStarted >= 3,
  },
  {
    id: 'deal_architect',
    name: 'Deal Architect',
    description: 'Use 4 or more unique deal structure types.',
    emoji: '🧩',
    category: 'feat',
    rarity: 'uncommon',
    check: (ctx) => Object.keys(ctx.strategyData.dealStructureTypes).length >= 4,
  },
  {
    id: 'roll_up_machine',
    name: 'Roll-Up Machine',
    description: 'Forge 3 or more integrated platforms in a single game.',
    emoji: '🌀',
    category: 'feat',
    rarity: 'uncommon',
    unlockHint: 'Progresses toward: Aerospace & Defense',
    check: (ctx) => ctx.strategyData.platformsForged >= 3,
  },
  {
    id: 'sector_specialist',
    name: 'Sector Specialist',
    description: 'End the game with 3+ active businesses all in the same sector.',
    emoji: '🎯',
    category: 'feat',
    rarity: 'uncommon',
    check: (ctx) =>
      ctx.strategyData.sectorIds.length === 1 && ctx.strategyData.activeCount >= 3,
  },
  {
    id: 'smart_exit',
    name: 'Smart Exit',
    description: 'Sell a business at 3x+ MOIC.',
    emoji: '💎',
    category: 'feat',
    rarity: 'uncommon',
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
    id: 'shared_services_maven',
    name: 'Shared Services Maven',
    description: 'Activate all 3 shared services with 5+ active businesses.',
    emoji: '🔗',
    category: 'feat',
    rarity: 'uncommon',
    check: (ctx) =>
      ctx.strategyData.sharedServicesActive >= 3 && ctx.strategyData.activeCount >= 5,
  },
  {
    id: 'trophy_hunter',
    name: 'Trophy Hunter',
    description: 'Acquire a business with $75M+ EBITDA.',
    emoji: '🏆',
    category: 'feat',
    rarity: 'uncommon',
    check: (ctx) =>
      [...ctx.businesses, ...ctx.exitedBusinesses].some(b => b.acquisitionEbitda >= 75000),
  },
  {
    id: 'cash_flow_king',
    name: 'Cash Flow King',
    description: 'End the game with 70%+ cash conversion ratio.',
    emoji: '💵',
    category: 'feat',
    rarity: 'uncommon',
    check: (ctx) => ctx.endingCashConversion >= 0.70,
  },
  {
    id: 'ceiling_master',
    name: 'Ceiling Master',
    description: 'Turnaround a business to its sector quality ceiling.',
    emoji: '🏔️',
    category: 'feat',
    rarity: 'uncommon',
    check: (ctx) =>
      [...ctx.businesses, ...ctx.exitedBusinesses].some(b => b.ceilingMasteryBonus === true),
  },
  {
    id: 'distressed_investor',
    name: 'Distressed Investor',
    description: 'Buy 3+ Q1 businesses and finish with a B grade or better.',
    emoji: '🦅',
    category: 'feat',
    rarity: 'uncommon',
    check: (ctx) => {
      const q1Acquisitions = [...ctx.businesses, ...ctx.exitedBusinesses].filter(
        b => b.acquisitionPrice > 0 &&
          (b.qualityRating - (b.qualityImprovedTiers ?? 0)) <= 1
      ).length;
      return q1Acquisitions >= 3 && ['S', 'A', 'B'].includes(ctx.score.grade);
    },
  },

  // ── Mastery ──
  {
    id: 'the_compounder',
    name: 'The Compounder',
    description: 'Score 12+ on Portfolio ROIC (80% of max).',
    emoji: '📈',
    category: 'mastery',
    rarity: 'rare',
    unlockHint: 'Progresses toward: Fintech & Payments',
    check: (ctx) => ctx.score.portfolioRoic >= 12,
  },
  {
    id: 's_tier',
    name: 'S-Tier',
    description: 'Earn an S grade.',
    emoji: '👑',
    category: 'mastery',
    rarity: 'epic',
    unlockHint: 'Progresses toward: Private Credit & Lending',
    check: (ctx) => ctx.score.grade === 'S',
  },
  {
    id: 'balanced_allocator',
    name: 'Balanced Allocator',
    description: 'Score 10+ on all 6 scoring dimensions.',
    emoji: '⚖️',
    category: 'mastery',
    rarity: 'rare',
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
    emoji: '🚀',
    category: 'mastery',
    rarity: 'rare',
    check: (ctx) =>
      ctx.initialCapital > 0 && ctx.founderEquityValue >= ctx.initialCapital * 10,
  },
  {
    id: 'clean_sheet',
    name: 'Clean Sheet',
    description: 'Complete a game with zero anti-patterns and earn at least a B grade.',
    emoji: '📋',
    category: 'mastery',
    rarity: 'rare',
    unlockHint: 'Progresses toward: Private Credit & Lending',
    check: (ctx) =>
      ctx.strategyData.antiPatterns.length === 0 &&
      ['S', 'A', 'B'].includes(ctx.score.grade),
  },
  {
    id: 'sophistication_100',
    name: 'Master Operator',
    description: 'Reach the maximum sophistication score (100).',
    emoji: '🎓',
    category: 'mastery',
    rarity: 'rare',
    check: (ctx) => ctx.strategyData.sophisticationScore === 100,
  },
  {
    id: 'turnaround_master',
    name: 'Turnaround Master',
    description: 'Successfully complete 3 or more turnaround programs.',
    emoji: '🏆',
    category: 'mastery',
    rarity: 'rare',
    check: (ctx) => ctx.strategyData.turnaroundsSucceeded >= 3,
  },

  // ── Creative Play ──
  {
    id: 'the_contrarian',
    name: 'The Contrarian',
    description: 'Make 3+ acquisitions and earn a B grade or better.',
    emoji: '🧠',
    category: 'creative',
    rarity: 'rare',
    check: (ctx) =>
      ctx.strategyData.totalAcquisitions >= 3 &&
      ['S', 'A', 'B'].includes(ctx.score.grade),
  },
  {
    id: 'recession_buyer',
    name: 'Recession Buyer',
    description: 'Make 2+ acquisitions during recessions and earn a B grade.',
    emoji: '🌧️',
    category: 'creative',
    rarity: 'rare',
    check: (ctx) =>
      ctx.strategyData.recessionAcquisitionCount >= 2 &&
      ['S', 'A', 'B'].includes(ctx.score.grade),
  },
  {
    id: 'the_minimalist',
    name: 'The Minimalist',
    description: 'Complete a game with 3 or fewer total acquisitions and earn a B grade.',
    emoji: '🧘',
    category: 'creative',
    rarity: 'epic',
    check: (ctx) =>
      ctx.strategyData.totalAcquisitions <= 3 &&
      ctx.strategyData.totalAcquisitions >= 1 &&
      ['S', 'A', 'B'].includes(ctx.score.grade),
  },
  {
    id: 'diversification_play',
    name: 'Diversification Play',
    description: 'Own active businesses across 6+ sectors and earn a B grade or better.',
    emoji: '🌈',
    category: 'creative',
    rarity: 'rare',
    check: (ctx) =>
      ctx.strategyData.sectorIds.length >= 6 &&
      ['S', 'A', 'B'].includes(ctx.score.grade),
  },
  {
    id: 'phoenix_rising',
    name: 'Phoenix Rising',
    description: 'Restructure and still earn a C grade or better.',
    emoji: '🔥',
    category: 'creative',
    rarity: 'rare',
    check: (ctx) =>
      ctx.hasRestructured &&
      ['S', 'A', 'B', 'C'].includes(ctx.score.grade),
  },
  {
    id: 'no_leverage',
    name: 'No Leverage',
    description: 'Only use all-cash or earn-out deal structures and earn a C grade or better.',
    emoji: '🪶',
    category: 'creative',
    rarity: 'epic',
    check: (ctx) => {
      const ds = ctx.strategyData.dealStructureTypes;
      const usedLeverage = (ds['bank_debt'] || 0) + (ds['seller_note'] || 0) + (ds['seller_note_bank_debt'] || 0) + (ds['rollover_equity'] || 0) > 0;
      return !usedLeverage &&
        !ctx.bankruptRound &&
        ['S', 'A', 'B', 'C'].includes(ctx.score.grade);
    },
  },

  // ── Mode-Specific ──
  {
    id: 'carry_king',
    name: 'Carry King',
    description: 'Earn $20M+ in carry as a PE fund manager.',
    emoji: '💰',
    category: 'mode',
    rarity: 'epic',
    check: (ctx) =>
      ctx.isFundManagerMode && (ctx.carryEarned ?? 0) >= 20_000,
  },
  {
    id: 'lp_whisperer',
    name: 'LP Whisperer',
    description: 'End a PE fund with 80%+ LP satisfaction (10/10 score).',
    emoji: '🗣️',
    category: 'mode',
    rarity: 'epic',
    check: (ctx) =>
      ctx.isFundManagerMode && (ctx.lpSatisfaction ?? 0) >= 80,
  },
  {
    id: 'hard_mode_hero',
    name: 'Hard Mode Hero',
    description: 'Earn an A or S grade on Hard difficulty.',
    emoji: '🛡️',
    category: 'mode',
    rarity: 'epic',
    check: (ctx) =>
      ctx.difficulty === 'normal' && ['S', 'A'].includes(ctx.score.grade),
  },
  {
    id: 'speed_run',
    name: 'Speed Run',
    description: 'Earn a B grade or better on Quick Play.',
    emoji: '⚡',
    category: 'mode',
    rarity: 'epic',
    check: (ctx) =>
      ctx.duration === 'quick' && ['S', 'A', 'B'].includes(ctx.score.grade),
  },
  // Business School
  {
    id: 'bschool_graduate',
    name: 'B-School Graduate',
    description: 'Complete the Business School tutorial.',
    emoji: '🎓',
    category: 'milestone',
    rarity: 'common',
    check: (ctx) => ctx.bSchoolCompleted === true,
  },
];
