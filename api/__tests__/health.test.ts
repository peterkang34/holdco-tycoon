import { describe, it, expect, vi } from 'vitest';
import handler from '../health.js';
import { createMockReqRes } from './helpers.js';
import { setMockSupabaseAdmin } from './setup.js';
import { kv } from '@vercel/kv';

describe('GET /api/health', () => {
  it('returns ok when all services healthy', async () => {
    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect((body.checks as Record<string, boolean>).supabaseAdmin).toBe(true);
    expect((body.checks as Record<string, boolean>).kv).toBe(true);
  });

  it('returns 503 when supabaseAdmin is null', async () => {
    setMockSupabaseAdmin(null);

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(503);
    expect(body.ok).toBe(false);
    expect((body.checks as Record<string, boolean>).supabaseAdmin).toBe(false);
  });

  it('returns 503 when kv is down', async () => {
    vi.mocked((kv as any).ping).mockRejectedValue(new Error('Connection refused'));

    const { req, res, getResponse } = createMockReqRes();
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(503);
    expect(body.ok).toBe(false);
    expect((body.checks as Record<string, boolean>).kv).toBe(false);
  });
});
