-- ==============================================================================
-- 013_waiter_soft_delete.sql
-- AtlasQR — Garson silme artık kalıcı değil (soft delete)
-- ==============================================================================
-- Neden ayrı kolon (is_active değil):
--   is_active/status zaten "Pasif / İzinli" anlamında kullanılıyor ve pasif garsonlar
--   listede görünüp tekrar aktif yapılabilmeli. Silinen garson ise listeden düşer
--   ama geçmiş siparişlerdeki waiter_id / audit kayıtları bozulmaz.
--
--   1) waiters.deleted_at — doluysa garson silinmiş sayılır
--   2) Email unique index'i sadece silinmemiş garsonları kapsar
--      (silinen garsonun email'i yeni garsona verilebilsin)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. waiters.deleted_at
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'waiters' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE waiters ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Email unique index → silinmemiş garsonlar
-- ------------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_waiters_business_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_waiters_business_email_unique
    ON waiters(business_id, email)
    WHERE email IS NOT NULL AND deleted_at IS NULL;
