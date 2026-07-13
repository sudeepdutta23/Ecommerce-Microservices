import type { Request, Response } from 'express';
import { created, noContent, ok } from '@ecom/http';
import type { ListProductsQuery } from './dto';
import type { CatalogService } from './service';

export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  listProducts = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.service.listProducts(req.query as unknown as ListProductsQuery);
    ok(res, { products: items }, meta);
  };

  getProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await this.service.getProduct(req.params.id);
    ok(res, { product });
  };

  createProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await this.service.createProduct(req.body);
    created(res, { product });
  };

  updateProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await this.service.updateProduct(req.params.id, req.body);
    ok(res, { product });
  };

  deactivateProduct = async (req: Request, res: Response): Promise<void> => {
    await this.service.deactivateProduct(req.params.id);
    noContent(res);
  };

  listCategories = async (_req: Request, res: Response): Promise<void> => {
    const categories = await this.service.listCategories();
    ok(res, { categories });
  };

  createCategory = async (req: Request, res: Response): Promise<void> => {
    const category = await this.service.createCategory(req.body);
    created(res, { category });
  };
}
