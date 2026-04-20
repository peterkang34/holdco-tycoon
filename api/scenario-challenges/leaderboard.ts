/**
 * GET /api/scenario-challenges/leaderboard?id={scenarioId}&limit={n}
 *
 * Returns the top N entries for a scenario, ranked by the scenario's
 * configured `rankingMetric` (stored as the KV sorted-set score). Default 50,
 * max 500 — matches `MAX_SCENARIO_ENTRIES`.
 *
 * Response shape:
 *   {
 *     scenario: { id, name, rankingMetric, entryCount },
 *     entries: Array<{ rank, score, ...entry }>,
 *   }
 *
 * No auth; short cache. Consumed by the scenarios tab in LeaderboardModal
 * and the game-over ScenarioChallengeResultSection.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { scenarioConfigKey, scenarioLeaderboardKey, MAX_SCENARIO_ENTRIES } from '../_lib/leaderboard.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

const DEFAULT_LIMIT = 50;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const scenarioId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  // id allowlist: alphanumeric + hyphen, 1-60 chars (matches admin slug format).
  // Lowercase-only — KV keys are case-sensitive; mixed-case ids would miss lookups.
  if (!scenarioId || !/^[a-z0-9-]{1,60}$/.test(scenarioId)) {
    return res.status(400).json({ error: 'id must be a valid scenario slug' });
  }

  const requestedLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : DEFAULT_LIMIT;
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 && requestedLimit <= MAX_SCENARIO_ENTRIES
    ? requestedLimit : DEFAULT_LIMIT;

  try {
    const rawConfig = await kv.get<unknown>(scenarioConfigKey(scenarioId));
    if (!rawConfig) {
      // KV expired — try Postgres archive (written by the snapshot cron). Returns a
      // frozen top-50 + entry count from archival time, no further writes possible.
      const archived = await readArchivedLeaderboard(scenarioId);
      if (archived) {
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).json(archived);
      }
      return res.status(404).json({ error: 'Scenario not found' });
    }
    const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(404).json({ error: 'Scenario config invalid' });
    }
    const c = config as Record<string, unknown>;

    const kvz = kv as unknown as {
      zcard: (key: string) => Promise<number>;
      zrange: (key: string, start: number, stop: number, opts?: { rev?: boolean; withScores?: boolean }) => Promise<unknown[]>;
    };

    const lbKey = scenarioLeaderboardKey(scenarioId);
    const [entryCount, rawEntries] = await Promise.all([
      kvz.zcard(lbKey),
      kvz.zrange(lbKey, 0, limit - 1, { rev: true, withScores: true }),
    ]);

    // `rawEntries` is [member1, score1, member2, score2, ...]. Each member is
    // a JSON-serialized entry written by api/scenario-challenges/submit.ts.
    // NOTE: the entry's own `.score` field is the game score (0-100) — we expose
    // the ZSET's score (the ranking metric value) as `sortScore` to avoid collision.
    const entries: Array<Record<string, unknown>> = [];
    for (let i = 0; i < rawEntries.length; i += 2) {
      const member = rawEntries[i];
      const sortScore = rawEntries[i + 1];
      if (typeof member !== 'string' || typeof sortScore !== 'number') continue;
      try {
        const parsed = JSON.parse(member);
        if (parsed && typeof parsed === 'object' && !parsed.isAdminPreview) {
          entries.push({ ...parsed, rank: entries.length + 1, sortScore });
        }
      } catch {
        // Skip malformed entries — shouldn't happen but defensive.
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=30');
    return res.status(200).json({
      scenario: {
        id: scenarioId,
        name: String(c.name ?? ''),
        rankingMetric: String(c.rankingMetric ?? 'fev'),
        entryCount,
      },
      entries,
    });
  } catch (err) {
    console.error('scenario-challenges/leaderboard error:', err);
    return res.status(500).json({ error: 'Failed to fetch scenario leaderboard' });
  }
}

/**
 * Fallback for post-KV-expiry reads. The snapshot cron writes a frozen top-50
 * to `scenarios_archive`; this returns that same shape `{ scenario, entries }`.
 * Returns null when no archive row exists for this id.
 */
async function readArchivedLeaderboard(scenarioId: string): Promise<{
  scenario: { id: string; name: string; rankingMetric: string; entryCount: number };
  entries: unknown[];
} | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('scenarios_archive')
      .select('name, config_json, final_leaderboard_json, entry_count')
      .eq('scenario_id', scenarioId)
      .maybeSingle();
    if (error || !data) return null;
    const config = (data.config_json ?? {}) as Record<string, unknown>;
    const entries = Array.isArray(data.final_leaderboard_json) ? data.final_leaderboard_json : [];
    return {
      scenario: {
        id: scenarioId,
        name: String(data.name ?? config.name ?? ''),
        rankingMetric: String(config.rankingMetric ?? 'fev'),
        entryCount: typeof data.entry_count === 'number' ? data.entry_count : entries.length,
      },
      entries,
    };
  } catch (err) {
    console.error(`scenarios_archive read for ${scenarioId} failed:`, err);
    return null;
  }
}
