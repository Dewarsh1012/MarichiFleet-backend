import type { AuthContext } from '../../platform/types.js';
import { AppError } from '../../platform/errors.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import {
  ApprovalModel,
  DriverModel,
  ExpenseModel,
  FuelEntryModel,
  PODModel,
  TripModel,
  VehicleModel,
} from '../../db/models/index.js';
import { DocumentUploadTicketModel } from '../documents/documents.router.js';
import {
  ProcessedMutationModel,
  SyncDeviceStateModel,
  SyncTripEventModel,
} from './sync.models.js';
import { mutationHash, type SyncMutation } from './sync.schemas.js';
import {
  assertTenantAndDriverOwnership,
  driverIdFromAuth,
  sameMutationIdentity,
} from './sync.authorization.js';

export interface SyncMutationResult {
  mutationId: string;
  status: 'acked' | 'rejected';
  replayed?: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; expectedSeq?: number; retryable?: boolean };
}

function scopeKey(auth: AuthContext, deviceId: string) {
  return `${auth.tenantId}:${auth.userId}:${deviceId}`;
}

function receiptKey(auth: AuthContext, mutationId: string) {
  return `${auth.tenantId}:${mutationId}`;
}

async function verifyAttachments(auth: AuthContext, keys: string[]) {
  if (keys.length === 0) return;
  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length !== keys.length) throw AppError.badRequest('Duplicate attachment objectKey');
  const count = await DocumentUploadTicketModel.countDocuments({
    tenantId: auth.tenantId,
    createdBy: auth.userId,
    objectKey: { $in: uniqueKeys },
    status: 'COMPLETED',
  });
  if (count !== uniqueKeys.length) {
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      'One or more attachments are missing, incomplete, or owned by another user',
      422,
      { code: 'ATTACHMENT_NOT_UPLOADED' },
    );
  }
}

async function ownedTrip(auth: AuthContext, driverId: string, tripId: string) {
  const trip: any = await TripModel.findOne({ tenantId: auth.tenantId, id: tripId }).lean();
  assertTenantAndDriverOwnership(trip, auth.tenantId, driverId, 'Trip');
  return trip;
}

async function ownedVehicle(auth: AuthContext, driverId: string, vehicleId: string) {
  const vehicle: any = await VehicleModel.findOne({ tenantId: auth.tenantId, id: vehicleId }).lean();
  if (!vehicle) throw AppError.notFound('Vehicle', vehicleId);
  if (vehicle.assignedDriverId !== driverId) {
    throw AppError.forbidden('Vehicle is not assigned to the authenticated driver');
  }
  return vehicle;
}

