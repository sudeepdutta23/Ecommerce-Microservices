import type { PrismaClient } from '@prisma/client';
import type { EventBus } from '@ecom/events';
import type { Logger } from '@ecom/logger';

export interface OutboxWorkerOptions {
  prisma: PrismaClient;
  bus: EventBus;
  logger: Logger;
  intervalMs: number;
  batchSize?: number;
}

export interface OutboxWorker {
  stop(): void;
}

/**
 * Drains the transactional outbox to RabbitMQ. The confirm-channel publish
 * resolves only after the broker accepted the message, and only then is the
 * row marked published — giving at-least-once delivery (consumers dedupe by
 * envelope id / natural idempotency). Rows are processed oldest-first so
 * per-aggregate ordering is preserved under normal operation.
 */
export function startOutboxWorker(opts: OutboxWorkerOptions): OutboxWorker {
  const { prisma, bus, logger, intervalMs, batchSize = 20 } = opts;
  let draining = false;
  let stopped = false;

  const drain = async (): Promise<void> => {
    if (draining || stopped) return;
    draining = true;
    try {
      const pending = await prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
      });
      for (const event of pending) {
        if (stopped) break;
        await bus.publish(event.type, event.payload, {
          correlationId: event.correlationId ?? undefined,
        });
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
      }
      if (pending.length > 0) {
        logger.debug({ count: pending.length }, 'outbox events published');
      }
    } catch (err) {
      // Failed rows keep publishedAt = null and are retried next tick.
      logger.error({ err }, 'outbox drain failed, will retry');
    } finally {
      draining = false;
    }
  };

  const timer = setInterval(() => void drain(), intervalMs);
  void drain();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
