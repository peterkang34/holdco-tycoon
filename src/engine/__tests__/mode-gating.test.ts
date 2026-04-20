/**
 * Tests for `src/data/modeGating.ts` — cross-mode action blocking.
 *
 * Pins the behavior that `isActionBlocked` must preserve after the refactor
 * of the ~10 `useGame.ts` action guards (7 B-School + 3 PE).
 */

import { describe, it, expect } from 'vitest';
import { isActionBlocked, PE_BLOCKED_ACTIONS } from '../../data/modeGating';
import { BS_BLOCKED_ACTIONS } from '../../data/businessSchool';
import type { GameState, GameActionType, ScenarioChallengeConfig } from '../types';

/** Minimal state slice — only fields isActionBlocked actually reads. */
type GateState = Pick<GameState, 'isBusinessSchoolMode' | 'isFundManagerMode' | 'isScenarioChallengeMode' | 'scenarioChallengeConfig'>;

function state(overrides: Partial<GateState> = {}): GateState {
  return { isBusinessSchoolMode: false, isFundManagerMode: false, isScenarioChallengeMode: false, ...overrides };
}

function scenarioWith(disabledFeatures: ScenarioChallengeConfig['disabledFeatures']): ScenarioChallengeConfig {
  return {
    id: 's', name: 's', tagline: '', description: '', configVersion: 1,
    theme: { emoji: '🧪', color: '#000' },
    startDate: '2026-01-01', endDate: '2026-12-31',
    isActive: true, isFeatured: false,
    seed: 1, difficulty: 'easy', duration: 'standard', maxRounds: 10,
    startingCash: 1000, startingDebt: 0, founderShares: 800, sharesOutstanding: 1000,
    startingBusinesses: [],
    rankingMetric: 'fev',
    disabledFeatures,
  };
}

// ── Default behavior ──────────────────────────────────────────────────────

describe('isActionBlocked — no modes active', () => {
  it('does not block any action when all modes are off', () => {
    const s = state();
    const allActions: GameActionType[] = [
      'acquire', 'acquire_tuck_in', 'merge_businesses', 'designate_platform',
      'reinvest', 'improve', 'buyback', 'distribute', 'sell', 'ipo',
      'forge_integrated_platform', 'start_turnaround',
    ];
    for (const action of allActions) {
      const result = isActionBlocked(s, action);
      expect(result.blocked).toBe(false);
      expect(result.reason).toBe('allowed');
    }
  });
});

// ── Business School mode ──────────────────────────────────────────────────

describe('isActionBlocked — Business School mode', () => {
  it('blocks all actions in BS_BLOCKED_ACTIONS', () => {
    const s = state({ isBusinessSchoolMode: true });
    for (const action of BS_BLOCKED_ACTIONS) {
      const result = isActionBlocked(s, action as GameActionType);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('bschool');
    }
  });

  it('allows non-blocked actions even in B-School mode', () => {
    const s = state({ isBusinessSchoolMode: true });
    const allowedActions: GameActionType[] = ['acquire', 'improve', 'pay_debt', 'sell'];
    for (const action of allowedActions) {
      const result = isActionBlocked(s, action);
      expect(result.blocked).toBe(false);
    }
  });

  it('matches every B-School guard site in useGame.ts', () => {
    const s = state({ isBusinessSchoolMode: true });
    // These are the 7 category-1 guards refactored in Step 1
    const refactoredSites: GameActionType[] = [
      'acquire_tuck_in',        // useGame.ts:2077
      'merge_businesses',       // useGame.ts:2408
      'designate_platform',     // useGame.ts:2670
      'buyback',                // useGame.ts:3114
      'ipo',                    // useGame.ts:4548
      'unlock_turnaround_tier', // useGame.ts:5834
      'start_turnaround',       // useGame.ts:5862
    ];
    for (const action of refactoredSites) {
      expect(isActionBlocked(s, action).blocked).toBe(true);
    }
  });
});

// ── PE Fund Manager mode ──────────────────────────────────────────────────

