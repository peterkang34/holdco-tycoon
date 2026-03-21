import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { randomUUID } from 'crypto';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { LEADERBOARD_KEY } from '../_lib/leaderboard.js';

/**
 * POST /api/admin/backfill-profile-ids
 * One-shot backfill: scans all KV leaderboard entries with a playerId but
 * no publicProfileId, looks up (or creates) the public_id in player_profiles,
 * and patches the KV entry so the leaderboard row becomes clickable.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  try {
    // Fetch all leaderboard entries with scores
    const raw = await kv.zrange(LEADERBOARD_KEY, 0, -1, { withScores: true });

    // raw is [member, score, member, score, ...]
    const entries: { member: string; parsed: Record<string, unknown>; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      try {
        const member = raw[i] as string;
        const score = raw[i + 1] as number;
        const parsed = typeof member === 'string' ? JSON.parse(member) : member;
        entries.push({ member: typeof member === 'string' ? member : JSON.stringify(member), parsed, score });
      } catch { /* skip */ }
    }

    let updated = 0;
    let skipped = 0;
    let alreadyHas = 0;
    let noPlayer = 0;

    for (const entry of entries) {
      const { parsed, member, score } = entry;

      // Already has publicProfileId
      if (parsed.publicProfileId) {
        alreadyHas++;
        continue;
      }

      // No playerId — can't link
      if (!parsed.playerId) {
        noPlayer++;
        continue;
      }

      const playerId = parsed.playerId as string;

      // Look up or create public_id from player_profiles
      let publicId: string | undefined;
      try {
        const { data: profile } = await supabaseAdmin
          .from('player_profiles')
          .select('public_id')
          .eq('id', playerId)
          .maybeSingle();

        if (profile?.public_id) {
          publicId = profile.public_id;
        } else {
          // Profile missing or has no public_id — upsert with a new public_id
          const newId = randomUUID().replace(/-/g, '').slice(0, 12);
          const initials = (parsed.initials as string) || 'AA';
          const now = new Date().toISOString();
          await supabaseAdmin.from('player_profiles').upsert({
            id: playerId,
            initials,
            public_id: newId,
            updated_at: now,
          }, { onConflict: 'id' });
          publicId = newId;
        }
      } catch { /* skip */ }

      if (!publicId) {
        skipped++;
        continue;
      }

      // Patch the KV entry: remove old, add updated
      const updatedParsed = { ...parsed, publicProfileId: publicId };
      const updatedMember = JSON.stringify(updatedParsed);

      await kv.zrem(LEADERBOARD_KEY, member);
      await kv.zadd(LEADERBOARD_KEY, { score, member: updatedMember });
      updated++;
    }

    return res.status(200).json({
      total: entries.length,
      updated,
      alreadyHas,
      noPlayer,
      skipped,
    });
  } catch (error) {
    console.error('Backfill profile IDs error:', error);
    return res.status(500).json({ error: 'Backfill failed' });
  }
}
