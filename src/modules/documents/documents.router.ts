import { Router, Response } from 'express';
import mongoose, { Schema } from 'mongoose';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { AppError } from '../../platform/errors.js';
import {
  DocumentModel,
  DriverModel,
  TenantModel,
  TripModel,
  VehicleModel,
} from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const documentsRouter = Router();

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_BUCKET = 'offlineUploads';
const UPLOAD_KINDS = ['pod_photo', 'fuel_receipt', 'expense_receipt'] as const;
const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'application/pdf': ['pdf'],
};

const uploadTicketRequestSchema = z.object({
  kind: z.enum(UPLOAD_KINDS),
  bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  fileName: z.string().min(1).max(160),
}).strict().superRefine((value, ctx) => {
  if (/[/\\\u0000-\u001f\u007f]/.test(value.fileName) || value.fileName === '.' || value.fileName === '..') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fileName'], message: 'Unsafe file name' });
  }
  if (value.kind === 'pod_photo' && value.mime === 'application/pdf') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mime'], message: 'POD evidence must be an image' });
  }
  const extension = value.fileName.includes('.') ? value.fileName.split('.').pop()!.toLowerCase() : '';
  if (!extension || !MIME_EXTENSIONS[value.mime]?.includes(extension)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fileName'],
      message: 'File extension does not match MIME type',
    });
  }
});

const createDocumentSchema = z.object({
  entityType: z.enum(['VEHICLE', 'DRIVER', 'TRIP', 'COMPANY']),
  entityId: z.string().min(1),
  docType: z.string().min(1),
  fileName: z.string().min(1),
  fileUrl: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  status: z.enum(['VALID', 'EXPIRING_SOON', 'EXPIRED', 'PENDING']).default('VALID'),
}).strict();

interface IUploadTicket {
  uploadId: string;
  objectKey: string;
  tenantId: string;
  createdBy: string;
  idempotencyKey?: string;
  kind: typeof UPLOAD_KINDS[number];
  bytes: number;
  sha256: string;
  mime: string;
  fileName: string;
  status: 'PENDING' | 'UPLOADING' | 'COMPLETED';
  gridFsId?: mongoose.Types.ObjectId;
  completedAt?: Date;
  expiresAt: Date;
}

const UploadTicketSchema = new Schema<IUploadTicket>({
  uploadId: { type: String, required: true, unique: true },
  objectKey: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true, index: true },
  createdBy: { type: String, required: true },
  idempotencyKey: { type: String },
  kind: { type: String, enum: UPLOAD_KINDS, required: true },
  bytes: { type: Number, required: true, min: 1, max: MAX_UPLOAD_BYTES },
  sha256: { type: String, required: true },
  mime: { type: String, required: true },
  fileName: { type: String, required: true },
  status: { type: String, enum: ['PENDING', 'UPLOADING', 'COMPLETED'], default: 'PENDING' },
  gridFsId: { type: Schema.Types.ObjectId },
  completedAt: { type: Date },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });
UploadTicketSchema.index(
  { tenantId: 1, createdBy: 1, idempotencyKey: 1 },
  { unique: true, sparse: true },
);
UploadTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DocumentUploadTicketModel =
  mongoose.models.DocumentUploadTicket ||
  mongoose.model<IUploadTicket>('DocumentUploadTicket', UploadTicketSchema);

export function parseFullContentRange(
  value: string | undefined,
  expectedBytes: number,
): { statusQuery: boolean } {
  if (value === `bytes */${expectedBytes}`) return { statusQuery: true };
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value || '');
  if (!match) throw AppError.badRequest('A valid Content-Range header is required');
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (start !== 0 || end !== expectedBytes - 1 || total !== expectedBytes) {
    throw AppError.badRequest(
      `This endpoint requires one complete chunk: bytes 0-${expectedBytes - 1}/${expectedBytes}`,
    );
  }
  return { statusQuery: false };
}

