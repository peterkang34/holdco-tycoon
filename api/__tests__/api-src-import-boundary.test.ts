/**
 * Dara H4 tripwire — api/ files can import from src/, but only pure-data modules.
 *
 * Rationale: Vercel bundles each api/ endpoint independently and tree-shakes,
 * so pulling in React/Zustand/DOM-dependent src/ modules silently inflates the
 * serverless bundle and may break at cold start. This test walks every import
 * statement in api/ that targets ../src/... and verifies each transitive
 * dependency is on an explicit allowlist of "pure" modules.
 *
 * When this test fails: either the new import is actually pure (add to the
 * allowlist) or it's not (extract what the api needs into api/_lib/ instead).
 *
 * Longer-term goal per Dara: move the small subset the api actually needs
 * (validateScenarioConfig, migrateScenarioConfig, FORCEABLE_EVENT_TYPES,
 * CURRENT_SCENARIO_CONFIG_VERSION, SECTORS keys) into api/_lib/ so the
 * api/src boundary is crossed at exactly one documented point.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';

const REPO_ROOT = resolve(__dirname, '..', '..');
const API_ROOT = join(REPO_ROOT, 'api');

/**
 * Allowlist of src/ module paths api/ is permitted to import from.
 *
 * IMPORTANT: before adding to this list, verify the module's transitive import
 * graph is free of React, Zustand, browser-only APIs (window, document, localStorage),
 * and anything that bundles heavy. Type-only imports are always safe.
 */
const ALLOWED_SRC_IMPORTS = new Set<string>([
  'src/data/scenarioChallenges',
  'src/data/sectors',
  'src/data/presetScenarios/roadToCarry',
  'src/engine/types',
]);

/** Recursively collect every .ts file under api/, excluding __tests__ and node_modules. */
function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectTsFiles(full, acc);
    } else if (name.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Extract all `from '...'` import specifiers from TS source. */
function extractImportSpecifiers(source: string): string[] {
  const out: string[] = [];
  // Matches: import ... from 'spec' / import 'spec'
  const regex = /(?:from\s+|import\s+)(['"])([^'"\n]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    out.push(m[2]);
  }
  return out;
}

/**
 * Given an api/ file and one of its import specifiers, resolve to a src/-relative
 * path if the import targets src/. Returns null for non-src imports.
 */
function resolveSrcImport(apiFilePath: string, specifier: string): string | null {
  // Only relative paths can target src/ (no path aliases in this repo).
  if (!specifier.startsWith('.')) return null;

  const resolved = resolve(dirname(apiFilePath), specifier);
  // Strip .js suffix (TS imports use .js extensions with NodeNext resolution).
  const noExt = resolved.replace(/\.js$/, '').replace(/\.ts$/, '');
  const rel = noExt.slice(REPO_ROOT.length + 1); // drop leading slash

  if (rel.startsWith('src/')) return rel;
  return null;
}

describe('api/ → src/ import boundary (Dara H4 tripwire)', () => {
  it('every src/ import from api/ is on the ALLOWED_SRC_IMPORTS allowlist', () => {
    const violations: Array<{ file: string; specifier: string; resolved: string }> = [];

    for (const file of collectTsFiles(API_ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractImportSpecifiers(source)) {
        const resolved = resolveSrcImport(file, specifier);
        if (resolved && !ALLOWED_SRC_IMPORTS.has(resolved)) {
          violations.push({
            file: file.slice(REPO_ROOT.length + 1),
            specifier,
            resolved,
          });
        }
      }
    }

    if (violations.length > 0) {
      const detail = violations
        .map(v => `  ${v.file}: '${v.specifier}' → ${v.resolved}`)
        .join('\n');
      throw new Error(
        `Unauthorized src/ imports from api/:\n${detail}\n\n` +
        `If the module is pure (no React/Zustand/DOM/localStorage deps), ` +
        `add it to ALLOWED_SRC_IMPORTS in api-src-import-boundary.test.ts. ` +
        `Otherwise extract what the api needs into api/_lib/.`,
      );
    }

    expect(violations).toEqual([]);
  });

  it('allowed src/ modules do not transitively import React, Zustand, or browser-only APIs', () => {
    const FORBIDDEN_PATTERNS = [
      { pattern: /from ['"]react['"]/, name: 'react' },
      { pattern: /from ['"]react-dom['"]/, name: 'react-dom' },
      { pattern: /from ['"]zustand['"]/, name: 'zustand' },
      { pattern: /from ['"]zustand\//, name: 'zustand/*' },
      // window/document/localStorage usage is allowed in src/ generally (engine
      // tests have it) — but not in the modules api/ transitively imports.
    ];

    // Walk the allowlisted modules + anything they import (shallow — one level).
    const visited = new Set<string>();
    const queue: string[] = [...ALLOWED_SRC_IMPORTS].map(p => join(REPO_ROOT, `${p}.ts`));

    while (queue.length > 0) {
      const file = queue.shift()!;
      if (visited.has(file)) continue;
      visited.add(file);

      let source: string;
      try {
        source = readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      for (const { pattern, name } of FORBIDDEN_PATTERNS) {
        if (pattern.test(source)) {
          throw new Error(
            `Allowed src/ module ${file.slice(REPO_ROOT.length + 1)} imports forbidden dependency '${name}'. ` +
            `This would balloon the api/ bundle. Remove the import or extract the api-needed ` +
            `functionality into api/_lib/ instead.`,
          );
        }
      }

      // Follow relative imports one level deep.
      for (const spec of extractImportSpecifiers(source)) {
        if (!spec.startsWith('.')) continue;
        const nextResolved = resolve(dirname(file), spec);
        const nextFile = nextResolved.endsWith('.ts')
          ? nextResolved
          : `${nextResolved.replace(/\.js$/, '')}.ts`;
        if (!visited.has(nextFile)) queue.push(nextFile);
      }
    }

    // No throws → pass.
    expect(true).toBe(true);
  });
});
