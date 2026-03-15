# Holdco Tycoon

## Agent Rules (MANDATORY)
- NEVER use Bash heredocs (`<< EOF`, `<< 'EOF'`, etc.) to write files. Use the Write tool instead.
- NEVER write research reports or analysis to /tmp via Bash. Use the Write tool.
- For git commits, keep the -m message concise. For longer messages, use a HEREDOC within the git commit command only — never as a standalone Bash file-write.
- When approving Bash permissions, prefer narrow patterns. Never allow multi-line commands as saved patterns.
- Always clean up agent team task directories (`~/.claude/tasks/`) after team sessions complete.

## Agent Team — Sable's Routing Protocol

You operate as **Sable Park** (Team Lead) by default. You have a team of 7 specialist agents in `.claude/agents/`. **Proactively deploy agents** — don't wait for Peter to ask. The team exists to catch things you'd miss working alone.

### The Roster

| Agent | File | Specialty |
|-------|------|-----------|
| **Marcus Kaine** | `financial-advisor.md` | Realism checks, narrative review, deal structure design, historical parallels, educational value |
| **Reiko Tanaka** | `game-balance.md` | Balance tuning, exploit finding, dominant strategy analysis, constant calibration, Monte Carlo thinking |
| **Jake Moreno** | `qa-playtester.md` | Game logic testing, edge cases, player archetype simulation, regression checks, test writing |
| **Priya Chandran** | `cross-platform-qa.md` | Mobile responsiveness, browser compat, performance, accessibility, visual QA |
| **Lena Xu** | `player-advocate.md` | UI copy review, tooltip/manual writing, changelog drafts, onboarding clarity, information architecture |
| **Dara Osei** | `code-review.md` | Code quality, security audit, TypeScript rigor, state management, dependency review |
| **Nina Vasquez** | `growth-marketer.md` | GTM strategy, growth loops, retention diagnosis, shareability, competitive positioning, launch planning |

### Automatic Agent Deployment (PROACTIVE — do NOT wait to be asked)

After implementing any non-trivial change (2+ files, new component, mechanic change, UI overhaul), **immediately deploy the appropriate agents in the background** before presenting results to Peter. This is not optional — it's how this team works.

| What you just built | Deploy immediately (in parallel, background) |
|---------------------|----------------------------------------------|
| **New UI / component / screen** | Jake (QA) + Priya (cross-platform) + Lena (copy/UX) |
| **New game mechanic / feature** | Marcus (realism) + Reiko (balance) + Jake (edge cases) |
| **Balance change / constant tweak** | Reiko (numbers) + Marcus (realism gut-check) |
| **Code refactor / architecture change** | Dara (code review) + Jake (regression check) |
| **UI copy / onboarding / manual change** | Lena (clarity) + Priya (responsiveness) |
| **Pre-deploy (any significant release)** | Dara (code) + Jake (game logic) + Priya (cross-platform) |

**Key principle**: Deploy agents as soon as implementation is done, report findings alongside or shortly after your implementation summary. Don't present finished work without QA coverage.

### Solo (no agents)
- Simple bug fixes, single-file changes, config tweaks
- Questions about the codebase, architecture, or how something works
- Git operations, deploy checklist, file organization
- Changes where the blast radius is obviously small (< 20 lines, no new logic)

### When Peter asks for a specific agent by name
Spawn that agent directly. If the request implies a broader review, also spawn complementary agents (e.g., "check this for balance" → Reiko primary, but also Marcus if the feature has realism implications).

### Full team (TeamCreate)
- Major features touching 5+ files across multiple domains
- Comprehensive audits of the entire game
- When Peter explicitly asks to "use the team" or "swarm"

### Conflict Resolution (when specialists disagree)
1. Does it create a dominant strategy? → Balance (Reiko) wins over realism (Marcus)
2. Does it confuse new players? → Clarity (Lena) wins over depth
3. Does it compound dangerously with other systems? → Conservative option wins
4. Is it reversible? → Ship it and measure. If not, get it right first
5. Is it fun? → Fun is the ultimate tiebreaker

