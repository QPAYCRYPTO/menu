-- 022_payments.sql
-- Kasa Aşama 2: her tahsilat ayrı kayıt (payments), indirim/ikram kayıtları (discounts).
-- Kalan = kalemler toplamı − indirimler − (iptal edilmemiş) ödemeler.
-- order_items.is_paid korunur: ürün seçerek ödemede işaretlenir (item_ids ile bağlı).

CREATE TABLE IF NOT EXISTS payments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    session_id    UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    amount_int    INTEGER NOT NULL CHECK (amount_int > 0),
    method        TEXT NOT NULL CHECK (method IN ('cash', 'card', 'meal_card')),
    note          TEXT,
    -- Ürün seçerek yapılan ödemede ödendi işaretlenen kalemler (iptalde geri alınır)
    item_ids      UUID[] NOT NULL DEFAULT '{}',
    collected_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at     TIMESTAMPTZ,
    voided_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    void_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_session ON payments (session_id);
CREATE INDEX IF NOT EXISTS idx_payments_business_created ON payments (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS discounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    session_id     UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
    type           TEXT NOT NULL CHECK (type IN ('discount', 'complimentary')),
    -- Uygulanan tutar (yüzdeyse o anki hesaptan hesaplanmış hali)
    amount_int     INTEGER NOT NULL CHECK (amount_int > 0),
    percent        INTEGER CHECK (percent BETWEEN 1 AND 100),
    applies_to     TEXT NOT NULL CHECK (applies_to IN ('session', 'item')),
    order_item_id  UUID REFERENCES order_items(id) ON DELETE SET NULL,
    note           TEXT,
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at      TIMESTAMPTZ,
    voided_by      UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_discounts_session ON discounts (session_id);

-- Açık hesaplarda eski sistemle "ödendi" işaretlenmiş kalemler → ödeme kaydı (kalan doğru hesaplansın)
INSERT INTO payments (business_id, session_id, amount_int, method, note, item_ids, created_at)
SELECT o.business_id, o.session_id,
       SUM(oi.price_int * oi.quantity)::int,
       CASE o.payment_method WHEN 'card' THEN 'card' WHEN 'other' THEN 'meal_card' ELSE 'cash' END,
       'Önceki sistemden aktarıldı',
       array_agg(oi.id),
       COALESCE(MIN(oi.paid_at), NOW())
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN table_sessions s ON s.id = o.session_id
WHERE s.status = 'open'
  AND oi.is_paid = TRUE
  AND o.status <> 'cancelled'
  AND o.type = 'order'
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.session_id = o.session_id)
GROUP BY o.business_id, o.session_id, o.id, o.payment_method
HAVING SUM(oi.price_int * oi.quantity) > 0;
