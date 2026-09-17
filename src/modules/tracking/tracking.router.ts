import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  GeofenceEventModel,
  GpsPointModel,
  PublicTrackingLinkModel,
  TripModel,
} from '../../db/models/index.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { AppError } from '../../platform/errors.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  ingestGpsPoint,
} from './tracking.service.js';
import {
  createSignedOpaqueToken,
  hashTrackingToken,
  verifySignedOpaqueToken,
} from './tracking-token.service.js';

export const trackingRouter = Router();
export const publicTrackingRouter = Router();

const tripParamsSchema = z.object({ tripId: z.string().min(1).max(100) });
const linkParamsSchema = z.object({ linkId: z.string().min(1).max(100) });
const publicTokenParamsSchema = z.object({ token: z.string().min(40).max(256) });

const gpsPointSchema = z
  .object({
    tripId: z.string().min(1).max(100),
    vehicleRegNumber: z.string().min(4).max(32),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    speedKmH: z.number().min(0).max(300).default(0),
    heading: z.number().min(0).max(360).default(0),
    accuracyM: z.number().min(0).max(10_000).optional(),
    source: z.string().min(1).max(50).default('API'),
    recordedAt: z.coerce.date(),
  })
  .strict();

const historyQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(200),
    cursor: z.string().max(500).optional(),
  })
  .strict();

const createPublicLinkSchema = z
  .object({
    tripId: z.string().min(1).max(100),
    expiresInHours: z.number().int().min(1).max(24 * 30).default(72),
  })
  .strict();

trackingRouter.post(
  '/points',
  requirePermission('update', 'tower'),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const body = gpsPointSchema.parse(req.body);
      if (!req.idempotencyKey) {
        throw AppError.badRequest('Idempotency-Key header is required');
      }
      const result = await ingestGpsPoint({
        tenantId: req.auth!.tenantId,
        idempotencyKey: req.idempotencyKey,
        ...body,
      });
      if (result.created) {
        await recordAudit({
          tenantId: req.auth!.tenantId,
          module: 'tracking',
          resourceId: result.point.id,
          action: 'GPS_POINT_INGESTED',
          actor: req.auth!,
          details: {
            tripId: body.tripId,
            geofenceEventIds: result.events.map((event) => event?.id),
          },
          ipAddress: req.ip,
        });
      }
      res.status(result.created ? 201 : 200).json({
        success: true,
        data: { point: result.point, geofenceEvents: result.events },
        idempotentReplay: !result.created,
      });
    } catch (error) {
      next(error);
    }
  }
);

