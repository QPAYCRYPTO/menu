// apps/web/src/auth/AuthContext.tsx
// CHANGELOG v2 — Admin tab izolasyonu:
// - localStorage → sessionStorage
// - Sebep: Aynı tarayıcıda farklı sekmelerde 2 farklı işletme admin'i çalışabilsin
// - Etki: Tarayıcı kapanınca admin tekrar email/şifre ile giriş yapacak
//   (eskiden hatırlıyordu, ama bu güvenlik için daha iyi)

import type { LoginResponse } from '@menu/shared';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, configureAuthClient } from '../api/client';

export type UserRole = 'admin' | 'superadmin' | 'owner';

type AuthContextValue = {
  accessToken: string | null;
  refreshToken: string | null;
  role: UserRole | null;
  email: string | null;
  businessId: string | null;
  businessName: string | null;
  login: (email: string, password: string) => Promise<UserRole>;
  logout: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'menu_access_token';
const REFRESH_TOKEN_KEY = 'menu_refresh_token';
const ROLE_KEY = 'menu_role';
const EMAIL_KEY = 'menu_email';
const BUSINESS_ID_KEY = 'menu_business_id';
const BUSINESS_NAME_KEY = 'menu_business_name';

function parseStoredRole(value: string | null): UserRole | null {
  if (value === 'admin' || value === 'superadmin' || value === 'owner') {
    return value;
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => sessionStorage.getItem(ACCESS_TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => sessionStorage.getItem(REFRESH_TOKEN_KEY));
  const [role, setRole] = useState<UserRole | null>(() => parseStoredRole(sessionStorage.getItem(ROLE_KEY)));
  const [email, setEmail] = useState<string | null>(() => sessionStorage.getItem(EMAIL_KEY));
  const [businessId, setBusinessId] = useState<string | null>(() => sessionStorage.getItem(BUSINESS_ID_KEY));
  const [businessName, setBusinessName] = useState<string | null>(() => sessionStorage.getItem(BUSINESS_NAME_KEY));

  useEffect(() => {
    if (accessToken) sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }, [accessToken]);

  useEffect(() => {
    if (refreshToken) sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }, [refreshToken]);

  useEffect(() => {
    if (role) sessionStorage.setItem(ROLE_KEY, role);
    else sessionStorage.removeItem(ROLE_KEY);
  }, [role]);

  useEffect(() => {
    if (email) sessionStorage.setItem(EMAIL_KEY, email);
    else sessionStorage.removeItem(EMAIL_KEY);
  }, [email]);

  useEffect(() => {
    if (businessId) sessionStorage.setItem(BUSINESS_ID_KEY, businessId);
    else sessionStorage.removeItem(BUSINESS_ID_KEY);
  }, [businessId]);

  useEffect(() => {
    if (businessName) sessionStorage.setItem(BUSINESS_NAME_KEY, businessName);
    else sessionStorage.removeItem(BUSINESS_NAME_KEY);
  }, [businessName]);

  useEffect(() => {
    configureAuthClient({ getRefreshToken: () => refreshToken, setAccessToken });
  }, [refreshToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      refreshToken,
      role,
      email,
      businessId,
      businessName,
      isAuthenticated: Boolean(accessToken),
      login: async (emailInput: string, password: string) => {
        const response = await apiRequest<LoginResponse>('/auth/login', {
          method: 'POST',
          body: { email: emailInput, password },
          retryOn401: false
        });
        setAccessToken(response.access_token);
        setRefreshToken(response.refresh_token);
        setRole(response.role as UserRole);
        setEmail(response.email ?? null);
        setBusinessId(response.business_id ?? null);
        setBusinessName(response.business_name ?? null);
        return response.role as UserRole;
      },
      logout: () => {
        setAccessToken(null);
        setRefreshToken(null);
        setRole(null);
        setEmail(null);
        setBusinessId(null);
        setBusinessName(null);
      }
    }),
    [accessToken, refreshToken, role, email, businessId, businessName]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider eksik.');
  return ctx;
}