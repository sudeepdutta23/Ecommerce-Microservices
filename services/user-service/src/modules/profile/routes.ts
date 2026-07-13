import { Router } from 'express';
import { asyncHandler, authenticate, requireRole, validate } from '@ecom/http';
import type { ProfileController } from './controller';
import { updatePreferencesSchema, updateProfileSchema, userIdParamSchema } from './dto';

export function profileRoutes(controller: ProfileController, jwtSecret: string): Router {
  const router = Router();
  router.use(authenticate(jwtSecret));

  router.get('/me', asyncHandler(controller.getMe));
  router.put('/me', validate({ body: updateProfileSchema }), asyncHandler(controller.updateMe));
  router.patch('/me/preferences', validate({ body: updatePreferencesSchema }), asyncHandler(controller.updateMyPreferences));

  // Support/admin lookup of any profile.
  router.get('/:userId', requireRole('ADMIN'), validate({ params: userIdParamSchema }), asyncHandler(controller.getByUserId));

  return router;
}
