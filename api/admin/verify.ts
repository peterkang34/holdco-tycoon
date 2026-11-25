import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'crypto';
import { createAdminToken } from '../_lib/adminAuth.js';
import { checkRateLimit } from '../_lib/rateLimit.js';

/** Constant-time compare. Hashing first equalizes lengths so timingSafeEqual can't throw or leak length. */
function secretMatches(candidate: string, secret: string): boolean {
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Brute-force guard: 5 attempts per IP per 15 minutes (counts every attempt, success or not).
  if (await checkRateLimit(req, { namespace: 'admin-login', maxRequests: 5, windowSeconds: 900 })) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const secret = process.env.ADMIN_SECRET;
  const password = req.headers.authorization?.replace('Bearer ', '');
  if (!secret || !password || !secretMatches(password, secret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = await createAdminToken();
    return res.status(200).json({ token });
  } catch {
    return res.status(500).json({ error: 'Failed to create session' });
  }
}
