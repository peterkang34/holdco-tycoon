/**
 * Tests for `src/data/scenarioChallenges.ts` — validation, presets, factory, migration.
 */

import { describe, it, expect } from 'vitest';
import {
  validateScenarioConfig,
  createBusinessFromConfig,
  migrateScenarioConfig,
  FUND_STRUCTURE_PRESETS,
  DISABLED_FEATURE_ACTIONS,
  CURRENT_SCENARIO_CONFIG_VERSION,
  MIN_MAX_ROUNDS,
  MAX_MAX_ROUNDS,
} from '../../data/scenarioChallenges';
import type { ScenarioChallengeConfig, StartingBusinessConfig, FundStructure } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeValidHoldcoConfig(overrides: Partial<ScenarioChallengeConfig> = {}): ScenarioChallengeConfig {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    tagline: 'A test scenario',
    description: 'Longer description of the test scenario',
    configVersion: CURRENT_SCENARIO_CONFIG_VERSION,
    theme: { emoji: '🧪', color: '#F59E0B' },
    startDate: '2026-04-01T00:00:00Z',
    endDate: '2026-05-01T00:00:00Z',
    isActive: true,
    isFeatured: false,
    seed: 12345,
    difficulty: 'easy',
    duration: 'standard',
    maxRounds: 10,
    startingCash: 5000,
    startingDebt: 0,
    founderShares: 800,
    sharesOutstanding: 1000,
    startingBusinesses: [],
    rankingMetric: 'fev',
    ...overrides,
  };
}

function makeValidPEConfig(overrides: Partial<ScenarioChallengeConfig> = {}): ScenarioChallengeConfig {
  return makeValidHoldcoConfig({
    fundStructure: { ...FUND_STRUCTURE_PRESETS.traditional_pe },
    startingCash: 0,
    rankingMetric: 'moic',
    ...overrides,
  });
}

// ── Presets ───────────────────────────────────────────────────────────────

describe('FUND_STRUCTURE_PRESETS', () => {
  it('exports the 5 named presets', () => {
    expect(Object.keys(FUND_STRUCTURE_PRESETS).sort()).toEqual([
      'harsh_liquidation',
      'high_performer',
      'mega_fund',
      'search_fund',
      'traditional_pe',
    ]);
  });

  it('traditional_pe matches PE_FUND_CONFIG defaults (100M, 2%, 8%, 20%, Y10, 0.90)', () => {
    expect(FUND_STRUCTURE_PRESETS.traditional_pe).toEqual({
      committedCapital: 100_000,
      mgmtFeePercent: 0.02,
      hurdleRate: 0.08,
      carryRate: 0.20,
      forcedLiquidationYear: 10,
      forcedLiquidationDiscount: 0.90,
    });
  });

  it('harsh_liquidation has 60% haircut (0.60) — the tightened-exit preset', () => {
    expect(FUND_STRUCTURE_PRESETS.harsh_liquidation.forcedLiquidationDiscount).toBe(0.60);
  });

  it('search_fund has $10M capital and 25% carry (founder-style economics)', () => {
    expect(FUND_STRUCTURE_PRESETS.search_fund.committedCapital).toBe(10_000);
    expect(FUND_STRUCTURE_PRESETS.search_fund.carryRate).toBe(0.25);
  });

  it('mega_fund has $500M capital', () => {
    expect(FUND_STRUCTURE_PRESETS.mega_fund.committedCapital).toBe(500_000);
  });

  it('high_performer has lower fee (1.5%) and higher hurdle (10%) and carry (25%)', () => {
    expect(FUND_STRUCTURE_PRESETS.high_performer.mgmtFeePercent).toBe(0.015);
    expect(FUND_STRUCTURE_PRESETS.high_performer.hurdleRate).toBe(0.10);
    expect(FUND_STRUCTURE_PRESETS.high_performer.carryRate).toBe(0.25);
  });
});

// ── DISABLED_FEATURE_ACTIONS mapping ──────────────────────────────────────

