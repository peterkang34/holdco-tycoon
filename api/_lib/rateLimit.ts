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
 * Generic rate limit check.
 * Returns true if rate-limited (caller should 429).
 */
export async function checkRateLimit(
  req: VercelRequest,
  opts: { namespace: string; maxRequests: number; windowSeconds?: number }
): Promise<boolean> {
  const ip = getClientIp(req);
  const key = `ratelimit:${opts.namespace}:${ip}`;
  const window = opts.windowSeconds ?? 60;

  try {
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, window);
    }
    return count > opts.maxRequests;
  } catch {
    return false; // Fail-open
  }
}

/**
 * Rate limit check for AI endpoints.
 * 10 requests per minute per IP.
 * Returns true if rate-limited.
 */
export async function checkAIRateLimit(req: VercelRequest): Promise<boolean> {
  return checkRateLimit(req, { namespace: 'ai', maxRequests: 10 });
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
