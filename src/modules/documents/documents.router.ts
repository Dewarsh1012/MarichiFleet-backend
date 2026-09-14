import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { DocumentModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const documentsRouter = Router();

const createDocumentSchema = z.object({
  entityType: z.enum(['VEHICLE', 'DRIVER', 'TRIP', 'COMPANY']),
  entityId: z.string().min(1),
  docType: z.string().min(1),
  fileName: z.string().min(1),
  fileUrl: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  status: z.enum(['VALID', 'EXPIRING_SOON', 'EXPIRED', 'PENDING']).default('VALID'),
});

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
    const body = createDocumentSchema.parse(req.body);
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
