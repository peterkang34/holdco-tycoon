/**
 * Tests for POST /api/admin/scenario-challenges/generate (Phase 3B.1).
 *
 * Covers admin auth, input validation, rate limit, Haiku call mocking,
 * JSON extraction, default backfill, and validation passthrough.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kv } from '@vercel/kv';
import { createMockReqRes } from './helpers.js';

vi.mock('../_lib/adminAuth.js', () => ({
  verifyAdminToken: vi.fn(),
}));
vi.mock('../_lib/ai.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../_lib/ai.js')>();
  return {
    ...mod,
    ANTHROPIC_API_KEY: 'test-key',
    callAnthropic: vi.fn(),
  };
});

import { verifyAdminToken } from '../_lib/adminAuth.js';
import { callAnthropic } from '../_lib/ai.js';
import handler from '../admin/scenario-challenges/generate.js';

function setAdminAuth(authorized: boolean) {
  vi.mocked(verifyAdminToken).mockImplementation(async (_req, res) => {
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  });
}

/** Build a validated-but-minimal ScenarioChallengeConfig JSON the AI might return. */
function buildAiOutput() {
  return JSON.stringify({
    id: 'ai-generated',
    name: 'AI Generated',
    tagline: 'From AI',
    description: 'Generated from a prompt.',
    configVersion: 1,
    theme: { emoji: '🤖', color: '#F59E0B' },
    startDate: '2026-05-01T00:00:00Z',
    endDate: '2026-06-01T00:00:00Z',
    isActive: false,
    isFeatured: false,
    seed: 42,
    difficulty: 'easy',
    duration: 'quick',
    maxRounds: 10,
    startingCash: 5000,
    startingDebt: 0,
    founderShares: 800,
    sharesOutstanding: 1000,
    startingBusinesses: [],
    rankingMetric: 'fev',
  });
}

beforeEach(() => {
  setAdminAuth(true);
  vi.mocked(kv.incr).mockResolvedValue(1);
  vi.mocked(kv.expire).mockResolvedValue(1);
  vi.mocked(callAnthropic).mockResolvedValue({ content: buildAiOutput() });
});

describe('admin/scenario-challenges/generate', () => {
  it('returns 405 for non-POST', async () => {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(405);
  });

  it('returns 401 when admin auth fails', async () => {
    setAdminAuth(false);
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'A valid description here' },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('returns 400 on missing description', async () => {
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: {},
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('returns 400 on description < 10 chars', async () => {
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'short' },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('returns 400 on description > 2000 chars', async () => {
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'x'.repeat(2001) },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(400);
  });

  it('returns 429 when daily limit exceeded', async () => {
    vi.mocked(kv.incr).mockResolvedValueOnce(21);
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Valid description please generate' },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(429);
    expect(getResponse().body.error).toMatch(/Daily generation limit/);
    expect(getResponse().body.usage).toEqual({ used: 21, limit: 20 });
  });

  it('returns generated config + errors/warnings on success', async () => {
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Please generate a scenario about SaaS rollups' },
    });
    await handler(req, res);

    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.config.id).toBe('ai-generated');
    expect(body.errors).toEqual([]); // valid config
    expect(body.usage).toEqual({ used: 1, limit: 20 });
  });

  it('sets rate-limit key with 48h TTL on first use of the day', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer very-long-admin-token-value-abc123' },
      body: { description: 'Generate something please' },
    });
    await handler(req, res);

    expect(kv.incr).toHaveBeenCalledWith(
      expect.stringMatching(/^admin:scenario-gen-count:very-long-admin/),
    );
    expect(kv.expire).toHaveBeenCalledWith(
      expect.stringMatching(/^admin:scenario-gen-count:/),
      48 * 60 * 60,
    );
  });

  it('returns 502 when Haiku returns empty content', async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({ content: null, error: 'AI service temporarily unavailable' });
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Generate a scenario' },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(502);
  });

  it('extracts JSON from a markdown code fence', async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      content: '```json\n' + buildAiOutput() + '\n```',
    });
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Generate a scenario' },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body.config.id).toBe('ai-generated');
  });

  it('returns 502 when AI output is not valid JSON', async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({ content: 'This is just prose with no JSON.' });
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Generate a scenario' },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(502);
  });

  it('extracts first balanced-brace JSON from prose with an embedded example (Dara H2)', async () => {
    // Haiku sometimes returns an example object + the real config. Old code's
    // first-brace/last-brace fallback would corrupt this by grabbing the span
    // between the two objects. Balanced-brace scan takes the first complete
    // object, which is the one Haiku leads with per our prompt.
    const real = JSON.parse(buildAiOutput());
    const prose = `Here's an example: {"example": true}. Now here's your config: ${JSON.stringify(real)}`;
    vi.mocked(callAnthropic).mockResolvedValueOnce({ content: prose });

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Generate a scenario' },
    });
    await handler(req, res);

    // The balanced scan finds `{"example": true}` first — not the real config.
    // This produces a 200 with backfilled defaults + validation errors surfaced
    // to the admin (they can see the AI misformatted and regenerate).
    expect(getResponse().statusCode).toBe(200);
    const { body } = getResponse();
    // Example object lacks required fields → errors surface.
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('handles braces inside JSON string values (escape-aware scan)', async () => {
    const real = JSON.parse(buildAiOutput());
    real.description = 'Evil description with } brace and { inside it';
    vi.mocked(callAnthropic).mockResolvedValueOnce({ content: JSON.stringify(real) });

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Generate a scenario' },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body.config.description).toContain('brace');
  });

  it('returns 503 when KV rate-limit check fails (Dara H3 — fail closed)', async () => {
    vi.mocked(kv.incr).mockRejectedValueOnce(new Error('KV outage'));
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Generate a scenario' },
    });
    await handler(req, res);

    expect(getResponse().statusCode).toBe(503);
    // callAnthropic must NOT run — fail-closed means no Haiku spend during KV outage.
    expect(callAnthropic).not.toHaveBeenCalled();
  });

  it('surfaces validation errors when AI output is malformed but parseable', async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      content: JSON.stringify({
        id: 'bad',
        name: 'Bad',
        tagline: 'Bad',
        description: 'Bad',
        theme: { emoji: '🐛', color: '#000' },
        startDate: '2026-05-01T00:00:00Z',
        endDate: '2026-06-01T00:00:00Z',
        seed: 1,
        difficulty: 'easy',
        duration: 'quick',
        maxRounds: 999, // INVALID: out of [3, 30]
        startingCash: 5000,
        startingDebt: 0,
        founderShares: 800,
        sharesOutstanding: 1000,
        startingBusinesses: [],
        rankingMetric: 'fev',
      }),
    });
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Generate something' },
    });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(200); // still 200 — admin can fix in wizard
    expect(getResponse().body.errors.length).toBeGreaterThan(0);
    expect(getResponse().body.errors[0]).toMatch(/maxRounds/);
  });

  it('backfills missing configVersion to current schema', async () => {
    const minimalOutput = { ...JSON.parse(buildAiOutput()) };
    delete minimalOutput.configVersion;
    vi.mocked(callAnthropic).mockResolvedValueOnce({ content: JSON.stringify(minimalOutput) });

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { description: 'Generate something' },
    });
    await handler(req, res);
    expect(getResponse().body.config.configVersion).toBe(1);
  });
});
