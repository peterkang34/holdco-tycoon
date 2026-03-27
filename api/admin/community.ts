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

    // Build a map of user_id → is_anonymous for player browser
    const anonMap = new Map<string, boolean>();
    const emailMap = new Map<string, string>();

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
        anonMap.set(user.id, isAnon);
        if (user.email) emailMap.set(user.id, user.email);

        if (isAnon) {
          anonymousAccounts++;
          providerBreakdown['anonymous'] = (providerBreakdown['anonymous'] || 0) + 1;
        } else {
          verifiedAccounts++;
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
    const profileSorts = ['created_at', 'display_name', 'initials'];
    const statsSorts = ['total_games', 'best_adjusted_fev', 'best_grade'];
    const isStatsSort = statsSorts.includes(sort);

    // Count total players (with search filter)
    let countQuery = supabaseAdmin.from('player_profiles').select('id', { count: 'exact', head: true });
    if (search) {
      countQuery = countQuery.or(`display_name.ilike.%${search}%,initials.ilike.%${search}%`);
    }
    const { count: totalPlayers } = await countQuery;

    let playerIds: string[];
    let profilesById = new Map<string, any>();
    let statsMap = new Map<string, any>();
    const gameCountMap = new Map<string, number>();

    if (isStatsSort && !search) {
      // Sort via player_stats table, then fetch matching profiles
      const statsCol = sort === 'best_grade' ? 'best_score' : sort;
      const { data: statsRows, error: statsError } = await supabaseAdmin
        .from('player_stats')
        .select('player_id, total_games, best_score, best_adjusted_fev, grade_distribution, earned_achievement_ids')
        .order(statsCol, { ascending: order === 'asc' })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (statsError) {
        console.error('Player stats sort query error:', statsError);
        return res.status(500).json({ error: 'Failed to query players' });
      }

      playerIds = (statsRows || []).map((s: any) => s.player_id);
      for (const row of statsRows || []) {
        statsMap.set(row.player_id, row);
      }

      // Fetch profiles for these player IDs
      if (playerIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('player_profiles')
          .select('id, display_name, initials, created_at, last_played_at')
          .in('id', playerIds);
        for (const p of profiles || []) {
          profilesById.set(p.id, p);
        }
      }
    } else {
      // Sort via player_profiles table (original path)
      const sortCol = profileSorts.includes(sort) ? sort : 'created_at';

      let profileQuery = supabaseAdmin
        .from('player_profiles')
        .select('id, display_name, initials, created_at, last_played_at')
        .order(sortCol, { ascending: order === 'asc' })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (search) {
        profileQuery = profileQuery.or(`display_name.ilike.%${search}%,initials.ilike.%${search}%`);
      }

      const { data: profiles, error: profileError } = await profileQuery;

      if (profileError) {
        console.error('Player profiles query error:', profileError);
        return res.status(500).json({ error: 'Failed to query players' });
      }

      playerIds = (profiles || []).map((p: any) => p.id);
      for (const p of profiles || []) {
        profilesById.set(p.id, p);
      }

      // Fetch stats for these players
      if (playerIds.length > 0) {
        const { data: statsRows } = await supabaseAdmin
          .from('player_stats')
          .select('player_id, total_games, best_adjusted_fev, grade_distribution, earned_achievement_ids')
          .in('player_id', playerIds);

        if (statsRows) {
          for (const row of statsRows) {
            statsMap.set(row.player_id, row);
          }
        }
      }
    }

    // Live game counts from game_history (source of truth — player_stats can be stale)
    if (playerIds.length > 0) {
      const { data: gameRows } = await supabaseAdmin
        .from('game_history')
        .select('player_id')
        .in('player_id', playerIds)
        .range(0, 4999);

      for (const row of gameRows || []) {
        gameCountMap.set(row.player_id, (gameCountMap.get(row.player_id) || 0) + 1);
      }
    }

    // Derive best grade from grade_distribution JSON
    const GRADE_ORDER = ['S', 'A', 'B', 'C', 'D', 'F'];
    function deriveBestGrade(gradeDistribution: Record<string, number> | null): string | null {
      if (!gradeDistribution) return null;
      for (const g of GRADE_ORDER) {
        if ((gradeDistribution[g] ?? 0) > 0) return g;
      }
      return null;
    }

    // Build player list preserving sort order from playerIds
    const players = playerIds
      .map((id) => {
        const p = profilesById.get(id);
        if (!p) return null;
        const stats = statsMap.get(id);
        return {
          id: p.id,
          display_name: p.display_name,
          email: emailMap.get(id) ?? null,
          initials: p.initials || '??',
          total_games: gameCountMap.get(id) ?? stats?.total_games ?? 0,
          best_grade: deriveBestGrade(stats?.grade_distribution ?? null),
          best_adjusted_fev: stats?.best_adjusted_fev ?? 0,
          achievements_count: Array.isArray(stats?.earned_achievement_ids) ? stats.earned_achievement_ids.length : 0,
          last_played_at: p.last_played_at ?? null,
          created_at: p.created_at,
          is_anonymous: anonMap.get(id) ?? false,
        };
      })
      .filter(Boolean);

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
