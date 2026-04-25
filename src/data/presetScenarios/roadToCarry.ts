/**
 * Road To Carry preset scenarios — 5 scenarios derived from real PE case studies
 * documented in `docs/Road-to-carry-takeaways.pdf` (penewsletter.com).
 *
 * Authored to exercise the Phase 4 (round-based + trigger) and Phase 5 (FEV
 * milestone multiplier) systems shipped in the scenario-challenges work.
 * Each scenario teaches a specific PE archetype:
 *
 *   1. Porta-Potty Roll-Up — disciplined tuck-in rollup, survive a recession
 *   2. Vanity Capital — recurring-revenue MSO build (Botox/Fillers archetype)
 *   3. The Cleaning Trap — diseconomies of scale; reward staying lean
 *   4. Ski Mountain Empire — long-hold consolidation with continuation-style depth
 *   5. Trophy Asset Hunt — capital-only start, hunting scarce premium assets
 *
 * Seeded into KV via `api/admin/scenario-challenges/seed-presets.ts`. All start
 * `isActive: false, isFeatured: false` — admin reviews + activates manually.
 *
 * Date strategy: startDate = today, endDate = today + 90 days. Seed endpoint
 * recomputes these at write time so reseeding doesn't bake stale dates.
 */
import type { ScenarioChallengeConfig } from '../../engine/types.js';

/** Build with current dates so reseeding doesn't ship stale start/endDate values. */
export function buildRoadToCarryPresets(now: Date = new Date()): ScenarioChallengeConfig[] {
  const startDate = now.toISOString();
  const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  return [
    portaPottyRollup(startDate, endDate),
    vanityCapital(startDate, endDate),
    cleaningTrap(startDate, endDate),
    skiMountainEmpire(startDate, endDate),
    trophyAssetHunt(startDate, endDate),
  ];
}

// ── 1. Porta-Potty Roll-Up ───────────────────────────────────────────────
// Source: penewsletter.com Flush with Opportunity (waste services, 70+ tuck-ins,
// 2008 creditor takeover). Teaches roll-up velocity + cyclical survival.

function portaPottyRollup(startDate: string, endDate: string): ScenarioChallengeConfig {
  return {
    id: 'porta-potty-rollup',
    name: 'Porta-Potty Roll-Up',
    tagline: 'Build a 70-tuck-in waste empire — and survive the 2008 crash',
    description: 'You take over a regional waste-services platform with $1.2M EBITDA. The PE playbook: roll up 15+ tuck-ins, integrate ruthlessly, build a national platform. The catch: construction cycles will turn against you mid-game. Survive with manageable leverage and you exit at premium multiples. Outrun your integration capacity OR pile on debt and the creditors take over.',
    configVersion: 1,
    theme: { emoji: '🚽', color: '#A16207', era: '2005-2020' },
    startDate, endDate,
    isActive: false,
    isFeatured: false,
    seed: 17052024,
    difficulty: 'normal',
    duration: 'standard',
    maxRounds: 15,
    startingCash: 8_000,
    startingDebt: 4_000,
    founderShares: 8_000,
    sharesOutstanding: 10_000,
    rankingMetric: 'fev',
    allowedSectors: ['homeServices', 'b2bServices'],
    startingBusinesses: [{
      name: 'Tri-State Sanitation',
      sectorId: 'homeServices',
      ebitda: 1_200,
      multiple: 5.5,
      quality: 3,
      status: 'active',
      backstory: 'Family-owned waste-services operator across three states. The founder is exiting; the team stays.',
    }],
    forcedEvents: {
      8: {
        type: 'global_financial_crisis',
        customTitle: 'Construction Cycle Collapses',
        customDescription: 'Building permits drop 40% nationally. Construction-tied service businesses see volumes evaporate. Lenders tighten covenants. Highly-leveraged players face creditor takeover. Disciplined operators acquire distressed competitors at fire-sale prices.',
      },
    },
    triggers: [
      {
        id: 'tuck-in-champion',
        when: { metric: 'totalTuckIns', op: '>=', value: 15 },
        actions: [{ type: 'applyFevMultiplier', value: 1.5 }],
        narrative: { title: 'Tuck-In Champion', detail: 'Executed 15+ tuck-in acquisitions — disciplined roll-up at scale.' },
      },
      {
        id: 'survived-crash',
        when: { all: [
          { metric: 'round', op: '>=', value: 10 },
          { metric: 'lowestAverageLeverage', op: '<=', value: 4 },
        ]},
        actions: [{ type: 'applyFevMultiplier', value: 1.3 }],
        narrative: { title: 'Cycle Survivor', detail: 'Kept leverage at or below 4× through the construction crash. Lenders never circled.' },
      },
      {
        id: 'national-platform',
        when: { metric: 'largestPlatformEbitda', op: '>=', value: 12_000 },
        actions: [{ type: 'applyFevMultiplier', value: 1.4 }],
        narrative: { title: 'National Platform', detail: 'Built a single integrated platform exceeding $12M EBITDA — premium exit territory.' },
      },
    ],
    maxAcquisitionsPerRound: 3,
    startingMaSourcingTier: 1,
  };
}

