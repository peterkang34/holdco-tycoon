/**
 * Tests for POST /api/admin/scenario-challenges/clear-preview (Phase 3B.1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReqRes } from './helpers.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { setMockSupabaseAdmin } from './setup.js';

vi.mock('../_lib/adminAuth.js', () => ({
  verifyAdminToken: vi.fn(),
}));
import { verifyAdminToken } from '../_lib/adminAuth.js';
import handler from '../admin/scenario-challenges/clear-preview.js';

function setAdminAuth(authorized: boolean) {
  vi.mocked(verifyAdminToken).mockImplementation(async (_req, res) => {
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  });
}

beforeEach(() => {
  setAdminAuth(true);
});

describe('admin/scenario-challenges/clear-preview', () => {
  it('returns 405 for non-POST', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('returns 401 when admin auth fails', async () => {
    setAdminAuth(false);
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', query: { id: 'sc-1' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('returns 503 when supabaseAdmin is null', async () => {
    setMockSupabaseAdmin(null);
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', query: { id: 'sc-1' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(503);
  });

  it('returns 400 on invalid id', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', query: { id: '../evil' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('returns 400 on missing id', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', query: {} });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('deletes preview rows and returns deletedCount atomically', async () => {
    // Atomic `.delete().select('id')` returns the deleted rows in one round-trip.
    const chain: Record<string, unknown> = {};
    chain.delete = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => void) => resolve({
      data: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }, { id: 'r5' }, { id: 'r6' }, { id: 'r7' }],
      error: null,
    });

    vi.mocked(supabaseAdmin!.from).mockReturnValueOnce(chain as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', query: { id: 'recession-gauntlet' } });
    await handler(req, res);

    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body).toEqual({ success: true, deletedCount: 7 });
  });

  it('returns 500 when delete query errors', async () => {
    const chain: Record<string, unknown> = {};
    chain.delete = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'db down' } });

    vi.mocked(supabaseAdmin!.from).mockReturnValueOnce(chain as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', query: { id: 'recession-gauntlet' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(500);
  });

  it('returns deletedCount: 0 when nothing matches', async () => {
    const chain: Record<string, unknown> = {};
    chain.delete = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });

    vi.mocked(supabaseAdmin!.from).mockReturnValueOnce(chain as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', query: { id: 'clean-scenario' } });
    await handler(req, res);
    expect(getResponse().body).toEqual({ success: true, deletedCount: 0 });
  });
});
