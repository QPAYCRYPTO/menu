-- ==============================================================================
-- 017_staff_title.sql
-- AtlasQR — Personel ünvanı (Garsonlar → Personel)
-- ==============================================================================
--   waiters.title — admin'in serbest yazdığı ünvan (Garson, Komi, Şef, Barista…); rozet olarak görünür.
--   Yetkiler ünvandan bağımsızdır (permissions JSONB olduğu gibi kalır). Boş = ünvansız.
-- ==============================================================================

ALTER TABLE waiters ADD COLUMN IF NOT EXISTS title TEXT
    CHECK (title IS NULL OR char_length(title) <= 40);
