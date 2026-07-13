import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ForbiddenError, UnauthorizedError } from './errors';

export type UserRole = 'USER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
    correlationId?: string;
  }
}

export function signAccessToken(payload: AccessTokenPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn, issuer: 'ecom-auth-service' } as jwt.SignOptions);
}

export function verifyAccessToken(token: string, secret: string): AuthUser {
  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    if (!decoded.sub || typeof decoded.email !== 'string' || typeof decoded.role !== 'string') {
      throw new UnauthorizedError('Malformed token');
    }
    return { id: decoded.sub, email: decoded.email, role: decoded.role as UserRole };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/** Requires a valid Bearer token; attaches `req.user`. */
export function authenticate(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next(new UnauthorizedError());
    }
    try {
      req.user = verifyAccessToken(header.slice('Bearer '.length), jwtSecret);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Must run after `authenticate`. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}
