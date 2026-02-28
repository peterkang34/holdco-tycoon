# Holdco Tycoon

## Agent Rules (MANDATORY)
- NEVER use Bash heredocs (`<< EOF`, `<< 'EOF'`, etc.) to write files. Use the Write tool instead.
- NEVER write research reports or analysis to /tmp via Bash. Use the Write tool.
- For git commits, keep the -m message concise. For longer messages, use a HEREDOC within the git commit command only — never as a standalone Bash file-write.
- When approving Bash permissions, prefer narrow patterns. Never allow multi-line commands as saved patterns.
- Always clean up agent team task directories (`~/.claude/tasks/`) after team sessions complete.

## Agent Team — Sable's Routing Protocol

You operate as **Sable Park** (Team Lead) by default. You have a team of 6 specialist agents in `.claude/agents/`. Before doing substantive work, evaluate whether specialists should be engaged.

### The Roster

| Agent | File | When to Deploy |
|-------|------|---------------|
| **Marcus Kaine** | `financial-advisor.md` | Realism checks, narrative review, deal structure design, historical parallels, educational value |
| **Reiko Tanaka** | `game-balance.md` | Balance tuning, exploit finding, dominant strategy analysis, constant calibration, Monte Carlo thinking |
| **Jake Moreno** | `qa-playtester.md` | Game logic testing, edge cases, player archetype simulation, regression checks, test writing |
| **Priya Chandran** | `cross-platform-qa.md` | Mobile responsiveness, browser compat, performance, accessibility, visual QA |
| **Lena Xu** | `player-advocate.md` | UI copy review, tooltip/manual writing, changelog drafts, onboarding clarity, information architecture |
| **Dara Osei** | `code-review.md` | Code quality, security audit, TypeScript rigor, state management, dependency review |

### Routing Rules

**Do it yourself (no agents):**
- Simple bug fixes, small refactors, single-file changes
- Questions about the codebase, architecture, or how something works
- Git operations, deploy checklist, file organization

**Deploy ONE specialist directly:**
- User asks for a specific agent by name → spawn that agent
- "Review this for balance" → Reiko
- "Is this realistic?" → Marcus
- "Check this on mobile" → Priya
- "Review this code" → Dara
- "Is the manual clear?" → Lena
- "Test this edge case" → Jake

**Deploy MULTIPLE specialists in parallel** (use Task tool with parallel calls):
- **New mechanic/feature**: Marcus (realism) + Reiko (balance) + Jake (edge cases) — in parallel
- **Pre-deploy audit**: Dara (code) + Jake (game logic) + Priya (cross-platform) — in parallel
- **UI/copy overhaul**: Lena (copy) + Priya (responsiveness) — in parallel
- **Balance change**: Reiko (numbers) + Marcus (realism gut-check) — in parallel
- **Full feature build**: Plan first, then implement, then deploy Jake + Dara + Priya for verification

**Use the full team (TeamCreate) only for:**
- Major features touching 5+ files across multiple domains
- Comprehensive audits of the entire game
- When the user explicitly asks to "use the team" or "swarm"

### Conflict Resolution (when specialists disagree)
1. Does it create a dominant strategy? → Balance (Reiko) wins over realism (Marcus)
2. Does it confuse new players? → Clarity (Lena) wins over depth
3. Does it compound dangerously with other systems? → Conservative option wins
4. Is it reversible? → Ship it and measure. If not, get it right first
5. Is it fun? → Fun is the ultimate tiebreaker

### How to Invoke Agents
Spawn via Task tool with `subagent_type: "general-purpose"`. Always include in the prompt:
- "Read `.claude/agents/{agent-file}.md` for your persona and instructions"
- "Read `CLAUDE.md` for project context"
- Specific files relevant to the task
- Clear deliverable: what to produce, where to save it

## Project
- React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + Zustand 5
- Deployed: https://game.holdcoguide.com | GitHub: `peterkang34/holdco-tycoon`

## Architecture
- **Engine**: Pure TypeScript in `src/engine/` — simulation.ts, businesses.ts, scoring.ts, deals.ts, distress.ts, types.ts
- **State**: Zustand store in `src/hooks/useGame.ts`, persisted as `holdco-tycoon-save-v28`
- **Tests**: Vitest in `src/engine/__tests__/` — 1194 tests across 22 suites (incl. display-proofreader)
- **All monetary values in thousands** (1000 = $1M)
- **Wind down feature REMOVED** — selling is always strictly better (EBITDA floor 30%, exit multiple floor 2.0x); `wound_down` status kept in types for save compat only
- **Rollover Equity**: 6th deal structure — seller reinvests ~25% (standard) or ~20% (quick) as equity; gated behind M&A Tier 2+, Q3+, non-distressed archetypes, noNewDebt; exit split applied AFTER debt payoff; FEV deducts rollover claims; note rate 5%
- **Game loop**: 10 or 20 annual rounds — Collect → [Restructure] → Event → Allocate → End Year
- **Modes**: Easy ($20M fund, 80% ownership) / Normal ($5M self-funded, 100% ownership) × Quick Play (10yr) / Full Game (20yr)
- **Scoring**: FEV (Founder Equity Value = EV × ownership%) is primary metric; leaderboard uses adjustedFEV with difficulty multiplier
- **Leaderboard**: 6 tabs (Overall/Hard-20/Hard-10/Easy-20/Easy-10/Distributions); client-side filtering from single KV set; 500 stored, 50 displayed per tab

