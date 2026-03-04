import { describe, it, expect, vi } from 'vitest';
import handler from '../player/stats.js';
import { createMockReqRes, createChain, createGameHistoryRow } from './helpers.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

describe('GET /api/player/stats', () => {
  it('returns 401 without auth', async () => {
    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('returns pre-computed stats from player_stats table', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    const cachedStats = {
      player_id: 'test-player-id',
      total_games: 10,
      avg_score: 72.5,
      best_score: 95,
      best_adjusted_fev: 8000000,
      grade_distribution: { A: 3, B: 5, C: 2 },
      archetype_stats: { Conglomerate: { count: 5, avgScore: 75 } },
      anti_pattern_frequency: {},
      avg_score_by_mode: { easy_standard: 70 },
      updated_at: new Date().toISOString(), // Fresh (< 1hr)
    };

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: cachedStats, error: null }) as never) // player_stats
      .mockReturnValueOnce(createChain({ data: null, error: { code: 'PGRST116' } }) as never); // global_stats

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.total_games).toBe(10);
    expect(body.avg_score).toBe(72.5);
    expect(body.best_score).toBe(95);
    expect(body.best_adjusted_fev).toBe(8000000);
    expect(body.grade_distribution).toEqual({ A: 3, B: 5, C: 2 });
    expect(body.archetype_stats).toEqual({ Conglomerate: { count: 5, avgScore: 75 } });
  });

  it('falls back to on-the-fly computation when no player_stats row', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    const games = [
      createGameHistoryRow({ score: 60, grade: 'B', adjusted_fev: 4000000, difficulty: 'easy', duration: 'standard' }),
      createGameHistoryRow({ score: 80, grade: 'A', adjusted_fev: 6000000, difficulty: 'easy', duration: 'standard' }),
    ];

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: { code: 'PGRST116' } }) as never) // player_stats miss
      .mockReturnValueOnce(createChain({ data: games, error: null }) as never)                  // game_history
      .mockReturnValueOnce(createChain({ data: null, error: { code: 'PGRST116' } }) as never); // global_stats

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.total_games).toBe(2);
    expect(body.avg_score).toBe(70); // (60+80)/2
    expect(body.best_score).toBe(80);
    expect(body.best_adjusted_fev).toBe(6000000);
    expect(body.grade_distribution).toEqual({ B: 1, A: 1 });
  });

  it('returns EMPTY_STATS when no game_history rows', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: { code: 'PGRST116' } }) as never) // player_stats miss
      .mockReturnValueOnce(createChain({ data: [], error: null }) as never);                    // game_history empty

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.total_games).toBe(0);
    expect(body.grade_distribution).toEqual({});
    expect(body.global).toBeNull();
  });

  it('includes global stats from global_stats table', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    const cachedStats = {
      total_games: 5, avg_score: 60, best_score: 80, best_adjusted_fev: 5000000,
      grade_distribution: { B: 5 }, updated_at: new Date().toISOString(),
    };
    const globalStats = {
      total_games: 1000, avg_score: 55, avg_adjusted_fev: 3500000,
      grade_distribution: { A: 100, B: 300, C: 400, D: 200 },
    };

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: cachedStats, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: globalStats, error: null }) as never);

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.global).not.toBeNull();
    expect((body.global as Record<string, unknown>).total_games).toBe(1000);
    expect((body.global as Record<string, unknown>).avg_score).toBe(55);
    expect((body.global as Record<string, unknown>).avg_adjusted_fev).toBe(3500000);
  });

  it('returns global: null when no global_stats row', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    const cachedStats = {
      total_games: 5, avg_score: 60, best_score: 80, best_adjusted_fev: 5000000,
      grade_distribution: { B: 5 }, updated_at: new Date().toISOString(),
    };

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: cachedStats, error: null }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: { code: 'PGRST116' } }) as never);

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.global).toBeNull();
  });

  it('only allows GET method', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('handles DB errors gracefully', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ data: null, error: { code: 'PGRST116' } }) as never) // player_stats miss
      .mockReturnValueOnce(createChain({ data: null, error: { message: 'DB error' } }) as never); // game_history error

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.total_games).toBe(0);
    expect(body.grade_distribution).toEqual({});
  });
});
