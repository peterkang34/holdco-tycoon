import {
  Business,
  Deal,
  DueDiligenceSignals,
  QualityRating,
  SectorId,
  MAFocus,
  DealSizePreference,
  AcquisitionType,
  IntegrationOutcome,
  AIGeneratedContent,
  randomInRange,
  randomInt,
  pickRandom,
} from './types';
import { SECTORS, SECTOR_LIST } from '../data/sectors';
import { getRandomBusinessName } from '../data/names';
import {
  isAIEnabled,
  generateBusinessContent,
  generateFallbackContent,
} from '../services/aiGeneration';

let businessIdCounter = 0;

export function generateBusinessId(): string {
  return `biz_${++businessIdCounter}`;
}

export function resetBusinessIdCounter(): void {
  businessIdCounter = 0;
}

function generateQualityRating(): QualityRating {
  // Weighted distribution: more 3s, fewer 1s and 5s
  const roll = Math.random();
  if (roll < 0.05) return 1;
  if (roll < 0.20) return 2;
  if (roll < 0.60) return 3;
  if (roll < 0.85) return 4;
  return 5;
}

function generateDueDiligence(quality: QualityRating, sectorId: SectorId): DueDiligenceSignals {
  const sector = SECTORS[sectorId];

  // Revenue concentration based on sector and quality
  let revenueConcentration: 'low' | 'medium' | 'high';
  let revenueConcentrationText: string;

  if (sector.clientConcentration === 'high') {
    revenueConcentration = quality >= 4 ? 'medium' : 'high';
  } else if (sector.clientConcentration === 'medium') {
    revenueConcentration = quality >= 4 ? 'low' : quality >= 2 ? 'medium' : 'high';
  } else {
    revenueConcentration = quality >= 3 ? 'low' : 'medium';
  }

  const concentrationTexts = {
    low: ['No client exceeds 10% of revenue', 'Well-diversified customer base', 'Healthy client mix'],
    medium: ['Top client is 20-25% of revenue', 'Some customer concentration', 'Moderate client diversity'],
    high: ['Top client is 40%+ of revenue', 'Significant customer concentration', 'Key account dependency'],
  };
  revenueConcentrationText = pickRandom(concentrationTexts[revenueConcentration]);

  // Operator quality
  let operatorQuality: 'strong' | 'moderate' | 'weak';
  if (quality >= 4) operatorQuality = 'strong';
  else if (quality >= 2) operatorQuality = 'moderate';
  else operatorQuality = 'weak';

  const operatorTexts = {
    strong: ['Strong management team in place', 'Experienced leadership staying on', 'Proven operational team'],
    moderate: ['Decent team, some gaps', 'Owner willing to transition slowly', 'Management needs development'],
    weak: ['Founder looking to exit fully', 'Key person dependency', 'Management transition needed'],
  };
  const operatorQualityText = pickRandom(operatorTexts[operatorQuality]);

  // Trend
  let trend: 'growing' | 'flat' | 'declining';
  if (quality >= 4) trend = 'growing';
  else if (quality >= 2) trend = Math.random() > 0.3 ? 'flat' : 'growing';
  else trend = Math.random() > 0.5 ? 'declining' : 'flat';

  const trendTexts = {
    growing: [`EBITDA growing ${randomInt(8, 15)}% YoY`, 'Strong growth trajectory', 'Consistent expansion'],
    flat: ['EBITDA flat for 2 years', 'Stable but not growing', 'Revenue plateau'],
    declining: ['EBITDA declining 5-10% annually', 'Business in contraction', 'Shrinking market share'],
  };
  const trendText = pickRandom(trendTexts[trend]);

  // Customer retention
  let customerRetention: number;
  if (quality >= 4) customerRetention = randomInt(90, 98);
  else if (quality >= 3) customerRetention = randomInt(82, 92);
  else if (quality >= 2) customerRetention = randomInt(75, 85);
  else customerRetention = randomInt(65, 78);

  const customerRetentionText = `${customerRetention}% annual retention`;

  // Competitive position
  let competitivePosition: 'leader' | 'competitive' | 'commoditized';
  if (quality >= 4) competitivePosition = Math.random() > 0.3 ? 'leader' : 'competitive';
  else if (quality >= 2) competitivePosition = Math.random() > 0.5 ? 'competitive' : 'commoditized';
  else competitivePosition = 'commoditized';

  const positionTexts = {
    leader: ['Category leader in niche', 'Strong market position', 'Dominant in local market'],
    competitive: ['Solid competitive position', 'Well-regarded in market', 'Good reputation'],
    commoditized: ['Commoditized market', 'Price competition pressure', 'Low differentiation'],
  };
  const competitivePositionText = pickRandom(positionTexts[competitivePosition]);

  return {
    revenueConcentration,
    revenueConcentrationText,
    operatorQuality,
    operatorQualityText,
    trend,
    trendText,
    customerRetention,
    customerRetentionText,
    competitivePosition,
    competitivePositionText,
  };
}

