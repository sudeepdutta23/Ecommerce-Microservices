import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import type { EventBus } from '@ecom/events';
import type { Logger } from '@ecom/logger';
import { correlationId, errorHandler, healthRouter, notFoundHandler, requestLogger } from '@ecom/http';
import { config } from './config';
import { HttpCatalogClient } from './modules/order/catalog-client';
import { OrderController } from './modules/order/controller';
import { PrismaOrderRepository } from './modules/order/repository';
import { orderRoutes } from './modules/order/routes';
import { OrderService } from './modules/order/service';

export interface AppDeps {
  prisma: PrismaClient;
  bus: EventBus;
  logger: Logger;
}

export function buildApp({ prisma, bus, logger }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(correlationId());
  app.use(requestLogger(logger));

  app.use(
    healthRouter({
      service: config.SERVICE_NAME,
      checks: {
        database: async () => {
          await prisma.$queryRaw`SELECT 1`;
        },
        eventBus: async () => {
          if (!bus.connected) throw new Error('event bus disconnected');
        },
      },
    }),
  );

  const repository = new PrismaOrderRepository(prisma);
  const catalogClient = new HttpCatalogClient(config.CATALOG_SERVICE_URL);
  const service = new OrderService(repository, catalogClient, logger);
  const controller = new OrderController(service);

  app.use('/api/v1/orders', orderRoutes(controller, config.JWT_SECRET));

  app.use(notFoundHandler());
  app.use(errorHandler(logger));
  return app;
}
