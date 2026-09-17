import { env } from '../../config/env.js';
import { logger } from '../logger.js';

export interface WhatsAppSendInput {
  to: string;
  body?: string;
  template?: {
    name: string;
    languageCode?: string;
    bodyParameters?: string[];
  };
  tenantId: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  provider: 'meta' | 'simulated' | 'unconfigured';
  messageId?: string;
  retryable: boolean;
  statusCode?: number;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface MetaErrorResponse {
  error?: {
    code?: number;
    message?: string;
    error_subcode?: number;
    type?: string;
    fbtrace_id?: string;
  };
  messages?: Array<{ id: string }>;
}

/** Sends through Meta Cloud API, with explicit non-production simulation when unconfigured. */
export async function sendWhatsAppMessage(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  const phone = normalizePhone(input.to);
  if (!phone || (!input.body && !input.template)) {
    return {
      ok: false,
      provider: 'unconfigured',
      retryable: false,
      error: {
        code: 'INVALID_MESSAGE',
        message: 'A valid recipient and either text or template content are required.',
      },
    };
  }

  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const url = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const content = input.template
        ? {
            type: 'template',
            template: {
              name: input.template.name,
              language: { code: input.template.languageCode ?? 'en' },
              ...(input.template.bodyParameters?.length
                ? {
                    components: [{
                      type: 'body',
                      parameters: input.template.bodyParameters.map((text) => ({ type: 'text', text })),
                    }],
                  }
                : {}),
            },
          }
        : { type: 'text', text: { body: input.body } };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(/\D/g, ''),
          ...content,
        }),
        signal: AbortSignal.timeout(12000),
      });

      const json = (await res.json()) as MetaErrorResponse;
      if (!res.ok) {
        logger.warn({ msg: 'WhatsApp API error', error: json.error, tenantId: input.tenantId });
        return {
          ok: false,
          provider: 'meta',
          retryable: isRetryableStatus(res.status),
          statusCode: res.status,
          error: {
            code: json.error?.code ? `META_${json.error.code}` : `HTTP_${res.status}`,
            message: json.error?.message ?? `Meta WhatsApp returned HTTP ${res.status}.`,
            details: json.error,
          },
        };
      }

      return {
        ok: true,
        provider: 'meta',
        messageId: json.messages?.[0]?.id,
        retryable: false,
        statusCode: res.status,
      };
    } catch (err) {
      logger.error({ err, msg: 'WhatsApp send failed' });
      return {
        ok: false,
        provider: 'meta',
        retryable: true,
        error: {
          code: err instanceof Error && err.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'WhatsApp send failed.',
        },
      };
    }
  }

  if (env.NODE_ENV === 'production') {
    logger.error({ msg: 'WhatsApp credentials are not configured', tenantId: input.tenantId });
    return {
      ok: false,
      provider: 'unconfigured',
      retryable: false,
      error: {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'WhatsApp provider credentials are not configured.',
      },
    };
  }

  logger.info({
    msg: 'WhatsApp simulated send',
    to: phone,
    tenantId: input.tenantId,
    preview: (input.body ?? input.template?.name ?? '').slice(0, 80),
  });
  return {
    ok: true,
    provider: 'simulated',
    messageId: `sim_${Date.now()}`,
    retryable: false,
  };
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
