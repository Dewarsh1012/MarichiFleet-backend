import { Router, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../platform/errors.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { TripModel } from '../../db/models/index.js';
import { canonicalTripStatus } from '../consignments/status.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { evaluateDispatchCompliance } from '../compliance/compliance.service.js';

export const tripsRouter = Router();

async function enforceComplianceGate(input: {
  tenantId: string;
  vehicleRegNumber: string;
  driverId?: string;
}) {
  const blockers = await evaluateDispatchCompliance(input);
  if (blockers.length > 0) {
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      'Trip transition blocked by compliance requirements',
      422,
      { blockers }
    );
  }
}

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
}).strict();

const updateTripSchema = z.object({
  status: z.string().transform((value, ctx) => {
    const status = canonicalTripStatus(value);
    if (!status) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid trip status' });
      return z.NEVER;
    }
    return status;
  }).optional(),
  slaStatus: z.string().optional(),
  completedDistanceKm: z.number().optional(),
  detentionAccrued: z.number().optional(),
  ewayBillNumber: z.string().optional(),
  ewayBillValidUntil: z.string().optional(),
}).strict();
const tripParamsSchema = z.object({ tripId: z.string().min(1).max(100) });
const listTripsQuerySchema = z.object({
  status: z.string().min(1).max(50).optional(),
  vehicleRegNumber: z.string().min(1).max(32).optional(),
}).strict();

// List all trips
tripsRouter.get('/', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const query = listTripsQuerySchema.parse(req.query);
    const filter: any = { tenantId };
    if (query.status) filter.status = query.status;
    if (query.vehicleRegNumber) filter.vehicleRegNumber = query.vehicleRegNumber;
    const trips = await TripModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: trips, total: trips.length });
  } catch (err) { next(err); }
});

// Get single trip
tripsRouter.get('/:tripId', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { tripId } = tripParamsSchema.parse(req.params);
    const trip = await TripModel.findOne({ tenantId, id: tripId }).lean();
    if (!trip) return next(AppError.notFound('Trip', tripId));
    res.json({ success: true, data: trip });
  } catch (err) { next(err); }
});

// Create trip
tripsRouter.post('/', requirePermission('create', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createTripSchema.parse(req.body);
    const tripId = `TRP-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    await enforceComplianceGate({
      tenantId,
      vehicleRegNumber: body.vehicleRegNumber,
      driverId: body.driverId,
    });

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
    await recordAudit({
      tenantId,
      module: 'trips',
      resourceId: tripId,
      action: 'TRIP_CREATED',
      actor: req.auth!,
      details: { status: 'DISPATCHED', vehicleRegNumber: body.vehicleRegNumber },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: newTrip, message: `Trip ${tripId} dispatched.` });
  } catch (err) { next(err); }
});

// Update trip
tripsRouter.put('/:tripId', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { tripId } = tripParamsSchema.parse(req.params);
    const body = updateTripSchema.parse(req.body);
    if (body.status === 'DISPATCHED' || body.status === 'IN_TRANSIT') {
      const trip: any = await TripModel.findOne({ tenantId, id: tripId })
        .select({ vehicleRegNumber: 1, driverId: 1 })
        .lean();
      if (!trip) return next(AppError.notFound('Trip', tripId));
      await enforceComplianceGate({
        tenantId,
        vehicleRegNumber: trip.vehicleRegNumber,
        driverId: trip.driverId,
      });
    }
    const updated = await TripModel.findOneAndUpdate(
      { tenantId, id: tripId },
      { $set: body },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Trip', tripId));
    await recordAudit({
      tenantId,
      module: 'trips',
      resourceId: tripId,
      action: 'TRIP_UPDATED',
      actor: req.auth!,
      details: { fields: Object.keys(body) },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Update trip status
tripsRouter.patch('/:tripId/status', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { tripId } = tripParamsSchema.parse(req.params);
    const { status: rawStatus } = z.object({ status: z.string().min(1) }).strict().parse(req.body);
    const status = canonicalTripStatus(rawStatus);
    if (!status) return res.status(400).json({ success: false, message: 'Invalid trip status' });
    if (status === 'DISPATCHED' || status === 'IN_TRANSIT') {
      const trip: any = await TripModel.findOne({ tenantId, id: tripId })
        .select({ vehicleRegNumber: 1, driverId: 1 })
        .lean();
      if (!trip) return next(AppError.notFound('Trip', tripId));
      await enforceComplianceGate({
        tenantId,
        vehicleRegNumber: trip.vehicleRegNumber,
        driverId: trip.driverId,
      });
    }
    const updated = await TripModel.findOneAndUpdate(
      { tenantId, id: tripId },
      { $set: { status } },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Trip', tripId));
    await recordAudit({
      tenantId,
      module: 'trips',
      resourceId: tripId,
      action: `STATUS_${status}`,
      actor: req.auth!,
      details: { status },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Add checkpoint
tripsRouter.post('/:tripId/checkpoints', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { tripId } = tripParamsSchema.parse(req.params);
    const { name, status } = z.object({
      name: z.string().min(1).max(200),
      status: z.string().min(1).max(50).default('REACHED'),
    }).strict().parse(req.body);
    const updated = await TripModel.findOneAndUpdate(
      { tenantId, id: tripId },
      { $push: { checkpoints: { name, timestamp: new Date(), status } } },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Trip', tripId));
    await recordAudit({
      tenantId,
      module: 'trips',
      resourceId: tripId,
      action: 'CHECKPOINT_ADDED',
      actor: req.auth!,
      details: { name, status },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Delete trip
tripsRouter.delete('/:tripId', requirePermission('delete', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { tripId } = tripParamsSchema.parse(req.params);
    const deleted: any = await TripModel.findOneAndDelete({
      tenantId,
      id: tripId,
    }).lean();
    if (!deleted) return next(AppError.notFound('Trip', tripId));
    await recordAudit({
      tenantId,
      module: 'trips',
      resourceId: tripId,
      action: 'TRIP_DELETED',
      actor: req.auth!,
      details: { status: deleted.status },
      ipAddress: req.ip,
    });
    res.json({ success: true, message: `Trip ${tripId} deleted successfully.` });
  } catch (err) { next(err); }
});

