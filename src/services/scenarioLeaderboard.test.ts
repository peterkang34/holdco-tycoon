/**
 * Unit tests for the scenario-leaderboard client helpers.
 *
 * The risky logic here is `formatRankingMetric` — it mirrors the server's
 * `computeSortScore` scaling (see api/scenario-challenges/submit.ts) so the KV
 * sort score can be rendered back as the human-readable metric value. Any
 * divergence between the two functions breaks the Scenarios tab + game-over
 * result section silently.
 *
 * The fetch wrappers are tested for their error surface only — they're thin
 * enough that asserting the URL shape + error throw is enough signal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatRankingMetric,
  fetchScenarioLeaderboard,
  fetchScenarioList,
  submitScenarioChallenge,
  type ScenarioSubmitPayload,
} from './scenarioLeaderboard';

vi.mock('../lib/supabase', () => ({
  getAccessToken: vi.fn(async () => null),
}));

// ── formatRankingMetric ──────────────────────────────────────────

describe('formatRankingMetric', () => {
  describe('fev', () => {
    it('uses founderEquityValue when provided', () => {
      expect(formatRankingMetric('fev', { founderEquityValue: 5_000_000 }).display).toBe('$5.0B');
    });
    it('falls back to sortScore (same scale)', () => {
      expect(formatRankingMetric('fev', { sortScore: 5_000_000 }).display).toBe('$5.0B');
    });
    it('returns dash when both missing', () => {
      expect(formatRankingMetric('fev', {}).display).toBe('—');
    });
    it('labels as Adj FEV', () => {
      expect(formatRankingMetric('fev', {}).label).toBe('Adj FEV');
    });
  });

  describe('moic', () => {
    it('uses grossMoic directly (2 decimal x)', () => {
      expect(formatRankingMetric('moic', { grossMoic: 2.5 }).display).toBe('2.50x');
    });
    it('inverts sortScore scaling (/100_000)', () => {
      expect(formatRankingMetric('moic', { sortScore: 250_000 }).display).toBe('2.50x');
    });
    it('labels as MOIC', () => {
      expect(formatRankingMetric('moic', { grossMoic: 1 }).label).toBe('MOIC');
    });
  });

  describe('cashOnCash', () => {
    it('shares MOIC scaling with a different label', () => {
      const m = formatRankingMetric('cashOnCash', { sortScore: 180_000 });
      expect(m.display).toBe('1.80x');
      expect(m.label).toBe('Cash-on-Cash');
    });
  });

  describe('irr', () => {
    it('uses netIrr directly as percent', () => {
      expect(formatRankingMetric('irr', { netIrr: 0.225 }).display).toBe('22.5%');
    });
    it('inverts sortScore scaling (/1_000_000 → ×100 for %)', () => {
      expect(formatRankingMetric('irr', { sortScore: 225_000 }).display).toBe('22.5%');
    });
    it('labels as Net IRR', () => {
      expect(formatRankingMetric('irr', { netIrr: 0 }).label).toBe('Net IRR');
    });
    it('returns dash when no inputs', () => {
      expect(formatRankingMetric('irr', {}).display).toBe('—');
    });
  });

  describe('gpCarry', () => {
    it('formats carryEarned as money ($K scale)', () => {
      expect(formatRankingMetric('gpCarry', { carryEarned: 500 }).display).toBe('$500k');
    });
    it('falls back to sortScore at same scale', () => {
      expect(formatRankingMetric('gpCarry', { sortScore: 2_500 }).display).toBe('$2.5M');
    });
  });

  it('returns dash for unknown metric without throwing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatRankingMetric('nonsense' as any, { sortScore: 100 }).display).toBe('—');
  });

  it('numeric field survives the round-trip for charting/sorting', () => {
    expect(formatRankingMetric('moic', { grossMoic: 3.1 }).numeric).toBe(3.1);
    expect(formatRankingMetric('irr', { netIrr: 0.22 }).numeric).toBe(0.22);
    expect(formatRankingMetric('fev', { founderEquityValue: 1000 }).numeric).toBe(1000);
  });
});

// ── fetch wrappers ────────────────────────────────────────────

describe('fetchScenarioLeaderboard', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('includes slug + limit in URL and parses response', async () => {
    const payload = { scenario: { id: 'x', name: 'X', rankingMetric: 'fev', entryCount: 0 }, entries: [] };
    fetchMock.mockResolvedValue({ ok: true, json: async () => payload });
    const res = await fetchScenarioLeaderboard('recession-gauntlet', 25);
    expect(res).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/scenario-challenges/leaderboard?id=recession-gauntlet&limit=25');
  });

  it('throws with server error message on non-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Scenario not found' }) });
    await expect(fetchScenarioLeaderboard('missing')).rejects.toThrow('Scenario not found');
  });

  it('throws generic message when server body is malformed', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('bad json'); } });
    await expect(fetchScenarioLeaderboard('x')).rejects.toThrow(/500/);
  });
});

describe('fetchScenarioList', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns the list payload as-is', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ active: [], archived: [] }) });
    const res = await fetchScenarioList();
    expect(res).toEqual({ active: [], archived: [] });
  });

  it('throws on non-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'DB down' }) });
    await expect(fetchScenarioList()).rejects.toThrow('DB down');
  });
});

describe('submitScenarioChallenge', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const basePayload: ScenarioSubmitPayload = {
    scenarioChallengeId: 'recession-gauntlet',
    holdcoName: 'Acme',
    initials: 'AB',
    enterpriseValue: 100_000,
    founderEquityValue: 50_000,
    founderPersonalWealth: 0,
    score: 72,
    grade: 'B',
    businessCount: 3,
    totalRounds: 15,
    difficulty: 'easy',
    duration: 'standard',
  };
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('POSTs to submit endpoint with JSON body', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, id: 'e1', rank: 5 }) });
    const res = await submitScenarioChallenge(basePayload);
    expect(res).toEqual({ success: true, id: 'e1', rank: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/scenario-challenges/submit',
      expect.objectContaining({ method: 'POST' }),
    );
    const call = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(call.body as string)).toMatchObject({
      scenarioChallengeId: 'recession-gauntlet',
      initials: 'AB',
    });
  });

  it('relays admin preview flag', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, previewed: true }) });
    const res = await submitScenarioChallenge({ ...basePayload, isAdminPreview: true });
    expect(res.previewed).toBe(true);
    const call = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(call.body as string).isAdminPreview).toBe(true);
  });

  it('throws on rate-limit 429', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: 'Rate limited. One submission per 60 seconds.' }),
    });
    await expect(submitScenarioChallenge(basePayload)).rejects.toThrow(/Rate limited/);
  });

  it('throws on 410 (scenario ended)', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 410,
      json: async () => ({ error: 'Scenario ended more than 24h ago — submissions closed' }),
    });
    await expect(submitScenarioChallenge(basePayload)).rejects.toThrow(/submissions closed/);
  });
});
