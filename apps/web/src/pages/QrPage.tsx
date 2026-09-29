// apps/web/src/pages/QrPage.tsx
// CHANGELOG v2: Ortak Toast komponentine geçti

import type { BusinessSettingsResponse } from '@menu/shared';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';
import { Armchair, Copy, Download, QrCode, X } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.atlasqrmenu.com/api';
const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://www.atlasqrmenu.com';

type Table = { id: string; name: string; is_active: boolean; };

export function QrPage() {
  const { accessToken } = useAuth();
  const [qrSrc, setQrSrc] = useState<string>('');
  const [qrBlob, setQrBlob] = useState<Blob | null>(null);
  const [publicLink, setPublicLink] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableQrSrc, setTableQrSrc] = useState<string>('');
  const [tableQrBlob, setTableQrBlob] = useState<Blob | null>(null);
  const [tableQrLoading, setTableQrLoading] = useState(false);

  function showToast(message: string, type: 'error' | 'success') {
    showToastHelper(message, type, setToast);
  }

  useEffect(() => {
    let objectUrl = '';
    async function loadData() {
      if (!accessToken) return;
      setLoading(true);
      const [business, tablesData] = await Promise.all([
        apiRequest<BusinessSettingsResponse>('/admin/business', { token: accessToken }),
        apiRequest<Table[]>('/admin/tables', { token: accessToken })
      ]);
      setSlug(business.slug);
      setPublicLink(`${PUBLIC_BASE_URL}/m/${business.slug}`);
      setTables(tablesData.filter(t => t.is_active));

      const response = await fetch(`${API_BASE_URL}/admin/qr`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error('QR görseli alınamadı.');
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      setQrBlob(blob);
      setQrSrc(objectUrl);
      setLoading(false);
    }
    loadData().catch((e: unknown) => {
      showToast(e instanceof Error ? e.message : 'QR yüklenemedi.', 'error');
      setLoading(false);
    });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [accessToken]);

  async function generateTableQr(table: Table) {
    setSelectedTable(table);
    setTableQrLoading(true);
    setTableQrSrc('');
    try {
      const tableLink = `${PUBLIC_BASE_URL}/m/${slug}?masa=${table.id}`;
      const response = await fetch(
        `${API_BASE_URL}/admin/qr?content=${encodeURIComponent(tableLink)}&table_id=${table.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) throw new Error('QR oluşturulamadı.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setTableQrBlob(blob);
      setTableQrSrc(url);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'QR oluşturulamadı.', 'error');
    } finally {
      setTableQrLoading(false);
    }
  }

  function downloadQr(blob: Blob | null, filename: string) {
    if (!blob) { showToast('İndirilecek QR bulunamadı.', 'error'); return; }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('QR indirildi.', 'success');
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link kopyalandı!', 'success');
    } catch { showToast('Kopyalama başarısız.', 'error'); }
  }

  return (
    <div className="max-w-2xl text-ink">
      <Toast state={toast} />

      {/* Genel Menü QR */}
      <div className="ui-card rounded-3xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-line">
          <h2 className="font-serif font-bold text-lg flex items-center gap-2">
            <QrCode size={16} className="text-accent" /> Genel Menü QR
          </h2>
          <p className="text-xs mt-1 text-ink-muted">Masa seçimi olmadan direkt menüye yönlendirir</p>
        </div>

        <div className="p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-shrink-0">
            {loading ? (
              <div className="w-32 h-32 rounded-2xl flex items-center justify-center bg-surface-2 border border-line">
                <div className="w-6 h-6 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin"></div>
              </div>
            ) : qrSrc ? (
              <div className="p-3 rounded-2xl bg-white border border-line shadow-[var(--shadow)]">
                <img src={qrSrc} alt="QR Kod" className="w-32 h-32 rounded-lg" />
              </div>
            ) : null}
          </div>

          <div className="flex-1 w-full min-w-0">
            {publicLink && (
              <p className="text-xs mb-3 font-mono truncate text-accent">{publicLink}</p>
            )}
            <div className="flex flex-col gap-2">
              <button onClick={() => downloadQr(qrBlob, 'atlasqr-menu.png')}
                className="btn-primary py-2.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 spring-btn">
                <Download size={14} />
                İndir
              </button>
              <button onClick={() => copyLink(publicLink)}
                className="ui-chip py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 spring-btn">
                <Copy size={14} />
                Linki Kopyala
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Masa QR'ları */}
      <div className="ui-card rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-line">
          <h2 className="font-serif font-bold text-lg flex items-center gap-2">
            <Armchair size={16} className="text-accent" /> Masa QR Kodları
          </h2>
          <p className="text-xs mt-1 text-ink-muted">Her masaya özel QR — sipariş sistemi için gerekli</p>
        </div>

        {tables.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-3 flex justify-center text-ink-muted"><Armchair size={36} /></div>
            <p className="text-sm mb-2 text-ink-muted">Henüz masa tanımlanmamış</p>
            <p className="text-xs text-ink-muted">Masa yönetiminden masa ekleyin</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {tables.map(table => (
              <div key={table.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-ink"
                  style={{background: 'var(--accent-soft)', border: '1px solid var(--line)'}}>
                  <QrCode size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{table.name}</div>
                  <div className="text-xs font-mono truncate text-ink-muted">/m/{slug}?masa={table.id.slice(0, 8)}...</div>
                </div>
                <button onClick={() => generateTableQr(table)}
                  className="btn-primary px-4 py-2 rounded-2xl text-xs font-bold flex-shrink-0 spring-btn">
                  QR Oluştur
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Masa QR Modal */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ui-scrim fade-enter">
          <div className="ui-card rounded-3xl overflow-hidden w-full max-w-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-line">
              <h3 className="font-serif font-bold text-lg">{selectedTable.name} — QR</h3>
              <button onClick={() => { setSelectedTable(null); setTableQrSrc(''); }}
                aria-label="Kapat"
                className="ui-chip w-8 h-8 rounded-full flex items-center justify-center text-xs spring-btn">
                <X size={12} />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center">
              {tableQrLoading ? (
                <div className="w-48 h-48 rounded-2xl flex items-center justify-center bg-surface-2 border border-line">
                  <div className="w-8 h-8 rounded-full border-2 border-line border-t-[var(--accent)] animate-spin"></div>
                </div>
              ) : tableQrSrc ? (
                <div className="p-4 rounded-2xl mb-4 bg-white shadow-lg">
                  <img src={tableQrSrc} alt={`${selectedTable.name} QR`} className="w-48 h-48 rounded-xl" />
                </div>
              ) : null}

              <p className="text-xs text-center mb-4 font-mono text-accent break-all">
                {PUBLIC_BASE_URL}/m/{slug}?masa={selectedTable.id.slice(0, 8)}...
              </p>

              <div className="flex gap-3 w-full">
                <button onClick={() => downloadQr(tableQrBlob, `qr-${selectedTable.name}.png`)}
                  className="btn-primary flex-1 py-2.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 spring-btn">
                  <Download size={14} /> İndir
                </button>
                <button onClick={() => copyLink(`${PUBLIC_BASE_URL}/m/${slug}?masa=${selectedTable.id}`)}
                  className="ui-chip flex-1 py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 spring-btn">
                  <Copy size={14} /> Linki Kopyala
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
