/**
 * Shared grade-to-color mapping used across GameOverScreen, LeaderboardModal, etc.
 * Grade scale: S (best) > A > B > C > D > F (worst)
 */

export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'S': return 'text-yellow-400';
    case 'A': return 'text-accent';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-warning';
    case 'D': return 'text-orange-500';
    case 'F': return 'text-danger';
    default: return 'text-text-secondary';
  }
}

export function getRankColor(rank: number): string {
  if (rank === 1) return 'text-yellow-400';
  if (rank === 2) return 'text-gray-300';
  if (rank === 3) return 'text-orange-400';
  return 'text-text-muted';
}
