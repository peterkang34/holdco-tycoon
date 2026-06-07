/**
 * Admin: draft narrative TEXT for a scenario from its chosen vectors. This is the one
 * sanctioned use of AI in authoring — flavor prose only (tagline + description + an optional
 * name suggestion), never the config itself. The admin can edit or regenerate freely.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../../_lib/adminAuth.js';
import { callAnthropic, ANTHROPIC_API_KEY, AI_MODEL } from '../../_lib/ai.js';

interface NarrativeRequest {
  name?: string;
  difficulty?: string;
  durationYears?: number;
  isPE?: boolean;
  sectors?: string[];          // friendly sector names, or [] for "any"
  interestRatePct?: number;
  startingBusinesses?: string[]; // short descriptors e.g. "Q3 home-services, $1.2M EBITDA"
  rankingMetric?: string;
  forcedEvents?: string[];     // e.g. ["recession in year 2"]
}

const SYSTEM = `You write punchy flavor copy for a business-strategy game's "scenario challenges".
Given a scenario's parameters, return JSON ONLY (no prose, no markdown fences) with exactly these keys:
{"name": string, "tagline": string, "description": string}
- name: a short, evocative title (<= 40 chars). Only suggest one if the given name is empty or generic ("New Scenario"); otherwise echo the given name.
- tagline: one punchy hook, <= 90 chars, no period needed.
- description: 2-3 sentences (<= 400 chars) that set the stakes and the lesson. Concrete, grounded in real holdco/PE/search-fund dynamics. No hype words like "embark", "unleash", "dive in".
Voice: direct, confident, a little wry. Never mention "the game" or "players" — address the challenge in-world.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await verifyAdminToken(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI not configured' });

  const v = (req.body ?? {}) as NarrativeRequest;
  const lines = [
    `Name so far: ${v.name || '(none)'}`,
    `Mode: ${v.isPE ? 'PE fund (LP capital, carry, fund clock)' : 'holdco (own and compound)'}`,
    `Length: ${v.durationYears ?? '?'} years, difficulty ${v.difficulty ?? '?'}`,
    `Sectors: ${v.sectors && v.sectors.length ? v.sectors.join(', ') : 'any sector'}`,
    v.interestRatePct != null ? `Interest rate: ${v.interestRatePct}%` : '',
    v.startingBusinesses && v.startingBusinesses.length ? `Starts with: ${v.startingBusinesses.join('; ')}` : 'Starts capital-only',
    v.forcedEvents && v.forcedEvents.length ? `Scripted events: ${v.forcedEvents.join('; ')}` : '',
    `Ranked by: ${v.rankingMetric ?? 'FEV'}`,
  ].filter(Boolean);
  const prompt = `Write the title/tagline/description for this scenario:\n${lines.join('\n')}`;

  const { content, error } = await callAnthropic(prompt, 500, SYSTEM, 15000, AI_MODEL);
  if (!content) return res.status(502).json({ error: error || 'AI returned nothing' });

  // Extract the JSON object (model is told to return raw JSON, but be defensive).
  try {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    const parsed = JSON.parse(content.slice(start, end + 1));
    return res.status(200).json({
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 80) : undefined,
      tagline: typeof parsed.tagline === 'string' ? parsed.tagline.slice(0, 120) : '',
      description: typeof parsed.description === 'string' ? parsed.description.slice(0, 500) : '',
    });
  } catch {
    return res.status(502).json({ error: 'Could not parse AI response' });
  }
}
