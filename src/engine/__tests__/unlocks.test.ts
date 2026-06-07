import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAvailableSectors, SECTOR_LIST_STANDARD, SECTOR_LIST_SCENARIO, SECTORS, UNLOCKABLE_SECTORS, UNLOCKABLE_SECTOR_IDS } from '../../data/sectors';
import { generateDealPipeline } from '../businesses';
import { createRngStreams } from '../rng';
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
import { getEarnedAchievementIds, saveEarnedAchievements, getUnlockedSectorIds, isAchievementEarned, shouldEarnAchievements } from '../../hooks/useUnlocks';

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

    it('returns empty with fewer than 16 achievements (non-anonymous)', () => {
      const fifteenAchievements = Array.from({ length: 15 }, (_, i) => `ach_${i}`);
      localStorageMock.setItem('holdco-tycoon-achievements', JSON.stringify(fifteenAchievements));
      const unlocked = getUnlockedSectorIds(false);
      expect(unlocked).not.toContain('privateCredit');
    });

    it('returns privateCredit after earning 16+ achievements (non-anonymous)', () => {
      const sixteenAchievements = Array.from({ length: 16 }, (_, i) => `ach_${i}`);
      localStorageMock.setItem('holdco-tycoon-achievements', JSON.stringify(sixteenAchievements));
      const unlocked = getUnlockedSectorIds(false);
      expect(unlocked).toContain('privateCredit');
    });

    it('returns empty for anonymous users even with 16+ achievements (requiresAccount)', () => {
      const sixteenAchievements = Array.from({ length: 16 }, (_, i) => `ach_${i}`);
      localStorageMock.setItem('holdco-tycoon-achievements', JSON.stringify(sixteenAchievements));
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

    it('scenario mode suspends achievement gates — includes unlockable sectors with NO unlocks', () => {
      // isScenario=true, isChallenge=true (scenarios pass both), no unlocked ids.
      const sectors = getAvailableSectors(false, [], true, true);
      const ids = sectors.map(s => s.id);
      for (const sectorId of Object.keys(UNLOCKABLE_SECTORS)) {
        expect(ids).toContain(sectorId); // fintech, aerospace, privateCredit, mediaEntertainment
      }
      expect(ids).toContain('fintech'); // the sector from Peter's report
    });

    it('scenario mode still excludes FO-exclusive sectors (proSports)', () => {
      const sectors = getAvailableSectors(false, [], true, true);
      expect(sectors.map(s => s.id)).not.toContain('proSports');
    });
  });

  describe('shouldEarnAchievements (scenario sandbox)', () => {
    it('returns FALSE for scenario challenge games — no global achievement farming', () => {
      expect(shouldEarnAchievements({ isScenarioChallengeMode: true })).toBe(false);
    });

    it('returns TRUE for normal/PE/FO games', () => {
      expect(shouldEarnAchievements({ isScenarioChallengeMode: false })).toBe(true);
      expect(shouldEarnAchievements({})).toBe(true);
    });
  });

  describe('SECTOR_LIST_SCENARIO composition', () => {
    it('contains every unlockable sector and excludes proSports', () => {
      const ids = SECTOR_LIST_SCENARIO.map(s => s.id);
      for (const sectorId of Object.keys(UNLOCKABLE_SECTORS)) {
        expect(ids).toContain(sectorId);
      }
      expect(ids).not.toContain('proSports');
    });

    it('UNLOCKABLE_SECTOR_IDS matches the UNLOCKABLE_SECTORS keys', () => {
      expect([...UNLOCKABLE_SECTOR_IDS].sort()).toEqual(Object.keys(UNLOCKABLE_SECTORS).sort());
    });
  });

  describe('generateDealPipeline scenario gate suspension (integration)', () => {
    // Mirrors how useGame's scenario call sites invoke the pipeline: isChallenge=true,
    // isScenario=true, with all unlockables passed as unlockedSectorIds so gated sectors
    // are weighted into deal flow (not just reachable via the variety step).
    const runScenarioPipeline = (seed: number) => {
      const streams = createRngStreams(seed, 1);
      return generateDealPipeline(
        [], 1, undefined, undefined, undefined, 0, 0, false, undefined, 20,
        false, streams.deals, 0, 50000, null, false, false, 'easy',
        [], UNLOCKABLE_SECTOR_IDS, true, true, // unlockedSectorIds, isChallenge, isScenario
      );
    };
    const runPeerChallengePipeline = (seed: number) => {
      const streams = createRngStreams(seed, 1);
      return generateDealPipeline(
        [], 1, undefined, undefined, undefined, 0, 0, false, undefined, 20,
        false, streams.deals, 0, 50000, null, false, false, 'easy',
        [], [], true, false, // unlockedSectorIds=[], isChallenge=true, isScenario=false
      );
    };

    it('scenario pipeline surfaces every achievement-gated sector across seeds', () => {
      // If isScenario were broken (standard list), these would NEVER appear in any seed.
      const seen = new Set<string>();
      for (let seed = 1; seed <= 40; seed++) {
        for (const d of runScenarioPipeline(seed)) seen.add(d.business.sectorId);
      }
      for (const sectorId of Object.keys(UNLOCKABLE_SECTORS)) {
        expect(seen).toContain(sectorId); // fintech, aerospace, privateCredit, mediaEntertainment
      }
    });

    it('peer-challenge pipeline (isScenario=false) never surfaces gated sectors — fairness preserved', () => {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 40; seed++) {
        for (const d of runPeerChallengePipeline(seed)) seen.add(d.business.sectorId);
      }
      for (const sectorId of Object.keys(UNLOCKABLE_SECTORS)) {
        expect(seen).not.toContain(sectorId);
      }
    });
  });

  describe('UNLOCKABLE_SECTORS data', () => {
    it('privateCredit is gated by 16 achievements', () => {
      expect(UNLOCKABLE_SECTORS.privateCredit).toBeDefined();
      expect(UNLOCKABLE_SECTORS.privateCredit!.gateAchievementCount).toBe(16);
    });

    it('privateCredit sector definition exists', () => {
      expect(SECTORS.privateCredit).toBeDefined();
      expect(SECTORS.privateCredit.name).toBe('Private Credit & Lending');
    });
  });
});
