import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler, authenticate, validate } from '@ecom/http';
import type { AuthController } from './controller';
import { loginSchema, refreshSchema, registerSchema } from './dto';

export function authRoutes(controller: AuthController, jwtSecret: string): Router {
  const router = Router();

  // Tighter limit on credential endpoints to slow brute-force attempts.
  const credentialLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again later' } },
  });

  router.post('/register', credentialLimiter, validate({ body: registerSchema }), asyncHandler(controller.register));
  router.post('/login', credentialLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));
  router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(controller.refresh));
  router.post('/logout', validate({ body: refreshSchema }), asyncHandler(controller.logout));
  router.get('/me', authenticate(jwtSecret), asyncHandler(controller.me));

  return router;
}