async function applyMutation(
  auth: AuthContext,
  driver: any,
  deviceId: string,
  mutation: SyncMutation,
  recovering: boolean,
): Promise<Record<string, unknown>> {
  const now = new Date();
  if (mutation.type === 'trip.event') {
    const trip = await ownedTrip(auth, driver.id, mutation.payload.tripId);
    const { actorId: _ignoredActorId, ...trustedPayload } = mutation.payload;
    await SyncTripEventModel.updateOne(
      { tenantId: auth.tenantId, mutationId: mutation.mutationId },
      {
        $setOnInsert: {
          id: `tev_${mutation.mutationId}`,
          tenantId: auth.tenantId,
          tripId: trip.id,
          driverId: driver.id,
          mutationId: mutation.mutationId,
          deviceId,
          type: mutation.payload.event,
          payloadVersion: mutation.payloadVersion,
          payload: trustedPayload,
          occurredAt: new Date(mutation.clientTs),
          recordedAt: now,
          clockSkewMs: Math.abs(now.getTime() - new Date(mutation.clientTs).getTime()),
        },
      },
      { upsert: true },
    );
    const nextStatus = mutation.payload.event === 'trip.departed'
      ? 'IN_TRANSIT'
      : mutation.payload.event === 'trip.delivered' ? 'DELIVERED' : undefined;
    if (nextStatus) {
      await TripModel.updateOne(
        { tenantId: auth.tenantId, id: trip.id, driverId: driver.id },
        { $set: { status: nextStatus } },
      );
    }
    return { resourceType: 'trip_event', resourceId: `tev_${mutation.mutationId}`, tripId: trip.id };
  }

  await verifyAttachments(auth, mutation.payload.photoKeys);

  if (mutation.type === 'pod.capture') {
    const trip = await ownedTrip(auth, driver.id, mutation.payload.tripId);
    const existing = await PODModel.findOne({ id: mutation.payload.podId }).lean();
    if (existing && !recovering) throw AppError.conflict('POD id already exists');
    if (existing && (
      (existing as any).tenantId !== auth.tenantId ||
      (existing as any).tripId !== trip.id
    )) {
      throw AppError.conflict('POD id belongs to another resource');
    }
    const clean = mutation.payload.delivered >= mutation.payload.expected;
    if (!existing) {
      await PODModel.create({
        id: mutation.payload.podId,
        tenantId: auth.tenantId,
        tripId: trip.id,
        vehicleRegNumber: trip.vehicleRegNumber,
        signedByName: mutation.payload.consigneeName,
        signedByDesignation: 'Consignee',
        podPhotoUrl: mutation.payload.photoKeys[0],
        submittedAt: now,
        isCleanPOD: clean,
        shortageUnits: Math.max(0, mutation.payload.expected - mutation.payload.delivered),
        damageUnits: 0,
        remarks: mutation.payload.note,
        status: 'SUBMITTED',
      });
    }
    await TripModel.updateOne(
      { tenantId: auth.tenantId, id: trip.id, driverId: driver.id },
      {
        $set: {
          status: 'DELIVERED',
          pod: {
            signedByName: mutation.payload.consigneeName,
            podPhotoUrl: mutation.payload.photoKeys[0],
            submittedAt: now,
            isCleanPOD: clean,
            shortageUnits: Math.max(0, mutation.payload.expected - mutation.payload.delivered),
            damageUnits: 0,
          },
        },
      },
    );
    return { resourceType: 'pod', resourceId: mutation.payload.podId, tripId: trip.id };
  }

  if (mutation.type === 'fuel.entry.submitted') {
    const vehicle = await ownedVehicle(auth, driver.id, mutation.payload.vehicleId);
    if (mutation.payload.tripId) await ownedTrip(auth, driver.id, mutation.payload.tripId);
    const fuelId = `fuel_${mutation.mutationId}`;
    const approvalId = `appr_${mutation.mutationId}`;
    await FuelEntryModel.updateOne(
      { id: fuelId, tenantId: auth.tenantId },
      {
        $setOnInsert: {
          id: fuelId,
          tenantId: auth.tenantId,
          vehicleRegNumber: vehicle.regNumber,
          driverPhone: driver.phone,
          tripId: mutation.payload.tripId,
          pumpName: mutation.payload.station || 'Unspecified station',
          volumeLitres: mutation.payload.litres,
          ratePerLitre: mutation.payload.amount / mutation.payload.litres,
          totalAmount: mutation.payload.amount,
          slipNumber: '',
          fuelType: 'DIESEL (HSD BS-VI)',
          odometerKm: mutation.payload.odometerKm,
          receiptUrl: mutation.payload.photoKeys[0],
          geoCheckPassed: false,
          approvalId,
          status: 'PENDING_APPROVAL',
        },
      },
      { upsert: true },
    );
    await ApprovalModel.updateOne(
      { id: approvalId, tenantId: auth.tenantId },
      {
        $setOnInsert: {
          id: approvalId,
          tenantId: auth.tenantId,
          department: 'FINANCE',
          category: 'FUEL_REFILL',
          title: `Diesel ${mutation.payload.litres}L @ ${mutation.payload.station || 'Unspecified station'}`,
          requestedBy: driver.name,
          driverPhone: driver.phone,
          vehicleRegNumber: vehicle.regNumber,
          tripId: mutation.payload.tripId,
          amount: mutation.payload.amount,
          fuelDetails: {
            pumpName: mutation.payload.station || 'Unspecified station',
            volumeLitres: mutation.payload.litres,
            ratePerLitre: mutation.payload.amount / mutation.payload.litres,
            totalAmount: mutation.payload.amount,
            slipNumber: '',
            odometerKm: mutation.payload.odometerKm,
            receiptUrl: mutation.payload.photoKeys[0],
            geoCheckPassed: false,
          },
          status: 'PENDING',
        },
      },
      { upsert: true },
    );
    return { resourceType: 'fuel_entry', resourceId: fuelId, approvalId };
  }

  if (mutation.payload.tripId) await ownedTrip(auth, driver.id, mutation.payload.tripId);
  const expenseVehicle = mutation.payload.vehicleId
    ? await ownedVehicle(auth, driver.id, mutation.payload.vehicleId)
    : undefined;
  const expenseId = `exp_${mutation.mutationId}`;
  await ExpenseModel.updateOne(
    { id: expenseId, tenantId: auth.tenantId },
    {
      $setOnInsert: {
        id: expenseId,
        tenantId: auth.tenantId,
        tripId: mutation.payload.tripId,
        vehicleRegNumber: expenseVehicle?.regNumber,
        driverName: driver.name,
        category: mutation.payload.category,
        description: mutation.payload.note,
        amount: mutation.payload.amount,
        receiptUrl: mutation.payload.photoKeys[0],
        status: 'PENDING',
      },
    },
    { upsert: true },
  );
  return { resourceType: 'expense', resourceId: expenseId, currency: mutation.payload.currency };
}

