import { Router } from 'express';

export type HealthCheck = () => Promise<void>;

export interface HealthOptions {
  service: string;
  version?: string;
  /** Named readiness checks (db ping, broker connection, ...). */
  checks?: Record<string, HealthCheck>;
}

/**
 * /health/live  — process is up (used by container restart policies)
 * /health/ready — dependencies are reachable (used to gate traffic)
 */
export function healthRouter(opts: HealthOptions): Router {
  const router = Router();

  router.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok', service: opts.service, uptime: Math.round(process.uptime()) });
  });

  router.get('/health/ready', async (_req, res) => {
    const results: Record<string, string> = {};
    let healthy = true;
    for (const [name, check] of Object.entries(opts.checks ?? {})) {
      try {
        await check();
        results[name] = 'ok';
      } catch (err) {
        healthy = false;
        results[name] = err instanceof Error ? err.message : 'failed';
      }
    }
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: opts.service,
      checks: results,
    });
  });

  return router;
}
