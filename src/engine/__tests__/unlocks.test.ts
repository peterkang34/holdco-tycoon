import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAvailableSectors, SECTOR_LIST_STANDARD, SECTORS, UNLOCKABLE_SECTORS } from '../../data/sectors';
import type { SectorId } from '../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Import after mocking localStorage
import { getEarnedAchievementIds, saveEarnedAchievements, getUnlockedSectorIds, isAchievementEarned } from '../../hooks/useUnlocks';

describe('Achievement Unlock Gating', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('getEarnedAchievementIds', () => {
    it('returns empty array with no saved achievements', () => {
      expect(getEarnedAchievementIds()).toEqual([]);
    });

    it('returns saved achievement IDs', () => {
      localStorageMock.setItem('holdco-tycoon-achievements', JSON.stringify(['clean_sheet', 'first_deal']));
      expect(getEarnedAchievementIds()).toEqual(['clean_sheet', 'first_deal']);
    });
  });

  describe('saveEarnedAchievements', () => {
    it('saves new achievements', () => {
      saveEarnedAchievements(['clean_sheet']);
      const saved = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(saved).toContain('clean_sheet');
    });

    it('is additive — does not overwrite existing', () => {
      localStorageMock.setItem('holdco-tycoon-achievements', JSON.stringify(['first_deal']));
      saveEarnedAchievements(['clean_sheet']);
      const lastCall = localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1];
      const saved = JSON.parse(lastCall[1]);
      expect(saved).toContain('first_deal');
      expect(saved).toContain('clean_sheet');
    });

    it('does not duplicate existing achievements', () => {
      localStorageMock.setItem('holdco-tycoon-achievements', JSON.stringify(['clean_sheet']));
      saveEarnedAchievements(['clean_sheet', 'new_one']);
      const lastCall = localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1];
      const saved = JSON.parse(lastCall[1]) as string[];
      expect(saved.filter(id => id === 'clean_sheet').length).toBe(1);
      expect(saved).toContain('new_one');
    });
  });

  describe('isAchievementEarned', () => {
    it('returns false for unearned achievement', () => {
      expect(isAchievementEarned('clean_sheet')).toBe(false);
    });

    it('returns true for earned achievement', () => {
      localStorageMock.setItem('holdco-tycoon-achievements', JSON.stringify(['clean_sheet']));
      expect(isAchievementEarned('clean_sheet')).toBe(true);
    });
  });

  describe('getUnlockedSectorIds', () => {
    it('returns empty with no achievements', () => {
      expect(getUnlockedSectorIds()).toEqual([]);
    });

    it('returns privateCredit after clean_sheet earned (non-anonymous)', () => {
      localStorageMock.setItem('holdco-tycoon-achievements', JSON.stringify(['clean_sheet']));
      const unlocked = getUnlockedSectorIds(false);
      expect(unlocked).toContain('privateCredit');
    });

    it('returns empty for anonymous users even with clean_sheet (requiresAccount)', () => {
      localStorageMock.setItem('holdco-tycoon-achievements', JSON.stringify(['clean_sheet']));
      const unlocked = getUnlockedSectorIds(true);
      expect(unlocked).not.toContain('privateCredit');
    });
  });

  describe('getAvailableSectors', () => {
    it('excludes privateCredit by default (no unlocks)', () => {
      const sectors = getAvailableSectors(false);
      expect(sectors.map(s => s.id)).not.toContain('privateCredit');
    });

    it('includes privateCredit when unlocked', () => {
      const sectors = getAvailableSectors(false, ['privateCredit' as SectorId]);
      expect(sectors.map(s => s.id)).toContain('privateCredit');
    });

    it('excludes privateCredit in challenge mode regardless of unlock state', () => {
      const sectors = getAvailableSectors(false, ['privateCredit' as SectorId], true);
      expect(sectors.map(s => s.id)).not.toContain('privateCredit');
    });

    it('FO mode includes all sectors including privateCredit', () => {
      const sectors = getAvailableSectors(true);
      expect(sectors.map(s => s.id)).toContain('privateCredit');
      expect(sectors.map(s => s.id)).toContain('proSports');
    });

    it('standard list does not include unlockable sectors', () => {
      const standardIds = SECTOR_LIST_STANDARD.map(s => s.id);
      for (const sectorId of Object.keys(UNLOCKABLE_SECTORS)) {
        expect(standardIds).not.toContain(sectorId);
      }
    });
  });

  describe('UNLOCKABLE_SECTORS data', () => {
    it('privateCredit is gated by clean_sheet achievement', () => {
      expect(UNLOCKABLE_SECTORS.privateCredit).toBeDefined();
      expect(UNLOCKABLE_SECTORS.privateCredit!.gateAchievementId).toBe('clean_sheet');
    });

    it('privateCredit sector definition exists', () => {
      expect(SECTORS.privateCredit).toBeDefined();
      expect(SECTORS.privateCredit.name).toBe('Private Credit & Lending');
    });
  });
});
