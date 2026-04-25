/**
 * Admin CRUD for Scenario Challenges.
 *
 * Endpoints (single file, method-dispatched):
 *   GET    /api/admin/scenario-challenges           — list all (active + archived summaries)
 *   GET    /api/admin/scenario-challenges?id={id}   — get one full config
 *   POST   /api/admin/scenario-challenges           — create new scenario
 *   PUT    /api/admin/scenario-challenges           — update existing (body must include id)
 *   DELETE /api/admin/scenario-challenges?id={id}   — remove config + list entry + leaderboard
 *
 * All require admin session token (verifyAdminToken).
 *
 * Responsibilities:
 *   - Validate config via validateScenarioConfig (from src/data/scenarioChallenges.ts)
 *   - Activation requires errors.length === 0 (plan Section 1.2)
 *   - Write config to KV with TTL = endDate + 180d (computeScenarioKvTtl)
 *   - Maintain `scenarios:active` and `scenarios:archive` id lists
 *   - Never write to scenario:{id}:leaderboard here — that's the player submit endpoint
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import {
  scenarioConfigKey,
  scenarioLeaderboardKey,
  SCENARIOS_ACTIVE_KEY,
  SCENARIOS_ARCHIVE_KEY,
  computeScenarioKvTtl,
} from '../_lib/leaderboard.js';
import {
  validateScenarioConfig,
  migrateScenarioConfig,
} from '../../src/data/scenarioChallenges.js';
import type { ScenarioChallengeConfig } from '../../src/engine/types.js';

// Lowercase-only slug to match the `generate.ts` prompt spec and keep KV lookups
// case-consistent (KV is case-sensitive — `My-Scenario` stored would not match
// a lookup for `my-scenario`). Dara N2.
const SCENARIO_ID_REGEX = /^[a-z0-9-]{1,60}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authorized = await verifyAdminToken(req, res);
  if (!authorized) return;

  try {
    switch (req.method) {
      case 'GET':
        return handleGet(req, res);
      case 'POST':
        return handlePost(req, res);
      case 'PUT':
        return handlePut(req, res);
      case 'DELETE':
        return handleDelete(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('admin/scenario-challenges error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ── GET ───────────────────────────────────────────────────────────────────

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';

  if (id) {
    // Single-scenario fetch — full config for the wizard edit path.
    if (!SCENARIO_ID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid scenario id' });
    }
    const raw = await kv.get<unknown>(scenarioConfigKey(id));
    if (!raw) return res.status(404).json({ error: 'not found' });
    const config = readStoredConfig(raw);
    if (!config) return res.status(404).json({ error: 'config invalid' });
    return res.status(200).json({ scenario: config });
  }

  // List — merged active + archived summaries. Cheap for the admin dashboard event-history table.
  const [activeIds, archivedIds] = await Promise.all([
    readIdList(SCENARIOS_ACTIVE_KEY),
    readIdList(SCENARIOS_ARCHIVE_KEY),
  ]);
  const ids = Array.from(new Set([...activeIds, ...archivedIds]));

  const configs = await Promise.all(ids.map(async (sid) => {
    const raw = await kv.get<unknown>(scenarioConfigKey(sid));
    return readStoredConfig(raw);
  }));

  const summaries = configs
    .filter((c): c is ScenarioChallengeConfig => c !== null)
    .map(summarizeForAdmin);

  return res.status(200).json({ scenarios: summaries });
}

// ── POST (create) ─────────────────────────────────────────────────────────

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const config = readConfigValue(req.body);
  if (!config) {
    return res.status(400).json({ error: 'body must be a ScenarioChallengeConfig object' });
  }

  if (!SCENARIO_ID_REGEX.test(config.id)) {
    return res.status(400).json({ error: 'id must be alphanumeric + hyphens, 1-60 chars' });
  }

  // Prevent overwriting an existing scenario via POST — callers must use PUT.
  const existing = await kv.get<unknown>(scenarioConfigKey(config.id));
  if (existing) {
    return res.status(409).json({ error: `scenario '${config.id}' already exists — use PUT to update` });
  }

  const { errors, warnings } = validateScenarioConfig(config);

  // Activation gate: isActive/isFeatured may only be true if the config passes validation.
  if (errors.length > 0 && (config.isActive === true || config.isFeatured === true)) {
    return res.status(400).json({
      error: 'cannot activate or feature a scenario with validation errors',
      errors,
      warnings,
    });
  }

  await writeConfig(config);
  await rebuildListMemberships(config);

  return res.status(201).json({ scenario: config, errors, warnings });
}

// ── PUT (update) ──────────────────────────────────────────────────────────

async function handlePut(req: VercelRequest, res: VercelResponse) {
  const incoming = readConfigValue(req.body);
  if (!incoming) {
    return res.status(400).json({ error: 'body must be a ScenarioChallengeConfig object' });
  }
  if (!SCENARIO_ID_REGEX.test(incoming.id)) {
    return res.status(400).json({ error: 'id must be alphanumeric + hyphens, 1-60 chars' });
  }

  const prior = await kv.get<unknown>(scenarioConfigKey(incoming.id));
  if (!prior) {
    return res.status(404).json({ error: `scenario '${incoming.id}' does not exist — use POST to create` });
  }

  const { errors, warnings } = validateScenarioConfig(incoming);
  if (errors.length > 0 && (incoming.isActive || incoming.isFeatured)) {
    return res.status(400).json({
      error: 'cannot activate or feature a scenario with validation errors',
      errors,
      warnings,
    });
  }

  await writeConfig(incoming);
  await rebuildListMemberships(incoming);

  return res.status(200).json({ scenario: incoming, errors, warnings });
}

// ── DELETE ────────────────────────────────────────────────────────────────

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!id || !SCENARIO_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'invalid scenario id' });
  }

  // Intentional: does NOT cascade to Postgres `game_history`. Per plan §2,
  // player scenario completions are permanent history — admin delete only
  // removes the scenario config + leaderboard + list memberships from KV.
  // Dara M3.
  await kv.del(scenarioConfigKey(id));
  await kv.del(scenarioLeaderboardKey(id));

  const [activeIds, archivedIds] = await Promise.all([
    readIdList(SCENARIOS_ACTIVE_KEY),
    readIdList(SCENARIOS_ARCHIVE_KEY),
  ]);
  // Serial list updates: partial failure leaves at most one list inconsistent
  // (not both). Dara M4 — better failure semantics than Promise.all at admin scale.
  await kv.set(SCENARIOS_ACTIVE_KEY, JSON.stringify(activeIds.filter(x => x !== id)));
  await kv.set(SCENARIOS_ARCHIVE_KEY, JSON.stringify(archivedIds.filter(x => x !== id)));

  return res.status(200).json({ success: true, id });
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Safe parser for CRUD input (POST/PUT body). Minimal shape check only — just
 * enough to hand off to `validateScenarioConfig` for the real checks.
 *
 * We deliberately DO NOT migrate here: `migrateScenarioConfig` runs full
 * validation internally and returns null on errors, which would mask legit
 * drafts-with-errors behind a generic "invalid body" 400 (and prevent the
 * activation gate from firing with useful error detail).
 */
