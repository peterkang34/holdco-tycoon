/**
 * Operator's Playbook — Thesis Generator
 *
 * Template-based sentence generation for the playbook's Investment Thesis section.
 * No AI, no API calls. Pure string interpolation from archetype + key metrics.
 *
 * ~27+ template variants: 9 standard archetypes × 3 base variants, plus
 * bankruptcy, inactive GP, and PE mode variants.
 */

import type { PlaybookData } from '../engine/types';
import { formatMoney } from '../engine/utils';
import { ARCHETYPE_DISPLAY_NAMES } from '../data/archetypeNames';

// ── Helpers ──────────────────────────────────────────────────────────

function durationLabel(_duration: string, totalRounds: number): string {
  return `${totalRounds} years`;
}

function sectorCount(sectors: string[]): string {
  if (sectors.length === 1) return 'a single sector';
  if (sectors.length === 2) return 'two sectors';
  return `${sectors.length} sectors`;
}

// ── Conditional clauses ──────────────────────────────────────────────

function buildConditionalClauses(
  _thesis: PlaybookData['thesis'],
  portfolio: PlaybookData['portfolio'],
  capital: PlaybookData['capital'],
  operations: PlaybookData['operations'],
): string {
  const clauses: string[] = [];

  if (portfolio.totalSells === 0 && portfolio.totalAcquisitions > 0 && !_thesis.isFundManager) {
    clauses.push('Never sold a single business — a permanent capital philosophy.');
  }
  if (operations.recessionAcquisitionCount >= 2) {
    clauses.push(`Made ${operations.recessionAcquisitionCount} acquisitions during recessions, demonstrating counter-cyclical discipline.`);
  }
  if (capital.rolloverEquityCount >= 2) {
    clauses.push(`Used rollover equity in ${capital.rolloverEquityCount} deals, aligning seller incentives with long-term outcomes.`);
  }
  if (capital.hasRestructured) {
    clauses.push('Survived a restructuring — learning through adversity.');
  }

  return clauses.length > 0 ? ' ' + clauses[0] : '';
}

// ── Template variants ────────────────────────────────────────────────

type ThesisTemplate = (
  name: string,
  thesis: PlaybookData['thesis'],
  portfolio: PlaybookData['portfolio'],
  capital: PlaybookData['capital'],
  operations: PlaybookData['operations'],
) => string;

