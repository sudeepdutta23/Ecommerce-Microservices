import { z } from 'zod';
import { paginationQuerySchema } from '@ecom/http';

export const listProductsQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  /** Comma-separated batch lookup, used by order-service for price validation. */
  ids: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).max(100))
    .optional(),
  minPriceCents: z.coerce.number().int().nonnegative().optional(),
  maxPriceCents: z.coerce.number().int().nonnegative().optional(),
  includeInactive: z.coerce.boolean().default(false),
  sort: z.enum(['name', 'priceCents', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().positive(),
  currency: z.string().length(3).default('USD'),
  stock: z.number().int().nonnegative().default(0),
  categoryId: z.string().uuid(),
  isActive: z.boolean().default(true),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'),
});
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
