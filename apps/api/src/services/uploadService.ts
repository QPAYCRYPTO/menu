// apps/api/src/services/uploadService.ts
// CHANGELOG:
// - 5MB limit (frontend ve multer ile uyumlu)
// - GIF eklendi
// - Tüm formatlar zaten WebP'ye dönüşüyor (sharp yapıyor)

import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { uploadToS3 } from './storageService.js';

const maxBytes = 5 * 1024 * 1024;
const allowedContentTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

export function validateUpload(fileSize: number, contentType: string): void {
  if (fileSize > maxBytes) {
    throw new Error('Dosya boyutu 5MB sınırını aşıyor.');
  }
  if (!allowedContentTypes.has(contentType)) {
    throw new Error(`Desteklenmeyen dosya türü: ${contentType}. Sadece JPG, PNG, WebP, GIF kabul edilir.`);
  }
}

export async function processImage(buffer: Buffer, businessId: string): Promise<{ imageUrl: string; thumbUrl: string }> {
  const id = randomUUID();
  const basePath = `business/${businessId}/products`;
  const imageKey = `${basePath}/${id}.webp`;
  const thumbKey = `${basePath}/${id}_thumb.webp`;

  let imageBuffer: Buffer;
  let thumbBuffer: Buffer;

  try {
    imageBuffer = await sharp(buffer, { limitInputPixels: 24_000_000, animated: false })
      .rotate()
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    thumbBuffer = await sharp(buffer, { limitInputPixels: 24_000_000, animated: false })
      .rotate()
      .resize({ width: 300, height: 300, fit: 'cover' })
      .webp({ quality: 75 })
      .toBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('Input image exceeds pixel limit')) {
      throw new Error('Görsel çok büyük (en fazla 24 megapixel). Lütfen daha küçük bir dosya seçin.');
    }
    throw new Error('Görsel işlenemedi. Dosya bozuk veya desteklenmiyor olabilir.');
  }

  const [imageUrl, thumbUrl] = await Promise.all([
    uploadToS3(imageKey, imageBuffer, 'image/webp'),
    uploadToS3(thumbKey, thumbBuffer, 'image/webp')
  ]);

  return { imageUrl, thumbUrl };
}

// Logo için ayrı fonksiyon — daha küçük boyut, kare
export async function processLogo(buffer: Buffer, businessId: string): Promise<string> {
  const id = randomUUID();
  const logoKey = `business/${businessId}/logo/${id}.webp`;

  let logoBuffer: Buffer;
  try {
    logoBuffer = await sharp(buffer, { limitInputPixels: 24_000_000, animated: false })
      .rotate()
      .resize({ width: 400, height: 400, fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('Input image exceeds pixel limit')) {
      throw new Error('Logo çok büyük (en fazla 24 megapixel). Lütfen daha küçük bir dosya seçin.');
    }
    throw new Error('Logo işlenemedi. Dosya bozuk veya desteklenmiyor olabilir.');
  }

  return uploadToS3(logoKey, logoBuffer, 'image/webp');
}