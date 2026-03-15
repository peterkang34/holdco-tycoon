-- Phase 3: Player Profiles + New Sectors
-- Run AFTER 001-player-accounts.sql

-- 1. Add public_id to player_profiles (privacy-safe public identifier)
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS public_id TEXT UNIQUE;

-- Backfill existing rows with random 12-char hex IDs
UPDATE player_profiles
  SET public_id = LEFT(encode(gen_random_bytes(6), 'hex'), 12)
  WHERE public_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE player_profiles ALTER COLUMN public_id SET NOT NULL;

-- 2. Add new fields to player_stats
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS sector_frequency JSONB NOT NULL DEFAULT '{}';
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS modes_played TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS family_office_completed BOOLEAN NOT NULL DEFAULT false;
