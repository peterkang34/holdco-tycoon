import { describe, it, expect } from 'vitest';
import {
  clampMargin,
  capGrowthRate,
  applyEbitdaFloor,
  getAllDedupedBusinesses,
  MIN_MARGIN,
  MAX_MARGIN,
} from '../helpers';
import { createMockBusiness } from './helpers';

describe('clampMargin', () => {
  it('should return value unchanged when within range', () => {
    expect(clampMargin(0.20)).toBe(0.20);
    expect(clampMargin(0.50)).toBe(0.50);
  });

  it('should clamp to MIN_MARGIN when below', () => {
    expect(clampMargin(0.01)).toBe(MIN_MARGIN);
    expect(clampMargin(0)).toBe(MIN_MARGIN);
    expect(clampMargin(-0.10)).toBe(MIN_MARGIN);
  });

  it('should clamp to MAX_MARGIN when above', () => {
    expect(clampMargin(0.90)).toBe(MAX_MARGIN);
    expect(clampMargin(1.0)).toBe(MAX_MARGIN);
    expect(clampMargin(5.0)).toBe(MAX_MARGIN);
  });

  it('should return exactly MIN_MARGIN at boundary', () => {
    expect(clampMargin(MIN_MARGIN)).toBe(MIN_MARGIN);
  });

  it('should return exactly MAX_MARGIN at boundary', () => {
    expect(clampMargin(MAX_MARGIN)).toBe(MAX_MARGIN);
  });
});

describe('capGrowthRate', () => {
  it('should return value unchanged when within range', () => {
    expect(capGrowthRate(0.05)).toBe(0.05);
    expect(capGrowthRate(0.10)).toBe(0.10);
    expect(capGrowthRate(0.0)).toBe(0.0);
  });

  it('should cap at MAX_ORGANIC_GROWTH_RATE (0.20) when above', () => {
    expect(capGrowthRate(0.30)).toBe(0.20);
    expect(capGrowthRate(0.50)).toBe(0.20);
    expect(capGrowthRate(1.0)).toBe(0.20);
  });

  it('should cap at -0.10 when below', () => {
    expect(capGrowthRate(-0.15)).toBe(-0.10);
    expect(capGrowthRate(-0.50)).toBe(-0.10);
    expect(capGrowthRate(-1.0)).toBe(-0.10);
  });

  it('should return exactly the boundary values', () => {
    expect(capGrowthRate(0.20)).toBe(0.20);
    expect(capGrowthRate(-0.10)).toBe(-0.10);
  });
});

describe('applyEbitdaFloor', () => {
  it('should not change EBITDA when above floor', () => {
    const result = applyEbitdaFloor(500, 2500, 0.20, 1000);
    // Floor = 1000 * 0.30 = 300; 500 > 300 so no change
    expect(result.ebitda).toBe(500);
    expect(result.margin).toBe(0.20);
  });

  it('should floor EBITDA at 30% of acquisitionEbitda', () => {
    const result = applyEbitdaFloor(100, 2500, 0.04, 1000);
    // Floor = round(1000 * 0.30) = 300; 100 < 300 so floored
    expect(result.ebitda).toBe(300);
  });

  it('should re-derive margin when floored to maintain EBITDA = Revenue * Margin', () => {
    const result = applyEbitdaFloor(100, 2500, 0.04, 1000);
    // Floored ebitda = 300, revenue = 2500
    // fixedMargin = max(0.03, 300 / 2500) = max(0.03, 0.12) = 0.12
    expect(result.margin).toBeCloseTo(0.12, 5);
  });

  it('should enforce MIN_MARGIN even when floor math would produce lower margin', () => {
    // Very high revenue, low floor -> margin would be very small
    const result = applyEbitdaFloor(10, 100000, 0.01, 100);
    // Floor = round(100 * 0.30) = 30; 10 < 30 so floored
    // fixedMargin = max(0.03, 30 / 100000) = max(0.03, 0.0003) = 0.03
    expect(result.ebitda).toBe(30);
    expect(result.margin).toBe(MIN_MARGIN);
  });

  it('should handle zero revenue gracefully', () => {
    const result = applyEbitdaFloor(0, 0, 0.20, 1000);
    // Floor = 300; 0 < 300 so floored
    // revenue = 0, so fixedMargin = margin = 0.20
    expect(result.ebitda).toBe(300);
    expect(result.margin).toBe(0.20);
  });

  it('should handle zero acquisitionEbitda', () => {
    const result = applyEbitdaFloor(500, 2500, 0.20, 0);
    // Floor = round(0 * 0.30) = 0; 500 > 0 so no change
    expect(result.ebitda).toBe(500);
    expect(result.margin).toBe(0.20);
  });
});

