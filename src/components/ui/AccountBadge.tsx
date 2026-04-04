import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore, useIsLoggedIn } from '../../hooks/useAuth';
import { supabase, fetchWithAuth } from '../../lib/supabase';
import { useToastStore } from '../../hooks/useToast';
import { ProfileModal } from './ProfileModal';

export function AccountBadge() {
  const isLoggedIn = useIsLoggedIn();
  const player = useAuthStore((s) => s.player);
  const openStatsModal = useAuthStore((s) => s.openStatsModal);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on click/tap outside
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: Event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [showDropdown]);

  // Keyboard: Escape to close, arrow keys to navigate
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = dropdownRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      if (!items || items.length === 0) return;
      const focused = document.activeElement;
      const index = Array.from(items).indexOf(focused as HTMLButtonElement);
      if (e.key === 'ArrowDown') {
        items[Math.min(index + 1, items.length - 1)]?.focus();
      } else {
        items[Math.max(index - 1, 0)]?.focus();
      }
    }
  }, []);

  if (!isLoggedIn || !player) return null;

  const handleExportData = async () => {
    setShowDropdown(false);
    try {
      const response = await fetchWithAuth('/api/player/export');
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Export failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'holdco-tycoon-data.json';
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        // iOS Safari blocks programmatic anchor clicks for blob URLs
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      useToastStore.getState().addToast({ message: 'Data exported successfully', type: 'success' });
    } catch (err) {
      useToastStore.getState().addToast({ message: err instanceof Error ? err.message : 'Export failed', type: 'danger' });
    }
  };

  const handleSignOut = async () => {
    setShowDropdown(false);
    if (supabase) {
      await supabase.auth.signOut();
      // Clean reload ensures fresh anonymous session + clean UI state
      window.location.href = window.location.pathname;
    }
  };

  return (
    <>
    <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        onClick={() => setShowDropdown(!showDropdown)}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center"
        title={player.email ?? 'Account'}
        aria-haspopup="true"
        aria-expanded={showDropdown}
      >
        <span className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center hover:bg-accent/30 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-11 w-48 border border-white/15 rounded-lg shadow-xl py-1 z-50" style={{ backgroundColor: 'rgba(20, 25, 35, 0.95)', backdropFilter: 'blur(8px)' }} role="menu">
          {player.email && (
            <>
              <p className="px-3 py-2 text-xs text-text-muted truncate">{player.email}</p>
              <div className="border-t border-white/10" />
            </>
          )}
          <button
            role="menuitem"
            onClick={() => { setShowDropdown(false); setShowProfile(true); }}
            className="w-full text-left px-3 min-h-[44px] flex items-center text-sm text-text-secondary hover:bg-white/5 transition-colors"
          >
            My Profile
          </button>
          <button
            role="menuitem"
            onClick={() => { setShowDropdown(false); openStatsModal(); }}
            className="w-full text-left px-3 min-h-[44px] flex items-center text-sm text-text-secondary hover:bg-white/5 transition-colors"
          >
            My Stats
          </button>
          <button
            role="menuitem"
            onClick={() => { setShowDropdown(false); useAuthStore.getState().openStrategyLibraryModal(); }}
            className="w-full text-left px-3 min-h-[44px] flex items-center text-sm text-text-secondary hover:bg-white/5 transition-colors"
          >
            Strategy Library
          </button>
          <button
            role="menuitem"
            onClick={handleExportData}
            className="w-full text-left px-3 min-h-[44px] flex items-center text-sm text-text-secondary hover:bg-white/5 transition-colors"
          >
            Export My Data
          </button>
          <div className="border-t border-white/10" />
          <button
            role="menuitem"
            onClick={() => { setShowDropdown(false); useAuthStore.getState().openDeleteModal(); }}
            className="w-full text-left px-3 min-h-[44px] flex items-center text-sm text-text-muted hover:text-danger hover:bg-white/5 transition-colors"
          >
            Delete Account
          </button>
          <button
            role="menuitem"
            onClick={handleSignOut}
            className="w-full text-left px-3 min-h-[44px] flex items-center text-sm text-text-muted hover:text-danger hover:bg-white/5 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
    {showProfile && (
      <ProfileModal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        publicProfileId={null}
      />
    )}
    </>
  );
}
