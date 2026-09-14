import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { CustomerModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const customersRouter = Router();

const createCustomerSchema = z.object({
  name: z.string().min(2),
  contactPerson: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  gstin: z.string().default(''),
  pan: z.string().optional(),
  billingAddress: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  pincode: z.string().default(''),
  creditLimitAmount: z.number().default(500000),
  paymentTermDays: z.number().default(30),
});

customersRouter.get('/', requirePermission('read', 'customers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    const customers = await CustomerModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: customers, total: customers.length });
  } catch (err) { next(err); }
});

customersRouter.get('/:customerId', requirePermission('read', 'customers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const customer = await CustomerModel.findOne({ tenantId, id: req.params.customerId }).lean();
    if (!customer) return next(new Error('Customer not found'));
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
});

customersRouter.post('/', requirePermission('create', 'customers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createCustomerSchema.parse(req.body);
    const newCustomer = await CustomerModel.create({
      id: `cust_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
      outstandingAmount: 0,
      status: 'ACTIVE',
      totalTrips: 0,
    });
    res.status(201).json({ success: true, data: newCustomer, message: `Customer ${body.name} added.` });
  } catch (err) { next(err); }
});

customersRouter.put('/:customerId', requirePermission('update', 'customers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await CustomerModel.findOneAndUpdate(
      { tenantId, id: req.params.customerId },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Customer not found'));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});
