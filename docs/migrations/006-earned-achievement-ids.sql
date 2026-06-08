-- earned_achievement_ids column fix
--
-- The application has been writing `player_stats.earned_achievement_ids`
-- (api/_lib/playerStats.ts) and reading it (api/player/stats.ts) since the
-- player-accounts work, but the column was never declared in a tracked
-- migration. On a clean schema the upsert silently fails (the error is
-- swallowed by updatePlayerStats's try/catch), so the precomputed achievement
-- cache never persists. This adds the missing column.
--
-- Idempotent + additive: `IF NOT EXISTS` makes this a no-op if the column was
-- already added directly in production (which is why the app appears to work).
-- Zero-downtime; safe to run before or after the code deploy. Run in the
-- Supabase SQL Editor after the 001/002/004/005 migrations.
--
-- (Note: 003 is not present in docs/migrations/ — it was applied directly to
-- prod. Confirm 003 + 005 are live before running this.)

ALTER TABLE player_stats
  ADD COLUMN IF NOT EXISTS earned_achievement_ids TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN player_stats.earned_achievement_ids IS
  'Achievement IDs earned across the player''s games, precomputed by updatePlayerStats. Scenario plays are excluded (sealed sandbox).';
