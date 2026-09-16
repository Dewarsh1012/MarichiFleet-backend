import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import {
  ConsignmentModel,
  ConsignmentItemModel,
  ConsignmentDocumentModel,
  ConsignmentStatusHistoryModel,
  ConsignorModel,
  ConsigneeModel,
  VehicleModel,
  DriverModel,
} from '../../db/models/index.js';
import { generateConsignmentNumbers, transitionConsignmentStatus } from './consignments.service.js';
import { eventBus } from '../../platform/events/eventBus.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { v4 as uuidv4 } from 'uuid';

export const consignmentsRouter = Router();

const createConsignmentSchema = z.object({
  bookingId: z.string().optional(),
  consignorId: z.string().min(1),
  consigneeId: z.string().min(1),
  branchId: z.string().default('br_01'),
  shipmentDate: z.string().min(4),
  expectedDeliveryDate: z.string().min(4),

  // Cargo
  cargoType: z.string().default('GENERAL_CARGO'),
  commodity: z.string().min(2),
  description: z.string().optional().default(''),
  packageCount: z.number().int().positive().default(1),
  packageType: z.string().default('BOXES'),
  weight: z.number().positive(),
  volume: z.number().nonnegative().default(1),
  declaredValue: z.number().nonnegative().default(100000),

  // Transportation
  routeId: z.string().optional(),
  tripId: z.string().optional(),
  vehicleId: z.string().optional(),
  vehicleRegNumber: z.string().optional(),
  driverId: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  origin: z.string().min(2),
  destination: z.string().min(2),

  // Financials
  freightAmount: z.number().nonnegative().default(0),
  loadingCharges: z.number().nonnegative().default(0),
  unloadingCharges: z.number().nonnegative().default(0),
  fuelSurcharge: z.number().nonnegative().default(0),
  insuranceCharges: z.number().nonnegative().default(0),
  detentionCharges: z.number().nonnegative().default(0),
  otherCharges: z.number().nonnegative().default(0),

  // Payment
  paymentMode: z.enum(['PREPAID', 'TO_PAY', 'BILLING_PARTY']).default('BILLING_PARTY'),
  paymentStatus: z.enum(['PENDING', 'PAID', 'PARTIAL', 'OVERDUE']).default('PENDING'),

  // International
  hsCode: z.string().optional(),
  incoterm: z.enum(['FOB', 'CIF', 'EXW', 'DDP', 'FCA']).optional(),
  countryOfOrigin: z.string().optional(),
  countryOfDestination: z.string().optional(),
  portOfLoading: z.string().optional(),
  portOfDischarge: z.string().optional(),
  containerNo: z.string().optional(),
  containerType: z.string().optional(),
  billOfLadingNo: z.string().optional(),
  airwayBillNo: z.string().optional(),
  customsStatus: z.string().optional(),
});

// 1. List Consignments
consignmentsRouter.get('/', requirePermission('read', 'consignments'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = {};
    if (req.auth?.role !== 'SUPER_ADMIN') {
      filter.tenantId = tenantId;
    }

    // Portal role scoping: Consignor / Consignee can only see their own
    if (req.auth?.role === 'CONSIGNOR_USER' && req.auth?.consignorId) {
      filter.consignorId = req.auth.consignorId;
    }
    if (req.auth?.role === 'CONSIGNEE_USER' && req.auth?.consigneeId) {
      filter.consigneeId = req.auth.consigneeId;
    }

    if (req.query.status) filter.currentStatus = req.query.status;
    if (req.query.consignorId) filter.consignorId = req.query.consignorId;
    if (req.query.consigneeId) filter.consigneeId = req.query.consigneeId;
    if (req.query.bookingId) filter.bookingId = req.query.bookingId;
    if (req.query.vehicleRegNumber) filter.vehicleRegNumber = req.query.vehicleRegNumber;
    if (req.query.lrNo) filter.lrNo = req.query.lrNo;
    if (req.query.consignmentNo) filter.consignmentNo = req.query.consignmentNo;

    if (req.query.search) {
      const q = new RegExp(String(req.query.search), 'i');
      filter.$or = [
        { consignmentNo: q },
        { lrNo: q },
        { commodity: q },
        { origin: q },
        { destination: q },
        { vehicleRegNumber: q },
        { driverName: q },
      ];
    }

    const consignments = await ConsignmentModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: consignments, total: consignments.length });
  } catch (err) {
    next(err);
  }
});

