/**
 * AccountModal — Scenario Challenge account-wall behavior. Verifies the scenario
 * context renders and, critically, that the post-sign-in redirect carries `?se={id}`
 * so the player resumes into the scenario they tried to play (the resume mechanism).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Persisted auth store needs an in-memory localStorage before the store loads.
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

// Hoisted so the vi.mock factory (also hoisted) can reference them.
const { linkIdentity, signInWithOAuth, updateUser, signInWithOtp } = vi.hoisted(() => ({
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  updateUser: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: { linkIdentity, signInWithOAuth, updateUser, signInWithOtp } },
}));

import { AccountModal } from '../AccountModal';
import { useAuthStore } from '../../../hooks/useAuth';

describe('AccountModal — scenario account wall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    linkIdentity.mockResolvedValue({ error: null });
    signInWithOAuth.mockResolvedValue({ error: null });
    updateUser.mockResolvedValue({ error: null });
    signInWithOtp.mockResolvedValue({ error: null });
    useAuthStore.setState({
      player: { id: 'anon', initials: 'AA', isAnonymous: true, createdAt: '2026-01-01' },
      showAccountModal: true,
      accountModalMode: 'create',
      scenarioWall: { scenarioId: 'recession', name: 'Recession Gauntlet', emoji: '📉' },
    });
  });

  // Modal renders a mobile + desktop copy, so every node appears twice — use *AllBy*.
  it('renders the scenario context header', () => {
    render(<AccountModal />);
    expect(screen.getAllByText('Recession Gauntlet').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/put your run on the leaderboard/i).length).toBeGreaterThan(0);
  });

  it('Google link-identity redirects back to ?se={id} after sign-in', async () => {
    render(<AccountModal />);
    fireEvent.click(screen.getAllByText('Continue with Google')[0]);
    await waitFor(() => expect(linkIdentity).toHaveBeenCalled());
    expect(linkIdentity.mock.calls[0][0].options.redirectTo).toContain('?se=recession');
  });

  it('magic link carries the scenario redirect (emailRedirectTo)', async () => {
    render(<AccountModal />);
    fireEvent.change(screen.getAllByPlaceholderText('your@email.com')[0], { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getAllByText('Send Magic Link')[0]);
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(updateUser.mock.calls[0][1].emailRedirectTo).toContain('?se=recession');
  });

  it('a generic (non-scenario) sign-in redirects to origin, no scenario context', async () => {
    useAuthStore.setState({ scenarioWall: null });
    render(<AccountModal />);
    expect(screen.queryAllByText('Recession Gauntlet').length).toBe(0);
    fireEvent.click(screen.getAllByText('Continue with Google')[0]);
    await waitFor(() => expect(linkIdentity).toHaveBeenCalled());
    expect(linkIdentity.mock.calls[0][0].options.redirectTo).not.toContain('?se=');
  });
});