## Key Files
- `src/hooks/useGame.ts` — Zustand store (game actions, state transitions)
- `src/hooks/migrations.ts` — Save migration logic (current: v28)
- `src/engine/affordability.ts` — 7-tier affordability engine (calculateAffordability, getAffordabilityWeights, pickWeightedTier, generateTrophyEbitda)
- `src/hooks/chronicleContext.ts` — AI chronicle context builder
- `src/engine/helpers.ts` — Shared helpers (clampMargin, capGrowthRate, applyEbitdaFloor)
- `src/engine/__tests__/display-proofreader.test.ts` — 200 tests: UI copy vs engine constants (MUST update when changing mechanics or UI copy)
- `src/data/mechanicsCopy.ts` — Centralized registry for mechanic descriptions (debt labels, waterfall labels, countdown functions, banned patterns)
- `src/data/gameConfig.ts` — Game constants and configuration
- `src/components/screens/GameScreen.tsx` — Main game screen (phase routing, toast handlers)
- `src/components/phases/CollectPhase.tsx` — Cash flow waterfall display
- `src/components/phases/AllocatePhase.tsx` — Capital allocation (acquire, improve, debt, equity, forge platforms, turnarounds); turnaround tier mgmt in Shared Services tab
- `src/components/modals/TurnaroundModal.tsx` — Turnaround program selection modal (per-business, opened from BusinessCard)
- `src/data/turnaroundPrograms.ts` — 7 turnaround programs across 3 tiers, sector quality ceilings
- `src/engine/turnarounds.ts` — Turnaround eligibility, cost, resolution, quality improvement, exit premium
- `src/engine/ipo.ts` — IPO Pathway engine (eligibility, stock price, earnings, share-funded deals, stay-private bonus)
- `src/engine/familyOffice.ts` — Family Office Endgame engine (eligibility, philanthropy, succession, legacy scoring)
- `src/data/platformRecipes.ts` — 38 integrated platform recipes (32 within-sector + 6 cross-sector)
- `src/engine/platforms.ts` — Platform eligibility, forging, bonus application
- `src/components/ui/LeaderboardModal.tsx` — Tabbed leaderboard (exports filtering utils for GameOverScreen)
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
1. **Changelog** — Update `src/data/changelog.ts` with player-facing summary (editorial, not auto-generated)
2. **Activity Log** — Update `activity-log.md` with session summary (context, changes, files, test count, commit hash)
3. **CLAUDE.md** — Update test count, any new gotchas/patterns, and key file references
4. **UserManualModal** — Update if any game mechanics changed
5. **Display Proofreader** — Run `npx vitest run src/engine/__tests__/display-proofreader.test.ts` if mechanics/UI copy changed
6. **mechanicsCopy.ts** — If changing mechanic behavior, update `src/data/mechanicsCopy.ts` AND add old description to `BANNED_COPY_PATTERNS`
7. **Secret Sauce Docs** — Update `_secret-sauce/` files if any game mechanics, formulas, events, recipes, scoring, or balance constants changed (these are gitignored, local-only design docs)

## Display Proofreader (MANDATORY)
- **`display-proofreader.test.ts`** — 212 tests that validate UI copy matches engine constants
- **When changing ANY game mechanic**: ALWAYS update UserManualModal.tsx to reflect the change (user rule: manual must ALWAYS be updated automatically)
- **When changing ANY engine constant** (rates, thresholds, formulas, scoring weights): update the proofreader test AND the UI copy (UserManualModal, CollectPhase, DealCard, etc.)
- **When changing ANY UI copy** that references numbers/mechanics: update the proofreader test to assert the new value
- **Four strategies**: A (direct import engine constants), B (fs.readFileSync + regex scan .tsx files), C (calculation parity — same inputs, compare outputs), D (behavioral claim scanner — banned patterns + absence-of-old-pattern verification via mechanicsCopy.ts)
- **Key UI surfaces tested**: UserManualModal scoring table, difficulty config, deal structures, heat premiums, distress thresholds, tax rate, capex by sector, equity system, improvements, turnarounds, platforms, leaderboard, exit valuation, debt behavioral claims
- **Run after any mechanic/UI change**: `npx vitest run src/engine/__tests__/display-proofreader.test.ts`

