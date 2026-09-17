import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTRY_PACKS } from '../../modules/regions/countryPacks.js';
import { TaxInvoiceInput } from './contracts.js';
import { createCountryProviderSet } from './providerRegistry.js';

const invoice: TaxInvoiceInput = {
  tenantId: 'tenant-1',
  invoiceNumber: 'INV-1',
  issueDate: '2026-09-17T00:00:00.000Z',
  currency: 'INR',
  sellerTaxId: '29ABCDE1234F1Z5',
  subtotal: 100,
  taxAmount: 18,
  total: 118,
};

test('all country adapters return explicit unconfigured failures', async () => {
  const providers = createCountryProviderSet(COUNTRY_PACKS.IN);
  const results = await Promise.all([
    providers.taxInvoice.issue(invoice),
    providers.eInvoice.submit({ ...invoice, invoicePayload: { version: '1.1' } }),
    providers.permit.apply({
      tenantId: 'tenant-1',
      vehicleRegistration: 'KA01AB1234',
      documentNumber: 'DOC-1',
      origin: 'Bengaluru',
      destination: 'Mumbai',
      validFrom: '2026-09-17T00:00:00.000Z',
      validUntil: '2026-09-18T00:00:00.000Z',
    }),
    providers.telematics.publishPosition({
      tenantId: 'tenant-1',
      vehicleId: 'vehicle-1',
      deviceId: 'device-1',
      capturedAt: '2026-09-17T00:00:00.000Z',
      latitude: 12.9716,
      longitude: 77.5946,
      speedKph: 42,
    }),
    providers.payment.collect({
      tenantId: 'tenant-1',
      amount: 118,
      currency: 'INR',
      payerReference: 'payer-1',
      idempotencyKey: 'pay-1',
    }),
    providers.messaging.send({
      tenantId: 'tenant-1',
      recipient: '+919999999999',
      channel: 'sms',
      body: 'Dispatch update',
      idempotencyKey: 'msg-1',
    }),
  ]);

  for (const result of results) {
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 'UNCONFIGURED');
      assert.equal(result.error.code, 'PROVIDER_NOT_CONFIGURED');
    }
  }
});

test('validates requests before provider configuration checks', async () => {
  const providers = createCountryProviderSet(COUNTRY_PACKS.IN);
  const result = await providers.taxInvoice.issue({ ...invoice, total: 117 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 'INVALID_INPUT');
    assert.equal(result.error.validationIssues?.[0]?.path, 'total');
  }
});

test('configured stubs still never claim external completion', async () => {
  const providers = createCountryProviderSet(COUNTRY_PACKS.ZM, {
    ZAMBIA_MESSAGING_API_KEY: 'test-only-value',
  });
  const result = await providers.messaging.send({
    tenantId: 'tenant-1',
    recipient: '+260955000000',
    channel: 'sms',
    body: 'Trip update',
    idempotencyKey: 'msg-zm-1',
  });

  assert.equal(providers.messaging.configuration.configured, true);
  assert.equal(providers.messaging.configuration.operational, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 'NOT_IMPLEMENTED');
});

test('generic GCC pack blocks member-specific external operations', async () => {
  const providers = createCountryProviderSet(COUNTRY_PACKS.GCC, {
    GCC_EINVOICE_API_KEY: 'test-only-value',
    GCC_EINVOICE_TENANT_ID: 'tenant-key',
  });
  const result = await providers.eInvoice.submit({
    ...invoice,
    currency: 'USD',
    invoicePayload: {},
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 'UNSUPPORTED');
});
