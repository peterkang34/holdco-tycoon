import { vi, beforeEach } from 'vitest';
import { createChain } from './helpers.js';

// --- Mutable supabaseAdmin ref (allows 503 tests to set it to null) ---

const _supabaseAdminRef = vi.hoisted(() => ({ current: null as any }));

/** Override supabaseAdmin mock for testing (e.g., set to null for 503 tests). Resets each beforeEach. */
export function setMockSupabaseAdmin(value: any) {
  _supabaseAdminRef.current = value;
}

// --- Mock external modules ---

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    zadd: vi.fn(),
    zrange: vi.fn(),
    zrem: vi.fn(),
    ping: vi.fn(),
  },
}));

vi.mock('../_lib/supabaseAdmin.js', () => ({
  get supabaseAdmin() { return _supabaseAdminRef.current; },
}));

vi.mock('../_lib/playerAuth.js', () => ({
  getPlayerIdFromToken: vi.fn(),
}));

vi.mock('../_lib/rateLimit.js', () => ({
  getClientIp: vi.fn(),
  checkRateLimit: vi.fn(),
  isBodyTooLarge: vi.fn(),
}));

vi.mock('../_lib/playerStats.js', () => ({
  updatePlayerStats: vi.fn(),
  updateGlobalStats: vi.fn(),
}));

// --- Import mocked modules for beforeEach configuration ---

import { kv } from '@vercel/kv';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { getClientIp, checkRateLimit, isBodyTooLarge } from '../_lib/rateLimit.js';
import { updatePlayerStats, updateGlobalStats } from '../_lib/playerStats.js';

beforeEach(() => {
  vi.resetAllMocks();

  // Reset supabaseAdmin to full mock object
  _supabaseAdminRef.current = {
    from: vi.fn(),
    auth: {
      admin: {
        getUserById: vi.fn(),
        deleteUser: vi.fn(),
      },
      getUser: vi.fn(),
    },
  };

  // Auth — default: unauthenticated
  vi.mocked(getPlayerIdFromToken).mockResolvedValue(null);

  // Rate limit — default: not limited
  vi.mocked(getClientIp).mockReturnValue('127.0.0.1');
  vi.mocked(checkRateLimit).mockResolvedValue(false);
  vi.mocked(isBodyTooLarge).mockReturnValue(false);

  // Stats helpers — default: no-op
  vi.mocked(updatePlayerStats).mockResolvedValue(undefined);
  vi.mocked(updateGlobalStats).mockResolvedValue(undefined);

  // KV — default: empty store
  vi.mocked(kv.get).mockResolvedValue(null);
  vi.mocked(kv.set).mockResolvedValue('OK' as never);
  vi.mocked(kv.del).mockResolvedValue(0 as never);
  vi.mocked(kv.incr).mockResolvedValue(1);
  vi.mocked(kv.expire).mockResolvedValue(1);
  vi.mocked(kv.zadd).mockResolvedValue(0 as never);
  vi.mocked(kv.zrange).mockResolvedValue([] as never);
  vi.mocked(kv.zrem).mockResolvedValue(0 as never);
  vi.mocked((kv as any).ping).mockResolvedValue('PONG');

  // Supabase auth — default: no user
  vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
    data: { user: null },
    error: null,
  } as never);
  vi.mocked(supabaseAdmin!.auth.admin.deleteUser).mockResolvedValue({
    data: { user: null },
    error: null,
  } as never);

  // Supabase queries — default: empty result
  vi.mocked(supabaseAdmin!.from).mockReturnValue(
    createChain({ data: null, error: null }) as never,
  );
});
