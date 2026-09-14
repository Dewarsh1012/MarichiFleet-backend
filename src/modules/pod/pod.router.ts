import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { PODModel, TripModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const podRouter = Router();

const submitPodSchema = z.object({
  tripId: z.string().min(1),
  vehicleRegNumber: z.string().min(1),
  signedByName: z.string().min(1),
  signedByDesignation: z.string().optional(),
  podPhotoUrl: z.string().optional(),
  isCleanPOD: z.boolean().default(true),
  shortageUnits: z.number().default(0),
  damageUnits: z.number().default(0),
  remarks: z.string().optional(),
});

podRouter.get('/', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.tripId) filter.tripId = req.query.tripId;
    if (req.query.vehicleRegNumber) filter.vehicleRegNumber = req.query.vehicleRegNumber;

    const pods = await PODModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: pods, total: pods.length });
  } catch (err) { next(err); }
});

podRouter.get('/:podId', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const pod = await PODModel.findOne({ tenantId, id: req.params.podId }).lean();
    if (!pod) return next(new Error('POD record not found'));
    res.json({ success: true, data: pod });
  } catch (err) { next(err); }
});

podRouter.post('/', requirePermission('create', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = submitPodSchema.parse(req.body);
    const newPod = await PODModel.create({
      id: `pod_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
      status: body.isCleanPOD && body.shortageUnits === 0 && body.damageUnits === 0 ? 'VERIFIED' : 'SUBMITTED',
      submittedAt: new Date(),
    });

    // Update Trip POD status
    await TripModel.findOneAndUpdate(
      { tenantId, id: body.tripId },
      { $set: { podStatus: 'RECEIVED', podUrl: body.podPhotoUrl, status: 'DELIVERED' } }
    );

    res.status(201).json({ success: true, data: newPod, message: 'POD submitted successfully.' });
  } catch (err) { next(err); }
});

podRouter.post('/:podId/verify', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { status, remarks } = z.object({
      status: z.enum(['VERIFIED', 'DISPUTED', 'APPROVED']),
      remarks: z.string().optional(),
    }).parse(req.body);

    const updated = await PODModel.findOneAndUpdate(
      { tenantId, id: req.params.podId },
      { $set: { status, remarks, verifiedBy: req.auth?.name || req.auth?.email || 'officer' } },
      { new: true }
    );
    if (!updated) return next(new Error('POD not found'));

    if (status === 'VERIFIED' || status === 'APPROVED') {
      await TripModel.findOneAndUpdate(
        { tenantId, id: updated.tripId },
        { $set: { podStatus: 'VERIFIED' } }
      );
    }

    res.json({ success: true, data: updated, message: `POD marked as ${status}.` });
  } catch (err) { next(err); }
});