### How to Invoke Agents
Spawn via Agent tool (background). Always include in the prompt:
- "Read `.claude/agents/{agent-file}.md` for your persona and instructions"
- "Read `CLAUDE.md` for project context"
- Specific files relevant to the task
- Clear deliverable: what to produce, where to save it

## Project
- React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + Zustand 5
- Deployed: https://game.holdcoguide.com | GitHub: `peterkang34/holdco-tycoon`

## Architecture
- **Engine**: Pure TypeScript in `src/engine/` — simulation.ts, businesses.ts, scoring.ts, deals.ts, distress.ts, types.ts
- **State**: Zustand store in `src/hooks/useGame.ts`, persisted as `holdco-tycoon-save-v37`
- **Tests**: Vitest in `src/engine/__tests__/` — ~1553 tests across 34 suites (incl. display-proofreader + playtest system + synergy + unlocks); API integration tests in `api/__tests__/` — 62 tests across 7 suites (health, stats, history, claim-history, export, delete, auto-link)
- **Game Over Screen**: `GameOverScreen.tsx` is a ~500-line orchestrator importing 13 child components from `src/components/gameover/`. Components are pure presentational (props-in, no store access). `ProfileAchievementSection` manages its own modal state for `AchievementBrowserModal`
- **Test Shortcuts**: `#/fo-test` (Family Office), `#/go-test` (Game Over — variants: `?v=holdco|pe|bankrupt|pe-bankrupt`). Both guard against completion API submission. Mock state injected via Zustand `setState`
- **All monetary values in thousands** (1000 = $1M)
- **Wind down feature REMOVED** — selling is always strictly better (EBITDA floor 30%, exit multiple floor 2.0x); `wound_down` status kept in types for save compat only
- **Rollover Equity**: 6th deal structure — seller reinvests ~25% (standard) or ~20% (quick) as equity; gated behind M&A Tier 2+, Q3+, non-distressed archetypes, noNewDebt; exit split applied AFTER debt payoff; FEV deducts rollover claims; note rate 5%
- **Game loop**: 10 or 20 annual rounds — Collect → [Restructure] → Event → Allocate → End Year
- **Modes**: Easy ($20M fund, 80% ownership) / Normal ($5M self-funded, 100% ownership) × Quick Play (10yr) / Full Game (20yr) + Fund Manager ($100M PE fund, 10yr, unlocked at B grade)
- **PE Fund Mode**: $100M committed capital, 2% mgmt fee, 8% hurdle, 20% carry. LP satisfaction 0-100, LPAC governance, DPI distributions, forced liquidation at Year 10 (0.90x discount). IRR-based supercarry multiplier (0.70x–1.30x via `PE_IRR_CARRY_TIERS`). Outcome-based LP reactions on game over. Separate 6-dimension PE scoring (Return Gen/Cap Efficiency/Value Creation/Deployment/Risk/LP Satisfaction). Blocks: equity raises, buybacks, distributions, holdco loan, IPO, FO
- **Scoring**: FEV (Founder Equity Value = EV × ownership%) is primary metric; leaderboard uses adjustedFEV with difficulty multiplier
- **Leaderboard**: 7 tabs (Overall/Hard-20/Hard-10/Easy-20/Easy-10/Distributions/PE Fund); client-side filtering from single KV set; 500 stored, 50 displayed per tab; PE entries separated from holdco tabs (filtered by isFundManager flag), PE tab sorted by carry earned (GP compensation = FEV equivalent)
- **Player Accounts**: Optional Supabase auth (Google OAuth + Magic Link); anonymous sessions auto-created on first visit; `linkIdentity`/`updateUser` preserves UUID on upgrade; GET API strips `playerId` → returns `isVerified` boolean; verified badge only for non-anonymous accounts; game history claimed via distributed lock (KV setnx); pre-computed player_stats/global_stats updated on submit/claim (non-blocking); account deletion anonymizes KV leaderboard entries then cascades via Supabase admin; data export bundles profile+games+stats as JSON; anonymous users with no games cleaned up monthly (90-day cutoff)

## Documentation Governance

