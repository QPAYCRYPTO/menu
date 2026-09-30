-- ==============================================================================
-- 018_staff_breaks.sql
-- AtlasQR — Personel molası
-- ==============================================================================
--   waiters.break_started_at — molaya çıkış anı (NULL = molada değil)
--   waiters.break_ends_at    — seçilen süreye göre planlanan dönüş; aşılırsa admin panelinde uyarı
--   Mola başlangıç/bitişi waiter_activity_log'a 'break_start' / 'break_end' olarak yazılır.
-- ==============================================================================

ALTER TABLE waiters ADD COLUMN IF NOT EXISTS break_started_at TIMESTAMPTZ;
ALTER TABLE waiters ADD COLUMN IF NOT EXISTS break_ends_at TIMESTAMPTZ;
