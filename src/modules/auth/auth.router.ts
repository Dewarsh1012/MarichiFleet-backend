import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env.js';
import { AppError } from '../../platform/errors.js';
import { AuthenticatedRequest, UserRole } from '../../platform/types.js';
import { UserModel } from '../../db/models/index.js';
import { logger } from '../../platform/logger.js';

export const authRouter = Router();

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);

const loginSchema = z.object({
  email: z.string().min(1), // can be email or username
  password: z.string().min(1).optional(),
  demoRole: z.string().optional(),
});

const googleAuthSchema = z.object({
  credential: z.string().optional(), // Google ID Token
  email: z.string().email().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().optional(),
  googleId: z.string().optional(),
  role: z.string().optional(),
});

// 1. Password / Demo Login (Supports Super Admin & Standard Users)
authRouter.post('/login', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { email: identifier, password, demoRole } = loginSchema.parse(req.body);
    const role = (demoRole || 'FLEET_OWNER') as UserRole;
    const defaultTenantId = 'tenant_delhi_01';

    let user: any = null;
    if (mongoose.connection.readyState === 1) {
      try {
        const cleanId = identifier.toLowerCase().trim();
        user = await UserModel.findOne({
          $or: [{ email: cleanId }, { username: cleanId }],
        });

        // If Super Admin seeded check
        if (!user && (cleanId === 'superadmin' || cleanId === 'superadmin@marichifleet.com')) {
          user = await UserModel.create({
            userId: 'usr_superadmin',
            username: 'superadmin',
            email: 'superadmin@marichifleet.com',
            name: 'Super Administrator',
            role: 'SUPER_ADMIN',
            tenantId: '*',
            orgId: 'org_marichi_global',
            branches: ['ALL'],
            permissions: ['*'],
            passwordHash: 'Admin@123',
            mustResetPassword: true,
            authProvider: 'local',
            status: 'ACTIVE',
          });
        } else if (!user) {
          user = await UserModel.create({
            userId: `usr_${uuidv4().slice(0, 8)}`,
            email: cleanId.includes('@') ? cleanId : `${cleanId}@marichifleet.com`,
            username: cleanId.includes('@') ? cleanId.split('@')[0] : cleanId,
            name: cleanId.split('@')[0].toUpperCase(),
            role,
            tenantId: defaultTenantId,
            orgId: 'org_marichi_logistics',
            branches: ['DL-Okhla', 'MH-Bhiwandi', 'KA-Peenya'],
            permissions: ['*'],
            authProvider: 'local',
            status: 'ACTIVE',
          });
        }
      } catch (dbErr) {
        logger.warn({ err: dbErr, msg: 'MongoDB operation note during login; proceeding with stateless auth token' });
      }
    }

    const payload: any = {
      userId: user?.userId || `usr_${uuidv4().slice(0, 8)}`,
      email: user?.email || (identifier.includes('@') ? identifier.toLowerCase() : `${identifier.toLowerCase()}@marichifleet.com`),
      username: user?.username || identifier.toLowerCase(),
      name: user?.name || identifier.split('@')[0].toUpperCase(),
      avatarUrl: user?.avatarUrl,
      tenantId: user?.tenantId || defaultTenantId,
      orgId: user?.orgId || 'org_marichi_logistics',
      role: (user?.role || role) as UserRole,
      branches: user?.branches || ['DL-Okhla', 'MH-Bhiwandi', 'KA-Peenya'],
      permissions: user?.permissions || ['*'],
      mustResetPassword: user?.mustResetPassword ?? false,
      consignorId: user?.consignorId,
      consigneeId: user?.consigneeId,
    };

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

// 1.1 Force Password Reset
authRouter.post('/reset-forced-password', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { email, oldPassword, newPassword } = z.object({
      email: z.string().min(1),
      oldPassword: z.string().optional(),
      newPassword: z.string().min(6),
    }).parse(req.body);

    const clean = email.toLowerCase().trim();
    const user = await UserModel.findOne({
      $or: [{ email: clean }, { username: clean }],
    });

    if (!user) return next(new Error('User not found'));

    user.passwordHash = newPassword;
    user.mustResetPassword = false;
    await user.save();

    res.json({ success: true, message: 'Password has been successfully reset. You may now continue.' });
  } catch (err) {
    next(err);
  }
});

