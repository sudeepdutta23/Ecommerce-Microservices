import { Prisma, type PrismaClient } from '@prisma/client';

export interface StoredEvent {
  id?: string;
  type: string;
  source: string;
  userId?: string;
  payload: Prisma.InputJsonValue;
  correlationId?: string;
  occurredAt: Date;
}

export interface TypeCount {
  type: string;
  count: number;
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface AnalyticsRepository {
  insertMany(events: StoredEvent[]): Promise<number>;
  countByType(from: Date, to: Date): Promise<TypeCount[]>;
  countByDay(from: Date, to: Date): Promise<DailyCount[]>;
  totalCount(from: Date, to: Date): Promise<number>;
}

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insertMany(events: StoredEvent[]): Promise<number> {
    // skipDuplicates makes domain-event ingestion (id = envelope id)
    // idempotent under at-least-once redelivery.
    const result = await this.prisma.analyticsEvent.createMany({ data: events, skipDuplicates: true });
    return result.count;
  }

  async countByType(from: Date, to: Date): Promise<TypeCount[]> {
    const rows = await this.prisma.analyticsEvent.groupBy({
      by: ['type'],
      where: { occurredAt: { gte: from, lte: to } },
      _count: { _all: true },
      orderBy: { _count: { type: 'desc' } },
      take: 50,
    });
    return rows.map((r) => ({ type: r.type, count: r._count._all }));
  }

  async countByDay(from: Date, to: Date): Promise<DailyCount[]> {
    const rows = await this.prisma.$queryRaw<Array<{ day: Date; count: number }>>(
      Prisma.sql`
        SELECT date_trunc('day', "occurred_at") AS day, count(*)::int AS count
        FROM "events"
        WHERE "occurred_at" >= ${from} AND "occurred_at" <= ${to}
        GROUP BY 1
        ORDER BY 1
      `,
    );
    return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: r.count }));
  }

  totalCount(from: Date, to: Date): Promise<number> {
    return this.prisma.analyticsEvent.count({ where: { occurredAt: { gte: from, lte: to } } });
  }
}
