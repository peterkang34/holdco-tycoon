/**
 * Scenario Challenges — data model, validation, presets, and migration.
 *
 * This module is the single source of truth for scenario challenge config:
 * shape, bounds, softlock detection, fund structure presets, and schema migration.
 *
 * Consumed by:
 *   - `useGame.startScenarioChallenge` (plan Section 3)
 *   - `api/admin/scenario-challenges` (validation before save/activate)
 *   - `api/admin/scenario-challenges/generate` (AI output validation)
 *
 * See `plans/backlog/scenario-challenges.md` v3.1 + `scenario-challenges-pe-phase-a.md`.
 */

import type {
  FundStructure,
  ScenarioChallengeConfig,
  StartingBusinessConfig,
  ScenarioValidationResult,
  DisabledFeatureKey,
  GameActionType,
  Business,
  Deal,
  GameEvent,
  CuratedDeal,
  ForcedEvent,
  QualityRating,
  EventType,
} from '../engine/types';
import { SECTORS } from './sectors';

// ── Version & bounds ──────────────────────────────────────────────────────

/** Current schema version for stored ScenarioChallengeConfig. Bump on breaking changes. */
export const CURRENT_SCENARIO_CONFIG_VERSION = 1;

export const MIN_MAX_ROUNDS = 3;
export const MAX_MAX_ROUNDS = 30;

/** Target byte size above which we warn the admin about save bloat. */
export const CONFIG_SIZE_WARN_BYTES = 50_000;

// ── Fund structure presets ────────────────────────────────────────────────

/**
 * Named starting points for the PE Phase A fund structure knobs.
 * Admin wizard exposes these via dropdown; values remain editable after selection.
 */
export const FUND_STRUCTURE_PRESETS = {
  traditional_pe:    { committedCapital: 100_000, mgmtFeePercent: 0.02,  hurdleRate: 0.08, carryRate: 0.20, forcedLiquidationYear: 10, forcedLiquidationDiscount: 0.90 },
  search_fund:       { committedCapital: 10_000,  mgmtFeePercent: 0.02,  hurdleRate: 0.08, carryRate: 0.25, forcedLiquidationYear: 10, forcedLiquidationDiscount: 0.90 },
  mega_fund:         { committedCapital: 500_000, mgmtFeePercent: 0.02,  hurdleRate: 0.08, carryRate: 0.20, forcedLiquidationYear: 10, forcedLiquidationDiscount: 0.90 },
  high_performer:    { committedCapital: 100_000, mgmtFeePercent: 0.015, hurdleRate: 0.10, carryRate: 0.25, forcedLiquidationYear: 10, forcedLiquidationDiscount: 0.90 },
  harsh_liquidation: { committedCapital: 100_000, mgmtFeePercent: 0.02,  hurdleRate: 0.08, carryRate: 0.20, forcedLiquidationYear: 10, forcedLiquidationDiscount: 0.60 },
} as const satisfies Record<string, FundStructure>;

export type FundStructurePresetId = keyof typeof FUND_STRUCTURE_PRESETS;

// ── Disabled-feature → action mapping ─────────────────────────────────────

/**
 * Maps each admin-facing feature gate to the concrete `GameActionType` values
 * it blocks. Keys NOT mapped to actions (`restructure`, `familyOffice`) are
 * enforced elsewhere — restructure is a system event, FO is a mode transition.
 *
 * Used by `isActionBlocked` in `src/data/modeGating.ts` to translate scenario
 * `disabledFeatures` into engine-level blocks.
 */
