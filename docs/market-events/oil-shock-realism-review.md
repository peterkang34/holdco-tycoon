# Global Oil Shock — Realism & Educational Value Review

**Reviewer**: Marcus Kaine (Financial Advisor Agent)
**Date**: 2026-03-21
**Scope**: Full implementation review across types, sectors, events, gameConfig, simulation, useGame, and businesses

---

## Executive Summary

The Global Oil Shock is the strongest choice-based event in the game. It teaches the single most important lesson for holdco builders: **how you respond to a systemic shock matters more than the shock itself.** The three-option design mirrors the real playbook spectrum from Berkshire (hunker) to Constellation Software (hunt) to Danaher (operational excellence). The implementation is well-calibrated, with one meaningful realism gap and a few minor tuning observations.

**Overall verdict: Ship-worthy. One structural issue to address, several optional improvements.**

---

## 1. Sector Sensitivity Map — Realism Check

The `oilShockSensitivity` values across 20 sectors are the backbone of this event. Here is a sector-by-sector assessment:

### Well-Calibrated (matches real-world exposure)

| Sector | Value | Assessment |
|--------|-------|------------|
| **distribution** | 1.5 | Correct. Distribution is the most oil-exposed sector in LMM — fuel costs are 15-25% of COGS for last-mile and industrial distributors. The 2022 diesel spike crushed margins for broadline distributors (Sysco, US Foods both flagged it). |
| **restaurant** | 1.3 | Correct. Food delivery cost, kitchen energy, food-ingredient commodity pass-through. McDonald's 2022 earnings calls cited energy as a top-3 margin headwind. |
| **consumer** | 1.2 | Correct. CPG shipping, packaging (petroleum-based plastics), and consumer discretionary pullback from gas price sticker shock. |
| **industrial** | 1.1 | Correct. Raw material and energy input costs. Moderated by pricing power in engineered/specialty products. |
| **homeServices** | 1.0 | Correct. Fleet fuel (truck rolls), but offset by essential/non-deferrable demand. Neutral is right. |
| **saas** | 0.2 | Correct. Minimal physical exposure. Cloud hosting costs have some energy component but SaaS margins absorb it easily. Constellation Software's portfolio barely registered the 2022 spike. |
| **insurance** | 0.3 | Correct. Indirect exposure through claims (auto, property) and investment portfolio volatility. |
| **healthcare** | 0.5 | Correct. Home health fleet costs, medical supply chain, but demand is inelastic. |
| **privateCredit** | -0.4 | Correct and smart. Private credit *benefits* from oil shocks — distressed lending demand rises, spread widening benefits existing portfolios, and energy-sector lending can charge premium rates. Apollo and Ares both expanded during 2014-2016 oil downturn. |
| **education** | -0.3 | Correct. Counter-cyclical: economic stress drives retraining demand. Enrollment at trade schools spiked during both the 2008 crisis and 2020 downturn. |
| **environmental** | -0.2 | Correct. Waste collection is essential/contracted, and energy-price spikes accelerate renewable/remediation investment. |
| **aerospace** | -0.3 | Correct. Defense spending is politically counter-cyclical to geopolitical crises. Aftermarket/MRO demand actually increases as airlines defer new aircraft purchases. HEICO's performance during oil shocks confirms this. |

### Slightly Off (minor adjustments worth considering)

| Sector | Value | Concern |
|--------|-------|---------|
| **agency** | 0.8 | Arguably high. Marketing agencies have near-zero physical supply chain exposure. The real risk is *indirect* — clients cut marketing budgets when margins compress. But that is more of a recession sensitivity than oil-specific sensitivity. A value of 0.4-0.5 would be more precise, OR the current 0.8 is defensible if interpreted as "second-order demand destruction." Current value is fine for gameplay — just slightly conflates recession sensitivity with oil sensitivity. |
| **mediaEntertainment** | 0.9 | Same concern as agency. Live events and venue operators have real energy exposure, but trade publications and post-production houses do not. The 0.9 feels like it is capturing general cyclicality rather than oil-specific exposure. 0.6-0.7 would be more precise. |
| **autoServices** | 0.5 | Could be higher. Auto repair shops benefit from an aging car fleet (which oil shocks accelerate as consumers defer new purchases), but their parts supply chain is petroleum-derivative-heavy. The 0.5 balances these forces reasonably, but 0.6-0.7 might be more accurate for the parts/supply side. |
| **realEstate** | 0.7 | Slightly high. Real estate's oil exposure is primarily through heating/cooling costs (which landlords often pass through via NNN leases) and construction material costs (which affect new builds, not existing portfolio value). 0.4-0.5 would be more accurate for the holdco game's asset-light real estate sub-types. |
| **proSports** | 0.4 | Correct for gate revenue impact (consumer discretionary), but arguably should be lower. Sports franchises have massive pricing power and inelastic demand. Media rights revenue (the largest component) is contractually locked. 0.2-0.3 might be more accurate. |

