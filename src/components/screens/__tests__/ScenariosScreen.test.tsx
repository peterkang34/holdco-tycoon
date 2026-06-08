/**
 * Component QA for the player-facing Scenarios landing page. Mounts the real
 * component (API client + scoreboard child mocked) and exercises the key states:
 * loading, error+retry, empty, Live Now vs Past Challenges, and the card CTAs
 * (Play on live, View scoreboard on ended).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ScenarioListSummary } from '../../../services/scenarioLeaderboard';

// The auth store is persisted (zustand persist) — give it an in-memory localStorage
// before the store module loads (jsdom about:blank has no working localStorage).
vi.hoisted(() => {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(), key: () => null, get length() { return mem.size; },
    },
    configurable: true, writable: true,
  });
});

const mockFetchScenarioList = vi.fn();
const mockFetchScenarioRecords = vi.fn();
vi.mock('../../../services/scenarioLeaderboard', async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return { ...actual, fetchScenarioList: () => mockFetchScenarioList(), fetchScenarioRecords: () => mockFetchScenarioRecords() };
});

// The inline scoreboard + profile modal are exercised elsewhere — stub them so this
// test focuses on the landing page's own states.
vi.mock('../../ui/LeaderboardModal', () => ({ ScenarioDetail: () => <div data-testid="scoreboard" /> }));
vi.mock('../../ui/ProfileModal', () => ({ ProfileModal: () => null }));

import { ScenariosScreen } from '../ScenariosScreen';
import { useAuthStore } from '../../../hooks/useAuth';

const setPlayer = (isAnonymous: boolean | null) =>
  useAuthStore.setState({
    player: isAnonymous === null ? null : { id: 'p1', initials: 'AA', isAnonymous, createdAt: '2026-01-01' },
    showAccountModal: false,
    scenarioWall: null,
  });

const summary = (over: Partial<ScenarioListSummary> = {}): ScenarioListSummary => ({
  id: 'recession', name: 'Recession Gauntlet', tagline: 'Survive the downturn',
  theme: { emoji: '📉', color: '#ef4444' },
  startDate: '2026-06-01T00:00:00Z', endDate: '2099-01-01T00:00:00Z',
  difficulty: 'normal', duration: 'quick', maxRounds: 10, rankingMetric: 'fev',
  isPE: false, entryCount: 42, topScore: 2_500_000, isFeatured: true, isActive: true,
  ...over,
});

describe('ScenariosScreen', () => {
  beforeEach(() => { vi.clearAllMocks(); setPlayer(null); mockFetchScenarioRecords.mockResolvedValue(null); });

  it('shows a loading skeleton while fetching', () => {
    mockFetchScenarioList.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<ScenariosScreen onPlay={vi.fn()} onBack={vi.fn()} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry that refetches', async () => {
    mockFetchScenarioList.mockRejectedValueOnce(new Error('boom'));
    render(<ScenariosScreen onPlay={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText(/Couldn't load scenarios/i);
    mockFetchScenarioList.mockResolvedValueOnce({ active: [], archived: [] });
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(mockFetchScenarioList).toHaveBeenCalledTimes(2));
  });

  it('shows a positive empty state when there are no scenarios', async () => {
    mockFetchScenarioList.mockResolvedValueOnce({ active: [], archived: [] });
    render(<ScenariosScreen onPlay={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText(/No live challenges right now/i);
  });

  it('fires onPlay directly when the player has an account', async () => {
    setPlayer(false); // verified account
    mockFetchScenarioList.mockResolvedValueOnce({ active: [summary()], archived: [] });
    const onPlay = vi.fn();
    render(<ScenariosScreen onPlay={onPlay} onBack={vi.fn()} />);
    await screen.findByText('Live Now');
    expect(screen.getByText('Recession Gauntlet')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Play ▶'));
    expect(onPlay).toHaveBeenCalledWith('recession');
    expect(useAuthStore.getState().showAccountModal).toBe(false);
  });

  it('opens the scenario account wall (not onPlay) for an anonymous player', async () => {
    setPlayer(true); // anonymous session
    mockFetchScenarioList.mockResolvedValueOnce({ active: [summary()], archived: [] });
    const onPlay = vi.fn();
    render(<ScenariosScreen onPlay={onPlay} onBack={vi.fn()} />);
    await screen.findByText('Live Now');
    fireEvent.click(screen.getByText('Play ▶'));
    expect(onPlay).not.toHaveBeenCalled();
    const st = useAuthStore.getState();
    expect(st.showAccountModal).toBe(true);
    expect(st.scenarioWall).toEqual({ scenarioId: 'recession', name: 'Recession Gauntlet', emoji: '📉' });
  });

  it('renders Past Challenges with View scoreboard (no Play) for ended scenarios', async () => {
    mockFetchScenarioList.mockResolvedValueOnce({
      active: [],
      archived: [summary({ id: 'old', name: 'Old One', isActive: false, endDate: '2020-01-01T00:00:00Z' })],
    });
    render(<ScenariosScreen onPlay={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText('Past Challenges');
    expect(screen.getByText('View scoreboard')).toBeInTheDocument();
    expect(screen.queryByText('Play ▶')).not.toBeInTheDocument();
  });

  it('hydrates "Your best: #rank" on cards from the records batch', async () => {
    setPlayer(false);
    mockFetchScenarioList.mockResolvedValueOnce({ active: [summary()], archived: [] });
    mockFetchScenarioRecords.mockResolvedValueOnce([
      { scenarioId: 'recession', attempts: 2, bestScore: 88, bestRawFev: 3_000_000, bestRankingValue: 3_000_000, bestRank: 3, entryCount: 42, lastPlayedAt: '2026-05-01T00:00:00Z' },
    ]);
    render(<ScenariosScreen onPlay={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText('Live Now');
    await screen.findByText(/Your best: #3 of 42/i);
  });

  it('expands the inline scoreboard on toggle', async () => {
    mockFetchScenarioList.mockResolvedValueOnce({ active: [summary()], archived: [] });
    render(<ScenariosScreen onPlay={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText('Live Now');
    expect(screen.queryByTestId('scoreboard')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Scoreboard'));
    expect(screen.getByTestId('scoreboard')).toBeInTheDocument();
  });
});
