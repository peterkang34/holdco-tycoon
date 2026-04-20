/**
 * Client helpers for scenario-challenge leaderboard endpoints.
 *
 * Mirrors `api/scenario-challenges/*` in fetch-shape only — the server is
 * authoritative for scoring, identity, rate limits, and grace-period checks.
 * Kept separate from `services/completionApi.ts` because scenarios never write
 * to the global leaderboard and the payload diverges (scenarioChallengeId,
 * rankingMetric fields, preview flag).
 */
import type {
  GameDifficulty,
  GameDuration,
  LeaderboardStrategy,
  RankingMetric,
} from '../engine/types';
import { formatMoney } from '../engine/types';
import { SCENARIO_RANKING_METRIC_LABELS } from '../data/mechanicsCopy';
import { getAccessToken } from '../lib/supabase';

export interface ScenarioSubmitPayload {
  scenarioChallengeId: string;
  holdcoName: string;
  initials: string;
  enterpriseValue: number;
  founderEquityValue: number;
  founderPersonalWealth: number;
  score: number;
  grade: string;
  businessCount: number;
  totalRounds: number;
  difficulty: GameDifficulty;
  duration: GameDuration;
  isAdminPreview?: boolean;
  grossMoic?: number;
  netIrr?: number;
  carryEarned?: number;
  strategy?: Partial<LeaderboardStrategy>;
}

export interface ScenarioSubmitResponse {
  success: true;
  id?: string;
  rank?: number;
  previewed?: boolean;
}

export interface ScenarioLeaderboardEntry {
  id: string;
  scenarioChallengeId: string;
  holdcoName: string;
  initials: string;
  enterpriseValue: number;
  founderEquityValue: number;
  founderPersonalWealth: number;
  difficulty: GameDifficulty;
  duration: GameDuration;
  totalRounds: number;
  score: number;
  grade: string;
  businessCount: number;
  date: string;
  rankingMetric: RankingMetric;
  rank: number;
  sortScore: number;
  grossMoic?: number;
  netIrr?: number;
  carryEarned?: number;
  playerId?: string;
  submittedBy?: string;
  publicProfileId?: string;
}

export interface ScenarioLeaderboardResponse {
  scenario: {
    id: string;
    name: string;
    rankingMetric: RankingMetric;
    entryCount: number;
  };
  entries: ScenarioLeaderboardEntry[];
}

export interface ScenarioListSummary {
  id: string;
  name: string;
  tagline: string;
  theme: { emoji: string; color: string; era?: string };
  startDate: string;
  endDate: string;
  difficulty: GameDifficulty;
  duration: GameDuration;
  maxRounds: number;
  rankingMetric: RankingMetric;
  isPE: boolean;
  entryCount: number;
  topScore: number | null;
  isFeatured: boolean;
  isActive: boolean;
}

export interface ScenarioListResponse {
  active: ScenarioListSummary[];
  archived: ScenarioListSummary[];
}

/**
 * Submit a completed scenario run. Server drops admin-preview submissions,
 * writes to `scenario:{id}:leaderboard`, and returns the computed rank.
 * Auth header is included when logged in so the entry gets a verified playerId
 * + public profile link (same pattern as global submit).
 */
export async function submitScenarioChallenge(
  payload: ScenarioSubmitPayload,
): Promise<ScenarioSubmitResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Anonymous submit — no token attached.
  }

  const res = await fetch('/api/scenario-challenges/submit', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(typeof body.error === 'string' ? body.error : `Submit failed (${res.status})`);
  }
  return res.json() as Promise<ScenarioSubmitResponse>;
}

export async function fetchScenarioLeaderboard(
  scenarioId: string,
  limit = 50,
): Promise<ScenarioLeaderboardResponse> {
  const res = await fetch(
    `/api/scenario-challenges/leaderboard?id=${encodeURIComponent(scenarioId)}&limit=${limit}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(typeof body.error === 'string' ? body.error : `Load failed (${res.status})`);
  }
  return res.json() as Promise<ScenarioLeaderboardResponse>;
}

export async function fetchScenarioList(): Promise<ScenarioListResponse> {
  const res = await fetch('/api/scenario-challenges/list');
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(typeof body.error === 'string' ? body.error : `Load failed (${res.status})`);
  }
  return res.json() as Promise<ScenarioListResponse>;
}

/**
 * Resolve the display value + label + unit for a ranking metric, given an
 * entry's raw fields. Mirrors `computeSortScore` in submit.ts but returns the
 * human-readable form instead of the KV sort number.
 *
 * Used by both ScenarioChallengeResultSection (your result + entries list) and
 * the Scenarios tab in LeaderboardModal.
 */
export interface FormattedMetric {
  label: string;
  display: string;
  numeric: number | null;
}

export function formatRankingMetric(
  metric: RankingMetric,
  fields: {
    founderEquityValue?: number;
    grossMoic?: number | null;
    netIrr?: number | null;
    carryEarned?: number | null;
    sortScore?: number;
  },
): FormattedMetric {
  // Labels sourced from mechanicsCopy.ts — single source of truth; display-proofreader
  // asserts this import stays wired so a label rename in copy propagates everywhere.
  const labels = SCENARIO_RANKING_METRIC_LABELS;
  switch (metric) {
    case 'fev': {
      const n = fields.founderEquityValue ?? fields.sortScore ?? null;
      return { label: labels.fev, display: formatMoneyOrDash(n), numeric: n };
    }
    case 'moic': {
      const n = fields.grossMoic ?? (fields.sortScore != null ? fields.sortScore / 100_000 : null);
      return { label: labels.moic, display: n != null ? `${n.toFixed(2)}x` : '—', numeric: n };
    }
    case 'cashOnCash': {
      const n = fields.grossMoic ?? (fields.sortScore != null ? fields.sortScore / 100_000 : null);
      return { label: labels.cashOnCash, display: n != null ? `${n.toFixed(2)}x` : '—', numeric: n };
    }
    case 'irr': {
      const n = fields.netIrr ?? (fields.sortScore != null ? fields.sortScore / 1_000_000 : null);
      return { label: labels.irr, display: n != null ? `${(n * 100).toFixed(1)}%` : '—', numeric: n };
    }
    case 'gpCarry': {
      const n = fields.carryEarned ?? fields.sortScore ?? null;
      return { label: labels.gpCarry, display: formatMoneyOrDash(n), numeric: n };
    }
    default:
      return { label: 'Score', display: '—', numeric: null };
  }
}

function formatMoneyOrDash(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return formatMoney(n);
}
