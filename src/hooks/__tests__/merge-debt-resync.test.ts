/**
 * Reproduction for the reported "debt-financed acquisitions scored as all-cash" bug, focused
 * on the platform-action path: merging two debt-laden businesses must (a) carry both debt
 * types onto the new merged entity, (b) RESYNC state.totalDebt from the post-merge business
 * list (it was previously left stale — the score/waterfall read it), and (c) have the full
 * debt subtracted from Enterprise Value.
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
import { createMockBusiness, createMockGameState } from '../../engine/__tests__/helpers';
import { calculateEnterpriseValue } from '../../engine/scoring';

beforeEach(() => { useGameStore.getState().resetGame(); });

describe('merge resyncs totalDebt (debt-drift regression)', () => {
  it('carries combined debt to the merged entity, resyncs totalDebt, and subtracts it from EV', () => {
    const biz1 = createMockBusiness({
      id: 'b1', status: 'active', sectorId: 'homeServices', subType: 'HVAC Services',
      ebitda: 1000, revenue: 4000, bankDebtBalance: 1000, sellerNoteBalance: 500, rolloverEquityPct: 0,
    });
    const biz2 = createMockBusiness({
      id: 'b2', status: 'active', sectorId: 'homeServices', subType: 'Plumbing Services',
      ebitda: 1500, revenue: 6000, bankDebtBalance: 2000, sellerNoteBalance: 800, rolloverEquityPct: 0,
    });
    // Pre-merge totalDebt deliberately STALE/wrong — the action must recompute from businesses,
    // not trust the stored field. (Old code left this stale → bank debt under-reported in the score.)
    useGameStore.setState(createMockGameState({
      businesses: [biz1, biz2], cash: 50_000, totalDebt: 999, holdcoLoanBalance: 0,
    }));

    useGameStore.getState().mergeBusinesses('b1', 'b2', 'Merged HomeServices');
    const after = useGameStore.getState();

    // (a) one merged active entity carrying BOTH debt types combined
    const merged = after.businesses.find(b => b.status === 'active');
    expect(merged).toBeDefined();
    expect(merged!.bankDebtBalance).toBe(3000);   // 1000 + 2000
    expect(merged!.sellerNoteBalance).toBe(1300); // 500 + 800

    // (b) state.totalDebt resynced from the post-merge businesses, NOT the stale 999
    expect(after.totalDebt).toBe(3000); // holdcoLoan 0 + merged bank 3000

    // (c) EV subtracts ALL of it: 3000 bank (via totalDebt) + 1300 seller notes
    const evWithDebt = calculateEnterpriseValue(after);
    const evNoDebt = calculateEnterpriseValue({
      ...after,
      totalDebt: 0,
      businesses: after.businesses.map(b => ({ ...b, bankDebtBalance: 0, sellerNoteBalance: 0 })),
    });
    expect(evNoDebt - evWithDebt).toBe(4300);
  });
});