// 2. Google OAuth Sign-In (Google Identity Services / Token Exchange)
authRouter.post('/google', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = googleAuthSchema.parse(req.body);
    let verifiedEmail = body.email;
    let verifiedName = body.name;
    let verifiedAvatar = body.avatarUrl;
    let verifiedGoogleId = body.googleId;

    // If Google ID token credential provided, verify with Google
    if (body.credential) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: body.credential,
          audience: env.GOOGLE_CLIENT_ID || undefined,
        });
        const payload = ticket.getPayload();
        if (payload) {
          verifiedEmail = payload.email;
          verifiedName = payload.name;
          verifiedAvatar = payload.picture;
          verifiedGoogleId = payload.sub;
        }
      } catch (verifyErr) {
        logger.warn({ err: verifyErr, msg: 'Google verifyIdToken note (falling back to credential payload)' });
        // Fallback: decode JWT payload without network if testing in dev
        try {
          const decoded: any = jwt.decode(body.credential);
          if (decoded && decoded.email) {
            verifiedEmail = decoded.email;
            verifiedName = decoded.name || decoded.email.split('@')[0];
            verifiedAvatar = decoded.picture;
            verifiedGoogleId = decoded.sub;
          }
        } catch (decodeErr) {
          logger.warn({ err: decodeErr, msg: 'JWT decode of credential failed' });
        }
      }
    }

    if (!verifiedEmail) {
      return next(AppError.badRequest('Unable to verify Google authentication payload. Email is required.'));
    }

    const tenantId = 'tenant_delhi_01';
    const role: UserRole = (body.role as UserRole) || 'FLEET_OWNER';

    // Find or create in MongoDB if connected
    let user: any = null;
    if (mongoose.connection.readyState === 1) {
      try {
        user = await UserModel.findOne({ email: verifiedEmail.toLowerCase() });

        if (user) {
          user.name = verifiedName || user.name;
          user.avatarUrl = verifiedAvatar || user.avatarUrl;
          user.googleId = verifiedGoogleId || user.googleId;
          user.authProvider = 'google';
          await user.save();
          logger.info(` Google user logged in: ${user.email} (MongoDB ID: ${user._id})`);
        } else {
          user = await UserModel.create({
            userId: `usr_g_${uuidv4().slice(0, 8)}`,
            email: verifiedEmail.toLowerCase(),
            name: verifiedName || verifiedEmail.split('@')[0],
            avatarUrl: verifiedAvatar,
            googleId: verifiedGoogleId,
            authProvider: 'google',
            role,
            tenantId,
            orgId: 'org_marichi_logistics',
            branches: ['DL-Okhla', 'MH-Bhiwandi', 'KA-Peenya'],
            permissions: ['*'],
          });
          logger.info(` Created new Google user in MongoDB: ${user.email} (ID: ${user.userId})`);
        }
      } catch (dbErr) {
        logger.warn({ err: dbErr, msg: 'MongoDB operation note during Google auth; proceeding with stateless auth token' });
      }
    }

    const authPayload = {
      userId: user?.userId || `usr_g_${(verifiedGoogleId || uuidv4()).slice(0, 8)}`,
      email: (user?.email || verifiedEmail).toLowerCase(),
      name: user?.name || verifiedName || verifiedEmail.split('@')[0],
      avatarUrl: user?.avatarUrl || verifiedAvatar,
      tenantId: user?.tenantId || tenantId,
      orgId: user?.orgId || 'org_marichi_logistics',
      role: (user?.role || role) as UserRole,
      branches: user?.branches || ['DL-Okhla', 'MH-Bhiwandi', 'KA-Peenya'],
      permissions: user?.permissions || ['*'],
      authProvider: 'google',
    };

    const token = jwt.sign(authPayload, env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: `Signed in successfully with Google as ${authPayload.name}`,
      data: {
        token,
        user: authPayload,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. Current User Context
authRouter.get('/me', async (req: AuthenticatedRequest, res: Response, next) => {
  if (!req.auth) {
    return next(AppError.unauthorized());
  }

  // Fetch fresh user from MongoDB
  try {
    const user = await UserModel.findOne({ email: req.auth.email.toLowerCase() });
    if (user) {
      return res.json({
        success: true,
        data: {
          ...req.auth,
          name: user.name,
          avatarUrl: user.avatarUrl,
          role: user.role,
          authProvider: user.authProvider,
        },
      });
    }
  } catch (e) {
    // fallback
  }

  res.json({
    success: true,
    data: req.auth,
  });
});

// 4. Persona Switcher
authRouter.post('/persona-switch', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { role } = z.object({ role: z.string() }).parse(req.body);
    const tenantId = req.auth?.tenantId || 'tenant_delhi_01';

    const payload = {
      userId: `usr_${role.toLowerCase()}_01`,
      email: `${role.toLowerCase()}@marichifleet.com`,
      name: `${role} Active User`,
      tenantId,
      orgId: 'org_marichi_logistics',
      role: role as UserRole,
      branches: ['DL-Okhla', 'MH-Bhiwandi'],
      permissions: ['*'],
    };

    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      data: {
        token,
        user: payload,
      },
    });
  } catch (err) {
    next(err);
  }
});
