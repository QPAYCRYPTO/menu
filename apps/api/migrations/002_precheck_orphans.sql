-- ==============================================================================
-- 002_precheck_orphans.sql
-- AtlasQR - Orphan Veri Kontrol Raporu
-- ==============================================================================
-- Bu dosya SADECE SELECT içerir. Hiçbir veri değişikliği yapmaz.
-- Amaç: 003_add_missing_foreign_keys.sql çalıştırılmadan önce,
-- FK eklemeyi engelleyecek orphan kayıtların var olup olmadığını tespit etmek.
--
-- Kullanım:
-- 1. Bu sorguları Supabase SQL Editor'da sırayla çalıştır
-- 2. Tüm sonuçlar 0 dönmeli
-- 3. Herhangi bir sorgu > 0 dönerse: o veriyi temizle veya NULL'la, sonra FK ekle
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. orders.session_id → table_sessions.id
-- ------------------------------------------------------------------------------
SELECT 
    'orders.session_id' AS field,
    COUNT(*) AS orphan_count
FROM orders o
WHERE o.session_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM table_sessions s WHERE s.id = o.session_id
  );

-- ------------------------------------------------------------------------------
-- 2. orders.cancelled_by → users.id
-- ------------------------------------------------------------------------------
SELECT 
    'orders.cancelled_by' AS field,
    COUNT(*) AS orphan_count
FROM orders o
WHERE o.cancelled_by IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM users u WHERE u.id = o.cancelled_by
  );

-- ------------------------------------------------------------------------------
-- 3. table_sessions.business_id → businesses.id
-- ------------------------------------------------------------------------------
SELECT 
    'table_sessions.business_id' AS field,
    COUNT(*) AS orphan_count
FROM table_sessions s
WHERE NOT EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = s.business_id
);

-- ------------------------------------------------------------------------------
-- 4. table_sessions.table_id → tables.id
-- ------------------------------------------------------------------------------
SELECT 
    'table_sessions.table_id' AS field,
    COUNT(*) AS orphan_count
FROM table_sessions s
WHERE NOT EXISTS (
    SELECT 1 FROM tables t WHERE t.id = s.table_id
);

-- ------------------------------------------------------------------------------
-- 5. table_sessions.closed_by → users.id
-- ------------------------------------------------------------------------------
SELECT 
    'table_sessions.closed_by' AS field,
    COUNT(*) AS orphan_count
FROM table_sessions s
WHERE s.closed_by IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM users u WHERE u.id = s.closed_by
  );

-- ------------------------------------------------------------------------------
-- 6. order_items.product_id → products.id
-- ------------------------------------------------------------------------------
SELECT 
    'order_items.product_id' AS field,
    COUNT(*) AS orphan_count
FROM order_items oi
WHERE NOT EXISTS (
    SELECT 1 FROM products p WHERE p.id = oi.product_id
);

-- ==============================================================================
-- HEPSİ TEK SORGUDA (özet rapor)
-- ==============================================================================
SELECT field, orphan_count
FROM (
    SELECT 'orders.session_id' AS field, COUNT(*) AS orphan_count
    FROM orders o
    WHERE o.session_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM table_sessions s WHERE s.id = o.session_id)
    
    UNION ALL
    
    SELECT 'orders.cancelled_by', COUNT(*)
    FROM orders o
    WHERE o.cancelled_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = o.cancelled_by)
    
    UNION ALL
    
    SELECT 'table_sessions.business_id', COUNT(*)
    FROM table_sessions s
    WHERE NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = s.business_id)
    
    UNION ALL
    
    SELECT 'table_sessions.table_id', COUNT(*)
    FROM table_sessions s
    WHERE NOT EXISTS (SELECT 1 FROM tables t WHERE t.id = s.table_id)
    
    UNION ALL
    
    SELECT 'table_sessions.closed_by', COUNT(*)
    FROM table_sessions s
    WHERE s.closed_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.closed_by)
    
    UNION ALL
    
    SELECT 'order_items.product_id', COUNT(*)
    FROM order_items oi
    WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = oi.product_id)
) t
ORDER BY orphan_count DESC;