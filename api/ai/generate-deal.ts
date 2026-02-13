import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sanitizeString } from '../_lib/rateLimit.js';
import { validateAIRequest, callAnthropic, formatMoneyForPrompt } from '../_lib/ai.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (await validateAIRequest(req, res)) return;

  try {
    const body = req.body || {};
    const sectorName = sanitizeString(body.sectorName, 100);
    const subType = sanitizeString(body.subType, 100);
    const ebitda = typeof body.ebitda === 'number' ? body.ebitda : 0;
    const qualityRating = typeof body.qualityRating === 'number' ? Math.min(5, Math.max(1, body.qualityRating)) : 3;
    const acquisitionType = sanitizeString(body.acquisitionType, 50);
    const revenue = typeof body.revenue === 'number' ? body.revenue : undefined;
    const ebitdaMargin = typeof body.ebitdaMargin === 'number' ? body.ebitdaMargin : undefined;

    // Validate required fields
    if (!sectorName || !subType || !ebitda || !qualityRating || !acquisitionType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const qualityDescriptions: Record<number, string> = {
      1: 'struggling, has significant issues',
      2: 'below average, needs work',
      3: 'average, solid performer',
      4: 'above average, well-run',
      5: 'exceptional, best-in-class',
    };

    const ebitdaFormatted = formatMoneyForPrompt(ebitda);

    const revenueFormatted = revenue ? formatMoneyForPrompt(revenue) : 'N/A';
    const marginFormatted = ebitdaMargin ? `${(ebitdaMargin * 100).toFixed(0)}%` : 'N/A';

    // Due diligence signals
    const operatorQuality = sanitizeString(body.operatorQuality, 50) || 'moderate';
    const revenueConcentration = sanitizeString(body.revenueConcentration, 50) || 'medium';
    const marketTrend = sanitizeString(body.marketTrend, 50) || 'flat';
    const competitivePosition = sanitizeString(body.competitivePosition, 50) || 'competitive';
    const customerRetention = typeof body.customerRetention === 'number' ? `${body.customerRetention}%` : 'N/A';
    const sellerArchetype = sanitizeString(body.sellerArchetype, 50);

    const archetypeDescriptions: Record<string, string> = {
      retiring_founder: 'Retiring founder ready to hand over the business',
      burnt_out_operator: 'Burnt-out owner looking to exit',
      accidental_holdco: 'Parent company divesting a non-core division',
      distressed_seller: 'Seller under financial pressure',
      mbo_candidate: 'Management team ready to take ownership',
      franchise_breakaway: 'Former franchisee going independent',
    };

    const prompt = `Generate realistic M&A deal content for a holding company acquisition game. Be creative and specific. The story MUST be consistent with the quality rating, due diligence signals, and seller profile below.

Business Details:
- Sector: ${sectorName}
- Type: ${subType}
- Annual Revenue: ${revenueFormatted}
- EBITDA Margin: ${marginFormatted}
- Annual EBITDA: ${ebitdaFormatted}
- Quality: ${qualityDescriptions[qualityRating] || 'average'} (${qualityRating}/5 stars)
- Deal Type: ${acquisitionType === 'tuck_in' ? 'Small tuck-in acquisition' : acquisitionType === 'platform' ? 'Platform company opportunity' : 'Standalone acquisition'}

Due Diligence:
- Operator: ${operatorQuality} (weak = key-person risk, strong = professional management)
- Revenue Concentration: ${revenueConcentration} (high = dependent on few customers)
- Market Trend: ${marketTrend} (growing/flat/declining)
- Competitive Position: ${competitivePosition} (leader/competitive/commoditized)
- Customer Retention: ${customerRetention}
${sellerArchetype ? `- Seller Profile: ${archetypeDescriptions[sellerArchetype] || sellerArchetype}` : ''}

IMPORTANT: The backstory, quirks, red flags, and opportunities must reflect the quality and DD signals above. A ${qualityRating}-star business with ${operatorQuality} operators and ${marketTrend} trend should have a story that matches. Don't describe strong management for a weak operator, or growing markets for a declining trend.

Generate a JSON object with these fields:
1. "backstory" - 2-3 sentences about the company's founding, history, and what makes it unique. Be specific about location, founder background, or key milestones. Must reflect the quality rating and operator quality.
2. "sellerMotivation" - 1-2 sentences explaining why the owner is selling.${sellerArchetype ? ` Must align with the seller profile: ${archetypeDescriptions[sellerArchetype] || sellerArchetype}.` : ''}
3. "quirks" - Array of 2-3 interesting/unique details about the business. Must be consistent with quality level.
4. "redFlags" - Array of 0-2 concerns a buyer should know about (only if quality < 4). Reference specific DD weaknesses.
5. "opportunities" - Array of 1-2 potential upsides for a new owner

Respond ONLY with valid JSON, no other text.`;

    const result = await callAnthropic(prompt, 500);

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
      backstory: parsed.backstory || '',
      sellerMotivation: parsed.sellerMotivation || '',
      quirks: parsed.quirks || [],
      redFlags: parsed.redFlags,
      opportunities: parsed.opportunities,
    });
  } catch (error) {
    console.error('Generate deal error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
