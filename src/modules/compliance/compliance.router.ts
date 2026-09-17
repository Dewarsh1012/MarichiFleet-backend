import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { ComplianceItemModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../../platform/errors.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';

export const complianceRouter = Router();

const createComplianceSchema = z.object({
  entityType: z.enum(['VEHICLE', 'DRIVER', 'COMPANY']),
  entityId: z.string().min(1),
  entityLabel: z.string().default(''),
  itemType: z.string().min(1),
  description: z.string().default(''),
  dueDate: z.string().optional(),
  status: z.enum(['COMPLIANT', 'EXPIRING_SOON', 'NON_COMPLIANT', 'PENDING']).default('COMPLIANT'),
}).strict();

const updateComplianceSchema = createComplianceSchema.partial().strict();
const itemParamsSchema = z.object({ itemId: z.string().min(1).max(100) });
const listComplianceQuerySchema = z.object({
  entityType: z.enum(['VEHICLE', 'DRIVER', 'COMPANY']).optional(),
  entityId: z.string().min(1).max(100).optional(),
  status: z.enum(['COMPLIANT', 'EXPIRING_SOON', 'NON_COMPLIANT', 'PENDING']).optional(),
}).strict();

complianceRouter.get('/', requirePermission('read', 'compliance'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const query = listComplianceQuerySchema.parse(req.query);
    const filter: any = { tenantId };
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.status) filter.status = query.status;

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
    await recordAudit({
      tenantId,
      module: 'compliance',
      resourceId: newItem.id,
      action: 'COMPLIANCE_ITEM_CREATED',
      actor: req.auth!,
      details: { entityType: body.entityType, entityId: body.entityId, status: body.status },
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: newItem, message: 'Compliance record created.' });
  } catch (err) { next(err); }
});

complianceRouter.put('/:itemId', requirePermission('update', 'compliance'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { itemId } = itemParamsSchema.parse(req.params);
    const body = updateComplianceSchema.parse(req.body);
    const updated = await ComplianceItemModel.findOneAndUpdate(
      { tenantId, id: itemId },
      {
        $set: {
          ...body,
          dueDate: body.dueDate ? new Date(body.dueDate) : body.dueDate,
          lastChecked: new Date(),
        },
      },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Compliance record', itemId));
    await recordAudit({
      tenantId,
      module: 'compliance',
      resourceId: itemId,
      action: 'COMPLIANCE_ITEM_UPDATED',
      actor: req.auth!,
      details: { fields: Object.keys(body), status: body.status },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

complianceRouter.delete('/:itemId', requirePermission('delete', 'compliance'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { itemId } = itemParamsSchema.parse(req.params);
    const deleted: any = await ComplianceItemModel.findOneAndDelete({ tenantId, id: itemId }).lean();
    if (!deleted) return next(AppError.notFound('Compliance record', itemId));
    await recordAudit({
      tenantId,
      module: 'compliance',
      resourceId: itemId,
      action: 'COMPLIANCE_ITEM_DELETED',
      actor: req.auth!,
      details: { entityType: deleted.entityType, entityId: deleted.entityId },
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Compliance record deleted.' });
  } catch (err) { next(err); }
});
