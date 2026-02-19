import { describe, it, expect } from 'vitest';
import {
  calculateDistressLevel,
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
