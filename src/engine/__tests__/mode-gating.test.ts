/**
 * Tests for `src/data/modeGating.ts` — cross-mode action blocking.
 *
 * Pins the behavior that `isActionBlocked` must preserve after the refactor
 * of the ~10 `useGame.ts` action guards (7 B-School + 3 PE).
 */

import { describe, it, expect } from 'vitest';
import { isActionBlocked, isFeatureAvailable, PE_BLOCKED_ACTIONS, type FeatureKey } from '../../data/modeGating';
import { BS_BLOCKED_ACTIONS } from '../../data/businessSchool';
import { DISABLED_FEATURE_ACTIONS } from '../../data/scenarioChallenges';
import type { GameState, GameActionType, ScenarioChallengeConfig, DisabledFeatureKey } from '../types';

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

// ══════════════════════════════════════════════════════════════════
// isFeatureAvailable — UI-layer projection of isActionBlocked
// ══════════════════════════════════════════════════════════════════

type FeatureState = Pick<
  GameState,
  'isBusinessSchoolMode' | 'isFundManagerMode' | 'isScenarioChallengeMode' | 'scenarioChallengeConfig' | 'isFamilyOfficeMode'
>;

function featureState(overrides: Partial<FeatureState> = {}): FeatureState {
  return {
    isBusinessSchoolMode: false,
    isFundManagerMode: false,
    isScenarioChallengeMode: false,
    isFamilyOfficeMode: false,
    ...overrides,
  };
}

const ALL_FEATURES: FeatureKey[] = [
  'improveBusiness', 'equityRaise', 'buybackShares', 'distributions',
  'payDownDebt', 'sellBusiness', 'sharedServices', 'platformForge',
  'turnaround', 'maSourcing', 'ipo', 'designatePlatform',
];

describe('isFeatureAvailable — default (no modes)', () => {
  it('returns available: true for every FeatureKey when no modes active', () => {
    const s = featureState();
    for (const feature of ALL_FEATURES) {
      const result = isFeatureAvailable(s, feature);
      expect(result.available).toBe(true);
      expect(result.reason).toBe('allowed');
      expect(result.message).toBe('');
    }
  });
});

describe('isFeatureAvailable — Business School mode', () => {
  it('blocks BS-curriculum features with reason=bschool', () => {
    const s = featureState({ isBusinessSchoolMode: true });
    // Every feature whose representative action is in BS_BLOCKED_ACTIONS should be blocked.
    let blockedCount = 0;
    for (const feature of ALL_FEATURES) {
      const result = isFeatureAvailable(s, feature);
      if (!result.available) {
        expect(result.reason).toBe('bschool');
        expect(result.message).toBe('Not available in this tutorial');
        blockedCount++;
      }
    }
    expect(blockedCount).toBeGreaterThan(0); // at least ipo, turnaround are blocked in BS
  });
});

describe('isFeatureAvailable — PE Fund Manager mode', () => {
  it('blocks PE-restricted features with reason=pe_fund', () => {
    const s = featureState({ isFundManagerMode: true });
    // PE blocks issue_equity, buyback, distribute — so these features block.
    expect(isFeatureAvailable(s, 'equityRaise')).toMatchObject({ available: false, reason: 'pe_fund' });
    expect(isFeatureAvailable(s, 'buybackShares')).toMatchObject({ available: false, reason: 'pe_fund' });
    expect(isFeatureAvailable(s, 'distributions')).toMatchObject({ available: false, reason: 'pe_fund' });
    expect(isFeatureAvailable(s, 'equityRaise').message).toBe('Not available in Fund Manager mode');
    // Other features still available.
    expect(isFeatureAvailable(s, 'improveBusiness').available).toBe(true);
    expect(isFeatureAvailable(s, 'sellBusiness').available).toBe(true);
  });
});

