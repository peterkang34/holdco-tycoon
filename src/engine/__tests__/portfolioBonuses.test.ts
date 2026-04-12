import { describe, it, expect } from 'vitest';
import { calculateRouteDensityBonus, calculateSubTypeSpecBonus, getSubTypeSpecIntegrationBoost } from '../portfolioBonuses';
import { Business } from '../types';

// Minimal business factory for testing
function makeBiz(overrides: Partial<Business> = {}): Business {
  return {
    id: `biz_${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Biz',
    sectorId: 'distribution',
    subType: 'Food & Bev Distribution',
    ebitda: 2000,
    peakEbitda: 2000,
    acquisitionEbitda: 2000,
    acquisitionPrice: 8000,
    acquisitionRound: 1,
    acquisitionMultiple: 4.0,
    organicGrowthRate: 0.05,
    revenue: 12000,
    ebitdaMargin: 0.15,
    acquisitionRevenue: 12000,
    acquisitionMargin: 0.15,
    peakRevenue: 12000,
    revenueGrowthRate: 0.05,
    marginDriftRate: -0.002,
    qualityRating: 3,
    qualityImprovedTiers: 0,
    status: 'active',
    improvements: [],
    integrationRoundsRemaining: 0,
    isPlatform: false,
    platformScale: 0,
    dueDiligence: {
      operatorQuality: 'average',
      revenueConcentration: 'low',
      sellerArchetype: 'retiring_founder',
    },
    rolloverEquityPct: 0,
    wasMerged: false,
    acquisitionSizeTierPremium: 0,
    priorOwnershipCount: 0,
    cashEquityInvested: 8000,
    ceilingMasteryBonus: false,
    integrationGrowthDrag: 0,
    successionResolved: false,
    ...overrides,
  } as Business;
}

describe('calculateRouteDensityBonus', () => {
  it('returns bonus for 2 adjacent distribution businesses', () => {
    const businesses = [
      makeBiz({ subType: 'Food & Bev Distribution' }), // group 1
      makeBiz({ subType: 'Janitorial / Facilities Supply' }), // group 1
    ];
    const result = calculateRouteDensityBonus(businesses);
    expect(result).not.toBeNull();
    expect(result!.marginBoost).toBe(0.02);
    expect(result!.capexReduction).toBe(0.15);
    expect(result!.adjacentCount).toBe(2);
  });

  it('returns null for 2 non-adjacent distribution businesses', () => {
    const businesses = [
      makeBiz({ subType: 'Food & Bev Distribution' }), // group 1
      makeBiz({ subType: 'Industrial / MRO Supply' }), // group 0
    ];
    expect(calculateRouteDensityBonus(businesses)).toBeNull();
  });

  it('returns null for 1 distribution business', () => {
    expect(calculateRouteDensityBonus([makeBiz()])).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(calculateRouteDensityBonus([])).toBeNull();
  });

  it('returns null for non-distribution businesses', () => {
    const businesses = [
      makeBiz({ sectorId: 'saas', subType: 'Vertical-Market SaaS' }),
      makeBiz({ sectorId: 'saas', subType: 'Horizontal SaaS' }),
    ];
    expect(calculateRouteDensityBonus(businesses)).toBeNull();
  });

  it('only counts active businesses', () => {
    const businesses = [
      makeBiz({ subType: 'Food & Bev Distribution', status: 'active' }),
      makeBiz({ subType: 'Janitorial / Facilities Supply', status: 'sold' }),
    ];
    expect(calculateRouteDensityBonus(businesses)).toBeNull();
  });

  it('counts 3 adjacent correctly', () => {
    const businesses = [
      makeBiz({ subType: 'Industrial / MRO Supply' }), // group 0
      makeBiz({ subType: 'Building Materials' }), // group 0
      makeBiz({ subType: 'Food & Bev Distribution' }), // group 1 — different group
    ];
    const result = calculateRouteDensityBonus(businesses);
    expect(result).not.toBeNull();
    expect(result!.adjacentCount).toBe(2); // 2 in group 0
  });
});

describe('calculateSubTypeSpecBonus', () => {
  it('returns base tier for 3 same sub-type without unlock', () => {
    const businesses = [
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
    ];
    const result = calculateSubTypeSpecBonus(businesses, false);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('base');
    expect(result!.marginBoost).toBe(0.0075);
    expect(result!.growthBoost).toBe(0);
    expect(result!.integrationBoost).toBe(0.04);
  });

  it('returns enhanced_t1 for 2 same sub-type with unlock', () => {
    const businesses = [
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
    ];
    const result = calculateSubTypeSpecBonus(businesses, true);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('enhanced_t1');
    expect(result!.growthBoost).toBe(0.005);
  });

  it('returns enhanced_t2 for 3 same sub-type with unlock', () => {
    const businesses = [
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
    ];
    const result = calculateSubTypeSpecBonus(businesses, true);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('enhanced_t2');
    expect(result!.marginBoost).toBe(0.015);
    expect(result!.growthBoost).toBe(0.01);
    expect(result!.integrationBoost).toBe(0.08);
  });

  it('returns null for 2 same sub-type without unlock', () => {
    const businesses = [
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
    ];
    expect(calculateSubTypeSpecBonus(businesses, false)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(calculateSubTypeSpecBonus([], false)).toBeNull();
  });

  it('caps at 5 businesses', () => {
    const businesses = Array.from({ length: 7 }, () =>
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' })
    );
    const result = calculateSubTypeSpecBonus(businesses, true);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(5); // capped
  });

  it('margin never exceeds SUBTYPE_SPEC_MARGIN_CAP', () => {
    const businesses = Array.from({ length: 5 }, () =>
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' })
    );
    const result = calculateSubTypeSpecBonus(businesses, true);
    expect(result!.marginBoost).toBeLessThanOrEqual(0.015);
  });

  it('only counts active businesses', () => {
    const businesses = [
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices', status: 'active' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices', status: 'active' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices', status: 'sold' }),
    ];
    expect(calculateSubTypeSpecBonus(businesses, false)).toBeNull(); // only 2 active
  });
});

describe('getSubTypeSpecIntegrationBoost', () => {
  it('returns base integration boost for 3+ matching active businesses', () => {
    const businesses = [
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
    ];
    expect(getSubTypeSpecIntegrationBoost('HVAC Services', businesses, false)).toBe(0.04);
  });

  it('returns enhanced boost with unlock', () => {
    const businesses = [
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
    ];
    expect(getSubTypeSpecIntegrationBoost('HVAC Services', businesses, true)).toBe(0.08);
  });

  it('returns 0 for non-matching sub-type', () => {
    const businesses = [
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
      makeBiz({ subType: 'HVAC Services', sectorId: 'homeServices' }),
    ];
    expect(getSubTypeSpecIntegrationBoost('Plumbing Services', businesses, true)).toBe(0);
  });

  it('returns 0 for empty portfolio', () => {
    expect(getSubTypeSpecIntegrationBoost('HVAC Services', [], false)).toBe(0);
  });
});
