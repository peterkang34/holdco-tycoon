import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../admin/verify.js';
import { createMockReqRes } from './helpers.js';
import { checkRateLimit } from '../_lib/rateLimit.js';

const SECRET = 'correct-horse-battery-staple-0123456789';

describe('POST /api/admin/verify', () => {
  beforeEach(() => { process.env.ADMIN_SECRET = SECRET; });
  afterEach(() => { delete process.env.ADMIN_SECRET; });

  const login = async (password?: string) => {
    const headers = password === undefined ? {} : { authorization: `Bearer ${password}` };
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', headers });
    await handler(req, res);
    return getResponse();
  };

  it('issues a session token for the correct secret', async () => {
    const r = await login(SECRET);
    expect(r.statusCode).toBe(200);
    expect(typeof r.body.token).toBe('string');
  });

  it('rejects a wrong secret, including one of a different length', async () => {
    expect((await login('wrong')).statusCode).toBe(401);
    expect((await login(SECRET + 'x')).statusCode).toBe(401);
  });

  it('rejects everything when ADMIN_SECRET is unset', async () => {
    delete process.env.ADMIN_SECRET;
    expect((await login('undefined')).statusCode).toBe(401);
  });

  it('rate-limits after 5 attempts per window — even with the right secret', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce(true);
    expect((await login(SECRET)).statusCode).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      namespace: 'admin-login', maxRequests: 5, windowSeconds: 900,
    }));
  });

  it('405 for non-POST', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });
});
