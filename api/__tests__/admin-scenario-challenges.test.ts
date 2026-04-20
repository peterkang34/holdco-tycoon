/**
 * Tests for admin CRUD on /api/admin/scenario-challenges (Phase 3B.1).
 *
 * Covers method dispatch, admin auth, config validation, activation gate,
 * list membership management, and deletion cascade.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kv } from '@vercel/kv';
import { createMockReqRes } from './helpers.js';

// Mock adminAuth before importing the handler — sets per-test behavior via the mock function.
vi.mock('../_lib/adminAuth.js', () => ({
  verifyAdminToken: vi.fn(),
}));

import { verifyAdminToken } from '../_lib/adminAuth.js';
import handler from '../admin/scenario-challenges.js';

// Helper: authenticate (or deauth) the mocked admin token check.
function setAdminAuth(authorized: boolean) {
  vi.mocked(verifyAdminToken).mockImplementation(async (_req, res) => {
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  });
}

function makeValidConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    tagline: 'Test tagline',
    description: 'A test scenario description.',
    configVersion: 1,
    theme: { emoji: '🧪', color: '#F59E0B' },
    startDate: '2026-04-01T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    isActive: false,
    isFeatured: false,
    seed: 12345,
    difficulty: 'easy',
    duration: 'standard',
    maxRounds: 10,
    startingCash: 5000,
    startingDebt: 0,
    founderShares: 800,
    sharesOutstanding: 1000,
    startingBusinesses: [],
    rankingMetric: 'fev',
    ...overrides,
  };
}

beforeEach(() => {
  setAdminAuth(true); // Default: authorized. Override per-test when testing 401.
});

describe('admin/scenario-challenges', () => {
  describe('Auth', () => {
    it('returns 401 when admin auth fails', async () => {
      setAdminAuth(false);
      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(401);
    });
  });

  describe('Method dispatch', () => {
    it('returns 405 for unsupported methods', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'PATCH' });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(405);
    });
  });

  describe('GET list', () => {
    it('returns merged active + archived summaries (no duplicates)', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(['sc-1', 'sc-2'] as never)   // scenarios:active
        .mockResolvedValueOnce(['sc-2', 'sc-3'] as never)   // scenarios:archive (sc-2 in both)
        .mockResolvedValueOnce(makeValidConfig({ id: 'sc-1', name: 'One' }) as never)
        .mockResolvedValueOnce(makeValidConfig({ id: 'sc-2', name: 'Two' }) as never)
        .mockResolvedValueOnce(makeValidConfig({ id: 'sc-3', name: 'Three' }) as never);

      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      expect(getResponse().body.scenarios).toHaveLength(3);
      expect(getResponse().body.scenarios.map((s: any) => s.id).sort()).toEqual(['sc-1', 'sc-2', 'sc-3']);
    });

    it('skips scenarios whose config is missing from KV (cleanup)', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(['sc-1', 'gone'] as never)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce(makeValidConfig({ id: 'sc-1' }) as never)
        .mockResolvedValueOnce(null as never); // gone

      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await handler(req, res);
      expect(getResponse().body.scenarios).toHaveLength(1);
      expect(getResponse().body.scenarios[0].id).toBe('sc-1');
    });

    it('returns admin summary shape (not full config)', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(['sc-1'] as never)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce(makeValidConfig({ id: 'sc-1' }) as never);

      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await handler(req, res);
      const entry = getResponse().body.scenarios[0];
      expect(entry).toMatchObject({ id: 'sc-1', name: 'Test Scenario', isActive: false, isPE: false });
      expect(entry.startingBusinesses).toBeUndefined(); // summary doesn't include full config
    });
  });

  describe('GET by id', () => {
    it('returns 400 on invalid id format', async () => {
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

    it('returns full config on success', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce(makeValidConfig() as never);
      const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { id: 'test-scenario' } });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(200);
      expect(getResponse().body.scenario.id).toBe('test-scenario');
      expect(getResponse().body.scenario.startingBusinesses).toEqual([]);
    });
  });

  describe('POST create', () => {
    it('returns 400 when body is not a config object', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: null });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('returns 400 on invalid id format in body', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: makeValidConfig({ id: '../evil' }),
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('returns 409 when scenario id already exists', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce(makeValidConfig() as never); // existing
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: makeValidConfig() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(409);
    });

    it('rejects activation when validation errors exist', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce(null as never); // no existing
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: makeValidConfig({ isActive: true, maxRounds: 999 }), // maxRounds out of bounds
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
      expect(getResponse().body.error).toMatch(/cannot activate/);
      expect(getResponse().body.errors.length).toBeGreaterThan(0);
    });

    it('accepts inactive scenario with validation errors (save draft)', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce(null as never);
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: makeValidConfig({ isActive: false, maxRounds: 999 }), // errors but not activating
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(201);
      expect(getResponse().body.errors.length).toBeGreaterThan(0);
    });

    it('writes config to KV with TTL + rebuilds list memberships', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(null as never)         // existing check
        .mockResolvedValueOnce(null as never)         // active list
        .mockResolvedValueOnce(null as never);        // archive list

      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: makeValidConfig() });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(201);
      expect(kv.set).toHaveBeenCalledWith(
        'scenario:test-scenario:config',
        expect.any(String),
        expect.objectContaining({ ex: expect.any(Number) }),
      );
      // archive list written with this id (inactive → archive).
      expect(kv.set).toHaveBeenCalledWith('scenarios:archive', expect.stringContaining('test-scenario'));
    });

    it('active scenario with future endDate goes to active list', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(null as never);

      const futureEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: makeValidConfig({ isActive: true, endDate: futureEnd }),
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(201);
      expect(kv.set).toHaveBeenCalledWith('scenarios:active', expect.stringContaining('test-scenario'));
    });
  });

  describe('PUT update', () => {
    it('returns 404 when scenario does not exist', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce(null as never);
      const { req, res, getResponse } = createMockReqRes({ method: 'PUT', body: makeValidConfig() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(404);
    });

    it('updates existing scenario and returns it with errors+warnings', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(makeValidConfig({ name: 'Old' }) as never) // existing
        .mockResolvedValueOnce([] as never)                                // active
        .mockResolvedValueOnce([] as never);                               // archive

      const { req, res, getResponse } = createMockReqRes({
        method: 'PUT',
        body: makeValidConfig({ name: 'New' }),
      });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      expect(getResponse().body.scenario.name).toBe('New');
      expect(getResponse().body.errors).toEqual([]);
    });

    it('rejects activation on PUT when validation errors exist', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce(makeValidConfig() as never);
      const { req, res, getResponse } = createMockReqRes({
        method: 'PUT',
        body: makeValidConfig({ isActive: true, startingCash: -1 }),
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('returns 400 on invalid id', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'DELETE', query: { id: '' } });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('deletes config, leaderboard, and removes from both lists', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(['test-scenario', 'other'] as never) // active
        .mockResolvedValueOnce(['old-one'] as never);               // archive

      const { req, res, getResponse } = createMockReqRes({
        method: 'DELETE',
        query: { id: 'test-scenario' },
      });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      expect(kv.del).toHaveBeenCalledWith('scenario:test-scenario:config');
      expect(kv.del).toHaveBeenCalledWith('scenario:test-scenario:leaderboard');
      // active list rewritten WITHOUT test-scenario
      expect(kv.set).toHaveBeenCalledWith('scenarios:active', JSON.stringify(['other']));
    });
  });
});
