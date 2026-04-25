/**
 * Tests for POST /api/scenario-challenges/submit (Phase 3A).
 *
 * Critical guardrails:
 *   - Scenario KV key only (NEVER global `leaderboard:v2`)
 *   - Admin preview drops writes entirely
 *   - Grace period: submissions accepted up to endDate + 24h
 *   - Sort score computed from rankingMetric (fev / moic / irr / gpCarry)
 *   - scenario_challenge_id threaded through game_history dual-write
 */

import { describe, it, expect, vi } from 'vitest';
import handler from '../scenario-challenges/submit.js';
import { createMockReqRes, createChain } from './helpers.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { kv } from '@vercel/kv';
import { isBodyTooLarge } from '../_lib/rateLimit.js';

const FUTURE_END = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    scenarioChallengeId: 'recession-gauntlet',
    holdcoName: 'My Holdings',
    initials: 'MH',
    enterpriseValue: 10_000_000,
    founderEquityValue: 8_000_000,
    founderPersonalWealth: 1_000_000,
    score: 70,
    grade: 'B',
    businessCount: 5,
    totalRounds: 10,
    difficulty: 'normal',
    duration: 'quick',
    ...overrides,
  };
}

const MOCK_CONFIG = (overrides: Record<string, unknown> = {}) => ({
  id: 'recession-gauntlet',
  name: 'Recession Gauntlet',
  rankingMetric: 'fev',
  endDate: FUTURE_END,
  ...overrides,
});

function setupAuthUser(playerId = 'test-player-id') {
  vi.mocked(getPlayerIdFromToken).mockResolvedValue(playerId);
  vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
    data: { user: { id: playerId, is_anonymous: false } },
    error: null,
  } as never);
}

