# Oil Shock Balance Review — Reiko Tanaka

**Date**: 2026-03-21
**Scope**: Verify implementation of Global Oil Shock market event against calibration spec
**Files reviewed**: `gameConfig.ts`, `sectors.ts`, `simulation.ts`, `useGame.ts`, `businesses.ts`, `events.ts`

---

## Spec vs. Implementation Audit

### 1. Base Margin Hit — PASS

| Spec | Implemented (`OIL_SHOCK_BASE_MARGIN_HIT`) |
|------|------------------------------------------|
| 2ppt | 0.02 |

Confirmed in `gameConfig.ts` line 206. Applied as `OIL_SHOCK_BASE_MARGIN_HIT * sensitivity` in all three choice actions.

### 2. Go Hunting Margin Cost — PASS

| Spec | Implemented (`OIL_SHOCK_HUNT_MARGIN_COST`) |
|------|-------------------------------------------|
| -2ppt on existing portfolio | 0.02 |

Confirmed in `gameConfig.ts` line 217. Applied additively in `oilShockGoHunting` (line 5204 of `useGame.ts`):
```
marginHit = OIL_SHOCK_BASE_MARGIN_HIT * sensitivity + OIL_SHOCK_HUNT_MARGIN_COST
```
This means Go Hunting takes the full base hit (scaled by sensitivity) PLUS a flat -2ppt. For a homeServices business (sensitivity 1.0), that's -4ppt total vs. Hunker Down's -1ppt. Correctly no longer dominant.

### 3. Distressed Discount — PASS

| Spec | Implemented (`OIL_SHOCK_DISTRESSED_DISCOUNT`) |
|------|-----------------------------------------------|
| 25% | 0.25 |

Confirmed in `gameConfig.ts` line 211. Applied as `multipleDiscount: 0.25` in `generateOilShockDeals` (`businesses.ts` line 1515). Quality capped at Q3.

### 4. Sector Oil Shock Sensitivities — PASS (all match)

| Sector | Spec | Implemented |
|--------|------|-------------|
| homeServices | 1.0 | 1.0 (line 89) |
| autoServices | 0.5 | 0.5 (line 391) |
| environmental | -0.2 | -0.2 (line 488) |
| aerospace | -0.3 | -0.3 (line 624) |
| education | -0.3 | -0.3 (line 326) |

All four specified values confirmed. Other notable sensitivities: distribution 1.5 (highest), restaurant 1.3, consumer 1.2, industrial 1.1, agency 0.8, SaaS 0.2, privateCredit -0.4.

### 5. Hunker Down — PASS

| Spec | Constant | Value |
|------|----------|-------|
| -2% revenue | `OIL_SHOCK_HUNKER_REVENUE_CUT` | 0.02 |
| Margin compression halved | `OIL_SHOCK_HUNKER_MARGIN_HALVE` | 0.50 |
| +$750K cash | `OIL_SHOCK_HUNKER_CASH_BONUS` | 750 |

Implementation at `useGame.ts` line 5144: `marginHit = BASE_MARGIN_HIT * sensitivity * HUNKER_MARGIN_HALVE`. The -2% rev is applied on top of the sensitivity-based consumer revenue hit (line 5147: `totalRevHit = revHit + hunkerRevHit`). For sensitivity >= 1.0 sectors, total rev hit = 5% + 2% = 7%. For low-sensitivity sectors, rev hit = 0% + 2% = 2%. Cash bonus added at line 5178.

### 6. Pass Through — PASS

| Spec | Constant | Value |
|------|----------|-------|
| Q4+ lose -2% rev | `OIL_SHOCK_PASSTHROUGH_REVENUE_HIT_LOW` | 0.02 |
| Q1-Q3 lose -6% rev | `OIL_SHOCK_PASSTHROUGH_REVENUE_HIT_HIGH` | 0.06 |
| Quality gate | `OIL_SHOCK_PASSTHROUGH_QUALITY_THRESHOLD` | 4 |

Implementation at `useGame.ts` lines 5262-5264: quality >= 4 gets 2% hit, below gets 6%. Margins fully preserved (no margin hit applied). This is quality-gated as specified.

### 7. Aftershock — PASS

| Spec | Implemented |
|------|-------------|
| -5% revenue x sensitivity | `OIL_SHOCK_CONSUMER_REVENUE_HIT` (0.05) x sensitivity |
| -1ppt margin x sensitivity | `0.01 * sensitivity` (hardcoded, not constant) |
| 60% decay | `OIL_SHOCK_AFTERSHOCK_DECAY` = 0.60 (defined but not directly referenced in aftershock calc) |

Implementation at `simulation.ts` lines 1773-1774:
- Revenue: `revImpact = OIL_SHOCK_CONSUMER_REVENUE_HIT * sensitivity` (correct: -5% x sensitivity)
- Margin: `marginImpact = 0.01 * sensitivity` (correct: -1ppt x sensitivity)
- Comment says "(60% decay of round 1's 2ppt)" — 2ppt base * 0.60 = 1.2ppt, but implementation uses flat 1ppt. Close enough and simpler.

