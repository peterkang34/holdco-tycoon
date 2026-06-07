/**
 * Admin narrative-draft endpoint: returns AI-written tagline/description/name (text only),
 * never config. Auth-gated; tolerant of the model wrapping JSON in stray text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReqRes } from './helpers.js';

vi.mock('../_lib/adminAuth.js', () => ({ verifyAdminToken: vi.fn() }));
vi.mock('../_lib/ai.js', () => ({
  ANTHROPIC_API_KEY: 'test-key',
  AI_MODEL: 'claude-haiku-4-5',
  callAnthropic: vi.fn(),
}));

import { verifyAdminToken } from '../_lib/adminAuth.js';
import { callAnthropic } from '../_lib/ai.js';
import handler from '../admin/scenario-challenges/draft-narrative.js';

beforeEach(() => {
  vi.mocked(verifyAdminToken).mockResolvedValue(true as never);
});

describe('admin/scenario-challenges/draft-narrative', () => {
  it('returns parsed tagline/description from the model', async () => {
    vi.mocked(callAnthropic).mockResolvedValue({
      content: 'Sure!\n{"name":"Tight Money","emoji":"📉","tagline":"Survive the squeeze","description":"Rates are in double digits."}',
    } as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: { isPE: false, durationYears: 10 } });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body.tagline).toBe('Survive the squeeze');
    expect(getResponse().body.description).toContain('double digits');
    expect(getResponse().body.name).toBe('Tight Money');
    expect(getResponse().body.emoji).toBe('📉');
  });

  it('405s on non-POST', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('502s when the model returns unparseable text', async () => {
    vi.mocked(callAnthropic).mockResolvedValue({ content: 'no json here' } as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: {} });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(502);
  });
});
