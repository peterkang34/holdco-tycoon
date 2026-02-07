// Educational tips mapped to book chapters and game situations

export interface Tip {
  id: string;
  content: string;
  bookReference?: string;
  trigger?: string; // What game situation triggers this tip
}

export const METRIC_TOOLTIPS: Record<string, { definition: string; formula: string; benchmark: string; chapter?: string }> = {
  // Keys match label.toLowerCase().replace(/[\/\s]/g, '') from MetricCard
  cash: {
    definition: 'Available capital at the holdco level for deployment or reserves.',
    formula: 'Previous cash + FCF collected - allocations made',
    benchmark: 'Keep >$2M as a safety buffer for opportunities and emergencies',
    chapter: 'Ch. VII',
  },
  totalebitda: {
    definition: 'Total annual earnings before interest, taxes, depreciation, and amortization across all opcos.',
    formula: 'Sum of all opco annual EBITDA',
    benchmark: 'Growing EBITDA indicates a healthy, expanding portfolio',
  },
  'fcfshare': {
    definition: 'Free cash flow generated per share. Increases when: 1) Portfolio EBITDA grows, 2) You pay down debt (less interest), 3) You buyback shares. Decreases when: you issue equity (dilution).',
    formula: '(Total FCF - Interest Expense) ÷ Shares Outstanding',
    benchmark: 'The key metric for holdco success. Berkshire focuses on growing FCF/share, not just total earnings.',
    chapter: 'Ch. VI',
  },
  portfolioroic: {
    definition: 'Return on Invested Capital measures how efficiently the holdco turns invested capital into profits.',
    formula: 'NOPAT / Total Invested Capital',
    benchmark: '>15% is good, >20% is excellent. Constellation Software averages 20%+.',
    chapter: 'Ch. IV',
  },
  roiic: {
    definition: 'Return on Incremental Invested Capital measures how well NEW capital is being deployed.',
    formula: 'Change in NOPAT / Change in Invested Capital',
    benchmark: '>20% signals effective deployment. If ROIIC > ROIC, value is compounding faster.',
    chapter: 'Ch. IV',
  },
  moic: {
    definition: 'Multiple on Invested Capital measures total value created from all investments.',
    formula: '(Cash Distributed + Portfolio Value + Exit Proceeds) / Total Paid',
    benchmark: '>2.0x is good, >3.0x is excellent. High MOIC comes from buying well and operating better.',
    chapter: 'Ch. IV',
  },
  leverage: {
    definition: 'Leverage ratio showing how many years of EBITDA it would take to pay off net debt.',
    formula: '(Total Debt - Cash) / Annual EBITDA',
    benchmark: '<2.5x is healthy, >3.5x is risky. Tyco collapsed at high leverage.',
    chapter: 'Ch. IX',
  },
  'cashconv.': {
    definition: 'How much of EBITDA actually converts to free cash flow. The BS detector that reveals whether earnings are real.',
    formula: 'Total FCF / Total EBITDA',
    benchmark: '>80% is excellent. Low conversion signals high capex or working capital needs.',
    chapter: 'Ch. IV',
  },
  interestrate: {
    definition: 'The current annual interest rate on holdco debt.',
    formula: 'Base rate adjusted by market events',
    benchmark: '<8% is favorable, >10% makes debt expensive',
    chapter: 'Ch. VII',
  },
  sharesoutstanding: {
    definition: 'Total number of ownership shares. Issuing shares dilutes existing owners.',
    formula: 'Starting shares + issued shares - repurchased shares',
    benchmark: 'Berkshire has never issued shares for acquisitions. Dilution is a cardinal sin.',
    chapter: 'Ch. VII',
  },
};

export const SITUATION_TIPS: Record<string, Tip> = {
  over_leverage: {
    id: 'over_leverage',
    content: 'Tyco collapsed when debt outran cash. The best holdcos push debt to the opco level and avoid parent guarantees.',
    bookReference: 'Ch. IX',
    trigger: 'net_debt_to_ebitda > 3.5',
  },
  recession_strong_balance: {
    id: 'recession_strong_balance',
    content: 'Berkshire thrives in recessions because Buffett keeps powder dry. Cash is your competitive advantage when others are desperate.',
    bookReference: 'Ch. VI',
    trigger: 'recession_event && cash > 300',
  },
  talent_loss: {
    id: 'talent_loss',
    content: "Thrasio's cultural failure led to mass exodus. Retention is cheaper than replacement.",
    bookReference: 'Ch. IX',
    trigger: 'talent_leaves_event',
  },
  high_roiic: {
    id: 'high_roiic',
    content: 'You deployed capital like Constellation Software — disciplined, patient, and focused on returns over growth.',
    bookReference: 'Ch. VI',
    trigger: 'roiic > 0.20',
  },
  overpaid_acquisition: {
    id: 'overpaid_acquisition',
    content: 'Valeant paid premium prices expecting synergies that never materialized. Price discipline is everything.',
    bookReference: 'Ch. IX',
    trigger: 'acquisition_multiple > sector_max',
  },
  strong_cash_conversion: {
    id: 'strong_cash_conversion',
    content: 'Your portfolio converts earnings to cash reliably. Cash conversion is the BS detector that reveals whether earnings are real.',
    bookReference: 'Ch. IV',
    trigger: 'cash_conversion > 0.80',
  },
  hoarding_cash: {
    id: 'hoarding_cash',
    content: "Buffett says cash is a terrible long-term holding, but a great short-term opportunity fund. Don't hoard forever.",
    bookReference: 'Ch. VI',
    trigger: 'cash > 10000 && no_acquisitions_3_rounds',
  },
  good_reinvestment: {
    id: 'good_reinvestment',
    content: "Danaher's DBS proves that operational improvement is a form of reinvestment. Even organic growth needs fuel.",
    bookReference: 'Ch. III',
    trigger: 'reinvestment_success',
  },
  interest_rate_risk: {
    id: 'interest_rate_risk',
    content: "TransDigm uses debt strategically but always ensures cash flows can cover interest even in a downturn.",
    bookReference: 'Ch. VII',
    trigger: 'interest_hike && high_debt',
  },
  diversification_payoff: {
    id: 'diversification_payoff',
    content: 'Ring-fencing risk across multiple businesses prevents one failure from sinking the ship.',
    bookReference: 'Ch. VII',
    trigger: 'negative_event && minimal_impact',
  },
  smart_exit: {
    id: 'smart_exit',
    content: 'Capital recycling — buying low, improving, selling high — is how allocators think about the full lifecycle.',
    bookReference: 'Ch. IV',
    trigger: 'exit_moic > 2.0',
  },
  equity_dilution: {
    id: 'equity_dilution',
    content: 'Berkshire has never issued shares for acquisitions. Every share you issue must earn its keep through higher FCF/share.',
    bookReference: 'Ch. VII',
    trigger: 'equity_issued',
  },
  distribution_hierarchy: {
    id: 'distribution_hierarchy',
    content: 'Codify a distribution hierarchy: 1) Reinvest above hurdle rate, 2) Deleverage, 3) Repurchase when cheap, 4) Distribute the residual.',
    bookReference: 'Ch. VII',
    trigger: 'distribution_made',
  },
};

