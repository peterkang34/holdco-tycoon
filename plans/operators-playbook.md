# Operator's Playbook — Implementation Plan

**Author**: Sable Park (Team Lead)
**Date**: March 21, 2026
**Status**: APPROVED — implementation started March 21, 2026
**Depends on**: Existing player accounts, game_history table, game-over screen architecture
**References**: `docs/misc/strategy-template-ux.md` (Lena), `docs/misc/strategy-template-realism.md` (Marcus), `docs/misc/strategy-template-game-design.md` (Reiko), `docs/misc/strategy-template-growth.md` (Nina)
**Reviews**: `_secret-sauce/reviews/{marcus,reiko,lena,dara}-playbook-plan-review.md` (Round 1), `*-r2.md` (Round 2) — March 21, 2026

---

## 0. Decisions Locked

| Decision | Answer | Rationale |
|----------|--------|-----------|
| **Generation** | Auto-generated on every game completion for account holders | Library grows naturally; no friction |
| **Visibility** | Public links, but `noindex, nofollow` on playbook pages | Shareable without being crawlable by search/AI |
| **Navigation** | "Strategy Library" item in account dropdown, separate from Stats | Dedicated space; also accessible from profile |
| **Naming** | "Operator's Playbook" (holdco) / "GP's Playbook" (PE fund) / "Post-Mortem" (bankruptcy) | Per Lena's UX spec — operators use this word |
| **Anonymous players** | See full ephemeral playbook at game over; nudge to save after viewing | Gift first, gate second (Lena P0) |
| **Thesis generation** | Template-based, not AI. ~27+ variants needed (writing project) | Fast, deterministic, free |

---

## 1. Data Model

### 1a. New Supabase columns on `game_history`

```sql
-- Migration: 004-operator-playbook.sql

ALTER TABLE game_history
  ADD COLUMN playbook JSONB,
  ADD COLUMN playbook_share_id TEXT UNIQUE;

-- Index for library queries (player's playbooks, ordered by date)
CREATE INDEX idx_game_history_playbook
  ON game_history (player_id, completed_at DESC)
  WHERE playbook IS NOT NULL;

-- Index for public playbook lookups by share ID
CREATE INDEX idx_game_history_playbook_share_id
  ON game_history (playbook_share_id)
  WHERE playbook_share_id IS NOT NULL;

COMMENT ON COLUMN game_history.playbook IS
  'Auto-generated Operator''s Playbook data. Null for games completed before this feature.';

COMMENT ON COLUMN game_history.playbook_share_id IS
  'Opaque public ID for sharing playbooks. Separate from game_history.id to prevent enumeration.';
```

**Why `playbook_share_id`**: Dara flagged that using `game_history.id` (UUID visible in leaderboard KV entries) as the public access key lets anyone enumerate top players' full game data. A separate opaque ID (12-char hex, same pattern as `public_id` on profiles) prevents this.

### 1b. Playbook JSON shape

The `playbook` column stores a compact representation of the 7 sections. All data is already computed at game-over time — we're just serializing what's currently thrown away.

