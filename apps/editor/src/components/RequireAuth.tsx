import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    if (status === 'idle') void restoreSession();
  }, [status, restoreSession]);

  if (status === 'idle' || status === 'loading') return null;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
