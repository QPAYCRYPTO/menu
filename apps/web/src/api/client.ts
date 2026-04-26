// apps/web/src/api/client.ts
import type { RefreshResponse } from '@menu/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  retryOn401?: boolean;
};

let refreshTokenGetter: (() => string | null) | null = null;
let onAccessTokenUpdate: ((token: string | null) => void) | null = null;

export function configureAuthClient(options: {
  getRefreshToken: () => string | null;
  setAccessToken: (token: string | null) => void;
}): void {
  refreshTokenGetter = options.getRefreshToken;
  onAccessTokenUpdate = options.setAccessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshTokenGetter || !onAccessTokenUpdate) {
    return null;
  }

  const refreshToken = refreshTokenGetter();
  if (!refreshToken) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (!response.ok) {
    onAccessTokenUpdate(null);
    return null;
  }

  const data = (await response.json()) as RefreshResponse;
  onAccessTokenUpdate(data.access_token);
  return data.access_token;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 401 && options.retryOn401 !== false) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiRequest<T>(path, { ...options, token: newToken, retryOn401: false });
    }
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(errorBody.message ?? 'İstek başarısız oldu.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}