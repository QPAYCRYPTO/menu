-- 023_item_cancellations.sql
-- Ürün bazlı iptal + mutfak bildirimi
--
-- order_item_cancellations: mutfak BAŞLADIKTAN sonra (Hazırlanıyor/Hazır) iptal edilen her kalem.
--   Ürün/adet/fiyat anlık kopyalanır (kalem silinse ya da adedi düşse bile ne iptal edildiği görünür).
--   Kim: personel (waiter_id) ya da admin (user_id); onaya düştüyse onaylayan admin (approved_by).
--   Mutfak başlamadan yapılan düzeltmeler buraya yazılmaz (iptal değil, düzeltme sayılır).
--
-- orders.kitchen_notice: mutfağın "Gördüm" demesi gereken değişiklikler (ekleme, adet, iptal, talep).
--   Doluyken mutfak kartı yanıp söner; "Gördüm" ile temizlenir.
--
-- order_change_requests: yeni tür items_cancel — seçilen kalemlerin (adetleriyle) iptal talebi.

CREATE TABLE IF NOT EXISTS order_item_cancellations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id      UUID REFERENCES order_items(id) ON DELETE SET NULL,
    product_name       TEXT NOT NULL,
    quantity           INTEGER NOT NULL CHECK (quantity > 0),
    price_int          INTEGER NOT NULL,
    reason_code        TEXT NOT NULL,
    reason_text        TEXT,
    -- İptal anında siparişin aşaması (preparing / ready)
    order_status       TEXT NOT NULL,
    -- Siparişin tamamı mı iptal edildi
    whole_order        BOOLEAN NOT NULL DEFAULT FALSE,
    waiter_id          UUID REFERENCES waiters(id) ON DELETE SET NULL,
    user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name         TEXT NOT NULL,
    approved_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    change_request_id  UUID REFERENCES order_change_requests(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_item_cancellations_order ON order_item_cancellations (order_id);
CREATE INDEX IF NOT EXISTS idx_item_cancellations_business_created ON order_item_cancellations (business_id, created_at DESC);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_notice JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_notice_at TIMESTAMPTZ;

ALTER TABLE order_change_requests ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE order_change_requests DROP CONSTRAINT IF EXISTS order_change_requests_kind_check;
ALTER TABLE order_change_requests ADD CONSTRAINT order_change_requests_kind_check
    CHECK (kind IN ('order_cancel', 'item_decrease', 'items_cancel'));
ALTER TABLE order_change_requests DROP CONSTRAINT IF EXISTS order_change_requests_item_kind;
ALTER TABLE order_change_requests ADD CONSTRAINT order_change_requests_item_kind CHECK (
    (kind = 'order_cancel' AND order_item_id IS NULL) OR
    (kind = 'item_decrease' AND order_item_id IS NOT NULL AND requested_quantity IS NOT NULL) OR
    (kind = 'items_cancel' AND order_item_id IS NULL AND items IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_change_requests_pending_items
    ON order_change_requests (order_id) WHERE status = 'pending' AND kind = 'items_cancel';
