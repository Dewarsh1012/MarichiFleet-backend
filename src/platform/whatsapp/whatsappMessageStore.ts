import { createHash } from 'node:crypto';
import { WhatsAppMessageModel } from '../../db/models/index.js';
import { WhatsAppInboundMessage, WhatsAppStatusCallback } from './whatsappWebhook.js';
import { WhatsAppSendInput, WhatsAppSendResult } from './whatsappProvider.js';

interface PersistOutboundOptions {
  input: WhatsAppSendInput;
  result: WhatsAppSendResult;
  content: string;
  type: string;
  senderName?: string;
  mediaUrl?: string;
  tripId?: string;
}

export async function persistWhatsAppOutbound(options: PersistOutboundOptions): Promise<Record<string, unknown>> {
  const externalId = options.result.messageId;
  const id = externalId ? providerMessageDocumentId(externalId) : `msg_${cryptoSuffix()}`;
  const document = {
    id,
    tenantId: options.input.tenantId,
    sender: 'SYSTEM',
    senderName: options.senderName,
    recipient: options.input.to,
    content: options.content,
    type: options.type,
    mediaUrl: options.mediaUrl,
    tripId: options.tripId,
    direction: 'outbound',
    deliveryStatus: options.result.ok ? 'sent' : 'failed',
    provider: options.result.provider,
    externalId,
    providerError: options.result.error,
    retryable: options.result.retryable,
    timestamp: new Date(),
  };
  await WhatsAppMessageModel.collection.updateOne({ id }, { $setOnInsert: document }, { upsert: true });
  return document;
}

export async function persistWhatsAppInbound(
  tenantId: string,
  recipient: string,
  message: WhatsAppInboundMessage,
): Promise<boolean> {
  const id = providerMessageDocumentId(message.id);
  const content = inboundContent(message);
  const document = {
    id,
    tenantId,
    sender: 'DRIVER',
    senderPhone: message.from,
    recipient,
    content,
    type: `INBOUND_${message.kind.toUpperCase()}`,
    mediaUrl: message.kind === 'media' ? `meta-media://${message.mediaId}` : undefined,
    direction: 'inbound',
    deliveryStatus: 'received',
    provider: 'meta',
    externalId: message.id,
    providerPayload: message,
    timestamp: message.timestamp,
  };
  const result = await WhatsAppMessageModel.collection.updateOne({ id }, { $setOnInsert: document }, { upsert: true });
  return result.upsertedCount === 1;
}

export async function applyWhatsAppStatus(tenantId: string, status: WhatsAppStatusCallback): Promise<boolean> {
  const result = await WhatsAppMessageModel.collection.updateOne(
    { tenantId, externalId: status.id },
    {
      $set: {
        deliveryStatus: status.status,
        statusUpdatedAt: status.timestamp,
        ...(status.error ? { providerError: status.error } : {}),
      },
    },
  );
  return result.matchedCount === 1;
}

function inboundContent(message: WhatsAppInboundMessage): string {
  if (message.kind === 'text') return message.text;
  if (message.kind === 'location') {
    return message.name || message.address || `Location: ${message.latitude},${message.longitude}`;
  }
  return message.caption || message.filename || `${message.mediaType} attachment`;
}

export function providerMessageDocumentId(providerMessageId: string): string {
  return `wa_${createHash('sha256').update(providerMessageId).digest('hex').slice(0, 24)}`;
}

function cryptoSuffix(): string {
  return createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 12);
}
