import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

type NarrativeType = 'event' | 'business_update' | 'year_chronicle' | 'deal_story';

interface NarrativeRequest {
  type: NarrativeType;
  context: Record<string, unknown>;
}

function buildEventPrompt(context: Record<string, unknown>): string {
  const holdcoName = context.holdcoName || 'the holding company';
  const affectedBiz = context.affectedBusinessName;
  const affectedSector = context.affectedSector;
  const allBizNames = context.allBusinessNames as string[] | undefined;

  let portfolioContext = `HOLDING COMPANY: ${holdcoName}`;
  if (affectedBiz) {
    portfolioContext += `\nAFFECTED BUSINESS: ${affectedBiz}${affectedSector ? ` (${affectedSector})` : ''}`;
  }
  if (allBizNames && allBizNames.length > 0) {
    portfolioContext += `\nPORTFOLIO: ${allBizNames.join(', ')}`;
  }

  return `You are a financial journalist writing a brief, dramatic narrative for a private equity simulation game. Write 2-3 sentences that bring this economic event to life with specific details and human impact.

EVENT: ${context.eventType}
EFFECT: ${context.effect}
${portfolioContext}

CRITICAL: Use the REAL company and holdco names provided above — do NOT invent fictional business names. ${affectedBiz ? `The story must be about ${affectedBiz}.` : 'Reference the actual portfolio companies.'} You may invent character names (people) for color but all business names must match the player's actual portfolio.

Write a vivid, present-tense narrative. Keep it under 50 words. Be dramatic but professional. Respond with just the narrative text, no quotes or labels.`;
}

function buildBusinessUpdatePrompt(context: Record<string, unknown>): string {
  return `You are narrating the ongoing story of a business in a private equity portfolio. Write a brief story beat about what happened this year.

BUSINESS: ${context.businessName}
SECTOR: ${context.sector}
SUBTYPE: ${context.subType}
YEAR IN PORTFOLIO: ${context.yearsOwned}
EBITDA CHANGE: ${context.ebitdaChange}
QUALITY: ${context.quality}/5
RECENT EVENTS: ${context.recentEvents || 'None'}
IMPROVEMENTS MADE: ${context.improvements || 'None'}
IS PLATFORM: ${context.isPlatform ? 'Yes, with ' + context.boltOnCount + ' bolt-ons' : 'No'}

Write 2-3 sentences about what happened at this business this year. Include a specific detail (a person, customer, project, challenge). Make it feel like a real company story. Keep it under 60 words. Respond with just the narrative text.`;
}

function buildYearChroniclePrompt(context: Record<string, unknown>): string {
  return `You are writing the annual chronicle for a holding company in a business simulation. Be HONEST and balanced — if the financials are stressed, say so. Do not sugarcoat bad numbers.

HOLDCO NAME: ${context.holdcoName}
YEAR: ${context.year}

FINANCIAL SNAPSHOT:
- Total EBITDA: ${context.totalEbitda}${context.prevTotalEbitda ? ` (prior year: ${context.prevTotalEbitda})` : ''}
- Free Cash Flow: ${context.fcf}
- Cash Position: ${context.cash}
- Total Debt: ${context.totalDebt}
- Interest Expense: ${context.interestExpense}
- Net Debt/EBITDA: ${context.leverage}
- Portfolio Companies: ${context.portfolioCount}

THIS YEAR'S ACTIONS:
${context.actions || 'Quiet year of organic growth'}

MARKET CONDITIONS: ${context.marketConditions || 'Normal'}
${context.concerns ? `\nKEY CONCERNS: ${context.concerns}` : ''}
${context.positives ? `\nBRIGHT SPOTS: ${context.positives}` : ''}

IMPORTANT: Your tone MUST match the financial reality. If FCF is negative, leverage is high, or interest is eating EBITDA — the tone should reflect the strain, risk, and pressure. Aggressive acquisitions funded by debt deserve cautious commentary, not celebration. Only be optimistic when the numbers justify it.

Write a 3-4 sentence chronicle of this year for ${context.holdcoName}. Use a narrative style like a shareholder letter. Reference specific financial realities (FCF, leverage, cash). Keep it under 80 words. Respond with just the narrative text.`;
}

function buildDealStoryPrompt(context: Record<string, unknown>): string {
  return `You are creating a rich backstory for an M&A opportunity in a private equity game. Make it feel like a real deal memo.

BUSINESS: ${context.businessName}
SECTOR: ${context.sector}
SUBTYPE: ${context.subType}
EBITDA: ${context.ebitda}
QUALITY: ${context.quality}/5
ASKING MULTIPLE: ${context.multiple}x
DEAL TYPE: ${context.dealType}

Create a compelling 3-4 sentence story including:
1. How the business was founded (specific founder name, year, origin story)
2. Why they're selling now (make it human and specific)
3. One unique thing about the business (hidden asset, key relationship, quirk)

Be creative and specific. Keep it under 100 words. Respond with just the narrative text.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { type, context } = req.body as NarrativeRequest;

    if (!type || !context) {
      return res.status(400).json({ error: 'Missing type or context' });
    }

    let prompt: string;
    switch (type) {
      case 'event':
        prompt = buildEventPrompt(context);
        break;
      case 'business_update':
        prompt = buildBusinessUpdatePrompt(context);
        break;
      case 'year_chronicle':
        prompt = buildYearChroniclePrompt(context);
        break;
      case 'deal_story':
        prompt = buildDealStoryPrompt(context);
        break;
      default:
        return res.status(400).json({ error: 'Invalid narrative type' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
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
      return res.status(response.status).json({ error: 'Narrative generation failed' });
    }

    const data = await response.json();
    const narrative = data.content?.[0]?.text?.trim();

    if (!narrative) {
      return res.status(500).json({ error: 'No narrative generated' });
    }

    return res.status(200).json({ narrative });
  } catch (error) {
    console.error('Generate narrative error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
