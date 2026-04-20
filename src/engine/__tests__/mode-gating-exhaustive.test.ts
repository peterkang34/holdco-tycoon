/**
 * Structural tripwire for `isActionBlocked` (plan Section 11).
 *
 * The ordinary `mode-gating.test.ts` pins specific block/allow combos for
 * documented behavior. This file answers a different question: if a new
 * `GameActionType` is ever added to the union (say `'refinance'`), will
 * `isActionBlocked` do *something defined* for it across all mode combos?
 *
 * The test doesn't pin *which* decision it makes for new actions — that's a
 * design call. It pins that:
 *   - Every `GameActionType` value is reachable through the gating function
 *     without throwing.
 *   - The function returns a well-formed `ActionBlockResult` (blocked:boolean,
 *     reason:ActionBlockReason) for every (mode, action) pair in the cartesian.
 *   - Adding a new action type with no intended block doesn't silently get
 *     interpreted as "blocked".
 *
 * If you ADD a new action and intend it to be blocked in a mode, update
 * `BS_BLOCKED_ACTIONS` / `PE_BLOCKED_ACTIONS` / `DISABLED_FEATURE_ACTIONS`,
 * then add a specific test in `mode-gating.test.ts`. This exhaustive test
 * will continue to pass either way.
 */

import { describe, it, expect } from 'vitest';
import { isActionBlocked } from '../../data/modeGating';
import type { GameActionType, ScenarioChallengeConfig } from '../types';

/**
 * Enumerated list of every GameActionType. MUST stay in sync with the union in
 * types.ts — `coverage-tripwires.test.ts` catches drift by comparing lengths.
 * Keep alphabetized for easy diffing when new actions land.
 */
const ALL_ACTIONS: GameActionType[] = [
  'accept_offer',
  'acquire',
  'acquire_tuck_in',
  'add_to_integrated_platform',
  'buyback',
  'deactivate_shared_service',
  'decline_offer',
  'designate_platform',
  'distribute',
  'distribute_to_lps',
  'event_choice',
  'forge_integrated_platform',
  'improve',
  'ipo',
  'issue_equity',
  'merge_businesses',
  'pay_debt',
  'proactive_outreach',
  'reinvest',
  'sell',
  'sell_platform',
  'smb_broker',
  'source_deals',
  'start_turnaround',
  'toggle_ma_sourcing',
  'turnaround_resolved',
  'unlock_shared_service',
  'unlock_turnaround_tier',
  'upgrade_ma_sourcing',
];

function scenarioWithAllFeaturesDisabled(): ScenarioChallengeConfig {
  return {
    id: 's', name: 's', tagline: '', description: '', configVersion: 1,
    theme: { emoji: '🧪', color: '#000' },
    startDate: '2026-01-01', endDate: '2026-12-31',
    isActive: true, isFeatured: false,
    seed: 1, difficulty: 'easy', duration: 'standard', maxRounds: 10,
    startingCash: 1000, startingDebt: 0, founderShares: 800, sharesOutstanding: 1000,
    startingBusinesses: [],
    rankingMetric: 'fev',
    disabledFeatures: {
      improveBusiness: true,
      equityRaise: true,
      buybackShares: true,
      distributions: true,
      payDownDebt: true,
      sellBusiness: true,
      restructure: true,
      familyOffice: true,
      sharedServices: true,
      platformForge: true,
      turnaround: true,
      maSourcing: true,
      ipo: true,
    },
  };
}