### Distribution Shape

The overall distribution spans from -0.4 (privateCredit) to 1.5 (distribution), with a mean around 0.5. This is well-shaped: most sectors take some hit, a few benefit, and the highest-exposure sectors take real pain. The spread is wide enough to make portfolio composition matter without being so extreme that any single sector becomes a "must-avoid."

**Verdict: The sensitivity map is strong. No changes required; the "slightly off" items are within the range of reasonable judgment and serve gameplay well.**

---

## 2. Probability & Cascade Design

- **3% probability**: Correct. Major geopolitical energy shocks are rare but not vanishingly so. In a 20-year game, expected occurrence is ~0.6 (so roughly 40% of games will see one). In a 10-year game, ~0.3 (roughly 26%). This feels right — memorable when it happens, not routine.
- **2-round cascade (standard) / 1-round (quick)**: Smart design. The 1973 and 2022 oil shocks both had multi-quarter reverberations. A 2-round cascade in a 20-year game captures this without being punitive. Quick mode's 1-round is necessary given the compressed timeline.
- **Aftershock is a revenue shock replacing cost shock**: This is the best design decision in the event. Round 1 is margin compression (input cost spike). The aftershock is demand destruction (consumer pullback). This matches the real-world pattern: the 1973 OPEC embargo hit margins first, then demand cratered 2-3 quarters later. The 60% decay factor (1ppt aftershock vs 2ppt initial) is historically accurate — aftershocks are painful but diminishing.

**Verdict: Probability and cascade are well-calibrated.**

---

## 3. Player Choices — Strategic Realism

This is where the event shines. The three choices map to real holdco archetypes:

### Hunker Down (Defensive)
- **What it does**: Halves margin hit, -2% revenue across portfolio, +$750K cash preserved
- **Real-world parallel**: Berkshire Hathaway in 2008. Buffett slowed acquisitions, preserved cash, and waited for the market to come to him. The cash preservation is the key signal.
- **Realism check**: The -2% revenue cut represents deliberate demand destruction (deferring marketing spend, pausing expansion). The halved margin hit represents operational cost-cutting. The $750K cash bonus represents working capital discipline. All three map to real defensive playbooks.
- **Who should pick this**: Players with heavy debt loads, thin margins, or concentrated oil-sensitive portfolios. The defensive choice when survival matters more than opportunity.

### Go Hunting (Opportunistic)
- **What it does**: Full margin hit + additional -2ppt margin cost on existing portfolio, but 4-6 distressed deals at 25% off
- **Real-world parallel**: Constellation Software during any downturn. Mark Leonard has explicitly said that downturns are their best acquisition environments because competition for deals evaporates. Danaher's 2009 acquisition spree is another perfect example.
- **Realism check**: The -2ppt margin cost on the existing portfolio represents the management attention cost of running an acquisition sprint while operations are under stress. This is a brilliant mechanical insight — it captures the real trade-off that most game events miss. You cannot hunt and tend the garden simultaneously.
- **Who should pick this**: Players with strong cash positions, diversified portfolios (low average oil sensitivity), and available bandwidth. The compounder's choice — exactly the behavior the game should reward.
- **Educational payoff**: This is the Holdco Guide Ch. VI lesson incarnated: "Cash is your competitive advantage when others are desperate." Players who kept powder dry in earlier rounds can now deploy it at a discount.

### Pass Through Costs (Quality-Gated)
- **What it does**: Margins preserved, but revenue hit varies by quality (Q4+ lose 2%, others lose 6%)
- **Real-world parallel**: Danaher Business System. High-quality businesses with pricing power can pass input cost increases to customers with minimal churn. Low-quality businesses attempting the same lose volume.
- **Realism check**: The quality gate is the best teaching moment in the event. It rewards players who invested in quality improvements and turnarounds — those businesses have earned pricing power. The 3x revenue penalty for low-quality businesses (6% vs 2%) accurately reflects that commoditized businesses cannot pass through costs without losing customers.
- **Who should pick this**: Players with high average portfolio quality (Q4+). Punishes players who accumulated low-quality businesses and never improved them.

