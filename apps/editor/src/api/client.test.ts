import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, configureApiClient } from './client.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiRequest', () => {
  let getAccessToken: () => string | null;
  let setAccessToken: (token: string | null) => void;
  let onLogout: ReturnType<typeof vi.fn<() => void>>;
  let token: string | null;

  beforeEach(() => {
    token = 'initial-token';
    getAccessToken = () => token;
    setAccessToken = (t) => {
      token = t;
    };
    onLogout = vi.fn();
    configureApiClient({ getAccessToken, setAccessToken, onLogout });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(200, { hello: 'world' })));
    const result = await apiRequest<{ hello: string }>('/thing');
    expect(result).toEqual({ hello: 'world' });
  });

  it('refreshes the access token once on a 401 and retries the original request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } }),
      ) // original request
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new-token' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // retried request
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest<{ ok: boolean }>('/protected');

    expect(result).toEqual({ ok: true });
    expect(token).toBe('new-token');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('logs out after a second 401 following a failed refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } }),
      ) // original
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'no session' } }),
      ); // refresh fails
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/protected')).rejects.toThrow();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('logs out immediately if the retried request also 401s', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } }),
      ) // original
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new-token' })) // refresh succeeds
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'still bad' } }),
      ); // retry fails
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/protected')).rejects.toThrow();
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws an ApiError with the server-provided code/message on non-401 failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'missing' } }),
        ),
    );
    await expect(apiRequest('/thing')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
