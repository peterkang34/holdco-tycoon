import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { useAuthStore } from '../../hooks/useAuth';
import { useToastStore } from '../../hooks/useToast';
import { supabase, initAnonymousAuth, getAccessToken } from '../../lib/supabase';

export function DeleteAccountModal() {
  const isOpen = useAuthStore((s) => s.showDeleteModal);
  const closeDeleteModal = useAuthStore((s) => s.closeDeleteModal);
  const addToast = useToastStore((s) => s.addToast);

  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setDeleting(false);
    }
  }, [isOpen]);

  const canDelete = confirmText === 'DELETE' && !deleting;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        addToast({ message: 'Not authenticated', type: 'danger' });
        setDeleting(false);
        return;
      }

      const res = await fetch('/api/player/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({ message: data.error || 'Failed to delete account', type: 'danger' });
        setDeleting(false);
        return;
      }

      // Sign out and re-init anonymous session
      if (supabase) {
        await supabase.auth.signOut();
        await initAnonymousAuth();
      }

      addToast({ message: 'Account deleted successfully', type: 'success' });
      closeDeleteModal();
    } catch {
      addToast({ message: 'Something went wrong. Please try again.', type: 'danger' });
      setDeleting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={closeDeleteModal} title="Delete Account" size="sm">
      <p className="text-text-secondary text-sm mb-4">
        This will permanently delete your account and all associated data. Your leaderboard entries will remain but become anonymous.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); handleDelete(); }}>
        <div className="mb-4">
          <label htmlFor="delete-confirm" className="block text-xs text-text-muted mb-1">
            Type <span className="font-mono font-bold text-danger">DELETE</span> to confirm
          </label>
          <input
            id="delete-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-danger/50"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={closeDeleteModal}
            className="flex-1 btn-secondary py-3"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canDelete}
            className="flex-1 py-3 rounded-lg font-medium text-sm transition-colors bg-danger text-white hover:bg-danger/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting...' : 'Delete My Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
