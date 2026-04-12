/**
 * Centralized registry for mechanic descriptions displayed in UI.
 * Single source of truth — components import from here, never hardcode.
 *
 * Style rules:
 *  - Year abbreviation: "yr" (not "y", not "rem")
 *  - Countdown word: "left" (not "rem")
 *  - Behavior verb: "auto-pays" (plain English, no jargon)
 */

export const DEBT_LABELS = {
  holdco: {
    name: 'Holdco Loan',
    behavior: 'Auto-pays equal annual installments (balance ÷ remaining years) + manual prepay',
    summaryShort: 'Auto-paying',
  },
  sellerNote: {
    name: 'Seller Note',
    behavior: 'Auto-pays equal annual installments (balance ÷ remaining years)',
    summaryShort: 'Auto-paying',
  },
  bankDebt: {
    name: 'Bank Debt',
    behavior: 'Auto-pays equal annual installments (balance ÷ remaining years) + voluntary prepay',
    summaryShort: 'Auto-paying',
  },
} as const;

export const EV_WATERFALL_LABELS = {
  bankDebt: 'Bank Debt (Holdco + Opco)',
  sellerNotes: 'Opco Seller Notes',
} as const;

export const SHARE_FUNDED_LABELS = {
  name: 'Share-Funded (Stock)',
  behavior: 'Issue new shares to fund acquisition — no cash, but dilutes ownership naturally',
  limit: 'Unlimited per round',
} as const;

export const DEBT_EXPLAINER =
  'All debt (holdco loan, seller notes, and bank debt) auto-pays equal annual installments: each year you pay (remaining balance ÷ years left) in principal, plus interest on the current balance. ' +
  'Holdco and bank debt can also be paid down early in the Capital tab. ' +
  'If cash is short, interest is paid first and the loan extends until fully repaid.';

export function debtCountdownLabel(yearsLeft: number): string {
  if (yearsLeft <= 0) return 'overdue';
  return `${yearsLeft}yr left`;
}

export function earnoutTargetLabel(targetPct: number): string {
  return `if ${Math.round(targetPct * 100)}%+ growth`;
}

export function earnoutCountdownLabel(yearsLeft: number): string {
  if (yearsLeft <= 0) return 'overdue';
  return `${yearsLeft}yr left`;
}

export const SMB_BROKER_LABELS = {
  name: 'Small Business Broker',
  behavior: '$75K for 1 micro-tier deal from a Main Street broker. Available from round 1. Disabled when M&A Sourcing Tier 1 is active.',
} as const;

export const MOAT_TIER_LABELS = {
  Narrow: { color: 'text-red-400', bg: 'bg-red-500/20', tip: 'Narrow moat — low de-risking premium. Improve quality signals to strengthen.' },
  Moderate: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', tip: 'Moderate moat — growing competitive advantages. Keep building quality signals.' },
  Wide: { color: 'text-blue-400', bg: 'bg-blue-500/20', tip: 'Wide moat — strong de-risking premium. Buyers pay up for defensibility.' },
  Fortress: { color: 'text-accent', bg: 'bg-accent/20', tip: 'Fortress moat — maximum de-risking premium. This business is a buyer magnet.' },
} as const;

export const MARKET_CYCLE_LABELS = {
  Expansion: { color: 'text-accent', bg: 'bg-accent/20', tip: 'Strong tailwinds — favorable for acquisitions and exits. Capital is abundant.' },
  Growth: { color: 'text-blue-400', bg: 'bg-blue-500/20', tip: 'Positive momentum — good conditions for disciplined capital deployment.' },
  Stable: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', tip: 'Neutral conditions — focus on operations and value creation over deal-making.' },
  Contraction: { color: 'text-orange-400', bg: 'bg-orange-500/20', tip: 'Headwinds building — conserve cash and stress-test your portfolio.' },
  Crisis: { color: 'text-red-400', bg: 'bg-red-500/20', tip: 'Severe downturn — protect cash flow and avoid overleveraging. Opportunities for contrarian buyers.' },
} as const;

export type MarketCyclePhase = keyof typeof MARKET_CYCLE_LABELS;

export const COMPLEXITY_COST_LABELS = {
  name: 'Portfolio Complexity',
  behavior: 'Cash deduction when portfolio exceeds complexity threshold without sufficient shared services to offset.',
  tip: 'As your portfolio grows past the complexity threshold, coordination costs mount. Each active shared service offsets ~33% of the cost. Maximum compression: 4ppt of total revenue.',
} as const;

// ── Founder Equity Value (FEV) ──