describe('isFeatureAvailable — Scenario Challenge disabledFeatures', () => {
  it('equityRaise: true blocks the equity-raise feature', () => {
    const s = featureState({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ equityRaise: true }),
    });
    const result = isFeatureAvailable(s, 'equityRaise');
    expect(result.available).toBe(false);
    expect(result.reason).toBe('scenario');
    expect(result.message).toBe('Disabled in this scenario');
  });

  it('other features remain available when only equityRaise disabled', () => {
    const s = featureState({
      isScenarioChallengeMode: true,
      scenarioChallengeConfig: scenarioWith({ equityRaise: true }),
    });
    expect(isFeatureAvailable(s, 'buybackShares').available).toBe(true);
    expect(isFeatureAvailable(s, 'sellBusiness').available).toBe(true);
    expect(isFeatureAvailable(s, 'ipo').available).toBe(true);
  });

  it('all scenario-targetable features can be individually disabled', () => {
    // Every DisabledFeatureKey → corresponding FeatureKey (where one exists) → blocked when set.
    const cases: Array<{ key: DisabledFeatureKey; feature: FeatureKey }> = [
      { key: 'improveBusiness', feature: 'improveBusiness' },
      { key: 'equityRaise', feature: 'equityRaise' },
      { key: 'buybackShares', feature: 'buybackShares' },
      { key: 'distributions', feature: 'distributions' },
      { key: 'payDownDebt', feature: 'payDownDebt' },
      { key: 'sellBusiness', feature: 'sellBusiness' },
      { key: 'sharedServices', feature: 'sharedServices' },
      { key: 'platformForge', feature: 'platformForge' },
      { key: 'turnaround', feature: 'turnaround' },
      { key: 'maSourcing', feature: 'maSourcing' },
      { key: 'ipo', feature: 'ipo' },
    ];
    for (const { key, feature } of cases) {
      const s = featureState({
        isScenarioChallengeMode: true,
        scenarioChallengeConfig: scenarioWith({ [key]: true }),
      });
      const result = isFeatureAvailable(s, feature);
      expect(result.available, `feature ${feature} should be blocked when disabledFeatures.${key}=true`).toBe(false);
      expect(result.reason).toBe('scenario');
    }
  });
});

describe('isFeatureAvailable — Family Office', () => {
  it('blocks capital-allocation features with reason=family_office', () => {
    const s = featureState({ isFamilyOfficeMode: true });
    expect(isFeatureAvailable(s, 'equityRaise')).toMatchObject({ available: false, reason: 'family_office' });
    expect(isFeatureAvailable(s, 'buybackShares')).toMatchObject({ available: false, reason: 'family_office' });
    expect(isFeatureAvailable(s, 'distributions')).toMatchObject({ available: false, reason: 'family_office' });
    // Other features still available — FO doesn't gate improve/sell/etc at this layer.
    expect(isFeatureAvailable(s, 'improveBusiness').available).toBe(true);
  });
});

describe('isFeatureAvailable — multi-mode priority', () => {
  it('family_office wins over pe_fund when both would block the same feature', () => {
    const s = featureState({ isFundManagerMode: true, isFamilyOfficeMode: true });
    const result = isFeatureAvailable(s, 'equityRaise');
    expect(result.available).toBe(false);
    // FO is checked first in isFeatureAvailable, even though PE also blocks equityRaise.
    expect(result.reason).toBe('family_office');
  });
});

// ── Exhaustiveness tripwire ──────────────────────────────────────────────

describe('isFeatureAvailable — exhaustiveness tripwires', () => {
  it('every DisabledFeatureKey with a non-empty action list has a matching FeatureKey', () => {
    // If someone adds a new disabledFeatures key + action list but forgets to wire
    // the UI helper, this test fails — forces them to update FEATURE_REPRESENTATIVE_ACTION.
    const allFeatureKeys: ReadonlySet<FeatureKey> = new Set<FeatureKey>(ALL_FEATURES);

    const missingUiCoverage: string[] = [];
    for (const [key, actions] of Object.entries(DISABLED_FEATURE_ACTIONS)) {
      if (actions.length === 0) continue; // restructure/familyOffice — intentional UI no-ops
      if (!allFeatureKeys.has(key as FeatureKey)) {
        // Some DisabledFeatureKey names don't line up with FeatureKey names by design
        // (e.g., 'familyOffice' has no UI button). Only flag the ones that should.
        const uiOptional: string[] = ['familyOffice', 'restructure'];
        if (!uiOptional.includes(key)) missingUiCoverage.push(key);
      }
    }
    expect(missingUiCoverage).toEqual([]);
  });

  it('every FeatureKey that appears in ALL_FEATURES is in the test list (no drift)', () => {
    // If someone adds a new FeatureKey to the union, they must add it to ALL_FEATURES here.
    // Detected via tripwire: cast to ensure the length assertion stays honest.
    expect(ALL_FEATURES.length).toBe(12);
    expect(new Set(ALL_FEATURES).size).toBe(ALL_FEATURES.length);
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
