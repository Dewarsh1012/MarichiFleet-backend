import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../platform/types.js';
import { requirePermission } from '../../platform/middleware/authz.js';
import {
  SUPPORTED_CURRENCIES,
  convertAmount,
  getRatesToInr,
  refreshRatesFromApi,
  countryForCurrency,
} from '../../platform/currency/currencyService.js';
import { TenantModel } from '../../db/models/index.js';
import { recordAudit } from '../../platform/audit/auditLogger.js';

export const currencyRouter = Router();

export function getSupportedCurrenciesHandler(_req: Request, res: Response) {
  res.json({ success: true, data: SUPPORTED_CURRENCIES });
}

currencyRouter.get('/rates', async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { rates, asOf, source } = await getRatesToInr();
    res.json({ success: true, data: { base: 'INR', rates, asOf, source } });
  } catch (err) {
    next(err);
  }
});

currencyRouter.post('/convert', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const body = z
      .object({
        amount: z.number().positive(),
        from: z.string().length(3),
        to: z.string().length(3),
      })
      .parse(req.body);

    const { rates, asOf, source } = await getRatesToInr();
    const result = convertAmount(body.amount, body.from, body.to, rates);
    res.json({
      success: true,
      data: {
        ...result,
        inputAmount: body.amount,
        asOf,
        source,
      },
    });
  } catch (err) {
    next(err);
  }
});

currencyRouter.post('/refresh', requirePermission('update', 'tenants'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await refreshRatesFromApi();
    await recordAudit({
      tenantId: req.auth!.tenantId,
      module: 'currency',
      resourceId: 'fx_rates',
      action: 'REFRESH',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: { updated: result.updated },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: result, message: result.updated ? 'Rates updated from live feed.' : 'Live feed unavailable; using cached rates.' });
  } catch (err) {
    next(err);
  }
});

currencyRouter.get('/settings', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const tenant = (await TenantModel.findOne({ id: tenantId }).lean()) as { settings?: Record<string, unknown> } | null;
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const { rates, asOf, source } = await getRatesToInr();

    res.json({
      success: true,
      data: {
        tenantId,
        country: settings.country ?? 'India',
        baseCurrency: settings.baseCurrency ?? 'INR',
        displayCurrencies: settings.displayCurrencies ?? ['INR', 'USD', 'AED', 'ZMW'],
        autoConvertReports: settings.autoConvertReports ?? true,
        rates,
        ratesAsOf: asOf,
        ratesSource: source,
      },
    });
  } catch (err) {
    next(err);
  }
});

currencyRouter.patch('/settings', requirePermission('update', 'tenants'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.auth!.tenantId;
    const body = z
      .object({
        country: z.string().min(2).optional(),
        baseCurrency: z.string().length(3).optional(),
        displayCurrencies: z.array(z.string().length(3)).min(1).max(8).optional(),
        autoConvertReports: z.boolean().optional(),
      })
      .parse(req.body);

    if (body.baseCurrency && !SUPPORTED_CURRENCIES.some((c) => c.code === body.baseCurrency)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CURRENCY', message: 'Unsupported base currency' } });
    }

    const patch: Record<string, unknown> = {};
    if (body.country) patch['settings.country'] = body.country;
    if (body.baseCurrency) {
      patch['settings.baseCurrency'] = body.baseCurrency;
      patch['settings.country'] = body.country ?? countryForCurrency(body.baseCurrency);
    }
    if (body.displayCurrencies) patch['settings.displayCurrencies'] = body.displayCurrencies;
    if (body.autoConvertReports !== undefined) patch['settings.autoConvertReports'] = body.autoConvertReports;

    const updated = (await TenantModel.findOneAndUpdate({ id: tenantId }, { $set: patch }, { new: true }).lean()) as {
      settings?: Record<string, unknown>;
    } | null;

    await recordAudit({
      tenantId,
      module: 'currency',
      resourceId: tenantId,
      action: 'UPDATE_SETTINGS',
      actor: {
        userId: req.auth!.userId,
        email: req.auth!.email,
        name: req.auth!.name,
        role: req.auth!.role,
      },
      details: body,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated?.settings, message: 'Currency settings saved.' });
  } catch (err) {
    next(err);
  }
});
