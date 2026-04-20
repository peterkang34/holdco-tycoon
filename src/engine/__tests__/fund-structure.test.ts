/**
 * Tests for `src/data/fundStructure.ts` helpers + PE parameterization parity.
 *
 * Two goals:
 *   1. Pin helper behavior (fallback chains, hurdle computation, default preset)
 *   2. Prove behavior preservation — traditional_pe preset values match the legacy
 *      PE_FUND_CONFIG constants at every read site so existing PE Fund Manager
 *      games are unchanged by the Step 1.5 refactor
 */

import { describe, it, expect } from 'vitest';
import {
  getCommittedCapital,
  getMgmtFeePercent,
  getAnnualMgmtFee,
  getHurdleRate,
  getHurdleReturn,
  getCarryRate,
  getForcedLiquidationDiscount,
  getForcedLiquidationYear,
  getDefaultFundStructure,
  type FundState,
} from '../../data/fundStructure';
import { PE_FUND_CONFIG } from '../../data/gameConfig';
import { FUND_STRUCTURE_PRESETS } from '../../data/scenarioChallenges';
import type { FundStructure } from '../types';

function state(overrides: Partial<FundState> = {}): FundState {
  return { maxRounds: 10, ...overrides };
}

// ── getDefaultFundStructure ────────────────────────────────────────────────

describe('getDefaultFundStructure', () => {
  it('returns the traditional_pe preset', () => {
    expect(getDefaultFundStructure()).toEqual(FUND_STRUCTURE_PRESETS.traditional_pe);
  });

  it('returns a fresh object (mutation-safe)', () => {
    const a = getDefaultFundStructure();
    const b = getDefaultFundStructure();
    a.carryRate = 0.99;
    expect(b.carryRate).toBe(0.20);
  });
});

// ── Fallback chains ───────────────────────────────────────────────────────

describe('getCommittedCapital — fallback chain', () => {
  it('prefers state.fundStructure.committedCapital when set', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.traditional_pe, committedCapital: 50_000 };
    expect(getCommittedCapital(state({ fundStructure: fs, fundSize: 999_999 }))).toBe(50_000);
  });

  it('falls back to state.fundSize when fundStructure missing', () => {
    expect(getCommittedCapital(state({ fundSize: 200_000 }))).toBe(200_000);
  });

  it('falls back to PE_FUND_CONFIG.fundSize when both missing', () => {
    expect(getCommittedCapital(state())).toBe(PE_FUND_CONFIG.fundSize);
  });
});

describe('getMgmtFeePercent — fallback chain', () => {
  it('prefers state.fundStructure.mgmtFeePercent', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.traditional_pe, mgmtFeePercent: 0.015 };
    expect(getMgmtFeePercent(state({ fundStructure: fs }))).toBe(0.015);
  });

  it('falls back to PE_FUND_CONFIG.managementFeeRate when unset', () => {
    expect(getMgmtFeePercent(state())).toBe(PE_FUND_CONFIG.managementFeeRate);
  });
});

describe('getAnnualMgmtFee — computed', () => {
  it('returns committedCapital × mgmtFeePercent', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.traditional_pe, committedCapital: 50_000, mgmtFeePercent: 0.025 };
    expect(getAnnualMgmtFee(state({ fundStructure: fs }))).toBe(1_250); // 50_000 * 0.025
  });

  it('matches legacy PE_FUND_CONFIG.annualManagementFee for traditional_pe default', () => {
    expect(getAnnualMgmtFee(state({ fundStructure: getDefaultFundStructure() }))).toBe(PE_FUND_CONFIG.annualManagementFee);
  });

  it('defaults compute 100_000 × 0.02 = 2_000 when fundStructure missing (PE_FUND_CONFIG fallback)', () => {
    expect(getAnnualMgmtFee(state())).toBe(2_000);
  });
});

