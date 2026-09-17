import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { SettlementModel, TripModel, TripWalletEntryModel } from '../../db/models/index.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { calculateSettlementTotals } from './settlements.service.js';

export const settlementsRouter = Router();

const partySchema = z.object({
  tripId: z.string().min(1),
  partyType: z.enum(['DRIVER', 'VENDOR']),
  partyId: z.string().min(1),
});

settlementsRouter.post('/calculate', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = partySchema.parse(req.body);
    const trip = await TripModel.exists({ tenantId, id: body.tripId });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const entries: any[] = await TripWalletEntryModel.find({
      tenantId,
      tripId: body.tripId,
      partyType: body.partyType,
      partyId: body.partyId,
    }).lean();
    if (!entries.length) {
      return res.status(409).json({ success: false, message: 'No wallet entries exist for this party and trip' });
    }
    const baseCurrencies = new Set(entries.map((entry) => entry.money.baseCurrency));
    if (baseCurrencies.size !== 1) {
      return res.status(409).json({ success: false, message: 'Settlement entries must share one base currency' });
    }

    const { creditsMinorUnits, debitsMinorUnits, netMinorUnits, netDirection } =
      calculateSettlementTotals(entries);
    const now = new Date();
    const settlement: any = await SettlementModel.findOneAndUpdate(
      { tenantId, tripId: body.tripId, partyType: body.partyType, partyId: body.partyId },
      {
        $set: {
          status: 'CALCULATED',
          creditsMinorUnits,
          debitsMinorUnits,
          netDirection,
          netMoney: {
            minorUnits: Math.abs(netMinorUnits),
            currency: [...baseCurrencies][0],
            baseMinorUnits: Math.abs(netMinorUnits),
            baseCurrency: [...baseCurrencies][0],
            rate: 1,
            source: 'TRIP_WALLET_SETTLEMENT',
            asOf: now,
          },
          entryIds: entries.map((entry) => entry.id),
          calculatedAt: now,
          createdBy: req.auth!.userId,
        },
        $setOnInsert: { id: `set_${uuidv4().slice(0, 10)}` },
        $unset: { approvedAt: 1, paidAt: 1 },
      },
      { new: true, upsert: true }
    ).lean();
    await recordAudit({
      tenantId,
      module: 'settlements',
      resourceId: settlement!.id,
      action: 'SETTLEMENT_CALCULATED',
      actor: req.auth!,
      details: { ...body, creditsMinorUnits, debitsMinorUnits, netMinorUnits },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: settlement });
  } catch (error) {
    next(error);
  }
});

settlementsRouter.get('/:settlementId', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const settlement = await SettlementModel.findOne({
      tenantId: req.auth!.tenantId,
      id: req.params.settlementId,
    }).lean();
    if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });
    res.json({ success: true, data: settlement });
  } catch (error) {
    next(error);
  }
});

settlementsRouter.patch('/:settlementId/status', requirePermission('update', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { status } = z.object({ status: z.enum(['APPROVED', 'PAID', 'DISPUTED']) }).parse(req.body);
    const settlement = await SettlementModel.findOne({ tenantId, id: req.params.settlementId });
    if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });
    const allowed: Record<string, string[]> = {
      CALCULATED: ['APPROVED', 'DISPUTED'],
      APPROVED: ['PAID', 'DISPUTED'],
      DISPUTED: ['APPROVED'],
      PAID: [],
    };
    if (!allowed[settlement.status].includes(status)) {
      return res.status(409).json({ success: false, message: `Cannot transition ${settlement.status} to ${status}` });
    }
    settlement.status = status;
    if (status === 'APPROVED') settlement.approvedAt = new Date();
    if (status === 'PAID') settlement.paidAt = new Date();
    await settlement.save();
    await recordAudit({
      tenantId,
      module: 'settlements',
      resourceId: settlement.id,
      action: `STATUS_${status}`,
      actor: req.auth!,
      details: { tripId: settlement.tripId, partyType: settlement.partyType, partyId: settlement.partyId },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: settlement });
  } catch (error) {
    next(error);
  }
});