function readConfigValue(raw: unknown): ScenarioChallengeConfig | null {
  if (!raw) return null;
  const parsed = typeof raw === 'string' ? tryJsonParse(raw) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const c = parsed as Record<string, unknown>;
  // Minimal shape: must have a string id at minimum. Everything else is validateScenarioConfig's job.
  if (typeof c.id !== 'string' || c.id.length === 0) return null;
  return c as unknown as ScenarioChallengeConfig;
}

/**
 * Read a stored config from KV and migrate if older schema. Separate from
 * `readConfigValue` because stored KV configs DO benefit from migration.
 */
function readStoredConfig(raw: unknown): ScenarioChallengeConfig | null {
  if (!raw) return null;
  const parsed = typeof raw === 'string' ? tryJsonParse(raw) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return migrateScenarioConfig(parsed);
}

function tryJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

async function readIdList(key: string): Promise<string[]> {
  try {
    const raw = await kv.get<unknown>(key);
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? tryJsonParse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch (err) {
    console.error(`${key} read failed:`, err);
    return [];
  }
}

/**
 * Write config JSON to KV with TTL = endDate + 180d (clamped).
 *
 * Normalizes `isActive`/`isFeatured` to `false` when the scenario is already
 * past its endDate — keeps the stored flag in lockstep with list membership
 * (see `rebuildListMemberships`). Without this, an expired `isActive: true`
 * scenario would appear "archived" in the lists but "active" in the stored
 * config, relying on two separate fences to hide it from players. Dara H1.
 */
export async function writeConfig(config: ScenarioChallengeConfig): Promise<void> {
  const endMs = Date.parse(config.endDate);
  if (Number.isFinite(endMs) && Date.now() > endMs) {
    config.isActive = false;
    config.isFeatured = false;
  }
  const ttl = computeScenarioKvTtl(config.endDate);
  await kv.set(scenarioConfigKey(config.id), JSON.stringify(config), { ex: ttl });
}

/**
 * Update `scenarios:active` and `scenarios:archive` memberships based on
 * the scenario's `isActive` flag and whether `endDate` has passed.
 *
 * - isActive + endDate in future → in active list
 * - !isActive OR endDate in past → in archive list
 *
 * The lists are authoritative — admins may pre-stage a scenario (isActive=false)
 * and only activate it later, which flips it from archive → active.
 */
export async function rebuildListMemberships(config: ScenarioChallengeConfig): Promise<void> {
  const endMs = Date.parse(config.endDate);
  const expired = Number.isFinite(endMs) && Date.now() > endMs;
  const belongsActive = config.isActive && !expired;

  const [activeIds, archivedIds] = await Promise.all([
    readIdList(SCENARIOS_ACTIVE_KEY),
    readIdList(SCENARIOS_ARCHIVE_KEY),
  ]);

  const activeSet = new Set(activeIds);
  const archiveSet = new Set(archivedIds);

  if (belongsActive) {
    activeSet.add(config.id);
    archiveSet.delete(config.id);
  } else {
    activeSet.delete(config.id);
    archiveSet.add(config.id);
  }

  // Serial writes: partial failure leaves at most one list inconsistent, not both.
  // Active-list write first so a scenario flipped INTO active is discoverable
  // before the archive-cleanup is applied. Dara M4.
  await kv.set(SCENARIOS_ACTIVE_KEY, JSON.stringify([...activeSet]));
  await kv.set(SCENARIOS_ARCHIVE_KEY, JSON.stringify([...archiveSet]));
}

/** Compact admin summary — keeps list payload small for event-history table. */
function summarizeForAdmin(c: ScenarioChallengeConfig) {
  return {
    id: c.id,
    name: c.name,
    tagline: c.tagline,
    theme: c.theme,
    startDate: c.startDate,
    endDate: c.endDate,
    isActive: c.isActive,
    isFeatured: c.isFeatured,
    difficulty: c.difficulty,
    duration: c.duration,
    maxRounds: c.maxRounds,
    rankingMetric: c.rankingMetric,
    isPE: !!c.fundStructure,
    configVersion: c.configVersion,
  };
}
