import { Router } from 'express';
import { asyncHandler, authenticate, requireRole, validate } from '@ecom/http';
import type { CatalogController } from './controller';
import {
  createCategorySchema,
  createProductSchema,
  idParamSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from './dto';

/** Public catalog reads; admin-only writes. */
export function productRoutes(controller: CatalogController, jwtSecret: string): Router {
  const router = Router();
  const admin = [authenticate(jwtSecret), requireRole('ADMIN')] as const;

  router.get('/', validate({ query: listProductsQuerySchema }), asyncHandler(controller.listProducts));
  router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getProduct));
  router.post('/', ...admin, validate({ body: createProductSchema }), asyncHandler(controller.createProduct));
  router.put('/:id', ...admin, validate({ params: idParamSchema, body: updateProductSchema }), asyncHandler(controller.updateProduct));
  router.delete('/:id', ...admin, validate({ params: idParamSchema }), asyncHandler(controller.deactivateProduct));

  return router;
}

export function categoryRoutes(controller: CatalogController, jwtSecret: string): Router {
  const router = Router();

  router.get('/', asyncHandler(controller.listCategories));
  router.post('/', authenticate(jwtSecret), requireRole('ADMIN'), validate({ body: createCategorySchema }), asyncHandler(controller.createCategory));

  return router;
}
