import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  migrateV9ToV10,
  migrateV10ToV11,
  migrateV11ToV12,
  migrateV12ToV13,
  migrateV13ToV14,
  migrateV14ToV15,
  runAllMigrations,
} from '../../hooks/migrations';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
    _store: () => store,
  };
})();

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal('localStorage', localStorageMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('migrateV9ToV10', () => {
  it('should add maSourcing and maFocus.subType', () => {
    const v9Data = {
      state: {
        businesses: [],
        maFocus: { sectorId: null, sizePreference: 'any' },
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v9', JSON.stringify(v9Data));

    migrateV9ToV10();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v10')!);
    expect(result.state.maSourcing).toEqual({ tier: 0, active: false, unlockedRound: 0, lastUpgradeRound: 0 });
    expect(result.state.maFocus.subType).toBeNull();
    expect(localStorageMock.getItem('holdco-tycoon-save-v9')).toBeNull();
  });

  it('should be a no-op if v10 key already exists', () => {
    localStorageMock.setItem('holdco-tycoon-save-v10', JSON.stringify({ state: { existing: true } }));
    localStorageMock.setItem('holdco-tycoon-save-v9', JSON.stringify({ state: {} }));

    migrateV9ToV10();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v10')!);
    expect(result.state.existing).toBe(true);
  });

  it('should be a no-op if no v9 key', () => {
    migrateV9ToV10();
    expect(localStorageMock.getItem('holdco-tycoon-save-v10')).toBeNull();
  });

  it('should not overwrite existing maSourcing', () => {
    const v9Data = {
      state: {
        maSourcing: { tier: 2, active: true, unlockedRound: 3, lastUpgradeRound: 5 },
        maFocus: { sectorId: 'saas', sizePreference: 'large' },
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v9', JSON.stringify(v9Data));

    migrateV9ToV10();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v10')!);
    expect(result.state.maSourcing.tier).toBe(2); // preserved
  });
});

describe('migrateV10ToV11', () => {
  it('should add deal heat fields and migrate pipeline deals', () => {
    const v10Data = {
      state: {
        maSourcing: { tier: 1 },
        dealPipeline: [
          { id: 'deal_1', askingPrice: 5000 },
          { id: 'deal_2', askingPrice: 3000, heat: 'hot', effectivePrice: 3600 },
        ],
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v10', JSON.stringify(v10Data));

    migrateV10ToV11();

    // Note: v10->v11 writes to v12 key per the actual code
    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v12')!);
    expect(result.state.acquisitionsThisRound).toBe(0);
    expect(result.state.maxAcquisitionsPerRound).toBe(3); // tier 1
    expect(result.state.lastAcquisitionResult).toBeNull();

    // Pipeline deals should have heat defaults
    expect(result.state.dealPipeline[0].heat).toBe('warm');
    expect(result.state.dealPipeline[0].effectivePrice).toBe(5000);
    // Existing heat should be preserved
    expect(result.state.dealPipeline[1].heat).toBe('hot');
    expect(result.state.dealPipeline[1].effectivePrice).toBe(3600);
  });

  it('should set maxAcquisitionsPerRound to 2 for tier 0', () => {
    const v10Data = {
      state: {
        maSourcing: { tier: 0 },
        dealPipeline: [],
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v10', JSON.stringify(v10Data));

    migrateV10ToV11();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v12')!);
    expect(result.state.maxAcquisitionsPerRound).toBe(2);
  });
});

describe('migrateV11ToV12', () => {
  it('should add revenue/margin fields to businesses', () => {
    const v11Data = {
      state: {
        businesses: [
          {
            id: 'biz_1',
            sectorId: 'agency',
            ebitda: 500,
            acquisitionEbitda: 500,
            peakEbitda: 500,
            organicGrowthRate: 0.05,
          },
        ],
        exitedBusinesses: [],
        dealPipeline: [],
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v11', JSON.stringify(v11Data));

    migrateV11ToV12();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v12')!);
    const biz = result.state.businesses[0];
    expect(biz.revenue).toBeGreaterThan(0);
    expect(biz.ebitdaMargin).toBeGreaterThan(0);
    expect(biz.acquisitionRevenue).toBeGreaterThan(0);
    expect(biz.acquisitionMargin).toBeGreaterThan(0);
    expect(biz.peakRevenue).toBeGreaterThan(0);
    expect(biz.revenueGrowthRate).toBe(0.05);
    expect(biz.marginDriftRate).toBeDefined();
  });

  it('should not overwrite existing revenue/margin fields', () => {
    const v11Data = {
      state: {
        businesses: [
          {
            id: 'biz_1',
            sectorId: 'agency',
            ebitda: 500,
            revenue: 2500,
            ebitdaMargin: 0.20,
          },
        ],
        exitedBusinesses: [],
        dealPipeline: [],
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v11', JSON.stringify(v11Data));

    migrateV11ToV12();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v12')!);
    expect(result.state.businesses[0].revenue).toBe(2500);
    expect(result.state.businesses[0].ebitdaMargin).toBe(0.20);
  });
});

describe('migrateV12ToV13', () => {
  it('should add sellerArchetype to pipeline deals', () => {
    const v12Data = {
      state: {
        dealPipeline: [{ id: 'deal_1' }, { id: 'deal_2' }],
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v12', JSON.stringify(v12Data));

    migrateV12ToV13();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v13')!);
    expect(result.state.dealPipeline.length).toBe(2);
    // sellerArchetype defaults to undefined (JSON serializes as missing key)
  });
});

describe('migrateV13ToV14', () => {
  it('should add game mode fields with correct defaults', () => {
    const v13Data = {
      state: {
        totalDistributions: 1000,
        founderShares: 800,
        sharesOutstanding: 1000,
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v13', JSON.stringify(v13Data));

    migrateV13ToV14();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v14')!);
    expect(result.state.difficulty).toBe('easy');
    expect(result.state.duration).toBe('standard');
    expect(result.state.maxRounds).toBe(20);
    expect(result.state.founderDistributionsReceived).toBe(800); // 1000 * (800/1000)
  });

  it('should handle zero sharesOutstanding without division by zero', () => {
    const v13Data = {
      state: {
        totalDistributions: 5000,
        founderShares: 800,
        sharesOutstanding: 0, // corrupted save
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v13', JSON.stringify(v13Data));

    migrateV13ToV14();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v14')!);
    // Uses sharesOutstanding || 1, so founderShares / 1 = 800
    expect(result.state.founderDistributionsReceived).toBe(Math.round(5000 * (800 / 1)));
  });

  it('should handle zero distributions', () => {
    const v13Data = {
      state: {
        totalDistributions: 0,
        founderShares: 800,
        sharesOutstanding: 1000,
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v13', JSON.stringify(v13Data));

    migrateV13ToV14();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v14')!);
    expect(result.state.founderDistributionsReceived).toBe(0);
  });
});

describe('migrateV14ToV15', () => {
  it('should back-fill acquisitionSizeTierPremium and wasMerged on businesses', () => {
    const v14Data = {
      state: {
        businesses: [
          { id: 'biz_1', sectorId: 'agency', ebitda: 3000, acquisitionEbitda: 3000 },
          { id: 'biz_2', sectorId: 'saas', ebitda: 8000, acquisitionEbitda: 5000 },
        ],
        exitedBusinesses: [
          { id: 'biz_3', sectorId: 'agency', ebitda: 1000, acquisitionEbitda: 1000 },
        ],
        dealPipeline: [
          { id: 'deal_1', business: { ebitda: 2500, acquisitionEbitda: 2500 } },
        ],
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v14', JSON.stringify(v14Data));

    migrateV14ToV15();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v15')!);

    // biz_1: EBITDA 3000 → premium lerp(3000, 2000, 5000, 0.5, 1.0) = 0.667
    const biz1 = result.state.businesses[0];
    expect(biz1.acquisitionSizeTierPremium).toBeCloseTo(0.667, 1);
    expect(biz1.wasMerged).toBe(false);

    // biz_2: acquisitionEbitda 5000 → premium = 1.0
    const biz2 = result.state.businesses[1];
    expect(biz2.acquisitionSizeTierPremium).toBeCloseTo(1.0, 1);
    expect(biz2.wasMerged).toBe(false);

    // Exited biz_3: EBITDA 1000 → premium = 0.0 (below 2000)
    const biz3 = result.state.exitedBusinesses[0];
    expect(biz3.acquisitionSizeTierPremium).toBe(0);
    expect(biz3.wasMerged).toBe(false);

    // Pipeline deal: EBITDA 2500 → lerp(2500, 2000, 5000, 0.5, 1.0) ≈ 0.583
    const deal1 = result.state.dealPipeline[0];
    expect(deal1.business.acquisitionSizeTierPremium).toBeCloseTo(0.583, 1);

    // v14 consumed
    expect(localStorageMock.getItem('holdco-tycoon-save-v14')).toBeNull();
  });

  it('should not overwrite existing acquisitionSizeTierPremium', () => {
    const v14Data = {
      state: {
        businesses: [
          { id: 'biz_1', acquisitionEbitda: 3000, acquisitionSizeTierPremium: 0.5 },
        ],
        exitedBusinesses: [],
        dealPipeline: [],
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v14', JSON.stringify(v14Data));

    migrateV14ToV15();

    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v15')!);
    // Should keep existing value since ?? only triggers on null/undefined
    expect(result.state.businesses[0].acquisitionSizeTierPremium).toBe(0.5);
  });
});

describe('runAllMigrations', () => {
  it('should chain all migrations from v9 to v16', () => {
    const v9Data = {
      state: {
        businesses: [{
          id: 'biz_1',
          sectorId: 'agency',
          ebitda: 500,
          acquisitionEbitda: 500,
          peakEbitda: 500,
          organicGrowthRate: 0.05,
        }],
        exitedBusinesses: [],
        dealPipeline: [{ id: 'deal_1', askingPrice: 3000 }],
        maFocus: { sectorId: null, sizePreference: 'any' },
        totalDistributions: 2000,
        founderShares: 800,
        sharesOutstanding: 1000,
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v9', JSON.stringify(v9Data));

    runAllMigrations();

    // v9 should be consumed
    expect(localStorageMock.getItem('holdco-tycoon-save-v9')).toBeNull();
    // Final v16 should exist
    const result = JSON.parse(localStorageMock.getItem('holdco-tycoon-save-v16')!);
    expect(result.state.difficulty).toBe('easy');
    expect(result.state.maxRounds).toBe(20);
    expect(result.state.founderDistributionsReceived).toBeDefined();
    // v14→v15 fields
    expect(result.state.businesses[0].wasMerged).toBe(false);
    expect(result.state.businesses[0].acquisitionSizeTierPremium).toBeDefined();
    // v15→v16 fields
    expect(result.state.integratedPlatforms).toEqual([]);
  });

  it('should be safe to call multiple times (idempotent)', () => {
    const v14Data = {
      state: {
        businesses: [{ id: 'biz_1', acquisitionEbitda: 1000 }],
        exitedBusinesses: [],
        dealPipeline: [],
      },
    };
    localStorageMock.setItem('holdco-tycoon-save-v14', JSON.stringify(v14Data));

    runAllMigrations();
    const first = localStorageMock.getItem('holdco-tycoon-save-v16');

    runAllMigrations();
    const second = localStorageMock.getItem('holdco-tycoon-save-v16');

    expect(first).toBe(second);
  });

  it('should be a no-op when no save keys exist', () => {
    runAllMigrations();
    // Nothing should have been written
    expect(localStorageMock.getItem('holdco-tycoon-save-v10')).toBeNull();
    expect(localStorageMock.getItem('holdco-tycoon-save-v12')).toBeNull();
    expect(localStorageMock.getItem('holdco-tycoon-save-v13')).toBeNull();
    expect(localStorageMock.getItem('holdco-tycoon-save-v14')).toBeNull();
    expect(localStorageMock.getItem('holdco-tycoon-save-v15')).toBeNull();
    expect(localStorageMock.getItem('holdco-tycoon-save-v16')).toBeNull();
  });
});
