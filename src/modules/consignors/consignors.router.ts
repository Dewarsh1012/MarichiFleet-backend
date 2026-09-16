import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { ConsignorModel, ConsignorContactModel, ConsignorDocumentModel } from '../../db/models/index.js';
import { eventBus } from '../../platform/events/eventBus.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { v4 as uuidv4 } from 'uuid';

export const consignorsRouter = Router();

const createConsignorSchema = z.object({
  companyName: z.string().min(2),
  tradeName: z.string().optional(),
  contactPerson: z.string().min(2),
  mobile: z.string().min(7),
  alternateMobile: z.string().optional(),
  email: z.string().email(),
  branchId: z.string().default('br_01'),
  gstNumber: z.string().optional(),
  panNumber: z.string().optional(),
  addressLine1: z.string().min(3),
  addressLine2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  country: z.string().default('India'),
  postalCode: z.string().min(3),
  industryType: z.string().optional(),
  customerCategory: z.string().default('STANDARD'),
  creditLimit: z.number().nonnegative().default(500000),
  paymentTerms: z.string().default('NET_30'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).default('ACTIVE'),
  // International Fields
  iecNumber: z.string().optional(),
  eoriNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  exportLicenseNumber: z.string().optional(),
  countryOfOrigin: z.string().optional(),
});

// 1. List Consignors
consignorsRouter.get('/', requirePermission('read', 'consignors'), async (req: AuthenticatedRequest, res: Response, next) => {
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
      filter.$or = [{ companyName: q }, { code: q }, { contactPerson: q }, { mobile: q }, { email: q }, { gstNumber: q }];
    }

    const consignors = await ConsignorModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: consignors, total: consignors.length });
  } catch (err) {
    next(err);
  }
});

// 2. Get Single Consignor
consignorsRouter.get('/:id', requirePermission('read', 'consignors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { id: req.params.id };
    if (req.auth?.role !== 'SUPER_ADMIN') filter.tenantId = tenantId;

    const consignor: any = await ConsignorModel.findOne(filter).lean();
    if (!consignor) return next(new Error('Consignor not found'));

    const [contacts, documents] = await Promise.all([
      ConsignorContactModel.find({ consignorId: consignor.id }).lean(),
      ConsignorDocumentModel.find({ consignorId: consignor.id }).lean(),
    ]);

    res.json({ success: true, data: { ...consignor, contacts, documents } });
  } catch (err) {
    next(err);
  }
});

// 3. Create Consignor
consignorsRouter.post('/', requirePermission('create', 'consignors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createConsignorSchema.parse(req.body);

    const count = await ConsignorModel.countDocuments({ tenantId });
    const code = `CSG-${String(count + 1).padStart(4, '0')}`;
    const id = `csg_${uuidv4().slice(0, 8)}`;

    const newConsignor = await ConsignorModel.create({
      id,
      code,
      tenantId,
      ...body,
      createdBy: req.auth?.email || 'admin',
    });

    // Publish domain event
    await eventBus.publish('consignor.created', {
      tenantId,
      aggregateId: id,
      aggregateType: 'consignor',
      payload: newConsignor,
      actor: {
        userId: req.auth?.userId,
        name: req.auth?.name,
        role: req.auth?.role,
      },
    });

    // Record audit log
    await recordAudit({
      tenantId,
      module: 'consignors',
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

    res.status(201).json({ success: true, data: newConsignor, message: `Consignor ${code} created successfully.` });
  } catch (err) {
    next(err);
  }
});

// 4. Update Consignor
consignorsRouter.put('/:id', requirePermission('update', 'consignors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { id: req.params.id };
    if (req.auth?.role !== 'SUPER_ADMIN') filter.tenantId = tenantId;

    const updated: any = await ConsignorModel.findOneAndUpdate(filter, { $set: req.body }, { new: true }).lean();
    if (!updated) return next(new Error('Consignor not found'));

    await eventBus.publish('consignor.updated', {
      tenantId,
      aggregateId: updated.id,
      aggregateType: 'consignor',
      payload: updated,
      actor: {
        userId: req.auth?.userId,
        name: req.auth?.name,
        role: req.auth?.role,
      },
    });

    await recordAudit({
      tenantId,
      module: 'consignors',
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

    res.json({ success: true, data: updated, message: 'Consignor updated.' });
  } catch (err) {
    next(err);
  }
});

// 5. Contacts management
consignorsRouter.post('/:id/contacts', requirePermission('update', 'consignors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = z.object({
      name: z.string().min(2),
      designation: z.string().optional(),
      phone: z.string().min(7),
      email: z.string().email(),
      isPrimary: z.boolean().default(false),
    }).parse(req.body);

    const contact = await ConsignorContactModel.create({
      id: `cnt_${uuidv4().slice(0, 8)}`,
      consignorId: req.params.id,
      tenantId,
      ...body,
    });

    res.status(201).json({ success: true, data: contact });
  } catch (err) {
    next(err);
  }
});

// 6. Documents management
consignorsRouter.post('/:id/documents', requirePermission('update', 'consignors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = z.object({
      title: z.string().min(2),
      type: z.string().default('GST_CERTIFICATE'),
      fileUrl: z.string().min(4),
      validUntil: z.string().optional(),
    }).parse(req.body);

    const doc = await ConsignorDocumentModel.create({
      id: `doc_${uuidv4().slice(0, 8)}`,
      consignorId: req.params.id,
      tenantId,
      ...body,
      verified: true,
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
});

// 7. Delete Consignor
consignorsRouter.delete('/:id', requirePermission('delete', 'consignors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { id: req.params.id };
    if (req.auth?.role !== 'SUPER_ADMIN') filter.tenantId = tenantId;

    const existing = await ConsignorModel.findOne(filter);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Consignor not found' });
    }

    await ConsignorModel.deleteOne(filter);

    await eventBus.publish('consignor.deleted', {
      tenantId,
      aggregateId: existing.id,
      aggregateType: 'consignor',
      payload: { id: existing.id, code: existing.code, companyName: existing.companyName },
      actor: {
        userId: req.auth?.userId,
        name: req.auth?.name,
        role: req.auth?.role,
      },
    });

    await recordAudit({
      tenantId,
      module: 'consignors',
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

    res.json({ success: true, message: `Consignor ${existing.companyName} deleted successfully.` });
  } catch (err) {
    next(err);
  }
});

