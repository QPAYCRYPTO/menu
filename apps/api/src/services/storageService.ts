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

function normalizeEndpoint(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );

  return `${normalizeEndpoint(env.s3Endpoint)}/${env.s3Bucket}/${key}`;
}
