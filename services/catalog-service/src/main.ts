import { PrismaClient } from '@prisma/client';
import { createLogger } from '@ecom/logger';
import { setupGracefulShutdown } from '@ecom/http';
import { buildApp } from './app';
import { config } from './config';

async function main(): Promise<void> {
  const logger = createLogger({
    service: config.SERVICE_NAME,
    level: config.LOG_LEVEL,
    pretty: config.NODE_ENV === 'development',
  });

  const prisma = new PrismaClient();
  await prisma.$connect();

  const app = buildApp({ prisma, logger });
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'catalog-service listening');
  });

  setupGracefulShutdown({
    server,
    logger,
    cleanup: async () => {
      await prisma.$disconnect();
    },
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
