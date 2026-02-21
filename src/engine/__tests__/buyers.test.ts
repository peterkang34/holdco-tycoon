import { describe, it, expect, vi } from 'vitest';
import {
  calculateSizeTierPremium,
  calculateDeRiskingPremium,
  generateBuyerProfile,
  generateValuationCommentary,
} from '../buyers';
import { createMockBusiness, createMockDueDiligence } from './helpers';

describe('calculateSizeTierPremium', () => {
  it('should return 0 premium for <$2M EBITDA (individual tier)', () => {
    const result = calculateSizeTierPremium(1000); // $1M
    expect(result.tier).toBe('individual');
    expect(result.premium).toBe(0);
  });

  it('should return 0 premium for $1.99M EBITDA', () => {
    const result = calculateSizeTierPremium(1999);
    expect(result.tier).toBe('individual');
    expect(result.premium).toBe(0);
  });

  it('should return small_pe tier for $2-5M EBITDA', () => {
    const result = calculateSizeTierPremium(3500); // $3.5M
    expect(result.tier).toBe('small_pe');
    expect(result.premium).toBeGreaterThanOrEqual(0.5);
    expect(result.premium).toBeLessThanOrEqual(0.8);
  });

  it('should interpolate within small_pe tier', () => {
    const low = calculateSizeTierPremium(2000);
    const mid = calculateSizeTierPremium(3500);
    const high = calculateSizeTierPremium(4999);
    expect(low.premium).toBeCloseTo(0.5, 1);
    expect(mid.premium).toBeGreaterThan(low.premium);
    expect(high.premium).toBeLessThan(0.8);
  });

  it('should return lower_middle_pe tier for $5-10M EBITDA', () => {
    const result = calculateSizeTierPremium(7500); // $7.5M
    expect(result.tier).toBe('lower_middle_pe');
    expect(result.premium).toBeGreaterThanOrEqual(0.8);
    expect(result.premium).toBeLessThanOrEqual(1.5);
  });

  it('should return institutional_pe tier for $10-20M EBITDA', () => {
    const result = calculateSizeTierPremium(15000); // $15M
    expect(result.tier).toBe('institutional_pe');
    expect(result.premium).toBeGreaterThanOrEqual(1.5);
    expect(result.premium).toBeLessThanOrEqual(2.5);
  });

  it('should return large_pe tier for $20M+ EBITDA', () => {
    const result = calculateSizeTierPremium(25000); // $25M
    expect(result.tier).toBe('large_pe');
    expect(result.premium).toBeGreaterThanOrEqual(2.5);
    expect(result.premium).toBeLessThanOrEqual(3.5);
  });

  it('should cap premium at $30M EBITDA', () => {
    const at30 = calculateSizeTierPremium(30000);
    const at50 = calculateSizeTierPremium(50000);
    expect(at30.premium).toBeCloseTo(3.5, 1);
    expect(at50.premium).toBeCloseTo(3.5, 1);
  });

  it('should produce smooth interpolation across boundaries', () => {
    const premiums: number[] = [];
    for (let ebitda = 0; ebitda <= 30000; ebitda += 500) {
      premiums.push(calculateSizeTierPremium(ebitda).premium);
    }
    // Each premium should be >= the previous (monotonically increasing)
    for (let i = 1; i < premiums.length; i++) {
      expect(premiums[i]).toBeGreaterThanOrEqual(premiums[i - 1] - 0.01); // small tolerance
    }
  });
});

