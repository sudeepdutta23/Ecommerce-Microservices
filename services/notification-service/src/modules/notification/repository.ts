import type { Notification, Prisma, PrismaClient } from '@prisma/client';
import { toPagination } from '@ecom/http';
import type { ListNotificationsQuery } from './dto';

export interface CreateNotificationData {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
  sourceEventId?: string;
}

export interface NotificationRepository {
  create(data: CreateNotificationData): Promise<Notification | null>;
  listByUser(userId: string, query: ListNotificationsQuery): Promise<{ items: Notification[]; total: number; unread: number }>;
  findById(id: string): Promise<Notification | null>;
  markRead(id: string): Promise<Notification>;
  markAllRead(userId: string): Promise<number>;
}

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateNotificationData): Promise<Notification | null> {
    try {
      return await this.prisma.notification.create({ data });
    } catch (err) {
      // Duplicate sourceEventId: the event was redelivered — already handled.
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
        return null;
      }
      throw err;
    }
  }

  async listByUser(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<{ items: Notification[]; total: number; unread: number }> {
    const where: Prisma.NotificationWhereInput = { userId, ...(query.unreadOnly ? { readAt: null } : {}) };
    const { skip, limit } = toPagination(query);
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, unread };
  }

  findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  markRead(id: string): Promise<Notification> {
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}
