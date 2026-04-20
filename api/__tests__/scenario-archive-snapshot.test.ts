/**
 * Tests for the scheduled scenario archive snapshot cron.
 * Verifies auth, idempotency, the "only snapshot near KV expiry" rule, and the
 * list-pruning behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReqRes } from './helpers.js';
import { setMockSupabaseAdmin } from './setup.js';
import { kv } from '@vercel/kv';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import handler from '../cron/scenario-archive-snapshot.js';
import { SCENARIO_KV_TTL_PAST_END_SECONDS } from '../_lib/leaderboard.js';

const VALID_AUTH = { authorization: 'Bearer test-cron-secret' };

function mkConfig(id: string, endDateIso: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Scenario ${id}`,
    tagline: 'T',
    theme: { emoji: '🧪', color: '#F59E0B' },
    startDate: '2020-01-01T00:00:00Z',
    endDate: endDateIso,
    difficulty: 'easy',
    duration: 'standard',
    maxRounds: 20,
    rankingMetric: 'fev',
    isActive: false,
    isFeatured: false,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
});

describe('cron /api/cron/scenario-archive-snapshot', () => {
  it('rejects missing or wrong bearer', async () => {
    const a = createMockReqRes({ method: 'POST', headers: {} });
    await handler(a.req, a.res);
    expect(a.getResponse().statusCode).toBe(401);

    const b = createMockReqRes({ method: 'POST', headers: { authorization: 'Bearer wrong' } });
    await handler(b.req, b.res);
    expect(b.getResponse().statusCode).toBe(401);
  });

  it('returns 500 when supabaseAdmin not configured', async () => {
    setMockSupabaseAdmin(null);
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', headers: VALID_AUTH });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(500);
  });

  it('returns empty-stats when archive list is empty', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null as never); // scenarios:archive
    const { req, res, getResponse } = createMockReqRes({ method: 'POST', headers: VALID_AUTH });
    await handler(req, res);
    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body).toMatchObject({ snapshotted: 0, skipped: 0, checked: 0 });
  });

  it('skips scenarios still far from KV expiry', async () => {
    // Scenario ended 30 days ago — well within TTL (180d), should skip.
    const endedRecently = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['recent-1'] as never) // scenarios:archive
      .mockResolvedValueOnce(mkConfig('recent-1', endedRecently) as never);

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', headers: VALID_AUTH });
    await handler(req, res);

    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body).toMatchObject({ snapshotted: 0, skipped: 1 });
  });

  it('snapshots scenarios within expiry buffer and prunes archive list', async () => {
    // Scenario ended just past (TTL - 5 days) — within the 10-day buffer, snapshot.
    const cutoffDays = (SCENARIO_KV_TTL_PAST_END_SECONDS / 86400) - 5;
    const endedLongAgo = new Date(Date.now() - cutoffDays * 86400 * 1000).toISOString();

    vi.mocked(kv.get)
      .mockResolvedValueOnce(['old-1'] as never) // scenarios:archive read
      .mockResolvedValueOnce(mkConfig('old-1', endedLongAgo) as never) // config
      .mockResolvedValueOnce(['old-1'] as never); // scenarios:archive re-read for prune

    vi.mocked((kv as unknown as { zcard: ReturnType<typeof vi.fn> }).zcard).mockResolvedValue(2);
    vi.mocked((kv as unknown as { zrange: ReturnType<typeof vi.fn> }).zrange).mockResolvedValue([
      JSON.stringify({ id: 'e1', holdcoName: 'P1', initials: 'AB', founderEquityValue: 5000 }),
      5000,
      JSON.stringify({ id: 'e2', holdcoName: 'P2', initials: 'CD', founderEquityValue: 3000 }),
      3000,
    ]);

    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
    (supabaseAdmin as unknown as { from: typeof fromMock }).from = fromMock;

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', headers: VALID_AUTH });
    await handler(req, res);

    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body).toMatchObject({ snapshotted: 1, skipped: 0 });
    expect(upsertMock).toHaveBeenCalledOnce();
    const [payload, opts] = upsertMock.mock.calls[0];
    expect(payload.scenario_id).toBe('old-1');
    expect(payload.entry_count).toBe(2);
    expect(payload.top_score).toBe(5000);
    expect((payload.final_leaderboard_json as unknown[]).length).toBe(2);
    expect(opts).toEqual({ onConflict: 'scenario_id' });

    // KV archive list should have had the snapshotted id pruned.
    expect(vi.mocked(kv.set)).toHaveBeenCalledWith(
      'scenarios:archive',
      expect.stringContaining('[]'),
    );
  });

  it('drops admin-preview entries from the snapshot', async () => {
    const cutoffDays = (SCENARIO_KV_TTL_PAST_END_SECONDS / 86400) - 5;
    const endedLongAgo = new Date(Date.now() - cutoffDays * 86400 * 1000).toISOString();

    vi.mocked(kv.get)
      .mockResolvedValueOnce(['old-2'] as never)
      .mockResolvedValueOnce(mkConfig('old-2', endedLongAgo) as never)
      .mockResolvedValueOnce(['old-2'] as never);

    vi.mocked((kv as unknown as { zcard: ReturnType<typeof vi.fn> }).zcard).mockResolvedValue(3);
    vi.mocked((kv as unknown as { zrange: ReturnType<typeof vi.fn> }).zrange).mockResolvedValue([
      JSON.stringify({ id: 'real', initials: 'AA', founderEquityValue: 1000 }),
      1000,
      JSON.stringify({ id: 'preview', initials: 'ZZ', isAdminPreview: true, founderEquityValue: 9999 }),
      9999,
      JSON.stringify({ id: 'real2', initials: 'BB', founderEquityValue: 500 }),
      500,
    ]);

    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    (supabaseAdmin as unknown as { from: ReturnType<typeof vi.fn> }).from = vi.fn().mockReturnValue({ upsert: upsertMock });

    const { req, res } = createMockReqRes({ method: 'POST', headers: VALID_AUTH });
    await handler(req, res);

    const payload = upsertMock.mock.calls[0][0];
    const entries = payload.final_leaderboard_json as Array<Record<string, unknown>>;
    // admin-preview filtered out, two real entries remain
    expect(entries.length).toBe(2);
    expect(entries.every(e => !e.isAdminPreview)).toBe(true);
  });

  it('prunes ids with already-dead KV config (orphans in archive list)', async () => {
    vi.mocked(kv.get)
      .mockResolvedValueOnce(['orphan'] as never) // scenarios:archive
      .mockResolvedValueOnce(null as never)       // config missing
      .mockResolvedValueOnce(['orphan'] as never); // re-read for prune

    const { req, res, getResponse } = createMockReqRes({ method: 'POST', headers: VALID_AUTH });
    await handler(req, res);

    expect(getResponse().statusCode).toBe(200);
    expect(getResponse().body).toMatchObject({ snapshotted: 0, skipped: 1 });
    // Orphan id should be removed from archive list even though no Postgres row was written
    expect(vi.mocked(kv.set)).toHaveBeenCalledWith('scenarios:archive', expect.stringContaining('[]'));
  });
});
