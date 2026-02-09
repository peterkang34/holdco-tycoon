import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function formatMoney(amountInThousands: number): string {
  const amount = amountInThousands * 1000;
  if (Math.abs(amount) >= 1000000000) {
    return `$${(amount / 1000000000).toFixed(1)}B`;
  }
  if (Math.abs(amount) >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}k`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check API key is configured
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const {
      holdcoName,
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
    } = req.body;

    // Validate required fields
    if (!holdcoName || !score) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const prompt = `You are an experienced investment advisor reviewing a player's 20-year holding company simulation game. The player runs a holdco (not a PE fund) — never use the term "private equity firm". Analyze their performance and provide personalized, actionable feedback.

GAME RESULTS:
- Holdco Name: ${holdcoName}
- Final Grade: ${score.grade} (${score.total}/100 points)
- Title: ${score.title}
- Enterprise Value: ${formatMoney(enterpriseValue)}

SCORE BREAKDOWN:
- FCF/Share Growth: ${score.fcfShareGrowth}/25
- Portfolio ROIC: ${score.portfolioRoic}/20
- Capital Deployment: ${score.capitalDeployment}/20
- Balance Sheet Health: ${score.balanceSheetHealth}/15
- Strategic Discipline: ${score.strategicDiscipline}/20

PORTFOLIO ACTIVITY:
- Total Acquisitions: ${totalAcquisitions}
- Businesses Sold: ${totalSold} (${soldWithProfit} at profit)
- Businesses Wound Down: ${totalWoundDown}
- Average Hold Period: ${avgHoldPeriod} years
- Average Quality Rating: ${avgQuality}/5
- Operational Improvements Made: ${totalImprovements}
- ${platformSummary}
- Sector Distribution: ${sectorSummary}

CAPITAL MANAGEMENT:
- Total Invested Capital: ${formatMoney(totalInvestedCapital)}
- Distributions to Owners: ${formatMoney(totalDistributions)}
- Share Buybacks: ${formatMoney(totalBuybacks)}
- Equity Raises Used: ${equityRaisesUsed}/3
- Shared Services Active: ${sharedServicesActive}

TRAJECTORY:
- EBITDA Growth: ${ebitdaGrowth}%
- Revenue Growth: ${req.body.revenueGrowth || 'N/A'}%
- Avg EBITDA Margin: ${req.body.avgMargin || 'N/A'}
- Margin Change: ${req.body.marginChange || 'N/A'}
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({ error: 'AI analysis failed' });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return res.status(500).json({ error: 'No content generated' });
    }

    // L-8: Parse and validate the JSON response with error handling
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('Failed to parse AI response as JSON:', content.slice(0, 200));
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
