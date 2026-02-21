/**
 * Challenge Routing Logic Tests
 *
 * Tests the URL routing decision logic from App.tsx (lines 59-87) as pure
 * boolean expressions, plus encoding/decoding round-trips from challenge.ts.
 *
 * Bug context: completed games (gameOver: true) were blocking new challenge
 * links because the guard used `holdcoName && round > 0` instead of
 * `holdcoName && round > 0 && !gameOver`.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeChallengeParams,
  decodeChallengeParams,
  encodePlayerResult,
  decodePlayerResult,
  type ChallengeParams,
  type PlayerResult,
} from '../../utils/challenge';

// ── Routing Decision Logic (extracted from App.tsx) ─────────────────
//
// The App.tsx useEffect does:
//   1. If ?s= present → scoreboard screen (takes precedence, always)
//   2. If ?c= present:
//      a. hasActiveGame = holdcoName && round > 0 && !gameOver
//      b. seedMatches  = hasActiveGame && seed === challenge.seed
//      c. If hasActiveGame && !seedMatches → REJECT (clean URL, keep game)
//      d. Otherwise → ACCEPT (set challengeData)
//
// We model this as a pure function for testability.

interface GameState {
  holdcoName: string;
  round: number;
  gameOver: boolean;
  seed: number;
}

interface RoutingInput {
  gameState: GameState;
  challengeUrl: ChallengeParams | null;  // parsed ?c= param
  scoreboardUrl: ChallengeParams | null; // parsed ?s= param
}

type RoutingResult =
  | { action: 'scoreboard'; params: ChallengeParams }
  | { action: 'accept_challenge'; challenge: ChallengeParams }
  | { action: 'reject_challenge' }  // active game with different seed
  | { action: 'no_url' };           // no challenge or scoreboard URL

/**
 * Pure function that mirrors the routing logic in App.tsx useEffect (lines 59-87).
 * This is the TESTABLE extraction of the decision tree.
 */
function routeChallengeUrl(input: RoutingInput): RoutingResult {
  // Step 1: Scoreboard takes precedence (checked before challenge)
  if (input.scoreboardUrl) {
    return { action: 'scoreboard', params: input.scoreboardUrl };
  }

  // Step 2: No challenge URL → nothing to do
  if (!input.challengeUrl) {
    return { action: 'no_url' };
  }

  // Step 3: Challenge URL present — check for active game conflict
  const { holdcoName, round, gameOver, seed } = input.gameState;
  const hasActiveGame = holdcoName && round > 0 && !gameOver;
  const seedMatches = hasActiveGame && seed === input.challengeUrl.seed;

  if (hasActiveGame && !seedMatches) {
    return { action: 'reject_challenge' };
  }

  return { action: 'accept_challenge', challenge: input.challengeUrl };
}

// ── Test Helpers ────────────────────────────────────────────────────

const EMPTY_GAME: GameState = { holdcoName: '', round: 0, gameOver: false, seed: 0 };

const ACTIVE_GAME: GameState = {
  holdcoName: 'Acme Holdings',
  round: 5,
  gameOver: false,
  seed: 12345,
};

const COMPLETED_GAME: GameState = {
  holdcoName: 'Acme Holdings',
  round: 20,
  gameOver: true,
  seed: 12345,
};

const CHALLENGE_DIFFERENT_SEED: ChallengeParams = {
  seed: 99999,
  difficulty: 'normal',
  duration: 'standard',
};

const CHALLENGE_MATCHING_SEED: ChallengeParams = {
  seed: 12345,
  difficulty: 'normal',
  duration: 'standard',
};

const SCOREBOARD_PARAMS: ChallengeParams = {
  seed: 55555,
  difficulty: 'easy',
  duration: 'quick',
};

// ── Routing Decision Tests ──────────────────────────────────────────

