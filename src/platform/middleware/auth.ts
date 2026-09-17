import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../errors.js';
import { AuthContext, AuthenticatedRequest } from '../types.js';

/**
 * Retained for backward compatibility only. The former demo bypass has been
 * removed: authentication is now JWT-only in every environment.
 */
export function isSafeDemoMode(): boolean {
  return false;
}

/** Parse JWT from Authorization header without requiring the full middleware chain. */
export function parseAuthToken(req: AuthenticatedRequest): AuthContext | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.substring(7), env.JWT_SECRET) as AuthContext;
  } catch {
    return null;
  }
}

export function authMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const parsed = parseAuthToken(req);
  if (parsed) {
    // JWT claims are authoritative. Never allow request headers to change tenant or role.
    req.auth = parsed;
    return next();
  }
  return next(AppError.unauthorized('Authentication required. Sign in or provide a valid Bearer token.'));
}

/** Optional auth: attaches user when token present; does not fail when absent. */
export function optionalAuthMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const parsed = parseAuthToken(req);
  if (parsed) {
    req.auth = parsed;
  }
  next();
}
