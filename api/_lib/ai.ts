import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkAIRateLimit, isBodyTooLarge } from './rateLimit.js';

export const AI_MODEL = 'claude-3-haiku-20240307';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
): Promise<{ content: string | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: prompt },
    ];

    const body: Record<string, unknown> = {
      model: AI_MODEL,
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
