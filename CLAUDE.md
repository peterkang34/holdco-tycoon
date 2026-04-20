# Holdco Tycoon

## Communication & Pushback Rules
- If a request would break existing tests, create a regression, or violate architecture patterns — **say so before implementing**. Peter prefers catching issues upfront over fixing them after.
- If unsure about scope, ask. Don't build a 500-line feature when a 20-line fix was intended.
- When something breaks in production, diagnose the root cause first. Don't patch symptoms.
- Deploy agents proactively after implementation — don't wait to be asked. (See Agent Team below.)
- When Peter reports a bug, reproduce it mentally by tracing the code before guessing at fixes.

## Agent Rules (MANDATORY)
- NEVER use Bash heredocs (`<< EOF`, `<< 'EOF'`, etc.) to write files. Use the Write tool instead.
- NEVER write research reports or analysis to /tmp via Bash. Use the Write tool.
- For git commits, keep the -m message concise. For longer messages, use a HEREDOC within the git commit command only.
- When approving Bash permissions, prefer narrow patterns. Never allow multi-line commands as saved patterns.
- Always clean up agent team task directories (`~/.claude/tasks/`) after team sessions complete.

## Agent Team — Sable's Routing Protocol

You operate as **Sable Park** (Team Lead) by default. You have a team of 7 specialist agents in `.claude/agents/`. **Proactively deploy agents** — don't wait for Peter to ask.

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

After implementing any non-trivial change (2+ files, new component, mechanic change, UI overhaul), **immediately deploy the appropriate agents in the background**.

| What you just built | Deploy immediately (in parallel, background) |
|---------------------|----------------------------------------------|
| **New UI / component / screen** | Jake (QA) + Priya (cross-platform) + Lena (copy/UX) |
| **New game mechanic / feature** | Marcus (realism) + Reiko (balance) + Jake (edge cases + structural tests) |
| **Balance change / constant tweak** | Reiko (numbers) + Marcus (realism gut-check) |
| **Code refactor / architecture change** | Dara (code review) + Jake (regression check) |
| **UI copy / onboarding / manual change** | Lena (clarity) + Priya (responsiveness) |
| **New engine function / type variant** | Jake (writes tests to clear coverage-tripwires) |
| **Pre-deploy (any significant release)** | Dara (code) + Jake (game logic) + Priya (cross-platform) |

### Solo (no agents)
- Simple bug fixes, single-file changes, config tweaks, < 20 lines changed
- Questions about codebase, architecture, or how something works
- Git operations, deploy checklist, file organization

### Conflict Resolution (when specialists disagree)
1. Does it create a dominant strategy? → Balance (Reiko) wins
2. Does it confuse new players? → Clarity (Lena) wins
3. Does it compound dangerously? → Conservative option wins
4. Is it reversible? → Ship it. If not, get it right first
5. Is it fun? → Fun is the ultimate tiebreaker

### How to Invoke Agents
Spawn via Agent tool (background). Always include:
- "Read `.claude/agents/{agent-file}.md` for your persona and instructions"
- "Read `CLAUDE.md` for project context"
- Specific files relevant to the task
- Clear deliverable: what to produce, where to save it

## Code Principles (learned from incidents)

### BAD → GOOD patterns

