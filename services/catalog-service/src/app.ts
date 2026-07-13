import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '@ecom/logger';
import { correlationId, errorHandler, healthRouter, notFoundHandler, requestLogger } from '@ecom/http';
import { config } from './config';
import { CatalogController } from './modules/catalog/controller';
import { PrismaCatalogRepository } from './modules/catalog/repository';
import { categoryRoutes, productRoutes } from './modules/catalog/routes';
import { CatalogService } from './modules/catalog/service';

export interface AppDeps {
  prisma: PrismaClient;
  logger: Logger;
}

export function buildApp({ prisma, logger }: AppDeps): Express {
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
      },
    }),
  );

  const repository = new PrismaCatalogRepository(prisma);
  const service = new CatalogService(repository);
  const controller = new CatalogController(service);

  app.use('/api/v1/products', productRoutes(controller, config.JWT_SECRET));
  app.use('/api/v1/categories', categoryRoutes(controller, config.JWT_SECRET));

  app.use(notFoundHandler());
  app.use(errorHandler(logger));
  return app;
}
