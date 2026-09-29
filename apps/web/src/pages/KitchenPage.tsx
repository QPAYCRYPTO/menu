// apps/web/src/pages/KitchenPage.tsx
// Admin → Mutfak: mutfak ekranı linkini oluşturma / kopyalama / sıfırlama.
// Link şifresizdir; linke sahip olan mutfak ekranını açar. Sıfırlanınca eski link hemen geçersiz olur.
import { useEffect, useState } from 'react';
import { ChefHat, Copy, ExternalLink, Link2, RefreshCw } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ConfirmModal, type ConfirmState } from '../components/ConfirmModal';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';

const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://www.atlasqrmenu.com';

type KitchenToken = { token: string; created_at: string } | null;

export function kitchenLink(token: string): string {
  return `${PUBLIC_BASE_URL}/mutfak?t=${token}`;
}

export function KitchenPage() {
  const { accessToken } = useAuth();
  const [token, setToken] = useState<KitchenToken>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  useEffect(() => {
    if (!accessToken) return;
    apiRequest<{ token: KitchenToken }>('/kitchen/token', { token: accessToken })
      .then(r => setToken(r.token))
      .catch(e => setError(e instanceof Error ? e.message : 'Mutfak linki alınamadı.'))
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function generate() {
    if (!accessToken) return;
    setWorking(true);
    try {
      const r = await apiRequest<{ token: NonNullable<KitchenToken> }>('/kitchen/token', { method: 'POST', token: accessToken });
      const hadToken = !!token;
      setToken(r.token);
      showToast(hadToken ? 'Link sıfırlandı. Eski link artık çalışmaz.' : 'Mutfak linki oluşturuldu.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Link oluşturulamadı.', 'error');
    } finally {
      setWorking(false);
    }
  }

  function askReset() {
    setConfirm({
      title: 'Mutfak linki sıfırlansın mı?',
      message: 'Yeni bir link üretilecek. Eski linkle açık olan mutfak ekranları hemen kapanır; mutfağa yeni linki vermeniz gerekir.',
      confirmText: 'Linki Sıfırla',
      tone: 'warning',
      onConfirm: generate
    });
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link kopyalandı.', 'success');
    } catch {
      showToast('Kopyalanamadı. Linki seçip elle kopyalayın.', 'error');
    }
  }

  const link = token ? kitchenLink(token.token) : '';

  return (
    <div className="max-w-2xl text-white">
      <Toast state={toast} />
      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />

      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/20">
          <h2 className="font-serif font-bold text-lg flex items-center gap-2">
            <ChefHat size={16} className="text-amber-300" /> Mutfak Ekranı
          </h2>
          <p className="text-xs mt-1 text-white/65">
            Mutfaktaki tablet veya ekranda bu linki açın. Bekleyen siparişler anında görünür, "Hazırlandı" deyince garsona bildirim gider.
          </p>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-[var(--accent)] animate-spin" />
            </div>
          ) : error ? (
            <div className="px-4 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.4)' }}>
              {error}
            </div>
          ) : !token ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-white/15 border border-white/30">
                <Link2 size={22} className="text-amber-300" />
              </div>
              <p className="text-sm text-white/75 mb-5">Henüz mutfak linki oluşturulmadı.</p>
              <button onClick={generate} disabled={working}
                className="btn-accent px-6 py-2.5 rounded-2xl text-sm font-bold inline-flex items-center gap-2 spring-btn disabled:opacity-60">
                <Link2 size={14} /> {working ? 'Oluşturuluyor…' : 'Mutfak Linki Oluştur'}
              </button>
            </div>
          ) : (
            <>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-white/75">Mutfak linki</label>
              <div className="glass-input rounded-2xl px-4 py-3 text-sm font-mono break-all select-all text-amber-300">{link}</div>
              <p className="text-xs mt-2 text-white/55">
                Oluşturulma: {new Date(token.created_at).toLocaleString('tr-TR')} · Bu linki yalnızca mutfakla paylaşın.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-5">
                <button onClick={() => copy(link)}
                  className="btn-accent py-2.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 spring-btn">
                  <Copy size={14} /> Kopyala
                </button>
                <a href={link} target="_blank" rel="noreferrer"
                  className="glass-pill py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 spring-btn">
                  <ExternalLink size={14} /> Aç
                </a>
                <button onClick={askReset} disabled={working}
                  className="glass-pill py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 spring-btn disabled:opacity-60"
                  style={{ color: 'var(--warning)' }}>
                  <RefreshCw size={14} /> Linki Sıfırla
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