export const DISABLED_FEATURE_ACTIONS: Record<DisabledFeatureKey, readonly GameActionType[]> = {
  improveBusiness: ['improve'],
  equityRaise:     ['issue_equity'],
  buybackShares:   ['buyback'],
  distributions:   ['distribute'],
  payDownDebt:     ['pay_debt'],
  sellBusiness:    ['sell', 'accept_offer'],
  restructure:     [], // system-triggered; enforced via distress pipeline, not per-action
  familyOffice:    [], // mode transition; scenarios always disable FO unlock via plan rules
  sharedServices:  ['unlock_shared_service', 'deactivate_shared_service'],
  platformForge:   ['forge_integrated_platform', 'add_to_integrated_platform', 'sell_platform', 'designate_platform'],
  turnaround:      ['unlock_turnaround_tier', 'start_turnaround'],
  maSourcing:      ['source_deals', 'upgrade_ma_sourcing', 'toggle_ma_sourcing', 'proactive_outreach', 'smb_broker'],
  ipo:             ['ipo'],
};

// ── Validation ────────────────────────────────────────────────────────────

/**
 * Validate a scenario config. Returns arrays of errors (blocks activation) and
 * warnings (non-blocking, surfaced to admin for review).
 *
 * Called from: AI generation response, admin form save, admin form activate.
 */
