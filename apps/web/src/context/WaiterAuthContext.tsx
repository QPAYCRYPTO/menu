// apps/web/src/context/WaiterAuthContext.tsx
// CHANGELOG v6 — Aynı tarayıcıda birden fazla personel:
// - Her sekme kendi oturumunu sessionStorage'da tutar (F5'te o sekmenin personeli değişmez).
// - Cihazdaki oturumlar ayrıca localStorage'da personel bazında saklanır: telefon sekmeyi kapatıp
//   uygulama yeniden açılınca (sessionStorage boş) en son kullanılan oturum geri gelir (v5 davranışı korunur).
// - Çıkış / 401 yalnızca o sekmenin personelini siler, diğerlerine dokunmaz.
//
// CHANGELOG v5 — Oturum telefonda kalıcı:
// - Oturum localStorage'da (cihaz bazında) tutulur. Önceden sessionStorage'daydı: telefon arka plandaki
//   sekmeyi kapattığında (ekran kilidi, WhatsApp'a geçiş…) ya da uygulama yeni sekmede açıldığında
//   oturum siliniyor, personel vardiya süresi dolmadan düşüyordu. Artık vardiya (link) süresi bitene
//   kadar kalır; süre dolunca / link iptal edilince sunucu reddeder ve oturum temizlenir.
// - Herhangi bir istekte 401 gelirse (atlasqr:waiter-unauthorized olayı) oturum kapanır ve giriş ekranı
//   nedenini gösterir (endReason).
// - Molada mı? (onBreak): çağrı / "hazır" bildirimlerini susturmak için; profil yüklenince ve
//   mola olayı gelince güncellenir.
//
// Önceki CHANGELOG (v4): checkStoredSession exchangeToken kullanır (tab_id'yi yeniden kaydeder).

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { WaiterSelf, exchangeToken, getProfile, logoutTab, type WaiterAuthFailure } from '../api/waiterPublicApi';

/** Bu sekmenin oturumu (sessionStorage) — v5'te aynı anahtar localStorage'daki tek kayıttı */
const TAB_KEY = 'atlasqr_waiter_session';
/** Cihazdaki oturumlar, personel id → oturum (localStorage) */
const DEVICE_KEY = 'atlasqr_waiter_sessions';
/** Oturumu kapatan sunucu yanıtı (herhangi bir sayfadaki istekten) */
export const WAITER_UNAUTHORIZED_EVENT = 'atlasqr:waiter-unauthorized';

type StoredSession = {
  token: string;
  tab_id: string;
  waiter: WaiterSelf;
  stored_at: string;
};

type EndReason = WaiterAuthFailure['reason'];

type WaiterAuthContextValue = {
  waiter: WaiterSelf | null;
  token: string | null;
  tabId: string | null;
  isAuthenticated: boolean;
  isChecking: boolean;
  /** Oturum neden kapandı (süre doldu, link iptal…) — giriş ekranında gösterilir */
  endReason: EndReason | null;
  /** Personel molada mı (bildirimler sessiz) */
  onBreak: boolean;
  setOnBreak: (value: boolean) => void;
  loginWithToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const WaiterAuthContext = createContext<WaiterAuthContextValue | null>(null);

/**
 * URL'de /g/:token varsa true. Bu durumda kayıtlı eski oturumu kullanmıyoruz.
 */
function urlHasWaiterToken(): boolean {
  if (typeof window === 'undefined') return false;
  return /^\/g\/[^\/]+/.test(window.location.pathname);
}

// Depolama erişimi gizli sekmede / kısıtlı tarayıcıda hata verebilir → her erişim korumalı
function readDeviceMap(): Record<string, StoredSession> {
  let map: Record<string, StoredSession> = {};
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw) map = JSON.parse(raw) ?? {};
  } catch { /* yoksay */ }
  // v5'ten geçiş: localStorage'daki tek kayıt cihaz listesine alınır
  try {
    const legacy = localStorage.getItem(TAB_KEY);
    if (legacy) {
      const s = JSON.parse(legacy) as StoredSession;
      if (s?.waiter?.id && !map[s.waiter.id]) map[s.waiter.id] = s;
      localStorage.removeItem(TAB_KEY);
      localStorage.setItem(DEVICE_KEY, JSON.stringify(map));
    }
  } catch { /* yoksay */ }
  return map;
}
function writeDeviceMap(map: Record<string, StoredSession>) {
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(map)); } catch { /* yoksay */ }
}

