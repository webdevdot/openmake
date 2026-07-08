import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth.js';
import * as endpoints from '../api/endpoints.js';

describe('auth store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, status: 'idle' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('login stores the user and access token and marks authenticated', async () => {
    vi.spyOn(endpoints.authApi, 'login').mockResolvedValue({
      accessToken: 'abc',
      user: { id: '1', email: 'a@b.com', name: 'A' },
    });

    await useAuthStore.getState().login('a@b.com', 'password');

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.accessToken).toBe('abc');
    expect(state.user?.email).toBe('a@b.com');
  });

  it('logout clears user/token and marks unauthenticated', () => {
    useAuthStore.setState({
      user: { id: '1', email: 'a@b.com', name: 'A' },
      accessToken: 'abc',
      status: 'authenticated',
    });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.status).toBe('unauthenticated');
  });

  it('restoreSession with no token marks unauthenticated without calling the API', async () => {
    const meSpy = vi.spyOn(endpoints.authApi, 'me');
    await useAuthStore.getState().restoreSession();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(meSpy).not.toHaveBeenCalled();
  });

  it('restoreSession with a token fetches the user and marks authenticated', async () => {
    useAuthStore.setState({ accessToken: 'abc' });
    vi.spyOn(endpoints.authApi, 'me').mockResolvedValue({ id: '1', email: 'a@b.com', name: 'A' });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user?.id).toBe('1');
  });

  it('restoreSession clears session if the token is invalid', async () => {
    useAuthStore.setState({ accessToken: 'stale' });
    vi.spyOn(endpoints.authApi, 'me').mockRejectedValue(new Error('401'));

    await useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.status).toBe('unauthenticated');
    expect(state.accessToken).toBeNull();
  });
});
