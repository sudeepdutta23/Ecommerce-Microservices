import { PrismaClient } from '@prisma/client';
import { EventBus } from '@ecom/events';
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

  const bus = new EventBus({ url: config.RABBITMQ_URL, serviceName: config.SERVICE_NAME, logger });
  await bus.connect();

  const { app, analyticsService } = buildApp({ prisma, bus, logger });

  // Audit-log every domain event on the platform ('#' = all routing keys).
  await bus.subscribe({
    queue: 'analytics-service.events',
    bindings: ['#'],
    handler: (envelope) => analyticsService.recordDomainEvent(envelope),
    prefetch: 25,
  });

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'analytics-service listening');
  });

  setupGracefulShutdown({
    server,
    logger,
    cleanup: async () => {
      await bus.close();
      await prisma.$disconnect();
    },
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
