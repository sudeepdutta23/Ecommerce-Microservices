import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import type { EventBus } from '@ecom/events';
import type { Logger } from '@ecom/logger';
import { correlationId, errorHandler, healthRouter, notFoundHandler, requestLogger } from '@ecom/http';
import { config } from './config';
import { AuthController } from './modules/auth/controller';
import { PrismaAuthRepository } from './modules/auth/repository';
import { authRoutes } from './modules/auth/routes';
import { AuthService } from './modules/auth/service';

export interface AppDeps {
  prisma: PrismaClient;
  bus: EventBus;
  logger: Logger;
}

export function buildApp({ prisma, bus, logger }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind the API gateway

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

  const repository = new PrismaAuthRepository(prisma);
  const service = new AuthService(repository, bus, logger, {
    jwtSecret: config.JWT_SECRET,
    accessTokenTtl: config.JWT_ACCESS_TTL,
    refreshTokenTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
  });
  const controller = new AuthController(service);

  app.use('/api/v1/auth', authRoutes(controller, config.JWT_SECRET));

  app.use(notFoundHandler());
  app.use(errorHandler(logger));
  return app;
}
