/**
 * Operator's Playbook — Share utilities
 */

import type { PlaybookData } from '../engine/types';
import { formatMoney } from '../engine/utils';
import { generateThesis, getArchetypeDisplayName } from './playbookThesis';

/** Build a shareable playbook URL from a share ID */
export function buildPlaybookUrl(shareId: string): string {
  return `${window.location.origin}/?pb=${shareId}`;
}

/** Parse ?pb=SHARE_ID from current URL */
export function parsePlaybookFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const pb = params.get('pb');
  if (pb && /^[a-f0-9]{12}$/.test(pb)) return pb;
  return null;
}

/** Clean the ?pb= param from the URL without reload */
export function cleanPlaybookUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pb');
  window.history.replaceState({}, '', url.toString());
}

/** Generate a text summary for clipboard sharing */
export function buildPlaybookSummary(playbook: PlaybookData): string {
  const { thesis } = playbook;
  const thesisText = generateThesis(playbook);
  const archName = getArchetypeDisplayName(thesis.archetype);
  const mode = `${thesis.difficulty === 'normal' ? 'Hard' : 'Easy'}-${thesis.duration === 'standard' ? '20' : '10'}`;

  return [
    `${thesis.holdcoName} — ${archName}`,
    `Grade: ${thesis.grade} | FEV: ${formatMoney(thesis.fev)} | Score: ${thesis.score}/100`,
    `Mode: ${mode}${thesis.isFundManager ? ' PE Fund' : ''}`,
    '',
    thesisText,
    '',
    'Built in Holdco Tycoon — game.holdcoguide.com',
  ].join('\n');
}

/** Copy playbook link to clipboard, with Web Share API fallback on mobile */
export async function sharePlaybook(shareId: string, playbook: PlaybookData): Promise<boolean> {
  const url = buildPlaybookUrl(shareId);
  const summary = buildPlaybookSummary(playbook);

  // Try Web Share API on mobile
  if ('share' in navigator) {
    try {
      await navigator.share({
        title: `${playbook.thesis.holdcoName} — Strategy Debrief`,
        text: summary,
        url,
      });
      return true;
    } catch {
      // User cancelled or API failed — fall through to clipboard
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/** Copy text summary to clipboard */
export async function copyPlaybookSummary(playbook: PlaybookData): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildPlaybookSummary(playbook));
    return true;
  } catch {
    return false;
  }
}
