import type { BusinessSettingsResponse } from '@menu/shared';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';
const PUBLIC_BASE_URL = (import.meta.env.VITE_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

type ToastState = {
  message: string;
  type: 'error' | 'success';
} | null;

export function QrPage() {
  const { accessToken } = useAuth();
  const [qrSrc, setQrSrc] = useState<string>('');
  const [qrBlob, setQrBlob] = useState<Blob | null>(null);
  const [publicLink, setPublicLink] = useState<string>('');
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(message: string, type: 'error' | 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    let objectUrl = '';

    async function loadQrAndLink() {
      if (!accessToken) return;

      const business = await apiRequest<BusinessSettingsResponse>('/admin/business', { token: accessToken });
      setPublicLink(`${PUBLIC_BASE_URL}/m/${business.slug}`);

      const response = await fetch(`${API_BASE_URL}/admin/qr`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error('QR görseli alınamadı.');
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      setQrBlob(blob);
      setQrSrc(objectUrl);
    }

    loadQrAndLink().catch((error: unknown) => {
      showToast(error instanceof Error ? error.message : 'QR yüklenemedi.', 'error');
    });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken]);

  function downloadQr() {
    if (!qrBlob) {
      showToast('İndirilecek QR bulunamadı.', 'error');
      return;
    }

    const url = URL.createObjectURL(qrBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'menu-qr.png';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('QR indirildi.', 'success');
  }

  async function copyPublicLink() {
    if (!publicLink) {
      showToast('Kopyalanacak bağlantı bulunamadı.', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(publicLink);
      showToast('Public menü linki kopyalandı.', 'success');
    } catch {
      showToast('Kopyalama başarısız.', 'error');
    }
  }

  return (
    <section>
      <h1>QR Kod</h1>
      <p>Menü QR kodu aşağıdadır.</p>

      {toast && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 10px',
            borderRadius: 6,
            background: toast.type === 'error' ? '#fee2e2' : '#dcfce7',
            color: toast.type === 'error' ? '#991b1b' : '#166534'
          }}
        >
          {toast.message}
        </div>
      )}

      {qrSrc ? <img src={qrSrc} alt="QR Kod" style={{ width: 280, border: '1px solid #ddd', borderRadius: 8 }} /> : <p>QR yüklenemedi.</p>}

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={downloadQr}>PNG İndir</button>
        <button onClick={copyPublicLink}>Public Linki Kopyala</button>
      </div>

      {publicLink && (
        <p style={{ marginTop: 10, fontSize: 13 }}>
          Public link: <a href={publicLink}>{publicLink}</a>
        </p>
      )}
    </section>
  );
}
