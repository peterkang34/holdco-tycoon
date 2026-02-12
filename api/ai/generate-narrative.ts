import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkAIRateLimit, isBodyTooLarge, sanitizeString } from '../_lib/rateLimit';

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

  return `You are a financial journalist writing a brief, dramatic narrative for a holding company simulation game. The player runs a holdco (not a PE fund) — never call it a "private equity firm". Write 2-3 sentences that bring this economic event to life with specific details and human impact.

EVENT: ${context.eventType}
EFFECT: ${context.effect}
${portfolioContext}

CRITICAL: Use the REAL company and holdco names provided above — do NOT invent fictional business names. ${affectedBiz ? `The story must be about ${affectedBiz}.` : 'Reference the actual portfolio companies.'} You may invent character names (people) for color but all business names must match the player's actual portfolio.

Write a vivid, present-tense narrative. Keep it under 50 words. Be dramatic but professional. Respond with just the narrative text, no quotes or labels.`;
}

function buildBusinessUpdatePrompt(context: Record<string, unknown>): string {
  const revenueChange = context.revenueChange ? `\nREVENUE CHANGE: ${context.revenueChange}` : '';
  const marginChange = context.marginChange ? `\nMARGIN CHANGE: ${context.marginChange}` : '';

  return `You are narrating the ongoing story of a business in a holding company's portfolio. Write a brief story beat about what happened this year.

BUSINESS: ${context.businessName}
SECTOR: ${context.sector}
SUBTYPE: ${context.subType}
YEAR IN PORTFOLIO: ${context.yearsOwned}
EBITDA CHANGE: ${context.ebitdaChange}${revenueChange}${marginChange}
QUALITY: ${context.quality}/5
RECENT EVENTS: ${context.recentEvents || 'None'}
IMPROVEMENTS MADE: ${context.improvements || 'None'}
IS PLATFORM: ${context.isPlatform ? 'Yes, with ' + context.boltOnCount + ' bolt-ons' : 'No'}

Write 2-3 sentences about what happened at this business this year. Include a specific detail (a person, customer, project, challenge). If margins changed significantly, weave that into the narrative (e.g., cost pressures, efficiency gains). Make it feel like a real company story. Keep it under 60 words. Respond with just the narrative text.`;
}

function buildYearChroniclePrompt(context: Record<string, unknown>): string {
  // Build strategic context section
  const strategicLines: string[] = [];
  if (context.platformCount && (context.platformCount as number) > 0) {
    strategicLines.push(`- Platforms: ${context.platformCount} (with ${context.totalBoltOns || 0} bolt-on acquisitions)`);
  }
  if (context.avgQuality) strategicLines.push(`- Avg Portfolio Quality: ${context.avgQuality}/5`);
  if (context.sectors) strategicLines.push(`- Sectors: ${context.sectors}`);
  if (context.sharedServices) strategicLines.push(`- Shared Services: ${context.sharedServices}`);
  if (context.fcfPerShare) strategicLines.push(`- FCF/Share: ${context.fcfPerShare}`);
  if (context.founderEquityValue) strategicLines.push(`- Founder Equity Value: ${context.founderEquityValue}`);
  else if (context.enterpriseValue) strategicLines.push(`- Enterprise Value: ${context.enterpriseValue}`);
  const strategicSection = strategicLines.length > 0 ? `\nSTRATEGIC POSITION:\n${strategicLines.join('\n')}` : '';

  return `You are writing the annual chronicle for a holding company in a business simulation. The player runs a holdco (not a PE fund). Be HONEST and balanced — acknowledge both progress and challenges.

HOLDCO NAME: ${context.holdcoName}
YEAR: ${context.year}

KEY FINANCIALS:
${context.totalRevenue ? `- Revenue: ${context.totalRevenue}${context.revenueGrowth ? ` [${context.revenueGrowth} YoY]` : ''}\n` : ''}- EBITDA: ${context.totalEbitda}${context.prevTotalEbitda ? ` (prior: ${context.prevTotalEbitda})` : ''}${context.ebitdaGrowth ? ` [${context.ebitdaGrowth} YoY]` : ''}
${context.avgMargin ? `- Avg EBITDA Margin: ${context.avgMargin}${context.marginChange ? ` [${context.marginChange} vs prior year]` : ''}\n` : ''}- Net Debt/EBITDA: ${context.leverage}
- FCF: ${context.fcf}
- Portfolio: ${context.portfolioCount} companies
${strategicSection}

THIS YEAR'S ACTIVITY:
${context.actions || 'Quiet year of organic growth'}

MARKET: ${context.marketConditions || 'Normal'}
${context.concerns ? `\nCONCERNS: ${context.concerns}` : ''}
${context.positives ? `\nBRIGHT SPOTS: ${context.positives}` : ''}

WRITING GUIDELINES:
- Write a BALANCED chronicle covering M&A activity, operational progress, AND financial health — not just cash and leverage
- Lead with the most significant development this year (acquisition, exit, organic growth milestone, strategic shift)
- Mention specific actions taken (acquisitions by name, improvements, platform building) when available
- Include financial context but don't let it dominate — one financial reference per chronicle is enough
- If financials are stressed, acknowledge it honestly but also note any strategic progress
- Tone should match overall trajectory, not just one metric

Write 3-4 sentences in a shareholder letter style. Keep it under 80 words. Respond with just the narrative text.`;
}

