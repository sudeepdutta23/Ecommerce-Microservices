import { Router } from 'express';
import { asyncHandler, authenticate, validate } from '@ecom/http';
import type { NotificationController } from './controller';
import { idParamSchema, listNotificationsQuerySchema } from './dto';

export function notificationRoutes(controller: NotificationController, jwtSecret: string): Router {
  const router = Router();
  router.use(authenticate(jwtSecret));

  router.get('/', validate({ query: listNotificationsQuerySchema }), asyncHandler(controller.list));
  router.patch('/:id/read', validate({ params: idParamSchema }), asyncHandler(controller.markRead));
  router.post('/read-all', asyncHandler(controller.markAllRead));

  return router;
}
