/**
 * POST /api/admin/scenario-challenges/generate
 *
 * Takes a plaintext description of a scenario from the admin and returns a
 * populated `ScenarioChallengeConfig` draft. Haiku-driven via _lib/ai.ts,
 * 15s timeout, output validated by `validateScenarioConfig` before return.
 *
 * Rate limit: soft 20/day per admin token (Dara-recommended floor).
 *
 * Response shape:
 *   { config: ScenarioChallengeConfig, errors: string[], warnings: string[], usage: { used, limit } }
 *
 * If validation fails, the draft is still returned (admin can fix it in the
 * wizard) but errors are surfaced so the UI can show them inline.
 *
 * Plan reference: scenario-challenges.md §7.1 (Path A: AI Generation) +
 * §7.2 (validation guards + rate limit).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { verifyAdminToken } from '../../_lib/adminAuth.js';
import { callAnthropic, ANTHROPIC_API_KEY } from '../../_lib/ai.js';
import { isBodyTooLarge } from '../../_lib/rateLimit.js';
import {
  validateScenarioConfig,
  CURRENT_SCENARIO_CONFIG_VERSION,
  FORCEABLE_EVENT_TYPES,
} from '../../../src/data/scenarioChallenges.js';
import { SECTORS } from '../../../src/data/sectors.js';
import type { ScenarioChallengeConfig } from '../../../src/engine/types.js';

const GENERATION_TIMEOUT_MS = 15_000;
const MAX_TOKENS = 4096;
const DAILY_LIMIT = 20;
const RATE_LIMIT_KEY_TTL = 48 * 60 * 60; // 48h — safety net past day boundary

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorized = await verifyAdminToken(req, res);
  if (!authorized) return;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  if (isBodyTooLarge(req.body, 5_000)) {
    return res.status(413).json({ error: 'Request too large' });
  }

  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!description || description.length < 10 || description.length > 2_000) {
    return res.status(400).json({ error: 'description must be 10-2000 characters' });
  }

  // Rate limit: 20 generations per admin per day.
  const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
  const tokenFingerprint = token.slice(0, 16); // avoid full-token in KV key
  const dayKey = new Date().toISOString().slice(0, 10);
  const rateLimitKey = `admin:scenario-gen-count:${tokenFingerprint}:${dayKey}`;

  let usedCount: number;
  try {
    usedCount = (await kv.incr(rateLimitKey)) ?? 1;
    if (usedCount === 1) await kv.expire(rateLimitKey, RATE_LIMIT_KEY_TTL);
  } catch (err) {
    // Dara H3: fail CLOSED on KV outage. Without a working counter we can't
    // enforce the 20/day cap; a sustained KV outage would uncap Haiku spend
    // (~$0.02/call, compounds). 503 tells the admin to retry; once KV
    // recovers the next call proceeds normally.
    console.error('scenario-gen rate-limit kv failed:', err);
    return res.status(503).json({ error: 'Rate-limit check unavailable — retry in a moment' });
  }
  if (usedCount > DAILY_LIMIT) {
    return res.status(429).json({
      error: `Daily generation limit reached (${DAILY_LIMIT}/day). Use the manual wizard or try again tomorrow.`,
      usage: { used: usedCount, limit: DAILY_LIMIT },
    });
  }

  // Build system prompt + user prompt.
  const systemMessage = buildSystemPrompt();
  const userPrompt = buildUserPrompt(description);

  const { content, error } = await callAnthropic(userPrompt, MAX_TOKENS, systemMessage, GENERATION_TIMEOUT_MS);
  if (!content) {
    return res.status(502).json({ error: error ?? 'AI generation failed', usage: { used: usedCount, limit: DAILY_LIMIT } });
  }

  // Extract JSON from the response. Haiku may wrap in ```json blocks or prose.
  const jsonText = extractJson(content);
  if (!jsonText) {
    return res.status(502).json({
      error: 'AI response did not contain valid JSON — regenerate or use the manual wizard',
      rawResponse: content.slice(0, 1_000),
      usage: { used: usedCount, limit: DAILY_LIMIT },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return res.status(502).json({
      error: 'AI returned malformed JSON — regenerate',
      parseError: err instanceof Error ? err.message : String(err),
      rawResponse: content.slice(0, 1_000),
      usage: { used: usedCount, limit: DAILY_LIMIT },
    });
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return res.status(502).json({ error: 'AI output was not an object', usage: { used: usedCount, limit: DAILY_LIMIT } });
  }

  // Backfill fields the AI likely omitted. `configVersion` is always our current value.
  const config = backfillDefaults(parsed as Record<string, unknown>);

  // Run through validateScenarioConfig — admins get errors/warnings inline in the wizard.
  const { errors, warnings } = validateScenarioConfig(config);

  return res.status(200).json({
    config,
    errors,
    warnings,
    usage: { used: usedCount, limit: DAILY_LIMIT },
  });
}

// ── Prompt builders ──────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const sectorList = Object.keys(SECTORS).join(', ');
  const forceableEvents = FORCEABLE_EVENT_TYPES.join(', ');

  return `You generate Scenario Challenge configs for Holdco Tycoon, a holding-company strategy game.

Output a single JSON object matching this TypeScript shape:

{
  id: string,            // lowercase-hyphen slug, 1-60 chars, matches /^[a-z0-9-]+$/
  name: string,          // display name, max 80 chars
  tagline: string,       // short hook for home banner
  description: string,   // longer narrative (can be multi-sentence)
  configVersion: ${CURRENT_SCENARIO_CONFIG_VERSION},
  theme: { emoji: string, color: string },  // color = Tailwind amber/sector hex
  startDate: string,     // ISO 8601
  endDate: string,       // ISO 8601, must be after startDate
  isActive: false,       // admin activates after review
  isFeatured: false,
  seed: number,          // any positive integer
  difficulty: "easy" | "normal",
  duration: "quick" | "standard",   // "quick" = 10-year feel, "standard" = 20-year feel
  maxRounds: number,     // integer, HARD CAP [3, 30]. NEVER output values outside this range.
  startingCash: number,  // in thousands ($K), >= 0
  startingDebt: number,  // >= 0
  founderShares: number,
  sharesOutstanding: number,   // must be > 0 and >= founderShares
  startingBusinesses: Array<{
    name: string,
    sectorId: SectorId,
    subType?: string,    // must exist in SECTORS[sectorId].subTypes
    ebitda: number,      // positive ($K)
    multiple: number,    // positive
    quality: 1 | 2 | 3 | 4 | 5,
    status?: "active" | "distressed",
    backstory?: string,
  }>,
  rankingMetric: "fev" | "moic" | "irr" | "gpCarry" | "cashOnCash",
  // Non-PE scenarios MUST use "fev".
  // PE scenarios (with fundStructure set) CANNOT use "fev".
}

Valid sector ids: ${sectorList}
Valid forceable event types (for forcedEvents): ${forceableEvents}

Optional fields you may include:
  allowedSectors: SectorId[],          // restrict deal generation
  allowedSubTypes: string[],
  disabledFeatures: { ipo?: boolean, equityRaise?: boolean, ... },
  curatedDeals: { [round]: CuratedDeal[] },
  forcedEvents: { [round]: { type, customTitle?, customDescription?, consolidationSectorId? } },
  startingInterestRate: number,        // [0, 0.25]
  startingMaSourcingTier: number,      // [0, 3]
  maxAcquisitionsPerRound: number,     // >= 1
  fundStructure: { committedCapital, mgmtFeePercent, hurdleRate, carryRate, forcedLiquidationDiscount, forcedLiquidationYear? },

Rules:
- Output ONLY the JSON object. No prose, no markdown code fences, no commentary.
- Every sectorId must be from the valid list above.
- If unsure about a field, omit it rather than guessing.
- configVersion is always ${CURRENT_SCENARIO_CONFIG_VERSION}.
- Default isActive: false and isFeatured: false — the admin reviews before activating.
- Dates should be set to start today (current date) and end 30-60 days later unless the description says otherwise.

maxRounds rules (CRITICAL — prior outputs have failed validation here):
- maxRounds MUST be an integer between 3 and 30 inclusive. Values outside this range FAIL validation and waste the admin's time.
- If the description says "N-year" or "N years" (e.g., "10-year roll-up", "15 years of recession"), set maxRounds = N. Do NOT inflate.
- If N > 30, CAP at 30 — do not output 40, 50, or higher. The cap is non-negotiable.
- If N < 3, use 3. The floor is non-negotiable.
- If the description gives no duration hint, default to 10 (matches duration: "quick") or 20 (matches "standard").

duration / maxRounds consistency:
- duration: "quick" pairs with maxRounds ≤ 10.
- duration: "standard" pairs with maxRounds > 10 (typically 15-30).
- The two fields should agree; don't set duration: "standard" with maxRounds: 10.

rankingMetric rules:
- Non-PE scenarios (no fundStructure) MUST use rankingMetric: "fev". Other values (moic, irr, gpCarry, cashOnCash) are PE-only and will fail validation.
- If the description mentions "PE fund", "carry", "MOIC", "IRR", "LPs", or "fund manager" → include fundStructure AND set rankingMetric to one of moic / irr / gpCarry / cashOnCash.`;
}

function buildUserPrompt(description: string): string {
  return `Description of the scenario to generate:

${description}

Output the ScenarioChallengeConfig JSON now.`;
}

// ── Response extraction ──────────────────────────────────────────────────

/**
 * Pull JSON out of Haiku's response. Handles:
 *   - Raw JSON object (preferred — we asked for it)
 *   - ```json ... ``` code fence
 *   - ``` ... ``` unlabeled fence
 *   - Prose with a single embedded JSON object (balanced-brace scan)
 *
 * Dara H2: the previous first-brace/last-brace fallback would grab text
 * between two separate JSON objects (e.g., "example: {a:1}, real: {b:2}" →
 * grabs `{a:1}, real: {b:2}` which fails JSON.parse). Balanced-brace is the
 * right tool — scan from the first `{`, count { and } (respecting string
 * escapes), return the first complete top-level object.
 */
