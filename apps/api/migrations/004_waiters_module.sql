-- ==============================================================================
-- 004_waiters_module.sql
-- AtlasQR - Garson Modülü (Waiters Module) - v2
-- ==============================================================================
-- Amaç: Garson rolü, QR ile giriş sistemi, vardiyalı oturum yönetimi.
--
-- Mevcut sistemi BOZMAZ:
--   - Tüm yeni alanlar ve tablolar opsiyonel (nullable / flag kapalı).
--   - businesses.waiter_module_enabled varsayılan FALSE → mevcut müşterilerde hiçbir şey değişmez.
--   - orders.waiter_id ve order_items.waiter_id nullable → eski siparişler etkilenmez.
--
-- Eklediği yeni yapılar:
--   1) businesses.waiter_module_enabled (BOOLEAN, default FALSE) → feature flag
--   2) waiters tablosu                                          → garson kayıtları
--   3) waiter_sessions tablosu (business_id dahil, tenant izolasyonu)
--   4) orders.waiter_id                                         → hangi garson oluşturdu
--   5) order_items.waiter_id                                    → hangi garson ekledi (kalem bazında)
--   6) Partial index'ler (aktif session query'leri için optimize)
--
-- v2 değişiklikleri (feedback sonrası):
--   - waiter_sessions'a business_id eklendi (multi-tenant izolasyon)
--   - waiter_sessions'a failed_attempts, last_attempt_at eklendi (brute-force tracking)
--   - Partial index: WHERE revoked_at IS NULL (aktif session sorguları için)
--   - Uyarı notu: garson disable edilince aktif session'ları kapatma uygulama
--     katmanında yapılacak (waiterService içinde).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. businesses.waiter_module_enabled — Feature Flag
-- ------------------------------------------------------------------------------
-- Varsayılan FALSE. Superadmin bir işletme için TRUE'ya çekebilir.
-- Mevcut işletmelerin hiçbiri etkilenmez.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses' AND column_name = 'waiter_module_enabled'
    ) THEN
        ALTER TABLE businesses
        ADD COLUMN waiter_module_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. waiters tablosu — Garson Kayıtları
-- ------------------------------------------------------------------------------
-- Her garson bir işletmeye bağlı. Aktif olan garsonlar sisteme QR ile girebilir.
-- is_active = false olanların aktif session'ları uygulama katmanında iptal edilir.
CREATE TABLE IF NOT EXISTS waiters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL,
    name            VARCHAR(100) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT waiters_business_id_fkey
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_waiters_business_id ON waiters(business_id);
CREATE INDEX IF NOT EXISTS idx_waiters_business_active
    ON waiters(business_id)
    WHERE is_active = TRUE;

-- ------------------------------------------------------------------------------
-- 3. waiter_sessions tablosu — QR Token + Vardiya Süresi
-- ------------------------------------------------------------------------------
-- business_id (tenant izolasyonu için): her query'de WHERE business_id = X
--   konulacak, query leak'i engellenir. waiter_id dolaylı gidişe güvenilmez.
--
-- token_hash: SHA-256 hash (token'ın düz hali sadece oluşturma anında gösterilir).
-- expires_at: vardiya sonu (admin saat seçti: örn 8 saat sonrası).
-- revoked_at: admin manuel iptal ettiyse, yeni QR üretildiyse, veya garson
--   pasif hale getirildiyse burası doldurulur.
--
-- failed_attempts & last_attempt_at: brute-force denemelerini takip eder.
--   Uygulama katmanı bunu okuyup rate limit yapar.
--
-- Aktif token = revoked_at IS NULL AND expires_at > NOW()
CREATE TABLE IF NOT EXISTS waiter_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    waiter_id           UUID NOT NULL,
    business_id         UUID NOT NULL,
    token_hash          VARCHAR(128) NOT NULL UNIQUE,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    failed_attempts     INT NOT NULL DEFAULT 0,
    last_attempt_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at        TIMESTAMPTZ,
    CONSTRAINT waiter_sessions_waiter_id_fkey
        FOREIGN KEY (waiter_id) REFERENCES waiters(id) ON DELETE CASCADE,
    CONSTRAINT waiter_sessions_business_id_fkey
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Index: waiter bazlı tüm session'ları listelemek için
CREATE INDEX IF NOT EXISTS idx_waiter_sessions_waiter_id ON waiter_sessions(waiter_id);

-- Index: tenant bazlı izolasyon için
CREATE INDEX IF NOT EXISTS idx_waiter_sessions_business_id ON waiter_sessions(business_id);

-- Partial index: gerçek auth query'si için optimize
-- Query şekli: WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
-- Partial index sadece aktif (revoked_at IS NULL) satırlarda çalışır, çok daha hızlı.
CREATE INDEX IF NOT EXISTS idx_waiter_sessions_active_token
    ON waiter_sessions(token_hash)
    WHERE revoked_at IS NULL;

-- Index: expire olmuş ama revoke olmamış session'ları temizleme query'si için
CREATE INDEX IF NOT EXISTS idx_waiter_sessions_expires_at
    ON waiter_sessions(expires_at)
    WHERE revoked_at IS NULL;

-- ------------------------------------------------------------------------------
-- 4. orders.waiter_id — Hangi Garson Oluşturdu
-- ------------------------------------------------------------------------------
-- Nullable: müşteri QR'dan sipariş verirse NULL kalır (eski davranış korunur).
-- Garson sipariş oluşturursa kendi id'si yazılır.
-- ON DELETE SET NULL: garson silinse bile sipariş tarihçesi kaybolmaz.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'waiter_id'
    ) THEN
        ALTER TABLE orders
        ADD COLUMN waiter_id UUID;

        ALTER TABLE orders
        ADD CONSTRAINT orders_waiter_id_fkey
        FOREIGN KEY (waiter_id) REFERENCES waiters(id) ON DELETE SET NULL;

        CREATE INDEX idx_orders_waiter_id ON orders(waiter_id);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. order_items.waiter_id — Hangi Garson Ekledi (Kalem Bazında)