describe('isActionBlocked — PE Fund Manager mode', () => {
  it('blocks issue_equity, buyback, distribute', () => {
    const s = state({ isFundManagerMode: true });
    for (const action of ['issue_equity', 'buyback', 'distribute'] as GameActionType[]) {
      const result = isActionBlocked(s, action);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('pe_fund');
    }
  });

  it('PE_BLOCKED_ACTIONS has exactly 3 entries (matches PE guards in useGame.ts)', () => {
    expect(PE_BLOCKED_ACTIONS.size).toBe(3);
    expect(PE_BLOCKED_ACTIONS.has('issue_equity')).toBe(true);
    expect(PE_BLOCKED_ACTIONS.has('buyback')).toBe(true);
    expect(PE_BLOCKED_ACTIONS.has('distribute')).toBe(true);
  });

  it('allows acquisitions, IPO-path actions, turnarounds in PE mode', () => {
    const s = state({ isFundManagerMode: true });
    // PE mode allows acquisitions, turnarounds, platforms — not blocked
    const allowed: GameActionType[] = ['acquire', 'acquire_tuck_in', 'improve', 'start_turnaround', 'forge_integrated_platform'];
    for (const action of allowed) {
      expect(isActionBlocked(s, action).blocked).toBe(false);
    }
  });
});

// ── Scenario Challenge mode ───────────────────────────────────────────────

describe('isActionBlocked — Scenario Challenge mode', () => {
  it('blocks `improve` when disabledFeatures.improveBusiness is true', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ improveBusiness: true }),
    });
    expect(isActionBlocked(s, 'improve')).toEqual({ blocked: true, reason: 'scenario' });
  });

  it('blocks `issue_equity` when disabledFeatures.equityRaise is true', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ equityRaise: true }),
    });
    expect(isActionBlocked(s, 'issue_equity').blocked).toBe(true);
  });

  it('blocks multiple actions when sellBusiness is true (sell AND accept_offer)', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ sellBusiness: true }),
    });
    expect(isActionBlocked(s, 'sell').blocked).toBe(true);
    expect(isActionBlocked(s, 'accept_offer').blocked).toBe(true);
  });

  it('blocks all 4 platform actions when platformForge is true', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ platformForge: true }),
    });
    for (const action of ['forge_integrated_platform', 'add_to_integrated_platform', 'sell_platform', 'designate_platform'] as GameActionType[]) {
      expect(isActionBlocked(s, action).blocked).toBe(true);
    }
  });

  it('disabledFeatures: { key: false } does NOT block (explicit falsy)', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ improveBusiness: false }),
    });
    expect(isActionBlocked(s, 'improve').blocked).toBe(false);
  });

  it('scenario mode with no disabledFeatures set — all actions allowed', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({}),
    });
    expect(isActionBlocked(s, 'improve').blocked).toBe(false);
    expect(isActionBlocked(s, 'ipo').blocked).toBe(false);
  });

  it('scenario mode without config (edge case) — treated as no block', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: null,
    });
    expect(isActionBlocked(s, 'improve').blocked).toBe(false);
  });

  it('restructure and familyOffice in disabledFeatures do NOT map to actions (enforced elsewhere)', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ restructure: true, familyOffice: true }),
    });
    // No GameActionType is blocked by these keys — they're handled at the mode-transition / distress layer
    for (const action of ['acquire', 'sell', 'distribute', 'ipo'] as GameActionType[]) {
      expect(isActionBlocked(s, action).blocked).toBe(false);
    }
  });
});

// ── Mode coexistence ──────────────────────────────────────────────────────