// ── 2. Vanity Capital ─────────────────────────────────────────────────────
// Source: penewsletter.com Vanity Capital (Botox/Fillers, 70% repeat rate,
// 4-6x → 12-15x platform multiple). Teaches recurring revenue + MSO scale.

function vanityCapital(startDate: string, endDate: string): ScenarioChallengeConfig {
  return {
    id: 'vanity-capital',
    name: 'Vanity Capital',
    tagline: 'Build an aesthetics MSO from one location to a national platform',
    description: 'Cash-pay aesthetics is one of the best businesses in PE: 70% client repeat rate, 3-4 month re-injection cycles, no insurance friction. You start with one med-spa doing $800K EBITDA. Build a Management Services Organization (MSO) — acquire single locations at 4-6×, integrate, exit at 12-15× as a national platform. The trick: stickiness compounds. Reward yourself with founder distributions only after you have scale.',
    configVersion: 1,
    theme: { emoji: '💉', color: '#DB2777' },
    startDate, endDate,
    isActive: false,
    isFeatured: false,
    seed: 28041961,
    difficulty: 'easy',
    duration: 'quick',
    maxRounds: 10,
    startingCash: 5_000,
    startingDebt: 1_500,
    founderShares: 9_000,
    sharesOutstanding: 10_000,
    rankingMetric: 'fev',
    allowedSectors: ['healthcare'],
    startingBusinesses: [{
      name: 'Glow Aesthetics — Flagship',
      sectorId: 'healthcare',
      subType: 'Ophthalmology / Specialty Care',
      ebitda: 800,
      multiple: 5.0,
      quality: 4,
      status: 'active',
      backstory: 'High-margin aesthetics clinic with 70% repeat clientele. The founding nurse practitioner stays on as Chief Clinical Officer.',
    }],
    triggers: [
      {
        id: 'recurring-cash-flow',
        when: { metric: 'totalDistributions', op: '>=', value: 5_000 },
        actions: [{ type: 'applyFevMultiplier', value: 1.4 }],
        narrative: { title: 'Subscription Cash Flow', detail: 'Pulled $5M+ in distributions — proof your platform throws off real recurring cash.' },
      },
      {
        id: 'mso-scale',
        when: { metric: 'integratedPlatformCount', op: '>=', value: 2 },
        actions: [{ type: 'applyFevMultiplier', value: 1.3 }],
        narrative: { title: 'MSO Architect', detail: 'Built 2+ integrated platforms — multi-region MSO structure unlocks national exit.' },
      },
      {
        id: 'national-platform-vc',
        when: { metric: 'largestPlatformEbitda', op: '>=', value: 8_000 },
        actions: [{ type: 'applyFevMultiplier', value: 1.5 }],
        narrative: { title: 'National Platform', detail: '$8M+ EBITDA on a single platform — strategic acquirers will pay 12-15× for this scale.' },
      },
    ],
    maxAcquisitionsPerRound: 2,
    startingMaSourcingTier: 0,
  };
}

