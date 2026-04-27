// apps/web/src/pages/QrPage.tsx
// CHANGELOG v2: Ortak Toast komponentine geçti

import type { BusinessSettingsResponse } from '@menu/shared';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Toast, showToast as showToastHelper, type ToastState } from '../components/Toast';

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
    <div className="max-w-2xl">
      <Toast state={toast} />

      {/* Genel Menü QR */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6" style={{border: '1px solid #E2E8F0'}}>
        <div className="px-6 py-4 border-b" style={{borderColor: '#E2E8F0'}}>
          <h2 className="font-bold text-base" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>Genel Menü QR</h2>
          <p className="text-xs mt-1" style={{color: '#94A3B8'}}>Masa seçimi olmadan direkt menüye yönlendirir</p>
        </div>

        <div className="p-6 flex items-center gap-6">
          <div className="flex-shrink-0">
            {loading ? (
              <div className="w-32 h-32 rounded-xl flex items-center justify-center" style={{background: '#E2E8F0'}}>
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor: '#0D9488', borderTopColor: 'transparent'}}></div>
              </div>
            ) : qrSrc ? (
              <div className="p-3 rounded-xl" style={{background: '#F8FAFC', border: '1px solid #E2E8F0'}}>
                <img src={qrSrc} alt="QR Kod" className="w-32 h-32 rounded-lg" />
              </div>
            ) : null}
          </div>

          <div className="flex-1">
            {publicLink && (
              <p className="text-xs mb-3 font-mono truncate" style={{color: '#0D9488'}}>{publicLink}</p>
            )}
            <div className="flex flex-col gap-2">
              <button onClick={() => downloadQr(qrBlob, 'atlasqr-menu.png')}
                className="py-2 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                style={{background: '#0F172A'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                İndir
              </button>
              <button onClick={() => copyLink(publicLink)}
                className="py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{background: '#CCFBF1', color: '#0F766E'}}>
                Linki Kopyala
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Masa QR'ları */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{border: '1px solid #E2E8F0'}}>
        <div className="px-6 py-4 border-b" style={{borderColor: '#E2E8F0'}}>
          <h2 className="font-bold text-base" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>Masa QR Kodları</h2>
          <p className="text-xs mt-1" style={{color: '#94A3B8'}}>Her masaya özel QR — sipariş sistemi için gerekli</p>
        </div>

        {tables.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🪑</div>
            <p className="text-sm mb-2" style={{color: '#94A3B8'}}>Henüz masa tanımlanmamış</p>
            <p className="text-xs" style={{color: '#CBD5E1'}}>Masa yönetiminden masa ekleyin</p>
          </div>
        ) : (
          <div className="divide-y" style={{borderColor: '#F1F5F9'}}>
            {tables.map(table => (
              <div key={table.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background: '#CCFBF1'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5">
                    <rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/>
                    <rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm" style={{color: '#0F172A'}}>{table.name}</div>
                  <div className="text-xs font-mono truncate" style={{color: '#94A3B8'}}>/m/{slug}?masa={table.id.slice(0, 8)}...</div>
                </div>
                <button onClick={() => generateTableQr(table)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white flex-shrink-0"
                  style={{background: '#0D9488'}}>
                  QR Oluştur
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Masa QR Modal */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background: 'rgba(15,23,42,0.6)'}}>
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-sm">
            <div className="px-6 py-4 flex items-center justify-between" style={{borderBottom: '1px solid #E2E8F0'}}>
              <h3 className="font-bold text-base" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>{selectedTable.name} — QR</h3>
              <button onClick={() => { setSelectedTable(null); setTableQrSrc(''); }}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{background: '#F1F5F9', color: '#64748B'}}>✕</button>
            </div>

            <div className="p-6 flex flex-col items-center">
              {tableQrLoading ? (
                <div className="w-48 h-48 rounded-xl flex items-center justify-center" style={{background: '#E2E8F0'}}>
                  <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor: '#0D9488', borderTopColor: 'transparent'}}></div>
                </div>
              ) : tableQrSrc ? (
                <div className="p-4 rounded-2xl mb-4" style={{background: '#F8FAFC', border: '1px solid #E2E8F0'}}>
                  <img src={tableQrSrc} alt={`${selectedTable.name} QR`} className="w-48 h-48 rounded-xl" />
                </div>
              ) : null}

              <p className="text-xs text-center mb-4 font-mono" style={{color: '#0D9488'}}>
                {PUBLIC_BASE_URL}/m/{slug}?masa={selectedTable.id.slice(0, 8)}...
              </p>

              <div className="flex gap-3 w-full">
                <button onClick={() => downloadQr(tableQrBlob, `qr-${selectedTable.name}.png`)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{background: '#0F172A'}}>
                  İndir
                </button>
                <button onClick={() => copyLink(`${PUBLIC_BASE_URL}/m/${slug}?masa=${selectedTable.id}`)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{background: '#CCFBF1', color: '#0F766E'}}>
                  Linki Kopyala
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}