-- ==============================================================================
-- 009_waiter_session_tabs.sql
-- AtlasQR — Garson sekme bazlı izolasyon (multi-tenant security fix)
-- ==============================================================================
-- Sorun:
--   Aynı tarayıcıda 2 farklı garson 2 sekmede çalıştığında localStorage
--   paylaşımlı olduğu için sekme yenilendiğinde son giriş yapan garson
--   tüm sekmelerde görünüyordu (cross-tenant data leak riski).
--
-- Çözüm:
--   Her sekme için unique tab_id üretilir, backend bu tab_id'yi token ile
--   birlikte doğrular. Bir token sadece kayıtlı tab_id ile çalışır.
--
-- Bu migration:
--   1) waiter_session_tabs tablosu oluşturur — (session_id, tab_id) eşlemesi
--   2) waiter_sessions ile FK ilişki kurar
--   3) İndeksler ekler
--
-- Geriye uyumluluk:
--   - waiter_sessions tablosuna DOKUNMUYOR
--   - Mevcut /auth endpoint çalışmaya devam edebilir (tab_id olmadan)
--   - Yeni /exchange endpoint'i tab_id ile session açar
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. waiter_session_tabs tablosu
-- ------------------------------------------------------------------------------
-- Bir session_id, birden fazla tab_id'ye bağlanabilir (garson aynı token ile
-- birden fazla sekme açabilir). Ama her tab_id sadece TEK session'a bağlıdır.

CREATE TABLE IF NOT EXISTS waiter_session_tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES waiter_sessions(id) ON DELETE CASCADE,
    tab_id UUID NOT NULL,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    waiter_id UUID NOT NULL REFERENCES waiters(id) ON DELETE CASCADE,

    -- Audit
    user_agent TEXT,
    ip_address INET,

    -- Zaman damgaları
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,

    -- Aynı tab_id sadece bir aktif session'a bağlanabilir
    -- Eğer tab_id revoke olmuşsa yeni session açabilir
    CONSTRAINT waiter_session_tabs_tab_unique
        UNIQUE (tab_id, revoked_at)
);

-- ------------------------------------------------------------------------------
-- 2. İndeksler
-- ------------------------------------------------------------------------------

-- Hızlı session+tab lookup (her API çağrısında çalışır)
CREATE INDEX IF NOT EXISTS idx_waiter_session_tabs_lookup
    ON waiter_session_tabs(session_id, tab_id)
    WHERE revoked_at IS NULL;

-- Garson bazlı aktif tab listesi
CREATE INDEX IF NOT EXISTS idx_waiter_session_tabs_waiter_active
    ON waiter_session_tabs(waiter_id, revoked_at)
    WHERE revoked_at IS NULL;

-- İşletme bazlı aktif tab listesi (admin paneli için)
CREATE INDEX IF NOT EXISTS idx_waiter_session_tabs_business_active
    ON waiter_session_tabs(business_id, revoked_at)
    WHERE revoked_at IS NULL;

-- ------------------------------------------------------------------------------
-- 3. Trigger: session revoke olunca bağlı tüm tab'ları da revoke et
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION revoke_session_tabs_on_session_revoke()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
        UPDATE waiter_session_tabs
        SET revoked_at = NEW.revoked_at
        WHERE session_id = NEW.id AND revoked_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_revoke_session_tabs ON waiter_sessions;

CREATE TRIGGER trg_revoke_session_tabs
    AFTER UPDATE OF revoked_at ON waiter_sessions
    FOR EACH ROW
    EXECUTE FUNCTION revoke_session_tabs_on_session_revoke();

-- ==============================================================================
-- DOĞRULAMA SORGULARI
--
-- 1. Tablo var mı?
--    SELECT * FROM waiter_session_tabs LIMIT 1;
--
-- 2. İndeksler var mı?
--    SELECT indexname FROM pg_indexes WHERE tablename = 'waiter_session_tabs';
--    → 4 index olmalı (PK + 3 custom)
--
-- 3. Trigger var mı?
--    SELECT trigger_name FROM information_schema.triggers
--    WHERE event_object_table = 'waiter_sessions';
--    → trg_revoke_session_tabs olmalı
-- ==============================================================================