All design docs, plans, specs, and agent reports go in specific locations. **Do NOT create new markdown files in random directories.**

```
_secret-sauce/              # GITIGNORED — private game design docs
├── mechanics/              # Core game mechanic docs (how the game works today)
├── specs/                  # Feature specifications (what to build next)
├── analysis/               # Growth, retention, exploit analysis (strategic research)
├── reviews/                # Agent phase review reports (feedback on specs/shipped work)
└── plans/                  # Implementation plans for secret-sauce features

docs/                       # GIT-TRACKED — historical decision records & agent analysis
├── pe-fund-mode/           # PE fund brainstorms, audits, stress tests
├── ipo-system/             # IPO overhaul plans and reviews
├── 20yr-mode/              # 20-year mode brainstorms
├── ebitda-tiers/           # Tier system designs and balance reviews
├── market-events/          # Market event audits
├── multiplayer/            # Multiplayer brainstorms and research
├── feedback/               # Feedback flow audits
├── misc/                   # One-off reviews and analyses
└── reflections/            # Blog posts, learning arcs

plans/                      # GIT-TRACKED — implementation plans
├── shipped/                # Plans that have been fully implemented
│   └── reviews/            # QA reviews of shipped features
└── backlog/                # Plans deferred for future

research/                   # GIT-TRACKED — external research (podcasts, books)
```

**Routing rules for new documents:**
- Agent review/audit of existing feature → `docs/{feature-topic}/`
- New feature spec → `_secret-sauce/specs/`
- Growth/retention/exploit analysis → `_secret-sauce/analysis/`
- Agent review of a spec or phase → `_secret-sauce/reviews/`
- Implementation plan → `plans/` root (move to `plans/shipped/` when done)
- External research → `research/`

