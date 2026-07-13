import type { Category } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError, paginationMeta, type PaginationMeta } from '@ecom/http';
import type { CreateCategoryDto, CreateProductDto, ListProductsQuery, UpdateProductDto } from './dto';
import type { CatalogRepository, ProductWithCategory } from './repository';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export class CatalogService {
  constructor(private readonly repo: CatalogRepository) {}

  async listProducts(query: ListProductsQuery): Promise<{ items: ProductWithCategory[]; meta: PaginationMeta }> {
    const { items, total } = await this.repo.listProducts(query);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async getProduct(id: string): Promise<ProductWithCategory> {
    const product = await this.repo.findProductById(id);
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }

  async createProduct(dto: CreateProductDto): Promise<ProductWithCategory> {
    const category = await this.repo.findCategoryById(dto.categoryId);
    if (!category) throw new BadRequestError('Unknown categoryId');
    try {
      return await this.repo.createProduct(dto);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('A product with this slug already exists');
      throw err;
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto): Promise<ProductWithCategory> {
    await this.getProduct(id);
    if (dto.categoryId) {
      const category = await this.repo.findCategoryById(dto.categoryId);
      if (!category) throw new BadRequestError('Unknown categoryId');
    }
    try {
      return await this.repo.updateProduct(id, dto);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('A product with this slug already exists');
      throw err;
    }
  }

  async deactivateProduct(id: string): Promise<void> {
    await this.getProduct(id);
    await this.repo.deactivateProduct(id);
  }

  listCategories(): Promise<Category[]> {
    return this.repo.listCategories();
  }

  async createCategory(dto: CreateCategoryDto): Promise<Category> {
    try {
      return await this.repo.createCategory(dto);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('A category with this name or slug already exists');
      throw err;
    }
  }
}
