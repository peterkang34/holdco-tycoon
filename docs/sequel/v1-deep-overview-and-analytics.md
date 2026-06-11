# Holdco Tycoon v1 — Deep Overview & Analytics Takeaways

**Purpose:** A single reference document for brainstorming and building a sequel ("v2"). Part I is a comprehensive map of what v1 is — every mode, mechanic, system, and the engineering lessons it cost us. Part II is an analysis of real production gameplay/adoption data (snapshot June 11, 2026) with conclusions about what worked, what didn't, and what that implies for a new version.

**Compiled:** June 11, 2026, from the codebase at HEAD plus live data pulled from the production public APIs.

---

# Part I — What Holdco Tycoon v1 Is

## 1. Elevator summary

Holdco Tycoon is a browser-based, single-player business simulation where the player builds a holding company over 10–20 annual rounds: acquiring small businesses across 20 sectors, structuring deals with debt and seller financing, improving operations, forging integrated platforms (roll-ups), and compounding Founder Equity Value (FEV). It is explicitly **educational** — every mechanic maps to a real capital-allocation concept (sourced from The Holdco Guide / ILTB operator frameworks), and AI-generated debriefs teach players what they did well or badly in real PE/holdco terms.

- **Stack:** React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + Zustand 5; Vercel serverless API; Supabase (auth + Postgres); Vercel KV (Redis) for leaderboards/telemetry; Anthropic API (Haiku 4.5 player flows, Sonnet 4.6 admin flows).
- **Deployed:** https://game.holdcoguide.com
- **Scale:** ~10K lines of pure-TS engine, ~3,000 tests across 54 suites, 20 sectors, 52 platform recipes, 140+ events, 35 achievements, 7 deal structures, 6+ game modes, save format at **v44** (44 state-shape migrations).
- **All monetary values in thousands** (1000 = $1M) — a convention that pervades every file.

## 2. Core game loop & economy

### The round cycle (10 or 20 annual rounds)

1. **Collect** — FCF flows from opcos to holdco; debt service, taxes (30% with interest/loss/shared-services shields), interest updates.
2. **Restructure** (conditional) — triggered by 2+ consecutive covenant-stressed/breach rounds.
3. **Event** — one macro/portfolio/sector event with visible before/after impact and sometimes player choices.
4. **Allocate** — the heart of the game: 8 tabs of capital allocation (Deals, Portfolio, Capital, Shared Services, Sourcing, Debt, Turnarounds, Transactions).
5. **End Year** — organic growth, synergy bonuses, integration-drag decay, metrics recorded.

### Difficulty & duration

| | Easy | Normal |
|---|---|---|
| Starting cash | $20M | $5M (+$3M holdco debt) |
| Founder ownership | 80% | 100% |
| Leaderboard multiplier | ×0.9 | ×1.35 |

Duration: Quick (10yr) or Standard (20yr). Standard adds deal-multiple inflation from round 11 (+0.5x/yr, capped +3.0x; financial crisis resets −2.0x) and unlocks IPO (round 16+) and the Family Office endgame.

### Businesses & sectors (20)

agency, saas, homeServices, consumer, industrial, b2bServices, healthcare, restaurant, realEstate, education, insurance, autoServices, distribution, wealthManagement, environmental, privateCredit, mediaEntertainment, fintech, aerospace, proSports (Family-Office-exclusive).

Each sector has distinct EBITDA ranges, acquisition multiples (e.g., SaaS 4.5–8x vs. agency 2.5–5x), margins, growth, capex, volatility, recession sensitivity, and 6–7 operational **sub-types** with affinity groups. Businesses have a 1–5 quality rating (weighted 5/15/40/25/5), auto-generated due-diligence signals, and growth negatively correlated with quality (junk grows faster — a deliberate risk/reward axis). Four sectors are **achievement-gated unlocks** (mediaEntertainment, fintech, aerospace, privateCredit); proSports is FO-only. Special sector mechanics: distribution route-density bonus, privateCredit lending synergy (−75/−50/−25bp on debt cost, −150bp cap, 3% floor).

