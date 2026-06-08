/**
 * GET /api/scenario-challenges/list
 *
 * Returns all scenario summaries — active (currently playable/featured) AND
 * archived (ended, still visible on the leaderboard archive tab). Separate from
 * `active.ts` which only returns currently-featured scenarios for the home banner.
 *
 * Response shape:
 *   { active: ScenarioSummary[], archived: ScenarioSummary[] }
 *
 * Consumed by `LeaderboardModal.tsx` Scenarios tab (Phase 3D).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import {
  SCENARIOS_ACTIVE_KEY,
  SCENARIOS_ARCHIVE_KEY,
  scenarioConfigKey,
} from '../_lib/leaderboard.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

interface ScenarioSummary {
  id: string;
  name: string;
  tagline: string;
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
  isFeatured: boolean;
  isActive: boolean;
  /** First-activation timestamp (Phase 4). null = never published (a draft). Used to
   *  classify public visibility; harmless extra field for clients that ignore it. */
  publishedAt: string | null;
}

/** True once the scenario's window has closed. */
function isExpired(endDate: string): boolean {
  const ms = Date.parse(endDate);
  return Number.isFinite(ms) && Date.now() > ms;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [activeIds, archivedIds, postgresArchived] = await Promise.all([
      readIdList(SCENARIOS_ACTIVE_KEY),
      readIdList(SCENARIOS_ARCHIVE_KEY),
      // Postgres archive: scenarios whose KV keys were TTL'd out after the snapshot
      // cron ran. These are by construction published+ended → always Past Challenges.
      fetchPostgresArchive(),
    ]);

    // Re-classify from the ACTUAL config state rather than trusting the KV list
    // membership (the admin membership logic files drafts + deactivated scenarios into
    // the archive list, which must NOT surface to players). Union both lists so every
    // known scenario is considered exactly once.
    const allIds = [...new Set([...activeIds, ...archivedIds])];
    const summaries = filterNulls(await Promise.all(allIds.map(buildSummary)));

    const active: ScenarioSummary[] = [];
    const kvArchived: ScenarioSummary[] = [];
    for (const s of summaries) {
      const expired = isExpired(s.endDate);
      if (s.isActive && !expired) {
        active.push(s); // Live Now — currently playable
      } else if (expired && (s.publishedAt != null || s.entryCount > 0)) {
        kvArchived.push(s); // Past Challenge — was published and has ended
      }
      // Excluded: drafts (never published, not expired) and deactivated-but-not-ended.
    }

    // KV wins on dedup — fresher entry counts than a just-written Postgres snapshot.
    const kvIds = new Set(kvArchived.map(s => s.id));
    const archived = [
      ...kvArchived,
      ...postgresArchived.filter(s => !kvIds.has(s.id)),
    ];

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ active, archived });
  } catch (err) {
    console.error('scenario-challenges/list error:', err);
    return res.status(500).json({ error: 'Failed to fetch scenario list' });
  }
}

/**
 * Read archived scenarios from Postgres. The snapshot cron writes here when
 * a scenario's KV config approaches its 180d-past-endDate TTL. Never fatal —
 * Postgres misconfig just means empty archive.
 */
async function fetchPostgresArchive(): Promise<ScenarioSummary[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('scenarios_archive')
      .select('scenario_id, name, config_json, entry_count, top_score, end_date')
      .order('end_date', { ascending: false })
      .limit(100);

    if (error) {
      console.error('scenarios_archive read failed:', error);
      return [];
    }
    if (!Array.isArray(data)) return [];

    return data.map((row: Record<string, unknown>): ScenarioSummary | null => {
      const config = row.config_json as Record<string, unknown> | null;
      if (!config || typeof config !== 'object') return null;
      return {
        id: String(row.scenario_id),
        name: String(row.name ?? config.name ?? ''),
        tagline: String(config.tagline ?? ''),
        theme: config.theme as ScenarioSummary['theme'],
        startDate: String(config.startDate ?? ''),
        endDate: String(row.end_date ?? config.endDate ?? ''),
        difficulty: String(config.difficulty ?? 'easy'),
        duration: String(config.duration ?? 'standard'),
        maxRounds: typeof config.maxRounds === 'number' ? config.maxRounds : 10,
        rankingMetric: String(config.rankingMetric ?? 'fev'),
        isPE: !!config.fundStructure,
        entryCount: typeof row.entry_count === 'number' ? row.entry_count : 0,
        topScore: typeof row.top_score === 'number' ? row.top_score : null,
        isFeatured: false, // Postgres archive is always non-featured.
        isActive: false,
        publishedAt: typeof config.publishedAt === 'string' ? config.publishedAt : null,
      };
    }).filter((x): x is ScenarioSummary => x !== null);
  } catch (err) {
    console.error('scenarios_archive fetch failed:', err);
    return [];
  }
}

async function readIdList(key: string): Promise<string[]> {
  try {
    const raw = await kv.get<unknown>(key);
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch (err) {
    console.error(`${key} read failed:`, err);
    return [];
  }
}

async function buildSummary(scenarioId: string): Promise<ScenarioSummary | null> {
  try {
    const rawConfig = await kv.get<unknown>(scenarioConfigKey(scenarioId));
    if (!rawConfig) return null;
    const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
    const c = config as Record<string, unknown>;

    const { topScore, entryCount } = await summarizeLeaderboard(scenarioId);

    return {
      id: String(c.id ?? scenarioId),
      name: String(c.name ?? ''),
      tagline: String(c.tagline ?? ''),
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
      isFeatured: c.isFeatured === true,
      isActive: c.isActive === true,
      publishedAt: typeof c.publishedAt === 'string' ? c.publishedAt : null,
    };
  } catch (err) {
    console.error(`scenario '${scenarioId}' list summary failed:`, err);
    return null;
  }
}

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
    const topScore = Array.isArray(top) && top.length >= 2 && typeof top[1] === 'number' ? top[1] : null;
    return { topScore, entryCount: count };
  } catch (err) {
    console.error(`scenario '${scenarioId}' leaderboard summary failed:`, err);
    return { topScore: null, entryCount: 0 };
  }
}

function filterNulls<T>(arr: (T | null)[]): T[] {
  return arr.filter((x): x is T => x !== null);
}
