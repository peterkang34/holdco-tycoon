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
  state: Pick<
    GameState,
    'isBusinessSchoolMode' | 'isFundManagerMode' | 'isScenarioChallengeMode' | 'scenarioChallengeConfig'
  >,
  action: GameActionType,
): ActionBlockResult {
  if (state.isBusinessSchoolMode && BS_BLOCKED_ACTIONS.has(action)) {
    return { blocked: true, reason: 'bschool' };
  }
  if (state.isFundManagerMode && PE_BLOCKED_ACTIONS.has(action)) {
    return { blocked: true, reason: 'pe_fund' };
  }
  if (state.isScenarioChallengeMode && state.scenarioChallengeConfig?.disabledFeatures) {
    const disabled = state.scenarioChallengeConfig.disabledFeatures;
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
