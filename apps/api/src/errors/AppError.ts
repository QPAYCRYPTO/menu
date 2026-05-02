export const APP_ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES];

// Hata logu için severity seviyeleri
export type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: AppErrorCode;
  public readonly details?: unknown;
  public readonly severity: ErrorSeverity;

  constructor(
    message: string,
    statusCode = 500,
    code: AppErrorCode = APP_ERROR_CODES.INTERNAL_ERROR,
    details?: unknown,
    severity?: ErrorSeverity
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // severity verilmemişse statusCode'a göre otomatik ata
    this.severity = severity ?? AppError.defaultSeverityFor(statusCode, code);
  }

  /**
   * Status code + error code kombinasyonuna göre default severity belirler.
   * Manuel olarak severity belirtilmezse bu fallback kullanılır.
   */
  static defaultSeverityFor(statusCode: number, code: AppErrorCode): ErrorSeverity {
    // 5xx: sunucu hatası
    if (statusCode >= 500) return 'HIGH';

    // Rate limited: spam sinyali, MEDIUM (brute force tespiti ayrı yapılır)
    if (code === APP_ERROR_CODES.RATE_LIMITED) return 'MEDIUM';

    // 401/403: auth hatası — çoğu zaman normal (yanlış şifre vb.)
    if (statusCode === 401 || statusCode === 403) return 'LOW';

    // 404, 400: kullanıcı kaynaklı, düşük öncelik
    return 'LOW';
  }
}