trackingRouter.get(
  '/trips/:tripId/history',
  requirePermission('read', 'tower'),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { tripId } = tripParamsSchema.parse(req.params);
      const query = historyQuerySchema.parse(req.query);
      const to = query.to ?? new Date();
      const from = query.from ?? new Date(to.getTime() - 24 * 60 * 60 * 1000);
      if (from >= to) throw AppError.badRequest('from must be earlier than to');
      if (to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
        throw AppError.badRequest('History range cannot exceed 31 days');
      }
      const tenantId = req.auth!.tenantId;
      const trip = await TripModel.exists({ tenantId, id: tripId });
      if (!trip) throw AppError.notFound('Trip', tripId);

      const filter: any = {
        tenantId,
        tripId,
        recordedAt: { $gte: from, $lte: to },
      };
      if (query.cursor) {
        const cursor = decodeHistoryCursor(query.cursor);
        filter.$or = [
          { recordedAt: { $lt: cursor.recordedAt, $gte: from } },
          { recordedAt: cursor.recordedAt, id: { $lt: cursor.id } },
        ];
      }
      const points = await GpsPointModel.find(filter)
        .sort({ recordedAt: -1, id: -1 })
        .limit(query.limit + 1)
        .lean();
      const hasMore = points.length > query.limit;
      const data = hasMore ? points.slice(0, query.limit) : points;
      const last = data.at(-1);
      res.json({
        success: true,
        data,
        page: {
          hasMore,
          nextCursor:
            hasMore && last ? encodeHistoryCursor(last.recordedAt, last.id) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

trackingRouter.get(
  '/trips/:tripId/geofence-events',
  requirePermission('read', 'tower'),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { tripId } = tripParamsSchema.parse(req.params);
      const query = historyQuerySchema.omit({ cursor: true }).parse(req.query);
      const to = query.to ?? new Date();
      const from = query.from ?? new Date(to.getTime() - 24 * 60 * 60 * 1000);
      if (from >= to || to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
        throw AppError.badRequest('Event range must be positive and no more than 31 days');
      }
      const events = await GeofenceEventModel.find({
        tenantId: req.auth!.tenantId,
        tripId,
        occurredAt: { $gte: from, $lte: to },
      })
        .sort({ occurredAt: -1, id: -1 })
        .limit(query.limit)
        .lean();
      res.json({ success: true, data: events, total: events.length });
    } catch (error) {
      next(error);
    }
  }
);

trackingRouter.post(
  '/public-links',
  requirePermission('create', 'trips'),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const body = createPublicLinkSchema.parse(req.body);
      const tenantId = req.auth!.tenantId;
      const trip = await TripModel.exists({ tenantId, id: body.tripId });
      if (!trip) throw AppError.notFound('Trip', body.tripId);
      const token = createSignedOpaqueToken();
      const expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000);
      const link = await PublicTrackingLinkModel.create({
        id: `ptl_${uuidv4()}`,
        tenantId,
        tripId: body.tripId,
        tokenHash: hashTrackingToken(token),
        expiresAt,
        createdBy: req.auth!.userId,
      });
      await recordAudit({
        tenantId,
        module: 'tracking',
        resourceId: link.id,
        action: 'PUBLIC_TRACKING_LINK_CREATED',
        actor: req.auth!,
        details: { tripId: body.tripId, expiresAt },
        ipAddress: req.ip,
      });
      res.status(201).json({
        success: true,
        data: { linkId: link.id, token, expiresAt },
      });
    } catch (error) {
      next(error);
    }
  }
);

trackingRouter.post(
  '/public-links/:linkId/revoke',
  requirePermission('delete', 'trips'),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { linkId } = linkParamsSchema.parse(req.params);
      z.object({}).strict().parse(req.body ?? {});
      const revokedAt = new Date();
      const link: any = await PublicTrackingLinkModel.findOneAndUpdate(
        { tenantId: req.auth!.tenantId, id: linkId, revokedAt: { $exists: false } },
        { $set: { revokedAt } },
        { new: true }
      ).lean();
      if (!link) throw AppError.notFound('Public tracking link', linkId);
      await recordAudit({
        tenantId: req.auth!.tenantId,
        module: 'tracking',
        resourceId: linkId,
        action: 'PUBLIC_TRACKING_LINK_REVOKED',
        actor: req.auth!,
        details: { tripId: link.tripId, revokedAt },
        ipAddress: req.ip,
      });
      res.json({ success: true, data: { linkId, revokedAt } });
    } catch (error) {
      next(error);
    }
  }
);

publicTrackingRouter.get('/public/:token', async (req, res, next) => {
  try {
    const { token } = publicTokenParamsSchema.parse(req.params);
    if (!verifySignedOpaqueToken(token)) throw AppError.notFound('Tracking link');
    const link: any = await PublicTrackingLinkModel.findOne({
      tokenHash: hashTrackingToken(token),
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!link) throw AppError.notFound('Tracking link');
    const [tripResult, pointResult] = await Promise.all([
      TripModel.findOne({ tenantId: link.tenantId, id: link.tripId })
        .select({ status: 1, eta: 1, _id: 0 })
        .lean(),
      GpsPointModel.findOne({ tenantId: link.tenantId, tripId: link.tripId })
        .sort({ recordedAt: -1 })
        .select({ latitude: 1, longitude: 1, recordedAt: 1, _id: 0 })
        .lean(),
    ]);
    const trip: any = tripResult;
    const point: any = pointResult;
    if (!trip) throw AppError.notFound('Tracking link');
    res.json({
      success: true,
      data: {
        shipment: {
          status: trip.status,
          eta: trip.eta ?? null,
          location: point
            ? {
                latitude: point.latitude,
                longitude: point.longitude,
                updatedAt: point.recordedAt,
              }
            : null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});