// 2. Get Single Consignment with Relationships
consignmentsRouter.get('/:id', requirePermission('read', 'consignments'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { $or: [{ id: req.params.id }, { consignmentNo: req.params.id }, { lrNo: req.params.id }] };
    if (req.auth?.role !== 'SUPER_ADMIN') filter.tenantId = tenantId;

    const consignment: any = await ConsignmentModel.findOne(filter).lean();
    if (!consignment) return next(new Error('Consignment not found'));

    // Check portal authorization
    if (req.auth?.role === 'CONSIGNOR_USER' && req.auth?.consignorId && consignment.consignorId !== req.auth.consignorId) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to this consignment' });
    }
    if (req.auth?.role === 'CONSIGNEE_USER' && req.auth?.consigneeId && consignment.consigneeId !== req.auth.consigneeId) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to this consignment' });
    }

    const [consignor, consignee, items, history, documents] = await Promise.all([
      ConsignorModel.findOne({ id: consignment.consignorId }).lean(),
      ConsigneeModel.findOne({ id: consignment.consigneeId }).lean(),
      ConsignmentItemModel.find({ consignmentId: consignment.id }).lean(),
      ConsignmentStatusHistoryModel.find({ consignmentId: consignment.id }).sort({ timestamp: 1 }).lean(),
      ConsignmentDocumentModel.find({ consignmentId: consignment.id }).lean(),
    ]);

    res.json({
      success: true,
      data: {
        ...consignment,
        consignor,
        consignee,
        items,
        history,
        documents,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. Create Consignment
consignmentsRouter.post('/', requirePermission('create', 'consignments'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createConsignmentSchema.parse(req.body);

    const { consignmentNo, lrNo } = await generateConsignmentNumbers(tenantId);
    const id = `cgn_${uuidv4().slice(0, 8)}`;

    const totalAmount =
      body.freightAmount +
      body.loadingCharges +
      body.unloadingCharges +
      body.fuelSurcharge +
      body.insuranceCharges +
      body.detentionCharges +
      body.otherCharges;

    const initialStatus = body.vehicleRegNumber ? 'VEHICLE_ASSIGNED' : 'BOOKED';

    const newConsignment = await ConsignmentModel.create({
      id,
      consignmentNo,
      lrNo,
      tenantId,
      ...body,
      totalAmount,
      currentStatus: initialStatus,
      currentLocation: {
        latitude: 28.6139,
        longitude: 77.209,
        address: body.origin,
        speedKmH: 0,
        updatedAt: new Date(),
      },
      lastUpdate: new Date(),
    });

    // Record initial status history
    await ConsignmentStatusHistoryModel.create({
      id: `csh_${uuidv4().slice(0, 8)}`,
      consignmentId: id,
      tenantId,
      fromStatus: 'DRAFT',
      toStatus: initialStatus,
      remarks: 'Consignment created and booked',
      location: body.origin,
      actor: {
        userId: req.auth!.userId,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      timestamp: new Date(),
    });

    // Publish domain event
    await eventBus.publish('consignment.created', {
      tenantId,
      aggregateId: id,
      aggregateType: 'consignment',
      payload: newConsignment,
      actor: {
        userId: req.auth?.userId,
        name: req.auth?.name,
        role: req.auth?.role,
      },
    });

    // Record audit trail
    await recordAudit({
      tenantId,
      module: 'consignments',
      resourceId: id,
      action: 'CREATE',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: { consignmentNo, lrNo, totalAmount, origin: body.origin, destination: body.destination },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: newConsignment,
      message: `Consignment ${consignmentNo} (LR: ${lrNo}) generated successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

// 4. Assign Vehicle
consignmentsRouter.post('/:id/assign-vehicle', requirePermission('update', 'consignments'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { vehicleId, vehicleRegNumber } = z.object({
      vehicleId: z.string().optional(),
      vehicleRegNumber: z.string().min(2),
    }).parse(req.body);

    const updated = await transitionConsignmentStatus({
      consignmentId: req.params.id,
      tenantId,
      nextStatus: 'VEHICLE_ASSIGNED',
      remarks: `Assigned vehicle ${vehicleRegNumber}`,
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      extraUpdates: { vehicleId, vehicleRegNumber },
    });

    res.json({ success: true, data: updated, message: `Vehicle ${vehicleRegNumber} assigned to consignment.` });
  } catch (err) {
    next(err);
  }
});

// 5. Assign Driver
consignmentsRouter.post('/:id/assign-driver', requirePermission('update', 'consignments'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { driverId, driverName, driverPhone } = z.object({
      driverId: z.string().optional(),
      driverName: z.string().min(2),
      driverPhone: z.string().min(7),
    }).parse(req.body);

    const updated = await transitionConsignmentStatus({
      consignmentId: req.params.id,
      tenantId,
      nextStatus: 'DRIVER_ASSIGNED',
      remarks: `Assigned driver ${driverName} (${driverPhone})`,
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      extraUpdates: { driverId, driverName, driverPhone },
    });

    res.json({ success: true, data: updated, message: `Driver ${driverName} assigned to consignment.` });
  } catch (err) {
    next(err);
  }
});

// 6. Lifecycle Status Transition
consignmentsRouter.post('/:id/status', requirePermission('update', 'consignments'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { status, remarks, location, latitude, longitude } = z.object({
      status: z.enum([
        'DRAFT',
        'BOOKED',
        'VEHICLE_ASSIGNED',
        'DRIVER_ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'AT_HUB',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'POD_RECEIVED',
        'CLOSED',
      ]),
      remarks: z.string().optional(),
      location: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }).parse(req.body);

    const extraUpdates: any = {};
    if (location || (latitude !== undefined && longitude !== undefined)) {
      extraUpdates.currentLocation = {
        address: location || 'Transit Checkpoint',
        latitude: latitude || 28.6139,
        longitude: longitude || 77.209,
        speedKmH: status === 'IN_TRANSIT' ? 45 : 0,
        updatedAt: new Date(),
      };
    }

    if (status === 'DELIVERED') {
      extraUpdates.deliveryDate = new Date().toISOString();
    }

    const updated = await transitionConsignmentStatus({
      consignmentId: req.params.id,
      tenantId,
      nextStatus: status,
      remarks,
      location,
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      extraUpdates,
    });

    res.json({ success: true, data: updated, message: `Consignment transitioned to ${status}.` });
  } catch (err) {
    next(err);
  }
});

// 7. POD Upload & Verification
consignmentsRouter.post('/:id/pod', requirePermission('update', 'consignments'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { podUrl, receiverName, receiverMobile, deliveryRemarks } = z.object({
      podUrl: z.string().min(4),
      receiverName: z.string().min(2),
      receiverMobile: z.string().optional(),
      deliveryRemarks: z.string().optional(),
    }).parse(req.body);

    const updated = await transitionConsignmentStatus({
      consignmentId: req.params.id,
      tenantId,
      nextStatus: 'POD_RECEIVED',
      remarks: `POD uploaded by receiver ${receiverName}`,
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      extraUpdates: {
        podUrl,
        receiverName,
        receiverMobile,
        deliveryRemarks,
        deliveryDate: new Date().toISOString(),
      },
    });

    res.json({ success: true, data: updated, message: 'POD registered and verified successfully.' });
  } catch (err) {
    next(err);
  }
});

// 8. Add Cargo Items
consignmentsRouter.post('/:id/items', requirePermission('update', 'consignments'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = z.object({
      description: z.string().min(2),
      packageType: z.string().default('BOXES'),
      quantity: z.number().int().positive().default(1),
      weightKg: z.number().nonnegative().default(0),
      volumeCbm: z.number().nonnegative().default(0),
      declaredValue: z.number().nonnegative().default(0),
    }).parse(req.body);

    const item = await ConsignmentItemModel.create({
      id: `itm_${uuidv4().slice(0, 8)}`,
      consignmentId: req.params.id,
      tenantId,
      ...body,
    });

    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

// 9. Status History Log
consignmentsRouter.get('/:id/history', requirePermission('read', 'consignments'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const history = await ConsignmentStatusHistoryModel.find({
      consignmentId: req.params.id,
      ...(req.auth?.role !== 'SUPER_ADMIN' ? { tenantId } : {}),
    }).sort({ timestamp: 1 }).lean();

    res.json({ success: true, data: history, total: history.length });
  } catch (err) {
    next(err);
  }
});