export function generateBusiness(
  sectorId: SectorId,
  round: number,
  forceQuality?: QualityRating
): Omit<Business, 'id' | 'acquisitionRound' | 'improvements' | 'status'> {
  const sector = SECTORS[sectorId];
  const quality = forceQuality ?? generateQualityRating();
  const dueDiligence = generateDueDiligence(quality, sectorId);

  // Base EBITDA from sector range
  let ebitda = Math.round(randomInRange(sector.baseEbitda));

  // Quality affects EBITDA
  const qualityModifier = 0.8 + (quality - 1) * 0.1; // 0.8 to 1.2
  ebitda = Math.round(ebitda * qualityModifier);

  // Calculate organic growth rate based on sector and quality
  let organicGrowthRate = randomInRange(sector.organicGrowthRange);
  // Quality bonus: +0.5% per quality star above 3
  organicGrowthRate += (quality - 3) * 0.005;
  // Trend adjustment
  if (dueDiligence.trend === 'growing') organicGrowthRate += 0.02;
  else if (dueDiligence.trend === 'declining') organicGrowthRate -= 0.03;

  // Calculate acquisition multiple
  let multiple = randomInRange(sector.acquisitionMultiple);
  // Quality affects multiple slightly
  multiple += (quality - 3) * 0.2;
  // Round to 1 decimal
  multiple = Math.round(multiple * 10) / 10;

  const acquisitionPrice = Math.round(ebitda * multiple);

  return {
    name: getRandomBusinessName(sectorId),
    sectorId,
    subType: pickRandom(sector.subTypes),
    ebitda,
    peakEbitda: ebitda,
    acquisitionEbitda: ebitda,
    acquisitionPrice,
    acquisitionMultiple: multiple,
    organicGrowthRate,
    qualityRating: quality,
    dueDiligence,
    integrationRoundsRemaining: 2,
    sellerNoteBalance: 0,
    sellerNoteRate: 0,
    sellerNoteRoundsRemaining: 0,
    bankDebtBalance: 0,
    earnoutRemaining: 0,
    earnoutTarget: 0,
    // Platform fields
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: acquisitionPrice,
  };
}

// Determine acquisition type based on EBITDA size
function determineAcquisitionType(ebitda: number): AcquisitionType {
  // Small businesses (<$500k EBITDA) are tuck-in candidates
  // Medium businesses ($500k-$2M) can be standalone or platform
  // Large businesses (>$2M) are platform opportunities
  if (ebitda < 500) {
    return 'tuck_in';
  } else if (ebitda < 2000) {
    return Math.random() > 0.6 ? 'platform' : 'standalone';
  } else {
    return Math.random() > 0.3 ? 'platform' : 'standalone';
  }
}

// Calculate tuck-in discount (smaller businesses sell at lower multiples when they can't run independently)
function calculateTuckInDiscount(quality: QualityRating): number {
  // Lower quality businesses have higher discount (need more help)
  // Range: 5% to 25% discount
  const baseDiscount = 0.15;
  const qualityAdjustment = (3 - quality) * 0.05; // +/- 5% per quality point from 3
  return Math.max(0.05, Math.min(0.25, baseDiscount + qualityAdjustment));
}