async function claimSequence(auth: AuthContext, deviceId: string, seq: number): Promise<number> {
  const key = scopeKey(auth, deviceId);
  let state = await SyncDeviceStateModel.findOne({ scopeKey: key });
  if (!state) {
    try {
      state = await SyncDeviceStateModel.create({
        scopeKey: key,
        tenantId: auth.tenantId,
        userId: auth.userId,
        deviceId,
        lastSeq: 0,
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      state = await SyncDeviceStateModel.findOne({ scopeKey: key });
    }
  }
  if (!state) throw new AppError('INTERNAL_ERROR', 'Unable to initialize device sequence', 500);
  const expectedSeq = state.lastSeq + 1;
  if (seq !== expectedSeq) {
    throw new AppError(
      'CONCURRENCY_CONFLICT',
      `Expected device sequence ${expectedSeq}`,
      409,
      { code: 'SYNC_SEQUENCE_GAP', expectedSeq },
    );
  }
  const claimed = await SyncDeviceStateModel.findOneAndUpdate(
    {
      scopeKey: key,
      lastSeq: state.lastSeq,
      $or: [
        { processingSeq: { $exists: false } },
        { lockExpiresAt: { $lt: new Date() } },
      ],
    },
    {
      $set: {
        processingSeq: seq,
        lockExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    },
    { new: true },
  );
  if (!claimed) throw AppError.conflict('Another sync request is processing this device');
  return expectedSeq;
}

export async function processSyncMutation(input: {
  auth: AuthContext;
  driver: any;
  deviceId: string;
  mutation: SyncMutation;
  ipAddress?: string;
}): Promise<SyncMutationResult> {
  const { auth, driver, deviceId, mutation } = input;
  const payloadHash = mutationHash(mutation);
  const prior = await ProcessedMutationModel.findOne({
    tenantId: auth.tenantId,
    mutationId: mutation.mutationId,
  }).lean() as unknown as {
    deviceId: string;
    seq: number;
    payloadHash: string;
    status: 'PROCESSING' | 'DONE';
    response?: Record<string, unknown>;
  } | null;
  if (prior) {
    if (!sameMutationIdentity(prior, { deviceId, seq: mutation.seq, payloadHash })) {
      throw new AppError('IDEMPOTENCY_CONFLICT', 'mutationId was already used with different content', 409);
    }
    if (prior.status === 'DONE' && prior.response) {
      await SyncDeviceStateModel.updateOne(
        { scopeKey: scopeKey(auth, deviceId), lastSeq: mutation.seq - 1 },
        {
          $set: { lastSeq: mutation.seq },
          $unset: { processingSeq: 1, lockExpiresAt: 1 },
        },
      );
      return { ...(prior.response as unknown as SyncMutationResult), replayed: true };
    }
  }

  await claimSequence(auth, deviceId, mutation.seq);
  const key = receiptKey(auth, mutation.mutationId);
  try {
    if (!prior) {
      await ProcessedMutationModel.create({
        receiptKey: key,
        tenantId: auth.tenantId,
        userId: auth.userId,
        deviceId,
        mutationId: mutation.mutationId,
        seq: mutation.seq,
        type: mutation.type,
        payloadHash,
        status: 'PROCESSING',
      });
    }
    const data = await applyMutation(auth, driver, deviceId, mutation, Boolean(prior));
    const response: SyncMutationResult = { mutationId: mutation.mutationId, status: 'acked', data };
    await ProcessedMutationModel.updateOne(
      { receiptKey: key },
      { $set: { status: 'DONE', response, processedAt: new Date() } },
    );
    await SyncDeviceStateModel.updateOne(
      { scopeKey: scopeKey(auth, deviceId), processingSeq: mutation.seq },
      { $set: { lastSeq: mutation.seq }, $unset: { processingSeq: 1, lockExpiresAt: 1 } },
    );
    await recordAudit({
      tenantId: auth.tenantId,
      module: 'sync',
      resourceId: mutation.mutationId,
      action: mutation.type,
      actor: auth,
      details: { deviceId, seq: mutation.seq, ...data },
      ipAddress: input.ipAddress,
    });
    return response;
  } catch (error) {
    if (error instanceof AppError) {
      await ProcessedMutationModel.deleteOne({ receiptKey: key, status: 'PROCESSING' }).catch(() => undefined);
    }
    await SyncDeviceStateModel.updateOne(
      { scopeKey: scopeKey(auth, deviceId), processingSeq: mutation.seq },
      { $unset: { processingSeq: 1, lockExpiresAt: 1 } },
    ).catch(() => undefined);
    throw error;
  }
}

export async function resolveAuthenticatedDriver(auth: AuthContext) {
  const driverId = driverIdFromAuth(auth);
  const driver = await DriverModel.findOne({ tenantId: auth.tenantId, id: driverId }).lean();
  if (!driver) throw AppError.forbidden('Authenticated driver profile was not found in this tenant');
  return driver;
}

export function rejectedResult(mutationId: string, error: unknown): SyncMutationResult {
  if (error instanceof AppError) {
    return {
      mutationId,
      status: 'rejected',
      error: {
        code: (error.details?.code as string | undefined) || error.code,
        message: error.message,
        expectedSeq: error.details?.expectedSeq as number | undefined,
        retryable: error.retryable,
      },
    };
  }
  return {
    mutationId,
    status: 'rejected',
    error: { code: 'INTERNAL_ERROR', message: 'Mutation could not be applied', retryable: true },
  };
}
