import { describe, it, expect } from 'vitest';
import {
  SeededRng,
  createRngStreams,
  deriveRoundSeed,
  deriveStreamSeed,
  preRollActionOutcomes,
  generateRandomSeed,
  STREAM_IDS,
} from '../rng';

describe('SeededRng', () => {
  it('same seed produces identical sequence', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('different seeds produce different sequences', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(99);
    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());
    expect(results1).not.toEqual(results2);
  });

  it('output is in [0, 1)', () => {
    const rng = new SeededRng(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('roughly uniform distribution (chi-squared rough check)', () => {
    const rng = new SeededRng(777);
    const buckets = new Array(10).fill(0);
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const bucket = Math.floor(rng.next() * 10);
      buckets[bucket]++;
    }
    const expected = n / 10;
    for (const count of buckets) {
      // Each bucket should be within 20% of expected
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });

  describe('nextInt', () => {
    it('returns integers in [min, max]', () => {
      const rng = new SeededRng(42);
      for (let i = 0; i < 100; i++) {
        const v = rng.nextInt(3, 7);
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(7);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it('is deterministic', () => {
      const rng1 = new SeededRng(42);
      const rng2 = new SeededRng(42);
      for (let i = 0; i < 50; i++) {
        expect(rng1.nextInt(0, 100)).toBe(rng2.nextInt(0, 100));
      }
    });
  });

  describe('nextInRange', () => {
    it('returns values in [min, max)', () => {
      const rng = new SeededRng(42);
      for (let i = 0; i < 100; i++) {
        const v = rng.nextInRange([2.5, 7.5]);
        expect(v).toBeGreaterThanOrEqual(2.5);
        expect(v).toBeLessThan(7.5);
      }
    });
  });

  describe('pick', () => {
    it('returns undefined for empty array', () => {
      const rng = new SeededRng(42);
      expect(rng.pick([])).toBeUndefined();
    });

    it('returns an element from the array', () => {
      const rng = new SeededRng(42);
      const arr = ['a', 'b', 'c', 'd'];
      for (let i = 0; i < 50; i++) {
        expect(arr).toContain(rng.pick(arr));
      }
    });

    it('is deterministic', () => {
      const rng1 = new SeededRng(42);
      const rng2 = new SeededRng(42);
      const arr = [1, 2, 3, 4, 5];
      for (let i = 0; i < 50; i++) {
        expect(rng1.pick(arr)).toBe(rng2.pick(arr));
      }
    });
  });

  describe('shuffle', () => {
    it('returns a permutation of the array', () => {
      const rng = new SeededRng(42);
      const arr = [1, 2, 3, 4, 5];
      const shuffled = rng.shuffle([...arr]);
      expect(shuffled).toHaveLength(arr.length);
      expect(shuffled.sort()).toEqual(arr);
    });

    it('is deterministic', () => {
      const rng1 = new SeededRng(42);
      const rng2 = new SeededRng(42);
      const s1 = rng1.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const s2 = rng2.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(s1).toEqual(s2);
    });

    it('actually shuffles (not identity for non-trivial arrays)', () => {
      const rng = new SeededRng(42);
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = rng.shuffle([...original]);
      // Very unlikely to be identity for 10 elements
      expect(shuffled).not.toEqual(original);
    });
  });

  describe('fork', () => {
    it('produces a different sequence from the parent', () => {
      const rng = new SeededRng(42);
      const forked = rng.fork('child');
      const parentValues = Array.from({ length: 10 }, () => rng.next());
      const forkedValues = Array.from({ length: 10 }, () => forked.next());
      expect(parentValues).not.toEqual(forkedValues);
    });

    it('same key produces same forked sequence', () => {
      const rng1 = new SeededRng(42);
      const rng2 = new SeededRng(42);
      const forked1 = rng1.fork('entity_1');
      const forked2 = rng2.fork('entity_1');
      for (let i = 0; i < 20; i++) {
        expect(forked1.next()).toBe(forked2.next());
      }
    });

    it('different keys produce different sequences', () => {
      const rng = new SeededRng(42);
      const f1 = rng.fork('entity_1');
      const rng2 = new SeededRng(42);
      const f2 = rng2.fork('entity_2');
      const v1 = Array.from({ length: 10 }, () => f1.next());
      const v2 = Array.from({ length: 10 }, () => f2.next());
      expect(v1).not.toEqual(v2);
    });

    it('numeric keys work', () => {
      const rng1 = new SeededRng(42);
      const rng2 = new SeededRng(42);
      const f1 = rng1.fork(7);
      const f2 = rng2.fork(7);
      for (let i = 0; i < 10; i++) {
        expect(f1.next()).toBe(f2.next());
      }
    });
  });
});

describe('Seed derivation', () => {
  it('deriveRoundSeed: same seed+round = same result', () => {
    expect(deriveRoundSeed(42, 1)).toBe(deriveRoundSeed(42, 1));
    expect(deriveRoundSeed(42, 5)).toBe(deriveRoundSeed(42, 5));
  });

  it('deriveRoundSeed: different rounds = different results', () => {
    expect(deriveRoundSeed(42, 1)).not.toBe(deriveRoundSeed(42, 2));
    expect(deriveRoundSeed(42, 5)).not.toBe(deriveRoundSeed(42, 10));
  });

  it('deriveRoundSeed: different seeds = different results', () => {
    expect(deriveRoundSeed(42, 1)).not.toBe(deriveRoundSeed(99, 1));
  });

  it('deriveStreamSeed: different streams = different results', () => {
    const roundSeed = deriveRoundSeed(42, 1);
    const dealsSeed = deriveStreamSeed(roundSeed, STREAM_IDS.deals);
    const eventsSeed = deriveStreamSeed(roundSeed, STREAM_IDS.events);
    const simSeed = deriveStreamSeed(roundSeed, STREAM_IDS.simulation);
    expect(dealsSeed).not.toBe(eventsSeed);
    expect(dealsSeed).not.toBe(simSeed);
    expect(eventsSeed).not.toBe(simSeed);
  });
});

describe('createRngStreams', () => {
  it('same seed + round = identical streams', () => {
    const streams1 = createRngStreams(42, 1);
    const streams2 = createRngStreams(42, 1);
    // Each stream should produce the same first 10 values
    for (const streamKey of Object.keys(STREAM_IDS) as (keyof typeof STREAM_IDS)[]) {
      const s1 = streams1[streamKey];
      const s2 = streams2[streamKey];
      for (let i = 0; i < 10; i++) {
        expect(s1.next()).toBe(s2.next());
      }
    }
  });

  it('different rounds produce different streams', () => {
    const streams1 = createRngStreams(42, 1);
    const streams2 = createRngStreams(42, 2);
    // At least the deals stream should differ
    expect(streams1.deals.next()).not.toBe(streams2.deals.next());
  });

  it('different streams within same round are independent', () => {
    const streams = createRngStreams(42, 1);
    const dealsVal = streams.deals.next();
    const eventsVal = streams.events.next();
    const simVal = streams.simulation.next();
    // All three should be different
    expect(dealsVal).not.toBe(eventsVal);
    expect(dealsVal).not.toBe(simVal);
    expect(eventsVal).not.toBe(simVal);
  });

  it('consuming one stream does not affect another', () => {
    const streams1 = createRngStreams(42, 1);
    const streams2 = createRngStreams(42, 1);
    // Consume 100 values from deals in streams1
    for (let i = 0; i < 100; i++) streams1.deals.next();
    // Events stream should still match
    for (let i = 0; i < 10; i++) {
      expect(streams1.events.next()).toBe(streams2.events.next());
    }
  });
});

describe('preRollActionOutcomes', () => {
  it('produces deterministic outcomes', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);
    const o1 = preRollActionOutcomes(rng1, 8);
    const o2 = preRollActionOutcomes(rng2, 8);
    expect(o1).toEqual(o2);
  });

  it('produces the expected number of rolls', () => {
    const rng = new SeededRng(42);
    const outcomes = preRollActionOutcomes(rng, 12);
    expect(outcomes.contestedSnatchRolls).toHaveLength(12);
    expect(outcomes.sellVarianceRolls).toHaveLength(12);
    expect(outcomes.eventDeclineRolls).toHaveLength(12);
    expect(outcomes.integrationRolls).toHaveLength(12);
    expect(outcomes.qualityImprovementRolls).toHaveLength(12);
  });

  it('all values are in [0, 1)', () => {
    const rng = new SeededRng(42);
    const outcomes = preRollActionOutcomes(rng);
    for (const rolls of Object.values(outcomes)) {
      for (const v of rolls as number[]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});

describe('generateRandomSeed', () => {
  it('returns a 32-bit integer', () => {
    for (let i = 0; i < 20; i++) {
      const seed = generateRandomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeLessThanOrEqual(0x7fffffff);
    }
  });
});
