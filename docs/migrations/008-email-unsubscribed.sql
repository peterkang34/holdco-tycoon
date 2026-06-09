-- Manual email-unsubscribe flag
--
-- Lets an admin mark a player as opted-out of feature-announcement emails (when
-- they reply asking to unsubscribe). The admin "Copy All Emails" tool excludes
-- these players from the BCC list. Toggled from the admin Community player browser.
--
-- Idempotent + additive. Run in the Supabase SQL Editor.

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN player_profiles.email_unsubscribed IS
  'Admin-set opt-out from announcement emails — excluded by the Copy All Emails tool.';
