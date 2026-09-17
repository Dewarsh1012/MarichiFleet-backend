import { Router, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../platform/errors.js';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { InvoiceModel, LedgerEntryModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';
import { recordAudit } from '../../platform/audit/auditLogger.js';

export const financeRouter = Router();

const createInvoiceSchema = z.object({
  tripId: z.string().optional(),
  clientName: z.string().min(2),
  clientGstin: z.string().min(15).max(15),
  freightAmount: z.number().positive(),
  detentionAmount: z.number().default(0),
  isInterState: z.boolean().default(false),
});

// List invoices
financeRouter.get('/invoices', requirePermission('read', 'invoices'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    const invoices = await InvoiceModel.find(filter).sort({ issuedDate: -1 }).lean();
    res.json({ success: true, data: invoices, total: invoices.length });
  } catch (err) { next(err); }
});

// Get single invoice
financeRouter.get('/invoices/:invoiceId', requirePermission('read', 'invoices'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const invoice = await InvoiceModel.findOne({ tenantId, id: req.params.invoiceId }).lean();
    if (!invoice) return next(AppError.notFound('Invoice', req.params.invoiceId));
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

// Create invoice
financeRouter.post('/invoices', requirePermission('create', 'invoices'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createInvoiceSchema.parse(req.body);
    const taxableAmount = body.freightAmount + body.detentionAmount;
    const gstRate = 0.05;
    const totalGst = taxableAmount * gstRate;
    const totalAmount = taxableAmount + totalGst;
    const invoiceId = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newInvoice = await InvoiceModel.create({
      id: invoiceId,
      tenantId,
      tripId: body.tripId,
      clientName: body.clientName,
      clientGstin: body.clientGstin,
      sacCode: '996511',
      freightAmount: body.freightAmount,
      detentionAmount: body.detentionAmount,
      taxableAmount,
      cgstAmount: body.isInterState ? 0 : totalGst / 2,
      sgstAmount: body.isInterState ? 0 : totalGst / 2,
      igstAmount: body.isInterState ? totalGst : 0,
      totalAmount,
      totalMoney: {
        minorUnits: Math.round(totalAmount * 100),
        currency: 'INR',
        baseMinorUnits: Math.round(totalAmount * 100),
        baseCurrency: 'INR',
        rate: 1,
        source: 'INVOICE_NATIVE',
        asOf: new Date(),
      },
      paidMinorUnits: 0,
      status: 'DRAFT',
      issuedDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 86400000),
      dsoDays: 0,
    });
    await recordAudit({
      tenantId,
      module: 'finance',
      resourceId: invoiceId,
      action: 'INVOICE_CREATED',
      actor: req.auth!,
      details: { tripId: body.tripId, totalMinorUnits: Math.round(totalAmount * 100), status: 'DRAFT' },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: newInvoice, message: `Invoice ${invoiceId} created as DRAFT.` });
  } catch (err) { next(err); }
});

// Finalise invoice (IRN generation + ledger entries)
financeRouter.post('/invoices/:invoiceId/finalise', requirePermission('update', 'invoices'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const invoice = await InvoiceModel.findOne({ tenantId, id: req.params.invoiceId });
    if (!invoice) return next(AppError.notFound('Invoice', req.params.invoiceId));
    if (invoice.status !== 'DRAFT') return next(AppError.badRequest('Only DRAFT invoices can be finalised.'));

    // Generate mock IRN
    const irnChars = '0123456789abcdef';
    let mockIrn = '';
    for (let i = 0; i < 64; i++) mockIrn += irnChars.charAt(Math.floor(Math.random() * irnChars.length));

    invoice.status = 'FINALISED';
    invoice.irn = mockIrn;
    invoice.qrCodeData = `IRN:${mockIrn.slice(0, 16)}|GSTIN:${tenantId}|INV:${invoice.id}|TOTAL:${invoice.totalAmount}`;
    invoice.finalisedAt = new Date();
    await invoice.save();

    // Append ledger entries (Law 5 — append-only)
    await LedgerEntryModel.create({
      id: `led_${uuidv4().slice(0, 8)}`,
      tenantId,
      referenceId: invoice.id,
      referenceType: 'INVOICE',
      debitAccount: '1100-Trade-Receivables',
      creditAccount: '4100-Freight-Revenue',
      amount: invoice.taxableAmount,
      narration: `Billed freight revenue for ${invoice.clientName} under SAC 996511`,
      transactionDate: new Date(),
    });

    const totalGst = invoice.cgstAmount + invoice.sgstAmount + (invoice.igstAmount || 0);
    if (totalGst > 0) {
      await LedgerEntryModel.create({
        id: `led_${uuidv4().slice(0, 8)}`,
        tenantId,
        referenceId: invoice.id,
        referenceType: 'INVOICE',
        debitAccount: '1100-Trade-Receivables',
        creditAccount: '2200-GST-Output-Liability',
        amount: totalGst,
        narration: `GST output tax liability on invoice ${invoice.id}`,
        transactionDate: new Date(),
      });
    }

    await recordAudit({
      tenantId,
      module: 'finance',
      resourceId: invoice.id,
      action: 'INVOICE_FINALISED',
      actor: req.auth!,
      details: { irn: invoice.irn, totalMinorUnits: invoice.totalMoney?.minorUnits ?? Math.round(invoice.totalAmount * 100) },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: invoice, message: `Invoice ${invoice.id} finalised with IRN.` });
  } catch (err) { next(err); }
});

// P&L Summary
financeRouter.get('/pnl', requirePermission('read', 'invoices'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const invoices = await InvoiceModel.find({ tenantId }).lean();
    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalFreight = invoices.reduce((sum, inv) => sum + (inv.freightAmount || 0), 0);
    const totalGst = invoices.reduce((sum, inv) => sum + (inv.cgstAmount || 0) + (inv.sgstAmount || 0) + (inv.igstAmount || 0), 0);
    const paidInvoices = invoices.filter(i => i.status === 'PAID' || i.paidAt);
    const totalCollected = paidInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalFreight,
        totalGst,
        totalCollected,
        outstanding: totalRevenue - totalCollected,
        invoiceCount: invoices.length,
        paidCount: paidInvoices.length,
        draftCount: invoices.filter(i => i.status === 'DRAFT').length,
        finalisedCount: invoices.filter(i => i.status === 'FINALISED').length,
      },
    });
  } catch (err) { next(err); }
});

// AR Ageing / Receivables
financeRouter.get('/receivables', requirePermission('read', 'invoices'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const invoices = await InvoiceModel.find({ tenantId, status: { $ne: 'PAID' } }).lean();
    const now = Date.now();

    const ageing = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    for (const inv of invoices) {
      const age = Math.floor((now - new Date(inv.issuedDate).getTime()) / 86400000);
      if (age <= 30) ageing.current += inv.totalAmount;
      else if (age <= 60) ageing.days30 += inv.totalAmount;
      else if (age <= 90) ageing.days60 += inv.totalAmount;
      else ageing.over90 += inv.totalAmount;
    }

    res.json({ success: true, data: { ageing, invoices } });
  } catch (err) { next(err); }
});
