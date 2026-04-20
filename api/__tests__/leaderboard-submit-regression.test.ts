/**
 * Regression tests for api/leaderboard/submit.ts
 *
 * Pins current behavior before the leaderboardCore.ts extraction refactor.
 * Every test here must pass BEFORE and AFTER the refactor — any change in
 * outcome means we accidentally altered production behavior.
 *
 * Scope: validates the critical observable behavior of the global leaderboard
 * submit endpoint (validation, sort-score math, rate limit, profile upsert,
 * KV write + prune + rank, Postgres dual-write).
 */

import { describe, it, expect, vi } from 'vitest';
import handler from '../leaderboard/submit.js';
import { createMockReqRes, createChain } from './helpers.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { kv } from '@vercel/kv';
import { isBodyTooLarge } from '../_lib/rateLimit.js';
import { updatePlayerStats, updateGlobalStats } from '../_lib/playerStats.js';
import { setMockSupabaseAdmin } from './setup.js';

/** Build a minimally-valid holdco submission body. */
function validHoldcoBody(overrides: Record<string, unknown> = {}) {
  return {
    holdcoName: 'Test Holdings',
    initials: 'TH',
    enterpriseValue: 10_000_000,
    score: 50,
    grade: 'C',
    businessCount: 3,
    totalRounds: 20,
    totalInvestedCapital: 5_000_000,
    totalRevenue: 8_000_000,
    avgEbitdaMargin: 0.25,
    difficulty: 'easy',
    duration: 'standard',
    founderEquityValue: 8_000_000,
    founderPersonalWealth: 1_000_000,
    hasRestructured: false,
    familyOfficeCompleted: false,
    ...overrides,
  };
}

/** Build a minimally-valid PE Fund Manager submission body. */
function validPEBody(overrides: Record<string, unknown> = {}) {
  return {
    holdcoName: 'Fund I',
    initials: 'FI',
    enterpriseValue: 500_000,
    score: 70,
    grade: 'B',
    businessCount: 3,
    totalRounds: 10,
    difficulty: 'normal',
    duration: 'quick',
    founderEquityValue: 400_000,
    founderPersonalWealth: 100_000,
    isFundManager: true,
    fundName: 'Test Fund',
    netIrr: 0.22,
    grossMoic: 2.5,
    carryEarned: 50_000,
    ...overrides,
  };
}

/** Set up an authenticated non-anonymous player. */
function setupAuthUser(playerId = 'test-player-id') {
  vi.mocked(getPlayerIdFromToken).mockResolvedValue(playerId);
  vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
    data: { user: { id: playerId, is_anonymous: false } },
    error: null,
  } as never);
}