export function validateScenarioConfig(config: ScenarioChallengeConfig): ScenarioValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Identity ──
  if (!config.id || typeof config.id !== 'string' || config.id.trim().length === 0) {
    errors.push('id is required and must be a non-empty string');
  }
  if (!config.name || config.name.trim().length === 0) {
    errors.push('name is required');
  }
  if (config.name && config.name.length > 80) {
    errors.push('name must be ≤ 80 characters');
  }
  if (config.configVersion !== CURRENT_SCENARIO_CONFIG_VERSION) {
    // Cross-version configs must be migrated via `migrateScenarioConfig` before validation.
    // Reaching validate with a version mismatch means the caller skipped migration — treat
    // as an error so activation blocks it (the plan says activation requires errors.length === 0).
    errors.push(`configVersion ${config.configVersion} differs from current ${CURRENT_SCENARIO_CONFIG_VERSION} — run migrateScenarioConfig before validating`);
  }

  // ── Schedule ──
  const start = Date.parse(config.startDate);
  const end = Date.parse(config.endDate);
  if (isNaN(start)) errors.push('startDate must be a valid ISO 8601 date');
  if (isNaN(end)) errors.push('endDate must be a valid ISO 8601 date');
  if (!isNaN(start) && !isNaN(end) && end <= start) {
    errors.push('endDate must be after startDate');
  }

  // ── Game parameters ──
  if (!Number.isInteger(config.maxRounds) || config.maxRounds < MIN_MAX_ROUNDS || config.maxRounds > MAX_MAX_ROUNDS) {
    errors.push(`maxRounds must be an integer in [${MIN_MAX_ROUNDS}, ${MAX_MAX_ROUNDS}]`);
  }
  if (config.duration !== 'quick' && config.duration !== 'standard') {
    errors.push(`duration must be 'quick' or 'standard'`);
  }
  if (config.difficulty !== 'easy' && config.difficulty !== 'normal') {
    errors.push(`difficulty must be 'easy' or 'normal'`);
  }
  if (typeof config.startingCash !== 'number' || config.startingCash < 0) {
    errors.push('startingCash must be a non-negative number');
  }
  if (typeof config.startingDebt !== 'number' || config.startingDebt < 0) {
    errors.push('startingDebt must be a non-negative number');
  }
  if (typeof config.founderShares !== 'number' || typeof config.sharesOutstanding !== 'number' ||
      config.founderShares < 0 || config.sharesOutstanding <= 0 ||
      config.founderShares > config.sharesOutstanding) {
    errors.push('founderShares must be ≥ 0 and ≤ sharesOutstanding (which must be > 0)');
  }
  if (config.startingInterestRate !== undefined) {
    if (typeof config.startingInterestRate !== 'number' ||
        config.startingInterestRate < 0 || config.startingInterestRate > 0.25) {
      errors.push('startingInterestRate must be a number in [0, 0.25]');
    }
  }

  // ── Starting portfolio ──
  if (!Array.isArray(config.startingBusinesses)) {
    errors.push('startingBusinesses must be an array (use [] for capital-only start)');
  } else {
    config.startingBusinesses.forEach((biz, i) => {
      if (!biz.name || biz.name.trim().length === 0) errors.push(`startingBusinesses[${i}].name is required`);
      if (!SECTORS[biz.sectorId]) errors.push(`startingBusinesses[${i}].sectorId '${biz.sectorId}' is not a valid sector`);
      else if (biz.subType && !SECTORS[biz.sectorId].subTypes.includes(biz.subType)) {
        errors.push(`startingBusinesses[${i}].subType '${biz.subType}' is not valid for sector '${biz.sectorId}'`);
      }
      if (typeof biz.ebitda !== 'number' || biz.ebitda <= 0) errors.push(`startingBusinesses[${i}].ebitda must be a positive number`);
      if (typeof biz.multiple !== 'number' || biz.multiple <= 0) errors.push(`startingBusinesses[${i}].multiple must be a positive number`);
      if (!Number.isInteger(biz.quality) || biz.quality < 1 || biz.quality > 5) {
        errors.push(`startingBusinesses[${i}].quality must be an integer in [1, 5]`);
      }
      if (biz.ebitdaMargin !== undefined && (biz.ebitdaMargin <= 0 || biz.ebitdaMargin >= 1)) {
        errors.push(`startingBusinesses[${i}].ebitdaMargin must be in (0, 1)`);
      }
    });
  }

  // ── Curated deals & forced events (per-round) ──
  if (config.curatedDeals) {
    for (const [roundStr, deals] of Object.entries(config.curatedDeals)) {
      const round = Number(roundStr);
      if (!Number.isInteger(round) || round < 1 || round > config.maxRounds) {
        errors.push(`curatedDeals round '${roundStr}' must be an integer in [1, ${config.maxRounds}]`);
        continue;
      }
      if (!Array.isArray(deals)) {
        errors.push(`curatedDeals[${round}] must be an array of deals`);
        continue;
      }
      deals.forEach((deal, i) => {
        if (!deal.name || deal.name.trim().length === 0) errors.push(`curatedDeals[${round}][${i}].name is required`);
        if (!SECTORS[deal.sectorId]) errors.push(`curatedDeals[${round}][${i}].sectorId '${deal.sectorId}' is not a valid sector`);
        else if (deal.subType && !SECTORS[deal.sectorId].subTypes.includes(deal.subType)) {
          errors.push(`curatedDeals[${round}][${i}].subType '${deal.subType}' is not valid for sector '${deal.sectorId}'`);
        }
        if (typeof deal.ebitda !== 'number' || deal.ebitda <= 0) errors.push(`curatedDeals[${round}][${i}].ebitda must be a positive number`);
        if (typeof deal.multiple !== 'number' || deal.multiple <= 0) errors.push(`curatedDeals[${round}][${i}].multiple must be a positive number`);
        if (!Number.isInteger(deal.quality) || deal.quality < 1 || deal.quality > 5) {
          errors.push(`curatedDeals[${round}][${i}].quality must be an integer in [1, 5]`);
        }
        if (deal.ebitdaMargin !== undefined && (deal.ebitdaMargin <= 0 || deal.ebitdaMargin >= 1)) {
          errors.push(`curatedDeals[${round}][${i}].ebitdaMargin must be in (0, 1)`);
        }
      });
    }
  }

  if (config.forcedEvents) {
    for (const [roundStr, forced] of Object.entries(config.forcedEvents)) {
      const round = Number(roundStr);
      if (!Number.isInteger(round) || round < 1 || round > config.maxRounds) {
        errors.push(`forcedEvents round '${roundStr}' must be an integer in [1, ${config.maxRounds}]`);
        continue;
      }
      if (!forced || typeof forced !== 'object') {
        errors.push(`forcedEvents[${round}] must be an object`);
        continue;
      }
      if (!forced.type || typeof forced.type !== 'string') {
        errors.push(`forcedEvents[${round}].type is required`);
      } else if (!FORCEABLE_EVENT_TYPE_SET.has(forced.type)) {
        // Admins can only force global/sector-level events. Portfolio events need a
        // specific target business which the factory cannot pick — forcing one would
        // silently no-op in `applyEventEffects`.
        errors.push(`forcedEvents[${round}].type '${forced.type}' is not a forceable event type; see FORCEABLE_EVENT_TYPES`);
      } else if (forced.type === 'sector_consolidation_boom') {
        if (!forced.consolidationSectorId || !SECTORS[forced.consolidationSectorId]) {
          errors.push(`forcedEvents[${round}]: sector_consolidation_boom requires consolidationSectorId set to a valid sector`);
        }
      }
      if (forced.customTitle !== undefined && (typeof forced.customTitle !== 'string' || forced.customTitle.length > 200)) {
        errors.push(`forcedEvents[${round}].customTitle must be a string ≤ 200 chars`);
      }
      if (forced.customDescription !== undefined && (typeof forced.customDescription !== 'string' || forced.customDescription.length > 2000)) {
        errors.push(`forcedEvents[${round}].customDescription must be a string ≤ 2000 chars`);
      }
    }
  }

  // ── Sector / sub-type restrictions ──
  if (config.allowedSectors && config.allowedSectors.length > 0) {
    for (const sid of config.allowedSectors) {
      if (!SECTORS[sid]) errors.push(`allowedSectors contains invalid sector '${sid}'`);
    }
    if (config.allowedSectors.length === 1 && !hasCuratedDealsForAllRounds(config)) {
      warnings.push('Single-sector restriction without curated deals may produce ~1/3 zero-deal rounds — engine will force a floor, but variety will be low');
    }
  }
  if (config.allowedSubTypes && config.allowedSectors) {
    const validSubTypes = new Set(
      config.allowedSectors.flatMap(sid => SECTORS[sid]?.subTypes ?? [])
    );
    for (const st of config.allowedSubTypes) {
      if (!validSubTypes.has(st)) errors.push(`allowedSubTypes contains '${st}' which is not valid for any allowed sector`);
    }
  }

  if (config.startingMaSourcingTier !== undefined) {
    if (!Number.isInteger(config.startingMaSourcingTier) ||
        config.startingMaSourcingTier < 0 || config.startingMaSourcingTier > 3) {
      errors.push('startingMaSourcingTier must be an integer in [0, 3]');
    }
  }
  if (config.maxAcquisitionsPerRound !== undefined) {
    if (!Number.isInteger(config.maxAcquisitionsPerRound) || config.maxAcquisitionsPerRound < 1) {
      errors.push('maxAcquisitionsPerRound must be a positive integer');
    }
  }

  // ── Disabled features ──
  if (config.disabledFeatures) {
    const validKeys = Object.keys(DISABLED_FEATURE_ACTIONS) as DisabledFeatureKey[];
    for (const key of Object.keys(config.disabledFeatures)) {
      if (!validKeys.includes(key as DisabledFeatureKey)) {
        errors.push(`disabledFeatures contains unknown key '${key}'`);
      }
    }
  }

  // ── Ranking metric ──
  const validMetrics = ['fev', 'moic', 'irr', 'gpCarry', 'cashOnCash'];
  if (!validMetrics.includes(config.rankingMetric)) {
    errors.push(`rankingMetric must be one of ${validMetrics.join(', ')}`);
  }

  // ── Fund structure (PE Phase A) ──
  if (config.fundStructure) {
    const fs = config.fundStructure;
    if (typeof fs.committedCapital !== 'number' || fs.committedCapital < 1_000 || fs.committedCapital > 10_000_000) {
      errors.push('fundStructure.committedCapital must be a number in [1_000, 10_000_000] (in $K)');
    }
    if (typeof fs.mgmtFeePercent !== 'number' || fs.mgmtFeePercent < 0 || fs.mgmtFeePercent > 0.05) {
      errors.push('fundStructure.mgmtFeePercent must be a number in [0, 0.05]');
    }
    if (typeof fs.hurdleRate !== 'number' || fs.hurdleRate < 0 || fs.hurdleRate > 0.20) {
      errors.push('fundStructure.hurdleRate must be a number in [0, 0.20]');
    }
    if (typeof fs.carryRate !== 'number' || fs.carryRate < 0 || fs.carryRate > 0.50) {
      errors.push('fundStructure.carryRate must be a number in [0, 0.50]');
    }
    if (typeof fs.forcedLiquidationDiscount !== 'number' ||
        fs.forcedLiquidationDiscount < 0.50 || fs.forcedLiquidationDiscount > 1.00) {
      errors.push('fundStructure.forcedLiquidationDiscount must be a number in [0.50, 1.00]');
    }
    if (fs.forcedLiquidationYear !== undefined) {
      if (!Number.isInteger(fs.forcedLiquidationYear) ||
          fs.forcedLiquidationYear < 2 || fs.forcedLiquidationYear > config.maxRounds) {
        errors.push(`fundStructure.forcedLiquidationYear must be an integer in [2, maxRounds (${config.maxRounds})]`);
      }
    }

    // Cross-field: ranking metric must match fundStructure presence
    if (config.rankingMetric === 'fev') {
      errors.push('fundStructure scenarios must use a PE ranking metric (moic | irr | gpCarry | cashOnCash), not fev');
    }

    // Cross-field: startingCash is ignored at runtime (replaced by committedCapital)
    if (config.startingCash > 0) {
      warnings.push('startingCash is ignored when fundStructure is set — committedCapital replaces it at runtime');
    }
    if (config.startingDebt > 0) {
      warnings.push('PE funds typically start debt-free; startingDebt will be zeroed when fundStructure is set');
    }

    // Softlock check: high fee + low capital + no curated deals
    if (fs.mgmtFeePercent > 0.04 && fs.committedCapital < 20_000 && !config.curatedDeals) {
      warnings.push('High management fee (>4%) + low committed capital (<$20M) + no curated deals may exhaust capital before deal flow arrives');
    }
  } else {
    // Non-PE scenarios must use 'fev'
    if (config.rankingMetric !== 'fev') {
      errors.push(`non-PE scenarios (no fundStructure) must use rankingMetric 'fev'`);
    }
  }

  // ── Solvability ──
  const hasStartingBiz = Array.isArray(config.startingBusinesses) && config.startingBusinesses.length > 0;
  const hasRound1Deals = config.curatedDeals?.[1] && config.curatedDeals[1].length > 0;
  const effectiveStartingCash = config.fundStructure?.committedCapital ?? config.startingCash;

  if (effectiveStartingCash <= 0 && !hasStartingBiz && !hasRound1Deals) {
    errors.push('Softlock: zero starting cash + zero starting businesses + no round-1 curated deals means the game is unplayable');
  }

  const anyDistressed = hasStartingBiz && config.startingBusinesses.some(b => b.status === 'distressed');
  const allRecoveryDisabled = !!(
    config.disabledFeatures?.sellBusiness &&
    config.disabledFeatures?.improveBusiness &&
    config.disabledFeatures?.restructure &&
    config.disabledFeatures?.turnaround
  );
  if (anyDistressed && allRecoveryDisabled) {
    errors.push('Softlock: distressed starting businesses + all recovery features (sellBusiness, improveBusiness, restructure, turnaround) disabled = guaranteed bankruptcy');
  }

  // ── Config size warning ──
  try {
    const size = JSON.stringify(config).length;
    if (size > CONFIG_SIZE_WARN_BYTES) {
      warnings.push(`Config is ${(size / 1024).toFixed(1)}KB; large configs slow save serialization on mobile`);
    }
  } catch {
    // Stringify failed (circular?) — ignore
  }

  return { errors, warnings };
}

