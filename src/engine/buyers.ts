import {
  Business,
  BuyerPoolTier,
  BuyerType,
  BuyerProfile,
  ValuationCommentary,
  SectorId,
  pickRandom,
} from './types';
import type { SeededRng } from './rng';
import { SECTORS } from '../data/sectors';

// ── Size Tier Premium ──────────────────────────────────────────────
// Smooth interpolation based on EBITDA (in thousands; 1000 = $1M)

interface SizeTierResult {
  tier: BuyerPoolTier;
  premium: number;
}

function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

export function calculateSizeTierPremium(ebitda: number): SizeTierResult {
  // EBITDA thresholds in thousands (1000 = $1M)
  if (ebitda < 2000) {
    return { tier: 'individual', premium: 0.0 };
  }
  if (ebitda < 5000) {
    return { tier: 'small_pe', premium: lerp(ebitda, 2000, 5000, 0.5, 0.8) };
  }
  if (ebitda < 10000) {
    return { tier: 'lower_middle_pe', premium: lerp(ebitda, 5000, 10000, 0.8, 1.5) };
  }
  if (ebitda < 20000) {
    return { tier: 'institutional_pe', premium: lerp(ebitda, 10000, 20000, 1.5, 2.5) };
  }
  // $20M+ EBITDA — caps at $30M
  const capped = Math.min(ebitda, 30000);
  return { tier: 'large_pe', premium: lerp(capped, 20000, 30000, 2.5, 3.5) };
}

// ── De-Risking Premium ─────────────────────────────────────────────
// Composite premium based on business quality signals

export function calculateDeRiskingPremium(business: Business): number {
  let premium = 0;

  // Low revenue concentration: +0.3x
  if (business.dueDiligence.revenueConcentration === 'low') {
    premium += 0.3;
  }

  // Strong operator: +0.3x
  if (business.dueDiligence.operatorQuality === 'strong') {
    premium += 0.3;
  }

  // Platform with bolt-ons: +0.2x per scale tier (up to +0.6x)
  if (business.isPlatform && business.platformScale > 0) {
    premium += Math.min(0.6, business.platformScale * 0.2);
  }

  // 2+ improvements: +0.2x
  if (business.improvements.length >= 2) {
    premium += 0.2;
  }

  // 90%+ retention: +0.2x
  if (business.dueDiligence.customerRetention >= 90) {
    premium += 0.2;
  }

  // Cap at 1.5x
  return Math.min(1.5, premium);
}

// ── Buyer Name Pools ───────────────────────────────────────────────

const PE_FUND_NAMES = [
  'Summit Ridge Partners',
  'Clearview Capital',
  'Ironpoint Capital',
  'Meridian Growth Partners',
  'Cascadia Equity Group',
  'Blackthorn Capital',
  'Northstar Capital Partners',
  'Granite Point Partners',
  'Pinecrest Capital',
  'Crestline Partners',
  'Ridgeline Capital',
  'Timberstone Equity',
  'Stonebridge Partners',
  'Bluewater Capital',
  'Highland Capital Group',
];

const FAMILY_OFFICE_NAMES = [
  'Thornton Family Office',
  'Mercer Capital Partners',
  'Whitfield Holdings',
  'Ashford Capital Group',
  'Sterling Family Partners',
  'Kensington Capital',
  'Hartwick Investments',
  'Bancroft Partners',
  'Davenport Capital',
  'Winslow Holdings',
];

