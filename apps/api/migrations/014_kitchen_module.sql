-- ==============================================================================
-- 014_kitchen_module.sql
-- AtlasQR — Mutfak ekranı modülü (link/token ile açılan, şifresiz mutfak görünümü)
-- ==============================================================================
--   1) businesses.kitchen_module_enabled — süper admin işletme bazında açar/kapatır
--      (garson modülüyle aynı desen; varsayılan FALSE → mevcut işletmelerde değişiklik yok)
--   2) kitchen_tokens — /mutfak?t=<token> linkinin token'ı
--      - token: 32 karakter hex, benzersiz
--      - Bir işletmenin aynı anda yalnızca bir aktif token'ı olur (partial unique index)
--      - Yeni token üretilince eskisi is_active = FALSE yapılır (geçmiş kayıt korunur)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. businesses.kitchen_module_enabled — Feature Flag
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses' AND column_name = 'kitchen_module_enabled'
    ) THEN
        ALTER TABLE businesses
        ADD COLUMN kitchen_module_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. kitchen_tokens
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kitchen_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    token        TEXT NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- İşletme başına tek aktif token
CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_tokens_one_active
    ON kitchen_tokens(business_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_kitchen_tokens_business
    ON kitchen_tokens(business_id);
