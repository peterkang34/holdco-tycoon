import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { updateGlobalStats } from '../_lib/playerStats.js';

const CUTOFF_DAYS = 90;
const USERS_PER_PAGE = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Verify cron authorization
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin client not configured' });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CUTOFF_DAYS);
    const cutoffISO = cutoff.toISOString();

    let deletedCount = 0;
    let skippedCount = 0;
    let totalChecked = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: USERS_PER_PAGE,
      });

      if (error) {
        console.error('Failed to list users:', error);
        return res.status(500).json({ error: 'Failed to list users' });
      }

      if (!users || users.length === 0) {
        hasMore = false;
        break;
      }

      // Filter to anonymous users created before cutoff
      const staleAnonymous = users.filter((user) => {
        const isAnon = user.is_anonymous === true || user.app_metadata?.provider === 'anonymous';
        return isAnon && user.created_at < cutoffISO;
      });

      for (const user of staleAnonymous) {
        totalChecked++;

        // Check if they have game history worth preserving
        const { count, error: countError } = await supabaseAdmin
          .from('game_history')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', user.id);

        if (countError) {
          console.error(`Failed to check game_history for ${user.id}:`, countError);
          skippedCount++;
          continue;
        }

        if (count && count > 0) {
          // Has game data — skip
          skippedCount++;
          continue;
        }

        // No game data — safe to delete
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        if (deleteError) {
          console.error(`Failed to delete user ${user.id}:`, deleteError);
          skippedCount++;
          continue;
        }

        deletedCount++;
      }

      // If we got fewer than a full page, we're done
      if (users.length < USERS_PER_PAGE) {
        hasMore = false;
      } else {
        page++;
      }
    }

    // Refresh global stats after cleanup
    try {
      await updateGlobalStats();
    } catch (err) {
      console.error('Failed to update global stats after cleanup:', err);
    }

    return res.status(200).json({
      deleted: deletedCount,
      skipped: skippedCount,
      checked: totalChecked,
    });
  } catch (error) {
    console.error('Anonymous user cleanup error:', error);
    return res.status(500).json({ error: 'Cleanup failed' });
  }
}