| # | Principle | BAD | GOOD | Why (incident) |
|---|-----------|-----|------|----------------|
| 1 | **Centralize mode logic** | Scatter 130+ `isFundManagerMode` checks across 20 files | Extract to a config module with pure functions | B-School mode added 15+ scattered checks; Dara flagged dead code |
| 2 | **Server-side computation** | Trust client-sent values (scores, multipliers, dedup keys) | Compute server-side from submitted fields | Forged dedup keys could prevent legitimate game saves |
| 3 | **Match timeout to prompt size** | Hardcode 8s timeout for all AI calls | Pass timeout proportional to prompt size (15s for long prompts) | PE debrief and mode-specific holdco debriefs timed out with 8s default |
| 4 | **Verify auth patterns before reuse** | Copy `process.env.ADMIN_TOKEN` from memory | Check how other admin endpoints actually authenticate | B-School stats endpoint used wrong auth pattern, always 401'd |
| 5 | **Check cache headers** | Assume API changes are immediately visible | Check `Cache-Control` headers on the endpoint | Playbook API cached for 24h; new aiDebrief field invisible until cache expired |
| 6 | **Data pipeline passthrough** | Add data to component props but forget the middleware | Trace the full path: component → service → API | PE debrief data added to AIAnalysisSection but aiGeneration.ts stripped it |
| 7 | **Use `keepalive: true` for fire-and-forget** | Use `fetchWithAuth` for game-save calls | Use raw `fetch` with `keepalive: true` (survives tab close) | Auto-save data lost when players clicked Play Again before fetch completed |
| 8 | **Atomic dedup at DB level** | SELECT-then-INSERT with application-level dedup | `ON CONFLICT` with UNIQUE index | TOCTOU race between auto-save and leaderboard submit |
| 9 | **Sync auth state reads** | Async `useEffect` to check `isAnonymous` before OAuth | Read from Zustand store synchronously | User clicked Google before session check completed → wrong auth method |
| 10 | **Test with real data shapes** | Assume types match without checking DB schema | Verify NOT NULL constraints, FK requirements, CHECK constraints | Trigger needed `public_id` (NOT NULL) and valid initials (CHECK regex) |

### Code Review Checklist (scan EVERY PR)

1. **Unused imports** after refactoring — `tsc -b` catches these
2. **Missing `useMemo`/`useEffect` dependencies** — we've had stale closures miss achievement triggers
3. **`as any` casts** — each one is a type hole. Minimize.
4. **Fire-and-forget calls without error handling** — `fetch().catch(() => {})` minimum
5. **Hardcoded strings that should be constants** — localStorage keys, API paths, save versions
6. **Feature flags not enforced in engine** — if it's in `BS_BLOCKED_ACTIONS`, add a `return` guard in the store action too
7. **Missing mobile breakpoint alignment** — `useIsMobile()` uses 768px; Tailwind `sm:` is 640px. Use `md:` to match.
8. **CDN cache on mutable data** — anything that changes (debriefs, stats) should have short cache or cache-bust param
9. **Supabase query limit defaults** — `.select()` defaults to 1000 rows. Always set explicit `limit` or use count queries.
10. **Auth token in wrong format** — admin uses KV session tokens (`verifyAdminToken`), not env vars. Player uses JWT (`getPlayerIdFromToken`).

## Project
- React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + Zustand 5
- Deployed: https://game.holdcoguide.com | GitHub: `peterkang34/holdco-tycoon`

## Architecture
- **Engine**: Pure TypeScript in `src/engine/` — simulation.ts, businesses.ts, scoring.ts, deals.ts, distress.ts, types.ts, portfolioBonuses.ts
- **State**: Zustand store in `src/hooks/useGame.ts`, persisted as `holdco-tycoon-save-v42`
- **Tests**: Vitest — ~3000 tests across 54 suites (incl. display-proofreader, playtest system, structural parity/exhaustiveness/tripwires); API integration tests in `api/__tests__/`
- **Game Over Screen**: `GameOverScreen.tsx` is a ~500-line orchestrator importing 13 child components from `src/components/gameover/`
- **Test Shortcuts**: `#/fo-test` (Family Office), `#/go-test` (Game Over — variants: `?v=holdco|pe|bankrupt|pe-bankrupt`), `#/bs-test` (Business School graduation)
- **All monetary values in thousands** (1000 = $1M)
- **Game loop**: 10 or 20 annual rounds — Collect → [Restructure] → Event → Allocate → End Year
- **Modes**: Easy ($20M, 80% ownership) / Normal ($5M + $3M debt, 100% ownership) × Quick (10yr) / Standard (20yr) + PE Fund Manager ($100M, 10yr) + Business School (2yr guided tutorial) + Scenario Challenges (admin-authored themed time-limited events, 3-30yr, standalone leaderboards; default flagged admin-only via `VITE_SCENARIO_CHALLENGES_ENABLED`)
- **Business School**: 2 annual rounds, 3 starting businesses, 15-step guided checklist, curated deals/events, platform forging, graduation diploma. Emerald theme. No leaderboard/achievements (except B-School Graduate at 10+ completion).
- **PE Fund Mode**: $100M committed, 2% mgmt fee, 8% hurdle, 20% carry. LP satisfaction 0-100 (5-tier: Delighted/Satisfied/Cautious/At Risk/Critical). Forced liquidation Y10. 6-dimension PE scoring. PE-specific AI debrief with MOIC/IRR/carry/LP analysis.
- **Auth**: Supabase (Google OAuth implicit flow + Magic Link). Anonymous sessions auto-created. `linkIdentity` preserves UUID on upgrade. Postgres trigger auto-creates `player_profiles` on `auth.users` INSERT. Auto-save persists every game to `game_history` (fire-and-forget with `keepalive`).
- **Strategy Debriefs**: AI-generated per game via `/api/ai/analyze-game` (Haiku, ~$0.003/call). Mode-specific prompts with ILTB-sourced operator frameworks. Persisted to `strategy.aiDebrief`. Shown in playbook viewer after Financial Performance section.
- **Scoring**: FEV (Founder Equity Value = EV × ownership%) is primary metric; leaderboard uses adjustedFEV with difficulty multiplier
- **Leaderboard**: 7 tabs; PE entries separated; 500 stored, 50 displayed per tab

