-- ================================================================
-- AtlasQR — Error Log Retention Cron Job
-- Mayıs 2026
-- ================================================================
--
-- Amaç: error_log tablosunu severity'ye göre otomatik temizle
--   CRITICAL → 90 gün sonra sil
--   HIGH     → 30 gün sonra sil
--   MEDIUM   → 14 gün sonra sil
--   LOW      → 7 gün sonra sil
--
-- Çalışma: Her gece UTC 03:00 (Türkiye saati ~06:00)
-- Mekanizma: pg_cron extension (Supabase Pro)
--
-- Önemli: Bu migration tek seferlik çalıştırılır, ama oluşturduğu cron
--         job KALICIDIR — DB'de yaşar, her gece otomatik tetiklenir.
-- ================================================================

-- pg_cron extension'ının yüklü olduğunu garantile
-- (Supabase Dashboard → Database → Extensions'tan zaten enable edildi,
--  ama defansif: yoksa hata vermesin)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Eğer aynı isimde eski bir job varsa önce kaldır (idempotent migration)
-- Tekrar deploy edilirse veya retention politikası değişirse temiz başlangıç
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-error-log')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-error-log');
EXCEPTION
  WHEN OTHERS THEN
    -- Job yoksa hata fırlatır, görmezden gel
    NULL;
END $$;

-- Yeni cron job: her gün UTC 03:00'te çalışır
SELECT cron.schedule(
  'cleanup-error-log',                  -- job adı (unique)
  '0 3 * * *',                          -- cron expression: her gün saat 03:00 UTC
  $$
    DELETE FROM error_log
    WHERE
      (severity = 'LOW'      AND last_seen_at < NOW() - INTERVAL '7 days')
      OR (severity = 'MEDIUM'   AND last_seen_at < NOW() - INTERVAL '14 days')
      OR (severity = 'HIGH'     AND last_seen_at < NOW() - INTERVAL '30 days')
      OR (severity = 'CRITICAL' AND last_seen_at < NOW() - INTERVAL '90 days');
  $$
);

-- Doğrulama sorgusu (manuel kontrol için, çalıştırma sırasında output verir):
-- SELECT jobid, schedule, command, jobname, active FROM cron.job WHERE jobname = 'cleanup-error-log';