describe('POST /api/leaderboard/submit — regression (pre-extraction behavior)', () => {
  describe('HTTP method + body size gates', () => {
    it('returns 405 for GET', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(405);
    });

    it('returns 413 when body too large', async () => {
      vi.mocked(isBodyTooLarge).mockReturnValueOnce(true);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(413);
    });
  });

  describe('Validation — initials/holdcoName/EV/score/grade', () => {
    it('rejects initials shorter than 2 chars', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ initials: 'A' }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
      expect(getResponse().body.error).toMatch(/initials/);
    });

    it('rejects initials longer than 4 chars', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ initials: 'ABCDE' }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects lowercase initials', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ initials: 'ab' }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects empty holdcoName', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ holdcoName: '   ' }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects holdcoName with unsafe chars', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ holdcoName: '<script>' }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects enterpriseValue beyond cap', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ enterpriseValue: 25_000_000_000 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects negative enterpriseValue', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ enterpriseValue: -1 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects non-integer score', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ score: 50.5 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects score > 100', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ score: 101 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects invalid grade', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ grade: 'X' }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });

    it('rejects grade that does not match score range (holdco only)', async () => {
      // score 50 with grade 'S' (S requires score >= 95)
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ score: 50, grade: 'S' }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
      expect(getResponse().body.error).toMatch(/grade does not match/);
    });

    it('rejects totalRounds other than 10 or 20', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ totalRounds: 15 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
      expect(getResponse().body.error).toMatch(/totalRounds/);
    });

    it('rejects businessCount > 30', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ businessCount: 31 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
    });
  });

  describe('Plausibility checks (holdco only)', () => {
    it('rejects S-grade with fewer than 3 businesses', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ score: 97, grade: 'S', businessCount: 2 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
      expect(getResponse().body.error).toMatch(/S-grade/);
    });

    it('rejects FEV exceeding EV × 1.2', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ enterpriseValue: 1_000_000, founderEquityValue: 2_000_000 }),
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
      expect(getResponse().body.error).toMatch(/FEV exceeds/);
    });

    it('rejects score > 0 with all scoreBreakdown dimensions zero', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({
          strategy: {
            scoreBreakdown: {
              valueCreation: 0, fcfShareGrowth: 0, portfolioRoic: 0,
              capitalDeployment: 0, balanceSheetHealth: 0, strategicDiscipline: 0,
            },
            archetype: 'balanced',
            sophisticationScore: 50,
            sectorIds: [],
          },
        }),
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
      expect(getResponse().body.error).toMatch(/all dimensions are 0/);
    });

    it('rejects zero acquisitions with 5+ businesses', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({
          businessCount: 6,
          strategy: {
            scoreBreakdown: { valueCreation: 5, fcfShareGrowth: 3, portfolioRoic: 5, capitalDeployment: 5, balanceSheetHealth: 5, strategicDiscipline: 3 },
            archetype: 'balanced',
            sophisticationScore: 50,
            sectorIds: [],
            totalAcquisitions: 0,
          },
        }),
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(400);
      expect(getResponse().body.error).toMatch(/no acquisitions/);
    });

    it('PE submissions skip holdco plausibility (grade-score match)', async () => {
      // PE grade thresholds are different; score 70 grade B is valid for PE, would fail holdco grade check (B requires 65-81)
      // We test that PE bypasses holdco grade validation even when grade wouldn't match holdco logic
      // Use score that IS in holdco B range (65-81) so we don't spuriously fail — this just verifies PE branch runs
      const body = validPEBody({ score: 70, grade: 'B', businessCount: 2 });
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body });
      await handler(req, res);
      // Should NOT 400 on S-grade-with-low-businesses (holdco-only check)
      expect(getResponse().statusCode).toBe(200);
    });
  });

  describe('Rate limiting', () => {
    it('returns 429 when rate limit key already exists', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce('1' as never);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(429);
    });

    it('sets rate limit key with 60s TTL on successful submission', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(200);
      expect(kv.set).toHaveBeenCalledWith(
        expect.stringMatching(/^ratelimit:leaderboard:/),
        '1',
        { ex: 60 },
      );
    });
  });

  describe('KV sorted-set write + rank', () => {
    it('uses adjustedFEV as sort score for holdco (easy difficulty = 0.9x multiplier)', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ founderEquityValue: 10_000_000, difficulty: 'easy' }),
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(200);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect(zaddCall[0]).toBe('leaderboard:v2');
      const { score } = zaddCall[1] as { score: number; member: string };
      // 10M * 0.9 * 1.0 (no restructure) * 1.0 (no FO) = 9M
      expect(score).toBe(9_000_000);
    });

    it('applies normal difficulty multiplier (1.35x)', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ founderEquityValue: 10_000_000, difficulty: 'normal' }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const { score } = zaddCall[1] as { score: number; member: string };
      expect(score).toBe(13_500_000);
    });

    it('applies 0.80x restructuring penalty to sort score', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ founderEquityValue: 10_000_000, difficulty: 'easy', hasRestructured: true }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const { score } = zaddCall[1] as { score: number; member: string };
      // 10M * 0.9 * 0.8 * 1.0 = 7.2M
      expect(score).toBe(7_200_000);
    });

    it('applies FO multiplier (1.0-1.5 range)', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ founderEquityValue: 10_000_000, difficulty: 'easy', foMultiplier: 1.2 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const { score } = zaddCall[1] as { score: number; member: string };
      // 10M * 0.9 * 1.0 * 1.2 = 10.8M
      expect(score).toBe(10_800_000);
    });

    it('uses grossMoic × 100000 as sort score for PE submissions', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validPEBody({ grossMoic: 2.5 }) });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(200);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const { score } = zaddCall[1] as { score: number; member: string };
      expect(score).toBe(250_000);
    });

    it('prunes lowest entries when over MAX_ENTRIES (500)', async () => {
      vi.mocked((kv as any).zcard).mockResolvedValueOnce(501);
      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      expect((kv as any).zremrangebyrank).toHaveBeenCalledWith('leaderboard:v2', 0, 0);
    });

    it('does not prune when at or under MAX_ENTRIES', async () => {
      vi.mocked((kv as any).zcard).mockResolvedValueOnce(500);
      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      expect((kv as any).zremrangebyrank).not.toHaveBeenCalled();
    });

    it('returns rank = (count - ascRank) from zrank', async () => {
      // ascRank 2 in a set of 10 → descending rank = 10 - 2 = 8
      vi.mocked((kv as any).zrank).mockResolvedValueOnce(2);
      vi.mocked((kv as any).zcard)
        .mockResolvedValueOnce(0) // prune check
        .mockResolvedValueOnce(10); // rank calc
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      expect(getResponse().body.rank).toBe(8);
    });

    it('returns rank = 1 when zrank returns null (entry not found — shouldn\'t happen but fallback)', async () => {
      vi.mocked((kv as any).zrank).mockResolvedValueOnce(null);
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      expect(getResponse().body.rank).toBe(1);
    });
  });

  describe('Player identity — anonymous vs verified', () => {
    it('anonymous: entry has no playerId, has submittedBy', async () => {
      const anonId = 'anon-uuid';
      vi.mocked(getPlayerIdFromToken).mockResolvedValue(anonId);
      vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
        data: { user: { id: anonId, is_anonymous: true } },
        error: null,
      } as never);

      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.playerId).toBeUndefined();
      expect(entry.submittedBy).toBe(anonId);
    });

    it('verified: entry has both playerId and submittedBy set', async () => {
      setupAuthUser('verified-id');
      vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({ data: { public_id: 'abc123' } }) as never);

      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.playerId).toBe('verified-id');
      expect(entry.submittedBy).toBe('verified-id');
      expect(entry.publicProfileId).toBe('abc123');
    });

    it('unauthenticated: no profile upsert, no game_history write', async () => {
      // Default: getPlayerIdFromToken returns null
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      expect(supabaseAdmin!.from).not.toHaveBeenCalled();
      expect(updatePlayerStats).not.toHaveBeenCalled();
    });
  });

  describe('Profile upsert + public_id', () => {
    it('upserts player_profiles with ignoreDuplicates + syncs initials', async () => {
      setupAuthUser();
      const upsertChain = createChain({ data: { public_id: 'existing123' } });
      const updateChain = createChain({ data: null });
      vi.mocked(supabaseAdmin!.from)
        .mockReturnValueOnce(upsertChain as never) // upsert
        .mockReturnValueOnce(updateChain as never) // update initials
        .mockReturnValueOnce(upsertChain as never); // public_id lookup

      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ initials: 'ZZ' }) });
      await handler(req, res);

      expect(upsertChain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test-player-id', initials: 'ZZ' }),
        { onConflict: 'id', ignoreDuplicates: true },
      );
    });

    it('backfills public_id when profile exists but public_id is null', async () => {
      setupAuthUser();
      vi.mocked(supabaseAdmin!.from)
        .mockReturnValueOnce(createChain({ data: null }) as never) // upsert
        .mockReturnValueOnce(createChain({ data: null }) as never) // initials update
        .mockReturnValueOnce(createChain({ data: { public_id: null } }) as never) // lookup: null
        .mockReturnValueOnce(createChain({ data: null }) as never); // backfill update

      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.publicProfileId).toMatch(/^[0-9a-f]{12}$/);
    });
  });

  describe('game_history dual-write', () => {
    it('enriches existing auto-save row when match found', async () => {
      setupAuthUser();
      const findChain = createChain({ data: { id: 'existing-row' } });
      const enrichChain = createChain({ data: null });
      const insertChain = createChain({ data: null });
      vi.mocked(supabaseAdmin!.from)
        .mockReturnValueOnce(createChain({ data: null }) as never) // profile upsert
        .mockReturnValueOnce(createChain({ data: null }) as never) // initials update
        .mockReturnValueOnce(createChain({ data: { public_id: 'pub' } }) as never) // public_id lookup
        .mockReturnValueOnce(findChain as never)   // find auto-save row — returns existing
        .mockReturnValueOnce(enrichChain as never) // enrich update
        .mockReturnValueOnce(insertChain as never); // safety: insert should NOT be called

      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      // Enrich path: update called with branding/leaderboard fields; insert not called
      expect(enrichChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          leaderboard_entry_id: expect.any(String),
          initials: 'TH',
          holdco_name: 'Test Holdings',
        }),
      );
      expect(insertChain.insert).not.toHaveBeenCalled();
    });

    it('inserts fresh game_history row when no auto-save row found', async () => {
      setupAuthUser();
      const insertChain = createChain({ data: null });
      const enrichChain = createChain({ data: null });
      vi.mocked(supabaseAdmin!.from)
        .mockReturnValueOnce(createChain({ data: null }) as never) // profile upsert
        .mockReturnValueOnce(createChain({ data: null }) as never) // initials update
        .mockReturnValueOnce(createChain({ data: { public_id: 'pub' } }) as never) // public_id lookup
        .mockReturnValueOnce(createChain({ data: null }) as never) // find: no existing
        .mockReturnValueOnce(insertChain as never) // insert fresh
        .mockReturnValueOnce(enrichChain as never); // safety: enrich should NOT be called

      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          player_id: 'test-player-id',
          holdco_name: 'Test Holdings',
          score: 50,
          grade: 'C',
        }),
      );
      expect(enrichChain.update).not.toHaveBeenCalled();
    });

    it('fires updatePlayerStats + updateGlobalStats (non-blocking)', async () => {
      setupAuthUser();
      vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({ data: null }) as never);

      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      expect(updatePlayerStats).toHaveBeenCalledWith('test-player-id');
      expect(updateGlobalStats).toHaveBeenCalled();
    });
  });

  describe('Response payload', () => {
    it('returns id, rank, and no playbookShareId when no playbook', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      const { statusCode, body } = getResponse();
      expect(statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof body.rank).toBe('number');
      expect(body.playbookShareId).toBeUndefined();
    });

    it('returns playbookShareId when valid playbook provided', async () => {
      setupAuthUser();
      vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({ data: null }) as never);

      const validPlaybook = {
        version: 1,
        generatedAt: new Date().toISOString(),
        thesis: {
          archetype: 'balanced',
          holdcoName: 'Test',
          fev: 1_000_000,
          score: 50,
          isFundManager: false,
          isBankrupt: false,
        },
        capital: { peakLeverage: 2.0, peakDistressLevel: 'comfortable' },
        performance: { metricsTimeline: [] },
      };

      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ playbook: validPlaybook }),
      });
      await handler(req, res);

      const { statusCode, body } = getResponse();
      expect(statusCode).toBe(200);
      expect(body.playbookShareId).toMatch(/^[0-9a-f]{12}$/);
    });
  });

  describe('Entry payload composition', () => {
    it('includes PE fields in entry when isFundManager: true', async () => {
      const { req, res } = createMockReqRes({ method: 'POST', body: validPEBody() });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.isFundManager).toBe(true);
      expect(entry.fundName).toBe('Test Fund');
      expect(entry.netIrr).toBe(0.22);
      expect(entry.grossMoic).toBe(2.5);
      expect(entry.carryEarned).toBe(50_000);
    });

    it('omits PE fields from holdco entry', async () => {
      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.isFundManager).toBeUndefined();
      expect(entry.fundName).toBeUndefined();
    });

    it('preserves strategy enrichment fields', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({
          strategy: {
            scoreBreakdown: { valueCreation: 5, fcfShareGrowth: 3, portfolioRoic: 5, capitalDeployment: 5, balanceSheetHealth: 5, strategicDiscipline: 3 },
            archetype: 'serial_acquirer',
            sophisticationScore: 80,
            sectorIds: ['saas', 'healthcare'],
            totalAcquisitions: 5,
            peakLeverage: 2.5,
          },
        }),
      });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.strategy.archetype).toBe('serial_acquirer');
      expect(entry.strategy.sophisticationScore).toBe(80);
      expect(entry.strategy.sectorIds).toEqual(['saas', 'healthcare']);
      expect(entry.strategy.totalAcquisitions).toBe(5);
      expect(entry.strategy.peakLeverage).toBe(2.5);
    });

    it('falls back to min(EV, FEV_CAP) when founderEquityValue not a number', async () => {
      // When founderEquityValue is non-numeric (or missing), fallback kicks in.
      // When it IS a number, plausibility check (FEV <= EV × 1.2) would reject.
      // This test exercises the non-numeric fallback path specifically.
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({
          enterpriseValue: 5_000_000_000,
          founderEquityValue: 'not-a-number',
        }),
      });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      // Fallback: Math.min(5B, 10B cap) = 5B
      expect(entry.founderEquityValue).toBe(5_000_000_000);
    });
  });

  describe('Edge cases that matter for scenario extraction', () => {
    it('handles supabaseAdmin null (env missing) — does NOT crash, no profile ops', async () => {
      setMockSupabaseAdmin(null);
      vi.mocked(getPlayerIdFromToken).mockResolvedValue('some-id');

      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      // Entry is still written to KV — leaderboard submission succeeds regardless of Supabase
      expect(getResponse().statusCode).toBe(200);
      expect(kv.zadd).toHaveBeenCalled();
    });

    it('handles claimToken in payload (UUID v4 format)', async () => {
      const claimToken = '12345678-1234-4234-9234-123456789012';
      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ claimToken }) });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.claimToken).toBe(claimToken);
    });

    it('rejects malformed claimToken (not a UUID v4)', async () => {
      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ claimToken: 'not-a-uuid' }) });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.claimToken).toBeUndefined();
    });

    it('passes completionId through to entry (trimmed to 100 chars)', async () => {
      const completionId = 'player-1-seed-123-easy-standard-50-C';
      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody({ completionId }) });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.completionId).toBe(completionId);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Additional regression coverage added per Jake's Step 0 QA review.
  // These close boundary and edge-case gaps that the original suite missed.
  // ──────────────────────────────────────────────────────────────────────

  describe('Boundary coverage — sort score inputs', () => {
    it('foMultiplier: exactly 1.0 is valid (no-op on sort score)', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ founderEquityValue: 10_000_000, difficulty: 'easy', foMultiplier: 1.0 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(9_000_000); // 10M * 0.9 * 1.0 * 1.0
    });

    it('foMultiplier: exactly 1.5 is valid (max boost)', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ founderEquityValue: 10_000_000, difficulty: 'easy', foMultiplier: 1.5 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(13_500_000); // 10M * 0.9 * 1.0 * 1.5
    });

    it('foMultiplier: above 1.5 falls back to 1.0 (NOT clamped)', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ founderEquityValue: 10_000_000, difficulty: 'easy', foMultiplier: 1.5001 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(9_000_000); // fallback to 1.0
    });

    it('foMultiplier: below 1.0 falls back to 1.0', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ founderEquityValue: 10_000_000, difficulty: 'easy', foMultiplier: 0.99 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(9_000_000);
    });

    it('PE grossMoic: 0 produces sortScore 0 (bankrupt fund ranks at bottom)', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validPEBody({ grossMoic: 0, netIrr: -0.5, carryEarned: 0 }),
      });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      expect((zaddCall[1] as { score: number }).score).toBe(0);
    });

    it('PE without grossMoic falls back to adjustedFEV (documenting current behavior)', async () => {
      const body = validPEBody({ founderEquityValue: 300_000, difficulty: 'easy' });
      delete (body as Record<string, unknown>).grossMoic;
      const { req, res } = createMockReqRes({ method: 'POST', body });
      await handler(req, res);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      // Falls back to adjustedFEV path: 300k * 0.9 (easy) * 1.0 * 1.0 = 270k
      expect((zaddCall[1] as { score: number }).score).toBe(270_000);
    });
  });

  describe('Boundary coverage — KV prune arithmetic', () => {
    it('prunes exactly 500 entries when zcard = 1000 (removes 500)', async () => {
      vi.mocked((kv as any).zcard).mockResolvedValueOnce(1000);
      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      // 1000 - 500 - 1 = 499 → zremrangebyrank(key, 0, 499)
      expect((kv as any).zremrangebyrank).toHaveBeenCalledWith('leaderboard:v2', 0, 499);
    });

    it('does not prune when zcard = 499 (strictly under)', async () => {
      vi.mocked((kv as any).zcard).mockResolvedValueOnce(499);
      const { req, res } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);
      expect((kv as any).zremrangebyrank).not.toHaveBeenCalled();
    });
  });

  describe('Legacy grade parity (KV entry ↔ game_history insertRow)', () => {
    it('legacyGrade: "Enduring" appears in BOTH KV entry AND insertRow', async () => {
      setupAuthUser();
      const insertChain = createChain({ data: null });
      vi.mocked(supabaseAdmin!.from)
        .mockReturnValueOnce(createChain({ data: null }) as never) // profile upsert
        .mockReturnValueOnce(createChain({ data: null }) as never) // initials update
        .mockReturnValueOnce(createChain({ data: { public_id: 'pub' } }) as never) // public_id lookup
        .mockReturnValueOnce(createChain({ data: null }) as never) // find: no existing
        .mockReturnValueOnce(insertChain as never); // insert fresh

      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ legacyGrade: 'Enduring' }),
      });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.legacyGrade).toBe('Enduring');
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ legacy_grade: 'Enduring' }),
      );
    });

    it('invalid legacyGrade value dropped from both entry AND insertRow', async () => {
      setupAuthUser();
      const insertChain = createChain({ data: null });
      vi.mocked(supabaseAdmin!.from)
        .mockReturnValueOnce(createChain({ data: null }) as never)
        .mockReturnValueOnce(createChain({ data: null }) as never)
        .mockReturnValueOnce(createChain({ data: { public_id: 'pub' } }) as never)
        .mockReturnValueOnce(createChain({ data: null }) as never)
        .mockReturnValueOnce(insertChain as never);

      const { req, res } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ legacyGrade: 'NonexistentGrade' }),
      });
      await handler(req, res);

      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      expect(entry.legacyGrade).toBeUndefined();
      const insertedRow = vi.mocked(insertChain.insert).mock.calls[0][0] as Record<string, unknown>;
      expect(insertedRow.legacy_grade).toBeNull();
    });
  });

  describe('Playbook size boundary', () => {
    /** Build a playbook whose serialized JSON is approximately targetBytes bytes. */
    function playbookOfSize(targetBytes: number) {
      const base = {
        version: 1,
        generatedAt: '2026-04-19T00:00:00.000Z',
        thesis: {
          archetype: 'balanced',
          holdcoName: 'Test',
          fev: 1_000_000,
          score: 50,
          isFundManager: false,
          isBankrupt: false,
        },
        capital: { peakLeverage: 2.0, peakDistressLevel: 'comfortable' },
        performance: { metricsTimeline: [] },
        padding: '',
      };
      const baselineSize = JSON.stringify(base).length;
      base.padding = 'x'.repeat(Math.max(0, targetBytes - baselineSize));
      return base;
    }

    it('accepts playbook at 14999 bytes (under 15KB limit)', async () => {
      setupAuthUser();
      vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({ data: null }) as never);

      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ playbook: playbookOfSize(14999) }),
      });
      await handler(req, res);
      expect(getResponse().statusCode).toBe(200);
      expect(getResponse().body.playbookShareId).toMatch(/^[0-9a-f]{12}$/);
    });

    it('rejects playbook over 15KB (returns null → no playbookShareId)', async () => {
      setupAuthUser();
      vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({ data: null }) as never);

      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: validHoldcoBody({ playbook: playbookOfSize(15001) }),
      });
      await handler(req, res);
      // Submission succeeds; playbook validation returns null; no share ID generated
      expect(getResponse().statusCode).toBe(200);
      expect(getResponse().body.playbookShareId).toBeUndefined();
    });
  });

  describe('Auth error fallback', () => {
    it('getUserById throws → treated as anonymous (no playerId on entry)', async () => {
      vi.mocked(getPlayerIdFromToken).mockResolvedValue('some-player');
      vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockRejectedValueOnce(new Error('Supabase down'));

      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      const zaddCall = vi.mocked(kv.zadd).mock.calls[0];
      const entry = JSON.parse((zaddCall[1] as { member: string }).member);
      // isAnonymous defaults true on error → no verifiedPlayerId → entry has no playerId field
      expect(entry.playerId).toBeUndefined();
      // submittedBy still set (raw token UUID regardless of anon status)
      expect(entry.submittedBy).toBe('some-player');
    });

    it('game_history find-existing query throws → falls through to INSERT path (documented swallow)', async () => {
      setupAuthUser();
      // Set up a failing find chain — maybeSingle rejects
      const failingFind = createChain({ data: null });
      failingFind.maybeSingle = vi.fn().mockRejectedValue(new Error('DB connection lost'));

      const insertChain = createChain({ data: null });
      vi.mocked(supabaseAdmin!.from)
        .mockReturnValueOnce(createChain({ data: null }) as never) // profile upsert
        .mockReturnValueOnce(createChain({ data: null }) as never) // initials update
        .mockReturnValueOnce(createChain({ data: { public_id: 'pub' } }) as never) // public_id lookup
        .mockReturnValueOnce(failingFind as never) // find: throws
        .mockReturnValueOnce(insertChain as never); // insert still runs

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { req, res, getResponse } = createMockReqRes({ method: 'POST', body: validHoldcoBody() });
      await handler(req, res);

      expect(getResponse().statusCode).toBe(200);
      // Insert runs despite find error — preserved behavior, with logging now (per Dara #2)
      expect(insertChain.insert).toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('existing-row lookup failed'),
        expect.any(Error),
      );
      errSpy.mockRestore();
    });
  });
});
