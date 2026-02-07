import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
    const { sectorName, subType, ebitda, qualityRating, acquisitionType } = req.body;

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

    const prompt = `Generate realistic M&A deal content for a private equity acquisition game. Be creative and specific.

Business Details:
- Sector: ${sectorName}
- Type: ${subType}
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
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({ error: 'AI generation failed' });
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
