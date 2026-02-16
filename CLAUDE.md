# Holdco Tycoon

## Agent Rules (MANDATORY)
- NEVER use Bash heredocs (`<< EOF`, `<< 'EOF'`, etc.) to write files. Use the Write tool instead.
- NEVER write research reports or analysis to /tmp via Bash. Use the Write tool.
- For git commits, keep the -m message concise. For longer messages, use a HEREDOC within the git commit command only — never as a standalone Bash file-write.
- When approving Bash permissions, prefer narrow patterns. Never allow multi-line commands as saved patterns.
- Always clean up agent team task directories (`~/.claude/tasks/`) after team sessions complete.

## Project
- React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + Zustand 5
- Deployed: https://game.holdcoguide.com | GitHub: `peterkang34/holdco-tycoon`

## Architecture
- **Engine**: Pure TypeScript in `src/engine/` — simulation.ts, businesses.ts, scoring.ts, deals.ts, distress.ts, types.ts
- **State**: Zustand store in `src/hooks/useGame.ts`, persisted as `holdco-tycoon-save-v19`
- **Tests**: Vitest in `src/engine/__tests__/` — 694 tests across 13 suites (incl. display-proofreader)
- **All monetary values in thousands** (1000 = $1M)
- **Wind down feature REMOVED** — selling is always strictly better (EBITDA floor 30%, exit multiple floor 2.0x); `wound_down` status kept in types for save compat only
- **Game loop**: 10 or 20 annual rounds — Collect → [Restructure] → Event → Allocate → End Year
- **Modes**: Easy ($20M fund, 80% ownership) / Normal ($5M self-funded, 100% ownership) × Quick Play (10yr) / Full Game (20yr)
- **Scoring**: FEV (Founder Equity Value = EV × ownership%) is primary metric; leaderboard uses adjustedFEV with difficulty multiplier
- **Leaderboard**: 6 tabs (Overall/Hard-20/Hard-10/Easy-20/Easy-10/Distributions); client-side filtering from single KV set; 500 stored, 50 displayed per tab

## Key Files
- `src/hooks/useGame.ts` — Zustand store (game actions, state transitions)
- `src/hooks/migrations.ts` — Save migration logic (current: v19)
- `src/hooks/chronicleContext.ts` — AI chronicle context builder
- `src/engine/helpers.ts` — Shared helpers (clampMargin, capGrowthRate, applyEbitdaFloor)
- `src/engine/__tests__/display-proofreader.test.ts` — 128 tests: UI copy vs engine constants (MUST update when changing mechanics or UI copy)
- `src/data/gameConfig.ts` — Game constants and configuration
- `src/components/screens/GameScreen.tsx` — Main game screen (phase routing, toast handlers)
- `src/components/phases/CollectPhase.tsx` — Cash flow waterfall display
- `src/components/phases/AllocatePhase.tsx` — Capital allocation (acquire, improve, debt, equity, forge platforms, turnarounds)
- `src/data/turnaroundPrograms.ts` — 7 turnaround programs across 3 tiers, sector quality ceilings
- `src/engine/turnarounds.ts` — Turnaround eligibility, cost, resolution, quality improvement, exit premium
- `src/data/platformRecipes.ts` — 38 integrated platform recipes (32 within-sector + 6 cross-sector)
- `src/engine/platforms.ts` — Platform eligibility, forging, bonus application
- `src/components/ui/LeaderboardModal.tsx` — Tabbed leaderboard (exports filtering utils for GameOverScreen)
- `src/data/changelog.ts` — Structured changelog data (player-facing release notes)
- `src/components/ui/ChangelogModal.tsx` — "What's New" modal
- `src/services/telemetry.ts` — Client-side event tracking
- `api/_lib/` — Shared API middleware (ai.ts, leaderboard.ts, telemetry.ts)

## Deploy Checklist (MANDATORY — do ALL automatically before commit/deploy)
1. **Changelog** — Update `src/data/changelog.ts` with player-facing summary (editorial, not auto-generated)
2. **Activity Log** — Update `activity-log.md` with session summary (context, changes, files, test count, commit hash)
3. **CLAUDE.md** — Update test count, any new gotchas/patterns, and key file references
4. **UserManualModal** — Update if any game mechanics changed
5. **Display Proofreader** — Run `npx vitest run src/engine/__tests__/display-proofreader.test.ts` if mechanics/UI copy changed
6. **Secret Sauce Docs** — Update `_secret-sauce/` files if any game mechanics, formulas, events, recipes, scoring, or balance constants changed (these are gitignored, local-only design docs)