/** True if every round from 1..maxRounds has at least one curated deal. */
function hasCuratedDealsForAllRounds(config: ScenarioChallengeConfig): boolean {
  if (!config.curatedDeals) return false;
  for (let r = 1; r <= config.maxRounds; r++) {
    if (!config.curatedDeals[r] || config.curatedDeals[r].length === 0) return false;
  }
  return true;
}

// ── Business factory ──────────────────────────────────────────────────────

/**
 * Build a full Business from a scenario's StartingBusinessConfig, filling
 * sector-default fields the config didn't override.
 *
 * Kept minimal in Phase 1 — mirrors the shape `createStartingBusiness` produces
 * in `src/engine/businesses.ts` so downstream engine code behaves identically.
 * The `id` caller-generated or auto-generated in the engine integration path.
 */
export function createBusinessFromConfig(
  override: StartingBusinessConfig,
  id: string,
): Business {
  const sector = SECTORS[override.sectorId];
  if (!sector) {
    throw new Error(`createBusinessFromConfig: unknown sectorId '${override.sectorId}'`);
  }

  const subType = override.subType ?? sector.subTypes[0];
  const ebitdaMargin = override.ebitdaMargin ?? (sector.baseMargin[0] + sector.baseMargin[1]) / 2;
  const revenue = Math.round(override.ebitda / ebitdaMargin);
  const acquisitionPrice = Math.round(override.ebitda * override.multiple);
  const orgGrowthMid = (sector.organicGrowthRange[0] + sector.organicGrowthRange[1]) / 2;
  const marginDriftMid = (sector.marginDriftRange[0] + sector.marginDriftRange[1]) / 2;

  return {
    id,
    name: override.name,
    sectorId: override.sectorId,
    subType,
    ebitda: override.ebitda,
    peakEbitda: override.ebitda,
    acquisitionEbitda: override.ebitda,
    acquisitionPrice,
    acquisitionRound: 0,
    acquisitionMultiple: override.multiple,
    acquisitionSizeTierPremium: 0,
    organicGrowthRate: orgGrowthMid,
    revenue,
    ebitdaMargin,
    acquisitionRevenue: revenue,
    acquisitionMargin: ebitdaMargin,
    peakRevenue: revenue,
    revenueGrowthRate: orgGrowthMid,
    marginDriftRate: marginDriftMid,
    qualityRating: override.quality as QualityRating,
    dueDiligence: {
      revenueConcentration: sector.clientConcentration,
      revenueConcentrationText: '',
      operatorQuality: override.quality >= 4 ? 'strong' : override.quality >= 2 ? 'moderate' : 'weak',
      operatorQualityText: '',
      trend: 'flat',
      trendText: '',
      customerRetention: 85,
      customerRetentionText: '',
      competitivePosition: override.quality >= 4 ? 'leader' : override.quality >= 2 ? 'competitive' : 'commoditized',
      competitivePositionText: '',
    },
    integrationRoundsRemaining: 0,
    integrationGrowthDrag: 0,
    improvements: [],
    sellerNoteBalance: 0,
    sellerNoteRate: 0,
    sellerNoteRoundsRemaining: 0,
    bankDebtBalance: 0,
    bankDebtRate: 0,
    bankDebtRoundsRemaining: 0,
    earnoutRemaining: 0,
    earnoutTarget: 0,
    // TODO (Step 2): propagate `override.status === 'distressed'` to the engine.
    // `BusinessStatus` doesn't include 'distressed' as a terminal state — distress is
    // signaled via covenant breach, low margin, failing due-diligence flags. Step 2's
    // `startScenarioChallenge` needs to translate the config-level distress flag into
    // engine-level state (e.g., bumping covenantBreachRounds, setting requiresRestructuring,
    // or degrading due-diligence signals). Until then, distressed-starts are treated as
    // healthy at runtime — "Turnaround Kings" and "Recession Gauntlet" will not play
    // as designed. Pinned in scenario-challenges.test.ts to force Step 2 to address this.
    status: 'active',
    isPlatform: false,
    platformScale: 0,
    boltOnIds: [],
    synergiesRealized: 0,
    totalAcquisitionCost: acquisitionPrice,
    cashEquityInvested: acquisitionPrice,
    rolloverEquityPct: 0,
    priorOwnershipCount: 0,
  };
}