export const SHARED_SERVICE_TIPS: Record<string, string> = {
  finance_reporting: "Danaher's DBS is its most valuable intangible asset — a system so powerful it survives leadership transitions. You're building your version.",
  recruiting_hr: 'Constellation Software ties bonuses to ROIC. Great talent stays when incentives align.',
  procurement: 'ITW\'s 80/20 rule: Focus on the 20% of products and customers that drive 80% of profit. Procurement leverage follows.',
  marketing_brand: 'Stagwell combined agencies to create shared marketing infrastructure. Scale brings efficiency.',
  technology_systems: 'The Danaher Business System turns operational excellence into compounding returns. Systems beat heroics.',
};

export const POST_GAME_INSIGHTS: Record<string, { pattern: string; insight: string; bookReference?: string }> = {
  never_acquired: {
    pattern: 'Never acquired anything',
    insight: "Cash is optionality, but perpetual hoarding means your capital isn't compounding. Berkshire deploys when the price is right.",
    bookReference: 'Ch. VI',
  },
  over_leveraged: {
    pattern: 'Over-leveraged (>3x)',
    insight: 'Tyco collapsed when debt outran cash. The best holdcos push debt to the opco level and avoid parent guarantees.',
    bookReference: 'Ch. IX',
  },
  single_sector: {
    pattern: 'Single-sector portfolio',
    insight: 'Concentration builds expertise but inherits cyclicality. You earned strong sector focus bonuses — but remember, diversification protects against sector-specific shocks.',
    bookReference: 'Ch. III',
  },
  high_roiic_moic: {
    pattern: 'High ROIIC + high MOIC',
    insight: 'You deployed capital like Constellation Software — disciplined, patient, and focused on returns over growth.',
    bookReference: 'Ch. VI',
  },
  ignored_reinvestment: {
    pattern: 'Ignored reinvestment',
    insight: "Danaher's DBS proves that operational improvement is a form of reinvestment. Even organic growth needs fuel.",
    bookReference: 'Ch. III',
  },
  strong_conversion: {
    pattern: 'Strong cash conversion',
    insight: 'Your portfolio converts earnings to cash reliably. Cash conversion is the BS detector that reveals whether earnings are real.',
    bookReference: 'Ch. IV',
  },
  distributed_early: {
    pattern: 'Distributed while ROIIC was high',
    insight: "Markel Group explicitly prioritizes reinvestment over dividends. You left compounding on the table.",
    bookReference: 'Ch. VII',
  },
  smart_exits: {
    pattern: 'Smart exits (sold at >2x MOIC)',
    insight: 'You recycled capital effectively — buying at low multiples, improving operations, and exiting at higher multiples.',
    bookReference: 'Ch. IV',
  },
  held_losers: {
    pattern: 'Held losers too long',
    insight: "The best holdcos cut losses when the economics no longer justify the capital. A wind-down isn't failure — it's discipline.",
    bookReference: 'Ch. IX',
  },
  good_shared_services: {
    pattern: 'Good shared services ROI',
    insight: "You built an operating system, not just a portfolio. Danaher's DBS is its most valuable intangible asset — yours might be too.",
    bookReference: 'Ch. III',
  },
  equity_well_deployed: {
    pattern: 'Equity raised and well deployed',
    insight: 'You raised capital wisely and deployed it at high returns — the dilution was worth it.',
    bookReference: 'Ch. VII',
  },
  equity_poorly_deployed: {
    pattern: 'Equity raised with poor returns',
    insight: 'Dilution without deployment is destruction. Every share you issue must earn its keep through higher FCF/share growth.',
    bookReference: 'Ch. VII',
  },
  well_timed_buybacks: {
    pattern: 'Well-timed buybacks',
    insight: "Buybacks when your capital has nowhere better to go is exactly right. You followed the distribution hierarchy.",
    bookReference: 'Ch. VII',
  },
};
