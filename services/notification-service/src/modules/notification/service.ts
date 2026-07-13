import type { Notification } from '@prisma/client';
import {
  ForbiddenError,
  NotFoundError,
  paginationMeta,
  type AuthUser,
  type PaginationMeta,
} from '@ecom/http';
import {
  EventTypes,
  orderCreatedSchema,
  orderStatusChangedSchema,
  userRegisteredSchema,
  type EventEnvelope,
} from '@ecom/events';
import type { Logger } from '@ecom/logger';
import type { ListNotificationsQuery } from './dto';
import type { NotificationRepository } from './repository';

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Single entry point for domain events. In production the "send" step
   * (email/push/SMS provider) would fan out from here; this reference
   * implementation persists in-app notifications.
   */
  async handleEvent(envelope: EventEnvelope): Promise<void> {
    switch (envelope.type) {
      case EventTypes.UserRegistered: {
        const payload = userRegisteredSchema.parse(envelope.payload);
        await this.repo.create({
          userId: payload.userId,
          type: 'welcome',
          title: 'Welcome!',
          body: `Your account ${payload.email} has been created.`,
          sourceEventId: envelope.id,
        });
        break;
      }
      case EventTypes.OrderCreated: {
        const payload = orderCreatedSchema.parse(envelope.payload);
        await this.repo.create({
          userId: payload.userId,
          type: 'order_created',
          title: 'Order confirmed',
          body: `We received your order of ${payload.items.length} item(s) totalling ${formatMoney(payload.totalCents, payload.currency)}.`,
          metadata: { orderId: payload.orderId },
          sourceEventId: envelope.id,
        });
        break;
      }
      case EventTypes.OrderStatusChanged: {
        const payload = orderStatusChangedSchema.parse(envelope.payload);
        await this.repo.create({
          userId: payload.userId,
          type: 'order_status',
          title: `Order ${payload.newStatus.toLowerCase()}`,
          body: `Your order is now ${payload.newStatus}.`,
          metadata: { orderId: payload.orderId, previousStatus: payload.previousStatus },
          sourceEventId: envelope.id,
        });
        break;
      }
      default:
        this.logger.debug({ eventType: envelope.type }, 'ignoring unhandled event type');
    }
  }

  async list(
    user: AuthUser,
    query: ListNotificationsQuery,
  ): Promise<{ items: Notification[]; unread: number; meta: PaginationMeta }> {
    const { items, total, unread } = await this.repo.listByUser(user.id, query);
    return { items, unread, meta: paginationMeta(query.page, query.limit, total) };
  }

  async markRead(user: AuthUser, id: string): Promise<Notification> {
    const notification = await this.repo.findById(id);
    if (!notification) throw new NotFoundError('Notification not found');
    if (notification.userId !== user.id) throw new ForbiddenError();
    if (notification.readAt) return notification;
    return this.repo.markRead(id);
  }

  markAllRead(user: AuthUser): Promise<number> {
    return this.repo.markAllRead(user.id);
  }
}
