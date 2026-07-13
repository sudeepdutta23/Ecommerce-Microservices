import { describe, expect, it } from 'vitest';
import { listProductsQuerySchema } from './dto';
import { buildProductWhere } from './query';

const parse = (q: Record<string, string>) => listProductsQuerySchema.parse(q);

describe('listProductsQuerySchema + buildProductWhere', () => {
  it('defaults to active products, page 1, newest first', () => {
    const query = parse({});
    expect(query).toMatchObject({ page: 1, limit: 20, sort: 'createdAt', order: 'desc' });
    expect(buildProductWhere(query)).toEqual({ isActive: true });
  });

  it('parses the comma-separated ids batch filter', () => {
    const id1 = 'a1000000-0000-4000-8000-000000000001';
    const id2 = 'a1000000-0000-4000-8000-000000000002';
    const query = parse({ ids: `${id1}, ${id2}` });
    expect(buildProductWhere(query).id).toEqual({ in: [id1, id2] });
  });

  it('rejects malformed ids', () => {
    expect(() => parse({ ids: 'not-a-uuid' })).toThrow();
  });

  it('combines price range, category, and case-insensitive search', () => {
    const categoryId = 'c1000000-0000-4000-8000-000000000001';
    const where = buildProductWhere(
      parse({ minPriceCents: '1000', maxPriceCents: '5000', categoryId, search: 'keyboard' }),
    );
    expect(where.priceCents).toEqual({ gte: 1000, lte: 5000 });
    expect(where.categoryId).toBe(categoryId);
    expect(where.OR).toEqual([
      { name: { contains: 'keyboard', mode: 'insensitive' } },
      { description: { contains: 'keyboard', mode: 'insensitive' } },
    ]);
  });

  it('caps limit at 100', () => {
    expect(() => parse({ limit: '500' })).toThrow();
  });

  it('includes inactive products only when explicitly requested', () => {
    expect(buildProductWhere(parse({ includeInactive: 'true' })).isActive).toBeUndefined();
  });
});
