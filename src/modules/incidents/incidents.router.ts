import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { IncidentModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const incidentsRouter = Router();

const createIncidentSchema = z.object({
  tripId: z.string().optional(),
  vehicleRegNumber: z.string().optional(),
  driverName: z.string().optional(),
  type: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  title: z.string().min(2),
  description: z.string().default(''),
  location: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

incidentsRouter.get('/', requirePermission('read', 'incidents'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.vehicleRegNumber) filter.vehicleRegNumber = req.query.vehicleRegNumber;

    const incidents = await IncidentModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: incidents, total: incidents.length });
  } catch (err) { next(err); }
});

incidentsRouter.post('/', requirePermission('create', 'incidents'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createIncidentSchema.parse(req.body);
    const newIncident = await IncidentModel.create({
      id: `inc_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
      status: 'OPEN',
    });
    res.status(201).json({ success: true, data: newIncident, message: 'Incident reported.' });
  } catch (err) { next(err); }
});

incidentsRouter.put('/:incidentId', requirePermission('update', 'incidents'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await IncidentModel.findOneAndUpdate(
      { tenantId, id: req.params.incidentId },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Incident not found'));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

incidentsRouter.post('/:incidentId/resolve', requirePermission('update', 'incidents'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { resolution } = z.object({ resolution: z.string().min(1) }).parse(req.body);
    const updated = await IncidentModel.findOneAndUpdate(
      { tenantId, id: req.params.incidentId },
      { $set: { status: 'RESOLVED', resolution, resolvedAt: new Date() } },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Incident not found'));
    res.json({ success: true, data: updated, message: 'Incident resolved.' });
  } catch (err) { next(err); }
});
