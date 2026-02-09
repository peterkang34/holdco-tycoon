import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const {
      buyerName, buyerType, isStrategic, fundSize,
      sectorName, businessName, ebitda, qualityRating, baseThesis,
      revenue, ebitdaMargin,
    } = req.body;

    if (!buyerName || !sectorName || !businessName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const marginNote = ebitdaMargin ? `, ${(ebitdaMargin * 100).toFixed(0)}% EBITDA margins` : '';
    const revenueNote = revenue ? `, ${revenue} revenue` : '';

    const prompt = `You are writing for a holding company acquisition game. Rewrite this investment thesis to be more specific and compelling.

Buyer: ${buyerName} (${buyerType}${isStrategic ? ', strategic acquirer' : ''}${fundSize ? `, ${fundSize}` : ''})
Target: ${businessName}, a ${sectorName} business with ${ebitda} EBITDA${marginNote}${revenueNote} (quality ${qualityRating}/5)
Base thesis: ${baseThesis}

Write 2-3 sentences that sound like a real investment committee memo. Be specific about value creation levers including margin improvement opportunities. Respond with ONLY the thesis text, no JSON or formatting.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'AI generation failed' });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return res.status(500).json({ error: 'No content generated' });
    }

    return res.status(200).json({ thesis: content.trim() });
  } catch (error) {
    console.error('Generate buyer error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
