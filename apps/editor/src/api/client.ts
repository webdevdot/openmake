export interface ApiErrorBody {
  error: { code: string; message: string };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:8080'}/api/v1`;

export type AccessTokenGetter = () => string | null;
export type AccessTokenSetter = (token: string | null) => void;
export type OnLogout = () => void;

let getAccessToken: AccessTokenGetter = () => null;
let setAccessToken: AccessTokenSetter = () => {};
let onLogout: OnLogout = () => {};

/** Wires the API client to the auth store without creating a circular import. */
export function configureApiClient(opts: {
  getAccessToken: AccessTokenGetter;
  setAccessToken: AccessTokenSetter;
  onLogout: OnLogout;
}): void {
  getAccessToken = opts.getAccessToken;
  setAccessToken = opts.setAccessToken;
  onLogout = opts.onLogout;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Internal: set on the retry attempt so we only refresh once. */
  _isRetry?: boolean;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function doFetch(path: string, opts: RequestOptions): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(opts.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await parseBody(res)) as { accessToken?: string } | undefined;
  return data?.accessToken ?? null;
}

/**
 * Core request function: fetch with credentials, on 401 attempt exactly one
 * refresh + retry, and on a second 401 (or a failed refresh) log out.
 */
export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await doFetch(path, opts);

  if (res.status === 401 && !opts._isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      setAccessToken(newToken);
      return apiRequest<T>(path, { ...opts, _isRetry: true });
    }
    onLogout();
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired');
  }

  if (res.status === 401 && opts._isRetry) {
    onLogout();
    const body = (await parseBody(res)) as Partial<ApiErrorBody> | undefined;
    throw new ApiError(
      401,
      body?.error?.code ?? 'UNAUTHENTICATED',
      body?.error?.message ?? 'Session expired',
    );
  }

  if (!res.ok) {
    const body = (await parseBody(res)) as Partial<ApiErrorBody> | undefined;
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN_ERROR',
      body?.error?.message ?? `Request failed with status ${res.status}`,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await parseBody(res)) as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
