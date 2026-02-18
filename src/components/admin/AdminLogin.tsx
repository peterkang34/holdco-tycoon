import { useState } from 'react';

interface AdminLoginProps {
  onLogin: (token: string) => void;
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const { token } = await res.json();
        sessionStorage.setItem('admin_token', token);
        onLogin(token);
      } else {
        setError('Invalid password');
      }
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="card p-6 w-full max-w-sm space-y-4">
        <h1 className="text-lg font-bold text-text-primary">Admin Dashboard</h1>
        <p className="text-sm text-text-muted">Enter admin password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 rounded bg-bg-primary border border-border text-text-primary text-sm focus:outline-none focus:border-accent"
          autoFocus
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full py-2 rounded bg-accent/20 text-accent font-medium text-sm hover:bg-accent/30 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Verifying...' : 'Login'}
        </button>
        <a href="#/" className="block text-center text-xs text-text-muted hover:text-text-secondary">
          ← Back to Game
        </a>
      </form>
    </div>
  );
}
