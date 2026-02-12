import {
  Business,
  Deal,
  DealHeat,
  DueDiligenceSignals,
  QualityRating,
  SectorId,
  MAFocus,
  DealSizePreference,
  AcquisitionType,
  EventType,
  IntegrationOutcome,
  MASourcingTier,
  SubTypeAffinity,
  SellerArchetype,
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

// H-8: Restore counter from existing businesses after save/load
export function restoreBusinessIdCounter(businesses: { id: string }[]): void {
  let maxId = 0;
  for (const b of businesses) {
    const match = b.id.match(/^biz_(\d+)$/);
    if (match) {
      maxId = Math.max(maxId, parseInt(match[1], 10));
    }
  }
  businessIdCounter = maxId;
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
  forceQuality?: QualityRating,
  forceSubType?: string
): Omit<Business, 'id' | 'acquisitionRound' | 'improvements' | 'status'> {
  const sector = SECTORS[sectorId];
  const quality = forceQuality ?? generateQualityRating();
  const dueDiligence = generateDueDiligence(quality, sectorId);

  // Quality modifier (shared between revenue and margin)
  const qualityModifier = 0.8 + (quality - 1) * 0.1; // 0.8 to 1.2

  // Generate margin from sector range (quality-adjusted: Q5 +3ppt, Q1 -3ppt)
  let ebitdaMargin = randomInRange(sector.baseMargin);
  ebitdaMargin += (quality - 3) * 0.015; // ±3ppt per 2 quality stars
  ebitdaMargin = Math.max(0.03, Math.min(0.80, ebitdaMargin));

  // Generate revenue from sector range (quality-adjusted same as EBITDA was)
  let revenue = Math.round(randomInRange(sector.baseRevenue) * qualityModifier);

  // Derive EBITDA from revenue × margin
  let ebitda = Math.round(revenue * ebitdaMargin);

  // Revenue growth rate from sector organic growth range (quality bonus)
  let revenueGrowthRate = randomInRange(sector.organicGrowthRange);
  revenueGrowthRate += (quality - 3) * 0.005;
  if (dueDiligence.trend === 'growing') revenueGrowthRate += 0.02;
  else if (dueDiligence.trend === 'declining') revenueGrowthRate -= 0.03;

  // Margin drift rate from sector range
  const marginDriftRate = randomInRange(sector.marginDriftRange);

  // Calculate acquisition multiple
  let multiple = randomInRange(sector.acquisitionMultiple);
  multiple += (quality - 3) * 0.2;
  multiple = Math.round(multiple * 10) / 10;

  const subType = forceSubType && sector.subTypes.includes(forceSubType)
    ? forceSubType
    : pickRandom(sector.subTypes);

  // Apply sub-type financial skews
  const stIdx = sector.subTypes.indexOf(subType);
  if (stIdx !== -1) {
    if (sector.subTypeMarginModifiers?.[stIdx]) {
      ebitdaMargin += sector.subTypeMarginModifiers[stIdx];
      ebitdaMargin = Math.max(0.03, Math.min(0.80, ebitdaMargin));
      // Re-derive EBITDA from revenue × adjusted margin
      ebitda = Math.round(revenue * ebitdaMargin);
    }
    if (sector.subTypeGrowthModifiers?.[stIdx]) {
      revenueGrowthRate += sector.subTypeGrowthModifiers[stIdx];
    }
  }

  // Organic growth rate (legacy — kept for compatibility, mirrors revenue growth)
  const organicGrowthRate = revenueGrowthRate;

  const acquisitionPrice = Math.round(ebitda * multiple);

  return {
    name: getRandomBusinessName(sectorId, subType),
    sectorId,
    subType,
    ebitda,
    peakEbitda: ebitda,
    acquisitionEbitda: ebitda,
    acquisitionPrice,
    acquisitionMultiple: multiple,
    organicGrowthRate,
    revenue,
    ebitdaMargin,
    acquisitionRevenue: revenue,
    acquisitionMargin: ebitdaMargin,
    peakRevenue: revenue,
    revenueGrowthRate,
    marginDriftRate,
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

// --- Seller Archetypes ---

export function assignSellerArchetype(quality: QualityRating): SellerArchetype {
  // Weighted distribution adjusted by quality
  const weights: { archetype: SellerArchetype; baseWeight: number; qualityAdj: number }[] = [
    { archetype: 'retiring_founder', baseWeight: 0.30, qualityAdj: quality >= 4 ? 0.10 : quality <= 2 ? -0.10 : 0 },
    { archetype: 'burnt_out_operator', baseWeight: 0.20, qualityAdj: quality <= 2 ? 0.05 : quality >= 4 ? -0.05 : 0 },
    { archetype: 'accidental_holdco', baseWeight: 0.10, qualityAdj: 0 },
    { archetype: 'distressed_seller', baseWeight: 0.10, qualityAdj: quality <= 2 ? 0.10 : quality >= 4 ? -0.08 : 0 },
    { archetype: 'mbo_candidate', baseWeight: 0.15, qualityAdj: quality >= 4 ? 0.05 : quality <= 2 ? -0.05 : 0 },
    { archetype: 'franchise_breakaway', baseWeight: 0.15, qualityAdj: quality <= 2 ? -0.05 : 0 },
  ];

  const adjusted = weights.map(w => ({ ...w, weight: Math.max(0.02, w.baseWeight + w.qualityAdj) }));
  const total = adjusted.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of adjusted) {
    roll -= w.weight;
    if (roll <= 0) return w.archetype;
  }
  return 'retiring_founder';
}

function getArchetypeHeatModifier(archetype: SellerArchetype): number {
  switch (archetype) {
    case 'retiring_founder': return -1;
    case 'burnt_out_operator': return 0;
    case 'accidental_holdco': return 1;
    case 'distressed_seller': return -2;
    case 'mbo_candidate': return 0;
    case 'franchise_breakaway': return 0;
  }
}

function getArchetypePriceModifier(archetype: SellerArchetype): number {
  switch (archetype) {
    case 'retiring_founder': return randomInRange([0, 0.05]);
    case 'burnt_out_operator': return randomInRange([-0.10, -0.05]);
    case 'accidental_holdco': return randomInRange([0.05, 0.10]);
    case 'distressed_seller': return randomInRange([-0.20, -0.10]);
    case 'mbo_candidate': return randomInRange([0, 0.05]);
    case 'franchise_breakaway': return randomInRange([0.05, 0.10]);
  }
}

function getArchetypeOperatorQuality(archetype: SellerArchetype): 'strong' | 'moderate' | 'weak' | null {
  switch (archetype) {
    case 'retiring_founder': return Math.random() > 0.5 ? 'strong' : 'moderate';
    case 'burnt_out_operator': return Math.random() > 0.5 ? 'weak' : 'moderate';
    case 'accidental_holdco': return 'moderate';
    case 'distressed_seller': return 'weak';
    case 'mbo_candidate': return 'strong';
    case 'franchise_breakaway': return Math.random() > 0.5 ? 'strong' : 'moderate';
  }
}

// --- Deal Heat System ---

const HEAT_LEVELS: DealHeat[] = ['cold', 'warm', 'hot', 'contested'];

// Calculate deal heat based on quality, source, round, market conditions, and seller archetype
export function calculateDealHeat(
  quality: QualityRating,
  source: Deal['source'],
  round: number,
  lastEventType?: EventType,
  sellerArchetype?: SellerArchetype
): DealHeat {
  // Base distribution: cold 25%, warm 35%, hot 30%, contested 10%
  const roll = Math.random();
  let tierIndex: number;
  if (roll < 0.25) tierIndex = 0; // cold
  else if (roll < 0.60) tierIndex = 1; // warm
  else if (roll < 0.90) tierIndex = 2; // hot
  else tierIndex = 3; // contested

  // Quality modifier: high quality attracts more buyers
  if (quality >= 4) tierIndex += 1;
  if (quality <= 2) tierIndex -= 1;

  // Market event modifier
  if (lastEventType === 'global_bull_market') tierIndex += 1;
  if (lastEventType === 'global_recession') tierIndex -= 1;

  // Late game: more capital in market
  if (round >= 15) tierIndex += 1;

  // Source modifiers — proprietary/sourced = less competition
  // Combine with archetype heat modifier, cap total negative at -3
  let negativeModifiers = 0;
  if (source === 'proprietary') negativeModifiers -= 2;
  if (source === 'sourced') negativeModifiers -= 1;
  if (sellerArchetype) {
    const archetypeMod = getArchetypeHeatModifier(sellerArchetype);
    if (archetypeMod < 0) negativeModifiers += archetypeMod;
    else tierIndex += archetypeMod; // positive modifiers apply directly
  }
  tierIndex += Math.max(-3, negativeModifiers);

  // Clamp to valid range
  tierIndex = Math.max(0, Math.min(3, tierIndex));
  return HEAT_LEVELS[tierIndex];
}

// Calculate the premium multiplier for a given heat level
export function calculateHeatPremium(heat: DealHeat): number {
  switch (heat) {
    case 'cold': return 1.0;
    case 'warm': return randomInRange([1.10, 1.15]);
    case 'hot': return randomInRange([1.20, 1.30]);
    case 'contested': return randomInRange([1.30, 1.50]);
  }
}

// Maximum acquisitions per round based on MA sourcing tier
export function getMaxAcquisitions(maSourcingTier: MASourcingTier): number {
  if (maSourcingTier >= 2) return 4;
  if (maSourcingTier >= 1) return 3;
  return 2;
}

// Determine how closely related two sub-types are within a sector
export function getSubTypeAffinity(sectorId: string, subType1: string, subType2: string): SubTypeAffinity {
  if (subType1 === subType2) return 'match';
  const sector = SECTORS[sectorId];
  if (!sector) return 'distant';
  const idx1 = sector.subTypes.indexOf(subType1);
  const idx2 = sector.subTypes.indexOf(subType2);
  if (idx1 === -1 || idx2 === -1) return 'distant';
  const group1 = sector.subTypeGroups[idx1];
  const group2 = sector.subTypeGroups[idx2];
  return group1 === group2 ? 'related' : 'distant';
}

// Determine integration outcome based on various factors
export function determineIntegrationOutcome(
  acquiredBusiness: Omit<Business, 'id' | 'acquisitionRound' | 'improvements' | 'status'>,
  targetPlatform?: Business,
  hasSharedServices?: boolean,
  subTypeAffinity?: SubTypeAffinity
): IntegrationOutcome {
  let successProbability = 0.6; // Base 60% chance

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

  // Sub-type affinity penalty — graduated based on operational relatedness
  if (subTypeAffinity === 'related') {
    successProbability -= 0.05; // Related sub-types: mild friction (e.g., plumbing + electrical)
  } else if (subTypeAffinity === 'distant') {
    successProbability -= 0.15; // Distant sub-types: significant friction (e.g., plumbing + property mgmt)
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
  isTuckIn: boolean,
  subTypeAffinity?: SubTypeAffinity
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

  // Sub-type affinity affects synergy capture
  if (subTypeAffinity === 'related') {
    synergyRate *= 0.75; // Related sub-types: 75% synergies (e.g., HVAC + plumbing share suppliers)
  } else if (subTypeAffinity === 'distant') {
    synergyRate *= 0.45; // Distant sub-types: 45% synergies (e.g., dental + behavioral health)
  }

  return Math.round(acquiredEbitda * synergyRate);
}

// Calculate multiple expansion based on platform scale
export function calculateMultipleExpansion(platformScale: number, totalEbitda: number): number {
  // Larger platforms command higher multiples (the roll-up premium)
  // Scale 1: +0.3x, Scale 2: +0.6x, Scale 3+: +1.0x (capped)
  const scaleBonus = [0, 0.3, 0.6, 1.0][Math.min(platformScale, 3)] ?? 0;

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

  const source: Deal['source'] = Math.random() > 0.4 ? 'inbound' : 'brokered';
  const heat = calculateDealHeat(business.qualityRating, source, round);
  const heatPremium = calculateHeatPremium(heat);
  const effectivePrice = Math.round(askingPrice * heatPremium);

  return {
    id: `deal_${generateBusinessId()}`,
    business,
    askingPrice,
    freshness: 2, // H-7: Consistent with generateDealWithSize
    roundAppeared: round,
    source,
    acquisitionType,
    tuckInDiscount,
    aiContent,
    heat,
    effectivePrice,
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

  const cheap: SectorId[] = ['agency', 'homeServices', 'b2bServices', 'education', 'autoServices'];
  const mid: SectorId[] = ['consumer', 'restaurant', 'healthcare', 'insurance', 'distribution'];
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

export interface DealGenerationOptions {
  subType?: string;
  qualityFloor?: QualityRating;
  source?: Deal['source'];
  freshnessBonus?: number;
  multipleDiscount?: number; // e.g., 0.15 = 15% off asking price
  lastEventType?: EventType; // for deal heat calculation
}

// Generate a deal with size preference
export function generateDealWithSize(
  sectorId: SectorId,
  round: number,
  sizePreference: DealSizePreference = 'any',
  portfolioEbitda: number = 0,
  options: DealGenerationOptions = {}
): Deal {
  const sector = SECTORS[sectorId];
  let quality = generateQualityRating();

  // Apply quality floor
  if (options.qualityFloor && quality < options.qualityFloor) {
    quality = options.qualityFloor;
  }

  // Absolute EBITDA ranges matching UI labels (in $k):
  //   Small:  500-1500  ($500k-$1.5M)
  //   Medium: 1500-3000 ($1.5M-$3M)
  //   Large:  3000+     ($3M+), portfolio scaler allowed
  //   Any:    sector base × portfolio scaler (unconstrained)
  const SIZE_RANGES: Record<string, [number, number]> = {
    small:  [500, 1500],
    medium: [1500, 3000],
    large:  [3000, 8000], // 8000 base cap before portfolio scaler
  };

  const business = generateBusiness(sectorId, round, quality, options.subType);

  let adjustedEbitda: number;
  let adjustedRevenue: number;

  if (sizePreference === 'any') {
    // 'any': keep original sector-based generation, apply portfolio scaler
    const portfolioScaler = portfolioEbitda > 3000
      ? Math.max(1, Math.log2(portfolioEbitda / 3000))
      : 1;
    adjustedRevenue = Math.round(business.revenue * portfolioScaler);
    adjustedEbitda = Math.round(adjustedRevenue * business.ebitdaMargin);
  } else {
    const [minEbitda, maxEbitda] = SIZE_RANGES[sizePreference];
    // Pick a random target EBITDA within the absolute range
    let targetEbitda = minEbitda + Math.random() * (maxEbitda - minEbitda);

    // For 'large', apply portfolio scaler on top of the base range
    if (sizePreference === 'large') {
      const portfolioScaler = portfolioEbitda > 3000
        ? Math.max(1, Math.log2(portfolioEbitda / 3000))
        : 1;
      targetEbitda *= portfolioScaler;
    }

    adjustedEbitda = Math.round(targetEbitda);
    // Back-solve revenue from target EBITDA and the business's margin
    // (preserves the margin as a business characteristic)
    adjustedRevenue = Math.round(adjustedEbitda / business.ebitdaMargin);
  }
  const adjustedPrice = Math.round(adjustedEbitda * business.acquisitionMultiple);
  const acquisitionType = determineAcquisitionType(adjustedEbitda);
  const tuckInDiscount = acquisitionType === 'tuck_in'
    ? calculateTuckInDiscount(quality)
    : undefined;

  // Assign seller archetype
  const sellerArchetype = assignSellerArchetype(quality);

  // Apply archetype operator quality override
  const archetypeOperator = getArchetypeOperatorQuality(sellerArchetype);
  let adjustedBusiness = business;
  if (archetypeOperator) {
    const operatorTexts: Record<string, string[]> = {
      strong: ['Strong management team in place', 'Experienced leadership staying on', 'Proven operational team'],
      moderate: ['Decent team, some gaps', 'Owner willing to transition slowly', 'Management needs development'],
      weak: ['Founder looking to exit fully', 'Key person dependency', 'Management transition needed'],
    };
    adjustedBusiness = {
      ...business,
      dueDiligence: {
        ...business.dueDiligence,
        operatorQuality: archetypeOperator,
        operatorQualityText: pickRandom(operatorTexts[archetypeOperator]),
      },
    };
  }

  // Apply archetype price modifier — use Math.max with proprietary discount (don't stack)
  const archetypePriceMod = getArchetypePriceModifier(sellerArchetype);
  const archetypeDiscount = archetypePriceMod < 0 ? Math.abs(archetypePriceMod) : 0;
  const archetypePremium = archetypePriceMod > 0 ? archetypePriceMod : 0;

  // Apply the larger of tuck-in discount, proprietary discount, or archetype discount (don't stack)
  const effectiveDiscount = Math.max(tuckInDiscount ?? 0, options.multipleDiscount ?? 0, archetypeDiscount);
  let finalAskingPrice = effectiveDiscount > 0
    ? Math.round(adjustedPrice * (1 - effectiveDiscount))
    : adjustedPrice;

  // Apply premium (positive price modifiers stack on top)
  if (archetypePremium > 0) {
    finalAskingPrice = Math.round(finalAskingPrice * (1 + archetypePremium));
  }

  // Franchise breakaway: +2% growth perk
  let finalGrowthRate = adjustedBusiness.organicGrowthRate;
  let finalRevenueGrowthRate = adjustedBusiness.revenueGrowthRate;
  if (sellerArchetype === 'franchise_breakaway') {
    finalGrowthRate += 0.02;
    finalRevenueGrowthRate += 0.02;
  }

  // Include fallback content for richer deals
  const aiContent = generateFallbackContent(sectorId, quality, sellerArchetype);

  const baseFreshness = 2;
  const freshness = baseFreshness + (options.freshnessBonus ?? 0);

  const dealSource = options.source ?? (Math.random() > 0.4 ? 'inbound' : 'brokered');

  // Calculate deal heat and effective price (pass archetype for heat modifier)
  const heat = calculateDealHeat(quality, dealSource, round, options.lastEventType, sellerArchetype);
  const heatPremium = calculateHeatPremium(heat);
  const effectivePrice = Math.round(finalAskingPrice * heatPremium);

  return {
    id: `deal_${generateBusinessId()}`,
    business: {
      ...adjustedBusiness,
      ebitda: adjustedEbitda,
      peakEbitda: adjustedEbitda,
      acquisitionEbitda: adjustedEbitda,
      acquisitionPrice: adjustedPrice,
      revenue: adjustedRevenue,
      acquisitionRevenue: adjustedRevenue,
      peakRevenue: adjustedRevenue,
      organicGrowthRate: finalGrowthRate,
      revenueGrowthRate: finalRevenueGrowthRate,
    },
    askingPrice: finalAskingPrice,
    freshness,
    roundAppeared: round,
    source: dealSource,
    acquisitionType,
    tuckInDiscount,
    aiContent,
    heat,
    effectivePrice,
    sellerArchetype,
  };
}

export function generateDealPipeline(
  currentPipeline: Deal[],
  round: number,
  maFocus?: MAFocus,
  portfolioFocusSector?: SectorId,
  portfolioFocusTier?: number,
  portfolioEbitda: number = 0,
  maSourcingTier: number = 0,
  maSourcingActive: boolean = false,
  lastEventType?: EventType
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

  // Shared options to pass lastEventType for heat calculation
  const heatOpts: DealGenerationOptions = lastEventType ? { lastEventType } : {};

  // 1. Generate deals based on M&A focus (if set)
  if (maFocus?.sectorId && pipeline.length < MAX_DEALS) {
    // Add 2 deals in focus sector with preferred size
    for (let i = 0; i < 2; i++) {
      if (pipeline.length >= MAX_DEALS) break;
      pipeline.push(generateDealWithSize(maFocus.sectorId, round, maFocus.sizePreference, portfolioEbitda, heatOpts));
    }
  }

  // 1b. MA Sourcing bonus deals (Tier 1+, active)
  if (maSourcingActive && maSourcingTier >= 1 && pipeline.length < MAX_DEALS) {
    const focusSector = maFocus?.sectorId ?? pickWeightedSector(round);
    const sourcingOptions: DealGenerationOptions = {
      freshnessBonus: 1, // Focus deals last 3 rounds
      source: 'sourced',
      lastEventType,
    };

    // Tier 2+: sub-type targeting + quality floor
    if (maSourcingTier >= 2 && maFocus?.subType) {
      sourcingOptions.subType = maFocus.subType;
      sourcingOptions.qualityFloor = 2;
    }
    if (maSourcingTier >= 3) {
      sourcingOptions.qualityFloor = 3;
    }

    // +2 focus-sector deals
    for (let i = 0; i < 2; i++) {
      if (pipeline.length >= MAX_DEALS) break;
      pipeline.push(generateDealWithSize(focusSector, round, maFocus?.sizePreference || 'any', portfolioEbitda, sourcingOptions));
    }

    // Tier 2+: 1-2 sub-type matched deals (on top of the 2 above)
    if (maSourcingTier >= 2 && maFocus?.subType && maFocus?.sectorId) {
      const subTypeCount = maSourcingTier >= 3 ? randomInt(2, 3) : randomInt(1, 2);
      for (let i = 0; i < subTypeCount; i++) {
        if (pipeline.length >= MAX_DEALS) break;
        pipeline.push(generateDealWithSize(
          maFocus.sectorId, round, maFocus.sizePreference || 'any', portfolioEbitda,
          { ...sourcingOptions, subType: maFocus.subType }
        ));
      }
    }

    // Tier 3: 2 off-market proprietary deals (15% discount, quality 3+)
    if (maSourcingTier >= 3) {
      const proprietarySector = maFocus?.sectorId ?? focusSector;
      for (let i = 0; i < 2; i++) {
        if (pipeline.length >= MAX_DEALS) break;
        pipeline.push(generateDealWithSize(
          proprietarySector, round, maFocus?.sizePreference || 'any', portfolioEbitda,
        {
          subType: maFocus?.subType ?? undefined,
          qualityFloor: 3,
          source: 'proprietary',
          multipleDiscount: 0.15,
          freshnessBonus: 1,
          lastEventType,
        }
      ));
      }
    }
  }

  // 2. Add deals from portfolio focus sector (synergy bonus)
  if (portfolioFocusSector && portfolioFocusTier && portfolioFocusTier >= 1 && pipeline.length < MAX_DEALS) {
    const focusDeals = portfolioFocusTier >= 2 ? 2 : 1;
    for (let i = 0; i < focusDeals; i++) {
      if (pipeline.length >= MAX_DEALS) break;
      pipeline.push(generateDealWithSize(portfolioFocusSector, round, maFocus?.sizePreference || 'any', portfolioEbitda, heatOpts));
    }
  }

  // 3. Ensure sector variety - add deals from sectors not in pipeline
  const missingSectors = allSectorIds.filter(s => !sectorsInPipeline.has(s));
  // L-5/M-11: Copy before sorting to avoid mutating source arrays
  const shuffledMissing = [...missingSectors].sort(() => Math.random() - 0.5);

  for (const sectorId of shuffledMissing.slice(0, 3)) {
    if (pipeline.length >= MAX_DEALS) break;
    pipeline.push(generateDealWithSize(sectorId, round, maFocus?.sizePreference || 'any', portfolioEbitda, heatOpts));
  }

  // 4. Fill remaining slots with weighted random deals
  // H-4: Compute target once before loop to prevent infinite loop
  const targetPipelineLength = Math.min(MAX_DEALS, pipeline.length + targetNewDeals);
  while (pipeline.length < targetPipelineLength) {
    const sectorId = pickWeightedSector(round);
    pipeline.push(generateDealWithSize(sectorId, round, maFocus?.sizePreference || 'any', portfolioEbitda, heatOpts));
  }

  // Ensure at least 4 deals available
  while (pipeline.length < 4) {
    const sectorId = pickWeightedSector(round);
    pipeline.push(generateDealWithSize(sectorId, round, 'any', portfolioEbitda, heatOpts));
  }

  return pipeline;
}

// Generate additional deals through investment banker sourcing
// More expensive but higher chance of getting deals in your focus sector
export function generateSourcedDeals(
  round: number,
  maFocus?: MAFocus,
  portfolioFocusSector?: SectorId,
  portfolioEbitda: number = 0,
  maSourcingTier: number = 0
): Deal[] {
  const deals: Deal[] = [];

  // Build options based on MA sourcing tier
  const sourcingOptions: DealGenerationOptions = { source: 'sourced' };
  if (maSourcingTier >= 2) {
    sourcingOptions.qualityFloor = 2;
    if (maFocus?.subType) sourcingOptions.subType = maFocus.subType;
  }
  if (maSourcingTier >= 3) {
    sourcingOptions.qualityFloor = 3;
  }

  // Sourced deals are higher quality opportunities
  // Generate 3 deals, heavily weighted toward focus sector

  // If M&A focus is set, 2 of 3 deals will be in that sector
  if (maFocus?.sectorId) {
    deals.push(generateDealWithSize(maFocus.sectorId, round, maFocus.sizePreference, portfolioEbitda, sourcingOptions));
    deals.push(generateDealWithSize(maFocus.sectorId, round, maFocus.sizePreference, portfolioEbitda, sourcingOptions));

    // Third deal from a different sector for variety
    const otherSector = portfolioFocusSector && portfolioFocusSector !== maFocus.sectorId
      ? portfolioFocusSector
      : pickWeightedSector(round);
    deals.push(generateDealWithSize(otherSector, round, maFocus.sizePreference, portfolioEbitda, sourcingOptions));
  } else if (portfolioFocusSector) {
    // No M&A focus but have portfolio focus - generate deals in that sector
    deals.push(generateDealWithSize(portfolioFocusSector, round, 'any', portfolioEbitda, sourcingOptions));
    deals.push(generateDealWithSize(portfolioFocusSector, round, 'any', portfolioEbitda, sourcingOptions));
    deals.push(generateDealWithSize(pickWeightedSector(round), round, 'any', portfolioEbitda, sourcingOptions));
  } else {
    // No focus set - generate diverse deals
    // M-11: Spread to avoid mutating global SECTOR_LIST
    const sectors = [...SECTOR_LIST].sort(() => Math.random() - 0.5).slice(0, 3);
    sectors.forEach(sector => {
      deals.push(generateDealWithSize(sector.id, round, 'any', portfolioEbitda, sourcingOptions));
    });
  }

  // Mark these as sourced deals (fresher since they just arrived)
  return deals.map(deal => ({
    ...deal,
    source: 'sourced' as const,
    freshness: 2,
  }));
}

// Generate deals through proactive outreach (Tier 3 only, $400k)
export function generateProactiveOutreachDeals(
  round: number,
  maFocus: MAFocus,
  portfolioEbitda: number = 0
): Deal[] {
  const deals: Deal[] = [];
  const sectorId = maFocus.sectorId ?? pickWeightedSector(round);

  for (let i = 0; i < 2; i++) {
    deals.push(generateDealWithSize(
      sectorId, round, maFocus.sizePreference || 'any', portfolioEbitda,
      {
        subType: maFocus.subType ?? undefined,
        qualityFloor: 3,
        source: 'proprietary',
      }
    ));
  }

  return deals;
}

export function createStartingBusiness(sectorId: SectorId = 'agency'): Business {
  const sector = SECTORS[sectorId];
  const business = generateBusiness(sectorId, 1, 3); // Start with a fair quality business

  // Starting business: ~$1M EBITDA, sector-appropriate multiple
  // This uses ~20% of the $20M raise, leaving cash for future acquisitions
  const targetEbitda = 1000; // $1M EBITDA
  const targetMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
  const acquisitionPrice = Math.round(targetEbitda * targetMultiple);

  // Derive revenue from target EBITDA and the generated margin
  const startingMargin = business.ebitdaMargin;
  const startingRevenue = Math.round(targetEbitda / startingMargin);

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
    revenue: startingRevenue,
    acquisitionRevenue: startingRevenue,
    peakRevenue: startingRevenue,
    // Platform fields
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: acquisitionPrice,
  };
}
