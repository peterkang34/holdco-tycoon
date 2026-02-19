/**
 * Challenge Mode encoding/decoding for Holdco Tycoon.
 *
 * Two URL formats:
 * - Challenge URL: ?c=SEED.DIFF.DUR  (seed + settings, blind — no score)
 * - Result URL:    ?c=SEED.DIFF.DUR&r=NAME.FEV.SCORE.GRADE.BIZ.SEC.LEV.RESTR.DIST
 *
 * Values are base36-encoded for compact URLs.
 */

import type { GameDifficulty, GameDuration } from '../engine/types';

// ── Types ────────────────────────────────────────────────────────

export interface ChallengeParams {
  seed: number;
  difficulty: GameDifficulty;
  duration: GameDuration;
}

export interface PlayerResult {
  name: string;
  fev: number;         // Founder Equity Value in $k
  score: number;       // 0-100 composite score
  grade: string;       // S/A/B/C/D/F
  businesses: number;  // active business count at game end
  sectors: number;     // unique sectors
  peakLeverage: number; // peak net debt / EBITDA (×10 for encoding)
  restructured: boolean;
  totalDistributions: number; // in $k
}

// ── Encoding Helpers ─────────────────────────────────────────────

const DIFF_MAP: Record<GameDifficulty, string> = { easy: '0', normal: '1' };
const DIFF_REVERSE: Record<string, GameDifficulty> = { '0': 'easy', '1': 'normal' };

const DUR_MAP: Record<GameDuration, string> = { standard: '0', quick: '1' };
const DUR_REVERSE: Record<string, GameDuration> = { '0': 'standard', '1': 'quick' };

function toBase36(n: number): string {
  return Math.abs(Math.round(n)).toString(36);
}

function fromBase36(s: string): number {
  return parseInt(s, 36);
}

/** URI-safe encode a player name (spaces → underscores, limited charset) */
function encodeName(name: string): string {
  return encodeURIComponent(name.slice(0, 20).replace(/\s+/g, '_'));
}

function decodeName(encoded: string): string {
  return decodeURIComponent(encoded).replace(/_/g, ' ');
}

// ── Challenge Encoding ───────────────────────────────────────────

export function encodeChallengeParams(params: ChallengeParams): string {
  const parts = [
    toBase36(params.seed),
    DIFF_MAP[params.difficulty],
    DUR_MAP[params.duration],
  ];
  return parts.join('.');
}

export function decodeChallengeParams(code: string): ChallengeParams | null {
  try {
    const parts = code.split('.');
    if (parts.length < 3) return null;

    const seed = fromBase36(parts[0]);
    const difficulty = DIFF_REVERSE[parts[1]];
    const duration = DUR_REVERSE[parts[2]];

    if (isNaN(seed) || !difficulty || !duration) return null;

    return { seed, difficulty, duration };
  } catch {
    return null;
  }
}

// ── Result Encoding ──────────────────────────────────────────────

export function encodePlayerResult(result: PlayerResult): string {
  const parts = [
    encodeName(result.name),
    toBase36(result.fev),
    toBase36(result.score),
    result.grade,
    toBase36(result.businesses),
    toBase36(result.sectors),
    toBase36(Math.round(result.peakLeverage * 10)), // store ×10 for 1 decimal
    result.restructured ? '1' : '0',
    toBase36(result.totalDistributions),
  ];
  return parts.join('.');
}

export function decodePlayerResult(code: string): PlayerResult | null {
  try {
    const parts = code.split('.');
    if (parts.length < 9) return null;

    return {
      name: decodeName(parts[0]),
      fev: fromBase36(parts[1]),
      score: fromBase36(parts[2]),
      grade: parts[3],
      businesses: fromBase36(parts[4]),
      sectors: fromBase36(parts[5]),
      peakLeverage: fromBase36(parts[6]) / 10,
      restructured: parts[7] === '1',
      totalDistributions: fromBase36(parts[8]),
    };
  } catch {
    return null;
  }
}

