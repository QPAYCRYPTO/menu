-- ==============================================================================
-- 021_order_timestamps.sql
-- AtlasQR — Sipariş zaman damgaları (Siparişler → Geçmiş, raporlar)
-- ==============================================================================
--   orders.preparing_at — mutfağın / adminin "Hazırlanıyor" dediği ilk an
--   orders.ready_at     — "Hazır" dendiği ilk an
--   Mevcut siparişlerde boş kalır (geçmiş bilinmiyor). Geçmiş ekranında iade ayrımı için de kullanılır:
--   mutfak başladıktan sonra iptal edilen sipariş = İADE.
-- ==============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_business_type_created
    ON orders (business_id, type, created_at DESC);
