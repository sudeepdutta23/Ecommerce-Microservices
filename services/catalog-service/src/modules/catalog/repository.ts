import type { Category, PrismaClient, Product } from '@prisma/client';
import { toPagination } from '@ecom/http';
import type { CreateCategoryDto, CreateProductDto, ListProductsQuery, UpdateProductDto } from './dto';
import { buildProductWhere } from './query';

export type ProductWithCategory = Product & { category: Category };

export interface CatalogRepository {
  listProducts(query: ListProductsQuery): Promise<{ items: ProductWithCategory[]; total: number }>;
  findProductById(id: string): Promise<ProductWithCategory | null>;
  createProduct(data: CreateProductDto): Promise<ProductWithCategory>;
  updateProduct(id: string, data: UpdateProductDto): Promise<ProductWithCategory>;
  deactivateProduct(id: string): Promise<void>;
  listCategories(): Promise<Category[]>;
  createCategory(data: CreateCategoryDto): Promise<Category>;
  findCategoryById(id: string): Promise<Category | null>;
}

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listProducts(query: ListProductsQuery): Promise<{ items: ProductWithCategory[]; total: number }> {
    const where = buildProductWhere(query);
    const { skip, limit } = toPagination(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: { [query.sort]: query.order },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total };
  }

  findProductById(id: string): Promise<ProductWithCategory | null> {
    return this.prisma.product.findUnique({ where: { id }, include: { category: true } });
  }

  createProduct(data: CreateProductDto): Promise<ProductWithCategory> {
    return this.prisma.product.create({ data, include: { category: true } });
  }

  updateProduct(id: string, data: UpdateProductDto): Promise<ProductWithCategory> {
    return this.prisma.product.update({ where: { id }, data, include: { category: true } });
  }

  async deactivateProduct(id: string): Promise<void> {
    // Soft delete: order history keeps referencing the product id.
    await this.prisma.product.update({ where: { id }, data: { isActive: false } });
  }

  listCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  createCategory(data: CreateCategoryDto): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  findCategoryById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }
}
