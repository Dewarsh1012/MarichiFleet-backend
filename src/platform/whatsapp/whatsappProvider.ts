import { env } from '../../config/env.js';
import { logger } from '../logger.js';

export interface WhatsAppSendInput {
  to: string;
  body: string;
  templateName?: string;
  tenantId: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  provider: 'meta' | 'simulated';
  messageId?: string;
  error?: string;
}

/** Sends via Meta Cloud API when configured; otherwise records as simulated (dev/demo). */
export async function sendWhatsAppMessage(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  const phone = normalizePhone(input.to);

  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const url = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(/\D/g, ''),
          type: 'text',
          text: { body: input.body },
        }),
        signal: AbortSignal.timeout(12000),
      });

      const json = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
      if (!res.ok) {
        logger.warn({ msg: 'WhatsApp API error', error: json.error, tenantId: input.tenantId });
        return { ok: false, provider: 'meta', error: json.error?.message ?? `HTTP ${res.status}` };
      }

      return { ok: true, provider: 'meta', messageId: json.messages?.[0]?.id };
    } catch (err) {
      logger.error({ err, msg: 'WhatsApp send failed' });
      return { ok: false, provider: 'meta', error: err instanceof Error ? err.message : 'Send failed' };
    }
  }

  logger.info({ msg: 'WhatsApp simulated send', to: phone, tenantId: input.tenantId, preview: input.body.slice(0, 80) });
  return { ok: true, provider: 'simulated', messageId: `sim_${Date.now()}` };
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}
