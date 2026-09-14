import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import {
  TripModel,
  FuelEntryModel,
  ExpenseModel,
  InvoiceModel,
} from '../../db/models/index.js';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;

    const trips = await TripModel.find({ tenantId }).lean();
    const fuelEntries = await FuelEntryModel.find({ tenantId }).lean();
    const expenses = await ExpenseModel.find({ tenantId }).lean();
    const invoices = await InvoiceModel.find({ tenantId }).lean();

    const totalDistance = trips.reduce((acc, t) => acc + (t.totalDistanceKm || 0), 0);
    const totalFreight = trips.reduce((acc, t) => acc + (t.freightAmount || 0), 0);
    const totalFuelLiters = fuelEntries.reduce((acc, f) => acc + (f.volumeLitres || 0), 0);
    const totalFuelCost = fuelEntries.reduce((acc, f) => acc + (f.totalAmount || 0), 0);
    const totalOtherExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const totalBilled = invoices.reduce((acc, i) => acc + (i.totalAmount || 0), 0);

    const onTimeTrips = trips.filter(t => t.slaStatus === 'ON_TRACK' || t.slaStatus === 'AHEAD').length;
    const delayedTrips = trips.filter(t => t.slaStatus === 'DELAYED' || t.slaStatus === 'CRITICAL').length;
    const slaAdherencePct = trips.length > 0 ? Math.round((onTimeTrips / trips.length) * 100) : 100;
    const avgFuelMileageKmPerL = totalFuelLiters > 0 ? Number((totalDistance / totalFuelLiters).toFixed(2)) : 3.8;
    const avgCostPerKm = totalDistance > 0 ? Number(((totalFuelCost + totalOtherExpenses) / totalDistance).toFixed(2)) : 38.5;

    res.json({
      success: true,
      data: {
        totalTrips: trips.length,
        totalDistanceKm: totalDistance,
        totalRevenue: totalFreight,
        totalFuelCost,
        totalOtherExpenses,
        netMargin: totalFreight - (totalFuelCost + totalOtherExpenses),
        slaAdherencePct,
        onTimeTrips,
        delayedTrips,
        avgFuelMileageKmPerL,
        avgCostPerKm,
        totalBilled,
      },
    });
  } catch (err) { next(err); }
});
