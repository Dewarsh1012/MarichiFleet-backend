import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  ComplianceItemModel,
  GeofenceEventModel,
  GeofenceModel,
  GpsPointModel,
  PublicTrackingLinkModel,
  TripModel,
} from '../db/models/index.js';
import { evaluateDispatchCompliance } from '../modules/compliance/compliance.service.js';
import {
  ingestGpsPoint,
  isPointInsideGeofence,
} from '../modules/tracking/tracking.service.js';
import {
  createSignedOpaqueToken,
  hashTrackingToken,
  verifySignedOpaqueToken,
} from '../modules/tracking/tracking-token.service.js';

async function run() {
  const mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await mongoose.connect(mongo.getUri());
  try {
    const secret = 'test-tracking-secret-that-is-at-least-32-bytes';
    const token = createSignedOpaqueToken(secret);
    assert.equal(verifySignedOpaqueToken(token, secret), true);
    assert.equal(verifySignedOpaqueToken(`${token}tampered`, secret), false);
    assert.equal(hashTrackingToken(token).length, 64);
    assert.equal(token.includes('trip-test'), false);
    const link = await PublicTrackingLinkModel.create({
      id: 'link-test',
      tenantId: 'tenant-a',
      tripId: 'trip-test',
      tokenHash: hashTrackingToken(token),
      expiresAt: new Date(Date.now() + 60_000),
      createdBy: 'test-user',
    });
    await PublicTrackingLinkModel.updateOne(
      { id: link.id, tenantId: 'tenant-a' },
      { $set: { revokedAt: new Date() } }
    );
    assert.equal(
      await PublicTrackingLinkModel.exists({
        tokenHash: hashTrackingToken(token),
        revokedAt: { $exists: false },
      }),
      null
    );

    assert.equal(
      isPointInsideGeofence(
        { latitude: 28.6139, longitude: 77.209 },
        { type: 'CIRCLE', center: { lat: 28.6139, lng: 77.209 }, radiusKm: 1 }
      ),
      true
    );
    assert.equal(
      isPointInsideGeofence(
        { latitude: 1, longitude: 1 },
        {
          type: 'POLYGON',
          polygon: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 2 },
            { lat: 2, lng: 2 },
            { lat: 2, lng: 0 },
          ],
        }
      ),
      true
    );

    await Promise.all([GpsPointModel.init(), GeofenceEventModel.init()]);
    await TripModel.create({
      id: 'trip-test',
      tenantId: 'tenant-a',
      clientName: 'Client',
      origin: 'Delhi',
      destination: 'Mumbai',
      vehicleRegNumber: 'DL01AB1234',
      driverId: 'driver-1',
      driverName: 'Driver',
      driverPhone: '9999999999',
      weightTons: 5,
      totalDistanceKm: 100,
      completedDistanceKm: 0,
      status: 'DISPATCHED',
      slaStatus: 'ON_TIME',
      freightAmount: 1000,
      advancePaid: 0,
      detentionAccrued: 0,
    });
    await GeofenceModel.create({
      id: 'fence-1',
      tenantId: 'tenant-a',
      name: 'Depot',
      type: 'CIRCLE',
      center: { lat: 28.6139, lng: 77.209 },
      radiusKm: 1,
      category: 'LOADING_POINT',
      isActive: true,
      alertOnEntry: true,
      alertOnExit: true,
    });

    const basePoint = {
      tenantId: 'tenant-a',
      tripId: 'trip-test',
      vehicleRegNumber: 'DL01AB1234',
      speedKmH: 20,
      heading: 90,
      source: 'TEST',
    };
    const outside = await ingestGpsPoint({
      ...basePoint,
      latitude: 28.7,
      longitude: 77.3,
      recordedAt: new Date('2026-09-17T05:00:00.000Z'),
      idempotencyKey: 'gps-outside',
    });
    assert.equal(outside.events.length, 0);

    const entered = await ingestGpsPoint({
      ...basePoint,
      latitude: 28.6139,
      longitude: 77.209,
      recordedAt: new Date('2026-09-17T05:01:00.000Z'),
      idempotencyKey: 'gps-enter',
    });
    assert.equal(entered.events[0]?.type, 'ENTER');

    const replay = await ingestGpsPoint({
      ...basePoint,
      latitude: 28.6139,
      longitude: 77.209,
      recordedAt: new Date('2026-09-17T05:01:00.000Z'),
      idempotencyKey: 'gps-enter',
    });
    assert.equal(replay.created, false);
    assert.equal(await GeofenceEventModel.countDocuments({ type: 'ENTER' }), 1);

    const exited = await ingestGpsPoint({
      ...basePoint,
      latitude: 28.7,
      longitude: 77.3,
      recordedAt: new Date('2026-09-17T05:02:00.000Z'),
      idempotencyKey: 'gps-exit',
    });
    assert.equal(exited.events[0]?.type, 'EXIT');
    await assert.rejects(
      ingestGpsPoint({
        ...basePoint,
        tenantId: 'tenant-b',
        latitude: 28.6139,
        longitude: 77.209,
        recordedAt: new Date(),
        idempotencyKey: 'cross-tenant',
      }),
      /not found/
    );

    await ComplianceItemModel.create({
      id: 'cmp-expired',
      tenantId: 'tenant-a',
      entityType: 'VEHICLE',
      entityId: 'DL01AB1234',
      entityLabel: 'Truck',
      itemType: 'FITNESS_CERTIFICATE',
      description: '',
      dueDate: new Date('2026-09-16T00:00:00.000Z'),
      status: 'COMPLIANT',
    });
    const blockers = await evaluateDispatchCompliance({
      tenantId: 'tenant-a',
      vehicleRegNumber: 'DL01AB1234',
      driverId: 'driver-1',
      at: new Date('2026-09-17T00:00:00.000Z'),
    });
    assert.equal(blockers[0]?.code, 'COMPLIANCE_EXPIRED');
    assert.equal(blockers[0]?.entityId, 'DL01AB1234');

    console.log('Tracking and compliance tests passed');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
