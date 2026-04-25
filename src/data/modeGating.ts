/**
 * Mode Gating — single authority for action-blocking across all game modes.
 *
 * Resolves Dara's H3 finding from the scenario-challenges review: before this
 * module, B-School, PE Fund Manager, and Scenario Challenge each had their own
 * scattered `if (isXMode) return` guards. That invited drift when feature toggles
 * interacted across modes.
 *
 * This module unifies the "can this action run" decision:
 *   - `isActionBlocked(state, action)` — the sole authority
 *   - Internally consults B-School, PE, and Scenario block sets
 *   - Returns `{ blocked, reason }` so callers can surface telemetry / UX
 *
 * Categories 2 and 3 of mode-specific logic (checklist marking, mode-specific
 * alternative paths) stay separate — they are NOT "is blocked" decisions.
 */

import type { GameState, GameActionType } from '../engine/types';
import { BS_BLOCKED_ACTIONS } from './businessSchool';
import { DISABLED_FEATURE_ACTIONS } from './scenarioChallenges';
import { resolveDisabledFeatures } from '../engine/scenarioRules';

/**
 * Actions blocked by PE Fund Manager mode.
 *
 * Derived from the existing `if (state.isFundManagerMode) return` guards in
 * `useGame.ts` (lines 3032, 3116, 3193 as of Step 1). The `emergencyEquityRaise`
 * guard at line 4405 has no `GameActionType` and remains an inline guard.
 */
export const PE_BLOCKED_ACTIONS: ReadonlySet<GameActionType> = new Set<GameActionType>([
  'issue_equity',      // Fund size fixed; GP can't demand more capital
  'buyback',           // No public shares in fund mode
  'distribute',        // Founder distributions replaced by LP distributions (DPI)
]);

/**
 * Reason string distinguishes which mode rejected the action. Useful for
 * telemetry, UX copy, and debugging. `'allowed'` is returned as the default
 * `reason` when `blocked: false`.
 */
export type ActionBlockReason = 'bschool' | 'pe_fund' | 'scenario' | 'allowed';

export interface ActionBlockResult {
  blocked: boolean;
  reason: ActionBlockReason;
}

/**
 * Check whether the given action is blocked by any active game mode.
 *
 * Priority (first blocker wins — they should never disagree, but explicit order):
 *   1. Business School mode
 *   2. PE Fund Manager mode
 *   3. Scenario Challenge mode (via `disabledFeatures`)
 *
 * **Family Office is intentionally out of scope.** FO is a mode *transition* (the
 * game switches to FO-mode screens and mechanics), not a per-action gate. Inline
 * `if (state.isFamilyOfficeMode) return;` guards remain in `useGame.ts` for the
 * FO-specific blocks. If you add `isFamilyOfficeMode` to this `Pick<>` later,
 * the test at `mode-gating.test.ts` ('FO state is ignored by isActionBlocked')
 * will fail — on purpose, so you re-think the design.
 */
export function isActionBlocked(
  state:
    & Pick<GameState, 'isBusinessSchoolMode' | 'isFundManagerMode' | 'isScenarioChallengeMode' | 'scenarioChallengeConfig'>
    & Partial<Pick<GameState, 'round' | 'triggeredTriggerIds'>>,
  action: GameActionType,
): ActionBlockResult {
  if (state.isBusinessSchoolMode && BS_BLOCKED_ACTIONS.has(action)) {
    return { blocked: true, reason: 'bschool' };
  }
  if (state.isFundManagerMode && PE_BLOCKED_ACTIONS.has(action)) {
    return { blocked: true, reason: 'pe_fund' };
  }
  if (state.isScenarioChallengeMode && state.scenarioChallengeConfig?.disabledFeatures) {
    // Read through resolveDisabledFeatures (Phase 4 — scenarioRules.ts) so
    // trigger-fired `enableFeature` actions correctly clear scenario-disabled
    // flags. Falls back to the static config when no triggers have fired.
    const disabled = resolveDisabledFeatures(state) ?? state.scenarioChallengeConfig.disabledFeatures;
    for (const [key, isDisabled] of Object.entries(disabled)) {
      if (!isDisabled) continue;
      const blockedActions = DISABLED_FEATURE_ACTIONS[key as keyof typeof DISABLED_FEATURE_ACTIONS];
      if (blockedActions?.includes(action)) {
        return { blocked: true, reason: 'scenario' };
      }
    }
  }
  return { blocked: false, reason: 'allowed' };
}

