/**
 * Component QA for the scenario builder: mounts the real component (with the API client
 * mocked) and exercises the key states — Manager list, template gallery, New → builder,
 * live validation, PE-mode toggle, and the published-row Edit-hidden rule. Catches render
 * crashes and wiring regressions the unit tests (which exercise pure logic) can't.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ScenarioSummary } from '../../../services/scenarioAdminApi';

// Mock the API client so the component never hits fetch.
const mockFetchScenarios = vi.fn<() => Promise<ScenarioSummary[]>>();
vi.mock('../../../services/scenarioAdminApi', () => ({
  ApiError: class extends Error {},
  fetchScenarios: () => mockFetchScenarios(),
  fetchScenario: vi.fn(),
  createScenario: vi.fn(),
  updateScenario: vi.fn(),
  deleteScenario: vi.fn(),
  openScenarioPreview: vi.fn(),
  draftNarrative: vi.fn(),
}));

import { ScenarioBuilderTab } from '../ScenarioBuilderTab';

const summary = (over: Partial<ScenarioSummary> = {}): ScenarioSummary => ({
  id: 'live-one', name: 'Live One', tagline: 't', theme: { emoji: '🎯', color: '#F59E0B' },
  startDate: '2026-06-01T00:00:00Z', endDate: '2027-01-01T00:00:00Z',
  isActive: true, isFeatured: false, difficulty: 'normal', duration: 'quick',
  maxRounds: 10, rankingMetric: 'fev', isPE: false, configVersion: 1, ...over,
});

beforeEach(() => { mockFetchScenarios.mockReset(); });

describe('ScenarioBuilderTab', () => {
  it('renders the Manager with the template gallery (empty list)', async () => {
    mockFetchScenarios.mockResolvedValue([]);
    render(<ScenarioBuilderTab token="t" />);
    expect(await screen.findByText('Scenario Challenges')).toBeInTheDocument();
    expect(screen.getByText('Start from a template')).toBeInTheDocument();
    expect(screen.getByText('The Search Fund')).toBeInTheDocument();
    expect(screen.getByText('The PE Fund (LP Clock)')).toBeInTheDocument();
  });

  it('opens the builder from "+ New (blank)" and shows a valid live preview', async () => {
    mockFetchScenarios.mockResolvedValue([]);
    render(<ScenarioBuilderTab token="t" />);
    fireEvent.click(await screen.findByText('+ New (blank)'));
    expect(screen.getByText('① Identity & Run')).toBeInTheDocument();
    expect(screen.getByText('③ The Playing Field')).toBeInTheDocument();
    // A blank draft compiles clean → preview shows the ready state.
    expect(screen.getByText(/Valid — ready to publish/)).toBeInTheDocument();
  });

  it('loads a template into the builder', async () => {
    mockFetchScenarios.mockResolvedValue([]);
    render(<ScenarioBuilderTab token="t" />);
    fireEvent.click(await screen.findByText('The PE Fund (LP Clock)'));
    expect(screen.getByText('① Identity & Run')).toBeInTheDocument();
    // Preview rail reflects PE mode for the PE template.
    expect(screen.getByText('PE Fund')).toBeInTheDocument();
  });

  it('toggling PE Fund mode does not crash and keeps a valid config', async () => {
    mockFetchScenarios.mockResolvedValue([]);
    render(<ScenarioBuilderTab token="t" />);
    fireEvent.click(await screen.findByText('+ New (blank)'));
    const peToggle = screen.getByLabelText(/PE Fund Mode/i);
    fireEvent.click(peToggle);
    expect(screen.getByText('PE Fund')).toBeInTheDocument();
    expect(screen.getByText(/Valid — ready to publish/)).toBeInTheDocument();
  });

  it('hides Edit on a published scenario row (Duplicate is the revise path)', async () => {
    mockFetchScenarios.mockResolvedValue([summary({ isActive: true })]);
    render(<ScenarioBuilderTab token="t" />);
    const row = (await screen.findByText('Live One')).closest('div')!.parentElement!.parentElement!;
    const scoped = within(row);
    expect(scoped.queryByText('Edit')).not.toBeInTheDocument();
    expect(scoped.getByText('Duplicate')).toBeInTheDocument();
    expect(scoped.getByText('Deactivate')).toBeInTheDocument();
  });

  it('shows Edit on a draft scenario row', async () => {
    mockFetchScenarios.mockResolvedValue([summary({ id: 'draft-one', name: 'Draft One', isActive: false })]);
    render(<ScenarioBuilderTab token="t" />);
    await screen.findByText('Draft One');
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});