describe('DISABLED_FEATURE_ACTIONS mapping', () => {
  it('maps each disabledFeatures key to concrete GameActionType values', () => {
    expect(DISABLED_FEATURE_ACTIONS.improveBusiness).toEqual(['improve']);
    expect(DISABLED_FEATURE_ACTIONS.buybackShares).toEqual(['buyback']);
    expect(DISABLED_FEATURE_ACTIONS.ipo).toEqual(['ipo']);
  });

  it('sellBusiness blocks both sell and accept_offer', () => {
    expect(DISABLED_FEATURE_ACTIONS.sellBusiness).toEqual(['sell', 'accept_offer']);
  });

  it('platformForge blocks all 4 platform actions', () => {
    expect(DISABLED_FEATURE_ACTIONS.platformForge).toEqual([
      'forge_integrated_platform',
      'add_to_integrated_platform',
      'sell_platform',
      'designate_platform',
    ]);
  });

  it('maSourcing blocks all 5 M&A sourcing actions', () => {
    expect(DISABLED_FEATURE_ACTIONS.maSourcing).toEqual([
      'source_deals',
      'upgrade_ma_sourcing',
      'toggle_ma_sourcing',
      'proactive_outreach',
      'smb_broker',
    ]);
  });

  it('restructure and familyOffice map to empty arrays (enforced elsewhere)', () => {
    expect(DISABLED_FEATURE_ACTIONS.restructure).toEqual([]);
    expect(DISABLED_FEATURE_ACTIONS.familyOffice).toEqual([]);
  });

  it('covers all 13 disabledFeatures keys', () => {
    expect(Object.keys(DISABLED_FEATURE_ACTIONS).sort()).toEqual([
      'buybackShares', 'distributions', 'equityRaise', 'familyOffice', 'improveBusiness',
      'ipo', 'maSourcing', 'payDownDebt', 'platformForge', 'restructure',
      'sellBusiness', 'sharedServices', 'turnaround',
    ]);
  });
});

// ── Validation — identity & schedule ──────────────────────────────────────

describe('validateScenarioConfig — identity & schedule', () => {
  it('accepts a minimal valid holdco config', () => {
    const { errors, warnings } = validateScenarioConfig(makeValidHoldcoConfig());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('rejects empty id', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ id: '' }));
    expect(errors.some(e => e.includes('id'))).toBe(true);
  });

  it('rejects empty name', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ name: '' }));
    expect(errors.some(e => e.includes('name'))).toBe(true);
  });

  it('rejects name over 80 characters', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ name: 'x'.repeat(81) }));
    expect(errors.some(e => e.includes('80'))).toBe(true);
  });

  it('rejects invalid startDate', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ startDate: 'not-a-date' }));
    expect(errors.some(e => e.includes('startDate'))).toBe(true);
  });

  it('rejects endDate before startDate', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startDate: '2026-05-01T00:00:00Z',
      endDate: '2026-04-01T00:00:00Z',
    }));
    expect(errors.some(e => e.includes('endDate must be after'))).toBe(true);
  });

  it('rejects configVersion mismatch as an error (must be migrated upstream)', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ configVersion: 99 }));
    expect(errors.some(e => e.includes('configVersion'))).toBe(true);
  });
});

// ── Validation — game parameters ──────────────────────────────────────────

describe('validateScenarioConfig — game parameters', () => {
  it(`rejects maxRounds below ${MIN_MAX_ROUNDS}`, () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ maxRounds: 2 }));
    expect(errors.some(e => e.includes('maxRounds'))).toBe(true);
  });

  it(`rejects maxRounds above ${MAX_MAX_ROUNDS}`, () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ maxRounds: 31 }));
    expect(errors.some(e => e.includes('maxRounds'))).toBe(true);
  });

  it(`accepts exact boundary values maxRounds=${MIN_MAX_ROUNDS}, ${MAX_MAX_ROUNDS}`, () => {
    expect(validateScenarioConfig(makeValidHoldcoConfig({ maxRounds: MIN_MAX_ROUNDS })).errors).toEqual([]);
    expect(validateScenarioConfig(makeValidHoldcoConfig({ maxRounds: MAX_MAX_ROUNDS })).errors).toEqual([]);
  });

  it('rejects non-integer maxRounds', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ maxRounds: 10.5 }));
    expect(errors.some(e => e.includes('maxRounds'))).toBe(true);
  });

  it('rejects negative startingCash', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ startingCash: -100 }));
    expect(errors.some(e => e.includes('startingCash'))).toBe(true);
  });

  it('rejects founderShares > sharesOutstanding', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ founderShares: 1200, sharesOutstanding: 1000 }));
    expect(errors.some(e => e.includes('founderShares'))).toBe(true);
  });

  it('rejects sharesOutstanding = 0', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ founderShares: 0, sharesOutstanding: 0 }));
    expect(errors.some(e => e.includes('founderShares'))).toBe(true);
  });

  it('accepts startingInterestRate in [0, 0.25]', () => {
    expect(validateScenarioConfig(makeValidHoldcoConfig({ startingInterestRate: 0 })).errors).toEqual([]);
    expect(validateScenarioConfig(makeValidHoldcoConfig({ startingInterestRate: 0.25 })).errors).toEqual([]);
  });

  it('rejects startingInterestRate > 0.25', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ startingInterestRate: 0.30 }));
    expect(errors.some(e => e.includes('startingInterestRate'))).toBe(true);
  });
});

// ── Validation — starting portfolio ───────────────────────────────────────