### Deal structures (7)

All-cash, seller note (40/60 @ 5–6%, 5yr), bank debt, earnout (10–25% deferred on growth targets), note+bank hybrid, rollover equity (seller keeps 20–25%, grants +1.5% growth/+0.5% margin for 4yrs, claims FEV at exit), and share-funded (post-IPO only). Deal **heat** (cold/warm/hot/contested) adds 0–30% price premium. Deal pipeline scales with affordability tier (micro → trophy) and M&A sourcing tier (0–3, purchased upgrades; tier 2+ unlocks sub-type focus).

### Platforms & roll-ups (the signature mechanic)

- **Designate** a platform → **tuck in** acquisitions (size-ratio tiers: ideal/stretch/strained/overreach, integration drag −3ppt growth decaying 50–65%/yr) → or **merge** peers (balanced mergers ≤2x ratio earn +0.5x exit multiple).
- **52 forged-platform recipes** (per-sector + cross-sector + one 3-sector): require 2–3 specific sub-types + an EBITDA threshold (scaled by mode), cost 18–25% of combined EBITDA, and grant margin (+3–5ppt), growth (+1–4%), multiple expansion (+1.0–2.0x), and recession resistance. One recipe (Vertical SaaS+Services) is achievement-gated.
- Platform scale score compounds into exit premium (log-scaled, capped).

### Portfolio-level systems

- **Shared services** (5 types: finance, HR, procurement, marketing, tech) — portfolio-wide buffs with an opco-count scale multiplier, and they offset the **complexity cost** (a nonlinear revenue tax above 5–8 opcos that prevents infinite sprawl).
- **Sector focus bonuses** (2/3/4+ same sector: +2/+4/+7% EBITDA + deal flow), **sub-type specialization** (3/4/5 same sub-type, enhanced tiers achievement-gated), **route density** (distribution).
- **Turnarounds** (3 tiers, success/partial/fail outcomes, quality-tier upgrades, fatigue penalty at 4+ simultaneous, ceiling-mastery permanent bonus).
- **Operational improvements** (7 types, quality-gated, efficacy scaled by quality).

### Distress, leverage, and failure

Net-debt/EBITDA ladder: Comfortable (<2.5x) → Elevated → Covenant Watch (3.5–4.5x, no bank debt, +1% rate) → Breach (≥4.5x, no acquisitions/distributions/buybacks, +2%). Two consecutive breach rounds force **Restructuring** (one-time −20% FEV); further breaches → **Bankruptcy** (F, score 0). This is the game's only real fail state.

### Exit valuation & scoring

Exit multiple = base + ~14 stacking premiums (growth, quality, platform scale, hold period, improvements, market cycle, size tier, de-risking, competitive position, Rule of 40, margin expansion, merger, forged-platform, turnaround) × a 2-year seasoning ramp, floored at 2.0x. EV = Σ(EBITDA × multiple) + cash − all debt (bank + seller notes + rollover claims) + IPO sentiment boost. **FEV = EV × founder ownership%** is the primary metric; the leaderboard ranks **adjustedFEV** = FEV × difficulty (0.9/1.35) × restructuring penalty × FO multiplier (1.0–1.5).

The 0–100 **score** has 6 dimensions: Value Creation (20), FCF/Share Growth (20), Portfolio ROIC (15), Capital Deployment (15), Balance Sheet Health (15), Strategic Discipline (15). Grades S (90+) through F.

### Events (140+)

14 global macro (recession, crisis, rate moves, oil-shock cascade with choices, yield-curve inversion doubling recession odds…), 19 portfolio events (key-man, MBO offers, seller deception, cyber breach, earnout disputes…), per-sector events, and filler narrative. Macro cycle (expansion→crisis) is derived from trailing events and modulates deal pricing and exit multiples.

## 3. Game modes

