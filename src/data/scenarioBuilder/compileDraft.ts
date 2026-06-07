/**
 * compileScenarioDraft / decompileConfig — the pure seam between the GUI's ScenarioDraft
 * and the runtime's ScenarioChallengeConfig.
 *
 * Contract (guaranteed by compile.test.ts):
 *   - For any GUI-reachable draft, validateScenarioConfig(compileScenarioDraft(draft)) is clean.
 *   - compile(decompile(config)) === config (values-only, modulo injected configVersion).
 *   - compile passes draft.seed through VERBATIM and never re-mints (re-minting would change
 *     the RNG track on every save and break cross-player leaderboard comparability).
 *   - passthrough preserves every field the GUI doesn't model; it never shadows a GUI-owned key.
 */
import type { ScenarioChallengeConfig, ScenarioTheme } from '../../engine/types';
import { CURRENT_SCENARIO_CONFIG_VERSION } from '../scenarioChallenges';
import { type ScenarioDraft, GUI_OWNED_CONFIG_KEYS, blankDraft } from './draftModel';

/** Index-signature view for dynamic key set/delete on our typed objects. */
const asRec = (o: object): Record<string, unknown> => o as unknown as Record<string, unknown>;

/** Optional GUI-owned fields — emitted only when defined on the draft (presence semantics). */
const OPTIONAL_GUI_FIELDS = [
  'allowedSectors', 'maSourcingMode', 'startingMaSourcingTier', 'maxAcquisitionsPerRound',
  'startingInterestRate', 'disabledFeatures', 'scoreMultiplier', 'forcedEvents', 'fundStructure', 'scenarioNarrative',
] as const;

/** Resolve the ranking metric so it always agrees with PE/holdco mode (the validator's hard rule). */
function reconcileRankingMetric(draft: ScenarioDraft): ScenarioChallengeConfig['rankingMetric'] {
  if (draft.fundStructure) {
    // PE scenario — must be a PE metric. Coerce a stale 'fev' to MOIC.
    return draft.rankingMetric === 'fev' ? 'moic' : draft.rankingMetric;
  }
  // Holdco scenario — must be FEV.
  return 'fev';
}

export function compileScenarioDraft(draft: ScenarioDraft): ScenarioChallengeConfig {
  // Base = everything the GUI doesn't model (preserved verbatim). Clone so we never mutate
  // the draft's passthrough object.
  const cfg = { ...(draft.passthrough ?? {}) } as ScenarioChallengeConfig;

  // Required scalar identity / run / setup fields (always emitted).
  cfg.id = draft.id;
  cfg.name = draft.name;
  cfg.tagline = draft.tagline;
  cfg.description = draft.description;
  cfg.startDate = draft.startDate;
  cfg.endDate = draft.endDate;
  cfg.isActive = draft.isActive;
  cfg.isFeatured = draft.isFeatured;
  cfg.seed = draft.seed; // verbatim — never re-minted
  cfg.difficulty = draft.difficulty;
  cfg.duration = draft.duration;
  cfg.maxRounds = draft.maxRounds;
  cfg.startingCash = draft.startingCash;
  cfg.startingDebt = draft.startingDebt;
  cfg.founderShares = draft.founderShares;
  cfg.sharesOutstanding = draft.sharesOutstanding;
  cfg.startingBusinesses = draft.startingBusinesses;

  // Theme — GUI owns emoji + color; era (if any) is preserved.
  const theme: ScenarioTheme = { emoji: draft.themeEmoji, color: draft.themeColor };
  if (draft.themeEra !== undefined) theme.era = draft.themeEra;
  cfg.theme = theme;

  // Optional GUI-owned fields — presence semantics: emit when defined, otherwise drop
  // (also clears any stale copy a malformed passthrough might have carried).
  for (const key of OPTIONAL_GUI_FIELDS) {
    const value = draft[key];
    if (value !== undefined) {
      asRec(cfg)[key] = value;
    } else {
      delete asRec(cfg)[key];
    }
  }

  // PE reconciliation. fundStructure is GUI-owned: its presence on the draft is authoritative.
  if (!draft.fundStructure) delete asRec(cfg).fundStructure;
  cfg.rankingMetric = reconcileRankingMetric(draft);

  // Schema version is always current on a freshly-compiled config.
  cfg.configVersion = CURRENT_SCENARIO_CONFIG_VERSION;

  return cfg;
}

export function decompileConfig(config: ScenarioChallengeConfig): ScenarioDraft {
  // Start from a blank draft for shape, then overlay the config's values. `now` is irrelevant
  // here because every field below is set from the config.
  const draft = blankDraft();

  draft.id = config.id;
  draft.name = config.name;
  draft.tagline = config.tagline;
  draft.description = config.description;
  draft.themeEmoji = config.theme.emoji;
  draft.themeColor = config.theme.color;
  draft.themeEra = config.theme.era; // undefined if absent — fine
  draft.startDate = config.startDate;
  draft.endDate = config.endDate;
  draft.isActive = config.isActive;
  draft.isFeatured = config.isFeatured;
  draft.seed = config.seed;
  draft.difficulty = config.difficulty;
  draft.duration = config.duration;
  draft.maxRounds = config.maxRounds;
  draft.startingCash = config.startingCash;
  draft.startingDebt = config.startingDebt;
  draft.founderShares = config.founderShares;
  draft.sharesOutstanding = config.sharesOutstanding;
  draft.startingBusinesses = config.startingBusinesses;
  draft.rankingMetric = config.rankingMetric;

  // Optional GUI-owned fields — set only when present on the config (presence semantics).
  for (const key of OPTIONAL_GUI_FIELDS) {
    if (key in config && asRec(config)[key] !== undefined) {
      asRec(draft)[key] = asRec(config)[key];
    } else {
      delete asRec(draft)[key];
    }
  }

  // passthrough = every config key the GUI doesn't model (excluding theme + configVersion,
  // which are handled explicitly above/by compile).
  const owned = new Set<string>([...(GUI_OWNED_CONFIG_KEYS as readonly string[]), 'theme', 'configVersion']);
  const passthrough: Record<string, unknown> = {};
  for (const key of Object.keys(config)) {
    if (!owned.has(key)) passthrough[key] = asRec(config)[key];
  }
  draft.passthrough = Object.keys(passthrough).length > 0
    ? (passthrough as Partial<ScenarioChallengeConfig>)
    : undefined;

  return draft;
}
