-- ==============================================================================
-- 003_add_missing_foreign_keys.sql
-- AtlasQR - Eksik Foreign Key'leri Ekle
-- ==============================================================================
-- Önkoşul: 002_precheck_orphans.sql tüm sonuçları 0 dönmeli.
-- Bu migration, DB veri bütünlüğünü garantileyen foreign key'leri ekler.
--
-- Davranış:
--   orders.session_id        → table_sessions.id (ON DELETE SET NULL)
--   orders.cancelled_by      → users.id (ON DELETE SET NULL)
--   table_sessions.business_id → businesses.id (ON DELETE CASCADE)
--   table_sessions.table_id  → tables.id (ON DELETE RESTRICT)
--   table_sessions.closed_by → users.id (ON DELETE SET NULL)
--   order_items.product_id   → products.id (ON DELETE RESTRICT)
--
-- NOT: Delete kuralları önemli:
--   - CASCADE: parent silinince child de silinir (örn: business silinince sessions da silinsin)
--   - SET NULL: parent silinince child'ın FK kolonu NULL olur (örn: user silinince "kim iptal etti" kaybolsun ama iptal kaydı kalsın)
--   - RESTRICT: child varsa parent silinemez (örn: ürün silinsin istediğinde sipariş varsa reddet)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. orders.session_id → table_sessions.id (ON DELETE SET NULL)
-- ------------------------------------------------------------------------------
-- Neden SET NULL? Session silinse bile sipariş tarihçesi kalmalı.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'orders_session_id_fkey'
          AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders
        ADD CONSTRAINT orders_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES table_sessions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. orders.cancelled_by → users.id (ON DELETE SET NULL)
-- ------------------------------------------------------------------------------
-- Neden SET NULL? Kullanıcı silinse bile iptal kaydı korunmalı (audit için).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'orders_cancelled_by_fkey'
          AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders
        ADD CONSTRAINT orders_cancelled_by_fkey
        FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. table_sessions.business_id → businesses.id (ON DELETE CASCADE)
-- ------------------------------------------------------------------------------
-- Neden CASCADE? İşletme silinirse o işletmenin tüm session'ları da silinmeli.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'table_sessions_business_id_fkey'
          AND table_name = 'table_sessions'
    ) THEN
        ALTER TABLE table_sessions
        ADD CONSTRAINT table_sessions_business_id_fkey
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. table_sessions.table_id → tables.id (ON DELETE RESTRICT)
-- ------------------------------------------------------------------------------
-- Neden RESTRICT? Açık session'ı olan masa silinmesin.
-- İşletme admin'i bu masa silmek isterse önce session'ı kapatmalı.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'table_sessions_table_id_fkey'
          AND table_name = 'table_sessions'
    ) THEN
        ALTER TABLE table_sessions
        ADD CONSTRAINT table_sessions_table_id_fkey
        FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. table_sessions.closed_by → users.id (ON DELETE SET NULL)
-- ------------------------------------------------------------------------------
-- Neden SET NULL? Kasiyer silinse bile session kapanış kaydı kalsın.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'table_sessions_closed_by_fkey'
          AND table_name = 'table_sessions'
    ) THEN
        ALTER TABLE table_sessions
        ADD CONSTRAINT table_sessions_closed_by_fkey
        FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. order_items.product_id → products.id (ON DELETE RESTRICT)
-- ------------------------------------------------------------------------------
-- Neden RESTRICT? Satılmış bir ürün silinmemeli (rapor bütünlüğü için).
-- Admin ürünü "pasife" alabilir (is_active=false) ama silemez.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'order_items_product_id_fkey'
          AND table_name = 'order_items'
    ) THEN
        ALTER TABLE order_items
        ADD CONSTRAINT order_items_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- ==============================================================================
-- DOĞRULAMA
-- ==============================================================================
-- Aşağıdaki SELECT eklenmiş FK'leri listeler (bilgi amaçlı, çalıştırılmasa da olur)
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS references_table,
    ccu.column_name AS references_column,
    rc.delete_rule,
    tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;