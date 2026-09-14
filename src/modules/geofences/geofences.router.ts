import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { GeofenceModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const geofencesRouter = Router();

const createGeofenceSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['CIRCLE', 'POLYGON', 'CORRIDOR']).default('CIRCLE'),
  center: z.object({ lat: z.number(), lng: z.number() }).optional(),
  radiusKm: z.number().positive().default(1),
  polygon: z.array(z.object({ lat: z.number(), lng: z.number() })).optional(),
  category: z.enum(['LOADING_POINT', 'UNLOADING_POINT', 'FUEL_STATION', 'REST_STOP', 'TOLL_PLAZA', 'CUSTOM']).default('CUSTOM'),
  isActive: z.boolean().default(true),
  alertOnEntry: z.boolean().default(true),
  alertOnExit: z.boolean().default(true),
  dwellTimeMinutes: z.number().optional(),
});

geofencesRouter.get('/', requirePermission('read', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.isActive) filter.isActive = req.query.isActive === 'true';

    const geofences = await GeofenceModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: geofences, total: geofences.length });
  } catch (err) { next(err); }
});

geofencesRouter.get('/:geofenceId', requirePermission('read', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const fence = await GeofenceModel.findOne({ tenantId, id: req.params.geofenceId }).lean();
    if (!fence) return next(new Error('Geofence not found'));
    res.json({ success: true, data: fence });
  } catch (err) { next(err); }
});

geofencesRouter.post('/', requirePermission('create', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createGeofenceSchema.parse(req.body);
    const newFence = await GeofenceModel.create({
      id: `geo_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
    });
    res.status(201).json({ success: true, data: newFence, message: 'Geofence created.' });
  } catch (err) { next(err); }
});

geofencesRouter.put('/:geofenceId', requirePermission('update', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await GeofenceModel.findOneAndUpdate(
      { tenantId, id: req.params.geofenceId },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Geofence not found'));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

geofencesRouter.delete('/:geofenceId', requirePermission('delete', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    await GeofenceModel.findOneAndDelete({ tenantId, id: req.params.geofenceId });
    res.json({ success: true, message: 'Geofence deleted.' });
  } catch (err) { next(err); }
});
