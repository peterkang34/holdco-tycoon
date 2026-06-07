/**
 * Friendly-label option lists for the scenario builder's pickers. Every list is DERIVED
 * from the canonical runtime sources (SECTORS, FORCEABLE_EVENT_TYPES, DISABLED_FEATURE_ACTIONS,
 * FUND_STRUCTURE_PRESETS, RANKING_METRICS) so the GUI can never drift from what the validator
 * and engine accept. Coverage tripwires assert these stay in sync.
 *
 * Dependency direction: this admin-builder module imports FROM core data — never the reverse.
 */
import type {
  RankingMetric,
  DisabledFeatureKey,
  MaSourcingMode,
  SectorId,
  EventType,
} from '../../engine/types';
import {
  RANKING_METRICS,
  FORCEABLE_EVENT_TYPES,
  DISABLED_FEATURE_ACTIONS,
  FUND_STRUCTURE_PRESETS,
  type FundStructurePresetId,
} from '../scenarioChallenges';
import { SECTORS } from '../sectors';

export interface Option<T> {
  value: T;
  label: string;
  /** One-line helper shown as a tooltip. */
  help?: string;
}

// ── Ranking metrics ──────────────────────────────────────────────────────
// cashOnCash is intentionally EXCLUDED from the builder: submit.ts aliases it to the gross-MOIC
// branch, so a board labelled cashOnCash would silently rank by MOIC. Withheld until a
// realizedMoic payload exists (v2). The Display Proofreader asserts the dropdown is a SUBSET of
// RANKING_METRICS minus cashOnCash, partitioned by mode.

const RANKING_METRIC_LABELS: Record<RankingMetric, string> = {
  fev: 'Founder Equity Value (FEV)',
  moic: 'MOIC',
  irr: 'IRR',
  gpCarry: 'GP Carry',
  cashOnCash: 'Cash-on-Cash',
};
const RANKING_METRIC_HELP: Record<RankingMetric, string> = {
  fev: 'Players are ranked by the value of their ownership stake at the end.',
  moic: 'Multiple on invested capital — how many times the fund’s money came back.',
  irr: 'Annualized return rate of the fund.',
  gpCarry: 'The carry ($K) the GP earned above the hurdle.',
  cashOnCash: 'Cash distributions divided by cash invested.',
};

/** Builder-exposed ranking metrics, excluding the withheld cashOnCash. */
export const BUILDER_RANKING_METRICS: readonly RankingMetric[] =
  RANKING_METRICS.filter((m) => m !== 'cashOnCash');

/** Holdco mode allows only FEV; PE mode allows the PE metrics (never FEV). */
export const HOLDCO_RANKING_METRICS: readonly RankingMetric[] = ['fev'];
export const PE_RANKING_METRICS: readonly RankingMetric[] =
  BUILDER_RANKING_METRICS.filter((m) => m !== 'fev');

export function rankingMetricOptions(isPE: boolean): Option<RankingMetric>[] {
  const metrics = isPE ? PE_RANKING_METRICS : HOLDCO_RANKING_METRICS;
  return metrics.map((m) => ({ value: m, label: RANKING_METRIC_LABELS[m], help: RANKING_METRIC_HELP[m] }));
}

// ── Sectors ────────────────────────────────────────────────────────────────

export const SECTOR_OPTIONS: Option<SectorId>[] = Object.values(SECTORS).map((s) => ({
  value: s.id as SectorId,
  label: s.name,
}));

/** Sub-types (sub-sectors) valid for a given sector, e.g. agency → "Performance Media Agency". */
export function subTypesForSector(sectorId: SectorId): string[] {
  return (SECTORS[sectorId]?.subTypes ?? []) as string[];
}

/** Deal-flow strength tiers — how many acquisition targets surface each year. */
export const SOURCING_STRENGTH_OPTIONS: Option<0 | 1 | 2 | 3>[] = [
  { value: 0, label: '0 — Lean (≈1–3 deals/yr)' },
  { value: 1, label: '1 — Steady (≈3–4 deals/yr)' },
  { value: 2, label: '2 — Active (≈4–6 deals/yr)' },
  { value: 3, label: '3 — Flooded (≈5–8 deals/yr)' },
];

// ── Forced events (Twists) ──────────────────────────────────────────────────
// Only the runtime's forceable event types are offered — never the portfolio events that
// would silently no-op if forced.

