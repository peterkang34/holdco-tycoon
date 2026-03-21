import { describe, it, expect } from 'vitest';
import { SECTORS, UNLOCKABLE_SECTORS, FO_EXCLUSIVE_SECTORS, SECTOR_LIST_STANDARD, getAvailableSectors } from '../../data/sectors';
import { PLATFORM_RECIPES } from '../../data/platformRecipes';
import type { SectorId } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getAllSubTypesForSector(sectorId: string): string[] {
  return SECTORS[sectorId]?.subTypes ?? [];
}

function getAllSubTypes(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [sectorId, sector] of Object.entries(SECTORS)) {
    for (const subType of sector.subTypes) {
      map.set(subType, sectorId);
    }
  }
  return map;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Sector Data Completeness', () => {
  const sectorEntries = Object.entries(SECTORS);

  it('should have 20 sectors', () => {
    expect(sectorEntries.length).toBe(20);
  });

  it.each(sectorEntries)('%s has valid capexRate (0-1)', (_id, sector) => {
    expect(sector.capexRate).toBeGreaterThanOrEqual(0);
    expect(sector.capexRate).toBeLessThanOrEqual(1);
  });

  it.each(sectorEntries)('%s has baseEbitda [min <= max]', (_id, sector) => {
    expect(sector.baseEbitda[0]).toBeLessThanOrEqual(sector.baseEbitda[1]);
    expect(sector.baseEbitda[0]).toBeGreaterThan(0);
  });

  it.each(sectorEntries)('%s has baseRevenue [min <= max]', (_id, sector) => {
    expect(sector.baseRevenue[0]).toBeLessThanOrEqual(sector.baseRevenue[1]);
    expect(sector.baseRevenue[0]).toBeGreaterThan(0);
  });

  it.each(sectorEntries)('%s has baseMargin [min <= max] in (0,1)', (_id, sector) => {
    expect(sector.baseMargin[0]).toBeLessThanOrEqual(sector.baseMargin[1]);
    expect(sector.baseMargin[0]).toBeGreaterThan(0);
    expect(sector.baseMargin[1]).toBeLessThanOrEqual(1);
  });

  it.each(sectorEntries)('%s has acquisitionMultiple [min <= max]', (_id, sector) => {
    expect(sector.acquisitionMultiple[0]).toBeLessThanOrEqual(sector.acquisitionMultiple[1]);
    expect(sector.acquisitionMultiple[0]).toBeGreaterThan(0);
  });

  it.each(sectorEntries)('%s has required fields present', (sectorKey, sector) => {
    expect(sector.id).toBe(sectorKey);
    expect(sector.name).toBeTruthy();
    expect(sector.emoji).toBeTruthy();
    expect(sector.color).toBeTruthy();
    expect(sector.volatility).toBeGreaterThanOrEqual(0);
    expect(sector.subTypes.length).toBeGreaterThan(0);
    expect(sector.sectorFocusGroup.length).toBeGreaterThan(0);
    expect(sector.organicGrowthRange).toHaveLength(2);
  });

  it.each(sectorEntries)('%s has id in its own sectorFocusGroup', (sectorKey, sector) => {
    expect(sector.sectorFocusGroup).toContain(sectorKey);
  });
});

describe('Sub-Type Modifier Array Length Consistency', () => {
  const sectorsWithMarginMods = Object.entries(SECTORS).filter(
    ([, s]) => s.subTypeMarginModifiers
  );
  const sectorsWithGrowthMods = Object.entries(SECTORS).filter(
    ([, s]) => s.subTypeGrowthModifiers
  );

  it.each(sectorsWithMarginMods)(
    '%s subTypeMarginModifiers length matches subTypes length',
    (_id, sector) => {
      expect(sector.subTypeMarginModifiers!.length).toBe(sector.subTypes.length);
    }
  );

  it.each(sectorsWithGrowthMods)(
    '%s subTypeGrowthModifiers length matches subTypes length',
    (_id, sector) => {
      expect(sector.subTypeGrowthModifiers!.length).toBe(sector.subTypes.length);
    }
  );

  it.each(Object.entries(SECTORS))(
    '%s subTypeGroups length matches subTypes length',
    (_id, sector) => {
      expect(sector.subTypeGroups.length).toBe(sector.subTypes.length);
    }
  );
});

