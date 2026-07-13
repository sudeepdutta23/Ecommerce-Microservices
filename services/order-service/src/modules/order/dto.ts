import { z } from 'zod';
import { paginationQuerySchema } from '@ecom/http';

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(50)
    // Duplicate product lines are ambiguous under idempotent replay; reject them.
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
      message: 'Duplicate productId in items',
    }),
  shippingAddress: z
    .object({
      line1: z.string().min(1).max(200),
      line2: z.string().max(200).optional(),
      city: z.string().min(1).max(100),
      postalCode: z.string().min(1).max(20),
      country: z.string().length(2),
    })
    .optional(),
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']).optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const updateStatusSchema = z.object({
  status: z.enum(['PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
});
export type UpdateStatusDto = z.infer<typeof updateStatusSchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
