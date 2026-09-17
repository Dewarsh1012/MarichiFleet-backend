import { WhatsAppSendInput } from './whatsappProvider.js';

export type WhatsAppMessageKind = 'driver_offer' | 'eta_update' | 'pod_reminder' | 'approval';

export interface WhatsAppMessageTemplateData {
  driverName?: string;
  reference: string;
  origin?: string;
  destination?: string;
  eta?: string;
  amount?: string;
  decision?: 'APPROVED' | 'REJECTED';
  reason?: string;
}

const templateEnvironmentKeys: Record<WhatsAppMessageKind, string> = {
  driver_offer: 'WHATSAPP_TEMPLATE_DRIVER_OFFER',
  eta_update: 'WHATSAPP_TEMPLATE_ETA_UPDATE',
  pod_reminder: 'WHATSAPP_TEMPLATE_POD_REMINDER',
  approval: 'WHATSAPP_TEMPLATE_APPROVAL',
};

export function buildWhatsAppMessage(
  kind: WhatsAppMessageKind,
  data: WhatsAppMessageTemplateData,
): Pick<WhatsAppSendInput, 'body' | 'template'> {
  const body = renderText(kind, data);
  const templateName = process.env[templateEnvironmentKeys[kind]]?.trim();
  if (!templateName) return { body };

  return {
    body,
    template: {
      name: templateName,
      languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
      bodyParameters: templateParameters(kind, data),
    },
  };
}

function renderText(kind: WhatsAppMessageKind, data: WhatsAppMessageTemplateData): string {
  switch (kind) {
    case 'driver_offer':
      return `Trip offer ${data.reference}: ${data.origin ?? 'pickup'} to ${data.destination ?? 'destination'}. Reply to accept.`;
    case 'eta_update':
      return `ETA update for ${data.reference}: expected arrival ${data.eta ?? 'will be shared shortly'}.`;
    case 'pod_reminder':
      return `POD reminder for ${data.reference}: please upload the signed proof of delivery.`;
    case 'approval':
      return `${data.decision === 'APPROVED' ? 'Approved' : 'Rejected'}: ${data.reference}${data.amount ? ` (${data.amount})` : ''}${data.reason ? `. ${data.reason}` : ''}.`;
  }
}

function templateParameters(kind: WhatsAppMessageKind, data: WhatsAppMessageTemplateData): string[] {
  switch (kind) {
    case 'driver_offer':
      return [data.driverName ?? 'Driver', data.reference, data.origin ?? '', data.destination ?? ''];
    case 'eta_update':
      return [data.reference, data.eta ?? ''];
    case 'pod_reminder':
      return [data.reference];
    case 'approval':
      return [data.reference, data.decision ?? 'REJECTED', data.amount ?? '', data.reason ?? ''];
  }
}