describe('Platform Recipe Sub-Type Integrity', () => {
  const allSubTypes = getAllSubTypes();

  it('every requiredSubType in platform recipes exists in a sector', () => {
    const missing: { recipeId: string; subType: string }[] = [];
    for (const recipe of PLATFORM_RECIPES) {
      for (const subType of recipe.requiredSubTypes) {
        if (!allSubTypes.has(subType)) {
          missing.push({ recipeId: recipe.id, subType });
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('within-sector recipes reference sub-types from their own sector', () => {
    const violations: { recipeId: string; subType: string; expectedSector: string; foundSector: string }[] = [];
    for (const recipe of PLATFORM_RECIPES) {
      if (recipe.sectorId === null) continue; // skip cross-sector
      for (const subType of recipe.requiredSubTypes) {
        const sectorSubTypes = getAllSubTypesForSector(recipe.sectorId);
        if (!sectorSubTypes.includes(subType)) {
          violations.push({
            recipeId: recipe.id,
            subType,
            expectedSector: recipe.sectorId,
            foundSector: allSubTypes.get(subType) ?? 'unknown',
          });
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('cross-sector recipes reference sub-types from their crossSectorIds', () => {
    const violations: string[] = [];
    for (const recipe of PLATFORM_RECIPES) {
      if (recipe.sectorId !== null) continue;
      if (!recipe.crossSectorIds) continue;
      const validSubTypes = new Set<string>();
      for (const sectorId of recipe.crossSectorIds) {
        for (const st of getAllSubTypesForSector(sectorId)) {
          validSubTypes.add(st);
        }
      }
      for (const subType of recipe.requiredSubTypes) {
        if (!validSubTypes.has(subType)) {
          violations.push(`${recipe.id}: "${subType}" not in sectors [${recipe.crossSectorIds.join(', ')}]`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('all recipe IDs are unique', () => {
    const ids = PLATFORM_RECIPES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every recipe has minSubTypes >= 2', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.minSubTypes).toBeGreaterThanOrEqual(2);
    }
  });

  it('every recipe has baseEbitdaThreshold > 0', () => {
    for (const recipe of PLATFORM_RECIPES) {
      expect(recipe.baseEbitdaThreshold).toBeGreaterThan(0);
    }
  });
});

describe('Unlock & Mode Filtering', () => {
  it('UNLOCKABLE_SECTORS thresholds are positive integers', () => {
    for (const [, gate] of Object.entries(UNLOCKABLE_SECTORS)) {
      expect(gate!.gateAchievementCount).toBeGreaterThan(0);
      expect(Number.isInteger(gate!.gateAchievementCount)).toBe(true);
    }
  });

  it('UNLOCKABLE_SECTORS reference existing sector IDs', () => {
    for (const sectorId of Object.keys(UNLOCKABLE_SECTORS)) {
      expect(SECTORS[sectorId]).toBeDefined();
    }
  });

  it('FO_EXCLUSIVE_SECTORS reference existing sector IDs', () => {
    for (const sectorId of FO_EXCLUSIVE_SECTORS) {
      expect(SECTORS[sectorId]).toBeDefined();
    }
  });

  it('SECTOR_LIST_STANDARD excludes FO-exclusive and unlockable sectors', () => {
    const standardIds = SECTOR_LIST_STANDARD.map(s => s.id);
    for (const foId of FO_EXCLUSIVE_SECTORS) {
      expect(standardIds).not.toContain(foId);
    }
    for (const unlockId of Object.keys(UNLOCKABLE_SECTORS)) {
      expect(standardIds).not.toContain(unlockId);
    }
  });

  it('challenge mode excludes unlockable and FO-exclusive sectors', () => {
    const challengeSectors = getAvailableSectors(false, [], true);
    const challengeIds = challengeSectors.map(s => s.id);
    for (const foId of FO_EXCLUSIVE_SECTORS) {
      expect(challengeIds).not.toContain(foId);
    }
    for (const unlockId of Object.keys(UNLOCKABLE_SECTORS)) {
      expect(challengeIds).not.toContain(unlockId);
    }
  });

  it('family office mode includes ALL sectors', () => {
    const foSectors = getAvailableSectors(true);
    expect(foSectors.length).toBe(Object.keys(SECTORS).length);
  });

  it('unlocked sectors appear when passed as unlockedSectorIds', () => {
    const unlockableKeys = Object.keys(UNLOCKABLE_SECTORS) as SectorId[];
    const available = getAvailableSectors(false, unlockableKeys, false);
    const availableIds = available.map(s => s.id);
    for (const key of unlockableKeys) {
      expect(availableIds).toContain(key);
    }
  });

  it('non-unlocked prestige sectors do not appear in normal mode', () => {
    const available = getAvailableSectors(false, [], false);
    const availableIds = available.map(s => s.id);
    for (const unlockId of Object.keys(UNLOCKABLE_SECTORS)) {
      expect(availableIds).not.toContain(unlockId);
    }
  });
});
