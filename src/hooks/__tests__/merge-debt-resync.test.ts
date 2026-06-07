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
import { createMockBusiness, createMockGameState, createMockDeal, createMockDealStructure } from '../../engine/__tests__/helpers';
import { calculateEnterpriseValue } from '../../engine/scoring';

/** EV with ALL debt stripped — same portfolio value, zero debt — so the gap == total debt. */
function debtFreeEV(state: ReturnType<typeof useGameStore.getState>): number {
  return calculateEnterpriseValue({
    ...state,
    totalDebt: 0,
    businesses: state.businesses.map(b => ({ ...b, bankDebtBalance: 0, sellerNoteBalance: 0 })),
  });
}

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
    expect(debtFreeEV(after) - calculateEnterpriseValue(after)).toBe(4300);
  });

  it('tuck-in INTO a merged entity keeps all four debt components in EV (the reported nested path)', () => {
    // Step 1: merge two debt-financed businesses into a platform.
    const biz1 = createMockBusiness({ id: 'b1', status: 'active', sectorId: 'homeServices', subType: 'HVAC Services', ebitda: 1000, revenue: 4000, bankDebtBalance: 1000, sellerNoteBalance: 500, rolloverEquityPct: 0 });
    const biz2 = createMockBusiness({ id: 'b2', status: 'active', sectorId: 'homeServices', subType: 'Plumbing Services', ebitda: 1500, revenue: 6000, bankDebtBalance: 2000, sellerNoteBalance: 800, rolloverEquityPct: 0 });
    useGameStore.setState(createMockGameState({
      businesses: [biz1, biz2], cash: 80_000, totalDebt: 3000, holdcoLoanBalance: 0,
      acquisitionsThisRound: 0, maxAcquisitionsPerRound: 5, requiresRestructuring: false,
    }));
    useGameStore.getState().mergeBusinesses('b1', 'b2', 'Merged HomeServices');

    const mergedPlatform = useGameStore.getState().businesses.find(b => b.status === 'active' && b.isPlatform);
    expect(mergedPlatform).toBeDefined();

    // Step 2: tuck a debt-financed bolt-on INTO the merged entity.
    const base = createMockDeal();
    const deal = createMockDeal({
      id: 'tuckin_deal', effectivePrice: 3000,
      business: { ...base.business, sectorId: 'homeServices', subType: 'Electrical Services', ebitda: 800, revenue: 3200, qualityRating: 3 },
    });
    const structure = createMockDealStructure({
      cashRequired: 800,
      bankDebt: { amount: 1500, rate: 0.07, termRounds: 5 },
      sellerNote: { amount: 700, rate: 0.08, termRounds: 5 },
    });
    useGameStore.getState().acquireTuckIn(deal, structure, mergedPlatform!.id);

    const after = useGameStore.getState();
    // The bolt-on exists as an integrated child carrying its own debt.
    const boltOn = after.businesses.find(b => b.status === 'integrated' && b.parentPlatformId === mergedPlatform!.id);
    expect(boltOn).toBeDefined();
    expect(boltOn!.bankDebtBalance).toBe(1500);
    expect(boltOn!.sellerNoteBalance).toBe(700);

    // state.totalDebt = merged bank (3000) + bolt-on bank (1500).
    expect(after.totalDebt).toBe(4500);

    // EV subtracts ALL four components: merged bank 3000 + merged seller 1300
    //                                + bolt-on bank 1500 + bolt-on seller 700 = 6500.
    expect(debtFreeEV(after) - calculateEnterpriseValue(after)).toBe(6500);
  });

  it('forging a recipe over a merged+tucked platform + a second platform keeps ALL debt in EV', () => {
    // Full reported shape: merge → tuck-in → forge an integrated platform (recipe) wrapping
    // the merged/tucked platform AND a second debt-laden platform.
    const biz1 = createMockBusiness({ id: 'b1', status: 'active', sectorId: 'homeServices', subType: 'HVAC Services', ebitda: 1000, revenue: 4000, qualityRating: 4, bankDebtBalance: 1000, sellerNoteBalance: 500, rolloverEquityPct: 0 });
    const biz2 = createMockBusiness({ id: 'b2', status: 'active', sectorId: 'homeServices', subType: 'Plumbing Services', ebitda: 1500, revenue: 6000, qualityRating: 4, bankDebtBalance: 2000, sellerNoteBalance: 800, rolloverEquityPct: 0 });
    // Second platform constituent (stays active through the forge).
    const p2 = createMockBusiness({ id: 'p2', status: 'active', sectorId: 'homeServices', subType: 'Plumbing Services', ebitda: 1200, revenue: 5000, qualityRating: 3, bankDebtBalance: 1200, sellerNoteBalance: 400, rolloverEquityPct: 0 });
    useGameStore.setState(createMockGameState({
      businesses: [biz1, biz2, p2], cash: 200_000, totalDebt: 4200, holdcoLoanBalance: 0,
      acquisitionsThisRound: 0, maxAcquisitionsPerRound: 5, requiresRestructuring: false,
    }));

    // merge → P1
    useGameStore.getState().mergeBusinesses('b1', 'b2', 'Merged HomeServices');
    const p1 = useGameStore.getState().businesses.find(b => b.status === 'active' && b.isPlatform)!;

    // tuck-in into P1
    const base = createMockDeal();
    const deal = createMockDeal({ id: 'tuckin_deal', effectivePrice: 3000, business: { ...base.business, sectorId: 'homeServices', subType: 'Electrical Services', ebitda: 800, revenue: 3200, qualityRating: 3 } });
    useGameStore.getState().acquireTuckIn(deal, createMockDealStructure({ cashRequired: 800, bankDebt: { amount: 1500, rate: 0.07, termRounds: 5 }, sellerNote: { amount: 700, rate: 0.08, termRounds: 5 } }), p1.id);

    // forge an integrated platform (recipe) over the merged/tucked platform + the second platform
    useGameStore.getState().forgeIntegratedPlatform('home_multi_trade', [p1.id, 'p2']);

    const after = useGameStore.getState();
    // The integrated platform exists and both constituents stayed active (debt still counted).
    expect(after.integratedPlatforms.some(ip => ip.recipeId === 'home_multi_trade')).toBe(true);
    expect(after.businesses.find(b => b.id === p1.id)?.status).toBe('active');
    expect(after.businesses.find(b => b.id === 'p2')?.status).toBe('active');

    // Bank debt across everything: merged 3000 + bolt-on 1500 + p2 1200 = 5700.
    expect(after.totalDebt).toBe(5700);

    // EV subtracts ALL of it: 5700 bank + (merged 1300 + bolt-on 700 + p2 400 = 2400) seller = 8100.
    expect(debtFreeEV(after) - calculateEnterpriseValue(after)).toBe(8100);
  });
});