describe('getHurdleRate — fallback chain', () => {
  it('prefers state.fundStructure.hurdleRate', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.high_performer };
    expect(getHurdleRate(state({ fundStructure: fs }))).toBe(0.10);
  });

  it('falls back to PE_FUND_CONFIG.hurdleRate (0.08)', () => {
    expect(getHurdleRate(state())).toBe(0.08);
  });
});

describe('getHurdleReturn — computed from committedCapital × (1 + hurdleRate)^years', () => {
  it('matches legacy PE_FUND_CONFIG.hurdleReturn (100_000 × 1.08^10 ≈ 215_892) for traditional_pe + 10yr', () => {
    const fs: FundStructure = getDefaultFundStructure();
    expect(getHurdleReturn(state({ fundStructure: fs, maxRounds: 10 }))).toBe(PE_FUND_CONFIG.hurdleReturn);
  });

  it('scales with different maxRounds (5yr)', () => {
    const fs: FundStructure = getDefaultFundStructure();
    const expected = Math.round(100_000 * Math.pow(1.08, 5));
    expect(getHurdleReturn(state({ fundStructure: fs, maxRounds: 5 }))).toBe(expected);
  });

  it('scales with different hurdle rate (10%)', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.high_performer };
    const expected = Math.round(100_000 * Math.pow(1.10, 10));
    expect(getHurdleReturn(state({ fundStructure: fs, maxRounds: 10 }))).toBe(expected);
  });

  it('accepts explicit years override', () => {
    const fs: FundStructure = getDefaultFundStructure();
    expect(getHurdleReturn(state({ fundStructure: fs, maxRounds: 20 }), 5)).toBe(Math.round(100_000 * Math.pow(1.08, 5)));
  });

  it('scales with custom committedCapital (search_fund $10M)', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.search_fund };
    const expected = Math.round(10_000 * Math.pow(1.08, 10));
    expect(getHurdleReturn(state({ fundStructure: fs, maxRounds: 10 }))).toBe(expected);
  });
});

describe('getCarryRate — fallback chain', () => {
  it('prefers state.fundStructure.carryRate', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.search_fund }; // 25% carry
    expect(getCarryRate(state({ fundStructure: fs }))).toBe(0.25);
  });

  it('falls back to PE_FUND_CONFIG.carryRate (0.20)', () => {
    expect(getCarryRate(state())).toBe(PE_FUND_CONFIG.carryRate);
  });
});

describe('getForcedLiquidationDiscount — fallback chain', () => {
  it('prefers state.fundStructure.forcedLiquidationDiscount', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.harsh_liquidation }; // 0.60
    expect(getForcedLiquidationDiscount(state({ fundStructure: fs }))).toBe(0.60);
  });

  it('falls back to PE_FUND_CONFIG.forcedLiquidationDiscount (0.90)', () => {
    expect(getForcedLiquidationDiscount(state())).toBe(PE_FUND_CONFIG.forcedLiquidationDiscount);
  });
});

describe('getForcedLiquidationYear — fallback chain', () => {
  it('prefers state.fundStructure.forcedLiquidationYear', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.traditional_pe, forcedLiquidationYear: 7 };
    expect(getForcedLiquidationYear(state({ fundStructure: fs, maxRounds: 10 }))).toBe(7);
  });

  it('falls back to state.maxRounds when forcedLiquidationYear unset', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.traditional_pe };
    delete (fs as Partial<FundStructure>).forcedLiquidationYear;
    expect(getForcedLiquidationYear(state({ fundStructure: fs, maxRounds: 15 }))).toBe(15);
  });

  it('final fallback to 10 when neither is set', () => {
    expect(getForcedLiquidationYear({ } as FundState)).toBe(10);
  });
});

// ── PE parameterization parity ────────────────────────────────────────────
// These tests prove that the traditional_pe preset produces byte-identical values
// to the legacy PE_FUND_CONFIG constants. If any of these fail, the Step 1.5
// refactor has introduced a drift — investigate before shipping.

