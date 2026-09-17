import assert from 'node:assert/strict';
import test from 'node:test';
import { createCountryProviderSet } from '../../platform/providers/providerRegistry.js';
import {
  COUNTRY_PACKS,
  reportCapabilities,
  resolveCountryPack,
} from './countryPacks.js';

test('resolves supported aliases without silently defaulting', () => {
  assert.equal(resolveCountryPack({ settings: { country: 'India' } }).ok, true);

  const uae = resolveCountryPack({ settings: { country: 'UAE' } });
  assert.equal(uae.ok, true);
  if (uae.ok) assert.equal(uae.pack.code, 'AE');

  const zambia = resolveCountryPack({ settings: { country: 'zm' } });
  assert.equal(zambia.ok, true);
  if (zambia.ok) assert.equal(zambia.pack.currency.code, 'ZMW');
});

test('fails closed for missing and unsupported tenant countries', () => {
  const missing = resolveCountryPack({ settings: {} });
  assert.deepEqual(
    { ok: missing.ok, status: missing.ok ? undefined : missing.status },
    { ok: false, status: 'INVALID_TENANT_COUNTRY' },
  );

  const unsupported = resolveCountryPack({ settings: { country: 'Canada' } });
  assert.deepEqual(
    { ok: unsupported.ok, status: unsupported.ok ? undefined : unsupported.status },
    { ok: false, status: 'UNSUPPORTED_COUNTRY' },
  );
});

test('models UAE and Saudi tax and e-invoice differences explicitly', () => {
  const uae = COUNTRY_PACKS.AE;
  const saudi = COUNTRY_PACKS.SA;

  assert.equal(uae.currency.code, 'AED');
  assert.equal(saudi.currency.code, 'SAR');
  assert.equal(uae.taxIdentifiers[0]?.code, 'TRN');
  assert.equal(saudi.taxIdentifiers[0]?.code, 'VAT_NUMBER');
  assert.match(uae.documentLabels.eInvoice, /UAE/);
  assert.match(saudi.documentLabels.eInvoice, /ZATCA/);
  assert.equal(
    saudi.complianceRequirements.find((item) => item.code === 'ZATCA_FATOORA')?.mandatory,
    true,
  );
});

test('capability report distinguishes configured from operational', () => {
  const providers = createCountryProviderSet(COUNTRY_PACKS.IN, {
    INDIA_MESSAGING_API_KEY: 'configured-for-test',
  });
  const report = reportCapabilities(COUNTRY_PACKS.IN, providers.configurations);
  const messaging = report.find((item) => item.capability === 'messaging');
  const eInvoice = report.find((item) => item.capability === 'e-invoice');

  assert.equal(messaging?.configured, true);
  assert.equal(messaging?.operational, false);
  assert.match(messaging?.reason ?? '', /not implemented/);
  assert.equal(eInvoice?.configured, false);
  assert.equal(eInvoice?.operational, false);
});
