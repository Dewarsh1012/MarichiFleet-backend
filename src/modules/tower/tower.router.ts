import { Router, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../platform/errors.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { VehicleModel, TripModel, ExceptionModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const towerRouter = Router();

// Live telemetry vehicles
towerRouter.get('/vehicles', requirePermission('read', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const vehicles = await VehicleModel.find({ tenantId }).lean();
    res.json({ success: true, data: vehicles, timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

// Active trips
towerRouter.get('/trips', requirePermission('read', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const trips = await TripModel.find({ tenantId, status: { $in: ['DISPATCHED', 'IN_TRANSIT', 'AT_LOADING', 'AT_UNLOADING'] } }).lean();
    res.json({ success: true, data: trips });
  } catch (err) { next(err); }
});

// Exceptions
towerRouter.get('/exceptions', requirePermission('read', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    const exceptions = await ExceptionModel.find(filter).sort({ timestamp: -1 }).lean();
    res.json({ success: true, data: exceptions, total: exceptions.length });
  } catch (err) { next(err); }
});

// Resolve exception
towerRouter.post('/exceptions/:exceptionId/resolve', requirePermission('update', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { resolutionNote } = z.object({ resolutionNote: z.string().min(1) }).parse(req.body);
    const updated = await ExceptionModel.findOneAndUpdate(
      { tenantId, id: req.params.exceptionId },
      { $set: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote } },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Exception', req.params.exceptionId));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Update vehicle location (from GPS ping)
towerRouter.post('/vehicles/:vehicleId/location', requirePermission('update', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { latitude, longitude, speedKmH, bearing, address } = req.body;
    const updated = await VehicleModel.findOneAndUpdate(
      { tenantId, $or: [{ id: req.params.vehicleId }, { regNumber: req.params.vehicleId }] },
      {
        $set: {
          'currentLocation.latitude': latitude,
          'currentLocation.longitude': longitude,
          'currentLocation.speedKmH': speedKmH || 0,
          'currentLocation.bearing': bearing || 0,
          'currentLocation.address': address || '',
          'currentLocation.updatedAt': new Date(),
        }
      },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Vehicle', req.params.vehicleId));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Dashboard stats for tower
towerRouter.get('/stats', requirePermission('read', 'tower'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const [vehicles, activeTrips, openExceptions] = await Promise.all([
      VehicleModel.countDocuments({ tenantId }),
      TripModel.countDocuments({ tenantId, status: { $in: ['DISPATCHED', 'IN_TRANSIT'] } }),
      ExceptionModel.countDocuments({ tenantId, status: 'OPEN' }),
    ]);
    const moving = await VehicleModel.countDocuments({ tenantId, 'currentLocation.speedKmH': { $gt: 5 } });

    res.json({
      success: true,
      data: {
        totalVehicles: vehicles,
        movingVehicles: moving,
        stoppedVehicles: vehicles - moving,
        activeTrips,
        openExceptions,
      },
    });
  } catch (err) { next(err); }
});