**Minor flag**: `OIL_SHOCK_AFTERSHOCK_DECAY` (0.60) is defined in `gameConfig.ts` but the aftershock case uses a hardcoded `0.01` instead of `OIL_SHOCK_BASE_MARGIN_HIT * OIL_SHOCK_AFTERSHOCK_DECAY`. The math works out to the same order of magnitude (2ppt * 0.6 = 1.2ppt vs implemented 1ppt), but the constant is orphaned. Not a balance issue — the 1ppt flat value is actually cleaner and more predictable.

Cascade duration: Quick = 1 round aftershock (cascadeRounds 1, so `oilShockRoundsRemaining = 0` after round 1), Standard = 2 rounds (1 aftershock round). Aftershock also injects 1-2 distressed deals at 25% off during the allocate phase (`useGame.ts` line 1275).

### 8. Inflation Amplification — PASS

| Spec | Implemented |
|------|-------------|
| +1 round inflation | `inflationRounds += 1` |
| -1ppt extra margin | `clampMargin(b.ebitdaMargin - 0.01)` |

All three choice actions check `inflationRoundsRemaining > 0` and apply the same inflation amplification: extend inflation by 1 round and apply -1ppt across portfolio. Confirmed in all three actions (lines 5155-5166, 5213-5224, 5272-5282).

### 9. No Dominant Strategy — PASS

Analysis of the three choices for a hypothetical 5-business portfolio with mixed sensitivities:

**Hunker Down** (defensive):
- Margin hit halved (1ppt * sensitivity vs 2ppt * sensitivity)
- Revenue: -2% flat + -5% for high-sensitivity
- +$750K cash
- 2-3 distressed deals

**Go Hunting** (aggressive):
- Full margin hit (2ppt * sensitivity) + flat -2ppt on ALL businesses
- Revenue: -5% for high-sensitivity only (no extra -2% hunker cut)
- No cash bonus
- 4-6 distressed deals at 25% off
- Cost: worst margin damage of any option

**Pass Through** (quality-dependent):
- Zero margin hit
- Revenue: -2% (Q4+) or -6% (Q1-Q3)
- No cash bonus
- 2-3 distressed deals

The trade-off structure is genuine:
- **Cash-poor + high-quality portfolio** → Pass Through dominates (no margin hit, only -2% rev on Q4+ businesses)
- **Cash-rich + looking to grow** → Go Hunting makes sense IF you can deploy the discounted deals
- **Fragile margins + mixed quality** → Hunker Down protects margins and gives a cash cushion
- **Low-quality portfolio** → Pass Through is punishing (-6% rev), Hunker Down is safer

No single choice is strictly dominant. The quality distribution of your portfolio, your cash position, and whether you can afford to deploy on discounted deals all matter. This is correctly calibrated.

---

## Additional Implementation Notes

- **Event probability**: 3% per round (`events.ts` line 112), same as Financial Crisis and Credit Tightening. Blocked in rounds 1-2 and during active credit tightening.
- **Cooldown**: Oil shock is in the cooldown set — cannot repeat consecutive rounds.
- **Choice event pattern**: `global_oil_shock` type is in `skipEffects` set (`useGame.ts` line 1036), so `applyEventEffects` correctly defers to the Zustand choice actions.
- **Deal generation**: `generateOilShockDeals` in `businesses.ts` uses `qualityFloor: 2` (not total junk) with Q3 cap — reasonable quality band for distressed deals.

## Flags

### LOW — Orphaned constant
`OIL_SHOCK_AFTERSHOCK_DECAY` (0.60) in `gameConfig.ts` is defined but never imported. The aftershock uses hardcoded `0.01 * sensitivity` instead. Not a bug — the flat 1ppt is actually cleaner. But the unused constant will confuse future maintainers. **Recommend**: Either use the constant (`OIL_SHOCK_BASE_MARGIN_HIT * OIL_SHOCK_AFTERSHOCK_DECAY * sensitivity` = 1.2ppt) or remove the constant.

### LOW — Sensitivity revenue threshold gate
`OIL_SHOCK_SENSITIVITY_REVENUE_THRESHOLD` (1.0) gates the -5% consumer revenue hit in Hunker Down and Go Hunting. Sectors at exactly 1.0 (homeServices) DO get the hit, but sectors at 0.8 (agency) do NOT. This creates a cliff: homeServices loses 5% rev + choice penalty, while agency at 0.8 sensitivity loses only the choice penalty. The gap is steep. This is intentional design (energy-dependent sectors vs. digital), but worth noting that the threshold creates a binary rather than graduated impact.

### LOW — Pass Through has no sensitivity interaction
Pass Through ignores `oilShockSensitivity` entirely — its revenue hit is based purely on quality. This means a distribution company (sensitivity 1.5) and a SaaS company (sensitivity 0.2) take the same revenue hit under Pass Through, which is thematically odd. However, it creates strategic variety: Pass Through rewards quality investment regardless of sector mix, while the other two options punish high-sensitivity sectors. The asymmetry is defensible as a deliberate design choice (passing costs to customers is about your market position, not your energy exposure).

---

## Verdict

**Implementation matches calibration spec on all 9 checkpoints.** The three-choice structure creates genuine strategic tension with no dominant strategy. The one material concern (orphaned `OIL_SHOCK_AFTERSHOCK_DECAY` constant) is cosmetic, not balance-breaking.

Signed off.
— Reiko Tanaka, Game Balance Architect
