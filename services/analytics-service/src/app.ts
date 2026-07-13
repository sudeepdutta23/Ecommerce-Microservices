import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import type { EventBus } from '@ecom/events';
import type { Logger } from '@ecom/logger';
import { correlationId, errorHandler, healthRouter, notFoundHandler, requestLogger } from '@ecom/http';
import { config } from './config';
import { AnalyticsController } from './modules/analytics/controller';
import { PrismaAnalyticsRepository } from './modules/analytics/repository';
import { analyticsRoutes } from './modules/analytics/routes';
import { AnalyticsService } from './modules/analytics/service';

export interface AppDeps {
  prisma: PrismaClient;
  bus: EventBus;
  logger: Logger;
}

export function buildApp({ prisma, bus, logger }: AppDeps): { app: Express; analyticsService: AnalyticsService } {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));
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

  const repository = new PrismaAnalyticsRepository(prisma);
  const analyticsService = new AnalyticsService(repository, logger);
  const controller = new AnalyticsController(analyticsService);

  const { events, reports } = analyticsRoutes(controller, config.JWT_SECRET);
  app.use('/api/v1/events', events);
  app.use('/api/v1/reports', reports);

  app.use(notFoundHandler());
  app.use(errorHandler(logger));
  return { app, analyticsService };
}
