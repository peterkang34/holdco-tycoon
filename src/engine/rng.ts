/**
 * Seeded deterministic RNG for Holdco Tycoon.
 *
 * Uses Mulberry32 — a fast, deterministic 32-bit PRNG.
 * Same seed always produces the same sequence of numbers.
 *
 * Design:
 * - Master seed → deriveRoundSeed(seed, round) → deriveStreamSeed(roundSeed, streamId)
 * - Each round gets fresh RNG instances (round-scoped, decision-independent)
 * - 5 streams: deals, events, simulation, market, cosmetic
 */

// ── Mulberry32 PRNG ──────────────────────────────────────────────

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0; // ensure 32-bit integer
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] (inclusive) */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns a float in [range[0], range[1]) */
  nextInRange(range: [number, number]): number {
    return range[0] + this.next() * (range[1] - range[0]);
  }

  /** Picks a random element from an array */
  pick<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[Math.floor(this.next() * array.length)];
  }

  /** Fisher-Yates shuffle (in-place, returns same array) */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  /** Create a forked RNG with a derived seed (for per-entity isolation) */
  fork(key: string | number): SeededRng {
    const keySeed = typeof key === 'number'
      ? key
      : key.split('').reduce((sum, c) => ((sum * 31) + c.charCodeAt(0)) | 0, 0);
    // Mix current state with key to get a new independent seed
    return new SeededRng(hashTwo(this.state, keySeed));
  }
}

// ── Seed Derivation ──────────────────────────────────────────────

/** Simple 32-bit hash combining two integers */
function hashTwo(a: number, b: number): number {
  let h = (a ^ (b * 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

/** Derive a round-specific seed from the master seed */
export function deriveRoundSeed(masterSeed: number, round: number): number {
  return hashTwo(masterSeed, round);
}

/** Derive a stream-specific seed from the round seed */
export function deriveStreamSeed(roundSeed: number, streamId: string): number {
  const streamNum = streamId.split('').reduce((sum, c) => ((sum * 31) + c.charCodeAt(0)) | 0, 0);
  return hashTwo(roundSeed, streamNum);
}

// ── Stream IDs ───────────────────────────────────────────────────

export const STREAM_IDS = {
  deals: 'deals',
  events: 'events',
  simulation: 'simulation',
  market: 'market',
  cosmetic: 'cosmetic',
} as const;

export type StreamId = typeof STREAM_IDS[keyof typeof STREAM_IDS];

// ── RNG Streams ──────────────────────────────────────────────────

export interface RngStreams {
  deals: SeededRng;
  events: SeededRng;
  simulation: SeededRng;
  market: SeededRng;
  cosmetic: SeededRng;
}

/** Create all 5 RNG streams for a given master seed + round */
export function createRngStreams(masterSeed: number, round: number): RngStreams {
  const roundSeed = deriveRoundSeed(masterSeed, round);
  return {
    deals: new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.deals)),
    events: new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.events)),
    simulation: new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.simulation)),
    market: new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.market)),
    cosmetic: new SeededRng(deriveStreamSeed(roundSeed, STREAM_IDS.cosmetic)),
  };
}

// ── Pre-rolled Action Outcomes ───────────────────────────────────

export interface ActionOutcomes {
  contestedSnatchRolls: number[];
  sellVarianceRolls: number[];
  eventDeclineRolls: number[];
  integrationRolls: number[];
  qualityImprovementRolls: number[];
}

/** Pre-roll all action outcomes for a round from the market stream */
export function preRollActionOutcomes(marketRng: SeededRng, maxSlots: number = 16): ActionOutcomes {
  const contestedSnatchRolls: number[] = [];
  const sellVarianceRolls: number[] = [];
  const eventDeclineRolls: number[] = [];
  const integrationRolls: number[] = [];
  const qualityImprovementRolls: number[] = [];

  for (let i = 0; i < maxSlots; i++) {
    contestedSnatchRolls.push(marketRng.next());
    sellVarianceRolls.push(marketRng.next());
    eventDeclineRolls.push(marketRng.next());
    integrationRolls.push(marketRng.next());
    qualityImprovementRolls.push(marketRng.next());
  }

  return {
    contestedSnatchRolls,
    sellVarianceRolls,
    eventDeclineRolls,
    integrationRolls,
    qualityImprovementRolls,
  };
}

// ── Random Seed Generator ────────────────────────────────────────

/** Generate a random seed for non-challenge games */
export function generateRandomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}