// ── Deal factory (curated deal → engine Deal) ─────────────────────────────

/**
 * Build an engine `Deal` from a scenario `CuratedDeal`. Sector defaults fill
 * in the fields the curated deal doesn't override. Deal ID is caller-provided
 * so the engine retains control over ID generation policy.
 *
 * The resulting Deal is `source: 'proprietary'`, `heat: 'warm'`, `freshness: 3`,
 * matching the neutral starting conditions used by B-School curated deals.
 */
export function createDealFromCuratedConfig(
  curated: CuratedDeal,
  id: string,
  round: number,
): Deal {
  const business = createBusinessFromConfig(curated, `${id}_biz`);
  const askingPrice = business.acquisitionPrice;

  // Deal carries a Business-minus-runtime-fields (acquisitionRound, improvements, status, id filled at acquire time)
  const { id: _bizId, acquisitionRound: _ar, improvements: _imp, status: _st, ...dealBusiness } = business;

  return {
    id,
    business: dealBusiness,
    askingPrice,
    freshness: 3,
    roundAppeared: round,
    source: 'proprietary',
    acquisitionType: 'standalone',
    heat: 'warm',
    effectivePrice: askingPrice,
  };
}

// ── Forced event factory (scenario config → engine GameEvent) ─────────────

/**
 * Event types an admin can force in a scenario. Restricted to global/sector-level
 * events that apply market-wide effects — these don't require `affectedBusinessId`
 * (which `applyEventEffects` reads for portfolio-level events). Admin-forcing a
 * portfolio-level event like `portfolio_star_joins` would result in a silent no-op
 * since the factory can't pick a specific target business.
 *
 * `sector_consolidation_boom` requires `consolidationSectorId` on the ForcedEvent —
 * validated in `validateScenarioConfig`.
 */
