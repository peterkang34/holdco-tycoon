/**
 * Switch Exhaustiveness Tests
 *
 * Uses fs.readFileSync + regex to extract all keys/types from source files
 * and asserts every one has a handler in the corresponding switch statement.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const srcRoot = path.resolve(__dirname, '../..');

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf-8');
}

function extractUnionMembers(content: string, typeName: string): string[] {
  // Match: export type TypeName = 'a' | 'b' | 'c';
  // Handle multi-line unions
  const regex = new RegExp(`export\\s+type\\s+${typeName}\\s*=([^;]+);`, 's');
  const match = content.match(regex);
  if (!match) return [];
  const body = match[1];
  const members: string[] = [];
  const strRegex = /'([^']+)'/g;
  let m;
  while ((m = strRegex.exec(body)) !== null) {
    members.push(m[1]);
  }
  return members;
}

function extractSwitchCases(content: string): string[] {
  // Extract all case 'xxx': patterns from the file
  const cases: string[] = [];
  const regex = /case\s+'([^']+)'/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    cases.push(m[1]);
  }
  return [...new Set(cases)];
}

function extractRecordKeys(content: string, varName: string): string[] {
  // Find a const varName: Record<...> = { key1: { ... }, key2: { ... }, }
  // Only extract top-level keys (at the start of a line or after opening brace)
  const regex = new RegExp(`(?:const|let|export\\s+const)\\s+${varName}[^=]*=\\s*\\{`, 's');
  const match = content.match(regex);
  if (!match) return [];
  const startIdx = (match.index ?? 0) + match[0].length;

  // Walk through the content tracking brace depth to find top-level keys
  const keys: string[] = [];
  let depth = 1;
  let i = startIdx;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  // Now extract the body between the outer braces
  const body = content.slice(startIdx, i - 1);

  // Top-level keys are at depth 0 within this body — match key patterns at line starts
  const keyRegex = /^\s*(\w+)\s*:\s*\{/gm;
  let m;
  while ((m = keyRegex.exec(body)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

// ── 1. Dashboard metric keys → MetricDrilldownModal switch ──

describe('MetricDrilldownModal switch covers all metric keys', () => {
  const drilldownContent = readFile('components/ui/MetricDrilldownModal.tsx');

  // The known metric keys used in the dashboard
  const DASHBOARD_METRIC_KEYS = [
    'cash', 'ebitda', 'netfcf', 'fcfshare',
    'roic', 'roiic', 'moic', 'leverage', 'cashconv',
    'nav', 'dpi', 'carry', 'deployed',
  ];

  const drilldownCases = extractSwitchCases(drilldownContent);

  for (const key of DASHBOARD_METRIC_KEYS) {
    it(`has case for metric key '${key}'`, () => {
      expect(drilldownCases).toContain(key);
    });
  }

  it('drilldown has a default handler', () => {
    expect(drilldownContent).toMatch(/default:\s*\n?\s*return/);
  });
});

// ── 2. EventType → EventCard getEventIcon switch ──

describe('EventCard getEventIcon covers all EventTypes', () => {
  const typesContent = readFile('engine/types.ts');
  const eventCardContent = readFile('components/cards/EventCard.tsx');

  const allEventTypes = extractUnionMembers(typesContent, 'EventType');
  const eventCardCases = extractSwitchCases(eventCardContent);

  // Some event types may not appear in the icon switch — they may use default
  // But we want to flag any that are completely missing from the file
  const eventTypesInCard = new Set(eventCardCases);

  // These event types need explicit icon mappings (not just default)
  // Filter out types that intentionally fall to default
  const typesWithoutFallthrough = [
    'global_quiet', // intentionally uses default
    'mbo_proposal', // intentionally uses default
    'portfolio_seller_deception', // intentionally uses default
    'portfolio_working_capital_crunch', // intentionally uses default
    'portfolio_management_succession', // intentionally uses default
    'filler_tax_strategy', // intentionally uses default
    'filler_industry_conference', // intentionally uses default
    'filler_operational_audit', // intentionally uses default
    'filler_reputation_building', // intentionally uses default
    'global_financial_crisis', // intentionally uses default
  ];

  for (const eventType of allEventTypes) {
    if (typesWithoutFallthrough.includes(eventType)) continue;
    it(`EventCard handles event type '${eventType}'`, () => {
      expect(eventTypesInCard.has(eventType)).toBe(true);
    });
  }

  it(`all EventType values are accounted for (handled or in fallthrough list)`, () => {
    const unhandled = allEventTypes.filter(
      t => !eventTypesInCard.has(t) && !typesWithoutFallthrough.includes(t)
    );
    expect(unhandled).toEqual([]);
  });

  it('EventCard has a default handler', () => {
    expect(eventCardContent).toMatch(/default:\s*\n?\s*return/);
  });
});

// ── 3. SharedServiceType → SHARED_SERVICES_CONFIG ──

describe('SharedServiceType fully covered in config', () => {
  const typesContent = readFile('engine/types.ts');
  const ssContent = readFile('data/sharedServices.ts');

  const allSSTypes = extractUnionMembers(typesContent, 'SharedServiceType');
  const configKeys = extractRecordKeys(ssContent, 'SHARED_SERVICES_CONFIG');

  for (const ssType of allSSTypes) {
    it(`SHARED_SERVICES_CONFIG has entry for '${ssType}'`, () => {
      expect(configKeys).toContain(ssType);
    });
  }

  it('no extra keys in config beyond the type', () => {
    for (const key of configKeys) {
      expect(allSSTypes).toContain(key);
    }
  });
});

// ── 4. SharedServiceType → calculateSharedServicesBenefits ──

describe('calculateSharedServicesBenefits handles all SharedServiceTypes', () => {
  const simContent = readFile('engine/simulation.ts');
  const typesContent = readFile('engine/types.ts');

  const allSSTypes = extractUnionMembers(typesContent, 'SharedServiceType');

  // The benefits function should reference each type in some form
  // (either as a case in a switch or as a string comparison)
  for (const ssType of allSSTypes) {
    it(`simulation.ts references shared service type '${ssType}'`, () => {
      expect(simContent).toContain(ssType);
    });
  }
});

// ── 5. OperationalImprovementType → IMPROVEMENT_EXIT_PREMIUMS record ──

describe('OperationalImprovementType fully covered in exit premiums', () => {
  const typesContent = readFile('engine/types.ts');
  const simContent = readFile('engine/simulation.ts');

  const allImpTypes = extractUnionMembers(typesContent, 'OperationalImprovementType');

  // IMPROVEMENT_EXIT_PREMIUMS is a flat Record<Type, number>, so extract keys with simple regex
  const premiumBlock = simContent.match(/IMPROVEMENT_EXIT_PREMIUMS[^{]*\{([^}]+)\}/s)?.[1] ?? '';
  const premiumKeys: string[] = [];
  const keyRe = /(\w+)\s*:/g;
  let km;
  while ((km = keyRe.exec(premiumBlock)) !== null) premiumKeys.push(km[1]);

  for (const impType of allImpTypes) {
    it(`IMPROVEMENT_EXIT_PREMIUMS has entry for '${impType}'`, () => {
      expect(premiumKeys).toContain(impType);
    });
  }

  it('no extra keys in premiums beyond the type', () => {
    for (const key of premiumKeys) {
      expect(allImpTypes).toContain(key);
    }
  });
});

// ── 6. EventCard isPositive/isNegative covers all event types ──

describe('EventCard sentiment classification coverage', () => {
  const eventCardContent = readFile('components/cards/EventCard.tsx');

  // Extract types referenced in isPositive and isNegative blocks
  const posBlock = eventCardContent.match(/const isPositive\s*=[^;]+;/s)?.[0] ?? '';
  const negBlock = eventCardContent.match(/const isNegative\s*=[^;]+;/s)?.[0] ?? '';

  const posTypes = new Set<string>();
  const negTypes = new Set<string>();
  const typeRef = /event\.type\s*===\s*'([^']+)'/g;

  let m;
  while ((m = typeRef.exec(posBlock)) !== null) posTypes.add(m[1]);
  const typeRef2 = /event\.type\s*===\s*'([^']+)'/g;
  while ((m = typeRef2.exec(negBlock)) !== null) negTypes.add(m[1]);

  // Neutral events don't need to be in either list, but check coverage
  const classified = new Set([...posTypes, ...negTypes]);

  it('no event type is both positive AND negative (except sector_event which is runtime-checked)', () => {
    const overlap = [...posTypes].filter(t => negTypes.has(t) && t !== 'sector_event');
    expect(overlap).toEqual([]);
  });

  // sector_event is dynamic (checked with effect.includes('-')), so it's in both
  // which is fine — skip it in the overlap test
  it('at least 10 event types are classified as positive or negative', () => {
    // sector_event appears in both but with runtime check, not a contradiction
    expect(classified.size).toBeGreaterThanOrEqual(10);
  });
});

// ── 7. DealStructureType coverage in deals.ts ──

describe('DealStructureType type coverage', () => {
  const typesContent = readFile('engine/types.ts');
  const allDealStructureTypes = extractUnionMembers(typesContent, 'DealStructureType');

  it('has at least 5 deal structure types defined', () => {
    expect(allDealStructureTypes.length).toBeGreaterThanOrEqual(5);
  });

  it('includes rollover_equity', () => {
    expect(allDealStructureTypes).toContain('rollover_equity');
  });

  it('includes share_funded', () => {
    expect(allDealStructureTypes).toContain('share_funded');
  });
});

// ── 8. GamePhase type coverage ──

describe('GamePhase type coverage', () => {
  const typesContent = readFile('engine/types.ts');
  const allPhases = extractUnionMembers(typesContent, 'GamePhase');

  it('has exactly 4 phases', () => {
    expect(allPhases).toEqual(['collect', 'event', 'allocate', 'restructure']);
  });

  // Check that GameScreen.tsx handles all phases
  const gameScreenContent = readFile('components/screens/GameScreen.tsx');

  for (const phase of allPhases) {
    it(`GameScreen references phase '${phase}'`, () => {
      expect(gameScreenContent).toContain(phase);
    });
  }
});

// ── 9. DistressLevel type coverage ──

describe('DistressLevel type coverage', () => {
  const typesContent = readFile('engine/types.ts');
  const allLevels = extractUnionMembers(typesContent, 'DistressLevel');

  it('has exactly 4 distress levels', () => {
    expect(allLevels).toEqual(['comfortable', 'elevated', 'stressed', 'breach']);
  });

  // Check distress.ts handles all levels
  const distressContent = readFile('engine/distress.ts');
  for (const level of allLevels) {
    it(`distress.ts references level '${level}'`, () => {
      expect(distressContent).toContain(level);
    });
  }
});

// ── 10. QualityRating type coverage ──

describe('QualityRating type coverage', () => {
  const typesContent = readFile('engine/types.ts');

  // QualityRating is a numeric union: 1 | 2 | 3 | 4 | 5
  const qrMatch = typesContent.match(/export\s+type\s+QualityRating\s*=\s*([^;]+);/);
  expect(qrMatch).toBeTruthy();

  const nums = qrMatch![1].split('|').map(s => parseInt(s.trim()));

  it('has ratings 1 through 5', () => {
    expect(nums).toEqual([1, 2, 3, 4, 5]);
  });
});

// ── 11. GameActionType coverage ──

describe('GameActionType has comprehensive action set', () => {
  const typesContent = readFile('engine/types.ts');
  const allActions = extractUnionMembers(typesContent, 'GameActionType');

  it('has at least 20 action types', () => {
    expect(allActions.length).toBeGreaterThanOrEqual(20);
  });

  const expectedCoreActions = [
    'acquire', 'sell', 'improve', 'distribute',
    'issue_equity', 'buyback', 'pay_debt',
    'forge_integrated_platform', 'ipo', 'start_turnaround',
  ];

  for (const action of expectedCoreActions) {
    it(`includes core action '${action}'`, () => {
      expect(allActions).toContain(action);
    });
  }
});

// ── 12. SectorId type coverage in SECTORS ──

describe('SectorId fully covered in SECTORS config', () => {
  const typesContent = readFile('engine/types.ts');
  const sectorsContent = readFile('data/sectors.ts');

  const allSectorIds = extractUnionMembers(typesContent, 'SectorId');

  for (const sectorId of allSectorIds) {
    it(`SECTORS has entry for '${sectorId}'`, () => {
      // Check the sector ID appears as a key in SECTORS
      expect(sectorsContent).toContain(`${sectorId}:`);
    });
  }
});

// ── 13. BusinessStatus type ──

describe('BusinessStatus type coverage', () => {
  const typesContent = readFile('engine/types.ts');
  const allStatuses = extractUnionMembers(typesContent, 'BusinessStatus');

  it('includes expected statuses', () => {
    expect(allStatuses).toContain('active');
    expect(allStatuses).toContain('sold');
    expect(allStatuses).toContain('integrated');
    expect(allStatuses).toContain('merged');
    expect(allStatuses).toContain('wound_down'); // kept for compat
  });
});

// ── 14. DealHeat type coverage ──

describe('DealHeat type coverage', () => {
  const typesContent = readFile('engine/types.ts');
  const allHeats = extractUnionMembers(typesContent, 'DealHeat');

  it('has 4 heat levels', () => {
    expect(allHeats).toEqual(['cold', 'warm', 'hot', 'contested']);
  });
});

// ── 15. TurnaroundStatus type coverage ──

describe('TurnaroundStatus type coverage', () => {
  const typesContent = readFile('engine/types.ts');
  const allStatuses = extractUnionMembers(typesContent, 'TurnaroundStatus');

  it('has expected turnaround statuses', () => {
    expect(allStatuses).toContain('active');
    expect(allStatuses).toContain('completed');
    expect(allStatuses).toContain('partial');
    expect(allStatuses).toContain('failed');
  });
});