describe('validateScenarioConfig — starting portfolio', () => {
  const validBiz: StartingBusinessConfig = {
    name: 'Test Biz',
    sectorId: 'saas',
    ebitda: 1500,
    multiple: 5,
    quality: 3,
  };

  it('accepts empty portfolio (capital-only start)', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ startingBusinesses: [] }));
    expect(errors).toEqual([]);
  });

  it('accepts single valid business', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ startingBusinesses: [validBiz] }));
    expect(errors).toEqual([]);
  });

  it('rejects business with empty name', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...validBiz, name: '' }],
    }));
    expect(errors.some(e => e.includes('name'))).toBe(true);
  });

  it('rejects business with unknown sectorId', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...validBiz, sectorId: 'unicorn' as any }],
    }));
    expect(errors.some(e => e.includes('sectorId'))).toBe(true);
  });

  it('rejects business with subType not valid for its sector', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...validBiz, sectorId: 'saas', subType: 'Digital Agency' }],
    }));
    expect(errors.some(e => e.includes('subType'))).toBe(true);
  });

  it('rejects quality outside [1, 5]', () => {
    expect(validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...validBiz, quality: 0 as any }],
    })).errors.some(e => e.includes('quality'))).toBe(true);
    expect(validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...validBiz, quality: 6 as any }],
    })).errors.some(e => e.includes('quality'))).toBe(true);
  });

  it('rejects non-positive ebitda', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...validBiz, ebitda: 0 }],
    }));
    expect(errors.some(e => e.includes('ebitda'))).toBe(true);
  });

  it('rejects non-positive multiple', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...validBiz, multiple: 0 }],
    }));
    expect(errors.some(e => e.includes('multiple'))).toBe(true);
  });
});

// ── Validation — sector restrictions ──────────────────────────────────────

describe('validateScenarioConfig — sector restrictions', () => {
  it('accepts valid allowedSectors', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectors: ['saas', 'healthcare'],
    }));
    expect(errors).toEqual([]);
  });

  it('rejects invalid sector in allowedSectors', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectors: ['saas', 'unicorn' as any],
    }));
    expect(errors.some(e => e.includes('unicorn'))).toBe(true);
  });

  it('warns on single-sector restriction without curated deals', () => {
    const { warnings } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectors: ['saas'],
    }));
    expect(warnings.some(w => w.includes('Single-sector restriction'))).toBe(true);
  });

  it('no warning when single-sector has curated deals for all rounds', () => {
    const curatedDeals: ScenarioChallengeConfig['curatedDeals'] = {};
    for (let r = 1; r <= 10; r++) {
      curatedDeals[r] = [{ name: `Deal ${r}`, sectorId: 'saas', ebitda: 2000, multiple: 5, quality: 3 }];
    }
    const { warnings } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectors: ['saas'],
      curatedDeals,
    }));
    expect(warnings.some(w => w.includes('Single-sector restriction'))).toBe(false);
  });

  it('rejects allowedSubTypes not valid for any allowed sector', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectors: ['saas'],
      allowedSubTypes: ['Digital Agency'], // agency sub-type, not saas
    }));
    expect(errors.some(e => e.includes('Digital Agency'))).toBe(true);
  });
});

// ── Validation — round-based sector restrictions (Feature A) ──────────────

describe('validateScenarioConfig — allowedSectorsByRound', () => {
  it('accepts a valid sparse round-based map', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectorsByRound: { 1: ['agency'], 5: ['saas'], 9: ['healthcare'] },
    }));
    expect(errors).toEqual([]);
  });

  it('rejects out-of-range round keys', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      maxRounds: 10,
      allowedSectorsByRound: { 0: ['agency'], 11: ['saas'] },
    }));
    expect(errors.some(e => e.includes("'0'"))).toBe(true);
    expect(errors.some(e => e.includes("'11'"))).toBe(true);
  });

  it('rejects invalid sector ids in by-round map', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allowedSectorsByRound: { 1: ['nonsense' as any] },
    }));
    expect(errors.some(e => e.includes("invalid sector 'nonsense'"))).toBe(true);
  });

  it('rejects empty array at a round (would halt deal generation)', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectorsByRound: { 3: [] },
    }));
    expect(errors.some(e => e.includes('empty'))).toBe(true);
  });

  it('warns on gaps between explicit rounds (inheritance is intentional but worth flagging)', () => {
    const { warnings } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectorsByRound: { 1: ['agency'], 5: ['saas'] },
    }));
    expect(warnings.some(w => w.includes('gap between round 1 and 5'))).toBe(true);
  });

  it('warns when allowedSectorsByRound[1] duplicates static allowedSectors', () => {
    const { warnings } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectors: ['agency'],
      allowedSectorsByRound: { 1: ['agency'] },
    }));
    expect(warnings.some(w => w.includes('duplicates static allowedSectors'))).toBe(true);
  });
});

