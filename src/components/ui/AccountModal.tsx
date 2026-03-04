import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../hooks/useAuth';
import { useToastStore } from '../../hooks/useToast';

export function AccountModal() {
  const { showAccountModal, closeAccountModal } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null);

  // Pre-fetch session state when modal opens so OAuth click stays synchronous
  useEffect(() => {
    if (!showAccountModal || !supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAnonymous(session?.user?.is_anonymous ?? null);
    }).catch(() => { setIsAnonymous(null); });
  }, [showAccountModal]);

  if (!supabase) return null;

  const handleGoogleAuth = () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    // Use pre-fetched session state — keeps the OAuth call synchronous with user gesture
    // This prevents iOS Safari from blocking the popup/redirect
    if (isAnonymous) {
      supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: window.location.origin } })
        .then(({ error: linkError }) => { if (linkError) throw linkError; })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Google sign-in failed');
          setLoading(false);
        });
    } else {
      supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
        .then(({ error: oauthError }) => { if (oauthError) throw oauthError; })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Google sign-in failed');
          setLoading(false);
        });
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (isAnonymous) {
        // updateUser preserves the anonymous UUID (important for game history linking)
        // but sends a "confirm email change" email — we set expectations in the UI copy
        const { error: updateError } = await supabase.auth.updateUser({ email: email.trim() });
        if (updateError) throw updateError;
      } else {
        const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim() });
        if (otpError) throw otpError;
      }
      setEmailSent(true);
      addToast({ message: isAnonymous ? 'Check your email to verify your account' : 'Check your email for a sign-in link', type: 'info' });
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
  };

  return (
    <Modal isOpen={showAccountModal} onClose={handleClose} title="Create Account" size="sm">
      {emailSent ? (
        <div className="text-center py-6">
          <span className="text-4xl block mb-3">📧</span>
          <p className="font-bold text-lg mb-2">Check your email</p>
          <p className="text-text-secondary text-sm mb-4">
            {isAnonymous
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
          {/* Google OAuth */}
          <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 transition-colors font-medium disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-text-muted text-xs">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

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
              {loading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

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
