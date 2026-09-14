import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { FuelEntryModel, ApprovalModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const fuelRouter = Router();

// Get all fuel entries
fuelRouter.get('/', requirePermission('read', 'fuel'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.vehicleRegNumber) filter.vehicleRegNumber = req.query.vehicleRegNumber;
    const entries = await FuelEntryModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: entries, total: entries.length });
  } catch (err) { next(err); }
});

// OCR parse simulation
fuelRouter.post('/ocr-parse', async (req: AuthenticatedRequest, res: Response) => {
  const { imageUrl, pumpName, volumeLitres, ratePerLitre, slipNumber } = req.body;
  const samplePumps = [
    'HPCL Highway Oasis, NH-48 Km 142 Kotputli',
    'IndianOil COCO Plaza, Express Highway Vadodara',
    'Bharat Petroleum Ghar Outlet, NH-44 Davanagere',
    'Reliance Petroleum Hub, Ashta Bypass',
  ];
  const pump = pumpName || samplePumps[Math.floor(Math.random() * samplePumps.length)];
  const volume = volumeLitres || Number((45 + Math.random() * 30).toFixed(2));
  const rate = ratePerLitre || 89.50;
  const amount = Number((volume * rate).toFixed(2));
  const slip = slipNumber || `HP-${Math.floor(100000 + Math.random() * 900000)}`;

  res.json({
    success: true,
    confidence: 0.96,
    extracted: {
      pumpName: pump,
      volumeLitres: volume,
      ratePerLitre: rate,
      totalAmount: amount,
      slipNumber: slip,
      fuelType: 'DIESEL (HSD BS-VI)',
      timestamp: new Date().toISOString(),
      receiptUrl: imageUrl || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800',
      geoCheckPassed: true,
    },
  });
});

// Submit fuel bill (creates fuel entry + approval)
const submitFuelBillSchema = z.object({
  vehicleRegNumber: z.string().min(4),
  driverPhone: z.string().default('+91 98110 23456'),
  tripId: z.string().optional(),
  pumpName: z.string().min(2),
  volumeLitres: z.number().positive(),
  ratePerLitre: z.number().positive(),
  totalAmount: z.number().positive(),
  slipNumber: z.string().default(''),
  odometerKm: z.number().optional(),
  receiptUrl: z.string().optional(),
});

fuelRouter.post('/submit', requirePermission('create', 'fuel'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = submitFuelBillSchema.parse(req.body);
    const fuelId = `fuel_${uuidv4().slice(0, 8)}`;
    const approvalId = `appr_${uuidv4().slice(0, 8)}`;

    // Create fuel entry
    const fuelEntry = await FuelEntryModel.create({
      id: fuelId,
      tenantId,
      ...body,
      fuelType: 'DIESEL (HSD BS-VI)',
      geoCheckPassed: true,
      approvalId,
      status: 'PENDING_APPROVAL',
    });

    // Create approval request
    await ApprovalModel.create({
      id: approvalId,
      tenantId,
      department: 'FINANCE',
      category: 'FUEL_REFILL',
      title: `Diesel ${body.volumeLitres}L @ ${body.pumpName}`,
      requestedBy: `Driver (${body.driverPhone})`,
      driverPhone: body.driverPhone,
      vehicleRegNumber: body.vehicleRegNumber,
      tripId: body.tripId,
      amount: body.totalAmount,
      fuelDetails: {
        pumpName: body.pumpName,
        volumeLitres: body.volumeLitres,
        ratePerLitre: body.ratePerLitre,
        totalAmount: body.totalAmount,
        slipNumber: body.slipNumber,
        odometerKm: body.odometerKm,
        receiptUrl: body.receiptUrl,
        geoCheckPassed: true,
      },
      status: 'PENDING',
    });

    res.status(201).json({
      success: true,
      data: { fuelEntry, approvalId },
      message: `Fuel bill submitted. Approval ${approvalId} created.`,
    });
  } catch (err) { next(err); }
});
