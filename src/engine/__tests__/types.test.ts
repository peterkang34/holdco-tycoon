import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatPercent,
  formatMultiple,
  randomInRange,
  randomInt,
  pickRandom,
} from '../types';

describe('formatMoney', () => {
  it('should format millions correctly', () => {
    expect(formatMoney(1000)).toBe('$1.0M');
    expect(formatMoney(5500)).toBe('$5.5M');
    expect(formatMoney(20000)).toBe('$20.0M');
  });

  it('should format thousands correctly', () => {
    expect(formatMoney(500)).toBe('$500k');
    expect(formatMoney(100)).toBe('$100k');
    expect(formatMoney(999)).toBe('$999k');
  });

  it('should format small amounts', () => {
    // 0.5 in thousands = $500 actual
    expect(formatMoney(0.5)).toBe('$500');
  });

  it('should handle zero', () => {
    expect(formatMoney(0)).toBe('$0');
  });

  it('should handle negative amounts', () => {
    expect(formatMoney(-1000)).toBe('$-1.0M');
    expect(formatMoney(-500)).toBe('$-500k');
  });
});

describe('formatPercent', () => {
  it('should format decimals as percentages', () => {
    expect(formatPercent(0.15)).toBe('15.0%');
    expect(formatPercent(0.075)).toBe('7.5%');
    expect(formatPercent(1.0)).toBe('100.0%');
  });

  it('should handle zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('should handle negative values', () => {
    expect(formatPercent(-0.05)).toBe('-5.0%');
  });
});

describe('formatMultiple', () => {
  it('should format as Nx', () => {
    expect(formatMultiple(4.0)).toBe('4.0x');
    expect(formatMultiple(2.5)).toBe('2.5x');
    expect(formatMultiple(10.3)).toBe('10.3x');
  });

  it('should handle zero', () => {
    expect(formatMultiple(0)).toBe('0.0x');
  });
});

describe('randomInRange', () => {
  it('should return value within range', () => {
    for (let i = 0; i < 100; i++) {
      const val = randomInRange([10, 20]);
      expect(val).toBeGreaterThanOrEqual(10);
      expect(val).toBeLessThanOrEqual(20);
    }
  });

  it('should return exact value when min equals max', () => {
    const val = randomInRange([5, 5]);
    expect(val).toBe(5);
  });
});

describe('randomInt', () => {
  it('should return integer within range', () => {
    for (let i = 0; i < 100; i++) {
      const val = randomInt(1, 10);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(10);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('should return exact value when min equals max', () => {
    expect(randomInt(5, 5)).toBe(5);
  });
});

describe('pickRandom', () => {
  it('should return an element from the array', () => {
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pickRandom(arr));
    }
  });

  it('should return only element from single-item array', () => {
    expect(pickRandom(['only'])).toBe('only');
  });
});