## Display Proofreader (MANDATORY)
- **`display-proofreader.test.ts`** — 128 tests that validate UI copy matches engine constants
- **When changing ANY game mechanic**: ALWAYS update UserManualModal.tsx to reflect the change (user rule: manual must ALWAYS be updated automatically)
- **When changing ANY engine constant** (rates, thresholds, formulas, scoring weights): update the proofreader test AND the UI copy (UserManualModal, CollectPhase, DealCard, etc.)
- **When changing ANY UI copy** that references numbers/mechanics: update the proofreader test to assert the new value
- **Three strategies**: A (direct import engine constants), B (fs.readFileSync + regex scan .tsx files), C (calculation parity — same inputs, compare outputs)
- **Key UI surfaces tested**: UserManualModal scoring table, difficulty config, deal structures, heat premiums, distress thresholds, tax rate, capex by sector, equity system, improvements, turnarounds, platforms, leaderboard, exit valuation
- **Run after any mechanic/UI change**: `npx vitest run src/engine/__tests__/display-proofreader.test.ts`

## Gotchas & Patterns
- **@vercel/kv v3**: `zrange` with `{ rev: true }` returns empty — use `.reverse()` in-memory instead
- **@vercel/kv lacks HyperLogLog** — use `sadd`/`scard` for unique counting
- **Tuck-in businesses have `status: 'integrated'`** — must include them in any debt/earn-out loops (not just `active`)
- **CollectPhase needs ALL businesses** (not just activeBusinesses) — `calculateIntegratedDebtService` filters internally
- **Earn-out display must cap at available cash** — store uses `Math.min(earnoutRemaining, available)`, display must match
- **Race conditions in async AI calls** — always check state is still current before setting narrative/storyBeats
- **Save migrations**: Always back-fill new fields with sensible defaults; use `sharesOutstanding || 1` for division safety
- **Integrated platforms**: Margin/growth bonuses are ONE-TIME mutations at forge time (not recurring); multiple expansion + recession resistance are automatic via engine
- **15 sectors, ~93 sub-types**: Overlaps resolved (no cross-sector sub-type duplication); sectors.ts is authoritative
- **Platform thresholds scale by mode**: `INTEGRATION_THRESHOLD_MULTIPLIER` in gameConfig.ts (Easy-Std 1.0, Easy-Quick 0.7, Normal-Std 0.7, Normal-Quick 0.5)
- **Turnaround quality improvements are permanent mutations** — qualityRating changes at resolution; qualityImprovedTiers tracks cumulative tiers for exit premium
- **Portfolio fatigue**: 4+ simultaneous turnarounds = -10ppt success rate penalty; warn in UI
- **Turnaround durations scale by game mode**: Quick games get ~half duration (T1: 2, T2: 3, T3: 2-3 rounds vs Standard T1: 4, T2: 5, T3: 3-6)
- **Equity raises use escalating dilution**: `EQUITY_DILUTION_STEP` (10% per prior raise), `EQUITY_DILUTION_FLOOR` (10% min), + 2-round raise↔buyback cooldown; no hard cap
- **Emergency equity raises**: flat 50% discount, NO escalating discount, but DO trigger cooldown
- **Portfolio valuation uses quality-adjusted multiples**: `midpoint + (quality - 3) × 0.35`, floored at sector min — matches deal generation factor

## Debt Architecture (v19)
- **Per-business bank debt**: `bankDebtBalance`, `bankDebtRate`, `bankDebtRoundsRemaining` on each Business
- **Holdco loan**: `holdcoLoanBalance`, `holdcoLoanRate`, `holdcoLoanRoundsRemaining` on GameState
- **Quick game debt terms stretched**: Holdco loan = 10yr (was 5), bank debt = 10yr (was 5), seller notes = 5yr (was 4) — prevents crushing P&I in 10-round games
- **`computeTotalDebt(businesses, holdcoLoanBalance)`**: Recompute after any business add/remove/sale
- **`state.totalDebt`** = holdcoLoanBalance + Σ(business.bankDebtBalance) — does NOT include seller notes
- **Tax calc**: Pass `holdcoLoanBalance` (not `totalDebt`) to `calculatePortfolioTax` — per-business bank debt interest is in opcoInterest
- **Waterfall order**: Holdco P&I → Bank debt P&I → Seller notes → Earnouts
- **Leaderboard FEV**: All tabs show `Adj FEV` consistently using `DIFFICULTY_CONFIG` multiplier

## Known Remaining Issues (Low Severity)
- `sellBusiness` doesn't deduct `earnoutRemaining` from proceeds
