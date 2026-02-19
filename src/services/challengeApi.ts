import type { PlayerResult } from '../utils/challenge';

const BASE = '/api/challenge?action=';

export interface ChallengeParticipant {
  name: string;
  isYou: boolean;
  result?: {
    name: string;
    fev: number;
    score: number;
    grade: string;
    businesses: number;
    sectors: number;
    peakLeverage: number;
    restructured: boolean;
    totalDistributions: number;
    submittedAt: string;
  };
}

export interface ChallengeRevealedResult {
  name: string;
  fev: number;
  score: number;
  grade: string;
  businesses: number;
  sectors: number;
  peakLeverage: number;
  restructured: boolean;
  totalDistributions: number;
  submittedAt: string;
  isYou: boolean;
}

export interface ChallengeStatusUnrevealed {
  revealed: false;
  participants: ChallengeParticipant[];
  participantCount: number;
}

export interface ChallengeStatusRevealed {
  revealed: true;
  revealedAt: string;
  results: ChallengeRevealedResult[];
  participantCount: number;
}

export type ChallengeStatus = ChallengeStatusUnrevealed | ChallengeStatusRevealed;

export async function submitChallengeResult(
  code: string,
  playerToken: string,
  result: PlayerResult,
  hostToken?: string,
): Promise<{ success: boolean; participantCount?: number; duplicate?: boolean }> {
  try {
    const res = await fetch(`${BASE}submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, playerToken, result, hostToken }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      return { success: true, duplicate: true, participantCount: data.participantCount };
    }
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: true, participantCount: data.participantCount };
  } catch {
    return { success: false };
  }
}

export async function getChallengeStatus(
  code: string,
  playerToken: string,
): Promise<ChallengeStatus | null> {
  try {
    const res = await fetch(
      `${BASE}status&code=${encodeURIComponent(code)}&playerToken=${encodeURIComponent(playerToken)}`,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function revealChallengeScores(
  code: string,
  hostToken: string,
  hostPlayerToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, hostToken, hostPlayerToken }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || 'Failed to reveal' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Network error' };
  }
}
