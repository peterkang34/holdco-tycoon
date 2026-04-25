/**
 * Scenario Challenges admin tab.
 *
 * Three surfaces, one component:
 *   1. AI generation input — describe a scenario in plain English; Haiku returns a draft config.
 *   2. Manual create — spawns a blank config template in the JSON editor.
 *   3. Existing scenarios list — shows active + archived, with edit/preview/activate/delete actions.
 *
 * Scope note: this ships with a raw JSON editor for Phase 3B.2 rather than the
 * full 4-step wizard spec'd in `plans/backlog/scenario-challenges.md` §7.1. The
 * wizard is polish — the JSON editor exposes every field, hands validation
 * errors back to the admin inline, and is the minimum-viable admin surface
 * for creating + iterating on scenarios. Wizard comes in Phase 3B.3 / 4.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  ScenarioChallengeConfig,
  ScenarioValidationResult,
} from '../../engine/types';
import { CURRENT_SCENARIO_CONFIG_VERSION, validateScenarioConfig } from '../../data/scenarioChallenges';

// ── Types ─────────────────────────────────────────────────────────────────

interface ScenarioSummary {
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

interface GenerateResponse {
  config: ScenarioChallengeConfig;
  errors: string[];
  warnings: string[];
  usage: { used: number; limit: number };
}

interface SaveResponse {
  scenario: ScenarioChallengeConfig;
  errors: string[];
  warnings: string[];
}

// ── Fetch helpers ─────────────────────────────────────────────────────────

const BASE = '/api/admin/scenario-challenges';

/**
 * Structured error thrown by the fetch helpers. Carries through the server's
 * `errors`/`warnings`/`usage` arrays so the UI can surface them inline — Dara H1
 * & H3 (prior 3B.2 review) fixed the data-loss where only `data.error` survived.
 */
class ApiError extends Error {
  errors?: string[];
  warnings?: string[];
  usage?: { used: number; limit: number };
  constructor(
    message: string,
    data: { errors?: string[]; warnings?: string[]; usage?: { used: number; limit: number } } = {},
  ) {
    super(message);
    this.errors = data.errors;
    this.warnings = data.warnings;
    this.usage = data.usage;
  }
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function fetchScenarios(token: string): Promise<ScenarioSummary[]> {
  const res = await fetch(BASE, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const data = await res.json();
  return data.scenarios ?? [];
}

async function fetchScenario(token: string, id: string): Promise<ScenarioChallengeConfig> {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`get failed: ${res.status}`);
  const data = await res.json();
  return data.scenario;
}

async function createScenario(token: string, config: ScenarioChallengeConfig): Promise<SaveResponse> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || `create failed: ${res.status}`, {
      errors: data.errors,
      warnings: data.warnings,
    });
  }
  return data;
}

async function updateScenario(token: string, config: ScenarioChallengeConfig): Promise<SaveResponse> {
  const res = await fetch(BASE, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || `update failed: ${res.status}`, {
      errors: data.errors,
      warnings: data.warnings,
    });
  }
  return data;
}

async function deleteScenario(token: string, id: string): Promise<void> {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
}

async function generateWithAI(token: string, description: string): Promise<GenerateResponse> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ description }),
  });
  const data = await res.json();
  if (!res.ok) {
    // 429/502/400 responses all carry `usage: { used, limit }`. Surface it so the
    // admin sees the current counter even on failure (plan says soft limit; cap
    // hit shouldn't leave them guessing when it resets).
    throw new ApiError(data.error || `generate failed: ${res.status}`, {
      errors: data.errors,
      warnings: data.warnings,
      usage: data.usage,
    });
  }
  return data;
}

