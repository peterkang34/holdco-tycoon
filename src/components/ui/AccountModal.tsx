import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../hooks/useAuth';
import { useToastStore } from '../../hooks/useToast';

export function AccountModal() {
  const { showAccountModal, accountModalMode, closeAccountModal } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null);

  // Sync mode from store when modal opens
  useEffect(() => {
    if (showAccountModal) setMode(accountModalMode);
  }, [showAccountModal, accountModalMode]);

  // Pre-fetch session state when modal opens so OAuth click stays synchronous
  useEffect(() => {
    if (!showAccountModal || !supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAnonymous(session?.user?.is_anonymous ?? null);
    }).catch(() => { setIsAnonymous(null); });
  }, [showAccountModal]);

  if (!supabase) return null;

  // TODO: Re-enable Google OAuth once credentials are configured for this project
  // const handleGoogleAuth = () => { ... };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'create' && isAnonymous) {
        // updateUser preserves the anonymous UUID (important for game history linking)
        // but sends a "confirm email change" email — we set expectations in the UI copy
        const { error: updateError } = await supabase.auth.updateUser({ email: email.trim() });
        if (updateError) throw updateError;
        setEmailSent(true);
        addToast({ message: 'Check your email to verify your account', type: 'info' });
      } else {
        // Sign-in mode (returning user) or non-anonymous: use signInWithOtp
        const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim() });
        if (otpError) throw otpError;
        setEmailSent(true);
        addToast({ message: 'Check your email for a sign-in link', type: 'info' });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    closeAccountModal();
    setEmail('');
    setEmailSent(false);
    setError(null);
    setLoading(false);
    setMode('create');
  };

  return (
    <Modal isOpen={showAccountModal} onClose={handleClose} title={mode === 'signin' ? 'Sign In' : 'Create Account'} size="sm">
      {emailSent ? (
        <div className="text-center py-6">
          <span className="text-4xl block mb-3">📧</span>
          <p className="font-bold text-lg mb-2">Check your email</p>
          <p className="text-text-secondary text-sm mb-4">
            {mode === 'create' && isAnonymous
              ? <>We sent a verification link to <span className="font-medium text-text-primary">{email}</span>. Click it to confirm your account.</>
              : <>We sent a sign-in link to <span className="font-medium text-text-primary">{email}</span></>
            }
          </p>
          <button onClick={handleClose} className="btn-secondary text-sm">
            Close
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Magic Link */}
          <form onSubmit={handleMagicLink} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              required
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="btn-secondary w-full disabled:opacity-50"
              aria-busy={loading}
            >
              {loading ? 'Sending...' : mode === 'signin' ? 'Send Sign-In Link' : 'Send Magic Link'}
            </button>
          </form>

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

          <p className="text-text-muted text-xs text-center">
            {mode === 'create' ? (
              <>Already have an account?{' '}
                <button type="button" onClick={() => { setMode('signin'); setError(null); }} className="text-accent hover:underline">Sign in</button>
              </>
            ) : (
              <>New here?{' '}
                <button type="button" onClick={() => { setMode('create'); setError(null); }} className="text-accent hover:underline">Create account</button>
              </>
            )}
          </p>

          <p className="text-text-muted text-xs text-center">
            By continuing, you agree to our{' '}
            <button
              type="button"
              onClick={() => { closeAccountModal(); useAuthStore.getState().openPrivacyModal(); }}
              className="underline text-accent cursor-pointer"
            >
              Privacy Policy
            </button>.
          </p>
        </div>
      )}
    </Modal>
  );
}
