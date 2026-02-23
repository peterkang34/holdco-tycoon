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
  SizeRatioTier,
  randomInRange,
  randomInt,
  pickRandom,
} from './types';
import type { SeededRng } from './rng';
import { clampMargin } from './helpers';
import {
  INTEGRATION_DRAG_BASE_RATE,
  INTEGRATION_DRAG_FLOOR,
  INTEGRATION_DRAG_CAP,
  INTEGRATION_DRAG_MERGER_FACTOR,
} from '../data/gameConfig';
import { SECTORS, SECTOR_LIST } from '../data/sectors';
import { getRandomBusinessName } from '../data/names';
import { calculateSizeTierPremium } from './buyers';
import {
  isAIEnabled,
  generateBusinessContent,
  generateFallbackContent,
} from '../services/aiGeneration';

let businessIdCounter = 0;

export function generateBusinessId(round?: number, indexInRound?: number): string {
  if (round !== undefined && indexInRound !== undefined) {
    return `biz_r${round}_${indexInRound}`;
  }
  return `biz_${++businessIdCounter}`;
}

function fisherYatesShuffle<T>(array: T[], rng?: SeededRng): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const rand = rng ? rng.next() : Math.random();
    const j = Math.floor(rand * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

function generateQualityRating(rng?: SeededRng): QualityRating {
  // Weighted distribution: more 3s, fewer 1s and 5s
  const roll = rng ? rng.next() : Math.random();
  if (roll < 0.05) return 1;
  if (roll < 0.20) return 2;
  if (roll < 0.60) return 3;
  if (roll < 0.85) return 4;
  return 5;
}

function generateDueDiligence(quality: QualityRating, sectorId: SectorId, rng?: SeededRng): DueDiligenceSignals {
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
  revenueConcentrationText = pickRandom(concentrationTexts[revenueConcentration], rng)!;

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
  const operatorQualityText = pickRandom(operatorTexts[operatorQuality], rng)!;

  // Trend
  let trend: 'growing' | 'flat' | 'declining';
  if (quality >= 4) trend = 'growing';
  else if (quality >= 2) trend = (rng ? rng.next() : Math.random()) > 0.3 ? 'flat' : 'growing';
  else trend = (rng ? rng.next() : Math.random()) > 0.5 ? 'declining' : 'flat';

  const trendTexts = {
    growing: [`EBITDA growing ${randomInt(8, 15, rng)}% YoY`, 'Strong growth trajectory', 'Consistent expansion'],
    flat: ['EBITDA flat for 2 years', 'Stable but not growing', 'Revenue plateau'],
    declining: ['EBITDA declining 5-10% annually', 'Business in contraction', 'Shrinking market share'],
  };
  const trendText = pickRandom(trendTexts[trend], rng)!;

  // Customer retention
  let customerRetention: number;
  if (quality >= 4) customerRetention = randomInt(90, 98, rng);
  else if (quality >= 3) customerRetention = randomInt(82, 92, rng);
  else if (quality >= 2) customerRetention = randomInt(75, 85, rng);
  else customerRetention = randomInt(65, 78, rng);

  const customerRetentionText = `${customerRetention}% annual retention`;

  // Competitive position
  let competitivePosition: 'leader' | 'competitive' | 'commoditized';
  if (quality >= 4) competitivePosition = (rng ? rng.next() : Math.random()) > 0.3 ? 'leader' : 'competitive';
  else if (quality >= 2) competitivePosition = (rng ? rng.next() : Math.random()) > 0.5 ? 'competitive' : 'commoditized';
  else competitivePosition = 'commoditized';

  const positionTexts = {
    leader: ['Category leader in niche', 'Strong market position', 'Dominant in local market'],
    competitive: ['Solid competitive position', 'Well-regarded in market', 'Good reputation'],
    commoditized: ['Commoditized market', 'Price competition pressure', 'Low differentiation'],
  };
  const competitivePositionText = pickRandom(positionTexts[competitivePosition], rng)!;

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
  _round: number,
  forceQuality?: QualityRating,
  forceSubType?: string,
  rng?: SeededRng
): Omit<Business, 'id' | 'acquisitionRound' | 'improvements' | 'status'> {
  const sector = SECTORS[sectorId];
  const quality = forceQuality ?? generateQualityRating(rng);
  const dueDiligence = generateDueDiligence(quality, sectorId, rng);

  // Quality modifier (shared between revenue and margin)
  const qualityModifier = 0.8 + (quality - 1) * 0.1; // 0.8 to 1.2

  // Generate margin from sector range (quality-adjusted: Q5 +3ppt, Q1 -3ppt)
  let ebitdaMargin = randomInRange(sector.baseMargin, rng);
  ebitdaMargin += (quality - 3) * 0.015; // ±3ppt per 2 quality stars
  ebitdaMargin = clampMargin(ebitdaMargin);

  // Generate revenue from sector range (quality-adjusted same as EBITDA was)
  let revenue = Math.round(randomInRange(sector.baseRevenue, rng) * qualityModifier);

  // Derive EBITDA from revenue × margin
  let ebitda = Math.round(revenue * ebitdaMargin);

  // Revenue growth rate from sector organic growth range (quality bonus)
  let revenueGrowthRate = randomInRange(sector.organicGrowthRange, rng);
  revenueGrowthRate += (quality - 3) * 0.005;
  if (dueDiligence.trend === 'growing') revenueGrowthRate += 0.02;
  else if (dueDiligence.trend === 'declining') revenueGrowthRate -= 0.03;

  // Margin drift rate from sector range
  const marginDriftRate = randomInRange(sector.marginDriftRange, rng);

  // Calculate acquisition multiple
  let multiple = randomInRange(sector.acquisitionMultiple, rng);
  multiple += (quality - 3) * 0.35;
  // Competitive position affects pricing
  if (dueDiligence.competitivePosition === 'leader') multiple += 0.3;
  else if (dueDiligence.competitivePosition === 'commoditized') multiple -= 0.3;
  multiple = Math.round(multiple * 10) / 10;

  const subType = forceSubType && sector.subTypes.includes(forceSubType)
    ? forceSubType
    : pickRandom(sector.subTypes, rng)!;

  // Apply sub-type financial skews
  const stIdx = sector.subTypes.indexOf(subType);
  if (stIdx !== -1) {
    if (sector.subTypeMarginModifiers?.[stIdx]) {
      ebitdaMargin += sector.subTypeMarginModifiers[stIdx];
      ebitdaMargin = clampMargin(ebitdaMargin);
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
    name: getRandomBusinessName(sectorId, subType, rng),
    sectorId,
    subType,
    ebitda,
    peakEbitda: ebitda,
    acquisitionEbitda: ebitda,
    acquisitionPrice,
    acquisitionMultiple: multiple,
    acquisitionSizeTierPremium: calculateSizeTierPremium(ebitda).premium,
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
    integrationGrowthDrag: 0,
    sellerNoteBalance: 0,
    sellerNoteRate: 0,
    sellerNoteRoundsRemaining: 0,
    bankDebtBalance: 0,
    bankDebtRate: 0,
    bankDebtRoundsRemaining: 0,
    earnoutRemaining: 0,
    earnoutTarget: 0,
    // Platform fields
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: acquisitionPrice,
    rolloverEquityPct: 0,
  };
}

// Determine acquisition type based on EBITDA size
function determineAcquisitionType(ebitda: number, rng?: SeededRng): AcquisitionType {
  // Small businesses (<$500k EBITDA) are tuck-in candidates
  // Medium businesses ($500k-$2M) can be standalone or platform
  // Large businesses (>$2M) are platform opportunities
  if (ebitda < 500) {
    return 'tuck_in';
  } else if (ebitda < 2000) {
    return (rng ? rng.next() : Math.random()) > 0.6 ? 'platform' : 'standalone';
  } else {
    return (rng ? rng.next() : Math.random()) > 0.3 ? 'platform' : 'standalone';
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

export function assignSellerArchetype(quality: QualityRating, rng?: SeededRng): SellerArchetype {
  // Weighted distribution adjusted by quality
  const weights: { archetype: SellerArchetype; baseWeight: number; qualityAdj: number }[] = [
    { archetype: 'retiring_founder', baseWeight: 0.30, qualityAdj: quality >= 4 ? 0.10 : quality <= 2 ? -0.10 : 0 },
    { archetype: 'burnt_out_operator', baseWeight: 0.20, qualityAdj: quality <= 2 ? 0.05 : quality >= 4 ? -0.05 : 0 },
    { archetype: 'accidental_holdco', baseWeight: 0.10, qualityAdj: 0 },
    { archetype: 'distressed_seller', baseWeight: 0.08, qualityAdj: quality <= 2 ? 0.12 : quality >= 4 ? -0.05 : 0 },
    { archetype: 'mbo_candidate', baseWeight: 0.15, qualityAdj: quality >= 4 ? 0.05 : quality <= 2 ? -0.05 : 0 },
    { archetype: 'franchise_breakaway', baseWeight: 0.15, qualityAdj: quality <= 2 ? -0.05 : 0 },
  ];

  const adjusted = weights.map(w => ({ ...w, weight: Math.max(0.02, w.baseWeight + w.qualityAdj) }));
  const total = adjusted.reduce((s, w) => s + w.weight, 0);
  let roll = (rng ? rng.next() : Math.random()) * total;
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

function getArchetypePriceModifier(archetype: SellerArchetype, rng?: SeededRng): number {
  switch (archetype) {
    case 'retiring_founder': return randomInRange([0, 0.05], rng);
    case 'burnt_out_operator': return randomInRange([-0.10, -0.05], rng);
    case 'accidental_holdco': return randomInRange([0.05, 0.10], rng);
    case 'distressed_seller': return randomInRange([-0.20, -0.10], rng);
    case 'mbo_candidate': return randomInRange([0, 0.05], rng);
    case 'franchise_breakaway': return randomInRange([0.05, 0.10], rng);
  }
}

function getArchetypeOperatorQuality(archetype: SellerArchetype, rng?: SeededRng): 'strong' | 'moderate' | 'weak' | null {
  switch (archetype) {
    case 'retiring_founder': return (rng ? rng.next() : Math.random()) > 0.5 ? 'strong' : 'moderate';
    case 'burnt_out_operator': return (rng ? rng.next() : Math.random()) > 0.5 ? 'weak' : 'moderate';
    case 'accidental_holdco': return 'moderate';
    case 'distressed_seller': return 'weak';
    case 'mbo_candidate': return 'strong';
    case 'franchise_breakaway': return (rng ? rng.next() : Math.random()) > 0.5 ? 'strong' : 'moderate';
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
  sellerArchetype?: SellerArchetype,
  maxRounds: number = 20,
  creditTighteningActive: boolean = false,
  rng?: SeededRng,
  maSourcingTier?: MASourcingTier
): DealHeat {
  // Base distribution: cold 25%, warm 35%, hot 30%, contested 10%
  const roll = rng ? rng.next() : Math.random();
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

  // Credit tightening: fewer buyers in market = cooler deals
  if (creditTighteningActive) tierIndex -= 1;

  // Late game: more capital in market
  const lateGameRound = Math.ceil(maxRounds * 0.75);
  if (round >= lateGameRound) tierIndex += 1;

  // Source modifiers — proprietary/sourced = less competition
  // Combine with archetype heat modifier, cap total negative at -3
  let negativeModifiers = 0;
  if (source === 'proprietary') negativeModifiers -= 2;
  if (source === 'sourced') negativeModifiers -= 1;
  // M&A Sourcing Tier 2+ sourced deals get additional -1 heat
  if (source === 'sourced' && maSourcingTier && maSourcingTier >= 2) negativeModifiers -= 1;
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
export function calculateHeatPremium(heat: DealHeat, rng?: SeededRng): number {
  switch (heat) {
    case 'cold': return 1.0;
    case 'warm': return randomInRange([1.10, 1.15], rng);
    case 'hot': return randomInRange([1.20, 1.30], rng);
    case 'contested': return randomInRange([1.20, 1.35], rng);
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

// Calculate size ratio tier for bolt-on acquisitions
// sizeRatio = bolt-on EBITDA / platform EBITDA
export function getSizeRatioTier(boltOnEbitda: number, platformEbitda: number): { tier: SizeRatioTier; ratio: number } {
  if (platformEbitda <= 0) return { tier: 'overreach', ratio: 99 };
  const ratio = Math.abs(boltOnEbitda) / platformEbitda;
  if (ratio <= 0.5) return { tier: 'ideal', ratio };
  if (ratio <= 1.0) return { tier: 'stretch', ratio };
  if (ratio <= 2.0) return { tier: 'strained', ratio };
  return { tier: 'overreach', ratio };
}

// Size ratio penalty on integration success probability
function getSizeRatioProbabilityPenalty(
  tier: SizeRatioTier,
  platformScale: number,
  hasSharedServices: boolean,
  bothHighQuality: boolean,
): number {
  const basePenalty: Record<SizeRatioTier, number> = {
    ideal: 0,
    stretch: -0.08,
    strained: -0.18,
    overreach: -0.28,
  };
  const basePen = basePenalty[tier];
  if (basePen === 0) return 0;
  // Mitigating factors (only reduce the penalty, never flip to bonus)
  let mitigation = 0;
  if (platformScale >= 3) mitigation += 0.15; // Experienced platforms absorb better
  if (hasSharedServices) mitigation += 0.05;
  if (bothHighQuality) mitigation += 0.05;
  // Cap mitigation at 50% of base penalty — oversized bolt-ons are always risky
  const maxMitigation = Math.abs(basePen) * 0.5;
  return basePen + Math.min(mitigation, maxMitigation);
}

// Size ratio dampening on synergy capture
function getSizeRatioSynergyMultiplier(tier: SizeRatioTier): number {
  const multipliers: Record<SizeRatioTier, number> = {
    ideal: 1.0,
    stretch: 0.80,
    strained: 0.50,
    overreach: 0.25,
  };
  return multipliers[tier];
}

// Merger-specific penalties (half of tuck-in — mergers are more balanced by nature)
function getMergerSizeRatioProbabilityPenalty(
  tier: SizeRatioTier,
  platformScale: number,
  hasSharedServices: boolean,
  bothHighQuality: boolean,
): number {
  const basePenalty: Record<SizeRatioTier, number> = {
    ideal: 0,
    stretch: -0.04,
    strained: -0.09,
    overreach: -0.14,
  };
  const basePen = basePenalty[tier];
  if (basePen === 0) return 0;
  let mitigation = 0;
  if (platformScale >= 3) mitigation += 0.15;
  if (hasSharedServices) mitigation += 0.05;
  if (bothHighQuality) mitigation += 0.05;
  const maxMitigation = Math.abs(basePen) * 0.5;
  return basePen + Math.min(mitigation, maxMitigation);
}

function getMergerSizeRatioSynergyMultiplier(tier: SizeRatioTier): number {
  const multipliers: Record<SizeRatioTier, number> = {
    ideal: 1.0,
    stretch: 0.90,
    strained: 0.70,
    overreach: 0.50,
  };
  return multipliers[tier];
}

// Determine integration outcome based on various factors
export function determineIntegrationOutcome(
  acquiredBusiness: Omit<Business, 'id' | 'acquisitionRound' | 'improvements' | 'status'>,
  targetPlatform?: Business,
  hasSharedServices?: boolean,
  subTypeAffinity?: SubTypeAffinity,
  sizeRatioTier?: SizeRatioTier,
  isMerger?: boolean,
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

  // Size ratio penalty — oversized bolt-ons/mergers are harder to integrate
  if (sizeRatioTier && targetPlatform) {
    const bothHighQuality = acquiredBusiness.qualityRating >= 4 && targetPlatform.qualityRating >= 4;
    const penaltyFn = isMerger ? getMergerSizeRatioProbabilityPenalty : getSizeRatioProbabilityPenalty;
    successProbability += penaltyFn(
      sizeRatioTier,
      targetPlatform.platformScale,
      !!hasSharedServices,
      bothHighQuality,
    );
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
  subTypeAffinity?: SubTypeAffinity,
  sizeRatioTier?: SizeRatioTier,
  isMerger?: boolean,
): number {
  // Synergies are a % of the acquired/smaller business EBITDA
  let synergyRate: number;

  if (isMerger) {
    // Merger-specific rates (rebalanced: higher success, gentler failure)
    switch (outcome) {
      case 'success': synergyRate = 0.15; break;
      case 'partial': synergyRate = 0.05; break;
      case 'failure': synergyRate = -0.07; break;
    }
  } else {
    switch (outcome) {
      case 'success':
        synergyRate = isTuckIn ? 0.20 : 0.10;
        break;
      case 'partial':
        synergyRate = isTuckIn ? 0.08 : 0.03;
        break;
      case 'failure':
        synergyRate = isTuckIn ? -0.05 : -0.10;
        break;
    }
  }

  // Sub-type affinity affects synergy capture
  if (subTypeAffinity === 'related') {
    synergyRate *= 0.75; // Related sub-types: 75% synergies (e.g., HVAC + plumbing share suppliers)
  } else if (subTypeAffinity === 'distant') {
    synergyRate *= 0.45; // Distant sub-types: 45% synergies (e.g., dental + behavioral health)
  }

  // Size ratio dampens synergy capture for oversized bolt-ons/mergers
  if (sizeRatioTier) {
    synergyRate *= isMerger
      ? getMergerSizeRatioSynergyMultiplier(sizeRatioTier)
      : getSizeRatioSynergyMultiplier(sizeRatioTier);
  }

  return Math.round(acquiredEbitda * synergyRate);
}

// Calculate proportional growth penalty from a failed integration
export function calculateIntegrationGrowthPenalty(
  acquiredEbitda: number,
  platformEbitda: number,
  isMerger: boolean,
): number {
  if (platformEbitda <= 0) return isMerger ? INTEGRATION_DRAG_CAP * INTEGRATION_DRAG_MERGER_FACTOR : INTEGRATION_DRAG_CAP;
  const ratio = Math.abs(acquiredEbitda) / Math.abs(platformEbitda);
  let rawPenalty = -(ratio * INTEGRATION_DRAG_BASE_RATE);
  if (isMerger) rawPenalty *= INTEGRATION_DRAG_MERGER_FACTOR;
  const floor = isMerger ? INTEGRATION_DRAG_FLOOR * INTEGRATION_DRAG_MERGER_FACTOR : INTEGRATION_DRAG_FLOOR;
  const cap = isMerger ? INTEGRATION_DRAG_CAP * INTEGRATION_DRAG_MERGER_FACTOR : INTEGRATION_DRAG_CAP;
  return Math.max(cap, Math.min(floor, rawPenalty));
}

// Calculate multiple expansion based on platform scale
export function calculateMultipleExpansion(platformScale: number, totalEbitda: number): number {
  // Logarithmic scale bonus — scale 3 ~1.0x (same as before), scale 10 ~1.4x, scale 19 ~1.7x
  const scaleBonus = platformScale > 0 ? Math.min(2.0, Math.log2(platformScale + 1) * 0.5) : 0;

  // Additional bonus for very large platforms (>$5M combined EBITDA)
  const sizeBonus = totalEbitda > 5000 ? 0.3 : totalEbitda > 3000 ? 0.15 : 0;

  return scaleBonus + sizeBonus;
}

export function generateDeal(sectorId: SectorId, round: number, rng?: SeededRng): Deal {
  const business = generateBusiness(sectorId, round, undefined, undefined, rng);
  const acquisitionType = determineAcquisitionType(business.ebitda, rng);
  const tuckInDiscount = acquisitionType === 'tuck_in'
    ? calculateTuckInDiscount(business.qualityRating)
    : undefined;

  // Apply tuck-in discount to asking price
  const askingPrice = tuckInDiscount
    ? Math.round(business.acquisitionPrice * (1 - tuckInDiscount))
    : business.acquisitionPrice;

  // Always include fallback content for richer deals
  const aiContent = generateFallbackContent(sectorId, business.qualityRating);

  const source: Deal['source'] = (rng ? rng.next() : Math.random()) > 0.4 ? 'inbound' : 'brokered';
  const heat = calculateDealHeat(business.qualityRating, source, round, undefined, undefined, 20, false, rng);
  const heatPremium = calculateHeatPremium(heat, rng);
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
      revenue: deal.business.revenue,
      ebitdaMargin: deal.business.ebitdaMargin,
      operatorQuality: deal.business.dueDiligence.operatorQuality,
      revenueConcentration: deal.business.dueDiligence.revenueConcentration,
      marketTrend: deal.business.dueDiligence.trend,
      competitivePosition: deal.business.dueDiligence.competitivePosition,
      customerRetention: deal.business.dueDiligence.customerRetention,
      sellerArchetype: deal.sellerArchetype,
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

export function getSectorWeightsForRound(round: number, maxRounds: number = 20): Record<SectorId, number> {
  // Early game: cheaper sectors
  // Mid game: mixed
  // Late game: premium sectors

  const cheap: SectorId[] = ['agency', 'homeServices', 'b2bServices', 'education', 'autoServices'];
  const mid: SectorId[] = ['consumer', 'restaurant', 'healthcare', 'insurance', 'distribution', 'wealthManagement', 'environmental'];
  const premium: SectorId[] = ['saas', 'industrial', 'realEstate'];

  let cheapWeight: number, midWeight: number, premiumWeight: number;

  const earlyEnd = Math.ceil(maxRounds * 0.25);
  const midEnd = Math.ceil(maxRounds * 0.60);

  if (round <= earlyEnd) {
    cheapWeight = 0.60;
    midWeight = 0.30;
    premiumWeight = 0.10;
  } else if (round <= midEnd) {
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

export function pickWeightedSector(round: number, maxRounds: number = 20, rng?: SeededRng): SectorId {
  const weights = getSectorWeightsForRound(round, maxRounds);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = (rng ? rng.next() : Math.random()) * totalWeight;

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
  maxRounds?: number; // 20 or 10 — for scaling heat/weights
  creditTighteningActive?: boolean; // reduces deal heat by 1 tier
  maSourcingTier?: MASourcingTier; // Tier 2+ sourced deals get additional -1 heat
}

// Generate a deal with size preference
export function generateDealWithSize(
  sectorId: SectorId,
  round: number,
  sizePreference: DealSizePreference = 'any',
  portfolioEbitda: number = 0,
  options: DealGenerationOptions = {},
  rng?: SeededRng
): Deal {
  let quality = generateQualityRating(rng);

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

  const business = generateBusiness(sectorId, round, quality, options.subType, rng);

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
    let targetEbitda = minEbitda + (rng ? rng.next() : Math.random()) * (maxEbitda - minEbitda);

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
  const acquisitionType = determineAcquisitionType(adjustedEbitda, rng);
  const tuckInDiscount = acquisitionType === 'tuck_in'
    ? calculateTuckInDiscount(quality)
    : undefined;

  // Assign seller archetype
  const sellerArchetype = assignSellerArchetype(quality, rng);

  // Apply archetype operator quality override
  const archetypeOperator = getArchetypeOperatorQuality(sellerArchetype, rng);
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
        operatorQualityText: pickRandom(operatorTexts[archetypeOperator], rng)!,
      },
    };
  }

  // Apply archetype price modifier — use Math.max with proprietary discount (don't stack)
  const archetypePriceMod = getArchetypePriceModifier(sellerArchetype, rng);
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

  // Distressed seller: cap asking multiple at sector midpoint (never top-of-range)
  if (sellerArchetype === 'distressed_seller') {
    const sector = SECTORS[sectorId];
    const sectorMidMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
    const maxDistressedMultiple = quality <= 2
      ? sector.acquisitionMultiple[0] + 0.5  // Q1-Q2: near floor
      : sectorMidMultiple;                    // Q3+: midpoint
    const impliedMultiple = adjustedEbitda > 0 ? finalAskingPrice / adjustedEbitda : 0;
    if (impliedMultiple > maxDistressedMultiple) {
      finalAskingPrice = Math.round(adjustedEbitda * maxDistressedMultiple);
    }
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

  const dealSource = options.source ?? ((rng ? rng.next() : Math.random()) > 0.4 ? 'inbound' : 'brokered');

  // Calculate deal heat and effective price (pass archetype for heat modifier)
  const heat = calculateDealHeat(quality, dealSource, round, options.lastEventType, sellerArchetype, options.maxRounds ?? 20, options.creditTighteningActive ?? false, rng, options.maSourcingTier);
  const heatPremium = calculateHeatPremium(heat, rng);
  let effectivePrice = Math.round(finalAskingPrice * heatPremium);

  // Re-cap distressed deals after heat premium (prevents heat from exceeding distressed ceiling)
  if (sellerArchetype === 'distressed_seller' && adjustedEbitda > 0) {
    const sector = SECTORS[sectorId];
    const sectorMidMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
    const maxDistressedMultiple = quality <= 2
      ? sector.acquisitionMultiple[0] + 0.5
      : sectorMidMultiple;
    effectivePrice = Math.min(effectivePrice, Math.round(adjustedEbitda * maxDistressedMultiple));
  }

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
  lastEventType?: EventType,
  maxRounds: number = 20,
  creditTighteningActive: boolean = false,
  rng?: SeededRng
): Deal[] {
  // Deal index counter for deterministic IDs within a round
  let dealIdx = 0;

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

  // Shared options to pass lastEventType, maxRounds, and credit tightening for heat calculation
  const heatOpts: DealGenerationOptions = { lastEventType, maxRounds, creditTighteningActive };

  // 1. Generate deals based on M&A focus (if set)
  if (maFocus?.sectorId && pipeline.length < MAX_DEALS) {
    // Add 2 deals in focus sector with preferred size
    for (let i = 0; i < 2; i++) {
      if (pipeline.length >= MAX_DEALS) break;
      pipeline.push(generateDealWithSize(maFocus.sectorId, round, maFocus.sizePreference, portfolioEbitda, heatOpts, rng));
      dealIdx++;
    }
  }

  // 1b. MA Sourcing bonus deals (Tier 1+, active)
  if (maSourcingActive && maSourcingTier >= 1 && pipeline.length < MAX_DEALS) {
    const focusSector = maFocus?.sectorId ?? pickWeightedSector(round, maxRounds, rng);
    const sourcingOptions: DealGenerationOptions = {
      freshnessBonus: 1, // Focus deals last 3 rounds
      source: 'sourced',
      lastEventType,
      maxRounds,
      creditTighteningActive,
      maSourcingTier: maSourcingTier as MASourcingTier,
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
      pipeline.push(generateDealWithSize(focusSector, round, maFocus?.sizePreference || 'any', portfolioEbitda, sourcingOptions, rng));
      dealIdx++;
    }

    // Tier 2+: 1-2 sub-type matched deals (on top of the 2 above)
    if (maSourcingTier >= 2 && maFocus?.subType && maFocus?.sectorId) {
      const subTypeCount = maSourcingTier >= 3 ? randomInt(2, 3, rng) : randomInt(1, 2, rng);
      for (let i = 0; i < subTypeCount; i++) {
        if (pipeline.length >= MAX_DEALS) break;
        pipeline.push(generateDealWithSize(
          maFocus.sectorId, round, maFocus.sizePreference || 'any', portfolioEbitda,
          { ...sourcingOptions, subType: maFocus.subType },
          rng
        ));
        dealIdx++;
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
          maxRounds,
          creditTighteningActive,
        },
        rng
      ));
        dealIdx++;
      }
    }
  }

  // 2. Add deals from portfolio focus sector (synergy bonus)
  if (portfolioFocusSector && portfolioFocusTier && portfolioFocusTier >= 1 && pipeline.length < MAX_DEALS) {
    const focusDeals = portfolioFocusTier >= 2 ? 2 : 1;
    for (let i = 0; i < focusDeals; i++) {
      if (pipeline.length >= MAX_DEALS) break;
      pipeline.push(generateDealWithSize(portfolioFocusSector, round, maFocus?.sizePreference || 'any', portfolioEbitda, heatOpts, rng));
      dealIdx++;
    }
  }

  // 3. Ensure sector variety - add deals from sectors not in pipeline
  const missingSectors = allSectorIds.filter(s => !sectorsInPipeline.has(s));
  // L-5/M-11: Fisher-Yates shuffle to avoid biased sort comparator
  const shuffledMissing = fisherYatesShuffle(missingSectors, rng);

  // Early rounds: bias toward small/medium deals so players can afford first acquisitions
  // Round 1: mostly small, 1-2 medium for variety
  // Round 2: mix of small and medium
  const isEarlyRound = round <= 2;
  const getEarlyRoundSize = (index: number): DealSizePreference => {
    if (!isEarlyRound) return maFocus?.sizePreference || 'any';
    if (round === 1) return index < 2 ? 'medium' : 'small';
    return index < 3 ? 'medium' : 'small'; // round 2
  };
  let earlyDealIndex = pipeline.length; // track index for size rotation

  for (const sectorId of shuffledMissing.slice(0, 3)) {
    if (pipeline.length >= MAX_DEALS) break;
    const size = getEarlyRoundSize(earlyDealIndex++);
    pipeline.push(generateDealWithSize(sectorId, round, size, portfolioEbitda, heatOpts, rng));
    dealIdx++;
  }

  // 4. Fill remaining slots with weighted random deals
  // H-4: Compute target once before loop to prevent infinite loop
  const targetPipelineLength = Math.min(MAX_DEALS, pipeline.length + targetNewDeals);
  while (pipeline.length < targetPipelineLength) {
    const sectorId = pickWeightedSector(round, maxRounds, rng);
    const size = getEarlyRoundSize(earlyDealIndex++);
    pipeline.push(generateDealWithSize(sectorId, round, size, portfolioEbitda, heatOpts, rng));
    dealIdx++;
  }

  // Ensure at least 4 deals available
  while (pipeline.length < 4) {
    const sectorId = pickWeightedSector(round, maxRounds, rng);
    const size = getEarlyRoundSize(earlyDealIndex++);
    pipeline.push(generateDealWithSize(sectorId, round, size, portfolioEbitda, heatOpts, rng));
    dealIdx++;
  }

  return pipeline;
}

// Generate distressed deals during Financial Crisis (3-4 deals at 30-50% off, Q2-3)
export function generateDistressedDeals(
  round: number,
  maxRounds: number = 20,
  rng?: SeededRng
): Deal[] {
  const deals: Deal[] = [];
  const count = randomInt(3, 4, rng);

  for (let i = 0; i < count; i++) {
    const sectorId = pickWeightedSector(round, maxRounds, rng);
    const multipleDiscount = 0.30 + (rng ? rng.next() : Math.random()) * 0.20; // 30-50% off

    deals.push(generateDealWithSize(
      sectorId,
      round,
      'any',
      0,
      {
        qualityFloor: 2 as QualityRating,
        source: 'brokered',
        freshnessBonus: 1,
        multipleDiscount,
        maxRounds,
        creditTighteningActive: true,
      },
      rng
    ));
  }

  // Cap quality at 3 (fixable problems, not gems)
  return deals.map(deal => ({
    ...deal,
    business: {
      ...deal.business,
      qualityRating: Math.min(3, deal.business.qualityRating) as QualityRating,
    },
  }));
}

// Generate distressed deals during Recession (1-2 deals at 15-25% off, Q3 cap)
export function generateRecessionDeals(
  round: number,
  maxRounds: number = 20,
  rng?: SeededRng
): Deal[] {
  const deals: Deal[] = [];
  const count = randomInt(1, 2, rng);

  for (let i = 0; i < count; i++) {
    const sectorId = pickWeightedSector(round, maxRounds, rng);
    const multipleDiscount = 0.15 + (rng ? rng.next() : Math.random()) * 0.10; // 15-25% off

    deals.push(generateDealWithSize(
      sectorId,
      round,
      'any',
      0,
      {
        qualityFloor: 2 as QualityRating,
        source: 'brokered',
        freshnessBonus: 1,
        multipleDiscount,
        maxRounds,
        lastEventType: 'global_recession',
      },
      rng
    ));
  }

  // Cap quality at 3 (same as financial crisis deals)
  return deals.map(deal => ({
    ...deal,
    business: {
      ...deal.business,
      qualityRating: Math.min(3, deal.business.qualityRating) as QualityRating,
    },
  }));
}

// Generate additional deals through investment banker sourcing
// More expensive but higher chance of getting deals in your focus sector
export function generateSourcedDeals(
  round: number,
  maFocus?: MAFocus,
  portfolioFocusSector?: SectorId,
  portfolioEbitda: number = 0,
  maSourcingTier: number = 0,
  maxRounds: number = 20,
  creditTighteningActive: boolean = false,
  rng?: SeededRng
): Deal[] {
  const deals: Deal[] = [];

  // Build options based on MA sourcing tier
  const sourcingOptions: DealGenerationOptions = { source: 'sourced', maxRounds, creditTighteningActive, maSourcingTier: maSourcingTier as MASourcingTier };
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
    deals.push(generateDealWithSize(maFocus.sectorId, round, maFocus.sizePreference, portfolioEbitda, sourcingOptions, rng));
    deals.push(generateDealWithSize(maFocus.sectorId, round, maFocus.sizePreference, portfolioEbitda, sourcingOptions, rng));

    // Third deal from a different sector for variety
    const otherSector = portfolioFocusSector && portfolioFocusSector !== maFocus.sectorId
      ? portfolioFocusSector
      : pickWeightedSector(round, maxRounds, rng);
    deals.push(generateDealWithSize(otherSector, round, maFocus.sizePreference, portfolioEbitda, sourcingOptions, rng));
  } else if (portfolioFocusSector) {
    // No M&A focus but have portfolio focus - generate deals in that sector
    deals.push(generateDealWithSize(portfolioFocusSector, round, 'any', portfolioEbitda, sourcingOptions, rng));
    deals.push(generateDealWithSize(portfolioFocusSector, round, 'any', portfolioEbitda, sourcingOptions, rng));
    deals.push(generateDealWithSize(pickWeightedSector(round, maxRounds, rng), round, 'any', portfolioEbitda, sourcingOptions, rng));
  } else {
    // No focus set - generate diverse deals
    // M-11: Fisher-Yates shuffle to avoid biased sort comparator
    const sectors = fisherYatesShuffle([...SECTOR_LIST], rng).slice(0, 3);
    sectors.forEach(sector => {
      deals.push(generateDealWithSize(sector.id, round, 'any', portfolioEbitda, sourcingOptions, rng));
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
  portfolioEbitda: number = 0,
  maxRounds: number = 20,
  creditTighteningActive: boolean = false,
  rng?: SeededRng
): Deal[] {
  const deals: Deal[] = [];
  const sectorId = maFocus.sectorId ?? pickWeightedSector(round, maxRounds, rng);

  for (let i = 0; i < 2; i++) {
    deals.push(generateDealWithSize(
      sectorId, round, maFocus.sizePreference || 'any', portfolioEbitda,
      {
        subType: maFocus.subType ?? undefined,
        qualityFloor: 3,
        source: 'proprietary',
        maxRounds,
        creditTighteningActive,
      },
      rng
    ));
  }

  return deals;
}

export function createStartingBusiness(sectorId: SectorId = 'agency', targetEbitdaParam: number = 1000, multipleCap?: number, rng?: SeededRng): Business {
  const sector = SECTORS[sectorId];
  const business = generateBusiness(sectorId, 1, 3, undefined, rng); // Start with a fair quality business

  // Starting business: sector-appropriate multiple (optionally capped for Normal difficulty)
  const targetEbitda = targetEbitdaParam;
  const sectorAvgMultiple = (sector.acquisitionMultiple[0] + sector.acquisitionMultiple[1]) / 2;
  const targetMultiple = multipleCap
    ? Math.min(multipleCap, sectorAvgMultiple)
    : sectorAvgMultiple;
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
    acquisitionSizeTierPremium: calculateSizeTierPremium(targetEbitda).premium,
    revenue: startingRevenue,
    acquisitionRevenue: startingRevenue,
    peakRevenue: startingRevenue,
    // Platform fields
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: acquisitionPrice,
    rolloverEquityPct: 0,
  };
}
