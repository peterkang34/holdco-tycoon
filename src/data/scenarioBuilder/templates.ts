/**
 * Starter templates for the scenario builder. Each is a fully-valid ScenarioDraft an admin
 * clones and tweaks — the fastest path to a good scenario, and a demonstration that a great
 * challenge needs a handful of well-chosen vectors + a two-sentence hook, not fifty knobs.
 *
 * Each template compiles to a validator-clean config (asserted in templates.test.ts). They are
 * starting points loaded into the builder, NOT seeded to KV — the admin saves them as new
 * scenarios (with their own id/dates) from the builder.
 */
import { FUND_STRUCTURE_PRESETS } from '../scenarioChallenges';
import { type ScenarioDraft, blankDraft } from './draftModel';

export interface ScenarioTemplate {
  id: string;
  label: string;
  emoji: string;
  blurb: string;
  build: (now?: Date) => ScenarioDraft;
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'search-fund',
    label: 'The Search Fund',
    emoji: '🔍',
    blurb: 'Buy one business with an SBA loan and a little equity, then grow your way to the next.',
    build: (now) => ({
      ...blankDraft(now),
      id: 'the-search-fund',
      name: 'The Search Fund',
      tagline: 'One business, one loan. Earn your way up.',
      description: 'You bought a single business with leverage and outside investors. Service the debt, grow the business, and compound toward a second acquisition.',
      themeEmoji: '🔍', themeColor: '#4ECDC4',
      difficulty: 'normal', duration: 'quick', maxRounds: 10,
      startingCash: 1000, startingDebt: 2000, founderShares: 800, // 80% ownership (SBA + investors)
      startingInterestRate: 0.08,
      startingBusinesses: [{ name: 'Acquired SMB', sectorId: 'homeServices', ebitda: 1200, multiple: 3.5, quality: 3 }],
      rankingMetric: 'fev',
    }),
  },
  {
    id: 'pe-fund',
    label: 'The PE Fund (LP Clock)',
    emoji: '🏦',
    blurb: 'Commit LP capital, generate returns against a hard 10-year clock, earn your carry.',
    build: (now) => ({
      ...blankDraft(now),
      id: 'the-pe-fund',
      name: 'The PE Fund (LP Clock)',
      tagline: 'Beat the hurdle before the fund clock runs out.',
      description: 'You run a $100M fund: 2% fee, 8% hurdle, 20% carry, forced liquidation in year 10. Deploy capital, create value, and return multiples to your LPs — then watch the clock force exits you might rather hold.',
      themeEmoji: '🏦', themeColor: '#F4D03F',
      difficulty: 'normal', duration: 'quick', maxRounds: 10,
      startingCash: 0, startingDebt: 0, founderShares: 1000, // 100% — PE GP
      startingBusinesses: [],
      fundStructure: { ...FUND_STRUCTURE_PRESETS.traditional_pe },
      rankingMetric: 'moic',
    }),
  },
  {
    id: 'high-rate',
    label: 'High-Rate Environment',
    emoji: '📈',
    blurb: 'Money is expensive (11%). Financial engineering dies; cash economics win.',
    build: (now) => ({
      ...blankDraft(now),
      id: 'high-rate-environment',
      name: 'High-Rate Environment',
      tagline: '1981 / 2023: the squeeze. Can you compound through it?',
      description: 'Rates are in double digits. Cheap leverage is gone — every levered deal is a coffin and free-cash-flow discipline is everything. Build durable value when borrowing hurts.',
      themeEmoji: '📈', themeColor: '#E07A5F',
      difficulty: 'normal', duration: 'quick', maxRounds: 10,
      startingCash: 4000, startingDebt: 1000, founderShares: 1000,
      startingInterestRate: 0.11,
      startingBusinesses: [{ name: 'Founding Business', sectorId: 'b2bServices', ebitda: 900, multiple: 4, quality: 3 }],
      rankingMetric: 'fev',
    }),
  },
  {
    id: 'permanent-capital',
    label: 'Permanent-Capital Compounder',
    emoji: '🏛️',
    blurb: 'Buy great businesses, never sell, reinvest forever. The Constellation/Berkshire fantasy.',
    build: (now) => ({
      ...blankDraft(now),
      id: 'permanent-capital-compounder',
      name: 'Permanent-Capital Compounder',
      tagline: 'Quality + time. Never sell. Compound for 20 years.',
      description: 'A 20-year run in capital-light, low-volatility sectors. Exits and IPO are off the table — the only path to a high score is buying quality and letting it compound. Patience is the strategy.',
      themeEmoji: '🏛️', themeColor: '#44B09E',
      difficulty: 'normal', duration: 'standard', maxRounds: 20,
      startingCash: 5000, startingDebt: 0, founderShares: 1000,
      allowedSectors: ['saas', 'insurance', 'wealthManagement', 'healthcare'],
      disabledFeatures: { sellBusiness: true, ipo: true },
      startingBusinesses: [{ name: 'Crown-Jewel SaaS', sectorId: 'saas', ebitda: 1500, multiple: 5, quality: 4 }],
      rankingMetric: 'fev',
    }),
  },
];
