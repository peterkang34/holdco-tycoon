/**
 * Phase 0 instrumentation: scenario-challenge plays get their own telemetry counters
 * (t:scenario:{month}:started / :completed) and must NOT inflate the peer-to-peer
 * challenge k-factor (t:challenge:{month}:*), even though they send isChallenge=true.
 * gameMode='scenario_challenge' is the discriminator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kv } from '@vercel/kv';
import { createMockReqRes } from './helpers.js';
import handler from '../telemetry/event.js';

// Capturing pipeline: records incr() keys; every other method is a chainable no-op.
function makeCapturingPipeline() {
  const incrKeys: string[] = [];
  const pipe: any = { _incrKeys: incrKeys };
  const chain = () => pipe;
  pipe.incr = (k: string) => { incrKeys.push(k); return pipe; };
  for (const m of ['set', 'hincrby', 'sadd', 'lpush', 'ltrim', 'expire', 'zadd', 'hset']) {
    pipe[m] = chain;
  }
  pipe.exec = vi.fn().mockResolvedValue([]);
  return pipe;
}

beforeEach(() => {
  vi.mocked(kv.get).mockResolvedValue(null as never); // seen-dedup: not seen
  vi.mocked(kv.incr).mockResolvedValue(1); // rate-limit counter
});

const startBody = (over: Record<string, unknown>) => ({
  event: 'game_start', difficulty: 'normal', duration: 'quick',
  sector: 'agency', sessionId: 's-1', isChallenge: true, ...over,
});
const completeBody = (over: Record<string, unknown>) => ({
  event: 'game_complete', difficulty: 'normal', duration: 'quick',
  round: 10, grade: 'A', fev: 5000, isChallenge: true, ...over,
});

describe('scenario vs challenge telemetry counters', () => {
  it('game_start scenario play → t:scenario:*:started, NOT t:challenge:*:started', async () => {
    const pipe = makeCapturingPipeline();
    vi.mocked((kv as any).pipeline).mockReturnValue(pipe);
    const { req, res } = createMockReqRes({ method: 'POST', body: startBody({ gameMode: 'scenario_challenge' }) });
    await handler(req, res);
    expect(pipe._incrKeys.some((k: string) => /^t:scenario:.+:started$/.test(k))).toBe(true);
    expect(pipe._incrKeys.some((k: string) => /^t:challenge:.+:started$/.test(k))).toBe(false);
  });

  it('game_start real peer challenge (no gameMode) → t:challenge:*:started, NOT t:scenario', async () => {
    const pipe = makeCapturingPipeline();
    vi.mocked((kv as any).pipeline).mockReturnValue(pipe);
    const { req, res } = createMockReqRes({ method: 'POST', body: startBody({}) });
    await handler(req, res);
    expect(pipe._incrKeys.some((k: string) => /^t:challenge:.+:started$/.test(k))).toBe(true);
    expect(pipe._incrKeys.some((k: string) => /^t:scenario:.+:started$/.test(k))).toBe(false);
  });

  it('game_complete scenario play → t:scenario:*:completed, NOT t:challenge:*:completed', async () => {
    const pipe = makeCapturingPipeline();
    vi.mocked((kv as any).pipeline).mockReturnValue(pipe);
    const { req, res } = createMockReqRes({ method: 'POST', body: completeBody({ gameMode: 'scenario_challenge' }) });
    await handler(req, res);
    expect(pipe._incrKeys.some((k: string) => /^t:scenario:.+:completed$/.test(k))).toBe(true);
    expect(pipe._incrKeys.some((k: string) => /^t:challenge:.+:completed$/.test(k))).toBe(false);
  });
});
