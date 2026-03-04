import { describe, it, expect, vi } from 'vitest';
import handler from '../player/claim-history.js';
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

describe('POST /api/player/claim-history', () => {
  it('returns 503 when supabaseAdmin is null', async () => {
    setMockSupabaseAdmin(null);
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: { claims: [{ type: 'token', claimToken: 'abc' }] },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(503);
  });

  it('returns 401 without auth', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: { claims: [] } });
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

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: { claims: [{ type: 'token', claimToken: 'abc' }] },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(403);
  });

  it('returns 429 when rate limited (IP)', async () => {
    setupAuthUser();
    // IP rate limit key already exists
    vi.mocked(kv.get).mockResolvedValueOnce('1' as never);

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: { claims: [{ type: 'token', claimToken: 'abc' }] },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(429);
  });

  it('returns 429 when rate limited (user)', async () => {
    setupAuthUser();
    // IP not limited, but user limited
    vi.mocked(kv.get)
      .mockResolvedValueOnce(null as never)  // IP: OK
      .mockResolvedValueOnce('1' as never);  // User: limited

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: { claims: [{ type: 'token', claimToken: 'abc' }] },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(429);
  });

  it('returns 400 for empty claims array', async () => {
    setupAuthUser();

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: { claims: [] },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('returns 400 for >10 claims', async () => {
    setupAuthUser();

    const claims = Array.from({ length: 11 }, (_, i) => ({
      type: 'token',
      claimToken: `tok-${i}`,
    }));

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: { claims },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('claims entry by token — updates KV, inserts game_history', async () => {
    setupAuthUser();

    const entry = createKvLeaderboardEntry({ claimToken: 'claim-me', playerId: null });
    const entryStr = JSON.stringify(entry);

    vi.mocked(kv.zrange).mockResolvedValueOnce([entryStr, 65] as never);

    // insertGameHistory: dedup check + insert
    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never) // maybeSingle: no existing
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never); // insert

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: { claims: [{ type: 'token', claimToken: 'claim-me' }] },
    });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.results).toHaveLength(1);
    expect((body.results as Array<Record<string, unknown>>)[0].status).toBe('claimed');

    // Verify KV was updated
    expect(kv.zrem).toHaveBeenCalledWith('leaderboard:v2', entryStr);
    expect(kv.zadd).toHaveBeenCalledWith('leaderboard:v2', expect.objectContaining({
      score: 65,
      member: expect.any(String),
    }));

    // Verify the new entry has playerId set
    const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
    const addedMember = JSON.parse((zaddCall[1] as { member: string }).member);
    expect(addedMember.playerId).toBe('test-player-id');
  });

  it('token claim — already_claimed when playerId set', async () => {
    setupAuthUser();

    const entry = createKvLeaderboardEntry({ claimToken: 'taken', playerId: 'other-player' });
    vi.mocked(kv.zrange).mockResolvedValueOnce([JSON.stringify(entry), 65] as never);

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: { claims: [{ type: 'token', claimToken: 'taken' }] },
    });
    await handler(req, res);

    const { body } = getResponse();
    expect((body.results as Array<Record<string, unknown>>)[0].status).toBe('already_claimed');
    expect(kv.zrem).not.toHaveBeenCalled();
  });

  it('token claim — not_found when token does not match', async () => {
    setupAuthUser();

    // Return entries but none match the requested token
    const entry = createKvLeaderboardEntry({ claimToken: 'other-token' });
    vi.mocked(kv.zrange).mockResolvedValueOnce([JSON.stringify(entry), 65] as never);

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: { claims: [{ type: 'token', claimToken: 'no-match' }] },
    });
    await handler(req, res);

    const { body } = getResponse();
    expect((body.results as Array<Record<string, unknown>>)[0].status).toBe('not_found');
  });

  it('historical claim — matches by composite key', async () => {
    setupAuthUser();

    const entryDate = '2026-03-02T12:00:00Z';
    const entry = createKvLeaderboardEntry({
      initials: 'AB',
      holdcoName: 'Alpha Beta',
      score: 77,
      grade: 'A',
      difficulty: 'normal',
      duration: 'standard',
      date: entryDate,
      playerId: null,
    });
    vi.mocked(kv.zrange).mockResolvedValueOnce([JSON.stringify(entry), 77] as never);

    // insertGameHistory calls
    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never);

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: {
        claims: [{
          type: 'historical',
          initials: 'AB',
          holdcoName: 'Alpha Beta',
          score: 77,
          grade: 'A',
          difficulty: 'normal',
          duration: 'standard',
          date: entryDate,
        }],
      },
    });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect((body.results as Array<Record<string, unknown>>)[0].status).toBe('claimed');
  });

  it('historical claim — outside 90-day window returns not_found', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z')); // Past the 90-day window

    try {
      setupAuthUser();

      const entry = createKvLeaderboardEntry({
        initials: 'AB', holdcoName: 'Alpha Beta', score: 77, grade: 'A',
        difficulty: 'normal', duration: 'standard', date: '2026-03-02T12:00:00Z', playerId: null,
      });
      vi.mocked(kv.zrange).mockResolvedValueOnce([JSON.stringify(entry), 77] as never);

      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: {
          claims: [{
            type: 'historical',
            initials: 'AB', holdcoName: 'Alpha Beta', score: 77, grade: 'A',
            difficulty: 'normal', duration: 'standard', date: '2026-03-02T12:00:00Z',
          }],
        },
      });
      await handler(req, res);

      const { body } = getResponse();
      expect((body.results as Array<Record<string, unknown>>)[0].status).toBe('not_found');
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls updatePlayerStats + updateGlobalStats after successful claim', async () => {
    setupAuthUser();

    const entry = createKvLeaderboardEntry({ claimToken: 'stats-test', playerId: null });
    vi.mocked(kv.zrange).mockResolvedValueOnce([JSON.stringify(entry), 65] as never);

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never);

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { claims: [{ type: 'token', claimToken: 'stats-test' }] },
    });
    await handler(req, res);

    // updatePlayerStats and updateGlobalStats are called fire-and-forget
    // but the mock functions record the call synchronously
    expect(updatePlayerStats).toHaveBeenCalledWith('test-player-id');
    expect(updateGlobalStats).toHaveBeenCalled();
  });

  it('handles KV errors gracefully without crashing', async () => {
    setupAuthUser();

    const entry1 = createKvLeaderboardEntry({ claimToken: 'fail-token', id: 'e1', playerId: null });
    const entry2 = createKvLeaderboardEntry({ claimToken: 'ok-token', id: 'e2', playerId: null });

    vi.mocked(kv.zrange).mockResolvedValueOnce([
      JSON.stringify(entry1), 65,
      JSON.stringify(entry2), 70,
    ] as never);

    // First zrem throws (KV error), second succeeds
    vi.mocked(kv.zrem)
      .mockRejectedValueOnce(new Error('KV error'))
      .mockResolvedValueOnce(0 as never);

    // insertGameHistory for second claim only
    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never);

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: {
        claims: [
          { type: 'token', claimToken: 'fail-token' },
          { type: 'token', claimToken: 'ok-token' },
        ],
      },
    });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    const results = body.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('not_found'); // KV error → not_found
    expect(results[1].status).toBe('claimed');   // Second claim succeeded
  });
});
