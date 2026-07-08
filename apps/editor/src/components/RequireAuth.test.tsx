import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from './RequireAuth.js';
import { useAuthStore } from '../store/auth.js';

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, status: 'idle' });
});

describe('RequireAuth', () => {
  it('shows a loading indicator instead of a blank screen while status is idle', () => {
    // Avoid firing the real restoreSession network call during this render.
    vi.spyOn(useAuthStore.getState(), 'restoreSession').mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <RequireAuth>
          <div>Protected content</div>
        </RequireAuth>
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('shows a loading indicator while status is loading', () => {
    useAuthStore.setState({ status: 'loading' });

    render(
      <MemoryRouter>
        <RequireAuth>
          <div>Protected content</div>
        </RequireAuth>
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('renders children once authenticated', () => {
    useAuthStore.setState({ status: 'authenticated' });

    render(
      <MemoryRouter>
        <RequireAuth>
          <div>Protected content</div>
        </RequireAuth>
      </MemoryRouter>,
    );

    expect(screen.getByText('Protected content')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
  });
});
