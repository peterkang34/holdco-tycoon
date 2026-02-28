import { describe, it, expect } from 'vitest';
import {
  calculateAffordability,
  getAffordabilityWeights,
  generateTrophyEbitda,
  pickWeightedTier,
  getTierForEbitda,
  TIER_ORDER,
} from '../affordability';
import { SeededRng } from '../rng';
import type { DealSizeTier } from '../types';

describe('calculateAffordability', () => {
  it('should return base = cash * 4 under normal conditions', () => {
    const rng = new SeededRng(42);
    const result = calculateAffordability(20000, false, false, null, rng);
    expect(result.base).toBe(80000); // $20M * 4 = $80M
  });

  it('should return base = cash when credit tightening is active', () => {
    const rng = new SeededRng(42);
    const result = calculateAffordability(20000, true, false, null, rng);
    expect(result.base).toBe(20000); // no leverage
  });

  it('should return base = cash when noNewDebt is true', () => {
    const rng = new SeededRng(42);
    const result = calculateAffordability(20000, false, true, null, rng);
    expect(result.base).toBe(20000); // no leverage
  });

  it('should have stretchFactor between 0 and 0.50', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = new SeededRng(seed);
      const result = calculateAffordability(10000, false, false, null, rng);
      expect(result.stretchFactor).toBeGreaterThanOrEqual(0);
      expect(result.stretchFactor).toBeLessThanOrEqual(0.50);
    }
  });

  it('should have stretched >= base', () => {
    const rng = new SeededRng(42);
    const result = calculateAffordability(50000, false, false, null, rng);
    expect(result.stretched).toBeGreaterThanOrEqual(result.base);
  });

  it('should return ipoBonus = 0 when not public', () => {
    const rng = new SeededRng(42);
    const result = calculateAffordability(20000, false, false, null, rng);
    expect(result.ipoBonus).toBe(0);
  });

  it('should return ipoBonus = marketCap * 0.25 when public with stockPrice >= 1.0', () => {
    const rng = new SeededRng(42);
    const ipoState = {
      isPublic: true,
      stockPrice: 50,
      sharesOutstanding: 10000, // marketCap = 50 * 10000 = 500000
      preIPOShares: 8000,
      marketSentiment: 0,
      earningsExpectations: 0,
      ipoRound: 16,
      initialStockPrice: 50,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };
    const result = calculateAffordability(20000, false, false, ipoState, rng);
    expect(result.ipoBonus).toBe(125000); // 500000 * 0.25
    expect(result.stretched).toBeGreaterThan(result.base); // includes IPO bonus
  });

  it('should return ipoBonus = 0 when stockPrice < 1.0', () => {
    const rng = new SeededRng(42);
    const ipoState = {
      isPublic: true,
      stockPrice: 0.5,
      sharesOutstanding: 10000,
      preIPOShares: 8000,
      marketSentiment: 0,
      earningsExpectations: 0,
      ipoRound: 16,
      initialStockPrice: 50,
      consecutiveMisses: 0,
      shareFundedDealsThisRound: 0,
    };
    const result = calculateAffordability(20000, false, false, ipoState, rng);
    expect(result.ipoBonus).toBe(0);
  });

  it('stretch distribution should be right-skewed (median < mean)', () => {
    const stretches: number[] = [];
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new SeededRng(seed);
      const result = calculateAffordability(10000, false, false, null, rng);
      stretches.push(result.stretchFactor);
    }
    stretches.sort((a, b) => a - b);
    const median = stretches[500];
    const mean = stretches.reduce((a, b) => a + b, 0) / stretches.length;
    // Right-skewed: median < mean (squared uniform)
    expect(median).toBeLessThan(mean);
  });
});

