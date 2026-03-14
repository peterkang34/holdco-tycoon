import type { SectorId } from '../engine/types';
import { UNLOCKABLE_SECTORS } from '../data/sectors';

const ACHIEVEMENTS_KEY = 'holdco-tycoon-achievements';

/** Get all achievement IDs earned across games (from localStorage) */
export function getEarnedAchievementIds(): string[] {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Persist newly earned achievements (additive — never overwrites existing) */
export function saveEarnedAchievements(newIds: string[]): void {
  try {
    const existing = new Set(getEarnedAchievementIds());
    newIds.forEach(id => existing.add(id));
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify([...existing]));
  } catch {
    // Silent fail for SSR/test environments without localStorage
  }
}

/** Check if a specific achievement has been earned */
export function isAchievementEarned(achievementId: string): boolean {
  return getEarnedAchievementIds().includes(achievementId);
}

/** Get sector IDs that the player has unlocked via achievements */
export function getUnlockedSectorIds(isAnonymous: boolean = true): SectorId[] {
  const earned = new Set(getEarnedAchievementIds());
  return (Object.entries(UNLOCKABLE_SECTORS) as [SectorId, { gateAchievementId: string; requiresAccount: boolean }][])
    .filter(([, gate]) => {
      if (!earned.has(gate.gateAchievementId)) return false;
      // If sector requires account, anonymous users don't get access
      if (gate.requiresAccount && isAnonymous) return false;
      return true;
    })
    .map(([sectorId]) => sectorId);
}
