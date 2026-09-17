import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const objectKey = z.string().regex(/^obj_[0-9a-f-]{36}$/);
const evidence = z.object({
  name: z.string().min(1).max(160),
  mime: z.string().min(1).max(100),
  bytes: z.number().int().positive(),
}).strict();

export const tripEventPayloadSchema = z.object({
  tripId: id,
  event: z.enum([
    'trip.pickup.arrived',
    'trip.loading.started',
    'trip.departed',
    'trip.delivered',
  ]),
  // Accepted only for compatibility with the current client. It is never authoritative.
  actorId: id.optional(),
  photoKeys: z.array(objectKey).max(10).default([]),
}).strict();

export const podCapturePayloadSchema = z.object({
  podId: id,
  tripId: id,
  bookingId: id.optional(),
  stopSeq: z.number().int().nonnegative().optional(),
  consigneeName: z.string().trim().min(1).max(160),
  expected: z.number().nonnegative(),
  delivered: z.number().nonnegative(),
  unit: z.string().trim().min(1).max(32).optional(),
  note: z.string().trim().max(1000).default(''),
  confirmation: z.discriminatedUnion('method', [
    z.object({ method: z.literal('receiver_acknowledgement') }).strict(),
    z.object({ method: z.literal('otp'), otp: z.string().regex(/^\d{4,6}$/) }).strict(),
  ]),
  exception: z.object({
    kind: z.string().min(1).max(50),
    reason: z.string().min(1).max(200),
  }).strict().nullable().optional(),
  fixes: z.array(z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    accuracyM: z.number().nonnegative().optional(),
    sats: z.number().int().nonnegative().optional(),
    at: z.string().datetime(),
  }).strict()).max(25).optional(),
  photoMetadata: z.array(evidence).min(1).max(10).optional(),
  photoKeys: z.array(objectKey).min(1).max(10),
}).strict();

export const fuelSubmittedPayloadSchema = z.object({
  tripId: id.optional(),
  vehicleId: id,
  litres: z.number().positive().max(2000),
  amount: z.number().positive().max(10_000_000),
  odometerKm: z.number().nonnegative().max(10_000_000),
  station: z.string().trim().max(200).default(''),
  evidence: evidence.optional(),
  photoKeys: z.array(objectKey).length(1),
}).strict();

export const expenseSubmittedPayloadSchema = z.object({
  tripId: id.optional(),
  vehicleId: id.optional(),
  category: z.string().trim().min(1).max(80),
  amount: z.number().positive().max(10_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  note: z.string().trim().max(1000).default(''),
  evidence: evidence.optional(),
  photoKeys: z.array(objectKey).length(1),
}).strict();

const mutationBase = {
  mutationId: id,
  seq: z.number().int().positive(),
  clientTs: z.string().datetime(),
};

export const mutationSchema = z.discriminatedUnion('type', [
  z.object({
    ...mutationBase,
    type: z.literal('trip.event'),
    payloadVersion: z.literal(1),
    payload: tripEventPayloadSchema,
  }).strict(),
  z.object({
    ...mutationBase,
    type: z.literal('pod.capture'),
    payloadVersion: z.literal(3),
    payload: podCapturePayloadSchema,
  }).strict(),
  z.object({
    ...mutationBase,
    type: z.literal('fuel.entry.submitted'),
    payloadVersion: z.literal(1),
    payload: fuelSubmittedPayloadSchema,
  }).strict(),
  z.object({
    ...mutationBase,
    type: z.literal('expense.submitted'),
    payloadVersion: z.literal(1),
    payload: expenseSubmittedPayloadSchema,
  }).strict(),
]);

export const syncEnvelopeSchema = z.object({
  deviceId: id,
  clientVersion: z.string().trim().min(1).max(50),
  mutations: z.array(mutationSchema).min(1).max(50),
}).strict().superRefine((value, ctx) => {
  for (let index = 1; index < value.mutations.length; index += 1) {
    if (value.mutations[index]!.seq !== value.mutations[index - 1]!.seq + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mutations', index, 'seq'],
        message: 'Mutations must be supplied in contiguous sequence order',
      });
    }
  }
});

export const syncRequestSchema = z.object({
  deviceId: id,
  clientVersion: z.string().trim().min(1).max(50),
  mutations: z.array(z.unknown()).min(1).max(50),
}).strict();

export type SyncMutation = z.infer<typeof mutationSchema>;
export type SyncEnvelope = z.infer<typeof syncEnvelopeSchema>;

export function mutationHash(mutation: SyncMutation): string {
  return createHash('sha256').update(JSON.stringify(mutation)).digest('hex');
}
