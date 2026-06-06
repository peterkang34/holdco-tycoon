/**
 * ScenarioDraft — the small, GUI-editable model the visual builder holds.
 *
 * It compiles to the full ScenarioChallengeConfig (see compileDraft.ts) and decompiles
 * back from one. The draft explicitly models only the ~fields the v1 GUI exposes; every
 * other config field a loaded scenario carries (curated deals, triggers, round-based sector
 * maps, sub-type whitelists, backstories, theme.era, the future publishedAt, …) rides along
 * untouched in `passthrough`, so an admin can load → edit → save a complex preset without the
 * builder silently dropping fields it doesn't render.
 *
 * Presence semantics: an optional draft field that is `undefined` is OMITTED from the
 * compiled config (the engine applies its own default); any concrete value is EMITTED —
 * even one equal to the GUI default. Decompile sets a draft field whenever the key is
 * present on the config (`'key' in config`), NOT when it differs from a default.
 */
import type {
  ScenarioChallengeConfig,
  StartingBusinessConfig,
  ForcedEvent,
  FundStructure,
  DisabledFeatures,
  RankingMetric,
  MaSourcingMode,
  MASourcingTier,
  SectorId,
  GameDifficulty,
  GameDuration,
} from '../../engine/types';
import { generateRandomSeed } from '../../engine/rng';

export interface ScenarioDraft {
  // ── Identity & run ──
  id: string;
  name: string;
  tagline: string;
  description: string;
  themeEmoji: string;
  themeColor: string;
  /** theme.era — not surfaced in the GUI, preserved verbatim. */
  themeEra?: string;
  startDate: string; // ISO 8601 (UTC)
  endDate: string;   // ISO 8601 (UTC)
  isActive: boolean;
  isFeatured: boolean;

  // ── Game parameters (The Setup) ──
  seed: number;            // minted once by blankDraft, passed through verbatim by compile
  difficulty: GameDifficulty; // hidden in the GUI but a required, preserved field
  duration: GameDuration;
  maxRounds: number;
  startingCash: number;
  startingDebt: number;
  founderShares: number;
  sharesOutstanding: number;
  startingBusinesses: StartingBusinessConfig[];

  // ── The Playing Field ──
  allowedSectors?: SectorId[];
  maSourcingMode?: MaSourcingMode;
  startingMaSourcingTier?: MASourcingTier;
  maxAcquisitionsPerRound?: number;
  startingInterestRate?: number;
  disabledFeatures?: DisabledFeatures;
  rankingMetric: RankingMetric;

  // ── Twists (v1) ──
  forcedEvents?: Record<number, ForcedEvent>;
  fundStructure?: FundStructure; // presence ⇒ PE mode (GUI-owned; never in passthrough)
  scenarioNarrative?: string;    // optional "Draft flavor text" output

  // ── Everything the GUI doesn't model — preserved verbatim across load→edit→save ──
  passthrough?: Partial<ScenarioChallengeConfig>;
}

/**
 * Top-level ScenarioChallengeConfig keys the draft models explicitly. Decompile routes
 * any config key NOT in this set into `passthrough`. `theme` and `configVersion` are
 * handled specially (theme is split into emoji/color/era; configVersion is injected by
 * compile), so they are intentionally excluded from passthrough capture.
 */
export const GUI_OWNED_CONFIG_KEYS: ReadonlyArray<keyof ScenarioChallengeConfig> = [
  'id', 'name', 'tagline', 'description', 'startDate', 'endDate', 'isActive', 'isFeatured',
  'seed', 'difficulty', 'duration', 'maxRounds', 'startingCash', 'startingDebt',
  'founderShares', 'sharesOutstanding', 'startingBusinesses',
  'allowedSectors', 'maSourcingMode', 'startingMaSourcingTier', 'maxAcquisitionsPerRound',
  'startingInterestRate', 'disabledFeatures', 'rankingMetric',
  'forcedEvents', 'fundStructure', 'scenarioNarrative',
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A fresh, instantly-valid blank draft. Defaults mirror Normal-Quick with one starting
 * business — a balanced, winnable scenario out of the box (compiles to a config that
 * passes validateScenarioConfig with zero errors). `now` is injectable for testing.
 */
export function blankDraft(now: Date = new Date()): ScenarioDraft {
  const start = new Date(now);
  const end = new Date(now.getTime() + THIRTY_DAYS_MS);
  return {
    id: 'new-scenario', // valid out of the box; the GUI re-slugs from the name before save
    name: 'New Scenario',
    tagline: '',
    description: '',
    themeEmoji: '🎯',
    themeColor: '#F59E0B',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    isActive: false,
    isFeatured: false,

    seed: generateRandomSeed(),
    difficulty: 'normal',
    duration: 'quick',
    maxRounds: 10,
    startingCash: 5000,
    startingDebt: 3000,
    founderShares: 1000,
    sharesOutstanding: 1000,
    startingBusinesses: [
      { name: 'Founding Agency', sectorId: 'agency', ebitda: 800, multiple: 4, quality: 3 },
    ],

    maSourcingMode: 'random',
    startingMaSourcingTier: 0,
    startingInterestRate: 0.07,
    rankingMetric: 'fev',
  };
}
