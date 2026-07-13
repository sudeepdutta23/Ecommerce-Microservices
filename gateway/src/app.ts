import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Logger } from '@ecom/logger';
import { CORRELATION_HEADER, fetchJson } from '@ecom/http';
import { config } from './config';

interface Route {
  /** Path prefix preserved end-to-end; services own their own /api/v1 paths. */
  prefix: string;
  target: string;
  service: string;
}

/**
 * Edge BFF for the React microfrontend platform. Pure reverse proxy:
 * one origin + one CORS policy for the shell and all remotes, edge rate
 * limiting, correlation-id injection. No business logic lives here — new
 * microfrontends plug in by adding a route entry, and each remote keeps
 * consuming only the API prefixes it needs.
 */
export function buildApp(logger: Logger): Express {
  const routes: Route[] = [
    { prefix: '/api/v1/auth', target: config.AUTH_SERVICE_URL, service: 'auth-service' },
    { prefix: '/api/v1/profiles', target: config.USER_SERVICE_URL, service: 'user-service' },
    { prefix: '/api/v1/products', target: config.CATALOG_SERVICE_URL, service: 'catalog-service' },
    { prefix: '/api/v1/categories', target: config.CATALOG_SERVICE_URL, service: 'catalog-service' },
    { prefix: '/api/v1/orders', target: config.ORDER_SERVICE_URL, service: 'order-service' },
    { prefix: '/api/v1/notifications', target: config.NOTIFICATION_SERVICE_URL, service: 'notification-service' },
    { prefix: '/api/v1/events', target: config.ANALYTICS_SERVICE_URL, service: 'analytics-service' },
    { prefix: '/api/v1/reports', target: config.ANALYTICS_SERVICE_URL, service: 'analytics-service' },
  ];

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
      exposedHeaders: [CORRELATION_HEADER, 'x-idempotent-replay'],
    }),
  );

  // Assign the correlation id at the edge; every hop downstream reuses it.
  app.use((req, res, next) => {
    const id = (req.headers[CORRELATION_HEADER] as string | undefined) ?? randomUUID();
    req.headers[CORRELATION_HEADER] = id;
    res.setHeader(CORRELATION_HEADER, id);
    next();
  });

  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded' } },
    }),
  );

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', service: config.SERVICE_NAME, uptime: Math.round(process.uptime()) });
  });

  // Aggregate view for dashboards/smoke tests.
  app.get('/health/services', async (_req, res) => {
    const results = await Promise.all(
      [...new Map(routes.map((r) => [r.service, r])).values()].map(async ({ service, target }) => {
        try {
          await fetchJson(`${target}/health/live`, { timeoutMs: 1500, retries: 0 });
          return [service, 'ok'] as const;
        } catch {
          return [service, 'unreachable'] as const;
        }
      }),
    );
    const services = Object.fromEntries(results);
    const healthy = Object.values(services).every((s) => s === 'ok');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', services });
  });

  for (const route of routes) {
    app.use(
      createProxyMiddleware(route.prefix, {
        target: route.target,
        changeOrigin: true,
        proxyTimeout: 15_000,
        timeout: 16_000,
        logProvider: () => ({
          log: (msg: string) => logger.debug(msg),
          debug: (msg: string) => logger.debug(msg),
          info: (msg: string) => logger.info(msg),
          warn: (msg: string) => logger.warn(msg),
          error: (msg: string) => logger.error(msg),
        }),
        onError: (err, _req, res) => {
          logger.error({ err, service: route.service }, 'proxy error');
          if (!res.headersSent) {
            (res as express.Response).status(503).json({
              success: false,
              error: { code: 'UPSTREAM_UNAVAILABLE', message: `${route.service} is unavailable` },
            });
          }
        },
      }),
    );
  }

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
    });
  });

  return app;
}