describe('PE parameterization parity — traditional_pe preset matches PE_FUND_CONFIG', () => {
  const fs = getDefaultFundStructure();
  const peState = state({ fundStructure: fs, maxRounds: 10 });

  it('committedCapital matches PE_FUND_CONFIG.fundSize', () => {
    expect(getCommittedCapital(peState)).toBe(PE_FUND_CONFIG.fundSize);
  });

  it('mgmtFeePercent matches PE_FUND_CONFIG.managementFeeRate', () => {
    expect(getMgmtFeePercent(peState)).toBe(PE_FUND_CONFIG.managementFeeRate);
  });

  it('annualMgmtFee matches PE_FUND_CONFIG.annualManagementFee', () => {
    expect(getAnnualMgmtFee(peState)).toBe(PE_FUND_CONFIG.annualManagementFee);
  });

  it('hurdleRate matches PE_FUND_CONFIG.hurdleRate', () => {
    expect(getHurdleRate(peState)).toBe(PE_FUND_CONFIG.hurdleRate);
  });

  it('hurdleReturn (computed) matches PE_FUND_CONFIG.hurdleReturn (precomputed)', () => {
    expect(getHurdleReturn(peState)).toBe(PE_FUND_CONFIG.hurdleReturn);
  });

  it('carryRate matches PE_FUND_CONFIG.carryRate', () => {
    expect(getCarryRate(peState)).toBe(PE_FUND_CONFIG.carryRate);
  });

  it('forcedLiquidationDiscount matches PE_FUND_CONFIG.forcedLiquidationDiscount', () => {
    expect(getForcedLiquidationDiscount(peState)).toBe(PE_FUND_CONFIG.forcedLiquidationDiscount);
  });
});

// ── Migration parity (M2) ────────────────────────────────────────────────
// The v42→v43 migration inlines the traditional_pe shape as a literal (migration
// files avoid non-migration imports). This test is the drift tripwire — if the
// preset changes, this fails in the file that owns the source of truth, not
// buried in migrations.test.ts.

describe('migration v42→v43 literal matches FUND_STRUCTURE_PRESETS.traditional_pe', () => {
  it('inlined migration shape is byte-identical to the preset', () => {
    // Shape hardcoded in src/hooks/migrations.ts migrateV42ToV43
    const migrationLiteral = {
      committedCapital: 100_000,
      mgmtFeePercent: 0.02,
      hurdleRate: 0.08,
      carryRate: 0.20,
      forcedLiquidationYear: 10,
      forcedLiquidationDiscount: 0.90,
    };
    expect(migrationLiteral).toEqual(FUND_STRUCTURE_PRESETS.traditional_pe);
  });
});

// ── Scenario override parity ──────────────────────────────────────────────

describe('Scenario override parity', () => {
  it('search_fund preset produces 25% carry instead of 20%', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.search_fund };
    expect(getCarryRate(state({ fundStructure: fs }))).toBe(0.25);
    // Same state under default would still report 0.20 — confirms override is active
    expect(getCarryRate(state({ fundStructure: FUND_STRUCTURE_PRESETS.traditional_pe }))).toBe(0.20);
  });

  it('harsh_liquidation preset produces 40% haircut on forced exits', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.harsh_liquidation };
    expect(getForcedLiquidationDiscount(state({ fundStructure: fs }))).toBe(0.60);
  });

  it('high_performer preset produces 10% hurdle + 25% carry', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.high_performer };
    const s = state({ fundStructure: fs });
    expect(getHurdleRate(s)).toBe(0.10);
    expect(getCarryRate(s)).toBe(0.25);
  });

  it('mega_fund preset produces $500M committed capital', () => {
    const fs: FundStructure = { ...FUND_STRUCTURE_PRESETS.mega_fund };
    expect(getCommittedCapital(state({ fundStructure: fs }))).toBe(500_000);
  });
});
