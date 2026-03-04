import type { VercelRequest } from '@vercel/node';
import { supabaseAdmin } from './supabaseAdmin.js';

/**
 * Extract and verify a Supabase JWT from the Authorization header.
 * Returns the user UUID if valid, null otherwise.
 * Does NOT send a response — caller decides how to handle unauthenticated requests.
 */
export async function getPlayerIdFromToken(req: VercelRequest): Promise<string | null> {
  if (!supabaseAdmin) return null;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}
