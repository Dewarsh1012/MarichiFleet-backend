import { logger } from '../logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface AuditRecordParams {
  tenantId: string;
  module: string;
  resourceId: string;
  action: string;
  actor: {
    userId: string;
    email: string;
    name: string;
    role: string;
  };
  details?: Record<string, any>;
  ipAddress?: string;
}

export async function recordAudit(params: AuditRecordParams): Promise<void> {
  try {
    const { AuditLogModel } = await import('../../db/models/index.js');
    await AuditLogModel.create({
      id: `aud_${uuidv4().slice(0, 10)}`,
      tenantId: params.tenantId,
      module: params.module,
      resourceId: params.resourceId,
      action: params.action,
      actor: params.actor,
      details: params.details || {},
      ipAddress: params.ipAddress || '127.0.0.1',
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error({ err, module: params.module, action: params.action }, 'Failed to write audit log record');
  }
}
