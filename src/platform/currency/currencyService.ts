import { FxRateModel } from '../../db/models/index.js';
import { logger } from '../logger.js';

/** ISO 4217 codes supported across India, Zambia, GCC and international billing. */
export const SUPPORTED_CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee', symbol: 'INR', country: 'India', minorUnit: 100 },
  { code: 'USD', name: 'US Dollar', symbol: 'USD', country: 'United States', minorUnit: 100 },
  { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZMW', country: 'Zambia', minorUnit: 100 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', country: 'United Arab Emirates', minorUnit: 100 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', country: 'Saudi Arabia', minorUnit: 100 },
  { code: 'EUR', name: 'Euro', symbol: 'EUR', country: 'European Union', minorUnit: 100 },
  { code: 'GBP', name: 'British Pound', symbol: 'GBP', country: 'United Kingdom', minorUnit: 100 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KES', country: 'Kenya', minorUnit: 100 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TZS', country: 'Tanzania', minorUnit: 100 },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BHD', country: 'Bahrain', minorUnit: 1000 },
  { code: 'OMR', name: 'Omani Rial', symbol: 'OMR', country: 'Oman', minorUnit: 1000 },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QAR', country: 'Qatar', minorUnit: 100 },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code'];

/** Base rates: 1 unit of currency = X INR (reference currency for the platform). */
const DEFAULT_RATES_TO_INR: Record<string, number> = {
  INR: 1,
  USD: 83.12,
  ZMW: 3.18,
  AED: 22.63,
  SAR: 22.16,
  EUR: 90.45,
  GBP: 105.2,
  KES: 0.64,
  TZS: 0.032,
  BHD: 220.5,
  OMR: 216.0,
  QAR: 22.83,
};

let cachedRates: Record<string, number> | null = null;
let cacheExpiresAt = 0;

export async function getRatesToInr(): Promise<{ rates: Record<string, number>; asOf: string; source: string }> {
  const now = Date.now();
  if (cachedRates && now < cacheExpiresAt) {
    return { rates: cachedRates, asOf: new Date(cacheExpiresAt - 3600_000).toISOString(), source: 'cache' };
  }

  try {
    const stored = (await FxRateModel.findOne({ base: 'INR' }).sort({ updatedAt: -1 }).lean()) as {
      rates?: Record<string, number>;
      updatedAt?: Date;
    } | null;
    if (stored?.rates && Object.keys(stored.rates).length > 0) {
      cachedRates = stored.rates as Record<string, number>;
      cacheExpiresAt = now + 3600_000;
      return { rates: cachedRates, asOf: (stored.updatedAt as Date).toISOString(), source: 'database' };
    }
  } catch (err) {
    logger.warn({ err, msg: 'FX rate DB read failed; using defaults' });
  }

  cachedRates = { ...DEFAULT_RATES_TO_INR };
  cacheExpiresAt = now + 3600_000;
  return { rates: cachedRates, asOf: new Date().toISOString(), source: 'default' };
}

/** Convert amount in major units from one currency to another. */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  ratesToInr: Record<string, number>,
): { converted: number; rate: number; from: string; to: string } {
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();
  const fromRate = ratesToInr[fromCode];
  const toRate = ratesToInr[toCode];
  if (!fromRate || !toRate) {
    throw new Error(`Unsupported currency pair: ${fromCode} -> ${toCode}`);
  }
  const inInr = amount * fromRate;
  const converted = inInr / toRate;
  const crossRate = fromRate / toRate;
  return { converted: Math.round(converted * 100) / 100, rate: Math.round(crossRate * 10000) / 10000, from: fromCode, to: toCode };
}

export async function refreshRatesFromApi(): Promise<{ updated: boolean; rates: Record<string, number> }> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/INR', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`FX API ${res.status}`);
    const json = (await res.json()) as { rates?: Record<string, number> };
    if (!json.rates) throw new Error('Invalid FX response');

    const inverted: Record<string, number> = { INR: 1 };
    for (const [code, rateFromInr] of Object.entries(json.rates)) {
      if (rateFromInr > 0) inverted[code] = Math.round((1 / rateFromInr) * 10000) / 10000;
    }

    await FxRateModel.findOneAndUpdate(
      { base: 'INR' },
      { base: 'INR', rates: inverted, source: 'open.er-api.com', updatedAt: new Date() },
      { upsert: true, new: true },
    );

    cachedRates = inverted;
    cacheExpiresAt = Date.now() + 3600_000;
    return { updated: true, rates: inverted };
  } catch (err) {
    logger.warn({ err, msg: 'Live FX refresh failed; keeping existing rates' });
    const { rates } = await getRatesToInr();
    return { updated: false, rates };
  }
}

export function countryForCurrency(code: string): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.country ?? 'Unknown';
}
