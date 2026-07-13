import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment variables every service must define. Individual services extend
 * this with their own keys via `loadConfig`.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive(),
  SERVICE_NAME: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/**
 * Parse and validate process.env against the base schema extended with
 * service-specific keys. Fails fast (exit 1) on invalid configuration so a
 * misconfigured service never starts half-working.
 */
export function loadConfig<T extends z.ZodRawShape>(shape: T): BaseEnv & z.infer<z.ZodObject<T>> {
  const schema = baseEnvSchema.extend(shape);
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Logger is not available yet at config-load time; stderr is intentional.
    console.error('Invalid environment configuration:');
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
    process.exit(1);
  }
  return parsed.data as BaseEnv & z.infer<z.ZodObject<T>>;
}
