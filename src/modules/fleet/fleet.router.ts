import { Router, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../platform/errors.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { VehicleModel, DriverModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const fleetRouter = Router();

// ======================== VEHICLES ========================

fleetRouter.get('/vehicles', requirePermission('read', 'vehicles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const status = req.query.status as string | undefined;
    const filter: any = { tenantId };
    if (status) filter.status = status;
    const vehicles = await VehicleModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: vehicles, total: vehicles.length });
  } catch (err) { next(err); }
});

fleetRouter.get('/vehicles/:vehicleId', requirePermission('read', 'vehicles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const vehicle = await VehicleModel.findOne({
      tenantId,
      $or: [{ id: req.params.vehicleId }, { regNumber: req.params.vehicleId }]
    }).lean();
    if (!vehicle) return next(AppError.notFound('Vehicle', req.params.vehicleId));
    res.json({ success: true, data: vehicle });
  } catch (err) { next(err); }
});

const createVehicleSchema = z.object({
  regNumber: z.string().min(4),
  model: z.string().default('Tata Prima 5530.S'),
  capacityTons: z.number().positive().default(28),
  type: z.string().default('CONTAINER_CLOSED'),
  fuelLevelPercent: z.number().default(85),
  odometerKm: z.number().default(0),
  assignedDriverId: z.string().optional(),
  rcValidUntil: z.string().optional(),
  fitnessValidUntil: z.string().optional(),
  insuranceValidUntil: z.string().optional(),
  pucValidUntil: z.string().optional(),
});

fleetRouter.post('/vehicles', requirePermission('create', 'vehicles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createVehicleSchema.parse(req.body);
    const cleanReg = body.regNumber.trim().toUpperCase().replace(/\s+/g, '');

    const existing = await VehicleModel.findOne({ tenantId, regNumber: cleanReg });
    if (existing) return next(AppError.badRequest(`Vehicle ${cleanReg} already exists.`));

    const newVehicle = await VehicleModel.create({
      id: `veh_${uuidv4().slice(0, 8)}`,
      tenantId,
      regNumber: cleanReg,
      model: body.model,
      capacityTons: body.capacityTons,
      type: body.type,
      status: 'AVAILABLE',
      fuelLevelPercent: body.fuelLevelPercent,
      batteryVolts: 24.5,
      odometerKm: body.odometerKm,
      assignedDriverId: body.assignedDriverId || null,
      currentTripId: null,
      currentLocation: {
        latitude: 28.5355,
        longitude: 77.2731,
        address: 'Delhi NCR Depot',
        speedKmH: 0,
        bearing: 0,
        updatedAt: new Date(),
      },
      documents: {
        rcValidUntil: body.rcValidUntil || '2028-12-31',
        fitnessValidUntil: body.fitnessValidUntil || '2027-12-31',
        insuranceValidUntil: body.insuranceValidUntil || '2026-12-31',
        pucValidUntil: body.pucValidUntil || '2026-10-30',
      },
    });

    res.status(201).json({ success: true, data: newVehicle, message: `Vehicle ${cleanReg} registered successfully.` });
  } catch (err) { next(err); }
});

fleetRouter.put('/vehicles/:vehicleId', requirePermission('update', 'vehicles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await VehicleModel.findOneAndUpdate(
      { tenantId, $or: [{ id: req.params.vehicleId }, { regNumber: req.params.vehicleId }] },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Vehicle', req.params.vehicleId));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

fleetRouter.delete('/vehicles/:vehicleId', requirePermission('delete', 'vehicles'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const deleted = await VehicleModel.findOneAndDelete({
      tenantId,
      $or: [{ id: req.params.vehicleId }, { regNumber: req.params.vehicleId }],
    }).lean();
    if (!deleted) return next(AppError.notFound('Vehicle', req.params.vehicleId));
    res.json({ success: true, message: `Vehicle ${req.params.vehicleId} deleted successfully.` });
  } catch (err) { next(err); }
});

// ======================== DRIVERS ========================

fleetRouter.get('/drivers', requirePermission('read', 'drivers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const drivers = await DriverModel.find({ tenantId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: drivers, total: drivers.length });
  } catch (err) { next(err); }
});

fleetRouter.get('/drivers/:driverId', requirePermission('read', 'drivers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const driver = await DriverModel.findOne({ tenantId, id: req.params.driverId }).lean();
    if (!driver) return next(AppError.notFound('Driver', req.params.driverId));
    res.json({ success: true, data: driver });
  } catch (err) { next(err); }
});

const createDriverSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  licenseNumber: z.string().min(5),
  licenseValidUntil: z.string().default('2031-12-31'),
  aadhaarLast4: z.string().optional(),
});

fleetRouter.post('/drivers', requirePermission('create', 'drivers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createDriverSchema.parse(req.body);

    const newDriver = await DriverModel.create({
      id: `drv_${uuidv4().slice(0, 8)}`,
      tenantId,
      name: body.name.trim(),
      phone: body.phone.trim(),
      licenseNumber: body.licenseNumber.trim().toUpperCase(),
      licenseValidUntil: body.licenseValidUntil,
      status: 'AVAILABLE',
      currentTripId: null,
      rating: 5.0,
      totalTripsCompleted: 0,
      aadhaarLast4: body.aadhaarLast4 || '0000',
      settlementPendingAmount: 0,
    });

    res.status(201).json({ success: true, data: newDriver, message: `Driver ${newDriver.name} onboarded successfully.` });
  } catch (err) { next(err); }
});

fleetRouter.put('/drivers/:driverId', requirePermission('update', 'drivers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await DriverModel.findOneAndUpdate(
      { tenantId, id: req.params.driverId },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return next(AppError.notFound('Driver', req.params.driverId));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

fleetRouter.delete('/drivers/:driverId', requirePermission('delete', 'drivers'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const deleted = await DriverModel.findOneAndDelete({
      tenantId,
      id: req.params.driverId,
    }).lean();
    if (!deleted) return next(AppError.notFound('Driver', req.params.driverId));
    res.json({ success: true, message: `Driver ${req.params.driverId} deleted successfully.` });
  } catch (err) { next(err); }
});

