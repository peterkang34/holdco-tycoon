import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { getClientIp } from '../_lib/rateLimit.js';
import { getMonthKey, getWeekKey, getDurationBucket, getSophisticationBucket, validateTelemetryPayload, getFevBucket } from '../_lib/telemetry.js';

const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);

  // Rate limit: 30 req/min/IP
  try {
    const rateLimitKey = `ratelimit:telemetry:${ip}`;
    const count = await kv.incr(rateLimitKey);
    if (count === 1) {
      await kv.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }
    if (count > RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Rate limited' });
    }
  } catch {
    // Fail-open on rate limit errors
  }

  // Validate payload
  const payload = validateTelemetryPayload(req.body);
  if (!payload.valid) {
    // Don't leak validation details — always return ok
    return res.status(200).json({ ok: true });
  }

  const {
    event, difficulty, duration, sector, round, grade, fev, sessionId,
    playerId, gameNumber, isChallenge, device, sessionDurationMs, referrer,
    isScoreboard,
    // Phase 2
    strategyArchetype, antiPatterns, sophisticationScore, platformsForged,
    dealStructureTypes,
    // Phase 5 ending business profile
    endingSubTypes, avgEndingEbitda, endingConstruction,
    // Phase 3
    challengeCode, shareMethod,
    // Phase 4
    feature, eventType, choiceAction,
  } = payload;
  const monthKey = getMonthKey();

  try {
    if (event === 'game_start') {
      // Session dedup: skip if we've already seen this sessionId
      const seenKey = `t:seen:${sessionId}`;
      const alreadySeen = await kv.get(seenKey);
      if (alreadySeen) {
        return res.status(200).json({ ok: true });
      }

      // Player lifecycle: first-seen (NX = only set if not exists)
      if (playerId) {
        await kv.set(`pid:${playerId}:first_seen`, new Date().toISOString(), { nx: true });
      }

      const pipe = kv.pipeline();
      pipe.set(seenKey, 1, { ex: 86400 });
      pipe.incr('t:started');
      pipe.incr(`t:started:${monthKey}`);
      pipe.hincrby(`t:cfg:${monthKey}`, `${difficulty}:${duration}`, 1);
      pipe.hincrby(`t:sector:${monthKey}`, sector!, 1);
      pipe.sadd(`t:uv:${monthKey}`, ip);

      // Phase 1: device, returning, nth-game
      if (device) {
        pipe.hincrby(`t:device:${monthKey}`, device, 1);
      }
      if (gameNumber != null) {
        if (gameNumber === 1) {
          pipe.hincrby(`t:returning:${monthKey}`, 'new', 1);
        } else {
          pipe.hincrby(`t:returning:${monthKey}`, 'returning', 1);
        }
        pipe.hincrby(`t:start_by_nth:${monthKey}`, gameNumber <= 3 ? String(gameNumber) : '4+', 1);
      }

      // Player lifecycle: last active + game count
      if (playerId) {
        pipe.set(`pid:${playerId}:last_active`, new Date().toISOString());
        pipe.incr(`pid:${playerId}:games`);
      }

      // Challenge tracking on start
      if (isChallenge) {
        pipe.incr(`t:challenge:${monthKey}:started`);
      }

      // Cohort tracking (Phase 5)
      if (playerId) {
        try {
          const firstSeen = await kv.get(`pid:${playerId}:first_seen`);
          if (firstSeen && typeof firstSeen === 'string') {
            const firstSeenWeek = getWeekKey(new Date(firstSeen));
            const currentWeek = getWeekKey();
            pipe.sadd(`t:cohort:${firstSeenWeek}:active:${currentWeek}`, playerId);
          }
        } catch {
          // Non-critical
        }
      }

      await pipe.exec();
    } else if (event === 'game_complete') {
      const pipe = kv.pipeline();
      pipe.incr('t:completed');
      pipe.incr(`t:completed:${monthKey}`);
      pipe.hincrby(`t:rounds:${monthKey}`, String(round), 1);
      pipe.hincrby(`t:grades:${monthKey}`, grade!, 1);
      pipe.hincrby(`t:fev:${monthKey}`, getFevBucket(fev!), 1);

      // Phase 1: device, duration, nth-game completions
      if (device) {
        pipe.hincrby(`t:device:complete:${monthKey}`, device, 1);
      }
      if (sessionDurationMs != null) {
        pipe.hincrby(`t:duration:${monthKey}`, getDurationBucket(sessionDurationMs), 1);
      }
      if (gameNumber != null) {
        pipe.hincrby(`t:complete_by_nth:${monthKey}`, gameNumber <= 3 ? String(gameNumber) : '4+', 1);
      }

      // Challenge completion
      if (isChallenge) {
        pipe.incr(`t:challenge:${monthKey}:completed`);
      }

      // Phase 2: snapshot aggregations
      if (strategyArchetype) {
        pipe.hincrby(`t:archetype:${monthKey}`, strategyArchetype, 1);
      }
      if (antiPatterns && antiPatterns.length > 0) {
        for (const ap of antiPatterns) {
          pipe.hincrby(`t:antipattern:${monthKey}`, ap, 1);
        }
      }
      if (sophisticationScore != null) {
        pipe.hincrby(`t:sophistication:${monthKey}`, getSophisticationBucket(sophisticationScore), 1);
      }
      if (dealStructureTypes) {
        const topStructure = Object.entries(dealStructureTypes).sort((a, b) => b[1] - a[1])[0];
        if (topStructure) {
          pipe.hincrby(`t:structures:${monthKey}`, topStructure[0], 1);
        }
      }
      if (platformsForged != null) {
        pipe.hincrby(`t:platforms_forged:${monthKey}`, String(platformsForged), 1);
      }

      // Phase 5: ending business profile
      if (endingSubTypes) {
        for (const [subType, count] of Object.entries(endingSubTypes)) {
          pipe.hincrby(`t:ending_subtypes:${monthKey}`, subType, count);
        }
      }
      if (avgEndingEbitda != null && avgEndingEbitda > 0) {
        pipe.hincrby(`t:ending_ebitda:${monthKey}:sum`, 'total', avgEndingEbitda);
        pipe.hincrby(`t:ending_ebitda:${monthKey}:sum`, 'count', 1);
      }
      if (endingConstruction) {
        for (const [type, count] of Object.entries(endingConstruction)) {
          pipe.hincrby(`t:ending_construction:${monthKey}`, type, count);
        }
      }

      await pipe.exec();
    } else if (event === 'game_abandon') {
      const pipe = kv.pipeline();
      pipe.hincrby(`t:abandon:${monthKey}`, String(round), 1);

      // Phase 1: device, duration bucket
      if (device) {
        pipe.hincrby(`t:device:abandon:${monthKey}`, device, 1);
      }
      if (sessionDurationMs != null && round != null) {
        pipe.hincrby(`t:abandon:duration:${monthKey}`, `R${round}-${getDurationBucket(sessionDurationMs)}`, 1);
      }

      await pipe.exec();
    } else if (event === 'page_view') {
      const pipe = kv.pipeline();
      pipe.incr(`t:views:${monthKey}`);
      if (device) {
        pipe.hincrby(`t:views:device:${monthKey}`, device, 1);
      }
      if (isChallenge) {
        pipe.incr(`t:challenge:${monthKey}:joined`);
      }
      await pipe.exec();
    } else if (event === 'challenge_create') {
      const pipe = kv.pipeline();
      pipe.incr(`t:challenge:${monthKey}:created`);
      await pipe.exec();
    } else if (event === 'challenge_share') {
      const pipe = kv.pipeline();
      pipe.incr(`t:challenge:${monthKey}:shared`);
      await pipe.exec();
    } else if (event === 'scoreboard_view') {
      const pipe = kv.pipeline();
      pipe.incr(`t:challenge:${monthKey}:scoreboard_views`);
      await pipe.exec();
    } else if (event === 'feature_used') {
      if (feature) {
        const pipe = kv.pipeline();
        pipe.hincrby(`t:features:${monthKey}`, feature, 1);
        if (gameNumber != null) {
          const bucket = gameNumber <= 3 ? String(gameNumber) : '4+';
          pipe.hincrby(`t:features:nth:${bucket}:${monthKey}`, feature, 1);
        }
        await pipe.exec();
      }
    } else if (event === 'event_choice') {
      if (eventType && choiceAction) {
        const pipe = kv.pipeline();
        pipe.hincrby(`t:choices:${monthKey}`, `${eventType}:${choiceAction}`, 1);
        await pipe.exec();
      }
    }
  } catch {
    // Silent failure — telemetry should never block the client
  }

  return res.status(200).json({ ok: true });
}
