/**
 * Fallback Event Narratives Test Suite
 *
 * Validates that FALLBACK_EVENT_NARRATIVES in aiGeneration.ts
 * has correct, sentiment-matched entries for every EventType.
 */

import { describe, it, expect } from 'vitest';
import { FALLBACK_EVENT_NARRATIVES, getFallbackEventNarrative } from '../../services/aiGeneration';
import type { EventType } from '../types';

// Canonical list of all EventType values — must match the union in types.ts (line 314)
const ALL_EVENT_TYPES: EventType[] = [
  'global_bull_market',
  'global_recession',
  'global_interest_hike',
  'global_interest_cut',
  'global_inflation',
  'global_credit_tightening',
  'global_financial_crisis',
  'global_quiet',
  'portfolio_star_joins',
  'portfolio_talent_leaves',
  'portfolio_client_signs',
  'portfolio_client_churns',
  'portfolio_breakthrough',
  'portfolio_compliance',
  'portfolio_referral_deal',
  'portfolio_equity_demand',
  'portfolio_seller_note_renego',
  'mbo_proposal',
  'unsolicited_offer',
  'sector_event',
  'portfolio_key_man_risk',
  'portfolio_earnout_dispute',
  'portfolio_supplier_shift',
  'portfolio_seller_deception',
  'portfolio_working_capital_crunch',
  'sector_consolidation_boom',
];

// Positive events should have optimistic/upbeat narratives
const POSITIVE_EVENT_TYPES: EventType[] = [
  'global_bull_market',
  'global_interest_cut',
  'global_quiet',
  'portfolio_star_joins',
  'portfolio_client_signs',
  'portfolio_breakthrough',
  'portfolio_referral_deal',
  'sector_consolidation_boom',
];

// Words/phrases that should NOT appear in positive event narratives
const RECESSION_LANGUAGE = [
  'recession',
  'downturn',
  'tumbled',
  'slashed',
  'scrambling',
  'chill swept',
  'party was over',
  'crisis',
  'seized up',
  'panic',
  'buckled',
];

describe('FALLBACK_EVENT_NARRATIVES — key coverage', () => {
  it('has an entry for every EventType', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      expect(
        FALLBACK_EVENT_NARRATIVES,
        `Missing key: "${eventType}"`,
      ).toHaveProperty(eventType);
    }
  });

  it('has no extra keys beyond EventType values', () => {
    const narrativeKeys = Object.keys(FALLBACK_EVENT_NARRATIVES);
    for (const key of narrativeKeys) {
      expect(
        ALL_EVENT_TYPES as string[],
        `Extra key in FALLBACK_EVENT_NARRATIVES: "${key}"`,
      ).toContain(key);
    }
  });

  it('has exactly 26 entries (one per EventType)', () => {
    expect(Object.keys(FALLBACK_EVENT_NARRATIVES)).toHaveLength(ALL_EVENT_TYPES.length);
  });
});

describe('FALLBACK_EVENT_NARRATIVES — narrative quality', () => {
  it('every entry has at least 2 narrative variants', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      const narratives = FALLBACK_EVENT_NARRATIVES[eventType]!;
      expect(
        narratives.length,
        `"${eventType}" should have at least 2 variants, got ${narratives.length}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('every narrative is a non-empty string', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      const narratives = FALLBACK_EVENT_NARRATIVES[eventType]!;
      for (let i = 0; i < narratives.length; i++) {
        expect(
          typeof narratives[i],
          `${eventType}[${i}] is not a string`,
        ).toBe('string');
        expect(
          narratives[i].trim().length,
          `${eventType}[${i}] is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('no duplicate narratives within the same event type', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      const narratives = FALLBACK_EVENT_NARRATIVES[eventType]!;
      const unique = new Set(narratives);
      expect(
        unique.size,
        `"${eventType}" has duplicate narratives`,
      ).toBe(narratives.length);
    }
  });
});

describe('FALLBACK_EVENT_NARRATIVES — sentiment matching', () => {
  it('positive events do not contain recession/doom language', () => {
    for (const eventType of POSITIVE_EVENT_TYPES) {
      const narratives = FALLBACK_EVENT_NARRATIVES[eventType]!;
      for (const narrative of narratives) {
        const lower = narrative.toLowerCase();
        for (const badPhrase of RECESSION_LANGUAGE) {
          expect(
            lower.includes(badPhrase),
            `Positive event "${eventType}" contains recession language "${badPhrase}" in: "${narrative}"`,
          ).toBe(false);
        }
      }
    }
  });
});

describe('getFallbackEventNarrative', () => {
  it('returns a string for every EventType', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      const result = getFallbackEventNarrative(eventType);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('returns neutral text for unknown event types', () => {
    const result = getFallbackEventNarrative('totally_unknown_event');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should NOT contain recession-specific language (old bug)
    const lower = result.toLowerCase();
    for (const badPhrase of RECESSION_LANGUAGE) {
      expect(
        lower.includes(badPhrase),
        `Unknown event fallback contains recession language "${badPhrase}": "${result}"`,
      ).toBe(false);
    }
  });

  it('returns a value from the correct narrative pool for known types', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      const result = getFallbackEventNarrative(eventType);
      expect(
        FALLBACK_EVENT_NARRATIVES[eventType],
        `Result for "${eventType}" not found in its narrative pool`,
      ).toContain(result);
    }
  });
});
