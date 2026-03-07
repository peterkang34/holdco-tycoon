import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sanitizeString } from '../_lib/rateLimit.js';
import { validateAIRequest, callAnthropic } from '../_lib/ai.js';

type NarrativeType = 'event' | 'business_update' | 'year_chronicle';

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
  // avgQuality intentionally omitted — was producing unhelpful "portfolio quality of 4.0/5" mentions
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
- Use ONLY the exact financial figures provided above — do NOT invent, calculate, or round your own numbers
- Do NOT mention portfolio quality ratings or scores
${context.narrativeToneGuidance ? `- VOICE/TONE: ${context.narrativeToneGuidance}` : ''}

Write 3-4 sentences in a shareholder letter style. Keep it under 80 words. Respond with just the narrative text.`;
}

function buildFamilyOfficeChroniclePrompt(context: Record<string, unknown>): string {
  // Build strategic context section
  const strategicLines: string[] = [];
  if (context.platformCount && (context.platformCount as number) > 0) {
    strategicLines.push(`- Platforms: ${context.platformCount} (with ${context.totalBoltOns || 0} bolt-on acquisitions)`);
  }
  if (context.sectors) strategicLines.push(`- Sectors: ${context.sectors}`);
  if (context.founderEquityValue) strategicLines.push(`- Founder Equity Value: ${context.founderEquityValue}`);
  const strategicSection = strategicLines.length > 0 ? `\nSTRATEGIC POSITION:\n${strategicLines.join('\n')}` : '';

  return `You are writing the annual chronicle for a family office — a generational wealth institution managing a permanent capital portfolio. This is NOT a startup holdco or PE fund. The tone should be contemplative, institutional, and legacy-focused — think stewardship, permanence, and generational wealth.

FAMILY OFFICE: ${context.holdcoName} Family Office
${context.foRound || `YEAR: ${context.year}`}

FAMILY OFFICE CONTEXT:
- Starting Capital: ${context.foStartingCash || 'N/A'}
- Philanthropy Committed: ${context.foPhilanthropyAmount || 'N/A'}
- Current MOIC: ${context.foCurrentMOIC || 'N/A'}

KEY FINANCIALS:
${context.totalRevenue ? `- Revenue: ${context.totalRevenue}${context.revenueGrowth ? ` [${context.revenueGrowth} YoY]` : ''}\n` : ''}- EBITDA: ${context.totalEbitda}${context.prevTotalEbitda ? ` (prior: ${context.prevTotalEbitda})` : ''}${context.ebitdaGrowth ? ` [${context.ebitdaGrowth} YoY]` : ''}
${context.avgMargin ? `- Avg EBITDA Margin: ${context.avgMargin}${context.marginChange ? ` [${context.marginChange} vs prior year]` : ''}\n` : ''}- Net Debt/EBITDA: ${context.leverage}
- FCF: ${context.fcf}
- Portfolio: ${context.portfolioCount} companies
${strategicSection}

THIS YEAR'S ACTIVITY:
${context.actions || 'A quiet year of stewardship and portfolio monitoring'}

MARKET: ${context.marketConditions || 'Normal'}
${context.concerns ? `\nCONCERNS: ${context.concerns}` : ''}
${context.positives ? `\nBRIGHT SPOTS: ${context.positives}` : ''}

WRITING GUIDELINES:
- Frame everything through the lens of institutional stewardship and generational permanence
- This is a family office deploying permanent capital — not a fund with a return deadline
- If the portfolio includes a pro sports franchise, reference it as a legacy/trophy asset
- Lead with the most significant development (acquisition, operational progress, strategic positioning)
- Mention specific actions taken (acquisitions by name, improvements) when available
- Include financial context but frame it around MOIC progression and capital deployment
- Use ONLY the exact financial figures provided above — do NOT invent, calculate, or round your own numbers
- Do NOT mention portfolio quality ratings or scores
${context.narrativeToneGuidance ? `- VOICE/TONE: ${context.narrativeToneGuidance}` : ''}

Write 3-4 sentences in a shareholder letter style befitting a family office annual review. Keep it under 80 words. Respond with just the narrative text.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (await validateAIRequest(req, res)) return;

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
        prompt = context.isFamilyOfficeMode
          ? buildFamilyOfficeChroniclePrompt(context)
          : buildYearChroniclePrompt(context);
        break;
      default:
        return res.status(400).json({ error: 'Invalid narrative type' });
    }

    const result = await callAnthropic(prompt, 200);

    if (!result.content) {
      return res.status(502).json({ error: result.error || 'AI service temporarily unavailable' });
    }

    return res.status(200).json({ narrative: result.content.trim() });
  } catch (error) {
    console.error('Generate narrative error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
