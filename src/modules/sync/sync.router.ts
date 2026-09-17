import { Router, type Response } from 'express';
import type { AuthenticatedRequest } from '../../platform/types.js';
import { AppError } from '../../platform/errors.js';
import { mutationSchema, syncRequestSchema } from './sync.schemas.js';
import {
  processSyncMutation,
  rejectedResult,
  resolveAuthenticatedDriver,
  type SyncMutationResult,
} from './sync.service.js';

export const syncRouter = Router();

syncRouter.post('/mutations', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!req.auth) throw AppError.unauthorized();
    const envelope = syncRequestSchema.parse(req.body);
    const driver = await resolveAuthenticatedDriver(req.auth);
    const results: SyncMutationResult[] = [];
    let sequenceBlocked = false;

    for (const rawMutation of envelope.mutations) {
      const fallbackId = typeof rawMutation === 'object' &&
        rawMutation !== null &&
        typeof (rawMutation as Record<string, unknown>).mutationId === 'string'
        ? String((rawMutation as Record<string, unknown>).mutationId)
        : 'unknown';

      if (sequenceBlocked) {
        results.push({
          mutationId: fallbackId,
          status: 'rejected',
          error: {
            code: 'SYNC_SEQUENCE_BLOCKED',
            message: 'An earlier mutation in this batch was rejected',
            retryable: false,
          },
        });
        continue;
      }

      const parsed = mutationSchema.safeParse(rawMutation);
      if (!parsed.success) {
        results.push({
          mutationId: fallbackId,
          status: 'rejected',
          error: {
            code: 'VALIDATION_FAILED',
            message: parsed.error.issues.map((issue) => issue.message).join('; '),
            retryable: false,
          },
        });
        sequenceBlocked = true;
        continue;
      }

      try {
        const result = await processSyncMutation({
          auth: req.auth,
          driver,
          deviceId: envelope.deviceId,
          mutation: parsed.data,
          ipAddress: req.ip,
        });
        results.push(result);
      } catch (error) {
        results.push(rejectedResult(parsed.data.mutationId, error));
        sequenceBlocked = true;
      }
    }

    res.json({ results });
  } catch (error) {
    next(error);
  }
});