// Determine integration outcome based on various factors
export function determineIntegrationOutcome(
  acquiredBusiness: Omit<Business, 'id' | 'acquisitionRound' | 'improvements' | 'status'>,
  targetPlatform?: Business,
  hasSharedServices?: boolean
): IntegrationOutcome {
  let successProbability = 0.5; // Base 50% chance

  // Quality affects integration - higher quality businesses integrate better
  successProbability += (acquiredBusiness.qualityRating - 3) * 0.1;

  // Strong operators help integration
  if (acquiredBusiness.dueDiligence.operatorQuality === 'strong') {
    successProbability += 0.15;
  } else if (acquiredBusiness.dueDiligence.operatorQuality === 'weak') {
    successProbability -= 0.15;
  }

  // Same sector synergies (if platform exists)
  if (targetPlatform && targetPlatform.sectorId === acquiredBusiness.sectorId) {
    successProbability += 0.15;
  }

  // Shared services help integration
  if (hasSharedServices) {
    successProbability += 0.1;
  }

  // Customer concentration risk
  if (acquiredBusiness.dueDiligence.revenueConcentration === 'high') {
    successProbability -= 0.1;
  }

  // Roll the dice
  const roll = Math.random();
  if (roll < successProbability * 0.6) {
    return 'success';
  } else if (roll < successProbability * 1.2) {
    return 'partial';
  } else {
    return 'failure';
  }
}

// Calculate synergies from integration
export function calculateSynergies(
  outcome: IntegrationOutcome,
  acquiredEbitda: number,
  isTuckIn: boolean
): number {
  // Synergies are a % of the acquired business EBITDA
  let synergyRate: number;

  switch (outcome) {
    case 'success':
      synergyRate = isTuckIn ? 0.20 : 0.10; // Tuck-ins get more synergies
      break;
    case 'partial':
      synergyRate = isTuckIn ? 0.08 : 0.03;
      break;
    case 'failure':
      synergyRate = isTuckIn ? -0.05 : -0.10; // Failed integrations hurt
      break;
  }

  return Math.round(acquiredEbitda * synergyRate);
}

// Calculate multiple expansion based on platform scale
export function calculateMultipleExpansion(platformScale: number, totalEbitda: number): number {
  // Larger platforms command higher multiples (the roll-up premium)
  // Scale 1: +0.3x, Scale 2: +0.6x, Scale 3: +1.0x
  const scaleBonus = [0, 0.3, 0.6, 1.0][platformScale] || 0;

  // Additional bonus for very large platforms (>$5M combined EBITDA)
  const sizeBonus = totalEbitda > 5000 ? 0.3 : totalEbitda > 3000 ? 0.15 : 0;

  return scaleBonus + sizeBonus;
}

export function generateDeal(sectorId: SectorId, round: number): Deal {
  const business = generateBusiness(sectorId, round);
  const acquisitionType = determineAcquisitionType(business.ebitda);
  const tuckInDiscount = acquisitionType === 'tuck_in'
    ? calculateTuckInDiscount(business.qualityRating)
    : undefined;

  // Apply tuck-in discount to asking price
  const askingPrice = tuckInDiscount
    ? Math.round(business.acquisitionPrice * (1 - tuckInDiscount))
    : business.acquisitionPrice;

  // Always include fallback content for richer deals
  const aiContent = generateFallbackContent(sectorId, business.qualityRating);

  return {
    id: `deal_${generateBusinessId()}`,
    business,
    askingPrice,
    freshness: 3,
    roundAppeared: round,
    source: Math.random() > 0.4 ? 'inbound' : 'brokered',
    acquisitionType,
    tuckInDiscount,
    aiContent,
  };
}

