import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore, useIsLoggedIn } from '../../hooks/useAuth';
import { supabase, initAnonymousAuth } from '../../lib/supabase';

export function AccountBadge() {
  const isLoggedIn = useIsLoggedIn();
  const player = useAuthStore((s) => s.player);
  const openStatsModal = useAuthStore((s) => s.openStatsModal);
  const [showDropdown, setShowDropdown] = useState(false);
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

  const handleSignOut = async () => {
    setShowDropdown(false);
    if (supabase) {
      await supabase.auth.signOut();
      await initAnonymousAuth();
    }
  };

  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        onClick={() => setShowDropdown(!showDropdown)}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center"
        title={player.email ?? 'Account'}
        aria-haspopup="true"
        aria-expanded={showDropdown}
      >
        <span className="w-7 h-7 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center hover:bg-accent/30 transition-colors">
          {player.initials.slice(0, 2)}
        </span>
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-11 w-48 bg-bg-card border border-white/10 rounded-lg shadow-lg py-1 z-50" role="menu">
          {player.email && (
            <>
              <p className="px-3 py-2 text-xs text-text-muted truncate">{player.email}</p>
              <div className="border-t border-white/10" />
            </>
          )}
          <button
            role="menuitem"
            onClick={() => { setShowDropdown(false); openStatsModal(); }}
            className="w-full text-left px-3 min-h-[44px] flex items-center text-sm text-text-secondary hover:bg-white/5 transition-colors"
          >
            My Stats
          </button>
          <div className="border-t border-white/10" />
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
  );
}