| Mode | Setup | Distinctives |
|---|---|---|
| **Core Holdco** (Easy/Normal × Quick/Standard) | above | The main game; 4 config combos |
| **PE Fund Manager** | $100M committed, 10yr forced liquidation @90% | 2% fee, 8% hurdle, 20% carry, supercarry scaling with net IRR; **LP satisfaction 0–100** (5 moods, two LP characters with commentary, advisory-committee approval gates); DPI distributions; separate 6-dimension PE scoring (MOIC/IRR/deployment/risk/LP); separate leaderboard tab ranked by carry; PE-specific AI debrief. Fund economics parameterized in `fundStructure.ts` so scenarios can override. |
| **Business School** | 2yr, 3 preset businesses, $6M | Guided 15-step checklist teaching the full skill tree (improve → sell → seller note → LBO → platform forge → equity → distribute → exit). Emerald theme, curated deals/events, graduation diploma + account-signup nudge. No achievements (sealed sandbox). |
| **Family Office** (endgame) | Post-game for qualifying 20yr runs | Mandatory 25% philanthropy (with narrative stories), 4–5 bonus rounds, exclusive proSports sector (15–35x multiples, 200 real teams), FO multiplier 1.0–1.5x on adjustedFEV, Legacy grade (Enduring/Influential/Established/Fragile). |
| **Scenario Challenges** | Admin-authored, 3–30 rounds, time-limited | Themed events with custom starting state, curated deal pools, feature gates, sector allowlists, metric-based triggers, custom ranking metric (FEV/MOIC/IRR/carry); standalone KV leaderboards archived to Postgres; account-required-to-play; publish-immutability; GUI builder (JSON+AI authoring shelved). Sealed sandbox: no global achievements, unlock gates suspended. Currently flag-gated (`VITE_SCENARIO_CHALLENGES_ENABLED`), effectively admin-only until recently. |

## 4. Meta & retention systems

