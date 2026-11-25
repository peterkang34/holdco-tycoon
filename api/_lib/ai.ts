import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { checkAIRateLimit, isBodyTooLarge, sanitizeString } from './rateLimit.js';

export const AI_MODEL = 'claude-haiku-4-5-20251001';
// Sonnet 4.6 — used for tasks that need stricter schema/exact-string adherence
// (admin scenario generation). Higher per-call cost is fine because volume is
// rate-limited; do NOT swap this in for high-volume player-facing flows.
export const AI_MODEL_STRUCTURED = 'claude-sonnet-4-6';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Global (all-IP) daily cap on AI calls — a cost backstop behind the per-IP limit, so
 * IP rotation can't turn these public endpoints into an unbounded Anthropic proxy.
 * Override with AI_DAILY_CALL_LIMIT. Fails open on KV errors, like the per-IP limiter.
 * Default is generous (a 20-yr game can make 100+ calls via chronicles/business updates/deals,
 * ~$0.003 each → ~$60/day ceiling). Over the cap, the client falls back to non-AI content.
 * The `ai:daily:YYYY-MM-DD` counter doubles as real volume data for tuning this.
 */
const DEFAULT_AI_DAILY_CALL_LIMIT = 20000;

async function isAIDailyBudgetExceeded(): Promise<boolean> {
  const envLimit = Number(process.env.AI_DAILY_CALL_LIMIT);
  const limit = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : DEFAULT_AI_DAILY_CALL_LIMIT;
  const key = `ai:daily:${new Date().toISOString().slice(0, 10)}`;
  try {
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, 2 * 24 * 60 * 60);
    return count > limit;
  } catch {
    return false;
  }
}

/** Coerce a client-supplied value to a finite number before it goes into a prompt (blocks free-text injection). */
export function promptNum(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * For short stat fields the client sends as a number OR a pre-formatted string ("3.2", "N/A").
 * Numbers pass through; strings are sanitized and capped at 12 chars — enough for any stat,
 * too short to smuggle a prompt.
 */
export function promptStat(value: unknown): string | number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 'N/A';
  if (typeof value === 'string') return sanitizeString(value, 12) || 'N/A';
  return 'N/A';
}

/**
 * Validate an incoming AI request: POST-only, API key, rate limit, body size.
 * Returns true if the request is INVALID (caller should return early).
 * Returns false if the request is valid and the handler should proceed.
 */
export async function validateAIRequest(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }

  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'API key not configured' });
    return true;
  }

  if (await checkAIRateLimit(req)) {
    res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    return true;
  }

  if (await isAIDailyBudgetExceeded()) {
    res.status(503).json({ error: 'AI features are resting for today. Try again tomorrow.' });
    return true;
  }

  if (isBodyTooLarge(req.body)) {
    res.status(413).json({ error: 'Request too large' });
    return true;
  }

  return false;
}

/**
 * Shared fetch wrapper for the Anthropic messages API.
 * Returns parsed content text or null with an error message.
 */
export async function callAnthropic(
  prompt: string,
  maxTokens: number,
  systemMessage?: string,
  timeoutMs: number = 8000,
  model: string = AI_MODEL,
): Promise<{ content: string | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: prompt },
    ];

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
    };

    if (systemMessage) {
      body.system = systemMessage;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('Anthropic API error:', response.status);
      return { content: null, error: 'AI service temporarily unavailable' };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? null;

    if (!text) {
      return { content: null, error: 'No content generated' };
    }

    return { content: text };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { content: null, error: 'AI request timed out' };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Format a monetary value (stored in thousands) for use in prompts.
 * value >= 1000 → "$X.XM", else "$Xk"
 */
export function formatMoneyForPrompt(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}M`;
  }
  return `$${value}k`;
}
