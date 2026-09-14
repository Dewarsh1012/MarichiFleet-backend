import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import {
  VehicleModel,
  TripModel,
  ApprovalModel,
  ExceptionModel,
  InvoiceModel,
  DriverModel,
} from '../../db/models/index.js';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', requirePermission('read', 'trips'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;

    const [
      totalVehicles,
      activeTripsCount,
      pendingApprovalsCount,
      activeExceptionsCount,
      totalDrivers,
      recentTrips,
      recentInvoices,
    ] = await Promise.all([
      VehicleModel.countDocuments({ tenantId }),
      TripModel.countDocuments({ tenantId, status: { $in: ['DISPATCHED', 'IN_TRANSIT', 'AT_LOADING', 'AT_UNLOADING'] } }),
      ApprovalModel.countDocuments({ tenantId, status: 'PENDING' }),
      ExceptionModel.countDocuments({ tenantId, status: 'OPEN' }),
      DriverModel.countDocuments({ tenantId }),
      TripModel.find({ tenantId }).sort({ createdAt: -1 }).limit(5).lean(),
      InvoiceModel.find({ tenantId }).sort({ issuedDate: -1 }).limit(5).lean(),
    ]);

    const vehiclesOnTrip = await VehicleModel.countDocuments({ tenantId, status: 'ON_TRIP' });
    const vehiclesAvailable = await VehicleModel.countDocuments({ tenantId, status: 'AVAILABLE' });
    const vehiclesMaintenance = await VehicleModel.countDocuments({ tenantId, status: 'MAINTENANCE' });

    // Aggregate monthly freight revenue
    const revenueAgg = await InvoiceModel.aggregate([
      { $match: { tenantId, status: { $in: ['PAID', 'PARTIALLY_PAID', 'ISSUED'] } } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } },
    ]);
    const totalRevenue = revenueAgg[0]?.totalRevenue || 0;

    res.json({
      success: true,
      data: {
        fleet: {
          total: totalVehicles,
          onTrip: vehiclesOnTrip,
          available: vehiclesAvailable,
          maintenance: vehiclesMaintenance,
          totalDrivers,
        },
        operations: {
          activeTrips: activeTripsCount,
          pendingApprovals: pendingApprovalsCount,
          activeExceptions: activeExceptionsCount,
        },
        financials: {
          totalRevenue,
          recentInvoices,
        },
        recentTrips,
      },
    });
  } catch (err) { next(err); }
});
