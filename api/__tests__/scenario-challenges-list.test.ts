/**
 * Tests for GET /api/scenario-challenges/list (Phase 3A).
 * Returns active + archived scenarios for the LeaderboardModal Scenarios tab.
 */

import { describe, it, expect, vi } from 'vitest';
import handler from '../scenario-challenges/list.js';
import { createMockReqRes } from './helpers.js';
import { kv } from '@vercel/kv';

const MOCK_CONFIG = (id: string, overrides = {}) => ({
  id,
  name: `Scenario ${id}`,
  tagline: 'Test',
  theme: { emoji: '🧪', color: '#F59E0B' },
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2026-12-31T00:00:00Z',
  difficulty: 'easy',
  duration: 'standard',
  maxRounds: 20,
  rankingMetric: 'fev',
  isActive: true,
  isFeatured: true,
  ...overrides,
});

describe('GET /api/scenario-challenges/list', () => {
  it('returns 405 for non-GET', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('returns empty active+archived when both KV keys are missing', async () => {
    vi.mocked(kv.get).mockResolvedValue(null as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body).toEqual({ active: [], archived: [] });
  });

  it('returns both active and archived lists populated', async () => {
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['active-1'] as never)        // scenarios:active
      .mockResolvedValueOnce(['archived-1', 'archived-2'] as never) // scenarios:archive
      .mockResolvedValueOnce(MOCK_CONFIG('active-1') as never)
      .mockResolvedValueOnce(MOCK_CONFIG('archived-1', { isActive: false, isFeatured: false }) as never)
      .mockResolvedValueOnce(MOCK_CONFIG('archived-2', { isActive: false, isFeatured: false }) as never);
    vi.mocked((kv as any).zcard).mockResolvedValue(5);
    vi.mocked((kv as any).zrange).mockResolvedValue([]);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);

    const { body } = getResponse();
    expect(body.active).toHaveLength(1);
    expect(body.archived).toHaveLength(2);
    expect(body.active[0].isActive).toBe(true);
    expect(body.archived[0].isActive).toBe(false);
  });

  it('drops entries whose config is missing', async () => {
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['valid', 'gone'] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(MOCK_CONFIG('valid') as never)
      .mockResolvedValueOnce(null as never); // gone
    vi.mocked((kv as any).zcard).mockResolvedValue(0);
    vi.mocked((kv as any).zrange).mockResolvedValue([]);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);

    expect(getResponse().body.active).toHaveLength(1);
    expect(getResponse().body.active[0].id).toBe('valid');
  });

  it('list includes both featured and non-featured active scenarios', async () => {
    // Unlike active.ts, list.ts returns ALL active scenarios (featured or not) — admins
    // can stage un-featured scenarios for test-play, and they still show up in the full list.
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['featured', 'staged'] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce(MOCK_CONFIG('featured', { isFeatured: true }) as never)
      .mockResolvedValueOnce(MOCK_CONFIG('staged', { isFeatured: false }) as never);
    vi.mocked((kv as any).zcard).mockResolvedValue(0);
    vi.mocked((kv as any).zrange).mockResolvedValue([]);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);

    expect(getResponse().body.active).toHaveLength(2);
  });

  it('handles malformed KV values gracefully', async () => {
    vi.mocked(kv.get).mockResolvedValue('not-valid-json' as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    // Fails gracefully — empty arrays, still 200
    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body.active).toEqual([]);
    expect(getResponse().body.archived).toEqual([]);
  });
});