describe('Challenge URL routing logic', () => {
  // Scenario 1
  it('accepts challenge URL when no saved game exists', () => {
    const result = routeChallengeUrl({
      gameState: EMPTY_GAME,
      challengeUrl: CHALLENGE_DIFFERENT_SEED,
      scoreboardUrl: null,
    });
    expect(result.action).toBe('accept_challenge');
    if (result.action === 'accept_challenge') {
      expect(result.challenge.seed).toBe(99999);
    }
  });

  // Scenario 2 — THE BUG FIX
  it('accepts challenge URL when game is completed (gameOver=true), even with different seed', () => {
    const result = routeChallengeUrl({
      gameState: COMPLETED_GAME,
      challengeUrl: CHALLENGE_DIFFERENT_SEED,
      scoreboardUrl: null,
    });
    expect(result.action).toBe('accept_challenge');
    if (result.action === 'accept_challenge') {
      expect(result.challenge.seed).toBe(CHALLENGE_DIFFERENT_SEED.seed);
    }
  });

  // Scenario 3
  it('rejects challenge URL when active game has different seed', () => {
    const result = routeChallengeUrl({
      gameState: ACTIVE_GAME,
      challengeUrl: CHALLENGE_DIFFERENT_SEED,
      scoreboardUrl: null,
    });
    expect(result.action).toBe('reject_challenge');
  });

  // Scenario 4
  it('accepts challenge URL when active game has matching seed', () => {
    const result = routeChallengeUrl({
      gameState: ACTIVE_GAME,
      challengeUrl: CHALLENGE_MATCHING_SEED,
      scoreboardUrl: null,
    });
    expect(result.action).toBe('accept_challenge');
    if (result.action === 'accept_challenge') {
      expect(result.challenge.seed).toBe(12345);
    }
  });

  // Scenario 5
  it('scoreboard URL takes precedence over challenge URL with no saved game', () => {
    const result = routeChallengeUrl({
      gameState: EMPTY_GAME,
      challengeUrl: CHALLENGE_DIFFERENT_SEED,
      scoreboardUrl: SCOREBOARD_PARAMS,
    });
    expect(result.action).toBe('scoreboard');
    if (result.action === 'scoreboard') {
      expect(result.params.seed).toBe(55555);
    }
  });

  // Scenario 6
  it('scoreboard URL works even with an active game', () => {
    const result = routeChallengeUrl({
      gameState: ACTIVE_GAME,
      challengeUrl: null,
      scoreboardUrl: SCOREBOARD_PARAMS,
    });
    expect(result.action).toBe('scoreboard');
  });

  // Scenario 7
  it('scoreboard URL works with a completed game', () => {
    const result = routeChallengeUrl({
      gameState: COMPLETED_GAME,
      challengeUrl: null,
      scoreboardUrl: SCOREBOARD_PARAMS,
    });
    expect(result.action).toBe('scoreboard');
  });

  // Scenario 8
  it('returns no_url when there are no URL params', () => {
    const result = routeChallengeUrl({
      gameState: ACTIVE_GAME,
      challengeUrl: null,
      scoreboardUrl: null,
    });
    expect(result.action).toBe('no_url');
  });

  // Scenario 9 — Edge: holdcoName set but round=0
  it('accepts challenge when holdcoName is set but round=0 (not a real saved game)', () => {
    const partialGame: GameState = {
      holdcoName: 'My Holdco',
      round: 0,
      gameOver: false,
      seed: 11111,
    };
    const result = routeChallengeUrl({
      gameState: partialGame,
      challengeUrl: CHALLENGE_DIFFERENT_SEED,
      scoreboardUrl: null,
    });
    expect(result.action).toBe('accept_challenge');
  });

  // Scenario 10 — Edge: round > 0 but holdcoName empty
  it('accepts challenge when round > 0 but holdcoName is empty (not a real saved game)', () => {
    const weirdState: GameState = {
      holdcoName: '',
      round: 5,
      gameOver: false,
      seed: 11111,
    };
    const result = routeChallengeUrl({
      gameState: weirdState,
      challengeUrl: CHALLENGE_DIFFERENT_SEED,
      scoreboardUrl: null,
    });
    expect(result.action).toBe('accept_challenge');
  });
});

// ── hasActiveGame Guard Truth Table ─────────────────────────────────

