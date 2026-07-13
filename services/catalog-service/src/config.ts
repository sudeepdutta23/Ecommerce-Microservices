import { loadConfig } from '@ecom/config';
import { z } from 'zod';

export const config = loadConfig({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
});
