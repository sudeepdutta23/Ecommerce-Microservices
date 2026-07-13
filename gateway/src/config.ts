import { loadConfig } from '@ecom/config';
import { z } from 'zod';

export const config = loadConfig({
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  AUTH_SERVICE_URL: z.string().url(),
  USER_SERVICE_URL: z.string().url(),
  CATALOG_SERVICE_URL: z.string().url(),
  ORDER_SERVICE_URL: z.string().url(),
  NOTIFICATION_SERVICE_URL: z.string().url(),
  ANALYTICS_SERVICE_URL: z.string().url(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
});