## File Size Awareness
- `useGame.ts` is ~6,200 lines — the largest file. New mode logic should go in dedicated modules (e.g., `businessSchool.ts`) rather than adding to useGame.
- `AllocatePhase.tsx` is ~3,900 lines — second largest. New tabs/sections should be extracted to child components.
- `GameOverScreen.tsx` is ~1,100 lines — already uses 13 extracted child components. Follow this pattern.

## Documentation Governance

All design docs, plans, specs, and agent reports go in specific locations. **Do NOT create new markdown files in random directories.**

```
_secret-sauce/              # GITIGNORED — private game design docs
├── mechanics/              # Core game mechanic docs
├── specs/                  # Feature specifications
├── analysis/               # Growth, retention, exploit analysis
├── reviews/                # Agent review reports
└── plans/                  # Implementation plans

docs/                       # GIT-TRACKED — historical decision records
plans/                      # GIT-TRACKED — implementation plans
research/                   # GIT-TRACKED — external research
```

## Key Files
- `src/hooks/useGame.ts` — Zustand store (game actions, state transitions, ~6200 lines)
- `src/hooks/migrations.ts` — Save migration logic (current: v42)
- `src/engine/portfolioBonuses.ts` — Portfolio synergies: route density, sub-type specialization, integration boost
- `src/data/businessSchool.ts` — Business School mode config, businesses, deals, checklist
- `src/data/gameConfig.ts` — Game constants and configuration
- `src/data/achievementPreview.ts` — 35 achievement definitions with pure predicate checks
- `src/data/platformRecipes.ts` — 52 integrated platform recipes (incl. achievement-gated Vertical SaaS+Services)
- `src/engine/types.ts` — All type definitions including BusinessSchoolState, PEScoreBreakdown, CarryWaterfall
- `src/components/screens/GameScreen.tsx` — Main game screen (phase routing)
- `src/components/phases/AllocatePhase.tsx` — Capital allocation (~3900 lines)
- `src/components/screens/GameOverScreen.tsx` — Game over orchestrator
- `src/components/tutorial/BusinessSchoolChecklist.tsx` — B-School checklist sidebar/mobile bar
- `src/components/tutorial/BusinessSchoolGraduation.tsx` — B-School diploma + signup flow
- `src/components/gameover/OperatorPlaybook.tsx` — Strategy playbook viewer
- `src/components/gameover/playbook/PlaybookAIDebrief.tsx` — Strategy Debrief display component
- `src/components/ui/AIAnalysisSection.tsx` — Live AI debrief generation + callback
- `src/services/completionApi.ts` — Fire-and-forget game completion + auto-save (keepalive)
- `src/lib/supabase.ts` — Auth client, listener, auto-link, token management
- `src/hooks/useAuth.ts` — Auth Zustand store
- `src/components/ui/AccountModal.tsx` — Google OAuth + Magic Link auth
- `api/ai/analyze-game.ts` — AI debrief endpoint (mode-specific prompts, PE branch)
- `api/game-history/save.ts` — Auto-save endpoint (completion_id dedup, keepalive-safe)
- `api/leaderboard/submit.ts` — Leaderboard + game_history dual-write (dedup with auto-save)
- `api/admin/` — Admin dashboard endpoints (analytics, community, bschool-stats, backfills)
- `api/_lib/ai.ts` — Anthropic client (Haiku model, configurable timeout)
- `api/_lib/playerStats.ts` — Pre-computed stats (updatePlayerStats, updateGlobalStats)
- `api/_lib/adminAuth.ts` — KV-based admin session tokens (NOT env vars)
- `src/data/scenarioChallenges.ts` — Scenario Challenge config + validation + feature-gating registry
- `src/data/modeGating.ts` — Cross-mode `isActionBlocked` (single authority for B-School/PE/Scenario)
- `src/data/fundStructure.ts` — Parameterized PE fund economics (scenarios can override)
- `src/utils/featureFlags.ts` — `VITE_SCENARIO_CHALLENGES_ENABLED` gate ('true' | 'false' | 'admin-only')
- `src/utils/scenarioUrl.ts` — Unified `?se=` / `?tab=scenarios` parser
- `src/components/admin/ScenarioChallengesTab.tsx` — Admin authoring UI (AI generation + JSON editor)
- `src/components/gameover/ScenarioChallengeResultSection.tsx` — Game-over scenario rank + top 10
- `api/scenario-challenges/{submit,leaderboard,list,active,config}.ts` — Public scenario endpoints (isolated from global leaderboard)
- `api/admin/scenario-challenges.ts` + `api/admin/scenario-challenges/{generate,clear-preview}.ts` — Admin CRUD
- `api/cron/scenario-archive-snapshot.ts` — Weekly Postgres snapshot (Sunday 04:00 UTC)
- `api/_lib/leaderboardCore.ts` — Shared submit core used by both global + scenario leaderboards