// ── Validation — triggers (Feature B) ─────────────────────────────────────

describe('validateScenarioConfig — triggers', () => {
  it('accepts a simple metric-threshold trigger with addAllowedSectors action', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      triggers: [{
        id: 'industrial-unlock',
        when: { metric: 'portfolioEbitda', op: '>=', value: 10000 },
        actions: [{ type: 'addAllowedSectors', sectors: ['industrial'] }],
        narrative: { title: 'Industrial Unlocked', detail: 'Scale attracts industrial sellers.' },
      }],
    }));
    expect(errors).toEqual([]);
  });

  it('accepts a composite all/any trigger', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      triggers: [{
        id: 'ipo-unlock',
        when: { all: [
          { metric: 'activeBusinessCount', op: '>=', value: 5 },
          { metric: 'portfolioEbitda', op: '>=', value: 25000 },
        ]},
        actions: [{ type: 'enableFeature', feature: 'ipo' }],
        narrative: { title: 'IPO Unlocked', detail: 'Scale qualifies for public markets.' },
      }],
      disabledFeatures: { ipo: true },
    }));
    expect(errors).toEqual([]);
  });

  it('rejects duplicate trigger ids', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      triggers: [
        { id: 'dupe', when: { metric: 'cash', op: '>=', value: 10000 }, actions: [{ type: 'addAllowedSectors', sectors: ['saas'] }], narrative: { title: 'A', detail: 'A' } },
        { id: 'dupe', when: { metric: 'cash', op: '>=', value: 20000 }, actions: [{ type: 'addAllowedSectors', sectors: ['industrial'] }], narrative: { title: 'B', detail: 'B' } },
      ],
    }));
    expect(errors.some(e => e.includes('duplicated'))).toBe(true);
  });

  it('rejects empty actions array', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      triggers: [{ id: 't1', when: { metric: 'cash', op: '>=', value: 10000 }, actions: [], narrative: { title: 'A', detail: 'A' } }],
    }));
    expect(errors.some(e => e.includes('non-empty array'))).toBe(true);
  });

  it('rejects invalid sector in addAllowedSectors action', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      triggers: [{
        id: 't1',
        when: { metric: 'cash', op: '>=', value: 10000 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actions: [{ type: 'addAllowedSectors', sectors: ['nonsense' as any] }],
        narrative: { title: 'A', detail: 'A' },
      }],
    }));
    expect(errors.some(e => e.includes('invalid sector'))).toBe(true);
  });

  it("rejects enableFeature pointing at a feature that's not in disabledFeatures", () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      // ipo is NOT disabled, so enabling it is a no-op error.
      triggers: [{
        id: 't1',
        when: { metric: 'cash', op: '>=', value: 10000 },
        actions: [{ type: 'enableFeature', feature: 'ipo' }],
        narrative: { title: 'A', detail: 'A' },
      }],
    }));
    expect(errors.some(e => e.includes('not in disabledFeatures'))).toBe(true);
  });

  it('rejects nesting deeper than 2 levels', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      triggers: [{
        id: 't1',
        when: { all: [
          { any: [
            { all: [
              { metric: 'cash', op: '>=', value: 1000 },
            ]},
          ]},
        ]},
        actions: [{ type: 'addAllowedSectors', sectors: ['saas'] }],
        narrative: { title: 'A', detail: 'A' },
      }],
    }));
    expect(errors.some(e => e.includes('nests deeper than 2 levels'))).toBe(true);
  });

  it("rejects unreachable trigger (round > maxRounds)", () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      maxRounds: 10,
      triggers: [{
        id: 't1',
        when: { metric: 'round', op: '>=', value: 99 },
        actions: [{ type: 'addAllowedSectors', sectors: ['saas'] }],
        narrative: { title: 'A', detail: 'A' },
      }],
    }));
    expect(errors.some(e => e.includes('can never fire'))).toBe(true);
  });

  it('rejects narrative title > 60 chars / detail > 200 chars', () => {
    const longTitle = 'A'.repeat(70);
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      triggers: [{
        id: 't1',
        when: { metric: 'cash', op: '>=', value: 10000 },
        actions: [{ type: 'addAllowedSectors', sectors: ['saas'] }],
        narrative: { title: longTitle, detail: 'short' },
      }],
    }));
    expect(errors.some(e => e.includes('≤60 chars'))).toBe(true);
  });

  it('warns when addAllowedSectors lists sectors already in static allowedSectors (no-op)', () => {
    const { warnings } = validateScenarioConfig(makeValidHoldcoConfig({
      allowedSectors: ['agency'],
      triggers: [{
        id: 't1',
        when: { metric: 'cash', op: '>=', value: 10000 },
        actions: [{ type: 'addAllowedSectors', sectors: ['agency'] }],
        narrative: { title: 'A', detail: 'A' },
      }],
    }));
    expect(warnings.some(w => w.includes('no-op when fired'))).toBe(true);
  });

  it('warns when scenario has > 10 triggers (opacity)', () => {
    const triggers = Array.from({ length: 11 }, (_, i) => ({
      id: `t${i}`,
      when: { metric: 'cash' as const, op: '>=' as const, value: (i + 1) * 1000 },
      actions: [{ type: 'addAllowedSectors' as const, sectors: ['saas' as const] }],
      narrative: { title: `A${i}`, detail: 'A' },
    }));
    const { warnings } = validateScenarioConfig(makeValidHoldcoConfig({ triggers }));
    expect(warnings.some(w => w.includes('11 triggers'))).toBe(true);
  });
});