- **35 achievements** in 5 categories (milestones/feats/mastery/creative/mode-specific) with rarity tiers, pure-predicate checks, and **server-side recomputation** from game_history (client can't be trusted). Achievements gate sector unlocks (5/11/16 thresholds) and one platform recipe.
- **Prestige titles** — 7 tiers (Rookie → Legendary Allocator) from games played + avg score + achievements + S-grades; shown on leaderboard.
- **Leaderboard** — 7 tabs, KV sorted sets, top 500 stored / 50 shown; PE separated; per-scenario boards; verified badge; plausibility validation on submit (grade/score coherence, FEV ≤ EV × 1.2, etc.).
- **My Stats** — personal records, score sparkline, vs-community comparison, archetype profile, full game history with drill-downs, achievement browser, scenario records.
- **Operator's Playbook** — auto-generated 7-section strategy document per game (thesis, sectors, capital structure, portfolio construction, operations, exits, AI lessons), persisted, shareable via opaque URL. The AI debrief references real allocator frameworks.
- **Strategy archetypes** — every game is classified (balanced, serial_acquirer, dividend_cow, roll_up_machine, platform_builder, focused_operator, turnaround_specialist, value_investor, conglomerate) plus anti-pattern detection and a 0–100 sophistication score.
- **Changelog** — in-game "What's New" modal, 50+ entries.

## 5. Auth & persistence

- Supabase: anonymous session auto-created on load → upgrade via Google OAuth (implicit flow) or Magic Link with `linkIdentity` preserving the UUID. Postgres trigger auto-creates `player_profiles`.
- **Auto-save every completed game** to `game_history` via fire-and-forget `fetch` with `keepalive: true` (survives tab close / Play Again), deduped atomically by a server-computed `completion_id` UNIQUE index.
- Save migrations v9 → v44: ~35 migration functions. The cadence tells the story — rapid mechanical expansion early, stabilization mid-life, then 2–3 migrations per bolted-on mode (PE v35–37, B-School/scenarios v41–44).

## 6. AI features & cost model

- **Per-game debriefs** (`/api/ai/analyze-game`, Haiku 4.5, ~$0.003/call) with mode-specific prompts (holdco / PE / bankruptcy branches); rule-based fallback works without API key.
- **Narratives**: event stories, business story beats, year chronicles — handwritten pools first, AI enrichment second (cost control).
- **Deal backstories** with 6 seller archetypes — fetched on demand, never pre-loaded.
- **Admin scenario generation** used Sonnet 4.6 for strict schema output (now shelved with the JSON editor; GUI builder replaced it).
- Total AI cost ≈ $0.03/game. Hard rule: never put Sonnet in player flows — cost compounds at scale.

## 7. Data & analytics infrastructure (what v1 tracks)

Three layers, all custom (no GA/PostHog/Vercel Analytics):

1. **KV telemetry** (`/api/telemetry/event`, rate-limited, session-deduped): game_start/complete/abandon, page views, monthly+daily keys for unique players, config splits, sector picks, grade/FEV buckets, **abandon-by-round**, device splits (start/complete/abandon), returning-player buckets, session duration, nth-game funnels, sophistication buckets, challenge-share funnel. Read only by the admin dashboard (`/api/admin/analytics`, KV-session-token auth).
2. **Postgres** (Supabase): `game_history` (full per-game record incl. JSONB strategy snapshot + 6 score dimensions + playbook), `player_profiles`, `player_stats` (precomputed per-player aggregates incl. archetype stats, anti-pattern frequency, score trend), `global_stats` singleton, `scenarios_archive`.
3. **KV completions feed** (`/api/completions/submit`, unauthenticated observe-all, last 500) + B-School completion track with signup-conversion measurement.

Admin dashboard tabs: Overview (health alerts: unique-player −30% drop, <40% completion rate), Community (player CRM + email export), B-School funnel, Scenario builder, Feedback.

**Public endpoints** (used for Part II): `/api/leaderboard/get` (full top-500), `/api/scenario-challenges/{list,active,leaderboard,config}`, `/api/player/public-profile?id=` (per-player totals for verified leaderboard entries).

## 8. Architecture & hard-won engineering lessons

### Shape of the codebase

- Pure engine (`src/engine/`, ~10K lines) cleanly separated from the Zustand store (`useGame.ts`, **~6,900 lines** — the god-file) and UI. `AllocatePhase.tsx` ~3,900 lines. `GameOverScreen.tsx` was successfully decomposed into 13 children — the pattern to follow.
- Deterministic seeded RNG → reproducible games (seed stored with every entry).
- Exceptional structural test culture: display-proofreader (UI copy vs engine constants), coverage-tripwires (new exports/types must register), switch-exhaustiveness, drilldown parity (engine vs UI math), Monte Carlo playtests.

### The incident log (each cost a real production bug — bake these into v2)

1. **Scattered mode checks** — 130+ `isFundManagerMode` conditionals across 20 files. Centralize mode behavior in a config module from day 1.
2. **Trust nothing client-sent** — forged dedup keys, score validation, server-side achievement recomputation all exist because clients lie.
3. **Derived-total drift** — cached `state.totalDebt` resynced by some mutators but not others. Compute derived values at read time, or enforce resync with invariant tests.
4. **Value/debt set mismatch** — a business's value counted in score while its debt was dropped by a different `status` filter; inflated leveraged roll-ups for ~4 months. Any new business `status` requires auditing every status filter.
5. **KV member-shape ambiguity** — Upstash returns sorted-set members as string OR object; readers that assumed one form silently dropped entries. Normalize at ingestion; test both shapes.
6. **UI eligibility vs store-action gates** — a button rendered by one predicate while the action checked another extra gate = silent no-op. Route both through one predicate.
7. **Async auth races** — read auth state synchronously from the store, never via effects racing OAuth.
8. **Cache-header invisibility** — 24h CDN cache hid a newly added API field; mutable data needs short cache or cache-busting.
9. **`keepalive: true`** for anything fired at game end, or data dies when the player clicks Play Again.
10. **Mode sprawl ≈ migration sprawl** — 44 save versions; each bolted-on mode cost 2–3 migrations and scattered conditionals.

### What was designed-in vs bolted-on

Designed-in: sectors, deals, platforms/tuck-ins, shared services, events, scoring. Bolted-on (with visible seams): PE Fund, Business School, Family Office, Scenario Challenges, achievements/unlocks, accounts/auto-save, buyer profiles. The bolt-ons are the most *product-interesting* parts — which is exactly the argument for designing v2's skeleton around modes, accounts, and live-ops from the start.

## 9. Product evolution timeline (compressed)

1. **Sessions 1–3:** core conversion (annual rounds, EV, leaderboard) → M&A focus, sector choice, cap table → roll-up mechanics, exit-valuation transparency, FCF waterfall.
2. **Session 4:** AI layer (deal backstories, debriefs, market guide, narratives).
3. **Session 5:** hardening audit (41 bugs, first 165 tests).
4. **Session 6:** dynamic multiple expansion, buyer profiles, de-risking premiums.
5. **Feb–Mar 2026 (the big push):** public launch + accounts (OAuth/Magic Link/auto-save) + achievements/prestige/sector unlocks + Business School + PE Fund Manager + Family Office + Pro Sports + turnaround overhaul.
6. **Apr 2026:** portfolio synergies (route density, sub-type specialization).
7. **Jun 2026:** Scenario Challenges platform + Operator's Playbook + a string of scoring/leaderboard correctness fixes.

---

# Part II — Production Analytics (snapshot June 11, 2026)

## Methodology & caveats

This environment has no database credentials, so the analysis uses **public production endpoints only**: the full global leaderboard (`/api/leaderboard/get`, 482 entries, the complete `leaderboard:v2` keyspace — not a truncated top-N), public player profiles for all 20 verified players on the board, and the scenario endpoints. Important biases:

- **Leaderboard entries are submitted games**, not all games. Players who finish but don't submit, abandon mid-game, or only play B-School are invisible here. The KV telemetry (starts, completions, abandon-by-round, device, returning-player buckets) covers that funnel but requires an admin token — **recommended follow-up: export `/api/admin/analytics` and `/api/admin/bschool-stats` and append the funnel numbers to this doc.**
- Dates span Feb 13 – Jun 9, 2026 (the life of the `leaderboard:v2` keyspace, which matches the public-launch window).
- `strategy` snapshots exist on 322/482 entries (added partway through); `dealStructureTypes` is populated on only 3 entries and `rolloverEquityCount` is 0 everywhere — these specific fields are **data gaps**, not usage facts.

## The numbers

### Adoption curve (leaderboard submissions/month)

| Month | Entries | Unique verified players | Anonymous entries |
|---|---|---|---|
| 2026-02 (from Feb 13) | 149 | 3 | 72 |
| 2026-03 | **207 (peak)** | 11 | 75 |
| 2026-04 | 93 | **13 (peak)** | 12 |
| 2026-05 | 28 | 6 | 9 |
| 2026-06 (to Jun 9) | 5 | 2 | 0 |

### Player concentration (the headline finding)

- **20 unique verified accounts** ever appear on the board; 327/482 entries (67.8%) are verified.
- **Top 5 players account for 49.2% of ALL entries.** Per-profile totals (from public profiles): 67, 56, 25, 15, 15, 7, 4, 4, 3, 3, 3, 1, 1, 1 games — plus 6 accounts showing 0 recorded games. The #1 account (PTK, 67 games, 30 achievements) is the developer; #2 (LEO, 56 games, avg score 93, 38 S-grades) is a genuine superfan.
- Anonymous submissions collapsed after March (72 → 75 → 12 → 9 → 0).

### Mode & difficulty mix (of 482)

easy/quick 183 (38%) · normal/standard 121 (25%) · easy/standard 93 (19%) · normal/quick 85 (18%). All four configs see real use; the lowest-commitment combo wins.

### Skill & scoring distribution

- Grades: **S 149 + A 245 = 82%** of submissions; B 40, C 35, D 10, F 3. Median score 90, p75 = 94, max 99 (no one has hit 100).
- Six-dimension averages (n=322): valueCreation 14.2/20 (71%), fcfShareGrowth 12.8/20 (64%), capitalDeployment 10.1/15 (67%), portfolioRoic 8.6/15 (57%), balanceSheetHealth 8.5/15 (57%), **strategicDiscipline 7.6/15 (51%)** — discipline and ROIC are where games are actually differentiated; value creation is nearly maxed by everyone who submits.
- Sophistication score: median 45, p75 60, max 90 (of 100).

### Economy & balance

- FEV distribution: p25 $0.1B, median **$1.4B**, p75 $8.4B, max **$3,126B ($3.1 trillion)** — from a $5–20M start. The top end compounds ~2,000× past the median: late-game snowballing is effectively unbounded.
- Acquisitions per game: median 18, p75 31, max 94. Business count at end: median 4, max 28.
- Peak leverage: median 2.3x, p95 4.8x, max 7.6x; only 28% ever exceed 3x — the covenant ladder successfully scares people.
- Turnarounds: 89% success rate across all submitted games (776 succeeded / 94 failed) — too safe to be a meaningful gamble.
- Family Office: completed in 10% of submitted games, and **40 of 48 (83%) earned the top "Enduring" legacy grade** — the endgame is a victory lap, not a challenge.

### Strategy diversity (n=322 with snapshots)

- Archetypes: balanced 77, serial_acquirer 61, dividend_cow 56, focused_operator 33, turnaround_specialist 30, roll_up_machine 29, platform_builder 27, value_investor 5, conglomerate 4. Healthy spread — no single dominant strategy *label*, though acquisition volume clearly drives FEV.
- Sector usage is remarkably even across all 15 base sectors (b2bServices 94 ... distribution 38); gated sectors trail as expected (fintech 23, mediaEntertainment 22, privateCredit 21, aerospace 11) — the unlock gating works but ~75% of submitted games never touch a gated sector.
- Feature usage: sells 83%, platforms forged 66% (avg 2.7 when used), shared services 65%, M&A sourcing Tier 3 reached in 54% of games, distributions 53%, turnarounds 36%, buybacks 31%, equity raises 31%.

### Scenario Challenges

One scenario live (B2B Tech Challenge, published Jun 9), **2 entries** — one is the developer. The feature shipped days ago behind a flag, so this is "too early to read," but it means the substantial scenario infrastructure (builder, archives, account walls, per-player records) is so far unvalidated by players.

## Takeaways

1. **Acquisition spike, retention cliff.** The launch window (Feb–Mar) generated ~75% of all lifetime submissions; by June the game is at ~2% of peak monthly volume. There is no recurring reason to return: no new content cadence, no social pull, no seasonal reset. The entire live-ops apparatus (scenarios) arrived 3 months after the audience left. **Sequel implication: the content/competition cadence must exist at launch, not after.**

2. **The game mints superfans but not a middle class.** One non-developer player finished 56 games at an average score of 93; several played 15–25. The depth is genuinely retentive *for people who get over the hump* — but the distribution is a brutal power law (top 5 = half of everything). The funnel problem is between game #1 and game #3, and between anonymous play and caring. **Sequel implication: invest in the first-three-games experience (B-School already exists — measure and shorten the path from graduation to a "real" win) and in giving the mid-tail social/competitive reasons to play games 4–10.**

3. **The scoring ceiling is gone for engaged players.** 82% of submissions grade A/S; the median submitted score is 90; FEV compounds to absurdity ($3.1T). Mastery has nowhere to go, so mastery-driven players churn. The two lowest-scoring dimensions (strategic discipline 51%, ROIC/balance-sheet 57%) show where genuine skill expression still lives. **Sequel implication: design the difficulty curve for the top quartile — prestige difficulties, anti-snowball economics (diminishing returns on portfolio scale already exist via complexity cost but are clearly beaten), score normalization, or opponent/market pressure that scales with the player.**

4. **Risk is underpriced everywhere.** 89% turnaround success, only 3 F-grades ever submitted, bankruptcy nearly unheard-of among submitters, FO legacy grade 83% top-tier, leverage rarely taken past 3x because it's never *worth* taking. The game's tension systems (distress ladder, integration risk, events) read as speed bumps. **Sequel implication: make downside real — fat-tailed events, genuinely risky leverage with genuinely better returns, turnarounds that fail ~40% of the time with stakes.**

5. **The conversion funnel actually worked; anonymous play then died.** 67.8% of entries are verified — strong for a browser game — and anonymous submissions fell to zero as account features (and the scenario account wall) landed. That's fine for data quality but it means the frictionless top-of-funnel quietly closed. **Sequel implication: keep zero-friction anonymous play as the permanent front door; convert with value (saved playbooks, streaks, records), not walls.**

6. **Feature ROI is measurable and uneven.** Earned their complexity: platforms (66% usage, the game's identity), M&A sourcing (54% max-tier), shared services (65%), sells/exits (83%). Underused relative to build cost: buybacks/equity raises (31%), rollover equity (~0 — possibly also a data gap, but directionally dead), IPO (rare), the 4 gated sectors (¼ of games), and — so far — the entire scenario platform. **Sequel implication: port the proven core; treat the rest as candidates to cut, redesign, or surface much earlier. Don't port 52 platform recipes and 140 events on day 1 — port the 20 recipes and 40 events that carry the experience.**

7. **Instrument from day 1, in one place.** v1's analytics grew in five phases across three stores (KV telemetry, Postgres history, KV completions), `strategy` snapshots only exist for 2/3 of history, and key fields (`dealStructureTypes`, rollover usage) were added too late to answer questions we now have. The admin funnel data (starts vs completions, abandon-by-round, device, returning buckets) exists but lives behind admin auth and 6-month KV retention. **Sequel implication: single durable event store, full strategy snapshot from the first game ever recorded, and retention/funnel dashboards as a launch-blocking feature.**

8. **The single-player education thesis is validated; the entertainment loop is not.** People who came to *learn* (the B-School → real game path, the AI debriefs, playbooks) engaged deeply, and the archetype spread shows the design supports many viable styles. What's missing is a reason to come back Tuesday. The shortest path to a sequel that retains: keep the simulation, add **time** (seasons/weekly scenarios with fresh leaderboards), **identity** (persistent career/prestige across runs — v1's prestige titles were a late, thin layer), and **other people** (async: ghost runs on shared seeds, challenge-a-friend on the same deal flow — the seed infrastructure already makes every game reproducible).

## Suggested v2 brainstorm seeds (from the data, not just taste)

- **Seasonal structure:** 6–8 week seasons, each a themed market era (the scenario engine is literally this, generalized), with seasonal leaderboards that reset and career prestige that doesn't.
- **Shared-seed async multiplayer:** everyone plays the same deal flow each week; compare decisions, not just scores. Deterministic RNG makes this nearly free.
- **A real difficulty ladder:** beat Normal → unlock market conditions that fight back (efficient deal pricing, activist LPs, hostile competitors bidding on your pipeline). Use the 51%-scored "strategic discipline" dimension as the design north star for what hard mode tests.
- **Career mode as the retention spine:** persistent operator identity across runs (reputation, relationships with recurring sellers/lenders/LPs), replacing one-shot games with a meta-progression that the 15–25-game mid-tail can live in.
- **Downside drama:** bankruptcy as a playable arc (distressed restart, comeback achievements exist but are unreachable when nothing fails).
- **Architecture:** mode-config-driven engine from day 1 (one predicate authority per behavior), derived values computed at read time, single event store, the v1 structural-test culture (tripwires/proofreader/parity) carried over wholesale — it demonstrably caught entire bug classes.

---

*Data sources: full `leaderboard:v2` export (482 entries), 20 public player profiles, scenario list/leaderboard endpoints — all pulled June 11, 2026. Codebase facts verified at HEAD (save v44). Funnel metrics (starts/abandons/devices/returning) intentionally omitted pending an authenticated export of `/api/admin/analytics`.*