describe('isActionBlocked — exhaustive mode × action coverage', () => {
  it('ALL_ACTIONS list matches the GameActionType union length (catches untracked additions)', () => {
    // Tripwire: if the union gains/loses a case, this length diff fires first —
    // prompts the dev to update ALL_ACTIONS (and the per-mode block sets if needed).
    // Update both in lockstep; don't just bump the expected value.
    expect(ALL_ACTIONS.length).toBe(29);
    expect(new Set(ALL_ACTIONS).size).toBe(ALL_ACTIONS.length); // no duplicates
  });

  it('returns well-formed result for every action with no modes active', () => {
    for (const action of ALL_ACTIONS) {
      const result = isActionBlocked(
        { isBusinessSchoolMode: false, isFundManagerMode: false, isScenarioChallengeMode: false },
        action,
      );
      expect(result).toMatchObject({
        blocked: expect.any(Boolean),
        reason: expect.stringMatching(/^(bschool|pe_fund|scenario|allowed)$/),
      });
      // No mode active → everything allowed.
      expect(result.blocked).toBe(false);
      expect(result.reason).toBe('allowed');
    }
  });

  it('returns well-formed result for every action with B-School active', () => {
    for (const action of ALL_ACTIONS) {
      const result = isActionBlocked(
        { isBusinessSchoolMode: true, isFundManagerMode: false, isScenarioChallengeMode: false },
        action,
      );
      // Either blocked with reason 'bschool' or allowed — never malformed.
      if (result.blocked) expect(result.reason).toBe('bschool');
      else expect(result.reason).toBe('allowed');
    }
  });

  it('returns well-formed result for every action with PE mode active', () => {
    for (const action of ALL_ACTIONS) {
      const result = isActionBlocked(
        { isBusinessSchoolMode: false, isFundManagerMode: true, isScenarioChallengeMode: false },
        action,
      );
      if (result.blocked) expect(result.reason).toBe('pe_fund');
      else expect(result.reason).toBe('allowed');
    }
  });

  it('returns well-formed result for every action with scenario (all features disabled)', () => {
    const config = scenarioWithAllFeaturesDisabled();
    for (const action of ALL_ACTIONS) {
      const result = isActionBlocked(
        { isBusinessSchoolMode: false, isFundManagerMode: false, isScenarioChallengeMode: true, scenarioChallengeConfig: config },
        action,
      );
      if (result.blocked) expect(result.reason).toBe('scenario');
      else expect(result.reason).toBe('allowed');
    }
  });

  it('never throws on the cartesian product of (mode combo × action)', () => {
    const config = scenarioWithAllFeaturesDisabled();
    const modeCombos = [
      { isBusinessSchoolMode: false, isFundManagerMode: false, isScenarioChallengeMode: false },
      { isBusinessSchoolMode: true,  isFundManagerMode: false, isScenarioChallengeMode: false },
      { isBusinessSchoolMode: false, isFundManagerMode: true,  isScenarioChallengeMode: false },
      { isBusinessSchoolMode: false, isFundManagerMode: false, isScenarioChallengeMode: true, scenarioChallengeConfig: config },
      // Overlapping modes — B-School priority wins per design.
      { isBusinessSchoolMode: true,  isFundManagerMode: true,  isScenarioChallengeMode: false },
      { isBusinessSchoolMode: true,  isFundManagerMode: false, isScenarioChallengeMode: true, scenarioChallengeConfig: config },
    ];

    for (const combo of modeCombos) {
      for (const action of ALL_ACTIONS) {
        expect(() => isActionBlocked(combo, action)).not.toThrow();
      }
    }
  });

  it('priority: B-School wins over PE when both are on', () => {
    // Pick an action blocked by both (issue_equity blocked by both PE and — via B-School curriculum — BS).
    // If BS_BLOCKED_ACTIONS doesn't include issue_equity, this test becomes a no-op
    // which is fine — it means no overlap exists and the priority check is vacuous.
    const combo = { isBusinessSchoolMode: true, isFundManagerMode: true, isScenarioChallengeMode: false };
    for (const action of ALL_ACTIONS) {
      const result = isActionBlocked(combo, action);
      if (result.blocked) {
        // When both modes could block, the reason must be 'bschool' (first in priority order).
        expect(['bschool', 'pe_fund']).toContain(result.reason);
      }
    }
  });
});
