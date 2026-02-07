import { SectorId, AIGeneratedContent, QualityRating, GameState, Business, ScoreBreakdown } from '../engine/types';
import { SECTORS } from '../data/sectors';

const API_KEY_STORAGE_KEY = 'holdco-tycoon-anthropic-api-key';
const AI_ENABLED_KEY = 'holdco-tycoon-ai-enabled';

// Store API key securely in localStorage
export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function isAIEnabled(): boolean {
  return localStorage.getItem(AI_ENABLED_KEY) === 'true' && !!getApiKey();
}

export function setAIEnabled(enabled: boolean): void {
  localStorage.setItem(AI_ENABLED_KEY, enabled ? 'true' : 'false');
}

interface GenerationParams {
  sectorId: SectorId;
  subType: string;
  ebitda: number;
  qualityRating: QualityRating;
  acquisitionType: 'standalone' | 'tuck_in' | 'platform';
}

// Generate AI content for a business
export async function generateBusinessContent(params: GenerationParams): Promise<AIGeneratedContent | null> {
  const apiKey = getApiKey();
  if (!apiKey || !isAIEnabled()) {
    return null;
  }

  const sector = SECTORS[params.sectorId];
  const ebitdaFormatted = params.ebitda >= 1000
    ? `$${(params.ebitda / 1000).toFixed(1)}M`
    : `$${params.ebitda}k`;

  const qualityDescriptions: Record<QualityRating, string> = {
    1: 'struggling, has significant issues',
    2: 'below average, needs work',
    3: 'average, solid performer',
    4: 'above average, well-run',
    5: 'exceptional, best-in-class',
  };

  const prompt = `Generate realistic M&A deal content for a private equity acquisition game. Be creative and specific.

Business Details:
- Sector: ${sector.name}
- Type: ${params.subType}
- Annual EBITDA: ${ebitdaFormatted}
- Quality: ${qualityDescriptions[params.qualityRating]}
- Deal Type: ${params.acquisitionType === 'tuck_in' ? 'Small tuck-in acquisition' : params.acquisitionType === 'platform' ? 'Platform company opportunity' : 'Standalone acquisition'}

Generate a JSON object with these fields:
1. "backstory" - 2-3 sentences about the company's founding, history, and what makes it unique. Be specific about location, founder background, or key milestones.
2. "sellerMotivation" - 1-2 sentences explaining why the owner is selling. Make it realistic (retirement, partner dispute, health, opportunity cost, estate planning, burnout, etc.)
3. "quirks" - Array of 2-3 interesting/unique details about the business (unusual customer, hidden asset, key relationship, operational quirk)
4. "redFlags" - Array of 0-2 concerns a buyer should know about (only if quality < 4)
5. "opportunities" - Array of 1-2 potential upsides for a new owner

Respond ONLY with valid JSON, no other text.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
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
      console.error('AI generation failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return null;
    }

    // Parse the JSON response
    const parsed = JSON.parse(content);

    return {
      backstory: parsed.backstory || '',
      sellerMotivation: parsed.sellerMotivation || '',
      quirks: parsed.quirks || [],
      redFlags: parsed.redFlags,
      opportunities: parsed.opportunities,
    };
  } catch (error) {
    console.error('AI generation error:', error);
    return null;
  }
}

// Batch generate content for multiple businesses (more efficient)
export async function generateBatchContent(
  businesses: GenerationParams[]
): Promise<(AIGeneratedContent | null)[]> {
  // Generate in parallel with rate limiting
  const results: (AIGeneratedContent | null)[] = [];

  for (const business of businesses) {
    const content = await generateBusinessContent(business);
    results.push(content);
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

// Pre-built fallback content for when AI is not available
const FALLBACK_BACKSTORIES: Record<string, string[]> = {
  agency: [
    'Founded by two former ad executives who met at a Fortune 500 company. Started in a garage, now occupies a converted warehouse downtown.',
    'Spun out of a larger holding company 8 years ago. The founding team bought it in a management buyout.',
    'Started as a freelance operation by a self-taught designer. Grew organically through word of mouth in the local tech scene.',
  ],
  saas: [
    'Built by a former enterprise software engineer who saw an opportunity to simplify a complex workflow.',
    'Originally an internal tool at a consulting firm that clients kept asking to license.',
    'Founded by a husband-wife team, one technical, one in sales. Bootstrapped to profitability in 18 months.',
  ],
  homeServices: [
    'Third-generation family business. Grandfather started with one truck in 1965.',
    'Former franchise that went independent. Owner bought out the territory rights.',
    'Started by a master tradesman who trained dozens of apprentices over 20 years.',
  ],
  default: [
    'Founded over a decade ago by industry veterans who identified an underserved market niche.',
    'Started as a small operation and grew through consistent service quality and customer referrals.',
    'Built by an entrepreneur who saw an opportunity to modernize a traditional industry.',
  ],
};

const FALLBACK_MOTIVATIONS = [
  'Owner approaching retirement age and wants to spend more time with grandchildren.',
  'Partnership dispute has made continued operation untenable. Clean exit preferred.',
  'Founder burned out after 15 years and ready for a new chapter.',
  'Estate planning prompted by recent health scare. Family not interested in running the business.',
  'Owner received a job offer too good to refuse and needs to transition quickly.',
  'Divorce settlement requires liquidation of business assets.',
  'Founder wants to start a new venture in a different industry.',
  'Key partner passed away and remaining owner prefers to sell rather than run solo.',
];

const FALLBACK_QUIRKS = [
  'Unusually loyal customer base - average customer tenure is 8+ years.',
  'Owns the real estate where they operate (not included in the deal but available separately).',
  'Has an exclusive supplier relationship that competitors have tried to replicate.',
  'Former employee went on to become a minor celebrity, still endorses the business.',
  'Developed proprietary software that could be spun off or licensed.',
  'Located next to a major employer that provides steady referral business.',
  'Has a waiting list for new customers in peak season.',
  'Founder wrote an industry book that drives inbound leads.',
];

export function generateFallbackContent(
  sectorId: SectorId,
  qualityRating: QualityRating
): AIGeneratedContent {
  const backstories = FALLBACK_BACKSTORIES[sectorId] || FALLBACK_BACKSTORIES.default;

  const content: AIGeneratedContent = {
    backstory: backstories[Math.floor(Math.random() * backstories.length)],
    sellerMotivation: FALLBACK_MOTIVATIONS[Math.floor(Math.random() * FALLBACK_MOTIVATIONS.length)],
    quirks: [
      FALLBACK_QUIRKS[Math.floor(Math.random() * FALLBACK_QUIRKS.length)],
      FALLBACK_QUIRKS[Math.floor(Math.random() * FALLBACK_QUIRKS.length)],
    ].filter((v, i, a) => a.indexOf(v) === i), // Remove duplicates
  };

  // Add red flags for lower quality businesses
  if (qualityRating <= 2) {
    content.redFlags = [
      qualityRating === 1
        ? 'Financial records are disorganized and may require forensic accounting.'
        : 'Some customer contracts are month-to-month with no switching costs.',
    ];
  }

  // Add opportunities for higher quality
  if (qualityRating >= 4) {
    content.opportunities = [
      'Adjacent market expansion could double addressable market.',
      'Price increases have not been tested in several years.',
    ];
  }

  return content;
}

// Validate API key by making a minimal request
export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

// Post-game AI analysis
export interface AIGameAnalysis {
  overallAssessment: string;
  keyStrengths: string[];
  areasForImprovement: string[];
  specificLessons: Array<{
    observation: string;
    lesson: string;
    reference?: string;
  }>;
  whatIfScenario: string;
}

interface GameAnalysisInput {
  holdcoName: string;
  score: ScoreBreakdown;
  enterpriseValue: number;
  totalRounds: number;
  businesses: Business[];
  exitedBusinesses: Business[];
  metricsHistory: Array<{
    round: number;
    metrics: {
      totalEbitda: number;
      portfolioRoic: number;
      netDebtToEbitda: number;
      fcfPerShare: number;
    };
  }>;
  totalDistributions: number;
  totalBuybacks: number;
  totalInvestedCapital: number;
  equityRaisesUsed: number;
  sharedServicesActive: number;
}

function formatMoneyForPrompt(amountInThousands: number): string {
  const amount = amountInThousands * 1000;
  if (Math.abs(amount) >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}k`;
}