### Structural Issue: Choice Asymmetry

**The one meaningful concern**: "Go Hunting" is likely the dominant choice for experienced players. The -2ppt margin cost is a one-round hit, but the 25% acquisition discount compounds for the remaining game. A player with $5M+ cash and a diversified portfolio should almost always hunt.

The balance lever to watch: **does the -2ppt margin cost on the existing portfolio apply to the aftershock round too?** Looking at the code, the aftershock applies its own effects regardless of the Round 1 choice. The Go Hunting player takes the -2ppt in Round 1 AND the aftershock in Round 2. This is appropriate — the opportunity cost is real.

The current calibration (Reiko's 2ppt, not 3ppt) plus the 25% discount (not 35%) does keep Go Hunting from being a slam dunk. In a portfolio with 5 businesses averaging $2M EBITDA and 0.8 sensitivity, the hunting cost is roughly:
- Margin hit: (2ppt * 0.8 + 2ppt) * $10M revenue = ~$280K additional EBITDA loss vs Hunker Down
- Benefit: 2-3 extra deals at 25% off (saving perhaps $500K-$1.5M on acquisition cost)

The NPV math favors hunting for cash-rich players but not overwhelmingly. This is good calibration.

**Verdict: The three choices are the strongest educational element. No changes needed, but monitor Go Hunting pick rates in telemetry.**

---

## 4. Margin Hit Calibration (2ppt x sensitivity)

- **2ppt base**: Reiko's calibrated number vs the original 3ppt. This is correct. A 2ppt hit on a distribution business (sensitivity 1.5) = 3ppt actual, which would compress a 12% margin business to 9% — a 25% margin erosion. That matches the magnitude of real oil shock margin compression for physical-distribution businesses.
- **For SaaS (sensitivity 0.2)**: 0.4ppt hit — barely noticeable, which matches reality.
- **For private credit (sensitivity -0.4)**: +0.8ppt margin *improvement* — representing spread widening and distressed lending opportunities.

**Verdict: 2ppt is well-calibrated. The sensitivity multiplier creates appropriate dispersion.**

---

## 5. Distressed Deals (25% discount, Q3 quality cap)

- **25% discount** (not 35%): Correct. Distressed sellers in oil shocks are not fire sales — they are stressed operators with real businesses facing temporary input cost pressure. 25% reflects the "motivated but not desperate" dynamic. Real LMM distressed acquisitions during the 2014-2016 oil downturn traded at 15-30% discounts to pre-crisis multiples.
- **Quality capped at Q3**: Smart. Distressed deals during oil shocks are not broken businesses — they are decent operations with temporary margin compression. Q3 is "fixable problems" — exactly what a patient buyer should target.
- **Quality floor at Q2**: Also correct. The worst oil shock victims are genuinely impaired — their operations have structural issues the oil shock merely exposed.
- **Deal count (2-3 base, 4-6 with Go Hunting)**: Reasonable. Enough to reward the opportunistic player without flooding the pipeline.

**Verdict: Deal generation parameters are realistic.**

---

## 6. Aftershock Design (Revenue Shock Wave)

The aftershock switches from margin compression (Round 1) to revenue destruction (Round 2). This is the most historically accurate element:

- **1973 OPEC embargo**: Input costs spiked immediately (margin). Consumer demand cratered over the following 2-3 quarters (revenue).
- **2022 energy crisis**: European industrial margins compressed Q2-Q3. Consumer spending retreated Q4 2022 through Q1 2023.
- **60% decay (1ppt aftershock vs 2ppt initial)**: Matches the pattern of diminishing reverberations.

The aftershock also generates additional distressed deals via `generateOilShockDeals` in the deal pipeline. This creates a multi-round acquisition window for patient capital — exactly the dynamic the game should reward.

**Verdict: Aftershock design is excellent. The wave pattern is the most realistic element of the event.**

---

## 7. Educational Tips

### Primary Tip
> "Constellation Software's digital portfolio barely felt the 2022 energy crisis. Physical supply chain exposure is the real risk factor."

**Assessment**: Accurate and pedagogically effective. The lesson — portfolio composition determines shock exposure — is the core takeaway. Constellation Software is the perfect reference because their VMS portfolio has near-zero oil sensitivity, demonstrating that sector selection IS risk management.

### Aftershock Tip
> "Danaher's playbook: buy quality businesses during the aftershock when sellers are most desperate."

**Assessment**: Accurate. Danaher's acquisition pace has historically accelerated during the back half of downturns, not the initial shock. The tip teaches patience within the shock — don't deploy all capital on Round 1, save some for the aftershock when sellers are more motivated.

### Missing Educational Opportunity

The event could add a third teaching moment in the choice descriptions themselves. Consider adding brief parenthetical references:

- **Hunker Down**: "(Berkshire 2008 playbook)"
- **Go Hunting**: "(Constellation Software / Danaher playbook)"
- **Pass Through Costs**: "(pricing power test — Danaher Business System)"

These would make the real-world connection immediate without requiring the player to read the tip.

---

## 8. Interaction with Existing Systems

### Inflation Amplification
The code checks `state.inflationRoundsRemaining > 0` and adds +1ppt margin compression if inflation is already active. This is realistic — an oil shock during an inflationary period is compounding pain (stagflation). The 1970s confirmed this.

### Credit Tightening (+1 round)
Oil shocks trigger 1 round of credit tightening. This is conservative but appropriate for a game context. Real oil shocks in 2022 contributed to 18+ months of tightening.

### Interest Rate Hike (+1%)
Modest and realistic. The 2022 energy crisis contributed to roughly 200bps of Fed rate hikes across multiple meetings.

### Private Credit Synergy
Players with private credit businesses get their lending synergy discount halved during credit tightening. This is a nice interaction — the PC portfolio benefits from the oil shock (negative sensitivity) but the lending synergy gets constrained. Realistic tension.

---

## 9. What the Event Teaches Players

The oil shock, taken as a complete system, teaches five holdco risk management lessons:

1. **Portfolio composition is risk management.** A portfolio heavy in distribution and restaurants takes 3x the hit of one built around SaaS and healthcare. This rewards thoughtful diversification — a core Holdco Guide principle.

2. **Cash reserves are offensive weapons, not just defensive buffers.** The Go Hunting option is only available if you have capital to deploy. Players who distributed all cash in prior rounds cannot take advantage.

3. **Quality compounds through crises.** The Pass Through option rewards quality investment. Q4+ businesses have earned pricing power. Q1-Q2 businesses are exposed.

4. **Opportunistic acquisition during distress is the compounder's edge.** Constellation Software's entire strategy depends on buying during others' pain. The 25% discount on distressed deals teaches this directly.

5. **Systemic shocks have aftershocks.** The cascade design teaches that crises are not point events — they reverberate. Patient capital that survives Round 1 can deploy during Round 2 when sellers are more desperate.

---

## 10. Summary of Recommendations

### Must-Fix
None. The implementation is ship-worthy as-is.

### Should-Consider
1. **Monitor Go Hunting pick rates** via telemetry. If >70% of experienced players always pick it, consider increasing the margin cost to -3ppt or adding a small quality-drop risk to one random business (representing management distraction during acquisition sprint).
2. **Add archetype references to choice descriptions** — one-line parenthetical connecting each choice to a real-world holdco strategy.

### Optional Polish
3. Adjust `agency` oilShockSensitivity from 0.8 to 0.5 — agencies have near-zero direct oil exposure; the current value over-indexes on indirect demand destruction that is better captured by recessionSensitivity.
4. Adjust `realEstate` from 0.7 to 0.5 — NNN lease structures pass energy costs through; holdco real estate exposure is primarily indirect.
5. Consider a small positive sensitivity for `wealthManagement` (currently 0.4) during aftershock — AUM-based fees decline when equity markets drop from oil-shock contagion.

### Not Recommended
- Do NOT increase the 25% distressed discount. The current level rewards hunting without making it a no-brainer.
- Do NOT reduce the 3% probability. The rarity makes the event memorable and the preparation (cash reserves, quality investment) feel worthwhile.
- Do NOT add a fourth choice. Three options create a clean decision triangle that maps perfectly to the defensive/opportunistic/operational archetypes.

---

*"The best holdco builders don't just survive oil shocks — they use them as the proving ground for everything they've been building. Portfolio composition, quality investment, cash discipline — all of it gets tested in a single event. That's what makes this a great game mechanic."*

— Marcus Kaine
