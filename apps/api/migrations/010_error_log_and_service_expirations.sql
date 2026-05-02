-- ================================================================
-- AtlasQR — Error Log & Service Expirations Migration
-- Ne zaman: Mayıs 2026
-- Amaç: Süper admin paneli için hata izleme + abonelik takibi
-- ================================================================

-- 1) ERROR LOG TABLOSU
-- ================================================================
CREATE TABLE IF NOT EXISTS error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Sınıflandırma
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  source TEXT NOT NULL CHECK (source IN ('backend', 'frontend', 'external', 'database')),
  
  -- İlişkiler (NULL olabilir — system-wide hatalar için)
  business_id UUID,
  user_id UUID,
  
  -- Hata içeriği
  message TEXT NOT NULL,
  stack TEXT,
  context JSONB,                          -- { endpoint, method, ip, user_agent, browser, ... }
  
  -- Gruplandırma (aynı hata defalarca olunca tek satır + count)
  fingerprint TEXT NOT NULL,
  occurrence_count INT NOT NULL DEFAULT 1,
  
  -- Durum
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'resolved', 'ignored')),
  
  -- Zaman damgaları
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_note TEXT
);

-- Hızlı sorgu için indeksler
CREATE INDEX IF NOT EXISTS idx_error_log_severity_status_lastseen
  ON error_log(severity, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_fingerprint
  ON error_log(fingerprint);

CREATE INDEX IF NOT EXISTS idx_error_log_business_lastseen
  ON error_log(business_id, last_seen_at DESC)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_log_status_new
  ON error_log(last_seen_at DESC)
  WHERE status = 'new';


-- 2) SERVICE EXPIRATIONS TABLOSU
-- ================================================================
CREATE TABLE IF NOT EXISTS service_expirations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  service_name TEXT NOT NULL UNIQUE,      -- 'railway', 'supabase', 'cloudflare_r2', 'domain_atlasqrmenu_com'
  service_type TEXT NOT NULL,             -- 'hosting', 'database', 'storage', 'domain', 'ssl'
  
  expires_at TIMESTAMPTZ,                 -- NULL = aylık aktif (yıllık olmayan)
  monthly_cost_try INT,                   -- Kuruş cinsinden (örn: 7500 = 75 TL)
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'once', 'usage')),
  alert_threshold_days INT NOT NULL DEFAULT 15,
  
  notes TEXT,
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_expirations_expires
  ON service_expirations(expires_at ASC)
  WHERE expires_at IS NOT NULL;


-- 3) SEED DATA — Senin mevcut servislerin
-- ================================================================
INSERT INTO service_expirations (service_name, service_type, billing_cycle, monthly_cost_try, notes)
VALUES
  ('railway', 'hosting', 'monthly', NULL, 'Railway Pro plan — API host. Manuel olarak expires_at güncellenmeli.'),
  ('supabase', 'database', 'monthly', 2500, 'Supabase Pro $25/ay — DB + auth + storage metadata.'),
  ('cloudflare_r2', 'storage', 'usage', NULL, 'Pay-as-you-go. Storage + egress maliyet aylık değişir.'),
  ('domain_atlasqrmenu_com', 'domain', 'yearly', NULL, 'Domain renewal — yıllık. expires_at güncellenmeli.')
ON CONFLICT (service_name) DO NOTHING;


-- ================================================================
-- TAMAM. Aşağıdaki sorgu ile doğrulayabilirsin:
-- ================================================================
-- SELECT * FROM error_log LIMIT 1;
-- SELECT * FROM service_expirations;