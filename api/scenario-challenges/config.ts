/**
 * GET /api/scenario-challenges/config?id={scenarioId}
 *
 * Returns the full `ScenarioChallengeConfig` for one scenario — the payload
 * `startScenarioChallenge` needs on the client side (startingBusinesses,
 * curatedDeals, forcedEvents, fundStructure, etc). Distinct from
 * `active.ts` (home banner summary) and `leaderboard.ts` (entries only).
 *
 * Only returns configs where `isActive === true` — archived scenarios
 * should be viewed via the leaderboard modal, not played.
 *
 * No auth, short cache. Read-only.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { scenarioConfigKey } from '../_lib/leaderboard.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const scenarioId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!scenarioId || !/^[a-z0-9-]{1,60}$/.test(scenarioId)) {
    return res.status(400).json({ error: 'id must be a valid scenario slug' });
  }

  try {
    const raw = await kv.get<unknown>(scenarioConfigKey(scenarioId));
    if (!raw) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    const config = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(404).json({ error: 'Scenario config invalid' });
    }

    // Guard against serving inactive scenarios as playable. Archived/expired
    // scenarios are viewable via the leaderboard modal only.
    //
    // Intentional asymmetry (Dara M6): `submit.ts` does NOT re-check `isActive`
    // when a completion lands — in-flight games are grandfathered. Players who
    // entered a scenario while it was active finish under its rules even if the
    // admin deactivates mid-game. This endpoint gates the ENTRY; submit gates
    // the SUBMISSION (via endDate + 24h grace). Do not "fix" the submit path
    // to add isActive — that would penalize players for admin-side state changes.
    const c = config as Record<string, unknown>;
    if (c.isActive !== true) {
      return res.status(410).json({ error: 'Scenario is not currently active' });
    }

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ config: c });
  } catch (err) {
    console.error('scenario-challenges/config error:', err);
    return res.status(500).json({ error: 'Failed to fetch scenario config' });
  }
}