export const FORCEABLE_EVENT_TYPES: readonly EventType[] = [
  'global_bull_market',
  'global_recession',
  'global_interest_hike',
  'global_interest_cut',
  'global_inflation',
  'global_credit_tightening',
  'global_financial_crisis',
  'global_quiet',
  'global_yield_curve_inversion',
  'global_talent_market_shift',
  'global_private_credit_boom',
  'global_oil_shock',
  'sector_consolidation_boom',
] as const;

const FORCEABLE_EVENT_TYPE_SET: ReadonlySet<EventType> = new Set(FORCEABLE_EVENT_TYPES);

/**
 * Default event title/description map for the event types scenarios are most likely
 * to force. Keys are valid `EventType` values — enforced at compile time via the
 * `Partial<Record<EventType, ...>>` type. If an admin forces an uncommon event type
 * without custom text, a generic fallback is used.
 */
const DEFAULT_EVENT_COPY: Partial<Record<EventType, { title: string; description: string; effect: string }>> = {
  global_recession: {
    title: 'Recession',
    description: 'The economy contracts. Consumer demand weakens, multiples compress, deal heat cools.',
    effect: 'Revenue -8-15% by sector sensitivity. Deal supply +20%, multiples -10%.',
  },
  global_financial_crisis: {
    title: 'Financial Crisis',
    description: 'Credit markets freeze. Banks pull facilities; seller notes become the only structure available.',
    effect: 'Bank debt unavailable for 2 rounds. Existing debt sees +2% interest penalty. Distressed deal flow surges.',
  },
  global_credit_tightening: {
    title: 'Credit Tightening',
    description: 'Regulators tighten lending standards. Bank debt becomes more expensive and covenant-heavy.',
    effect: '+2% interest rate on new bank debt. Covenant thresholds tightened for 2 rounds.',
  },
  global_oil_shock: {
    title: 'Oil Shock',
    description: 'Energy prices spike. Sectors with high oil sensitivity see margin compression and demand shocks.',
    effect: 'Revenue -10% × oil sensitivity. Margin -2ppt × oil sensitivity. 2-round aftershock follows.',
  },
  global_bull_market: {
    title: 'Bull Market',
    description: 'Equity markets surge. Multiples expand, deal competition heats up, premiums widen.',
    effect: 'Exit multiples +15%. Acquisition multiples +10%. Deal heat rises.',
  },
  sector_consolidation_boom: {
    title: 'Consolidation Boom',
    description: 'A sector enters a roll-up frenzy. Strategic premiums spike, but tuck-in competition intensifies.',
    effect: '+25% exit premium for businesses in the boom sector. +15% deal heat sector-wide.',
  },
};

