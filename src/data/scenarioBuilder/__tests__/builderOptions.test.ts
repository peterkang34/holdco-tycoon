import { describe, it, expect } from 'vitest';
import { subTypesForSector, SOURCING_STRENGTH_OPTIONS, BUILDER_RANKING_METRICS } from '../builderOptions';
import { getRandomBusinessName } from '../../names';

describe('builderOptions helpers', () => {
  it('subTypesForSector returns the sector’s sub-sectors', () => {
    const agency = subTypesForSector('agency');
    expect(agency.length).toBeGreaterThan(0);
    expect(agency.every((s) => typeof s === 'string')).toBe(true);
  });

  it('SOURCING_STRENGTH_OPTIONS covers tiers 0–3', () => {
    expect(SOURCING_STRENGTH_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3]);
  });

  it('cashOnCash stays out of the builder ranking metrics', () => {
    expect(BUILDER_RANKING_METRICS).not.toContain('cashOnCash');
  });
});

describe('local business-name generator (used by the 🎲 button)', () => {
  it('produces a non-empty name for a sector + sub-type', () => {
    const name = getRandomBusinessName('agency', subTypesForSector('agency')[0]);
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });
});
