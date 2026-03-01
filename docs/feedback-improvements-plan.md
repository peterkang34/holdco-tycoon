# Holdco Tycoon — New Features Feedback Improvements Plan

**Source:** `docs/HoldCo_Tycoon_New_Features_Feedback.docx` (Game 4: CC Capital, Easy/10yr, Score 90/100)
**Analysis Date:** 2026-03-01
**Specialists:** Reiko Tanaka (balance), Marcus Kaine (realism), Lena Xu (UX), Dara Osei (implementation)

---

## Tier 1: Ship Now (~2.5 hours, zero engine risk)

### 1. Complexity Cost — Show SS Offset Math
- **What:** Display "$120K − $34K offset = $86K" instead of just "-$86K"
- **Why:** Validates player's shared services investment; data already computed in `ComplexityCostBreakdown`
- **Files:** `GameScreen.tsx` (pass full breakdown), `CollectPhase.tsx` (render equation)
- **Status:** [x] Done

### 2. Spread Indicator — Color Gradient
- **What:** Replace binary green/red with 3-tier magnitude-based gradient (red < 0, yellow 0–0.5x, green > 0.5x)
- **Why:** Pure CSS, no engine changes, makes spread trends instantly readable
- **Files:** `BusinessCard.tsx`
- **Status:** [x] Done

### 3. Market Cycle — Event History Dots in Tooltip
- **What:** Show last 4 global events as colored dots inside the existing cycle tooltip
- **Why:** Helps players understand *why* the cycle reads a certain way; `eventHistory` already available
- **Files:** `GameScreen.tsx` (tooltip content)
- **Status:** [x] Done

---

## Tier 2: High-Value Enhancements (~7 hours, low-medium risk)

### 4. Moat Tier Tooltip — Factor Breakdown + Progress Bar
- **What:** Refactor `calculateDeRiskingPremium()` to return structured breakdown; show segmented progress bar + qualitative hints in tooltip
- **Key constraint (Reiko):** Show qualitative hints ("strengthen operator quality"), NOT exact thresholds — preserves discovery
- **Key constraint (Marcus):** Real moats are emergent, not checklists — no linear upgrade path
- **Files:** `buyers.ts` (return breakdown), `BusinessCard.tsx` (render), `mechanicsCopy.ts`
- **Effort:** 2-3 hours
- **Status:** [x] Done

### 5. Ownership History — Tie to Gameplay Effects
- **What:** Wire `priorOwnershipCount` (already exists on Business) to improvement efficacy
- **Tuning (Reiko):** Founder-owned +10%, 1 prior owner neutral, 2 prior -5%, 3+ prior -10%
- **Rationale (Marcus):** Highest ROI suggestion; teaches "where you source matters" — the core PE lesson
- **Files:** `useGame.ts` (improve action), `gameConfig.ts` (new constants), `DealCard.tsx` (visual indicator), `mechanicsCopy.ts`, `UserManualModal.tsx`
- **Effort:** 3-4 hours
- **Status:** [x] Done

### 6. Complexity Cost — Steeper Scaling
- **What:** Replace linear cost with mild acceleration (exponent 1.3)
- **Key constraint (Reiko):** Apply steeper curve to standard mode only; leave quick mode linear
- **Tuning:** At 3 excess opcos: 1.25% vs 0.9% linear. Cap raised to 4% (per Reiko's balance review)
- **Files:** `simulation.ts` (`calculateComplexityCost`), `gameConfig.ts`, `mechanicsCopy.ts`, `UserManualModal.tsx`
- **Effort:** 1-2 hours
- **Status:** [x] Done

---

## Tier 3: Defer / Redesign

### 7. Market Cycle — Mechanical Engine Effects → DEFER
- **Reason:** All 4 specialists flagged. Creates feedback loops (recession → worse deals → harder recovery). Events already handle cycle effects. 8+ hours, 13+ files, save migration.
- **Alternative:** Enhance tooltip educational copy ("During contractions, disciplined buyers find the best opportunities")

### 8. Competitive Position — Negotiation Mechanic → REDESIGN
- **Reason:** Threatens heat system (dominant strategy with deep pipelines). Real PE auctions aren't haggling.
- **Alternative (Marcus):** "Broken/stale deal returns" — expired deals have 15-20% chance of returning 1-2 rounds later at 10-15% discount, gated behind M&A Sourcing Tier 2+

### 9. Spread Velocity Metric → SKIP
- **Reason:** Not a real PE metric. Favors recent acquirers (nudges flipping over compounding). Information overload on mobile.
- **Alternative:** If ever revisited, use a tiny sparkline instead of a number

---

## Implementation Sessions

- **Session 1:** Tier 1 items (complexity SS visibility, spread gradient, cycle event dots)
- **Session 2:** Moat factor breakdown + ownership history effects
- **Session 3:** Complexity steeper scaling + balance review
- **Backlog:** Broken-deal returns mechanic