/**
 * Build an engine `GameEvent` from a scenario `ForcedEvent`. Admin's custom title/
 * description take precedence; otherwise falls back to `DEFAULT_EVENT_COPY` for
 * common types or generic text for uncommon ones.
 *
 * Engine-side event mechanics (margin hits, rate changes, etc.) are dispatched
 * by `applyEventEffects` based on `event.type`, NOT on the title/description/effect
 * strings — those are display-only. So a forced event with `{type: 'global_recession'}`
 * triggers full recession mechanics even with minimal custom text.
 */
export function createForcedGameEvent(forced: ForcedEvent, round: number): GameEvent {
  const defaults = DEFAULT_EVENT_COPY[forced.type] ?? {
    title: forced.type,
    description: 'Scenario-forced event.',
    effect: 'See scenario description for details.',
  };

  return {
    id: `event_${round}_scenario_${forced.type}`,
    type: forced.type,
    title: forced.customTitle ?? defaults.title,
    description: forced.customDescription ?? defaults.description,
    effect: defaults.effect,
    // Required when type === 'sector_consolidation_boom' so `applyEventEffects`
    // can set state.consolidationBoomSectorId (see simulation.ts:2170).
    ...(forced.consolidationSectorId ? { consolidationSectorId: forced.consolidationSectorId } : {}),
  };
}

