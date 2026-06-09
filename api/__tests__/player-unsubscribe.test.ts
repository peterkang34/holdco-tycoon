/**
 * POST /api/admin/player-unsubscribe — admin toggle for a player's email opt-out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../_lib/adminAuth.js', () => ({ verifyAdminToken: vi.fn() }));

import { verifyAdminToken } from '../_lib/adminAuth.js';
import handler from '../admin/player-unsubscribe.js';
import { createMockReqRes, createChain } from './helpers.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

describe('POST /api/admin/player-unsubscribe', () => {
  beforeEach(() => {
    vi.mocked(verifyAdminToken).mockResolvedValue(true as never);
    vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({ data: null, error: null }) as never);
  });

  it('rejects non-POST', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('requires admin auth', async () => {
    vi.mocked(verifyAdminToken).mockImplementation(async (_req, res) => {
      (res as { status: (n: number) => { json: (b: unknown) => void } }).status(401).json({ error: 'Unauthorized' });
      return false as never;
    });
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: { playerId: 'p1', unsubscribed: true } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('requires a playerId', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: { unsubscribed: true } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('updates email_unsubscribed and echoes the new state', async () => {
    const chain = createChain({ data: null, error: null });
    vi.mocked(supabaseAdmin!.from).mockReturnValue(chain as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: { playerId: 'p1', unsubscribed: true } });
    await handler(req, res);
    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ success: true, playerId: 'p1', unsubscribed: true });
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ email_unsubscribed: true }));
  });
});