// ══════════════════════════════════════════════════════════════════
// UI-layer feature availability — projection of `isActionBlocked` for
// components. Components should use `isFeatureAvailable` to decide
// whether to render/disable a card; store actions continue to use
// `isActionBlocked` for the engine gate. The two agree by construction
// via FEATURE_REPRESENTATIVE_ACTION below.
//
// Why a separate layer: components need a label/reason for rendering
// ("Disabled in this scenario") that the engine gate shouldn't carry.
// Components also need Family Office as a blocker — FO is an inline
// state guard in useGame.ts, not a GameActionType gate, so this layer
// folds it in. Keeping these concerns in ONE helper means adding a new
// disabledFeatures key only needs one DISABLED_FEATURE_ACTIONS edit +
// one FEATURE_REPRESENTATIVE_ACTION edit — exhaustiveness tests catch drift.
// ══════════════════════════════════════════════════════════════════

/** UI-level feature keys. Mirrors DisabledFeatureKey minus `restructure` (no UI surface —
 * restructure is system-triggered via distress pipeline) and `familyOffice` (no button,
 * transition-only). Adds `designatePlatform` which has no disabledFeatures key but IS
 * PE/BS-gated via GameActionType and needs UI coverage. */
export type FeatureKey =
  | 'improveBusiness'
  | 'equityRaise'
  | 'buybackShares'
  | 'distributions'
  | 'payDownDebt'
  | 'sellBusiness'
  | 'sharedServices'
  | 'platformForge'
  | 'turnaround'
  | 'maSourcing'
  | 'ipo'
  | 'designatePlatform';

export type FeatureBlockReason = ActionBlockReason | 'family_office';

export interface FeatureAvailability {
  available: boolean;
  reason: FeatureBlockReason;
  /** UI-ready copy for the blocked case. Empty string when available. */
  message: string;
}

/**
 * Representative `GameActionType` for each UI feature. The feature is available
 * iff its representative action is not blocked. Keeps two layers in lockstep.
 *
 * `satisfies Record<FeatureKey, GameActionType>` gives a compile-error tripwire
 * if `FeatureKey` grows without a matching entry here.
 */
const FEATURE_REPRESENTATIVE_ACTION = {
  improveBusiness:   'improve',
  equityRaise:       'issue_equity',
  buybackShares:     'buyback',
  distributions:     'distribute',
  payDownDebt:       'pay_debt',
  sellBusiness:      'sell',
  sharedServices:    'unlock_shared_service',
  platformForge:     'forge_integrated_platform',
  turnaround:        'start_turnaround',
  maSourcing:        'source_deals',
  ipo:               'ipo',
  designatePlatform: 'designate_platform',
} as const satisfies Record<FeatureKey, GameActionType>;

/** UI-only message copy per block reason. Shown inline on disabled buttons + in blocked toasts. */
const BLOCK_REASON_MESSAGES: Record<FeatureBlockReason, string> = {
  bschool:       'Not available in this tutorial',
  pe_fund:       'Not available in Fund Manager mode',
  scenario:      'Disabled in this scenario',
  family_office: 'Not available in Family Office mode',
  allowed:       '',
};

/**
 * Is this UI feature available to the player right now?
 *
 * Components call this in render to hide/disable cards; event handlers call it
 * to surface the correct blocked-reason toast when a shortcut-action fires
 * against a hidden feature. Priority order: family_office → bschool → pe_fund →
 * scenario, matching the existing precedence in `isActionBlocked`.
 */
export function isFeatureAvailable(
  state:
    & Pick<GameState,
      | 'isBusinessSchoolMode'
      | 'isFundManagerMode'
      | 'isScenarioChallengeMode'
      | 'scenarioChallengeConfig'
      | 'isFamilyOfficeMode'
    >
    & Partial<Pick<GameState, 'round' | 'triggeredTriggerIds'>>,
  feature: FeatureKey,
): FeatureAvailability {
  // Family Office: a handful of features (equity, buyback, distributions) are
  // hard-gated at the state level inside store actions. Not routed through
  // isActionBlocked per the design note at line 55–61. Fold it in here so the
  // UI gets a consistent answer.
  if (state.isFamilyOfficeMode && FO_BLOCKED_FEATURES.has(feature)) {
    return { available: false, reason: 'family_office', message: BLOCK_REASON_MESSAGES.family_office };
  }

  const action = FEATURE_REPRESENTATIVE_ACTION[feature];
  const blocked = isActionBlocked(state, action);
  if (blocked.blocked) {
    return { available: false, reason: blocked.reason, message: BLOCK_REASON_MESSAGES[blocked.reason] };
  }
  return { available: true, reason: 'allowed', message: '' };
}

/** Features that Family Office mode disables at the UI level. Mirrors the
 * inline `if (state.isFamilyOfficeMode) return;` guards in useGame.ts. */
const FO_BLOCKED_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  'equityRaise',
  'buybackShares',
  'distributions',
]);

