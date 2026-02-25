import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { uploadToS3 } from './storageService.js';

const maxBytes = 3 * 1024 * 1024;
const allowedContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateUpload(fileSize: number, contentType: string): void {
  if (fileSize > maxBytes) {
    throw new Error('Dosya boyutu 3MB sınırını aşıyor.');
  }

  if (!allowedContentTypes.has(contentType)) {
    throw new Error('Desteklenmeyen dosya türü.');
  }
}

export async function processImage(buffer: Buffer, businessId: string): Promise<{ imageUrl: string; thumbUrl: string }> {
  const id = randomUUID();
  const basePath = `business/${businessId}/products`;
  const imageKey = `${basePath}/${id}.webp`;
  const thumbKey = `${basePath}/${id}_thumb.webp`;

  const imageBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const thumbBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: 300, height: 300, fit: 'cover' })
    .webp({ quality: 75 })
    .toBuffer();

  const [imageUrl, thumbUrl] = await Promise.all([
    uploadToS3(imageKey, imageBuffer, 'image/webp'),
    uploadToS3(thumbKey, thumbBuffer, 'image/webp')
  ]);

  return {
    imageUrl,
    thumbUrl
  };
}