```ts
// src/engine/types.ts — new type

export interface PlaybookData {
  version: 1;
  generatedAt: string; // ISO timestamp
  isMinimal?: boolean; // true for early bankruptcy (rounds 1-3) — only thesis + capital + reality check rendered

  // Section 1: Investment Thesis
  thesis: {
    archetype: string;
    holdcoName: string;
    grade: string;
    score: number;
    fev: number;
    adjustedFev: number;
    difficulty: string;
    duration: string;
    seed: number; // enables comparing playbooks on same deal flow (Reiko)
    sophisticationScore: number;
    sectorFocus: string[]; // sector IDs at game end
    isFundManager: boolean;
    isBankrupt: boolean;
    totalRounds: number; // actual rounds played (for early bankruptcy)
    challengeSeed?: string; // challenge mode seed for context (Lena R2)
    fundName?: string;
    carryEarned?: number;
  };

  // Section 2: Sector Strategy
  sectors: {
    endingSectorIds: string[];
    allTimeSectorIds: string[];
    endingSubTypes: string[];
    businessesPerSector: Record<string, number>; // sectorId → count (active)
    platformSectors: string[]; // sectors that had platforms forged
  };

  // Section 3: Capital Structure & Deal Philosophy
  capital: {
    dealStructureTypes: Record<string, number>; // structure → count
    peakLeverage: number;
    endingLeverage: number;
    peakDistressLevel: DistressLevel;
    totalDistributions: number;
    totalBuybacks: number;
    equityRaisesUsed: number;
    rolloverEquityCount: number;
    hasRestructured: boolean;
    antiPatterns: string[];
    holdcoLoanUsed: boolean; // Marcus: signals comfort with holdco-level debt
    sellerNotePercentage: number; // Marcus: % of deals using seller notes
    avgMultiplePaid: number; // Marcus: underwriting discipline signal
  };

  // Section 4: Portfolio Construction
  portfolio: {
    totalAcquisitions: number;
    totalSells: number;
    activeCount: number;
    peakActiveCount: number;
    platformsForged: number;
    platformCount: number; // active platforms at end
    endingConstruction: Record<string, number>; // standalone/roll_up/integrated_platform → count
    tuckInCount: number;
    neverSoldCount: number; // Marcus: permanent capital philosophy signal
    avgHoldYears: number; // Marcus: hold discipline
    avgAcquisitionQuality: number; // Marcus: quality bar signal
    ownershipPercentage: number; // ending ownership %
  };

  // Section 5: Operational Playbook
  operations: {
    turnaroundsStarted: number;
    turnaroundsSucceeded: number;
    turnaroundsFailed: number;
    sharedServicesActive: number;
    maSourcingTier: number;
    sourceDealUses: number;
    proactiveOutreachUses: number;
    smbBrokerUses: number;
    recessionAcquisitionCount: number;
  };

  // Section 6: Exit Strategy & Returns
  exits: {
    exitedBusinesses: Array<{
      name: string;
      sector: string;
      acquisitionPrice: number;
      exitPrice: number;
      holdYears: number;
      moic: number;
    }>;
    totalExitProceeds: number;
    blendedMultiple: number;
    portfolioMoic: number;
  };

  // Section 7: Financial Performance (the growth curve)
  performance: {
    metricsTimeline: Array<{
      round: number;
      fev: number;
      totalEbitda: number;
      totalDebt: number;
      cash: number;
      fcfPerShare: number;
      netDebtToEbitda: number;
      distressLevel: DistressLevel;
      // Reiko additions for cross-playbook comparison:
      activeBusinessCount: number;
      totalRevenue: number;
      avgEbitdaMargin: number;
      ownershipPct: number;
      eventType: string | null; // market event that round (recession, boom, etc.)
      totalDistributions: number; // cumulative distributions to date
    }>;
    totalInvestedCapital: number;
    totalShareholderReturn: number; // FEV + distributions
    roiic: number; // return on incremental invested capital (moved from exits — portfolio-level metric)
    fcfConversionRate: number; // cash generation efficiency (moved from exits — portfolio-level metric)
    scoreBreakdown: {
      valueCreation: number;
      fcfShareGrowth: number;
      portfolioRoic: number;
      capitalDeployment: number;
      balanceSheetHealth: number;
      strategicDiscipline: number;
    };
  };

  // PE Fund Mode extras (null for holdco mode)
  peFund?: {
    grossMoic: number;
    netIrr: number;
    dpi: number;
    tvpi: number; // Marcus: Total Value to Paid-In
    rvpi: number; // Marcus: Residual Value to Paid-In
    carryEarned: number;
    managementFees: number;
    lpSatisfaction: number;
    hurdleClearance: boolean;
    irrMultiplier: number; // supercarry multiplier
    totalFundSize: number;
    totalLpDistributions: number; // absolute LP distributions
    peScoreBreakdown: { // PE-specific 6-dimension scoring
      returnGeneration: number;
      capitalEfficiency: number;
      valueCreation: number;
      deployment: number;
      riskManagement: number;
      lpSatisfaction: number;
    };
  };

  // Family Office mode extras (null if FO not completed)
  familyOffice?: {
    foFev: number;
    foMoic: number;
    foMultiplier: number; // 1.0-1.5x multiplier on Adjusted FEV
    legacyGrade: string; // Enduring/Influential/Established/Fragile
    philanthropyAmount: number;
    foRounds: number;
    hasRestructuredDuringFo: boolean;
  };

  // IPO state (null if never went public)
  ipo?: {
    wentPublic: boolean;
    ipoRound: number; // round when IPO occurred (Marcus R2: narrative context)
    stockPrice: number;
    sharesOutstanding: number;
    marketSentiment: number;
    publicCompanyBonus: number;
    shareFundedDeals: number;
  };

  // Section 8: Reality Check footer
  realityCheck: {
    gameToRealityGaps: string[]; // 3-5 key caveats auto-selected based on game state
  };
}
```

**Size estimate**: ~5-8KB per playbook (metricsTimeline is 10-20 entries × ~14 fields, plus enriched sections). Well within JSONB comfort zone.