export const FEV_LABELS = {
  fullName: 'Founder Equity Value',
  abbreviation: 'FEV',
  definition:
    'Founder Equity Value (FEV) is the dollar value of YOUR personal stake in the holdco. ' +
    'It represents what you would receive if the company were sold today.',
  formula: 'FEV = Enterprise Value × Your Ownership %',
  formulaDetail:
    'Enterprise Value = (Portfolio EBITDA × Blended Exit Multiple) + Cash − All Debt − Rollover Claims',
  whyItMatters:
    'FEV is the primary ranking metric because it captures both value creation AND capital structure decisions. ' +
    'Growing EV is not enough — diluting your ownership through excessive equity raises reduces FEV. ' +
    'The best operators grow EV while protecting or increasing their ownership stake.',
  adjustedExplainer:
    'Adjusted FEV applies modifiers for fair cross-mode comparison: ' +
    'difficulty multiplier (Hard 1.35×, Easy 0.90×), restructuring penalty (−20%), ' +
    'and Family Office bonus (up to 1.5×).',
  scoreLabel: 'Value Creation (FEV / Capital)',
  scoreExplainer:
    'Measures how many times you multiplied your initial capital raise into FEV. ' +
    'Target: 10× for a 20-year game, 5× for a 10-year game.',
} as const;

// ── PE Fund Manager Mode ──

export const PE_FUND_LABELS = {
  managementFee: {
    name: 'Management Fee',
    behavior: '2% of committed capital ($2M/year) — deducted annually from fund cash. Tax-deductible.',
    summaryShort: 'Annual fee',
  },
  lpDistribution: {
    name: 'LP Distribution',
    behavior: 'Permanently return cash to LPs. Improves DPI and Net IRR but reduces dry powder.',
    summaryShort: 'Return capital',
  },
  carryWaterfall: {
    name: 'Carried Interest',
    behavior: '20% of profits above the 8% annual hurdle ($216M over 10 years). European waterfall — calculated at fund close.',
    summaryShort: 'GP carry',
  },
  lpacGate: {
    name: 'LPAC Approval',
    behavior: 'Required when cumulative deal value in a single platform exceeds 25% of committed capital ($25M). Approval probability scales with LP satisfaction.',
    summaryShort: 'LP approval',
  },
  hurdleRate: {
    name: 'Hurdle Rate',
    behavior: 'LPs earn 8% per year before carry. Over 10 years: $100M × 1.08^10 ≈ $216M.',
    summaryShort: '8% annual',
  },
} as const;

// ── Private Credit & Lending Synergy ──

export const LENDING_SYNERGY_LABELS = {
  name: 'Private Credit Synergy',
  behavior: 'Owning Private Credit businesses reduces bank debt rates on all new deals. Diminishing returns: -0.75% for the 1st, -0.50% for the 2nd, -0.25% for each additional. Cap: -1.50%. Floor rate: 3%. Halved during credit tightening.',
  summaryShort: 'Bank debt discount',
} as const;

// ── Turnaround System ──

export const TURNAROUND_LABELS = {
  stabilizationPhase: {
    name: 'Stabilization Phase',
    behavior: 'Q1/Q2 businesses are in stabilization — only stabilization improvements (Fix Underperformance, Management Professionalization, Operating Playbook) are available. Growth improvements require Q3+ quality via a turnaround program.',
  },
  growthGate: {
    name: 'Growth Improvement Gate',
    behavior: 'Growth improvements (Service Expansion, Digital Transformation, Recurring Revenue Conversion, Pricing Model) are locked until the business reaches Q3+ quality through a turnaround program.',
  },
  ceilingMastery: {
    name: 'Ceiling Mastery Bonus',
    behavior: 'Businesses that reach their sector quality ceiling via turnaround earn a one-time bonus: +2ppt margin, +1% growth, and 110% improvement efficacy.',
  },
  failureDamage: {
    name: 'Turnaround Failure',
    behavior: 'Failed turnarounds cause EBITDA damage: T1 -8%, T2 -12%, T3 -15%. Higher stakes reward investing in stabilization improvements to reduce failure risk.',
  },
  exitPremium: {
    name: 'Turnaround Exit Premium',
    behavior: '+0.15x exit multiple per quality tier improved via turnaround. Only tracks turnaround-sourced quality changes — ops improvements do not count.',
  },
  platformQualityGate: {
    name: 'Platform Quality Gate',
    behavior: 'Only Q3+ businesses can be forged into integrated platforms. Stabilize businesses via turnaround before platform integration.',
  },
} as const;

