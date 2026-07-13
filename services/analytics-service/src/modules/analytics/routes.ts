import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler, authenticate, requireRole, validate, verifyAccessToken } from '@ecom/http';
import type { AnalyticsController } from './controller';
import { ingestEventsSchema, summaryQuerySchema } from './dto';

/** Attaches req.user when a valid token is present; anonymous otherwise. */
function optionalAuth(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        req.user = verifyAccessToken(header.slice('Bearer '.length), jwtSecret);
      } catch {
        // Ingestion accepts anonymous events; a stale token is not an error.
      }
    }
    next();
  };
}

export function analyticsRoutes(controller: AnalyticsController, jwtSecret: string): { events: Router; reports: Router } {
  const events = Router();
  const ingestLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Ingestion rate limit exceeded' } },
  });
  events.post('/', ingestLimiter, optionalAuth(jwtSecret), validate({ body: ingestEventsSchema }), asyncHandler(controller.ingest));

  const reports = Router();
  reports.get(
    '/summary',
    authenticate(jwtSecret),
    requireRole('ADMIN'),
    validate({ query: summaryQuerySchema }),
    asyncHandler(controller.summary),
  );

  return { events, reports };
}
