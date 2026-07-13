import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export function toPagination(input: { page: number; limit: number }): Pagination {
  return { page: input.page, limit: input.limit, skip: (input.page - 1) * input.limit };
}
