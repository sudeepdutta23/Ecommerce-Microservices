import type { Server } from 'node:http';
import type { Logger } from '@ecom/logger';

export interface ShutdownOptions {
  server: Server;
  logger: Logger;
  /** Close order-sensitive resources here (event bus, DB pools, workers). */
  cleanup?: () => Promise<void>;
  timeoutMs?: number;
}

/**
 * SIGTERM/SIGINT: stop accepting new connections, drain in-flight requests,
 * run cleanup, then exit. A hard timeout guarantees the process never hangs
 * on shutdown (important for rolling deploys).
 */
export function setupGracefulShutdown(opts: ShutdownOptions): void {
  const { server, logger, cleanup, timeoutMs = 15_000 } = opts;
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown initiated');

    const killTimer = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);
    killTimer.unref();

    server.close(async (closeErr) => {
      try {
        if (cleanup) await cleanup();
        logger.info('shutdown complete');
        process.exit(closeErr ? 1 : 0);
      } catch (err) {
        logger.error({ err }, 'cleanup failed during shutdown');
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception, shutting down');
    shutdown('uncaughtException');
  });
}
