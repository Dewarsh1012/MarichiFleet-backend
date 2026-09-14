import { Router, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../platform/errors.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { TripModel } from '../../db/models/index.js';

export const tripsRouter = Router();

const createTripSchema = z.object({
  bookingId: z.string().optional(),
  clientName: z.string().min(2),
  origin: z.string().min(2),
  destination: z.string().min(2),
  vehicleRegNumber: z.string().min(4),
  driverId: z.string().optional(),
  driverName: z.string().min(2),
  driverPhone: z.string().min(8),
  cargoDescription: z.string().default('General Cargo'),
  weightTons: z.number().positive(),
  totalDistanceKm: z.number().positive(),
  freightAmount: z.number().positive(),
  advancePaid: z.number().default(0),
});

const updateTripSchema = z.object({
  status: z.string().optional(),
  slaStatus: z.string().optional(),
  completedDistanceKm: z.number().optional(),
  detentionAccrued: z.number().optional(),
  ewayBillNumber: z.string().optional(),
  ewayBillValidUntil: z.string().optional(),
}).passthrough();

// List all trips
tripsRouter.get('/', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.vehicleRegNumber) filter.vehicleRegNumber = req.query.vehicleRegNumber;
    const trips = await TripModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: trips, total: trips.length });
  } catch (err) { next(err); }
});

// Get single trip
tripsRouter.get('/:tripId', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const trip = await TripModel.findOne({ tenantId, id: req.params.tripId }).lean();
    if (!trip) return next(AppError.notFound('Trip', req.params.tripId));
    res.json({ success: true, data: trip });
  } catch (err) { next(err); }
});

// Create trip
tripsRouter.post('/', requirePermission('create', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createTripSchema.parse(req.body);
    const tripId = `TRP-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const newTrip = await TripModel.create({
      id: tripId,
      tenantId,
      ...body,
      status: 'DISPATCHED',
      slaStatus: 'ON_TIME',
      completedDistanceKm: 0,
      detentionAccrued: 0,
      dispatchedAt: new Date(),
      eta: new Date(Date.now() + (body.totalDistanceKm / 45) * 3600000),
      checkpoints: [],
    });

    res.status(201).json({ success: true, data: newTrip, message: `Trip ${tripId} dispatched.` });
  } catch (err) { next(err); }
});

// Update trip
tripsRouter.put('/:tripId', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = updateTripSchema.parse(req.body);
    const updated = await TripModel.findOneAndUpdate(
      { tenantId, id: req.params.tripId },
      { $set: body },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Trip', req.params.tripId));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Update trip status
tripsRouter.patch('/:tripId/status', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { status } = z.object({ status: z.string() }).parse(req.body);
    const updated = await TripModel.findOneAndUpdate(
      { tenantId, id: req.params.tripId },
      { $set: { status } },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Trip', req.params.tripId));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Add checkpoint
tripsRouter.post('/:tripId/checkpoints', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { name, status } = z.object({ name: z.string(), status: z.string().default('REACHED') }).parse(req.body);
    const updated = await TripModel.findOneAndUpdate(
      { tenantId, id: req.params.tripId },
      { $push: { checkpoints: { name, timestamp: new Date(), status } } },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Trip', req.params.tripId));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});