-- ------------------------------------------------------------------------------
-- Adisyonda birden fazla garson sipariş ekleyebilir.
-- Her kalem için "hangi garson ekledi" bilgisi tutulur — patron raporu için.
-- Nullable: müşterinin eklediği kalemler için NULL.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_items' AND column_name = 'waiter_id'
    ) THEN
        ALTER TABLE order_items
        ADD COLUMN waiter_id UUID;

        ALTER TABLE order_items
        ADD CONSTRAINT order_items_waiter_id_fkey
        FOREIGN KEY (waiter_id) REFERENCES waiters(id) ON DELETE SET NULL;

        CREATE INDEX idx_order_items_waiter_id ON order_items(waiter_id);
    END IF;
END $$;

-- ==============================================================================
-- UYGULAMA KATMANI SORUMLULUKLARI (Bu migration'da YAPILMADI, servis katmanında yapılacak)
-- ==============================================================================
-- 1. Garson disable edilince (waiters.is_active = false):
--    UPDATE waiter_sessions SET revoked_at = NOW()
--    WHERE waiter_id = X AND revoked_at IS NULL;
--
-- 2. Garson için yeni QR üretilince:
--    Mevcut aktif session'ları revoke et:
--    UPDATE waiter_sessions SET revoked_at = NOW()
--    WHERE waiter_id = X AND revoked_at IS NULL;
--    Sonra yeni session oluştur.
--
-- 3. Her auth denemesinde:
--    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
--    Bulursa: last_used_at = NOW() güncelle
--    Bulamazsa ve token_hash var ama revoked: failed_attempts += 1, last_attempt_at = NOW()
--
-- 4. Rate limit (Redis veya uygulama):
--    Aynı IP'den 1 dakikada 10'dan fazla başarısız deneme → 15 dk block
--
-- 5. RLS (Row Level Security):
--    Bu projede uygulama katmanında tenant filtresi kullanıldığı için (her query'de
--    WHERE business_id = X) şu an RLS gerekli değil. İleride SuperAdmin dışından
--    doğrudan DB erişimi olursa RLS eklenmeli.
-- ==============================================================================

-- ==============================================================================
-- DOĞRULAMA
-- ==============================================================================
-- 1. Yeni tablolar var mı?
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN ('waiters', 'waiter_sessions');
--    → 2 satır
--
-- 2. Flag eklendi mi, varsayılan FALSE mu?
--    SELECT COUNT(*) FROM businesses WHERE waiter_module_enabled = FALSE;
--    → Mevcut tüm işletme sayısı
--
-- 3. orders.waiter_id var mı, tüm eski siparişler NULL mu?
--    SELECT COUNT(*) FROM orders WHERE waiter_id IS NULL;
--    → Mevcut tüm sipariş sayısı
--
-- 4. waiter_sessions'ta business_id FK var mı?
--    SELECT constraint_name FROM information_schema.table_constraints
--    WHERE table_name = 'waiter_sessions' AND constraint_type = 'FOREIGN KEY';
--    → 2 satır (waiter_id_fkey + business_id_fkey)
--
-- 5. Partial index'ler oluştu mu?
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'waiter_sessions';
--    → En az 5 index (waiter_id, business_id, active_token, expires_at, unique_token_hash)
-- ==============================================================================