function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return trimmed;

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch?.[1]?.trim().startsWith('{')) return fenceMatch[1].trim();

  const firstBrace = trimmed.indexOf('{');
  if (firstBrace < 0) return null;
  return extractBalancedObject(trimmed, firstBrace);
}

/**
 * Scan from `start` (which must be a `{`), returning the substring of the
 * first balanced `{...}` block. Respects string escapes so `"}"` inside a
 * string doesn't close the top-level object. Returns null if unbalanced.
 */
function extractBalancedObject(s: string, start: number): string | null {
  if (s[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Backfill fields the AI often omits — ensures validateScenarioConfig sees a
 * complete-enough object to produce useful errors vs "missing field X" spam.
 */
function backfillDefaults(raw: Record<string, unknown>): ScenarioChallengeConfig {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const c = { ...raw } as Record<string, unknown>;
  c.configVersion = CURRENT_SCENARIO_CONFIG_VERSION;
  if (typeof c.startDate !== 'string') c.startDate = now.toISOString();
  if (typeof c.endDate !== 'string') c.endDate = thirtyDaysOut.toISOString();
  if (typeof c.isActive !== 'boolean') c.isActive = false;
  if (typeof c.isFeatured !== 'boolean') c.isFeatured = false;
  if (typeof c.seed !== 'number') c.seed = Math.floor(Math.random() * 1_000_000);
  if (!c.theme || typeof c.theme !== 'object') c.theme = { emoji: '🎯', color: '#F59E0B' };
  if (!Array.isArray(c.startingBusinesses)) c.startingBusinesses = [];
  if (typeof c.difficulty !== 'string') c.difficulty = 'easy';
  if (typeof c.duration !== 'string') c.duration = 'quick';
  if (typeof c.maxRounds !== 'number') c.maxRounds = 10;
  if (typeof c.startingCash !== 'number') c.startingCash = 5_000;
  if (typeof c.startingDebt !== 'number') c.startingDebt = 0;
  if (typeof c.founderShares !== 'number') c.founderShares = 800;
  if (typeof c.sharesOutstanding !== 'number') c.sharesOutstanding = 1_000;
  if (typeof c.rankingMetric !== 'string') c.rankingMetric = c.fundStructure ? 'moic' : 'fev';

  return c as unknown as ScenarioChallengeConfig;
}
