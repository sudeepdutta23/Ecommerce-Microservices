import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import amqp from 'amqplib';
import { requestContext, type Logger } from '@ecom/logger';
import { EXCHANGE, eventEnvelopeSchema, type EventEnvelope } from './contracts';

export interface EventBusOptions {
  url: string;
  serviceName: string;
  logger: Logger;
}

export interface Subscription {
  /** Durable queue owned by the consuming service, e.g. `notification-service.events`. */
  queue: string;
  /** Topic binding keys, e.g. `['order.#', 'user.registered']`. */
  bindings: string[];
  handler: (envelope: EventEnvelope) => Promise<void>;
  prefetch?: number;
}

/**
 * Thin RabbitMQ wrapper: one durable topic exchange, persistent messages,
 * confirm-channel publishes (used by the outbox pattern to guarantee the
 * broker accepted a message before it is marked published), per-service
 * durable queues, automatic reconnect with re-subscription.
 *
 * Delivery is at-least-once: consumers must be idempotent.
 */
export class EventBus {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.ConfirmChannel | null = null;
  private closing = false;
  private readonly subscriptions: Subscription[] = [];

  constructor(private readonly opts: EventBusOptions) {}

  get connected(): boolean {
    return this.channel !== null;
  }

  async connect(maxAttempts = 30, delayMs = 2000): Promise<void> {
    const { url, logger } = this.opts;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const connection = await amqp.connect(url);
        const channel = await connection.createConfirmChannel();
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

        connection.on('error', (err) => logger.error({ err }, 'amqp connection error'));
        connection.on('close', () => {
          this.connection = null;
          this.channel = null;
          if (this.closing) return;
          logger.warn('amqp connection closed, reconnecting');
          this.connect().catch((err) => logger.error({ err }, 'amqp reconnect failed'));
        });

        this.connection = connection;
        this.channel = channel;
        for (const sub of this.subscriptions) {
          await this.bindSubscription(sub);
        }
        logger.info({ exchange: EXCHANGE }, 'event bus connected');
        return;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        logger.warn({ attempt, err: (err as Error).message }, 'amqp connect failed, retrying');
        await sleep(delayMs);
      }
    }
  }

  async publish(type: string, payload: unknown, opts?: { correlationId?: string }): Promise<void> {
    const channel = this.channel;
    if (!channel) throw new Error('Event bus is not connected');

    const envelope: EventEnvelope = {
      id: randomUUID(),
      type,
      source: this.opts.serviceName,
      occurredAt: new Date().toISOString(),
      correlationId: opts?.correlationId ?? requestContext.getStore()?.correlationId,
      payload,
    };

    await new Promise<void>((resolve, reject) => {
      channel.publish(
        EXCHANGE,
        type,
        Buffer.from(JSON.stringify(envelope)),
        { persistent: true, contentType: 'application/json', messageId: envelope.id },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    this.opts.logger.debug({ eventType: type, eventId: envelope.id }, 'event published');
  }

  async subscribe(sub: Subscription): Promise<void> {
    this.subscriptions.push(sub);
    if (this.channel) await this.bindSubscription(sub);
  }

  private async bindSubscription(sub: Subscription): Promise<void> {
    const channel = this.channel!;
    const { logger } = this.opts;
    await channel.assertQueue(sub.queue, { durable: true });
    for (const binding of sub.bindings) {
      await channel.bindQueue(sub.queue, EXCHANGE, binding);
    }
    await channel.prefetch(sub.prefetch ?? 10);
    await channel.consume(sub.queue, async (msg) => {
      if (!msg) return;
      let envelope: EventEnvelope;
      try {
        envelope = eventEnvelopeSchema.parse(JSON.parse(msg.content.toString()));
      } catch (err) {
        // Poison message: never parseable, requeueing would loop forever.
        logger.error({ err }, 'dropping malformed event');
        channel.nack(msg, false, false);
        return;
      }
      try {
        await requestContext.run(
          { correlationId: envelope.correlationId ?? envelope.id },
          () => sub.handler(envelope),
        );
        channel.ack(msg);
      } catch (err) {
        logger.error({ err, eventType: envelope.type, eventId: envelope.id }, 'event handler failed');
        // No requeue: with a DLX configured these would be dead-lettered for
        // inspection instead of hot-looping. See README "Reliability notes".
        channel.nack(msg, false, false);
      }
    });
    logger.info({ queue: sub.queue, bindings: sub.bindings }, 'event subscription active');
  }

  async close(): Promise<void> {
    this.closing = true;
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch {
      // already closed
    }
    this.channel = null;
    this.connection = null;
  }
}
