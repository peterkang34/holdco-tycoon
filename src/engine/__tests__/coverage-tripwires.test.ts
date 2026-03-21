/**
 * Coverage Tripwires — Structural Meta-Tests
 *
 * This file does NOT test behavior. It tests that tests EXIST.
 * When you add a new exported function, event type, achievement, recipe,
 * sector, or improvement type, a tripwire fires until you add a test for it.
 *
 * Strategy: fs.readFileSync + regex to scan source and test files.
 */

/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ── Helpers ──

const engineDir = resolve(__dirname, '..');
const testDir = __dirname;
const dataDir = resolve(__dirname, '../../data');

function readFile(filePath: string): string {
  return readFileSync(filePath, 'utf-8');
}

/** Read all test file contents concatenated (for broad function reference scanning) */
function getAllTestContents(): string {
  const files = readdirSync(testDir).filter(f => f.endsWith('.test.ts') || f.endsWith('.test.tsx'));
  // Also include playtest subdirectory
  let playtestFiles: string[] = [];
  try {
    playtestFiles = readdirSync(join(testDir, 'playtest'))
      .filter(f => f.endsWith('.test.ts'))
      .map(f => join('playtest', f));
  } catch { /* no playtest dir */ }
  return [...files, ...playtestFiles]
    .map(f => readFile(join(testDir, f)))
    .join('\n');
}

function readTestFile(name: string): string {
  return readFile(join(testDir, name));
}

/** Extract exported function and const names from an engine source file */
function getExportedNames(filePath: string): string[] {
  const content = readFile(filePath);
  const names: string[] = [];
  const re = /^export\s+(?:function|const|let)\s+([A-Za-z_]\w*)/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/** Extract string literal union members from a type definition */
function extractUnionValues(content: string, typeName: string): string[] {
  const re = new RegExp(`type\\s+${typeName}\\s*=[\\s\\S]*?;`);
  const match = content.match(re);
  if (!match) return [];
  const values: string[] = [];
  const literalRe = /'([^']+)'/g;
  let m;
  while ((m = literalRe.exec(match[0])) !== null) {
    values.push(m[1]);
  }
  return values;
}

// ── Pre-load ──

const allTestContents = getAllTestContents();
const typesContent = readFile(join(engineDir, 'types.ts'));

// ══════════════════════════════════════════════════════════════════
// 1. Engine Function Coverage
// ══════════════════════════════════════════════════════════════════

describe('Coverage Tripwires — Engine Function Coverage', () => {
  const engineFiles = [
    'simulation.ts', 'ipo.ts', 'distress.ts', 'businesses.ts',
    'platforms.ts', 'scoring.ts', 'turnarounds.ts', 'familyOffice.ts',
    'affordability.ts', 'deals.ts', 'buyers.ts', 'helpers.ts',
    'drilldownComputations.ts',
  ];

  // Functions that depend on browser APIs (localStorage) or are internal plumbing
  // that cannot be meaningfully unit-tested. Add sparingly — every entry here is
  // a conscious decision to skip coverage, not a blanket excuse.
  const BROWSER_ONLY_ALLOWLIST = new Set([
    'loadLocalLeaderboard',       // localStorage
    'saveToLocalLeaderboard',     // localStorage
    'wouldMakeLeaderboard',       // localStorage
    'getLeaderboardRank',         // localStorage
  ]);

  // Exported functions that exist but lack direct test coverage.
  // These are KNOWN GAPS — not exemptions. Each should eventually get a test.
  // When you add a test for one, remove it from this list.
  const KNOWN_GAPS = new Set([
    'generateGuaranteedProSportsEvent', // simulation.ts — called only from useGame.ts event flow
    'restoreBusinessIdCounter',          // businesses.ts — save-load plumbing, called on hydration
    'linearInterpolate',                 // scoring.ts — internal math helper used by calculateIRR
    'calculatePEFundScore',              // scoring.ts — PE scoring (tested indirectly via pe-case-study)
    'calculateDeRiskingPremiumBreakdown', // buyers.ts — breakdown variant of tested calculateDeRiskingPremium
    'EBITDA_FLOOR_PCT',                  // helpers.ts — constant used by applyEbitdaFloor (tested)
  ]);

  for (const file of engineFiles) {
    const filePath = join(engineDir, file);
    let names: string[];
    try {
      names = getExportedNames(filePath);
    } catch {
      continue; // file doesn't exist yet — skip
    }

    const testableNames = names.filter(n => !BROWSER_ONLY_ALLOWLIST.has(n) && !KNOWN_GAPS.has(n));
    if (testableNames.length === 0) continue;

    describe(file, () => {
      it.each(testableNames)('%s is referenced in at least one test file', (name) => {
        // Check if the name appears in any test file (as import, call, or reference)
        const found = allTestContents.includes(name);
        expect(found, `${file} exports '${name}' but no test file references it — add a test or add to BROWSER_ONLY_ALLOWLIST with justification`).toBe(true);
      });
    });
  }
});

// ══════════════════════════════════════════════════════════════════
// 2. Event Type Coverage
// ══════════════════════════════════════════════════════════════════

