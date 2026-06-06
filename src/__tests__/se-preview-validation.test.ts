/**
 * Contract for the #/se-preview hard-block (App.tsx).
 *
 * The admin preview handler reads a config from sessionStorage (a per-UUID handoff key)
 * and, before this fix, fed it straight into startScenarioChallenge with NO validation —
 * a pre-existing engine-ingestion hole (a stale or hand-edited payload could start a
 * broken game). The handler now refuses to start unless
 * `validateScenarioConfig(config).errors.length === 0`.
 *
 * This test pins the predicate the guard branches on: a real config passes (handler starts),
 * malformed / partial payloads fail (handler refuses → drops to intro, no engine ingestion).
 */
import { describe, it, expect } from 'vitest';
import { validateScenarioConfig } from '../data/scenarioChallenges';
import { buildRoadToCarryPresets } from '../data/presetScenarios/roadToCarry';
import type { ScenarioChallengeConfig } from '../engine/types';

describe('#/se-preview validation guard contract', () => {
  it('a real preset passes (handler would start the preview)', () => {
    const config = buildRoadToCarryPresets()[0];
    expect(validateScenarioConfig(config).errors).toHaveLength(0);
  });

  it('an empty object is rejected (handler refuses)', () => {
    const errors = validateScenarioConfig({} as unknown as ScenarioChallengeConfig).errors;
    expect(errors.length).toBeGreaterThan(0);
  });

  it('a partial payload missing required fields is rejected', () => {
    const partial = { id: 'x', name: 'Half Built' } as unknown as ScenarioChallengeConfig;
    expect(validateScenarioConfig(partial).errors.length).toBeGreaterThan(0);
  });

  it('a structurally-corrupt payload (bad dates) is rejected', () => {
    const base = buildRoadToCarryPresets()[0];
    const corrupt = { ...base, startDate: 'not-a-date', endDate: 'also-bad' };
    expect(validateScenarioConfig(corrupt).errors.length).toBeGreaterThan(0);
  });
});