const STRATEGIC_TEMPLATES: Record<string, string[]> = {
  agency: ['WPP', 'Omnicom', 'Publicis Groupe', 'IPG', 'Dentsu', 'Accenture Song'],
  saas: ['Vista Equity', 'Thoma Bravo', 'Silver Lake', 'Insight Partners', 'Salesforce'],
  homeServices: ['FirstService Corp', 'Neighborly', 'Cintas', 'Rollins', 'ServiceMaster'],
  consumer: ['Procter & Gamble', 'Unilever', 'Church & Dwight', 'Spectrum Brands', 'Henkel'],
  industrial: ['Danaher', 'Roper Technologies', 'ITW', 'Parker Hannifin', 'Honeywell'],
  b2bServices: ['Constellation Software', 'Accenture', 'Gartner', 'IHS Markit', 'Verisk'],
  healthcare: ['UnitedHealth', 'McKesson', 'Cardinal Health', 'Amedisys', 'Envision'],
  restaurant: ['Inspire Brands', 'Restaurant Brands Intl', 'Yum! Brands', 'Dine Brands', 'Jack in the Box'],
  realEstate: ['Brookfield', 'CBRE', 'JLL', 'Cushman & Wakefield', 'Colliers'],
  education: ['Pearson', 'Scholastic', 'Grand Canyon Education', 'Bright Horizons', 'Chegg'],
  insurance: ['Acrisure', 'Hub International', 'Gallagher', 'AssuredPartners', 'NFP'],
  autoServices: ['Driven Brands', 'Mavis Discount Tire', 'Caliber Collision', 'Sun Auto Tire', 'Crash Champions'],
  distribution: ['Watsco', 'Pool Corp', 'Fastenal', 'Grainger', 'HD Supply'],
  wealthManagement: ['Focus Financial', 'Hightower', 'CI Financial', 'Mercer Advisors', 'Carson Group', 'Cetera Financial'],
  environmental: ['Waste Management', 'Republic Services', 'GFL Environmental', 'Casella Waste', 'Clean Harbors', 'US Ecology'],
};

// ── Buyer Profile Generation ───────────────────────────────────────

function getBuyerType(tier: BuyerPoolTier, rng?: SeededRng): { type: BuyerType; isStrategic: boolean } {
  // Strategic chance increases by tier
  const strategicChance: Record<BuyerPoolTier, number> = {
    individual: 0.0,
    small_pe: 0.05,
    lower_middle_pe: 0.15,
    institutional_pe: 0.25,
    large_pe: 0.35,
  };

  if ((rng ? rng.next() : Math.random()) < strategicChance[tier]) {
    return { type: 'strategic', isStrategic: true };
  }

  const typeMap: Record<BuyerPoolTier, BuyerType[]> = {
    individual: ['individual', 'individual', 'family_office'],
    small_pe: ['small_pe', 'family_office', 'small_pe'],
    lower_middle_pe: ['lower_middle_pe', 'lower_middle_pe', 'family_office'],
    institutional_pe: ['institutional_pe', 'institutional_pe', 'large_pe'],
    large_pe: ['large_pe', 'large_pe', 'institutional_pe'],
  };

  const type = pickRandom(typeMap[tier], rng)!;
  return { type, isStrategic: false };
}

function pickBuyerName(buyerType: BuyerType, sectorId: SectorId, rng?: SeededRng): string {
  if (buyerType === 'strategic') {
    const strategics = STRATEGIC_TEMPLATES[sectorId] || STRATEGIC_TEMPLATES.b2bServices;
    return pickRandom(strategics, rng)!;
  }
  if (buyerType === 'individual') {
    return 'Independent Sponsor';
  }
  if (buyerType === 'family_office') {
    return pickRandom(FAMILY_OFFICE_NAMES, rng)!;
  }
  return pickRandom(PE_FUND_NAMES, rng)!;
}

function getFundSize(buyerType: BuyerType): string | undefined {
  switch (buyerType) {
    case 'individual': return undefined;
    case 'family_office': return '$50-200M AUM';
    case 'small_pe': return '$100-500M fund';
    case 'lower_middle_pe': return '$500M-2B fund';
    case 'institutional_pe': return '$2-10B fund';
    case 'large_pe': return '$10B+ fund';
    case 'strategic': return undefined;
  }
}

function generateThesis(buyerType: BuyerType, business: Business): string {
  const sectorName = SECTORS[business.sectorId].name;
  const marginPct = (business.ebitdaMargin * 100).toFixed(0);
  const marginDelta = business.ebitdaMargin - business.acquisitionMargin;
  const marginNote = marginDelta >= 0.03
    ? ` Margin expansion of ${(marginDelta * 100).toFixed(0)} ppt since acquisition demonstrates operational improvement potential.`
    : marginDelta <= -0.03
    ? ` Margin compression presents an opportunity for operational turnaround.`
    : '';

  if (buyerType === 'strategic') {
    return `Seeking to expand ${sectorName} capabilities and cross-sell to existing customer base. At ${marginPct}% margins, platform synergies expected to drive 200-400 bps of margin expansion within 18 months.${marginNote}`;
  }
  if (buyerType === 'individual') {
    return `Experienced operator looking for a ${sectorName.toLowerCase()} business to run. ${marginPct}% EBITDA margins provide stable cash flow for hands-on management.`;
  }
  if (buyerType === 'family_office') {
    return `Seeking cash-flowing ${sectorName.toLowerCase()} assets at ${marginPct}% margins for long-term hold. Values stability and predictable returns over growth.${marginNote}`;
  }

  // PE fund types
  if (business.isPlatform) {
    return `Platform acquisition thesis — consolidate fragmented ${sectorName.toLowerCase()} market through programmatic M&A. Target 3-5 bolt-ons post-close to drive multiple expansion and margin improvement from ${marginPct}% base.`;
  }
  if (business.ebitda >= 10000) {
    return `Institutional-quality ${sectorName.toLowerCase()} platform with de-risked cash flows at ${marginPct}% margins. Thesis centers on operational improvements and strategic add-on acquisitions.${marginNote}`;
  }
  return `Attractive ${sectorName.toLowerCase()} acquisition at ${marginPct}% EBITDA margins with strong fundamentals. Plan to professionalize operations and accelerate organic growth with margin expansion opportunity.`;
}

