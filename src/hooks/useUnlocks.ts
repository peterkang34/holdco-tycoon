import type { SectorId } from '../engine/types';
import { UNLOCKABLE_SECTORS } from '../data/sectors';
import { getAccessToken } from '../lib/supabase';

const ACHIEVEMENTS_KEY = 'holdco-tycoon-achievements';
const SYNC_FLAG_KEY = 'holdco-achievements-synced';

/** Get all achievement IDs earned across games (from localStorage) */
export function getEarnedAchievementIds(): string[] {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Validate: must be an array of strings (guard against corruption)
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
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
  const earnedCount = getEarnedAchievementIds().length;
  return (Object.entries(UNLOCKABLE_SECTORS) as [SectorId, { gateAchievementCount: number; requiresAccount: boolean }][])
    .filter(([, gate]) => {
      if (earnedCount < gate.gateAchievementCount) return false;
      // If sector requires account, anonymous users don't get access
      if (gate.requiresAccount && isAnonymous) return false;
      return true;
    })
    .map(([sectorId]) => sectorId);
}

/**
 * Sync achievements from server to localStorage.
 * Merges server-side achievements (computed from game_history) with local ones.
 * Call once on app load when the user is authenticated.
 * Fire-and-forget — never blocks the UI.
 */
export async function syncAchievementsFromServer(): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;

    const res = await fetch('/api/player/stats', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const data = await res.json();
    const serverIds = data.earned_achievement_ids;
    if (!Array.isArray(serverIds) || serverIds.length === 0) return;

    // Merge server achievements into localStorage (additive)
    saveEarnedAchievements(serverIds);
    localStorage.setItem(SYNC_FLAG_KEY, Date.now().toString());
  } catch {
    // Silent — best effort sync
  }
}

/**
 * Check if achievements have been synced recently (within last hour).
 * Used to avoid redundant API calls on every page load.
 */
export function needsAchievementSync(): boolean {
  try {
    const lastSync = localStorage.getItem(SYNC_FLAG_KEY);
    if (!lastSync) return true;
    const elapsed = Date.now() - parseInt(lastSync, 10);
    return elapsed > 3600_000; // Re-sync after 1 hour
  } catch {
    return true;
  }
}