// ── 3. The Cleaning Trap ──────────────────────────────────────────────────
// Source: penewsletter.com Commercial Cleaning (ABM 5.7% margin vs mom-and-pop
// 30%). Teaches diseconomies of scale + regional discipline.

function cleaningTrap(startDate: string, endDate: string): ScenarioChallengeConfig {
  return {
    id: 'cleaning-trap',
    name: 'The Cleaning Trap',
    tagline: 'In facility services, the biggest player has the worst margins',
    description: 'You inherit a regional commercial-cleaning business at 22% EBITDA margin. The PE playbook says: roll up, scale nationally, exit big. The case study says: the biggest player in this industry runs at 5.7% margins while the mom-and-pop runs at 30%. Your goal is the opposite of the textbook — stay disciplined, keep leverage low, resist the urge to over-consolidate. Win by holding what works, not by chasing scale.',
    configVersion: 1,
    theme: { emoji: '🧹', color: '#0EA5E9' },
    startDate, endDate,
    isActive: false,
    isFeatured: false,
    seed: 11111986,
    difficulty: 'normal',
    duration: 'quick',
    maxRounds: 10,
    startingCash: 3_500,
    startingDebt: 800,
    founderShares: 9_000,
    sharesOutstanding: 10_000,
    rankingMetric: 'fev',
    allowedSectors: ['b2bServices'],
    startingBusinesses: [{
      name: 'Cardinal Cleaning Services',
      sectorId: 'b2bServices',
      subType: 'IT Managed Services (MSP)',
      ebitda: 900,
      multiple: 4.5,
      quality: 3,
      status: 'active',
      backstory: 'Regional commercial-cleaning operator. Strong margins, sticky contracts, no growth ambitions. The previous owner refused to expand beyond a 4-state radius — and made bank.',
    }],
    triggers: [
      {
        id: 'lean-operator',
        when: { all: [
          { metric: 'round', op: '>=', value: 8 },
          { metric: 'activeBusinessCount', op: '<=', value: 4 },
          { metric: 'lowestAverageLeverage', op: '<=', value: 2 },
        ]},
        actions: [{ type: 'applyFevMultiplier', value: 1.5 }],
        narrative: { title: 'Lean Operator', detail: 'Stayed disciplined: ≤4 businesses, leverage ≤2× through the run. The cleaning paradox rewards restraint.' },
      },
      {
        id: 'margin-discipline',
        when: { metric: 'avgEbitdaMargin', op: '>=', value: 0.18 },
        actions: [{ type: 'applyFevMultiplier', value: 1.4 }],
        narrative: { title: 'Margin Discipline', detail: 'Maintained 18%+ EBITDA margins across the portfolio — refused to dilute quality for size.' },
      },
      {
        id: 'avoided-scale-trap',
        when: { all: [
          { metric: 'round', op: '>=', value: 8 },
          { metric: 'largestPlatformEbitda', op: '<=', value: 6_000 },
          { metric: 'totalDistributions', op: '>=', value: 4_000 },
        ]},
        actions: [{ type: 'applyFevMultiplier', value: 1.3 }],
        narrative: { title: 'Avoided the Scale Trap', detail: 'Kept platforms under $6M EBITDA, harvested $4M+ in distributions. Margin > size.' },
      },
    ],
    maxAcquisitionsPerRound: 2,
    startingMaSourcingTier: 0,
    // Disable platform forge — the whole lesson is staying small.
    disabledFeatures: { platformForge: true },
  };
}

// ── 4. Ski Mountain Empire ────────────────────────────────────────────────
// Source: penewsletter.com Rolling Up Ski Mountains (Alterra/Vail duopoly,
// $3B continuation fund, Aspenware as moat). Teaches long-hold consolidation.

