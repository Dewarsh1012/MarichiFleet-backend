import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { InvoiceModel, PaymentModel } from '../../db/models/index.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';
import { moneySnapshotSchema } from '../trip-wallet/money.js';

export const paymentsRouter = Router();

const paymentSchema = z.object({
  money: moneySnapshotSchema,
  mode: z.enum(['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI', 'NEFT', 'RTGS']),
  referenceNumber: z.string().max(100).optional(),
  paidBy: z.string().min(1).max(200),
  receivedAt: z.coerce.date().optional(),
});

paymentsRouter.get('/invoices/:invoiceId', requirePermission('read', 'invoices'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const payments = await PaymentModel.find({ tenantId, invoiceId: req.params.invoiceId })
      .sort({ receivedAt: 1 })
      .lean();
    res.json({ success: true, data: payments, total: payments.length });
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post('/invoices/:invoiceId', requirePermission('update', 'invoices'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const idempotencyKey = req.idempotencyKey;
    if (!idempotencyKey) {
      return res.status(400).json({ success: false, message: 'Idempotency-Key header is required' });
    }
    const body = paymentSchema.parse(req.body);
    const invoice = await InvoiceModel.findOne({ tenantId, id: req.params.invoiceId });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!['FINALISED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status)) {
      return res.status(409).json({ success: false, message: 'Payments require a finalised invoice' });
    }

    const invoiceCurrency = invoice.totalMoney?.currency ?? 'INR';
    const invoiceTotalMinorUnits = invoice.totalMoney?.minorUnits ?? Math.round(invoice.totalAmount * 100);
    if (body.money.currency !== invoiceCurrency) {
      return res.status(400).json({ success: false, message: `Payment currency must be ${invoiceCurrency}` });
    }

    let payment = await PaymentModel.findOne({ tenantId, idempotencyKey });
    let created = false;
    if (!payment) {
      try {
        payment = await PaymentModel.create({
          id: `pay_${uuidv4().slice(0, 10)}`,
          tenantId,
          invoiceId: invoice.id,
          amount: body.money.minorUnits / 100,
          money: body.money,
          idempotencyKey,
          mode: body.mode,
          referenceNumber: body.referenceNumber,
          paidBy: body.paidBy,
          receivedAt: body.receivedAt ?? new Date(),
          status: 'MATCHED',
          createdAt: new Date(),
        });
        created = true;
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        payment = await PaymentModel.findOne({ tenantId, idempotencyKey });
      }
    }
    if (!payment || payment.invoiceId !== invoice.id) {
      return res.status(409).json({ success: false, message: 'Idempotency key belongs to another payment' });
    }

    const totals = await PaymentModel.aggregate<{ paid: number }>([
      { $match: { tenantId, invoiceId: invoice.id, status: { $in: ['RECEIVED', 'MATCHED'] } } },
      { $group: { _id: null, paid: { $sum: '$money.minorUnits' } } },
    ]);
    const paidMinorUnits = totals[0]?.paid ?? 0;
    if (paidMinorUnits > invoiceTotalMinorUnits) {
      if (created) await PaymentModel.deleteOne({ tenantId, id: payment.id });
      return res.status(409).json({ success: false, message: 'Payment exceeds invoice outstanding amount' });
    }

    invoice.paidMinorUnits = paidMinorUnits;
    invoice.status = paidMinorUnits === invoiceTotalMinorUnits ? 'PAID' : 'PARTIALLY_PAID';
    invoice.paidAt = invoice.status === 'PAID' ? new Date() : undefined;
    await invoice.save();

    if (created) {
      await recordAudit({
        tenantId,
        module: 'payments',
        resourceId: payment.id,
        action: 'PAYMENT_RECORDED',
        actor: req.auth!,
        details: { invoiceId: invoice.id, minorUnits: body.money.minorUnits, invoiceStatus: invoice.status },
        ipAddress: req.ip,
      });
    }
    res.status(created ? 201 : 200).json({
      success: true,
      data: { payment, invoiceStatus: invoice.status, paidMinorUnits, outstandingMinorUnits: invoiceTotalMinorUnits - paidMinorUnits },
      idempotentReplay: !created,
    });
  } catch (error) {
    next(error);
  }
});