// ── Schema migration ──────────────────────────────────────────────────────

/**
 * Migrate a stored ScenarioChallengeConfig to the current schema version.
 * Returns null if the config can't be migrated (too old, unrecognized).
 *
 * For version 1 (current), this is essentially a passthrough. Future versions
 * add migration steps keyed on `configVersion` — same pattern as `hooks/migrations.ts`.
 */
export function migrateScenarioConfig(stored: unknown): ScenarioChallengeConfig | null {
  if (!stored || typeof stored !== 'object') return null;

  const candidate = stored as Partial<ScenarioChallengeConfig>;
  const version = typeof candidate.configVersion === 'number' ? candidate.configVersion : 0;

  // Reject future versions we don't know how to handle yet.
  if (version > CURRENT_SCENARIO_CONFIG_VERSION) return null;

  // Version 0 → 1: assume current shape; backfill configVersion.
  // (In v1 this is essentially a no-op; future version bumps add real transforms.)
  let migrated: ScenarioChallengeConfig;
  try {
    migrated = {
      ...candidate,
      configVersion: CURRENT_SCENARIO_CONFIG_VERSION,
    } as ScenarioChallengeConfig;
  } catch {
    return null;
  }

  // Run the migrated config through the full validator — a migrated config that
  // passes type-cast but fails structural validation (missing required fields,
  // invalid bounds, etc.) should be rejected rather than corrupt downstream state.
  const { errors } = validateScenarioConfig(migrated);
  if (errors.length > 0) return null;

  return migrated;
}