async function assertEntityOwnership(
  tenantId: string,
  entityType: z.infer<typeof createDocumentSchema>['entityType'],
  entityId: string,
) {
  let owned = false;
  if (entityType === 'VEHICLE') owned = Boolean(await VehicleModel.exists({ tenantId, id: entityId }));
  if (entityType === 'DRIVER') owned = Boolean(await DriverModel.exists({ tenantId, id: entityId }));
  if (entityType === 'TRIP') owned = Boolean(await TripModel.exists({ tenantId, id: entityId }));
  if (entityType === 'COMPANY') {
    owned = entityId === tenantId && Boolean(await TenantModel.exists({ id: tenantId }));
  }
  if (!owned) throw AppError.notFound(entityType, entityId);
}

function ticketResponse(req: AuthenticatedRequest, ticket: IUploadTicket) {
  return {
    uploadId: ticket.uploadId,
    uploadUrl: `${req.baseUrl}/uploads/${encodeURIComponent(ticket.uploadId)}`,
    chunkSizeBytes: ticket.bytes,
    objectKey: ticket.objectKey,
    expiresAt: ticket.expiresAt.toISOString(),
  };
}

documentsRouter.get('/', requirePermission('read', 'documents'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.entityId) filter.entityId = req.query.entityId;
    if (req.query.docType) filter.docType = req.query.docType;
    if (req.query.status) filter.status = req.query.status;

    const documents = await DocumentModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: documents, total: documents.length });
  } catch (err) { next(err); }
});

documentsRouter.get('/:documentId', requirePermission('read', 'documents'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const doc = await DocumentModel.findOne({ tenantId, id: req.params.documentId }).lean();
    if (!doc) return next(new Error('Document not found'));
    res.json({ success: true, data: doc });
  } catch (err) { next(err); }
});

