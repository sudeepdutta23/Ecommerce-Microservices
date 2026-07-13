import { loadConfig } from '@ecom/config';
import { z } from 'zod';

export const config = loadConfig({
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  JWT_SECRET: z.string().min(16),
});
