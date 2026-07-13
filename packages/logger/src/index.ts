import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';

export interface RequestContext {
  correlationId: string;
}

/**
 * Correlation context shared across the request lifecycle (HTTP middleware
 * and event consumers both populate it). Every log line automatically carries
 * the correlationId via the pino mixin below.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export interface CreateLoggerOptions {
  service: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger(opts: CreateLoggerOptions): pino.Logger {
  return pino({
    level: opts.level ?? 'info',
    base: { service: opts.service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'password', '*.password', '*.passwordHash', 'refreshToken', '*.refreshToken'],
      censor: '[REDACTED]',
    },
    mixin() {
      const ctx = requestContext.getStore();
      return ctx ? { correlationId: ctx.correlationId } : {};
    },
    transport: opts.pretty
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } }
      : undefined,
  });
}

export type Logger = pino.Logger;
