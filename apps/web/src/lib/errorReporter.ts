// apps/web/src/lib/errorReporter.ts
//
// Frontend hatalarını backend'e POST eder.
//
// Özellikler:
// - Deduplication: aynı hata bir oturumda 1 kez gönderilir (spam önleme)
// - Circuit breaker: backend ulaşılamazsa devre kapanır (sonsuz retry yok)
// - sendBeacon fallback: sayfa kapanırken bile hata gönderilebilir
// - Sessizce çalışır: caller'a hata fırlatmaz

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';

const ERROR_LOG_ENDPOINT = `${API_BASE_URL}/error-log`;

// Aynı hata aynı oturumda tekrar gönderilmesin (spam önleme)
const sentFingerprints = new Set<string>();
const MAX_FINGERPRINTS_IN_MEMORY = 200;

// Backend ulaşılamazsa devre kapansın
let circuitOpen = false;
let circuitOpenedAt = 0;
const CIRCUIT_RESET_AFTER_MS = 60_000; // 1 dakika sonra tekrar dene

export type ReportLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ErrorReport = {
  severity?: ReportLevel;
  message: string;
  stack?: string | null;
  context?: Record<string, unknown>;
};

/**
 * Hata gönder. Asenkron, fire-and-forget.
 * Caller'ı bekletmez ve hata fırlatmaz.
 */
export function reportError(report: ErrorReport): void {
  try {
    void sendReport(report);
  } catch {
    // Sessizce yut — error reporter kendisi hata fırlatmamalı
  }
}

async function sendReport(report: ErrorReport): Promise<void> {
  // Circuit kapalıysa ve süresi dolmadıysa, hiçbir şey yapma
  if (circuitOpen) {
    if (Date.now() - circuitOpenedAt < CIRCUIT_RESET_AFTER_MS) return;
    circuitOpen = false; // 1 dakika geçti, tekrar dene
  }

  // Deduplication — aynı message+stack ilk satırı bir oturumda 1 kez
  const fp = computeClientFingerprint(report);
  if (sentFingerprints.has(fp)) return;

  // Memory taşmasını önle
  if (sentFingerprints.size >= MAX_FINGERPRINTS_IN_MEMORY) {
    sentFingerprints.clear();
  }
  sentFingerprints.add(fp);

  const payload = {
    severity: report.severity ?? 'MEDIUM',
    message: report.message.slice(0, 2000),
    stack: report.stack?.slice(0, 20000) ?? null,
    context: report.context ?? null,
    url: typeof window !== 'undefined' ? window.location.href.slice(0, 500) : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null
  };

  try {
    // Sayfa kapanış sırasında çalışıyorsa sendBeacon kullan (kesin gönderim)
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      document.visibilityState === 'hidden'
    ) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(ERROR_LOG_ENDPOINT, blob);
      return;
    }

    // Normal fetch (auth gerekmez, ama login'liyse JWT'yi de gönderelim)
    const token =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('menu_access_token')
        : null;

    const response = await fetch(ERROR_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload),
      // 5 saniye timeout (yoksa frontend hata gönderme tıkanırsa app yavaşlar)
      signal: AbortSignal.timeout?.(5000)
    });

    // 5xx → backend'de sorun, circuit aç
    if (response.status >= 500) {
      openCircuit();
    }
  } catch {
    // Network hatası, abort, vs. → circuit aç
    openCircuit();
  }
}

function openCircuit(): void {
  circuitOpen = true;
  circuitOpenedAt = Date.now();
}

function computeClientFingerprint(report: ErrorReport): string {
  const msg = (report.message ?? '').slice(0, 200);
  const stackFirst = (report.stack ?? '').split('\n')[1]?.trim() ?? '';
  return `${msg}|${stackFirst}`;
}

/**
 * Global hata yakalayıcıları kur (uygulama başlangıcında bir kez çağrılır).
 *
 * - window.onerror: senkron JS hataları
 * - window.onunhandledrejection: yakalanmayan async/await hataları
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  // window.onerror — script error'ları
  window.addEventListener('error', (event: ErrorEvent) => {
    // ResizeObserver loop, script-loading hataları gibi gürültüyü filtrele
    if (shouldIgnore(event.message)) return;

    reportError({
      severity: 'HIGH',
      message: event.message || 'Unknown error',
      stack: event.error?.stack ?? null,
      context: {
        type: 'window.error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    });
  });

  // unhandledrejection — async/await fail
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection';
    const stack = reason instanceof Error ? reason.stack : null;

    if (shouldIgnore(message)) return;

    reportError({
      severity: 'HIGH',
      message,
      stack,
      context: {
        type: 'unhandledrejection'
      }
    });
  });
}

/**
 * Bilinen gürültü mesajlarını filtrele (frontend'de zararsız ama spam yapanlar).
 */
function shouldIgnore(message: string | undefined): boolean {
  if (!message) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('resizeobserver loop') ||
    lower.includes('non-error promise rejection captured') ||
    lower.includes('script error') || // CORS-blocked hatalar, içerik yok
    lower.includes('network error') && lower.length < 30 // generic network hatası, faydası yok
  );
}