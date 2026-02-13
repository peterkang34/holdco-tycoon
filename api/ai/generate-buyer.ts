import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sanitizeString } from '../_lib/rateLimit.js';
import { validateAIRequest, callAnthropic } from '../_lib/ai.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (await validateAIRequest(req, res)) return;

  try {
    const body = req.body || {};
    const buyerName = sanitizeString(body.buyerName, 100);
    const buyerType = sanitizeString(body.buyerType, 50);
    const isStrategic = !!body.isStrategic;
    const fundSize = sanitizeString(body.fundSize, 50);
    const sectorName = sanitizeString(body.sectorName, 100);
    const businessName = sanitizeString(body.businessName, 100);
    const ebitda = typeof body.ebitda === 'string' ? body.ebitda : String(body.ebitda || '');
    const qualityRating = typeof body.qualityRating === 'number' ? Math.min(5, Math.max(1, body.qualityRating)) : 3;
    const baseThesis = sanitizeString(body.baseThesis, 200);
    const revenue = typeof body.revenue === 'string' ? body.revenue : String(body.revenue || '');
    const ebitdaMargin = typeof body.ebitdaMargin === 'number' ? body.ebitdaMargin : undefined;

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

    const result = await callAnthropic(prompt, 300);

    if (!result.content) {
      return res.status(502).json({ error: result.error || 'AI service temporarily unavailable' });
    }

    return res.status(200).json({ thesis: result.content.trim() });
  } catch (error) {
    console.error('Generate buyer error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
