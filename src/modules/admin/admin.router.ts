/**
 * Admin router.
 *
 * Endpoint groups:
 *
 *   Platform (role=platform_admin) only:
 *     POST   /admin/tenants                     — create Transport Owner tenant + tenant_owner user
 *     GET    /admin/tenants                     — list all tenants
 *     PATCH  /admin/tenants/:id                 — update tenant profile / currency settings
 *     DELETE /admin/tenants/:id                 — soft delete (status=SUSPENDED)
 *
 *   Tenant Owner (role=tenant_owner) and Platform Admin:
 *     GET    /admin/roles                       — list roles in tenant
 *     POST   /admin/roles                       — create role scoped to caller tenant
 *     PATCH  /admin/roles/:id                   — update role (no permission escalation)
 *     DELETE /admin/roles/:id                   — soft delete role
 *     GET    /admin/users                       — list users in tenant
 *     POST   /admin/users                       — create user with server-generated temp password
 *     PATCH  /admin/users/:id                   — update role/branchScope/permissions/active
 *     POST   /admin/users/:id/reset-password    — issue a new temporary password
 *
 *   Legacy branch endpoints and the audit-logs viewer are retained for
 *   the existing tenant admin surface.
 */
import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../../platform/types.js';
import { AppError } from '../../platform/errors.js';
import {
  TenantModel,
  UserModel,
  RoleModel,
  AuditLogModel,
} from '../../db/models/index.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';

export const adminRouter = Router();

const PASSWORD_HASH_ROUNDS = 12;
const PROTECTED_PERMISSIONS = new Set(['admin:tenants', 'platform:admin', '*']);

// ------------------------------ helpers ------------------------------

function requirePlatformAdmin(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  if (!req.auth) return next(AppError.unauthorized('Sign in required.'));
  if (req.auth.role !== 'platform_admin' && req.auth.role !== 'SUPER_ADMIN') {
    return next(AppError.forbidden('Platform administrator privileges required.'));
  }
  next();
}

function requireTenantAdminOrPlatform(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  if (!req.auth) return next(AppError.unauthorized('Sign in required.'));
  const role = req.auth.role;
  if (role === 'platform_admin' || role === 'SUPER_ADMIN' || role === 'tenant_owner' || role === 'ADMIN') {
    return next();
  }
  next(AppError.forbidden('Tenant owner or platform administrator privileges required.'));
}

function generateTempPassword(): string {
  // 16 chars, mixed alphabet, always includes upper, lower, digit, symbol.
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(0, set.length)];
  const rest = Array.from({ length: 12 }, () => pick(all));
  const seed = [pick(upper), pick(lower), pick(digits), pick(symbols), ...rest];
  // Simple Fisher-Yates using crypto.randomInt.
  for (let i = seed.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [seed[i], seed[j]] = [seed[j], seed[i]];
  }
  return seed.join('');
}

async function assertPermissionsAllowed(
  actor: AuthenticatedRequest['auth'],
  requested: string[] | undefined,
): Promise<void> {
  if (!requested || requested.length === 0) return;
  const isPlatform = actor?.role === 'platform_admin' || actor?.role === 'SUPER_ADMIN';
  if (isPlatform) return;

  for (const perm of requested) {
    if (PROTECTED_PERMISSIONS.has(perm)) {
      throw AppError.forbidden(`Permission "${perm}" cannot be granted by a tenant administrator.`);
    }
  }
  // A tenant owner cannot grant a permission it does not itself hold, unless it
  // has the "*" or "<resource>:*" wildcard.
  const held = new Set(actor?.permissions ?? []);
  if (held.has('*')) return;
  for (const perm of requested) {
    if (held.has(perm)) continue;
    const [resource] = perm.split(':');
    if (held.has(`${resource}:*`)) continue;
    // tenant_owner role implicitly has admin:users / admin:roles inside its tenant
    if (actor?.role === 'tenant_owner' && (perm === 'admin:users' || perm === 'admin:roles')) continue;
    throw AppError.forbidden(`You cannot grant permission "${perm}" that you do not hold.`);
  }
}

function scopedTenantId(req: AuthenticatedRequest, requestedTenantId?: string): string {
  const role = req.auth?.role;
  const isPlatform = role === 'platform_admin' || role === 'SUPER_ADMIN';
  if (isPlatform && requestedTenantId) return requestedTenantId;
  return req.auth!.tenantId;
}

// ============================ TENANTS ============================

