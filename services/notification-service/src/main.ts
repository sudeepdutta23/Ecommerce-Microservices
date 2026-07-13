import { PrismaClient } from '@prisma/client';
import { EventBus, EventTypes } from '@ecom/events';
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

  const { app, notificationService } = buildApp({ prisma, bus, logger });

  await bus.subscribe({
    queue: 'notification-service.events',
    bindings: [EventTypes.UserRegistered, 'order.#'],
    handler: (envelope) => notificationService.handleEvent(envelope),
  });

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'notification-service listening');
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
