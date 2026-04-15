// apps/api/src/services/storageService.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

const s3 = new S3Client({
  region: 'auto',
  endpoint: env.s3Endpoint,
  credentials: {
    accessKeyId: env.s3Key,
    secretAccessKey: env.s3Secret
  },
  forcePathStyle: true
});

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );

  const baseUrl = env.s3PublicUrl ?? `${env.s3Endpoint}/${env.s3Bucket}`;
  return `${baseUrl}/${key}`;
}