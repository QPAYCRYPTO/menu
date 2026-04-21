-- ==============================================================================
-- 001_baseline.sql
-- AtlasQR - Data Model Baseline (Frozen Snapshot)
-- ==============================================================================
-- Bu dosya, 2026-04-20 tarihindeki mevcut production şemasının birebir kopyasıdır.
-- Hiçbir davranış değişikliği, optimizasyon veya temizlik içermez.
-- Yeni migration'lar bu dosyanın üzerine inşa edilir.
--
-- Tüm CREATE/ALTER komutları IDEMPOTENT'tir (IF NOT EXISTS).
-- Aynı migration birden fazla çalıştırılabilir, sorun olmaz.
--
-- NOT: Bu baseline, eksik foreign key'leri İÇERMEZ.
-- FK'ler sonraki migration'da (003_add_missing_foreign_keys) eklenecek.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid() için

-- ------------------------------------------------------------------------------
-- 1. BUSINESSES (İşletmeler)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS businesses (
    id                 UUID PRIMARY KEY,
    name               TEXT NOT NULL,
    slug               TEXT NOT NULL UNIQUE,
    logo_url           TEXT,
    theme_color        TEXT,
    bg_color           TEXT,
    dark_mode          BOOLEAN NOT NULL DEFAULT FALSE,
    description        TEXT,
    contact_name       TEXT,
    contact_phone      TEXT,
    contact_email      TEXT,
    contact_whatsapp   TEXT,
    contact_instagram  TEXT,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS businesses_slug_idx ON businesses (slug);
CREATE INDEX IF NOT EXISTS idx_businesses_active ON businesses (id, is_active);

-- ------------------------------------------------------------------------------
-- 2. USERS (Kullanıcılar: admin, owner, superadmin)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY,
    business_id         UUID REFERENCES businesses(id) ON DELETE CASCADE,
    email               TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    refresh_token_hash  TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    role                TEXT NOT NULL DEFAULT 'admin',
    password_version    INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS users_business_id_is_active_idx ON users (business_id, is_active);

-- ------------------------------------------------------------------------------
-- 3. CATEGORIES (Ürün Kategorileri)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id           UUID PRIMARY KEY,
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    sort_order   INTEGER NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS categories_business_id_is_active_sort_order_idx 
    ON categories (business_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_business_id 
    ON categories (business_id);
CREATE INDEX IF NOT EXISTS idx_categories_active_true 
    ON categories (business_id, sort_order) 
    WHERE is_active = TRUE;

-- ------------------------------------------------------------------------------
-- 4. PRODUCTS (Ürünler)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id           UUID PRIMARY KEY,
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    price_int    INTEGER NOT NULL,
    image_url    TEXT,
    thumb_url    TEXT,
    sort_order   INTEGER NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS products_business_id_is_active_sort_order_idx 
    ON products (business_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_business_id 
    ON products (business_id);
CREATE INDEX IF NOT EXISTS idx_products_active_true 
    ON products (business_id, sort_order) 
    WHERE is_active = TRUE;

-- ------------------------------------------------------------------------------
-- 5. TABLES (Masalar)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tables (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 1,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    qr_url       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tables_business_id ON tables (business_id);

-- ------------------------------------------------------------------------------
-- 6. TABLE_SESSIONS (Masa Oturumları — Finansal Hesap)
-- ------------------------------------------------------------------------------
-- NOT: business_id, table_id, closed_by için FK'ler eksik (003'te eklenecek)
CREATE TABLE IF NOT EXISTS table_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID NOT NULL,
    table_id          UUID NOT NULL,
    opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at         TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'open',
    cached_total_int  INTEGER NOT NULL DEFAULT 0,
    closed_by         UUID,
    auto_closed       BOOLEAN NOT NULL DEFAULT FALSE,
    note              TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bir masada en fazla 1 açık session olabilir (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session_per_table 
    ON table_sessions (table_id) 
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_sessions_business_status 
    ON table_sessions (business_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_business_updated 
    ON table_sessions (business_id, updated_at DESC);

-- ------------------------------------------------------------------------------
-- 7. ORDERS (Siparişler)
-- ------------------------------------------------------------------------------
-- NOT: session_id ve cancelled_by için FK'ler eksik (003'te eklenecek)
CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    table_id        UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    table_name      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    note            TEXT,
    type            TEXT NOT NULL DEFAULT 'order',
    customer_token  TEXT,
    session_id      UUID,
    cancelled_at    TIMESTAMPTZ,
    cancelled_by    UUID,
    cancel_reason   TEXT,
    delivered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_business_id 
    ON orders (business_id);
CREATE INDEX IF NOT EXISTS idx_orders_business_status_created 
    ON orders (business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_business_token_created 
    ON orders (business_id, customer_token, created_at DESC) 
    WHERE customer_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_at 
    ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_token 
    ON orders (customer_token);
CREATE INDEX IF NOT EXISTS idx_orders_session 
    ON orders (session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status 
    ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_table_status_created 
    ON orders (table_id, status, created_at DESC);

-- ------------------------------------------------------------------------------
-- 8. ORDER_ITEMS (Sipariş Kalemleri)
-- ------------------------------------------------------------------------------
-- NOT: product_id için FK eksik (003'te eklenecek)
CREATE TABLE IF NOT EXISTS order_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL,
    product_name  TEXT NOT NULL,
    quantity      INTEGER NOT NULL DEFAULT 1,
    price_int     INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);

-- ------------------------------------------------------------------------------
-- 9. PASSWORD_RESETS (Şifre Sıfırlama Tokenleri)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
    id           UUID PRIMARY KEY,
    business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    expires_at   TIMESTAMP NOT NULL,
    used_at      TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS password_resets_token_hash_idx ON password_resets (token_hash);

-- ==============================================================================
-- BASELINE SONU
-- ==============================================================================
-- Sonraki migration'lar:
--   002_precheck_orphans.sql         → Orphan veri kontrolü (SELECT)
--   003_add_missing_foreign_keys.sql → Eksik FK'leri ekle
--   004_cleanup_duplicate_indexes.sql → Gereksiz index'leri sil
-- ==============================================================================