describe('hasActiveGame guard conditions', () => {
  // Exhaustive truth table for the three-part guard
  const cases: Array<{
    desc: string;
    holdcoName: string;
    round: number;
    gameOver: boolean;
    expected: boolean;
  }> = [
    { desc: 'all false',              holdcoName: '',     round: 0,  gameOver: false, expected: false },
    { desc: 'only holdcoName',        holdcoName: 'Test', round: 0,  gameOver: false, expected: false },
    { desc: 'only round',             holdcoName: '',     round: 5,  gameOver: false, expected: false },
    { desc: 'only gameOver',          holdcoName: '',     round: 0,  gameOver: true,  expected: false },
    { desc: 'holdcoName + round',     holdcoName: 'Test', round: 5,  gameOver: false, expected: true  },
    { desc: 'holdcoName + gameOver',  holdcoName: 'Test', round: 0,  gameOver: true,  expected: false },
    { desc: 'round + gameOver',       holdcoName: '',     round: 5,  gameOver: true,  expected: false },
    { desc: 'all true (completed)',   holdcoName: 'Test', round: 20, gameOver: true,  expected: false },
  ];

  for (const c of cases) {
    it(`hasActiveGame = ${c.expected} when ${c.desc}`, () => {
      const hasActiveGame = !!(c.holdcoName && c.round > 0 && !c.gameOver);
      expect(hasActiveGame).toBe(c.expected);
    });
  }
});

// ── Encoding/Decoding Round-Trip Tests ──────────────────────────────

describe('encodeChallengeParams / decodeChallengeParams round-trip', () => {
  // Scenario 11
  it('round-trips seed, difficulty, and duration (easy/standard)', () => {
    const params: ChallengeParams = { seed: 42, difficulty: 'easy', duration: 'standard' };
    const encoded = encodeChallengeParams(params);
    const decoded = decodeChallengeParams(encoded);
    expect(decoded).toEqual(params);
  });

  it('round-trips normal/quick', () => {
    const params: ChallengeParams = { seed: 999999, difficulty: 'normal', duration: 'quick' };
    const encoded = encodeChallengeParams(params);
    const decoded = decodeChallengeParams(encoded);
    expect(decoded).toEqual(params);
  });

  it('handles very large seeds', () => {
    const params: ChallengeParams = { seed: 2147483647, difficulty: 'easy', duration: 'quick' };
    const encoded = encodeChallengeParams(params);
    const decoded = decodeChallengeParams(encoded);
    expect(decoded).toEqual(params);
  });

  it('handles seed of 0', () => {
    const params: ChallengeParams = { seed: 0, difficulty: 'normal', duration: 'standard' };
    const encoded = encodeChallengeParams(params);
    const decoded = decodeChallengeParams(encoded);
    expect(decoded).toEqual(params);
  });

  it('handles seed of 1', () => {
    const params: ChallengeParams = { seed: 1, difficulty: 'easy', duration: 'standard' };
    const encoded = encodeChallengeParams(params);
    const decoded = decodeChallengeParams(encoded);
    expect(decoded).toEqual(params);
  });
});

