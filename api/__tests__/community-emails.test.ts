/**
 * GET /api/admin/community?emails=1 — "Copy all emails" admin helper.
 * Returns every verified player's email (deduped, sorted) for a BCC send.
 * Admin-gated; anonymous users (no email) are naturally excluded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../_lib/adminAuth.js', () => ({ verifyAdminToken: vi.fn() }));

import { verifyAdminToken } from '../_lib/adminAuth.js';
import handler from '../admin/community.js';
import { createMockReqRes } from './helpers.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

const mockUsers = (users: unknown[]) =>
  vi.mocked(supabaseAdmin!.auth.admin.listUsers)
    // First page returns users, second page empty (terminates the pagination loop).
    .mockResolvedValueOnce({ data: { users }, error: null } as never)
    .mockResolvedValue({ data: { users: [] }, error: null } as never);

describe('GET /api/admin/community?emails=1', () => {
  beforeEach(() => {
    vi.mocked(verifyAdminToken).mockResolvedValue(true as never);
  });

  it('requires admin auth', async () => {
    vi.mocked(verifyAdminToken).mockImplementation(async (_req, res) => {
      (res as { status: (n: number) => { json: (b: unknown) => void } }).status(401).json({ error: 'Unauthorized' });
      return false as never;
    });
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { emails: '1' } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('returns verified emails, deduped + sorted; excludes anonymous (no email)', async () => {
    mockUsers([
      { id: 'a', email: 'zoe@example.com', is_anonymous: false, created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'google' } },
      { id: 'b', email: 'amy@example.com', is_anonymous: false, created_at: '2026-01-02T00:00:00Z', app_metadata: { provider: 'email' } },
      { id: 'c', is_anonymous: true, created_at: '2026-01-03T00:00:00Z' }, // anonymous → no email
      { id: 'd', email: 'amy@example.com', is_anonymous: false, created_at: '2026-01-04T00:00:00Z', app_metadata: { provider: 'email' } }, // dup email
    ]);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { emails: '1' } });
    await handler(req, res);
    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.emails).toEqual(['amy@example.com', 'zoe@example.com']); // sorted, deduped
    expect(body.count).toBe(2);
  });

  it('returns an empty list when there are no verified users', async () => {
    mockUsers([{ id: 'c', is_anonymous: true, created_at: '2026-01-03T00:00:00Z' }]);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { emails: '1' } });
    await handler(req, res);
    expect(getResponse().body.emails).toEqual([]);
    expect(getResponse().body.count).toBe(0);
  });
});
