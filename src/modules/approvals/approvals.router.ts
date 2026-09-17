import { Router, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../platform/errors.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { ApprovalModel, VehicleModel, WhatsAppMessageModel } from '../../db/models/index.js';
import { sendWhatsAppMessage } from '../../platform/whatsapp/whatsappProvider.js';
import { v4 as uuidv4 } from 'uuid';

export const approvalsRouter = Router();

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().optional(),
});

approvalsRouter.get('/', requirePermission('read', 'approvals'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.category) filter.category = req.query.category;
    const items = await ApprovalModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: items, total: items.length });
  } catch (err) { next(err); }
});

approvalsRouter.get('/:approvalId', requirePermission('read', 'approvals'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const item = await ApprovalModel.findOne({ tenantId, id: req.params.approvalId }).lean();
    if (!item) return next(AppError.notFound('Approval', req.params.approvalId));
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

approvalsRouter.post('/:approvalId/decide', requirePermission('update', 'approvals'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { decision, comment } = decideSchema.parse(req.body);
    const decidedBy = req.auth?.name || req.auth?.email || 'system';

    const item = await ApprovalModel.findOne({ tenantId, id: req.params.approvalId });
    if (!item) return next(AppError.notFound('Approval', req.params.approvalId));
    if (item.status !== 'PENDING') return next(AppError.badRequest('Approval already decided.'));

    item.status = decision;
    item.decidedBy = decidedBy;
    item.decisionComment = comment || undefined;
    item.decidedAt = new Date();
    await item.save();

    // Auto-send WhatsApp confirmation to driver
    if (item.driverPhone) {
      const driverName = item.requestedBy?.split(' ')[0] || 'Driver';
      let confirmText = '';
      if (decision === 'APPROVED') {
        if (item.category === 'FUEL_REFILL') {
          confirmText = `✅ Theek hai ${driverName} bhai, aapka Diesel Bill (INR ${item.amount?.toLocaleString('en-IN')}) ${item.department} dwara APPROVE ho gaya hai.`;
          // Update vehicle fuel
          if (item.vehicleRegNumber) {
            await VehicleModel.findOneAndUpdate(
              { tenantId, regNumber: item.vehicleRegNumber },
              { $min: { fuelLevelPercent: 100 }, $inc: { fuelLevelPercent: 35 } }
            );
          }
        } else {
          confirmText = `✅ Request '${item.title}' approved by ${item.department}. Ref: ${item.id}.`;
        }
      } else {
        confirmText = `❌ Request '${item.title}' was rejected by ${item.department}. Reason: ${comment || 'Budget restriction'}.`;
      }

      const sendResult = await sendWhatsAppMessage({
        to: item.driverPhone,
        body: confirmText,
        tenantId,
      });

      await WhatsAppMessageModel.create({
        id: `msg_${uuidv4().slice(0, 8)}`,
        tenantId,
        sender: 'SYSTEM',
        recipient: item.driverPhone,
        content: confirmText,
        type: 'APPROVAL_CONFIRMATION',
        deliveryStatus: sendResult.ok ? 'sent' : 'failed',
        provider: sendResult.provider,
        externalId: sendResult.messageId,
        timestamp: new Date(),
      });
    }

    res.json({ success: true, data: item, message: `Approval ${decision.toLowerCase()}.` });
  } catch (err) { next(err); }
});