const FORCED_EVENT_LABELS: Partial<Record<EventType, string>> = {
  global_bull_market: 'Bull market',
  global_recession: 'Recession',
  global_interest_hike: 'Interest-rate hike',
  global_interest_cut: 'Interest-rate cut',
  global_inflation: 'Inflation spike',
  global_credit_tightening: 'Credit tightening',
  global_financial_crisis: 'Financial crisis',
  global_quiet: 'Quiet year',
  global_yield_curve_inversion: 'Yield-curve inversion',
  global_talent_market_shift: 'Talent-market shift',
  global_private_credit_boom: 'Private-credit boom',
  global_oil_shock: 'Oil shock',
  sector_consolidation_boom: 'Sector consolidation boom',
};

export const FORCED_EVENT_OPTIONS: Option<EventType>[] = FORCEABLE_EVENT_TYPES.map((t) => ({
  value: t,
  label: FORCED_EVENT_LABELS[t] ?? t,
}));

/** Forcing this event requires an admin-chosen target sector. */
export const EVENT_REQUIRES_SECTOR: EventType = 'sector_consolidation_boom';

// ── Constraint packs (feature toggles) ──────────────────────────────────────
// familyOffice is force-disabled at runtime (a toggle would mislead) and restructure is
// system-triggered ([] actions) — both are EXCLUDED from the authorable vocabulary in v1.

const NON_AUTHORABLE_FEATURES: ReadonlySet<DisabledFeatureKey> = new Set<DisabledFeatureKey>([
  'familyOffice',
  'restructure',
]);

/** Feature keys an admin may toggle off in a scenario. */
export const AUTHORABLE_FEATURE_KEYS: readonly DisabledFeatureKey[] =
  (Object.keys(DISABLED_FEATURE_ACTIONS) as DisabledFeatureKey[]).filter(
    (k) => !NON_AUTHORABLE_FEATURES.has(k),
  );

const FEATURE_LABELS: Partial<Record<DisabledFeatureKey, string>> = {
  improveBusiness: 'Improve a business',
  equityRaise: 'Raise equity',
  buybackShares: 'Buy back shares',
  distributions: 'Pay distributions',
  payDownDebt: 'Pay down debt early',
  sellBusiness: 'Sell / exit a business',
  sharedServices: 'Shared services',
  platformForge: 'Platform roll-ups',
  turnaround: 'Turnarounds',
  maSourcing: 'Deal sourcing',
  ipo: 'IPO',
};

export const FEATURE_TOGGLE_OPTIONS: Option<DisabledFeatureKey>[] = AUTHORABLE_FEATURE_KEYS.map((k) => ({
  value: k,
  label: FEATURE_LABELS[k] ?? k,
}));

/** A named bundle of feature toggles to disable — the "constraint pack" affordance. */
export interface ConstraintPack {
  id: string;
  label: string;
  help: string;
  disables: readonly DisabledFeatureKey[];
}

export const CONSTRAINT_PACKS: readonly ConstraintPack[] = [
  {
    id: 'bootstrapper',
    label: 'The Bootstrapper',
    help: 'Organic cash only — no equity raises, buybacks, or IPO.',
    disables: ['equityRaise', 'buybackShares', 'ipo'],
  },
  {
    id: 'pure_operator',
    label: 'The Pure Operator',
    help: 'Fix what you own — no new acquisitions or deal sourcing.',
    disables: ['maSourcing'],
  },
  {
    id: 'no_exits',
    label: 'Permanent Hold',
    help: 'Buy and never sell — exits and IPO disabled.',
    disables: ['sellBusiness', 'ipo'],
  },
];

// ── Deal flow (M&A sourcing mode) ────────────────────────────────────────────

export const MA_SOURCING_MODE_OPTIONS: Option<MaSourcingMode>[] = [
  { value: 'disabled', label: 'Off', help: 'No new acquisition targets appear.' },
  { value: 'random', label: 'Random market', help: 'Targets surface from across the market each year.' },
  { value: 'sector_focus', label: 'Sector-focused', help: 'Targets concentrate in the allowed sectors.' },
];

// ── PE fund-structure presets ────────────────────────────────────────────────

const FUND_PRESET_LABELS: Record<FundStructurePresetId, string> = {
  traditional_pe: 'Traditional PE ($100M, 2% / 8% / 20%)',
  search_fund: 'Search Fund ($10M, 2% / 8% / 25%)',
  mega_fund: 'Mega Fund ($500M, 2% / 8% / 20%)',
  high_performer: 'High Performer ($100M, 1.5% / 10% / 25%)',
  harsh_liquidation: 'Harsh Liquidation ($100M, 10% → 40% haircut)',
};

export const FUND_PRESET_OPTIONS: Option<FundStructurePresetId>[] =
  (Object.keys(FUND_STRUCTURE_PRESETS) as FundStructurePresetId[]).map((id) => ({
    value: id,
    label: FUND_PRESET_LABELS[id],
  }));