export function generateBuyerProfile(
  business: Business,
  tier: BuyerPoolTier,
  sectorId: SectorId,
  rng?: SeededRng,
): BuyerProfile {
  const { type, isStrategic } = getBuyerType(tier, rng);
  const name = pickBuyerName(type, sectorId, rng);
  const fundSize = getFundSize(type);
  const investmentThesis = generateThesis(type, business);

  // Strategic premium: 0.5–1.5x
  const strategicPremium = isStrategic ? 0.5 + (rng ? rng.next() : Math.random()) * 1.0 : 0;

  return {
    name,
    type,
    fundSize,
    investmentThesis,
    isStrategic,
    strategicPremium,
  };
}

// ── Valuation Commentary ───────────────────────────────────────────

const TIER_DESCRIPTIONS: Record<BuyerPoolTier, string> = {
  individual: 'At this size, the buyer pool is limited to individual operators and independent sponsors who typically pay lower multiples due to financing constraints.',
  small_pe: 'Small PE funds and family offices are the primary buyers at this level. Competition is moderate, supporting modest multiple expansion.',
  lower_middle_pe: 'Lower middle market PE funds compete actively for businesses this size. Multiple bidders are common, driving premium valuations.',
  institutional_pe: 'Institutional PE firms with significant capital seek platform assets at this EBITDA level. Competitive auctions frequently drive multiples to 10x+.',
  large_pe: 'Large-cap PE firms and strategic acquirers aggressively pursue assets of this scale. Auctions are highly competitive with institutional-grade pricing.',
};

export function generateValuationCommentary(
  business: Business,
  tier: BuyerPoolTier,
  sizePremium: number,
  deRiskingPremium: number,
  ebitda: number,
  totalMultiple: number
): ValuationCommentary {
  const ebitdaM = (ebitda / 1000).toFixed(1);
  const factors: string[] = [];

  if (sizePremium > 0) {
    factors.push(`Size premium of +${sizePremium.toFixed(1)}x reflects institutional buyer demand at $${ebitdaM}M EBITDA`);
  }

  if (deRiskingPremium > 0) {
    const deRiskFactors: string[] = [];
    if (business.dueDiligence.revenueConcentration === 'low') deRiskFactors.push('diversified revenue');
    if (business.dueDiligence.operatorQuality === 'strong') deRiskFactors.push('strong management');
    if (business.isPlatform && business.platformScale > 0) deRiskFactors.push('platform scale');
    if (business.improvements.length >= 2) deRiskFactors.push('operational improvements');
    if (business.dueDiligence.customerRetention >= 90) deRiskFactors.push('high retention');
    factors.push(`De-risking premium of +${deRiskingPremium.toFixed(1)}x from ${deRiskFactors.join(', ')}`);
  }

  if (business.isPlatform) {
    factors.push('Platform status signals professionalized operations and scalability');
  }

  const marginPct = business.ebitdaMargin ? (business.ebitdaMargin * 100).toFixed(0) : null;
  const tierLabels: Record<BuyerPoolTier, string> = {
    individual: 'individual buyer',
    small_pe: 'small PE',
    lower_middle_pe: 'lower middle PE',
    institutional_pe: 'institutional PE',
    large_pe: 'large PE',
  };
  const summary = `At $${ebitdaM}M EBITDA${marginPct ? ` (${marginPct}% margins)` : ''}, this attracts ${tierLabels[tier]} attention at ${totalMultiple.toFixed(1)}x`;

  return {
    summary,
    factors,
    buyerPoolDescription: TIER_DESCRIPTIONS[tier],
  };
}