describe('encodePlayerResult / decodePlayerResult round-trip', () => {
  // Scenario 12
  it('round-trips all player result fields', () => {
    const result: PlayerResult = {
      name: 'Test Player',
      fev: 150000,
      score: 85,
      grade: 'A',
      businesses: 7,
      sectors: 4,
      peakLeverage: 3.2,
      restructured: false,
      totalDistributions: 25000,
    };
    const encoded = encodePlayerResult(result);
    const decoded = decodePlayerResult(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe('Test Player');
    expect(decoded!.fev).toBe(150000);
    expect(decoded!.score).toBe(85);
    expect(decoded!.grade).toBe('A');
    expect(decoded!.businesses).toBe(7);
    expect(decoded!.sectors).toBe(4);
    expect(decoded!.peakLeverage).toBe(3.2);
    expect(decoded!.restructured).toBe(false);
    expect(decoded!.totalDistributions).toBe(25000);
  });

  it('round-trips restructured=true', () => {
    const result: PlayerResult = {
      name: 'Restructured Inc',
      fev: 50000,
      score: 45,
      grade: 'C',
      businesses: 2,
      sectors: 1,
      peakLeverage: 8.5,
      restructured: true,
      totalDistributions: 0,
    };
    const encoded = encodePlayerResult(result);
    const decoded = decodePlayerResult(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.restructured).toBe(true);
    expect(decoded!.totalDistributions).toBe(0);
  });

  it('round-trips names with spaces and special characters', () => {
    const result: PlayerResult = {
      name: 'John & Jane Co',
      fev: 100000,
      score: 70,
      grade: 'B',
      businesses: 5,
      sectors: 3,
      peakLeverage: 2.0,
      restructured: false,
      totalDistributions: 10000,
    };
    const encoded = encodePlayerResult(result);
    const decoded = decodePlayerResult(encoded);
    expect(decoded).not.toBeNull();
    // Spaces become underscores then back to spaces
    expect(decoded!.name).toBe('John & Jane Co');
  });

  it('handles zero FEV (bankrupt player)', () => {
    const result: PlayerResult = {
      name: 'Bankrupt Bob',
      fev: 0,
      score: 0,
      grade: 'F',
      businesses: 0,
      sectors: 0,
      peakLeverage: 0,
      restructured: true,
      totalDistributions: 0,
    };
    const encoded = encodePlayerResult(result);
    const decoded = decodePlayerResult(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.fev).toBe(0);
    expect(decoded!.score).toBe(0);
    expect(decoded!.grade).toBe('F');
  });
});

// ── Malformed Input Tests ───────────────────────────────────────────

describe('Malformed challenge codes', () => {
  // Scenario 13
  it('returns null for empty string', () => {
    expect(decodeChallengeParams('')).toBeNull();
  });

  it('returns null for single part (missing difficulty and duration)', () => {
    expect(decodeChallengeParams('abc')).toBeNull();
  });

  it('returns null for two parts (missing duration)', () => {
    expect(decodeChallengeParams('abc.0')).toBeNull();
  });

  it('returns null for invalid difficulty code', () => {
    // '5' is not in DIFF_REVERSE ('0' or '1')
    expect(decodeChallengeParams('abc.5.0')).toBeNull();
  });

  it('returns null for invalid duration code', () => {
    // '9' is not in DUR_REVERSE ('0' or '1')
    expect(decodeChallengeParams('abc.0.9')).toBeNull();
  });

  it('returns null for non-base36 seed', () => {
    // '$$$' is not valid base36 → NaN
    expect(decodeChallengeParams('$$$.0.0')).toBeNull();
  });

  it('handles extra dots gracefully (only first 3 parts used)', () => {
    // decodeChallengeParams splits on '.', checks parts.length >= 3, uses first 3
    const result = decodeChallengeParams('abc.0.0.extra.stuff');
    expect(result).not.toBeNull();
    expect(result!.difficulty).toBe('easy');
    expect(result!.duration).toBe('standard');
  });
});

describe('Malformed player result codes', () => {
  it('returns null for empty string', () => {
    expect(decodePlayerResult('')).toBeNull();
  });

  it('returns null for too few parts (< 9)', () => {
    expect(decodePlayerResult('name.1.2.A.3')).toBeNull();
  });

  it('returns null for 8 parts (one short)', () => {
    expect(decodePlayerResult('name.1.2.A.3.2.5.0')).toBeNull();
  });

  it('handles extra parts gracefully (only first 9 used)', () => {
    // 9+ parts should still decode fine
    const result = decodePlayerResult('name.1.2.A.3.2.5.0.0.extra');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('name');
  });
});

// ── Regression Guard: Old Bug Would Have Failed ─────────────────────

describe('Regression: old hasSavedGame guard (before fix)', () => {
  /**
   * The OLD guard was: `holdcoName && round > 0`
   * The NEW guard is:  `holdcoName && round > 0 && !gameOver`
   *
   * This test documents that the old guard would have incorrectly classified
   * a completed game as blocking a new challenge link.
   */
  it('old guard would have blocked challenge link on completed game', () => {
    const { holdcoName, round, gameOver } = COMPLETED_GAME;

    // Old guard (the bug)
    const hasSavedGame = !!(holdcoName && round > 0);
    expect(hasSavedGame).toBe(true); // old code thought this was an active game

    // New guard (the fix)
    const hasActiveGame = !!(holdcoName && round > 0 && !gameOver);
    expect(hasActiveGame).toBe(false); // fixed: completed game is NOT active
  });

  it('both guards agree for genuinely active games', () => {
    const { holdcoName, round, gameOver } = ACTIVE_GAME;

    const hasSavedGame = !!(holdcoName && round > 0);
    const hasActiveGame = !!(holdcoName && round > 0 && !gameOver);

    expect(hasSavedGame).toBe(true);
    expect(hasActiveGame).toBe(true);
  });

  it('both guards agree when no game exists', () => {
    const { holdcoName, round, gameOver } = EMPTY_GAME;

    const hasSavedGame = !!(holdcoName && round > 0);
    const hasActiveGame = !!(holdcoName && round > 0 && !gameOver);

    expect(hasSavedGame).toBe(false);
    expect(hasActiveGame).toBe(false);
  });
});