const ARCHETYPE_TEMPLATES: Record<string, ThesisTemplate[]> = {
  platform_builder: [
    (name, t, p) =>
      `${name} pursued an integrated platform strategy across ${sectorCount(t.sectorFocus)}, forging ${p.platformsForged} platforms from ${p.totalAcquisitions} acquisitions over ${durationLabel(t.duration, t.totalRounds)}. The portfolio generated ${formatMoney(t.fev)} in founder equity value.`,
    (name, t, p) =>
      `Over ${durationLabel(t.duration, t.totalRounds)}, ${name} built ${p.platformsForged} integrated platforms — combining standalone businesses into entities worth more than the sum of their parts. Final FEV: ${formatMoney(t.fev)}.`,
    (name, t, p) =>
      `${name}'s thesis was integration. ${p.platformsForged} platforms forged across ${p.totalAcquisitions} total acquisitions, concentrating in ${sectorCount(t.sectorFocus)}. The compounding effect produced ${formatMoney(t.fev)} in equity value over ${durationLabel(t.duration, t.totalRounds)}.`,
  ],

  turnaround_specialist: [
    (name, t, _p, _c, ops) => {
      const rate = ops.turnaroundsStarted > 0 ? Math.round(ops.turnaroundsSucceeded / ops.turnaroundsStarted * 100) : 0;
      return `${name} specialized in buying broken businesses and fixing them. ${ops.turnaroundsStarted} turnarounds initiated with a ${rate}% success rate over ${durationLabel(t.duration, t.totalRounds)}. Final FEV: ${formatMoney(t.fev)}.`;
    },
    (name, t, _p, _c, ops) =>
      `Where others saw distressed assets, ${name} saw hidden value. ${ops.turnaroundsSucceeded} successful turnarounds out of ${ops.turnaroundsStarted} attempts created ${formatMoney(t.fev)} in equity value.`,
    (name, t, _p, _c, ops) =>
      `${name}'s operational playbook: buy underperformers, install improvements, and compound quality gains. ${ops.turnaroundsStarted} turnarounds over ${durationLabel(t.duration, t.totalRounds)} produced ${formatMoney(t.fev)} in FEV.`,
  ],

  dividend_cow: [
    (name, t, p, cap) =>
      `${name} prioritized capital returns. ${p.totalSells} businesses sold and ${formatMoney(cap.totalDistributions)} distributed over ${durationLabel(t.duration, t.totalRounds)}, while maintaining ${formatMoney(t.fev)} in residual equity value.`,
    (name, t, _p, cap) =>
      `Cash discipline defined ${name}. ${formatMoney(cap.totalDistributions)} returned to shareholders through distributions, plus ${formatMoney(t.fev)} in final equity — a total shareholder return of ${formatMoney(t.fev + cap.totalDistributions)}.`,
    (name, t, p, cap) =>
      `${name} harvested winners and returned capital. ${p.totalSells} exits generated proceeds that funded ${formatMoney(cap.totalDistributions)} in distributions over ${durationLabel(t.duration, t.totalRounds)}. Final FEV: ${formatMoney(t.fev)}.`,
  ],

  serial_acquirer: [
    (name, t, p) =>
      `${name} was a prolific dealmaker: ${p.totalAcquisitions} acquisitions across ${sectorCount(t.sectorFocus)} over ${durationLabel(t.duration, t.totalRounds)}, building a ${p.activeCount}-business portfolio worth ${formatMoney(t.fev)}.`,
    (name, t, p) =>
      `${p.totalAcquisitions} deals in ${durationLabel(t.duration, t.totalRounds)}. ${name} deployed capital aggressively, scaling to ${p.peakActiveCount} businesses at peak and finishing with ${formatMoney(t.fev)} in equity value.`,
    (name, t, p) =>
      `${name}'s strategy was volume: acquire, integrate into the portfolio, repeat. ${p.totalAcquisitions} businesses acquired over ${durationLabel(t.duration, t.totalRounds)}, producing ${formatMoney(t.fev)} in FEV.`,
  ],

  roll_up_machine: [
    (name, t, p) =>
      `${name} executed a classic roll-up: ${p.totalAcquisitions} acquisitions funneled into ${p.platformsForged} integrated platforms over ${durationLabel(t.duration, t.totalRounds)}. The consolidation produced ${formatMoney(t.fev)} in equity value.`,
    (name, t, p) =>
      `Buy, tuck in, integrate. ${name} acquired ${p.totalAcquisitions} businesses and forged ${p.platformsForged} platforms, proving that consolidation creates value. Final FEV: ${formatMoney(t.fev)}.`,
    (name, t, p) =>
      `${name}'s roll-up playbook: ${p.tuckInCount} tuck-in acquisitions combined with standalone deals to build ${p.platformsForged} platforms over ${durationLabel(t.duration, t.totalRounds)}. Equity value: ${formatMoney(t.fev)}.`,
  ],

  focused_operator: [
    (name, t, p) =>
      `${name} took a concentrated approach: ${p.activeCount} businesses held with discipline over ${durationLabel(t.duration, t.totalRounds)}. Quality over quantity produced ${formatMoney(t.fev)} in equity value.`,
    (name, t, p) =>
      `Fewer businesses, deeper expertise. ${name} managed a focused portfolio of ${p.activeCount} companies across ${sectorCount(t.sectorFocus)}, generating ${formatMoney(t.fev)} in FEV over ${durationLabel(t.duration, t.totalRounds)}.`,
    (name, t) =>
      `${name} proved that restraint is a strategy. By concentrating in ${sectorCount(t.sectorFocus)} and compounding organically, the portfolio reached ${formatMoney(t.fev)} in equity value.`,
  ],

  conglomerate: [
    (name, t, p) =>
      `${name} built a diversified conglomerate: ${p.activeCount} businesses across ${sectorCount(t.sectorFocus)} over ${durationLabel(t.duration, t.totalRounds)}. The breadth of the portfolio produced ${formatMoney(t.fev)} in equity value.`,
    (name, t, p) =>
      `Scale through diversification. ${name} assembled ${p.activeCount} businesses spanning ${sectorCount(t.sectorFocus)}, trading sector depth for portfolio resilience. Final FEV: ${formatMoney(t.fev)}.`,
    (name, t, p) =>
      `${name}'s thesis was breadth: ${p.totalAcquisitions} acquisitions across ${sectorCount(t.sectorFocus)} sectors over ${durationLabel(t.duration, t.totalRounds)}, building a conglomerate worth ${formatMoney(t.fev)}.`,
  ],

  value_investor: [
    (name, t, p) =>
      `${name} was selective: just ${p.totalAcquisitions} acquisitions over ${durationLabel(t.duration, t.totalRounds)}, each chosen carefully. The patient approach produced ${formatMoney(t.fev)} in equity value.`,
    (name, t, p) =>
      `Patience defined ${name}. ${p.totalAcquisitions} deals in ${durationLabel(t.duration, t.totalRounds)} — buying only when the price was right. Final FEV: ${formatMoney(t.fev)}.`,
    (name, t) =>
      `${name} proved that discipline beats volume. A highly selective acquisition strategy in ${sectorCount(t.sectorFocus)} generated ${formatMoney(t.fev)} in founder equity over ${durationLabel(t.duration, t.totalRounds)}.`,
  ],

  balanced: [
    (name, t, p) =>
      `${name} took a balanced approach across all dimensions: ${p.totalAcquisitions} acquisitions, ${p.platformsForged} platforms, and ${formatMoney(t.fev)} in equity value over ${durationLabel(t.duration, t.totalRounds)}.`,
    (name, t) =>
      `No single strategy dominated ${name}'s approach. A diversified playbook spanning acquisitions, operations, and capital management produced ${formatMoney(t.fev)} in FEV over ${durationLabel(t.duration, t.totalRounds)}.`,
    (name, t, p) =>
      `${name} balanced growth with discipline: ${p.totalAcquisitions} deals, ${sectorCount(t.sectorFocus)} of focus, and a portfolio worth ${formatMoney(t.fev)} after ${durationLabel(t.duration, t.totalRounds)}.`,
  ],
};