describe('calculateDeRiskingPremium', () => {
  it('should return 0 for business with no de-risking factors', () => {
    const business = createMockBusiness({
      dueDiligence: createMockDueDiligence({
        revenueConcentration: 'high',
        operatorQuality: 'weak',
        customerRetention: 70,
      }),
      isPlatform: false,
      platformScale: 0,
      improvements: [],
    });
    const premium = calculateDeRiskingPremium(business);
    expect(premium).toBe(0);
  });

  it('should add +0.3x for low revenue concentration', () => {
    const business = createMockBusiness({
      dueDiligence: createMockDueDiligence({ revenueConcentration: 'low' }),
      isPlatform: false,
      platformScale: 0,
      improvements: [],
    });
    const premium = calculateDeRiskingPremium(business);
    expect(premium).toBeGreaterThanOrEqual(0.3);
  });

  it('should add +0.3x for strong operator', () => {
    const business = createMockBusiness({
      dueDiligence: createMockDueDiligence({
        revenueConcentration: 'high',
        operatorQuality: 'strong',
        customerRetention: 70,
      }),
      isPlatform: false,
      improvements: [],
    });
    const premium = calculateDeRiskingPremium(business);
    expect(premium).toBeCloseTo(0.3, 1);
  });

  it('should add logarithmic premium for platform scale', () => {
    const business = createMockBusiness({
      dueDiligence: createMockDueDiligence({ revenueConcentration: 'high', operatorQuality: 'weak', customerRetention: 70 }),
      isPlatform: true,
      platformScale: 3,
      improvements: [],
    });
    const premium = calculateDeRiskingPremium(business);
    // log2(3+1) * 0.35 = 2.0 * 0.35 = 0.7
    expect(premium).toBeCloseTo(0.7, 1);
  });

  it('should add +0.2x for 2+ improvements', () => {
    const business = createMockBusiness({
      dueDiligence: createMockDueDiligence({ revenueConcentration: 'high', operatorQuality: 'weak', customerRetention: 70 }),
      isPlatform: false,
      improvements: [
        { type: 'operating_playbook', appliedRound: 1, effect: 0.08 },
        { type: 'pricing_model', appliedRound: 2, effect: 0.05 },
      ],
    });
    const premium = calculateDeRiskingPremium(business);
    expect(premium).toBeCloseTo(0.2, 1);
  });

  it('should add +0.2x for 90%+ retention', () => {
    const business = createMockBusiness({
      dueDiligence: createMockDueDiligence({ revenueConcentration: 'high', operatorQuality: 'weak', customerRetention: 95 }),
      isPlatform: false,
      improvements: [],
    });
    const premium = calculateDeRiskingPremium(business);
    expect(premium).toBeCloseTo(0.2, 1);
  });

  it('should cap at 1.5x total', () => {
    const business = createMockBusiness({
      dueDiligence: createMockDueDiligence({
        revenueConcentration: 'low',
        operatorQuality: 'strong',
        customerRetention: 95,
      }),
      isPlatform: true,
      platformScale: 3,
      improvements: [
        { type: 'operating_playbook', appliedRound: 1, effect: 0.08 },
        { type: 'pricing_model', appliedRound: 2, effect: 0.05 },
      ],
    });
    const premium = calculateDeRiskingPremium(business);
    expect(premium).toBe(1.5);
  });
});

describe('generateBuyerProfile', () => {
  it('should return a valid buyer profile', () => {
    const business = createMockBusiness();
    const profile = generateBuyerProfile(business, 'small_pe', 'agency');
    expect(profile.name).toBeTruthy();
    expect(profile.type).toBeTruthy();
    expect(profile.investmentThesis).toBeTruthy();
    expect(typeof profile.isStrategic).toBe('boolean');
    expect(typeof profile.strategicPremium).toBe('number');
  });

  it('should return no strategic premium for non-strategic buyers', () => {
    // Force non-strategic by mocking Math.random to return > 0.35
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const business = createMockBusiness();
    const profile = generateBuyerProfile(business, 'individual', 'agency');
    expect(profile.isStrategic).toBe(false);
    expect(profile.strategicPremium).toBe(0);
    vi.restoreAllMocks();
  });

  it('should give individual type for individual tier', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const business = createMockBusiness();
    const profile = generateBuyerProfile(business, 'individual', 'agency');
    expect(['individual', 'family_office']).toContain(profile.type);
    vi.restoreAllMocks();
  });

  it('should have strategic premium between 0.5 and 1.5 for strategic buyers', () => {
    // Force strategic by mocking Math.random to return < strategic chance
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const business = createMockBusiness();
    const profile = generateBuyerProfile(business, 'large_pe', 'agency');
    if (profile.isStrategic) {
      expect(profile.strategicPremium).toBeGreaterThanOrEqual(0.5);
      expect(profile.strategicPremium).toBeLessThanOrEqual(1.5);
    }
    vi.restoreAllMocks();
  });

  it('should generate platform thesis for platform businesses', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // avoid strategic
    const business = createMockBusiness({ isPlatform: true, platformScale: 2 });
    const profile = generateBuyerProfile(business, 'institutional_pe', 'agency');
    if (!profile.isStrategic) {
      expect(profile.investmentThesis.toLowerCase()).toContain('platform');
    }
    vi.restoreAllMocks();
  });
});

describe('generateValuationCommentary', () => {
  it('should return valid commentary object', () => {
    const business = createMockBusiness();
    const commentary = generateValuationCommentary(
      business, 'small_pe', 0.5, 0.3, 3000, 5.5
    );
    expect(commentary.summary).toBeTruthy();
    expect(commentary.buyerPoolDescription).toBeTruthy();
    expect(Array.isArray(commentary.factors)).toBe(true);
  });

  it('should include size premium factor when > 0', () => {
    const business = createMockBusiness();
    const commentary = generateValuationCommentary(
      business, 'institutional_pe', 2.5, 0, 15000, 8.0
    );
    expect(commentary.factors.some(f => f.includes('Size premium'))).toBe(true);
  });

  it('should include de-risking factor when > 0', () => {
    const business = createMockBusiness({
      dueDiligence: createMockDueDiligence({ revenueConcentration: 'low' }),
    });
    const commentary = generateValuationCommentary(
      business, 'small_pe', 0, 0.5, 3000, 5.0
    );
    expect(commentary.factors.some(f => f.includes('De-risking'))).toBe(true);
  });

  it('should have no factors when premiums are 0', () => {
    const business = createMockBusiness({ isPlatform: false });
    const commentary = generateValuationCommentary(
      business, 'individual', 0, 0, 500, 4.0
    );
    expect(commentary.factors.length).toBe(0);
  });
});
