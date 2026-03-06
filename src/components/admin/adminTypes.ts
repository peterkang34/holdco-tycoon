/** Shared types for admin dashboard components */

import type { LeaderboardStrategy } from '../../engine/types';

export interface ChallengeMetrics {
  created: number;
  shared: number;
  joined: number;
  started: number;
  completed: number;
  scoreboardViews: number;
}

export interface MonthData {
  month: string;
  started: number;
  completed: number;
  uniquePlayers: number;
  configBreakdown: Record<string, number>;
  sectorBreakdown: Record<string, number>;
  roundDistribution: Record<string, number>;
  gradeDistribution: Record<string, number>;
  fevDistribution: Record<string, number>;
  abandonByRound: Record<string, number>;
  deviceBreakdown: Record<string, number>;
  deviceComplete: Record<string, number>;
  deviceAbandon: Record<string, number>;
  returningBreakdown: Record<string, number>;
  durationDistribution: Record<string, number>;
  pageViews: number;
  viewsByDevice: Record<string, number>;
  startByNth: Record<string, number>;
  completeByNth: Record<string, number>;
  archetypeDistribution: Record<string, number>;
  antiPatternDistribution: Record<string, number>;
  sophisticationDistribution: Record<string, number>;
  dealStructureDistribution: Record<string, number>;
  platformsForgedDistribution: Record<string, number>;
  endingSubTypes: Record<string, number>;
  endingEbitdaSum: number;
  endingEbitdaCount: number;
  endingConstruction: Record<string, number>;
  challengeMetrics: ChallengeMetrics;
  featureAdoption: Record<string, number>;
  eventChoices: Record<string, number>;
  // New Phase 1 counters
  scoreDimSums: Record<string, number>;
  scoreDimCounts: Record<string, number>;
  antiPatternByGrade: Record<string, number>;
  archetypeByGrade: Record<string, number>;
}

export interface CohortRow {
  cohortWeek: string;
  weekData: Record<string, number>;
}

export interface LeaderboardEntryAdmin {
  holdcoName: string;
  initials: string;
  founderEquityValue: number;
  grade: string;
  difficulty: string;
  duration?: string;
  businessCount?: number;
  score?: number;
  date: string;
  strategy?: LeaderboardStrategy;
  hasRestructured?: boolean;
  familyOfficeCompleted?: boolean;
  foMultiplier?: number;
}

export interface ActivityEvent {
  type: 'start' | 'abandon';
  ts: string;
  difficulty?: string;
  duration?: string;
  sector?: string;
  device?: string;
  gameNumber?: number;
  round?: number;
  sessionDurationMs?: number;
  fev?: number;
}

export interface AnalyticsData {
  allTime: { started: number; completed: number };
  months: MonthData[];
  leaderboardEntries: LeaderboardEntryAdmin[];
  recentEntries: LeaderboardEntryAdmin[];
  activityFeed: ActivityEvent[];
  cohortRetention: CohortRow[];
}

export interface Totals {
  allConfig: Record<string, number>;
  allSectors: Record<string, number>;
  allGrades: Record<string, number>;
  allFev: Record<string, number>;
  allAbandon: Record<string, number>;
  allRounds: Record<string, number>;
  allDevice: Record<string, number>;
  allDeviceComplete: Record<string, number>;
  allDeviceAbandon: Record<string, number>;
  allReturning: Record<string, number>;
  allDuration: Record<string, number>;
  allFeatures: Record<string, number>;
  allChoices: Record<string, number>;
  allArchetypes: Record<string, number>;
  allAntiPatterns: Record<string, number>;
  allSophistication: Record<string, number>;
  allStructures: Record<string, number>;
  allEndingSubTypes: Record<string, number>;
  allEndingConstruction: Record<string, number>;
  avgEndingEbitda: number;
  // New Phase 1 aggregates
  allScoreDimSums: Record<string, number>;
  allScoreDimCounts: Record<string, number>;
  allAntiPatternByGrade: Record<string, number>;
  allArchetypeByGrade: Record<string, number>;
  totalUnique: number;
  totalViews: number;
  completionRate: string;
  avgFev: number;
  topFev: number;
  normalPct: string;
  quickPct: string;
  mobileSharePct: string;
  totalChallenge: ChallengeMetrics;
  avgSessionDuration: string;
  newVsReturning: string;
  visitStartRate: string;
  secondGameRate: string;
}

// ── Community Tab Types ────────────────────────────────────────

export interface SignUpMetrics {
  totalAccounts: number;
  verifiedAccounts: number;
  anonymousAccounts: number;
  providerBreakdown: Record<string, number>;
  signUpsByWeek: { week: string; count: number }[];
  signUpsByDay: { date: string; count: number }[];
}

export interface CommunityPlayer {
  id: string;
  display_name: string | null;
  initials: string;
  total_games: number;
  best_grade: string | null;
  best_adjusted_fev: number;
  created_at: string;
  is_anonymous: boolean;
}

export interface CommunityData {
  metrics: SignUpMetrics;
  players: CommunityPlayer[];
  totalPlayers: number;
  page: number;
  pageSize: number;
}

export interface PlayerDetail {
  profile: Record<string, unknown>;
  stats: Record<string, unknown> | null;
  recentGames: Record<string, unknown>[];
  auth: {
    provider: string;
    created_at: string;
    last_sign_in_at: string | null;
    is_anonymous: boolean;
  };
}

export interface DayData {
  date: string;      // YYYY-MM-DD
  started: number;
  completed: number;
  pageViews: number;
  uniquePlayers: number;
}

// Re-export for component props
export interface MiniTrendProps {
  label: string;
  data: { month: string; value: number }[];
}

export interface SectionHeaderProps {
  title: string;
}
