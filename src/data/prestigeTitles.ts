export interface PrestigeTier {
  tier: number;
  title: string | null;
  minGames: number;
  minAvgScore?: number;
  minAchievements?: number;
  requiresGrade?: string;
  requiresSGrades?: number;
}

export const PRESTIGE_TIERS: PrestigeTier[] = [
  { tier: 0, title: null, minGames: 0 },
  { tier: 1, title: 'Rookie Allocator', minGames: 3 },
  { tier: 2, title: 'Rising Allocator', minGames: 10, minAvgScore: 45 },
  { tier: 3, title: 'Skilled Allocator', minGames: 25, minAvgScore: 55, requiresGrade: 'A' },
  { tier: 4, title: 'Expert Allocator', minGames: 50, minAvgScore: 65, minAchievements: 16 },
  { tier: 5, title: 'Master Allocator', minGames: 75, minAvgScore: 70, minAchievements: 24 },
  { tier: 6, title: 'Legendary Allocator', minGames: 100, minAvgScore: 75, minAchievements: 30, requiresSGrades: 3 },
];

const GRADE_RANK: Record<string, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };

/** Compute the highest prestige tier a player qualifies for */
export function computePrestigeTier(stats: {
  totalGames: number;
  avgScore: number;
  achievementCount: number;
  bestGrade: string;
  sGradeCount: number;
}): { tier: number; title: string | null } {
  let result = PRESTIGE_TIERS[0];

  for (const tier of PRESTIGE_TIERS) {
    if (stats.totalGames < tier.minGames) break;
    if (tier.minAvgScore != null && stats.avgScore < tier.minAvgScore) break;
    if (tier.minAchievements != null && stats.achievementCount < tier.minAchievements) break;
    if (tier.requiresGrade != null) {
      const required = GRADE_RANK[tier.requiresGrade] ?? 0;
      const best = GRADE_RANK[stats.bestGrade] ?? 0;
      if (best < required) break;
    }
    if (tier.requiresSGrades != null && stats.sGradeCount < tier.requiresSGrades) break;
    result = tier;
  }

  return { tier: result.tier, title: result.title };
}

const TIER_COLORS: Record<number, string> = {
  0: 'text-zinc-500',
  1: 'text-zinc-400',
  2: 'text-emerald-400',
  3: 'text-blue-400',
  4: 'text-purple-400',
  5: 'text-amber-400',
  6: 'text-yellow-300',
};

/** Get the display color class for a prestige tier */
export function getPrestigeTierColor(tier: number): string {
  return TIER_COLORS[tier] ?? TIER_COLORS[0];
}
