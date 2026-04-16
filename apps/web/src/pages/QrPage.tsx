// apps/web/src/pages/QrPage.tsx
import type { BusinessSettingsResponse } from '@menu/shared';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = 'https://api.atlasqrmenu.com/api';
const PUBLIC_BASE_URL = 'https://www.atlasqrmenu.com';

type ToastState = { message: string; type: 'error' | 'success' } | null;

export function QrPage() {
  const { accessToken } = useAuth();
  const [qrSrc, setQrSrc] = useState<string>('');
  const [qrBlob, setQrBlob] = useState<Blob | null>(null);
  const [publicLink, setPublicLink] = useState<string>('');
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(true);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    let objectUrl = '';
    async function loadQrAndLink() {
      if (!accessToken) return;
      setLoading(true);
      const business = await apiRequest<BusinessSettingsResponse>('/admin/business', { token: accessToken });
      setPublicLink(`${PUBLIC_BASE_URL}/m/${business.slug}`);
      const response = await fetch(`${API_BASE_URL}/admin/qr`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error('QR görseli alınamadı.');
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      setQrBlob(blob);
      setQrSrc(objectUrl);
      setLoading(false);
    }
    loadQrAndLink().catch((e: unknown) => {
      showToast(e instanceof Error ? e.message : 'QR yüklenemedi.', 'error');
      setLoading(false);
    });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [accessToken]);

  function downloadQr() {
    if (!qrBlob) { showToast('İndirilecek QR bulunamadı.', 'error'); return; }
    const url = URL.createObjectURL(qrBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'atlasqr-menu.png';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('QR indirildi.', 'success');
  }

  async function copyPublicLink() {
    if (!publicLink) { showToast('Kopyalanacak bağlantı bulunamadı.', 'error'); return; }
    try {
      await navigator.clipboard.writeText(publicLink);
      showToast('Link kopyalandı!', 'success');
    } catch { showToast('Kopyalama başarısız.', 'error'); }
  }

  return (
    <div className="max-w-lg mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4', color: toast.type === 'error' ? '#DC2626' : '#16A34A', border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`}}>
          {toast.message}
        </div>
      )}

      {/* Başlık */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{background: '#CCFBF1'}}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5">
            <rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/>
            <rect x="3" y="16" width="5" height="5"/><path d="M21 16h-6v5M16 11h5M11 3v5M11 11h5v5"/>
          </svg>
        </div>
        <h2 className="font-bold text-xl mb-1" style={{color: '#0F172A', fontFamily: 'Georgia, serif'}}>Menü QR Kodunuz</h2>
        <p className="text-sm" style={{color: '#94A3B8'}}>Masalarınıza yerleştirin, müşterileriniz okusun</p>
      </div>

      {/* QR Kart */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{border: '1px solid #E2E8F0'}}>
        
        {/* QR Görsel */}
        <div className="p-8 flex items-center justify-center" style={{background: '#F8FAFC'}}>
          {loading ? (
            <div className="w-48 h-48 rounded-2xl flex items-center justify-center" style={{background: '#E2E8F0'}}>
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor: '#0D9488', borderTopColor: 'transparent'}}></div>
            </div>
          ) : qrSrc ? (
            <div className="p-4 rounded-2xl" style={{background: 'white', boxShadow: '0 4px 24px rgba(15,23,42,0.1)'}}>
              <img src={qrSrc} alt="QR Kod" className="w-48 h-48 rounded-xl" />
            </div>
          ) : (
            <div className="w-48 h-48 rounded-2xl flex items-center justify-center" style={{background: '#FEF2F2'}}>
              <span className="text-sm" style={{color: '#DC2626'}}>QR yüklenemedi</span>
            </div>
          )}
        </div>

        {/* Public Link */}
        {publicLink && (
          <div className="px-6 py-3 flex items-center gap-3" style={{borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <a href={publicLink} target="_blank" rel="noreferrer"
              className="flex-1 text-xs truncate" style={{color: '#0D9488'}}>
              {publicLink}
            </a>
          </div>
        )}

        {/* Butonlar */}
        <div className="p-6 flex gap-3">
          <button onClick={downloadQr}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
            style={{background: '#0F172A'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            PNG İndir
          </button>
          <button onClick={copyPublicLink}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{background: '#CCFBF1', color: '#0F766E'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Linki Kopyala
          </button>
        </div>

        {/* Bilgi */}
        <div className="px-6 pb-6">
          <div className="rounded-xl p-4 flex gap-3" style={{background: '#FEF3C7'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-xs leading-relaxed" style={{color: '#92400E'}}>
              QR kodu indirip masalarınıza, menü kartlarınıza veya vitrine yapıştırabilirsiniz. Müşterileriniz kodu okutunca menünüze ulaşır.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}