describe('isActionBlocked — multi-mode priority', () => {
  it('B-School blocking takes precedence over PE (both flags set, B-School wins the reason)', () => {
    const s = state({ isBusinessSchoolMode: true, isFundManagerMode: true });
    // buyback is in both BS_BLOCKED_ACTIONS and PE_BLOCKED_ACTIONS
    const result = isActionBlocked(s, 'buyback');
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('bschool'); // B-School checked first
  });

  it('PE + Scenario: PE reason wins when both would block the same action', () => {
    const s = state({
      isFundManagerMode: true,
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ equityRaise: true }),
    });
    // issue_equity is blocked by PE (PE_BLOCKED_ACTIONS) AND scenario (equityRaise)
    const result = isActionBlocked(s, 'issue_equity');
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('pe_fund'); // PE checked before scenario
  });

  it('Scenario blocks an action that PE does not block', () => {
    const s = state({
      isFundManagerMode: true,
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ ipo: true }),
    });
    // ipo: NOT in PE_BLOCKED, IS in scenario disabledFeatures
    const result = isActionBlocked(s, 'ipo');
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('scenario');
  });
});

// ── FO out-of-scope invariant ─────────────────────────────────────────────
// These tests pin Dara H1/H2: Family Office is intentionally NOT covered by
// isActionBlocked. If someone expands the Pick<> or adds FO handling, they'll
// need to re-examine the design rather than drift into a fourth gating system.

describe('isActionBlocked — Family Office is out of scope', () => {
  it('FO state has no effect on isActionBlocked output — even when set to true', () => {
    // The type signature doesn't include isFamilyOfficeMode, but test via a
    // broader state cast to confirm the behavior is stable under extra fields.
    const fallbackState = {
      isBusinessSchoolMode: false,
      isFundManagerMode: false,
      isScenarioChallengeMode: false,
      isFamilyOfficeMode: true, // extra field — ignored
    } as unknown as GateState;
    for (const action of ['acquire', 'buyback', 'distribute', 'ipo', 'sell'] as GameActionType[]) {
      expect(isActionBlocked(fallbackState, action).blocked).toBe(false);
    }
  });

  it('buybackShares-style scenario: BS + FO both set → BS reason wins (FO enforced inline elsewhere)', () => {
    const s = {
      isBusinessSchoolMode: true,
      isFundManagerMode: false,
      isScenarioChallengeMode: false,
      isFamilyOfficeMode: true,
    } as unknown as GateState;
    // BS blocks buyback; FO would also block it via the inline useGame.ts guard.
    // isActionBlocked only sees BS (FO is out of scope), so reason='bschool'.
    expect(isActionBlocked(s, 'buyback')).toEqual({ blocked: true, reason: 'bschool' });
  });
});

// ── disabledFeatures block-nothing invariants (M4) ────────────────────────

/** Full GameActionType union — kept here so new additions force a conscious review. */
const ALL_GAME_ACTIONS: GameActionType[] = [
  'acquire', 'acquire_tuck_in', 'merge_businesses', 'designate_platform',
  'reinvest', 'improve', 'unlock_shared_service', 'deactivate_shared_service',
  'pay_debt', 'issue_equity', 'buyback', 'distribute', 'sell',
  'accept_offer', 'decline_offer', 'source_deals', 'upgrade_ma_sourcing',
  'toggle_ma_sourcing', 'proactive_outreach', 'forge_integrated_platform',
  'add_to_integrated_platform', 'sell_platform', 'unlock_turnaround_tier',
  'start_turnaround', 'turnaround_resolved', 'ipo', 'smb_broker',
  'distribute_to_lps', 'event_choice',
];

describe('isActionBlocked — restructure/familyOffice block zero actions', () => {
  it('disabledFeatures.restructure=true blocks zero actions across the full GameActionType union', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ restructure: true }),
    });
    for (const action of ALL_GAME_ACTIONS) {
      expect(isActionBlocked(s, action).blocked).toBe(false);
    }
  });

  it('disabledFeatures.familyOffice=true blocks zero actions across the full GameActionType union', () => {
    const s = state({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ familyOffice: true }),
    });
    for (const action of ALL_GAME_ACTIONS) {
      expect(isActionBlocked(s, action).blocked).toBe(false);
    }
  });

  it('returns exact { blocked: false, reason: "allowed" } shape for allowed actions', () => {
    const s = state();
    expect(isActionBlocked(s, 'acquire')).toEqual({ blocked: false, reason: 'allowed' });
  });
});
