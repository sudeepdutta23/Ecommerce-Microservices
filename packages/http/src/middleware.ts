import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { requestContext, type Logger } from '@ecom/logger';
import { AppError, ValidationError } from './errors';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Accepts an incoming x-correlation-id (propagated by the gateway or a peer
 * service) or generates one, echoes it on the response, and stores it in
 * AsyncLocalStorage so logs and outbound calls pick it up automatically.
 */
export function correlationId(): RequestHandler {
  return (req, res, next) => {
    const id = (req.headers[CORRELATION_HEADER] as string | undefined) ?? randomUUID();
    req.correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);
    requestContext.run({ correlationId: id }, next);
  };
}

export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    if (req.path.startsWith('/health')) return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      const line = {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        userId: req.user?.id,
      };
      if (res.statusCode >= 500) logger.error(line, 'request failed');
      else if (res.statusCode >= 400) logger.warn(line, 'request rejected');
      else logger.info(line, 'request completed');
    });
    next();
  };
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Express 4 does not catch rejected promises from handlers; this does. */
export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** Validates and *replaces* req.body/query/params with the parsed output. */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new ValidationError(
            err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
      }
      next(err);
    }
  };
}

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
    });
  };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) logger.error({ err }, err.message);
      return res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
      });
    }
    // body-parser JSON syntax errors
    if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.parse.failed') {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' },
      });
    }
    logger.error({ err }, 'unhandled error');
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  };
}
