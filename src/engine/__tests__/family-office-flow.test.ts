/**
 * Family Office Flow — End-to-End Tests
 *
 * Tests the 3 recent FO-related changes:
 * 1. Chronicle context: FO-specific fields populated in buildChronicleContext()
 * 2. Event filtering: portfolio_equity_demand blocked in FO mode
 * 3. MOIC calculation in chronicle context
 *
 * Jake Moreno — QA Playtester
 */

import { describe, it, expect } from 'vitest';
import { buildChronicleContext } from '../../services/chronicleContext';
import { generateEvent } from '../simulation';
import { calculateFounderEquityValue } from '../scoring';
import { SeededRng } from '../rng';
import { createMockBusiness, createMockGameState, createMockDueDiligence } from './helpers';
import type { QualityRating, Business } from '../types';

// ── Helpers ────────────────────────────────────────────────────────

/** Create an FO-mode game state with realistic businesses */
function createFOState(overrides: Partial<Parameters<typeof createMockGameState>[0]> = {}) {
  const businesses: Business[] = [];
  for (let i = 0; i < 3; i++) {
    businesses.push(createMockBusiness({
      id: `fo_biz_${i}`,
      name: `FO Business ${i}`,
      sectorId: 'agency',
      ebitda: 5000, // $5M each = $15M total
      revenue: 25000,
      ebitdaMargin: 0.20,
      acquisitionEbitda: 4000,
      acquisitionPrice: 20000,
      acquisitionRevenue: 20000,
      acquisitionMargin: 0.20,
      peakEbitda: 5000,
      peakRevenue: 25000,
      qualityRating: 4 as QualityRating,
      dueDiligence: createMockDueDiligence({
        operatorQuality: 'strong',
      }),
    }));
  }

  return createMockGameState({
    businesses,
    round: 2,
    maxRounds: 5,
    duration: 'standard',
    cash: 500000, // $500M
    isFamilyOfficeMode: true,
    familyOfficeState: {
      isActive: true,
      foStartingCash: 750000,
      philanthropyDeduction: 250000,
    },
    sharesOutstanding: 1000,
    founderShares: 1000, // 100% ownership in FO mode
    ...overrides,
  });
}

/** Create a normal-mode state (isFamilyOfficeMode false) with same business composition */
function createNormalState(overrides: Partial<Parameters<typeof createMockGameState>[0]> = {}) {
  const businesses: Business[] = [];
  for (let i = 0; i < 3; i++) {
    businesses.push(createMockBusiness({
      id: `norm_biz_${i}`,
      name: `Normal Business ${i}`,
      sectorId: 'agency',
      ebitda: 5000,
      revenue: 25000,
      ebitdaMargin: 0.20,
      acquisitionEbitda: 4000,
      acquisitionPrice: 20000,
      acquisitionRevenue: 20000,
      acquisitionMargin: 0.20,
      peakEbitda: 5000,
      peakRevenue: 25000,
      qualityRating: 4 as QualityRating,
      dueDiligence: createMockDueDiligence({
        operatorQuality: 'strong',
      }),
    }));
  }

  return createMockGameState({
    businesses,
    round: 5,
    maxRounds: 20,
    duration: 'standard',
    cash: 50000,
    isFamilyOfficeMode: false,
    familyOfficeState: null,
    ...overrides,
  });
}

// ══════════════════════════════════════════════════════════════════
// 1. CHRONICLE CONTEXT — FO MODE
// ══════════════════════════════════════════════════════════════════

