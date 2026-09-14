import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { LedgerEntryModel } from '../../db/models/index.js';

export const ledgerRouter = Router();

ledgerRouter.get('/entries', requirePermission('read', 'ledger'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const entries = await LedgerEntryModel.find({ tenantId }).sort({ transactionDate: -1 }).lean();
    res.json({ success: true, data: entries, total: entries.length });
  } catch (err) { next(err); }
});

ledgerRouter.get('/trial-balance', requirePermission('read', 'ledger'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const entries = await LedgerEntryModel.find({ tenantId }).lean();

    const accountBalances: Record<string, { debit: number; credit: number }> = {};

    for (const entry of entries) {
      if (!accountBalances[entry.debitAccount]) {
        accountBalances[entry.debitAccount] = { debit: 0, credit: 0 };
      }
      accountBalances[entry.debitAccount].debit += entry.amount;

      if (!accountBalances[entry.creditAccount]) {
        accountBalances[entry.creditAccount] = { debit: 0, credit: 0 };
      }
      accountBalances[entry.creditAccount].credit += entry.amount;
    }

    const trialBalance = Object.entries(accountBalances).map(([account, { debit, credit }]) => ({
      account,
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      balance: Math.round((debit - credit) * 100) / 100,
    }));

    res.json({ success: true, data: trialBalance });
  } catch (err) { next(err); }
});

ledgerRouter.get('/by-reference/:referenceId', requirePermission('read', 'ledger'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const entries = await LedgerEntryModel.find({ tenantId, referenceId: req.params.referenceId }).lean();
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
});
