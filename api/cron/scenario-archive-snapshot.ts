/**
 * Weekly cron: snapshot expired-or-expiring scenarios to Postgres for permanent
 * history. Without this job, scenarios disappear 180 days after endDate when
 * their KV config + leaderboard ZSET keys are TTL'd out. Plan Section 2.
 *
 * Strategy:
 *   - Read all scenario ids currently in `scenarios:archive` (already ended).
 *   - For each, if the config still exists in KV and we're within SNAPSHOT_BUFFER_DAYS
 *     of KV expiry, snapshot config + top-50 leaderboard into `scenarios_archive` table.
 *   - After a successful snapshot, remove the id from the KV archive list so the
 *     list key doesn't grow forever — the Postgres row is authoritative now.
 *
 * Rerunnable: idempotent via `upsert onConflict: scenario_id`. Crashes mid-batch
 * leave partially-done work recoverable on next run.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import {
  SCENARIOS_ARCHIVE_KEY,
  scenarioConfigKey,
  scenarioLeaderboardKey,
  SCENARIO_KV_TTL_PAST_END_SECONDS,
} from '../_lib/leaderboard.js';

/** Snapshot when scenario is this close to KV expiry. 10 days gives slack for cron misses. */
const SNAPSHOT_BUFFER_DAYS = 10;
/** Entries captured per scenario. Matches leaderboard display cap. */
const ENTRIES_TO_SNAPSHOT = 50;

interface ArchiveRow {
  scenario_id: string;
  name: string;
  config_json: unknown;
  final_leaderboard_json: unknown;
  entry_count: number;
  top_score: number | null;
  start_date: string;
  end_date: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client not configured' });
  }

  try {
    const archivedIds = await readIdList(SCENARIOS_ARCHIVE_KEY);
    if (archivedIds.length === 0) {
      return res.status(200).json({ snapshotted: 0, skipped: 0, errors: 0, checked: 0 });
    }

    const now = Date.now();
    // Snapshot when (now - endDate) >= (SCENARIO_KV_TTL - BUFFER). Past that point,
    // KV keys will expire within BUFFER days — we snapshot NOW so nothing is lost.
    const snapshotAfterMs = (SCENARIO_KV_TTL_PAST_END_SECONDS - SNAPSHOT_BUFFER_DAYS * 86400) * 1000;

    let snapshotted = 0;
    let skipped = 0;
    let errors = 0;
    const snapshottedIds: string[] = [];

    for (const id of archivedIds) {
      try {
        const rawConfig = await kv.get<unknown>(scenarioConfigKey(id));
        if (!rawConfig) {
          // KV already expired — nothing to snapshot. Skip and mark for removal
          // from the archive list (the id is pointing at dead keys).
          skipped++;
          snapshottedIds.push(id); // mark for removal even though we didn't write
          continue;
        }
        const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
          skipped++;
          continue;
        }
        const c = config as Record<string, unknown>;
        const endMs = typeof c.endDate === 'string' ? Date.parse(c.endDate) : NaN;
        if (!Number.isFinite(endMs)) {
          skipped++;
          continue;
        }

        // Only snapshot when the scenario is deep enough past endDate that its KV
        // keys are approaching expiry. Earlier than that, leave it in KV — the
        // leaderboard may still be receiving late submissions (grace period aside).
        if (now - endMs < snapshotAfterMs) {
          skipped++;
          continue;
        }

        const { entries, topScore, entryCount } = await fetchLeaderboardSnapshot(id);

        const row: ArchiveRow = {
          scenario_id: id,
          name: String(c.name ?? ''),
          config_json: config,
          final_leaderboard_json: entries,
          entry_count: entryCount,
          top_score: topScore,
          start_date: String(c.startDate ?? new Date(0).toISOString()),
          end_date: String(c.endDate),
        };

        const { error } = await supabaseAdmin
          .from('scenarios_archive')
          .upsert(row, { onConflict: 'scenario_id' });

        if (error) {
          errors++;
          console.error(`scenario-archive: upsert failed for ${id}:`, error);
          continue;
        }

        snapshotted++;
        snapshottedIds.push(id);
      } catch (err) {
        errors++;
        console.error(`scenario-archive: loop error for ${id}:`, err);
      }
    }

    // Prune archived-list KV key: remove snapshotted ids so the list stays bounded.
    // Serial write — partial failure here just means the next run re-snapshots, which
    // is idempotent via upsert.
    if (snapshottedIds.length > 0) {
      try {
        const current = await readIdList(SCENARIOS_ARCHIVE_KEY);
        const pruned = current.filter(x => !snapshottedIds.includes(x));
        await kv.set(SCENARIOS_ARCHIVE_KEY, JSON.stringify(pruned));
      } catch (err) {
        console.error('scenario-archive: failed to prune archive list:', err);
      }
    }

    return res.status(200).json({
      snapshotted,
      skipped,
      errors,
      checked: archivedIds.length,
    });
  } catch (err) {
    console.error('scenario-archive: job failed:', err);
    return res.status(500).json({ error: 'Snapshot job failed' });
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
    console.error(`readIdList(${key}) failed:`, err);
    return [];
  }
}

async function fetchLeaderboardSnapshot(scenarioId: string): Promise<{
  entries: Array<Record<string, unknown>>;
  topScore: number | null;
  entryCount: number;
}> {
  const kvz = kv as unknown as {
    zcard: (key: string) => Promise<number>;
    zrange: (
      key: string,
      start: number,
      stop: number,
      opts?: { rev?: boolean; withScores?: boolean },
    ) => Promise<unknown[]>;
  };
  const lbKey = scenarioLeaderboardKey(scenarioId);
  const [entryCount, raw] = await Promise.all([
    kvz.zcard(lbKey),
    kvz.zrange(lbKey, 0, ENTRIES_TO_SNAPSHOT - 1, { rev: true, withScores: true }),
  ]);

  const entries: Array<Record<string, unknown>> = [];
  let topScore: number | null = null;

  for (let i = 0; i < raw.length; i += 2) {
    const member = raw[i];
    const sortScore = raw[i + 1];
    if (typeof member !== 'string' || typeof sortScore !== 'number') continue;
    try {
      const parsed = JSON.parse(member);
      if (parsed && typeof parsed === 'object' && !parsed.isAdminPreview) {
        entries.push({ ...parsed, rank: entries.length + 1, sortScore });
        if (topScore == null) topScore = sortScore;
      }
    } catch {
      // Skip malformed entries.
    }
  }

  return { entries, topScore, entryCount };
}