/** Önce bu sekmenin oturumu; yoksa (yeni sekme / telefon sekmeyi kapattı) cihazdaki en son oturum */
function readStored(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(TAB_KEY);
    if (raw) return JSON.parse(raw) as StoredSession;
  } catch { /* yoksay */ }
  const latest = Object.values(readDeviceMap())
    .filter(s => s?.token && s?.tab_id)
    .sort((a, b) => (b.stored_at ?? '').localeCompare(a.stored_at ?? ''))[0];
  return latest ?? null;
}
function writeStored(session: StoredSession) {
  try { sessionStorage.setItem(TAB_KEY, JSON.stringify(session)); } catch { /* yoksay */ }
  const map = readDeviceMap();
  map[session.waiter.id] = session;
  writeDeviceMap(map);
}
/** Yalnızca bu sekmenin personelini siler (aynı tarayıcıdaki diğer personele dokunmaz) */
function clearStored() {
  let current: StoredSession | null = null;
  try {
    const raw = sessionStorage.getItem(TAB_KEY);
    current = raw ? (JSON.parse(raw) as StoredSession) : null;
    sessionStorage.removeItem(TAB_KEY);
  } catch { /* yoksay */ }
  if (current?.waiter?.id) {
    const map = readDeviceMap();
    delete map[current.waiter.id];
    writeDeviceMap(map);
  }
}

export function WaiterAuthProvider({ children }: { children: ReactNode }) {
  const [waiter, setWaiter] = useState<WaiterSelf | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tabId, setTabId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [endReason, setEndReason] = useState<EndReason | null>(null);
  const [onBreak, setOnBreak] = useState(false);

  const clearLocal = useCallback((reason: EndReason | null) => {
    clearStored();
    setWaiter(null);
    setToken(null);
    setTabId(null);
    setOnBreak(false);
    setEndReason(reason);
  }, []);

  // Kayıtlı oturumu oku ve tab kaydını yenile (sayfa yenilenince / uygulama yeniden açılınca)
  const checkStoredSession = useCallback(async () => {
    try {
      // KRİTİK: URL'de yeni token varsa kayıtlı oturumu atla (WaiterLoginPage exchange yapacak)
      if (urlHasWaiterToken()) return;

      const stored = readStored();
      if (!stored) return;
      if (!stored.token || !stored.tab_id) {
        clearStored();
        return;
      }
      // Cihaz listesinden geldiyse bu sekmeye sahiplen (sonraki F5'te aynı personel)
      try { sessionStorage.setItem(TAB_KEY, JSON.stringify(stored)); } catch { /* yoksay */ }

      // exchangeToken: token doğrular + aynı tab_id'yi DB'ye yeniden yazar
      const result = await exchangeToken(stored.token, stored.tab_id);
      if (result.ok) {
        writeStored({ token: stored.token, tab_id: stored.tab_id, waiter: result.waiter, stored_at: new Date().toISOString() });
        setWaiter(result.waiter);
        setToken(stored.token);
        setTabId(stored.tab_id);
        setEndReason(null);
      } else if (result.reason === 'network_error') {
        // Bağlantı yoksa oturumu silme; bağlantı gelince yeniden denenir
      } else {
        // Süre doldu / link iptal / personel pasif — temizle ve nedenini göster
        clearLocal(result.reason);
      }
    } catch {
      // okunamayan kayıt
      clearStored();
    } finally {
      setIsChecking(false);
    }
  }, [clearLocal]);

  useEffect(() => {
    checkStoredSession();
  }, [checkStoredSession]);

  // Bağlantı yokken açıldıysa, bağlantı gelince oturumu yeniden dene
  useEffect(() => {
    if (waiter) return;
    const retry = () => { checkStoredSession(); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [waiter, checkStoredSession]);

  // Herhangi bir istekte 401 → oturumu kapat (sunucu tarafında zaten geçersiz)
  useEffect(() => {
    const onUnauthorized = (e: Event) => {
      const reason = ((e as CustomEvent).detail?.reason ?? 'invalid_tab') as EndReason;
      clearLocal(reason);
    };
    window.addEventListener(WAITER_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(WAITER_UNAUTHORIZED_EVENT, onUnauthorized);
  }, [clearLocal]);

  // Mola durumu: giriş yapılınca profil bir kez okunur (sonrası mola olaylarıyla güncellenir)
  useEffect(() => {
    if (!token || !tabId) return;
    getProfile(token, tabId).then(p => setOnBreak(p.on_break)).catch(() => {});
  }, [token, tabId]);

  const loginWithToken = useCallback(async (newToken: string) => {
    // Bu cihaz için yeni tab_id üret
    const newTabId = crypto.randomUUID();

    clearStored();
    setWaiter(null);
    setToken(null);
    setTabId(null);

    const result = await exchangeToken(newToken, newTabId);
    if (!result.ok) {
      return { ok: false, error: result.reason };
    }

    writeStored({ token: newToken, tab_id: newTabId, waiter: result.waiter, stored_at: new Date().toISOString() });
    setWaiter(result.waiter);
    setToken(newToken);
    setTabId(newTabId);
    setEndReason(null);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    if (tabId) {
      // Manuel çıkış — backend'e bildir (servisten çıkış kaydı)
      logoutTab(tabId).catch(() => {});
    }
    clearLocal(null);
  }, [tabId, clearLocal]);

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
      endReason,
      onBreak,
      setOnBreak,
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
