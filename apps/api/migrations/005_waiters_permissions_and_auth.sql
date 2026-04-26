-- ==============================================================================
-- 005_waiters_permissions_and_auth.sql
-- AtlasQR - Garson Modülü: Yetkiler, Status ve Email/Şifre Girişi
-- ==============================================================================
-- Bu migration, 004_waiters_module.sql'in üstüne eklenir.
-- Hiçbir mevcut veriyi bozmaz, sadece yeni alanlar ekler.
--
-- Eklediği yeni alanlar (waiters tablosu):
--   1) phone           → WhatsApp linki gönderebilmek için telefon
--   2) email           → Email ile giriş için (işletme içinde unique)
--   3) password_hash   → Argon2 hash, email ile giriş için
--   4) permissions     → JSONB, yetki objesi
--   5) status          → 'active' | 'on_leave' | 'inactive'
--
-- Geriye uyumluluk:
--   - is_active alanı KALDI (eski kod kırılmasın)
--   - status alanı is_active'i kapsar: active→true, on_leave/inactive→false
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. phone — Telefon numarası (WhatsApp için)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'waiters' AND column_name = 'phone'
    ) THEN
        ALTER TABLE waiters ADD COLUMN phone VARCHAR(30);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. email — Email adresi (login için, opsiyonel)
-- ------------------------------------------------------------------------------
-- Unique: aynı işletmede aynı email 2 garsona verilemez.
-- NULL olabilir (email vermeyen garsonlar için).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'waiters' AND column_name = 'email'
    ) THEN
        ALTER TABLE waiters ADD COLUMN email VARCHAR(200);

        -- Partial unique index: sadece NULL olmayan değerler unique olmalı
        -- Aynı işletmede iki garsonun aynı email'i olamaz
        CREATE UNIQUE INDEX idx_waiters_business_email_unique
            ON waiters(business_id, email)
            WHERE email IS NOT NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. password_hash — Email girişi için şifre (Argon2 hash)
-- ------------------------------------------------------------------------------
-- Sadece email varsa anlamlı. NULL olabilir (QR-only garson).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'waiters' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE waiters ADD COLUMN password_hash TEXT;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. permissions — Yetki objesi (JSONB)
-- ------------------------------------------------------------------------------
-- Varsayılan yetkiler: Yeni garson ne yapabilir?
-- Güvenlik öncelikli, tehlikeli yetkiler default KAPALI.
--
-- Şema:
-- {
--   "can_delete_items": false,        // Adisyondan ürün silme (admin onayı gerekli)
--   "can_merge_tables": false,        // Masa birleştirme/ayırma
--   "can_transfer_table": false,      // Masa transferi
--   "can_see_other_tables": true,     // Diğer garsonların masalarını görebilir
--   "can_add_note": true,             // Adisyona not ekleyebilir
--   "can_use_break": true             // Mola/vardiya sistemini kullanabilir
-- }
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'waiters' AND column_name = 'permissions'
    ) THEN
        ALTER TABLE waiters ADD COLUMN permissions JSONB NOT NULL DEFAULT '{
            "can_delete_items": false,
            "can_merge_tables": false,
            "can_transfer_table": false,
            "can_see_other_tables": true,
            "can_add_note": true,
            "can_use_break": true
        }'::jsonb;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. status — Garson durumu (active / on_leave / inactive)
-- ------------------------------------------------------------------------------
-- is_active boolean alanından daha zengin: izinli ayrı bir durum.
--
-- active    → Çalışıyor, sipariş alabilir, QR alabilir
-- on_leave  → İzinli, geçici pasif. Session iptal, giriş yapamaz.
-- inactive  → İşten ayrılmış. Session iptal. Tekrar aktif edilebilir ama
--             listede ayrı gösterilir.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'waiters' AND column_name = 'status'
    ) THEN
        ALTER TABLE waiters ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';

        -- Check constraint: sadece geçerli değerler
        ALTER TABLE waiters ADD CONSTRAINT waiters_status_check
            CHECK (status IN ('active', 'on_leave', 'inactive'));

        -- Mevcut kayıtların status'unu is_active'e göre ayarla
        UPDATE waiters SET status = 'active' WHERE is_active = TRUE;
        UPDATE waiters SET status = 'inactive' WHERE is_active = FALSE;

        -- Index: status bazlı sorgular için
        CREATE INDEX idx_waiters_business_status ON waiters(business_id, status);
    END IF;
END $$;

-- ==============================================================================
-- DOĞRULAMA
-- ==============================================================================
-- Bu migration sonrası şu sorgular beklenen sonuçları dönmeli:
--
-- 1. Yeni alanlar var mı?
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'waiters'
--      AND column_name IN ('phone', 'email', 'password_hash', 'permissions', 'status');
--    → 5 satır
--
-- 2. Mevcut garsonların permissions'u varsayılan değer mi?
--    SELECT id, name, permissions FROM waiters;
--    → Hepsinde yukarıdaki JSON olmalı
--
-- 3. Mevcut garsonların status'u is_active'e göre mi?
--    SELECT name, is_active, status FROM waiters;
--    → is_active=TRUE olanlar status='active', FALSE olanlar status='inactive'
--
-- 4. Email unique çalışıyor mu?
--    INSERT INTO waiters (business_id, name, email) VALUES ('X', 'A', 'test@k.com');
--    INSERT INTO waiters (business_id, name, email) VALUES ('X', 'B', 'test@k.com');
--    → 2. INSERT unique violation hatası vermeli
-- ==============================================================================