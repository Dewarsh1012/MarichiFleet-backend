import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../platform/types.js';
import { AppError } from '../../platform/errors.js';
import { MAX_UPLOAD_BYTES, parseFullContentRange } from '../documents/documents.router.js';
import {
  assertTenantAndDriverOwnership,
  driverIdFromAuth,
  sameMutationIdentity,
} from './sync.authorization.js';
import {
  fuelSubmittedPayloadSchema,
  mutationSchema,
  podCapturePayloadSchema,
  syncEnvelopeSchema,
} from './sync.schemas.js';

function driverAuth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'usr_driver_01',
    email: 'driver@example.com',
    name: 'Driver',
    tenantId: 'tenant_1',
    orgId: 'org_1',
    role: 'DRIVER',
    branches: [],
    permissions: [],
    ...overrides,
  };
}

test('driver scope comes only from authenticated claims', () => {
  assert.equal(driverIdFromAuth(driverAuth()), 'drv_01');
  assert.equal(driverIdFromAuth({ ...driverAuth(), userId: 'user_99', driverId: 'drv_99' } as AuthContext), 'drv_99');
  assert.throws(
    () => driverIdFromAuth(driverAuth({ role: 'DISPATCHER' })),
    (error: unknown) => error instanceof AppError && error.httpStatus === 403,
  );
});

test('tenant and driver ownership must both match', () => {
  assert.doesNotThrow(() =>
    assertTenantAndDriverOwnership(
      { tenantId: 'tenant_1', driverId: 'drv_01' },
      'tenant_1',
      'drv_01',
      'Trip',
    ),
  );
  assert.throws(
    () => assertTenantAndDriverOwnership(
      { tenantId: 'tenant_2', driverId: 'drv_01' },
      'tenant_1',
      'drv_01',
      'Trip',
    ),
    (error: unknown) => error instanceof AppError && error.httpStatus === 404,
  );
  assert.throws(
    () => assertTenantAndDriverOwnership(
      { tenantId: 'tenant_1', driverId: 'drv_02' },
      'tenant_1',
      'drv_01',
      'Trip',
    ),
    (error: unknown) => error instanceof AppError && error.httpStatus === 403,
  );
});

test('idempotent replay requires identical device, sequence and payload hash', () => {
  const prior = { deviceId: 'dev_1', seq: 4, payloadHash: 'abc' };
  assert.equal(sameMutationIdentity(prior, prior), true);
  assert.equal(sameMutationIdentity(prior, { ...prior, seq: 5 }), false);
  assert.equal(sameMutationIdentity(prior, { ...prior, payloadHash: 'def' }), false);
});

test('content range accepts only a full bounded upload', () => {
  assert.deepEqual(parseFullContentRange('bytes 0-9/10', 10), { statusQuery: false });
  assert.deepEqual(parseFullContentRange('bytes */10', 10), { statusQuery: true });
  assert.throws(() => parseFullContentRange('bytes 5-9/10', 10), AppError);
  assert.equal(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
});

test('POD validation requires uploaded evidence and valid confirmation', () => {
  const base = {
    podId: 'pod_1',
    tripId: 'trip_1',
    consigneeName: 'Receiver',
    expected: 10,
    delivered: 10,
    confirmation: { method: 'otp', otp: '1234' },
    photoKeys: ['obj_00000000-0000-4000-8000-000000000000'],
  };
  assert.equal(podCapturePayloadSchema.safeParse(base).success, true);
  assert.equal(podCapturePayloadSchema.safeParse({ ...base, photoKeys: [] }).success, false);
  assert.equal(
    podCapturePayloadSchema.safeParse({
      ...base,
      confirmation: { method: 'otp', otp: '12' },
    }).success,
    false,
  );
});

test('fuel validation rejects negative financial and odometer values', () => {
  const base = {
    vehicleId: 'vehicle_1',
    litres: 20,
    amount: 2000,
    odometerKm: 400,
    photoKeys: ['obj_00000000-0000-4000-8000-000000000000'],
  };
  assert.equal(fuelSubmittedPayloadSchema.safeParse(base).success, true);
  assert.equal(fuelSubmittedPayloadSchema.safeParse({ ...base, amount: -1 }).success, false);
});

test('mutation type and payload version are discriminated strictly', () => {
  const mutation = {
    mutationId: 'mut_1',
    seq: 1,
    type: 'trip.event',
    payloadVersion: 1,
    clientTs: new Date().toISOString(),
    payload: {
      tripId: 'trip_1',
      event: 'trip.departed',
      actorId: 'untrusted_but_ignored',
      photoKeys: [],
    },
  };
  assert.equal(mutationSchema.safeParse(mutation).success, true);
  assert.equal(mutationSchema.safeParse({ ...mutation, payloadVersion: 2 }).success, false);
});

test('batch validation enforces contiguous sequence ordering', () => {
  const mutation = {
    mutationId: 'mut_1',
    seq: 1,
    type: 'trip.event',
    payloadVersion: 1,
    clientTs: new Date().toISOString(),
    payload: { tripId: 'trip_1', event: 'trip.departed', photoKeys: [] },
  };
  assert.equal(syncEnvelopeSchema.safeParse({
    deviceId: 'dev_1',
    clientVersion: 'web-driver-1',
    mutations: [mutation, { ...mutation, mutationId: 'mut_2', seq: 2 }],
  }).success, true);
  assert.equal(syncEnvelopeSchema.safeParse({
    deviceId: 'dev_1',
    clientVersion: 'web-driver-1',
    mutations: [mutation, { ...mutation, mutationId: 'mut_3', seq: 3 }],
  }).success, false);
});
