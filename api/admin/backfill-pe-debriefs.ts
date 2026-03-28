import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminToken } from '../_lib/adminAuth.js';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';
import { callAnthropic, formatMoneyForPrompt } from '../_lib/ai.js';
import { sanitizeString } from '../_lib/rateLimit.js';

/**
 * POST /api/admin/backfill-pe-debriefs
 * One-time backfill: generate PE-specific AI debriefs for all PE fund games
 * that don't already have one. Stores the result in game_history.strategy.aiDebrief.
 *
 * Optional body: { limit?: number, dryRun?: boolean }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authed = await verifyAdminToken(req, res);
  if (!authed) return;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  const limit = Math.min(typeof req.body?.limit === 'number' ? req.body.limit : 10, 50);
  const dryRun = req.body?.dryRun === true;

  try {
    // Find PE games without a stored debrief
    const { data: peGames, error } = await supabaseAdmin
      .from('game_history')
      .select('id, holdco_name, strategy, score, grade, enterprise_value, founder_equity_value, business_count, has_restructured, completed_at')
      .not('strategy', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(200);

    if (error) return res.status(500).json({ error: 'Query failed', detail: error.message });

    // Filter to PE games without existing debrief
    const peOnly = (peGames || []).filter((g: any) => {
      const s = g.strategy;
      return s?.isFundManager === true && !s?.aiDebrief;
    }).slice(0, limit);

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        totalPEGames: (peGames || []).filter((g: any) => g.strategy?.isFundManager === true).length,
        withoutDebrief: peOnly.length,
        wouldProcess: peOnly.map((g: any) => ({ id: g.id, holdco: g.holdco_name, grade: g.grade })),
      });
    }

    const results: Array<{ id: string; holdco: string; status: string }> = [];

    for (const game of peOnly) {
      const s = game.strategy as Record<string, any>;
      const grossMoic = s.grossMoic ?? 'N/A';
      const netIrr = typeof s.netIrr === 'number' ? `${(s.netIrr * 100).toFixed(1)}%` : 'N/A';
      const carry = s.carryEarned ?? 0;
      const lpSat = typeof s.lpSatisfaction === 'number' ? s.lpSatisfaction : 'N/A';
      const lpMood = typeof s.lpSatisfaction === 'number'
        ? (s.lpSatisfaction >= 80 ? 'Delighted' : s.lpSatisfaction >= 70 ? 'Satisfied' : s.lpSatisfaction >= 40 ? 'Cautious' : 'At Risk')
        : 'Unknown';

      const prompt = `You are an experienced PE fund advisor writing a post-mortem analysis of a 10-year PE fund simulation game. Analyze the GP's performance.

FUND: ${sanitizeString(game.holdco_name, 50)}
GRADE: ${game.grade} (${game.score}/100)
GROSS MOIC: ${grossMoic}x | NET IRR: ${netIrr} | CARRY EARNED: ${formatMoneyForPrompt(carry)}
LP SATISFACTION: ${lpSat}/100 (${lpMood})
BUSINESSES: ${game.business_count} at peak | ACQUISITIONS: ${s.totalAcquisitions ?? 'N/A'} | EXITS: ${s.totalSells ?? 'N/A'}
PLATFORMS FORGED: ${s.platformsForged ?? 0} | PEAK LEVERAGE: ${s.peakLeverage ?? 'N/A'}x
RESTRUCTURED: ${game.has_restructured ? 'Yes' : 'No'}
EV: ${formatMoneyForPrompt(game.enterprise_value)} | FEV: ${formatMoneyForPrompt(game.founder_equity_value)}

PE BENCHMARKS: Top quartile = 2.0x+ MOIC / 20%+ IRR. Median = 1.5-1.8x. Bottom quartile < 1.3x.

Generate JSON:
1. "overallAssessment" - 3 sentences on fund performance vs PE benchmarks. Reference MOIC, IRR, carry, LP satisfaction.
2. "keyStrengths" - 2-3 specific strengths (deployment, exits, LP management, value creation)
3. "areasForImprovement" - 2-3 areas to improve
4. "specificLessons" - 2 objects with "observation", "lesson" (PE concepts: J-curve, DPI, carry), "reference" (PE thought leaders)
5. "whatIfScenario" - 1-2 sentences on alternative strategy

Be direct, reference actual numbers. Respond ONLY with valid JSON.`;

      try {
        const result = await callAnthropic(prompt, 800, undefined, 15000);
        if (!result.content) {
          results.push({ id: game.id, holdco: game.holdco_name, status: 'ai_failed' });
          continue;
        }

        let parsed;
        try { parsed = JSON.parse(result.content); } catch {
          results.push({ id: game.id, holdco: game.holdco_name, status: 'parse_failed' });
          continue;
        }

        // Store the debrief back into strategy
        const updatedStrategy = { ...s, aiDebrief: parsed };
        const { error: updateError } = await supabaseAdmin
          .from('game_history')
          .update({ strategy: updatedStrategy })
          .eq('id', game.id);

        if (updateError) {
          results.push({ id: game.id, holdco: game.holdco_name, status: `update_failed: ${updateError.message}` });
        } else {
          results.push({ id: game.id, holdco: game.holdco_name, status: 'success' });
        }
      } catch (err: any) {
        results.push({ id: game.id, holdco: game.holdco_name, status: `error: ${err.message?.slice(0, 50)}` });
      }

      // Small delay between API calls to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return res.status(200).json({
      processed: results.length,
      results,
    });
  } catch (err: any) {
    console.error('PE debrief backfill error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