**metricsTimeline scope**: Main game rounds only (not FO rounds). FO performance is captured in the `familyOffice` section. PE `deploymentPace` is not stored per-round — derivable at render time from `metricsTimeline` (count acquisitions per round from the builder's action history).

### 1c. Archetype guards for thesis generation

The builder must handle edge cases that produce misleading archetypes (Reiko):

| Edge Case | Problem | Guard |
|-----------|---------|-------|
| Bankruptcy | Falls through to `focused_operator` | Force archetype to `bankrupt` — thesis becomes post-mortem |
| PE Fund, 0 acquisitions | Gets `value_investor` (implies discipline) | Force archetype to `inactive_gp` — thesis acknowledges deployment failure |
| Early bankruptcy (rounds 1-3) | Full 7-section playbook is absurd | Generate minimal playbook: thesis + capital section + reality check only. Flag `isMinimal: true` |
| Family Office mode | No specific handling | Combined playbook: main game sections + FO addendum section |

### 1d. Anti-pattern detection rules (Marcus R2)

The `antiPatterns` field in `capital` is populated by the builder using these detection rules. Each pattern includes explanatory text shown in the playbook's Capital Structure section:

| Anti-Pattern | Detection Logic | Playbook Text |
|---|---|---|
| `over_leveraged` | `peakLeverage > 3.5` or `peakDistressLevel === 'breach'` | "Portfolio reached dangerous leverage levels. In reality, covenant breaches trigger lender intervention, board changes, or forced asset sales." |
| `serial_restructurer` | `hasRestructured && restructureCount >= 2` | "Multiple restructurings signal chronic over-leverage rather than bad luck. Real creditors impose increasingly punitive terms on repeat restructurers." |
| `dilution_spiral` | `equityRaisesUsed >= 3 && ownershipPercentage < 0.5` | "Repeated equity raises diluted founder ownership below 50%. Real investors would demand board control and governance rights at this point." |
| `spray_and_pray` | `allTimeSectorCount >= 5 && platformsForged === 0` | "Acquisitions spread across many sectors with no integration thesis. Real operators build value through sector expertise and operational playbooks." |
| `turnaround_graveyard` | `turnaroundsFailed >= 3` | "Multiple failed turnarounds consumed capital and management attention. Real turnarounds are people-dependent — repeated failure suggests a capabilities gap, not bad luck." |
| `fire_sale_exit` | Any business sold at < 0.8x acquisition price | "One or more businesses sold at a loss. In reality, distressed exits attract vulture buyers and destroy reputation in the deal community." |

These are already computed in `GameOverScreen.tsx` `strategyData.antiPatterns` — the builder maps them to explanatory text.

---

## 2. API Routes

### 2a. Modify existing `/api/leaderboard/submit.ts`

When an authenticated player submits to the leaderboard, the playbook data is included in the request body. The route already upserts to `game_history` — we add the `playbook` and `playbook_share_id` columns to that upsert.

**Changes**:
- Accept optional `playbook: PlaybookData` in request body
- **Bump `isBodyTooLarge` threshold from 10KB to 25KB** (Dara critical: current submissions ~3-4KB, playbook adds ~5-8KB)
- **Server-side validation** via shared `api/_lib/playbookValidation.ts`: Validate `playbook.version`, `playbook.thesis.archetype`, and key required fields. Reject malformed payloads rather than storing arbitrary JSON. Same validation used in both submit and dedicated save endpoints (Dara R2)
- Generate `playbook_share_id` server-side (12-char hex, same pattern as profile `public_id`)
- Include `playbook` + `playbook_share_id` in the Supabase upsert to `game_history`

### 2b. New route: `POST /api/player/playbook/save.ts`

**Decoupled from leaderboard** (Lena P0): A player might sign up to save their playbook but skip the leaderboard. This endpoint saves just the playbook.

```
POST /api/player/playbook/save
Authorization: Bearer <token>

Body: {
  playbook: PlaybookData;
  holdcoName: string;
  difficulty: string;
  duration: string;
}

Response: {
  gameId: string;
  shareId: string;
}
```

- Authenticated only
- Creates a `game_history` row with `playbook` populated (if one doesn't already exist for this completion)
- Also called by the leaderboard submit flow, so authenticated players always get both

### 2c. New route: `GET /api/player/playbooks.ts`

Returns the player's playbook library (authenticated).

```
GET /api/player/playbooks?limit=20&offset=0

Response: {
  playbooks: Array<{
    gameId: string;
    shareId: string;          // playbook_share_id for sharing
    holdcoName: string;
    archetype: string;
    grade: string;
    score: number;
    fev: number;
    adjustedFev: number;
    difficulty: string;
    duration: string;
    isFundManager: boolean;
    isBankrupt: boolean;
    completedAt: string;
  }>;
  total: number;
}
```

This is a lightweight index query — pulls from `game_history` where `playbook IS NOT NULL` and `player_id = auth.uid()`. Only returns the thesis-level fields for the library grid, not full playbook data.

**Rate limiting**: 30 req/min (same as `public-profile.ts`).

### 2d. New route: `GET /api/player/playbook/[shareId].ts`

Returns a single full playbook (public, no auth required).

```
GET /api/player/playbook/[shareId]

Response: {
  playbook: PlaybookData;
  playerInitials: string;
  completedAt: string;
}
```

- Looks up `game_history` by `playbook_share_id` (NOT `game_history.id` — prevents enumeration)
- Returns the `playbook` JSONB column + minimal player info
- No auth required (public links), but game must have a non-null playbook
- Returns 404 for games without playbooks or non-existent share IDs
- **Rate limiting**: 30 req/min per IP

### 2e. Response headers for public playbook route

```
X-Robots-Tag: noindex, nofollow
Cache-Control: public, max-age=86400  // playbooks are immutable
```

### 2f. API integration tests

Add to `api/__tests__/` (Dara: project has 62 existing API tests, plan must include these):
- `playbook-save.test.ts` — save endpoint: auth required, validates playbook shape, generates share ID, rejects oversized/malformed payloads
- `playbook-read.test.ts` — public endpoint: returns playbook by share ID, 404 for missing, rate limited
- `playbook-library.test.ts` — library endpoint: auth required, pagination, filters, returns index only (no full playbook data)
- Update `leaderboard-submit.test.ts` — verify playbook included in upsert, body size threshold bump

---

## 3. Client Components

### 3a. Playbook data builder: `src/utils/playbookBuilder.ts`

Pure function that takes game-over props and returns a `PlaybookData` object. Called at game-over time.

**Inputs**: Same props available in `GameOverScreen.tsx` — `strategyData`, `score`, `businesses`, `exitedBusinesses`, `metricsHistory`, `integratedPlatforms`, `metrics`, `fevBreakdown`, etc.

**Output**: `PlaybookData`

This extracts the serialization logic from the component layer. The builder runs once at game-over, and the result is both displayed in the ephemeral view AND submitted to the API.

**Error handling** (Dara): Wrap in try/catch — if builder fails, game-over screen still works normally. Log error to telemetry. Never block the game-over experience.

**Archetype guards**: Apply edge case guards from Section 1c before thesis generation.

**Reality Check auto-selection**: Based on game state, pick 3-5 relevant caveats from a predefined list (Marcus). E.g., if player had high leverage, include the caveat about real-world covenant complexity. If many turnarounds, include the caveat about people-dependent reality.

### 3b. Thesis generator: `src/utils/playbookThesis.ts`

Template-based sentence generation. **Writing project**: ~27+ template variants needed.

**Structure**:
- 9 archetypes × 3 base variants = 27 minimum templates
- Each template has conditional clauses that activate based on distinctive behavior (never-sold count > 0, recession acquisitions > 2, rollover equity used, etc.)
- PE Fund Mode gets its own template family (~9 variants for GP archetypes)
- Bankruptcy/post-mortem gets 3 templates
- Duration parameterizes templates ("over 20 years" vs. "in a compressed 10-year window")

```ts
function generateThesis(data: PlaybookData['thesis'], portfolio: PlaybookData['portfolio']): string {
  // Guard: bankruptcy
  if (data.isBankrupt) return generateBankruptcyThesis(data);
  // Guard: PE inactive
  if (data.isFundManager && portfolio.totalAcquisitions === 0) return generateInactiveGpThesis(data);
  // Normal: archetype-based with conditional clauses
  return generateArchetypeThesis(data, portfolio);
}
```

No AI, no API calls. Pure string interpolation from archetype + key metrics.

### 3c. Game-Over integration: `src/components/gameover/PlaybookCard.tsx`

The Tier 1 CTA card on the game-over screen.

**Placement**: Between AI Analysis and Score Breakdown (per Lena's spec, section 9 in the game-over flow).

**Three states** (updated per Lena P0 — gift first, gate second):
1. **Authenticated player**: Card shows holdco name, archetype badge, grade, FEV, 1-sentence thesis. Button: "View Your Playbook" (opens overlay). Small text: "Saved to your Strategy Library."
2. **Anonymous player**: Same card, same "View Your Playbook" button — **they can view the full playbook**. Below the view button, a secondary CTA: "Sign up to save this to your library." Viewing is the gift; saving is the nudge.
3. **Anonymous → signs up during game over**: Playbook auto-saves via the dedicated save endpoint (decoupled from leaderboard).

### 3d. Playbook overlay: `src/components/gameover/OperatorPlaybook.tsx`

Full-screen overlay (same pattern as `AchievementBrowserModal`). **Lazy-loaded** (Dara: Recharts chunk). Renders all 7 sections + Reality Check footer with progressive disclosure.

**Structure**:
- Tier 2 (summary) is the default view — headline numbers per section
- Each section has a "Show Details" expand toggle for Tier 3 content
- Tier 3 includes: FEV growth line chart (Recharts — already a dependency), deal structure breakdown, score radar, per-business cards
- **Reality Check footer**: 3-5 auto-selected caveats about game-to-reality gaps (Marcus)
- **Early bankruptcy (rounds 1-3)**: Minimal playbook — thesis + capital section + reality check only

**Sections** (7 components + footer, one per section):
1. `PlaybookThesisSection.tsx` — archetype, thesis sentence, hero numbers
2. `PlaybookSectorsSection.tsx` — sector concentration, sub-type breakdown
3. `PlaybookCapitalSection.tsx` — deal structures, leverage, distributions
4. `PlaybookPortfolioSection.tsx` — construction, platforms, buy/sell activity
5. `PlaybookOperationsSection.tsx` — turnarounds, shared services, sourcing
6. `PlaybookExitsSection.tsx` — exit outcomes, hold periods, MOIC distribution
7. `PlaybookPerformanceSection.tsx` — FEV growth chart, TSR, score radar
8. `PlaybookRealityCheck.tsx` — game-to-reality caveats footer

Each section is a self-contained component receiving the relevant slice of `PlaybookData`.

**PE Fund Mode**: Sections adapt per Lena's spec — "GP's Playbook" header, carry as hero metric, PE-specific score radar (6 PE dimensions), fund return curve in Section 7.

**Family Office**: Shows as an addendum section after the main 7 — FO FEV, MOIC, legacy grade, philanthropy amount.

**Bankruptcy**: Framed as "Post-Mortem" — title changes, thesis acknowledges failure.

**Mobile treatment** (Lena P1):
- Overlay uses full-screen sheet on mobile (no side margins)
- Charts sized to viewport width, minimum 280px
- Section expand/collapse uses larger tap targets (48px min)
- Share button uses Web Share API on mobile (native share sheet) with clipboard fallback on desktop

### 3e. Strategy Library modal: `src/components/ui/StrategyLibraryModal.tsx`

Accessed from the account dropdown. Grid/list of all saved playbooks.

**Layout**:
- Header: "Strategy Library" + total count
- **Filter bar** (Lena P1 — two-dimensional): Difficulty toggle (Easy/Hard/All) × Duration toggle (Quick/Full/All) + PE toggle. Sort: date / FEV / grade
- Cards grid: Each card shows holdco name, archetype badge, grade, FEV, difficulty/duration badges, date
- Click a card → opens `OperatorPlaybook` overlay with data fetched from `/api/player/playbook/[shareId]`
- **Empty state**: "Complete a game to generate your first Operator's Playbook."
- **Mobile**: Single-column card list instead of grid
- **Lazy-loaded** (Dara R2: transitively imports Recharts via OperatorPlaybook)

### 3f. Account dropdown addition: `src/components/ui/AccountBadge.tsx`

Add "Strategy Library" menu item between "My Stats" and "Export My Data":

```
My Stats
Strategy Library    ← NEW
─────────────
Export My Data
Delete Account
Sign Out
```

### 3g. Profile integration: `src/components/ui/ProfileModal.tsx`

**Self profile**: Add a "Recent Playbooks" section showing last 3 playbook cards with "View Library" link.

**Public profiles**: Show the player's most recent playbook card (or best-FEV playbook). Click opens the public playbook view.

### 3h. Stats Modal integration: `src/components/ui/StatsModal.tsx`

**Lena P1** (dropped from original plan, restored): In the game history list, each expandable row with strategy data gets a small "View Playbook" link that opens the playbook overlay for that game. Only shown for games with `playbook IS NOT NULL`.

### 3i. Share flow: `src/utils/playbookShare.ts`

**MVP sharing** (no new infra):
1. **Copy link**: The playbook URL (`game.holdcoguide.com/playbook/[shareId]`) copies to clipboard. Uses `playbook_share_id`, not `game_history.id`
2. **Copy summary**: Formatted text block — thesis + 5 key stats
3. **Mobile**: Web Share API for native share sheet

**Playbook page route**: A lightweight client route that fetches `/api/player/playbook/[shareId]` and renders the `OperatorPlaybook` component. Meta tags include `noindex, nofollow`. OG tags pull from the thesis for link previews.

---

## 4. Sharing & Public Playbook Route

### 4a. Client route

**Routing approach** (Dara: hash routing conflict): The app uses hash routing (`#/fo-test`, `#/go-test`), but public playbook URLs need clean paths for OG tags/link previews. Follow the same pattern as the existing scoreboard standalone page (`ScoreboardScreen.tsx`) — use `?pb=SHARE_ID` query parameter parsed at the app root, rendering the standalone playbook view outside the hash router.

- URL format: `game.holdcoguide.com/?pb=abc123def456`
- Fetches playbook data from public API
- Renders `OperatorPlaybook` in standalone mode (no game-over chrome)
- HTML `<meta name="robots" content="noindex, nofollow">`
- OG meta tags: holdco name, archetype, grade, FEV for link previews
- 404 page for missing/invalid playbooks

### 4b. Vercel config

Add to `vercel.json` rewrites if needed (may not be required with query param approach — verify against existing scoreboard pattern).

### 4c. Social image (V2 — not MVP)

Canvas-based image generation for Twitter/Discord cards. Deferred — the link preview with OG tags is sufficient for MVP.

---

## 5. Account Gating

| Player State | Game Over Behavior | Library Access |
|---|---|---|
| **Authenticated** | Playbook auto-generated + auto-saved. Card shows "View Your Playbook" + "Saved to Library" | Full library in account dropdown |
| **Anonymous** | Playbook generated in-memory. Card shows "View Your Playbook" (full access) + "Sign up to save" secondary nudge | No library access |
| **Anonymous → signs up during game over** | Playbook saves via dedicated `/api/player/playbook/save` endpoint (decoupled from leaderboard) | Library available immediately |

The ephemeral playbook for anonymous players uses the same `OperatorPlaybook` component — it just receives `PlaybookData` directly from the builder instead of fetching from the API. The data is in memory at game-over time regardless.

---

## 6. Implementation Phases

### Phase 1: Data + Builder (foundation)

1. Write Supabase migration `004-operator-playbook.sql` (playbook JSONB + playbook_share_id columns)
2. Add `PlaybookData` interface to `src/engine/types.ts`
3. Build `src/utils/playbookBuilder.ts` — pure function, game-over props → PlaybookData, with try/catch wrapping and archetype guards
4. Build `src/utils/playbookThesis.ts` — template-based thesis generator (~27+ variants, PE variants, bankruptcy variants)
5. **Bump `isBodyTooLarge` threshold** in `/api/leaderboard/submit.ts` from 10KB to 25KB
6. Add **server-side validation** of playbook JSONB shape in submit route
7. Modify `/api/leaderboard/submit.ts` to accept, validate, and store `playbook` + generate `playbook_share_id`
8. Build `POST /api/player/playbook/save.ts` — dedicated save endpoint (decoupled from leaderboard)
9. Wire up `GameOverScreen.tsx` to call the builder and include in submission
10. Write API integration tests (`playbook-save.test.ts`, update `leaderboard-submit.test.ts`)

**Exit criteria**: Every new game completion for authenticated players stores playbook JSON in `game_history.playbook` with a `playbook_share_id`.

### Phase 2: Game-Over Playbook View (the wow moment)

1. Build `PlaybookCard.tsx` — CTA card for game-over screen (3 states: auth, anon, anon-signup)
2. Build `OperatorPlaybook.tsx` — full-screen overlay, lazy-loaded
3. Build 7 section components + `PlaybookRealityCheck.tsx` footer (Tier 2 summary content)
4. Add Tier 3 expandable details (FEV chart, radar, per-business cards)
5. Handle PE Fund Mode adaptations (GP's Playbook, PE score radar, carry hero)
6. Handle Family Office addendum section
7. Handle bankruptcy post-mortem framing + early-bankruptcy minimal playbook
8. Integrate into `GameOverScreen.tsx` between AI Analysis and Score Breakdown
9. Handle anonymous vs. authenticated states (view for all, save nudge for anon)
10. Mobile-specific treatment (full-screen sheet, chart sizing, tap targets)

**Exit criteria**: Players see the playbook CTA at game over and can view a polished playbook overlay. Anonymous players can view but are nudged to save.

### Phase 3: Library + Persistence

1. Build `GET /api/player/playbooks.ts` — library index endpoint (rate limited)
2. Build `GET /api/player/playbook/[shareId].ts` — single playbook endpoint (public, rate limited)
3. Build `StrategyLibraryModal.tsx` — library grid with 2D filters (difficulty × duration + PE toggle) and sort
4. Add "Strategy Library" to `AccountBadge.tsx` dropdown
5. Add playbook section to `ProfileModal.tsx` (self + public)
6. Add "View Playbook" links to `StatsModal.tsx` game history rows
7. Add auth store toggle for the library modal
8. Write API integration tests (`playbook-read.test.ts`, `playbook-library.test.ts`)

**Exit criteria**: Players can browse their playbook library from the account menu and view any past playbook.

### Phase 4: Sharing + Public Route

1. Add public playbook route (query param pattern: `?pb=SHARE_ID`, matching scoreboard approach)
2. Add Vercel rewrite if needed
3. Build standalone playbook page (fetches from public API, renders OperatorPlaybook)
4. Add `noindex, nofollow` meta tags
5. Add OG meta tags for link previews
6. Build `playbookShare.ts` — copy link (uses shareId) + copy summary + Web Share API on mobile
7. Add share buttons to the playbook overlay

**Exit criteria**: Players can share a playbook link that others can view without an account.

---

## 7. Test Coverage

### Display Proofreader
- [ ] Add thesis template assertions — verify generated thesis strings contain correct archetype names from `archetypeNames.ts`
- [ ] Verify playbook section headers match any copy in `mechanicsCopy.ts` if applicable
- [ ] Add PE Fund Mode thesis variant assertions (GP's Playbook, carry-based language)
- [ ] Verify Reality Check caveats reference accurate game mechanics

### Coverage Tripwires
- [ ] New exports: `playbookBuilder.ts`, `playbookThesis.ts`, `playbookShare.ts` — tripwires will fire if untested
- [ ] New type: `PlaybookData` — verify all fields populated by builder for every archetype
- [ ] New API routes: `/api/player/playbook/save.ts`, `/api/player/playbooks.ts`, `/api/player/playbook/[shareId].ts`

### Switch Exhaustiveness
- [ ] Archetype → thesis template mapping must handle all archetype variants (including `bankrupt` and `inactive_gp` guards)
- [ ] Difficulty/duration → playbook display labels must handle all enum values
- [ ] `distressLevel` in `metricsTimeline` must use `DistressLevel` type with handlers in the performance chart
- [ ] `legacyGrade` in Family Office section must handle all variants

### Drilldown Parity
- [ ] `playbookBuilder.ts` FEV computation must match `fevBreakdown` in `GameOverScreen.tsx`
- [ ] `exits.portfolioMoic` must match `metrics.portfolioMoic` from engine
- [ ] `performance.totalShareholderReturn` must equal FEV + totalDistributions
- [ ] `peFund.tvpi` must match engine computation (TVPI = (NAV + distributions) / paid-in)

### Playtest Coverage
- [ ] Add `FEATURE_REGISTRY` key: `operator_playbook`
- [ ] Simulator must call `playbookBuilder()` on game completion and validate all sections are non-empty (or minimal for early bankruptcy)
- [ ] Verify playbook generation doesn't throw for edge cases: 0 acquisitions, bankruptcy (early + late), PE fund (active + inactive), Family Office, Quick Play, IPO

### Component Display Parity
- [ ] `PlaybookCard.tsx` renders correctly for all game modes (holdco/PE/bankruptcy) and auth states (auth/anon)
- [ ] `OperatorPlaybook.tsx` sections render without errors for empty states (0 turnarounds, 0 platforms, 0 exits)
- [ ] Library modal handles empty state (new account, no games)
- [ ] Public playbook route handles 404 gracefully
- [ ] Mobile layout renders correctly (full-screen sheet, chart sizing, tap targets)

### API Integration Tests
- [ ] `playbook-save.test.ts` — auth required, validates shape, generates share ID, rejects malformed
- [ ] `playbook-read.test.ts` — public endpoint, returns by share ID, 404 for missing, rate limited
- [ ] `playbook-library.test.ts` — auth required, pagination, index only
- [ ] Updated `leaderboard-submit.test.ts` — body size threshold, playbook in upsert

---

## 8. Files Created / Modified

### New Files
| File | Purpose |
|------|---------|
| `docs/migrations/004-operator-playbook.sql` | Supabase migration (playbook + playbook_share_id) |
| `src/utils/playbookBuilder.ts` | Game-over props → PlaybookData (with guards + try/catch) |
| `src/utils/playbookThesis.ts` | Template-based thesis generation (~27+ variants) |
| `src/utils/playbookShare.ts` | Copy link + copy summary + Web Share API |
| `src/components/gameover/PlaybookCard.tsx` | Game-over CTA card (3 auth states) |
| `src/components/gameover/OperatorPlaybook.tsx` | Full playbook overlay (lazy-loaded) |
| `src/components/gameover/playbook/PlaybookThesisSection.tsx` | Section 1 |
| `src/components/gameover/playbook/PlaybookSectorsSection.tsx` | Section 2 |
| `src/components/gameover/playbook/PlaybookCapitalSection.tsx` | Section 3 |
| `src/components/gameover/playbook/PlaybookPortfolioSection.tsx` | Section 4 |
| `src/components/gameover/playbook/PlaybookOperationsSection.tsx` | Section 5 |
| `src/components/gameover/playbook/PlaybookExitsSection.tsx` | Section 6 |
| `src/components/gameover/playbook/PlaybookPerformanceSection.tsx` | Section 7 |
| `src/components/gameover/playbook/PlaybookRealityCheck.tsx` | Reality Check footer |
| `src/components/ui/StrategyLibraryModal.tsx` | Library grid modal (2D filters) |
| `api/_lib/playbookValidation.ts` | Shared playbook JSONB validation (used by submit + save) |
| `api/player/playbook/save.ts` | Dedicated playbook save endpoint |
| `api/player/playbooks.ts` | Library index endpoint |
| `api/player/playbook/[shareId].ts` | Single playbook endpoint (public) |
| `api/__tests__/playbook-save.test.ts` | Save endpoint integration tests |
| `api/__tests__/playbook-read.test.ts` | Public read integration tests |
| `api/__tests__/playbook-library.test.ts` | Library endpoint integration tests |
| `src/engine/__tests__/playbook-builder.test.ts` | Builder unit tests |
| `src/engine/__tests__/playbook-thesis.test.ts` | Thesis generation tests |

### Modified Files
| File | Change |
|------|--------|
| `src/engine/types.ts` | Add `PlaybookData` interface |
| `api/leaderboard/submit.ts` | Accept + validate + store `playbook` JSONB; bump body size limit 10KB → 25KB; generate `playbook_share_id` |
| `api/__tests__/leaderboard-submit.test.ts` | Update for playbook in upsert + body size |
| `src/components/screens/GameOverScreen.tsx` | Call builder, pass to PlaybookCard, include in submission |
| `src/components/ui/AccountBadge.tsx` | Add "Strategy Library" menu item |
| `src/components/ui/ProfileModal.tsx` | Add playbook section (self + public) |
| `src/components/ui/StatsModal.tsx` | Add "View Playbook" links in game history rows |
| `src/hooks/useAuth.ts` | Add `showStrategyLibraryModal` toggle |
| `vercel.json` | Add rewrite if needed for playbook route |
| `src/engine/__tests__/coverage-tripwires.test.ts` | Update for new exports |
| `src/engine/__tests__/switch-exhaustiveness.test.ts` | Update for new type variants |

---

## 9. Resolved Questions

1. **Backfill**: No. Existing `game_history` rows won't get playbooks. Feature starts fresh — only new completions generate playbooks.
2. **Library limit**: No cap. Storage cost is negligible (~5-8KB per game).
3. **Pinning/favorites**: Deferred to V2. Signature playbook on profile is a natural extension.
4. **Compare mode**: Deferred to V2. Side-by-side playbooks is strong retention but significant UI work.
5. **Playbook versioning**: Yes. `version: 1` in the schema. Renderer handles migration for old playbooks if schema changes later.

---

## 10. Copy & UI Decisions (locked)

| Context | Copy |
|---------|------|
| **Game-over CTA button (auth)** | "View Your Playbook" |
| **Game-over CTA button (anon)** | "View Your Playbook" (primary) / "Sign up to save this to your library" (secondary) |
| **Game-over CTA subtitle (auth)** | "Saved to your Strategy Library" |
| **Overlay title (holdco)** | "[HoldcoName] — Operator's Playbook" |
| **Overlay title (PE)** | "[FundName] — GP's Playbook" |
| **Overlay title (bankruptcy)** | "[HoldcoName] — Post-Mortem" |
| **Account dropdown** | "Strategy Library" |
| **Library empty state** | "Complete a game to generate your first Operator's Playbook." |
| **Library error state** | "Couldn't load your playbooks. Try again." |
| **Public 404** | "This playbook doesn't exist or has been removed." |
| **Share button** | "Share Playbook" |
| **Copy link toast** | "Playbook link copied" |
