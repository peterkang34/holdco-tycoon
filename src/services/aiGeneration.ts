import { SectorId, AIGeneratedContent, QualityRating, Business, ScoreBreakdown } from '../engine/types';
import { SECTORS } from '../data/sectors';

// Cache the AI status to avoid repeated requests
let aiStatusCache: { enabled: boolean; checkedAt: number } | null = null;
const AI_STATUS_CACHE_TTL = 60000; // 1 minute

// Check if server-side AI is enabled
export async function checkAIStatus(): Promise<boolean> {
  // Return cached value if still valid
  if (aiStatusCache && Date.now() - aiStatusCache.checkedAt < AI_STATUS_CACHE_TTL) {
    return aiStatusCache.enabled;
  }

  try {
    const response = await fetch('/api/ai/status');
    if (response.ok) {
      const data = await response.json();
      aiStatusCache = { enabled: data.enabled, checkedAt: Date.now() };
      return data.enabled;
    }
  } catch (error) {
    console.error('Failed to check AI status:', error);
  }

  aiStatusCache = { enabled: false, checkedAt: Date.now() };
  return false;
}

// Synchronous check using cached value (for UI display)
export function isAIEnabled(): boolean {
  return aiStatusCache?.enabled ?? false;
}

interface GenerationParams {
  sectorId: SectorId;
  subType: string;
  ebitda: number;
  qualityRating: QualityRating;
  acquisitionType: 'standalone' | 'tuck_in' | 'platform';
}

// Generate AI content for a business via server API
export async function generateBusinessContent(params: GenerationParams): Promise<AIGeneratedContent | null> {
  const isEnabled = await checkAIStatus();
  if (!isEnabled) {
    return null;
  }

  const sector = SECTORS[params.sectorId];

  try {
    const response = await fetch('/api/ai/generate-deal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sectorName: sector.name,
        subType: params.subType,
        ebitda: params.ebitda,
        qualityRating: params.qualityRating,
        acquisitionType: params.acquisitionType,
      }),
    });

    if (!response.ok) {
      console.error('AI generation failed:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('AI generation error:', error);
    return null;
  }
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

export async function generateGameAnalysis(input: GameAnalysisInput): Promise<AIGameAnalysis | null> {
  const isEnabled = await checkAIStatus();
  if (!isEnabled) {
    return null;
  }

  // Build summary stats for the API
  const allBusinesses = [...input.businesses, ...input.exitedBusinesses];
  const activeBusinesses = input.businesses.filter(b => b.status === 'active');

  const totalAcquisitions = allBusinesses.length;
  const totalSold = input.exitedBusinesses.filter(b => b.status === 'sold').length;
  const totalWoundDown = input.exitedBusinesses.filter(b => b.status === 'wound_down').length;

  const soldWithProfit = input.exitedBusinesses.filter(b =>
    b.status === 'sold' && b.exitPrice && b.exitPrice > b.acquisitionPrice
  ).length;

  const avgHoldPeriod = allBusinesses.length > 0
    ? (allBusinesses.reduce((sum, b) => sum + ((b.exitRound || input.totalRounds) - b.acquisitionRound), 0) / allBusinesses.length).toFixed(1)
    : '0';

  const avgQuality = allBusinesses.length > 0
    ? (allBusinesses.reduce((sum, b) => sum + b.qualityRating, 0) / allBusinesses.length).toFixed(1)
    : '3';

  const totalImprovements = allBusinesses.reduce((sum, b) => sum + b.improvements.length, 0);

  const platforms = activeBusinesses.filter(b => b.isPlatform);
  const platformSummary = platforms.length > 0
    ? `${platforms.length} platform(s), max scale ${Math.max(...platforms.map(p => p.platformScale))}/3`
    : 'No platforms built';

  const sectorCounts: Record<string, number> = {};
  allBusinesses.forEach(b => {
    const sectorName = SECTORS[b.sectorId]?.name || b.sectorId;
    sectorCounts[sectorName] = (sectorCounts[sectorName] || 0) + 1;
  });
  const sectorSummary = Object.entries(sectorCounts)
    .map(([name, count]) => `${name}: ${count}`)
    .join(', ');

  const startMetrics = input.metricsHistory[0]?.metrics;
  const endMetrics = input.metricsHistory[input.metricsHistory.length - 1]?.metrics;
  const ebitdaGrowth = startMetrics && endMetrics && startMetrics.totalEbitda > 0
    ? ((endMetrics.totalEbitda - startMetrics.totalEbitda) / startMetrics.totalEbitda * 100).toFixed(0)
    : 'N/A';
  const finalLeverage = endMetrics?.netDebtToEbitda?.toFixed(1) || 'N/A';

  try {
    const response = await fetch('/api/ai/analyze-game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        holdcoName: input.holdcoName,
        score: input.score,
        enterpriseValue: input.enterpriseValue,
        totalAcquisitions,
        totalSold,
        soldWithProfit,
        totalWoundDown,
        avgHoldPeriod,
        avgQuality,
        totalImprovements,
        platformSummary,
        sectorSummary,
        totalInvestedCapital: input.totalInvestedCapital,
        totalDistributions: input.totalDistributions,
        totalBuybacks: input.totalBuybacks,
        equityRaisesUsed: input.equityRaisesUsed,
        sharedServicesActive: input.sharedServicesActive,
        ebitdaGrowth,
        finalLeverage,
      }),
    });

    if (!response.ok) {
      console.error('AI analysis failed:', response.status);
      return null;
    }

    return await response.json();
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
