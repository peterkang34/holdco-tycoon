/**
 * Regression: scenario-mode flags must not leak from an in-session admin preview
 * into a later real game (CLAUDE.md incident #9).
 *
 * Root cause was that isAdminPreview / isScenarioChallengeMode / scenarioChallengeId /
 * scenarioChallengeConfig were persisted but ABSENT from `initialState`. Because Zustand
 * `set({ ...initialState, ... })` merges, a prior preview left isAdminPreview:true stale
 * into the next real game — and submit.ts silently drops the genuine leaderboard write.
 *
 * Fix: those four fields now live in `initialState`, so every start path that spreads it
 * (startGame, resetGame, startBusinessSchool) clears them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// useGame.ts runs runAllMigrations() at module load, which touches localStorage.
// jsdom's default about:blank origin makes localStorage unavailable, so provide an
// in-memory polyfill BEFORE the store module is imported (vi.hoisted runs first).
vi.hoisted(() => {
  const mem = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() { return mem.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
});

import { useGameStore } from '../useGame';
import { buildRoadToCarryPresets } from '../../data/presetScenarios/roadToCarry';

const scenarioConfig = buildRoadToCarryPresets()[0];

describe('scenario-mode flag leak', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it('sets the scenario flags when an admin preview starts', () => {
    useGameStore.getState().startScenarioChallenge('Preview Co', scenarioConfig, true);
    const s = useGameStore.getState();
    expect(s.isScenarioChallengeMode).toBe(true);
    expect(s.isAdminPreview).toBe(true);
    expect(s.scenarioChallengeId).toBe(scenarioConfig.id);
  });

  it('resetGame clears all four scenario flags after a preview', () => {
    useGameStore.getState().startScenarioChallenge('Preview Co', scenarioConfig, true);
    useGameStore.getState().resetGame();
    const s = useGameStore.getState();
    expect(s.isScenarioChallengeMode).toBe(false);
    expect(s.isAdminPreview).toBe(false);
    expect(s.scenarioChallengeId).toBeUndefined();
    expect(s.scenarioChallengeConfig).toBeNull();
  });

  it('a real game started after a preview is NOT a scenario/preview (the leak)', () => {
    // Simulate the exact in-session sequence: admin previews, returns to menu, plays a real game.
    useGameStore.getState().startScenarioChallenge('Preview Co', scenarioConfig, true);
    useGameStore.getState().resetGame();
    useGameStore.getState().startGame('Real Co', 'agency', 'normal', 'quick');

    const s = useGameStore.getState();
    expect(s.isAdminPreview).toBe(false); // would be the silently-dropped score before the fix
    expect(s.isScenarioChallengeMode).toBe(false);
    expect(s.scenarioChallengeId).toBeUndefined();
    expect(s.scenarioChallengeConfig).toBeNull();
  });

  it('starting a real game directly after a preview (no resetGame) also clears the flags', () => {
    // startGame spreads initialState, so even without an explicit reset the flags must clear.
    useGameStore.getState().startScenarioChallenge('Preview Co', scenarioConfig, true);
    useGameStore.getState().startGame('Real Co', 'agency', 'normal', 'quick');

    const s = useGameStore.getState();
    expect(s.isAdminPreview).toBe(false);
    expect(s.isScenarioChallengeMode).toBe(false);
  });
});
