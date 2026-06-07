/**
 * Scenario Builder — the GUI pick-and-select authoring tool that replaces the old raw-JSON
 * editor. Two surfaces: a Manager (list existing scenarios + lifecycle actions) and a sectioned
 * builder form that edits a ScenarioDraft, shows a live preview + validation, and saves via the
 * compiler (draft → ScenarioChallengeConfig → validate → CRUD).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  ScenarioChallengeConfig, SectorId, GameDuration, RankingMetric, MaSourcingMode,
  DisabledFeatureKey, MASourcingTier, EventType, StartingBusinessConfig, ForcedEvent,
} from '../../engine/types';
import { validateScenarioConfig, FUND_STRUCTURE_PRESETS } from '../../data/scenarioChallenges';
import { type ScenarioDraft, blankDraft } from '../../data/scenarioBuilder/draftModel';
import { compileScenarioDraft, decompileConfig } from '../../data/scenarioBuilder/compileDraft';
import {
  SECTOR_OPTIONS, rankingMetricOptions, MA_SOURCING_MODE_OPTIONS, FEATURE_TOGGLE_OPTIONS,
  CONSTRAINT_PACKS, FORCED_EVENT_OPTIONS, EVENT_REQUIRES_SECTOR,
  subTypesForSector, SOURCING_STRENGTH_OPTIONS,
} from '../../data/scenarioBuilder/builderOptions';
import {
  type ScenarioSummary, ApiError, fetchScenarios, fetchScenario, createScenario,
  updateScenario, deleteScenario, openScenarioPreview, draftNarrative,
} from '../../services/scenarioAdminApi';
import { SCENARIO_TEMPLATES } from '../../data/scenarioBuilder/templates';
import { getRandomBusinessName } from '../../data/names';

const toM = (thousands: number) => Math.round((thousands / 1000) * 100) / 100;
const fromM = (m: number) => Math.round(m * 1000);
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors';
const labelCls = 'block text-xs font-medium text-text-secondary mb-1';

export function ScenarioBuilderTab({ token }: { token: string }) {
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [draft, setDraft] = useState<ScenarioDraft>(() => blankDraft());
  const [editingExistingId, setEditingExistingId] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setListError(null);
    try { setScenarios(await fetchScenarios(token)); }
    catch (e) { setListError(e instanceof Error ? e.message : 'failed to load'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── Live compile + validation ──
  const compiled = useMemo<ScenarioChallengeConfig | null>(() => {
    try { return compileScenarioDraft(draft); } catch { return null; }
  }, [draft]);
  const validation = useMemo(() => {
    if (!compiled) return { errors: ['Config could not be compiled.'], warnings: [] };
    return validateScenarioConfig(compiled);
  }, [compiled]);
  const isPE = !!draft.fundStructure;

  const set = useCallback((patch: Partial<ScenarioDraft>) => setDraft((d) => ({ ...d, ...patch })), []);

  // ── AI: draft narrative TEXT only (tagline/description/name) from the chosen vectors ──
  const [aiBusy, setAiBusy] = useState(false);
  async function draftAI() {
    setAiBusy(true); setSaveErrors([]);
    try {
      const sectorLabel = (id: SectorId) => SECTOR_OPTIONS.find((o) => o.value === id)?.label ?? id;
      const summary = {
        name: draft.name,
        difficulty: draft.difficulty,
        durationYears: draft.maxRounds,
        isPE: !!draft.fundStructure,
        sectors: (draft.allowedSectors ?? []).map(sectorLabel),
        interestRatePct: draft.startingInterestRate != null ? Math.round(draft.startingInterestRate * 100) : undefined,
        startingBusinesses: draft.startingBusinesses.map((b) => `Q${b.quality} ${b.subType ?? sectorLabel(b.sectorId)}, $${toM(b.ebitda)}M EBITDA`),
        forcedEvents: Object.entries(draft.forcedEvents ?? {}).map(([r, e]) => `${e.type} in year ${r}`),
        rankingMetric: draft.rankingMetric,
      };
      const out = await draftNarrative(token, summary);
      set({
        tagline: out.tagline || draft.tagline,
        description: out.description || draft.description,
        // Only adopt an AI name if the admin hasn't named it (or left the default).
        ...(out.name && (!draft.name || draft.name === 'New Scenario') ? { name: out.name, id: editingExistingId ? draft.id : slugify(out.name) } : {}),
      });
    } catch (e) {
      setSaveErrors([e instanceof Error ? e.message : 'AI draft failed']);
    } finally { setAiBusy(false); }
  }

  // ── Manager actions ──
  function startNew(build?: () => ScenarioDraft) {
    setDraft(build ? build() : blankDraft()); setEditingExistingId(null);
    setSaveErrors([]); setSaveMsg(null); setView('builder');
  }
  async function startEdit(id: string) {
    try {
      const cfg = await fetchScenario(token, id);
      setDraft(decompileConfig(cfg)); setEditingExistingId(id);
      setSaveErrors([]); setSaveMsg(null); setView('builder');
    } catch (e) { setListError(e instanceof Error ? e.message : 'failed to load scenario'); }
  }
  async function startDuplicate(id: string) {
    try {
      const cfg = await fetchScenario(token, id);
      const d = decompileConfig(cfg);
      const existing = new Set(scenarios.map((s) => s.id));
      let newId = `${cfg.id}-copy`, n = 2;
      while (existing.has(newId)) newId = `${cfg.id}-copy-${n++}`;
      d.id = newId; d.name = `${cfg.name} (copy)`; d.isActive = false; d.isFeatured = false;
      // A copy is a fresh, unpublished draft — never inherit the source's publish stamp
      // (it rides in passthrough since the GUI doesn't model it).
      if (d.passthrough) { const { publishedAt: _drop, ...rest } = d.passthrough as Record<string, unknown>; d.passthrough = Object.keys(rest).length ? rest : undefined; }
      setDraft(d); setEditingExistingId(null);
      setSaveErrors([]); setSaveMsg(null); setView('builder');
    } catch (e) { setListError(e instanceof Error ? e.message : 'failed to duplicate'); }
  }
  async function toggleActive(s: ScenarioSummary) {
    try {
      const cfg = await fetchScenario(token, s.id);
      await updateScenario(token, { ...cfg, isActive: !s.isActive });
      await refresh();
    } catch (e) { setListError(e instanceof Error ? e.message : 'failed'); }
  }
  async function remove(id: string) {
    if (!confirm(`Delete scenario "${id}"? This removes its leaderboard.`)) return;
    try { await deleteScenario(token, id); await refresh(); }
    catch (e) { setListError(e instanceof Error ? e.message : 'failed to delete'); }
  }

  // ── Save ──
  async function save(activate: boolean) {
    if (!compiled) { setSaveErrors(['Config could not be compiled.']); return; }
    const toSave: ScenarioChallengeConfig = { ...compiled, isActive: activate || compiled.isActive };
    if ((activate || toSave.isActive) && validation.errors.length > 0) {
      setSaveErrors(['Fix all errors before activating.', ...validation.errors]); return;
    }
    setSaving(true); setSaveErrors([]); setSaveMsg(null);
    try {
      const fn = editingExistingId ? updateScenario : createScenario;
      await fn(token, toSave);
      setSaveMsg('Saved.'); await refresh();
      if (!editingExistingId) setEditingExistingId(toSave.id);
      set({ isActive: toSave.isActive });
    } catch (e) {
      if (e instanceof ApiError) {
        const dup = e.status === 409 ? ['This id already exists — change the name/id or use Duplicate.'] : [];
        setSaveErrors([e.message, ...dup, ...(e.errors ?? [])]);
      } else setSaveErrors([e instanceof Error ? e.message : 'save failed']);
    } finally { setSaving(false); }
  }

  if (view === 'list') {
    return (
      <Manager
        scenarios={scenarios} loading={loading} error={listError}
        onNew={() => startNew()} onPickTemplate={(build) => startNew(build)}
        onEdit={startEdit} onDuplicate={startDuplicate}
        onToggleActive={toggleActive} onDelete={remove}
        onPreview={async (id) => { try { openScenarioPreview(await fetchScenario(token, id)); } catch { /* ignore */ } }}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
      {/* ── Builder form ── */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => setView('list')} className="text-xs text-text-muted hover:text-text-secondary">← Back to list</button>
          <div className="flex gap-2">
            <button onClick={() => void save(false)} disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 disabled:opacity-50">Save draft</button>
            <button onClick={() => void save(true)} disabled={saving || validation.errors.length > 0}
              className="text-xs px-3 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 disabled:opacity-50">
              {editingExistingId ? 'Save & activate' : 'Create & activate'}</button>
          </div>
        </div>

        {(saveErrors.length > 0) && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-xs text-danger space-y-1">
            {saveErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
        {saveMsg && <div className="rounded-lg bg-accent/10 border border-accent/20 p-3 text-xs text-accent">{saveMsg}</div>}

        <Section title="① Identity & Run">
          <div className="flex justify-end mb-2">
            <button type="button" onClick={() => void draftAI()} disabled={aiBusy}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-50">
              {aiBusy ? 'Drafting…' : '✨ Draft tagline + description with AI'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name"><input className={inputCls} value={draft.name}
              onChange={(e) => set({ name: e.target.value, id: editingExistingId ? draft.id : slugify(e.target.value) })} /></Field>
            <Field label="Scenario ID (URL key)"><input className={inputCls} value={draft.id}
              disabled={!!editingExistingId} onChange={(e) => set({ id: slugify(e.target.value) })} /></Field>
            <Field label="Tagline (banner hook)"><input className={inputCls} value={draft.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
            <Field label="Emoji"><input className={inputCls} value={draft.themeEmoji} onChange={(e) => set({ themeEmoji: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Description"><textarea className={inputCls} rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field></div>
            <Field label="Start date"><input type="datetime-local" className={inputCls}
              value={toLocalInput(draft.startDate)} onChange={(e) => set({ startDate: fromLocalInput(e.target.value) })} /></Field>
            <Field label="End date"><input type="datetime-local" className={inputCls}
              value={toLocalInput(draft.endDate)} onChange={(e) => set({ endDate: fromLocalInput(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={draft.isFeatured} onChange={(e) => set({ isFeatured: e.target.checked })} /> Featured on home banner</label>
          </div>
        </Section>

        <Section title="② The Setup">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Length">
              <select className={inputCls} value={draft.duration}
                onChange={(e) => { const dur = e.target.value as GameDuration; set({ duration: dur, maxRounds: dur === 'quick' ? 10 : 20 }); }}>
                <option value="quick">Quick (10 years)</option>
                <option value="standard">Standard (20 years)</option>
              </select>
            </Field>
            <Field label={`Years: ${draft.maxRounds}`}><input type="range" min={3} max={30} className="w-full" value={draft.maxRounds} onChange={(e) => set({ maxRounds: Number(e.target.value) })} /></Field>
            <Field label="Starting cash ($M)"><input type="number" step={0.5} className={inputCls} value={toM(draft.startingCash)} disabled={isPE}
              onChange={(e) => set({ startingCash: fromM(Number(e.target.value)) })} /></Field>
            <Field label="Starting debt ($M)"><input type="number" step={0.5} className={inputCls} value={toM(draft.startingDebt)} disabled={isPE}
              onChange={(e) => set({ startingDebt: fromM(Number(e.target.value)) })} /></Field>
            <Field label={`Your starting ownership: ${ownershipPct(draft)}%`}>
              <input type="range" min={1} max={100} className="w-full" value={ownershipPct(draft)}
                onChange={(e) => set({ founderShares: Math.round((Number(e.target.value) / 100) * draft.sharesOutstanding) })} />
            </Field>
            <Field label={`Starting interest rate: ${draft.startingInterestRate != null ? (draft.startingInterestRate * 100).toFixed(0) + '%' : 'market default'}`}>
              <input type="range" min={0} max={25} className="w-full"
                value={draft.startingInterestRate != null ? Math.round(draft.startingInterestRate * 100) : 7}
                onChange={(e) => set({ startingInterestRate: Number(e.target.value) / 100 })} />
            </Field>
          </div>
          <StartingBusinesses draft={draft} set={set} />
        </Section>

        <Section title="③ The Playing Field">
          <Field label="Sectors in play (none selected = all allowed)">
            <div className="flex flex-wrap gap-1.5">
              {SECTOR_OPTIONS.map((opt) => {
                const selected = draft.allowedSectors?.includes(opt.value) ?? false;
                return (
                  <button key={opt.value} type="button"
                    onClick={() => toggleSector(draft, set, opt.value)}
                    className={`text-[11px] px-2 py-1 rounded border transition-colors ${selected ? 'border-accent bg-accent/10 text-accent' : 'border-white/10 bg-white/5 text-text-muted hover:border-white/30'}`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <Field label="Deal flow">
              <select className={inputCls} value={draft.maSourcingMode ?? 'random'} onChange={(e) => set({ maSourcingMode: e.target.value as MaSourcingMode })}>
                {MA_SOURCING_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Deal flow strength (targets/year)">
              <select className={inputCls} value={draft.startingMaSourcingTier ?? 0}
                onChange={(e) => set({ startingMaSourcingTier: Number(e.target.value) as MASourcingTier })}>
                {SOURCING_STRENGTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Ranking metric">
              <select className={inputCls} value={draft.rankingMetric} onChange={(e) => set({ rankingMetric: e.target.value as RankingMetric })}>
                {rankingMetricOptions(isPE).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Constraint packs">
            <div className="flex flex-wrap gap-1.5">
              {CONSTRAINT_PACKS.map((pack) => (
                <button key={pack.id} type="button" title={pack.help}
                  onClick={() => applyPack(draft, set, pack.disables)}
                  className="text-[11px] px-2 py-1 rounded border border-white/10 bg-white/5 text-text-muted hover:border-accent hover:text-accent">
                  + {pack.label}
                </button>
              ))}
              {draft.disabledFeatures && Object.keys(draft.disabledFeatures).length > 0 && (
                <button type="button" onClick={() => set({ disabledFeatures: undefined })}
                  className="text-[11px] px-2 py-1 rounded border border-danger/30 text-danger">Clear all</button>
              )}
            </div>
          </Field>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {FEATURE_TOGGLE_OPTIONS.map((o) => {
              const off = draft.disabledFeatures?.[o.value] === true;
              return (
                <button key={o.value} type="button" onClick={() => toggleFeature(draft, set, o.value)}
                  className={`text-[11px] px-2 py-1 rounded border transition-colors ${off ? 'border-danger/40 bg-danger/10 text-danger line-through' : 'border-white/10 bg-white/5 text-text-muted hover:border-white/30'}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="④ Twists (optional)">
          <PEFundMode draft={draft} set={set} />
          <ForcedEvents draft={draft} set={set} />
        </Section>
      </div>

      {/* ── Live preview rail ── */}
      <PreviewRail draft={draft} compiled={compiled} validation={validation}
        onPreviewPlay={() => compiled && validation.errors.length === 0 && openScenarioPreview({ ...compiled, isActive: false })} />
    </div>
  );
}

// ── helpers (pure) ──
function ownershipPct(d: ScenarioDraft) { return Math.round((d.founderShares / d.sharesOutstanding) * 100); }
function toLocalInput(iso: string) { try { return new Date(iso).toISOString().slice(0, 16); } catch { return ''; } }
function fromLocalInput(v: string) { return v ? new Date(v).toISOString() : new Date().toISOString(); }
function toggleSector(d: ScenarioDraft, set: (p: Partial<ScenarioDraft>) => void, id: SectorId) {
  const cur = d.allowedSectors ?? [];
  const next = cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id];
  set({ allowedSectors: next.length === 0 ? undefined : next });
}
function toggleFeature(d: ScenarioDraft, set: (p: Partial<ScenarioDraft>) => void, key: DisabledFeatureKey) {
  const cur = { ...(d.disabledFeatures ?? {}) };
  if (cur[key]) delete cur[key]; else cur[key] = true;
  set({ disabledFeatures: Object.keys(cur).length === 0 ? undefined : cur });
}
function applyPack(d: ScenarioDraft, set: (p: Partial<ScenarioDraft>) => void, keys: readonly DisabledFeatureKey[]) {
  const cur = { ...(d.disabledFeatures ?? {}) };
  for (const k of keys) cur[k] = true;
  set({ disabledFeatures: cur });
}

// ── Sub-components ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className={labelCls}>{label}</span>{children}</div>;
}

function StartingBusinesses({ draft, set }: { draft: ScenarioDraft; set: (p: Partial<ScenarioDraft>) => void }) {
  const biz = draft.startingBusinesses;
  const update = (i: number, patch: Partial<StartingBusinessConfig>) =>
    set({ startingBusinesses: biz.map((b, k) => (k === i ? { ...b, ...patch } : b)) });
  return (
    <div className="mt-3">
      <span className={labelCls}>Starting portfolio ({biz.length})</span>
      <div className="space-y-2">
        {biz.map((b, i) => (
          <div key={i} className="rounded-lg border border-white/10 p-2 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Name">
                <div className="flex gap-1">
                  <input className={inputCls} value={b.name} onChange={(e) => update(i, { name: e.target.value })} />
                  <button type="button" title="Generate a name for this sector/sub-sector"
                    onClick={() => update(i, { name: getRandomBusinessName(b.sectorId, b.subType) })}
                    className="shrink-0 px-2 rounded-lg border border-white/10 hover:border-accent hover:text-accent">🎲</button>
                </div>
              </Field>
              <Field label="Sector">
                <select className={inputCls} value={b.sectorId}
                  onChange={(e) => update(i, { sectorId: e.target.value as SectorId, subType: undefined })}>
                  {SECTOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <Field label="Sub-sector">
                <select className={inputCls} value={b.subType ?? ''} onChange={(e) => update(i, { subType: e.target.value || undefined })}>
                  <option value="">— any —</option>
                  {subTypesForSector(b.sectorId).map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </Field>
              <Field label="EBITDA ($M)"><input type="number" step={0.1} className={inputCls} value={toM(b.ebitda)} onChange={(e) => update(i, { ebitda: fromM(Number(e.target.value)) })} /></Field>
              <Field label="Multiple"><input type="number" step={0.5} className={inputCls} value={b.multiple} onChange={(e) => update(i, { multiple: Number(e.target.value) })} /></Field>
              <Field label="Quality"><select className={inputCls} value={b.quality} onChange={(e) => update(i, { quality: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })}>
                {[1, 2, 3, 4, 5].map((q) => <option key={q} value={q}>Q{q}</option>)}</select></Field>
            </div>
            <button type="button" onClick={() => set({ startingBusinesses: biz.filter((_, k) => k !== i) })}
              className="text-[11px] px-2 py-1 rounded border border-danger/30 text-danger">Remove business</button>
          </div>
        ))}
      </div>
      <button type="button"
        onClick={() => set({ startingBusinesses: [...biz, { name: 'New Business', sectorId: 'agency', ebitda: 800, multiple: 4, quality: 3 }] })}
        className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-accent hover:text-accent">+ Add business</button>
      {biz.length === 0 && <p className="text-[11px] text-text-muted mt-1">Capital-only start (player builds from scratch).</p>}
    </div>
  );
}

function PEFundMode({ draft, set }: { draft: ScenarioDraft; set: (p: Partial<ScenarioDraft>) => void }) {
  const on = !!draft.fundStructure;
  return (
    <div className="mb-4">
      <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <input type="checkbox" checked={on} onChange={(e) => {
          if (e.target.checked) set({ fundStructure: { ...FUND_STRUCTURE_PRESETS.traditional_pe }, rankingMetric: 'moic', startingCash: 0, startingDebt: 0 });
          else set({ fundStructure: undefined, rankingMetric: 'fev' });
        }} /> 🏦 PE Fund Mode (commit LP capital, earn carry)
      </label>
      {on && draft.fundStructure && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
          <Field label="Committed ($M)"><input type="number" className={inputCls} value={toM(draft.fundStructure.committedCapital)}
            onChange={(e) => set({ fundStructure: { ...draft.fundStructure!, committedCapital: fromM(Number(e.target.value)) } })} /></Field>
          <Field label="Mgmt fee %"><input type="number" step={0.5} className={inputCls} value={draft.fundStructure.mgmtFeePercent * 100}
            onChange={(e) => set({ fundStructure: { ...draft.fundStructure!, mgmtFeePercent: Number(e.target.value) / 100 } })} /></Field>
          <Field label="Hurdle %"><input type="number" step={0.5} className={inputCls} value={draft.fundStructure.hurdleRate * 100}
            onChange={(e) => set({ fundStructure: { ...draft.fundStructure!, hurdleRate: Number(e.target.value) / 100 } })} /></Field>
          <Field label="Carry %"><input type="number" step={1} className={inputCls} value={draft.fundStructure.carryRate * 100}
            onChange={(e) => set({ fundStructure: { ...draft.fundStructure!, carryRate: Number(e.target.value) / 100 } })} /></Field>
          <Field label="Liquidation year"><input type="number" min={2} max={draft.maxRounds} className={inputCls}
            value={draft.fundStructure.forcedLiquidationYear ?? draft.maxRounds}
            onChange={(e) => set({ fundStructure: { ...draft.fundStructure!, forcedLiquidationYear: Number(e.target.value) } })} /></Field>
          <Field label="Liquidation haircut (×)"><input type="number" step={0.05} min={0.5} max={1} className={inputCls} value={draft.fundStructure.forcedLiquidationDiscount}
            onChange={(e) => set({ fundStructure: { ...draft.fundStructure!, forcedLiquidationDiscount: Number(e.target.value) } })} /></Field>
        </div>
      )}
    </div>
  );
}

function ForcedEvents({ draft, set }: { draft: ScenarioDraft; set: (p: Partial<ScenarioDraft>) => void }) {
  const events = draft.forcedEvents ?? {};
  const rounds = Object.keys(events).map(Number).sort((a, b) => a - b);
  const addAt = (round: number) => {
    if (events[round]) return;
    set({ forcedEvents: { ...events, [round]: { type: FORCED_EVENT_OPTIONS[0].value } } });
  };
  const updateEvent = (round: number, patch: Partial<ForcedEvent>) =>
    set({ forcedEvents: { ...events, [round]: { ...events[round], ...patch } } });
  const removeEvent = (round: number) => {
    const next = { ...events }; delete next[round];
    set({ forcedEvents: Object.keys(next).length === 0 ? undefined : next });
  };
  return (
    <div>
      <span className={labelCls}>🎬 Forced events (guarantee a market event in a given year)</span>
      <div className="space-y-2">
        {rounds.map((round) => (
          <div key={round} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end rounded-lg border border-white/10 p-2">
            <Field label="Year"><input type="number" min={1} max={draft.maxRounds} className={inputCls} value={round}
              onChange={(e) => { const nr = Number(e.target.value); const ev = events[round]; const next = { ...events }; delete next[round]; next[nr] = ev; set({ forcedEvents: next }); }} /></Field>
            <div className="sm:col-span-2"><Field label="Event">
              <select className={inputCls} value={events[round].type} onChange={(e) => updateEvent(round, { type: e.target.value as EventType })}>
                {FORCED_EVENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></Field></div>
            <button type="button" onClick={() => removeEvent(round)} className="text-[11px] px-2 py-2 rounded border border-danger/30 text-danger">Remove</button>
            {events[round].type === EVENT_REQUIRES_SECTOR && (
              <div className="sm:col-span-4"><Field label="Boom sector">
                <select className={inputCls} value={events[round].consolidationSectorId ?? SECTOR_OPTIONS[0].value}
                  onChange={(e) => updateEvent(round, { consolidationSectorId: e.target.value as SectorId })}>
                  {SECTOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select></Field></div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => addAt(Math.min((rounds[rounds.length - 1] ?? 0) + 1, draft.maxRounds))}
        className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-accent hover:text-accent">+ Add forced event</button>
    </div>
  );
}

function PreviewRail({ draft, compiled, validation, onPreviewPlay }: {
  draft: ScenarioDraft; compiled: ScenarioChallengeConfig | null;
  validation: { errors: string[]; warnings: string[] }; onPreviewPlay: () => void;
}) {
  return (
    <div className="space-y-3 lg:sticky lg:top-4 self-start">
      <div className="rounded-xl border p-4" style={{ borderColor: draft.themeColor + '55', background: draft.themeColor + '11' }}>
        <div className="flex items-center gap-2 mb-1"><span className="text-2xl">{draft.themeEmoji}</span>
          <span className="text-sm font-bold text-text-primary">{draft.name || 'Untitled'}</span></div>
        {draft.tagline && <p className="text-xs text-text-secondary mb-2">{draft.tagline}</p>}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Cell label="Mode" value={draft.fundStructure ? 'PE Fund' : 'Holdco'} />
          <Cell label="Length" value={`${draft.maxRounds} yrs`} />
          <Cell label="Start cash" value={draft.fundStructure ? `$${toM(draft.fundStructure.committedCapital)}M LP` : `$${toM(draft.startingCash)}M`} />
          <Cell label="Ranked by" value={draft.rankingMetric.toUpperCase()} />
          <Cell label="Ownership" value={`${ownershipPct(draft)}%`} />
          <Cell label="Businesses" value={`${draft.startingBusinesses.length}`} />
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="text-[11px] text-text-secondary leading-relaxed">{whatPlayerFaces(draft)}</p>
      </div>
      {validation.errors.length > 0 && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-[11px] text-danger space-y-1">
          <div className="font-semibold">{validation.errors.length} error(s) — can't publish:</div>
          {validation.errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-[11px] text-warning space-y-1">
          <div className="font-semibold">{validation.warnings.length} warning(s):</div>
          {validation.warnings.map((w, i) => <div key={i}>• {w}</div>)}
        </div>
      )}
      {validation.errors.length === 0 && <div className="rounded-lg bg-accent/10 border border-accent/20 p-2 text-[11px] text-accent">✓ Valid — ready to publish</div>}
      <button type="button" onClick={onPreviewPlay} disabled={!compiled || validation.errors.length > 0}
        className="w-full text-xs px-3 py-2 rounded-lg border border-white/10 hover:border-accent hover:text-accent disabled:opacity-40">▶ Preview-play</button>
    </div>
  );
}
function Cell({ label, value }: { label: string; value: string }) {
  return <div className="bg-white/5 rounded p-1.5"><div className="text-text-muted">{label}</div><div className="font-medium text-text-primary">{value}</div></div>;
}
function whatPlayerFaces(d: ScenarioDraft): string {
  const parts: string[] = [];
  parts.push(`A ${d.maxRounds}-year ${d.fundStructure ? 'PE fund' : 'holdco'} run`);
  parts.push(d.startingBusinesses.length ? `starting with ${d.startingBusinesses.length} business(es)` : 'starting capital-only');
  if (d.allowedSectors?.length) parts.push(`limited to ${d.allowedSectors.length} sector(s)`);
  const fe = d.forcedEvents ? Object.keys(d.forcedEvents).length : 0;
  if (fe) parts.push(`${fe} scripted event(s)`);
  parts.push(`ranked by ${d.rankingMetric.toUpperCase()}`);
  return parts.join(', ') + '.';
}

// ── Manager ──
function Manager({ scenarios, loading, error, onNew, onPickTemplate, onEdit, onDuplicate, onToggleActive, onDelete, onPreview }: {
  scenarios: ScenarioSummary[]; loading: boolean; error: string | null;
  onNew: () => void; onPickTemplate: (build: () => ScenarioDraft) => void;
  onEdit: (id: string) => void; onDuplicate: (id: string) => void;
  onToggleActive: (s: ScenarioSummary) => void; onDelete: (id: string) => void; onPreview: (id: string) => void;
}) {
  const now = Date.now();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Scenario Challenges</h2>
        <button onClick={onNew} className="text-xs px-3 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30">+ New (blank)</button>
      </div>
      <div>
        <div className="text-[11px] text-text-muted mb-1.5">Start from a template</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SCENARIO_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => onPickTemplate(t.build)} title={t.blurb}
              className="text-left rounded-lg border border-white/10 bg-white/[0.02] p-2 hover:border-accent/40 transition-colors">
              <div className="text-lg">{t.emoji}</div>
              <div className="text-[11px] font-medium text-text-primary leading-tight mt-0.5">{t.label}</div>
              <div className="text-[10px] text-text-muted line-clamp-2 mt-0.5">{t.blurb}</div>
            </button>
          ))}
        </div>
      </div>
      {error && <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-xs text-danger">{error}</div>}
      {loading ? <p className="text-xs text-text-muted">Loading…</p> : scenarios.length === 0 ? (
        <p className="text-xs text-text-muted">No scenarios yet. Click “New Scenario” to build one.</p>
      ) : (
        <div className="space-y-1.5">
          {scenarios.map((s) => {
            const expired = new Date(s.endDate).getTime() < now;
            const status = expired ? 'Expired' : s.isActive ? (s.isFeatured ? 'Featured' : 'Live') : 'Draft';
            const statusCls = expired ? 'text-text-muted' : s.isActive ? 'text-accent' : 'text-warning';
            // Published scenarios are immutable — offer Duplicate-to-revise instead of Edit.
            const published = s.isActive || !!s.publishedAt;
            return (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2 text-xs">
                <span className="text-lg">{s.theme.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-text-primary truncate">{s.name} {s.isPE && <span className="text-[10px] text-text-muted">· PE</span>}</div>
                  <div className="text-[10px] text-text-muted">{s.id} · {s.maxRounds}yr · {s.rankingMetric.toUpperCase()}</div>
                </div>
                <span className={`text-[10px] font-semibold ${statusCls}`}>{status}</span>
                <div className="flex gap-1">
                  {!published && <RowBtn onClick={() => onEdit(s.id)}>Edit</RowBtn>}
                  <RowBtn onClick={() => onDuplicate(s.id)}>Duplicate</RowBtn>
                  <RowBtn onClick={() => onPreview(s.id)}>Preview</RowBtn>
                  <RowBtn onClick={() => onToggleActive(s)}>{s.isActive ? 'Deactivate' : 'Activate'}</RowBtn>
                  <RowBtn onClick={() => onDelete(s.id)} danger>Delete</RowBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function RowBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick}
    className={`text-[10px] px-1.5 py-0.5 rounded border ${danger ? 'border-danger/30 text-danger hover:bg-danger/10' : 'border-white/10 text-text-secondary hover:text-accent hover:border-accent/30'}`}>{children}</button>;
}