export async function generateGameAnalysis(input: GameAnalysisInput): Promise<AIGameAnalysis | null> {
  const apiKey = getApiKey();
  if (!apiKey || !isAIEnabled()) {
    return null;
  }

  // Build a comprehensive summary for the AI
  const allBusinesses = [...input.businesses, ...input.exitedBusinesses];
  const activeBusinesses = input.businesses.filter(b => b.status === 'active');

  // Calculate key stats
  const totalAcquisitions = allBusinesses.length;
  const totalSold = input.exitedBusinesses.filter(b => b.status === 'sold').length;
  const totalWoundDown = input.exitedBusinesses.filter(b => b.status === 'wound_down').length;

  // Sector distribution
  const sectorCounts: Record<string, number> = {};
  allBusinesses.forEach(b => {
    const sectorName = SECTORS[b.sectorId]?.name || b.sectorId;
    sectorCounts[sectorName] = (sectorCounts[sectorName] || 0) + 1;
  });
  const sectorSummary = Object.entries(sectorCounts)
    .map(([name, count]) => `${name}: ${count}`)
    .join(', ');

  // MOIC calculations
  const soldWithProfit = input.exitedBusinesses.filter(b =>
    b.status === 'sold' && b.exitPrice && b.exitPrice > b.acquisitionPrice
  ).length;
  const avgHoldPeriod = allBusinesses.length > 0
    ? allBusinesses.reduce((sum, b) => sum + ((b.exitRound || input.totalRounds) - b.acquisitionRound), 0) / allBusinesses.length
    : 0;

  // Quality distribution
  const avgQuality = allBusinesses.length > 0
    ? allBusinesses.reduce((sum, b) => sum + b.qualityRating, 0) / allBusinesses.length
    : 3;

  // Improvements made
  const totalImprovements = allBusinesses.reduce((sum, b) => sum + b.improvements.length, 0);

  // Platform stats
  const platforms = activeBusinesses.filter(b => b.isPlatform);
  const platformSummary = platforms.length > 0
    ? `${platforms.length} platform(s), max scale ${Math.max(...platforms.map(p => p.platformScale))}/3`
    : 'No platforms built';

  // Metrics trajectory
  const startMetrics = input.metricsHistory[0]?.metrics;
  const endMetrics = input.metricsHistory[input.metricsHistory.length - 1]?.metrics;
  const ebitdaGrowth = startMetrics && endMetrics
    ? ((endMetrics.totalEbitda - startMetrics.totalEbitda) / startMetrics.totalEbitda * 100).toFixed(0)
    : 'N/A';

  const prompt = `You are an experienced private equity investment advisor reviewing a player's 20-year holdco simulation game. Analyze their performance and provide personalized, actionable feedback.

GAME RESULTS:
- Holdco Name: ${input.holdcoName}
- Final Grade: ${input.score.grade} (${input.score.total}/100 points)
- Title: ${input.score.title}
- Enterprise Value: ${formatMoneyForPrompt(input.enterpriseValue)}

SCORE BREAKDOWN:
- FCF/Share Growth: ${input.score.fcfShareGrowth}/25
- Portfolio ROIC: ${input.score.portfolioRoic}/20
- Capital Deployment: ${input.score.capitalDeployment}/20
- Balance Sheet Health: ${input.score.balanceSheetHealth}/15
- Strategic Discipline: ${input.score.strategicDiscipline}/20

PORTFOLIO ACTIVITY:
- Total Acquisitions: ${totalAcquisitions}
- Businesses Sold: ${totalSold} (${soldWithProfit} at profit)
- Businesses Wound Down: ${totalWoundDown}
- Average Hold Period: ${avgHoldPeriod.toFixed(1)} years
- Average Quality Rating: ${avgQuality.toFixed(1)}/5
- Operational Improvements Made: ${totalImprovements}
- ${platformSummary}
- Sector Distribution: ${sectorSummary}

CAPITAL MANAGEMENT:
- Total Invested Capital: ${formatMoneyForPrompt(input.totalInvestedCapital)}
- Distributions to Owners: ${formatMoneyForPrompt(input.totalDistributions)}
- Share Buybacks: ${formatMoneyForPrompt(input.totalBuybacks)}
- Equity Raises Used: ${input.equityRaisesUsed}/3
- Shared Services Active: ${input.sharedServicesActive}

TRAJECTORY:
- EBITDA Growth: ${ebitdaGrowth}%
- Final Leverage: ${endMetrics?.netDebtToEbitda?.toFixed(1) || 'N/A'}x Net Debt/EBITDA

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

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
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
      console.error('AI analysis failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content);

    return {
      overallAssessment: parsed.overallAssessment || '',
      keyStrengths: parsed.keyStrengths || [],
      areasForImprovement: parsed.areasForImprovement || [],
      specificLessons: parsed.specificLessons || [],
      whatIfScenario: parsed.whatIfScenario || '',
    };
  } catch (error) {
    console.error('AI analysis error:', error);
    return null;
  }
}

// Fallback analysis when AI is not available
export function generateFallbackAnalysis(input: GameAnalysisInput): AIGameAnalysis {
  const allBusinesses = [...input.businesses, ...input.exitedBusinesses];
  const activeBusinesses = input.businesses.filter(b => b.status === 'active');

  const keyStrengths: string[] = [];
  const areasForImprovement: string[] = [];
  const specificLessons: Array<{ observation: string; lesson: string; reference?: string }> = [];

  // Analyze score components
  if (input.score.fcfShareGrowth >= 20) {
    keyStrengths.push('Excellent FCF per share growth - you compounded value effectively for shareholders.');
  } else if (input.score.fcfShareGrowth < 10) {
    areasForImprovement.push('FCF per share growth was below expectations. Focus on EBITDA growth and limiting share dilution.');
  }

  if (input.score.portfolioRoic >= 15) {
    keyStrengths.push('Strong portfolio ROIC indicates you allocated capital to high-return opportunities.');
  } else if (input.score.portfolioRoic < 10) {
    areasForImprovement.push('Portfolio ROIC was low - be more selective about acquisitions and focus on operational improvements.');
  }

  if (input.score.balanceSheetHealth >= 12) {
    keyStrengths.push('Conservative balance sheet management protected you from market downturns.');
  } else if (input.score.balanceSheetHealth < 8) {
    areasForImprovement.push('Over-leveraged balance sheet increased risk. Aim for <2.5x Net Debt/EBITDA.');
  }

  if (input.score.strategicDiscipline >= 15) {
    keyStrengths.push('Disciplined strategic approach - good sector focus and reinvestment decisions.');
  } else if (input.score.strategicDiscipline < 10) {
    areasForImprovement.push('Lacked strategic discipline. Consider sector focus, shared services, and following the distribution hierarchy.');
  }

  // Add specific lessons based on patterns
  const platforms = activeBusinesses.filter(b => b.isPlatform);
  if (platforms.length === 0 && allBusinesses.length >= 4) {
    specificLessons.push({
      observation: 'You never built a platform company despite multiple acquisitions.',
      lesson: 'Platform strategies enable multiple expansion through roll-up premiums. Designate a high-quality business as a platform and tuck in smaller competitors.',
      reference: 'Mark Leonard, Constellation Software',
    });
  }

  const avgHoldPeriod = allBusinesses.length > 0
    ? allBusinesses.reduce((sum, b) => sum + ((b.exitRound || 20) - b.acquisitionRound), 0) / allBusinesses.length
    : 0;
  if (avgHoldPeriod < 3) {
    specificLessons.push({
      observation: `Average hold period was only ${avgHoldPeriod.toFixed(1)} years.`,
      lesson: 'Short hold periods often mean selling before value creation materializes. Patient capital compounds over time.',
      reference: '"Our favorite holding period is forever." - Warren Buffett',
    });
  }

  const totalImprovements = allBusinesses.reduce((sum, b) => sum + b.improvements.length, 0);
  if (totalImprovements < allBusinesses.length && allBusinesses.length >= 3) {
    specificLessons.push({
      observation: 'Many of your businesses received no operational improvements.',
      lesson: 'Reinvesting in your businesses through operational improvements drives EBITDA growth and exit multiples.',
    });
  }

  // Generate overall assessment
  let overallAssessment = '';
  if (input.score.grade === 'S' || input.score.grade === 'A') {
    overallAssessment = `${input.holdcoName} performed exceptionally well over 20 years. Your disciplined approach to capital allocation and business building created substantial value for shareholders.`;
  } else if (input.score.grade === 'B') {
    overallAssessment = `${input.holdcoName} showed solid fundamentals with room for improvement. You made some good decisions but missed opportunities to compound returns more aggressively.`;
  } else if (input.score.grade === 'C') {
    overallAssessment = `${input.holdcoName} had mixed results. While you avoided catastrophe, inconsistent strategy and capital allocation limited your potential.`;
  } else {
    overallAssessment = `${input.holdcoName} struggled to create value. Review the fundamentals of holdco management: buy quality, hold long, reinvest wisely, and maintain a strong balance sheet.`;
  }

  // Generate what-if scenario
  let whatIfScenario = '';
  if (input.sharedServicesActive === 0 && activeBusinesses.length >= 3) {
    whatIfScenario = 'If you had invested in shared services early, you could have reduced costs and improved margins across your portfolio by 15-20%.';
  } else if (platforms.length === 0) {
    whatIfScenario = 'Building a platform in your most concentrated sector could have enabled 3-4 tuck-in acquisitions with synergies and multiple expansion.';
  } else if (input.totalDistributions > input.totalInvestedCapital * 0.5 && input.score.portfolioRoic > 0.15) {
    whatIfScenario = 'Reinvesting distributions while ROIC was above 15% could have compounded your returns significantly over 20 years.';
  } else {
    whatIfScenario = 'Focusing on fewer, higher-quality acquisitions with longer hold periods typically produces better risk-adjusted returns.';
  }

  return {
    overallAssessment,
    keyStrengths: keyStrengths.slice(0, 3),
    areasForImprovement: areasForImprovement.slice(0, 3),
    specificLessons: specificLessons.slice(0, 3),
    whatIfScenario,
  };
}
