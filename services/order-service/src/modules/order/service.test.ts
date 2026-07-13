import { describe, expect, it, vi } from 'vitest';
import type { IdempotencyKey } from '@prisma/client';
import { BadRequestError, ConflictError, type AuthUser } from '@ecom/http';
import type { CatalogClient, CatalogProduct } from './catalog-client';
import { calculateTotalCents, canTransition } from './domain';
import type { NewOrderData, OrderRepository, OrderWithItems, OutboxEntry } from './repository';
import { OrderService } from './service';

const noopLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as never;
const user: AuthUser = { id: '00000000-0000-4000-8000-000000000001', email: 'u@example.com', role: 'USER' };

const PRODUCTS: CatalogProduct[] = [
  { id: 'a1000000-0000-4000-8000-000000000001', name: 'Headphones', priceCents: 12999, currency: 'USD', stock: 10, isActive: true },
  { id: 'a1000000-0000-4000-8000-000000000002', name: 'Keyboard', priceCents: 8999, currency: 'USD', stock: 1, isActive: true },
  { id: 'a1000000-0000-4000-8000-000000000003', name: 'Retired Item', priceCents: 100, currency: 'USD', stock: 5, isActive: false },
];

function makeFakes(): { repo: OrderRepository; catalog: CatalogClient; outboxEntries: OutboxEntry[] } {
  const idempotency = new Map<string, IdempotencyKey>();
  const orders = new Map<string, OrderWithItems>();
  const outboxEntries: OutboxEntry[] = [];
  let seq = 0;

  const materialize = (data: NewOrderData): OrderWithItems => ({
    id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
    userId: data.userId,
    status: 'PENDING',
    totalCents: data.totalCents,
    currency: data.currency,
    shippingAddress: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: data.items.map((i, n) => ({ id: `item-${n}`, orderId: 'x', ...i })),
  });

  const repo: OrderRepository = {
    async findIdempotencyKey(key, userId) {
      return idempotency.get(`${key}:${userId}`) ?? null;
    },
    async createOrderTransactional(data, outbox, idem) {
      const mapKey = `${idem.key}:${data.userId}`;
      if (idempotency.has(mapKey)) {
        throw Object.assign(new Error('unique violation'), { code: 'P2002' });
      }
      const order = materialize(data);
      orders.set(order.id, order);
      outboxEntries.push(outbox(order));
      idempotency.set(mapKey, {
        key: idem.key,
        userId: data.userId,
        statusCode: idem.statusCode,
        response: idem.buildResponse(order),
        createdAt: new Date(),
      });
      return order;
    },
    async findById(id) {
      return orders.get(id) ?? null;
    },
    async listByUser(userId) {
      const items = [...orders.values()].filter((o) => o.userId === userId);
      return { items, total: items.length };
    },
    async updateStatusTransactional(orderId, status, outbox) {
      const order = orders.get(orderId)!;
      order.status = status;
      outboxEntries.push(outbox);
      return order;
    },
  };

  const catalog: CatalogClient = {
    async getProductsByIds(ids) {
      return PRODUCTS.filter((p) => ids.includes(p.id));
    },
  };

  return { repo, catalog, outboxEntries };
}

describe('order domain', () => {
  it('computes totals in integer cents', () => {
    expect(calculateTotalCents([
      { unitPriceCents: 12999, quantity: 2 },
      { unitPriceCents: 8999, quantity: 1 },
    ])).toBe(34997);
  });

  it('enforces the status state machine', () => {
    expect(canTransition('PENDING', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'SHIPPED')).toBe(true);
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'PAID')).toBe(false);
  });
});

describe('OrderService.createOrder', () => {
  it('prices the order from the catalog and writes an outbox event', async () => {
    const { repo, catalog, outboxEntries } = makeFakes();
    const service = new OrderService(repo, catalog, noopLogger);

    const result = await service.createOrder(
      user,
      { items: [{ productId: PRODUCTS[0].id, quantity: 2 }, { productId: PRODUCTS[1].id, quantity: 1 }] },
      'key-12345678',
    );

    expect(result.idempotentReplay).toBe(false);
    expect(result.order.totalCents).toBe(2 * 12999 + 8999);
    expect(result.order.status).toBe('PENDING');
    expect(outboxEntries).toHaveLength(1);
    expect(outboxEntries[0].type).toBe('order.created');
  });

  it('replays the stored response for a duplicate idempotency key', async () => {
    const { repo, catalog, outboxEntries } = makeFakes();
    const service = new OrderService(repo, catalog, noopLogger);
    const dto = { items: [{ productId: PRODUCTS[0].id, quantity: 1 }] };

    const first = await service.createOrder(user, dto, 'key-12345678');
    const second = await service.createOrder(user, dto, 'key-12345678');

    expect(second.idempotentReplay).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(outboxEntries).toHaveLength(1); // no duplicate event
  });

  it('rejects inactive products and insufficient stock', async () => {
    const { repo, catalog } = makeFakes();
    const service = new OrderService(repo, catalog, noopLogger);

    await expect(
      service.createOrder(user, { items: [{ productId: PRODUCTS[2].id, quantity: 1 }] }, 'key-aaaaaaaa'),
    ).rejects.toThrow(BadRequestError);

    await expect(
      service.createOrder(user, { items: [{ productId: PRODUCTS[1].id, quantity: 5 }] }, 'key-bbbbbbbb'),
    ).rejects.toThrow(ConflictError);
  });

  it('blocks illegal transitions and emits events for legal ones', async () => {
    const { repo, catalog, outboxEntries } = makeFakes();
    const service = new OrderService(repo, catalog, noopLogger);
    const { order } = await service.createOrder(
      user,
      { items: [{ productId: PRODUCTS[0].id, quantity: 1 }] },
      'key-cccccccc',
    );

    await expect(service.updateStatus(order.id, 'DELIVERED')).rejects.toThrow(ConflictError);

    const paid = await service.updateStatus(order.id, 'PAID');
    expect(paid.status).toBe('PAID');
    expect(outboxEntries.at(-1)?.type).toBe('order.status_changed');

    // Customer cannot cancel once paid.
    await expect(service.cancelOwnOrder(user, order.id)).rejects.toThrow(ConflictError);
  });
});
