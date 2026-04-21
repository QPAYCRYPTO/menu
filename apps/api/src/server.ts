// apps/api/src/server.ts
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
    logger.info({ message: 'Database migrations başlatılıyor (node-pg-migrate)...' });
    try {
      const { stdout, stderr } = await execAsync(
        'pnpm migrate:up',
        { cwd: process.cwd() }
      );
      if (stdout) logger.info({ message: 'Migration stdout', details: stdout });
      if (stderr) logger.info({ message: 'Migration stderr', details: stderr });
      logger.info({ message: 'Migrations tamamlandı.' });
    } catch (error: any) {
      logger.error({ 
        message: 'Migration başarısız! Sunucu başlatılmıyor.', 
        details: error?.message ?? String(error) 
      });
      throw error;
    }
  } else {
    logger.info({ message: 'Development mod: migrate atlandı (lokalde manuel "pnpm migrate:up" çalıştır).' });
  }

  logger.info({ message: 'Redis bağlantısı doğrulanıyor.' });
  await redis.ping();
}

bootstrap()
  .then(() => {
    app.listen(env.port, '0.0.0.0', () => {
      logger.info({ message: `Sunucu çalışıyor: http://localhost:${env.port}` });

      // Production'da keep-alive — Railway'i uyutmamak için
      if (env.nodeEnv === 'production') {
        setInterval(async () => {
          try {
            await fetch(`https://api.atlasqrmenu.com/health`);
            logger.info({ message: 'Keep-alive ping gönderildi.' });
          } catch {}
        }, 10 * 60 * 1000); // 10 dakikada bir
      }
    });
  })
  .catch((error) => {
    logger.error({ message: 'Başlatma hatası.', details: String(error) });
    process.exit(1);
  });