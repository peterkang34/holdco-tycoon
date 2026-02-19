import { sanitizeString } from './rateLimit.js';

export const CHALLENGE_TTL = 2592000; // 30 days in seconds
export const MAX_PARTICIPANTS = 10;

export function challengeMetaKey(code: string): string {
  return `challenge:${code}:meta`;
}

export function challengeResultsKey(code: string): string {
  return `challenge:${code}:results`;
}

// Validate challenge code format: BASE36.DIFF.DUR
const CHALLENGE_CODE_REGEX = /^[a-z0-9]+\.[01]\.[01]$/;
export function isValidChallengeCode(code: unknown): code is string {
  return typeof code === 'string' && CHALLENGE_CODE_REGEX.test(code) && code.length <= 30;
}

// Validate token format (UUID v4)
const TOKEN_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_REGEX.test(token);
}

const VALID_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'];

export interface SubmittedResult {
  name: string;
  fev: number;
  score: number;
  grade: string;
  businesses: number;
  sectors: number;
  peakLeverage: number;
  restructured: boolean;
  totalDistributions: number;
  submittedAt: string;
}

export interface ChallengeMeta {
  hostToken: string;
  createdAt: string;
  revealed: boolean;
  revealedAt?: string;
}

/** Parse meta from KV (handles both string and auto-deserialized forms) */
export function parseMeta(raw: unknown): ChallengeMeta | null {
  if (!raw) return null;
  try {
    const meta: ChallengeMeta = typeof raw === 'string' ? JSON.parse(raw) : raw as ChallengeMeta;
    if (typeof meta.hostToken !== 'string' || typeof meta.revealed !== 'boolean') return null;
    return meta;
  } catch {
    return null;
  }
}

export function validateResult(result: unknown): SubmittedResult | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  const name = sanitizeString(r.name, 30);
  if (!name) return null;

  if (typeof r.fev !== 'number' || !Number.isFinite(r.fev) || r.fev < 0 || r.fev > 500000000) return null;
  if (typeof r.score !== 'number' || !Number.isInteger(r.score) || r.score < 0 || r.score > 100) return null;
  if (typeof r.grade !== 'string' || !VALID_GRADES.includes(r.grade)) return null;
  if (typeof r.businesses !== 'number' || !Number.isInteger(r.businesses) || r.businesses < 0 || r.businesses > 30) return null;
  if (typeof r.sectors !== 'number' || !Number.isInteger(r.sectors) || r.sectors < 0 || r.sectors > 15) return null;
  if (typeof r.peakLeverage !== 'number' || !Number.isFinite(r.peakLeverage) || r.peakLeverage < 0 || r.peakLeverage > 100) return null;
  if (typeof r.restructured !== 'boolean') return null;
  if (typeof r.totalDistributions !== 'number' || !Number.isFinite(r.totalDistributions) || r.totalDistributions < 0 || r.totalDistributions > 500000000) return null;

  return {
    name,
    fev: Math.round(r.fev),
    score: r.score,
    grade: r.grade,
    businesses: r.businesses,
    sectors: r.sectors,
    peakLeverage: Math.round(r.peakLeverage * 10) / 10,
    restructured: r.restructured,
    totalDistributions: Math.round(r.totalDistributions),
    submittedAt: new Date().toISOString(),
  };
}