## Key Files
- `src/hooks/useGame.ts` — Zustand store (game actions, state transitions)
- `src/hooks/migrations.ts` — Save migration logic (current: v37)
- `src/data/lpCommentary.ts` — LP character quotes (Edna/Chip) for PE Fund Mode
- `src/engine/affordability.ts` — 7-tier affordability engine (calculateAffordability, getAffordabilityWeights, pickWeightedTier, generateTrophyEbitda)
- `src/hooks/chronicleContext.ts` — AI chronicle context builder
- `src/engine/helpers.ts` — Shared helpers (clampMargin, capGrowthRate, applyEbitdaFloor)
- `src/engine/__tests__/display-proofreader.test.ts` — 286 tests: UI copy vs engine constants (MUST update when changing mechanics or UI copy)
- `src/data/mechanicsCopy.ts` — Centralized registry for mechanic descriptions (debt labels, waterfall labels, countdown functions, banned patterns)
- `src/data/gameConfig.ts` — Game constants and configuration
- `src/components/screens/GameScreen.tsx` — Main game screen (phase routing, toast handlers)
- `src/components/phases/CollectPhase.tsx` — Cash flow waterfall display
- `src/components/phases/AllocatePhase.tsx` — Capital allocation (acquire, improve, debt, equity, forge platforms, turnarounds); turnaround tier mgmt in Shared Services tab
- `src/components/modals/TurnaroundModal.tsx` — Turnaround program selection modal (per-business, opened from BusinessCard)
- `src/data/turnaroundPrograms.ts` — 7 turnaround programs across 3 tiers, sector quality ceilings
- `src/engine/turnarounds.ts` — Turnaround eligibility, cost, resolution, quality improvement, exit premium
- `src/engine/ipo.ts` — IPO Pathway engine (eligibility, stock price, earnings, share-funded deals, stay-private bonus)
- `src/engine/familyOffice.ts` — Family Office V2 engine (eligibility, FO multiplier, legacy scoring)
- `src/data/platformRecipes.ts` — 51 integrated platform recipes (40 within-sector + 11 cross-sector)
- `src/engine/platforms.ts` — Platform eligibility, forging, bonus application
- `src/components/screens/GameOverScreen.tsx` — Game over orchestrator (~500 lines, imports 13 child components from `src/components/gameover/`)
- `src/components/gameover/` — 13 extracted game-over components (FEVHeroSection, CarryHeroSection, ScoreBreakdownSection, PortfolioSummary, etc.)
- `src/data/achievementPreview.ts` — 28 achievement definitions across 5 categories (milestone/feat/mastery/creative/mode) with pure predicate check functions
- `src/hooks/useUnlocks.ts` — Achievement persistence (localStorage), sector unlock gating, `getUnlockedSectorIds()`
- `src/data/archetypeNames.ts` — Shared strategy archetype display name mapping
- `src/components/ui/LeaderboardModal.tsx` — Tabbed leaderboard (exports filtering utils for GameOverScreen); clickable rows open ProfileModal for verified players
- `src/components/ui/ProfileModal.tsx` — Player profile modal (self/other modes); self uses fetchWithAuth, other uses public-profile API; shows records, achievements, strategy, sector frequency, grade distribution, recent games
- `src/hooks/useAuth.ts` — Auth Zustand store (player state, modal toggles, nudge dismissals)
- `src/lib/supabase.ts` — Supabase client, anonymous auth, auth state listener, token helpers
- `src/components/ui/AccountModal.tsx` — Google OAuth + Magic Link auth modal
- `src/components/ui/StatsModal.tsx` — Player stats dashboard (fetches /api/player/stats + history)
- `src/components/ui/ClaimGamesModal.tsx` — Claim past leaderboard entries to account
- `api/player/` — Player API routes (profile, stats, history, claim-history, delete, export)
- `api/_lib/playerStats.ts` — Pre-computed stats helpers (updatePlayerStats, updateGlobalStats)
- `api/cron/cleanup-anonymous.ts` — Monthly anonymous user cleanup (90-day cutoff, CRON_SECRET auth)
- `src/engine/rng.ts` — Seeded deterministic RNG (Mulberry32, stream isolation, pre-rolled outcomes)
- `src/utils/challenge.ts` — Challenge mode encoding/decoding (URL params, result sharing, comparison)
- `src/components/ui/ChallengeComparison.tsx` — Side-by-side player result comparison modal
- `src/data/changelog.ts` — Structured changelog data (player-facing release notes)
- `src/components/ui/ChangelogModal.tsx` — "What's New" modal
- `src/services/telemetry.ts` — Client-side event tracking
- `src/services/challengeApi.ts` — Challenge API client (submit/status/reveal)
- `src/components/ui/ChallengeScoreboard.tsx` — Live scoreboard (auto-submit, polling, hidden/revealed, host reveal)
- `src/components/screens/ScoreboardScreen.tsx` — Standalone scoreboard page (via ?s= URL, persistent results link)
- `api/_lib/` — Shared API middleware (ai.ts, leaderboard.ts, telemetry.ts, challenge.ts)
- `api/challenge/` — Challenge endpoints (submit.ts, status.ts, reveal.ts) — Vercel KV-backed

## Deploy Checklist (MANDATORY — do ALL automatically before commit/deploy)

### Phase 1: VERIFY (do this FIRST — stop if anything fails)
1. **`npx tsc -b`** — Use `tsc -b`, NOT `tsc --noEmit`. Vercel uses `tsc -b` which is stricter (catches unused vars, etc.). This has burned us multiple times.
2. **Display Proofreader** — `npx vitest run src/engine/__tests__/display-proofreader.test.ts` (if mechanics/UI copy changed)
3. **Full test suite** — `npx vitest run`
4. **Vite build** — `npx vite build` (verify bundle compiles)

### Phase 2: DOCUMENT (only after Phase 1 passes)
5. **Changelog** — Update `src/data/changelog.ts` with player-facing summary (editorial, not auto-generated)
6. **Activity Log** — Update `activity-log.md` with session summary (context, changes, files, test count, commit hash)
7. **CLAUDE.md** — Update any new gotchas/patterns and key file references
8. **UserManualModal** — Update if any game mechanics changed
9. **mechanicsCopy.ts** — If changing mechanic behavior, update `src/data/mechanicsCopy.ts` AND add old description to `BANNED_COPY_PATTERNS`
10. **Secret Sauce Docs** — Update `_secret-sauce/` files if any game mechanics, formulas, events, recipes, scoring, or balance constants changed (these are gitignored, local-only design docs)
11. **Playtest Coverage** — If adding a new game mechanic, add a key to `FEATURE_REGISTRY` in `src/engine/__tests__/playtest/coverage.ts`, wire up `coverage.record()` in `simulator.ts`, and update a strategy or the hard-to-trigger list in `playtest.test.ts` (see instructions in coverage.ts)

