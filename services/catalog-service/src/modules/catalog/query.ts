import type { Prisma } from '@prisma/client';
import type { ListProductsQuery } from './dto';

/**
 * Pure translation of list-query DTO → Prisma where clause. Extracted from
 * the repository so filter semantics are unit-testable without a database.
 */
export function buildProductWhere(query: ListProductsQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (!query.includeInactive) where.isActive = true;
  if (query.ids && query.ids.length > 0) where.id = { in: query.ids };
  if (query.categoryId) where.categoryId = query.categoryId;

  if (query.minPriceCents !== undefined || query.maxPriceCents !== undefined) {
    where.priceCents = {
      ...(query.minPriceCents !== undefined ? { gte: query.minPriceCents } : {}),
      ...(query.maxPriceCents !== undefined ? { lte: query.maxPriceCents } : {}),
    };
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  return where;
}