// ── Validation — ranking metric & PE rules ────────────────────────────────

describe('validateScenarioConfig — ranking metric & PE', () => {
  it('non-PE scenarios must use rankingMetric=fev', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ rankingMetric: 'moic' }));
    expect(errors.some(e => e.includes('fev'))).toBe(true);
  });

  it('PE scenarios cannot use rankingMetric=fev', () => {
    const { errors } = validateScenarioConfig(makeValidPEConfig({ rankingMetric: 'fev' }));
    expect(errors.some(e => e.includes('fev'))).toBe(true);
  });

  it('accepts PE scenarios with moic, irr, gpCarry, cashOnCash', () => {
    for (const metric of ['moic', 'irr', 'gpCarry', 'cashOnCash'] as const) {
      const { errors } = validateScenarioConfig(makeValidPEConfig({ rankingMetric: metric }));
      expect(errors).toEqual([]);
    }
  });

  it('rejects rankingMetric not in allowed set', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({ rankingMetric: 'bogus' as any }));
    expect(errors.some(e => e.includes('rankingMetric'))).toBe(true);
  });
});

// ── Validation — fund structure bounds ────────────────────────────────────

describe('validateScenarioConfig — fund structure bounds', () => {
  it('accepts traditional_pe preset', () => {
    const { errors } = validateScenarioConfig(makeValidPEConfig());
    expect(errors).toEqual([]);
  });

  it('accepts all 5 presets', () => {
    for (const preset of Object.values(FUND_STRUCTURE_PRESETS)) {
      const { errors } = validateScenarioConfig(makeValidPEConfig({
        fundStructure: { ...preset },
        maxRounds: Math.max(preset.forcedLiquidationYear ?? 10, 10), // ensure maxRounds ≥ forcedLiquidationYear
      }));
      expect(errors).toEqual([]);
    }
  });

  it('rejects committedCapital below $1M', () => {
    const { errors } = validateScenarioConfig(makeValidPEConfig({
      fundStructure: { ...FUND_STRUCTURE_PRESETS.traditional_pe, committedCapital: 500 },
    }));
    expect(errors.some(e => e.includes('committedCapital'))).toBe(true);
  });

  it('rejects mgmtFeePercent above 5%', () => {
    const { errors } = validateScenarioConfig(makeValidPEConfig({
      fundStructure: { ...FUND_STRUCTURE_PRESETS.traditional_pe, mgmtFeePercent: 0.06 },
    }));
    expect(errors.some(e => e.includes('mgmtFeePercent'))).toBe(true);
  });

  it('rejects carryRate above 50%', () => {
    const { errors } = validateScenarioConfig(makeValidPEConfig({
      fundStructure: { ...FUND_STRUCTURE_PRESETS.traditional_pe, carryRate: 0.51 },
    }));
    expect(errors.some(e => e.includes('carryRate'))).toBe(true);
  });

  it('rejects forcedLiquidationDiscount below 0.50', () => {
    const { errors } = validateScenarioConfig(makeValidPEConfig({
      fundStructure: { ...FUND_STRUCTURE_PRESETS.traditional_pe, forcedLiquidationDiscount: 0.49 },
    }));
    expect(errors.some(e => e.includes('forcedLiquidationDiscount'))).toBe(true);
  });

  it('accepts forcedLiquidationDiscount boundary 0.50 and 1.00', () => {
    const fsLow: FundStructure = { ...FUND_STRUCTURE_PRESETS.traditional_pe, forcedLiquidationDiscount: 0.50 };
    const fsHigh: FundStructure = { ...FUND_STRUCTURE_PRESETS.traditional_pe, forcedLiquidationDiscount: 1.00 };
    expect(validateScenarioConfig(makeValidPEConfig({ fundStructure: fsLow })).errors).toEqual([]);
    expect(validateScenarioConfig(makeValidPEConfig({ fundStructure: fsHigh })).errors).toEqual([]);
  });

  it('rejects forcedLiquidationYear > maxRounds', () => {
    const { errors } = validateScenarioConfig(makeValidPEConfig({
      maxRounds: 8,
      fundStructure: { ...FUND_STRUCTURE_PRESETS.traditional_pe, forcedLiquidationYear: 10 },
    }));
    expect(errors.some(e => e.includes('forcedLiquidationYear'))).toBe(true);
  });

  it('warns when startingCash > 0 with fundStructure (ignored at runtime)', () => {
    const { warnings } = validateScenarioConfig(makeValidPEConfig({ startingCash: 5000 }));
    expect(warnings.some(w => w.includes('startingCash'))).toBe(true);
  });

  it('warns when startingDebt > 0 with fundStructure', () => {
    const { warnings } = validateScenarioConfig(makeValidPEConfig({ startingDebt: 1000 }));
    expect(warnings.some(w => w.includes('debt-free'))).toBe(true);
  });
});

