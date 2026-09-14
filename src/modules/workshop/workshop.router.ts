import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { JobCardModel, VehicleModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const workshopRouter = Router();

const createJobCardSchema = z.object({
  vehicleRegNumber: z.string().min(1),
  vehicleId: z.string().optional(),
  type: z.enum(['PREVENTIVE', 'CORRECTIVE', 'BREAKDOWN', 'INSPECTION']).default('CORRECTIVE'),
  title: z.string().min(2),
  description: z.string().default(''),
  assignedMechanic: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  estimatedCost: z.number().default(0),
  parts: z.array(z.object({
    partName: z.string(),
    quantity: z.number(),
    unitCost: z.number(),
  })).optional(),
});

workshopRouter.get('/job-cards', requirePermission('read', 'vehicles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.vehicleRegNumber) filter.vehicleRegNumber = req.query.vehicleRegNumber;

    const cards = await JobCardModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: cards, total: cards.length });
  } catch (err) { next(err); }
});

workshopRouter.get('/job-cards/:cardId', requirePermission('read', 'vehicles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const card = await JobCardModel.findOne({ tenantId, id: req.params.cardId }).lean();
    if (!card) return next(new Error('Job card not found'));
    res.json({ success: true, data: card });
  } catch (err) { next(err); }
});

workshopRouter.post('/job-cards', requirePermission('create', 'vehicles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createJobCardSchema.parse(req.body);
    const newCard = await JobCardModel.create({
      id: `jc_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
      actualCost: 0,
      status: 'OPEN',
      startedAt: new Date(),
    });

    // Mark vehicle status as MAINTENANCE
    await VehicleModel.findOneAndUpdate(
      { tenantId, regNumber: body.vehicleRegNumber },
      { $set: { status: 'MAINTENANCE' } }
    );

    res.status(201).json({ success: true, data: newCard, message: 'Job card created.' });
  } catch (err) { next(err); }
});

workshopRouter.put('/job-cards/:cardId', requirePermission('update', 'vehicles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await JobCardModel.findOneAndUpdate(
      { tenantId, id: req.params.cardId },
      { $set: req.body },
      { new: true }
    );
    if (!updated) return next(new Error('Job card not found'));

    if (updated.status === 'COMPLETED') {
      await VehicleModel.findOneAndUpdate(
        { tenantId, regNumber: updated.vehicleRegNumber },
        { $set: { status: 'AVAILABLE' } }
      );
    }

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});
