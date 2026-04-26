-- ==============================================================================
-- 008_call_types.sql
-- AtlasQR - Çağrı Türü Sistemi
-- ==============================================================================
-- Şu ana kadar müşteri "Garson Çağır" butonuna basınca tek tip çağrı oluyordu.
-- Garson masaya gidip "ne istemiştiniz?" diye soruyordu — verimsiz.
--
-- Artık müşteri 12 türden birini seçebilir:
--   waiter, baby_chair, charger, bill, package,
--   ashtray, lighter, cigarette, water,
--   missing_service, clean_table, other
--
-- "other" seçilirse zaten var olan orders.note alanı kullanılır.
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'call_type'
    ) THEN
        ALTER TABLE orders
            ADD COLUMN call_type VARCHAR(50);

        COMMENT ON COLUMN orders.call_type IS
            'Çağrı türü kodu. Sadece type=call siparişlerinde anlamlı. Olası değerler: waiter, baby_chair, charger, bill, package, ashtray, lighter, cigarette, water, missing_service, clean_table, other. ''other'' için orders.note alanı serbest açıklama içerir.';
    END IF;
END $$;

-- ==============================================================================
-- DOĞRULAMA
-- ==============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'orders' AND column_name = 'call_type';
-- ==============================================================================