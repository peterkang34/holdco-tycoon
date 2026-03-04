import { createClient } from '@supabase/supabase-js';
import { useAuthStore, type Player } from '../hooks/useAuth';

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
 * Initialize auth state listener. Syncs Supabase auth events to useAuthStore.
 * Call once on app load alongside initAnonymousAuth().
 */
export function initAuthListener(): (() => void) | undefined {
  if (!supabase) return undefined;

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const store = useAuthStore.getState();

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      if (!session?.user) return;

      const user = session.user;
      const isAnonymous = user.is_anonymous ?? true;
      const email = user.email ?? undefined;

      // Extract initials from email or existing profile
      let initials = store.player?.initials ?? 'AA';
      if (email && !store.player?.initials) {
        // Derive from email prefix: "peter@example.com" → "PE"
        const prefix = email.split('@')[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
        initials = prefix.slice(0, 2) || 'AA';
      }

      const player: Player = {
        id: user.id,
        email,
        initials,
        isAnonymous,
        createdAt: user.created_at,
      };

      const wasAnonymous = store.player?.isAnonymous ?? true;
      store.setPlayer(player);

      // User just upgraded from anonymous to real account
      if (event === 'USER_UPDATED' && wasAnonymous && !isAnonymous) {
        // Check localStorage for claimable leaderboard entries
        try {
          const localEntries = localStorage.getItem('holdco-tycoon-leaderboard');
          if (localEntries) {
            const entries = JSON.parse(localEntries);
            if (Array.isArray(entries) && entries.length > 0) {
              store.openClaimModal();
              return;
            }
          }
        } catch { /* ignore parse errors */ }
      }
    }

    if (event === 'SIGNED_OUT') {
      store.setPlayer(null);
    }
  });

  return () => subscription.unsubscribe();
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
