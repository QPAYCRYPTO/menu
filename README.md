# menu-monorepo

## Komutlar

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm lint
./infra/scripts/up.sh
./infra/scripts/down.sh
```

## Deploy Checklist

### API ENV
- PORT
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- JWT_ACCESS_EXPIRES_IN
- JWT_REFRESH_EXPIRES_IN
- APP_URL
- PUBLIC_BASE_URL
- WEB_ORIGIN
- BRAND
- SERVICE_NAME
- MAIL_PROVIDER
- MAIL_FROM
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
- SMTP_SECURE
- S3_ENDPOINT
- S3_BUCKET
- S3_KEY
- S3_SECRET

### WEB ENV
- VITE_API_BASE_URL
- VITE_PUBLIC_BASE_URL
- VITE_BRAND
- PUBLIC_API_BASE_URL

### Çalıştırma Sırası
1. `./infra/scripts/up.sh`
2. API için env dosyasını doldur
3. WEB için env dosyasını doldur
4. `pnpm build`
5. `pnpm start`
