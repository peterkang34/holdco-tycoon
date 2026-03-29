import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sanitizeString } from '../_lib/rateLimit.js';
import { validateAIRequest, callAnthropic, formatMoneyForPrompt } from '../_lib/ai.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (await validateAIRequest(req, res)) return;

  try {
    const {
      holdcoName: rawHoldcoName,
      score,
      enterpriseValue,
      totalAcquisitions,
      totalSold,
      soldWithProfit,
      totalWoundDown,
      avgHoldPeriod,
      avgQuality,
      totalImprovements,
      platformSummary,
      sectorSummary,
      totalInvestedCapital,
      totalDistributions,
      totalBuybacks,
      equityRaisesUsed,
      sharedServicesActive,
      ebitdaGrowth,
      finalLeverage,
      totalRounds: rawTotalRounds,
      difficulty: rawDifficulty,
      founderEquityValue: rawFEV,
      founderOwnership: rawOwnership,
    } = req.body;

    const totalRounds = typeof rawTotalRounds === 'number' ? rawTotalRounds : 20;
    const difficulty = rawDifficulty === 'normal' ? 'Hard (Self-Funded)' : 'Easy (Institutional Fund)';
    const founderEquityValue = typeof rawFEV === 'number' ? rawFEV : enterpriseValue;
    const founderOwnership = typeof rawOwnership === 'number' ? `${Math.round(rawOwnership * 100)}%` : 'N/A';

    const holdcoName = sanitizeString(rawHoldcoName, 50);
    const platformSummarySafe = sanitizeString(platformSummary, 500);
    const sectorSummarySafe = sanitizeString(sectorSummary, 500);

    if (!holdcoName || !score) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ── PE Fund Mode: completely different debrief ──
    if (req.body.isFundManagerMode) {
      const pe = req.body.peScore || {};
      const cw = req.body.carryWaterfall || {};
      const lpScore = typeof req.body.lpSatisfactionScore === 'number' ? req.body.lpSatisfactionScore : 75;
      const lpMood = lpScore >= 80 ? 'Delighted' : lpScore >= 70 ? 'Satisfied' : lpScore >= 40 ? 'Cautious' : lpScore >= 20 ? 'At Risk' : 'Critical';
      const fundSize = typeof req.body.fundSize === 'number' ? req.body.fundSize : 100000;
      const deployed = typeof req.body.totalCapitalDeployed === 'number' ? req.body.totalCapitalDeployed : 0;
      const deployPct = fundSize > 0 ? Math.round((deployed / fundSize) * 100) : 0;
      const lpComments = Array.isArray(req.body.lpCommentary) ? req.body.lpCommentary.slice(-6) : [];
      const lpQuotes = lpComments.map((c: any) => `Y${c.round} ${c.speaker === 'edna' ? 'Edna' : 'Chip'}: "${sanitizeString(c.text, 100)}"`).join('\n');

      const pePrompt = `You are an experienced PE fund advisor writing a post-mortem analysis of a 10-year PE fund simulation game. This is NOT a holdco — it's a closed-end PE fund with committed capital, a carry waterfall, LP investors, and a fixed fund life. Analyze the GP's performance like a real fund review.

FUND IDENTITY:
- Fund Name: ${sanitizeString(req.body.fundName || holdcoName, 50)}
- Fund Size: ${formatMoneyForPrompt(fundSize)} committed capital
- Fund Life: 10 years (Years 1-5 investment period, Years 6-10 harvest)

RETURNS & CARRY:
- Gross MOIC: ${typeof cw.grossMoic === 'number' ? cw.grossMoic.toFixed(2) : 'N/A'}x
- Net IRR: ${typeof cw.netIrr === 'number' ? (cw.netIrr * 100).toFixed(1) : 'N/A'}%
- DPI (Distributions / Paid-In): ${typeof cw.dpi === 'number' ? cw.dpi.toFixed(2) : 'N/A'}x
- Carried Interest Earned: ${formatMoneyForPrompt(typeof cw.carry === 'number' ? cw.carry : 0)}
- Total GP Economics (carry + fees): ${formatMoneyForPrompt(typeof cw.totalGpEconomics === 'number' ? cw.totalGpEconomics : 0)}
- Management Fees Collected: ${formatMoneyForPrompt(typeof cw.managementFees === 'number' ? cw.managementFees : 0)}
- Hurdle Cleared: ${cw.hurdleCleared ? 'Yes' : 'No'}
- LP Distributions: ${formatMoneyForPrompt(typeof cw.lpDistributions === 'number' ? cw.lpDistributions : 0)}

PE SCORE BREAKDOWN (out of 100):
- Return Generation: ${pe.returnGeneration ?? 'N/A'}/25
- Capital Efficiency: ${pe.capitalEfficiency ?? 'N/A'}/20
- Value Creation: ${pe.valueCreation ?? 'N/A'}/15
- Deployment Discipline: ${pe.deploymentDiscipline ?? 'N/A'}/15
- Risk Management: ${pe.riskManagement ?? 'N/A'}/15
- LP Satisfaction: ${pe.lpSatisfaction ?? 'N/A'}/10
- Overall: ${pe.total ?? 'N/A'}/100 — Grade: ${sanitizeString(pe.grade || 'N/A', 5)} (${sanitizeString(pe.gradeTitle || '', 50)})

DEPLOYMENT:
- Capital Deployed: ${formatMoneyForPrompt(deployed)} (${deployPct}% of fund)
- Total Acquisitions: ${totalAcquisitions}
- Businesses Exited: ${totalSold} (${soldWithProfit} at profit)

LP RELATIONS:
- Final LP Satisfaction: ${lpScore}/100 (${lpMood})
- Starting satisfaction was 75/100
${lpQuotes ? `\nRECENT LP COMMENTARY:\n${lpQuotes}` : ''}

PORTFOLIO ACTIVITY:
- Average Hold Period: ${avgHoldPeriod} years
- Average Quality at Exit: ${avgQuality}/5
- Operational Improvements: ${totalImprovements}
- ${platformSummarySafe}
- Sectors: ${sectorSummarySafe}

BENCHMARKS (for context):
- Top quartile PE fund: 2.0x+ MOIC, 20%+ net IRR
- Median PE fund: 1.5-1.8x MOIC, 12-18% net IRR
- Bottom quartile: <1.3x MOIC, <10% net IRR

Generate a JSON response with these fields:
1. "overallAssessment" - 3-4 sentences analyzing the fund's performance as a PE fund GP. Reference MOIC, IRR, carry, and how the fund compares to industry benchmarks. Comment on whether LPs got a good outcome.
2. "keyStrengths" - Array of 2-3 specific things the GP did well. Reference actual numbers: deployment pacing, exit timing, LP satisfaction management, value creation, carry economics. Be specific to PE fund management.
3. "areasForImprovement" - Array of 2-3 areas where the GP could improve. Consider: deployment discipline, exit timing, LP relations, concentration risk, leverage management. Be constructive.
4. "specificLessons" - Array of 2-3 objects with:
   - "observation": What pattern you noticed in their fund management
   - "lesson": The PE industry principle this relates to (reference real PE concepts: J-curve, dry powder, DPI pacing, carry waterfall, vintage diversification)
   - "reference": Quote or reference from PE thought leaders (David Swensen, Henry Kravis, Marc Rowan, Steve Schwarzman, or PE publications)
5. "whatIfScenario" - 1-2 sentences describing how a different deployment or exit strategy might have changed the fund's MOIC or IRR.

Write like you're addressing a GP at their annual meeting. Be direct, analytical, reference actual numbers from the fund. Compare to real PE benchmarks. Respond ONLY with valid JSON.`;

      const result = await callAnthropic(pePrompt, 1200, undefined, 15000);
      if (!result.content) {
        return res.status(502).json({ error: result.error || 'AI service temporarily unavailable' });
      }
      let parsed;
      try { parsed = JSON.parse(result.content); } catch {
        console.error('Failed to parse PE AI response:', result.content.slice(0, 200));
        return res.status(500).json({ error: 'AI returned invalid JSON' });
      }
      return res.status(200).json({
        overallAssessment: parsed.overallAssessment || '',
        keyStrengths: parsed.keyStrengths || [],
        areasForImprovement: parsed.areasForImprovement || [],
        specificLessons: parsed.specificLessons || [],
        whatIfScenario: parsed.whatIfScenario || '',
      });
    }

    // ── Standard Holdco Mode debrief ──

    // Sanitize score fields that are interpolated into the prompt
    const scoreGrade = sanitizeString(score.grade, 10);
    const scoreTitle = sanitizeString(score.title, 100);
    const scoreTotal = typeof score.total === 'number' ? score.total : 0;
    const scoreValueCreation = typeof score.valueCreation === 'number' ? score.valueCreation : 0;
    const scoreFcfShareGrowth = typeof score.fcfShareGrowth === 'number' ? score.fcfShareGrowth : 0;
    const scorePortfolioRoic = typeof score.portfolioRoic === 'number' ? score.portfolioRoic : 0;
    const scoreCapitalDeployment = typeof score.capitalDeployment === 'number' ? score.capitalDeployment : 0;
    const scoreBalanceSheetHealth = typeof score.balanceSheetHealth === 'number' ? score.balanceSheetHealth : 0;
    const scoreStrategicDiscipline = typeof score.strategicDiscipline === 'number' ? score.strategicDiscipline : 0;

    // Mode-specific context — grounded in real capital allocator frameworks (ILTB podcast research)
    const isNormal = rawDifficulty === 'normal';
    const isQuick = totalRounds <= 10;
    const MODE_ADDENDA: Record<string, string> = {
      easy_quick: `MODE CONTEXT — Easy Quick (10-Year Sprint, $20M institutional capital, 80% ownership):
This tests speed of deployment and capital efficiency over a compressed horizon. The strategic model is TransDigm's flywheel: $25M of primary equity became $35B — it never required another dollar. Nick Howley built the base EBITDA in 4-5 years through operational optimization, then did all subsequent acquisitions with debt. Similarly, IMC/Golden Corral (Connor Leonard, ILTB Ep 64) deployed $50K into a capital-light franchise, then used the FCF as permanent capital to acquire 8 businesses — "the same way Berkshire uses insurance float." Evaluate how quickly they built the flywheel. Did idle cash sit too long? Did they achieve escape velocity within the 10-year window? A great 10-year holdco builder deploys fast, improves operations immediately, and builds a portfolio with enough organic momentum to compound beyond the game window.`,

      easy_standard: `MODE CONTEXT — Easy Standard (20-Year Compounder, $20M institutional capital, 80% ownership):
The model here is Constellation Software and Permanent Equity. Mark Leonard started CSU with C$25M in 1995 and compounded at 30%+ for 20 years through disciplined small acquisitions — never raised additional equity. Brent Beshore at Permanent Equity (ILTB Ep 10) calls it "cultivating a disaster-resistant compound interest machine" — harvest excess capital from existing investments, pull it together for the next acquisition, default to no and force yourself into the yes column. Will Thorndike (ILTB Ep 288) emphasizes "revenue quality and capital efficiency" as the predictors of sustainable compounding: low churn businesses with high return on tangible capital. Evaluate the full 20-year arc: did they compound or plateau? Did margin drift erode second-decade returns? Did they use the full toolkit (IPO, Family Office, platforms)? The best 20-year holdco builders achieve escape velocity where FCF generation outpaces deployment needs.`,

      normal_quick: `MODE CONTEXT — Normal Quick (10-Year Bootstrapped Sprint, $5M start + $3M debt, 100% ownership):
This mirrors the search fund model and Shore Capital's approach. Search funds (ILTB Ep 33) target mid-30s IRRs by acquiring $1-2M EBITDA businesses with minimal capital. Justin Ishbia at Shore Capital (ILTB Ep 357) built a system around microcap acquisitions: $3.5M average EBITDA, 7.5x entry multiples, 2x leverage, achieving 7x gross MOIC and 72% gross IRR across 586 acquisitions. His philosophy: "Main Street, not Wall Street — if we get 1-2 things right, 3x the money. If we get 4-5 right, 5-7x. Everything right, 20x." With only $5M and starting debt, every dollar of idle cash and every point of leverage matters. Evaluate their deleveraging arc, capital efficiency relative to starting equity, and whether they created disproportionate value from a constrained capital base.`,

      normal_standard: `MODE CONTEXT — Normal Standard (20-Year Self-Funded Marathon, $5M start + $3M debt, 100% ownership):
This is the hardest mode, mirroring Chenmark Capital's journey. Trish and James Higgins (ILTB Ep 28) left institutional finance to buy a landscaping company in Maine with their own capital — "everyone said we were quitting AQR to run a snowplow." Their philosophy: "We're earning the right to take risk for the first 10 years" by building a portfolio of durable "bait shop" businesses — small, differentiated, high-return niches that generate steady FCF. "There are 200,000+ businesses in our revenue range with owners contemplating retirement." They believe in diversification as portfolio theory applied to small businesses, with a "very long-term vision — we all expect it's the last job we'll ever have." The defining question for this mode: did the player make the phase transition from survival/deleveraging to compounder, and when? The best self-funded holdco operators endure 5+ years of modest returns before the compounding flywheel takes hold.`,
    };
    const modeKey = `${isNormal ? 'normal' : 'easy'}_${isQuick ? 'quick' : 'standard'}`;
    const modeContext = MODE_ADDENDA[modeKey] || '';

    const prompt = `You are an experienced investment advisor reviewing a player's ${totalRounds}-year holding company simulation game. The player runs a holdco (not a PE fund) — never use the term "private equity firm". Analyze their performance and provide personalized, actionable feedback grounded in real-world capital allocation wisdom.

GAME RESULTS:
- Holdco Name: ${holdcoName}
- Difficulty: ${difficulty}
- Duration: ${totalRounds} years
- Final Grade: ${scoreGrade} (${scoreTotal}/100 points)
- Title: ${scoreTitle}
- Founder Equity Value: ${formatMoneyForPrompt(founderEquityValue)} (founder's share of NAV)
- Enterprise Value: ${formatMoneyForPrompt(enterpriseValue)} (total portfolio value)
- Founder Ownership: ${founderOwnership}

${modeContext}

SCORE BREAKDOWN:
- Value Creation (FEV / Capital): ${scoreValueCreation}/20
- FCF/Share Growth: ${scoreFcfShareGrowth}/20
- Portfolio ROIC: ${scorePortfolioRoic}/15
- Capital Deployment: ${scoreCapitalDeployment}/15
- Balance Sheet Health: ${scoreBalanceSheetHealth}/15
- Strategic Discipline: ${scoreStrategicDiscipline}/15

PORTFOLIO ACTIVITY:
- Total Acquisitions: ${totalAcquisitions}
- Businesses Sold: ${totalSold} (${soldWithProfit} at profit)
- Businesses Wound Down: ${totalWoundDown}
- Average Hold Period: ${avgHoldPeriod} years
- Average Quality Rating: ${avgQuality}/5
- Operational Improvements Made: ${totalImprovements}
- ${platformSummarySafe}
- Sector Distribution: ${sectorSummarySafe}

CAPITAL MANAGEMENT:
- Total Invested Capital: ${formatMoneyForPrompt(totalInvestedCapital)}
- Distributions to Owners: ${formatMoneyForPrompt(totalDistributions)}
- Share Buybacks: ${formatMoneyForPrompt(totalBuybacks)}
- Equity Raises Used: ${equityRaisesUsed}/3
- Shared Services Active: ${sharedServicesActive}

TRAJECTORY:
- EBITDA Growth: ${ebitdaGrowth}%
- Revenue Growth: ${sanitizeString(String(req.body.revenueGrowth || 'N/A'), 50)}%
- Avg EBITDA Margin: ${sanitizeString(String(req.body.avgMargin || 'N/A'), 50)}
- Margin Change: ${sanitizeString(String(req.body.marginChange || 'N/A'), 50)}
- Final Leverage: ${finalLeverage}x Net Debt/EBITDA

Generate a JSON response with these fields:
1. "overallAssessment" - 2-3 sentences summarizing their performance through the lens of the MODE CONTEXT above. Reference the real-world operators and frameworks mentioned. Be specific about their actual numbers.
2. "keyStrengths" - Array of 2-3 specific things they did well. Connect to the real-world analogies where relevant (e.g., "Like CSU's discipline of never raising equity..." or "This mirrors Shore Capital's approach to...").
3. "areasForImprovement" - Array of 2-3 constructive, specific areas. Reference what the real-world operators would have done differently.
4. "specificLessons" - Array of 2-3 objects with:
   - "observation": What pattern you noticed in their play
   - "lesson": The holdco principle this relates to, grounded in the MODE CONTEXT frameworks
   - "reference": A specific quote or concept from the operators mentioned (Thorndike, Beshore, Ishbia, Chenmark, Leonard, etc.)
5. "whatIfScenario" - 1-2 sentences describing an alternative strategy path, referencing a real-world operator's approach

Be direct, analytical, and grounded in real capital allocation wisdom. Reference their actual numbers. Respond ONLY with valid JSON.`;

    const result = await callAnthropic(prompt, 1000);

    if (!result.content) {
      return res.status(502).json({ error: result.error || 'AI service temporarily unavailable' });
    }

    // L-8: Parse and validate the JSON response with error handling
    let parsed;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      console.error('Failed to parse AI response as JSON:', result.content.slice(0, 200));
      return res.status(500).json({ error: 'AI returned invalid JSON' });
    }

    return res.status(200).json({
      overallAssessment: parsed.overallAssessment || '',
      keyStrengths: parsed.keyStrengths || [],
      areasForImprovement: parsed.areasForImprovement || [],
      specificLessons: parsed.specificLessons || [],
      whatIfScenario: parsed.whatIfScenario || '',
    });
  } catch (error) {
    console.error('Analyze game error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
