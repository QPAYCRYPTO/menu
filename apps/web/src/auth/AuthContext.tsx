import type { LoginResponse } from '@menu/shared';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, configureAuthClient } from '../api/client';

type AuthContextValue = {
  accessToken: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'menu_access_token';
const REFRESH_TOKEN_KEY = 'menu_refresh_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(ACCESS_TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_TOKEN_KEY));

  useEffect(() => {
    if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  }, [accessToken]);

  useEffect(() => {
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, [refreshToken]);

  useEffect(() => {
    configureAuthClient({
      getRefreshToken: () => refreshToken,
      setAccessToken
    });
  }, [refreshToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      refreshToken,
      isAuthenticated: Boolean(accessToken),
      login: async (email: string, password: string) => {
        const response = await apiRequest<LoginResponse>('/auth/login', {
          method: 'POST',
          body: { email, password },
          retryOn401: false
        });
        setAccessToken(response.access_token);
        setRefreshToken(response.refresh_token);
      },
      logout: () => {
        setAccessToken(null);
        setRefreshToken(null);
      }
    }),
    [accessToken, refreshToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider eksik.');
  return ctx;
}