// ── Special-case templates ───────────────────────────────────────────

function generateBankruptcyThesis(
  name: string,
  thesis: PlaybookData['thesis'],
  capital: PlaybookData['capital'],
): string {
  if (thesis.totalRounds <= 3) {
    return `${name} collapsed in year ${thesis.totalRounds}. An early bankruptcy — the portfolio never had time to stabilize. Peak leverage: ${capital.peakLeverage}x.`;
  }
  return `${name} went bankrupt in year ${thesis.totalRounds} of a ${thesis.duration === 'standard' ? '20' : '10'}-year game. ${capital.hasRestructured ? 'Restructuring couldn\'t save the portfolio.' : 'Leverage spiraled beyond recovery.'} Peak debt/EBITDA: ${capital.peakLeverage}x.`;
}

function generateInactiveGpThesis(
  name: string,
  thesis: PlaybookData['thesis'],
): string {
  return `${thesis.fundName ?? name} failed to deploy capital over ${durationLabel(thesis.duration, thesis.totalRounds)}. Zero acquisitions made — the fund sat idle while management fees eroded LP capital.`;
}

function generatePeThesis(
  name: string,
  thesis: PlaybookData['thesis'],
  portfolio: PlaybookData['portfolio'],
  peFund: NonNullable<PlaybookData['peFund']>,
): string {
  const moicStr = peFund.grossMoic.toFixed(1);
  const irrStr = (peFund.netIrr * 100).toFixed(1);
  return `${thesis.fundName ?? name} deployed ${formatMoney(peFund.totalFundSize)} across ${portfolio.totalAcquisitions} portfolio companies over ${durationLabel(thesis.duration, thesis.totalRounds)}, generating a ${moicStr}x gross MOIC and ${irrStr}% net IRR. Carried interest earned: ${formatMoney(peFund.carryEarned)}.`;
}

// ── Main export ──────────────────────────────────────────────────────

export function generateThesis(playbook: PlaybookData): string {
  const { thesis, portfolio, capital, operations } = playbook;
  const name = thesis.holdcoName;

  // Bankruptcy guard
  if (thesis.isBankrupt) {
    return generateBankruptcyThesis(name, thesis, capital);
  }

  // PE inactive guard
  if (thesis.archetype === 'inactive_gp') {
    return generateInactiveGpThesis(name, thesis);
  }

  // PE Fund mode
  if (thesis.isFundManager && playbook.peFund) {
    return generatePeThesis(name, thesis, portfolio, playbook.peFund);
  }

  // Standard archetype templates
  const templates = ARCHETYPE_TEMPLATES[thesis.archetype] ?? ARCHETYPE_TEMPLATES['balanced'];
  // Deterministic selection based on seed
  const idx = thesis.seed % templates.length;
  const base = templates[idx](name, thesis, portfolio, capital, operations);

  // Add conditional clause
  const clause = buildConditionalClauses(thesis, portfolio, capital, operations);

  return base + clause;
}

/** Get display name for an archetype */
export function getArchetypeDisplayName(archetype: string): string {
  if (archetype === 'bankrupt') return 'Bankrupt';
  if (archetype === 'inactive_gp') return 'Inactive GP';
  return ARCHETYPE_DISPLAY_NAMES[archetype] ?? 'The Operator';
}
