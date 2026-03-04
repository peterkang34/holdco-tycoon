-- Player Accounts & Performance History — Phase 1 Migration
-- Run this in Supabase SQL Editor after creating the project.
-- Prerequisites: Enable anonymous auth + Google OAuth in Supabase Auth settings.

-- ============================================================
-- Table: player_profiles
-- ============================================================

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

-- Service role (API routes) can insert/update any profile
CREATE POLICY "Service role full access"
  ON player_profiles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- Table: game_history
-- ============================================================

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

  -- Cross-reference to KV leaderboard entry
  leaderboard_entry_id UUID,

  -- Claiming metadata
  claimed_from_historical BOOLEAN NOT NULL DEFAULT false,

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

-- Service role (API routes) can insert for any player
CREATE POLICY "Service role full access"
  ON game_history FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- Table: player_stats (pre-computed, updated on each game)
-- ============================================================

CREATE TABLE player_stats (
  player_id UUID PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,

  -- Counts
  total_games INT NOT NULL DEFAULT 0,
  total_games_by_mode JSONB NOT NULL DEFAULT '{}',

  -- Scores
  avg_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  best_score INT NOT NULL DEFAULT 0,
  best_adjusted_fev BIGINT NOT NULL DEFAULT 0,

  -- Grade distribution
  grade_distribution JSONB NOT NULL DEFAULT '{}',

  -- Strategy patterns
  archetype_stats JSONB NOT NULL DEFAULT '{}',
  anti_pattern_frequency JSONB NOT NULL DEFAULT '{}',

  -- Mode breakdown
  avg_score_by_mode JSONB NOT NULL DEFAULT '{}',

  -- Trend (rolling comparison)
  score_trend NUMERIC(5,2),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read own stats"
  ON player_stats FOR SELECT
  USING (auth.uid() = player_id);

-- Service role (API routes) can update stats
CREATE POLICY "Service role full access"
  ON player_stats FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- Table: global_stats (singleton, updated periodically)
-- ============================================================

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

ALTER TABLE global_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read"
  ON global_stats FOR SELECT
  USING (true);

-- Service role can update
CREATE POLICY "Service role full access"
  ON global_stats FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Seed the singleton row
INSERT INTO global_stats (id) VALUES (1);