## Gotchas & Patterns
- **@vercel/kv v3**: `zrange` with `{ rev: true }` returns empty — use `.reverse()` in-memory instead
- **@vercel/kv lacks HyperLogLog** — use `sadd`/`scard` for unique counting
- **Tuck-in businesses have `status: 'integrated'`** — must include them in any debt/earn-out loops (not just `active`)
- **CollectPhase needs ALL businesses** (not just activeBusinesses) — `calculateIntegratedDebtService` filters internally
- **Earn-out display must cap at available cash** — store uses `Math.min(earnoutRemaining, available)`, display must match
- **Race conditions in async AI calls** — always check state is still current before setting narrative/storyBeats
- **Save migrations**: Always back-fill new fields with sensible defaults; use `sharesOutstanding || 1` for division safety
- **Integrated platforms**: Margin/growth bonuses are ONE-TIME mutations at forge time (clamped via `clampMargin`/`capGrowthRate`); multiple expansion + recession resistance are automatic via engine; platform sale bonus is tiered by `multipleExpansion` (0.3x for 2.0x+, 0.5x otherwise) via `getPlatformSaleBonus()`
- **15 sectors, ~93 sub-types**: Overlaps resolved (no cross-sector sub-type duplication); sectors.ts is authoritative
- **Platform thresholds scale by mode**: `INTEGRATION_THRESHOLD_MULTIPLIER` in gameConfig.ts (Easy-Std 1.0, Easy-Quick 0.7, Normal-Std 0.7, Normal-Quick 0.5)
- **Turnaround quality improvements are permanent mutations** — qualityRating changes at resolution; qualityImprovedTiers tracks cumulative tiers for exit premium
- **Portfolio fatigue**: 4+ simultaneous turnarounds = -10ppt success rate penalty; warn in UI
- **Turnaround durations scale by game mode**: Quick games get ~half duration (T1: 2, T2: 3, T3: 2-3 rounds vs Standard T1: 4, T2: 5, T3: 3-6)
- **Equity raises use escalating dilution**: `EQUITY_DILUTION_STEP` (10% per prior raise), `EQUITY_DILUTION_FLOOR` (10% min), + 2-round raise↔buyback cooldown; no hard cap
- **Emergency equity raises**: flat 50% discount, NO escalating discount, but DO trigger cooldown
- **Portfolio valuation uses quality-adjusted multiples**: `midpoint + (quality - 3) × 0.35`, floored at sector min — matches deal generation factor
- **Rollover equity exit split**: Applied AFTER debt payoff (`playerProceeds = netProceeds * (1 - rolloverPct)`); merges use EBITDA-weighted average; tuck-ins have rolloverPct: 0 (parent's pct covers); platform sales use per-constituent split with `Math.max(0, ...)` floor; FEV deducts rollover claims from portfolio value; gated behind `!noNewDebt`
- **20-Year Mode features are gated on `duration === 'standard'`** — Deal Inflation, Succession Events, IPO, Family Office all check mode. 10-year mode stays untouched except compressed narrative tone (3 phases instead of 5)
- **Deal Inflation applies AFTER quality adjustment, BEFORE competitive position** — in `businesses.ts` deal generation. Financial Crisis resets inflation by -2.0x for 2 rounds via `dealInflationState.crisisResetRoundsRemaining`
- **IPO stock price is derived, not random** — `EV / totalShares * (1 + marketSentiment)`. Earnings expectations = prior EBITDA * 1.05. 2 consecutive misses = analyst downgrade (-0.10 sentiment). Max 1 share-funded deal/round with -5% FEV dilution each (capped at 50% total). Share-funded requires stock price >= $1.00. Purple card in deal structure picker. Works for standalone + tuck-in acquisitions
- **Family Office is a post-game mini-game** — 5 rounds, triggered from GameOverScreen when player has $1B+ distributions + B+ grade + 3 Q4+ businesses + 2 businesses held 10+ years. Irrevocable philanthropy commitments. Succession choice at round 3. Legacy Score grades: Enduring/Influential/Established/Fragile
- **Succession events fire once per business** — `successionResolved: boolean` prevents repeats. 8+ years held, Q3+, 20yr mode only. Quality drops immediately; 3 choices (invest, promote, sell) with shared services interaction on promote path
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
- **Leaderboard FEV**: All tabs show `Adj FEV` consistently using `DIFFICULTY_CONFIG` multiplier

- **Seeded RNG**: All engine functions accept optional `rng?: SeededRng` last param; when omitted, falls back to `Math.random()`. RNG is NOT in Zustand (non-serializable) — reconstruct from `state.seed + state.round`. 5 streams: deals, events, simulation, market, cosmetic. NEVER pass RNG to async functions (AI generation).
- **Challenge mode**: URL format `?c=SEED.DIFF.DUR` (challenge) + `&r=NAME.FEV.SCORE...` (result). Base36-encoded for compact URLs. Comparison supports 2-4 players. Ranked by FEV (not composite score); tiebreaker is TSR (FEV + distributions).
- **Fisher-Yates shuffle**: All shuffles use `fisherYatesShuffle()` or `rng.shuffle()` — NEVER use `sort(() => Math.random() - 0.5)` (biased, browser-dependent)

## Known Remaining Issues (Low Severity)
- (none currently tracked)
