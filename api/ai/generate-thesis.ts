import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sanitizeString } from '../_lib/rateLimit.js';
import { validateAIRequest, callAnthropic, formatMoneyForPrompt } from '../_lib/ai.js';

interface ThesisRequest {
  holdcoName: string;
  archetype: string;
  grade: string;
  score: number;
  fev: number;
  difficulty: string;
  duration: string;
  totalRounds: number;
  isFundManager: boolean;
  isBankrupt: boolean;
  // Portfolio
  totalAcquisitions: number;
  totalSells: number;
  activeCount: number;
  platformsForged: number;
  platformCount: number;
  tuckInCount: number;
  avgHoldYears: number;
  // Capital
  peakLeverage: number;
  totalDistributions: number;
  hasRestructured: boolean;
  rolloverEquityCount: number;
  avgMultiplePaid: number;
  // Operations
  turnaroundsStarted: number;
  turnaroundsSucceeded: number;
  turnaroundsFailed: number;
  recessionAcquisitionCount: number;
  // Exits
  totalExitProceeds: number;
  portfolioMoic: number;
  exitedBusinesses: Array<{ name: string; sector: string; moic: number; holdYears: number }>;
  // Sectors
  sectorFocus: string[];
  allTimeSectorIds: string[];
  // Performance
  totalInvestedCapital: number;
  totalShareholderReturn: number;
  // PE fund (optional)
  fundName?: string;
  grossMoic?: number;
  netIrr?: number;
  carryEarned?: number;
}

