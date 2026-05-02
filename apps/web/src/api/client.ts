// apps/web/src/api/client.ts
import type { RefreshResponse } from '@menu/shared';
import { reportError } from '../lib/errorReporter';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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

  // 5xx response → backend'de bir sorun var, hata logu'na yaz
  // 4xx'leri log'lamayız (validation, auth fail vb. — kullanıcı kaynaklı, spam olur)
  // /error-log endpoint'ine giden istekleri SAKIN log'lama (sonsuz döngü olur)
  if (response.status >= 500 && !path.startsWith('/error-log')) {
    const errorBody = (await response
      .clone()
      .json()
      .catch(() => ({}))) as { message?: string; requestId?: string };

    reportError({
      severity: 'HIGH',
      message: `API ${response.status}: ${errorBody.message ?? 'Server error'}`,
      stack: null,
      context: {
        type: 'api-5xx',
        method: options.method ?? 'GET',
        path,
        status: response.status,
        request_id: errorBody.requestId ?? null
      }
    });
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