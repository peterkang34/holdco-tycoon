/**
 * Load-bearing tests for the ScenarioDraft ⇄ ScenarioChallengeConfig seam.
 *
 * The invariant that makes the visual builder safe: for ANY GUI-reachable draft,
 * compileScenarioDraft(draft) passes validateScenarioConfig with zero errors — so the
 * builder can never produce a scenario the runtime rejects (the failure mode of the old
 * JSON editor). Plus round-trip fidelity: a loaded preset survives decompile→compile
 * unchanged, so editing a complex scenario never silently drops fields the GUI omits.
 */
import { describe, it, expect } from 'vitest';
import { compileScenarioDraft, decompileConfig } from '../compileDraft';
import { blankDraft, type ScenarioDraft } from '../draftModel';
import { validateScenarioConfig, CURRENT_SCENARIO_CONFIG_VERSION, FUND_STRUCTURE_PRESETS } from '../../scenarioChallenges';
import { buildRoadToCarryPresets } from '../../presetScenarios/roadToCarry';
import type { ScenarioChallengeConfig, SectorId, FundStructure } from '../../../engine/types';

// Deterministic LCG so the property sweep is reproducible (no Math.random / Date in body).
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}
const SECTORS_POOL: SectorId[] = ['agency', 'saas', 'homeServices', 'healthcare', 'restaurant'];
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];

/** Generate a VALID, GUI-reachable draft for index i. Stays inside validity by construction. */
function makeDraft(i: number): ScenarioDraft {
  const r = lcg(i + 1);
  const d = blankDraft(new Date('2026-06-06T00:00:00Z'));
  d.id = `gen-${i}`;
  d.name = `Generated ${i}`;
  d.seed = 1000 + i;
  d.difficulty = r() < 0.5 ? 'easy' : 'normal';
  d.duration = r() < 0.5 ? 'quick' : 'standard';
  d.maxRounds = 3 + Math.floor(r() * 28); // [3, 30]
  d.startingCash = 1000 + Math.floor(r() * 50000);
  d.startingDebt = Math.floor(r() * 5000);
  d.sharesOutstanding = 1000;
  d.founderShares = 1 + Math.floor(r() * 1000); // ≤ sharesOutstanding
  const bizCount = 1 + Math.floor(r() * 3);
  d.startingBusinesses = Array.from({ length: bizCount }, (_, k) => ({
    name: `Biz ${k}`,
    sectorId: pick(r, SECTORS_POOL),
    ebitda: 200 + Math.floor(r() * 3000),
    multiple: 2 + Math.floor(r() * 6),
    quality: (1 + Math.floor(r() * 5)) as 1 | 2 | 3 | 4 | 5,
  }));
  // Sometimes restrict sectors.
  d.allowedSectors = r() < 0.4 ? SECTORS_POOL.slice(0, 1 + Math.floor(r() * SECTORS_POOL.length)) : undefined;
  d.startingMaSourcingTier = (Math.floor(r() * 4)) as 0 | 1 | 2 | 3;
  d.maxAcquisitionsPerRound = r() < 0.5 ? undefined : 1 + Math.floor(r() * 5);
  d.startingInterestRate = r() < 0.5 ? undefined : Math.round(r() * 25) / 100; // [0, 0.25]
  // ~30%: PE mode from a real preset (rankingMetric coerced by compile).
  if (r() < 0.3) {
    const presetIds = Object.keys(FUND_STRUCTURE_PRESETS) as (keyof typeof FUND_STRUCTURE_PRESETS)[];
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS[pick(r, presetIds)] };
    // The GUI's PE sliders bound forcedLiquidationYear to the run length; mirror that so
    // generated drafts stay GUI-reachable (a preset's year:10 on a 4-round run is unreachable).
    if (fs.forcedLiquidationYear !== undefined) {
      fs.forcedLiquidationYear = Math.min(fs.forcedLiquidationYear, d.maxRounds);
    }
    d.fundStructure = fs;
    d.rankingMetric = pick(r, ['moic', 'irr', 'gpCarry'] as const);
  } else {
    d.fundStructure = undefined;
    d.rankingMetric = 'fev';
  }
  return d;
}

/** Round-trip comparison normalizes only the documented compile-injected key. */
function normalize(c: ScenarioChallengeConfig): ScenarioChallengeConfig {
  return { ...c, configVersion: CURRENT_SCENARIO_CONFIG_VERSION };
}

