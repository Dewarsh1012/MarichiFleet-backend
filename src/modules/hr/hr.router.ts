import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { DutyLogModel, DriverModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const hrRouter = Router();

const createDutyLogSchema = z.object({
  driverId: z.string().min(1),
  driverName: z.string().min(1),
  date: z.string().default(() => new Date().toISOString().slice(0, 10)),
  status: z.enum(['ON_DUTY', 'OFF_DUTY', 'ON_LEAVE', 'REST']).default('ON_DUTY'),
  tripId: z.string().optional(),
  hoursWorked: z.number().default(0),
  overtimeHours: z.number().default(0),
  notes: z.string().optional(),
});

hrRouter.get('/duty-logs', requirePermission('read', 'drivers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.driverId) filter.driverId = req.query.driverId;
    if (req.query.date) filter.date = req.query.date;
    if (req.query.status) filter.status = req.query.status;

    const logs = await DutyLogModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: logs, total: logs.length });
  } catch (err) { next(err); }
});

hrRouter.post('/duty-logs', requirePermission('create', 'drivers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createDutyLogSchema.parse(req.body);
    const newLog = await DutyLogModel.create({
      id: `duty_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
      checkIn: new Date(),
    });

    if (body.status === 'ON_DUTY') {
      await DriverModel.findOneAndUpdate(
        { tenantId, id: body.driverId },
        { $set: { status: 'AVAILABLE' } }
      );
    }

    res.status(201).json({ success: true, data: newLog, message: 'Duty logged.' });
  } catch (err) { next(err); }
});

hrRouter.post('/duty-logs/:logId/checkout', requirePermission('update', 'drivers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { hoursWorked, overtimeHours } = z.object({
      hoursWorked: z.number().default(8),
      overtimeHours: z.number().default(0),
    }).parse(req.body);

    const updated = await DutyLogModel.findOneAndUpdate(
      { tenantId, id: req.params.logId },
      { $set: { checkOut: new Date(), hoursWorked, overtimeHours, status: 'OFF_DUTY' } },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Duty log not found'));
    res.json({ success: true, data: updated, message: 'Driver clocked out.' });
  } catch (err) { next(err); }
});
