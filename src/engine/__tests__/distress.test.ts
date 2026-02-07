import { describe, it, expect } from 'vitest';
import {
  calculateDistressLevel,
  getDistressRestrictions,
  getDistressLabel,
  getDistressDescription,
} from '../distress';

describe('calculateDistressLevel', () => {
  it('should return comfortable for low leverage', () => {
    expect(calculateDistressLevel(1.0, 1000, 1000)).toBe('comfortable');
    expect(calculateDistressLevel(0, 0, 1000)).toBe('comfortable');
    expect(calculateDistressLevel(2.4, 2400, 1000)).toBe('comfortable');
  });

  it('should return elevated for moderate leverage (2.5x–3.5x)', () => {
    expect(calculateDistressLevel(2.5, 2500, 1000)).toBe('elevated');
    expect(calculateDistressLevel(3.0, 3000, 1000)).toBe('elevated');
    expect(calculateDistressLevel(3.4, 3400, 1000)).toBe('elevated');
  });

  it('should return stressed for high leverage (3.5x–4.5x)', () => {
    expect(calculateDistressLevel(3.5, 3500, 1000)).toBe('stressed');
    expect(calculateDistressLevel(4.0, 4000, 1000)).toBe('stressed');
    expect(calculateDistressLevel(4.4, 4400, 1000)).toBe('stressed');
  });

  it('should return breach for very high leverage (>= 4.5x)', () => {
    expect(calculateDistressLevel(4.5, 4500, 1000)).toBe('breach');
    expect(calculateDistressLevel(6.0, 6000, 1000)).toBe('breach');
    expect(calculateDistressLevel(10.0, 10000, 1000)).toBe('breach');
  });

  it('should return breach when EBITDA is zero/negative but debt exists', () => {
    expect(calculateDistressLevel(0, 5000, 0)).toBe('breach');
    expect(calculateDistressLevel(0, 5000, -1000)).toBe('breach');
  });

  it('should return comfortable when no debt and no EBITDA', () => {
    expect(calculateDistressLevel(0, 0, 0)).toBe('comfortable');
  });

  it('should return comfortable for negative netDebtToEbitda (net cash)', () => {
    expect(calculateDistressLevel(-1.0, 0, 1000)).toBe('comfortable');
  });
});

describe('getDistressRestrictions', () => {
  it('should allow everything at comfortable', () => {
    const r = getDistressRestrictions('comfortable');
    expect(r.canAcquire).toBe(true);
    expect(r.canTakeDebt).toBe(true);
    expect(r.canDistribute).toBe(true);
    expect(r.canBuyback).toBe(true);
    expect(r.interestPenalty).toBe(0);
  });

  it('should allow everything at elevated (warning only)', () => {
    const r = getDistressRestrictions('elevated');
    expect(r.canAcquire).toBe(true);
    expect(r.canTakeDebt).toBe(true);
    expect(r.interestPenalty).toBe(0);
  });

  it('should block debt and add 1% penalty at stressed', () => {
    const r = getDistressRestrictions('stressed');
    expect(r.canAcquire).toBe(true);
    expect(r.canTakeDebt).toBe(false);
    expect(r.canDistribute).toBe(true);
    expect(r.interestPenalty).toBe(0.01);
  });

  it('should block everything and add 2% penalty at breach', () => {
    const r = getDistressRestrictions('breach');
    expect(r.canAcquire).toBe(false);
    expect(r.canTakeDebt).toBe(false);
    expect(r.canDistribute).toBe(false);
    expect(r.canBuyback).toBe(false);
    expect(r.interestPenalty).toBe(0.02);
  });
});

describe('getDistressLabel', () => {
  it('should return correct labels', () => {
    expect(getDistressLabel('comfortable')).toBe('Healthy');
    expect(getDistressLabel('elevated')).toBe('Elevated');
    expect(getDistressLabel('stressed')).toBe('Covenant Watch');
    expect(getDistressLabel('breach')).toBe('COVENANT BREACH');
  });
});

describe('getDistressDescription', () => {
  it('should return non-empty descriptions for all levels', () => {
    expect(getDistressDescription('comfortable').length).toBeGreaterThan(0);
    expect(getDistressDescription('elevated').length).toBeGreaterThan(0);
    expect(getDistressDescription('stressed').length).toBeGreaterThan(0);
    expect(getDistressDescription('breach').length).toBeGreaterThan(0);
  });

  it('should mention interest penalty in stressed description', () => {
    expect(getDistressDescription('stressed')).toContain('1%');
  });

  it('should mention no acquisitions in breach description', () => {
    expect(getDistressDescription('breach')).toContain('No acquisitions');
  });
});
