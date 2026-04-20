/**
 * Tests for GET /api/scenario-challenges/leaderboard?id={id}&limit={n} (Phase 3A).
 * Returns top entries for one scenario, ranked by configured metric.
 */

import { describe, it, expect, vi } from 'vitest';
import handler from '../scenario-challenges/leaderboard.js';
import { createMockReqRes } from './helpers.js';
import { kv } from '@vercel/kv';

const MOCK_CONFIG = {
  id: 'sprint-5yr',
  name: '5-Year Sprint',
  rankingMetric: 'fev',
};

describe('GET /api/scenario-challenges/leaderboard', () => {
  it('returns 405 for non-GET', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('rejects missing id with 400', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: {} });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
    expect(getResponse().body.error).toMatch(/id/);
  });

  it('rejects invalid id format (special chars) with 400', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: '../evil' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('rejects id > 60 chars', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'a'.repeat(61) } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('returns 404 when scenario config missing', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'missing-id' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(404);
  });

  it('returns scenario metadata + entries array on success', async () => {
    const entry1 = { id: 'e1', holdcoName: 'Alpha', initials: 'AL', score: 85, grade: 'A' };
    const entry2 = { id: 'e2', holdcoName: 'Beta', initials: 'BE', score: 72, grade: 'B' };

    vi.mocked(kv.get).mockResolvedValueOnce(MOCK_CONFIG as never);
    vi.mocked((kv as any).zcard).mockResolvedValueOnce(2);
    vi.mocked((kv as any).zrange).mockResolvedValueOnce([
      JSON.stringify(entry1), 500_000,
      JSON.stringify(entry2), 300_000,
    ]);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'sprint-5yr' } });
    await handler(req, res);

    const { body } = getResponse();
    expect(body.scenario).toEqual({
      id: 'sprint-5yr',
      name: '5-Year Sprint',
      rankingMetric: 'fev',
      entryCount: 2,
    });
    expect(body.entries).toHaveLength(2);
    // sortScore = ranking metric value (FEV in this case); score = game score (0-100).
    expect(body.entries[0]).toMatchObject({ rank: 1, sortScore: 500_000, score: 85, holdcoName: 'Alpha' });
    expect(body.entries[1]).toMatchObject({ rank: 2, sortScore: 300_000, score: 72, holdcoName: 'Beta' });
  });

  it('excludes entries with isAdminPreview: true', async () => {
    const real = { id: 'real', score: 80 };
    const preview = { id: 'preview', score: 99, isAdminPreview: true };

    vi.mocked(kv.get).mockResolvedValueOnce(MOCK_CONFIG as never);
    vi.mocked((kv as any).zcard).mockResolvedValueOnce(2);
    vi.mocked((kv as any).zrange).mockResolvedValueOnce([
      JSON.stringify(preview), 9_900_000,
      JSON.stringify(real), 800_000,
    ]);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'sprint-5yr' } });
    await handler(req, res);

    expect(getResponse().body.entries).toHaveLength(1);
    expect(getResponse().body.entries[0].id).toBe('real');
  });

  it('honors limit query param (clamped to MAX_SCENARIO_ENTRIES)', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(MOCK_CONFIG as never);
    vi.mocked((kv as any).zcard).mockResolvedValueOnce(0);
    vi.mocked((kv as any).zrange).mockResolvedValueOnce([]);

    const { req, res } = createMockReqRes({ method: 'GET', query: { id: 'sprint-5yr', limit: '25' } });
    await handler(req, res);

    // Check zrange was called with stop=24 (limit-1 = 25-1)
    expect((kv as any).zrange).toHaveBeenCalledWith(
      expect.any(String), 0, 24, expect.objectContaining({ rev: true, withScores: true }),
    );
  });

  it('clamps invalid limit to default 50', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(MOCK_CONFIG as never);
    vi.mocked((kv as any).zcard).mockResolvedValueOnce(0);
    vi.mocked((kv as any).zrange).mockResolvedValueOnce([]);

    const { req, res } = createMockReqRes({ method: 'GET', query: { id: 'sprint-5yr', limit: '99999' } });
    await handler(req, res);

    expect((kv as any).zrange).toHaveBeenCalledWith(
      expect.any(String), 0, 49, expect.any(Object),
    );
  });

  it('skips malformed JSON members without crashing', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(MOCK_CONFIG as never);
    vi.mocked((kv as any).zcard).mockResolvedValueOnce(2);
    vi.mocked((kv as any).zrange).mockResolvedValueOnce([
      'not-valid-json', 500_000,
      JSON.stringify({ id: 'valid', score: 80 }), 300_000,
    ]);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'sprint-5yr' } });
    await handler(req, res);

    expect(getResponse().body.entries).toHaveLength(1);
    expect(getResponse().body.entries[0].id).toBe('valid');
  });
});
