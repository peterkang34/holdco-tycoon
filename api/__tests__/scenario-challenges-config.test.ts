/**
 * Tests for GET /api/scenario-challenges/config?id={id} (Phase 3C).
 * Public endpoint returning full config for player-side se_setup flow.
 */

import { describe, it, expect, vi } from 'vitest';
import handler from '../scenario-challenges/config.js';
import { createMockReqRes } from './helpers.js';
import { kv } from '@vercel/kv';

const ACTIVE_CONFIG = {
  id: 'recession-gauntlet',
  name: 'Recession Gauntlet',
  isActive: true,
  startingBusinesses: [{ name: 'Distressed Co', sectorId: 'homeServices', ebitda: 1000, multiple: 3, quality: 1 }],
};

describe('GET /api/scenario-challenges/config', () => {
  it('returns 405 for non-GET', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('returns 400 on missing id', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: {} });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('returns 400 on invalid slug format', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: '../evil' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('returns 404 when scenario does not exist', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'missing' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(404);
  });

  it('returns 410 when scenario exists but isActive: false', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce({ ...ACTIVE_CONFIG, isActive: false } as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'inactive' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(410);
  });

  it('returns full config for active scenario', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(ACTIVE_CONFIG as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'recession-gauntlet' } });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.config.id).toBe('recession-gauntlet');
    expect(body.config.startingBusinesses).toHaveLength(1);
  });

  it('rejects array config with 404', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce([1, 2, 3] as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'bad' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(404);
  });

  it('sets Cache-Control: public, max-age=60', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(ACTIVE_CONFIG as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'recession-gauntlet' } });
    await handler(req, res);
    expect(getResponse().headers['Cache-Control']).toBe('public, max-age=60');
  });
});
