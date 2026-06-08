/**
 * GET /api/player/scenario-records — the signed-in player's per-scenario record.
 * Verifies: verified-account gate (401 anon), per-scenario grouping (attempts /
 * best), scenario+admin-preview row filters are applied, and KV rank enrichment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../player/scenario-records.js';
import { createMockReqRes, createChain } from './helpers.js';
import { getPlayerIdFromToken } from '../_lib/playerAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { kv } from '@vercel/kv';

function setupVerified(playerId = 'p1') {
  vi.mocked(getPlayerIdFromToken).mockResolvedValue(playerId);
  vi.mocked(supabaseAdmin!.auth.admin.getUserById).mockResolvedValue({
    data: { user: { id: playerId, is_anonymous: false } }, error: null,
  } as never);
}

const row = (over: Record<string, unknown> = {}) => ({
  scenario_challenge_id: 'a', score: 70, founder_equity_value: 5_000_000,
  completed_at: '2026-05-01T00:00:00Z', ...over,
});

describe('GET /api/player/scenario-records', () => {
  beforeEach(() => setupVerified());

  it('returns 401 for an anonymous / token-less request', async () => {
    vi.mocked(getPlayerIdFromToken).mockResolvedValue(null);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(401);
  });

  it('groups rows by scenario: attempts + best score/FEV + last played', async () => {
    vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({
      data: [
        row({ scenario_challenge_id: 'a', score: 50, founder_equity_value: 3_000_000, completed_at: '2026-05-01T00:00:00Z' }),
        row({ scenario_challenge_id: 'a', score: 80, founder_equity_value: 7_000_000, completed_at: '2026-05-03T00:00:00Z' }),
        row({ scenario_challenge_id: 'a', score: 70, founder_equity_value: 5_000_000, completed_at: '2026-05-02T00:00:00Z' }),
        row({ scenario_challenge_id: 'b', score: 90, founder_equity_value: 9_000_000, completed_at: '2026-04-01T00:00:00Z' }),
      ],
      error: null,
    }) as never);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(200);
    expect(body.isLoggedIn).toBe(true);
    const a = body.records.find((r: { scenarioId: string }) => r.scenarioId === 'a');
    expect(a.attempts).toBe(3);
    expect(a.bestScore).toBe(80);
    expect(a.bestRawFev).toBe(7_000_000);
    expect(a.lastPlayedAt).toBe('2026-05-03T00:00:00Z');
    expect(body.records).toHaveLength(2);
  });

  it('applies the scenario + admin-preview filters to the query', async () => {
    const chain = createChain({ data: [row()], error: null });
    vi.mocked(supabaseAdmin!.from).mockReturnValue(chain as never);
    const { req, res } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    // scenario rows only (scenario_challenge_id NOT NULL), exclude admin-preview.
    expect(chain.not).toHaveBeenCalledWith('scenario_challenge_id', 'is', null);
    expect(chain.not).toHaveBeenCalledWith('is_admin_preview', 'is', true);
  });

  it('enriches bestRank by finding the player in the KV sorted set (skips admin-preview)', async () => {
    vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({ data: [row({ scenario_challenge_id: 'a' })], error: null }) as never);
    // rev-ordered: [#1 other, #(preview skipped), #2 = us]. zrange returns [member, score, ...].
    vi.mocked((kv as unknown as { zcard: ReturnType<typeof vi.fn> }).zcard).mockResolvedValue(3);
    vi.mocked((kv as unknown as { zrange: ReturnType<typeof vi.fn> }).zrange).mockResolvedValue([
      JSON.stringify({ playerId: 'other' }), 9_000_000,
      JSON.stringify({ playerId: 'admin', isAdminPreview: true }), 8_000_000,
      JSON.stringify({ playerId: 'p1' }), 5_000_000,
    ]);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    const a = getResponse().body.records.find((r: { scenarioId: string }) => r.scenarioId === 'a');
    expect(a.bestRank).toBe(2);            // #1 other, preview skipped, #2 us
    expect(a.bestRankingValue).toBe(5_000_000);
    expect(a.entryCount).toBe(3);
  });

  it('bestRank null when the player is not in the top-500 set', async () => {
    vi.mocked(supabaseAdmin!.from).mockReturnValue(createChain({ data: [row({ scenario_challenge_id: 'a' })], error: null }) as never);
    vi.mocked((kv as unknown as { zcard: ReturnType<typeof vi.fn> }).zcard).mockResolvedValue(1);
    vi.mocked((kv as unknown as { zrange: ReturnType<typeof vi.fn> }).zrange).mockResolvedValue([
      JSON.stringify({ playerId: 'someone-else' }), 9_000_000,
    ]);
    const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    const a = getResponse().body.records.find((r: { scenarioId: string }) => r.scenarioId === 'a');
    expect(a.bestRank).toBeNull();
  });
});
