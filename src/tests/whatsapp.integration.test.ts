import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { providerMessageDocumentId } from '../platform/whatsapp/whatsappMessageStore.js';
import { buildWhatsAppMessage } from '../platform/whatsapp/whatsappTemplates.js';
import { parseWhatsAppWebhook, verifyMetaWebhookSignature } from '../platform/whatsapp/whatsappWebhook.js';

test('validates Meta signatures against the untouched request bytes', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = 'test-app-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  assert.equal(verifyMetaWebhookSignature(body, signature, secret), true);
  assert.equal(verifyMetaWebhookSignature(Buffer.from('{}'), signature, secret), false);
  assert.equal(verifyMetaWebhookSignature(body, undefined, secret), false);
});

test('parses text, location, media, and delivery statuses', () => {
  const parsed = parseWhatsAppWebhook({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: 'phone-id', display_phone_number: '15550001111' },
          messages: [
            { id: 'text-1', from: '15551110000', timestamp: '1700000000', type: 'text', text: { body: 'Hello' } },
            { id: 'location-1', from: '15551110000', timestamp: '1700000001', type: 'location', location: { latitude: 28.6, longitude: 77.2, name: 'Depot' } },
            { id: 'media-1', from: '15551110000', timestamp: '1700000002', type: 'image', image: { id: 'image-id', mime_type: 'image/jpeg', caption: 'POD' } },
          ],
          statuses: [{
            id: 'outbound-1',
            recipient_id: '15551110000',
            timestamp: '1700000003',
            status: 'failed',
            errors: [{ code: 131026, title: 'Undeliverable', message: 'Message undeliverable' }],
          }],
        },
      }],
    }],
  });

  assert.equal(parsed.phoneNumberId, 'phone-id');
  assert.deepEqual(parsed.messages.map((message) => message.kind), ['text', 'location', 'media']);
  assert.equal(parsed.messages[0]?.kind === 'text' && parsed.messages[0].text, 'Hello');
  assert.equal(parsed.messages[1]?.kind === 'location' && parsed.messages[1].latitude, 28.6);
  assert.equal(parsed.messages[2]?.kind === 'media' && parsed.messages[2].mediaId, 'image-id');
  assert.equal(parsed.statuses[0]?.status, 'failed');
  assert.equal(parsed.statuses[0]?.error?.code, 131026);
});

test('builds text fallback for operational message kinds', () => {
  const original = process.env.WHATSAPP_TEMPLATE_ETA_UPDATE;
  delete process.env.WHATSAPP_TEMPLATE_ETA_UPDATE;
  try {
    const message = buildWhatsAppMessage('eta_update', { reference: 'LR-101', eta: '18:30' });
    assert.match(message.body ?? '', /LR-101/);
    assert.match(message.body ?? '', /18:30/);
    assert.equal(message.template, undefined);
  } finally {
    if (original === undefined) delete process.env.WHATSAPP_TEMPLATE_ETA_UPDATE;
    else process.env.WHATSAPP_TEMPLATE_ETA_UPDATE = original;
  }
});

test('derives a stable unique document id from the provider message id', () => {
  assert.equal(providerMessageDocumentId('wamid.abc'), providerMessageDocumentId('wamid.abc'));
  assert.notEqual(providerMessageDocumentId('wamid.abc'), providerMessageDocumentId('wamid.xyz'));
  assert.match(providerMessageDocumentId('wamid.abc'), /^wa_[a-f0-9]{24}$/);
});

test('builds configured Meta templates with ordered parameters', () => {
  const original = process.env.WHATSAPP_TEMPLATE_DRIVER_OFFER;
  process.env.WHATSAPP_TEMPLATE_DRIVER_OFFER = 'driver_offer_v1';
  try {
    const message = buildWhatsAppMessage('driver_offer', {
      driverName: 'Ravi',
      reference: 'TRIP-1',
      origin: 'Delhi',
      destination: 'Jaipur',
    });
    assert.equal(message.template?.name, 'driver_offer_v1');
    assert.deepEqual(message.template?.bodyParameters, ['Ravi', 'TRIP-1', 'Delhi', 'Jaipur']);
  } finally {
    if (original === undefined) delete process.env.WHATSAPP_TEMPLATE_DRIVER_OFFER;
    else process.env.WHATSAPP_TEMPLATE_DRIVER_OFFER = original;
  }
});
