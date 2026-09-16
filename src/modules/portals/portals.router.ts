import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { ConsignmentModel, InvoiceModel, BookingModel } from '../../db/models/index.js';

export const portalsRouter = Router();

// ==========================================
// 1. CONSIGNOR PORTAL
// ==========================================
portalsRouter.get('/consignor/dashboard', requirePermission('read', 'portals'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const consignorId = req.auth?.consignorId || String(req.query.consignorId || '');

    const filter: any = { tenantId };
    if (consignorId) filter.consignorId = consignorId;

    const [totalConsignments, inTransit, delivered, recentConsignments, invoices] = await Promise.all([
      ConsignmentModel.countDocuments(filter),
      ConsignmentModel.countDocuments({ ...filter, currentStatus: { $in: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'AT_HUB'] } }),
      ConsignmentModel.countDocuments({ ...filter, currentStatus: { $in: ['DELIVERED', 'POD_RECEIVED', 'CLOSED'] } }),
      ConsignmentModel.find(filter).sort({ createdAt: -1 }).limit(10).lean(),
      InvoiceModel.find({ tenantId, ...(consignorId ? { customerId: consignorId } : {}) }).limit(10).lean(),
    ]);

    res.json({
      success: true,
      data: {
        metrics: {
          totalConsignments,
          inTransit,
          delivered,
        },
        recentConsignments,
        invoices,
      },
    });
  } catch (err) {
    next(err);
  }
});

portalsRouter.get('/consignor/consignments', requirePermission('read', 'portals'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const consignorId = req.auth?.consignorId || String(req.query.consignorId || '');
    const filter: any = { tenantId };
    if (consignorId) filter.consignorId = consignorId;

    const consignments = await ConsignmentModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: consignments, total: consignments.length });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. CONSIGNEE PORTAL
// ==========================================
portalsRouter.get('/consignee/dashboard', requirePermission('read', 'portals'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const consigneeId = req.auth?.consigneeId || String(req.query.consigneeId || '');

    const filter: any = { tenantId };
    if (consigneeId) filter.consigneeId = consigneeId;

    const [expectedDeliveries, inTransit, deliveredHistory, shipments] = await Promise.all([
      ConsignmentModel.countDocuments({ ...filter, currentStatus: { $in: ['BOOKED', 'VEHICLE_ASSIGNED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } }),
      ConsignmentModel.countDocuments({ ...filter, currentStatus: 'IN_TRANSIT' }),
      ConsignmentModel.countDocuments({ ...filter, currentStatus: { $in: ['DELIVERED', 'POD_RECEIVED', 'CLOSED'] } }),
      ConsignmentModel.find(filter).sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    res.json({
      success: true,
      data: {
        metrics: {
          expectedDeliveries,
          inTransit,
          deliveredHistory,
        },
        shipments,
      },
    });
  } catch (err) {
    next(err);
  }
});

portalsRouter.get('/consignee/shipments', requirePermission('read', 'portals'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const consigneeId = req.auth?.consigneeId || String(req.query.consigneeId || '');
    const filter: any = { tenantId };
    if (consigneeId) filter.consigneeId = consigneeId;

    const shipments = await ConsignmentModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: shipments, total: shipments.length });
  } catch (err) {
    next(err);
  }
});

portalsRouter.get('/consignee/pod/:consignmentId', requirePermission('read', 'portals'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const consignment: any = await ConsignmentModel.findOne({
      $or: [{ id: req.params.consignmentId }, { consignmentNo: req.params.consignmentId }, { lrNo: req.params.consignmentId }],
    }).lean();

    if (!consignment) return next(new Error('Consignment not found'));

    res.json({
      success: true,
      data: {
        consignmentNo: consignment.consignmentNo,
        lrNo: consignment.lrNo,
        podUrl: consignment.podUrl || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80',
        receiverName: consignment.receiverName,
        deliveryDate: consignment.deliveryDate,
        verified: consignment.currentStatus === 'POD_RECEIVED' || consignment.currentStatus === 'CLOSED',
      },
    });
  } catch (err) {
    next(err);
  }
});
