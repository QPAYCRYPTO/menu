// apps/web/src/context/WaiterAuthContext.tsx
// CHANGELOG v4 — Sayfa yenileme fix:
// - checkStoredSession artık exchangeToken kullanıyor (tab_id'yi yeniden kaydediyor)
// - Bu sayede F5 sonrası tab DB'de yine aktif olur
// - beforeunload kaldırıldı (gereksiz, expire olunca temizlenir)
//
// Önceki CHANGELOG (v3):
// - localStorage → sessionStorage (sekme bazında izolasyon)
// - tab_id eklendi (her sekme için unique UUID)
// - exchangeToken ile yeni session başlatma

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { WaiterSelf, exchangeToken, logoutTab } from '../api/waiterPublicApi';

const STORAGE_KEY = 'atlasqr_waiter_session';

type StoredSession = {
  token: string;
  tab_id: string;
  waiter: WaiterSelf;
  stored_at: string;
};

type WaiterAuthContextValue = {
  waiter: WaiterSelf | null;
  token: string | null;
  tabId: string | null;
  isAuthenticated: boolean;
  isChecking: boolean;
  loginWithToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const WaiterAuthContext = createContext<WaiterAuthContextValue | null>(null);

/**
 * URL'de /g/:token varsa true. Bu durumda sessionStorage'daki eski oturumu kullanmıyoruz.
 */
function urlHasWaiterToken(): boolean {
  if (typeof window === 'undefined') return false;
  return /^\/g\/[^\/]+/.test(window.location.pathname);
}

export function WaiterAuthProvider({ children }: { children: ReactNode }) {
  const [waiter, setWaiter] = useState<WaiterSelf | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tabId, setTabId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // sessionStorage'dan oku ve tab kaydını yenile (sayfa yenilenince çalışır)
  const checkStoredSession = useCallback(async () => {
    try {
      // KRİTİK: URL'de yeni token varsa, sessionStorage'ı atla
      // (WaiterLoginPage zaten exchange çağıracak)
      if (urlHasWaiterToken()) {
        setIsChecking(false);
        return;
      }

      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setIsChecking(false);
        return;
      }

      const stored: StoredSession = JSON.parse(raw);
      if (!stored.token || !stored.tab_id) {
        sessionStorage.removeItem(STORAGE_KEY);
        setIsChecking(false);
        return;
      }

      // KRİTİK: exchangeToken ile tab kaydını YENİDEN OLUŞTUR.
      // Sayfa yenilense bile bu sayede tab DB'de yine aktif olur.
      // exchangeToken: token doğrular + aynı tab_id'yi DB'ye yeniden yazar
      // (eski revoked olduysa yenisi yaratılır).
      const result = await exchangeToken(stored.token, stored.tab_id);
      if (result.ok) {
        // sessionStorage'ı güncelle (waiter bilgisi değişmiş olabilir)
        const updatedSession: StoredSession = {
          token: stored.token,
          tab_id: stored.tab_id,
          waiter: result.waiter,
          stored_at: new Date().toISOString()
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession));

        setWaiter(result.waiter);
        setToken(stored.token);
        setTabId(stored.tab_id);
      } else {
        // Token revoke veya expire — temizle
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStoredSession();
  }, [checkStoredSession]);

  // NOT: beforeunload kaldırıldı.
  // Sebep: F5 yenileme de beforeunload tetikliyor → tab revoke oluyor →
  // sayfa açıldığında 401 alıyor. Tab token expire olunca DB'de zaten temizlenir.

  const loginWithToken = useCallback(async (newToken: string) => {
    // Bu sekme için yeni tab_id üret
    const newTabId = crypto.randomUUID();

    // Eski sessionStorage'ı temizle (varsa)
    sessionStorage.removeItem(STORAGE_KEY);
    setWaiter(null);
    setToken(null);
    setTabId(null);

    // Backend'e exchange isteği
    const result = await exchangeToken(newToken, newTabId);
    if (!result.ok) {
      return { ok: false, error: result.reason };
    }

    // Yeni session'ı sessionStorage'a yaz (sadece bu sekme görür)
    const session: StoredSession = {
      token: newToken,
      tab_id: newTabId,
      waiter: result.waiter,
      stored_at: new Date().toISOString()
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));

    setWaiter(result.waiter);
    setToken(newToken);
    setTabId(newTabId);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    if (tabId) {
      // Manuel logout — backend'e bildir
      logoutTab(tabId).catch(() => {});
    }
    sessionStorage.removeItem(STORAGE_KEY);
    setWaiter(null);
    setToken(null);
    setTabId(null);
  }, [tabId]);

  const refresh = useCallback(async () => {
    await checkStoredSession();
  }, [checkStoredSession]);

  return (
    <WaiterAuthContext.Provider value={{
      waiter,
      token,
      tabId,
      isAuthenticated: !!waiter && !!tabId,
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