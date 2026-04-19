// apps/web/src/auth/AuthContext.tsx
import type { LoginResponse } from '@menu/shared';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, configureAuthClient } from '../api/client';

export type UserRole = 'admin' | 'superadmin' | 'owner';

type AuthContextValue = {
  accessToken: string | null;
  refreshToken: string | null;
  role: UserRole | null;
  login: (email: string, password: string) => Promise<UserRole>;
  logout: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'menu_access_token';
const REFRESH_TOKEN_KEY = 'menu_refresh_token';
const ROLE_KEY = 'menu_role';

function parseStoredRole(value: string | null): UserRole | null {
  if (value === 'admin' || value === 'superadmin' || value === 'owner') {
    return value;
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(ACCESS_TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_TOKEN_KEY));
  const [role, setRole] = useState<UserRole | null>(() => parseStoredRole(localStorage.getItem(ROLE_KEY)));

  useEffect(() => {
    if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  }, [accessToken]);

  useEffect(() => {
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, [refreshToken]);

  useEffect(() => {
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  }, [role]);

  useEffect(() => {
    configureAuthClient({ getRefreshToken: () => refreshToken, setAccessToken });
  }, [refreshToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      refreshToken,
      role,
      isAuthenticated: Boolean(accessToken),
      login: async (email: string, password: string) => {
        const response = await apiRequest<LoginResponse>('/auth/login', {
          method: 'POST',
          body: { email, password },
          retryOn401: false
        });
        setAccessToken(response.access_token);
        setRefreshToken(response.refresh_token);
        setRole(response.role as UserRole);
        return response.role as UserRole;
      },
      logout: () => {
        setAccessToken(null);
        setRefreshToken(null);
        setRole(null);
      }
    }),
    [accessToken, refreshToken, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider eksik.');
  return ctx;
}