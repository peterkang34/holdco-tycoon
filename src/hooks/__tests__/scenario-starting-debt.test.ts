/**
 * Scenario starting debt must be a REAL serviced holdco loan (not phantom debt), and any
 * opco-level debt on starting businesses must flow into totalDebt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import type { ScenarioChallengeConfig } from '../../engine/types';

function holdcoConfig(over: Partial<ScenarioChallengeConfig> = {}): ScenarioChallengeConfig {
  return {
    id: 'debt-test', name: 'Debt Test', tagline: 't', description: 'd',
    configVersion: 1, theme: { emoji: '💰', color: '#F59E0B' },
    startDate: '2026-06-01T00:00:00Z', endDate: '2026-12-31T00:00:00Z',
    isActive: false, isFeatured: false,
    seed: 123, difficulty: 'normal', duration: 'quick', maxRounds: 10,
    startingCash: 5000, startingDebt: 3000, founderShares: 1000, sharesOutstanding: 1000,
    startingBusinesses: [{ name: 'Opco', sectorId: 'homeServices', subType: 'HVAC Services', ebitda: 1000, multiple: 4, quality: 3 }],
    rankingMetric: 'fev',
    ...over,
  };
}

beforeEach(() => { useGameStore.getState().resetGame(); });

describe('scenario starting debt', () => {
  it('wires startingDebt into a serviced holdco loan (balance + rate + term)', () => {
    useGameStore.getState().startScenarioChallenge('Holdco', holdcoConfig(), true);
    const s = useGameStore.getState();
    expect(s.holdcoLoanBalance).toBe(3000);
    expect(s.holdcoLoanRate).toBeGreaterThan(0);
    expect(s.holdcoLoanRoundsRemaining).toBe(10); // quick → full maxRounds
  });

  it('includes opco-level starting debt in totalDebt', () => {
    const config = holdcoConfig({
      startingBusinesses: [{ name: 'LBO Opco', sectorId: 'homeServices', subType: 'HVAC Services', ebitda: 1000, multiple: 4, quality: 3, bankDebt: 2000 }],
    });
    useGameStore.getState().startScenarioChallenge('Holdco', config, true);
    const s = useGameStore.getState();
    expect(s.businesses[0].bankDebtBalance).toBe(2000);          // opco carries its debt
    expect(s.totalDebt).toBe(5000);                               // holdco 3000 + opco bank 2000
  });

  it('PE scenarios start debt-free regardless of startingDebt', () => {
    const pe = holdcoConfig({
      startingDebt: 9999,
      fundStructure: { committedCapital: 100_000, mgmtFeePercent: 0.02, hurdleRate: 0.08, carryRate: 0.20, forcedLiquidationYear: 10, forcedLiquidationDiscount: 0.9 },
      rankingMetric: 'moic', startingBusinesses: [],
    });
    useGameStore.getState().startScenarioChallenge('Fund', pe, true);
    const s = useGameStore.getState();
    expect(s.holdcoLoanBalance).toBe(0);
    expect(s.totalDebt).toBe(0);
  });
});
