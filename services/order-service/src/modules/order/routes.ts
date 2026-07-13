import { Router } from 'express';
import { asyncHandler, authenticate, requireRole, validate } from '@ecom/http';
import type { OrderController } from './controller';
import { createOrderSchema, idParamSchema, listOrdersQuerySchema, updateStatusSchema } from './dto';

export function orderRoutes(controller: OrderController, jwtSecret: string): Router {
  const router = Router();
  router.use(authenticate(jwtSecret));

  router.post('/', validate({ body: createOrderSchema }), asyncHandler(controller.create));
  router.get('/', validate({ query: listOrdersQuerySchema }), asyncHandler(controller.list));
  router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getById));
  router.post('/:id/cancel', validate({ params: idParamSchema }), asyncHandler(controller.cancel));

  // Payment/fulfillment systems drive transitions; modeled as admin-only here.
  router.patch(
    '/:id/status',
    requireRole('ADMIN'),
    validate({ params: idParamSchema, body: updateStatusSchema }),
    asyncHandler(controller.updateStatus),
  );

  return router;
}
