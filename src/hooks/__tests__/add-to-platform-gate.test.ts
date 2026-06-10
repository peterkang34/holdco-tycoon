/**
 * Regression for the "Add to platform" silent no-op in Business School mode.
 *
 * `add_to_integrated_platform` is in BS_BLOCKED_ACTIONS, but the store action
 * `addToIntegratedPlatform` had no `isActionBlocked` guard AND the UI block was
 * gated on the platform-FORGE feature (which is NOT BS-blocked). So in B-School
 * the "Add" button rendered and the click did nothing — the same class of bug as
 * the forge gate. Fix: a new `addToPlatform` FeatureKey gates the UI, and the
 * store action now calls isActionBlocked — the two agree in every mode.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(), key: () => null, get length() { return mem.size; },
    },
    configurable: true, writable: true,
  });
});

import { useGameStore } from '../useGame';
import { createMockBusiness, createMockGameState } from '../../engine/__tests__/helpers';
import type { IntegratedPlatform, ScenarioChallengeConfig } from '../../engine/types';

const PLATFORM: IntegratedPlatform = {
  id: 'plat1',
  recipeId: 'home_multi_trade',
  name: 'Multi-Trade Home Services Platform',
  sectorIds: ['homeServices'],
  constituentBusinessIds: ['hvac', 'plumb'],
  forgedInRound: 2,
  bonuses: { marginBoost: 0.04, growthBoost: 0.03, multipleExpansion: 1.5, recessionResistanceReduction: 0.8 },
};

/** Existing platform + a matching Q3 HVAC business eligible to add (sub-type + sector match, cash ample). */
function baseState(overrides = {}) {
  return createMockGameState({
    phase: 'allocate',
    cash: 50_000_000,
    businesses: [
      createMockBusiness({ id: 'hvac', sectorId: 'homeServices', subType: 'HVAC Services', qualityRating: 4, status: 'active', integratedPlatformId: 'plat1' }),
      createMockBusiness({ id: 'plumb', sectorId: 'homeServices', subType: 'Plumbing Services', qualityRating: 4, status: 'active', integratedPlatformId: 'plat1' }),
      createMockBusiness({ id: 'elec', sectorId: 'homeServices', subType: 'Electrical Services', qualityRating: 4, ebitda: 2000, revenue: 8000, status: 'active' }),
    ],
    integratedPlatforms: [PLATFORM],
    ...overrides,
  });
}

const idOf = (bizId: string) => useGameStore.getState().businesses.find(b => b.id === bizId)?.integratedPlatformId;

beforeEach(() => { useGameStore.getState().resetGame(); });

describe('addToIntegratedPlatform mode gate', () => {
  it('NORMAL mode → adds the business to the platform', () => {
    useGameStore.setState(baseState());
    useGameStore.getState().addToIntegratedPlatform('plat1', 'elec');
    expect(idOf('elec')).toBe('plat1');
  });

  it('BUSINESS SCHOOL mode → no-op (add is BS-blocked) — THE FIX', () => {
    useGameStore.setState(baseState({ isBusinessSchoolMode: true }));
    useGameStore.getState().addToIntegratedPlatform('plat1', 'elec');
    expect(idOf('elec')).toBeUndefined();
  });

  it('SCENARIO mode + integratedPlatforms disabled → no-op', () => {
    useGameStore.setState(baseState({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: { triggers: [], disabledFeatures: { integratedPlatforms: true } } as unknown as ScenarioChallengeConfig,
    }));
    useGameStore.getState().addToIntegratedPlatform('plat1', 'elec');
    expect(idOf('elec')).toBeUndefined();
  });
});
