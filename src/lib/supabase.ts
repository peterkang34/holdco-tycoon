import { createClient } from '@supabase/supabase-js';
import { useAuthStore, type Player } from '../hooks/useAuth';
import { useToastStore } from '../hooks/useToast';

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
 * Skips anonymous session creation if an auth callback is in progress
 * (magic link redirect, OAuth callback) to avoid race conditions.
 * Silent — no UI impact on failure.
 */
export async function initAnonymousAuth(): Promise<void> {
  if (!supabase) return;
  try {
    // Skip if auth callback params are present in the URL — Supabase is
    // already processing the magic link / OAuth code exchange asynchronously.
    // Creating an anonymous session here would race and potentially overwrite
    // the verified session that the callback is about to establish.
    const hash = window.location.hash;
    const search = window.location.search;
    if (hash.includes('access_token=') || hash.includes('type=magiclink') ||
        hash.includes('type=recovery') || search.includes('code=')) {
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await supabase.auth.signInAnonymously();
    }
  } catch {
    // Silent failure — anonymous auth is best-effort
  }
}

/**
 * Fire-and-forget auto-link: calls the server to link KV entries
 * where submittedBy matches the current user's UUID.
 * Shows a toast if games were linked.
 */
async function fireAutoLink(): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;

    const res = await fetch('/api/player/auto-link', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok) return;
    const data = await res.json();
    if (data.linked > 0) {
      useToastStore.getState().addToast({
        message: `${data.linked} past game${data.linked > 1 ? 's' : ''} linked to your account`,
        type: 'success',
      });
    }
  } catch { /* silent — best effort */ }
}

/**
 * Initialize auth state listener. Syncs Supabase auth events to useAuthStore.
 * Call once on app load alongside initAnonymousAuth().
 */
export function initAuthListener(): (() => void) | undefined {
  if (!supabase) return undefined;

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const store = useAuthStore.getState();

    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
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
      // USER_UPDATED fires for in-session upgrades (e.g. updateUser with email)
      // SIGNED_IN fires after email verification redirect or OAuth link
      if ((event === 'USER_UPDATED' || event === 'SIGNED_IN') && wasAnonymous && !isAnonymous) {
        // Fire auto-link (server-side submittedBy matching) — runs alongside claim modal
        fireAutoLink();

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

      // On initial load for verified users, auto-link once (catches stale-token submissions)
      if (event === 'INITIAL_SESSION' && !isAnonymous) {
        const flag = `holdco-autolink-done:${user.id}`;
        if (!localStorage.getItem(flag)) {
          localStorage.setItem(flag, '1');
          fireAutoLink();
        }
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
 * Checks JWT expiry and proactively refreshes if token is stale.
 * Returns null if not authenticated or Supabase not configured.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      // Check if token is still fresh (not expired or expiring within 30s)
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]));
        if (payload.exp * 1000 > Date.now() + 30_000) {
          return session.access_token;
        }
      } catch { /* fall through to refresh */ }
    }

    // No valid session or token expired — try explicit refresh
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    return refreshed?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch with auth token + automatic 401 retry via session refresh.
 * Throws if not authenticated (no token available).
 */
export async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });

  // If server rejects token, try refreshing and retry once
  if (res.status === 401 && supabase) {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.access_token) {
      return fetch(url, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${session.access_token}` },
      });
    }
  }

  return res;
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