async function clearPreviewRows(token: string, id: string): Promise<number> {
  const res = await fetch(`${BASE}/clear-preview?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `clear failed: ${res.status}`);
  return data.deletedCount ?? 0;
}

// ── Templates ─────────────────────────────────────────────────────────────

function blankConfigTemplate(): ScenarioChallengeConfig {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    id: 'new-scenario',
    name: 'New Scenario',
    tagline: 'Short hook for home banner',
    description: 'Longer narrative description shown on setup screen.',
    configVersion: CURRENT_SCENARIO_CONFIG_VERSION,
    theme: { emoji: '🎯', color: '#F59E0B' },
    startDate: now.toISOString(),
    endDate: thirtyDaysOut.toISOString(),
    isActive: false,
    isFeatured: false,
    seed: Math.floor(Math.random() * 1_000_000),
    difficulty: 'easy',
    duration: 'quick',
    maxRounds: 10,
    startingCash: 5000,
    startingDebt: 0,
    founderShares: 800,
    sharesOutstanding: 1000,
    startingBusinesses: [],
    rankingMetric: 'fev',
  };
}

// ── Main Component ────────────────────────────────────────────────────────

export function ScenarioChallengesTab({ token }: { token: string }) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editor state — null means no editor open.
  const [editing, setEditing] = useState<ScenarioChallengeConfig | null>(null);
  const [editingMode, setEditingMode] = useState<'create' | 'update'>('create');
  // Pre-populated server validation (from AI generate or last save) — surfaces
  // errors/warnings immediately when editor opens so admin doesn't have to click
  // Validate to see problems the server already found. Dara M1.
  const [editingValidation, setEditingValidation] = useState<ScenarioValidationResult | null>(null);

  // AI generation state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiUsage, setAiUsage] = useState<{ used: number; limit: number } | null>(null);

  // Phase 5 — Road to Carry preset seeding state
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult, setSeedResult] = useState<{ written: string[]; skipped: { id: string; reason: string }[] } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setScenarios(await fetchScenarios(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError('');
    try {
      const result = await generateWithAI(token, aiPrompt);
      setAiUsage(result.usage);
      setEditing(result.config);
      setEditingMode('create');
      // Pre-populate editor with server's validation so admin sees AI-config
      // problems immediately (Dara M1). Server ran validateScenarioConfig already.
      setEditingValidation({ errors: result.errors ?? [], warnings: result.warnings ?? [] });
      setAiPrompt('');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI generation failed');
      // Even on failure (429/502/400), the response carries a `usage` payload —
      // surface it so the admin sees their counter without a successful call. Dara H3.
      if (e instanceof ApiError && e.usage) setAiUsage(e.usage);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreateManual = () => {
    setEditing(blankConfigTemplate());
    setEditingMode('create');
    setEditingValidation(null);
  };

  const handleSeedPresets = async () => {
    setSeedLoading(true);
    setSeedResult(null);
    setError('');
    try {
      const res = await fetch('/api/admin/scenario-challenges/seed-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preset: 'road-to-carry' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Seed failed (${res.status})`);
      }
      const result = await res.json() as { written: string[]; skipped: { id: string; reason: string }[]; total: number };
      setSeedResult({ written: result.written, skipped: result.skipped });
      // Refresh scenario list so newly-seeded scenarios appear immediately.
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seed failed');
    } finally {
      setSeedLoading(false);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      const config = await fetchScenario(token, id);
      setEditing(config);
      setEditingMode('update');
      setEditingValidation(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scenario');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete scenario "${id}"? This removes config + leaderboard from KV but keeps completion history in Postgres.`)) return;
    try {
      await deleteScenario(token, id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleToggleActive = async (summary: ScenarioSummary) => {
    try {
      const full = await fetchScenario(token, summary.id);
      full.isActive = !full.isActive;
      await updateScenario(token, full);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const handleToggleFeatured = async (summary: ScenarioSummary) => {
    try {
      const full = await fetchScenario(token, summary.id);
      full.isFeatured = !full.isFeatured;
      await updateScenario(token, full);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const handlePreview = async (id: string) => {
    try {
      const config = await fetchScenario(token, id);
      // Per-click UUID keys the handoff so rapid Preview clicks don't collide
      // (Dara H2). sessionStorage is inherited by same-origin `window.open`, so
      // the preview tab reads its own scoped key — tab A and tab B never cross.
      const handoffId = crypto.randomUUID();
      sessionStorage.setItem(`scenario_preview_config:${handoffId}`, JSON.stringify(config));
      window.open(`/#/se-preview?h=${handoffId}`, '_blank');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    }
  };

  const handleClearPreview = async (id: string) => {
    if (!confirm(`Delete all admin-preview rows for scenario "${id}"?`)) return;
    try {
      const n = await clearPreviewRows(token, id);
      alert(`Deleted ${n} preview row${n === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    }
  };

  /**
   * Save handler returned to the editor. On success, refreshes the list and
   * returns the server's `{ errors, warnings }` arrays so the editor can
   * decide whether to auto-close (clean save) or stay open (warnings to show).
   * On error, re-throws with the structured `ApiError` so the editor gets the
   * server's detailed errors[] / warnings[] arrays (Dara H1).
   */
  const handleEditorSave = async (config: ScenarioChallengeConfig): Promise<SaveResponse> => {
    const saveFn = editingMode === 'create' ? createScenario : updateScenario;
    const result = await saveFn(token, config);
    await refresh();
    return result;
  };

  return (
    <div>
      {/* ── AI Generation ── */}
      <section className="card p-4 mb-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
          <span>AI Generate</span>
          {aiUsage && (
            <span className="text-[10px] text-text-muted font-normal">
              {aiUsage.used} / {aiUsage.limit} today
            </span>
          )}
        </h3>
        <textarea
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          placeholder='Describe your scenario, e.g., "A recession gauntlet: 3 distressed home-services businesses, $2M cash, $5M debt, forced recession in Y2 and credit crunch in Y4, no equity raises or IPO, 10 rounds Normal difficulty."'
          className="w-full rounded bg-bg-secondary border border-white/10 p-2 text-xs text-text-primary resize-y"
          rows={4}
          disabled={aiLoading}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleAIGenerate}
            disabled={aiLoading || !aiPrompt.trim()}
            className="px-3 py-1.5 rounded text-xs font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {aiLoading ? 'Generating…' : 'Generate'}
          </button>
          <button
            onClick={handleCreateManual}
            className="px-3 py-1.5 rounded text-xs font-medium bg-bg-secondary text-text-secondary hover:text-text-primary border border-white/10"
          >
            Or create manually
          </button>
          <button
            onClick={handleSeedPresets}
            disabled={seedLoading}
            className="px-3 py-1.5 rounded text-xs font-medium bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 ml-auto"
            title="Bulk-write the 5 Road to Carry case-study scenarios into KV. Idempotent — safe to re-run."
          >
            {seedLoading ? 'Seeding…' : 'Seed Road to Carry presets (5)'}
          </button>
          {aiError && <span className="text-xs text-danger">{aiError}</span>}
        </div>
        {seedResult && (
          <div className="text-[11px] text-text-muted mt-2">
            <strong className="text-accent">{seedResult.written.length}</strong> written
            {seedResult.skipped.length > 0 && (
              <> · <strong className="text-warning">{seedResult.skipped.length}</strong> skipped</>
            )}
            {seedResult.skipped.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-danger">
                {seedResult.skipped.map(s => (
                  <li key={s.id}><code>{s.id}</code>: {s.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ── Existing Scenarios ── */}
      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Scenarios ({scenarios.length})</h3>
          <button onClick={refresh} className="text-[11px] text-text-muted hover:text-accent" disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error && <div className="text-xs text-danger mb-2">{error}</div>}

        {scenarios.length === 0 && !loading && (
          <p className="text-xs text-text-muted py-4">No scenarios yet. Use AI Generate or click "Create manually" above.</p>
        )}

        {scenarios.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-text-muted border-b border-white/10">
                  <th className="py-1.5 pr-2">Scenario</th>
                  <th className="py-1.5 pr-2">Status</th>
                  <th className="py-1.5 pr-2">Mode</th>
                  <th className="py-1.5 pr-2">Dates</th>
                  <th className="py-1.5 pr-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <ScenarioRow
                    key={s.id}
                    summary={s}
                    onEdit={() => handleEdit(s.id)}
                    onDelete={() => handleDelete(s.id)}
                    onPreview={() => handlePreview(s.id)}
                    onToggleActive={() => handleToggleActive(s)}
                    onToggleFeatured={() => handleToggleFeatured(s)}
                    onClearPreview={() => handleClearPreview(s.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Editor Modal ── */}
      {editing && (
        <ScenarioEditor
          config={editing}
          mode={editingMode}
          initialValidation={editingValidation}
          onCancel={() => { setEditing(null); setEditingValidation(null); }}
          onSave={handleEditorSave}
          onClose={() => { setEditing(null); setEditingValidation(null); }}
        />
      )}
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function ScenarioRow(props: {
  summary: ScenarioSummary;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onToggleActive: () => void;
  onToggleFeatured: () => void;
  onClearPreview: () => void;
}) {
  const { summary: s } = props;
  const statusClass = s.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-text-muted';
  const statusLabel = s.isActive ? (s.isFeatured ? 'Live · Featured' : 'Live') : 'Archived';

  return (
    <tr className="border-b border-white/5 hover:bg-white/2">
      <td className="py-1.5 pr-2">
        <span className="mr-1">{s.theme?.emoji}</span>
        <span className="font-medium text-text-primary">{s.name}</span>
        <span className="text-text-muted ml-1.5">{s.id}</span>
      </td>
      <td className="py-1.5 pr-2">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${statusClass}`}>{statusLabel}</span>
      </td>
      <td className="py-1.5 pr-2">
        <span className="text-text-secondary">
          {s.isPE ? 'PE' : 'Holdco'} · {s.difficulty} · {s.duration} · {s.maxRounds}yr
        </span>
      </td>
      <td className="py-1.5 pr-2 text-text-muted font-mono text-[10px]">
        {s.startDate.slice(0, 10)} → {s.endDate.slice(0, 10)}
      </td>
      <td className="py-1.5 pr-2">
        <div className="flex gap-1 flex-wrap">
          <button onClick={props.onEdit} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary hover:text-accent">Edit</button>
          <button onClick={props.onPreview} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary hover:text-accent">Preview</button>
          <button onClick={props.onToggleActive} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary hover:text-accent">
            {s.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={props.onToggleFeatured} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary hover:text-accent">
            {s.isFeatured ? 'Unfeature' : 'Feature'}
          </button>
          <button onClick={props.onClearPreview} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary hover:text-warning">
            Clear Previews
          </button>
          <button onClick={props.onDelete} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary hover:text-danger">Delete</button>
        </div>
      </td>
    </tr>
  );
}

function ScenarioEditor(props: {
  config: ScenarioChallengeConfig;
  mode: 'create' | 'update';
  initialValidation?: ScenarioValidationResult | null;
  onCancel: () => void;
  onSave: (config: ScenarioChallengeConfig) => Promise<SaveResponse>;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(props.config, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  // Pre-populate validation from server output (AI generate, previous save)
  // so admin sees errors/warnings without first clicking Validate. Dara M1.
  const [validation, setValidation] = useState<ScenarioValidationResult | null>(
    props.initialValidation ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [serverSaveResult, setServerSaveResult] = useState<SaveResponse | null>(null);

  /** Parse + client-side validate. Returns the parsed config on success, null on parse error. */
  const handleValidate = (): ScenarioChallengeConfig | null => {
    setParseError(null);
    setValidation(null);
    setSaveError('');
    setServerSaveResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON');
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setParseError('Config must be a JSON object');
      return null;
    }
    // Client-side validation mirrors the server — same function, same rules.
    // Server will re-validate on save; this is just the fast feedback loop.
    const config = parsed as ScenarioChallengeConfig;
    setValidation(validateScenarioConfig(config));
    return config;
  };

  const handleSave = async () => {
    const parsed = handleValidate();
    if (!parsed) return;

    // Confirm before saving a draft with visible errors (Dara M2). The server
    // accepts drafts-with-errors (activation is the gate), but admin should
    // acknowledge they're stashing broken config that can't be activated yet.
    const clientValidation = validateScenarioConfig(parsed);
    if (clientValidation.errors.length > 0) {
      const proceed = window.confirm(
        `${clientValidation.errors.length} validation error(s). Save as draft anyway? (Cannot activate until fixed.)`,
      );
      if (!proceed) return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const result = await props.onSave(parsed);
      setServerSaveResult(result);
      // Refresh validation from server response — may differ from client if validators drift.
      setValidation({ errors: result.errors ?? [], warnings: result.warnings ?? [] });
      // Auto-close only when server returns a clean result (zero errors, zero warnings).
      // Otherwise keep the editor open so admin can review. Dara H1.
      const clean = (!result.errors || result.errors.length === 0) && (!result.warnings || result.warnings.length === 0);
      if (clean) props.onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
      // Server's structured errors/warnings (Dara H1) — surface inline.
      if (e instanceof ApiError) {
        setValidation({
          errors: e.errors ?? [],
          warnings: e.warnings ?? [],
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-primary border border-white/10 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-sm font-semibold">
            {props.mode === 'create' ? 'Create Scenario' : 'Edit Scenario'}
          </h3>
          <button onClick={props.onCancel} className="text-xs text-text-muted hover:text-text-primary">Close</button>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full h-96 rounded bg-bg-secondary border border-white/10 p-2 text-[11px] font-mono text-text-primary resize-y"
            spellCheck={false}
          />

          {parseError && (
            <div className="mt-2 p-2 rounded bg-danger/10 border border-danger/20 text-xs text-danger">
              JSON parse error: {parseError}
            </div>
          )}

          {validation && (
            <div className="mt-2 space-y-1">
              {validation.errors.length > 0 && (
                <div className="p-2 rounded bg-danger/10 border border-danger/20 text-xs text-danger">
                  <div className="font-semibold mb-1">Errors ({validation.errors.length}):</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="p-2 rounded bg-warning/10 border border-warning/20 text-xs text-warning">
                  <div className="font-semibold mb-1">Warnings ({validation.warnings.length}):</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              {validation.errors.length === 0 && validation.warnings.length === 0 && (
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                  ✓ No validation issues.
                </div>
              )}
            </div>
          )}

          {saveError && (
            <div className="mt-2 p-2 rounded bg-danger/10 border border-danger/20 text-xs text-danger">
              {saveError}
            </div>
          )}

          {serverSaveResult && !saveError && (
            <div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              ✓ Saved. {serverSaveResult.warnings && serverSaveResult.warnings.length > 0
                ? 'Review warnings above before activating.'
                : 'Clean save — safe to activate.'}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          <button
            onClick={props.onCancel}
            className="px-3 py-1.5 rounded text-xs bg-bg-secondary text-text-secondary hover:text-text-primary border border-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleValidate}
            className="px-3 py-1.5 rounded text-xs bg-bg-secondary text-text-secondary hover:text-accent border border-white/10"
          >
            Validate
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded text-xs font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
