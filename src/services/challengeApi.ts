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

const SUBMIT_RETRIES = 3; // 3 retries + 1 initial = 4 total attempts
const SUBMIT_BACKOFF = [2000, 5000, 10000]; // ms delay before each retry

export async function submitChallengeResult(
  code: string,
  playerToken: string,
  result: PlayerResult,
  hostToken?: string,
): Promise<{ success: boolean; participantCount?: number; duplicate?: boolean }> {
  for (let attempt = 0; attempt <= SUBMIT_RETRIES; attempt++) {
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
      // Retry on 429 (rate limited) or 5xx (server error)
      if ((res.status === 429 || res.status >= 500) && attempt < SUBMIT_RETRIES) {
        await new Promise(r => setTimeout(r, SUBMIT_BACKOFF[attempt]));
        continue;
      }
      if (!res.ok) return { success: false };
      const data = await res.json();
      return { success: true, participantCount: data.participantCount };
    } catch {
      // Network error — retry if attempts remain
      if (attempt < SUBMIT_RETRIES) {
        await new Promise(r => setTimeout(r, SUBMIT_BACKOFF[attempt]));
        continue;
      }
      return { success: false };
    }
  }
  return { success: false };
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