documentsRouter.post('/', requirePermission('create', 'documents'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const uploadFields = ['kind', 'bytes', 'sha256', 'mime'] as const;
    const isUploadTicketRequest = uploadFields.some((field) =>
      Object.prototype.hasOwnProperty.call(req.body ?? {}, field),
    );
    if (isUploadTicketRequest) {
      const body = uploadTicketRequestSchema.parse(req.body);
      const idempotencyKey = req.idempotencyKey;
      if (idempotencyKey) {
        const existing = await DocumentUploadTicketModel.findOne({
          tenantId,
          createdBy: req.auth!.userId,
          idempotencyKey,
        }).lean() as unknown as IUploadTicket | null;
        if (existing) return res.status(201).json(ticketResponse(req, existing));
      }
      const uploadId = `upl_${uuidv4()}`;
      const ticket = await DocumentUploadTicketModel.create({
        uploadId,
        objectKey: `obj_${uuidv4()}`,
        tenantId,
        createdBy: req.auth!.userId,
        idempotencyKey,
        ...body,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      return res.status(201).json(ticketResponse(req, ticket));
    }

    const body = createDocumentSchema.parse(req.body);
    await assertEntityOwnership(tenantId, body.entityType, body.entityId);
    const newDoc = await DocumentModel.create({
      id: `doc_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
      validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
      validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      uploadedBy: req.auth?.name || req.auth?.email || 'system',
    });
    res.status(201).json({ success: true, data: newDoc, message: 'Document uploaded successfully.' });
  } catch (err) { next(err); }
});

documentsRouter.put('/uploads/:uploadId', async (req: AuthenticatedRequest, res: Response, next) => {
  let bucket: mongoose.mongo.GridFSBucket | undefined;
  let gridFsId: mongoose.Types.ObjectId | undefined;
  try {
    if (!req.auth) throw AppError.unauthorized();
    if (!mongoose.connection.db) throw new AppError('INTERNAL_ERROR', 'Upload storage is unavailable', 503, undefined, true);

    const uploadId = z.string().regex(/^upl_[0-9a-f-]{36}$/).parse(req.params.uploadId);
    const ticket = await DocumentUploadTicketModel.findOne({
      uploadId,
      tenantId: req.auth.tenantId,
      createdBy: req.auth.userId,
    });
    if (!ticket) throw AppError.notFound('Upload ticket', uploadId);

    const range = parseFullContentRange(req.headers['content-range'], ticket.bytes);
    if (range.statusQuery) {
      if (ticket.status === 'COMPLETED') {
        res.setHeader('Range', `bytes=0-${ticket.bytes - 1}`);
        return res.status(200).json({
          objectKey: ticket.objectKey,
          sha256Verified: true,
          bytes: ticket.bytes,
        });
      }
      return res.status(308).end();
    }
    if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== ticket.mime) {
      throw AppError.badRequest('Content-Type does not match the upload ticket');
    }
    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength !== ticket.bytes) {
      throw AppError.badRequest(`Content-Length must equal ${ticket.bytes}`);
    }
    if (ticket.status === 'COMPLETED') {
      return res.status(200).json({
        objectKey: ticket.objectKey,
        sha256Verified: true,
        bytes: ticket.bytes,
        replayed: true,
      });
    }

    const claimed = await DocumentUploadTicketModel.findOneAndUpdate(
      { _id: ticket._id, status: 'PENDING' },
      { $set: { status: 'UPLOADING' } },
      { new: true },
    );
    if (!claimed) throw AppError.conflict('Upload is already in progress');

    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: UPLOAD_BUCKET,
      chunkSizeBytes: ticket.bytes,
    });
    const hasher = createHash('sha256');
    let received = 0;
    const checksumStream = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > ticket.bytes) return callback(AppError.badRequest('Upload exceeds declared size'));
        hasher.update(chunk);
        callback(null, chunk);
      },
    });
    const uploadStream = bucket.openUploadStream(ticket.objectKey, {
      metadata: {
        objectKey: ticket.objectKey,
        tenantId: ticket.tenantId,
        createdBy: ticket.createdBy,
        kind: ticket.kind,
        mime: ticket.mime,
        sha256: ticket.sha256,
        uploadId: ticket.uploadId,
      },
    });
    gridFsId = uploadStream.id as mongoose.Types.ObjectId;
    await pipeline(req, checksumStream, uploadStream);

    const actualSha256 = hasher.digest('hex');
    if (received !== ticket.bytes || actualSha256 !== ticket.sha256) {
      await bucket.delete(gridFsId).catch(() => undefined);
      await DocumentUploadTicketModel.updateOne({ _id: ticket._id }, { $set: { status: 'PENDING' }, $unset: { gridFsId: 1 } });
      throw AppError.badRequest(
        received !== ticket.bytes ? 'Upload size does not match ticket' : 'SHA-256 checksum mismatch',
      );
    }

    await DocumentUploadTicketModel.updateOne(
      { _id: ticket._id, status: 'UPLOADING' },
      {
        $set: {
          status: 'COMPLETED',
          gridFsId,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    );
    bucket = undefined;
    gridFsId = undefined;
    res.status(201).json({
      objectKey: ticket.objectKey,
      sha256Verified: true,
      bytes: ticket.bytes,
    });
  } catch (err) {
    if (bucket && gridFsId) await bucket.delete(gridFsId).catch(() => undefined);
    if (req.auth && req.params.uploadId) {
      await DocumentUploadTicketModel.updateOne(
        { uploadId: req.params.uploadId, tenantId: req.auth.tenantId, createdBy: req.auth.userId, status: 'UPLOADING' },
        { $set: { status: 'PENDING' }, $unset: { gridFsId: 1 } },
      ).catch(() => undefined);
    }
    next(err);
  }
});

documentsRouter.put('/:documentId', requirePermission('update', 'documents'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await DocumentModel.findOneAndUpdate(
      { tenantId, id: req.params.documentId },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Document not found'));
    res.json({ success: true, data: updated, message: 'Document updated successfully.' });
  } catch (err) { next(err); }
});

documentsRouter.delete('/:documentId', requirePermission('delete', 'documents'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    await DocumentModel.findOneAndDelete({ tenantId, id: req.params.documentId });
    res.json({ success: true, message: 'Document deleted successfully.' });
  } catch (err) { next(err); }
});
