import { v4 as uuidv4 } from 'uuid';
import {
  GeofenceEventModel,
  GeofenceModel,
  GeofenceStateModel,
  GpsPointModel,
  IGeofence,
  IGpsPoint,
  TripModel,
} from '../../db/models/index.js';
import { AppError } from '../../platform/errors.js';

export type Coordinate = { latitude: number; longitude: number };

type GeofenceShape = Pick<IGeofence, 'type' | 'center' | 'radiusKm' | 'polygon'>;

function distanceKm(a: Coordinate, b: Coordinate): number {
  const earthRadiusKm = 6371;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointInPolygon(point: Coordinate, polygon: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];
    const intersects =
      current.lat > point.latitude !== previous.lat > point.latitude &&
      point.longitude <
        ((previous.lng - current.lng) * (point.latitude - current.lat)) /
          (previous.lat - current.lat) +
          current.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPointInsideGeofence(point: Coordinate, fence: GeofenceShape): boolean {
  if (fence.type === 'POLYGON') {
    return Boolean(fence.polygon && fence.polygon.length >= 3 && pointInPolygon(point, fence.polygon));
  }
  if (!fence.center || !fence.radiusKm) return false;
  return (
    distanceKm(point, {
      latitude: fence.center.lat,
      longitude: fence.center.lng,
    }) <= fence.radiusKm
  );
}

export interface IngestGpsPointInput {
  tenantId: string;
  tripId: string;
  vehicleRegNumber: string;
  latitude: number;
  longitude: number;
  speedKmH: number;
  heading: number;
  accuracyM?: number;
  source: string;
  idempotencyKey: string;
  recordedAt: Date;
}

export async function ingestGpsPoint(input: IngestGpsPointInput) {
  const trip = await TripModel.findOne({
    tenantId: input.tenantId,
    id: input.tripId,
    vehicleRegNumber: input.vehicleRegNumber,
  })
    .select({ id: 1 })
    .lean();
  if (!trip) throw AppError.notFound('Trip', input.tripId);

  let point: IGpsPoint;
  let created = true;
  try {
    point = await GpsPointModel.create({
      id: `gps_${uuidv4()}`,
      ...input,
      receivedAt: new Date(),
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const existing = await GpsPointModel.findOne({
      tenantId: input.tenantId,
      idempotencyKey: input.idempotencyKey,
    });
    if (!existing) throw error;
    const sameIntent =
      existing.tripId === input.tripId &&
      existing.vehicleRegNumber === input.vehicleRegNumber &&
      existing.latitude === input.latitude &&
      existing.longitude === input.longitude &&
      existing.recordedAt.getTime() === input.recordedAt.getTime();
    if (!sameIntent) {
      throw AppError.conflict('Idempotency key was already used for a different GPS point');
    }
    point = existing;
    created = false;
  }

  if (!created) {
    const events = await GeofenceEventModel.find({
      tenantId: input.tenantId,
      pointId: point.id,
    }).lean();
    return { point, events, created };
  }

  const fences = (await GeofenceModel.find({
    tenantId: input.tenantId,
    isActive: true,
  }).lean()) as unknown as IGeofence[];
  const events: any[] = [];

  for (const fence of fences) {
    const inside = isPointInsideGeofence(input, fence);
    const stateFilter = {
      tenantId: input.tenantId,
      tripId: input.tripId,
      vehicleRegNumber: input.vehicleRegNumber,
      geofenceId: fence.id,
    };
    const previous: any = await GeofenceStateModel.findOne(stateFilter).lean();

    if (previous && previous.lastRecordedAt >= input.recordedAt) continue;
    const eventType = previous
      ? inside !== previous.isInside
        ? inside
          ? 'ENTER'
          : 'EXIT'
        : undefined
      : inside
        ? 'ENTER'
        : undefined;

    await GeofenceStateModel.findOneAndUpdate(
      stateFilter,
      {
        $set: {
          isInside: inside,
          lastPointId: point.id,
          lastRecordedAt: input.recordedAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (!eventType) continue;
    if (
      (eventType === 'ENTER' && !fence.alertOnEntry) ||
      (eventType === 'EXIT' && !fence.alertOnExit)
    ) {
      continue;
    }
    const event = await GeofenceEventModel.findOneAndUpdate(
      {
        tenantId: input.tenantId,
        tripId: input.tripId,
        geofenceId: fence.id,
        pointId: point.id,
        type: eventType,
      },
      {
        $setOnInsert: {
          id: `gfe_${uuidv4()}`,
          vehicleRegNumber: input.vehicleRegNumber,
          geofenceName: fence.name,
          latitude: input.latitude,
          longitude: input.longitude,
          occurredAt: input.recordedAt,
          recordedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    ).lean();
    events.push(event);
  }

  return { point, events, created };
}

export function encodeHistoryCursor(recordedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ recordedAt: recordedAt.toISOString(), id })).toString(
    'base64url'
  );
}

export function decodeHistoryCursor(cursor: string): { recordedAt: Date; id: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const recordedAt = new Date(value.recordedAt);
    if (!value.id || Number.isNaN(recordedAt.getTime())) throw new Error('invalid');
    return { recordedAt, id: value.id };
  } catch {
    throw AppError.badRequest('Invalid history cursor');
  }
}