export const PORTFOLIO_SYNERGY_LABELS = {
  routeDensity: {
    name: 'Route Density',
    behavior: 'Distribution businesses with adjacent sub-types share routes and warehouses',
    bonuses: '+2% margin, -15% capex for qualifying distribution businesses',
    requirement: '2+ distribution businesses with adjacent sub-types (same group)',
  },
  subTypeSpec: {
    name: 'Sub-Type Specialization',
    behavior: 'Owning multiple businesses of the same sub-type builds operational expertise',
    baseBonuses: '+0.75% margin, +4% integration success',
    enhancedBonuses: '+1.5% margin, +1% growth, +8% integration success',
    requirement: '3+ same sub-type (base), 2+ same sub-type with Sector Specialist (enhanced)',
  },
  crossSaasServices: {
    name: 'Vertical SaaS + Services Platform',
    behavior: 'SaaS product embedded in a services workflow — technology makes services stickier',
    bonuses: '+5% margin, +3% growth, +2.0x exit multiple',
    requirement: '1 SaaS + 2 same-vertical services businesses, $10M+ sector EBITDA',
    unlock: 'Vertical Integrator achievement or 14 total achievements',
  },
} as const;

export const BANNED_COPY_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  reason: string;
  allow?: readonly string[];
}> = [
  { pattern: /paid on exit/i, reason: 'All debt auto-pays. Legacy bug.' },
  { pattern: /paid on sale/i, reason: 'All debt auto-pays. Legacy bug.' },
  { pattern: /paid at exit/i, reason: 'All debt auto-pays. Legacy bug.' },
  { pattern: /10%\/yr/i, reason: 'Holdco is balance÷remaining, not fixed 10%.' },
  { pattern: /10% of the balance/i, reason: 'Same — straight-line, not fixed 10%.' },
  { pattern: /interest.only/i, reason: 'Removed in v19. All debt amortizes.', allow: ['changelog.ts'] },
  { pattern: /balloon payment/i, reason: 'No balloon payments in the game.' },
  { pattern: /paid down voluntarily/i, reason: 'Changed to "paid down early" in v20. More concise.' },
  { pattern: /recurring.*bonus.*platform|platform.*recurring.*bonus/i, reason: 'Platform bonuses are ONE-TIME mutations at forge time.' },
  { pattern: /grace period/i, reason: 'Grace period not implemented in engine. Holdco amortizes from round 1.' },
  { pattern: /growth permanently reduced/i, reason: 'Integration growth drag is now proportional and decaying, not permanent. Changed in v26.' },
  { pattern: /Small \(\$500k-\$1\.5M\)/i, reason: 'Old 3-tier deal size system removed in v28. Now 7-tier affordability system.', allow: ['changelog.ts'] },
  { pattern: /Medium \(\$1\.5M-\$3M\)/i, reason: 'Old 3-tier deal size system removed in v28. Now 7-tier affordability system.', allow: ['changelog.ts'] },
  { pattern: /Large \(\$3M\+\)/i, reason: 'Old 3-tier deal size system removed in v28. Now 7-tier affordability system.', allow: ['changelog.ts'] },
  { pattern: /-5% FEV penalty/i, reason: 'IPO dilution penalty removed in v29. Share-funded deals dilute ownership naturally.', allow: ['changelog.ts'] },
  { pattern: /dilution penalty/i, reason: 'IPO dilution penalty removed in v29. No extra penalty beyond natural ownership dilution.', allow: ['changelog.ts'] },
  { pattern: /stay.private bonus/i, reason: 'Stay-private bonus removed in v29. Replaced by public company bonus.', allow: ['changelog.ts'] },
  { pattern: /escalating dilution.*regardless|same.*discount.*public.*private/i, reason: 'Post-IPO equity raises issue at stock price (no discount). Only private companies use escalating discount.' },
  { pattern: /permanent ownership reduction/i, reason: 'Share dilution is reversible via buybacks. Removed "permanent" in v33.' },
  { pattern: /max 1 per round/i, reason: 'Share-funded deal cap removed. Unlimited per round now.', allow: ['changelog.ts'] },
  { pattern: /prior ownership doesn.t mechanically affect/i, reason: 'Ownership history now affects improvement efficacy. Changed in v35.' },
  { pattern: /flat.*\+0\.25x.*exit.*premium/i, reason: 'Turnaround exit premium is now +0.15x per tier (scaling), not flat +0.25x. Changed in v38.' },
  { pattern: /failure.*damage.*3.6%|3.6%.*failure.*damage/i, reason: 'Turnaround failure damage increased to 8-15% in v38.' },
  { pattern: /T2.*\$?450K|T3.*\$?700K/i, reason: 'Turnaround tier annual costs reduced: T2=$300K, T3=$500K. Changed in v38.', allow: ['changelog.ts'] },
  { pattern: /Focus deals last 3 rounds/i, reason: 'Changed to "Sourced deals last 3 rounds" — freshness bonus applies to M&A infrastructure sourced deals, not M&A focus deals.' },
  { pattern: /\+2 focus-sector deals per round/i, reason: 'Changed to "+2 sourced deals per round in focus sector" for clarity — these are M&A infrastructure bonus deals.' },
];