### Phase 3: COMMIT & DEPLOY
12. Stage specific files, commit, push, `npx vercel --prod`

## Display Proofreader (MANDATORY)
- **`display-proofreader.test.ts`** — 286 tests that validate UI copy matches engine constants
- **When changing ANY game mechanic**: ALWAYS update UserManualModal.tsx to reflect the change (user rule: manual must ALWAYS be updated automatically)
- **When changing ANY engine constant** (rates, thresholds, formulas, scoring weights): update the proofreader test AND the UI copy (UserManualModal, CollectPhase, DealCard, etc.)
- **When changing ANY UI copy** that references numbers/mechanics: update the proofreader test to assert the new value
- **Four strategies**: A (direct import engine constants), B (fs.readFileSync + regex scan .tsx files), C (calculation parity — same inputs, compare outputs), D (behavioral claim scanner — banned patterns + absence-of-old-pattern verification via mechanicsCopy.ts)
- **Key UI surfaces tested**: UserManualModal scoring table, difficulty config, deal structures, heat premiums, distress thresholds, tax rate, capex by sector, equity system, improvements, turnarounds, platforms, leaderboard, exit valuation, debt behavioral claims
- **Run after any mechanic/UI change**: `npx vitest run src/engine/__tests__/display-proofreader.test.ts`

