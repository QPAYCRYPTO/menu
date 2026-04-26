// apps/web/src/context/WaiterAuthContext.tsx
// Garson auth state yönetimi (admin AuthContext'ten ayrı)

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { WaiterSelf, authByToken } from '../api/waiterPublicApi';

const STORAGE_KEY = 'atlasqr_waiter_session';

type StoredSession = {
  token: string;           // QR token (DB'deki session hash'in kaynağı)
  waiter: WaiterSelf;
  stored_at: string;       // ISO timestamp
};

type WaiterAuthContextValue = {
  waiter: WaiterSelf | null;
  token: string | null;
  isAuthenticated: boolean;
  isChecking: boolean;     // LocalStorage'dan okurken
  loginWithToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const WaiterAuthContext = createContext<WaiterAuthContextValue | null>(null);

export function WaiterAuthProvider({ children }: { children: ReactNode }) {
  const [waiter, setWaiter] = useState<WaiterSelf | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // LocalStorage'dan oku ve token'ı doğrula
  const checkStoredSession = useCallback(async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setIsChecking(false);
        return;
      }

      const stored: StoredSession = JSON.parse(raw);
      if (!stored.token) {
        setIsChecking(false);
        return;
      }

      // Token'ı backend ile doğrula
      const result = await authByToken(stored.token);
      if (result.ok) {
        setWaiter(result.waiter);
        setToken(stored.token);
      } else {
        // Token geçersiz — temizle
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStoredSession();
  }, [checkStoredSession]);

  const loginWithToken = useCallback(async (newToken: string) => {
    const result = await authByToken(newToken);
    if (!result.ok) {
      return { ok: false, error: result.reason };
    }

    // LocalStorage'a kaydet
    const session: StoredSession = {
      token: newToken,
      waiter: result.waiter,
      stored_at: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

    setWaiter(result.waiter);
    setToken(newToken);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setWaiter(null);
    setToken(null);
  }, []);

  const refresh = useCallback(async () => {
    await checkStoredSession();
  }, [checkStoredSession]);

  return (
    <WaiterAuthContext.Provider value={{
      waiter,
      token,
      isAuthenticated: !!waiter,
      isChecking,
      loginWithToken,
      logout,
      refresh
    }}>
      {children}
    </WaiterAuthContext.Provider>
  );
}

export function useWaiterAuth() {
  const ctx = useContext(WaiterAuthContext);
  if (!ctx) {
    throw new Error('useWaiterAuth must be used within WaiterAuthProvider');
  }
  return ctx;
}