// Async function to enhance a deal with AI-generated content
export async function enhanceDealWithAI(deal: Deal): Promise<Deal> {
  if (!isAIEnabled()) {
    return deal;
  }

  try {
    const aiContent = await generateBusinessContent({
      sectorId: deal.business.sectorId,
      subType: deal.business.subType,
      ebitda: deal.business.ebitda,
      qualityRating: deal.business.qualityRating,
      acquisitionType: deal.acquisitionType,
    });

    if (aiContent) {
      return { ...deal, aiContent };
    }
  } catch (error) {
    console.error('Failed to enhance deal with AI:', error);
  }

  return deal;
}

// Enhance multiple deals with AI content
export async function enhanceDealsWithAI(deals: Deal[]): Promise<Deal[]> {
  if (!isAIEnabled()) {
    return deals;
  }

  // Only enhance new deals (freshness = 2, just generated)
  const newDeals = deals.filter(d => d.freshness === 2);
  const existingDeals = deals.filter(d => d.freshness !== 2);

  const enhancedNew = await Promise.all(
    newDeals.map(deal => enhanceDealWithAI(deal))
  );

  return [...existingDeals, ...enhancedNew];
}

export function getSectorWeightsForRound(round: number): Record<SectorId, number> {
  // Early game: cheaper sectors
  // Mid game: mixed
  // Late game: premium sectors

  const cheap: SectorId[] = ['agency', 'homeServices', 'b2bServices', 'education'];
  const mid: SectorId[] = ['consumer', 'restaurant', 'healthcare'];
  const premium: SectorId[] = ['saas', 'industrial', 'realEstate'];

  let cheapWeight: number, midWeight: number, premiumWeight: number;

  if (round <= 5) {
    cheapWeight = 0.60;
    midWeight = 0.30;
    premiumWeight = 0.10;
  } else if (round <= 12) {
    cheapWeight = 0.30;
    midWeight = 0.40;
    premiumWeight = 0.30;
  } else {
    cheapWeight = 0.20;
    midWeight = 0.30;
    premiumWeight = 0.50;
  }

  const weights: Record<string, number> = {};

  cheap.forEach(s => (weights[s] = cheapWeight / cheap.length));
  mid.forEach(s => (weights[s] = midWeight / mid.length));
  premium.forEach(s => (weights[s] = premiumWeight / premium.length));

  return weights as Record<SectorId, number>;
}

export function pickWeightedSector(round: number): SectorId {
  const weights = getSectorWeightsForRound(round);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (const [sector, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) return sector as SectorId;
  }

  return 'agency'; // fallback
}

// Generate a deal with size preference
export function generateDealWithSize(
  sectorId: SectorId,
  round: number,
  sizePreference: DealSizePreference = 'any'
): Deal {
  const sector = SECTORS[sectorId];
  let quality = generateQualityRating();

  // Adjust EBITDA based on size preference
  let ebitdaMultiplier = 1.0;
  if (sizePreference === 'small') {
    ebitdaMultiplier = 0.5 + Math.random() * 0.3; // 50-80% of base
  } else if (sizePreference === 'large') {
    ebitdaMultiplier = 1.2 + Math.random() * 0.5; // 120-170% of base
  } else if (sizePreference === 'medium') {
    ebitdaMultiplier = 0.8 + Math.random() * 0.4; // 80-120% of base
  }

  const business = generateBusiness(sectorId, round, quality);
  const adjustedEbitda = Math.round(business.ebitda * ebitdaMultiplier);
  const adjustedPrice = Math.round(adjustedEbitda * business.acquisitionMultiple);
  const acquisitionType = determineAcquisitionType(adjustedEbitda);
  const tuckInDiscount = acquisitionType === 'tuck_in'
    ? calculateTuckInDiscount(quality)
    : undefined;

  // Apply tuck-in discount to asking price
  const finalAskingPrice = tuckInDiscount
    ? Math.round(adjustedPrice * (1 - tuckInDiscount))
    : adjustedPrice;

  // Include fallback content for richer deals
  const aiContent = generateFallbackContent(sectorId, quality);

  return {
    id: `deal_${generateBusinessId()}`,
    business: {
      ...business,
      ebitda: adjustedEbitda,
      peakEbitda: adjustedEbitda,
      acquisitionEbitda: adjustedEbitda,
      acquisitionPrice: adjustedPrice,
    },
    askingPrice: finalAskingPrice,
    freshness: 2, // Deals last 2 years now (was 3)
    roundAppeared: round,
    source: Math.random() > 0.4 ? 'inbound' : 'brokered',
    acquisitionType,
    tuckInDiscount,
    aiContent,
  };
}