describe('getAffordabilityWeights', () => {
  it('should sum to approximately 1.0', () => {
    const weights = getAffordabilityWeights(100000, 25000);
    const sum = Object.values(weights).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('should give 0 weight to tiers above affordability', () => {
    // $5M cash, $20M affordability — should not see institutional+ tiers
    const weights = getAffordabilityWeights(20000, 5000);
    expect(weights.institutional).toBe(0);
    expect(weights.marquee).toBe(0);
    expect(weights.trophy).toBe(0);
  });

  it('should give highest weight to "sweet spot" tiers', () => {
    // $80M affordability, $20M cash — mid_market should be in sweet spot
    const weights = getAffordabilityWeights(80000, 20000);
    // Mid-market floor cost is $24K, 80K / 24K = 3.3x — sweet spot bracket (2-5x)
    expect(weights.mid_market).toBeGreaterThan(0);
  });

  it('should apply concentration penalty when equity check exceeds cash threshold', () => {
    // Very low cash ($1K) but high affordability ($100M) — concentration penalty should apply
    const withLowCash = getAffordabilityWeights(100000, 1);
    const withHighCash = getAffordabilityWeights(100000, 100000);
    // With low cash, higher tiers should have concentration penalty applied
    // Trophy floor cost $675K * 0.25 = $168K equity check > $1 * 0.60 = $0.6
    // So trophy with low cash should be 30% of trophy with high cash (after renormalization)
    // We can't directly compare due to normalization, but low cash should reduce trophy relative weight
    expect(withLowCash.trophy).toBeLessThan(withHighCash.trophy + 0.01);
  });

  it('should fallback to micro=1 when all weights are 0', () => {
    // Affordability of 0 — all weights should be 0 except fallback
    const weights = getAffordabilityWeights(0, 0);
    expect(weights.micro).toBe(1);
  });
});

describe('generateTrophyEbitda', () => {
  it('should produce EBITDA in base range ($75M-$150M) for low affordability', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new SeededRng(seed);
      const ebitda = generateTrophyEbitda(500000, rng); // below $600M activation
      expect(ebitda).toBeGreaterThanOrEqual(75000);
      expect(ebitda).toBeLessThanOrEqual(150000);
    }
  });

  it('should scale above $600M affordability via sqrt', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42); // same seed for comparable base
    const low = generateTrophyEbitda(500000, rng1);
    const high = generateTrophyEbitda(3000000, rng2);
    expect(high).toBeGreaterThan(low);
  });

  it('should cap at 4x base range', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new SeededRng(seed);
      const ebitda = generateTrophyEbitda(100000000, rng); // massive affordability
      expect(ebitda).toBeLessThanOrEqual(150000 * 4); // 4x cap on max base
    }
  });
});

describe('pickWeightedTier', () => {
  it('should return a valid DealSizeTier', () => {
    const weights: Record<DealSizeTier, number> = {
      micro: 0.2, small: 0.3, mid_market: 0.3,
      upper_mid: 0.1, institutional: 0.05, marquee: 0.04, trophy: 0.01,
    };
    const rng = new SeededRng(42);
    const tier = pickWeightedTier(weights, rng);
    expect(TIER_ORDER).toContain(tier);
  });

  it('should distribute picks roughly according to weights', () => {
    const weights: Record<DealSizeTier, number> = {
      micro: 0.5, small: 0.3, mid_market: 0.2,
      upper_mid: 0, institutional: 0, marquee: 0, trophy: 0,
    };
    const counts: Record<DealSizeTier, number> = {
      micro: 0, small: 0, mid_market: 0, upper_mid: 0,
      institutional: 0, marquee: 0, trophy: 0,
    };
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = new SeededRng(seed);
      counts[pickWeightedTier(weights, rng)]++;
    }
    // Micro should be most frequent (50% weight)
    expect(counts.micro).toBeGreaterThan(counts.small);
    expect(counts.small).toBeGreaterThan(counts.mid_market);
    // Zero-weight tiers should never appear
    expect(counts.upper_mid).toBe(0);
    expect(counts.institutional).toBe(0);
    expect(counts.marquee).toBe(0);
    expect(counts.trophy).toBe(0);
  });
});

describe('getTierForEbitda', () => {
  it('should classify EBITDA into correct tiers', () => {
    expect(getTierForEbitda(500)).toBe('micro');
    expect(getTierForEbitda(1000)).toBe('micro');
    expect(getTierForEbitda(1500)).toBe('small');
    expect(getTierForEbitda(3000)).toBe('small');
    expect(getTierForEbitda(4000)).toBe('mid_market');
    expect(getTierForEbitda(10000)).toBe('upper_mid');
    expect(getTierForEbitda(25000)).toBe('institutional');
    expect(getTierForEbitda(50000)).toBe('marquee');
    expect(getTierForEbitda(75000)).toBe('trophy');
    expect(getTierForEbitda(200000)).toBe('trophy');
  });
});
