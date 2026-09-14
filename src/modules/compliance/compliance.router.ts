import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { ComplianceItemModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const complianceRouter = Router();

const createComplianceSchema = z.object({
  entityType: z.enum(['VEHICLE', 'DRIVER', 'COMPANY']),
  entityId: z.string().min(1),
  entityLabel: z.string().default(''),
  itemType: z.string().min(1),
  description: z.string().default(''),
  dueDate: z.string().optional(),
  status: z.enum(['COMPLIANT', 'EXPIRING_SOON', 'NON_COMPLIANT', 'PENDING']).default('COMPLIANT'),
});

complianceRouter.get('/', requirePermission('read', 'compliance'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.entityId) filter.entityId = req.query.entityId;
    if (req.query.status) filter.status = req.query.status;

    const items = await ComplianceItemModel.find(filter).sort({ dueDate: 1 }).lean();
    res.json({ success: true, data: items, total: items.length });
  } catch (err) { next(err); }
});

complianceRouter.post('/', requirePermission('create', 'compliance'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createComplianceSchema.parse(req.body);
    const newItem = await ComplianceItemModel.create({
      id: `cmp_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      lastChecked: new Date(),
    });
    res.status(201).json({ success: true, data: newItem, message: 'Compliance record created.' });
  } catch (err) { next(err); }
});

complianceRouter.put('/:itemId', requirePermission('update', 'compliance'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await ComplianceItemModel.findOneAndUpdate(
      { tenantId, id: req.params.itemId },
      { $set: req.body, lastChecked: new Date() },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Compliance record not found'));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

complianceRouter.delete('/:itemId', requirePermission('delete', 'compliance'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    await ComplianceItemModel.findOneAndDelete({ tenantId, id: req.params.itemId });
    res.json({ success: true, message: 'Compliance record deleted.' });
  } catch (err) { next(err); }
});
