/**
 * Authentication routes.
 *
 * Hardened production behaviour:
 *   - No auto-provisioning: an unknown identifier is always rejected.
 *   - No persona switching (removed in every environment).
 *   - Password verification is bcrypt-only in production paths; legacy plaintext
 *     migration is available only inside verifyStoredPassword when explicitly
 *     requested (unit tests) and never on the login path.
 *   - Google Sign-In verifies id_token server-side against GOOGLE_CLIENT_ID and
 *     rejects the request if the resolved email does not map to an existing user.
 *   - Simple fixed-window in-memory rate limit on login endpoints.
 */
import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { AppError } from '../../platform/errors.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { parseAuthToken } from '../../platform/middleware/auth.js';
import { UserModel } from '../../db/models/index.js';
import { logger } from '../../platform/logger.js';

export const authRouter = Router();

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
const PASSWORD_HASH_ROUNDS = 12;

export function isBcryptPasswordHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

export async function verifyStoredPassword(
  stored: string | undefined,
  provided: string | undefined,
  allowLegacyPlaintext = false,
): Promise<{ valid: boolean; upgradedHash?: string }> {
  if (!stored || !provided) return { valid: false };
  if (isBcryptPasswordHash(stored)) {
    return { valid: await bcrypt.compare(provided, stored) };
  }
  if (!allowLegacyPlaintext || stored !== provided) return { valid: false };
  return { valid: true, upgradedHash: await hashPassword(provided) };
}

// ----------------------------- Rate limiting -----------------------------

interface RateBucket {
  count: number;
  resetAt: number;
}
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX_HITS = 20; // per identifier + IP per window
const rateBuckets = new Map<string, RateBucket>();

function rateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const identifier =
    (req.body?.email as string | undefined)?.toLowerCase().trim() ||
    (req.body?.credential as string | undefined)?.slice(0, 24) ||
    'anonymous';
  const key = `${req.ip ?? 'unknown'}::${identifier}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX_HITS) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000).toString());
    return next(AppError.badRequest('Too many authentication attempts. Please wait and try again.'));
  }
  next();
}

// ------------------------------- Schemas ---------------------------------

const loginSchema = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(1),
});

const googleAuthSchema = z.object({
  credential: z.string().min(10), // Google ID Token is mandatory now
});

const resetPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

// ----------------------------- Helpers -----------------------------------

function buildTokenPayload(user: {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  orgId?: string;
  role: string;
  branches?: string[];
  branchIds?: string[];
  permissions?: string[];
  mustResetPassword?: boolean;
  avatarUrl?: string;
  consignorId?: string;
  consigneeId?: string;
}) {
  return {
    userId: user.userId,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    orgId: user.orgId || '',
    role: user.role,
    branches: user.branches || [],
    branchIds: user.branchIds || [],
    permissions: user.permissions || [],
    mustResetPassword: user.mustResetPassword ?? false,
    avatarUrl: user.avatarUrl,
    consignorId: user.consignorId,
    consigneeId: user.consigneeId,
  };
}

// ------------------------------- Routes ----------------------------------

// 1. Email/password login.
authRouter.post('/login', rateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const cleanId = email.toLowerCase().trim();

    if (mongoose.connection.readyState !== 1) {
      return next(AppError.internal('database unavailable'));
    }

    const user = await UserModel.findOne({
      $or: [{ email: cleanId }, { username: cleanId }],
    });

    if (!user) {
      return next(AppError.unauthorized('Invalid email or password.'));
    }
    if (user.active === false || user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      return next(AppError.unauthorized('Account is not active. Contact your administrator.'));
    }

    const passwordResult = await verifyStoredPassword(user.passwordHash, password, false);
    if (!passwordResult.valid) {
      return next(AppError.unauthorized('Invalid email or password.'));
    }

    const payload = buildTokenPayload({
      userId: user.userId,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      orgId: user.orgId,
      role: user.role,
      branches: user.branches,
      branchIds: user.branchIds,
      permissions: user.permissions,
      mustResetPassword: user.mustResetPassword,
      avatarUrl: user.avatarUrl,
      consignorId: user.consignorId,
      consigneeId: user.consigneeId,
    });

    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      data: {
        token,
        user: payload,
        mustResetPassword: payload.mustResetPassword,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. Google OAuth Sign-In. Verifies id_token against GOOGLE_CLIENT_ID.
authRouter.post('/google', rateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { credential } = googleAuthSchema.parse(req.body);

    if (!env.GOOGLE_CLIENT_ID) {
      return next(AppError.internal('Google Sign-In is not configured on this server.'));
    }

    let verifiedEmail: string | undefined;
    let verifiedName: string | undefined;
    let verifiedAvatar: string | undefined;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.email_verified) {
        return next(AppError.unauthorized('Google credential could not be verified.'));
      }
      verifiedEmail = payload.email.toLowerCase();
      verifiedName = payload.name;
      verifiedAvatar = payload.picture;
    } catch (verifyErr) {
      logger.warn({ err: verifyErr, msg: 'Google id_token verification failed' });
      return next(AppError.unauthorized('Google credential could not be verified.'));
    }

    if (mongoose.connection.readyState !== 1) {
      return next(AppError.internal('database unavailable'));
    }

    const user = await UserModel.findOne({ email: verifiedEmail });
    if (!user) {
      // No auto-provision. Deny access.
      return next(AppError.unauthorized('No account exists for this Google identity. Contact your administrator.'));
    }
    if (user.active === false || user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      return next(AppError.unauthorized('Account is not active. Contact your administrator.'));
    }

    // Refresh cached identity attributes only (never role/tenant).
    let dirty = false;
    if (verifiedName && verifiedName !== user.name) { user.name = verifiedName; dirty = true; }
    if (verifiedAvatar && verifiedAvatar !== user.avatarUrl) { user.avatarUrl = verifiedAvatar; dirty = true; }
    if (user.authProvider !== 'google') { user.authProvider = 'google'; dirty = true; }
    if (dirty) await user.save();

    const payload = buildTokenPayload({
      userId: user.userId,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      orgId: user.orgId,
      role: user.role,
      branches: user.branches,
      branchIds: user.branchIds,
      permissions: user.permissions,
      mustResetPassword: user.mustResetPassword,
      avatarUrl: user.avatarUrl,
      consignorId: user.consignorId,
      consigneeId: user.consigneeId,
    });

    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      message: `Signed in successfully as ${payload.name}`,
      data: {
        token,
        user: payload,
        mustResetPassword: payload.mustResetPassword,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. Current User Context
authRouter.get('/me', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const auth = parseAuthToken(req) ?? req.auth;
  if (!auth) {
    return next(AppError.unauthorized('Sign in to load your profile.'));
  }

  try {
    if (mongoose.connection.readyState === 1) {
      const user = await UserModel.findOne({ email: auth.email.toLowerCase() }).lean() as any;
      if (user) {
        return res.json({
          success: true,
          data: {
            ...auth,
            name: user.name,
            avatarUrl: user.avatarUrl,
            role: user.role,
            authProvider: user.authProvider,
            tenantId: user.tenantId,
            branches: user.branches,
            branchIds: user.branchIds,
            permissions: user.permissions,
            mustResetPassword: user.mustResetPassword ?? false,
          },
        });
      }
    }
  } catch {
    // fall through to token data
  }

  res.json({ success: true, data: auth });
});

// 4. Authenticated password reset — clears mustResetPassword.
authRouter.post('/reset-password', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const auth = req.auth ?? parseAuthToken(req);
    if (!auth) return next(AppError.unauthorized('Sign in to reset your password.'));

    const { currentPassword, newPassword } = resetPasswordSchema.parse(req.body);
    if (currentPassword === newPassword) {
      return next(AppError.badRequest('New password must differ from the current password.'));
    }

    const user = await UserModel.findOne({ email: auth.email.toLowerCase() });
    if (!user) return next(AppError.unauthorized('User not found.'));

    const passwordResult = await verifyStoredPassword(user.passwordHash, currentPassword, false);
    if (!passwordResult.valid) {
      return next(AppError.unauthorized('Current password is incorrect.'));
    }

    user.passwordHash = await hashPassword(newPassword);
    user.mustResetPassword = false;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated. You may continue.',
    });
  } catch (err) {
    next(err);
  }
});

/*
 * NOTE: /persona-switch has been removed in every environment.
 * NOTE: /reset-forced-password (unauthenticated forced-reset) has been removed;
 *       use POST /auth/reset-password once authenticated instead.
 */
