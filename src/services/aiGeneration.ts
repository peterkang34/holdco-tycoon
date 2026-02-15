import { SectorId, AIGeneratedContent, QualityRating, Business, BuyerProfile, ScoreBreakdown, SellerArchetype } from '../engine/types';
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
  revenue?: number;
  ebitdaMargin?: number;
  operatorQuality?: string;
  revenueConcentration?: string;
  marketTrend?: string;
  competitivePosition?: string;
  customerRetention?: number;
  sellerArchetype?: string;
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
        revenue: params.revenue,
        ebitdaMargin: params.ebitdaMargin,
        operatorQuality: params.operatorQuality,
        revenueConcentration: params.revenueConcentration,
        marketTrend: params.marketTrend,
        competitivePosition: params.competitivePosition,
        customerRetention: params.customerRetention,
        sellerArchetype: params.sellerArchetype,
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
  insurance: [
    'Built by a veteran P&C agent who left a national brokerage to go independent. Started with a book of 200 policies and a rolodex.',
    'Family-owned insurance agency dating back to 1982. The founder\'s daughter now runs the commercial lines division.',
    'Former carrier underwriter who crossed to the agency side. Known for deep specialty expertise in niche industries.',
  ],
  autoServices: [
    'Started by a mechanic who couldn\'t stand working for dealerships anymore. Opened his own shop with a used lift and a prayer.',
    'Third-generation auto repair family. They\'ve been at the same intersection since 1971, surviving every competitor that came and went.',
    'Former fleet manager who noticed independent shops lacked professional systems. Built a tech-forward repair operation from scratch.',
  ],
  distribution: [
    'Founded by a warehouse worker who noticed how many small businesses struggled to source specialty products reliably.',
    'Began as a one-truck delivery operation serving local restaurants. Now runs 12 routes covering the tri-state area.',
    'Former procurement executive who leveraged supplier relationships to build a niche distribution company no one else wanted to serve.',
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

const ARCHETYPE_MOTIVATIONS: Record<SellerArchetype, string[]> = {
  retiring_founder: [
    'After 30 years building this company, the founder is ready to retire and watch the grandkids grow up.',
    'The founder just turned 65 and promised their spouse this would be the last year. Legacy matters more than price.',
    'A lifelong entrepreneur hanging up the cleats. Wants someone who will take care of the employees.',
  ],
  burnt_out_operator: [
    'The owner hasn\'t taken a vacation in 4 years. Running this business alone has taken its toll.',
    'Exhausted after navigating COVID, supply chain issues, and staff turnover — the founder just wants out.',
    'The passion is gone. What was once a dream job feels like a prison. Ready for any reasonable offer.',
  ],
  accidental_holdco: [
    'Corporate parent is divesting non-core assets to refocus on their primary business line.',
    'This division was acquired as part of a larger deal and never fit the parent company\'s strategy.',
    'New CEO is cleaning house — every business unit that isn\'t top-2 in its market is on the block.',
  ],
  distressed_seller: [
    'A failed expansion into a new market drained the company\'s reserves. Urgent sale needed to avoid default.',
    'Owner\'s divorce is forcing a rapid sale. The business itself is sound but the timeline is compressed.',
    'Health crisis forced the owner off the floor. Without daily oversight, the business needs new leadership fast.',
  ],
  mbo_candidate: [
    'The management team has been running the show for years. The absentee owner is finally ready to let go.',
    'Strong GM wants to buy the business but lacks capital. Open to a holdco partnership structure.',
    'The owner wants to sell to the team that built this business — they just need the right financial partner.',
  ],
  franchise_breakaway: [
    'Broke free from a national franchise after disputes over territory and fees. Now independent and thriving.',
    'Former franchisee who converted to independent operations. Better margins, more control, seeking growth capital.',
    'Left the franchise system when corporate changed direction. Kept the customers, built their own brand.',
  ],
};

// Quality-tiered quirks so fallback stories match the star rating
const FALLBACK_QUIRKS_BY_QUALITY: Record<'low' | 'mid' | 'high', string[]> = {
  low: [ // 1-2 stars
    'Staff turnover is notably high — the break room whiteboard is a revolving door of names.',
    'The accounting system is a patchwork of spreadsheets and sticky notes.',
    'Most of the equipment is past its expected useful life but still running... barely.',
    'The customer list hasn\'t been updated in years. Some entries are duplicates.',
    'The owner\'s nephew handles IT. He\'s 19 and self-taught from YouTube.',
    'Google reviews are a mix of 5-star raves and 1-star horror stories.',
  ],
  mid: [ // 3 stars
    'Owns the real estate where they operate (not included in the deal but available separately).',
    'Located next to a major employer that provides steady referral business.',
    'Has a solid repeat customer base, though retention tracking is informal.',
    'The team is small but capable — they just need better systems.',
    'Revenue is seasonal but predictable. Q4 accounts for 40% of annual sales.',
    'Former employee went on to become a minor celebrity, still endorses the business.',
  ],
  high: [ // 4-5 stars
    'Unusually loyal customer base — average customer tenure is 8+ years.',
    'Has an exclusive supplier relationship that competitors have tried to replicate.',
    'Developed proprietary software that could be spun off or licensed.',
    'Has a waiting list for new customers in peak season.',
    'Founder wrote an industry book that drives inbound leads.',
    'Net Promoter Score consistently above 70 — customers actively refer friends.',
  ],
};

export function generateFallbackContent(
  sectorId: SectorId,
  qualityRating: QualityRating,
  sellerArchetype?: SellerArchetype
): AIGeneratedContent {
  const backstories = FALLBACK_BACKSTORIES[sectorId] || FALLBACK_BACKSTORIES.default;

  // Use archetype-specific motivation if available, otherwise generic
  const motivations = sellerArchetype && ARCHETYPE_MOTIVATIONS[sellerArchetype]
    ? ARCHETYPE_MOTIVATIONS[sellerArchetype]
    : FALLBACK_MOTIVATIONS;

  // Pick quality-appropriate quirks
  const quirkTier = qualityRating <= 2 ? 'low' : qualityRating >= 4 ? 'high' : 'mid';
  const quirkPool = FALLBACK_QUIRKS_BY_QUALITY[quirkTier];

  const content: AIGeneratedContent = {
    backstory: backstories[Math.floor(Math.random() * backstories.length)],
    sellerMotivation: motivations[Math.floor(Math.random() * motivations.length)],
    quirks: [
      quirkPool[Math.floor(Math.random() * quirkPool.length)],
      quirkPool[Math.floor(Math.random() * quirkPool.length)],
    ].filter((v, i, a) => a.indexOf(v) === i), // Remove duplicates
  };

  // Add red flags for lower quality businesses
  if (qualityRating <= 2) {
    const lowRedFlags = [
      'Financial records are disorganized and may require forensic accounting.',
      'Some customer contracts are month-to-month with no switching costs.',
      'Key supplier contract expires in 6 months with no renewal commitment.',
      'Owner is the primary salesperson — unclear if revenue survives transition.',
    ];
    content.redFlags = [
      lowRedFlags[Math.floor(Math.random() * lowRedFlags.length)],
    ];
    if (qualityRating === 1) {
      // Add a second red flag for 1-star businesses
      const second = lowRedFlags.filter(f => f !== content.redFlags![0]);
      content.redFlags.push(second[Math.floor(Math.random() * second.length)]);
    }
  }

  // Add opportunities for higher quality
  if (qualityRating >= 4) {
    const highOpps = [
      'Adjacent market expansion could double addressable market.',
      'Price increases have not been tested in several years.',
      'Existing customer base could support a subscription upsell model.',
      'Geographic expansion into neighboring markets is wide open.',
    ];
    content.opportunities = [
      highOpps[Math.floor(Math.random() * highOpps.length)],
    ];
    if (qualityRating === 5) {
      const second = highOpps.filter(o => o !== content.opportunities![0]);
      content.opportunities.push(second[Math.floor(Math.random() * second.length)]);
    }
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
  difficulty?: string;
  founderEquityValue?: number;
  founderOwnership?: number;
  businesses: Business[];
  exitedBusinesses: Business[];
  metricsHistory: Array<{
    round: number;
    metrics: {
      totalEbitda: number;
      totalRevenue: number;
      avgEbitdaMargin: number;
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
  const revenueGrowth = startMetrics && endMetrics && startMetrics.totalRevenue > 0
    ? ((endMetrics.totalRevenue - startMetrics.totalRevenue) / startMetrics.totalRevenue * 100).toFixed(0)
    : 'N/A';
  const avgMargin = endMetrics ? `${(endMetrics.avgEbitdaMargin * 100).toFixed(0)}%` : 'N/A';
  const marginChange = startMetrics && endMetrics
    ? `${((endMetrics.avgEbitdaMargin - startMetrics.avgEbitdaMargin) * 100).toFixed(1)} ppt`
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
        revenueGrowth,
        avgMargin,
        marginChange,
        finalLeverage,
        totalRounds: input.totalRounds,
        difficulty: input.difficulty,
        founderEquityValue: input.founderEquityValue,
        founderOwnership: input.founderOwnership,
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

// Dynamic narrative generation
export type NarrativeType = 'event' | 'business_update' | 'year_chronicle' | 'deal_story';

export async function generateNarrative(
  type: NarrativeType,
  context: Record<string, unknown>
): Promise<string | null> {
  const isEnabled = await checkAIStatus();
  if (!isEnabled) {
    return null;
  }

  try {
    const response = await fetch('/api/ai/generate-narrative', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, context }),
    });

    if (!response.ok) {
      console.error('Narrative generation failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.narrative || null;
  } catch (error) {
    console.error('Narrative generation error:', error);
    return null;
  }
}

// Generate event narrative
export async function generateEventNarrative(
  eventType: string,
  effect: string,
  playerContext?: string,
  affectedBusinessName?: string,
  affectedSector?: string,
  holdcoName?: string,
  allBusinessNames?: string[],
): Promise<string | null> {
  return generateNarrative('event', {
    eventType,
    effect,
    playerContext,
    affectedBusinessName,
    affectedSector,
    holdcoName,
    allBusinessNames,
  });
}

// Generate business story update
export async function generateBusinessUpdate(
  businessName: string,
  sector: string,
  subType: string,
  yearsOwned: number,
  ebitdaChange: string,
  quality: number,
  recentEvents?: string,
  improvements?: string,
  isPlatform?: boolean,
  boltOnCount?: number,
  revenueChange?: string,
  marginChange?: string,
): Promise<string | null> {
  return generateNarrative('business_update', {
    businessName,
    sector,
    subType,
    yearsOwned,
    ebitdaChange,
    quality,
    recentEvents,
    improvements,
    isPlatform,
    boltOnCount,
    revenueChange,
    marginChange,
  });
}

// Generate year-end chronicle
export async function generateYearChronicle(
  context: {
    holdcoName: string;
    year: number;
    totalEbitda: string;
    prevTotalEbitda?: string;
    ebitdaGrowth?: string;
    cash: string;
    portfolioCount: number;
    leverage: string;
    totalDebt: string;
    fcf: string;
    interestExpense: string;
    actions?: string;
    marketConditions?: string;
    concerns?: string;
    positives?: string;
    // Strategic context
    platformCount?: number;
    totalBoltOns?: number;
    avgQuality?: string;
    sectors?: string;
    sharedServices?: string;
    fcfPerShare?: string;
    enterpriseValue?: string;
    founderEquityValue?: string;
    // Revenue/margin context
    totalRevenue?: string;
    avgMargin?: string;
    revenueGrowth?: string;
    marginChange?: string;
  }
): Promise<string | null> {
  return generateNarrative('year_chronicle', context);
}

// Fallback narratives for when AI is not available
export const FALLBACK_EVENT_NARRATIVES: Record<string, string[]> = {
  global_recession: [
    'Markets tumbled as recession fears gripped Wall Street. CFOs across the country began tightening budgets.',
    'The economic downturn arrived swiftly. Businesses that had overextended found themselves scrambling.',
    'A chill swept through boardrooms as quarterly projections were slashed. The party was over.',
  ],
  global_bull_market: [
    'Optimism surged through the markets as deal activity hit record levels. Every banker had a buyer.',
    'The bull market roared on. Multiples expanded as investors competed for quality assets.',
    'Main Street caught the fever as the longest expansion in decades continued unabated.',
  ],
  interest_rate_hike: [
    'The Fed raised rates again, sending leveraged buyers back to their spreadsheets.',
    'Higher rates meant tighter terms. The era of cheap debt was fading fast.',
    'Borrowing costs climbed as the central bank moved to cool an overheating economy.',
  ],
  credit_tightening: [
    'Banks pulled back, their risk committees suddenly cautious. Credit became a precious commodity.',
    'Loan committees tightened their criteria. Deals that would have sailed through last year now stalled.',
    'The credit window narrowed. Only the strongest borrowers could access capital.',
  ],
  sector_boom: [
    'The sector caught fire as new demand drivers emerged. Valuations soared.',
    'Investors piled into the space, sensing a generational opportunity.',
    'What was once overlooked became the hottest sector in M&A.',
  ],
  sector_disruption: [
    'A new technology threatened to upend the industry. Incumbents scrambled to adapt.',
    'Disruption arrived faster than anyone predicted. Some businesses would never recover.',
    'The old playbook no longer worked. Only the agile would survive.',
  ],
  key_employee_departure: [
    'The departure sent shockwaves through the organization. Institutional knowledge walked out the door.',
    'After years of loyal service, a key leader moved on. The transition would be rocky.',
    'The resignation caught everyone off guard. Clients started asking questions.',
  ],
  major_customer_loss: [
    'The call came on a Monday morning. Their biggest customer was leaving.',
    'After a decade of partnership, the relationship ended. Revenue projections needed revising.',
    'Losing the anchor account forced a painful strategic pivot.',
  ],
  regulatory_change: [
    'New regulations landed with the force of law. Compliance costs would eat into margins.',
    'Washington had spoken. The industry would never operate the same way.',
    'The regulatory environment shifted. Those who had prepared would thrive.',
  ],
};

export function getFallbackEventNarrative(eventType: string): string {
  const narratives = FALLBACK_EVENT_NARRATIVES[eventType] || FALLBACK_EVENT_NARRATIVES.global_recession;
  return narratives[Math.floor(Math.random() * narratives.length)];
}

// Fallback business story templates for when AI is not available
const FALLBACK_BUSINESS_STORIES = {
  growing: [
    'The team delivered another strong quarter, with customer inquiries up and the pipeline fuller than ever.',
    'Operations hummed along smoothly. The investments made last year are starting to pay dividends.',
    'Revenue momentum continued as the team executed well against plan. The outlook remains bright.',
  ],
  declining: [
    'A challenging year as headwinds took their toll. Management is working on a turnaround plan.',
    'Growth slowed as competitive pressures intensified. The team is focused on protecting margins.',
    'An off year, with revenue below expectations. Cost control became the priority.',
  ],
  stable: [
    'Business as usual — steady operations with no major surprises. The team kept their heads down and delivered.',
    'A quiet but productive year. The fundamentals remain intact and the team is well-positioned.',
    'The business continued to generate consistent cash flows. No fireworks, but no fires either.',
  ],
  new: [
    'The first year under new ownership is always about learning the business. Integration is underway.',
    'Early days as the new management team gets oriented. Lots of potential to unlock.',
    'The acquisition closed smoothly and the transition is progressing. First impressions are positive.',
  ],
};

export function getFallbackBusinessStory(
  ebitda: number,
  acquisitionEbitda: number,
  yearsOwned: number,
): string {
  let bucket: keyof typeof FALLBACK_BUSINESS_STORIES;
  if (yearsOwned <= 1) {
    bucket = 'new';
  } else if (ebitda > acquisitionEbitda * 1.05) {
    bucket = 'growing';
  } else if (ebitda < acquisitionEbitda * 0.95) {
    bucket = 'declining';
  } else {
    bucket = 'stable';
  }
  const stories = FALLBACK_BUSINESS_STORIES[bucket];
  return stories[Math.floor(Math.random() * stories.length)];
}

// AI-enriched buyer profile — fire-and-forget, deterministic profile works standalone
export async function generateAIBuyerProfile(
  profile: BuyerProfile,
  business: { name: string; sectorId: SectorId; ebitda: number; qualityRating: QualityRating; revenue?: number; ebitdaMargin?: number }
): Promise<string | null> {
  const isEnabled = await checkAIStatus();
  if (!isEnabled) return null;

  const sector = SECTORS[business.sectorId];
  const ebitdaFormatted = business.ebitda >= 1000
    ? `$${(business.ebitda / 1000).toFixed(1)}M`
    : `$${business.ebitda}k`;

  try {
    const response = await fetch('/api/ai/generate-buyer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerName: profile.name,
        buyerType: profile.type,
        isStrategic: profile.isStrategic,
        fundSize: profile.fundSize,
        sectorName: sector.name,
        businessName: business.name,
        ebitda: ebitdaFormatted,
        qualityRating: business.qualityRating,
        baseThesis: profile.investmentThesis,
        revenue: business.revenue,
        ebitdaMargin: business.ebitdaMargin,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.thesis || null;
  } catch {
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
  if (input.score.valueCreation >= 16) {
    keyStrengths.push('Outstanding value creation - you multiplied your initial capital impressively.');
  } else if (input.score.valueCreation < 8) {
    areasForImprovement.push('Value creation was below target. Focus on growing FEV through quality acquisitions and operational improvements.');
  }

  if (input.score.fcfShareGrowth >= 16) {
    keyStrengths.push('Excellent FCF per share growth - you compounded value effectively for shareholders.');
  } else if (input.score.fcfShareGrowth < 8) {
    areasForImprovement.push('FCF per share growth was below expectations. Focus on EBITDA growth and limiting share dilution.');
  }

  if (input.score.portfolioRoic >= 12) {
    keyStrengths.push('Strong portfolio ROIC indicates you allocated capital to high-return opportunities.');
  } else if (input.score.portfolioRoic < 7) {
    areasForImprovement.push('Portfolio ROIC was low - be more selective about acquisitions and focus on operational improvements.');
  }

  if (input.score.balanceSheetHealth >= 12) {
    keyStrengths.push('Conservative balance sheet management protected you from market downturns.');
  } else if (input.score.balanceSheetHealth < 8) {
    areasForImprovement.push('Over-leveraged balance sheet increased risk. Aim for <2.5x Net Debt/EBITDA.');
  }

  if (input.score.strategicDiscipline >= 12) {
    keyStrengths.push('Disciplined strategic approach - good sector focus and reinvestment decisions.');
  } else if (input.score.strategicDiscipline < 7) {
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
    ? allBusinesses.reduce((sum, b) => sum + ((b.exitRound || input.totalRounds) - b.acquisitionRound), 0) / allBusinesses.length
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
    overallAssessment = `${input.holdcoName} performed exceptionally well over ${input.totalRounds} years. Your disciplined approach to capital allocation and business building created substantial value for shareholders.`;
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
    whatIfScenario = `Reinvesting distributions while ROIC was above 15% could have compounded your returns significantly over ${input.totalRounds} years.`;
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