function buildThesisPrompt(data: ThesisRequest): string {
  const name = data.holdcoName;
  const durationYears = data.totalRounds;
  const sectorCount = data.sectorFocus.length;
  const allTimeSectors = data.allTimeSectorIds.length;

  // Build exit summary
  let exitSummary = '';
  if (data.exitedBusinesses.length > 0) {
    const shown = data.exitedBusinesses.slice(0, 5);
    const exitLines = shown.map(
      e => `  - ${e.name} (${e.sector}): ${e.moic.toFixed(1)}x MOIC, held ${e.holdYears}yr`
    ).join('\n');
    const truncationNote = data.totalSells > shown.length ? ` (showing top ${shown.length} of ${data.totalSells})` : '';
    exitSummary = `\nEXITS (${data.totalSells} total, ${formatMoneyForPrompt(data.totalExitProceeds)} proceeds)${truncationNote}:\n${exitLines}`;
  }

  // Build key observations the AI should consider
  const observations: string[] = [];
  if (data.totalSells === 0 && data.totalAcquisitions > 0)
    observations.push('Never sold a business — permanent capital philosophy');
  if (data.totalSells > 0 && data.totalSells >= data.totalAcquisitions / 2)
    observations.push(`Active seller — exited ${data.totalSells} of ${data.totalAcquisitions} acquisitions`);
  if (data.platformsForged > 0)
    observations.push(`Forged ${data.platformsForged} integrated platform${data.platformsForged > 1 ? 's' : ''}`);
  if (data.turnaroundsStarted > 0) {
    const rate = data.turnaroundsStarted > 0 ? Math.round(data.turnaroundsSucceeded / data.turnaroundsStarted * 100) : 0;
    observations.push(`${data.turnaroundsStarted} turnarounds attempted (${rate}% success)`);
  }
  if (data.recessionAcquisitionCount >= 2)
    observations.push(`${data.recessionAcquisitionCount} counter-cyclical acquisitions during recessions`);
  if (data.hasRestructured)
    observations.push('Survived a restructuring event');
  if (data.rolloverEquityCount >= 2)
    observations.push(`Used rollover equity in ${data.rolloverEquityCount} deals`);
  if (data.tuckInCount > 0)
    observations.push(`${data.tuckInCount} tuck-in acquisitions`);
  if (data.totalDistributions > 0)
    observations.push(`${formatMoneyForPrompt(data.totalDistributions)} distributed to shareholders`);
  if (data.peakLeverage > 4)
    observations.push(`Peaked at ${data.peakLeverage}x leverage — aggressive capital structure`);
  if (allTimeSectors > sectorCount)
    observations.push(`Operated across ${allTimeSectors} sectors over time, ending with ${sectorCount}`);
  // Capital efficiency signal
  if (data.portfolioMoic >= 3.0)
    observations.push(`${data.portfolioMoic.toFixed(1)}x MOIC — exceptional capital efficiency`);
  else if (data.portfolioMoic < 1.5 && data.totalAcquisitions >= 3)
    observations.push(`${data.portfolioMoic.toFixed(1)}x MOIC on ${data.totalAcquisitions} deals — capital efficiency lagged`);
  // Hold period characterization
  if (data.avgHoldYears >= 8 && data.totalSells > 0)
    observations.push(`Avg hold of ${data.avgHoldYears}yr despite ${data.totalSells} exits — patient seller`);

  const observationText = observations.length > 0
    ? `\nKEY OBSERVATIONS:\n${observations.map(o => `- ${o}`).join('\n')}`
    : '';

  const modeLabel = data.isFundManager ? 'PE fund' : 'holding company';

  return `You are writing a concise strategy debrief for a ${modeLabel} simulation game. This is the Investment Thesis section — a 2-3 sentence analytical summary of how the player built and managed their portfolio.

${data.isFundManager ? `FUND: ${data.fundName || name}` : `HOLDCO: ${name}`}
ARCHETYPE: ${data.archetype.replace(/_/g, ' ')}
GRADE: ${data.grade} (${data.score}/100)
DURATION: ${durationYears} years (${data.duration === 'standard' ? 'full game' : 'quick play'})

PORTFOLIO STATS:
- Acquisitions: ${data.totalAcquisitions} total, ${data.activeCount} ending portfolio
- Sells/Exits: ${data.totalSells}
- Platforms: ${data.platformsForged} forged, ${data.platformCount} active
- Tuck-ins: ${data.tuckInCount}
- Avg hold period: ${data.avgHoldYears}yr
- Avg multiple paid: ${data.avgMultiplePaid}x
- Sectors: ${sectorCount} ending (${allTimeSectors} all-time)

FINANCIALS:
- FEV: ${formatMoneyForPrompt(data.fev)}
- Total invested: ${formatMoneyForPrompt(data.totalInvestedCapital)}
- Total shareholder return: ${formatMoneyForPrompt(data.totalShareholderReturn)}
- Portfolio MOIC: ${data.portfolioMoic.toFixed(2)}x
- Distributions: ${formatMoneyForPrompt(data.totalDistributions)}
- Peak leverage: ${data.peakLeverage}x
${exitSummary}
${observationText}

WRITING RULES:
- Write exactly 2-3 sentences. Under 85 words total.
- Be SPECIFIC and ACCURATE — reference actual numbers from the data above. Do not contradict the data.
- If the player sold businesses, acknowledge the exits. If they never sold, note the permanent hold approach. Do NOT claim "never sold" when exits clearly happened.
- Capture the defining strategic narrative: what made this run distinctive? Was it the platform building, the exits, the capital discipline, the turnarounds, the sector focus?
- ${data.isFundManager ? 'Use PE vocabulary: "portfolio companies", "deployment", "value creation", "exit", "carry".' : 'Use holdco vocabulary: "businesses", "acquisitions", "portfolio", "equity value".'}
- Tone: analytical, like a shareholder letter. Not promotional.
- The ARCHETYPE label is a classification, not a narrative mandate. Let the actual numbers drive the story.
- If the holdco went bankrupt, frame as a post-mortem — what went wrong, not what went right.
- Use ONLY the real data provided. Do NOT invent companies, names, or numbers.
- Respond with just the thesis text, no quotes, labels, or formatting.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (await validateAIRequest(req, res)) return;

  try {
    const data = req.body as ThesisRequest;

    if (!data.holdcoName || data.totalAcquisitions == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Sanitize holdco name
    data.holdcoName = sanitizeString(data.holdcoName, 50);
    if (data.fundName) data.fundName = sanitizeString(data.fundName, 50);

    // Sanitize exit business names
    if (Array.isArray(data.exitedBusinesses)) {
      data.exitedBusinesses = data.exitedBusinesses.slice(0, 5).map(e => ({
        ...e,
        name: sanitizeString(e.name, 100),
        sector: sanitizeString(e.sector, 50),
      }));
    }

    const prompt = buildThesisPrompt(data);
    const result = await callAnthropic(prompt, 150);

    if (!result.content) {
      return res.status(502).json({ error: result.error || 'AI service temporarily unavailable' });
    }

    return res.status(200).json({ thesis: result.content.trim() });
  } catch (error) {
    console.error('Generate thesis error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
