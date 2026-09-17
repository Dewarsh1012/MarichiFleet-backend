import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { TripModel, TripWalletEntryModel } from '../../db/models/index.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { moneySnapshotSchema } from './money.js';

export const tripWalletRouter = Router();

const entrySchema = z.object({
  type: z.enum(['FREIGHT', 'ADVANCE', 'FUEL', 'TOLL', 'EXPENSE', 'DETENTION', 'RECOVERY']),
  direction: z.enum(['CREDIT', 'DEBIT']),
  money: moneySnapshotSchema,
  partyType: z.enum(['DRIVER', 'VENDOR', 'CUSTOMER']).optional(),
  partyId: z.string().min(1).optional(),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().max(100).optional(),
  narration: z.string().max(500).default(''),
  occurredAt: z.coerce.date().optional(),
}).refine((value) => Boolean(value.partyType) === Boolean(value.partyId), {
  message: 'partyType and partyId must be provided together',
});

tripWalletRouter.get('/:tripId', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const trip = await TripModel.exists({ id: req.params.tripId, tenantId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const entries = await TripWalletEntryModel.find({ tenantId, tripId: req.params.tripId })
      .sort({ occurredAt: 1, createdAt: 1 })
      .lean();
    const summary = entries.reduce(
      (total, entry) => {
        const sign = entry.direction === 'CREDIT' ? 1 : -1;
        total.baseMinorUnits += sign * entry.money.baseMinorUnits;
        total.creditsMinorUnits += entry.direction === 'CREDIT' ? entry.money.baseMinorUnits : 0;
        total.debitsMinorUnits += entry.direction === 'DEBIT' ? entry.money.baseMinorUnits : 0;
        return total;
      },
      { creditsMinorUnits: 0, debitsMinorUnits: 0, baseMinorUnits: 0 }
    );
    res.json({ success: true, data: { entries, summary } });
  } catch (error) {
    next(error);
  }
});

tripWalletRouter.post('/:tripId/entries', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = entrySchema.parse(req.body);
    const trip = await TripModel.exists({ id: req.params.tripId, tenantId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const entry = await TripWalletEntryModel.create({
      id: `twe_${uuidv4().slice(0, 10)}`,
      tenantId,
      tripId: req.params.tripId,
      ...body,
      occurredAt: body.occurredAt ?? new Date(),
      createdBy: req.auth!.userId,
    });
    await recordAudit({
      tenantId,
      module: 'trip-wallet',
      resourceId: entry.id,
      action: 'ENTRY_RECORDED',
      actor: req.auth!,
      details: {
        tripId: req.params.tripId,
        type: body.type,
        direction: body.direction,
        baseMinorUnits: body.money.baseMinorUnits,
      },
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});
