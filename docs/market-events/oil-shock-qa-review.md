# Oil Shock QA Review — Jake Moreno

**Date**: 2026-03-21
**Feature**: Global Oil Shock Market Event (v39)
**Files Reviewed**: types.ts, simulation.ts, useGame.ts, migrations.ts, EventCard.tsx, GameScreen.tsx, businesses.ts, market-events.test.ts

---

## Summary

The oil shock implementation is structurally sound. All 3 choice actions route correctly, the aftershock cascade works, counter decrement logic is intentionally placed in `applyEventEffects` (not `advanceToEvent`), and the structural tests (tripwires, exhaustiveness) all pass cleanly. Two bugs found — one medium severity (save/load), one low-medium (aftershock deal injection missing).

---

## Bugs Found

### BUG-1: oilShockRoundsRemaining and oilShockChoice NOT in partialize (save/load data loss)

**Severity**: Medium
**Category**: Logic Bug
**Steps to Reproduce**:
1. Start a standard (20yr) game
2. Get an oil shock event (round 5+)
3. Choose any option (sets oilShockRoundsRemaining=1, oilShockChoice='hunkerDown')
4. Close browser tab
5. Re-open game (rehydrate from localStorage)
6. Advance to next round's event phase
**Expected**: Aftershock event fires (oilShockRoundsRemaining was 1)
**Actual**: oilShockRoundsRemaining is undefined (defaults to 0 via `?? 0`), no aftershock fires
**Affected Archetype(s)**: All players who save mid-oil-shock
**Suggested Fix**: Add to partialize in useGame.ts (~line 5903):
```ts
oilShockRoundsRemaining: state.oilShockRoundsRemaining,
oilShockChoice: state.oilShockChoice,
```
**Files**: `src/hooks/useGame.ts` (partialize, ~line 5827-5904)

**Note**: This is a pre-existing pattern — `recessionProbMultiplier`, `talentMarketShiftRoundsRemaining`, `privateCreditRoundsRemaining`, and `pendingProSportsEvent` are also missing from partialize. These are all optional fields that default to 0/undefined when missing. For short-lived 1-round effects the impact is minimal, but oil shock in standard mode has a 2-round cascade, making the save/load gap more impactful.

---

### BUG-2: Aftershock effect text promises distressed deals but none are injected

**Severity**: Low / Medium
**Category**: Logic Bug / UI Copy Mismatch
**Steps to Reproduce**:
1. Standard game, get oil shock, choose any option
2. Next round, aftershock fires
3. Read the effect text: "More distressed deals appear"
4. Check deal pipeline
**Expected**: Additional distressed deals injected into pipeline
**Actual**: `applyEventEffects` for `global_oil_shock_aftershock` only applies revenue/margin hits and decrements the counter. No deals are generated.
**Affected Archetype(s)**: Min-Max Michelle (expects the advertised deals), Leverage Larry (was counting on bargain-hunting)
**Suggested Fix**: Either:
- (A) Inject distressed deals in `applyEventEffects` for aftershock (requires passing RNG + cash to generate deals), or
- (B) Remove "More distressed deals appear" from the aftershock effect text in `generateEvent` (simulation.ts ~line 902-903)
**Files**: `src/engine/simulation.ts` (lines 767-797 applyEventEffects, lines 899-912 generateEvent)

---

## Checklist Results

### 1. Edge Cases

| Scenario | Status | Notes |
|----------|--------|-------|
| Oil shock with 0 businesses | PASS | Choice actions map over empty array, no crash. Interest rate + credit tightening still apply. Distressed deals still generated (empty portfolio is a valid aggressive-start scenario). |
| Oil shock with all negative-sensitivity sectors | PASS | Education (-0.3) and environmental (-0.2) get POSITIVE margin/revenue boost during oil shock (correct — counter-cyclical). `clampMargin` prevents overflow. Private credit (-0.4) and aerospace (-0.3) also benefit. |
| Oil shock during inflation | PASS | All 3 choice handlers check `state.inflationRoundsRemaining > 0` and amplify (+1 round inflation, -1ppt extra margin). This compounds correctly with the oil shock margin hit. |
| Oil shock during credit tightening | PASS | Blocked at generation — `if ((state.creditTighteningRoundsRemaining ?? 0) > 0) prob = 0` prevents oil shock from firing. |
| Oil shock rounds 1-2 | PASS | Blocked — `if (state.round <= 2) prob = 0`. Test confirms with 2000 seeds. |
| Back-to-back oil shocks | PASS | `cooldownTypes` set includes `global_oil_shock`. Test confirms 2000 seeds produce no repeat. |

### 2. Counter Decrement Logic

**Correct**. `oilShockRoundsRemaining` is intentionally NOT decremented in `advanceToEvent`. The comment at line 953 explains why:

> "oilShockRoundsRemaining is NOT decremented here — it's decremented in applyEventEffects for the aftershock event, to ensure the aftershock fires before the counter hits 0"

The flow:
1. Round N: Oil shock choice sets `oilShockRoundsRemaining = cascadeRounds - 1` (1 for standard, 0 for quick)
2. Round N+1: `advanceToEvent` passes the un-decremented counter to `generateEvent`
3. `generateEvent` sees `oilShockRoundsRemaining > 0`, returns forced aftershock
4. `applyEventEffects` for aftershock decrements counter to 0
5. Round N+2: Counter is 0, normal event generation resumes