function skiMountainEmpire(startDate: string, endDate: string): ScenarioChallengeConfig {
  return {
    id: 'ski-mountain-empire',
    name: 'Ski Mountain Empire',
    tagline: '20 years to consolidate a duopoly. Hold long. Compound hard.',
    description: 'There has not been a new ski resort in the United States since 2004. Supply is fixed; demand grows with population. Two duopolists (Alterra and Vail) control most premium mountain inches. You have 20 years and limited deals to assemble your own continental empire. The critical innovation is the season-pass model: convert volatile lift-ticket sales into predictable recurring revenue. The other lever is the continuation vehicle — at year 15+, your platform should be worth more than the sum of its acquisitions.',
    configVersion: 1,
    theme: { emoji: '🎿', color: '#1E40AF' },
    startDate, endDate,
    isActive: false,
    isFeatured: false,
    seed: 20040401,
    difficulty: 'normal',
    duration: 'standard',
    maxRounds: 20,
    startingCash: 25_000,
    startingDebt: 8_000,
    founderShares: 8_500,
    sharesOutstanding: 10_000,
    rankingMetric: 'fev',
    allowedSectors: ['consumer', 'mediaEntertainment'],
    startingBusinesses: [{
      name: 'Pinecrest Mountain Resort',
      sectorId: 'consumer',
      ebitda: 4_500,
      multiple: 7.0,
      quality: 4,
      status: 'active',
      backstory: 'Mid-tier Western resort. 800k skier days, strong local brand, runway to expand uphill capacity. The selling family wanted out before the next generation refused to run it.',
    }],
    // Curated trophy deals at specific rounds — supply is intentionally scarce.
    curatedDeals: {
      5: [{
        name: 'Aspen Crest Resort',
        sectorId: 'consumer',
        ebitda: 9_000,
        multiple: 9.5,
        quality: 5,
        backstory: 'Trophy resort with $9M EBITDA and a brand that commands premium pricing. Comes with adjacent Aspenware-style booking-software acquisition that gives you data on every competing resort.',
      }],
      12: [{
        name: 'Northern Cascade Group',
        sectorId: 'consumer',
        ebitda: 12_000,
        multiple: 8.5,
        quality: 4,
        status: 'active',
        backstory: 'Three-mountain operating group going to market because the founding family wants liquidity. Rare opportunity to add 3M skier days in a single transaction.',
      }],
    },
    triggers: [
      {
        id: 'season-pass-empire',
        when: { metric: 'totalDistributions', op: '>=', value: 10_000 },
        actions: [{ type: 'applyFevMultiplier', value: 1.3 }],
        narrative: { title: 'Season Pass Empire', detail: 'Generated $10M+ in distributions — your Ikon-style pass program is throwing off real cash.' },
      },
      {
        id: 'resort-consolidator',
        when: { all: [
          { metric: 'integratedPlatformCount', op: '>=', value: 2 },
          { metric: 'largestPlatformEbitda', op: '>=', value: 25_000 },
        ]},
        actions: [{ type: 'applyFevMultiplier', value: 1.6 }],
        narrative: { title: 'Continental Consolidator', detail: '2+ integrated platforms with $25M+ EBITDA on the largest. You are now a duopoly contender.' },
      },
      {
        id: 'continuation-vehicle',
        when: { all: [
          { metric: 'round', op: '>=', value: 15 },
          { metric: 'peakNetWorth', op: '>=', value: 200_000 },
        ]},
        actions: [{ type: 'applyFevMultiplier', value: 1.4 }],
        narrative: { title: 'Continuation Vehicle', detail: 'Held into year 15+ with $200M+ peak net worth — the continuation fund pays off.' },
      },
    ],
    maxAcquisitionsPerRound: 1, // supply is scarce in this industry
    startingMaSourcingTier: 0,
  };
}

