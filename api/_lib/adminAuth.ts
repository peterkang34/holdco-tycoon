import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

const ADMIN_TOKEN_PREFIX = 'admin:session:';
const TOKEN_TTL_SECONDS = 86400; // 24 hours

/**
 * Create a new admin session token. Stores it in KV with a 24hr TTL.
 * Returns the token string to send to the client.
 */
export async function createAdminToken(): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await kv.set(`${ADMIN_TOKEN_PREFIX}${token}`, '1', { ex: TOKEN_TTL_SECONDS });
  return token;
}

/**
 * Verify an admin session token from the Authorization header.
 * Returns true if the token is valid. Sends a 401 response and returns false if not.
 */
export async function verifyAdminToken(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  try {
    const exists = await kv.get(`${ADMIN_TOKEN_PREFIX}${token}`);
    if (!exists) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  } catch {
    res.status(500).json({ error: 'Auth check failed' });
    return false;
  }
}
