import { describe, it, expect, vi } from 'vitest';
import handler from '../player/auto-link.js';
import { createMockReqRes, createChain, createKvLeaderboardEntry } from './helpers.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { kv } from '@vercel/kv';
import { isBodyTooLarge } from '../_lib/rateLimit.js';
import { updatePlayerStats, updateGlobalStats } from '../_lib/playerStats.js';
import { setMockSupabaseAdmin } from './setup.js';

/** Helper: set up authenticated non-anonymous user */
function setupAuthUser(playerId = 'test-player-id') {
  vi.mocked(getPlayerIdFromToken).mockResolvedValue(playerId);
  vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
    data: { user: { id: playerId, is_anonymous: false } },
    error: null,
  } as never);
}

describe('POST /api/player/auto-link', () => {
  it('returns 503 when supabaseAdmin is null', async () => {
    setMockSupabaseAdmin(null);
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(503);
  });

  it('returns 401 without auth', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('returns 405 for GET', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('returns 403 for anonymous user', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('anon-id');
    vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
      data: { user: { id: 'anon-id', is_anonymous: true } },
      error: null,
    } as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(403);
  });

  it('returns 429 when rate limited (IP)', async () => {
    setupAuthUser();
    vi.mocked(kv.get).mockResolvedValueOnce('1' as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(429);
  });

  it('returns 429 when rate limited (user)', async () => {
    setupAuthUser();
    vi.mocked(kv.get)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce('1' as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(429);
  });

  it('returns { linked: 0, total: 0 } when no matching entries', async () => {
    setupAuthUser();

    // KV has entries but none with matching submittedBy
    const entry = createKvLeaderboardEntry({ submittedBy: 'other-user', playerId: null });
    vi.mocked(kv.zrange).mockResolvedValueOnce([JSON.stringify(entry), 65] as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.linked).toBe(0);
    expect(body.total).toBe(0);
  });

  it('links entries with matching submittedBy and no playerId', async () => {
    const playerId = 'test-player-id';
    setupAuthUser(playerId);

    const entry = createKvLeaderboardEntry({
      id: 'e1',
      submittedBy: playerId,
      playerId: null,
      claimToken: 'tok-1',
    });
    const entryStr = JSON.stringify(entry);
    vi.mocked(kv.zrange).mockResolvedValueOnce([entryStr, 65] as never);

    // insertGameHistory: dedup check + insert
    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never) // upsert player_profiles
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never) // maybeSingle: no existing
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never); // insert game_history

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.linked).toBe(1);
    expect(body.total).toBe(1);

    // Verify KV was updated
    expect(kv.zrem).toHaveBeenCalledWith('leaderboard:v2', entryStr);
    expect(kv.zadd).toHaveBeenCalledWith('leaderboard:v2', expect.objectContaining({
      score: 65,
      member: expect.any(String),
    }));

    // Verify playerId was set on the new entry
    const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
    const addedMember = JSON.parse((zaddCall[1] as { member: string }).member);
    expect(addedMember.playerId).toBe(playerId);
  });

  it('skips entries that already have a playerId', async () => {
    const playerId = 'test-player-id';
    setupAuthUser(playerId);

    // Entry has submittedBy matching but already claimed (playerId set)
    const entry = createKvLeaderboardEntry({
      submittedBy: playerId,
      playerId: 'already-claimed-player',
    });
    vi.mocked(kv.zrange).mockResolvedValueOnce([JSON.stringify(entry), 65] as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.linked).toBe(0);
    expect(body.total).toBe(0);
    expect(kv.zrem).not.toHaveBeenCalled();
  });

  it('links multiple entries in a single call', async () => {
    const playerId = 'test-player-id';
    setupAuthUser(playerId);

    const entry1 = createKvLeaderboardEntry({ id: 'e1', submittedBy: playerId, playerId: null });
    const entry2 = createKvLeaderboardEntry({ id: 'e2', submittedBy: playerId, playerId: null, score: 80 });
    vi.mocked(kv.zrange).mockResolvedValueOnce([
      JSON.stringify(entry1), 65,
      JSON.stringify(entry2), 80,
    ] as never);

    // player_profiles upsert + 2x (dedup check + insert)
    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.linked).toBe(2);
    expect(body.total).toBe(2);
  });

  it('calls updatePlayerStats + updateGlobalStats after linking', async () => {
    const playerId = 'test-player-id';
    setupAuthUser(playerId);

    const entry = createKvLeaderboardEntry({ submittedBy: playerId, playerId: null });
    vi.mocked(kv.zrange).mockResolvedValueOnce([JSON.stringify(entry), 65] as never);

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never);

    const { req, res } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);

    expect(updatePlayerStats).toHaveBeenCalledWith(playerId);
    expect(updateGlobalStats).toHaveBeenCalled();
  });

  it('does NOT call updatePlayerStats when nothing linked', async () => {
    setupAuthUser();

    vi.mocked(kv.zrange).mockResolvedValueOnce([] as never);

    const { req, res } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);

    expect(updatePlayerStats).not.toHaveBeenCalled();
    expect(updateGlobalStats).not.toHaveBeenCalled();
  });

  it('handles KV errors gracefully', async () => {
    const playerId = 'test-player-id';
    setupAuthUser(playerId);

    const entry1 = createKvLeaderboardEntry({ id: 'e1', submittedBy: playerId, playerId: null });
    const entry2 = createKvLeaderboardEntry({ id: 'e2', submittedBy: playerId, playerId: null });
    vi.mocked(kv.zrange).mockResolvedValueOnce([
      JSON.stringify(entry1), 65,
      JSON.stringify(entry2), 70,
    ] as never);

    // First zrem throws, second succeeds
    vi.mocked(kv.zrem)
      .mockRejectedValueOnce(new Error('KV error'))
      .mockResolvedValueOnce(0 as never);

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    // First entry failed (KV error), second succeeded
    expect(body.linked).toBe(1);
  });

  it('is idempotent — re-running does not re-link already-linked entries', async () => {
    const playerId = 'test-player-id';
    setupAuthUser(playerId);

    // Entry already has playerId (was linked in a previous call)
    const entry = createKvLeaderboardEntry({
      submittedBy: playerId,
      playerId,
    });
    vi.mocked(kv.zrange).mockResolvedValueOnce([JSON.stringify(entry), 65] as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);

    const { body } = getResponse();
    expect(body.linked).toBe(0);
    expect(body.total).toBe(0);
    expect(kv.zrem).not.toHaveBeenCalled();
  });
});
