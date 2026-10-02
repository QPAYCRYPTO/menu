// apps/web/src/components/LocalQrImage.tsx
// QR kodunu tarayıcıda üretir (dış servise istek yok). Personel giriş linki gibi gizli içerikler
// başka bir siteye gönderilmemeli — eskiden api.qrserver.com kullanılıyordu.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function LocalQrImage({ value, size = 300, alt = 'QR kod' }: { value: string; size?: number; alt?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 2, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [value, size]);

  if (!src) {
    return <div style={{ width: size, height: size, maxWidth: '100%' }} className="animate-pulse rounded-xl bg-[#eee]" aria-label="QR hazırlanıyor" />;
  }
  return <img src={src} alt={alt} width={size} height={size} style={{ maxWidth: '100%', height: 'auto' }} />;
}