For quick mode: `cascadeRounds - 1 = 0`, so no aftershock fires. Correct.

### 3. Migration (v38 to v39)

| Check | Status | Notes |
|-------|--------|-------|
| v39 key name | PASS | `holdco-tycoon-save-v39` |
| Backfills oilShockRoundsRemaining: 0 | PASS | Line 1042-1043 |
| oilShockChoice defaults to undefined | PASS | Comment at line 1045 — no backfill needed since it's optional |
| Called in runMigrations() | PASS | Line 1089 |
| Old v38 key removed | PASS | `localStorage.removeItem(v38Key)` at line 1049 |

### 4. EventCard

| Check | Status |
|-------|--------|
| `global_oil_shock` has icon | PASS — returns `'🛢️'` |
| `global_oil_shock_aftershock` has icon | PASS — same case block |
| `global_oil_shock` in isNegative | PASS — line 102 |
| `global_oil_shock_aftershock` in isNegative | PASS — line 103 |

### 5. GameScreen handleEventChoice Routing

All 3 actions routed correctly in the switch (lines 371-373):
- `oilShockHunkerDown` -> `oilShockHunkerDown()`
- `oilShockGoHunting` -> `oilShockGoHunting()`
- `oilShockPassThrough` -> `oilShockPassThrough()`

Post-choice flow: checks `!useGameStore.getState().currentEvent` then calls `advanceToAllocate()`. If choice fails (insufficient cash), event stays on screen with warning toast. Oil shock choices don't have cash costs that could fail, so this path is unlikely but safe.

### 6. Save/Load

**FAIL** — See BUG-1. `oilShockRoundsRemaining` and `oilShockChoice` are not in the partialize function, so they are lost on save/load. The migration correctly backfills for v38->v39, but the v39 partialize itself omits the fields.

### 7. Quick vs Standard Mode

| Mode | cascadeRounds | oilShockRoundsRemaining after choice | Aftershock fires? |
|------|---------------|--------------------------------------|-------------------|
| Standard (20yr) | 2 | 1 | Yes — next round |
| Quick (10yr) | 1 | 0 | No |

Effect text correctly adjusts: standard shows "Aftershock next round", quick omits it.

### 8. Test Coverage

| Test Suite | Status | Count |
|------------|--------|-------|
| market-events.test.ts | PASS | 55 tests (includes 9 oil shock specific) |
| switch-exhaustiveness.test.ts | PASS | 114 tests (dynamically picks up new EventType variants) |
| coverage-tripwires.test.ts | PASS | 214 tests (dynamically checks event types appear in test files) |

**Oil shock specific tests**:
- Event exists with correct probability (0.03)
- Generates 3 choices with correct action strings
- Blocked in rounds 1-2 (4000 seeds checked)
- Blocked during credit tightening (2000 seeds)
- Aftershock forced when counter > 0
- Aftershock reduces revenue/margin proportional to sensitivity
- Distribution (1.5) hit harder than SaaS (0.2)
- Counter decremented after aftershock
- Cooldown prevents back-to-back
- generateOilShockDeals: correct count, discounted prices, variable counts

**Missing test coverage**:
- No test for 0-business oil shock (edge case, would be quick to add)
- No test for negative-sensitivity sectors during oil shock (education gets a boost — worth verifying)
- No test for inflation + oil shock compound interaction
- No test for quick mode specifically (cascadeRounds=1, no aftershock)
- No test for save/load round-trip of oil shock state

---

## Sector Sensitivity Audit

All 20 sectors have `oilShockSensitivity` defined. Distribution of values:

| Range | Sectors |
|-------|---------|
| Negative (counter-cyclical) | education (-0.3), aerospace (-0.3), environmental (-0.2), privateCredit (-0.4) |
| Low (0.0–0.5) | saas (0.2), insurance (0.3), fintech (0.3), wealthManagement (0.4), proSports (0.4), autoServices (0.5), healthcare (0.5) |
| Medium (0.5–1.0) | b2bServices (0.6), realEstate (0.7), agency (0.8), mediaEntertainment (0.9) |
| High (1.0+) | homeServices (1.0), industrial (1.1), consumer (1.2), restaurant (1.3), distribution (1.5) |

The sensitivity values are realistic — physical supply chain/logistics businesses are hit hardest, digital/financial businesses are insulated, and counter-cyclical sectors (defense/aerospace, environmental/renewables) benefit.

---

## Action Items

1. **BUG-1 (Medium)**: Add `oilShockRoundsRemaining` and `oilShockChoice` to partialize in useGame.ts. Consider also adding the other missing optional counters (`recessionProbMultiplier`, `talentMarketShiftRoundsRemaining`, `privateCreditRoundsRemaining`, `pendingProSportsEvent`) while you're there.

2. **BUG-2 (Low)**: Either inject distressed deals during aftershock, or remove the "More distressed deals appear" text from the aftershock effect description.

3. **Tests (Low)**: Add tests for 0-business edge case, negative-sensitivity sectors, inflation compound, and quick mode (no aftershock).
