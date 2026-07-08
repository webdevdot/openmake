import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { ApiError } from '../api/client.js';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-canvas-app">
      <form
        onSubmit={onSubmit}
        className="flex w-80 flex-col gap-3 rounded border bg-panel p-6 border-app"
        data-testid="login-form"
      >
        <h1 className="text-sm font-medium">Sign in to openmake</h1>
        <input
          type="email"
          required
          placeholder="Email"
          data-testid="login-email-input"
          className="rounded border bg-transparent px-2 py-1.5 text-xs border-app"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          placeholder="Password"
          data-testid="login-password-input"
          className="rounded border bg-transparent px-2 py-1.5 text-xs border-app"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="text-xs text-red-500" data-testid="login-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          data-testid="login-submit"
          className="rounded py-1.5 text-xs font-medium text-white"
          style={{ backgroundColor: 'var(--color-accent-cta)' }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <Link to="/register" className="text-center text-xs text-secondary-app">
          Create an account
        </Link>
      </form>
    </div>
  );
}