// ── Validation — solvability (softlock detection) ─────────────────────────

describe('validateScenarioConfig — solvability', () => {
  it('rejects zero-cash + zero-businesses + no round-1 deals (unplayable)', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingCash: 0,
      startingBusinesses: [],
    }));
    expect(errors.some(e => e.includes('Softlock'))).toBe(true);
  });

  it('accepts zero-cash when round-1 curated deals exist', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingCash: 0,
      startingBusinesses: [],
      curatedDeals: {
        1: [{ name: 'Starter Deal', sectorId: 'saas', ebitda: 1000, multiple: 4, quality: 3 }],
      },
    }));
    expect(errors.some(e => e.includes('Softlock'))).toBe(false);
  });

  it('rejects distressed starts + all recovery disabled', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{
        name: 'Distressed', sectorId: 'saas', ebitda: 500, multiple: 3, quality: 1, status: 'distressed',
      }],
      disabledFeatures: {
        sellBusiness: true,
        improveBusiness: true,
        restructure: true,
        turnaround: true,
      },
    }));
    expect(errors.some(e => e.includes('bankruptcy'))).toBe(true);
  });

  it('accepts distressed starts when at least one recovery option remains', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{
        name: 'Distressed', sectorId: 'saas', ebitda: 500, multiple: 3, quality: 1, status: 'distressed',
      }],
      disabledFeatures: {
        sellBusiness: true,
        improveBusiness: true,
        restructure: true,
        // turnaround NOT disabled
      },
    }));
    expect(errors.some(e => e.includes('bankruptcy'))).toBe(false);
  });

  it('PE mode with fundStructure committed capital counts as starting cash for solvability', () => {
    const { errors } = validateScenarioConfig(makeValidPEConfig({
      startingCash: 0,
      startingBusinesses: [],
      // no curated deals — but $100M committed capital should satisfy solvability
    }));
    expect(errors.some(e => e.includes('Softlock'))).toBe(false);
  });
});

// ── Validation — curatedDeals & forcedEvents ──────────────────────────────

describe('validateScenarioConfig — curatedDeals', () => {
  const validDeal = { name: 'Deal', sectorId: 'saas' as const, ebitda: 2000, multiple: 5, quality: 3 as const };

  it('accepts valid curatedDeals', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      curatedDeals: { 1: [validDeal], 5: [validDeal] },
    }));
    expect(errors).toEqual([]);
  });

  it('rejects curatedDeals round outside [1, maxRounds]', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      maxRounds: 10,
      curatedDeals: { 11: [validDeal] },
    }));
    expect(errors.some(e => e.includes('curatedDeals round'))).toBe(true);
  });

  it('rejects curatedDeals with invalid sectorId', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      curatedDeals: { 1: [{ ...validDeal, sectorId: 'unicorn' as any }] },
    }));
    expect(errors.some(e => e.includes('sectorId'))).toBe(true);
  });

  it('rejects curatedDeals with subType not valid for sector', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      curatedDeals: { 1: [{ ...validDeal, subType: 'Digital Agency' }] }, // agency sub-type, not saas
    }));
    expect(errors.some(e => e.includes('subType'))).toBe(true);
  });

  it('rejects curatedDeals with ebitdaMargin at or outside (0, 1)', () => {
    const { errors: zeroErr } = validateScenarioConfig(makeValidHoldcoConfig({
      curatedDeals: { 1: [{ ...validDeal, ebitdaMargin: 0 }] },
    }));
    expect(zeroErr.some(e => e.includes('ebitdaMargin'))).toBe(true);
    const { errors: oneErr } = validateScenarioConfig(makeValidHoldcoConfig({
      curatedDeals: { 1: [{ ...validDeal, ebitdaMargin: 1.0 }] },
    }));
    expect(oneErr.some(e => e.includes('ebitdaMargin'))).toBe(true);
  });
});

