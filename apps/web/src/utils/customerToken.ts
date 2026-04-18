// apps/web/src/utils/customerToken.ts
// Müşteri kimlik token'ı yönetimi
// Her cihazda benzersiz UUID üretir ve localStorage'da saklar

const TOKEN_KEY = 'atlasqr:customer_token';

function generateUUID(): string {
  // crypto.randomUUID modern tarayıcılarda var, yoksa fallback
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: basit ama yeterli UUID v4 benzeri
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Bu tarayıcının müşteri token'ını döner.
 * Yoksa oluşturup localStorage'a kaydeder.
 */
export function getCustomerToken(): string {
  try {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token || token.length < 10) {
      token = generateUUID();
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  } catch {
    // localStorage yoksa (Safari private mode vs) oturum içi token üret
    return generateUUID();
  }
}