/**
 * POST /api/admin/scenario-challenges/seed-presets
 *
 * One-shot admin endpoint that bulk-writes a curated preset bundle of scenarios
 * into KV (so they appear in the admin Scenario Challenges tab). Idempotent:
 * existing scenarios with matching ids are overwritten with the latest preset
 * definition. All written scenarios start `isActive: false, isFeatured: false`
 * so the admin reviews + activates each manually before players can play them.
 *
 * Usage:
 *   POST /api/admin/scenario-challenges/seed-presets
 *     body: { preset: 'road-to-carry' }   (default if omitted)
 *
 * Response:
 *   { written: string[], skipped: { id, reason }[], total: number }
 *
 * Auth: requires admin token (verifyAdminToken).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { verifyAdminToken } from '../../_lib/adminAuth.js';
import { scenarioConfigKey } from '../../_lib/leaderboard.js';
import { validateScenarioConfig } from '../../../src/data/scenarioChallenges.js';
import { buildRoadToCarryPresets } from '../../../src/data/presetScenarios/roadToCarry.js';
import { writeConfig, rebuildListMemberships } from '../scenario-challenges.js';
import type { ScenarioChallengeConfig } from '../../../src/engine/types.js';

type PresetName = 'road-to-carry';

const PRESETS: Record<PresetName, () => ScenarioChallengeConfig[]> = {
  'road-to-carry': () => buildRoadToCarryPresets(),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorized = await verifyAdminToken(req, res);
  if (!authorized) return;

  const presetName: PresetName =
    (req.body?.preset as PresetName) || 'road-to-carry';
  if (!(presetName in PRESETS)) {
    return res.status(400).json({
      error: `Unknown preset '${presetName}'. Valid: ${Object.keys(PRESETS).join(', ')}`,
    });
  }

  let scenarios: ScenarioChallengeConfig[];
  try {
    scenarios = PRESETS[presetName]();
  } catch (err) {
    console.error('seed-presets: preset build failed:', err);
    return res.status(500).json({ error: 'Failed to build preset scenarios' });
  }

  const written: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const config of scenarios) {
    try {
      // Validate before writing — refuse to seed scenarios with errors.
      const { errors, warnings } = validateScenarioConfig(config);
      if (errors.length > 0) {
        skipped.push({
          id: config.id,
          reason: `validation errors: ${errors.join('; ')}`,
        });
        continue;
      }
      // Probe whether the id already exists; we overwrite either way (idempotent),
      // but the response distinguishes "created" vs "updated" for clarity.
      const prior = await kv.get<unknown>(scenarioConfigKey(config.id));
      await writeConfig(config);
      await rebuildListMemberships(config);
      written.push(prior ? `${config.id} (updated)` : `${config.id} (created)`);
      if (warnings.length > 0) {
        console.info(`seed-presets: ${config.id} warnings:`, warnings);
      }
    } catch (err) {
      console.error(`seed-presets: failed to write ${config.id}:`, err);
      skipped.push({
        id: config.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return res.status(200).json({
    written,
    skipped,
    total: scenarios.length,
  });
}