// ── 5. Trophy Asset Hunt ──────────────────────────────────────────────────
// Source: penewsletter.com Sports Teams (Chelsea FC $2.5B forced sale,
// league rule changes). Teaches scarcity + capital discipline.

function trophyAssetHunt(startDate: string, endDate: string): ScenarioChallengeConfig {
  return {
    id: 'trophy-asset-hunt',
    name: 'Trophy Asset Hunt',
    tagline: 'You have $50M in dry powder. Three trophy assets will appear over 15 years.',
    description: 'No starting portfolio — just $50M committed and conviction. Premium scarce assets (sports franchises, aerospace primes, marquee media properties) come to market only when forced: regulatory changes, sanctioned-owner sales, generational founder exits. Your job is to wait, evaluate, and pounce when the right one appears. The competition will overpay; your edge is patience plus operational vision.',
    configVersion: 1,
    theme: { emoji: '🏆', color: '#CA8A04' },
    startDate, endDate,
    isActive: false,
    isFeatured: false,
    seed: 19920401,
    difficulty: 'normal',
    duration: 'standard',
    maxRounds: 15,
    startingCash: 50_000,
    startingDebt: 0,
    founderShares: 9_500,
    sharesOutstanding: 10_000,
    rankingMetric: 'fev',
    allowedSectors: ['mediaEntertainment', 'aerospace', 'consumer'],
    startingBusinesses: [], // capital-only start
    // Curated trophy deals — scarce, premium-priced, exceptional quality.
    curatedDeals: {
      3: [{
        name: 'Westbridge Aerospace Components',
        sectorId: 'aerospace',
        ebitda: 6_500,
        multiple: 9.0,
        quality: 5,
        backstory: 'Defense aerospace supplier with locked-in 15-year prime contracts. Owner forced to divest after a regulatory ruling on cross-ownership.',
      }],
      7: [{
        name: 'Halcyon Studios',
        sectorId: 'mediaEntertainment',
        ebitda: 10_000,
        multiple: 11.0,
        quality: 5,
        backstory: 'Boutique production studio with three franchise IP libraries. Founding mogul retires; family wants liquidity over control.',
      }],
      11: [{
        name: 'Lakeshore Athletic Club',
        sectorId: 'consumer',
        ebitda: 15_000,
        multiple: 13.0,
        quality: 5,
        backstory: 'Professional sports franchise put on the market under league sanctions. Generational entry point — but the bidding will be fierce.',
      }],
    },
    triggers: [
      {
        id: 'trophy-hunter',
        when: { all: [
          { metric: 'successfulExits', op: '>=', value: 1 },
          { metric: 'successfulExitValue', op: '>=', value: 100_000 },
        ]},
        actions: [{ type: 'applyFevMultiplier', value: 1.5 }],
        narrative: { title: 'Trophy Hunter', detail: 'Realized $100M+ on a successful exit. Patient capital met scarce opportunity.' },
      },
      {
        id: 'patient-capital',
        when: { all: [
          { metric: 'round', op: '>=', value: 12 },
          { metric: 'peakNetWorth', op: '>=', value: 300_000 },
        ]},
        actions: [{ type: 'applyFevMultiplier', value: 1.4 }],
        narrative: { title: 'Patient Capital', detail: '$300M+ peak net worth held past year 12 — proof that conviction compounds.' },
      },
      {
        id: 'generational-asset',
        when: { metric: 'largestPlatformEbitda', op: '>=', value: 25_000 },
        actions: [{ type: 'applyFevMultiplier', value: 1.6 }],
        narrative: { title: 'Generational Asset', detail: 'Built or acquired a $25M+ EBITDA crown-jewel platform. Brand and scarcity command premium multiples.' },
      },
    ],
    maxAcquisitionsPerRound: 1,
    startingMaSourcingTier: 0,
    // Disable equity raise — pure conviction play; you have what you need.
    disabledFeatures: { equityRaise: true },
  };
}
