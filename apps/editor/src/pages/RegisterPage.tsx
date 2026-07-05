import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { ApiError } from '../api/client.js';

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, name);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-canvas-app">
      <form
        onSubmit={onSubmit}
        className="flex w-80 flex-col gap-3 rounded border bg-panel p-6 border-app"
        data-testid="register-form"
      >
        <h1 className="text-sm font-medium">Create your openmake account</h1>
        <input
          type="text"
          required
          placeholder="Name"
          data-testid="register-name-input"
          className="rounded border bg-transparent px-2 py-1.5 text-xs border-app"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="email"
          required
          placeholder="Email"
          data-testid="register-email-input"
          className="rounded border bg-transparent px-2 py-1.5 text-xs border-app"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          placeholder="Password"
          data-testid="register-password-input"
          className="rounded border bg-transparent px-2 py-1.5 text-xs border-app"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="text-xs text-red-500" data-testid="register-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          data-testid="register-submit"
          className="rounded py-1.5 text-xs font-medium text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {submitting ? 'Creating…' : 'Create account'}
        </button>
        <Link to="/login" className="text-center text-xs text-secondary-app">
          Have an account? Sign in
        </Link>
      </form>
    </div>
  );
}