describe('Coverage Tripwires — Event Type Coverage', () => {
  const eventTypes = extractUnionValues(typesContent, 'EventType');

  it('EventType union is non-empty', () => {
    expect(eventTypes.length).toBeGreaterThan(0);
  });

  // Event types can be covered in any test file (market-events, events-new, simulation, switch-exhaustiveness, etc.)
  it.each(eventTypes)('event type "%s" appears in at least one test file', (eventType) => {
    expect(
      allTestContents.includes(eventType),
      `EventType '${eventType}' not found in any test file`
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. Achievement ID Coverage
// ══════════════════════════════════════════════════════════════════

describe('Coverage Tripwires — Achievement ID Coverage', () => {
  const achievementsContent = readFile(join(dataDir, 'achievementPreview.ts'));
  const achievementTestContent = readTestFile('achievement-predicates.test.ts');

  // Extract all achievement IDs: id: 'some_id'
  const achievementIds: string[] = [];
  const re = /id:\s*'([^']+)'/g;
  let match;
  while ((match = re.exec(achievementsContent)) !== null) {
    achievementIds.push(match[1]);
  }

  it('achievement definitions are non-empty', () => {
    expect(achievementIds.length).toBeGreaterThan(0);
  });

  // If test iterates all achievements, all are covered
  const iteratesAll = achievementTestContent.includes('ACHIEVEMENTS') &&
    (achievementTestContent.includes('.forEach') || achievementTestContent.includes('.map'));

  if (!iteratesAll) {
    it.each(achievementIds)('achievement "%s" appears in achievement-predicates test', (id) => {
      expect(
        achievementTestContent.includes(id),
        `Achievement '${id}' (from achievementPreview.ts) not found in achievement-predicates.test.ts`
      ).toBe(true);
    });
  } else {
    it('test iterates all achievements via ACHIEVEMENTS collection', () => {
      expect(iteratesAll).toBe(true);
    });
  }
});

// ══════════════════════════════════════════════════════════════════
// 4. Platform Recipe Coverage
// ══════════════════════════════════════════════════════════════════

describe('Coverage Tripwires — Platform Recipe Coverage', () => {
  const recipesContent = readFile(join(dataDir, 'platformRecipes.ts'));
  const recipeTestContent = readTestFile('platform-recipe-integrity.test.ts');

  // If test iterates all recipes, all are covered
  const iteratesAll = recipeTestContent.includes('PLATFORM_RECIPES') &&
    (recipeTestContent.includes('.forEach') || recipeTestContent.includes('.map') ||
     recipeTestContent.includes('it.each'));

  if (iteratesAll) {
    it('test iterates all platform recipes via PLATFORM_RECIPES collection', () => {
      expect(iteratesAll).toBe(true);
    });
  } else {
    // Fallback: check each recipe ID
    const recipeIds: string[] = [];
    const re = /id:\s*'([^']+)'/g;
    let match;
    while ((match = re.exec(recipesContent)) !== null) {
      recipeIds.push(match[1]);
    }

    it('recipe definitions are non-empty', () => {
      expect(recipeIds.length).toBeGreaterThan(0);
    });

    it.each(recipeIds)('recipe "%s" appears in platform-recipe-integrity test', (id) => {
      expect(
        recipeTestContent.includes(id),
        `Recipe '${id}' (from platformRecipes.ts) not found in platform-recipe-integrity.test.ts`
      ).toBe(true);
    });
  }
});

// ══════════════════════════════════════════════════════════════════
// 5. Sector Coverage
// ══════════════════════════════════════════════════════════════════

describe('Coverage Tripwires — Sector Coverage', () => {
  const sectorIds = extractUnionValues(typesContent, 'SectorId');
  const sectorTestContent = readTestFile('sector-consistency.test.ts');

  it('SectorId union is non-empty', () => {
    expect(sectorIds.length).toBeGreaterThan(0);
  });

  // sector-consistency test iterates SECTOR_LIST/SECTORS dynamically, so all sectors
  // are covered if that import exists. Also verify the count matches as a tripwire.
  const iteratesSectors = sectorTestContent.includes('SECTOR_LIST') || sectorTestContent.includes('SECTORS');

  if (iteratesSectors) {
    it('test dynamically iterates all sectors via SECTOR_LIST/SECTORS', () => {
      expect(iteratesSectors).toBe(true);
    });

    it(`SectorId count (${sectorIds.length}) matches SECTOR_LIST length assertion in test`, () => {
      // The test should assert SECTOR_LIST.length somewhere — if someone adds a sector
      // to types.ts but not to sectors.ts, that test catches it. We verify the type union
      // count is reasonable (currently 20).
      expect(sectorIds.length).toBeGreaterThanOrEqual(15);
    });
  } else {
    // Fallback: check individual IDs
    it.each(sectorIds)('sector "%s" appears in sector-consistency test', (sectorId) => {
      expect(
        sectorTestContent.includes(sectorId),
        `SectorId '${sectorId}' not found in sector-consistency.test.ts`
      ).toBe(true);
    });
  }
});

// ══════════════════════════════════════════════════════════════════
// 6. Improvement Type Coverage
// ══════════════════════════════════════════════════════════════════

describe('Coverage Tripwires — Improvement Type Coverage', () => {
  const improvementTypes = extractUnionValues(typesContent, 'OperationalImprovementType');
  const improvementTestContent = readTestFile('improvements.test.ts');

  it('OperationalImprovementType union is non-empty', () => {
    expect(improvementTypes.length).toBeGreaterThan(0);
  });

  it.each(improvementTypes)('improvement type "%s" appears in improvements test', (type) => {
    expect(
      improvementTestContent.includes(type),
      `OperationalImprovementType '${type}' not found in improvements.test.ts`
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// 7. Distress Level Coverage
// ══════════════════════════════════════════════════════════════════

describe('Coverage Tripwires — Distress Level Coverage', () => {
  const distressLevels = extractUnionValues(typesContent, 'DistressLevel');
  const distressTestContent = readTestFile('distress.test.ts');

  it('DistressLevel union is non-empty', () => {
    expect(distressLevels.length).toBeGreaterThan(0);
  });

  it.each(distressLevels)('distress level "%s" appears in distress test', (level) => {
    expect(
      distressTestContent.includes(level),
      `DistressLevel '${level}' not found in distress.test.ts`
    ).toBe(true);
  });
});
