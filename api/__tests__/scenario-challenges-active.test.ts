/**
 * Tests for GET /api/scenario-challenges/active (Phase 3A).
 * Returns the top-3 featured scenarios for the home banner.
 */

import { describe, it, expect, vi } from 'vitest';
import handler from '../scenario-challenges/active.js';
import { createMockReqRes } from './helpers.js';
import { kv } from '@vercel/kv';

const MOCK_SCENARIO = {
  id: 'recession-gauntlet',
  name: 'Recession Gauntlet',
  tagline: '3 distressed businesses. Survive.',
  description: 'A brutal test of turnaround skills.',
  theme: { emoji: '🔥', color: '#F59E0B' },
  startDate: '2026-04-01T00:00:00Z',
  endDate: '2026-06-01T00:00:00Z',
  difficulty: 'normal',
  duration: 'quick',
  maxRounds: 10,
  rankingMetric: 'fev',
  isActive: true,
  isFeatured: true,
};

describe('GET /api/scenario-challenges/active', () => {
  it('returns 405 for non-GET requests', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('returns empty array when scenarios:active key is missing', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body.scenarios).toEqual([]);
  });

  it('returns empty array when scenarios:active is an empty array', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce([] as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().body.scenarios).toEqual([]);
  });

  it('returns summary for a featured+active scenario', async () => {
    vi.mocked(kv.get)
      .mockResolvedValueOnce([MOCK_SCENARIO.id] as never) // scenarios:active
      .mockResolvedValueOnce(MOCK_SCENARIO as never);     // scenario:{id}:config
    vi.mocked((kv as any).zcard).mockResolvedValueOnce(12);
    vi.mocked((kv as any).zrange).mockResolvedValueOnce(['entry-json', 500_000]);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);

    const { body } = getResponse();
    expect(body.scenarios).toHaveLength(1);
    expect(body.scenarios[0]).toMatchObject({
      id: 'recession-gauntlet',
      name: 'Recession Gauntlet',
      entryCount: 12,
      topScore: 500_000,
      isPE: false,
    });
  });

  it('skips scenarios marked isFeatured: false', async () => {
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['unfeatured-id'] as never)
      .mockResolvedValueOnce({ ...MOCK_SCENARIO, isFeatured: false } as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().body.scenarios).toEqual([]);
  });

  it('skips scenarios marked isActive: false', async () => {
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['inactive-id'] as never)
      .mockResolvedValueOnce({ ...MOCK_SCENARIO, isActive: false } as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().body.scenarios).toEqual([]);
  });

  it('skips scenarios whose config is missing (expired/deleted)', async () => {
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['gone-id'] as never)
      .mockResolvedValueOnce(null as never); // config missing

    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().body.scenarios).toEqual([]);
  });

  it('caps at 3 featured scenarios (MAX_FEATURED)', async () => {
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['a', 'b', 'c', 'd', 'e'] as never) // 5 in the list
      .mockResolvedValue({ ...MOCK_SCENARIO, id: 'x' } as never); // all configs resolve
    vi.mocked((kv as any).zcard).mockResolvedValue(0);
    vi.mocked((kv as any).zrange).mockResolvedValue([]);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().body.scenarios).toHaveLength(3);
  });

  it('sets isPE: true when fundStructure is present', async () => {
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['pe-scenario'] as never)
      .mockResolvedValueOnce({
        ...MOCK_SCENARIO,
        fundStructure: { committedCapital: 100_000, mgmtFeePercent: 0.02, hurdleRate: 0.08, carryRate: 0.20, forcedLiquidationDiscount: 0.90 },
        rankingMetric: 'moic',
      } as never);
    vi.mocked((kv as any).zcard).mockResolvedValueOnce(0);
    vi.mocked((kv as any).zrange).mockResolvedValueOnce([]);

    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().body.scenarios[0].isPE).toBe(true);
    expect(getResponse().body.scenarios[0].rankingMetric).toBe('moic');
  });

  it('sets Cache-Control: public, max-age=60', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().headers['Cache-Control']).toBe('public, max-age=60');
  });
});