const tenantCreateSchema = z.object({
  name: z.string().min(2).max(200),
  country: z.string().min(2).max(80).default('India'),
  baseCurrency: z.string().length(3).default('INR'),
  displayCurrencies: z.array(z.string().length(3)).min(1).optional(),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(2).max(200),
});

adminRouter.post('/tenants', requirePlatformAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const body = tenantCreateSchema.parse(req.body);
    const ownerEmail = body.ownerEmail.toLowerCase().trim();

    // Idempotent by tenant name + owner email.
    const existingTenant: any = await TenantModel.findOne({ name: body.name }).lean();
    const existingOwner: any = await UserModel.findOne({ email: ownerEmail }).lean();
    if (existingTenant && existingOwner && existingOwner.tenantId === existingTenant.id) {
      return res.status(200).json({
        success: true,
        idempotent: true,
        message: 'Tenant and owner already exist.',
        data: { tenant: existingTenant, owner: { userId: existingOwner.userId, email: existingOwner.email } },
      });
    }
    if (existingOwner && (!existingTenant || existingOwner.tenantId !== existingTenant.id)) {
      return next(AppError.conflict('A user with this owner email already exists.'));
    }
    if (existingTenant && !existingOwner) {
      return next(AppError.conflict(`Tenant "${body.name}" already exists.`));
    }

    const tenantId = `tnt_${uuidv4().slice(0, 10)}`;
    const displayCurrencies = body.displayCurrencies ?? Array.from(new Set([body.baseCurrency, 'USD', 'AED', 'ZMW']));
    const tenant = await TenantModel.create({
      id: tenantId,
      name: body.name,
      branches: [],
      settings: {
        country: body.country,
        baseCurrency: body.baseCurrency.toUpperCase(),
        displayCurrencies: displayCurrencies.map((c) => c.toUpperCase()),
        autoConvertReports: true,
      },
      status: 'ACTIVE',
    });

    const tempPassword = generateTempPassword();
    const owner = await UserModel.create({
      userId: `usr_${uuidv4().slice(0, 8)}`,
      email: ownerEmail,
      username: ownerEmail.split('@')[0],
      name: body.ownerName,
      role: 'tenant_owner',
      tenantId,
      orgId: tenantId,
      branches: [],
      branchIds: [],
      permissions: ['admin:users', 'admin:roles'],
      active: true,
      passwordHash: await bcrypt.hash(tempPassword, PASSWORD_HASH_ROUNDS),
      mustResetPassword: true,
      authProvider: 'local',
      status: 'ACTIVE',
    });

    await recordAudit({
      tenantId,
      module: 'tenants',
      resourceId: tenantId,
      action: 'CREATE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: { name: body.name, ownerEmail, country: body.country, baseCurrency: body.baseCurrency },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: `Tenant "${tenant.name}" created. The temporary owner password is returned once — deliver it securely.`,
      data: {
        tenant,
        owner: {
          userId: owner.userId,
          email: owner.email,
          name: owner.name,
          role: owner.role,
          tenantId: owner.tenantId,
          mustResetPassword: true,
        },
        temporaryPassword: tempPassword,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/tenants', requirePlatformAdmin, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenants = await TenantModel.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: tenants, total: tenants.length });
  } catch (err) {
    next(err);
  }
});

const tenantUpdateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  country: z.string().min(2).max(80).optional(),
  baseCurrency: z.string().length(3).optional(),
  displayCurrencies: z.array(z.string().length(3)).optional(),
  autoConvertReports: z.boolean().optional(),
  registeredAddress: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

adminRouter.patch('/tenants/:id', requirePlatformAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const body = tenantUpdateSchema.parse(req.body);
    const tenant: any = await TenantModel.findOne({ id: req.params.id });
    if (!tenant) return next(AppError.notFound('Tenant', req.params.id));

    if (body.name) tenant.name = body.name;
    if (body.registeredAddress !== undefined) tenant.registeredAddress = body.registeredAddress;
    if (body.gstin !== undefined) tenant.gstin = body.gstin;
    if (body.pan !== undefined) tenant.pan = body.pan;
    if (body.status) tenant.status = body.status;

    const settings = { ...(tenant.settings || {}) };
    if (body.country) settings.country = body.country;
    if (body.baseCurrency) settings.baseCurrency = body.baseCurrency.toUpperCase();
    if (body.displayCurrencies) settings.displayCurrencies = body.displayCurrencies.map((c) => c.toUpperCase());
    if (typeof body.autoConvertReports === 'boolean') settings.autoConvertReports = body.autoConvertReports;
    tenant.settings = settings;
    tenant.markModified('settings');
    await tenant.save();

    await recordAudit({
      tenantId: tenant.id,
      module: 'tenants',
      resourceId: tenant.id,
      action: 'UPDATE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: body,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/tenants/:id', requirePlatformAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenant: any = await TenantModel.findOneAndUpdate(
      { id: req.params.id },
      { $set: { status: 'SUSPENDED' } },
      { new: true },
    ).lean();
    if (!tenant) return next(AppError.notFound('Tenant', req.params.id));

    await recordAudit({
      tenantId: tenant.id,
      module: 'tenants',
      resourceId: tenant.id,
      action: 'SUSPEND',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: { previousStatus: tenant.status },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Tenant "${tenant.name}" suspended.`, data: tenant });
  } catch (err) {
    next(err);
  }
});

// ============================ BRANCHES (legacy compat) ============================

adminRouter.get('/branches', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = scopedTenantId(req, req.query.tenantId ? String(req.query.tenantId) : undefined);
    const tenant: any = await TenantModel.findOne({ id: tenantId }).lean();
    const branches = tenant?.branches || [];
    res.json({ success: true, data: branches, total: branches.length });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/branches', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.auth!.tenantId;
    const branch = z.object({
      code: z.string().min(2),
      name: z.string().min(2),
      gstin: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      manager: z.string().optional(),
    }).parse(req.body);

    const tenant: any = await TenantModel.findOne({ id: tenantId });
    if (!tenant) return next(AppError.notFound('Tenant', tenantId));

    tenant.branches = [...(tenant.branches ?? []), branch];
    await tenant.save();

    await recordAudit({
      tenantId,
      module: 'branches',
      resourceId: branch.code,
      action: 'CREATE',
      actor: { userId: req.auth!.userId, email: req.auth!.email, name: req.auth!.name, role: req.auth!.role },
      details: branch,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: branch, message: `Branch ${branch.name} added.` });
  } catch (err) {
    next(err);
  }
});

// ============================ ROLES ============================

const roleCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).default(''),
  permissions: z.array(z.string().min(1)).default([]),
  branchRestricted: z.boolean().optional(),
  allowedBranches: z.array(z.string()).optional(),
});

adminRouter.get('/roles', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = scopedTenantId(req);
    const filter: any = { deletedAt: { $exists: false } };
    if (req.auth?.role !== 'platform_admin' && req.auth?.role !== 'SUPER_ADMIN') {
      filter.$or = [{ tenantId }, { tenantId: '*' }];
    }
    const roles = await RoleModel.find(filter).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: roles, total: roles.length });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/roles', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const body = roleCreateSchema.parse(req.body);
    await assertPermissionsAllowed(req.auth, body.permissions);

    const tenantId = req.auth!.tenantId;
    const existing = await RoleModel.findOne({ tenantId, name: body.name });
    if (existing) return next(AppError.conflict(`Role "${body.name}" already exists.`));

    const id = `role_${uuidv4().slice(0, 8)}`;
    const role = await RoleModel.create({
      id,
      name: body.name,
      description: body.description ?? '',
      permissions: body.permissions,
      tenantId,
      isSystem: false,
      branchRestricted: body.branchRestricted ?? false,
      allowedBranches: body.allowedBranches ?? [],
    });

    await recordAudit({
      tenantId,
      module: 'roles',
      resourceId: id,
      action: 'CREATE',
      actor: { userId: req.auth!.userId, email: req.auth!.email, name: req.auth!.name, role: req.auth!.role },
      details: { name: body.name, permissions: body.permissions },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: role, message: `Role ${role.name} created.` });
  } catch (err) {
    next(err);
  }
});

const roleUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(1)).optional(),
  branchRestricted: z.boolean().optional(),
  allowedBranches: z.array(z.string()).optional(),
});

adminRouter.patch('/roles/:id', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const body = roleUpdateSchema.parse(req.body);
    if (body.permissions) await assertPermissionsAllowed(req.auth, body.permissions);

    const role: any = await RoleModel.findOne({ id: req.params.id });
    if (!role || role.deletedAt) return next(AppError.notFound('Role', req.params.id));

    const isPlatform = req.auth?.role === 'platform_admin' || req.auth?.role === 'SUPER_ADMIN';
    if (!isPlatform && role.tenantId !== req.auth!.tenantId) {
      return next(AppError.forbidden('Role belongs to a different tenant.'));
    }
    if (role.isSystem && !isPlatform) {
      return next(AppError.forbidden('System roles cannot be modified.'));
    }

    if (body.name) role.name = body.name;
    if (body.description !== undefined) role.description = body.description;
    if (body.permissions) role.permissions = body.permissions;
    if (body.branchRestricted !== undefined) role.branchRestricted = body.branchRestricted;
    if (body.allowedBranches) role.allowedBranches = body.allowedBranches;
    await role.save();

    await recordAudit({
      tenantId: role.tenantId,
      module: 'roles',
      resourceId: role.id,
      action: 'UPDATE',
      actor: { userId: req.auth!.userId, email: req.auth!.email, name: req.auth!.name, role: req.auth!.role },
      details: body,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/roles/:id', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const role: any = await RoleModel.findOne({ id: req.params.id });
    if (!role || role.deletedAt) return next(AppError.notFound('Role', req.params.id));
    const isPlatform = req.auth?.role === 'platform_admin' || req.auth?.role === 'SUPER_ADMIN';
    if (!isPlatform && role.tenantId !== req.auth!.tenantId) {
      return next(AppError.forbidden('Role belongs to a different tenant.'));
    }
    if (role.isSystem) return next(AppError.forbidden('System roles cannot be deleted.'));

    role.deletedAt = new Date();
    await role.save();

    await recordAudit({
      tenantId: role.tenantId,
      module: 'roles',
      resourceId: role.id,
      action: 'DELETE',
      actor: { userId: req.auth!.userId, email: req.auth!.email, name: req.auth!.name, role: req.auth!.role },
      details: { name: role.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Role ${role.name} deleted.` });
  } catch (err) {
    next(err);
  }
});

// ============================ USERS ============================

const userCreateSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  roleId: z.string().min(1).optional(),
  branchIds: z.array(z.string()).default([]),
  modulePermissions: z.array(z.string().min(1)).default([]),
});

