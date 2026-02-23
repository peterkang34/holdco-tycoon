/**
 * Centralized registry for mechanic descriptions displayed in UI.
 * Single source of truth — components import from here, never hardcode.
 *
 * Style rules:
 *  - Year abbreviation: "yr" (not "y", not "rem")
 *  - Countdown word: "left" (not "rem")
 *  - Behavior verb: "auto-pays" (plain English, no jargon)
 */

export const DEBT_LABELS = {
  holdco: {
    name: 'Holdco Loan',
    behavior: 'Auto-pays equal annual installments (balance ÷ remaining years) + manual prepay',
    summaryShort: 'Auto-paying',
  },
  sellerNote: {
    name: 'Seller Note',
    behavior: 'Auto-pays equal annual installments (balance ÷ remaining years)',
    summaryShort: 'Auto-paying',
  },
  bankDebt: {
    name: 'Bank Debt',
    behavior: 'Auto-pays equal annual installments (balance ÷ remaining years) + voluntary prepay',
    summaryShort: 'Auto-paying',
  },
} as const;

export const EV_WATERFALL_LABELS = {
  bankDebt: 'Bank Debt (Holdco + Opco)',
  sellerNotes: 'Opco Seller Notes',
} as const;

export const DEBT_EXPLAINER =
  'All debt (holdco loan, seller notes, and bank debt) auto-pays equal annual installments: each year you pay (remaining balance ÷ years left) in principal, plus interest on the current balance. ' +
  'Holdco and bank debt can also be paid down early in the Capital tab. ' +
  'If cash is short, interest is paid first and the loan extends until fully repaid.';

export function debtCountdownLabel(yearsLeft: number): string {
  if (yearsLeft <= 0) return 'overdue';
  return `${yearsLeft}yr left`;
}

export function earnoutTargetLabel(targetPct: number): string {
  return `if ${Math.round(targetPct * 100)}%+ growth`;
}

export function earnoutCountdownLabel(yearsLeft: number): string {
  if (yearsLeft <= 0) return 'overdue';
  return `${yearsLeft}yr left`;
}

export const BANNED_COPY_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  reason: string;
  allow?: readonly string[];
}> = [
  { pattern: /paid on exit/i, reason: 'All debt auto-pays. Legacy bug.' },
  { pattern: /paid on sale/i, reason: 'All debt auto-pays. Legacy bug.' },
  { pattern: /paid at exit/i, reason: 'All debt auto-pays. Legacy bug.' },
  { pattern: /10%\/yr/i, reason: 'Holdco is balance÷remaining, not fixed 10%.' },
  { pattern: /10% of the balance/i, reason: 'Same — straight-line, not fixed 10%.' },
  { pattern: /interest.only/i, reason: 'Removed in v19. All debt amortizes.', allow: ['changelog.ts'] },
  { pattern: /balloon payment/i, reason: 'No balloon payments in the game.' },
  { pattern: /paid down voluntarily/i, reason: 'Changed to "paid down early" in v20. More concise.' },
  { pattern: /recurring.*bonus.*platform|platform.*recurring.*bonus/i, reason: 'Platform bonuses are ONE-TIME mutations at forge time.' },
  { pattern: /grace period/i, reason: 'Grace period not implemented in engine. Holdco amortizes from round 1.' },
  { pattern: /growth permanently reduced/i, reason: 'Integration growth drag is now proportional and decaying, not permanent. Changed in v26.' },
];
