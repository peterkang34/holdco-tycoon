import { describe, it, expect, vi } from 'vitest';
import handler from '../player/history.js';
import { createMockReqRes, createChain, createGameHistoryRow } from './helpers.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

describe('GET /api/player/history', () => {
  it('returns 401 without auth', async () => {
    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('returns paginated game history', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    const games = [
      createGameHistoryRow({ id: 'g1', score: 80 }),
      createGameHistoryRow({ id: 'g2', score: 65 }),
    ];

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ count: 5 }) as never)                   // count query
      .mockReturnValueOnce(createChain({ data: games, error: null }) as never);   // data query

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.games).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  it('returns empty array when no games', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ count: 0 }) as never)
      .mockReturnValueOnce(createChain({ data: [], error: null }) as never);

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.games).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('respects limit query param', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    const games = [createGameHistoryRow({ id: 'g1' })];

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ count: 10 }) as never)
      .mockReturnValueOnce(createChain({ data: games, error: null }) as never);

    const { req, res, getResponse } = createMockReqRes({ query: { limit: '1' } });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    // Verify the range method was called — the handler clamps limit to [1, 50]
    const fromMock = vi.mocked(supabaseAdmin!.from);
    const secondChain = fromMock.mock.results[1]?.value;
    expect(secondChain.range).toHaveBeenCalledWith(0, 0); // range(0, 0+1-1) = range(0, 0)
  });

  it('only allows GET method', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('returns 200 with empty data on DB error', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue('test-player-id');

    vi.mocked(supabaseAdmin!.from)
      .mockReturnValueOnce(createChain({ count: 0 }) as never)
      .mockReturnValueOnce(createChain({ data: null, error: { message: 'DB error' } }) as never);

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.games).toEqual([]);
    expect(body.total).toBe(0);
  });
});