function buildDealStoryPrompt(context: Record<string, unknown>): string {
  const archetypeContext = context.sellerArchetype ? `\nSELLER ARCHETYPE: ${String(context.sellerArchetype).replace(/_/g, ' ')}` : '';
  const archetypeGuidance: Record<string, string> = {
    retiring_founder: 'The seller is a founder nearing retirement. Emphasize their legacy, long tenure, and desire to see the business continue.',
    burnt_out_operator: 'The seller is burnt out after years of running the business. Show the toll of entrepreneurship and their readiness to move on.',
    accidental_holdco: 'This is a divestiture — a larger company shedding a non-core division. Frame it as a corporate strategy decision.',
    distressed_seller: 'The seller is in financial distress. Show urgency, perhaps a health issue, divorce, or failed expansion that forced their hand.',
    mbo_candidate: 'Management wants to buy the business. Show a capable team ready to take the reins from an exiting owner.',
    franchise_breakaway: 'The seller broke away from a franchise system. Show their entrepreneurial drive and why independence matters.',
  };
  const guidance = context.sellerArchetype ? archetypeGuidance[context.sellerArchetype as string] || '' : '';

  return `You are creating a rich backstory for an M&A opportunity in a holding company simulation game. Make it feel like a real deal memo.

BUSINESS: ${context.businessName}
SECTOR: ${context.sector}
SUBTYPE: ${context.subType}
${context.revenue ? `REVENUE: ${context.revenue}\n` : ''}EBITDA: ${context.ebitda}${context.ebitdaMargin ? ` (${context.ebitdaMargin} margins)` : ''}
QUALITY: ${context.quality}/5
ASKING MULTIPLE: ${context.multiple}x
DEAL TYPE: ${context.dealType}${archetypeContext}

Create a compelling 3-4 sentence story including:
1. How the business was founded (specific founder name, year, origin story)
2. Why they're selling now (make it human and specific)
3. One unique thing about the business (hidden asset, key relationship, quirk)
${guidance ? `\nSELLER CONTEXT: ${guidance}` : ''}
Be creative and specific. Keep it under 100 words. Respond with just the narrative text.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  if (await checkAIRateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  if (isBodyTooLarge(req.body)) {
    return res.status(413).json({ error: 'Request too large' });
  }

  try {
    const { type, context } = req.body as NarrativeRequest;

    if (!type || !context) {
      return res.status(400).json({ error: 'Missing type or context' });
    }

    // Sanitize all string context values to prevent prompt injection
    for (const key of Object.keys(context)) {
      if (typeof context[key] === 'string') {
        context[key] = sanitizeString(context[key], 200);
      }
    }

    // Cap allBusinessNames to prevent prompt inflation
    if (Array.isArray(context.allBusinessNames)) {
      context.allBusinessNames = (context.allBusinessNames as string[]).slice(0, 30).map(
        (n: string) => (typeof n === 'string' ? n.slice(0, 100) : '')
      );
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
      console.error('Anthropic API error:', response.status);
      return res.status(502).json({ error: 'AI service temporarily unavailable' });
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
