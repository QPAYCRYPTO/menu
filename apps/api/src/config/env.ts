import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(10),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  APP_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  BRAND: z.string().min(1).default('LezzetQR'),
  SERVICE_NAME: z.string().min(1).default('menu-api'),
  MAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  MAIL_FROM: z.string().email().default('noreply@example.com'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_SECURE: z.coerce.boolean().default(false),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_KEY: z.string().min(1),
  S3_SECRET: z.string().min(1)
);

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Geçersiz ortam değişkenleri: ${issues}`);
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  jwtAccessExpiresIn: parsed.data.JWT_ACCESS_EXPIRES_IN,
  jwtRefreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN,
  appUrl: parsed.data.APP_URL,
  publicBaseUrl: parsed.data.PUBLIC_BASE_URL,
  webOrigin: parsed.data.WEB_ORIGIN,
  brand: parsed.data.BRAND,
  serviceName: parsed.data.SERVICE_NAME,
  mailProvider: parsed.data.MAIL_PROVIDER,
  mailFrom: parsed.data.MAIL_FROM,
  smtpHost: parsed.data.SMTP_HOST,
  smtpPort: parsed.data.SMTP_PORT,
  smtpUser: parsed.data.SMTP_USER,
  smtpPass: parsed.data.SMTP_PASS,
  smtpSecure: parsed.data.SMTP_SECURE,
  s3Endpoint: parsed.data.S3_ENDPOINT,
  s3Bucket: parsed.data.S3_BUCKET,
  s3Key: parsed.data.S3_KEY,
  s3Secret: parsed.data.S3_SECRET
};
