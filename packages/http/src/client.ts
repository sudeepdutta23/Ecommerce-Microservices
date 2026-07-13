import { setTimeout as sleep } from 'node:timers/promises';
import { requestContext } from '@ecom/logger';
import { AppError, UpstreamError } from './errors';
import { CORRELATION_HEADER } from './middleware';

export interface FetchJsonOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Retries on network errors, timeouts, and 5xx. 4xx is never retried. */
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Minimal resilient HTTP client for service-to-service calls: timeout via
 * AbortController, exponential backoff on retryable failures, automatic
 * correlation-id propagation. Expects the standard API envelope in responses.
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, timeoutMs = 3000, retries = 2, retryDelayMs = 200 } = opts;
  const correlationId = requestContext.getStore()?.correlationId;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(correlationId ? { [CORRELATION_HEADER]: correlationId } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status >= 500) {
        throw new UpstreamError(`Upstream ${url} responded ${res.status}`, 502);
      }
      const json = (await res.json().catch(() => undefined)) as
        | { error?: { message?: string; code?: string } }
        | undefined;
      if (!res.ok) {
        // Client errors from the upstream are not retryable; surface them.
        throw new AppError(
          json?.error?.message ?? `Upstream request failed (${res.status})`,
          res.status,
          json?.error?.code ?? 'UPSTREAM_ERROR',
        );
      }
      return json as T;
    } catch (err) {
      lastError = err;
      const retryable = err instanceof UpstreamError || !(err instanceof AppError);
      if (!retryable || attempt === retries) break;
      await sleep(retryDelayMs * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof AppError) throw lastError;
  throw new UpstreamError(
    `Upstream ${url} unreachable: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
    503,
  );
}
