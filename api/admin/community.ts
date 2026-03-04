import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authed = await verifyAdminToken(req, res);
  if (!authed) return;

  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  try {
    // ── Query params ──
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize)) || 25));
    const sort = String(req.query.sort || 'created_at');
    const order = String(req.query.order || 'desc') === 'asc' ? 'asc' : 'desc';
    const search = String(req.query.search || '').trim();

    // ── Sign-up metrics via auth.admin.listUsers ──
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
    const twelveWeeksAgo = new Date(now.getTime() - 84 * 86400_000);

    let totalAccounts = 0;
    let verifiedAccounts = 0;
    let anonymousAccounts = 0;
    const providerBreakdown: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};
    const weeklyCounts: Record<string, number> = {};

    // Paginate through all users (Supabase caps at 1000 per page)
    let authPage = 1;
    let hasMore = true;
    while (hasMore) {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
        page: authPage,
        perPage: 1000,
      });

      if (error) {
        console.error('listUsers error:', error);
        break;
      }

      if (users.length === 0) {
        hasMore = false;
        break;
      }

      for (const user of users) {
        totalAccounts++;

        const isAnon = user.is_anonymous === true;
        if (isAnon) {
          anonymousAccounts++;
          providerBreakdown['anonymous'] = (providerBreakdown['anonymous'] || 0) + 1;
        } else {
          verifiedAccounts++;
          // Determine provider from identities or app_metadata
          const provider = user.app_metadata?.provider || 'email';
          providerBreakdown[provider] = (providerBreakdown[provider] || 0) + 1;
        }

        // Daily counts (last 30 days)
        const createdAt = new Date(user.created_at);
        if (createdAt >= thirtyDaysAgo) {
          const dayKey = createdAt.toISOString().slice(0, 10);
          dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
        }

        // Weekly counts (last 12 weeks)
        if (createdAt >= twelveWeeksAgo) {
          const weekStart = new Date(createdAt);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const weekKey = weekStart.toISOString().slice(0, 10);
          weeklyCounts[weekKey] = (weeklyCounts[weekKey] || 0) + 1;
        }
      }

      if (users.length < 1000) {
        hasMore = false;
      } else {
        authPage++;
      }
    }

    // Build sorted arrays
    const signUpsByDay = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const signUpsByWeek = Object.entries(weeklyCounts)
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // ── Player browser ──
    // Valid sort columns (must match player_profiles/player_stats columns)
    const validSorts = ['created_at', 'display_name', 'initials', 'total_games', 'best_adjusted_fev', 'best_grade'];
    const sortCol = validSorts.includes(sort) ? sort : 'created_at';
    const isStatSort = ['total_games', 'best_adjusted_fev', 'best_grade'].includes(sortCol);

    // Count total players (with search filter)
    let countQuery = supabaseAdmin.from('player_profiles').select('id', { count: 'exact', head: true });
    if (search) {
      countQuery = countQuery.or(`display_name.ilike.%${search}%,initials.ilike.%${search}%`);
    }
    const { count: totalPlayers } = await countQuery;

    // Fetch players with stats join
    // We select from player_profiles and left-join player_stats
    let query = supabaseAdmin
      .from('player_profiles')
      .select(`
        id, display_name, initials, created_at, is_anonymous,
        player_stats(total_games, best_adjusted_fev, best_grade)
      `)
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,initials.ilike.%${search}%`);
    }

    // Sort — stats columns require sorting on the join
    if (isStatSort) {
      query = query.order(sortCol, { ascending: order === 'asc', referencedTable: 'player_stats' });
    } else {
      query = query.order(sortCol, { ascending: order === 'asc' });
    }

    const { data: rawPlayers, error: playerError } = await query;

    if (playerError) {
      console.error('Player query error:', playerError);
      return res.status(500).json({ error: 'Failed to query players' });
    }

    const players = (rawPlayers || []).map((p: any) => {
      const stats = Array.isArray(p.player_stats) ? p.player_stats[0] : p.player_stats;
      return {
        id: p.id,
        display_name: p.display_name,
        initials: p.initials || '??',
        total_games: stats?.total_games ?? 0,
        best_grade: stats?.best_grade ?? null,
        best_adjusted_fev: stats?.best_adjusted_fev ?? 0,
        created_at: p.created_at,
        is_anonymous: p.is_anonymous ?? false,
      };
    });

    return res.status(200).json({
      metrics: {
        totalAccounts,
        verifiedAccounts,
        anonymousAccounts,
        providerBreakdown,
        signUpsByWeek,
        signUpsByDay,
      },
      players,
      totalPlayers: totalPlayers ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Community API error:', error);
    return res.status(500).json({ error: 'Failed to fetch community data' });
  }
}
