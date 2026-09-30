-- ==============================================================================
-- 016_late_threshold.sql
-- AtlasQR — Gecikme eşiği (Ayarlar → Servis → Ortalama teslim süresi)
-- ==============================================================================
--   businesses.late_after_minutes — sipariş verildikten bu kadar dakika sonra hâlâ teslim
--   edilmemişse admin panelinde "Gecikiyor" sayılır. Varsayılan 15 dk; 1–240 arası.
-- ==============================================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS late_after_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (late_after_minutes BETWEEN 1 AND 240);
