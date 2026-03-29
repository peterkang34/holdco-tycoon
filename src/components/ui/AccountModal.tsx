import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../hooks/useAuth';
import { useToastStore } from '../../hooks/useToast';

export function AccountModal() {
  const { showAccountModal, accountModalMode, closeAccountModal } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  // Read isAnonymous synchronously from auth store (avoids async race condition)
  const isAnonymous = useAuthStore((s) => s.player?.isAnonymous ?? null);

  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync mode from store when modal opens
  useEffect(() => {
    if (showAccountModal) setMode(accountModalMode);
  }, [showAccountModal, accountModalMode]);

  if (!supabase) return null;

  const handleGoogleAuth = async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'create' && isAnonymous) {
        // Link Google identity to the existing anonymous session (preserves UUID)
        const { error: linkError } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (linkError) throw linkError;
      } else {
        // Standard OAuth sign-in (new or returning user)
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (oauthError) throw oauthError;
      }
      // Browser will redirect to Google — no need to update UI
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setLoading(false);
    }
  };

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
          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 min-h-[48px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-text-primary font-medium transition-colors disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" className="shrink-0">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-text-muted">or</span>
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
              onClick={() => { closeAccountModal(); useAuthStore.getState().openTermsModal(); }}
              className="underline text-accent cursor-pointer"
            >
              Terms of Service
            </button>{' '}and{' '}
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
