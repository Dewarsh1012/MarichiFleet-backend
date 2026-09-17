import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../errors.js';
import { AuthContext, AuthenticatedRequest, UserRole } from '../types.js';

const DEFAULT_DEMO_CONTEXT: AuthContext = {
  userId: 'usr_owner_01',
  email: 'owner@marichifleet.com',
  name: 'Rajesh Sharma',
  tenantId: 'tenant_delhi_01',
  orgId: 'org_marichi_logistics',
  role: 'FLEET_OWNER',
  branches: ['DL-Okhla', 'MH-Bhiwandi', 'KA-Peenya'],
  permissions: ['*'],
};

function applyDemoContext(req: AuthenticatedRequest, role?: UserRole, tenantId?: string) {
  req.auth = {
    ...DEFAULT_DEMO_CONTEXT,
    role: role || 'FLEET_OWNER',
    tenantId: tenantId || DEFAULT_DEMO_CONTEXT.tenantId,
  };
}

export function isSafeDemoMode(): boolean {
  return env.DEMO_MODE && env.NODE_ENV !== 'production';
}

/** Parse JWT from Authorization header without requiring full middleware chain. */
export function parseAuthToken(req: AuthenticatedRequest): AuthContext | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.substring(7), env.JWT_SECRET) as AuthContext;
  } catch {
    return null;
  }
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const demoRoleHeader = req.headers['x-demo-role'] as UserRole | undefined;
  const tenantIdHeader = req.headers['x-tenant-id'] as string | undefined;
  const parsed = parseAuthToken(req);

  if (parsed) {
    // JWT claims are authoritative. Never allow request headers to change tenant or role.
    req.auth = parsed;
    return next();
  }

  if (isSafeDemoMode()) {
    applyDemoContext(req, demoRoleHeader, tenantIdHeader);
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
