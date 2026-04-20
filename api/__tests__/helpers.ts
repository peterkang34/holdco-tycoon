import { vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Creates mock VercelRequest / VercelResponse objects with captured output.
 */
export function createMockReqRes(overrides: {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[]>;
} = {}) {
  let statusCode = 200;
  let responseBody: unknown = null;
  const responseHeaders: Record<string, string> = {};

  const res = {
    status: vi.fn(function (code: number) {
      statusCode = code;
      return res;
    }),
    json: vi.fn(function (data: unknown) {
      responseBody = data;
      return res;
    }),
    setHeader: vi.fn(function (key: string, val: string) {
      responseHeaders[key] = val;
      return res;
    }),
  } as unknown as VercelResponse;

  const req = {
    method: overrides.method ?? 'GET',
    headers: overrides.headers ?? {},
    body: overrides.body ?? null,
    query: overrides.query ?? {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as VercelRequest;

  return {
    req,
    res,
    getResponse: () => ({
      statusCode,
      body: responseBody as Record<string, unknown>,
      headers: responseHeaders,
    }),
  };
}

/**
 * Creates a chainable Supabase query builder mock.
 * Terminal methods (.single(), .maybeSingle()) return the result as a promise.
 * Awaiting the chain directly (no terminal) also returns the result via .then().
 */
export function createChain(result: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};

  // Chainable methods return chain
  for (const method of ['select', 'eq', 'neq', 'is', 'order', 'range', 'limit', 'in', 'gt', 'lt', 'gte', 'lte']) {
    chain[method] = vi.fn(() => chain);
  }

  // Terminal methods return the result as a promise
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);

  // Mutation methods return result
  chain.insert = vi.fn(async () => result);
  chain.upsert = vi.fn(async () => result);
  chain.update = vi.fn(() => {
    const updateChain: Record<string, unknown> = {};
    updateChain.eq = vi.fn(async () => result);
    updateChain.then = (resolve: (v: unknown) => void) => resolve(result);
    return updateChain;
  });
  chain.delete = vi.fn(() => {
    const deleteChain: Record<string, unknown> = {};
    deleteChain.eq = vi.fn(async () => result);
    deleteChain.then = (resolve: (v: unknown) => void) => resolve(result);
    return deleteChain;
  });

  // Make chain thenable for `await supabase.from(...).select(...).eq(...)`
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    try {
      resolve(result);
    } catch (e) {
      if (reject) reject(e);
      else throw e;
    }
  };

  // Direct property access
  chain.data = result.data ?? null;
  chain.error = result.error ?? null;
  chain.count = result.count;

  return chain;
}

/** Factory for game_history row data. */
export function createGameHistoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'game-1',
    player_id: 'test-player-id',
    holdco_name: 'Test Holdings',
    initials: 'TH',
    difficulty: 'easy',
    duration: 'standard',
    enterprise_value: 10000000,
    founder_equity_value: 8000000,
    adjusted_fev: 5000000,
    score: 65,
    grade: 'B',
    business_count: 3,
    has_restructured: false,
    family_office_completed: false,
    strategy: null,
    completed_at: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

/** Factory for KV leaderboard entry data. */
export function createKvLeaderboardEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    holdcoName: 'Test Holdings',
    initials: 'TH',
    score: 65,
    grade: 'B',
    difficulty: 'easy',
    duration: 'standard',
    claimToken: 'test-token-123',
    playerId: null as string | null,
    date: '2026-01-15T00:00:00Z',
    enterpriseValue: 10000000,
    founderEquityValue: 8000000,
    businessCount: 3,
    ...overrides,
  };
}