### Test Files
- `src/engine/__tests__/display-proofreader.test.ts` — UI copy vs engine constants (~330 tests)
- `src/engine/__tests__/coverage-tripwires.test.ts` — Structural meta-tests (~211 tests)
- `src/engine/__tests__/switch-exhaustiveness.test.ts` — Type variant handler coverage (~112 tests)
- `src/engine/__tests__/drilldown-parity.test.ts` — Engine vs UI calculation parity (~64 tests)
- `src/engine/__tests__/business-school.test.ts` — B-School config, deals, checklist, economy (~26 tests)
- `src/engine/__tests__/achievement-predicates.test.ts` — Achievement check functions

## Deploy Checklist (MANDATORY — do ALL before commit)

### Phase 1: VERIFY (stop if anything fails)
1. **`npx tsc -b`** — NOT `tsc --noEmit`. Vercel uses `tsc -b` which is stricter. This has burned us multiple times.
2. **`npx vitest run`** — Full test suite. Only the pre-existing playtest flaky failure is acceptable.
3. **`npx vite build`** — Verify production bundle compiles.

### Phase 2: DOCUMENT (only after Phase 1 passes)
4. Update `CLAUDE.md` if new patterns, gotchas, or key files added
5. Update `UserManualModal.tsx` if game mechanics changed
6. Update `mechanicsCopy.ts` if mechanic behavior changed (add old description to `BANNED_COPY_PATTERNS`)
7. Update `src/data/changelog.ts` if any player-facing changes (new features, UX changes, bug fixes players would notice)

### Phase 3: COMMIT & DEPLOY
7. Stage specific files (not `git add .`), commit with descriptive message, push

## Feature Planning — Test Coverage Protocol (MANDATORY)

Every new feature plan MUST include a **Test Coverage** section. 6 layers:

| # | Layer | Test File | What to Check |
|---|-------|-----------|---------------|
| 1 | Display Proofreader | `display-proofreader.test.ts` | New UI copy, tooltips, mechanic descriptions |
| 2 | Coverage Tripwires | `coverage-tripwires.test.ts` | New exports, types, events, achievements, recipes, sectors |
| 3 | Switch Exhaustiveness | `switch-exhaustiveness.test.ts` | New enum values or union type variants |
| 4 | Drilldown Parity | `drilldown-parity.test.ts` | New calculations in UI that need engine parity |
| 5 | Playtest Coverage | `playtest/coverage.ts` | New feature registry key + simulator update |
| 6 | Component Display | (relevant test) | New component states or inputs |

## Display Proofreader (MANDATORY)
- When changing ANY game mechanic: update UserManualModal.tsx
- When changing ANY engine constant: update proofreader test AND UI copy