// ── URL Construction ─────────────────────────────────────────────

const BASE_URL = 'https://game.holdcoguide.com';

export function buildChallengeUrl(params: ChallengeParams): string {
  return `${BASE_URL}/?c=${encodeChallengeParams(params)}`;
}

export function buildResultUrl(params: ChallengeParams, result: PlayerResult): string {
  return `${BASE_URL}/?c=${encodeChallengeParams(params)}&r=${encodePlayerResult(result)}`;
}

// ── URL Parsing ──────────────────────────────────────────────────

export function parseChallengeFromUrl(): {
  challenge: ChallengeParams | null;
  result: PlayerResult | null;
} {
  const params = new URLSearchParams(window.location.search);
  const challengeCode = params.get('c');
  const resultCode = params.get('r');

  return {
    challenge: challengeCode ? decodeChallengeParams(challengeCode) : null,
    result: resultCode ? decodePlayerResult(resultCode) : null,
  };
}

/** Clean challenge params from URL without page reload */
export function cleanChallengeUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('c');
  url.searchParams.delete('r');
  window.history.replaceState({}, '', url.pathname + url.hash);
}

// ── Comparison Logic ─────────────────────────────────────────────

export interface ComparisonEntry {
  result: PlayerResult;
  isYou: boolean;
}

/** Compare 2-4 players, sorted by composite score (descending) */
export function compareResults(entries: ComparisonEntry[]): ComparisonEntry[] {
  return [...entries].sort((a, b) => {
    // Primary: composite score
    if (b.result.score !== a.result.score) return b.result.score - a.result.score;
    // Tiebreaker: FEV + distributions (total shareholder return)
    const aTSR = a.result.fev + a.result.totalDistributions;
    const bTSR = b.result.fev + b.result.totalDistributions;
    return bTSR - aTSR;
  });
}

/** Determine if results are tied */
export function isTied(a: PlayerResult, b: PlayerResult): boolean {
  return a.score === b.score &&
    (a.fev + a.totalDistributions) === (b.fev + b.totalDistributions);
}

// ── Token Helpers ─────────────────────────────────────────────────

const PLAYER_TOKEN_KEY = 'holdco-challenge-player-token';
const HOST_TOKEN_PREFIX = 'holdco-challenge-host:';

/** Generate a cryptographically random token */
export function generateToken(): string {
  return crypto.randomUUID();
}

/** Get or create a persistent player token for this browser */
let _sessionToken: string | null = null; // Fallback for when localStorage is unavailable
export function getPlayerToken(): string {
  try {
    const existing = localStorage.getItem(PLAYER_TOKEN_KEY);
    if (existing) return existing;
    const token = generateToken();
    localStorage.setItem(PLAYER_TOKEN_KEY, token);
    return token;
  } catch {
    // If localStorage is unavailable, memoize in memory for session lifetime (#2)
    if (!_sessionToken) _sessionToken = generateToken();
    return _sessionToken;
  }
}

/** Get the host token for a specific challenge code */
export function getHostToken(code: string): string | null {
  try {
    return localStorage.getItem(HOST_TOKEN_PREFIX + code);
  } catch {
    return null;
  }
}

/** Save a host token for a specific challenge code */
export function setHostToken(code: string, token: string): void {
  try {
    localStorage.setItem(HOST_TOKEN_PREFIX + code, token);
  } catch {}
}

/** Check if this browser is the host for a specific challenge */
export function isHost(code: string): boolean {
  return getHostToken(code) !== null;
}

// ── Share Helpers ─────────────────────────────────────────────────

/** Copy text to clipboard, returns true on success */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

/** Try native share API (mobile), falls back to clipboard */
export async function shareChallenge(url: string, title: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return true;
    } catch {
      // User cancelled or share failed, fall back to clipboard
    }
  }
  return copyToClipboard(url);
}
