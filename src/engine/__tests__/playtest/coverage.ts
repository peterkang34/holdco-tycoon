/**
 * Feature Coverage Registry for Playtest System
 *
 * Central registry of all testable game features. When a new mechanic is added,
 * add a key here — all playtest suites will immediately report it as "missed"
 * until a strategy exercises it.
 *
 * ── HOW TO ADD A NEW GAME FEATURE ──
 *
 * 1. Add a key to FEATURE_REGISTRY below (e.g., `new_mechanic: 'new_mechanic'`).
 * 2. In `simulator.ts`, add `coverage.record('new_mechanic', state.round)` at the
 *    point where the mechanic fires during the game loop.
 * 3. If the feature is 20yr-only, add it to STANDARD_ONLY_FEATURES.
 * 4. Run `npx vitest run src/engine/__tests__/playtest/playtest.test.ts` — the
 *    aggregate coverage test will report your new key as "missed" until at least
 *    one strategy exercises it.
 * 5. Either update an existing strategy in `strategies.ts` to exercise the new
 *    feature, or add the key to `hardToTriggerFeatures` in `playtest.test.ts`
 *    if it requires rare conditions (distress, specific RNG, etc.).
 *
 * ── HOW TO REMOVE A FEATURE ──
 *
 * 1. Delete the key from FEATURE_REGISTRY.
 * 2. Remove any `coverage.record()` calls referencing it in `simulator.ts`.
 * 3. Remove from STANDARD_ONLY_FEATURES / hardToTriggerFeatures if listed.
 */

export const FEATURE_REGISTRY = {
  // Core loop (4)
  collect_phase: 'collect_phase',
  event_phase: 'event_phase',
  allocate_phase: 'allocate_phase',
  end_round: 'end_round',

  // Capital allocation (7)
  acquisition_cash: 'acquisition_cash',
  acquisition_leveraged: 'acquisition_leveraged',
  acquisition_seller_note: 'acquisition_seller_note',
  acquisition_earnout: 'acquisition_earnout',
  equity_raise: 'equity_raise',
  buyback: 'buyback',
  distribution: 'distribution',

  // Deal structures (2)
  acquisition_rollover: 'acquisition_rollover',
  acquisition_share_funded: 'acquisition_share_funded',

  // Platforms (5)
  platform_designation: 'platform_designation',
  tuck_in: 'tuck_in',
  merger: 'merger',
  forge_platform: 'forge_platform',
  sell_platform: 'sell_platform',

  // IPO (4) — 20yr only
  ipo_executed: 'ipo_executed',
  earnings_beat: 'earnings_beat',
  earnings_miss: 'earnings_miss',
  share_funded_deal: 'share_funded_deal',

  // Family Office (3) — 20yr only
  family_office_entered: 'family_office_entered',
  succession_choice: 'succession_choice',
  legacy_scored: 'legacy_scored',

  // Turnarounds (3)
  turnaround_started: 'turnaround_started',
  turnaround_resolved: 'turnaround_resolved',
  turnaround_fatigue: 'turnaround_fatigue',

  // Shared Services (2)
  shared_service_unlocked: 'shared_service_unlocked',
  ma_sourcing_upgraded: 'ma_sourcing_upgraded',

  // Events (4)
  event_economic: 'event_economic',
  event_portfolio: 'event_portfolio',
  event_sector: 'event_sector',
  event_choice_made: 'event_choice_made',

  // Distress (3)
  covenant_breach: 'covenant_breach',
  restructuring: 'restructuring',
  emergency_equity: 'emergency_equity',

  // Simulation (4)
  margin_drift: 'margin_drift',
  quality_improvement: 'quality_improvement',
  deal_inflation: 'deal_inflation',
  integration_drag: 'integration_drag',

  // Portfolio complexity (1)
  complexity_cost_triggered: 'complexity_cost_triggered',

  // Scoring (1)
  scoring_completed: 'scoring_completed',

  // SMB Broker & Early Game (4)
  smb_broker_used: 'smb_broker_used',
  quiet_year_capped: 'quiet_year_capped',
  filler_event_choice: 'filler_event_choice',
  early_game_safety_net: 'early_game_safety_net',

  // Private Credit & Synergy (2)
  lending_synergy_applied: 'lending_synergy_applied',
  prestige_sector_in_pipeline: 'prestige_sector_in_pipeline',

  // PE Fund Mode (9)
  fund_mode_started: 'fund_mode_started',
  lp_distribution: 'lp_distribution',
  lpac_triggered: 'lpac_triggered',
  lpac_approved: 'lpac_approved',
  lpac_denied: 'lpac_denied',
  management_fee_deducted: 'management_fee_deducted',
  forced_liquidation: 'forced_liquidation',
  carry_earned: 'carry_earned',
  pe_scoring_completed: 'pe_scoring_completed',
} as const;

export type FeatureKey = keyof typeof FEATURE_REGISTRY;

/** Features that only exist in 20yr (standard) mode */
export const STANDARD_ONLY_FEATURES: FeatureKey[] = [
  'ipo_executed',
  'earnings_beat',
  'earnings_miss',
  'share_funded_deal',
  'family_office_entered',
  'succession_choice',
  'legacy_scored',
  'deal_inflation',
];

interface FeatureRecord {
  firstExercisedRound: number;
  count: number;
}

export class PlaytestCoverage {
  private exercised = new Map<FeatureKey, FeatureRecord>();

  record(feature: FeatureKey, round: number): void {
    const existing = this.exercised.get(feature);
    if (existing) {
      existing.count++;
    } else {
      this.exercised.set(feature, { firstExercisedRound: round, count: 1 });
    }
  }

  wasExercised(feature: FeatureKey): boolean {
    return this.exercised.has(feature);
  }

  getMissedFeatures(excludeFeatures: FeatureKey[] = []): FeatureKey[] {
    const excludeSet = new Set(excludeFeatures);
    return (Object.keys(FEATURE_REGISTRY) as FeatureKey[]).filter(
      key => !this.exercised.has(key) && !excludeSet.has(key)
    );
  }

  getCoveragePercent(excludeFeatures: FeatureKey[] = []): number {
    const excludeSet = new Set(excludeFeatures);
    const applicableFeatures = (Object.keys(FEATURE_REGISTRY) as FeatureKey[]).filter(
      key => !excludeSet.has(key)
    );
    if (applicableFeatures.length === 0) return 100;
    const exercisedCount = applicableFeatures.filter(key => this.exercised.has(key)).length;
    return Math.round((exercisedCount / applicableFeatures.length) * 100);
  }

  report(excludeFeatures: FeatureKey[] = []): string {
    const missed = this.getMissedFeatures(excludeFeatures);
    const pct = this.getCoveragePercent(excludeFeatures);
    const lines = [`Coverage: ${pct}%`];
    if (missed.length > 0) {
      lines.push(`Missed (${missed.length}): ${missed.join(', ')}`);
    }
    return lines.join('\n');
  }

  /** Merge another coverage tracker into this one */
  merge(other: PlaytestCoverage): void {
    for (const [feature, record] of other.exercised) {
      const existing = this.exercised.get(feature);
      if (existing) {
        existing.count += record.count;
      } else {
        this.exercised.set(feature, { ...record });
      }
    }
  }
}
