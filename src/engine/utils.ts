import type { Range } from './types';

export function randomInRange(range: Range): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// All internal values are stored in thousands (e.g., 1000 = $1M, 16000 = $16M)
export function formatMoney(amountInThousands: number): string {
  const amount = amountInThousands * 1000; // Convert to actual dollars
  if (Math.abs(amount) >= 1000000000) {
    return `$${(amount / 1000000000).toFixed(1)}B`;
  }
  if (Math.abs(amount) >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1000) {
    return `$${(amount / 1000).toFixed(0)}k`;
  }
  return `$${amount.toFixed(0)}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMultiple(value: number): string {
  return `${value.toFixed(1)}x`;
}
