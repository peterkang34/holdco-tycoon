import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkAIRateLimit, isBodyTooLarge, sanitizeString } from '../_lib/rateLimit.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Rate limit: 10 requests/minute per IP
  if (await checkAIRateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  // Body size limit
  if (isBodyTooLarge(req.body)) {
    return res.status(413).json({ error: 'Request too large' });
  }

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

    const ebitdaFormatted = ebitda >= 1000
      ? `$${(ebitda / 1000).toFixed(1)}M`
      : `$${ebitda}k`;

    const revenueFormatted = revenue && revenue >= 1000
      ? `$${(revenue / 1000).toFixed(1)}M`
      : revenue ? `$${revenue}k` : 'N/A';
    const marginFormatted = ebitdaMargin ? `${(ebitdaMargin * 100).toFixed(0)}%` : 'N/A';

    const prompt = `Generate realistic M&A deal content for a holding company acquisition game. Be creative and specific.

Business Details:
- Sector: ${sectorName}
- Type: ${subType}
- Annual Revenue: ${revenueFormatted}
- EBITDA Margin: ${marginFormatted}
- Annual EBITDA: ${ebitdaFormatted}
- Quality: ${qualityDescriptions[qualityRating] || 'average'}
- Deal Type: ${acquisitionType === 'tuck_in' ? 'Small tuck-in acquisition' : acquisitionType === 'platform' ? 'Platform company opportunity' : 'Standalone acquisition'}

Generate a JSON object with these fields:
1. "backstory" - 2-3 sentences about the company's founding, history, and what makes it unique. Be specific about location, founder background, or key milestones.
2. "sellerMotivation" - 1-2 sentences explaining why the owner is selling. Make it realistic (retirement, partner dispute, health, opportunity cost, estate planning, burnout, etc.)
3. "quirks" - Array of 2-3 interesting/unique details about the business (unusual customer, hidden asset, key relationship, operational quirk)
4. "redFlags" - Array of 0-2 concerns a buyer should know about (only if quality < 4)
5. "opportunities" - Array of 1-2 potential upsides for a new owner

Respond ONLY with valid JSON, no other text.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Anthropic API error:', response.status);
      return res.status(502).json({ error: 'AI service temporarily unavailable' });
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
