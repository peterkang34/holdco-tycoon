import { describe, it, expect, vi } from 'vitest';
import handler from '../player/export.js';
import { createMockReqRes, createChain, createGameHistoryRow } from './helpers.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { setMockSupabaseAdmin } from './setup.js';

describe('GET /api/player/export', () => {
  it('returns 503 when supabaseAdmin is null', async () => {
    setMockSupabaseAdmin(null);
    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);
    expect(getResponse().statusCode).toBe(503);
  });

  it('returns 401 without auth', async () => {
    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('returns combined player data as JSON', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');
    vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
      data: { user: { id: 'test-player-id', is_anonymous: false } },
      error: null,
    } as never);

    const profile = { id: 'test-player-id', display_name: 'Tester', created_at: '2026-01-01' };
    const games = [createGameHistoryRow()];
    const stats = { total_games: 1, avg_score: 65 };

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: profile, error: null }) as never)  // player_profiles
      .mockReturnValueOnce(createChain({ data: games, error: null }) as never)    // game_history
      .mockReturnValueOnce(createChain({ data: stats, error: null }) as never);   // player_stats

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.profile).toEqual(profile);
    expect(body.games).toHaveLength(1);
    expect(body.stats).toEqual(stats);
    expect(body.exported_at).toBeDefined();
  });

  it('sets Content-Disposition header for download', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');
    vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
      data: { user: { id: 'test-player-id', is_anonymous: false } },
      error: null,
    } as never);

    const profile = { id: 'test-player-id' };
    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: profile, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: [], error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: null }) as never);

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { headers } = getResponse();
    expect(headers['Content-Disposition']).toMatch(
      /attachment; filename="holdco-tycoon-data-\d{4}-\d{2}-\d{2}\.json"/,
    );
  });

  it('only allows GET method', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('returns partial data when some queries fail', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');
    vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
      data: { user: { id: 'test-player-id', is_anonymous: false } },
      error: null,
    } as never);

    const profile = { id: 'test-player-id', display_name: 'Tester' };

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: profile, error: null }) as never)              // profile OK
      .mockReturnValueOnce(createChain({ data: null, error: { message: 'err' } }) as never)   // games fail
      .mockReturnValueOnce(createChain({ data: null, error: { message: 'err' } }) as never);  // stats fail

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.profile).toEqual(profile);
    expect(body.games).toEqual([]);   // null ?? [] = []
    expect(body.stats).toBeNull();    // null ?? null = null
  });
});
