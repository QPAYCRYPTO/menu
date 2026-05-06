-- ==============================================================================
-- 012_table_operations_and_payment.sql
-- AtlasQR — Masa Operasyonları + Ödeme Altyapısı
-- ==============================================================================
-- Kapsam:
--   1) table_sessions: birleştirme için merge alanları + status check constraint
--   2) order_items: item bazlı ödeme takibi
--   3) orders: sipariş bazlı ödeme özet alanları
--   4) businesses: müşteri adisyon görüntüleme toggle
--   5) İndeksler
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1a. table_sessions.merged_into_session_id
-- Source session birleştirilince hedef session'ın id'si buraya yazılır.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'table_sessions'
          AND column_name = 'merged_into_session_id'
    ) THEN
        ALTER TABLE table_sessions
        ADD COLUMN merged_into_session_id UUID
        REFERENCES table_sessions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1b. table_sessions.merge_group_id
-- Birleşik masaların ortak UUID'si. Admin görselinde mavi+çizgi için kullanılır.
-- 3+ masa birleştirilirse hepsi aynı merge_group_id'yi taşır.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'table_sessions'
          AND column_name = 'merge_group_id'
    ) THEN
        ALTER TABLE table_sessions
        ADD COLUMN merge_group_id UUID;

        CREATE INDEX idx_sessions_merge_group
            ON table_sessions(merge_group_id)
            WHERE merge_group_id IS NOT NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1c. table_sessions status CHECK constraint
-- Sadece 'table_sessions_status_check' adlı constraint'i hedefler.
-- Supabase internal NOT NULL constraint'lerine kesinlikle dokunmaz.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- Sadece bizim isimli constraint varsa drop et
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'table_sessions'
          AND constraint_name = 'table_sessions_status_check'
          AND constraint_type = 'CHECK'
    ) THEN
        ALTER TABLE table_sessions DROP CONSTRAINT table_sessions_status_check;
    END IF;

    -- Yeni constraint ekle: open | closed | merged
    ALTER TABLE table_sessions
    ADD CONSTRAINT table_sessions_status_check
    CHECK (status IN ('open', 'closed', 'merged'));
END $$;

-- ------------------------------------------------------------------------------
-- 2a. order_items.is_paid
-- Ödeme ekranında admin bu item'ı tahsil edince TRUE olur.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_items'
          AND column_name = 'is_paid'
    ) THEN
        ALTER TABLE order_items
        ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2b. order_items.paid_at
-- Item'ın ödendiği zaman damgası.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_items'
          AND column_name = 'paid_at'
    ) THEN
        ALTER TABLE order_items
        ADD COLUMN paid_at TIMESTAMPTZ;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3a. orders.paid_at
-- Tüm order item'ları ödenince dolar. Kısmi ödeme sırasında NULL kalır.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders'
          AND column_name = 'paid_at'
    ) THEN
        ALTER TABLE orders
        ADD COLUMN paid_at TIMESTAMPTZ;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3b. orders.payment_method
-- Ödeme yöntemi: cash | card | other
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders'
          AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE orders
        ADD COLUMN payment_method TEXT;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. businesses.customer_can_view_bill
-- TRUE: Müşteri QR menüde adisyonunu görebilir. Default TRUE.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses'
          AND column_name = 'customer_can_view_bill'
    ) THEN
        ALTER TABLE businesses
        ADD COLUMN customer_can_view_bill BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. İndeksler
-- ------------------------------------------------------------------------------

-- Ödenmemiş item'ları order bazlı hızlı bul (ödeme ekranı)
CREATE INDEX IF NOT EXISTS idx_order_items_unpaid_order
    ON order_items(order_id)
    WHERE is_paid = FALSE;

-- Ödenen item'lar (rapor)
CREATE INDEX IF NOT EXISTS idx_order_items_paid
    ON order_items(paid_at DESC)
    WHERE is_paid = TRUE;

-- Session bazlı ödeme durumu (JOIN: session→orders→items)
CREATE INDEX IF NOT EXISTS idx_orders_session_paid
    ON orders(session_id, paid_at)
    WHERE session_id IS NOT NULL;

-- ==============================================================================
-- DOĞRULAMA — Çalıştırdıktan sonra şunu çalıştır:
-- ==============================================================================
-- SELECT table_name, column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('table_sessions', 'order_items', 'orders', 'businesses')
--   AND column_name IN (
--     'merged_into_session_id', 'merge_group_id',
--     'is_paid', 'paid_at', 'payment_method',
--     'customer_can_view_bill'
--   )
-- ORDER BY table_name, column_name;
--
-- Beklenen: 7 satır
-- ==============================================================================