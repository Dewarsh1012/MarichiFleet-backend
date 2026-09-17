import type { ITripWalletEntry } from '../../db/models/index.js';

export function calculateSettlementTotals(entries: Pick<ITripWalletEntry, 'direction' | 'money'>[]) {
  const creditsMinorUnits = entries
    .filter((entry) => entry.direction === 'CREDIT')
    .reduce((sum, entry) => sum + entry.money.baseMinorUnits, 0);
  const debitsMinorUnits = entries
    .filter((entry) => entry.direction === 'DEBIT')
    .reduce((sum, entry) => sum + entry.money.baseMinorUnits, 0);
  const netMinorUnits = creditsMinorUnits - debitsMinorUnits;
  return {
    creditsMinorUnits,
    debitsMinorUnits,
    netMinorUnits,
    netDirection: netMinorUnits > 0 ? 'PAYABLE' : netMinorUnits < 0 ? 'RECOVERABLE' : 'SETTLED',
  } as const;
}
