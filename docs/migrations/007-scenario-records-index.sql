-- Per-player scenario record query index
--
-- Serves GET /api/player/scenario-records, which fetches a player's scenario
-- game_history rows (WHERE player_id = $1 AND scenario_challenge_id IS NOT NULL
-- AND is_admin_preview IS NOT TRUE). The existing idx_game_history_scenario
-- (migration 005) is keyed scenario-first (good for "top scores in scenario X")
-- but not for "all scenario rows for player Y" — this partial index covers that.
--
-- Idempotent + additive. Requires the scenario_challenge_id / is_admin_preview
-- columns from migration 005 — confirm 005 is applied in prod before running.

CREATE INDEX IF NOT EXISTS idx_game_history_player_scenario
  ON game_history (player_id, scenario_challenge_id, completed_at DESC)
  WHERE scenario_challenge_id IS NOT NULL AND is_admin_preview IS NOT TRUE;
