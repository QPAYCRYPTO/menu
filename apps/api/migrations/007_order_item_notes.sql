-- ==============================================================================
-- 007_order_item_notes.sql
-- AtlasQR - Ürün Başına Sipariş Notu
-- ==============================================================================
-- Şu ana kadar sipariş notu (orders.note) tek bir genel alandı.
-- Artık her ürünün kendi notu olabilir:
--   "ÇAY x2 → sıcak olsun"
--   "AYRAN x1 → ılık olsun"
--   "KOLA x1 → buzsuz"
--
-- orders.note (genel sipariş notu) DEĞİŞMEDEN KALIYOR — geri uyumlu.
-- order_items.note (ürün başına not) yeni eklendi.
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'order_items'
          AND column_name = 'note'
    ) THEN
        ALTER TABLE order_items
            ADD COLUMN note TEXT;

        COMMENT ON COLUMN order_items.note IS
            'Bu ürüne özel müşteri/garson notu (örn: "soğansız", "az pişmiş"). Genel sipariş notu için orders.note kullanılır.';
    END IF;
END $$;

-- ==============================================================================
-- DOĞRULAMA
-- ==============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'order_items'
-- ORDER BY ordinal_position;
-- ==============================================================================