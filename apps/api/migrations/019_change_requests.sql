-- ==============================================================================
-- 019_change_requests.sql
-- AtlasQR — Onaya düşen sipariş değişiklikleri (iptal / adet azaltma)
-- ==============================================================================
--   "Sipariş silebilir" yetkisi OLMAYAN personelin iptal ve adet azaltma istekleri doğrudan uygulanmaz;
--   buraya 'pending' kayıt düşer, admin onaylarsa uygulanır, reddederse sipariş aynen kalır.
--   kind:
--     order_cancel   — siparişin tamamını iptal (reason_code/reason_text personelin seçtiği gerekçe)
--     item_decrease  — bir kalemin adedini azaltma (old_quantity → requested_quantity, en az 1)
--   status: pending → approved | rejected | void (sipariş bu arada kapandıysa / başka yoldan değiştiyse)
--   Aynı sipariş için tek bekleyen iptal, aynı kalem için tek bekleyen azaltma olabilir.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS order_change_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id       UUID REFERENCES order_items(id) ON DELETE CASCADE,
    kind                TEXT NOT NULL CHECK (kind IN ('order_cancel', 'item_decrease')),
    old_quantity        INT,
    requested_quantity  INT CHECK (requested_quantity IS NULL OR requested_quantity >= 1),
    reason_code         TEXT,
    reason_text         TEXT,
    waiter_id           UUID REFERENCES waiters(id) ON DELETE SET NULL,
    waiter_name         TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'void')),
    decided_by          UUID,
    decided_at          TIMESTAMPTZ,
    decision_note       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT order_change_requests_item_kind CHECK (
        (kind = 'order_cancel' AND order_item_id IS NULL) OR
        (kind = 'item_decrease' AND order_item_id IS NOT NULL AND requested_quantity IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_change_requests_business_status
    ON order_change_requests (business_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_change_requests_pending_cancel
    ON order_change_requests (order_id) WHERE status = 'pending' AND kind = 'order_cancel';

CREATE UNIQUE INDEX IF NOT EXISTS uq_change_requests_pending_item
    ON order_change_requests (order_item_id) WHERE status = 'pending' AND kind = 'item_decrease';
