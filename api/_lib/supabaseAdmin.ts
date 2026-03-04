import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    '[supabaseAdmin] Missing env vars:',
    !supabaseUrl && 'SUPABASE_URL/VITE_SUPABASE_URL',
    !supabaseServiceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
  );
}

/**
 * Server-side Supabase client using service role key.
 * Bypasses RLS — use only in API routes, never expose to client.
 * Null if env vars not configured.
 */
export const supabaseAdmin: SupabaseClient | null =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;
