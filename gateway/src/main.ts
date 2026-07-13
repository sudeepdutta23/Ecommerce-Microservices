import { createLogger } from '@ecom/logger';
import { setupGracefulShutdown } from '@ecom/http';
import { buildApp } from './app';
import { config } from './config';

function main(): void {
  const logger = createLogger({
    service: config.SERVICE_NAME,
    level: config.LOG_LEVEL,
    pretty: config.NODE_ENV === 'development',
  });

  const app = buildApp(logger);
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'gateway listening');
  });

  setupGracefulShutdown({ server, logger });
}

main();
