# Holdco Tycoon — Product Requirements Document

**Version:** 2.1 (Current State)
**Author:** Peter Kang
**Date:** February 2026
**Status:** In Development — Core Game Playable

---

## Document Purpose

This PRD reflects the **actual implemented state** of Holdco Tycoon as of February 7, 2026 (7 commits, 4 development sessions). Features are marked as:
- **IMPLEMENTED** — Built and functional
- **PARTIAL** — Partially built, needs work
- **PLANNED** — Designed but not yet implemented

### Changelog from v2.0

- **UPDATED** — Entire document revised to reflect actual game state vs. original spec
- **CHANGED** — Game duration: 20 years (not 20 quarters/5 years as originally spec'd)
- **CHANGED** — Starting capital: $20M raise, founder keeps 80% (was $500k, 100% ownership)
- **CHANGED** — Starting EBITDA: ~$1M per opco (was $150k-$400k range)
- **CHANGED** — Shared services costs scaled to annual (was quarterly)
- **ADDED** — AI integration layer (Claude API for narratives, analysis, deal content)
- **ADDED** — Roll-up M&A mechanics (platform, tuck-in, merge)
- **ADDED** — Dynamic narratives system (event narratives, business stories, year chronicles)
- **ADDED** — Deal sourcing feature (hire investment banker for $500k)
- **ADDED** — Market Guide modal, Roll-Up Guide modal
- **ADDED** — Vercel serverless API routes for AI features

---

## 1. Overview

Holdco Tycoon is a browser-based strategy game that teaches holding company capital allocation through turn-based gameplay. Players build a portfolio of operating companies, collect free cash flow, navigate market events, and make capital allocation decisions across **20 annual rounds (20 simulated years)**. The game is designed to be embedded on holdcoguide.com as a companion to *The Holdco Guide* by Peter Kang.

### Design Pillars

1. **Educational first** — every mechanic maps to a real holdco concept from the book
2. **Empire-building satisfaction** — the compounding feeling of watching a portfolio grow
3. **Strategic tension** — real tradeoffs between growth, safety, and opportunity
4. **Accessible depth** — easy to start, rewards mastery on replay
5. **Replayable** — randomized events, acquisition pools, and market conditions ensure no two games are the same

### Target Audience

- Entrepreneurs considering the holdco model
- Business owners who want to understand capital allocation
- Readers of *The Holdco Guide* looking for an interactive supplement
- MBA students and finance enthusiasts

### Session Length

- Target: 15–25 minutes per playthrough
- 20 rounds (years), each taking 45–90 seconds of decision-making

---

## 2. Game Architecture

### Tech Stack — IMPLEMENTED

- **Frontend:** React 19 + Vite 7 with TypeScript
- **Styling:** Tailwind CSS 4
- **State Management:** Zustand 5 with `persist` middleware (localStorage)
- **AI Integration:** Claude API via Vercel serverless functions (optional)
- **Deployment:** Vercel (static site + serverless API routes)
- **Persistence:** localStorage for save/resume and leaderboard

### Project Structure — IMPLEMENTED

```
holdco-tycoon/
├── api/
│   └── ai/                  # Vercel serverless API routes
│       ├── status.ts        # Check if AI (ANTHROPIC_API_KEY) is configured
│       ├── generate-deal.ts # AI-generated deal content (backstories, etc.)
│       ├── analyze-game.ts  # Post-game AI analysis
│       └── generate-narrative.ts # Dynamic narratives (events, chronicles)
├── src/
│   ├── engine/              # Core game simulation
│   │   ├── types.ts         # All TypeScript interfaces (~410 lines)
│   │   ├── simulation.ts    # FCF calc, growth, events, metrics (~840 lines)
│   │   ├── scoring.ts       # End-game scoring, leaderboard (~395 lines)
│   │   ├── businesses.ts    # Business generation, deals, roll-up logic (~600 lines)
│   │   └── deals.ts         # Deal structuring (all-cash, seller note, bank debt, earnout)
│   ├── data/
│   │   ├── sectors.ts       # 10 sector definitions with full parameters
│   │   ├── names.ts         # Business name pools by sector
│   │   ├── events.ts        # 7 global + 6 portfolio + 50 sector events
│   │   ├── sharedServices.ts # 5 shared service definitions
│   │   └── tips.ts          # Tooltips, situation tips, post-game insights
│   ├── components/
│   │   ├── screens/         # IntroScreen, GameScreen, GameOverScreen
│   │   ├── phases/          # CollectPhase, EventPhase, AllocatePhase
│   │   ├── dashboard/       # Dashboard (metrics strip)
│   │   ├── cards/           # BusinessCard, DealCard, EventCard
│   │   └── ui/              # AIAnalysisSection, AISettingsModal, InstructionsModal,
│   │                        #   MarketGuideModal, RollUpGuideModal, MetricCard
│   ├── hooks/
│   │   └── useGame.ts       # Main Zustand store (~1240 lines)
│   ├── services/
│   │   └── aiGeneration.ts  # AI service layer (server API + fallbacks)
│   └── App.tsx
├── public/
├── vercel.json              # Vercel deployment config
└── package.json
```

---

## 3. Sectors & Business Types — IMPLEMENTED

All 10 sectors are fully implemented with distinct financial characteristics. EBITDA values are stored in thousands (so 1000 = $1M).

| Sector | Emoji | Base EBITDA | Acq. Multiple | Volatility | CapEx | Growth | Recession Sens. |
|--------|-------|-------------|---------------|------------|-------|--------|-----------------|
| Marketing & Advertising | 🎨 | $800k–$3M | 2.5–5.0x | 0.18 | 3% | -2%–8% | 1.2 (cyclical) |
| Software & SaaS | 💻 | $1.2M–$4.5M | 4.5–8.0x | 0.08 | 10% | 2%–10% | 0.5 (defensive) |
| Home Services | 🔧 | $1M–$4M | 3.0–5.5x | 0.06 | 12% | 1%–6% | 0.3 (defensive) |
| Consumer Brands | 🛍️ | $900k–$3.5M | 3.5–6.5x | 0.14 | 13% | -1%–7% | 1.0 (moderate) |
| Industrial / Manufacturing | 🏭 | $1.5M–$6M | 4.0–7.0x | 0.06 | 15% | 0%–5% | 0.7 (moderate) |
| B2B Services | 📊 | $1M–$3.8M | 3.0–6.0x | 0.10 | 6% | 0%–7% | 0.8 (moderate) |
| Healthcare Services | 🏥 | $1.2M–$5M | 4.0–7.5x | 0.09 | 10% | 2%–8% | 0.2 (defensive) |
| Restaurants & Food Service | 🍽️ | $800k–$3M | 3.5–6.0x | 0.13 | 14% | -1%–6% | 0.9 (cyclical) |
| Real Estate & Infrastructure | 🏢 | $2M–$8M | 5.0–9.0x | 0.05 | 18% | 1%–4% | 0.6 (moderate) |
| Education & Training | 📚 | $700k–$2.8M | 3.0–5.5x | 0.08 | 8% | 1%–6% | -0.2 (counter-cyclical) |

Each sector also defines: `reinvestmentEfficiency`, `clientConcentration`, `talentDependency`, `sharedServicesBenefit`, `sectorFocusGroup`, and `subTypes` (4-6 sub-types for name/flavor variety).

### Sector Focus Groups — IMPLEMENTED

Sectors can share focus groups for sector concentration bonuses:
- `agency` ↔ `b2bServices`
- `saas` ↔ `b2bServices`
- `consumer` ↔ `restaurant`
- `education` ↔ `saas`
- `homeServices`, `industrial`, `healthcare`, `realEstate` — standalone groups

---

## 4. Game Mechanics — Current Implementation

### 4.1 Game Loop — IMPLEMENTED

Each round (1 year) proceeds through these phases:

```
┌─────────────┐
│  COLLECT     │  Annual FCF flows from opcos to holdco
│  CASH FLOW   │  Interest on holdco debt is deducted
│              │  Shared services annual costs deducted
│              │  Seller note payments processed
└──────┬───────┘
       ▼
┌─────────────┐
│  MARKET      │  Random event drawn and applied
│  EVENT       │  Event impacts displayed with before/after deltas
│              │  Dynamic narrative generated (if AI enabled)
└──────┬───────┘
       ▼
┌─────────────┐
│  CAPITAL     │  Player allocates cash across:
│  ALLOCATION  │  • Acquire new businesses (deal pipeline)
│              │  • Tuck-in acquisitions into platforms
│              │  • Merge two owned businesses
│              │  • Operational improvements (4 types)
│              │  • Unlock shared services (5 types)
│              │  • Pay down debt
│              │  • Issue equity / Buyback shares / Distribute
│              │  • Sell business / Wind down business
│              │  • Source additional deals ($500k)
│              │  • Set M&A focus (sector + size)
│              │  • Hold cash
└──────┬───────┘
       ▼
┌─────────────┐
│  END OF      │  Organic growth applied to all opcos
│  YEAR        │  Shared services & sector focus bonuses applied
│              │  Integration periods decremented
│              │  Metrics recalculated, history recorded
│              │  Year chronicle generated (if AI enabled)
│              │  Advance to next round
└─────────────┘
```

### 4.2 Starting Conditions — IMPLEMENTED

| Parameter | Value |
|-----------|-------|
| Starting cash | $20M (raised from investors) |
| Founder ownership | 80% (800 of 1,000 shares) |
| Starting business | 1 (player chooses sector, ~$1M EBITDA, fair quality) |
| Starting debt | $0 |
| Interest rate | 7% annual (variable based on events) |
| Tax rate | 30% blended effective rate |
| Total rounds | 20 years |
| Minimum founder ownership | 51% (enforced on equity issuance) |

### 4.3 Cash Flow Calculation — IMPLEMENTED

```
Annual EBITDA = business.ebitda
CapEx = EBITDA × sector.capexRate × (1 - sharedServicesCapexReduction)
Tax = EBITDA × 0.30
Annual FCF = EBITDA - CapEx - Tax (× cashConversionBonus if active)

Holdco Net FCF = Sum(all opco FCF)
               - (HoldCo Debt × Interest Rate)
               - Shared services annual costs
               - OpCo-level debt service (seller notes, bank debt interest)
```

### 4.4 Shared Services — IMPLEMENTED

5 holdco-level shared services that benefit the entire portfolio:

| Service | Unlock Cost | Annual Cost | Effect |
|---------|------------|-------------|--------|
| Finance & Reporting | $750k | $320k/yr | Cash conversion +5% |
| Recruiting & HR | $1M | $400k/yr | Talent loss -50%, talent gain +30% |
| Procurement | $800k | $240k/yr | CapEx rate -15% |
| Marketing & Brand | $900k | $320k/yr | Growth rate +1.5% (+2.5% for agencies/consumer) |
| Technology & Systems | $1.2M | $480k/yr | Reinvestment efficiency +20% (+30% SaaS/B2B) |

**Rules (implemented):**
- Maximum 3 shared services active at once
- Requires at least 3 active opcos to unlock
- Benefits scale 20% stronger at 5+ opcos
- Can be deactivated (no refund on unlock cost)

### 4.5 Sector Focus Bonuses — IMPLEMENTED

| Tier | Trigger | EBITDA Bonus | Acquisition Benefit |
|------|---------|-------------|---------------------|
| 1 — Emerging Expertise | 2 opcos in same focus group | +2% | — |
| 2 — Sector Specialist | 3 opcos in same focus group | +4% | -0.3x on multiples |
| 3 — Platform Operator | 4+ opcos in same focus group | +7% | -0.5x on multiples |

Sector focus also generates additional deal flow in the focus sector (Tier 1: +1 deal, Tier 2+: +2 deals per round).

### 4.6 Operational Improvements — IMPLEMENTED

Per-opco targeted improvements during the Allocate phase:

| Action | Cost | Effect |
|--------|------|--------|
| Install Operating Playbook | 15% of EBITDA | +8% EBITDA permanent, -2% volatility |
| Upgrade Pricing Model | 10% of EBITDA | +5–12% EBITDA, +1% growth |
| Expand Service Line | 20% of EBITDA | +10–18% EBITDA |
| Fix Underperformance | 12% of EBITDA | EBITDA restored to 80% of peak |

### 4.7 Acquisition System — IMPLEMENTED

#### Deal Pipeline
- Persistent pipeline that evolves over time
- 4–8 deals available per round with sector variety
- Deal freshness: 2 years before expiration (reduced from original 3)
- Three deal sources: `inbound`, `brokered`, `sourced`
- Sector weighting evolves by game stage:
  - Years 1–5: 60% cheap sectors, 30% mid, 10% premium
  - Years 6–12: 30% cheap, 40% mid, 30% premium
  - Years 13–20: 20% cheap, 30% mid, 50% premium

#### M&A Focus — IMPLEMENTED
- Player can set sector preference and size preference (small/medium/large/any)
- Focus generates 2 additional deals in chosen sector
- Size preference adjusts EBITDA multiplier (0.5–1.7x of base)

#### Deal Sourcing — IMPLEMENTED
- Pay $500k to "hire investment banker" for additional deal flow
- Generates 3 additional deals, heavily weighted toward focus sector
- One use per round

#### Deal Quality (Underwriting) — IMPLEMENTED
- 5-star quality rating (hidden, weighted distribution: 5% ⭐, 15% ⭐⭐, 40% ⭐⭐⭐, 25% ⭐⭐⭐⭐, 15% ⭐⭐⭐⭐⭐)
- Due diligence signals visible to player:
  - Revenue concentration (low/medium/high)
  - Operator quality (strong/moderate/weak)
  - EBITDA trend (growing/flat/declining)
  - Customer retention (65%–98%)
  - Competitive position (leader/competitive/commoditized)
- Quality affects: growth rate, event vulnerability, exit multiple

#### Deal Structuring — IMPLEMENTED

4 structure options generated based on deal and player's financial position:

| Structure | Cash Required | Debt Component | Risk |
|-----------|--------------|----------------|------|
| All Cash | 100% | None | Low |
| Seller Note | 40–60% | 40–60% @ 5–6%, 3-year term | Medium |
| Bank Debt | 15–25% | 75–85% @ current rate, 10-year term | High |
| Earn-out | 50–70% | 30–50% contingent on EBITDA targets | Medium |

Bank debt unavailable during credit tightening events. Earn-outs only available for quality 3+ deals.

#### Acquisition Types — IMPLEMENTED

| Type | Description | EBITDA Threshold |
|------|-------------|-----------------|
| Standalone | Independent acquisition | $500k–$2M |
| Platform | Designated as platform for bolt-ons | >$500k (60% chance >$2M) |
| Tuck-in | Folded into existing platform for synergies | <$500k |

#### Post-Acquisition Integration — IMPLEMENTED
- 2-year integration period (1 year for tuck-ins, 3 for weak operators, 1 for strong)
- EBITDA operates at -3% to -8% during integration
- Shared services & sector focus reduce friction

#### AI-Generated Deal Content — IMPLEMENTED (optional)
- Company backstories, seller motivations, quirks, red flags, opportunities
- Generated via Claude API (Vercel serverless) or fallback static content
- Fallback content always present (sector-specific backstories, motivations, quirks)

### 4.8 Roll-Up M&A Mechanics — IMPLEMENTED

#### Platform Designation
- Cost: 5% of business EBITDA
- Enables receiving tuck-in (bolt-on) acquisitions
- Platform scale: 1–3 (increases with each bolt-on)

#### Tuck-In Acquisitions
- Smaller businesses folded into same-sector platforms
- Faster integration (1 year vs 2)
- Tuck-in discount: 5–25% off asking price
- EBITDA consolidated into platform

#### Business Mergers
- Combine two owned same-sector businesses
- Cost: 10% of combined EBITDA
- Creates a new platform entity
- Uses best quality rating of the two

#### Integration Outcomes
- **Success**: +10–20% EBITDA synergies (tuck-ins get more)
- **Partial**: +3–8% EBITDA synergies
- **Failure**: -5% to -10% EBITDA penalty
- Probability affected by: quality, operator strength, sector match, shared services

#### Multiple Expansion
- Platform scale 1: +0.3x multiple
- Platform scale 2: +0.6x multiple
- Platform scale 3: +1.0x multiple
- Additional +0.15–0.3x bonus for combined EBITDA >$3M–$5M

### 4.9 Exit Mechanics — IMPLEMENTED

#### Selling a Business
Exit multiple calculated from acquisition multiple + value-creation premiums:
- **Base**: Acquisition multiple
- **EBITDA Growth Premium**: +0.5x per 100% growth (capped at 1.0x)
- **Quality Premium**: ±0.3x per rating above/below 3
- **Platform Premium**: +0.3x per platform scale level (max +0.9x)
- **Hold Period Premium**: +0.1x per year held (max +0.5x)
- **Improvements Premium**: +0.15x per improvement applied
- **Market Modifier**: +0.5x bull market, -0.5x recession
- **Floor**: 2.0x minimum exit multiple

Transparent valuation breakdown shown on each business card.

#### Wind Down
- $250k cost for businesses with negligible value
- Opco-level debt must still be repaid
- Business removed from active portfolio

#### Unsolicited Offers
- 5% chance per opco per round
- Premium of 1.2–1.8x market multiple
- Player can accept (immediate cash) or decline

### 4.10 Capital Structure — IMPLEMENTED

#### Equity Issuance
- Available after round 3, max 3 raises per game
- New shares issued at current intrinsic value per share
- Must maintain 51%+ founder ownership
- Dilutes FCF/share

#### Share Buybacks
- Repurchase outside investors' shares at intrinsic value
- Reduces shares outstanding, increases FCF/share
- Only non-founder shares can be bought back

#### Distributions
- Cash leaves holdco permanently
- Tracked cumulatively for scoring
- Affects owner yield calculation

### 4.11 Event System — IMPLEMENTED

**7 global events** (affecting entire portfolio):
| Event | Probability | Effect |
|-------|-------------|--------|
| Bull Market | 8% | All opcos +5–15% EBITDA |
| Recession | 6% | EBITDA × (1 - sector sensitivity × 0.15) |
| Interest Rate Hike | 7% | +1–2% interest rate (max 15%) |
| Interest Rate Cut | 6% | -1–2% interest rate (min 3%) |
| Inflation Spike | 5% | +3% capex rates for 2 years |
| Credit Tightening | 4% | No bank debt for 2 years |
| Quiet Year | 22% | No effect |

**6 portfolio events** (affecting one random opco):
Star Operator Joins, Key Talent Leaves, Major Client Signs, Largest Client Churns, Operational Breakthrough, Compliance Issue

**50 sector-specific events** (5 per sector):
Each sector has a mix of positive and negative events with specific EBITDA effects, growth effects, and costs. Sector events only trigger for owned sectors.

**Event impact tracking** — IMPLEMENTED:
Every event displays before/after/delta for all affected metrics (EBITDA, interest rate, cash).

**Educational tips** — IMPLEMENTED:
Every event shows a contextual tip referencing real holdco examples from the book.

### 4.12 Organic Growth — IMPLEMENTED

```
Annual growth = base organic rate
              + sector volatility × random(-1, 1)
              + shared services growth bonus
              + sector focus bonus
              - integration penalty (if applicable)

New EBITDA = Current EBITDA × (1 + annual growth)
Floor: 30% of acquisition EBITDA
```

---

## 5. Scoring System — IMPLEMENTED

### 5.1 Live Dashboard

Metrics displayed in real-time during gameplay:
- Cash, Total Debt, Total EBITDA, FCF/Share
- Portfolio ROIC, ROIIC, Portfolio MOIC
- Net Debt/EBITDA (Leverage), Cash Conversion
- Interest Rate, Shares Outstanding
- Founder ownership percentage

All metrics have `?` tooltips with definitions, formulas, benchmarks, and book chapter references.

### 5.2 End-of-Game Scoring (100 points)

| Category | Max Points | Scoring Logic |
|----------|-----------|---------------|
| FCF/Share Growth | 25 | 300%+ growth = 25 pts (accounts for dilution) |
| Portfolio ROIC | 20 | 25%+ ROIC = 20 pts |
| Capital Deployment (MOIC + ROIIC) | 20 | 10 pts MOIC (avg >2.5x) + 10 pts ROIIC (avg >20%) |
| Balance Sheet Health | 15 | <1.0x Net Debt/EBITDA = 15 pts; penalty for ever >4x |
| Strategic Discipline | 20 | Sector focus (5) + shared services ROI (5) + distribution hierarchy (5) + deal quality (5) |

### 5.3 Grades

| Score | Grade | Title |
|-------|-------|-------|
| 90–100 | S | Master Allocator — "You'd make Buffett proud" |
| 75–89 | A | Skilled Compounder — "Constellation-level discipline" |
| 60–74 | B | Solid Builder — "Your holdco has real potential" |
| 40–59 | C | Emerging Operator — "Room to sharpen your allocation instincts" |
| 20–39 | D | Apprentice — "Study the playbook and try again" |
| 0–19 | F | Blown Up — "Tyco sends its regards" |

### 5.4 Post-Game Report — IMPLEMENTED

- Score breakdown with bar charts
- Portfolio summary (active + exited businesses with quality stars revealed)
- Capital flow summary
- 2–3 personalized insights based on 13 behavior patterns
- Enterprise value calculation
- Leaderboard (localStorage, top 10 by EV)
- AI Performance Analysis (if API enabled) — personalized review with strengths, areas for improvement, specific lessons, "what if" scenarios
- Play Again button, Reset button

---

## 6. AI Integration Layer — IMPLEMENTED (Optional)

The game has a full AI integration layer using Claude API via Vercel serverless functions. All AI features are optional — the game works fully without them via static fallback content.

### 6.1 Server-Side Architecture

4 Vercel serverless API routes:
- `GET /api/ai/status` — checks if `ANTHROPIC_API_KEY` is configured
- `POST /api/ai/generate-deal` — generates rich deal content (backstory, motivation, quirks)
- `POST /api/ai/analyze-game` — post-game personalized AI analysis
- `POST /api/ai/generate-narrative` — dynamic narratives (events, business updates, year chronicles)

### 6.2 AI-Generated Deal Content
- Company backstories and founding history
- Realistic seller motivations
- Interesting quirks about each business
- Red flags for lower quality businesses
- Upside opportunities for higher quality ones
- Fallback: static sector-specific content always available

### 6.3 Post-Game AI Analysis
- Overall performance assessment based on actual gameplay data
- Key strengths with specific numbers
- Areas for improvement with actionable recommendations
- Specific lessons tied to PE/holdco principles
- "What if" scenarios suggesting alternative paths
- References to famous investors
- Fallback: rule-based insights work without API

### 6.4 Dynamic Narratives
- **Event narratives**: Immersive context for market events
- **Business story updates**: Generated at milestones (Year 1, 5, 10, after improvements)
- **Year chronicles**: Annual summary of holdco progress
- **Story beats**: Tracked per business (last 5 kept)
- Fallback: pre-written narrative pools for each event type

---

## 7. UI/UX — IMPLEMENTED

### 7.1 Visual Direction

- Dark theme with teal (#4ECDC4) primary accent
- Custom CSS variables for color system
- Tailwind CSS 4 for styling
- Sector-specific colors on cards and badges

### 7.2 Screen Flow — IMPLEMENTED

```
[INTRO]           Name your holdco, choose starting sector (10 options)
    │             Required name (min 2 chars), sector selection grid
    ▼
[TUTORIAL]         5-page instructions modal (shows on first play)
    │             Holdco premise, annual cycle, key metrics, capital hierarchy, tips
    ▼
[GAME LOOP]        20 rounds of: Collect → Event → Allocate → End Year
    │             Top bar: holdco name, year, progress bar, reset button
    │             Dashboard strip: 9 key metrics with color coding and tooltips
    │             Phase panel: changes content based on current phase
    ▼
[GAME OVER]        Score, grade, report, AI analysis, insights, leaderboard, replay
```

### 7.3 Key UI Features — IMPLEMENTED

- **Dashboard strip**: 9 metrics (Cash, Total EBITDA, FCF/Share, ROIC, ROIIC, MOIC, Leverage, Cash Conv., Interest Rate) with color-coded thresholds and hover tooltips
- **Collect Phase**: FCF waterfall showing EBITDA → CapEx → Taxes → OpCo Debt → HoldCo Costs → Net FCF per business, expandable details
- **Event Phase**: Event card with impact summary (before/after/delta), educational tips, dynamic narrative
- **Allocate Phase**: Full allocation interface with tabs:
  - Deals tab: deal pipeline with M&A focus selector, deal sourcing button, Market Guide
  - Portfolio tab: owned businesses with sell/improve/platform actions, merge modal, Roll-Up Guide
  - Capital tab: debt paydown, equity issuance, buybacks, distributions
  - Shared Services tab: unlock/deactivate services
- **Deal Cards**: Quality signals, asking price, structure options, AI-generated company story (collapsible), tuck-in indicators, acquisition type badges
- **Business Cards**: EBITDA, growth rate, quality, platform status, valuation breakdown (expandable), sell/improve buttons
- **Game Over Screen**: Score breakdown, grade, portfolio summary, AI analysis section, personalized insights, leaderboard

### 7.4 Modals — IMPLEMENTED

- **Instructions Modal**: 5-page RPG-style tutorial, reopenable via "?" button
- **Market Guide Modal**: All sectors with multiple ranges, EBITDA ranges, growth, volatility, recession sensitivity. Sortable table.
- **Roll-Up Guide Modal**: Explains platform mechanics, tuck-in acquisitions, mergers, multiple expansion
- **Deal Structuring Modal**: Side-by-side comparison of financing options
- **Merge Modal**: Select two same-sector businesses to combine
- **Reset Confirmation Modal**: Prevents accidental game resets

---

## 8. Data Layer — IMPLEMENTED

### 8.1 Business Names
- Sector-specific name pools (unique per game, no replacement within a session)
- `resetUsedNames()` on game start

### 8.2 Events Catalog
- 7 global event definitions with probabilities
- 6 portfolio event definitions
- 50 sector-specific events (5 per sector) with EBITDA effects, growth effects, costs, and educational tips
- Event probability adjustments based on shared services (talent retention/gain)
- Sector focus reduces negative sector event impact at Tier 2+ (not yet implemented in event application — see Planned)

### 8.3 Shared Services Data
- 5 services with unlock costs, annual costs, descriptions, and effects
- Constants: MIN_OPCOS = 3, MAX_ACTIVE = 3

### 8.4 Educational Tips
- Metric tooltips (9 metrics with definition, formula, benchmark, chapter reference)
- Situation tips (12 context-specific tips triggered by game state)
- Shared service unlock tips (5)
- Post-game insight patterns (13)

---

## 9. Persistence & State — IMPLEMENTED

### Zustand Store
- Full game state persisted to localStorage (`holdco-tycoon-save-v5`)
- Selective persistence (excludes computed values)
- Computed metrics recalculated on state changes
- Save/resume: returning to the app restores game in progress

### Leaderboard
- Top 10 entries stored in localStorage
- Sorted by enterprise value
- Tracks: holdco name, initials, EV, score, grade, business count, date

---

## 10. What's NOT Yet Implemented (Planned / Partial)

### From Original PRD — Not Built

1. **Cash Flow River Animation** (§7.3 of original PRD)
   - The Sankey-style animated flow visualization during Collect phase
   - Currently: static FCF waterfall table (functional but not animated)

2. **Allocate Phase Outbound Flow Visualization**
   - Animated streams showing where cash goes during allocation
   - Currently: standard allocation UI without flow animation

3. **Portfolio Health Heatmap**
   - Horizontal bar showing portfolio composition and health at a glance
   - Not implemented

4. **Sector Focus Event Modifiers**
   - Tier 2: -20% negative sector events, Tier 3: -40% negative / +20% positive
   - Sector focus EBITDA bonuses work, but event probability modifiers not applied

5. **Integration Friction Based on Shared Services**
   - "Technology & Systems" should reduce integration period from 2 to 1 year
   - Not implemented (integration period is static based on operator quality)

6. **Post-Acquisition EBITDA Operating at 85–95%**
   - Currently integration causes growth penalty but not an explicit EBITDA haircut

7. **Difficulty Modes** (Easy/Normal/Hard)
8. **Holdco Archetype Selection** (Capital Allocator/Operational/Roll-Up)
9. **Sound Design**
10. **Share-Your-Score Image Generation**
11. **Score Reveal Animations** (sequential bar fills)
12. **Responsive Mobile Layout** (partial — works on desktop, not optimized for mobile)

### Partially Implemented

1. **Earn-out Mechanics**: Structure option exists, but earn-out resolution (did targets get hit?) is not tracked/resolved over time
2. **Bank Debt Amortization**: Bank debt amount tracked but 10-year amortization schedule not fully simulated
3. **Unsolicited Offer Integration with Events**: Works but narrative integration could be richer

---

## 11. Development History

### Session 1 — Core Game Conversion
- Converted from 20 quarters to 20 years
- Added enterprise value calculation
- Created leaderboard system

### Session 2 — Game Polish & M&A Focus
- Player chooses starting sector
- Increased deal pipeline to 4–8 deals with sector variety
- Added M&A Focus feature (sector + size preferences)
- Scaled dollar amounts to millions
- Added cap table mechanics ($20M raise, 80% founder ownership)
- Created 5-page instructions modal

### Session 3 — Roll-Up M&A & Financial Clarity
- Roll-up mechanics: platform designation, tuck-in, merge
- Integration outcomes and synergy calculations
- Multiple expansion for platforms
- Logical exit valuation system with transparent breakdown
- Event impact tracking (before/after/delta)
- FCF waterfall in Collect phase

### Session 4 — AI Enhancement & Market Guide
- AI-generated M&A targets (Claude API via Vercel serverless)
- Post-game AI performance analysis
- Market Guide modal (sector multiple benchmarks)
- AI settings modal (API key management) → later moved to server-side
- Vercel serverless API routes
- Deal sourcing feature ($500k for additional deal flow)
- Roll-Up Guide modal
- Net Cash display when debt < cash
- Dynamic narratives system (event narratives, business stories, year chronicles)
- Reset game button with confirmation

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Average session length | 15–25 minutes |
| Completion rate (reach game-over) | >60% of starts |
| Replay rate | >25% play a second game |
| CTA click-through (book link) | >10% of completions |
| Bounce rate (leave before year 3) | <20% |

---

*This PRD is based on concepts from The Holdco Guide: How Entrepreneurs Structure & Build a Holding Company That Lasts by Peter Kang. All sector parameters, event references, and educational content are derived from the book's chapters and appendix.*
