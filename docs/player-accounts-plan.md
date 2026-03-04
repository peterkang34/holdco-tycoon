# Player Accounts & Performance History — Implementation Plan

**Date:** March 2, 2026
**Status:** Final — all open questions resolved
**Feature:** Optional player accounts, game history tracking, strategy analytics dashboard

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Architecture Decision](#architecture-decision)
3. [Supabase Pro vs Free Tier](#supabase-pro-vs-free-tier)
4. [Auth Flow: Anonymous → Account Upgrade](#auth-flow-anonymous--account-upgrade)
5. [Claiming Historical Leaderboard Entries](#claiming-historical-leaderboard-entries)
6. [Data Model](#data-model)
7. [UX Design](#ux-design)
8. [Security](#security)
9. [Implementation Phases](#implementation-phases)
10. [What This Doesn't Include](#what-this-doesnt-include)
11. [Open Questions](#open-questions)

---

## Problem Statement

Player feedback:

> "Identical initials can make it difficult to distinguish performance trends or evaluate competitive dynamics. If the game could group these entries together, it would open up possibilities for deeper analysis — such as tracking collective progress, comparing aggregated scores, or identifying standout strategies among players with overlapping identifiers."

Core asks:
- **Distinguish players** who share initials on the leaderboard
- **Track game history** across sessions so players can see their progression
- **Strategy analytics** — which archetypes and approaches correlate with better scores
- **Optional, not mandatory** — guest mode stays frictionless, accounts are for hardcore players

---

## Architecture Decision

### Hybrid: Supabase (Auth + Postgres) + Vercel KV (Leaderboard)

| Layer | Tool | Rationale |
|-------|------|-----------|
| **Auth** | Supabase Auth | Anonymous sign-in that upgrades to Google/email with UUID preserved. Built-in CAPTCHA, rate limiting, JWT handling. |
| **Player data** | Supabase Postgres | SQL enables the analytics queries that are the entire point — avg score by archetype, trend analysis, anti-pattern frequency, cross-mode comparison. RLS handles authorization. |
| **Leaderboard** | Vercel KV (unchanged) | Already working. Redis sorted sets are purpose-built for ranked leaderboards. No reason to migrate. |
| **Sync** | Dual-write on submit | `POST /api/leaderboard/submit` writes to KV (existing) + INSERTs to Postgres (new). Independent systems, no coupling. |

### Why not KV-only?

Redis can handle player profiles and game history lists, but falls apart for the analytical queries that make this feature valuable:

| Query | Postgres | Redis |
|-------|----------|-------|
| "Avg score by archetype" | `GROUP BY archetype` | Must pre-compute on every write or scan all data client-side |
| "Score trend with rolling average" | Window functions | Fetch all games, compute in JS |
| "Win rate by difficulty x duration" | `GROUP BY difficulty, duration` | Must pre-compute 4 separate counters |
| "Which anti-patterns do I hit most?" | `unnest(array) + GROUP BY` | Possible with ZSET but clunky |
| "Compare my stats to global average" | Single aggregate query | Must maintain separate global counters |

KV would work for a stripped-down MVP but would paint us into a corner the moment we want any meaningful analytics. Since the analytics ARE the feature, go with Postgres from the start.

### Why Supabase specifically?

- Already used on Agency Growth Foundation — familiar DX
- Anonymous auth with UUID preservation on upgrade (the killer feature for guest-first games)
- RLS policies = authorization without custom middleware
- Vercel Marketplace integration auto-syncs env vars
- Free tier is generous (50K MAU, 500MB DB)
- `@supabase/supabase-js` is the only new dependency (~30-45KB gzipped)

---

## Supabase Pro vs Free Tier

### Free Tier Limitations

| Constraint | Free Tier | Pro ($25/mo) | Impact |
|-----------|-----------|-------------|--------|
| **Inactivity pause** | Project pauses after 7 days of no API requests | Never pauses | **This is the dealbreaker.** A live game at game.holdcoguide.com cannot have its database randomly go offline because nobody played for a week. |
| **MAU** | 50,000 | 100,000 (then $0.00325/MAU overage) | Not a concern — 50K MAU is plenty for current scale |
| **Database size** | 500MB | 8GB | 500MB is ~500K game_history rows with full strategy data. Plenty for years. |
| **Storage** | 1GB | 100GB | Not using Supabase Storage — N/A |
| **Edge functions** | 500K invocations/mo | 2M | Not using Supabase Edge Functions — auth is client-side, API routes are Vercel serverless |
| **Realtime** | 200 concurrent connections | 500 | Not using Realtime — N/A |
| **Daily backups** | No | Yes, 7-day retention | Important for data integrity |
| **Support** | Community only | Email support | Nice to have |
| **Projects** | 2 active | Unlimited | Already using 1 for Agency Growth Foundation |
| **Point-in-time recovery** | No | No (requires Team plan at $599/mo) | Not critical |
| **Log retention** | 1 day | 7 days | Helpful for debugging auth issues |

### The Inactivity Pause Problem

This is the single biggest issue with the free tier for a production game:

1. **What happens:** If no Supabase API requests are made for 7 consecutive days, the project is automatically paused. The database goes offline. Auth stops working. Any player trying to create an account or load their stats gets an error.

2. **Workaround — keep-alive cron:** You could set up a Vercel Cron job that pings Supabase every 6 days. This costs nothing (Vercel Hobby includes 1 cron job) and technically prevents the pause.

3. **Why the workaround is fragile:**
   - If the cron job fails silently (Vercel outage, config error, env var rotation), the project pauses and you don't notice until a player reports it
   - Supabase has changed their inactivity policies before — the 7-day window could shrink
   - It's a hack that adds a maintenance surface for saving $25/mo

4. **Resume time:** When a paused project is resumed, it takes 1-5 minutes to come back online. During that time, all auth and database calls fail.

### The Free Tier Project Limit

Supabase free tier allows 2 active projects. You're already using one for Agency Growth Foundation. Adding Holdco Tycoon would use your second slot. If you ever need a third project (BH Recruiter or a new project), you'd need Pro anyway.

### Cost-Benefit Analysis

| Scenario | Free + Cron Workaround | Pro ($25/mo) |
|----------|----------------------|-------------|
| **Annual cost** | $0 + engineering time for cron setup/monitoring | $300/year |
| **Reliability** | 99% (cron failure = downtime) | 99.9% (Supabase SLA) |
| **Daily backups** | No — if data corrupts, it's gone | Yes, 7-day retention |
| **Project slots** | Uses 2 of 2 free slots | Unlimited |
| **DX** | Must remember cron exists, monitor it | Set and forget |
| **Player trust** | Risk of intermittent outages | Consistent availability |

### Decision

**Using existing Supabase Pro account.** Already on Pro for Agency Growth Foundation — create a new project under the same account. This gives us:

- No inactivity pause risk
- Daily backups from day one
- Unlimited projects
- No keep-alive cron needed

---

## Auth Flow: Anonymous → Account Upgrade

### How Supabase Anonymous Auth Works

```
1. First visit → supabase.auth.signInAnonymously()
   - Creates a real user in auth.users with is_anonymous: true
   - Returns a JWT with sub: "uuid-123" and is_anonymous: true
   - Session persists in localStorage (survives tab close/reopen)

2. Player plays normally
   - UUID silently attached to game submissions
   - Player_profile row created on first game completion
   - No UI change — player doesn't know they have a session

3. Player wants an account (optional, after nudge)
   - supabase.auth.linkIdentity({ provider: 'google' })
   - UUID STAYS THE SAME — is_anonymous flips to false
   - All past games already linked via player_id = UUID
   - Zero data migration needed

4. Returning player
   - Supabase auto-restores session from localStorage
   - If session expired, silent refresh via refresh token
   - If localStorage cleared, a new anonymous session is created (past data orphaned)
```

### Why This Is Better Than Device Fingerprinting

The anonymous auth approach means:
- No custom device ID generation
- No localStorage matching for retroactive claiming
- No "linking tokens" or claiming flow
- The identity exists from game 1, silently
- Upgrade is a single method call, not a migration

### Edge Case: Cleared Browser Data

If a player clears localStorage before creating an account, their anonymous session is lost. A new anonymous UUID is created on next visit. Past games are orphaned (still in DB but unlinked to the new identity).

Mitigation: The signup nudge copy should mention this — "Create an account to keep your stats safe, even if you clear your browser."

This is an acceptable tradeoff. Players who care about their history will create an account. Players who don't care won't notice.

---

## Claiming Historical Leaderboard Entries

### The Problem

The KV leaderboard already has ~500 entries submitted before player accounts exist. These entries have no `player_id` — they're identified only by initials + holdco name. When a hardcore player creates an account, they'll want their historical entries linked to their profile so their full track record shows up in My Stats.

### Why This Is Tricky

There is no cryptographic proof of ownership for historical entries:

| Data | In player's localStorage? | In public leaderboard API? | Useful as proof? |
|------|:------------------------:|:--------------------------:|:----------------:|
| Entry ID (server-assigned UUID) | No — client generates a separate ID | Yes (in API response) | No — IDs don't match |
| Holdco name + initials | Yes | Yes | Weak — publicly visible |
| Score + grade | Yes | Yes | Weak — publicly visible |
| Date (ISO timestamp) | Yes | Yes | Weak — publicly visible |
| Strategy object (archetype, anti-patterns, etc.) | Yes | Yes (returned by API) | Weak — technically scrapable |
| Full game state (Zustand save) | Yes (`holdco-tycoon-save-v35`) | No | Strong — but only for current game |

**The core issue:** Everything stored on a KV leaderboard entry is also returned by the public GET API. There's no server-side secret that only the original submitter would know.

### Two-Era Solution

The claiming system has different approaches for historical (pre-feature) and future (post-feature) entries.

#### Era 1: Historical Entries (pre-feature, ~500 entries in KV)

**Approach: localStorage composite matching with one-time claim window.**

When a player creates an account, the system reads their `holdco-tycoon-leaderboard` localStorage (which stores up to 10 of their best entries). For each local entry, it searches the KV leaderboard for a match using a composite key:

```
Match criteria (ALL must match):
  - initials (exact)
  - holdcoName (exact)
  - score (exact)
  - grade (exact)
  - difficulty (exact)
  - duration (exact)
  - date (within ±60 seconds — client and server timestamps may drift slightly)
```

This composite is effectively a fingerprint. Two different players would need identical initials, holdco name, score, grade, difficulty, duration, AND submission time to collide — astronomically unlikely.

**UX flow:**

```
┌──────────────────────────────────────────────────┐
│  Welcome! We found 4 games from this browser     │
│  that may be yours.                              │
│                                                  │
│  ☑  Apex Holdings    A-  $340M  E/20  Mar 2      │
│  ☑  Summit Capital   B+  $210M  H/20  Feb 28     │
│  ☑  Cedar Group      C   $45M   H/10  Feb 25     │
│  ☑  Titan Partners   B   $180M  E/20  Feb 20     │
│                                                  │
│  [ Claim These Games ]        [ Skip for Now ]   │
└──────────────────────────────────────────────────┘
```

Shown once, immediately after account creation (in the account creation success flow). Player can uncheck any entries they don't want to claim.

**Safeguards:**
- **One-time claim per entry** — once a KV entry is linked to a player_id, it cannot be claimed again. First valid claim wins.
- **Claim window** — historical claiming available for 90 days after the feature launches. After that, only Era 2 (cryptographic) claiming works. This limits the attack surface.
- **Max 10 claims per account** — matches the localStorage cap. Prevents bulk scraping attacks.
- **Requires localStorage data** — the player must have matching entries in their browser. You can't claim entries you don't have locally.
- **Server verifies composite match** — the client sends its local entries, the server finds matches in KV and verifies the composite key aligns before linking.

**What gets stored on claim:**

When a historical entry is claimed, the server:
1. Reads the matching KV entry from the `leaderboard:v2` sorted set
2. Adds `player_id` to the entry JSON and writes it back to KV (preserving score/rank)
3. Inserts a corresponding `game_history` row in Postgres (for the dashboard)
4. Updates `player_stats` aggregates

**Security assessment:**

| Attack | Feasibility | Risk | Mitigation |
|--------|------------|------|------------|
| Scrape API, forge localStorage, claim others' entries | Medium — requires knowing exact composite key values AND creating a matching localStorage structure | Low — attacker gains a score on their dashboard, doesn't remove it from original player's KV position | Claim window (90 days) + rate limit (10 claims/account) + one-time-per-entry lock |
| Claim your own entries from a different browser | Impossible without localStorage from original browser | N/A | By design — this is a limitation, not a bug |
| Two players with identical composites race to claim | Astronomically unlikely (same initials + holdco name + score + grade + difficulty + duration + date) | Near zero | First claim wins, second gets "already claimed" error |

**Verdict:** Good enough for a free browser game. The incentive to fake a claim is negligible (you get someone else's score on your private dashboard — so what?), and the effort required is disproportionate.

#### Era 2: Future Entries (post-feature)

**Approach: Claim tokens minted at submission time.**

After the feature ships, every new leaderboard submission generates a `claimToken` — a random UUID that serves as cryptographic proof of ownership.

```
On score submission:
1. Client generates claimToken = crypto.randomUUID()
2. Client sends claimToken in POST /api/leaderboard/submit body
3. Server stores claimToken on the KV entry (alongside all other fields)
4. Client stores claimToken in localStorage alongside the local entry
5. GET /api/leaderboard/get NEVER returns claimToken (server strips it)
```

When a future player creates an account and claims entries:
- Client sends `{ entryId, claimToken }` pairs from localStorage
- Server verifies each `claimToken` matches what's stored on the KV entry
- If match: link entry to player_id, invalidate the claimToken

**This is proper secret-based verification** — the claimToken is never exposed via any public API, so only the original browser session can prove ownership.

For players who already have Supabase anonymous auth running (Phase 1), this is actually moot — their `player_id` is already attached to submissions from day one. Claim tokens are a fallback for edge cases:
- Player clears browser data, gets a new anonymous UUID, then creates an account and wants to reclaim entries from their old UUID
- Player switches devices
- Supabase anonymous session expires and isn't refreshed

#### Summary: What Handles What

```
Timeline:
                    Feature launches
                          │
  ──────────────────────── ┼ ───────────────────────────────
  Historical entries       │  Future entries
  (no player_id,           │  (anonymous UUID attached,
   no claimToken)          │   claimToken generated)
                           │
  Claiming method:         │  Claiming method:
  localStorage composite   │  1. Automatic (anonymous UUID)
  match (90-day window)    │  2. claimToken fallback
```

### Impact on Data Model

Add to the KV leaderboard entry JSON:

```typescript
// New fields on LeaderboardEntry (KV)
{
  ...existingFields,
  playerId?: string;     // Supabase user UUID (set on submission or claim)
  claimToken?: string;   // Secret UUID for ownership proof (never returned by GET API)
  claimedAt?: string;    // ISO timestamp of when entry was claimed (null if unclaimed)
}
```

Add to Postgres `game_history`:

```sql
-- Already has leaderboard_entry_id UUID for cross-reference
-- Add:
claimed_from_historical BOOLEAN NOT NULL DEFAULT false;
-- true = this row was created by claiming a pre-existing KV entry
-- false = this row was created by a normal game completion
```

### Impact on API

**New endpoint: `POST /api/player/claim-history`**

```typescript
// Request
{
  claims: Array<{
    // For historical entries (Era 1): composite match
    initials: string;
    holdcoName: string;
    score: number;
    grade: string;
    difficulty: string;
    duration: string;
    date: string;  // ISO timestamp
  } | {
    // For future entries (Era 2): token match
    entryId: string;
    claimToken: string;
  }>
}

// Response
{
  results: Array<{
    status: 'claimed' | 'already_claimed' | 'not_found' | 'mismatch';
    entryId?: string;
    holdcoName?: string;
  }>
}
```

**Rate limit:** 1 claim request per 5 minutes per user. Max 10 entries per request.

**Modify: `GET /api/leaderboard/get`**

Strip `claimToken` from all entries before returning. Add `playerId` (if claimed/authenticated) for the verified badge feature.

**Modify: `POST /api/leaderboard/submit`**

Accept optional `claimToken` in request body. Store on KV entry. Also accept `playerId` from verified JWT if authenticated.

### Impact on Implementation Phases

**Phase 1 additions:**
- Add `claimToken` generation to leaderboard submit flow
- Strip `claimToken` from GET response, add `playerId` for verified badge
- Store `playerId` on KV entries for authenticated submissions

**Phase 2 additions:**
- Build claim-history endpoint
- Build "claim your games" UI in account creation success flow
- Historical composite matching logic
- claimToken verification logic

### Impact on UX

The claiming flow appears once, immediately after account creation:

```
Account created (Google OAuth)
  ↓
System checks localStorage for holdco-tycoon-leaderboard entries
  ↓
If entries found:
  Show "Claim Your Games" screen (checklist of matched entries)
  Player confirms → POST /api/player/claim-history
  ↓
If no entries found (or player skips):
  Go directly to My Stats (empty state)
  Toast: "Play a game to start tracking your stats!"
```

After the 90-day historical claiming window closes, this screen only appears if there are unclaimed entries with valid claimTokens (Era 2).

---

## Data Model

### Table: `player_profiles`

```sql
CREATE TABLE player_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  initials TEXT NOT NULL CHECK (initials ~ '^[A-Z]{2,4}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_played_at TIMESTAMPTZ
);

CREATE INDEX idx_player_profiles_initials ON player_profiles (initials);

ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players manage own profile"
  ON player_profiles FOR ALL
  USING (auth.uid() = id);
```

### Table: `game_history`

One row per completed game. Captures everything from the current `LeaderboardEntry` + `LeaderboardStrategy` types, plus a lightweight highlights blob.

```sql
CREATE TABLE game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,

  -- Game identity
  holdco_name TEXT NOT NULL,
  initials TEXT NOT NULL,

  -- Configuration
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'normal')),
  duration TEXT NOT NULL CHECK (duration IN ('standard', 'quick')),
  seed BIGINT,
  is_challenge BOOLEAN NOT NULL DEFAULT false,

  -- Scoring
  enterprise_value BIGINT NOT NULL,
  founder_equity_value BIGINT NOT NULL,
  founder_personal_wealth BIGINT NOT NULL DEFAULT 0,
  adjusted_fev BIGINT NOT NULL,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  grade TEXT NOT NULL CHECK (grade IN ('S','A','B','C','D','F')),
  submitted_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,

  -- Portfolio
  business_count INT NOT NULL,
  total_revenue BIGINT,
  avg_ebitda_margin NUMERIC(5,3),
  has_restructured BOOLEAN NOT NULL DEFAULT false,

  -- Endgame
  family_office_completed BOOLEAN NOT NULL DEFAULT false,
  legacy_grade TEXT,
  fo_multiplier NUMERIC(3,2) DEFAULT 1.0,
  went_public BOOLEAN NOT NULL DEFAULT false,

  -- Strategy (full object as JSONB for flexibility)
  strategy JSONB,

  -- Score breakdown (6 dimensions, denormalized for fast queries)
  score_value_creation NUMERIC(4,1),
  score_fcf_share_growth NUMERIC(4,1),
  score_portfolio_roic NUMERIC(4,1),
  score_capital_deployment NUMERIC(4,1),
  score_balance_sheet NUMERIC(4,1),
  score_strategic_discipline NUMERIC(4,1),

  -- Lightweight highlights (~500 bytes, key moments for dashboard flavor)
  highlights JSONB,
  -- Example: {
  --   biggestDeal: { name, sector, price, round },
  --   bestExit: { name, moic, round },
  --   worstEvent: { type, title, round },
  --   peakEV: { value, round }
  -- }

  -- Cross-reference
  leaderboard_entry_id UUID,

  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_history_player_date ON game_history (player_id, completed_at DESC);
CREATE INDEX idx_game_history_player_fev ON game_history (player_id, adjusted_fev DESC);
CREATE INDEX idx_game_history_completed ON game_history (completed_at DESC);

ALTER TABLE game_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read own history"
  ON game_history FOR SELECT
  USING (auth.uid() = player_id);

CREATE POLICY "Players insert own history"
  ON game_history FOR INSERT
  WITH CHECK (auth.uid() = player_id);
```

### Table: `player_stats` (pre-computed, updated on each game)

```sql
CREATE TABLE player_stats (
  player_id UUID PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,

  -- Counts
  total_games INT NOT NULL DEFAULT 0,
  total_games_by_mode JSONB NOT NULL DEFAULT '{}',
  -- { "easy_standard": 3, "easy_quick": 2, "normal_standard": 5, "normal_quick": 1 }

  -- Scores
  avg_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  best_score INT NOT NULL DEFAULT 0,
  best_adjusted_fev BIGINT NOT NULL DEFAULT 0,

  -- Grade distribution
  grade_distribution JSONB NOT NULL DEFAULT '{}',
  -- { "S": 1, "A": 3, "B": 5, "C": 2, "D": 0, "F": 0 }

  -- Strategy patterns
  archetype_stats JSONB NOT NULL DEFAULT '{}',
  -- { "platform_builder": { "count": 5, "avgScore": 72.5 }, ... }
  anti_pattern_frequency JSONB NOT NULL DEFAULT '{}',
  -- { "over_leveraged": 4, "serial_restructurer": 2 }

  -- Mode breakdown
  avg_score_by_mode JSONB NOT NULL DEFAULT '{}',
  -- { "easy_standard": 62, "normal_standard": 58, ... }

  -- Trend (rolling comparison)
  score_trend NUMERIC(5,2),
  -- Positive = improving. Last 5 avg minus prior 5 avg.

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read own stats"
  ON player_stats FOR SELECT
  USING (auth.uid() = player_id);
```

### Table: `global_stats` (singleton, updated periodically)

```sql
CREATE TABLE global_stats (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_games INT NOT NULL DEFAULT 0,
  avg_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_adjusted_fev BIGINT NOT NULL DEFAULT 0,
  grade_distribution JSONB,
  archetype_distribution JSONB,
  avg_score_by_archetype JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS — public read
ALTER TABLE global_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read"
  ON global_stats FOR SELECT
  USING (true);
```

### Key Analytics Queries

```sql
-- Last 20 games
SELECT * FROM game_history
WHERE player_id = $1
ORDER BY completed_at DESC LIMIT 20;

-- Average score by archetype
SELECT strategy->>'archetype' as archetype, AVG(score), COUNT(*)
FROM game_history
WHERE player_id = $1 AND strategy->>'archetype' IS NOT NULL
GROUP BY strategy->>'archetype'
ORDER BY AVG(score) DESC;

-- Score trend over time
SELECT completed_at::date, score, grade,
  AVG(score) OVER (ORDER BY completed_at ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) as rolling_avg
FROM game_history
WHERE player_id = $1
ORDER BY completed_at;

-- Win rate by mode
SELECT difficulty, duration, COUNT(*) as games,
  AVG(score) as avg_score,
  COUNT(*) FILTER (WHERE grade IN ('S','A')) as high_grade_count
FROM game_history
WHERE player_id = $1
GROUP BY difficulty, duration;

-- Most common anti-patterns
SELECT pattern, COUNT(*) as frequency
FROM game_history, jsonb_array_elements_text(strategy->'antiPatterns') as pattern
WHERE player_id = $1
GROUP BY pattern
ORDER BY frequency DESC;

-- Compare to global average
SELECT
  ps.avg_score as my_avg, gs.avg_score as global_avg,
  ps.best_adjusted_fev as my_best, gs.avg_adjusted_fev as global_avg_fev
FROM player_stats ps, global_stats gs
WHERE ps.player_id = $1;
```

---

## UX Design

### Guest Experience (Unchanged)

Game loads → play → enter initials → submit to leaderboard. Zero friction. The anonymous Supabase session runs silently in the background — no visible change.

### Signup Nudge (GameOverScreen, after 2+ games)

Appears as an inline card below the "Score saved!" confirmation. Not a modal.

```
┌──────────────────────────────────────────────────┐
│  📊  Track your progress across games            │
│                                                  │
│  See which strategies work best, track your      │
│  personal records, and claim your leaderboard    │
│  entries.                                        │
│                                                  │
│  [ Create Free Account ]         [ Not now ]     │
└──────────────────────────────────────────────────┘
```

**Display rules:**
- Only after 2+ completed games (tracked via localStorage counter)
- Dismissible — "Not now" hides for this session
- Never shows again after 3 dismissals
- Never shows to logged-in players

**Copy variations by context:**
- Default: "Track your progress across games" (value-focused)
- After scoring A+: "Your stats deserve a home" (achievement-focused)
- After making leaderboard: "Claim your leaderboard spot" (competitive)

### Account Creation Modal

Single screen, uses existing Modal component:

```
┌──────────────────────────────────────────────┐
│  Create Account                         [x]  │
│                                              │
│  Track your games, claim leaderboard         │
│  entries, and see your strategy stats.       │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │       Continue with Google           │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ─────────────── or ────────────────         │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  Email: [_________________________]  │    │
│  │         [ Send Magic Link ]          │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  By continuing, you agree to our Terms.      │
└──────────────────────────────────────────────┘
```

- Google OAuth = primary CTA (one click)
- Magic link = secondary (no password)
- No username required — uses existing initials
- After success: brief toast, modal closes, badge appears

### Logged-in State

**Header badge:** Small initials circle (28-32px) in the top bar, consistent across IntroScreen and GameScreen. Click → dropdown:
- Display name / email
- My Stats
- Sign Out

**Leaderboard enhancement:**
- Verified checkmark badge next to initials for logged-in players' entries
- "You" badge + accent highlight on player's own entries
- No display names or popovers on leaderboard — initials-only aesthetic preserved

### Player Dashboard ("My Stats" Modal)

```
┌────────────────────────────────────────────────────────────────┐
│  My Stats                                               [x]   │
│  PK · 12 games played · Member since Jan 2026                 │
│                                                                │
│  ┌─ PERSONAL RECORDS ─────────────────────────────────────┐   │
│  │  Best FEV      Highest Score   Most Businesses  Best   │   │
│  │  $847M         82 (A)          9 active         Grade  │   │
│  │  Hard/20       Easy/20         Hard/20          S      │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ STRATEGY PROFILE ─────────────────────────────────────┐   │
│  │  Best archetype: Platform Builder (avg A-)             │   │
│  │  Most common: Serial Acquirer (5 games)                │   │
│  │  Watch out: Over-leveraged (4 of last 10 games)        │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ MODE BREAKDOWN ───────────────────────────────────────┐   │
│  │           Easy/10   Easy/20   Hard/10   Hard/20        │   │
│  │  Games:     3         4         2         3            │   │
│  │  Avg FEV:  $120M    $340M     $45M     $210M           │   │
│  │  Avg:       54       62        48       58              │   │
│  │  Best:      B        A-        C+       B+             │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ PERFORMANCE TREND ────────────────────────────────────┐   │
│  │  Score over time (last 12 games):                      │   │
│  │  80 |                              *                   │   │
│  │  60 |          *    *    *    *         *              │   │
│  │  40 |     *                                  *         │   │
│  │  20 | *                                                │   │
│  │     +──────────────────────────────────                │   │
│  │      #1  #2  #3  #4  #5  #6  #7  #8  #9               │   │
│  │  Dots colored by grade. Inline SVG, no chart library.  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ GAME HISTORY ─────────────────────────────────────────┐   │
│  │  Date        Holdco Name     Grade  FEV    Mode  Type  │   │
│  │  Mar 2       Apex Holdings   A-    $340M   E/20  PB    │   │
│  │  Feb 28      Summit Capital  B+    $210M   H/20  SA    │   │
│  │  Feb 25      Cedar Group     C     $45M    H/10  VO    │   │
│  │  ...                                                   │   │
│  │  (scrollable, newest-first)                            │   │
│  └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## Security

### Priority Matrix

| # | Threat | Severity | Likelihood | Mitigation | Effort |
|---|--------|----------|-----------|------------|--------|
| 1 | **IDOR on player endpoints** | Critical | High | RLS policies + `verifyPlayerToken()` middleware | Low |
| 2 | **Service role key in client bundle** | Critical | Low | Use `VITE_` prefix for anon key only; service role key in Vercel env vars only | Low |
| 3 | **Fake score submissions** | Important | Medium | Server-side plausibility checks (cross-validate score vs strategy fields) + game session tokens | Medium |
| 4 | **Display name abuse** | Important | Medium | Sanitize, max 20 chars, block reserved words | Low |
| 5 | **GDPR compliance** | Important | Medium | Privacy policy page + delete account cascade + data export endpoint | Medium |
| 6 | **Rate limiting gaps** | Important | Medium | Per-user limits on writes, per-IP on reads | Low |
| 7 | **Historical claim spoofing** | Low | Low | Composite key matching (6 fields + timestamp) + one-time-per-entry lock + 90-day window + 10 claim max. See [Claiming Historical Entries](#claiming-historical-leaderboard-entries). | Medium |
| 8 | **Alt account farming** | Low | Low | Admin dashboard flagging. Not worth preventing technically. | Low |
| 9 | **Server-side replay verification** | Low | Low | Skip entirely. AI narrative calls make true replay impossible. Disproportionate effort. | N/A |

### Auth Token Handling

- Supabase stores JWT in localStorage by default — acceptable for a game (low XSS surface, no user-generated rich content)
- Short JWT expiry (1 hour) with automatic refresh
- Add `Content-Security-Policy` header to block inline scripts
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for client (safe to expose — RLS enforces access)
- `SUPABASE_SERVICE_ROLE_KEY` in Vercel env vars only (bypasses RLS, server-side only)

### Plausibility Checks on Score Submit

Add to `api/leaderboard/submit.ts`:

```
- If score >= 95 (S grade), require businessCount >= 3
- If enterpriseValue > 100B, require difficulty === 'normal' or duration === 'standard'
- If founderEquityValue > enterpriseValue, reject
- If strategy.totalAcquisitions === 0 but businessCount > 5, reject
- If score > 0 but all strategy breakdown scores are 0, reject
```

These catch lazy/automated cheaters without false-positiving legitimate edge cases.

---

## Implementation Phases

### Phase 1 — Foundation (1 session)

**Goal:** Supabase setup, silent anonymous auth, dual-write on score submission.

- Create Supabase project, enable anonymous auth + Google OAuth provider
- Add `@supabase/supabase-js` to package.json
- Create `src/lib/supabase.ts` — client initialization
- Call `signInAnonymously()` on app load (silent, no UI)
- Run SQL migrations: `player_profiles`, `game_history`, `player_stats`, `global_stats`
- Create `verifyPlayerToken()` middleware (modeled on existing `verifyAdminToken`)
- Modify `api/leaderboard/submit.ts` to dual-write to Postgres
- Add `claimToken` generation to submit flow (stored on KV entry, never returned by GET)
- Add `playerId` to KV entries for authenticated submissions
- Strip `claimToken` from `api/leaderboard/get.ts` response
- Create player_profile row on first game completion
**No UI changes in Phase 1.** Everything is invisible to the player.

**Files touched:**
- `package.json` (add @supabase/supabase-js)
- `src/lib/supabase.ts` (new — client init)
- `api/_lib/playerAuth.ts` (new — JWT verification middleware)
- `api/leaderboard/submit.ts` (add Postgres write + claimToken + playerId)
- `api/leaderboard/get.ts` (strip claimToken from response, add playerId for verified badge)
- `.env.local` (add Supabase env vars)

### Phase 2 — Accounts & Dashboard (1-2 sessions)

**Goal:** Optional account creation, My Stats dashboard, leaderboard enhancements.

- Signup nudge banner on GameOverScreen
- Account creation modal (Google OAuth + magic link)
- "Claim Your Games" flow shown after account creation (reads localStorage, composite-matches against KV)
- Auth state management in Zustand (isLoggedIn, user profile)
- Initials badge in header + dropdown menu
- "My Stats" modal with game history + personal records + strategy profile
- Verified badge + "You" highlight on leaderboard
- Server-side plausibility checks on submit

**Files touched:**
- `src/components/screens/GameOverScreen.tsx` (nudge banner)
- `src/components/ui/AccountModal.tsx` (new — auth modal + claim flow)
- `src/components/ui/StatsModal.tsx` (new — My Stats dashboard)
- `src/components/ui/AccountBadge.tsx` (new — header badge + dropdown)
- `src/components/ui/LeaderboardModal.tsx` (verified badge, "You" highlight)
- `src/components/screens/IntroScreen.tsx` (My Stats link, badge)
- `src/components/screens/GameScreen.tsx` (badge in top bar)
- `src/hooks/useAuth.ts` (new — auth state management)
- `api/player/profile.ts` (new — GET/PUT player profile)
- `api/player/history.ts` (new — GET game history)
- `api/player/stats.ts` (new — GET player stats)
- `api/player/claim-history.ts` (new — claim historical entries)

### Phase 3 — Polish & Compliance (1 session)

**Goal:** Rich analytics, trend visualization, privacy compliance.

- Performance trend sparkline (inline SVG, no chart library)
- Mode breakdown grid
- "Compare to average" using global_stats
- Pre-computed `player_stats` update-on-write logic
- Privacy policy page
- "Delete my account" endpoint (cascade through all tables)
- Data export endpoint (JSON download)
- Anonymous user cleanup cron (90 days, no games played)
- Display name sanitization + reserved word blocking

**Files touched:**
- `src/components/ui/StatsModal.tsx` (trend chart, mode grid, compare feature)
- `src/components/ui/SparklineChart.tsx` (new — inline SVG chart)
- `api/player/delete.ts` (new — account deletion cascade)
- `api/player/export.ts` (new — data export)
- `src/components/ui/PrivacyPolicy.tsx` (new — static page)
- `api/leaderboard/submit.ts` (player_stats update logic)

---

## What This Doesn't Include

Deliberately excluded to keep scope tight:

- **Email/password auth** — Google + magic link only. No password management.
- **Friends list or social features** — no following, no messaging, no sharing.
- **Game replay storage** — full game state is 50KB+. Not worth the storage cost or complexity.
- **Achievement/badge system** — personal records are enough. No gamification-of-gamification.
- **Premium/paid tier** — no monetization. This is a free game.
- **Community meta-analysis** — "what's the best strategy across all players?" is a Phase 4+ idea if there's enough data.
- **Profanity filter** — too error-prone and culturally fraught. Rely on display name reports.
- **Server-side score replay** — AI narrative calls make deterministic replay impossible. Plausibility checks are sufficient.

---

## Resolved Decisions

1. **Supabase Pro** — Using existing Pro account (shared with Agency Growth Foundation). New project under same account. No keep-alive cron needed.
2. **Auth methods** — Google OAuth + Magic Link from V1. Both available at launch.
3. **Public profiles** — Opt-in only. Player stats are private by default; toggle in profile settings to make visible.
4. **Anonymous user cleanup** — 90-day retention. Monthly cron deletes anonymous users with zero `game_history` rows and no activity in 90 days. Anonymous users with game history are never auto-deleted.
5. **Leaderboard display** — Initials only + verified badge. No display names, no popovers. Arcade aesthetic preserved.
6. **Historical claiming window** — 90 days from feature launch. One-time extension available via admin tool for edge cases.