export function generateDealPipeline(
  currentPipeline: Deal[],
  round: number,
  maFocus?: MAFocus,
  portfolioFocusSector?: SectorId,
  portfolioFocusTier?: number
): Deal[] {
  // Age existing deals first
  let pipeline = currentPipeline.map(deal => ({
    ...deal,
    freshness: deal.freshness - 1,
  }));

  // Remove expired deals (freshness <= 0)
  pipeline = pipeline.filter(deal => deal.freshness > 0);

  const MAX_DEALS = 8;
  const targetNewDeals = Math.max(0, 5 - pipeline.length); // Aim for 5+ deals available

  // Track sectors already in pipeline to ensure variety
  const sectorsInPipeline = new Set(pipeline.map(d => d.business.sectorId));
  const allSectorIds = SECTOR_LIST.map(s => s.id);

  // 1. Generate deals based on M&A focus (if set)
  if (maFocus?.sectorId && pipeline.length < MAX_DEALS) {
    // Add 2 deals in focus sector with preferred size
    for (let i = 0; i < 2; i++) {
      if (pipeline.length >= MAX_DEALS) break;
      pipeline.push(generateDealWithSize(maFocus.sectorId, round, maFocus.sizePreference));
    }
  }

  // 2. Add deals from portfolio focus sector (synergy bonus)
  if (portfolioFocusSector && portfolioFocusTier && portfolioFocusTier >= 1 && pipeline.length < MAX_DEALS) {
    const focusDeals = portfolioFocusTier >= 2 ? 2 : 1;
    for (let i = 0; i < focusDeals; i++) {
      if (pipeline.length >= MAX_DEALS) break;
      pipeline.push(generateDealWithSize(portfolioFocusSector, round, maFocus?.sizePreference || 'any'));
    }
  }

  // 3. Ensure sector variety - add deals from sectors not in pipeline
  const missingSectors = allSectorIds.filter(s => !sectorsInPipeline.has(s));
  const shuffledMissing = missingSectors.sort(() => Math.random() - 0.5);

  for (const sectorId of shuffledMissing.slice(0, 3)) {
    if (pipeline.length >= MAX_DEALS) break;
    pipeline.push(generateDealWithSize(sectorId, round, maFocus?.sizePreference || 'any'));
  }

  // 4. Fill remaining slots with weighted random deals
  while (pipeline.length < Math.min(MAX_DEALS, pipeline.length + targetNewDeals)) {
    const sectorId = pickWeightedSector(round);
    pipeline.push(generateDealWithSize(sectorId, round, maFocus?.sizePreference || 'any'));
  }

  // Ensure at least 4 deals available
  while (pipeline.length < 4) {
    const sectorId = pickWeightedSector(round);
    pipeline.push(generateDealWithSize(sectorId, round, 'any'));
  }

  return pipeline;
}

export function createStartingBusiness(sectorId: SectorId = 'agency'): Business {
  const sector = SECTORS[sectorId];
  const business = generateBusiness(sectorId, 1, 3); // Start with a fair quality business

  // Starting business: ~$1M EBITDA, sector-appropriate multiple
  // This uses ~20% of the $20M raise, leaving cash for future acquisitions
  const targetEbitda = 1000; // $1M EBITDA
  const targetMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
  const acquisitionPrice = Math.round(targetEbitda * targetMultiple);

  return {
    ...business,
    id: generateBusinessId(),
    acquisitionRound: 0,
    improvements: [],
    status: 'active',
    ebitda: targetEbitda,
    peakEbitda: targetEbitda,
    acquisitionEbitda: targetEbitda,
    acquisitionPrice,
    acquisitionMultiple: targetMultiple,
    // Platform fields
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: acquisitionPrice,
  };
}
