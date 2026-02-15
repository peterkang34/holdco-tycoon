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

    const prompt = `You are an experienced investment advisor reviewing a player's ${totalRounds}-year holding company simulation game. The player runs a holdco (not a PE fund) — never use the term "private equity firm". Analyze their performance and provide personalized, actionable feedback.

GAME RESULTS:
- Holdco Name: ${holdcoName}
- Difficulty: ${difficulty}
- Duration: ${totalRounds} years
- Final Grade: ${score.grade} (${score.total}/100 points)
- Title: ${score.title}
- Founder Equity Value: ${formatMoneyForPrompt(founderEquityValue)} (founder's share of NAV)
- Enterprise Value: ${formatMoneyForPrompt(enterpriseValue)} (total portfolio value)
- Founder Ownership: ${founderOwnership}

SCORE BREAKDOWN:
- Value Creation (FEV / Capital): ${score.valueCreation}/20
- FCF/Share Growth: ${score.fcfShareGrowth}/20
- Portfolio ROIC: ${score.portfolioRoic}/15
- Capital Deployment: ${score.capitalDeployment}/15
- Balance Sheet Health: ${score.balanceSheetHealth}/15
- Strategic Discipline: ${score.strategicDiscipline}/15

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
1. "overallAssessment" - 2-3 sentences summarizing their performance, mentioning specific strengths and weaknesses
2. "keyStrengths" - Array of 2-3 specific things they did well (be concrete, reference their actual numbers)
3. "areasForImprovement" - Array of 2-3 specific areas where they could improve (be constructive and specific)
4. "specificLessons" - Array of 2-3 objects with:
   - "observation": What pattern you noticed in their play
   - "lesson": The PE/holdco principle this relates to
   - "reference": Optional book/investor quote (Buffett, Munger, Mark Leonard, etc.)
5. "whatIfScenario" - 1-2 sentences describing an alternative path that might have improved their outcome

Be direct and specific. Reference their actual numbers. Don't be generic. Respond ONLY with valid JSON.`;

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
