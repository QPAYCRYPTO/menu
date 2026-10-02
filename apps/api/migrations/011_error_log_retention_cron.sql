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

-- pg_cron yalnızca bazı sağlayıcılarda var (Supabase evet; Railway Postgres / lokal Docker hayır).
-- Eklenti yoksa zamanlayıcı atlanır, migration hata vermez (deneme ortamı ve lokal test açılabilsin).
-- Canlı (Supabase) bu migration'ı zaten çalıştırdı; orada davranış değişmez.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron yok — error_log temizleme zamanlayıcısı atlandı';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- Aynı isimde eski bir job varsa önce kaldır (idempotent migration)
  BEGIN
    PERFORM cron.unschedule('cleanup-error-log')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-error-log');
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  -- Yeni cron job: her gün UTC 03:00'te çalışır
  PERFORM cron.schedule(
    'cleanup-error-log',
    '0 3 * * *',
    $job$
      DELETE FROM error_log
      WHERE
        (severity = 'LOW'      AND last_seen_at < NOW() - INTERVAL '7 days')
        OR (severity = 'MEDIUM'   AND last_seen_at < NOW() - INTERVAL '14 days')
        OR (severity = 'HIGH'     AND last_seen_at < NOW() - INTERVAL '30 days')
        OR (severity = 'CRITICAL' AND last_seen_at < NOW() - INTERVAL '90 days');
    $job$
  );
END
$do$;

-- Doğrulama sorgusu (manuel kontrol için, çalıştırma sırasında output verir):
-- SELECT jobid, schedule, command, jobname, active FROM cron.job WHERE jobname = 'cleanup-error-log';