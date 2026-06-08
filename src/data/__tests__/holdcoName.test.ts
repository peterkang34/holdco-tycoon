import { describe, it, expect } from 'vitest';
import { randomHoldcoName } from '../names';

const HOLDCO_SUFFIX_WORDS = [
  'Holdings', 'Holdco', 'Group', 'Partners', 'Capital', 'Ventures',
  'Industries', 'Holding', 'Co', 'Collective',
];

describe('randomHoldcoName', () => {
  const sectors = ['industrial', 'healthcare', 'saas', 'realEstate', undefined, 'fintech' /* no bank → generic */];

  it.each(sectors)('produces a valid holdco name for sector %s', (sector) => {
    for (let i = 0; i < 40; i++) {
      const name = randomHoldcoName(sector);
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(30);
      expect(name).toContain(' '); // at least two words
      // Ends with a holdco-flavored suffix word.
      const lastWord = name.split(' ').pop()!;
      expect(HOLDCO_SUFFIX_WORDS).toContain(lastWord);
    }
  });

  it('varies across calls (not a constant)', () => {
    const names = new Set(Array.from({ length: 30 }, () => randomHoldcoName('industrial')));
    expect(names.size).toBeGreaterThan(1);
  });
});
