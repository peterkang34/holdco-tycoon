/**
 * Admin CRUD client for scenario challenges. Extracted from the old JSON-editor tab so the
 * new GUI builder (and the management list) share one typed client. No AI-generation here —
 * that authoring path is retired.
 */
import type { ScenarioChallengeConfig } from '../engine/types';

const BASE = '/api/admin/scenario-challenges';

/** Lightweight row shape the admin list endpoint returns (not the full config). */
export interface ScenarioSummary {
  id: string;
  name: string;
  tagline: string;
  theme: { emoji: string; color: string; era?: string };
  startDate: string;
  endDate: string;
  isActive: boolean;
  isFeatured: boolean;
  difficulty: string;
  duration: string;
  maxRounds: number;
  rankingMetric: string;
  isPE: boolean;
  configVersion: number;
}

export interface SaveResponse {
  scenario: ScenarioChallengeConfig;
  errors: string[];
  warnings: string[];
}

/** Carries the server's errors/warnings arrays so the UI can surface them inline. */
export class ApiError extends Error {
  errors?: string[];
  warnings?: string[];
  status?: number;
  constructor(message: string, data: { errors?: string[]; warnings?: string[]; status?: number } = {}) {
    super(message);
    this.errors = data.errors;
    this.warnings = data.warnings;
    this.status = data.status;
  }
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export async function fetchScenarios(token: string): Promise<ScenarioSummary[]> {
  const res = await fetch(BASE, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const data = await res.json();
  return data.scenarios ?? [];
}

export async function fetchScenario(token: string, id: string): Promise<ScenarioChallengeConfig> {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`get failed: ${res.status}`);
  const data = await res.json();
  return data.scenario;
}

export async function createScenario(token: string, config: ScenarioChallengeConfig): Promise<SaveResponse> {
  const res = await fetch(BASE, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(config) });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || `create failed: ${res.status}`, {
      errors: data.errors, warnings: data.warnings, status: res.status,
    });
  }
  return data;
}

export async function updateScenario(token: string, config: ScenarioChallengeConfig): Promise<SaveResponse> {
  const res = await fetch(BASE, { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(config) });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || `update failed: ${res.status}`, {
      errors: data.errors, warnings: data.warnings, status: res.status,
    });
  }
  return data;
}

export async function deleteScenario(token: string, id: string): Promise<void> {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders(token) });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
}

export async function clearPreviewRows(token: string, id: string): Promise<number> {
  const res = await fetch(`${BASE}/clear-preview?id=${encodeURIComponent(id)}`, {
    method: 'POST', headers: authHeaders(token),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `clear failed: ${res.status}`);
  return data.deletedCount ?? 0;
}

/**
 * Open an admin preview of a compiled config in a new tab. Uses a per-UUID sessionStorage
 * handoff (inherited by same-origin window.open) so rapid clicks don't collide; App.tsx
 * validates the payload before starting the preview game.
 */
export function openScenarioPreview(config: ScenarioChallengeConfig): void {
  const handoffId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(`scenario_preview_config:${handoffId}`, JSON.stringify(config));
  window.open(`/#/se-preview?h=${handoffId}`, '_blank');
}
