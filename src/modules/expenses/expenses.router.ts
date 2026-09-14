import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import { ExpenseModel } from '../../db/models/index.js';
import { v4 as uuidv4 } from 'uuid';

export const expensesRouter = Router();

const createExpenseSchema = z.object({
  tripId: z.string().optional(),
  vehicleRegNumber: z.string().optional(),
  driverName: z.string().optional(),
  category: z.string().min(1),
  description: z.string().default(''),
  amount: z.number().positive(),
  receiptUrl: z.string().optional(),
});

expensesRouter.get('/', requirePermission('read', 'expenses'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const filter: any = { tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.tripId) filter.tripId = req.query.tripId;
    if (req.query.vehicleRegNumber) filter.vehicleRegNumber = req.query.vehicleRegNumber;

    const expenses = await ExpenseModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: expenses, total: expenses.length });
  } catch (err) { next(err); }
});

expensesRouter.post('/', requirePermission('create', 'expenses'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = createExpenseSchema.parse(req.body);
    const newExpense = await ExpenseModel.create({
      id: `exp_${uuidv4().slice(0, 8)}`,
      tenantId,
      ...body,
      status: 'PENDING',
    });
    res.status(201).json({ success: true, data: newExpense, message: 'Expense submitted for approval.' });
  } catch (err) { next(err); }
});

expensesRouter.put('/:expenseId', requirePermission('update', 'expenses'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await ExpenseModel.findOneAndUpdate(
      { tenantId, id: req.params.expenseId },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Expense not found'));
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

expensesRouter.post('/:expenseId/approve', requirePermission('update', 'approvals'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const updated = await ExpenseModel.findOneAndUpdate(
      { tenantId, id: req.params.expenseId },
      { $set: { status: 'APPROVED', approvedBy: req.auth?.name || req.auth?.email || 'admin' } },
      { new: true }
    ).lean();
    if (!updated) return next(new Error('Expense not found'));
    res.json({ success: true, data: updated, message: 'Expense approved.' });
  } catch (err) { next(err); }
});
