import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { GeofenceModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../../platform/errors.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';

export const geofencesRouter = Router();

const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
}).strict();

const createGeofenceSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['CIRCLE', 'POLYGON', 'CORRIDOR']).default('CIRCLE'),
  center: coordinateSchema.optional(),
  radiusKm: z.number().positive().default(1),
  polygon: z.array(coordinateSchema).min(3).optional(),
  category: z.enum(['LOADING_POINT', 'UNLOADING_POINT', 'FUEL_STATION', 'REST_STOP', 'TOLL_PLAZA', 'CUSTOM']).default('CUSTOM'),
  isActive: z.boolean().default(true),
  alertOnEntry: z.boolean().default(true),
  alertOnExit: z.boolean().default(true),
  dwellTimeMinutes: z.number().nonnegative().optional(),
}).strict().superRefine((value, context) => {
  if (value.type === 'POLYGON' && !value.polygon) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['polygon'], message: 'polygon is required' });
  }
  if (value.type !== 'POLYGON' && !value.center) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['center'], message: 'center is required' });
  }
});

const updateGeofenceSchema = z.object({
  name: z.string().min(2).optional(),
  type: z.enum(['CIRCLE', 'POLYGON', 'CORRIDOR']).optional(),
  center: coordinateSchema.optional(),
  radiusKm: z.number().positive().optional(),
  polygon: z.array(coordinateSchema).min(3).optional(),
  category: z.enum(['LOADING_POINT', 'UNLOADING_POINT', 'FUEL_STATION', 'REST_STOP', 'TOLL_PLAZA', 'CUSTOM']).optional(),
  isActive: z.boolean().optional(),
  alertOnEntry: z.boolean().optional(),
  alertOnExit: z.boolean().optional(),
  dwellTimeMinutes: z.number().nonnegative().optional(),
}).strict();
const geofenceParamsSchema = z.object({ geofenceId: z.string().min(1).max(100) });
const geofenceListQuerySchema = z.object({
  category: z.enum(['LOADING_POINT', 'UNLOADING_POINT', 'FUEL_STATION', 'REST_STOP', 'TOLL_PLAZA', 'CUSTOM']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
}).strict();

geofencesRouter.get('/', requirePermission('read', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const query = geofenceListQuerySchema.parse(req.query);
    const filter: any = { tenantId };
    if (query.category) filter.category = query.category;
    if (query.isActive) filter.isActive = query.isActive === 'true';

    const geofences = await GeofenceModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: geofences, total: geofences.length });
  } catch (err) { next(err); }
});

geofencesRouter.get('/:geofenceId', requirePermission('read', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { geofenceId } = geofenceParamsSchema.parse(req.params);
    const fence = await GeofenceModel.findOne({ tenantId, id: geofenceId }).lean();
    if (!fence) return next(AppError.notFound('Geofence', geofenceId));
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
    await recordAudit({
      tenantId,
      module: 'geofences',
      resourceId: newFence.id,
      action: 'GEOFENCE_CREATED',
      actor: req.auth!,
      details: { type: body.type, category: body.category },
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: newFence, message: 'Geofence created.' });
  } catch (err) { next(err); }
});

geofencesRouter.put('/:geofenceId', requirePermission('update', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { geofenceId } = geofenceParamsSchema.parse(req.params);
    const body = updateGeofenceSchema.parse(req.body);
    const updated = await GeofenceModel.findOneAndUpdate(
      { tenantId, id: geofenceId },
      { $set: body },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Geofence', geofenceId));
    await recordAudit({
      tenantId,
      module: 'geofences',
      resourceId: geofenceId,
      action: 'GEOFENCE_UPDATED',
      actor: req.auth!,
      details: { fields: Object.keys(body) },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

geofencesRouter.delete('/:geofenceId', requirePermission('delete', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { geofenceId } = geofenceParamsSchema.parse(req.params);
    const deleted: any = await GeofenceModel.findOneAndDelete({ tenantId, id: geofenceId }).lean();
    if (!deleted) return next(AppError.notFound('Geofence', geofenceId));
    await recordAudit({
      tenantId,
      module: 'geofences',
      resourceId: geofenceId,
      action: 'GEOFENCE_DELETED',
      actor: req.auth!,
      details: { name: deleted.name },
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Geofence deleted.' });
  } catch (err) { next(err); }
});
