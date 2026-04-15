import { exec } from 'child_process';
import { promisify } from 'util';
import { env } from './config/env.js';
import { redis } from './db/redis.js';
import { logger } from './logger/logger.js';
import { createApp } from './app.js';

const execAsync = promisify(exec);

const app = createApp();

async function bootstrap(): Promise<void> {
    if (env.nodeEnv === 'production') {
    logger.info({ message: 'Prisma migrate deploy başlatılıyor.' });
    await execAsync('npx prisma migrate deploy', { cwd: process.cwd() });
  } else {
    logger.info({ message: 'Development mod: migrate deploy atlandı.' });
  }

  logger.info({ message: 'Redis bağlantısı doğrulanıyor.' });
  await redis.ping();
}

bootstrap()
  .then(() => {
    app.listen(env.port, '0.0.0.0', () => {
      logger.info({ message: `Sunucu çalışıyor: http://localhost:${env.port}` });
    });
  })
  .catch((error) => {
    logger.error({ message: 'Başlatma hatası.', details: String(error) });
    process.exit(1);
  });
