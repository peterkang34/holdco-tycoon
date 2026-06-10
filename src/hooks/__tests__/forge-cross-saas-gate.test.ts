/**
 * Regression for the reported "forge platform wouldn't take" bug in Scenario
 * Challenge mode.
 *
 * Root cause: the cross-sector SaaS+Services recipe (`cross_saas_services_vertical`)
 * is achievement-gated in the store action (forgeIntegratedPlatform) on
 * `unlockedMechanics.crossSectorSaasServices`, but the UI's eligibility list
 * (checkPlatformEligibility) never checked that gate — so the Forge button
 * rendered and the click silently no-oped. A Scenario Challenge is a sealed
 * sandbox that earns NO achievements, so a player who hadn't already unlocked it
 * elsewhere could never forge it ("tried over 4-5 rounds, hung up not taking").
 *
 * The fix routes both layers through `isPlatformRecipeUnlocked(recipeId,
 * crossSaasUnlocked)` where `crossSaasUnlocked = unlocked || isScenarioChallengeMode`.
 * Scenario mode suspends the gate (mirroring how getAvailableSectors suspends
 * sector unlock gates); normal mode still respects it.
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
import type { ScenarioChallengeConfig } from '../../engine/types';

const RECIPE = 'cross_saas_services_vertical';

/** Two Q4 businesses + ample cash — the store action checks only phase, gate,
 *  Q3+, and cash (it trusts the passed businessIds; eligibility lives in the UI). */
function baseState(overrides = {}) {
  return createMockGameState({
    phase: 'allocate',
    cash: 50_000_000,
    businesses: [
      createMockBusiness({ id: 's1', sectorId: 'saas', subType: 'Vertical-Market SaaS', qualityRating: 4, ebitda: 4000, status: 'active' }),
      createMockBusiness({ id: 'h1', sectorId: 'homeServices', subType: 'HVAC Services', qualityRating: 4, ebitda: 4000, status: 'active' }),
    ],
    integratedPlatforms: [],
    ...overrides,
  });
}

beforeEach(() => { useGameStore.getState().resetGame(); });

describe('forge cross-saas unlock gate', () => {
  it('NORMAL mode + locked → forge silently no-ops (the original gate, preserved)', () => {
    useGameStore.setState(baseState({
      isScenarioChallengeMode: false,
      unlockedMechanics: { enhancedSubTypeSpec: false, crossSectorSaasServices: false },
    }));
    useGameStore.getState().forgeIntegratedPlatform(RECIPE, ['s1', 'h1']);
    expect(useGameStore.getState().integratedPlatforms).toHaveLength(0);
  });

  it('NORMAL mode + unlocked → forge succeeds', () => {
    useGameStore.setState(baseState({
      isScenarioChallengeMode: false,
      unlockedMechanics: { enhancedSubTypeSpec: false, crossSectorSaasServices: true },
    }));
    useGameStore.getState().forgeIntegratedPlatform(RECIPE, ['s1', 'h1']);
    expect(useGameStore.getState().integratedPlatforms).toHaveLength(1);
  });

  it('SCENARIO mode + locked → forge succeeds (sealed sandbox suspends the gate) — THE FIX', () => {
    useGameStore.setState(baseState({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: { triggers: [] } as unknown as ScenarioChallengeConfig,
      unlockedMechanics: { enhancedSubTypeSpec: false, crossSectorSaasServices: false },
    }));
    useGameStore.getState().forgeIntegratedPlatform(RECIPE, ['s1', 'h1']);
    expect(useGameStore.getState().integratedPlatforms).toHaveLength(1);
  });

  it('SCENARIO mode + platformForge disabled → forge no-ops (engine gate honors disabledFeatures)', () => {
    useGameStore.setState(baseState({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: { triggers: [], disabledFeatures: { platformForge: true } } as unknown as ScenarioChallengeConfig,
      unlockedMechanics: { enhancedSubTypeSpec: false, crossSectorSaasServices: false },
    }));
    useGameStore.getState().forgeIntegratedPlatform(RECIPE, ['s1', 'h1']);
    expect(useGameStore.getState().integratedPlatforms).toHaveLength(0);
  });
});
