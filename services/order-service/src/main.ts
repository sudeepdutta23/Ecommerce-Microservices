import { PrismaClient } from '@prisma/client';
import { EventBus } from '@ecom/events';
import { createLogger } from '@ecom/logger';
import { setupGracefulShutdown } from '@ecom/http';
import { buildApp } from './app';
import { config } from './config';
import { startOutboxWorker } from './outbox/worker';

async function main(): Promise<void> {
  const logger = createLogger({
    service: config.SERVICE_NAME,
    level: config.LOG_LEVEL,
    pretty: config.NODE_ENV === 'development',
  });

  const prisma = new PrismaClient();
  await prisma.$connect();

  const bus = new EventBus({ url: config.RABBITMQ_URL, serviceName: config.SERVICE_NAME, logger });
  await bus.connect();

  const outbox = startOutboxWorker({ prisma, bus, logger, intervalMs: config.OUTBOX_POLL_INTERVAL_MS });

  const app = buildApp({ prisma, bus, logger });
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'order-service listening');
  });

  setupGracefulShutdown({
    server,
    logger,
    cleanup: async () => {
      outbox.stop();
      await bus.close();
      await prisma.$disconnect();
    },
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
