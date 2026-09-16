import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import {
  TenantModel,
  UserModel,
  RoleModel,
  AuditLogModel,
} from '../../db/models/index.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { v4 as uuidv4 } from 'uuid';

export const adminRouter = Router();

// ==========================================
// 1. TENANT MANAGEMENT (Super Admin Only)
// ==========================================
adminRouter.get('/tenants', requirePermission('read', 'tenants'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenants = await TenantModel.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: tenants, total: tenants.length });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/tenants', requirePermission('create', 'tenants'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = z.object({
      id: z.string().min(3),
      name: z.string().min(2),
      gstin: z.string().optional(),
      pan: z.string().optional(),
      stateCode: z.string().optional(),
      registeredAddress: z.string().optional(),
      branches: z.array(z.object({
        code: z.string(),
        name: z.string(),
        gstin: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        manager: z.string().optional(),
      })).default([]),
      modulesEnabled: z.array(z.string()).optional(),
    }).parse(req.body);

    const existing = await TenantModel.findOne({ id: body.id });
    if (existing) return next(new Error(`Tenant ${body.id} already exists`));

    const tenant = await TenantModel.create(body);

    await recordAudit({
      tenantId: body.id,
      module: 'tenants',
      resourceId: body.id,
      action: 'CREATE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: body,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: tenant, message: `Tenant ${body.name} created.` });
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/tenants/:id', requirePermission('update', 'tenants'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const updated = await TenantModel.findOneAndUpdate({ id: req.params.id }, { $set: req.body }, { new: true }).lean();
    if (!updated) return next(new Error('Tenant not found'));

    await recordAudit({
      tenantId: req.params.id,
      module: 'tenants',
      resourceId: req.params.id,
      action: 'UPDATE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: req.body,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. BRANCH MANAGEMENT
// ==========================================
adminRouter.get('/branches', requirePermission('read', 'branches'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : req.auth!.tenantId;
    const tenant: any = await TenantModel.findOne({ id: tenantId }).lean();
    const branches = tenant?.branches || [];
    res.json({ success: true, data: branches, total: branches.length });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/branches', requirePermission('create', 'branches'), async (req: AuthenticatedRequest, res: Response, next) => {
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

    const tenant = await TenantModel.findOne({ id: tenantId });
    if (!tenant) return next(new Error('Tenant not found'));

    tenant.branches.push(branch);
    await tenant.save();

    await recordAudit({
      tenantId,
      module: 'branches',
      resourceId: branch.code,
      action: 'CREATE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: branch,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: branch, message: `Branch ${branch.name} added.` });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. DYNAMIC ROLE MANAGEMENT
// ==========================================
adminRouter.get('/roles', requirePermission('read', 'roles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter = req.auth?.role === 'SUPER_ADMIN' ? {} : { $or: [{ tenantId: '*' }, { tenantId }] };
    const roles = await RoleModel.find(filter).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: roles, total: roles.length });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/roles', requirePermission('create', 'roles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = z.object({
      code: z.string().min(2).toUpperCase(),
      name: z.string().min(2),
      description: z.string().optional().default(''),
      permissions: z.array(z.string()).default([]),
      branchRestricted: z.boolean().default(false),
      allowedBranches: z.array(z.string()).optional(),
    }).parse(req.body);

    const id = `role_${uuidv4().slice(0, 8)}`;
    const role = await RoleModel.create({
      id,
      ...body,
      tenantId: req.auth?.role === 'SUPER_ADMIN' ? '*' : tenantId,
      isSystem: false,
    });

    await recordAudit({
      tenantId,
      module: 'roles',
      resourceId: id,
      action: 'CREATE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: body,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: role, message: `Role ${role.name} created.` });
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/roles/:id', requirePermission('update', 'roles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const updated = await RoleModel.findOneAndUpdate({ id: req.params.id }, { $set: req.body }, { new: true }).lean();
    if (!updated) return next(new Error('Role not found'));

    res.json({ success: true, data: updated, message: 'Role updated successfully.' });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/roles/:id', requirePermission('delete', 'roles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const role = await RoleModel.findOne({ id: req.params.id });
    if (!role) return next(new Error('Role not found'));
    if (role.isSystem) return res.status(400).json({ success: false, message: 'System built-in roles cannot be deleted' });

    await RoleModel.deleteOne({ id: req.params.id });
    res.json({ success: true, message: `Role ${role.name} deleted.` });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 4. USER MANAGEMENT & PASSWORD RESET
// ==========================================
adminRouter.get('/users', requirePermission('read', 'users'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = {};
    if (req.auth?.role !== 'SUPER_ADMIN') {
      filter.tenantId = tenantId;
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

adminRouter.post('/users', requirePermission('create', 'users'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = z.object({
      email: z.string().email(),
      name: z.string().min(2),
      username: z.string().optional(),
      role: z.string().default('OPERATIONS_MANAGER'),
      password: z.string().min(6).default('Marichi@123'),
      branches: z.array(z.string()).default(['br_01']),
      permissions: z.array(z.string()).default(['*']),
      consignorId: z.string().optional(),
      consigneeId: z.string().optional(),
      mustResetPassword: z.boolean().default(true),
    }).parse(req.body);

    const existing = await UserModel.findOne({ email: body.email.toLowerCase() });
    if (existing) return next(new Error('User with this email already exists'));

    const newUser = await UserModel.create({
      userId: `usr_${uuidv4().slice(0, 8)}`,
      email: body.email.toLowerCase(),
      name: body.name,
      username: body.username || body.email.split('@')[0],
      role: body.role,
      tenantId,
      orgId: 'org_marichi_logistics',
      branches: body.branches,
      permissions: body.permissions,
      passwordHash: body.password, // Plain for seeded demo compatibility or bcrypt hash
      mustResetPassword: body.mustResetPassword,
      consignorId: body.consignorId,
      consigneeId: body.consigneeId,
      authProvider: 'local',
      status: 'ACTIVE',
    });

    await recordAudit({
      tenantId,
      module: 'users',
      resourceId: newUser.userId,
      action: 'CREATE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: { email: body.email, role: body.role },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: newUser, message: `User ${newUser.name} created.` });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users/:id/reset-password', requirePermission('update', 'users'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { newPassword } = z.object({ newPassword: z.string().min(6).default('Admin@123') }).parse(req.body);

    const filter: any = { $or: [{ userId: req.params.id }, { email: req.params.id }] };
    if (req.auth?.role !== 'SUPER_ADMIN') filter.tenantId = tenantId;

    const user = await UserModel.findOneAndUpdate(
      filter,
      { $set: { passwordHash: newPassword, mustResetPassword: true } },
      { new: true }
    );
    if (!user) return next(new Error('User not found'));

    await recordAudit({
      tenantId,
      module: 'users',
      resourceId: user.userId,
      action: 'RESET_PASSWORD',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: { targetUser: user.email },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Password for ${user.email} has been reset. User will be forced to change it on next login.` });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. AUDIT LOG VIEWER
// ==========================================
adminRouter.get('/audit-logs', requirePermission('read', 'audit_logs'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = {};
    if (req.auth?.role !== 'SUPER_ADMIN') {
      filter.tenantId = tenantId;
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
