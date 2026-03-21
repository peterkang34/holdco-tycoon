-- Operator's Playbook — Migration
-- Adds playbook JSONB storage + share ID to game_history
-- Run in Supabase SQL Editor after 001/002/003 migrations.

ALTER TABLE game_history
  ADD COLUMN IF NOT EXISTS playbook JSONB,
  ADD COLUMN IF NOT EXISTS playbook_share_id TEXT UNIQUE;

-- Index for library queries (player's playbooks, ordered by date)
CREATE INDEX IF NOT EXISTS idx_game_history_playbook
  ON game_history (player_id, completed_at DESC)
  WHERE playbook IS NOT NULL;

-- Index for public playbook lookups by share ID
CREATE INDEX IF NOT EXISTS idx_game_history_playbook_share_id
  ON game_history (playbook_share_id)
  WHERE playbook_share_id IS NOT NULL;

COMMENT ON COLUMN game_history.playbook IS
  'Auto-generated Operator''s Playbook data (PlaybookData JSON). Null for games completed before this feature.';

COMMENT ON COLUMN game_history.playbook_share_id IS
  'Opaque 12-char hex ID for sharing playbooks publicly. Separate from game_history.id to prevent enumeration.';
