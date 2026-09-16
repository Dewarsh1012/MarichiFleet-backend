import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { ConsignmentModel, ConsignorModel, ConsigneeModel } from '../../db/models/index.js';

export const reportsRouter = Router();

// 1. Consignor-wise Revenue Report
reportsRouter.get('/consignor-revenue', requirePermission('read', 'reports'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = req.auth?.role === 'SUPER_ADMIN' ? {} : { tenantId };

    const consignments = await ConsignmentModel.find(filter).lean();
    const consignors = await ConsignorModel.find(filter).lean();
    const consignorMap = new Map(consignors.map((c) => [c.id, c.companyName]));

    const revenueMap: Record<string, { consignorName: string; totalRevenue: number; consignmentCount: number }> = {};

    for (const c of consignments) {
      const name = consignorMap.get(c.consignorId) || c.consignorId || 'Unknown Consignor';
      if (!revenueMap[c.consignorId]) {
        revenueMap[c.consignorId] = { consignorName: name, totalRevenue: 0, consignmentCount: 0 };
      }
      revenueMap[c.consignorId].totalRevenue += c.totalAmount || 0;
      revenueMap[c.consignorId].consignmentCount += 1;
    }

    const report = Object.values(revenueMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
    res.json({ success: true, data: report, total: report.length });
  } catch (err) {
    next(err);
  }
});

// 2. Consignor-wise Shipments Report
reportsRouter.get('/consignor-shipments', requirePermission('read', 'reports'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = req.auth?.role === 'SUPER_ADMIN' ? {} : { tenantId };

    const consignments = await ConsignmentModel.find(filter).lean();
    const consignors = await ConsignorModel.find(filter).lean();
    const consignorMap = new Map(consignors.map((c) => [c.id, c.companyName]));

    const breakdown: Record<string, any> = {};
    for (const c of consignments) {
      const name = consignorMap.get(c.consignorId) || c.consignorId;
      if (!breakdown[c.consignorId]) {
        breakdown[c.consignorId] = { consignorName: name, booked: 0, inTransit: 0, delivered: 0, total: 0 };
      }
      breakdown[c.consignorId].total += 1;
      if (['DRAFT', 'BOOKED', 'VEHICLE_ASSIGNED'].includes(c.currentStatus)) breakdown[c.consignorId].booked += 1;
      if (['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY'].includes(c.currentStatus)) breakdown[c.consignorId].inTransit += 1;
      if (['DELIVERED', 'POD_RECEIVED', 'CLOSED'].includes(c.currentStatus)) breakdown[c.consignorId].delivered += 1;
    }

    res.json({ success: true, data: Object.values(breakdown) });
  } catch (err) {
    next(err);
  }
});

// 3. Consignee-wise Deliveries Report
reportsRouter.get('/consignee-deliveries', requirePermission('read', 'reports'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = req.auth?.role === 'SUPER_ADMIN' ? {} : { tenantId };

    const consignments = await ConsignmentModel.find({ ...filter, currentStatus: { $in: ['DELIVERED', 'POD_RECEIVED', 'CLOSED'] } }).lean();
    const consignees = await ConsigneeModel.find(filter).lean();
    const consigneeMap = new Map(consignees.map((c) => [c.id, c.companyName]));

    const counts: Record<string, { consigneeName: string; totalDelivered: number; lastDelivery: string }> = {};
    for (const c of consignments) {
      const name = consigneeMap.get(c.consigneeId) || c.consigneeId;
      if (!counts[c.consigneeId]) {
        counts[c.consigneeId] = { consigneeName: name, totalDelivered: 0, lastDelivery: c.deliveryDate || '' };
      }
      counts[c.consigneeId].totalDelivered += 1;
      if (c.deliveryDate && c.deliveryDate > counts[c.consigneeId].lastDelivery) {
        counts[c.consigneeId].lastDelivery = c.deliveryDate;
      }
    }

    res.json({ success: true, data: Object.values(counts) });
  } catch (err) {
    next(err);
  }
});

// 4. Branch-wise Consignments Report
reportsRouter.get('/branch-consignments', requirePermission('read', 'reports'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = req.auth?.role === 'SUPER_ADMIN' ? {} : { tenantId };

    const consignments = await ConsignmentModel.find(filter).lean();
    const branches: Record<string, { branchId: string; total: number; revenue: number }> = {};

    for (const c of consignments) {
      const b = c.branchId || 'br_01';
      if (!branches[b]) {
        branches[b] = { branchId: b, total: 0, revenue: 0 };
      }
      branches[b].total += 1;
      branches[b].revenue += c.totalAmount || 0;
    }

    res.json({ success: true, data: Object.values(branches) });
  } catch (err) {
    next(err);
  }
});

// 5. Pending POD Report
reportsRouter.get('/pending-pod', requirePermission('read', 'reports'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = {
      ...(req.auth?.role === 'SUPER_ADMIN' ? {} : { tenantId }),
      currentStatus: 'DELIVERED',
      $or: [{ podUrl: null }, { podUrl: '' }],
    };

    const pending = await ConsignmentModel.find(filter).sort({ deliveryDate: 1 }).lean();
    res.json({ success: true, data: pending, total: pending.length });
  } catch (err) {
    next(err);
  }
});

// 6. In-Transit Report
reportsRouter.get('/in-transit', requirePermission('read', 'reports'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = {
      ...(req.auth?.role === 'SUPER_ADMIN' ? {} : { tenantId }),
      currentStatus: { $in: ['PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY'] },
    };

    const inTransit = await ConsignmentModel.find(filter).sort({ shipmentDate: -1 }).lean();
    res.json({ success: true, data: inTransit, total: inTransit.length });
  } catch (err) {
    next(err);
  }
});

// 7. SLA Breach Report
reportsRouter.get('/sla-breaches', requirePermission('read', 'reports'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const today = new Date().toISOString().split('T')[0];

    // Find consignments where expectedDeliveryDate < today and status is not DELIVERED or CLOSED
    const filter: any = {
      ...(req.auth?.role === 'SUPER_ADMIN' ? {} : { tenantId }),
      expectedDeliveryDate: { $lt: today },
      currentStatus: { $nin: ['DELIVERED', 'POD_RECEIVED', 'CLOSED'] },
    };

    const breaches = await ConsignmentModel.find(filter).lean();
    res.json({ success: true, data: breaches, total: breaches.length });
  } catch (err) {
    next(err);
  }
});

// 8. International Shipment Report
reportsRouter.get('/international-shipments', requirePermission('read', 'reports'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = {
      ...(req.auth?.role === 'SUPER_ADMIN' ? {} : { tenantId }),
      $or: [{ hsCode: { $ne: null } }, { incoterm: { $ne: null } }, { containerNo: { $ne: null } }, { billOfLadingNo: { $ne: null } }],
    };

    const international = await ConsignmentModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: international, total: international.length });
  } catch (err) {
    next(err);
  }
});
