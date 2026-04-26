-- ==============================================================================
-- 006_waiter_activity_log.sql
-- AtlasQR - Garson Hareket Logu
-- ==============================================================================
-- Garson her işlem yaptığında buraya kaydedilir.
-- Admin/Patron "Garson Hareketleri" sayfasından denetleyebilir.
--
-- Denormalize edilmiş alanlar (waiter_name, target_name): garson/sipariş silinse
-- bile geçmiş kaydı korunur.
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'waiter_activity_log'
    ) THEN

        CREATE TABLE waiter_activity_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

            -- Kim yaptı (garson silinebilir, NULL olabilir)
            waiter_id UUID REFERENCES waiters(id) ON DELETE SET NULL,
            waiter_name VARCHAR(100) NOT NULL,  -- Denormalized

            -- Ne yaptı
            action VARCHAR(50) NOT NULL,
            -- Örnekler:
            --   'order_added'           → Yeni sipariş açtı
            --   'item_added'            → Mevcut siparişe ürün ekledi
            --   'item_quantity_changed' → Adet değiştirdi
            --   'item_deleted'          → Ürün sildi
            --   'item_note_added'       → Not ekledi
            --   'table_transferred'     → Masa transferi
            --   'tables_merged'         → Masa birleştirdi
            --   'call_answered'         → Çağrıya cevap verdi
            --   'break_start'           → Mola aldı
            --   'break_end'             → Molayı bitirdi
            --   'shift_start'           → İşe giriş
            --   'shift_end'             → Çıkış

            -- Ne üzerinde
            target_type VARCHAR(30),    -- 'order', 'order_item', 'table', 'session'
            target_id UUID,
            target_name VARCHAR(200),   -- Denormalized: "Bahçe 1 - Çay" gibi

            -- Detay bilgi (her action için farklı yapı)
            metadata JSONB DEFAULT '{}'::jsonb,
            -- Örnek metadata:
            --   item_quantity_changed: {"product_name":"Çay","old_qty":2,"new_qty":3,"price_int":2500}
            --   item_deleted:          {"product_name":"Çay","quantity":2,"price_int":2500}
            --   table_transferred:     {"from_table":"Bahçe 1","to_table":"Bahçe 2"}
            --   order_added:           {"table_name":"Bahçe 1","total_int":5000,"item_count":3}

            -- Opsiyonel IP/cihaz bilgisi (audit için)
            ip_address VARCHAR(45),
            user_agent TEXT,

            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- İndeksler
        CREATE INDEX idx_waiter_log_business_time
            ON waiter_activity_log(business_id, created_at DESC);

        CREATE INDEX idx_waiter_log_waiter_time
            ON waiter_activity_log(waiter_id, created_at DESC)
            WHERE waiter_id IS NOT NULL;

        CREATE INDEX idx_waiter_log_action
            ON waiter_activity_log(business_id, action, created_at DESC);

        CREATE INDEX idx_waiter_log_target
            ON waiter_activity_log(target_type, target_id)
            WHERE target_id IS NOT NULL;

    END IF;
END $$;

-- ==============================================================================
-- DOĞRULAMA
-- ==============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'waiter_activity_log'
-- ORDER BY ordinal_position;
-- ==============================================================================