describe('compileScenarioDraft — validity invariant', () => {
  it('blankDraft compiles to a valid, playable config', () => {
    const { errors } = validateScenarioConfig(compileScenarioDraft(blankDraft(new Date('2026-06-06T00:00:00Z'))));
    expect(errors).toEqual([]);
  });

  it('~1000 GUI-reachable drafts all compile to validator-clean configs', () => {
    const failures: { i: number; errors: string[] }[] = [];
    for (let i = 0; i < 1000; i++) {
      const cfg = compileScenarioDraft(makeDraft(i));
      const { errors } = validateScenarioConfig(cfg);
      if (errors.length > 0) failures.push({ i, errors });
    }
    expect(failures).toEqual([]);
  });

  it('never throws and always emits an integer seed', () => {
    for (let i = 0; i < 1000; i++) {
      const d = makeDraft(i);
      let cfg!: ScenarioChallengeConfig;
      expect(() => { cfg = compileScenarioDraft(d); }).not.toThrow();
      expect(Number.isInteger(cfg.seed)).toBe(true);
      expect(cfg.seed).toBe(d.seed); // verbatim, never re-minted
    }
  });
});

describe('compileScenarioDraft — cross-field PE/holdco reconciliation', () => {
  it('holdco draft → fev metric and no fundStructure', () => {
    const d = blankDraft(new Date('2026-06-06T00:00:00Z'));
    d.id = 'h'; d.fundStructure = undefined; d.rankingMetric = 'fev';
    const cfg = compileScenarioDraft(d);
    expect(cfg.rankingMetric).toBe('fev');
    expect('fundStructure' in cfg).toBe(false);
  });

  it('PE draft → fundStructure present and a PE metric (never fev)', () => {
    const d = blankDraft(new Date('2026-06-06T00:00:00Z'));
    d.id = 'pe'; d.startingCash = 0; d.startingDebt = 0;
    d.fundStructure = { ...FUND_STRUCTURE_PRESETS.traditional_pe };
    d.rankingMetric = 'fev'; // stale — compile must coerce
    const cfg = compileScenarioDraft(d);
    expect(cfg.fundStructure).toBeDefined();
    expect(cfg.rankingMetric).not.toBe('fev');
  });

  it('holdco → PE → holdco leaves NO fundStructure and metric back to fev', () => {
    const base = blankDraft(new Date('2026-06-06T00:00:00Z'));
    base.id = 'toggle';
    base.fundStructure = { ...FUND_STRUCTURE_PRESETS.search_fund };
    base.rankingMetric = 'moic';
    const peCfg = compileScenarioDraft(base);
    expect(peCfg.fundStructure).toBeDefined();
    // toggle PE off
    base.fundStructure = undefined;
    const holdcoCfg = compileScenarioDraft(base);
    expect('fundStructure' in holdcoCfg).toBe(false);
    expect(holdcoCfg.rankingMetric).toBe('fev');
  });
});

describe('decompile → compile round-trip fidelity', () => {
  const presets = buildRoadToCarryPresets(new Date('2026-06-06T00:00:00Z'));

  it('seeds 5 Road to Carry presets and round-trips each losslessly', () => {
    expect(presets.length).toBe(5);
    for (const preset of presets) {
      const recompiled = compileScenarioDraft(decompileConfig(preset));
      expect(normalize(recompiled)).toEqual(normalize(preset));
    }
  });

  it('round-trips a synthetic PE config (the presets are all holdco/fev)', () => {
    const pe: ScenarioChallengeConfig = {
      ...presets[0],
      id: 'pe-synthetic',
      startingCash: 0,
      startingDebt: 0,
      fundStructure: { ...FUND_STRUCTURE_PRESETS.traditional_pe },
      rankingMetric: 'moic',
    };
    const recompiled = compileScenarioDraft(decompileConfig(pe));
    expect(normalize(recompiled)).toEqual(normalize(pe));
  });

  it('round-trips the default/omitted path (no maxAcquisitionsPerRound etc.)', () => {
    const d = blankDraft(new Date('2026-06-06T00:00:00Z'));
    d.id = 'omit'; d.maxAcquisitionsPerRound = undefined; d.allowedSectors = undefined;
    d.maSourcingMode = undefined; d.startingInterestRate = undefined;
    const cfg = compileScenarioDraft(d);
    expect('maxAcquisitionsPerRound' in cfg).toBe(false);
    expect('allowedSectors' in cfg).toBe(false);
    // and it still round-trips
    expect(normalize(compileScenarioDraft(decompileConfig(cfg)))).toEqual(normalize(cfg));
  });
});