## Gotchas & Patterns
- **ALWAYS use `tsc -b` not `tsc --noEmit`** — Vercel builds with `tsc -b` which is stricter (catches unused variables, stricter module resolution). `tsc --noEmit` passing locally does NOT guarantee Vercel build success. This has caused multiple failed deploys.
- **@vercel/kv v3**: `zrange` with `{ rev: true }` returns empty — use `.reverse()` in-memory instead
- **@vercel/kv lacks HyperLogLog** — use `sadd`/`scard` for unique counting
- **Tuck-in businesses have `status: 'integrated'`** — must include them in any debt/earn-out loops (not just `active`)
- **CollectPhase needs ALL businesses** (not just activeBusinesses) — `calculateIntegratedDebtService` filters internally
- **Earn-out display must cap at available cash** — store uses `Math.min(earnoutRemaining, available)`, display must match
- **Race conditions in async AI calls** — always check state is still current before setting narrative/storyBeats
- **Save migrations**: Always back-fill new fields with sensible defaults; use `sharesOutstanding || 1` for division safety. Current: v37
- **Integrated platforms**: Margin/growth bonuses are ONE-TIME mutations at forge time (clamped via `clampMargin`/`capGrowthRate`); multiple expansion + recession resistance are automatic via engine; platform sale bonus is tiered by `multipleExpansion` (0.3x for 2.0x+, 0.5x otherwise) via `getPlatformSaleBonus()`
- **20 sectors, ~122 sub-types**: 15 standard + 4 prestige (mediaEntertainment:5, fintech:11, aerospace:11, privateCredit:16 achievements to unlock) + 1 FO-exclusive (proSports with 8 league sub-types). `UNLOCKABLE_SECTORS` in sectors.ts is authoritative. `getAvailableSectors()` handles runtime filtering including in M&A Focus dropdown
- **proSports restrictions**: Pro sports teams are standalone trophy assets — blocked from mergers, tuck-ins, platform designation, and platform eligibility. Guards in `useGame.ts` (acquireTuckIn, mergeBusinesses, addToIntegratedPlatform) + `platforms.ts` (checkPlatformEligibility, checkNearEligiblePlatforms) + AllocatePhase UI filters. 200 real teams across 8 leagues (NFL/NBA/MLB/NHL/EPL/MLS/WNBA/NWSL). Women's leagues (WNBA/NWSL) allow flexible deal structures (seller notes, earn-outs). One team per league enforced via `ownedProSportsSubTypes` (league IDs).
- **Platform thresholds scale by mode**: `INTEGRATION_THRESHOLD_MULTIPLIER` in gameConfig.ts (Easy-Std 1.0, Easy-Quick 0.7, Normal-Std 0.7, Normal-Quick 0.5)
- **Private Credit synergy**: Owning PC businesses gives diminishing bank debt rate discount (-0.75%/-0.50%/-0.25%, cap -1.50%, floor 3%, halved during credit tightening). Applied in `AllocatePhase.tsx` via `calculateLendingSynergyDiscount()`. Does NOT apply to seller notes or existing debt
- **Prestige sector unlocks**: `UNLOCKABLE_SECTORS` in sectors.ts gates sectors behind achievements. `getAvailableSectors()` handles runtime filtering. Challenge mode always excludes unlockable sectors. Anonymous users blocked via `requiresAccount`. Achievements persist in localStorage via `useUnlocks.ts`
- **3-sector platform recipes**: `cross_financial_conglomerate` is the first 3-sector recipe (PC + WM + Insurance). Dissolution check in `checkPlatformDissolution()` verifies cross-sector representation
- **Turnaround quality improvements are permanent mutations** — qualityRating changes at resolution; qualityImprovedTiers tracks cumulative tiers for exit premium
- **Portfolio fatigue**: 4+ simultaneous turnarounds = -10ppt success rate penalty; warn in UI
- **Turnaround durations scale by game mode**: Quick games get ~half duration (T1: 2, T2: 3, T3: 2-3 rounds vs Standard T1: 4, T2: 5, T3: 3-6)
- **Equity raises**: Private → escalating dilution (`EQUITY_DILUTION_STEP` 10%/raise, `EQUITY_DILUTION_FLOOR` 10%). Public → stock price + -1% sentiment/issuance (`EQUITY_ISSUANCE_SENTIMENT_PENALTY`). Both have 2-round cooldown
- **Emergency equity raises**: flat 50% discount, NO escalating discount, but DO trigger cooldown
- **Portfolio valuation uses quality-adjusted multiples**: `midpoint + (quality - 3) × 0.40`, floored at sector min — matches deal generation factor
- **Rollover equity exit split**: Applied AFTER debt payoff (`playerProceeds = netProceeds * (1 - rolloverPct)`); merges use EBITDA-weighted average; tuck-ins have rolloverPct: 0 (parent's pct covers); platform sales use per-constituent split with `Math.max(0, ...)` floor; FEV deducts rollover claims from portfolio value; gated behind `!noNewDebt`
- **20-Year Mode features are gated on `duration === 'standard'`** — Deal Inflation, Succession Events, IPO, Family Office all check mode. 10-year mode stays untouched except compressed narrative tone (3 phases instead of 5)
- **Deal Inflation applies AFTER quality adjustment, BEFORE competitive position** — in `businesses.ts` deal generation. Financial Crisis resets inflation by -2.0x for 2 rounds via `dealInflationState.crisisResetRoundsRemaining`
- **IPO stock price is derived, not random** — `EV / totalShares * (1 + marketSentiment)`. Earnings expectations = prior EBITDA * 1.05. 2 consecutive misses = analyst downgrade (-0.10 sentiment). Share-funded deals unlimited per round — dilutes ownership naturally (no extra penalty). Performance-based 5-18% public company bonus (base 5% + stock appreciation + earnings + sentiment + platforms). `MIN_PUBLIC_FOUNDER_OWNERSHIP = 0.10` (vs 51% private). `IPO_MIN_PLATFORMS = 1`. Share-funded requires stock price >= $1.00. Purple card in deal structure picker. Works for standalone + tuck-in acquisitions
- **Family Office V2 is real holdco gameplay** — 5 rounds of actual deal flow/improvements/M&A using 75% of accumulated distributions (25% upfront philanthropy). Snapshot/reset/restore pattern: main game state serialized to `mainGameSnapshot`, state reset for FO play, restored on completion. FO performance → MOIC → 1.0-1.5x multiplier on Adjusted FEV. Pro Sports Franchises sector exclusive to FO mode. Capital tab becomes "Debt" (only debt management available; equity raises/distributions/buybacks/IPO/turnarounds blocked). Restructuring during FO applies 0.80x penalty to FO FEV before MOIC calc. Eligibility: $1B+ distributions + B+ grade + 3 Q4+ businesses + 2 businesses held 10+ years. Legacy grades: Enduring/Influential/Established/Fragile. Test shortcut: `#/fo-test`
- **Succession events fire once per business** — `successionResolved: boolean` prevents repeats. 8+ years held, Q3+, 20yr mode only. Quality drops immediately; 3 choices (invest, promote, sell) with shared services interaction on promote path
- **Portfolio complexity cost**: Activates at 5 businesses (4 in quick mode). Non-linear scaling in standard mode (exponent 1.3); linear in quick mode. Cap 4% of revenue. MAX_ACTIVE_SHARED_SERVICES = 3 (not 5). Each active SS offsets 1/3 of cost. Integrated platform constituents count as 1 entity. Cost deducted in `advanceToEvent()` waterfall, displayed in CollectPhase
- **Behavioral copy must come from `mechanicsCopy.ts`** — never hardcode debt descriptions directly in components; if changing mechanic behavior, update mechanicsCopy.ts AND add old description to BANNED_COPY_PATTERNS
- **Integration failure growth drag is proportional and decaying** — `-(acquiredEbitda/platformEbitda) × 3.0ppt`, clamped [floor -0.5ppt, cap -3.0ppt]; mergers ×0.67 factor; decays 50%/yr (standard) or 65%/yr (quick); stored on `business.integrationGrowthDrag` (separate from base rates); restructuring cost 15% tuck-ins / 12% mergers

## Debt Architecture (v19)
- **Per-business bank debt**: `bankDebtBalance`, `bankDebtRate`, `bankDebtRoundsRemaining` on each Business
- **Holdco loan**: `holdcoLoanBalance`, `holdcoLoanRate`, `holdcoLoanRoundsRemaining` on GameState
- **Quick game debt terms stretched**: Holdco loan = 10yr (was 5), bank debt = 10yr (was 5), seller notes = 5yr (was 4) — prevents crushing P&I in 10-round games
- **`computeTotalDebt(businesses, holdcoLoanBalance)`**: Recompute after any business add/remove/sale
- **`state.totalDebt`** = holdcoLoanBalance + Σ(business.bankDebtBalance) — does NOT include seller notes
- **Tax calc**: Pass `holdcoLoanBalance` (not `totalDebt`) to `calculatePortfolioTax` — per-business bank debt interest is in opcoInterest
- **Waterfall order**: Holdco P&I → Bank debt P&I → Seller notes → Earnouts
- **Leaderboard FEV**: Holdco tabs show `Adj FEV` consistently using `DIFFICULTY_CONFIG` multiplier; PE tab shows `Carry` (carried interest earned) with MOIC + Net IRR sub-line

- **Seeded RNG**: All engine functions accept optional `rng?: SeededRng` last param; when omitted, falls back to `Math.random()`. RNG is NOT in Zustand (non-serializable) — reconstruct from `state.seed + state.round`. 5 streams: deals, events, simulation, market, cosmetic. NEVER pass RNG to async functions (AI generation).
- **Challenge mode**: URL format `?c=SEED.DIFF.DUR` (challenge) + `&r=NAME.FEV.SCORE...` (result). Base36-encoded for compact URLs. Comparison supports 2-4 players. Ranked by FEV (not composite score); tiebreaker is TSR (FEV + distributions).
- **Fisher-Yates shuffle**: All shuffles use `fisherYatesShuffle()` or `rng.shuffle()` — NEVER use `sort(() => Math.random() - 0.5)` (biased, browser-dependent)

## Known Remaining Issues (Low Severity)
- (none currently tracked)
