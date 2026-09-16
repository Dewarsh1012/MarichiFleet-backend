import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { ConsigneeModel } from '../../db/models/index.js';
import { eventBus } from '../../platform/events/eventBus.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { v4 as uuidv4 } from 'uuid';

export const consigneesRouter = Router();

const createConsigneeSchema = z.object({
  companyName: z.string().min(2),
  contactPerson: z.string().min(2),
  mobile: z.string().min(7),
  email: z.string().email(),
  branchId: z.string().default('br_01'),
  gstVatNumber: z.string().optional(),
  address: z.string().min(3),
  city: z.string().min(2),
  state: z.string().min(2),
  country: z.string().default('India'),
  postalCode: z.string().min(3),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).default('ACTIVE'),
  // International Fields
  importerCode: z.string().optional(),
  vatNumber: z.string().optional(),
  eoriNumber: z.string().optional(),
  customsRegistrationNumber: z.string().optional(),
});

// 1. List Consignees
consigneesRouter.get('/', requirePermission('read', 'consignees'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = {};
    if (req.auth?.role !== 'SUPER_ADMIN') {
      filter.tenantId = tenantId;
    }

    if (req.query.status) filter.status = req.query.status;
    if (req.query.branchId) filter.branchId = req.query.branchId;
    if (req.query.search) {
      const q = new RegExp(String(req.query.search), 'i');
      filter.$or = [{ companyName: q }, { code: q }, { contactPerson: q }, { mobile: q }, { email: q }, { gstVatNumber: q }];
    }

    const consignees = await ConsigneeModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: consignees, total: consignees.length });
  } catch (err) {
    next(err);
  }
});

// 2. Get Single Consignee
consigneesRouter.get('/:id', requirePermission('read', 'consignees'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { id: req.params.id };
    if (req.auth?.role !== 'SUPER_ADMIN') filter.tenantId = tenantId;

    const consignee = await ConsigneeModel.findOne(filter).lean();
    if (!consignee) return next(new Error('Consignee not found'));

    res.json({ success: true, data: consignee });
  } catch (err) {
    next(err);
  }
});

// 3. Create Consignee
consigneesRouter.post('/', requirePermission('create', 'consignees'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createConsigneeSchema.parse(req.body);

    const count = await ConsigneeModel.countDocuments({ tenantId });
    const code = `CNE-${String(count + 1).padStart(4, '0')}`;
    const id = `cne_${uuidv4().slice(0, 8)}`;

    const newConsignee = await ConsigneeModel.create({
      id,
      code,
      tenantId,
      ...body,
      createdBy: req.auth?.email || 'admin',
    });

    await eventBus.publish('consignee.created', {
      tenantId,
      aggregateId: id,
      aggregateType: 'consignee',
      payload: newConsignee,
      actor: {
        userId: req.auth?.userId,
        name: req.auth?.name,
        role: req.auth?.role,
      },
    });

    await recordAudit({
      tenantId,
      module: 'consignees',
      resourceId: id,
      action: 'CREATE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: { code, companyName: body.companyName },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: newConsignee, message: `Consignee ${code} created successfully.` });
  } catch (err) {
    next(err);
  }
});

// 4. Update Consignee
consigneesRouter.put('/:id', requirePermission('update', 'consignees'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { id: req.params.id };
    if (req.auth?.role !== 'SUPER_ADMIN') filter.tenantId = tenantId;

    const updated: any = await ConsigneeModel.findOneAndUpdate(filter, { $set: req.body }, { new: true }).lean();
    if (!updated) return next(new Error('Consignee not found'));

    await eventBus.publish('consignee.updated', {
      tenantId,
      aggregateId: updated.id,
      aggregateType: 'consignee',
      payload: updated,
      actor: {
        userId: req.auth?.userId,
        name: req.auth?.name,
        role: req.auth?.role,
      },
    });

    await recordAudit({
      tenantId,
      module: 'consignees',
      resourceId: updated.id,
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

    res.json({ success: true, data: updated, message: 'Consignee updated.' });
  } catch (err) {
    next(err);
  }
});

// 5. Delete Consignee
consigneesRouter.delete('/:id', requirePermission('delete', 'consignees'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { id: req.params.id };
    if (req.auth?.role !== 'SUPER_ADMIN') filter.tenantId = tenantId;

    const existing = await ConsigneeModel.findOne(filter);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Consignee not found' });
    }

    await ConsigneeModel.deleteOne(filter);

    await eventBus.publish('consignee.deleted', {
      tenantId,
      aggregateId: existing.id,
      aggregateType: 'consignee',
      payload: { id: existing.id, code: existing.code, companyName: existing.companyName },
      actor: {
        userId: req.auth?.userId,
        name: req.auth?.name,
        role: req.auth?.role,
      },
    });

    await recordAudit({
      tenantId,
      module: 'consignees',
      resourceId: existing.id,
      action: 'DELETE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: { code: existing.code, companyName: existing.companyName },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Consignee ${existing.companyName} deleted successfully.` });
  } catch (err) {
    next(err);
  }
});

