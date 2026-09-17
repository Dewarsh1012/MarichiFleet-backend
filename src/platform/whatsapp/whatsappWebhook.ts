import { createHmac, timingSafeEqual } from 'node:crypto';

type WhatsAppMediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

export type WhatsAppInboundMessage =
  | { kind: 'text'; id: string; from: string; timestamp: Date; text: string }
  | { kind: 'location'; id: string; from: string; timestamp: Date; latitude: number; longitude: number; name?: string; address?: string }
  | { kind: 'media'; id: string; from: string; timestamp: Date; mediaType: WhatsAppMediaType; mediaId: string; mimeType?: string; caption?: string; filename?: string };

export interface WhatsAppStatusCallback {
  kind: 'status';
  id: string;
  recipient: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted' | 'unknown';
  timestamp: Date;
  error?: { code?: number; title?: string; message?: string };
}

export interface ParsedWhatsAppWebhook {
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  messages: WhatsAppInboundMessage[];
  statuses: WhatsAppStatusCallback[];
}

export function verifyMetaWebhookSignature(rawBody: Buffer, signature: string | undefined, appSecret: string): boolean {
  if (!signature?.startsWith('sha256=') || !appSecret) return false;
  const supplied = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function parseWhatsAppWebhook(payload: unknown): ParsedWhatsAppWebhook {
  const result: ParsedWhatsAppWebhook = { messages: [], statuses: [] };
  const root = asRecord(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(asRecord(entry)?.changes) ? asRecord(entry)!.changes as unknown[] : [];
    for (const change of changes) {
      const value = asRecord(asRecord(change)?.value);
      if (!value) continue;
      const metadata = asRecord(value.metadata);
      result.phoneNumberId ??= stringValue(metadata?.phone_number_id);
      result.displayPhoneNumber ??= stringValue(metadata?.display_phone_number);

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const parsed = parseMessage(asRecord(message));
        if (parsed) result.messages.push(parsed);
      }

      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const status of statuses) {
        const parsed = parseStatus(asRecord(status));
        if (parsed) result.statuses.push(parsed);
      }
    }
  }
  return result;
}

function parseMessage(message: Record<string, unknown> | undefined): WhatsAppInboundMessage | undefined {
  if (!message) return undefined;
  const id = stringValue(message?.id);
  const from = stringValue(message?.from);
  const type = stringValue(message?.type);
  if (!id || !from || !type) return undefined;
  const timestamp = parseTimestamp(message?.timestamp);

  if (type === 'text') {
    const text = stringValue(asRecord(message.text)?.body);
    return text === undefined ? undefined : { kind: 'text', id, from, timestamp, text };
  }
  if (type === 'location') {
    const location = asRecord(message.location);
    const latitude = numberValue(location?.latitude);
    const longitude = numberValue(location?.longitude);
    if (latitude === undefined || longitude === undefined) return undefined;
    return {
      kind: 'location',
      id,
      from,
      timestamp,
      latitude,
      longitude,
      name: stringValue(location?.name),
      address: stringValue(location?.address),
    };
  }
  if (['image', 'audio', 'video', 'document', 'sticker'].includes(type)) {
    const media = asRecord(message[type]);
    const mediaId = stringValue(media?.id);
    if (!mediaId) return undefined;
    return {
      kind: 'media',
      id,
      from,
      timestamp,
      mediaType: type as WhatsAppMediaType,
      mediaId,
      mimeType: stringValue(media?.mime_type),
      caption: stringValue(media?.caption),
      filename: stringValue(media?.filename),
    };
  }
  return undefined;
}

function parseStatus(status: Record<string, unknown> | undefined): WhatsAppStatusCallback | undefined {
  if (!status) return undefined;
  const id = stringValue(status?.id);
  const recipient = stringValue(status?.recipient_id);
  if (!id || !recipient) return undefined;
  const rawStatus = stringValue(status?.status) ?? 'unknown';
  const knownStatuses = ['sent', 'delivered', 'read', 'failed', 'deleted'];
  const errors = Array.isArray(status?.errors) ? status.errors : [];
  const firstError = asRecord(errors[0]);
  return {
    kind: 'status',
    id,
    recipient,
    status: knownStatuses.includes(rawStatus) ? rawStatus as WhatsAppStatusCallback['status'] : 'unknown',
    timestamp: parseTimestamp(status?.timestamp),
    ...(firstError
      ? {
          error: {
            code: numberValue(firstError.code),
            title: stringValue(firstError.title),
            message: stringValue(firstError.message),
          },
        }
      : {}),
  };
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, any> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseTimestamp(value: unknown): Date {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}
