import type { OrderStatus, Prisma } from '@prisma/client';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  paginationMeta,
  type AuthUser,
  type PaginationMeta,
} from '@ecom/http';
import { EventTypes, type OrderCreatedPayload, type OrderStatusChangedPayload } from '@ecom/events';
import { requestContext, type Logger } from '@ecom/logger';
import type { CatalogClient } from './catalog-client';
import { calculateTotalCents, canTransition } from './domain';
import type { CreateOrderDto, ListOrdersQuery } from './dto';
import type { OrderRepository, OrderWithItems } from './repository';

export interface OrderResult {
  order: SerializedOrder;
  /** True when this response was replayed from a stored idempotency record. */
  idempotentReplay: boolean;
}

export interface SerializedOrder {
  id: string;
  userId: string;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  shippingAddress: unknown;
  createdAt: string;
  items: Array<{ productId: string; productName: string; unitPriceCents: number; quantity: number }>;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export class OrderService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly catalog: CatalogClient,
    private readonly logger: Logger,
  ) {}

  async createOrder(user: AuthUser, dto: CreateOrderDto, idempotencyKey: string): Promise<OrderResult> {
    const existing = await this.repo.findIdempotencyKey(idempotencyKey, user.id);
    if (existing) {
      return { order: existing.response as unknown as SerializedOrder, idempotentReplay: true };
    }

    // Authoritative prices come from the catalog service — never the client.
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.catalog.getProductsByIds(productIds);
    const productById = new Map(products.map((p) => [p.id, p]));

    const pricedItems = dto.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product || !product.isActive) {
        throw new BadRequestError(`Product ${item.productId} is not available`);
      }
      if (product.stock < item.quantity) {
        throw new ConflictError(`Insufficient stock for "${product.name}" (available: ${product.stock})`);
      }
      return {
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity: item.quantity,
      };
    });

    const currencies = new Set(pricedItems.map((i) => productById.get(i.productId)!.currency));
    if (currencies.size > 1) throw new BadRequestError('All items in an order must share one currency');
    const currency = currencies.values().next().value ?? 'USD';
    const totalCents = calculateTotalCents(pricedItems);
    const correlationId = requestContext.getStore()?.correlationId;

    try {
      const order = await this.repo.createOrderTransactional(
        {
          userId: user.id,
          totalCents,
          currency,
          shippingAddress: dto.shippingAddress,
          items: pricedItems,
        },
        (created) => ({
          type: EventTypes.OrderCreated,
          payload: {
            orderId: created.id,
            userId: created.userId,
            totalCents: created.totalCents,
            currency: created.currency,
            items: pricedItems,
          } satisfies OrderCreatedPayload,
          correlationId,
        }),
        {
          key: idempotencyKey,
          statusCode: 201,
          buildResponse: (created) => this.serialize(created) as unknown as Prisma.InputJsonValue,
        },
      );
      this.logger.info({ orderId: order.id, totalCents }, 'order created');
      return { order: this.serialize(order), idempotentReplay: false };
    } catch (err) {
      // Two concurrent requests with the same key: the loser replays the winner.
      if (isUniqueViolation(err)) {
        const winner = await this.repo.findIdempotencyKey(idempotencyKey, user.id);
        if (winner) return { order: winner.response as unknown as SerializedOrder, idempotentReplay: true };
      }
      throw err;
    }
  }

  async getOrder(user: AuthUser, orderId: string): Promise<SerializedOrder> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenError('You do not have access to this order');
    }
    return this.serialize(order);
  }

  async listOrders(user: AuthUser, query: ListOrdersQuery): Promise<{ items: SerializedOrder[]; meta: PaginationMeta }> {
    const { items, total } = await this.repo.listByUser(user.id, query);
    return { items: items.map((o) => this.serialize(o)), meta: paginationMeta(query.page, query.limit, total) };
  }

  /** Admin transition (payment webhook / fulfillment integration point). */
  async updateStatus(orderId: string, newStatus: OrderStatus): Promise<SerializedOrder> {
    return this.transition(orderId, newStatus);
  }

  /** Owner-initiated cancellation, only while the order is still PENDING. */
  async cancelOwnOrder(user: AuthUser, orderId: string): Promise<SerializedOrder> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.userId !== user.id) throw new ForbiddenError('You do not have access to this order');
    if (order.status !== 'PENDING') {
      throw new ConflictError(`A ${order.status} order can no longer be cancelled by the customer`);
    }
    return this.transition(orderId, 'CANCELLED');
  }

  private async transition(orderId: string, newStatus: OrderStatus): Promise<SerializedOrder> {
    const order = await this.repo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (!canTransition(order.status, newStatus)) {
      throw new ConflictError(`Illegal status transition ${order.status} -> ${newStatus}`);
    }

    const updated = await this.repo.updateStatusTransactional(orderId, newStatus, {
      type: EventTypes.OrderStatusChanged,
      payload: {
        orderId: order.id,
        userId: order.userId,
        previousStatus: order.status,
        newStatus,
      } satisfies OrderStatusChangedPayload,
      correlationId: requestContext.getStore()?.correlationId,
    });
    this.logger.info({ orderId, from: order.status, to: newStatus }, 'order status changed');
    return this.serialize(updated);
  }

  private serialize(order: OrderWithItems): SerializedOrder {
    return {
      id: order.id,
      userId: order.userId,
      status: order.status,
      totalCents: order.totalCents,
      currency: order.currency,
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
      })),
    };
  }
}
