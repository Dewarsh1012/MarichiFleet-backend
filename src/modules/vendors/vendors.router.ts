import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { VendorModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const vendorsRouter = Router();

const createVendorSchema = z.object({
  name: z.string().min(2),
  contactPerson: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  gstin: z.string().default(''),
  pan: z.string().optional(),
  address: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  type: z.enum(['BROKER', 'ATTACHED_VEHICLE', 'SERVICE_PROVIDER', 'FUEL_STATION']).default('BROKER'),
});

vendorsRouter.get('/', requirePermission('read', 'vendors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    const vendors = await VendorModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: vendors, total: vendors.length });
  } catch (err) { next(err); }
});

vendorsRouter.get('/:vendorId', requirePermission('read', 'vendors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const vendor = await VendorModel.findOne({ tenantId, id: req.params.vendorId }).lean();
    if (!vendor) return next(new Error('Vendor not found'));
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
});

vendorsRouter.post('/', requirePermission('create', 'vendors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createVendorSchema.parse(req.body);
    const newVendor = await VendorModel.create({
      id: `vnd_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
      vehiclesAttached: 0,
      pendingPayments: 0,
      status: 'ACTIVE',
    });
    res.status(201).json({ success: true, data: newVendor, message: `Vendor ${body.name} added.` });
  } catch (err) { next(err); }
});

vendorsRouter.put('/:vendorId', requirePermission('update', 'vendors'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await VendorModel.findOneAndUpdate(
      { tenantId, id: req.params.vendorId },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Vendor not found'));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});