adminRouter.get('/users', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: any = {};
    const isPlatform = req.auth?.role === 'platform_admin' || req.auth?.role === 'SUPER_ADMIN';
    if (!isPlatform) {
      filter.tenantId = req.auth!.tenantId;
    } else if (req.query.tenantId) {
      filter.tenantId = String(req.query.tenantId);
    }

    if (req.query.role) filter.role = req.query.role;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const q = new RegExp(String(req.query.search), 'i');
      filter.$or = [{ name: q }, { email: q }, { username: q }];
    }

    const users = await UserModel.find(filter).sort({ createdAt: -1 }).select('-passwordHash').lean();
    res.json({ success: true, data: users, total: users.length });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const body = userCreateSchema.parse(req.body);
    await assertPermissionsAllowed(req.auth, body.modulePermissions);

    const tenantId = req.auth!.tenantId;
    const email = body.email.toLowerCase().trim();

    const existing = await UserModel.findOne({ email });
    if (existing) return next(AppError.conflict('A user with this email already exists.'));

    let roleName = 'user';
    if (body.roleId) {
      const role: any = await RoleModel.findOne({ id: body.roleId });
      if (!role || role.deletedAt) return next(AppError.notFound('Role', body.roleId));
      const isPlatform = req.auth?.role === 'platform_admin' || req.auth?.role === 'SUPER_ADMIN';
      if (!isPlatform && role.tenantId !== tenantId && role.tenantId !== '*') {
        return next(AppError.forbidden('Role belongs to a different tenant.'));
      }
      roleName = role.name;
    }

    const tempPassword = generateTempPassword();
    const user = await UserModel.create({
      userId: `usr_${uuidv4().slice(0, 8)}`,
      email,
      username: email.split('@')[0],
      name: body.name,
      phone: body.phone,
      role: roleName,
      roleId: body.roleId,
      tenantId,
      orgId: tenantId,
      branches: body.branchIds,
      branchIds: body.branchIds,
      permissions: body.modulePermissions,
      active: true,
      passwordHash: await bcrypt.hash(tempPassword, PASSWORD_HASH_ROUNDS),
      mustResetPassword: true,
      authProvider: 'local',
      status: 'ACTIVE',
    });

    await recordAudit({
      tenantId,
      module: 'users',
      resourceId: user.userId,
      action: 'CREATE',
      actor: { userId: req.auth!.userId, email: req.auth!.email, name: req.auth!.name, role: req.auth!.role },
      details: { email, roleId: body.roleId, modulePermissions: body.modulePermissions },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: `User ${user.name} created. Deliver the temporary password securely — it is shown only once.`,
      data: {
        user: {
          userId: user.userId,
          email: user.email,
          name: user.name,
          role: user.role,
          roleId: user.roleId,
          tenantId: user.tenantId,
          branchIds: user.branchIds,
          permissions: user.permissions,
          mustResetPassword: true,
        },
        temporaryPassword: tempPassword,
      },
    });
  } catch (err) {
    next(err);
  }
});

const userUpdateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  phone: z.string().max(40).optional(),
  roleId: z.string().min(1).optional(),
  branchIds: z.array(z.string()).optional(),
  modulePermissions: z.array(z.string().min(1)).optional(),
  active: z.boolean().optional(),
});

adminRouter.patch('/users/:id', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const body = userUpdateSchema.parse(req.body);
    if (body.modulePermissions) await assertPermissionsAllowed(req.auth, body.modulePermissions);

    const filter: any = { $or: [{ userId: req.params.id }, { email: req.params.id.toLowerCase() }] };
    const user: any = await UserModel.findOne(filter);
    if (!user) return next(AppError.notFound('User', req.params.id));

    const isPlatform = req.auth?.role === 'platform_admin' || req.auth?.role === 'SUPER_ADMIN';
    if (!isPlatform && user.tenantId !== req.auth!.tenantId) {
      return next(AppError.forbidden('User belongs to a different tenant.'));
    }

    if (body.name !== undefined) user.name = body.name;
    if (body.phone !== undefined) user.phone = body.phone;
    if (body.branchIds) {
      user.branchIds = body.branchIds;
      user.branches = body.branchIds;
    }
    if (body.modulePermissions) user.permissions = body.modulePermissions;
    if (typeof body.active === 'boolean') {
      user.active = body.active;
      user.status = body.active ? 'ACTIVE' : 'SUSPENDED';
    }
    if (body.roleId) {
      const role: any = await RoleModel.findOne({ id: body.roleId });
      if (!role || role.deletedAt) return next(AppError.notFound('Role', body.roleId));
      if (!isPlatform && role.tenantId !== req.auth!.tenantId && role.tenantId !== '*') {
        return next(AppError.forbidden('Role belongs to a different tenant.'));
      }
      user.roleId = role.id;
      user.role = role.name;
    }
    await user.save();

    await recordAudit({
      tenantId: user.tenantId,
      module: 'users',
      resourceId: user.userId,
      action: 'UPDATE',
      actor: { userId: req.auth!.userId, email: req.auth!.email, name: req.auth!.name, role: req.auth!.role },
      details: body,
      ipAddress: req.ip,
    });

    const { passwordHash: _pw, ...safe } = user.toObject();
    res.json({ success: true, data: safe });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users/:id/reset-password', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: any = { $or: [{ userId: req.params.id }, { email: req.params.id.toLowerCase() }] };
    const user: any = await UserModel.findOne(filter);
    if (!user) return next(AppError.notFound('User', req.params.id));

    const isPlatform = req.auth?.role === 'platform_admin' || req.auth?.role === 'SUPER_ADMIN';
    if (!isPlatform && user.tenantId !== req.auth!.tenantId) {
      return next(AppError.forbidden('User belongs to a different tenant.'));
    }

    const tempPassword = generateTempPassword();
    user.passwordHash = await bcrypt.hash(tempPassword, PASSWORD_HASH_ROUNDS);
    user.mustResetPassword = true;
    await user.save();

    await recordAudit({
      tenantId: user.tenantId,
      module: 'users',
      resourceId: user.userId,
      action: 'RESET_PASSWORD',
      actor: { userId: req.auth!.userId, email: req.auth!.email, name: req.auth!.name, role: req.auth!.role },
      details: { targetUser: user.email },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: `Temporary password issued for ${user.email}. It is shown only once and must be reset on next login.`,
      data: { userId: user.userId, email: user.email, temporaryPassword: tempPassword, mustResetPassword: true },
    });
  } catch (err) {
    next(err);
  }
});

// ============================ AUDIT LOGS ============================

adminRouter.get('/audit-logs', requireTenantAdminOrPlatform, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: any = {};
    const isPlatform = req.auth?.role === 'platform_admin' || req.auth?.role === 'SUPER_ADMIN';
    if (!isPlatform) {
      filter.tenantId = req.auth!.tenantId;
    }
    if (req.query.module) filter.module = req.query.module;
    if (req.query.action) filter.action = new RegExp(String(req.query.action), 'i');
    if (req.query.actor) filter['actor.email'] = new RegExp(String(req.query.actor), 'i');

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await AuditLogModel.find(filter).sort({ timestamp: -1 }).limit(limit).lean();

    res.json({ success: true, data: logs, total: logs.length });
  } catch (err) {
    next(err);
  }
});
