// Financial distress and covenant system — pure functions, no side effects

import { DistressLevel } from './types';

export interface DistressRestrictions {
  canAcquire: boolean;
  canTakeDebt: boolean;
  canDistribute: boolean;
  canBuyback: boolean;
  interestPenalty: number; // added to base interest rate
}

/**
 * Determine distress level based on net debt / EBITDA ratio.
 * When EBITDA <= 0 and there is debt, treat as breach.
 */
export function calculateDistressLevel(netDebtToEbitda: number, totalDebt: number = 0, totalEbitda: number = 0): DistressLevel {
  // If no debt, always comfortable
  if (totalDebt <= 0 && netDebtToEbitda <= 0) return 'comfortable';

  // If EBITDA is zero/negative but there's debt, that's a breach
  if (totalEbitda <= 0 && totalDebt > 0) return 'breach';

  if (netDebtToEbitda >= 4.5) return 'breach';
  if (netDebtToEbitda >= 3.5) return 'stressed';
  if (netDebtToEbitda >= 2.5) return 'elevated';
  return 'comfortable';
}

/**
 * Get the restrictions and penalties for a given distress level.
 */
export function getDistressRestrictions(level: DistressLevel): DistressRestrictions {
  switch (level) {
    case 'comfortable':
      return { canAcquire: true, canTakeDebt: true, canDistribute: true, canBuyback: true, interestPenalty: 0 };
    case 'elevated':
      return { canAcquire: true, canTakeDebt: true, canDistribute: true, canBuyback: true, interestPenalty: 0 };
    case 'stressed':
      return { canAcquire: true, canTakeDebt: false, canDistribute: true, canBuyback: true, interestPenalty: 0.01 };
    case 'breach':
      return { canAcquire: false, canTakeDebt: false, canDistribute: false, canBuyback: false, interestPenalty: 0.02 };
  }
}

/**
 * Short label for UI display.
 */
export function getDistressLabel(level: DistressLevel): string {
  switch (level) {
    case 'comfortable': return 'Healthy';
    case 'elevated': return 'Elevated';
    case 'stressed': return 'Covenant Watch';
    case 'breach': return 'COVENANT BREACH';
  }
}

/**
 * Educational description for each level.
 */
export function getDistressDescription(level: DistressLevel): string {
  switch (level) {
    case 'comfortable':
      return 'Your leverage is within normal bounds. Full access to capital markets and deal-making.';
    case 'elevated':
      return 'Leverage is getting high. Banks are watching more closely. Consider deleveraging before it gets worse.';
    case 'stressed':
      return 'Your lenders have put you on covenant watch. Bank debt is no longer available, and you\'re paying a 1% interest rate penalty. Reduce leverage to regain full access.';
    case 'breach':
      return 'You\'ve breached your debt covenants. No acquisitions, distributions, or buybacks allowed. You\'re paying a 2% interest penalty. If this continues for 2 consecutive years, you\'ll be forced into restructuring.';
  }
}