describe('getAllDedupedBusinesses', () => {
  it('should combine active and exited businesses', () => {
    const active = [createMockBusiness({ id: 'a1', status: 'active' })];
    const exited = [createMockBusiness({ id: 'e1', status: 'sold' })];
    const result = getAllDedupedBusinesses(active, exited);
    expect(result.length).toBe(2);
    expect(result.map(b => b.id).sort()).toEqual(['a1', 'e1']);
  });

  it('should prefer exited version when same ID exists in both', () => {
    const active = [createMockBusiness({ id: 'b1', status: 'active', ebitda: 1000 })];
    const exited = [createMockBusiness({ id: 'b1', status: 'sold', ebitda: 2000 })];
    const result = getAllDedupedBusinesses(active, exited);
    expect(result.length).toBe(1);
    expect(result[0].status).toBe('sold');
    expect(result[0].ebitda).toBe(2000);
  });

  it('should filter out integrated businesses', () => {
    const active = [createMockBusiness({ id: 'a1', status: 'active' })];
    const exited = [createMockBusiness({ id: 'e1', status: 'integrated' as any })];
    const result = getAllDedupedBusinesses(active, exited);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('a1');
  });

  it('should filter out merged businesses', () => {
    const active = [createMockBusiness({ id: 'a1', status: 'merged' as any })];
    const exited = [createMockBusiness({ id: 'e1', status: 'sold' })];
    const result = getAllDedupedBusinesses(active, exited);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('e1');
  });

  it('should filter out bolt-on children (parentPlatformId set)', () => {
    const active = [
      createMockBusiness({ id: 'platform', status: 'active' }),
      createMockBusiness({ id: 'bolton', status: 'active', parentPlatformId: 'platform' }),
    ];
    const exited: any[] = [];
    const result = getAllDedupedBusinesses(active, exited);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('platform');
  });

  it('should return empty array when both inputs are empty', () => {
    const result = getAllDedupedBusinesses([], []);
    expect(result.length).toBe(0);
  });

  it('should handle complex dedup scenario', () => {
    const active = [
      createMockBusiness({ id: 'a1', status: 'active' }),
      createMockBusiness({ id: 'a2', status: 'active' }),
      createMockBusiness({ id: 'a3', status: 'merged' as any }),
      createMockBusiness({ id: 'bolton1', status: 'active', parentPlatformId: 'a1' }),
    ];
    const exited = [
      createMockBusiness({ id: 'a2', status: 'sold' }), // same ID as active a2
      createMockBusiness({ id: 'e1', status: 'sold' }),
      createMockBusiness({ id: 'e2', status: 'integrated' as any }),
    ];
    const result = getAllDedupedBusinesses(active, exited);
    // a2 in exited (sold) wins over active a2
    // a3 excluded (merged), bolton1 excluded (parentPlatformId), e2 excluded (integrated)
    // Remaining: e1 (sold from exited), a2 (sold from exited), a1 (active, not in exited)
    expect(result.map(b => b.id).sort()).toEqual(['a1', 'a2', 'e1']);
    expect(result.find(b => b.id === 'a2')!.status).toBe('sold');
  });
});
