/**
 * GET /api/scenario-challenges/active
 *
 * Returns currently-featured scenarios for the home screen banner. Read-only,
 * no auth, short cache. `scenarios:active` in KV holds an array of scenario ids;
 * each id's config is fetched from `scenario:{id}:config`.
 *
 * Response shape:
 *   { scenarios: ScenarioChallengeSummary[] }
 *   ScenarioChallengeSummary = pick of config fields safe for public display
 *     (no internal admin fields — keeps config schema changes from leaking)
 *
 * Consumed by `src/components/screens/IntroScreen.tsx` on mount.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { SCENARIOS_ACTIVE_KEY, scenarioConfigKey } from '../_lib/leaderboard.js';

interface ScenarioSummary {
  id: string;
  name: string;
  tagline: string;
  description: string;
  theme: { emoji: string; color: string; era?: string };
  startDate: string;
  endDate: string;
  difficulty: string;
  duration: string;
  maxRounds: number;
  rankingMetric: string;
  isPE: boolean;
  entryCount: number;
  topScore: number | null;
}

/** Max featured scenarios per plan Section 5.3 (1 banner + 2 compact = 3). */
const MAX_FEATURED = 3;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ids = await readActiveIds();
    if (ids.length === 0) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json({ scenarios: [] });
    }

    // Fetch configs + leaderboard summaries in parallel. Each missing config is
    // dropped silently (may have expired or been deactivated between writes).
    const summaries = (await Promise.all(ids.slice(0, MAX_FEATURED).map(buildSummary))).filter(
      (s): s is ScenarioSummary => s !== null,
    );

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ scenarios: summaries });
  } catch (err) {
    console.error('scenario-challenges/active error:', err);
    return res.status(500).json({ error: 'Failed to fetch active scenarios' });
  }
}

/** Read featured scenario ids from KV. Returns `[]` if key missing or malformed. */
async function readActiveIds(): Promise<string[]> {
  try {
    const raw = await kv.get<unknown>(SCENARIOS_ACTIVE_KEY);
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_FEATURED * 2);
  } catch (err) {
    console.error('scenarios:active read failed:', err);
    return [];
  }
}

/** Build the public summary for one scenario. Returns null when config unavailable. */
async function buildSummary(scenarioId: string): Promise<ScenarioSummary | null> {
  try {
    const rawConfig = await kv.get<unknown>(scenarioConfigKey(scenarioId));
    if (!rawConfig) return null;

    const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
    const c = config as Record<string, unknown>;

    // Only return scenarios explicitly marked featured — admins can ship
    // active-but-not-featured scenarios for test-play via direct URL.
    if (c.isFeatured !== true || c.isActive !== true) return null;

    // Leaderboard summary — read zrange HEAD to get top score without shipping the whole set.
    const { topScore, entryCount } = await summarizeLeaderboard(scenarioId);

    return {
      id: String(c.id ?? scenarioId),
      name: String(c.name ?? ''),
      tagline: String(c.tagline ?? ''),
      description: String(c.description ?? ''),
      theme: c.theme as ScenarioSummary['theme'],
      startDate: String(c.startDate ?? ''),
      endDate: String(c.endDate ?? ''),
      difficulty: String(c.difficulty ?? 'easy'),
      duration: String(c.duration ?? 'standard'),
      maxRounds: typeof c.maxRounds === 'number' ? c.maxRounds : 10,
      rankingMetric: String(c.rankingMetric ?? 'fev'),
      isPE: !!c.fundStructure,
      entryCount,
      topScore,
    };
  } catch (err) {
    console.error(`scenario '${scenarioId}' summary build failed:`, err);
    return null;
  }
}

/** zcard + HEAD zrange for the sorted set, using the typed KV shim from leaderboardCore. */
async function summarizeLeaderboard(scenarioId: string): Promise<{ topScore: number | null; entryCount: number }> {
  try {
    const kvz = kv as unknown as {
      zcard: (key: string) => Promise<number>;
      zrange: (key: string, start: number, stop: number, opts?: { rev?: boolean; withScores?: boolean }) => Promise<unknown[]>;
    };
    const lbKey = `scenario:${scenarioId}:leaderboard`;
    const [count, top] = await Promise.all([
      kvz.zcard(lbKey),
      kvz.zrange(lbKey, 0, 0, { rev: true, withScores: true }),
    ]);
    // top is [member, score] when withScores: true and one entry requested.
    const topScore = Array.isArray(top) && top.length >= 2 && typeof top[1] === 'number' ? top[1] : null;
    return { topScore, entryCount: count };
  } catch (err) {
    console.error(`scenario '${scenarioId}' leaderboard summary failed:`, err);
    return { topScore: null, entryCount: 0 };
  }
}
