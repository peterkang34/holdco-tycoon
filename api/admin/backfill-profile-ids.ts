import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { randomUUID } from 'crypto';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { LEADERBOARD_KEY } from '../_lib/leaderboard.js';

/**
 * POST /api/admin/backfill-profile-ids
 *
 * Two modes controlled by ?mode= query param:
 *
 * mode=repair (default): Scans all KV entries. For entries with playerId but
 *   no publicProfileId, looks up the player_profiles row and sets publicProfileId
 *   if public_id exists. For entries with a bogus publicProfileId (no matching
 *   player_profiles row), strips the publicProfileId. Also generates public_id
 *   for profile rows that exist but have null public_id.
 *
 * mode=strip: Removes publicProfileId from ALL KV entries (reset for re-run).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  const mode = (req.query.mode as string) || 'repair';
  const dryRun = req.query.dryRun === 'true';

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

    if (mode === 'strip') {
      let stripped = 0;
      for (const entry of entries) {
        if (entry.parsed.publicProfileId) {
          const cleaned = { ...entry.parsed };
          delete cleaned.publicProfileId;
          const cleanedMember = JSON.stringify(cleaned);
          await kv.zrem(LEADERBOARD_KEY, entry.member);
          await kv.zadd(LEADERBOARD_KEY, { score: entry.score, member: cleanedMember });
          stripped++;
        }
      }
      return res.status(200).json({ total: entries.length, stripped });
    }

    // mode=repair
    let updated = 0;
    let repaired = 0;
    let alreadyHas = 0;
    let noPlayer = 0;
    let noProfile = 0;
    let generatedPublicId = 0;
    const samplePlayerIds: string[] = [];
    const sampleErrors: string[] = [];

    for (const entry of entries) {
      const { parsed, member, score } = entry;

      // No playerId — anonymous, can't link
      if (!parsed.playerId) {
        noPlayer++;
        continue;
      }

      const playerId = parsed.playerId as string;
      if (samplePlayerIds.length < 5) samplePlayerIds.push(playerId);

      // Look up player_profiles row
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('player_profiles')
        .select('public_id')
        .eq('id', playerId)
        .maybeSingle();

      if (profileError && sampleErrors.length < 5) {
        sampleErrors.push(`${playerId}: ${profileError.message}`);
      }

      // No profile row in Supabase — player doesn't have an account
      if (!profile) {
        // If this entry has a bogus publicProfileId, strip it
        if (parsed.publicProfileId) {
          const cleaned = { ...parsed };
          delete cleaned.publicProfileId;
          const cleanedMember = JSON.stringify(cleaned);
          await kv.zrem(LEADERBOARD_KEY, member);
          await kv.zadd(LEADERBOARD_KEY, { score, member: cleanedMember });
          repaired++;
        } else {
          noProfile++;
        }
        continue;
      }

      // Profile exists — ensure it has a public_id
      let publicId = profile.public_id as string | null;
      if (!publicId) {
        const newId = randomUUID().replace(/-/g, '').slice(0, 12);
        const { error: updateError } = await supabaseAdmin
          .from('player_profiles')
          .update({ public_id: newId, updated_at: new Date().toISOString() })
          .eq('id', playerId);

        if (updateError) {
          // Can't set public_id — skip
          if (parsed.publicProfileId) {
            // Strip bogus publicProfileId
            const cleaned = { ...parsed };
            delete cleaned.publicProfileId;
            await kv.zrem(LEADERBOARD_KEY, member);
            await kv.zadd(LEADERBOARD_KEY, { score, member: JSON.stringify(cleaned) });
            repaired++;
          } else {
            noProfile++;
          }
          continue;
        }
        publicId = newId;
        generatedPublicId++;
      }

      // Already has correct publicProfileId
      if (parsed.publicProfileId === publicId) {
        alreadyHas++;
        continue;
      }

      // Set or fix publicProfileId in KV entry
      const updatedParsed = { ...parsed, publicProfileId: publicId };
      const updatedMember = JSON.stringify(updatedParsed);
      await kv.zrem(LEADERBOARD_KEY, member);
      await kv.zadd(LEADERBOARD_KEY, { score, member: updatedMember });
      updated++;
    }

    return res.status(200).json({
      total: entries.length,
      updated,
      repaired,
      alreadyHas,
      noPlayer,
      noProfile,
      generatedPublicId,
      dryRun,
      debug: { samplePlayerIds, sampleErrors },
    });
  } catch (error) {
    console.error('Backfill profile IDs error:', error);
    return res.status(500).json({ error: 'Backfill failed' });
  }
}
