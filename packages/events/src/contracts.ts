import { z } from 'zod';

/**
 * Event contracts shared by all services. This file is the single source of
 * truth for cross-service integration — services never import each other's
 * code, only these contracts. Version new payload shapes by adding new event
 * types (e.g. `order.created.v2`) rather than mutating existing ones.
 */

export const EXCHANGE = 'ecom.events';

export const EventTypes = {
  UserRegistered: 'user.registered',
  OrderCreated: 'order.created',
  OrderStatusChanged: 'order.status_changed',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const eventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  source: z.string().min(1),
  occurredAt: z.string().datetime(),
  correlationId: z.string().optional(),
  payload: z.unknown(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const userRegisteredSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['USER', 'ADMIN']),
});
export type UserRegisteredPayload = z.infer<typeof userRegisteredSchema>;

export const orderCreatedSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      productName: z.string(),
      quantity: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative(),
    }),
  ),
});
export type OrderCreatedPayload = z.infer<typeof orderCreatedSchema>;

export const orderStatusChangedSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  previousStatus: z.string(),
  newStatus: z.string(),
});
export type OrderStatusChangedPayload = z.infer<typeof orderStatusChangedSchema>;