describe('POST /api/scenario-challenges/submit', () => {
  describe('Method + body gates', () => {
    it('returns 405 for non-POST', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(405);
    });

    it('returns 413 when body too large', async () => {
      vi.mocked(isBodyTooLarge).mockReturnValueOnce(true);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(413);
    });
  });

  describe('Validation', () => {
    it('rejects missing scenarioChallengeId', async () => {
      const body = validBody();
      delete (body as Record<string, unknown>).scenarioChallengeId;
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
      expect(getResponse().body.error).toMatch(/scenarioChallengeId/);
    });

    it('rejects invalid scenarioChallengeId format', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validBody({ scenarioChallengeId: '../evil' }),
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects initials outside 2-4 uppercase', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody({ initials: 'aa' }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects score out of [0, 100]', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody({ score: 101 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects totalRounds below 3', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody({ totalRounds: 2 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects totalRounds above 30', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody({ totalRounds: 31 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('accepts non-standard totalRounds (e.g., 15) when scenario submitted', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG() as never) // scenario config (read first)
        .mockResolvedValueOnce(null as never); // rate limit miss
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody({ totalRounds: 15 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(200);
    });
  });

  describe('Scenario existence + grace period', () => {
    it('returns 410 when scenario config missing', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce(null as never);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(410);
    });

    it('returns 410 when scenario ended > 24h ago', async () => {
      const expired = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      vi.mocked(kv.get).mockResolvedValueOnce(MOCK_CONFIG({ endDate: expired }) as never);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(410);
    });

    it('accepts submission within 24h grace period after endDate', async () => {
      const endedRecently = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG({ endDate: endedRecently }) as never)
        .mockResolvedValueOnce(null as never); // rate limit
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(200);
    });
  });

  describe('Rate limiting', () => {
    it('returns 429 when rate limit key already exists', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG() as never) // config lookup
        .mockResolvedValueOnce('1' as never); // rate limit hit
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(429);
    });

    it('sets rate limit key in scenario-challenges namespace', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG() as never)
        .mockResolvedValueOnce(null as never);
      const { req, res } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);
      expect(kv.set).toHaveBeenCalledWith(
        expect.stringMatching(/^ratelimit:scenario-challenges:/),
        '1',
        { ex: 60 },
      );
    });
  });

  describe('Admin preview isolation', () => {
    it('returns 200 with previewed: true and no KV/Postgres writes when isAdminPreview', async () => {
      // Dara H1: preview check runs BEFORE identity/profile/config lookup —
      // so no kv.get mocks needed (the handler short-circuits at validation).
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validBody({ isAdminPreview: true }),
      });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      expect(getResponse().body).toEqual({ success: true, previewed: true });
      expect(kv.zadd).not.toHaveBeenCalled();
      // Identity resolution is also skipped — no Supabase touches, no analytics pollution.
      expect(supabaseAdmin!.from).not.toHaveBeenCalled();
      expect(supabaseAdmin!.auth.admin.getUserById).not.toHaveBeenCalled();
    });
  });

  describe('Config integrity — Dara H2 (fail closed)', () => {
    it('returns 410 when config is missing endDate', async () => {
      const configNoEnd = { id: 'no-end', name: 'Missing endDate', rankingMetric: 'fev' };
      vi.mocked(kv.get).mockResolvedValueOnce(configNoEnd as never);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(410);
      expect(getResponse().body.error).toMatch(/endDate/);
    });

    it('returns 410 when config endDate is unparseable', async () => {
      const configBadDate = { ...MOCK_CONFIG(), endDate: 'not-a-date' };
      vi.mocked(kv.get).mockResolvedValueOnce(configBadDate as never);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(410);
    });

    it('rejects array config with 410 (Array.isArray guard)', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce([1, 2, 3] as never);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(410);
    });
  });

  describe('Unknown rankingMetric — Dara H3 (fallback + warn)', () => {
    it('falls back to FEV and logs a warning when metric is unrecognized', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG({ rankingMetric: 'nonexistent' }) as never)
        .mockResolvedValueOnce(null as never);

      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validBody({ founderEquityValue: 7_500_000 }),
      });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      // Sort score falls back to raw FEV.
      expect((zaddCall[1] as { score: number }).score).toBe(7_500_000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/unknown rankingMetric 'nonexistent'/),
      );
      warnSpy.mockRestore();
    });
  });

  describe('KV write — scenario isolation', () => {
    it('writes to scenario:{id}:leaderboard, NOT leaderboard:v2', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG() as never)
        .mockResolvedValueOnce(null as never);
      const { req, res } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);

      expect(kv.zadd).toHaveBeenCalledWith(
        'scenario:recession-gauntlet:leaderboard',
        expect.any(Object),
      );
      expect(kv.zadd).not.toHaveBeenCalledWith('leaderboard:v2', expect.any(Object));
    });

    it('entry member is valid JSON with scenarioChallengeId + identity', async () => {
      setupAuthUser('verified-id');
      vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({ data: { public_id: 'abc123' } }) as never);
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG() as never)
        .mockResolvedValueOnce(null as never);

      const { req, res } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.scenarioChallengeId).toBe('recession-gauntlet');
      expect(entry.playerId).toBe('verified-id');
      expect(entry.publicProfileId).toBe('abc123');
      expect(entry.submittedBy).toBe('verified-id');
    });
  });

  describe('Sort score computation', () => {
    it('fev rankingMetric: uses raw founderEquityValue', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG({ rankingMetric: 'fev' }) as never)
        .mockResolvedValueOnce(null as never);
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validBody({ founderEquityValue: 5_000_000 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(5_000_000);
    });

    it('moic rankingMetric: uses grossMoic × 100_000', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG({ rankingMetric: 'moic' }) as never)
        .mockResolvedValueOnce(null as never);
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validBody({ grossMoic: 2.5 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(250_000);
    });

    it('irr rankingMetric: uses netIrr × 1_000_000', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG({ rankingMetric: 'irr' }) as never)
        .mockResolvedValueOnce(null as never);
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validBody({ netIrr: 0.22 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(220_000);
    });

    it('gpCarry rankingMetric: uses raw carryEarned', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG({ rankingMetric: 'gpCarry' }) as never)
        .mockResolvedValueOnce(null as never);
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validBody({ carryEarned: 42_000 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(42_000);
    });

    it('missing metric input falls back to 0', async () => {
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG({ rankingMetric: 'moic' }) as never)
        .mockResolvedValueOnce(null as never);
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validBody(), // no grossMoic
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(0);
    });
  });

  describe('game_history dual-write', () => {
    it('writes scenario_challenge_id to game_history insert row', async () => {
      setupAuthUser();
      const insertChain = createChain({ data: null });
      vi.mocked(supabaseAdmin!.from)
        .mockReturnValueOnce(createChain({ data: null }) as never) // profile upsert
        .mockReturnValueOnce(createChain({ data: null }) as never) // initials update
        .mockReturnValueOnce(createChain({ data: { public_id: 'p' } }) as never) // public_id lookup
        .mockReturnValueOnce(createChain({ data: null }) as never) // find unclaimed: none
        .mockReturnValueOnce(insertChain as never); // insert fresh

      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG() as never)
        .mockResolvedValueOnce(null as never);

      const { req, res } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario_challenge_id: 'recession-gauntlet',
          is_admin_preview: false,
        }),
      );
    });

    it('skips game_history write when unauthenticated', async () => {
      // getPlayerIdFromToken returns null by default in setup.ts
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG() as never)
        .mockResolvedValueOnce(null as never);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      expect(supabaseAdmin!.from).not.toHaveBeenCalled();
    });
  });

  describe('Response payload', () => {
    it('returns { success, id, rank }', async () => {
      vi.mocked((kv as any).zrank).mockResolvedValueOnce(2);
      vi.mocked((kv as any).zcard)
        .mockResolvedValueOnce(0)  // prune check
        .mockResolvedValueOnce(10); // rank calc
      vi.mocked(kv.get)
        .mockResolvedValueOnce(MOCK_CONFIG() as never)
        .mockResolvedValueOnce(null as never);

      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validBody() });
      await handler(req, res);

      const { statusCode, body } = getResponse();
      expect(statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.rank).toBe(8); // 10 - 2
    });
  });

  // ── Phase 5: server-authoritative milestone FEV multiplier ─────────────

  describe('Phase 5 — applyFevMultiplier (server-authoritative)', () => {
    it('applies a single fired multiplier to founderEquityValue', async () => {
      const config = MOCK_CONFIG({
        triggers: [{
          id: 'roll-up-champ',
          when: { metric: 'integratedPlatformCount', op: '>=', value: 3 },
          actions: [{ type: 'applyFevMultiplier', value: 1.5 }],
          narrative: { title: 'A', detail: 'A' },
        }],
      });
      vi.mocked(kv.get).mockResolvedValueOnce(config as never);
      vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mockResolvedValue(1);
      vi.mocked((kv as unknown as { zcard: ReturnType<typeof vi.fn> }).zcard).mockResolvedValue(5);
      vi.mocked((kv as unknown as { zrank: ReturnType<typeof vi.fn> }).zrank).mockResolvedValue(2);

      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validBody({
          founderEquityValue: 10_000_000,
          triggeredTriggerIds: ['roll-up-champ'],
        }),
      });
      await handler(req, res);

      const { statusCode } = getResponse();
      expect(statusCode).toBe(200);
      // Server should have multiplied the FEV by 1.5 before computing sort score / storing.
      // We can't directly inspect the entry from the response, but zadd was called with the
      // adjusted score. For 'fev' ranking metric, sortScore == adjustedFEV.
      const zaddCalls = vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mock.calls;
      // Last zadd call's score arg should reflect 10M raw × 1.5 = 15M adjusted (truncated to integer $K).
      const lastCall = zaddCalls[zaddCalls.length - 1];
      const scoreArg = (lastCall[1] as { score: number }).score;
      expect(scoreArg).toBe(15_000_000);
    });

    it('stacks multiple fired multipliers multiplicatively', async () => {
      const config = MOCK_CONFIG({
        triggers: [
          { id: 'm1', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 1.5 }], narrative: { title: 'A', detail: 'A' } },
          { id: 'm2', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 1.2 }], narrative: { title: 'B', detail: 'B' } },
        ],
      });
      vi.mocked(kv.get).mockResolvedValueOnce(config as never);
      vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mockResolvedValue(1);
      vi.mocked((kv as unknown as { zcard: ReturnType<typeof vi.fn> }).zcard).mockResolvedValue(5);
      vi.mocked((kv as unknown as { zrank: ReturnType<typeof vi.fn> }).zrank).mockResolvedValue(0);

      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validBody({
          founderEquityValue: 10_000_000,
          triggeredTriggerIds: ['m1', 'm2'],
        }),
      });
      await handler(req, res);

      const zaddCalls = vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mock.calls;
      const lastCall = zaddCalls[zaddCalls.length - 1];
      const scoreArg = (lastCall[1] as { score: number }).score;
      // 10M × 1.5 × 1.2 = 18M
      expect(scoreArg).toBe(18_000_000);
    });

    it('caps stacked multipliers at MAX_FEV_MULTIPLIER (5×)', async () => {
      const config = MOCK_CONFIG({
        triggers: [
          { id: 'm1', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 5 }], narrative: { title: 'A', detail: 'A' } },
          { id: 'm2', when: { metric: 'cash', op: '>=', value: 1 }, actions: [{ type: 'applyFevMultiplier', value: 5 }], narrative: { title: 'B', detail: 'B' } },
        ],
      });
      vi.mocked(kv.get).mockResolvedValueOnce(config as never);
      vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mockResolvedValue(1);
      vi.mocked((kv as unknown as { zcard: ReturnType<typeof vi.fn> }).zcard).mockResolvedValue(5);
      vi.mocked((kv as unknown as { zrank: ReturnType<typeof vi.fn> }).zrank).mockResolvedValue(0);

      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validBody({
          founderEquityValue: 10_000_000,
          triggeredTriggerIds: ['m1', 'm2'],
        }),
      });
      await handler(req, res);

      const zaddCalls = vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mock.calls;
      const lastCall = zaddCalls[zaddCalls.length - 1];
      const scoreArg = (lastCall[1] as { score: number }).score;
      // 5 × 5 = 25 → capped at 5 → 10M × 5 = 50M
      expect(scoreArg).toBe(50_000_000);
    });

    it('ignores bogus trigger IDs not in the scenario config', async () => {
      const config = MOCK_CONFIG({
        triggers: [{
          id: 'real-trigger',
          when: { metric: 'cash', op: '>=', value: 1 },
          actions: [{ type: 'applyFevMultiplier', value: 1.5 }],
          narrative: { title: 'A', detail: 'A' },
        }],
      });
      vi.mocked(kv.get).mockResolvedValueOnce(config as never);
      vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mockResolvedValue(1);
      vi.mocked((kv as unknown as { zcard: ReturnType<typeof vi.fn> }).zcard).mockResolvedValue(5);
      vi.mocked((kv as unknown as { zrank: ReturnType<typeof vi.fn> }).zrank).mockResolvedValue(0);

      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validBody({
          founderEquityValue: 10_000_000,
          // 'fake-trigger' doesn't exist in config; should be ignored.
          triggeredTriggerIds: ['fake-trigger'],
        }),
      });
      await handler(req, res);

      const zaddCalls = vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mock.calls;
      const lastCall = zaddCalls[zaddCalls.length - 1];
      const scoreArg = (lastCall[1] as { score: number }).score;
      // No multiplier applied — score == raw FEV.
      expect(scoreArg).toBe(10_000_000);
    });

    it('no-ops when triggeredTriggerIds is omitted', async () => {
      const config = MOCK_CONFIG({
        triggers: [{
          id: 'm1',
          when: { metric: 'cash', op: '>=', value: 1 },
          actions: [{ type: 'applyFevMultiplier', value: 2 }],
          narrative: { title: 'A', detail: 'A' },
        }],
      });
      vi.mocked(kv.get).mockResolvedValueOnce(config as never);
      vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mockResolvedValue(1);
      vi.mocked((kv as unknown as { zcard: ReturnType<typeof vi.fn> }).zcard).mockResolvedValue(5);
      vi.mocked((kv as unknown as { zrank: ReturnType<typeof vi.fn> }).zrank).mockResolvedValue(0);

      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validBody({ founderEquityValue: 10_000_000 }),
      });
      await handler(req, res);

      const zaddCalls = vi.mocked((kv as unknown as { zadd: ReturnType<typeof vi.fn> }).zadd).mock.calls;
      const lastCall = zaddCalls[zaddCalls.length - 1];
      const scoreArg = (lastCall[1] as { score: number }).score;
      expect(scoreArg).toBe(10_000_000); // no multiplier
    });
  });
});
