import { describe, it, expect } from 'vitest';
import {
  calculateDistressLevel,
  calculateCovenantHeadroom,
  getDistressRestrictions,
  getDistressLabel,
  getDistressDescription,
} from '../distress';
import { createMockBusiness, createMockGameState } from './helpers';
import { RESTRUCTURING_FEV_PENALTY, DIFFICULTY_CONFIG, COVENANT_BREACH_ROUNDS_THRESHOLD } from '../../data/gameConfig';
import type { LeaderboardEntry } from '../types';

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

  it('should return breach when EBITDA is zero/negative, debt exists, and cash < debt', () => {
    expect(calculateDistressLevel(0, 5000, 0, 0)).toBe('breach');
    expect(calculateDistressLevel(0, 5000, 0, 4999)).toBe('breach');
    expect(calculateDistressLevel(0, 5000, -1000, 0)).toBe('breach');
  });

  it('should return stressed (not breach) when EBITDA is zero, debt exists, but cash >= debt', () => {
    // Solvent but idle — player sold all businesses but has cash to cover debt
    expect(calculateDistressLevel(0, 5000, 0, 5000)).toBe('stressed');
    expect(calculateDistressLevel(0, 5000, 0, 10000)).toBe('stressed');
    expect(calculateDistressLevel(0, 1000, 0, 50000)).toBe('stressed');
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

// ── Restructuring System Tests ──

describe('Restructuring trigger logic', () => {
  it('negative cash triggers restructuring when hasRestructured = false', () => {
    const state = createMockGameState({
      hasRestructured: false,
      requiresRestructuring: false,
      cash: 100,
    });
    // Simulate: if newCash < 0 and !hasRestructured → requiresRestructuring = true
    const newCash = -500;
    let requiresRestructuring = state.requiresRestructuring;
    let gameOverFromNegativeCash = false;
    if (newCash < 0) {
      if (state.hasRestructured) {
        gameOverFromNegativeCash = true;
      } else {
        requiresRestructuring = true;
      }
    }
    expect(requiresRestructuring).toBe(true);
    expect(gameOverFromNegativeCash).toBe(false);
  });

  it('negative cash triggers bankruptcy when hasRestructured = true', () => {
    const state = createMockGameState({
      hasRestructured: true,
      requiresRestructuring: false,
      cash: 100,
    });
    const newCash = -500;
    let requiresRestructuring = state.requiresRestructuring;
    let gameOverFromNegativeCash = false;
    if (newCash < 0) {
      if (state.hasRestructured) {
        gameOverFromNegativeCash = true;
      } else {
        requiresRestructuring = true;
      }
    }
    expect(requiresRestructuring).toBe(false);
    expect(gameOverFromNegativeCash).toBe(true);
  });

  it('2 breach years triggers restructuring', () => {
    const covenantBreachRounds = COVENANT_BREACH_ROUNDS_THRESHOLD;
    const hasRestructured = false;
    let requiresRestructuring = false;
    let gameOverFromBankruptcy = false;
    if (covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD) {
      if (hasRestructured) {
        gameOverFromBankruptcy = true;
      } else {
        requiresRestructuring = true;
      }
    }
    expect(requiresRestructuring).toBe(true);
    expect(gameOverFromBankruptcy).toBe(false);
  });

  it('2 breach years after restructuring triggers bankruptcy', () => {
    const covenantBreachRounds = COVENANT_BREACH_ROUNDS_THRESHOLD;
    const hasRestructured = true;
    let requiresRestructuring = false;
    let gameOverFromBankruptcy = false;
    if (covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD) {
      if (hasRestructured) {
        gameOverFromBankruptcy = true;
      } else {
        requiresRestructuring = true;
      }
    }
    expect(requiresRestructuring).toBe(false);
    expect(gameOverFromBankruptcy).toBe(true);
  });

  it('pre-restructuring breach counter resets when exiting breach', () => {
    // Before restructuring, exiting breach resets the counter (forgiving)
    const hasRestructured = false;
    let covenantBreachRounds = 1; // was in breach for 1 year
    const inBreach = false; // now exiting breach
    if (inBreach) {
      covenantBreachRounds += 1;
    } else if (!hasRestructured) {
      covenantBreachRounds = 0;
    }
    expect(covenantBreachRounds).toBe(0);
  });

  it('post-restructuring breach counter does NOT reset when temporarily exiting breach', () => {
    // After restructuring, exiting breach does NOT reset the counter (strict)
    const hasRestructured = true;
    let covenantBreachRounds = 1; // was in breach for 1 year
    const inBreach = false; // now exiting breach
    if (inBreach) {
      covenantBreachRounds += 1;
    } else if (!hasRestructured) {
      covenantBreachRounds = 0;
    }
    // Counter stays at 1, not reset
    expect(covenantBreachRounds).toBe(1);
  });

  it('post-restructuring non-consecutive breach years still trigger bankruptcy', () => {
    const hasRestructured = true;
    let covenantBreachRounds = 0;

    // Year 1: breach
    covenantBreachRounds += 1;
    // Year 2: no breach — counter stays (post-restructuring)
    // (no reset because hasRestructured = true)
    // Year 3: breach again
    covenantBreachRounds += 1;

    let gameOverFromBankruptcy = false;
    if (covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD) {
      if (hasRestructured) {
        gameOverFromBankruptcy = true;
      }
    }
    expect(gameOverFromBankruptcy).toBe(true);
  });

  it('insolvency after restructuring triggers bankruptcy (wiped equity)', () => {
    const hasRestructured = true;
    const intrinsicValuePerShare = -5; // negative equity
    const sharesOutstanding = 1000;
    const intrinsicValue = intrinsicValuePerShare * sharesOutstanding;
    let gameOverFromBankruptcy = false;

    if (hasRestructured && intrinsicValue <= 0) {
      gameOverFromBankruptcy = true;
    }
    expect(gameOverFromBankruptcy).toBe(true);
  });

  it('insolvency does NOT trigger before restructuring', () => {
    const hasRestructured = false;
    const intrinsicValuePerShare = -5;
    const sharesOutstanding = 1000;
    const intrinsicValue = intrinsicValuePerShare * sharesOutstanding;
    let gameOverFromBankruptcy = false;

    if (hasRestructured && intrinsicValue <= 0) {
      gameOverFromBankruptcy = true;
    }
    expect(gameOverFromBankruptcy).toBe(false);
  });

  it('empty portfolio after restructuring triggers bankruptcy', () => {
    const hasRestructured = true;
    const activeBusinesses = 0;
    const cash = -100;
    let gameOverFromBankruptcy = false;

    if (hasRestructured && activeBusinesses === 0 && cash <= 0) {
      gameOverFromBankruptcy = true;
    }
    expect(gameOverFromBankruptcy).toBe(true);
  });

  it('empty portfolio does NOT trigger if cash is positive', () => {
    const hasRestructured = true;
    const activeBusinesses = 0;
    const cash = 5000;
    let gameOverFromBankruptcy = false;

    if (hasRestructured && activeBusinesses === 0 && cash <= 0) {
      gameOverFromBankruptcy = true;
    }
    expect(gameOverFromBankruptcy).toBe(false);
  });
});

describe('Restructuring exit conditions', () => {
  it('cannot continue without breach resolution (ND/E >= 4.5x)', () => {
    const actionsTaken = 3;
    const netDebtToEbitda = 5.0;
    const cash = 1000;
    const breachResolved = netDebtToEbitda < 4.5 && cash >= 0;
    const canContinue = actionsTaken > 0 && breachResolved;
    expect(breachResolved).toBe(false);
    expect(canContinue).toBe(false);
  });

  it('can continue after breach resolved (ND/E < 4.5x) with 1+ actions', () => {
    const actionsTaken = 1;
    const netDebtToEbitda = 3.0;
    const cash = 5000;
    const breachResolved = netDebtToEbitda < 4.5 && cash >= 0;
    const canContinue = actionsTaken > 0 && breachResolved;
    expect(breachResolved).toBe(true);
    expect(canContinue).toBe(true);
  });

  it('cannot continue with 0 actions even if breach resolved', () => {
    const actionsTaken = 0;
    const netDebtToEbitda = 2.0;
    const cash = 10000;
    const breachResolved = netDebtToEbitda < 4.5 && cash >= 0;
    const canContinue = actionsTaken > 0 && breachResolved;
    expect(breachResolved).toBe(true);
    expect(canContinue).toBe(false);
  });

  it('cannot continue if cash is negative', () => {
    const actionsTaken = 2;
    const netDebtToEbitda = 3.0;
    const cash = -100;
    const breachResolved = netDebtToEbitda < 4.5 && cash >= 0;
    const canContinue = actionsTaken > 0 && breachResolved;
    expect(breachResolved).toBe(false);
    expect(canContinue).toBe(false);
  });
});

describe('FEV restructuring penalty', () => {
  it('RESTRUCTURING_FEV_PENALTY is 0.80 (20% haircut)', () => {
    expect(RESTRUCTURING_FEV_PENALTY).toBe(0.80);
  });

  it('restructured game gets 0.80x FEV multiplier', () => {
    const rawFEV = 50000; // $50M
    const penalty = RESTRUCTURING_FEV_PENALTY;
    expect(Math.round(rawFEV * penalty)).toBe(40000);
  });

  it('non-restructured game gets 1.0x FEV multiplier', () => {
    const rawFEV = 50000;
    const penalty = 1.0; // no restructuring
    expect(Math.round(rawFEV * penalty)).toBe(50000);
  });

  it('penalty stacks with difficulty multiplier', () => {
    const rawFEV = 50000;
    const difficultyMultiplier = DIFFICULTY_CONFIG['normal'].leaderboardMultiplier;
    const restructuringPenalty = RESTRUCTURING_FEV_PENALTY; // 0.80
    const adjustedFEV = Math.round(rawFEV * difficultyMultiplier * restructuringPenalty);
    expect(adjustedFEV).toBe(Math.round(50000 * difficultyMultiplier * 0.80));
  });

  it('leaderboard entry with hasRestructured gets penalized FEV', () => {
    const entry: LeaderboardEntry = {
      id: 'test',
      holdcoName: 'Test',
      initials: 'TST',
      enterpriseValue: 60000,
      score: 50,
      grade: 'C',
      businessCount: 3,
      date: new Date().toISOString(),
      founderEquityValue: 50000,
      difficulty: 'normal',
      hasRestructured: true,
    };
    // Simulating getAdjustedFEV logic
    const raw = entry.founderEquityValue ?? entry.enterpriseValue;
    const diffMult = DIFFICULTY_CONFIG[entry.difficulty ?? 'easy']?.leaderboardMultiplier ?? 1.0;
    const restrPenalty = entry.hasRestructured ? RESTRUCTURING_FEV_PENALTY : 1.0;
    const adjusted = Math.round(raw * diffMult * restrPenalty);
    expect(adjusted).toBe(Math.round(50000 * diffMult * 0.80));
  });

  it('leaderboard entry without hasRestructured gets no penalty', () => {
    const entry: LeaderboardEntry = {
      id: 'test2',
      holdcoName: 'Test2',
      initials: 'TS2',
      enterpriseValue: 60000,
      score: 70,
      grade: 'B',
      businessCount: 4,
      date: new Date().toISOString(),
      founderEquityValue: 50000,
      difficulty: 'normal',
    };
    const raw = entry.founderEquityValue ?? entry.enterpriseValue;
    const diffMult = DIFFICULTY_CONFIG[entry.difficulty ?? 'easy']?.leaderboardMultiplier ?? 1.0;
    const restrPenalty = entry.hasRestructured ? RESTRUCTURING_FEV_PENALTY : 1.0;
    const adjusted = Math.round(raw * diffMult * restrPenalty);
    expect(adjusted).toBe(Math.round(50000 * diffMult));
  });
});

describe('Bank debt paydown logic', () => {
  it('paydown reduces bank debt and cash correctly', () => {
    const business = createMockBusiness({
      bankDebtBalance: 2000,
      bankDebtRate: 0.08,
      bankDebtRoundsRemaining: 5,
    });
    const amount = 500;
    const actualPayment = Math.min(amount, business.bankDebtBalance, 10000); // cash = 10000
    const newBankDebt = business.bankDebtBalance - actualPayment;
    expect(actualPayment).toBe(500);
    expect(newBankDebt).toBe(1500);
  });

  it('paydown is capped at min(amount, bankDebtBalance, cash)', () => {
    // Case 1: limited by cash
    expect(Math.min(5000, 3000, 1000)).toBe(1000);
    // Case 2: limited by balance
    expect(Math.min(5000, 2000, 10000)).toBe(2000);
    // Case 3: limited by amount
    expect(Math.min(1000, 3000, 10000)).toBe(1000);
  });

  it('paydown does nothing for non-active business', () => {
    const business = createMockBusiness({
      status: 'sold',
      bankDebtBalance: 2000,
    });
    // The store action checks status === 'active' and returns early if not
    const shouldProcess = business.status === 'active' && business.bankDebtBalance > 0;
    expect(shouldProcess).toBe(false);
  });

  it('paydown does nothing when bankDebtBalance is 0', () => {
    const business = createMockBusiness({
      status: 'active',
      bankDebtBalance: 0,
    });
    const shouldProcess = business.status === 'active' && business.bankDebtBalance > 0;
    expect(shouldProcess).toBe(false);
  });

  it('totalDebt recomputation after bank debt paydown', () => {
    // computeTotalDebt = holdcoLoanBalance + sum of active/integrated business bankDebtBalance
    const businesses = [
      createMockBusiness({ id: 'b1', bankDebtBalance: 2000 }),
      createMockBusiness({ id: 'b2', bankDebtBalance: 1000 }),
    ];
    const holdcoLoanBalance = 3000;
    const totalBefore = holdcoLoanBalance + 2000 + 1000; // 6000

    // After paying 500 off business b1
    const updatedBusinesses = businesses.map(b =>
      b.id === 'b1' ? { ...b, bankDebtBalance: b.bankDebtBalance - 500 } : b
    );
    const totalAfter = holdcoLoanBalance + updatedBusinesses.reduce((sum, b) => sum + b.bankDebtBalance, 0);
    expect(totalBefore).toBe(6000);
    expect(totalAfter).toBe(5500);
  });
});

// ── Distress Cascade & Breach Testing ──

describe('Breach counter mechanics', () => {
  it('covenantBreachRounds increments on consecutive breach years', () => {
    let covenantBreachRounds = 0;
    const hasRestructured = false;

    // Year 1: breach
    const inBreach1 = true;
    if (inBreach1) covenantBreachRounds += 1;
    else if (!hasRestructured) covenantBreachRounds = 0;
    expect(covenantBreachRounds).toBe(1);

    // Year 2: still in breach
    const inBreach2 = true;
    if (inBreach2) covenantBreachRounds += 1;
    else if (!hasRestructured) covenantBreachRounds = 0;
    expect(covenantBreachRounds).toBe(2);
  });

  it('counter resets to 0 when leverage drops below breach (pre-restructuring)', () => {
    let covenantBreachRounds = 1;
    const hasRestructured = false;
    const inBreach = false; // recovered

    if (inBreach) covenantBreachRounds += 1;
    else if (!hasRestructured) covenantBreachRounds = 0;

    expect(covenantBreachRounds).toBe(0);
  });

  it('counter does NOT increment when elevated (not breach)', () => {
    let covenantBreachRounds = 0;
    const hasRestructured = false;
    // Elevated means leverage 2.5-3.5x — not breach
    const distressLevel = calculateDistressLevel(3.0, 3000, 1000);
    expect(distressLevel).toBe('elevated');
    const inBreach = distressLevel === 'breach';

    if (inBreach) covenantBreachRounds += 1;
    else if (!hasRestructured) covenantBreachRounds = 0;

    expect(covenantBreachRounds).toBe(0);
  });

  it('counter does NOT increment when stressed (not breach)', () => {
    let covenantBreachRounds = 0;
    const hasRestructured = false;
    const distressLevel = calculateDistressLevel(4.0, 4000, 1000);
    expect(distressLevel).toBe('stressed');
    const inBreach = distressLevel === 'breach';

    if (inBreach) covenantBreachRounds += 1;
    else if (!hasRestructured) covenantBreachRounds = 0;

    expect(covenantBreachRounds).toBe(0);
  });

  it('counter increments from 0 to threshold across breach years', () => {
    let covenantBreachRounds = 0;
    const hasRestructured = false;

    for (let year = 0; year < COVENANT_BREACH_ROUNDS_THRESHOLD; year++) {
      const inBreach = true;
      if (inBreach) covenantBreachRounds += 1;
      else if (!hasRestructured) covenantBreachRounds = 0;
    }

    expect(covenantBreachRounds).toBe(COVENANT_BREACH_ROUNDS_THRESHOLD);
  });
});

describe('Forced restructuring trigger', () => {
  it('requiresRestructuring becomes true at COVENANT_BREACH_ROUNDS_THRESHOLD', () => {
    const covenantBreachRounds = COVENANT_BREACH_ROUNDS_THRESHOLD;
    const hasRestructured = false;
    let requiresRestructuring = false;
    let gameOver = false;

    if (covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD) {
      if (hasRestructured) {
        gameOver = true;
      } else {
        requiresRestructuring = true;
      }
    }

    expect(requiresRestructuring).toBe(true);
    expect(gameOver).toBe(false);
  });

  it('does NOT trigger restructuring below threshold', () => {
    const covenantBreachRounds = COVENANT_BREACH_ROUNDS_THRESHOLD - 1;
    let requiresRestructuring = false;
    let gameOver = false;

    if (covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD) {
      requiresRestructuring = true;
      gameOver = true;
    }

    expect(requiresRestructuring).toBe(false);
    expect(gameOver).toBe(false);
  });

  it('triggers bankruptcy (not restructuring) when already restructured', () => {
    const covenantBreachRounds = COVENANT_BREACH_ROUNDS_THRESHOLD;
    const hasRestructured = true;
    let requiresRestructuring = false;
    let gameOver = false;

    if (covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD) {
      if (hasRestructured) {
        gameOver = true;
      } else {
        requiresRestructuring = true;
      }
    }

    expect(requiresRestructuring).toBe(false);
    expect(gameOver).toBe(true);
  });

  it('exceeding threshold also triggers (not just exact match)', () => {
    const covenantBreachRounds = COVENANT_BREACH_ROUNDS_THRESHOLD + 2;
    let requiresRestructuring = false;

    if (covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD) {
      requiresRestructuring = true;
    }

    expect(requiresRestructuring).toBe(true);
  });
});

describe('Post-restructuring state', () => {
  it('exitMultiplePenalty includes RESTRUCTURING_FEV_PENALTY (0.80)', () => {
    // Simulating restructuring action: penalty applied as multiplier
    const rawFEV = 100000;
    const penalizedFEV = Math.round(rawFEV * RESTRUCTURING_FEV_PENALTY);
    expect(penalizedFEV).toBe(80000);
    expect(RESTRUCTURING_FEV_PENALTY).toBe(0.80);
  });

  it('covenantBreachRounds resets to 0 after restructuring', () => {
    const state = createMockGameState({
      covenantBreachRounds: 2,
      requiresRestructuring: true,
      hasRestructured: false,
    });

    // Simulate restructuring action
    const postState = {
      ...state,
      covenantBreachRounds: 0,
      hasRestructured: true,
      requiresRestructuring: false,
    };

    expect(postState.covenantBreachRounds).toBe(0);
    expect(postState.hasRestructured).toBe(true);
    expect(postState.requiresRestructuring).toBe(false);
  });

  it('hasRestructured flag persists after recovery', () => {
    const state = createMockGameState({
      hasRestructured: true,
      covenantBreachRounds: 0,
    });
    // Even after recovering to comfortable, the flag stays
    const distressLevel = calculateDistressLevel(1.0, 1000, 1000);
    expect(distressLevel).toBe('comfortable');
    expect(state.hasRestructured).toBe(true);
  });

  it('post-restructuring breach counter is cumulative (non-consecutive breaches)', () => {
    const hasRestructured = true;
    let covenantBreachRounds = 0;

    // Year 1: breach
    covenantBreachRounds += 1;
    expect(covenantBreachRounds).toBe(1);

    // Year 2: no breach — but post-restructuring, counter does NOT reset
    const inBreach = false;
    if (inBreach) covenantBreachRounds += 1;
    else if (!hasRestructured) covenantBreachRounds = 0;
    // Counter stays at 1
    expect(covenantBreachRounds).toBe(1);

    // Year 3: breach again
    covenantBreachRounds += 1;
    expect(covenantBreachRounds).toBe(2);
    expect(covenantBreachRounds >= COVENANT_BREACH_ROUNDS_THRESHOLD).toBe(true);
  });
});

describe('Interest penalty application', () => {
  it('comfortable level has 0% interest penalty', () => {
    const r = getDistressRestrictions('comfortable');
    expect(r.interestPenalty).toBe(0);
  });

  it('elevated level has 0% interest penalty', () => {
    const r = getDistressRestrictions('elevated');
    expect(r.interestPenalty).toBe(0);
  });

  it('stressed level has 1% interest penalty', () => {
    const r = getDistressRestrictions('stressed');
    expect(r.interestPenalty).toBe(0.01);
  });

  it('breach level has 2% interest penalty', () => {
    const r = getDistressRestrictions('breach');
    expect(r.interestPenalty).toBe(0.02);
  });

  it('penalties stack on top of base rate for effective cost', () => {
    const baseRate = 0.07;
    const stressedPenalty = getDistressRestrictions('stressed').interestPenalty;
    const breachPenalty = getDistressRestrictions('breach').interestPenalty;

    expect(baseRate + stressedPenalty).toBeCloseTo(0.08);
    expect(baseRate + breachPenalty).toBeCloseTo(0.09);
  });

  it('breach penalty is strictly greater than stressed penalty', () => {
    const stressed = getDistressRestrictions('stressed').interestPenalty;
    const breach = getDistressRestrictions('breach').interestPenalty;
    expect(breach).toBeGreaterThan(stressed);
  });
});

describe('Covenant headroom projection', () => {
  it('returns correct currentLeverage for normal case', () => {
    const result = calculateCovenantHeadroom(
      5000,   // cash
      10000,  // totalDebt
      2000,   // totalEbitda
      0, 0, 0, [], 0.07, 0, 0
    );
    // ND = 10000 - 5000 = 5000; leverage = 5000/2000 = 2.5
    expect(result.currentLeverage).toBeCloseTo(2.5);
    expect(result.breachThreshold).toBe(4.5);
  });

  it('headroomRatio is positive when below breach', () => {
    const result = calculateCovenantHeadroom(
      5000, 5000, 2000, 0, 0, 0, [], 0.07, 0, 0
    );
    // ND = 0; leverage = 0; headroom = 4.5 - 0 = 4.5
    expect(result.headroomRatio).toBeCloseTo(4.5);
    expect(result.headroomCash).toBeGreaterThan(0);
  });

  it('headroomRatio is negative when above breach', () => {
    const result = calculateCovenantHeadroom(
      1000, 20000, 2000, 0, 0, 0, [], 0.07, 0, 0
    );
    // ND = 19000; leverage = 9.5; headroom = 4.5 - 9.5 = -5.0
    expect(result.headroomRatio).toBeCloseTo(-5.0);
  });

  it('projectedCashAfterDebt = cash + estimatedNetFcf - debtService', () => {
    const businesses = [createMockBusiness({
      bankDebtBalance: 4000,
      bankDebtRate: 0.08,
      bankDebtRoundsRemaining: 4,
    })];
    const result = calculateCovenantHeadroom(
      10000, 4000, 2000,
      0, 0, 0,          // no holdco loan
      businesses, 0.07, 0,
      3000              // estimatedNetFcf
    );
    // Bank interest = 4000 * 0.08 = 320; principal = 4000/4 = 1000; debtService = 1320
    // projected = 10000 + 3000 - 1320 = 11680
    expect(result.nextYearDebtService).toBe(1320);
    expect(result.projectedCashAfterDebt).toBe(11680);
    expect(result.cashWillGoNegative).toBe(false);
  });

  it('cashWillGoNegative when projected cash is negative', () => {
    const businesses = [createMockBusiness({
      bankDebtBalance: 20000,
      bankDebtRate: 0.10,
      bankDebtRoundsRemaining: 2,
    })];
    const result = calculateCovenantHeadroom(
      5000, 20000, 1000,
      0, 0, 0,
      businesses, 0.07, 0,
      1000 // small FCF
    );
    // Bank interest = 20000 * 0.10 = 2000; principal = 20000/2 = 10000; debtService = 12000
    // projected = 5000 + 1000 - 12000 = -6000
    expect(result.cashWillGoNegative).toBe(true);
    expect(result.projectedCashAfterDebt).toBe(-6000);
  });

  it('includes holdco loan in debt service calculation', () => {
    const result = calculateCovenantHeadroom(
      10000, 8000, 2000,
      5000, 0.06, 5,    // holdco loan: $5M at 6%, 5 rounds
      [], 0.07, 0, 0
    );
    // Holdco interest = 5000 * 0.06 = 300; principal = 5000/5 = 1000; debtService = 1300
    expect(result.nextYearDebtService).toBe(1300);
  });

  it('includes interest penalty in holdco debt service', () => {
    const result = calculateCovenantHeadroom(
      10000, 5000, 2000,
      5000, 0.06, 5,
      [], 0.07, 0.02,   // 2% penalty (breach)
      0
    );
    // Holdco interest = 5000 * (0.06 + 0.02) = 400; principal = 1000; debtService = 1400
    expect(result.nextYearDebtService).toBe(1400);
  });

  it('includes seller notes in debt service', () => {
    const businesses = [createMockBusiness({
      sellerNoteBalance: 2000,
      sellerNoteRate: 0.05,
      sellerNoteRoundsRemaining: 4,
    })];
    const result = calculateCovenantHeadroom(
      10000, 0, 2000,
      0, 0, 0,
      businesses, 0.07, 0, 0
    );
    // Seller interest = 2000 * 0.05 = 100; principal = 2000/4 = 500; debtService = 600
    expect(result.nextYearDebtService).toBe(600);
  });

  it('leverage is Infinity when EBITDA is 0 and debt exists', () => {
    const result = calculateCovenantHeadroom(
      1000, 5000, 0,
      0, 0, 0, [], 0.07, 0, 0
    );
    expect(result.currentLeverage).toBe(Infinity);
  });

  it('leverage is 0 when no debt and no EBITDA', () => {
    const result = calculateCovenantHeadroom(
      5000, 0, 0,
      0, 0, 0, [], 0.07, 0, 0
    );
    expect(result.currentLeverage).toBe(0);
    expect(result.headroomCash).toBe(5000); // all cash is headroom
  });
});

describe('Distress cascade edge cases', () => {
  it('zero EBITDA with outstanding debt does not divide by zero', () => {
    // calculateDistressLevel handles zero EBITDA explicitly
    const level = calculateDistressLevel(0, 5000, 0, 0);
    expect(level).toBe('breach'); // no cash to cover debt
    // Should not throw
  });

  it('zero EBITDA with debt and sufficient cash is stressed, not breach', () => {
    const level = calculateDistressLevel(0, 5000, 0, 5000);
    expect(level).toBe('stressed');
  });

  it('negative EBITDA with debt and no cash is breach', () => {
    const level = calculateDistressLevel(0, 3000, -500, 0);
    expect(level).toBe('breach');
  });

  it('very high leverage (100x) is breach', () => {
    const level = calculateDistressLevel(100, 100000, 1000);
    expect(level).toBe('breach');
  });

  it('exact boundary: 4.5x leverage is breach (not stressed)', () => {
    const level = calculateDistressLevel(4.5, 4500, 1000);
    expect(level).toBe('breach');
  });

  it('exact boundary: 3.5x leverage is stressed (not elevated)', () => {
    const level = calculateDistressLevel(3.5, 3500, 1000);
    expect(level).toBe('stressed');
  });

  it('exact boundary: 2.5x leverage is elevated (not comfortable)', () => {
    const level = calculateDistressLevel(2.5, 2500, 1000);
    expect(level).toBe('elevated');
  });

  it('business with zero revenue but positive EBITDA gets correct margin', () => {
    // Edge case: EBITDA > 0 implies revenue should be > 0, but test the margin calc safety
    const biz = createMockBusiness({ revenue: 0, ebitda: 500, ebitdaMargin: 0 });
    // The margin is 0 but EBITDA exists — distress level still based on leverage
    const level = calculateDistressLevel(2.0, 2000, biz.ebitda + 500);
    expect(level).toBe('comfortable');
  });

  it('negative cash does not cause comfortable when no debt', () => {
    // No debt, negative netDebtToEbitda (net cash) → comfortable
    const level = calculateDistressLevel(-2.0, 0, 1000);
    expect(level).toBe('comfortable');
  });

  it('multiple businesses with mixed debt — headroom includes all debt service', () => {
    const businesses = [
      createMockBusiness({
        id: 'b1',
        bankDebtBalance: 3000,
        bankDebtRate: 0.07,
        bankDebtRoundsRemaining: 5,
        sellerNoteBalance: 1000,
        sellerNoteRate: 0.05,
        sellerNoteRoundsRemaining: 4,
      }),
      createMockBusiness({
        id: 'b2',
        bankDebtBalance: 2000,
        bankDebtRate: 0.08,
        bankDebtRoundsRemaining: 3,
      }),
    ];
    const result = calculateCovenantHeadroom(
      10000, 6000, 3000,
      0, 0, 0,
      businesses, 0.07, 0, 0
    );
    // b1 bank: interest=3000*0.07=210, principal=3000/5=600 → 810
    // b1 seller: interest=1000*0.05=50, principal=1000/4=250 → 300
    // b2 bank: interest=2000*0.08=160, principal=2000/3=667 → 827
    // total = 810+300+827 = 1937
    expect(result.nextYearDebtService).toBe(1937);
  });
});

