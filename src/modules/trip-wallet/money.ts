import { z } from 'zod';
import type { IMoneySnapshot } from '../../db/models/index.js';

export const moneySnapshotSchema = z.object({
  minorUnits: z.number().int().nonnegative(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  baseMinorUnits: z.number().int().nonnegative(),
  baseCurrency: z.string().length(3).transform((value) => value.toUpperCase()),
  rate: z.number().positive(),
  source: z.string().min(1).max(100),
  asOf: z.coerce.date(),
}).superRefine((money, ctx) => {
  const expected = Math.round(money.minorUnits * money.rate);
  if (Math.abs(expected - money.baseMinorUnits) > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseMinorUnits'],
      message: 'baseMinorUnits must match minorUnits multiplied by the FX rate',
    });
  }
});

export function negateMoney(money: IMoneySnapshot): IMoneySnapshot {
  return {
    ...money,
    minorUnits: Math.abs(money.minorUnits),
    baseMinorUnits: Math.abs(money.baseMinorUnits),
  };
}
