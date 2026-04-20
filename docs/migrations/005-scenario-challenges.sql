-- Scenario Challenges — Phase 3A Migration
--
-- Adds scenario tagging columns to game_history plus a permanent archive table
-- so scenarios persist beyond KV TTL (endDate + 180d). Run in Supabase SQL
-- Editor after 001/002/004 migrations.

-- ── game_history additions ──

ALTER TABLE game_history
  ADD COLUMN IF NOT EXISTS scenario_challenge_id TEXT,
  ADD COLUMN IF NOT EXISTS is_admin_preview BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: analytics queries filter on scenario_challenge_id
-- (e.g., "top 100 scores for scenario X"). Only rows with a scenario tag
-- contribute — keeps the index small at scale.
CREATE INDEX IF NOT EXISTS idx_game_history_scenario
  ON game_history (scenario_challenge_id, adjusted_fev DESC)
  WHERE scenario_challenge_id IS NOT NULL;

COMMENT ON COLUMN game_history.scenario_challenge_id IS
  'Scenario challenge slug when this row came from a scenario completion. NULL for regular holdco/PE Fund Manager games. See src/data/scenarioChallenges.ts for config schema.';

COMMENT ON COLUMN game_history.is_admin_preview IS
  'True when an admin test-played a scenario via ?se={id}&preview=1. Admin preview rows are excluded from leaderboards and analytics surfaces. Cleared via api/admin/scenario-challenges/clear-preview.';

-- ── scenarios_archive ──
--
-- Permanent snapshot table: populated by a scheduled admin job when a scenario
-- reaches endDate + 180d (KV entries expire then). Lets the Scenarios tab render
-- historical scenarios with their full config and top-50 leaderboard, long after
-- the KV keys are gone. See plans/backlog/scenario-challenges.md Section 2.

CREATE TABLE IF NOT EXISTS scenarios_archive (
  scenario_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_json JSONB NOT NULL,
  final_leaderboard_json JSONB NOT NULL,
  entry_count INTEGER NOT NULL DEFAULT 0,
  top_score BIGINT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_archive_end_date
  ON scenarios_archive (end_date DESC);

COMMENT ON TABLE scenarios_archive IS
  'Permanent snapshot of expired scenario challenges. Written by a scheduled job when scenario hits endDate + 180d (KV TTL boundary). Lets historical scenarios remain viewable indefinitely.';

COMMENT ON COLUMN scenarios_archive.config_json IS
  'Full ScenarioChallengeConfig at the time of archival. Admins can restore or duplicate scenarios from this snapshot.';

COMMENT ON COLUMN scenarios_archive.final_leaderboard_json IS
  'Top 50 entries (by raw FEV or configured ranking metric) frozen at archival time. No further writes after this point.';

-- ── RLS ──
--
-- All access to scenarios_archive goes through server endpoints (cron writer +
-- /api/scenario-challenges/{list,leaderboard} readers) that use the service
-- role key via supabaseAdmin. Anon + authenticated clients never talk to this
-- table directly — enable RLS and add only the service-role policy so PostgREST
-- blocks public access. Matches pattern in 001-player-accounts.sql.

ALTER TABLE scenarios_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON scenarios_archive FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
