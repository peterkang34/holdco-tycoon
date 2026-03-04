import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase client for player accounts. Null if env vars not configured.
 * Uses anon key — all access governed by RLS policies.
 */
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Initialize anonymous auth session. Call once on app load.
 * If a session already exists (from localStorage), this is a no-op.
 * Silent — no UI impact on failure.
 */
export async function initAnonymousAuth(): Promise<void> {
  if (!supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await supabase.auth.signInAnonymously();
    }
  } catch {
    // Silent failure — anonymous auth is best-effort
  }
}

/**
 * Get the current user's access token for API calls.
 * Returns null if not authenticated or Supabase not configured.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the current user's Supabase UUID.
 * Returns null if not authenticated or Supabase not configured.
 */
export async function getPlayerId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}
