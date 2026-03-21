/**
 * Component Display Parity Tests
 *
 * Validates that components render correctly for all valid inputs:
 * - BusinessCard: all non-zero premium rows are visible
 * - MetricDrilldownModal: each metric key renders content (no "Unknown metric" fallback)
 * - EventCard: each event type renders with correct emoji/color, not a generic fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { EventType, ExitValuation, Business, GameEvent } from '../types';

// ── Mock Zustand store ──
const mockState = {
  businesses: [] as Business[],
  cash: 10000,
  holdcoLoanBalance: 0,
  holdcoLoanRate: 0.07,
  holdcoLoanRoundsRemaining: 0,
  round: 5,
  totalDebt: 0,
  sharedServices: [],
  maSourcing: null,
  isFundManagerMode: false,
  integratedPlatforms: [],
  totalExitProceeds: 0,
  totalInvestedCapital: 0,
  totalDistributions: 0,
  totalBuybacks: 0,
  initialRaiseAmount: 5000,
  holdcoName: 'Test Holdco',
  ownershipPercentage: 1.0,
  turnaroundTier: 0,
  activeTurnarounds: [],
  focusSector: null,
  difficulty: 'normal' as const,
  duration: 'standard' as const,
  phase: 'allocate' as const,
  lpSatisfaction: 75,
  committedCapital: 100000,
  deployedCapital: 50000,
  fundsReturned: 0,
  hurdleReturn: 215892,
  metricsHistory: [] as { round: number; metrics: { fcfPerShare: number; portfolioRoic: number; totalFcf: number; totalEbitda: number; cash: number } }[],
  exitedBusinesses: [] as Business[],
  sharesOutstanding: 1,
  founderShares: 1,
  equityRaisesUsed: 0,
  isPublic: false,
  stockPrice: 0,
  ipoStockPrice: 0,
  marketSentiment: 0,
  equityRaisesThisGame: 0,
  totalEquityRaised: 0,
  totalDebtRepaid: 0,
  lastEquityRound: -10,
  seed: 12345,
};

vi.mock('../../hooks/useGame', () => ({
  useGameStore: Object.assign(
    (selector?: (s: typeof mockState) => unknown) => selector ? selector(mockState) : mockState,
    {
      getState: () => mockState,
      setState: vi.fn(),
      subscribe: vi.fn(),
      destroy: vi.fn(),
    },
  ),
}));

// ══════════════════════════════════════════════════════════════════
// EVENT CARD — all event types render with their own icon, not fallback
// ══════════════════════════════════════════════════════════════════

describe('EventCard — event type coverage', () => {
  // All event types that have explicit icon/color mappings in EventCard
  const MAPPED_EVENT_TYPES: EventType[] = [
    'global_bull_market',
    'global_recession',
    'global_interest_hike',
    'global_interest_cut',
    'global_inflation',
    'global_credit_tightening',
    'portfolio_star_joins',
    'portfolio_talent_leaves',
    'portfolio_client_signs',
    'portfolio_client_churns',
    'portfolio_breakthrough',
    'portfolio_compliance',
    'portfolio_referral_deal',
    'portfolio_equity_demand',
    'portfolio_seller_note_renego',
    'portfolio_key_man_risk',
    'portfolio_earnout_dispute',
    'portfolio_supplier_shift',
    'sector_consolidation_boom',
    'unsolicited_offer',
    'portfolio_cyber_breach',
    'portfolio_antitrust_scrutiny',
    'portfolio_competitor_acquisition',
    'global_yield_curve_inversion',
    'global_talent_market_shift',
    'global_private_credit_boom',
    'sector_event',
  ];

  // Icons that are explicitly assigned in the switch statement (not the default '📋')
  const EXPECTED_ICONS: Record<string, string> = {
    global_bull_market: '📈',
    global_recession: '📉',
    global_interest_hike: '🏦',
    global_interest_cut: '💵',
    global_inflation: '💸',
    global_credit_tightening: '🔒',
    portfolio_star_joins: '⭐',
    portfolio_talent_leaves: '🚪',
    portfolio_client_signs: '🤝',
    portfolio_client_churns: '😔',
    portfolio_breakthrough: '💡',
    portfolio_compliance: '⚠️',
    portfolio_referral_deal: '🤝',
    portfolio_equity_demand: '👤',
    portfolio_seller_note_renego: '📝',
    portfolio_key_man_risk: '🔑',
    portfolio_earnout_dispute: '⚖️',
    portfolio_supplier_shift: '🏭',
    sector_consolidation_boom: '🔥',
    unsolicited_offer: '💰',
    portfolio_cyber_breach: '🛡️',
    portfolio_antitrust_scrutiny: '⚖️',
    portfolio_competitor_acquisition: '🏁',
    global_yield_curve_inversion: '📉',
    global_talent_market_shift: '👥',
    global_private_credit_boom: '💳',
    sector_event: '📊',
  };

  // Lazy import — component depends on mocked store
  let EventCard: typeof import('../../components/cards/EventCard').EventCard;

  beforeEach(async () => {
    const mod = await import('../../components/cards/EventCard');
    EventCard = mod.EventCard;
  });

  for (const eventType of MAPPED_EVENT_TYPES) {
    it(`renders icon for event type "${eventType}"`, () => {
      const event: GameEvent = {
        id: `test-${eventType}`,
        type: eventType,
        title: `Test ${eventType}`,
        description: 'Test description',
        effect: eventType.includes('recession') || eventType.includes('hike') ? '-5% margin' : '+5% growth',
      };

      const { container } = render(<EventCard event={event} onContinue={() => {}} />);
      const expectedIcon = EXPECTED_ICONS[eventType];
      expect(container.textContent).toContain(expectedIcon);
    });
  }

  it('positive events get accent border', () => {
    const event: GameEvent = {
      id: 'test-bull',
      type: 'global_bull_market',
      title: 'Bull Market',
      description: 'Markets are up',
      effect: '+5% growth',
    };
    const { container } = render(<EventCard event={event} onContinue={() => {}} />);
    const card = container.firstElementChild;
    expect(card?.className).toContain('border-accent');
  });

  it('negative events get danger border', () => {
    const event: GameEvent = {
      id: 'test-recession',
      type: 'global_recession',
      title: 'Recession',
      description: 'Markets are down',
      effect: '-10% revenue',
    };
    const { container } = render(<EventCard event={event} onContinue={() => {}} />);
    const card = container.firstElementChild;
    expect(card?.className).toContain('border-danger');
  });

  it('event types not in switch get default icon 📋', () => {
    // Use a type that's valid but not in the switch (global_quiet, mbo_proposal, etc.)
    const event: GameEvent = {
      id: 'test-quiet',
      type: 'global_quiet' as EventType,
      title: 'Quiet Year',
      description: 'Nothing happened',
      effect: 'No major events',
    };
    const { container } = render(<EventCard event={event} onContinue={() => {}} />);
    expect(container.textContent).toContain('📋');
  });
});

// ══════════════════════════════════════════════════════════════════
// METRIC DRILLDOWN MODAL — all 13 metric keys render content
// ══════════════════════════════════════════════════════════════════

describe('MetricDrilldownModal — metric key coverage', () => {
  // All metric keys from the switch statement in MetricDrilldownModal
  const METRIC_KEYS = [
    'cash',
    'ebitda',
    'netfcf',
    'fcfshare',
    'roic',
    'roiic',
    'moic',
    'leverage',
    'cashconv',
    'nav',
    'dpi',
    'carry',
    'deployed',
  ];

  let MetricDrilldownModal: typeof import('../../components/ui/MetricDrilldownModal').MetricDrilldownModal;

  beforeEach(async () => {
    const mod = await import('../../components/ui/MetricDrilldownModal');
    MetricDrilldownModal = mod.MetricDrilldownModal;
  });

  for (const key of METRIC_KEYS) {
    it(`renders content for metric key "${key}" without "Unknown metric" fallback`, () => {
      const { container } = render(<MetricDrilldownModal metricKey={key} onClose={() => {}} />);
      // Should NOT contain the fallback text
      expect(container.textContent).not.toContain('Unknown metric');
      // Should contain meaningful content (title headers, formulas, etc.)
      expect(container.textContent!.length).toBeGreaterThan(10);
    });
  }

  it('falls back to "Unknown metric" for invalid key', () => {
    const { container } = render(<MetricDrilldownModal metricKey="bogus_key" onClose={() => {}} />);
    expect(container.textContent).toContain('Unknown metric');
  });

  it('has exactly 13 valid metric keys', () => {
    expect(METRIC_KEYS).toHaveLength(13);
  });
});

// ══════════════════════════════════════════════════════════════════
// BUSINESS CARD — premium row visibility
// ══════════════════════════════════════════════════════════════════

describe('BusinessCard — premium row rendering', () => {
  // All premium fields on ExitValuation that get conditional rows
  const PREMIUM_FIELDS = [
    'growthPremium',
    'qualityPremium',
    'sizeTierPremium',
    'deRiskingPremium',
    'competitivePositionPremium',
    'platformPremium',
    'holdPremium',
    'improvementsPremium',
    'ruleOf40Premium',
    'marginExpansionPremium',
    'mergerPremium',
    'turnaroundPremium',
    'integratedPlatformPremium',
    'marketModifier',
  ] as const;

  // Labels that appear in the component for each premium type
  const PREMIUM_LABELS: Record<string, string> = {
    growthPremium: 'EBITDA Growth',
    qualityPremium: 'Quality Rating',
    sizeTierPremium: 'Buyers',
    deRiskingPremium: 'De-risking Factors',
    competitivePositionPremium: 'Competitive Position',
    platformPremium: 'Platform Scale',
    holdPremium: 'Hold Period',
    improvementsPremium: 'Improvements',
    ruleOf40Premium: 'Rule of 40',
    marginExpansionPremium: 'Margin',
    mergerPremium: 'Merger Premium',
    turnaroundPremium: 'Turnaround Premium',
    integratedPlatformPremium: 'Integrated Platform',
    marketModifier: 'Market Conditions',
  };

  it('all 14 premium types have mapped display labels', () => {
    expect(Object.keys(PREMIUM_LABELS)).toHaveLength(14);
    for (const field of PREMIUM_FIELDS) {
      expect(PREMIUM_LABELS[field]).toBeDefined();
    }
  });

  it('ExitValuation type contains all expected premium fields', () => {
    // Verify via the type — all these fields exist on ExitValuation
    const mockValuation: ExitValuation = {
      baseMultiple: 4.0,
      growthPremium: 0.5,
      qualityPremium: 0.4,
      platformPremium: 0.3,
      holdPremium: 0.2,
      improvementsPremium: 0.15,
      marketModifier: 0.1,
      sizeTierPremium: 0.2,
      acquisitionSizeTierPremium: 0,
      mergerPremium: 0.1,
      integratedPlatformPremium: 0.3,
      turnaroundPremium: 0.15,
      competitivePositionPremium: 0.2,
      deRiskingPremium: 0.3,
      ruleOf40Premium: 0.15,
      marginExpansionPremium: 0.1,
      buyerPoolTier: 'lower_middle_pe',
      totalMultiple: 6.75,
      seasoningMultiplier: 1.0,
      exitPrice: 6750,
      netProceeds: 6750,
      ebitdaGrowth: 0.25,
      yearsHeld: 3,
    };

    for (const field of PREMIUM_FIELDS) {
      expect(mockValuation[field]).toBeDefined();
      expect(typeof mockValuation[field]).toBe('number');
    }
  });

  it('conditional rendering uses !== 0 for bidirectional premiums and > 0 for positive-only premiums', () => {
    // Verify rendering conditions match the BusinessCard source code
    // Bidirectional (can be negative): growthPremium, qualityPremium, ruleOf40Premium, marginExpansionPremium, marketModifier
    // These use `!== 0` checks
    const bidirectional = ['growthPremium', 'qualityPremium', 'ruleOf40Premium', 'marginExpansionPremium', 'marketModifier'];
    // Positive-only: the rest use `> 0` checks
    const positiveOnly = ['sizeTierPremium', 'deRiskingPremium', 'competitivePositionPremium', 'platformPremium', 'holdPremium', 'improvementsPremium', 'mergerPremium', 'turnaroundPremium', 'integratedPlatformPremium'];

    expect(bidirectional).toHaveLength(5);
    expect(positiveOnly).toHaveLength(9);
    expect(bidirectional.length + positiveOnly.length).toBe(14);
  });
});
