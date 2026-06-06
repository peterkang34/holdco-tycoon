/**
 * Shared scenario-leaderboard archival. Snapshots a scenario's config + top-N leaderboard
 * into the Postgres `scenarios_archive` table. Used by BOTH the weekly archive cron (for
 * scenarios approaching KV expiry) AND admin Delete (so deleting a live, entry-bearing
 * scenario doesn't destroy its ranked board with no durable record).
 */
import { kv } from '@vercel/kv';
import { supabaseAdmin } from './supabaseAdmin.js';
import { scenarioLeaderboardKey } from './leaderboard.js';

/** Entries captured per scenario. Matches the leaderboard display cap. */
export const ENTRIES_TO_SNAPSHOT = 50;

export interface ArchiveRow {
  scenario_id: string;
  name: string;
  config_json: unknown;
  final_leaderboard_json: unknown;
  entry_count: number;
  top_score: number | null;
  start_date: string;
  end_date: string;
}

/** Read the top-N leaderboard entries (excluding admin previews) for a scenario. */
export async function fetchLeaderboardSnapshot(scenarioId: string): Promise<{
  entries: Array<Record<string, unknown>>;
  topScore: number | null;
  entryCount: number;
}> {
  const kvz = kv as unknown as {
    zcard: (key: string) => Promise<number>;
    zrange: (
      key: string, start: number, stop: number,
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
    } catch { /* skip malformed */ }
  }
  return { entries, topScore, entryCount };
}

/** Minimal config shape needed to build an archive row. */
interface ArchivableConfig {
  id: string;
  name?: string;
  startDate?: string;
  endDate: string;
}

/**
 * Snapshot a scenario's leaderboard to Postgres. Idempotent (upsert on scenario_id).
 * Returns `{ ok, entryCount }`. A scenario with zero entries is a no-op success (nothing
 * worth archiving). `ok: false` with `entryCount > 0` means the durable write failed — the
 * caller (Delete) should ABORT rather than destroy the only ranked record.
 */
export async function snapshotScenarioToArchive(
  config: ArchivableConfig,
): Promise<{ ok: boolean; entryCount: number; error?: string }> {
  if (!supabaseAdmin) return { ok: false, entryCount: 0, error: 'supabase admin not configured' };

  const { entries, topScore, entryCount } = await fetchLeaderboardSnapshot(config.id);
  if (entryCount === 0) return { ok: true, entryCount: 0 };

  const row: ArchiveRow = {
    scenario_id: config.id,
    name: String(config.name ?? ''),
    config_json: config,
    final_leaderboard_json: entries,
    entry_count: entryCount,
    top_score: topScore,
    start_date: String(config.startDate ?? new Date(0).toISOString()),
    end_date: String(config.endDate),
  };

  const { error } = await supabaseAdmin.from('scenarios_archive').upsert(row, { onConflict: 'scenario_id' });
  return { ok: !error, entryCount, error: error?.message };
}
