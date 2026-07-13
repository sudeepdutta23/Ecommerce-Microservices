import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@ecom/events';
import { requestContext, type Logger } from '@ecom/logger';
import type { IngestEventsDto, SummaryQuery } from './dto';
import type { AnalyticsRepository, DailyCount, TypeCount } from './repository';

export interface SummaryReport {
  from: string;
  to: string;
  totalEvents: number;
  byType: TypeCount[];
  byDay: DailyCount[];
}

const DEFAULT_WINDOW_DAYS = 30;

export class AnalyticsService {
  constructor(
    private readonly repo: AnalyticsRepository,
    private readonly logger: Logger,
  ) {}

  /** Frontend event ingestion (batched by the microfrontends). */
  async ingest(dto: IngestEventsDto, authenticatedUserId?: string): Promise<number> {
    const correlationId = requestContext.getStore()?.correlationId;
    const now = new Date();
    return this.repo.insertMany(
      dto.events.map((e) => ({
        id: randomUUID(),
        type: e.type,
        source: 'frontend',
        userId: e.userId ?? authenticatedUserId,
        payload: e.payload as Record<string, never>,
        correlationId,
        occurredAt: e.occurredAt ? new Date(e.occurredAt) : now,
      })),
    );
  }

  /** Backend domain events consumed from the bus ('#' binding). */
  async recordDomainEvent(envelope: EventEnvelope): Promise<void> {
    const payload = envelope.payload;
    const userId =
      typeof payload === 'object' && payload !== null && typeof (payload as { userId?: unknown }).userId === 'string'
        ? ((payload as { userId: string }).userId)
        : undefined;

    const inserted = await this.repo.insertMany([
      {
        id: envelope.id,
        type: envelope.type,
        source: envelope.source,
        userId,
        payload: (payload ?? {}) as Record<string, never>,
        correlationId: envelope.correlationId,
        occurredAt: new Date(envelope.occurredAt),
      },
    ]);
    if (inserted === 0) {
      this.logger.debug({ eventId: envelope.id }, 'duplicate domain event skipped');
    }
  }

  async summary(query: SummaryQuery): Promise<SummaryReport> {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [totalEvents, byType, byDay] = await Promise.all([
      this.repo.totalCount(from, to),
      this.repo.countByType(from, to),
      this.repo.countByDay(from, to),
    ]);
    return { from: from.toISOString(), to: to.toISOString(), totalEvents, byType, byDay };
  }
}
