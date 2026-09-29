-- ==============================================================================
-- 015_settings_extras.sql
-- AtlasQR — İşletme ayarları ekleri (Ayarlar sayfası revizyonu)
-- ==============================================================================
--   businesses:
--     - wifi_name / wifi_password — müşteri menüsündeki Wi-Fi kartı (ikisi de isteğe bağlı)
--     - address                   — müşteri menüsünde "Yol tarifi" bağlantısı
--     - is_accepting_orders       — "Sipariş alımı açık" anahtarı (şimdilik yalnızca kaydedilir;
--                                   müşteri menüsünde uygulanması ayrı adım). Varsayılan TRUE →
--                                   mevcut işletmelerde davranış değişmez.
-- ==============================================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS wifi_name TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS wifi_password TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_accepting_orders BOOLEAN NOT NULL DEFAULT TRUE;
