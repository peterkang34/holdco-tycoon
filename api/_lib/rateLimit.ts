import type { VercelRequest } from '@vercel/node';
import { kv } from '@vercel/kv';

/**
 * Get the real client IP from Vercel's edge headers.
 * Uses x-real-ip (set by Vercel, cannot be spoofed) with fallback.
 */
export function getClientIp(req: VercelRequest): string {
  // x-real-ip is set by Vercel's edge and cannot be spoofed by the client
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;

  // Fallback: x-forwarded-for (less reliable, can be spoofed)
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];

  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Check and enforce rate limit using Vercel KV.
 * Returns true if the request should be rate-limited (blocked).
 */
export async function isRateLimited(
  key: string,
  windowSeconds: number
): Promise<boolean> {
  try {
    const existing = await kv.get(key);
    if (existing) return true;
    await kv.set(key, '1', { ex: windowSeconds });
    return false;
  } catch {
    // If KV is unavailable, allow the request (fail-open for AI features)
    return false;
  }
}

/**
 * Rate limit check for AI endpoints.
 * 10 requests per minute per IP.
 * Returns true if rate-limited.
 */
export async function checkAIRateLimit(req: VercelRequest): Promise<boolean> {
  const ip = getClientIp(req);
  const key = `ratelimit:ai:${ip}`;

  try {
    // Use a sliding window counter: increment and check
    const count = await kv.incr(key);

    // Set TTL on first request in window
    if (count === 1) {
      await kv.expire(key, 60);
    }

    return count > 10; // Max 10 requests per 60 seconds
  } catch {
    return false; // Fail-open
  }
}

/**
 * Validate request body size. Returns true if too large.
 */
export function isBodyTooLarge(body: unknown, maxBytes: number = 10000): boolean {
  try {
    return JSON.stringify(body).length > maxBytes;
  } catch {
    return true;
  }
}

/**
 * Sanitize a string for safe use — strips control chars, limits length.
 */
export function sanitizeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  // Strip control characters and zero-width chars, trim, limit length
  return value
    .replace(/[\x00-\x1F\x7F\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
    .trim()
    .slice(0, maxLength);
}
