import type { IdempotencyKey, Order, OrderItem, OrderStatus, Prisma, PrismaClient } from '@prisma/client';
import { toPagination } from '@ecom/http';
import type { ListOrdersQuery } from './dto';

export type OrderWithItems = Order & { items: OrderItem[] };

export interface NewOrderData {
  userId: string;
  totalCents: number;
  currency: string;
  shippingAddress?: Prisma.InputJsonValue;
  items: Array<{ productId: string; productName: string; unitPriceCents: number; quantity: number }>;
}

export interface OutboxEntry {
  type: string;
  payload: Prisma.InputJsonValue;
  correlationId?: string;
}

export interface OrderRepository {
  findIdempotencyKey(key: string, userId: string): Promise<IdempotencyKey | null>;
  /** Order + items + outbox event + idempotency record in ONE transaction. */
  createOrderTransactional(
    data: NewOrderData,
    outbox: (order: OrderWithItems) => OutboxEntry,
    idempotency: { key: string; statusCode: number; buildResponse: (order: OrderWithItems) => Prisma.InputJsonValue },
  ): Promise<OrderWithItems>;
  findById(id: string): Promise<OrderWithItems | null>;
  listByUser(userId: string, query: ListOrdersQuery): Promise<{ items: OrderWithItems[]; total: number }>;
  updateStatusTransactional(orderId: string, status: OrderStatus, outbox: OutboxEntry): Promise<OrderWithItems>;
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findIdempotencyKey(key: string, userId: string): Promise<IdempotencyKey | null> {
    return this.prisma.idempotencyKey.findUnique({ where: { key_userId: { key, userId } } });
  }

  async createOrderTransactional(
    data: NewOrderData,
    outbox: (order: OrderWithItems) => OutboxEntry,
    idempotency: { key: string; statusCode: number; buildResponse: (order: OrderWithItems) => Prisma.InputJsonValue },
  ): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId: data.userId,
          totalCents: data.totalCents,
          currency: data.currency,
          shippingAddress: data.shippingAddress,
          items: { create: data.items },
        },
        include: { items: true },
      });

      const event = outbox(order);
      await tx.outboxEvent.create({
        data: { type: event.type, payload: event.payload, correlationId: event.correlationId },
      });

      await tx.idempotencyKey.create({
        data: {
          key: idempotency.key,
          userId: data.userId,
          statusCode: idempotency.statusCode,
          response: idempotency.buildResponse(order),
        },
      });

      return order;
    });
  }

  findById(id: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({ where: { id }, include: { items: true } });
  }

  async listByUser(userId: string, query: ListOrdersQuery): Promise<{ items: OrderWithItems[]; total: number }> {
    const where: Prisma.OrderWhereInput = { userId, ...(query.status ? { status: query.status } : {}) };
    const { skip, limit } = toPagination(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total };
  }

  async updateStatusTransactional(orderId: string, status: OrderStatus, outbox: OutboxEntry): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({ where: { id: orderId }, data: { status }, include: { items: true } });
      await tx.outboxEvent.create({
        data: { type: outbox.type, payload: outbox.payload, correlationId: outbox.correlationId },
      });
      return order;
    });
  }
}