describe('validateScenarioConfig — forcedEvents', () => {
  it('accepts valid forcedEvents with forceable EventType', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      forcedEvents: { 3: { type: 'global_recession' } },
    }));
    expect(errors).toEqual([]);
  });

  it('rejects forcedEvents round outside [1, maxRounds]', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      maxRounds: 10,
      forcedEvents: { 99: { type: 'global_recession' } },
    }));
    expect(errors.some(e => e.includes('forcedEvents round'))).toBe(true);
  });

  it('rejects forcedEvents missing type field', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      forcedEvents: { 1: {} as any },
    }));
    expect(errors.some(e => e.includes('type is required'))).toBe(true);
  });

  it('rejects non-forceable EventType (portfolio events need affectedBusinessId)', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      forcedEvents: { 1: { type: 'portfolio_star_joins' as any } },
    }));
    expect(errors.some(e => e.includes('not a forceable event type'))).toBe(true);
  });

  it('accepts sector_consolidation_boom with consolidationSectorId', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      forcedEvents: { 3: { type: 'sector_consolidation_boom', consolidationSectorId: 'saas' } },
    }));
    expect(errors).toEqual([]);
  });

  it('rejects sector_consolidation_boom without consolidationSectorId', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      forcedEvents: { 3: { type: 'sector_consolidation_boom' } },
    }));
    expect(errors.some(e => e.includes('consolidationSectorId'))).toBe(true);
  });

  it('rejects sector_consolidation_boom with invalid consolidationSectorId', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      forcedEvents: { 3: { type: 'sector_consolidation_boom', consolidationSectorId: 'unicorn' as any } },
    }));
    expect(errors.some(e => e.includes('consolidationSectorId'))).toBe(true);
  });

  it('rejects forcedEvents customTitle over 200 chars', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      forcedEvents: { 1: { type: 'global_recession', customTitle: 'x'.repeat(201) } },
    }));
    expect(errors.some(e => e.includes('customTitle'))).toBe(true);
  });

  it('rejects forcedEvents customDescription over 2000 chars', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      forcedEvents: { 1: { type: 'global_recession', customDescription: 'x'.repeat(2001) } },
    }));
    expect(errors.some(e => e.includes('customDescription'))).toBe(true);
  });
});

describe('validateScenarioConfig — startingBusinesses ebitdaMargin bounds', () => {
  const base = { name: 'Biz', sectorId: 'saas' as const, ebitda: 1500, multiple: 5, quality: 3 as const };

  it('rejects ebitdaMargin <= 0', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...base, ebitdaMargin: 0 }],
    }));
    expect(errors.some(e => e.includes('ebitdaMargin'))).toBe(true);
  });

  it('rejects ebitdaMargin >= 1', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...base, ebitdaMargin: 1.0 }],
    }));
    expect(errors.some(e => e.includes('ebitdaMargin'))).toBe(true);
  });

  it('accepts ebitdaMargin in (0, 1)', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      startingBusinesses: [{ ...base, ebitdaMargin: 0.25 }],
    }));
    expect(errors).toEqual([]);
  });
});

// ── Validation — disabledFeatures keys ────────────────────────────────────

describe('validateScenarioConfig — disabledFeatures', () => {
  it('accepts valid disabledFeatures keys', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      disabledFeatures: { ipo: true, equityRaise: true, buybackShares: false },
    }));
    expect(errors).toEqual([]);
  });

  it('rejects unknown disabledFeatures key', () => {
    const { errors } = validateScenarioConfig(makeValidHoldcoConfig({
      disabledFeatures: { spaceTravel: true } as any,
    }));
    expect(errors.some(e => e.includes('spaceTravel'))).toBe(true);
  });
});

// ── createBusinessFromConfig ──────────────────────────────────────────────