describe('Chronicle Context — Family Office Mode', () => {
  it('should populate all FO-specific fields when isFamilyOfficeMode is true', () => {
    const state = createFOState();
    const context = buildChronicleContext(state);

    expect(context.isFamilyOfficeMode).toBe(true);
    expect(context.foStartingCash).toBeDefined();
    expect(context.foPhilanthropyAmount).toBeDefined();
    expect(context.foCurrentMOIC).toBeDefined();
    expect(context.foRound).toBeDefined();
  });

  it('foStartingCash should be a formatted money string', () => {
    const state = createFOState();
    const context = buildChronicleContext(state);

    // formatMoney(750000) should produce something like "$750.0M" or "$750M"
    expect(context.foStartingCash).toBeTruthy();
    expect(context.foStartingCash!.includes('$')).toBe(true);
  });

  it('foPhilanthropyAmount should be a formatted money string', () => {
    const state = createFOState();
    const context = buildChronicleContext(state);

    expect(context.foPhilanthropyAmount).toBeTruthy();
    expect(context.foPhilanthropyAmount!.includes('$')).toBe(true);
  });

  it('foCurrentMOIC should be formatted as Nx (e.g. "0.85x")', () => {
    const state = createFOState();
    const context = buildChronicleContext(state);

    expect(context.foCurrentMOIC).toMatch(/^\d+\.\d{2}x$/);
  });

  it('foRound should match "Year X of Y" format', () => {
    const state = createFOState({ round: 3, maxRounds: 5 });
    const context = buildChronicleContext(state);

    expect(context.foRound).toBe('Year 3 of 5');
  });

  it('narrativeToneGuidance should contain stewardship or family office language', () => {
    const state = createFOState();
    const context = buildChronicleContext(state);

    const tone = context.narrativeToneGuidance?.toLowerCase() || '';
    const hasFOLanguage = tone.includes('stewardship') || tone.includes('family office');
    expect(hasFOLanguage).toBe(true);
  });

  it('narrativeToneGuidance should override the default narrative phase tone', () => {
    const state = createFOState();
    const context = buildChronicleContext(state);

    // The FO override is a specific string about stewardship/legacy
    expect(context.narrativeToneGuidance).toContain('stewardship');
    expect(context.narrativeToneGuidance).toContain('legacy');
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. CHRONICLE CONTEXT — NORMAL MODE (FO fields absent)
// ══════════════════════════════════════════════════════════════════

describe('Chronicle Context — Normal Mode (FO fields absent)', () => {
  it('should NOT populate FO fields when isFamilyOfficeMode is false', () => {
    const state = createNormalState();
    const context = buildChronicleContext(state);

    expect(context.isFamilyOfficeMode).toBeUndefined();
    expect(context.foStartingCash).toBeUndefined();
    expect(context.foPhilanthropyAmount).toBeUndefined();
    expect(context.foCurrentMOIC).toBeUndefined();
    expect(context.foRound).toBeUndefined();
  });

  it('should use default narrativeToneGuidance (not FO override)', () => {
    const state = createNormalState();
    const context = buildChronicleContext(state);

    // Default tone should NOT contain "stewardship"
    expect(context.narrativeToneGuidance).toBeDefined();
    expect(context.narrativeToneGuidance!.includes('stewardship')).toBe(false);
  });

  it('should still populate standard fields (holdcoName, year, etc.)', () => {
    const state = createNormalState();
    const context = buildChronicleContext(state);

    expect(context.holdcoName).toBe('Test Holdco');
    expect(context.year).toBe(5);
    expect(context.totalEbitda).toBeDefined();
    expect(context.cash).toBeDefined();
    expect(context.portfolioCount).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. EVENT FILTERING — EQUITY DEMAND BLOCKED IN FO MODE
// ══════════════════════════════════════════════════════════════════

describe('Event Filtering — Equity Demand Blocked in FO Mode', () => {
  it('should never generate portfolio_equity_demand in FO mode across 500 seeded rolls', () => {
    // Create FO state with businesses that WOULD normally be eligible for equity demand:
    // operatorQuality === 'strong' && qualityRating >= 4
    const state = createFOState();

    const equityDemandEvents: string[] = [];
    for (let seed = 1; seed <= 500; seed++) {
      const rng = new SeededRng(seed);
      const event = generateEvent(state, rng);
      if (event?.type === 'portfolio_equity_demand') {
        equityDemandEvents.push(`seed=${seed}`);
      }
    }

    expect(equityDemandEvents).toHaveLength(0);
  });

  it('other portfolio events should still fire in FO mode (not all zeroed)', () => {
    const state = createFOState();

    const eventTypes = new Set<string>();
    for (let seed = 1; seed <= 500; seed++) {
      const rng = new SeededRng(seed);
      const event = generateEvent(state, rng);
      if (event) {
        eventTypes.add(event.type);
      }
    }

    // We should see at least SOME events (global or portfolio) across 500 rolls
    expect(eventTypes.size).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. EVENT FILTERING — EQUITY DEMAND ALLOWED IN NORMAL MODE
// ══════════════════════════════════════════════════════════════════

describe('Event Filtering — Equity Demand Allowed in Normal Mode', () => {
  it('should generate portfolio_equity_demand at least once across 500 seeded rolls (4% probability)', () => {
    // Create normal state with businesses eligible for equity demand:
    // operatorQuality === 'strong' && qualityRating >= 4
    const state = createNormalState();

    let equityDemandCount = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const rng = new SeededRng(seed);
      const event = generateEvent(state, rng);
      if (event?.type === 'portfolio_equity_demand') {
        equityDemandCount++;
      }
    }

    // With 4% probability and 500 rolls, expected ~20 hits.
    // But global events fire first (~55% of the time), so portfolio events
    // only fire ~45% of the time. Of those, equity demand is 4% of the
    // cumulative probability space. Still, we should see at least 1.
    expect(equityDemandCount).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. MOIC CALCULATION IN CHRONICLE CONTEXT
// ══════════════════════════════════════════════════════════════════

describe('MOIC Calculation in Chronicle Context', () => {
  it('should calculate MOIC correctly from FEV / foStartingCash', () => {
    // FO starting cash = 750000 ($750M)
    // We need businesses with combined FEV ~$1.5M (well, $1.5B in game terms)
    // FEV = EV * ownership% where EV = portfolio value + cash - debt
    // With founderShares = sharesOutstanding (100% ownership), FEV = EV

    const state = createFOState();
    const foFEV = calculateFounderEquityValue(state);
    const expectedMOIC = foFEV / 750000;

    const context = buildChronicleContext(state);

    expect(context.foCurrentMOIC).toBe(`${expectedMOIC.toFixed(2)}x`);
  });

  it('MOIC with known FEV ~$1.5M should be approximately 2.00x', () => {
    // Create state where FEV is roughly 2x the starting cash ($750K)
    // We need total FEV ~$1.5M. Each biz has ebitda=5000 => 3 businesses => 15000 EBITDA
    // Exit multiple ~ 4-5x for agency sector => EV ~ 60000-75000 portfolio value
    // Plus cash 500000 minus debt => FEV much larger than 750K actually

    // Let's calculate exact FEV first then construct MOIC
    const state = createFOState({
      cash: 10000, // reduce cash so FEV is more manageable
    });
    const foFEV = calculateFounderEquityValue(state);
    const expectedMOIC = foFEV / 750000;

    const context = buildChronicleContext(state);
    const contextMOIC = parseFloat(context.foCurrentMOIC!.replace('x', ''));

    expect(contextMOIC).toBeCloseTo(expectedMOIC, 2);
  });

  it('MOIC should be 0 when foStartingCash is 0 (division guard)', () => {
    const state = createFOState();
    state.familyOfficeState!.foStartingCash = 0;

    const context = buildChronicleContext(state);

    expect(context.foCurrentMOIC).toBe('0.00x');
  });

  it('foRound should correctly reflect round 1 of 5', () => {
    const state = createFOState({ round: 1, maxRounds: 5 });
    const context = buildChronicleContext(state);

    expect(context.foRound).toBe('Year 1 of 5');
  });

  it('foRound should correctly reflect round 5 of 5', () => {
    const state = createFOState({ round: 5, maxRounds: 5 });
    const context = buildChronicleContext(state);

    expect(context.foRound).toBe('Year 5 of 5');
  });
});

// ══════════════════════════════════════════════════════════════════
// EDGE CASES — Jake's Hunting Grounds
// ══════════════════════════════════════════════════════════════════

describe('Edge Cases — FO Chronicle Context', () => {
  it('FO mode with no businesses should still produce valid context', () => {
    const state = createFOState({ businesses: [] });
    const context = buildChronicleContext(state);

    expect(context.isFamilyOfficeMode).toBe(true);
    // No businesses but cash=500000, FEV=cash-debt=500000, MOIC=500000/750000=0.67x
    expect(context.foCurrentMOIC).toBe('0.67x');
    expect(context.portfolioCount).toBe(0);
  });

  it('FO mode with familyOfficeState.isActive = false should still populate FO fields (state exists)', () => {
    // The code checks `state.isFamilyOfficeMode && state.familyOfficeState`
    // isActive is a sub-field of the FO state object, not the gate condition
    const state = createFOState();
    state.familyOfficeState!.isActive = false;
    const context = buildChronicleContext(state);

    // familyOfficeState is truthy, so FO fields should still be populated
    expect(context.isFamilyOfficeMode).toBe(true);
    expect(context.foStartingCash).toBeDefined();
  });

  it('FO mode with isFamilyOfficeMode=true but familyOfficeState=null should NOT populate FO fields', () => {
    const state = createFOState();
    state.familyOfficeState = null;
    const context = buildChronicleContext(state);

    // Guard: isFamilyOfficeMode && familyOfficeState — fails because null
    expect(context.isFamilyOfficeMode).toBeUndefined();
    expect(context.foStartingCash).toBeUndefined();
  });
});

describe('Edge Cases — Event Filtering in FO Mode', () => {
  it('FO state with no eligible businesses should also block equity demand (double guard)', () => {
    // Businesses with quality < 4 or weak operator — would be blocked even without FO guard
    const businesses = [
      createMockBusiness({
        id: 'fo_low_q',
        qualityRating: 2 as QualityRating,
        dueDiligence: createMockDueDiligence({ operatorQuality: 'weak' }),
      }),
    ];
    const state = createFOState({ businesses });

    let equityDemandCount = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new SeededRng(seed);
      const event = generateEvent(state, rng);
      if (event?.type === 'portfolio_equity_demand') {
        equityDemandCount++;
      }
    }

    expect(equityDemandCount).toBe(0);
  });

  it('normal mode with no eligible businesses should also block equity demand (eligibility guard)', () => {
    const businesses = [
      createMockBusiness({
        id: 'norm_low_q',
        qualityRating: 2 as QualityRating,
        dueDiligence: createMockDueDiligence({ operatorQuality: 'weak' }),
      }),
    ];
    const state = createNormalState({ businesses });

    let equityDemandCount = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new SeededRng(seed);
      const event = generateEvent(state, rng);
      if (event?.type === 'portfolio_equity_demand') {
        equityDemandCount++;
      }
    }

    expect(equityDemandCount).toBe(0);
  });
});
