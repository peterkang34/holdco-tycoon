export interface GradeTip {
  dimension: string;      // key from score breakdown
  label: string;          // display label
  max: number;            // max points for this dimension
  tipThreshold: number;   // show tip when score < this (70% of max)
  tip: string;            // encouraging tip with target numbers
}

// ── Holdco Mode Tips ──
// Dimensions: valueCreation (20), fcfShareGrowth (20), portfolioRoic (15),
// capitalDeployment (15), balanceSheetHealth (15), strategicDiscipline (15)

export const HOLDCO_GRADE_TIPS: GradeTip[] = [
  {
    dimension: 'valueCreation',
    label: 'Value Creation',
    max: 20,
    tipThreshold: 14,
    tip: 'Grow your FEV/capital ratio toward 5x (Quick) or 10x (Full Game). Compound through quality acquisitions and margin expansion rather than hoarding cash.',
  },
  {
    dimension: 'fcfShareGrowth',
    label: 'FCF/Share Growth',
    max: 20,
    tipThreshold: 14,
    tip: 'Push FCF per share growth toward 200% (Quick) or 400% (Full Game). Improve margins, grow EBITDA, and use buybacks strategically to boost per-share metrics.',
  },
  {
    dimension: 'portfolioRoic',
    label: 'Portfolio ROIC',
    max: 15,
    tipThreshold: 10.5,
    tip: 'Target 20%+ ROIC (Quick) or 25%+ (Full Game). Invest in operational improvements, avoid overpaying for acquisitions, and sell underperformers early.',
  },
  {
    dimension: 'capitalDeployment',
    label: 'Capital Deployment',
    max: 15,
    tipThreshold: 10.5,
    tip: 'Aim for 2.0x+ MOIC across your portfolio and 20%+ ROIIC. Focus on deals where you can create value through improvements, not just financial engineering.',
  },
  {
    dimension: 'balanceSheetHealth',
    label: 'Balance Sheet Health',
    max: 15,
    tipThreshold: 10.5,
    tip: 'Keep leverage in the 1.5–2.5x Net Debt/EBITDA sweet spot. Too conservative (< 1x) leaves points on the table. Avoid covenant breaches and restructuring.',
  },
  {
    dimension: 'strategicDiscipline',
    label: 'Strategic Discipline',
    max: 15,
    tipThreshold: 10.5,
    tip: 'Build sector focus for bonuses, activate shared services with 3+ businesses, distribute cash when reinvestment ROIC drops, and prioritize deal quality ratings.',
  },
];

// ── PE Fund Mode Tips ──
// Dimensions: returnGeneration (25), capitalEfficiency (20), valueCreation (15),
// deploymentDiscipline (15), riskManagement (15), lpSatisfaction (10)

export const PE_GRADE_TIPS: GradeTip[] = [
  {
    dimension: 'returnGeneration',
    label: 'Return Generation',
    max: 25,
    tipThreshold: 17.5,
    tip: 'Target 15%+ net IRR for top marks. Deploy capital early, grow EBITDA aggressively, and distribute to LPs before Year 10 to front-load cash flows.',
  },
  {
    dimension: 'capitalEfficiency',
    label: 'Capital Efficiency',
    max: 20,
    tipThreshold: 14,
    tip: 'Push gross MOIC toward 3.0x+. Buy at reasonable multiples, expand margins through operational improvements, and exit at higher multiples.',
  },
  {
    dimension: 'valueCreation',
    label: 'Value Creation',
    max: 15,
    tipThreshold: 10.5,
    tip: 'Grow weighted-average EBITDA 50–100%+ across portfolio companies. Invest in improvements, build platforms, and use shared services to drive margin expansion.',
  },
  {
    dimension: 'deploymentDiscipline',
    label: 'Deployment Discipline',
    max: 15,
    tipThreshold: 10.5,
    tip: 'Deploy 80%+ of committed capital by Year 5 for full pacing marks. Avoid new standalone acquisitions after Year 5 — shift focus to value creation and harvesting.',
  },
  {
    dimension: 'riskManagement',
    label: 'Risk Management',
    max: 15,
    tipThreshold: 10.5,
    tip: 'Keep portfolio leverage in the 1.5–3.0x range. Avoid covenant breaches (+3 bonus) and restructurings (+2 bonus). Moderate leverage outscores zero debt.',
  },
  {
    dimension: 'lpSatisfaction',
    label: 'LP Satisfaction',
    max: 10,
    tipThreshold: 7,
    tip: 'Keep LP satisfaction above 80 for full marks. Distribute early, avoid LPAC conflicts, and maintain consistent performance. Below 20 caps your grade at C.',
  },
];

// ── Grade Thresholds ──
// Holdco thresholds from scoring.ts calculateFinalScore

export interface GradeThreshold {
  grade: string;
  threshold: number;
  title: string;
}

export const HOLDCO_GRADE_THRESHOLDS: GradeThreshold[] = [
  { grade: 'S', threshold: 95, title: 'Master Allocator' },
  { grade: 'A', threshold: 82, title: 'Skilled Compounder' },
  { grade: 'B', threshold: 65, title: 'Solid Builder' },
  { grade: 'C', threshold: 45, title: 'Emerging Operator' },
  { grade: 'D', threshold: 25, title: 'Apprentice' },
  { grade: 'F', threshold: 0, title: 'Blown Up' },
];

// PE thresholds from gameConfig.ts PE_GRADE_THRESHOLDS + PE_GRADE_TITLES

export const PE_FUND_GRADE_THRESHOLDS: GradeThreshold[] = [
  { grade: 'S', threshold: 90, title: 'Legendary GP' },
  { grade: 'A', threshold: 75, title: 'Top Quartile' },
  { grade: 'B', threshold: 60, title: 'Solid Manager' },
  { grade: 'C', threshold: 40, title: 'Median Fund' },
  { grade: 'D', threshold: 20, title: 'Below Benchmark' },
  { grade: 'F', threshold: 0, title: 'Fund Implosion' },
];