describe('createBusinessFromConfig', () => {
  const override: StartingBusinessConfig = {
    name: 'Acme SaaS',
    sectorId: 'saas',
    ebitda: 2000,
    multiple: 6,
    quality: 4,
  };

  it('creates a valid Business with provided overrides', () => {
    const biz = createBusinessFromConfig(override, 'biz-1');
    expect(biz.id).toBe('biz-1');
    expect(biz.name).toBe('Acme SaaS');
    expect(biz.sectorId).toBe('saas');
    expect(biz.ebitda).toBe(2000);
    expect(biz.acquisitionMultiple).toBe(6);
    expect(biz.qualityRating).toBe(4);
    expect(biz.status).toBe('active');
  });

  it('derives revenue from ebitda / ebitdaMargin', () => {
    const biz = createBusinessFromConfig({ ...override, ebitdaMargin: 0.25 }, 'biz-2');
    expect(biz.revenue).toBe(8000); // 2000 / 0.25
  });

  it('uses sector default margin when ebitdaMargin omitted', () => {
    const biz = createBusinessFromConfig(override, 'biz-3');
    expect(biz.ebitdaMargin).toBeGreaterThan(0);
    expect(biz.ebitdaMargin).toBeLessThan(1);
  });

  it('defaults subType to sector.subTypes[0]', () => {
    const biz = createBusinessFromConfig(override, 'biz-4');
    // saas first subType — whatever it is, must match SECTORS.saas.subTypes[0]
    expect(biz.subType).toBeTruthy();
    expect(typeof biz.subType).toBe('string');
  });

  it('throws on unknown sectorId', () => {
    expect(() => createBusinessFromConfig({ ...override, sectorId: 'unicorn' as any }, 'biz-5')).toThrow();
  });

  it('acquisitionPrice = ebitda * multiple (rounded)', () => {
    const biz = createBusinessFromConfig(override, 'biz-6');
    expect(biz.acquisitionPrice).toBe(12_000); // 2000 * 6
  });

  it('maps operatorQuality and competitivePosition based on quality rating', () => {
    const lowQ = createBusinessFromConfig({ ...override, quality: 1 }, 'low');
    const midQ = createBusinessFromConfig({ ...override, quality: 3 }, 'mid');
    const highQ = createBusinessFromConfig({ ...override, quality: 5 }, 'high');
    expect(lowQ.dueDiligence.operatorQuality).toBe('weak');
    expect(midQ.dueDiligence.operatorQuality).toBe('moderate');
    expect(highQ.dueDiligence.operatorQuality).toBe('strong');
    expect(lowQ.dueDiligence.competitivePosition).toBe('commoditized');
    expect(highQ.dueDiligence.competitivePosition).toBe('leader');
  });

  // ── Phase 1 limitation: distressed status NOT propagated (Dara H3) ──
  // This test pins the current Phase 1 behavior: createBusinessFromConfig treats
  // `status: 'distressed'` as `status: 'active'` because BusinessStatus doesn't
  // include a terminal 'distressed' value. Step 2 (`startScenarioChallenge`) must
  // translate distress into engine state (covenantBreachRounds, requiresRestructuring,
  // degraded due-diligence). When Step 2 ships, this test will need to be updated
  // — intentional, so the engine side of distress doesn't get forgotten.
  it('Phase 1: status="distressed" is downgraded to "active" (Step 2 must propagate distress separately)', () => {
    const biz = createBusinessFromConfig({ ...override, status: 'distressed' }, 'distressed-biz');
    expect(biz.status).toBe('active');
    // Due-diligence signals should still reflect quality, not distress status — confirming
    // distress is NOT encoded via dueDiligence. Step 2 must inject distress elsewhere.
  });
});

// ── migrateScenarioConfig ─────────────────────────────────────────────────

describe('migrateScenarioConfig', () => {
  it('returns null for non-object input', () => {
    expect(migrateScenarioConfig(null)).toBeNull();
    expect(migrateScenarioConfig(undefined)).toBeNull();
    expect(migrateScenarioConfig('string')).toBeNull();
    expect(migrateScenarioConfig(123)).toBeNull();
  });

  it('returns null for future version we can\'t handle', () => {
    const future = { ...makeValidHoldcoConfig(), configVersion: CURRENT_SCENARIO_CONFIG_VERSION + 1 };
    expect(migrateScenarioConfig(future)).toBeNull();
  });

  it('migrates v0 (missing configVersion) to current version', () => {
    const stored = { ...makeValidHoldcoConfig() } as Partial<ScenarioChallengeConfig>;
    delete stored.configVersion;
    const migrated = migrateScenarioConfig(stored);
    expect(migrated).not.toBeNull();
    expect(migrated!.configVersion).toBe(CURRENT_SCENARIO_CONFIG_VERSION);
  });

  it('passes through a valid current-version config', () => {
    const valid = makeValidHoldcoConfig();
    const migrated = migrateScenarioConfig(valid);
    expect(migrated).toEqual(valid);
  });

  it('returns null if required fields are missing after migration', () => {
    const broken = { configVersion: 1, id: 'x' }; // missing name, seed, startingBusinesses, etc.
    expect(migrateScenarioConfig(broken)).toBeNull();
  });

  it('returns null when migrated config fails validation (e.g., invalid bounds)', () => {
    // maxRounds=2 (below MIN_MAX_ROUNDS=3) — passes type shape, fails validation
    const invalidBounds = { ...makeValidHoldcoConfig(), maxRounds: 2 };
    expect(migrateScenarioConfig(invalidBounds)).toBeNull();
  });

  it('returns null when migrated config has softlock (zero cash + zero businesses + no round-1 deals)', () => {
    const softlocked = { ...makeValidHoldcoConfig(), startingCash: 0, startingBusinesses: [] };
    expect(migrateScenarioConfig(softlocked)).toBeNull();
  });
});
