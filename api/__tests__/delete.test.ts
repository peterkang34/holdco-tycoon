import { describe, it, expect, vi } from 'vitest';
import handler from '../player/delete.js';
import { createMockReqRes, createKvLeaderboardEntry } from './helpers.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { kv } from '@vercel/kv';
import { setMockSupabaseAdmin } from './setup.js';

/** Helper: set up authenticated non-anonymous user for delete tests */
function setupAuthUser(playerId = 'test-player-id') {
  vi.mocked(getPlayerIdFromToken).mockResolvedValue(playerId);
  vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
    data: { user: { id: playerId, is_anonymous: false } },
    error: null,
  } as never);
}

describe('POST /api/player/delete', () => {
  it('returns 503 when supabaseAdmin is null', async () => {
    setMockSupabaseAdmin(null);
    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(503);
  });

  it('returns 401 without auth', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('returns 403 for anonymous user', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('anon-id');
    vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
      data: { user: { id: 'anon-id', is_anonymous: true } },
      error: null,
    } as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(403);
  });

  it('returns 429 when rate limited', async () => {
    setupAuthUser();
    // incr returns 2 → second attempt within window
    vi.mocked(kv.incr).mockResolvedValue(2);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(429);
  });

  it('anonymizes KV leaderboard entries (removes playerId)', async () => {
    setupAuthUser();

    const entry = createKvLeaderboardEntry({
      playerId: 'test-player-id',
      claimToken: 'secret-token',
      holdcoName: 'My Corp',
    });
    const entryStr = JSON.stringify(entry);

    vi.mocked(kv.zrange).mockResolvedValueOnce([entryStr, 65] as never);
    vi.mocked(supabaseAdmin!.auth.admin.deleteUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);

    expect(getResponse().statusCode).toBe(200);

    // Verify old entry was removed
    expect(kv.zrem).toHaveBeenCalledWith('leaderboard:v2', entryStr);

    // Verify new entry was added without playerId/claimToken
    expect(kv.zadd).toHaveBeenCalled();
    const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
    const addedMember = JSON.parse((zaddCall[1] as { member: string }).member);
    expect(addedMember.playerId).toBeUndefined();
    expect(addedMember.claimToken).toBeUndefined();
    expect(addedMember.holdcoName).toBe('My Corp');
  });

  it('calls supabaseAdmin.auth.admin.deleteUser', async () => {
    setupAuthUser();

    vi.mocked(kv.zrange).mockResolvedValueOnce([] as never); // No leaderboard entries
    vi.mocked(supabaseAdmin!.auth.admin.deleteUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as never);

    const { req, res } = createMockReqRes({ method: 'POST' });
    await handler(req, res);

    expect(supabaseAdmin!.auth.admin.deleteUser).toHaveBeenCalledWith('test-player-id');
  });

  it('returns success: true on successful deletion', async () => {
    setupAuthUser();

    vi.mocked(kv.zrange).mockResolvedValueOnce([] as never);
    vi.mocked(supabaseAdmin!.auth.admin.deleteUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('handles missing KV entries gracefully', async () => {
    setupAuthUser();

    // No leaderboard entries at all
    vi.mocked(kv.zrange).mockResolvedValueOnce([] as never);
    vi.mocked(supabaseAdmin!.auth.admin.deleteUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    // zrem/zadd should NOT have been called (no entries to anonymize)
    expect(kv.zrem).not.toHaveBeenCalled();
    expect(kv.zadd).not.toHaveBeenCalled();
  });
});
