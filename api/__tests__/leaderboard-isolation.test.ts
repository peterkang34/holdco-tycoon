/**
 * Tests for the scenario isolation guard on POST /api/leaderboard/submit.
 *
 * Per plan Section 4: scenario completions must use
 * `/api/scenario-challenges/submit`, never the global leaderboard. This
 * guard is defense-in-depth — client-side routing should prevent it
 * entirely, but if a scenario payload reaches this endpoint, fail loud.
 */

import { describe, it, expect } from 'vitest';
import globalSubmit from '../leaderboard/submit.js';
import { createMockReqRes } from './helpers.js';

describe('Scenario isolation — global leaderboard rejects scenario payloads', () => {
  it('returns 400 when scenarioChallengeId is present', async () => {
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: {
        scenarioChallengeId: 'recession-gauntlet',
        holdcoName: 'X',
        initials: 'XX',
        enterpriseValue: 1_000_000,
        score: 50,
        grade: 'C',
        businessCount: 3,
        totalRounds: 10,
        difficulty: 'easy',
        duration: 'quick',
      },
    });
    await globalSubmit(req, res);
    const { statusCode, body } = getResponse();
    expect(statusCode).toBe(400);
    expect(body.error).toMatch(/scenario-challenges\/submit/);
  });

  it('empty string scenarioChallengeId does NOT trigger the guard (treated as absent)', async () => {
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: {
        scenarioChallengeId: '', // falsy — not a real scenario tag
        holdcoName: 'X',
        initials: 'XX',
        enterpriseValue: 1_000_000,
        score: 50,
        grade: 'C',
        businessCount: 3,
        totalRounds: 10,
        difficulty: 'easy',
        duration: 'quick',
      },
    });
    await globalSubmit(req, res);
    // Passes the isolation guard, then hits validation (happens to succeed / 200).
    // We only assert it's NOT the 400 from the scenario guard itself.
    expect(getResponse().statusCode).not.toBe(400);
  });

  it('missing scenarioChallengeId (normal holdco submission) passes the guard', async () => {
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: {
        holdcoName: 'X',
        initials: 'XX',
        enterpriseValue: 1_000_000,
        score: 50,
        grade: 'C',
        businessCount: 3,
        totalRounds: 10,
        difficulty: 'easy',
        duration: 'quick',
      },
    });
    await globalSubmit(req, res);
    expect(getResponse().statusCode).not.toBe(400);
  });
});
