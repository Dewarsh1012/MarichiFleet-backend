import mongoose, { Schema } from 'mongoose';

export interface ISyncDeviceState {
  scopeKey: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  lastSeq: number;
  processingSeq?: number;
  lockExpiresAt?: Date;
}

const SyncDeviceStateSchema = new Schema<ISyncDeviceState>({
  scopeKey: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  deviceId: { type: String, required: true },
  lastSeq: { type: Number, required: true, default: 0 },
  processingSeq: { type: Number },
  lockExpiresAt: { type: Date },
}, { timestamps: true, versionKey: false });

export const SyncDeviceStateModel =
  mongoose.models.SyncDeviceState ||
  mongoose.model<ISyncDeviceState>('SyncDeviceState', SyncDeviceStateSchema);

export interface IProcessedMutation {
  receiptKey: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  mutationId: string;
  seq: number;
  type: string;
  payloadHash: string;
  status: 'PROCESSING' | 'DONE';
  response?: Record<string, unknown>;
  processedAt?: Date;
}

const ProcessedMutationSchema = new Schema<IProcessedMutation>({
  receiptKey: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  deviceId: { type: String, required: true },
  mutationId: { type: String, required: true },
  seq: { type: Number, required: true },
  type: { type: String, required: true },
  payloadHash: { type: String, required: true },
  status: { type: String, enum: ['PROCESSING', 'DONE'], required: true },
  response: { type: Schema.Types.Mixed },
  processedAt: { type: Date },
}, { timestamps: true, versionKey: false });
ProcessedMutationSchema.index({ tenantId: 1, mutationId: 1 }, { unique: true });

export const ProcessedMutationModel =
  mongoose.models.ProcessedMutation ||
  mongoose.model<IProcessedMutation>('ProcessedMutation', ProcessedMutationSchema);

interface ISyncTripEvent {
  id: string;
  tenantId: string;
  tripId: string;
  driverId: string;
  mutationId: string;
  deviceId: string;
  type: string;
  payloadVersion: number;
  payload: Record<string, unknown>;
  occurredAt: Date;
  recordedAt: Date;
  clockSkewMs: number;
}

const SyncTripEventSchema = new Schema<ISyncTripEvent>({
  id: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  tripId: { type: String, required: true, index: true },
  driverId: { type: String, required: true },
  mutationId: { type: String, required: true },
  deviceId: { type: String, required: true },
  type: { type: String, required: true },
  payloadVersion: { type: Number, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  occurredAt: { type: Date, required: true },
  recordedAt: { type: Date, required: true },
  clockSkewMs: { type: Number, required: true },
}, { versionKey: false });
SyncTripEventSchema.index({ tenantId: 1, mutationId: 1 }, { unique: true });
SyncTripEventSchema.index({ tenantId: 1, tripId: 1, recordedAt: -1 });

export const SyncTripEventModel =
  mongoose.models.SyncTripEvent ||
  mongoose.model<ISyncTripEvent>('SyncTripEvent', SyncTripEventSchema);
